import numpy as np
import pandas as pd
import yfinance as yf
from sklearn.preprocessing import MinMaxScaler
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score
import torch
import torch.nn as nn
import torch.optim as optim
import random
import os
from datetime import datetime, timedelta

# ==========================================
# 1. CONFIGURATION (Updated with Multi-Ticker List)
# ==========================================
CONFIG = {
    'ticker_list': ['AAPL', 'GOOG', 'TSLA', 'MSFT', '^RUT', '^VIX' , 'AAL' , 'TSLA'], # International tickers
    'interval': '1h',
    'period': '1y',
    'window_size': 20, 
    'batch_size': 32,
    'epochs': 50,
    'lr': 0.001,
    'model_dir': 'ModelDir',
    'data_dir': 'DataDir',
    'model_path': 'ModelDir/multi_ticker_model.pth'
}

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
os.makedirs(CONFIG['model_dir'], exist_ok=True)
os.makedirs(CONFIG['data_dir'], exist_ok=True)

# ==========================================
# 2. DATA PREPARATION (Multi-Ticker Logic)
# ==========================================
def load_or_fetch_data(ticker, period, interval, data_dir):
    filename = f"{ticker.replace('^', '')}_{period}_{interval}.csv"
    filepath = os.path.join(data_dir, filename)

    if os.path.exists(filepath):
        file_time = datetime.fromtimestamp(os.path.getmtime(filepath))
        if (datetime.now() - file_time) < timedelta(days=1):
            df = pd.read_csv(filepath, index_col=0, parse_dates=True)
            if not df.empty: return df

    print(f"Fetching fresh data for {ticker}...")
    try:
        df = yf.download(ticker, period=period, interval=interval, progress=False)
        if df.empty: return None
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.droplevel(1)
        df.to_csv(filepath)
        return df
    except Exception as e:
        print(f"Error fetching {ticker}: {e}")
        return None

def get_combined_data(ticker_list, window_size, split_ratio=0.8):
    all_X_train, all_y_train = [], []
    all_X_test, all_y_test = [], []

    for ticker in ticker_list:
        df = load_or_fetch_data(ticker, CONFIG['period'], CONFIG['interval'], CONFIG['data_dir'])
        if df is None: continue
        
        # Use pct_change for stationarity (Crucial for multi-ticker training)
        prices = df['Close'].pct_change().values.reshape(-1, 1)
        prices = prices[~np.isnan(prices).any(axis=1)]

        split_index = int(len(prices) * split_ratio)
        train_p, test_p = prices[:split_index], prices[split_index:]

        # Scale each ticker individually to normalize its specific volatility
        scaler = MinMaxScaler()
        train_scaled = scaler.fit_transform(train_p)
        test_scaled = scaler.transform(test_p)

        def create_windows(data_scaled, data_raw):
            X, y = [], []
            for i in range(len(data_scaled) - window_size):
                window = data_scaled[i : i + window_size]
                label = 1 if data_raw[i + window_size] > data_raw[i + window_size - 1] else 0
                X.append(window.flatten())
                y.append(label)
            return np.array(X), np.array(y)

        xt, yt = create_windows(train_scaled, train_p)
        xv, yv = create_windows(test_scaled, test_p)

        all_X_train.append(xt); all_y_train.append(yt)
        all_X_test.append(xv); all_y_test.append(yv)

    return (np.vstack(all_X_train), np.concatenate(all_y_train), 
            np.vstack(all_X_test), np.concatenate(all_y_test))

# --- 3. Pairs Generation (Preserved) ---
def make_pairs(X, y, num_pairs=5000):
    pairs, labels = [], []
    idx_0, idx_1 = np.where(y == 0)[0], np.where(y == 1)[0]
    for _ in range(num_pairs):
        idx_A = random.randint(0, len(X)-1)
        label_A = y[idx_A]
        if random.random() > 0.5:
            target = 0 # Positive
            idx_B = np.random.choice(idx_0 if label_A == 0 else idx_1)
        else:
            target = 1 # Negative
            idx_B = np.random.choice(idx_1 if label_A == 0 else idx_0)
        pairs.append([X[idx_A], X[idx_B]])
        labels.append(target)
    return np.array(pairs), np.array(labels)

# --- 4. Original Architecture (Preserved) ---
class SiameseNetwork(nn.Module):
    def __init__(self, input_dim):
        super(SiameseNetwork, self).__init__()
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, 1024),
            nn.Tanh(),
            nn.Linear(1024, 32),
            nn.Tanh()
        )
    def forward_one(self, x): return self.encoder(x)
    def forward(self, x1, x2): return self.forward_one(x1), self.forward_one(x2)

class ContrastiveLoss(nn.Module):
    def __init__(self, margin=1.0):
        super(ContrastiveLoss, self).__init__()
        self.margin = margin
    def forward(self, out1, out2, label):
        dist = torch.nn.functional.pairwise_distance(out1, out2)
        return torch.mean((1-label) * torch.pow(dist, 2) + 
                          (label) * torch.pow(torch.clamp(self.margin - dist, min=0.0), 2))

# --- 5. Main Training Execution ---
def train():
    print(f"Building Global Market Dataset from: {CONFIG['ticker_list']}")
    X_train, y_train, X_test, y_test = get_combined_data(CONFIG['ticker_list'], CONFIG['window_size'])
    
    pairs_train, labels_train = make_pairs(X_train, y_train, num_pairs=10000)
    train_in1 = torch.from_numpy(pairs_train[:, 0]).float()
    train_in2 = torch.from_numpy(pairs_train[:, 1]).float()
    train_labels = torch.from_numpy(labels_train).float()

    model = SiameseNetwork(input_dim=CONFIG['window_size']).to(device)
    if os.path.exists(CONFIG['model_path']):
        print("Continuing training from saved weights...")
        model.load_state_dict(torch.load(CONFIG['model_path'], map_location=device))

    criterion = ContrastiveLoss()
    optimizer = optim.Adam(model.parameters(), lr=CONFIG['lr'])

    print("\n--- Phase 1: Training Contrastive Embeddings ---")
    model.train()
    for epoch in range(CONFIG['epochs']):
        epoch_loss = 0
        for i in range(0, len(train_in1), CONFIG['batch_size']):
            b1, b2, bl = train_in1[i:i+32].to(device), train_in2[i:i+32].to(device), train_labels[i:i+32].to(device)
            optimizer.zero_grad()
            o1, o2 = model(b1, b2)
            loss = criterion(o1, o2, bl)
            loss.backward()
            optimizer.step()
            epoch_loss += loss.item()
        if epoch % 10 == 0: print(f"Epoch {epoch}: Loss {epoch_loss/(len(train_in1)/32):.4f}")

    print("\n--- Phase 2: Final Classifier ---")
    with torch.no_grad():
        train_emb = model.forward_one(torch.from_numpy(X_train).float()).cpu().numpy()
        test_emb = model.forward_one(torch.from_numpy(X_test).float()).cpu().numpy()

    classifier = LogisticRegression(max_iter=1000)
    classifier.fit(train_emb, y_train)
    acc = accuracy_score(y_test, classifier.predict(test_emb))
    
    print(f"Final Global Accuracy: {acc:.2%}")
    torch.save(model.state_dict(), CONFIG['model_path'])

if __name__ == "__main__":
    train()