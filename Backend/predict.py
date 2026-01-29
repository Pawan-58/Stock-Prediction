import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import pandas as pd
import yfinance as yf
from model import SiameseNetwork
from config import MODEL_PATH, WINDOW_SIZE

device = torch.device("cpu")

model = SiameseNetwork(WINDOW_SIZE)
if hasattr(model, 'load_state_dict'):
    try:
        model.load_state_dict(torch.load(MODEL_PATH, map_location=device))
    except:
        print("Warning: Could not load initial weights.")
model.eval()

import torch.optim as optim
import random
from sklearn.preprocessing import MinMaxScaler
# ...

class ContrastiveLoss(nn.Module):
    def __init__(self, margin=1.0):
        super(ContrastiveLoss, self).__init__()
        self.margin = margin
    def forward(self, out1, out2, label):
        dist = torch.nn.functional.pairwise_distance(out1, out2)
        return torch.mean((1-label) * torch.pow(dist, 2) + 
                          (label) * torch.pow(torch.clamp(self.margin - dist, min=0.0), 2))

def fine_tune_model(model, df, epochs=5):
    """
    Quickly fine-tunes the model on the specific stock's recent price action.
    This implements 'Online Learning' functionality.
    """
    try:
        # Prepare Data
        prices = df['Close'].pct_change().dropna().values.reshape(-1, 1)
        scaler = MinMaxScaler()
        prices_scaled = scaler.fit_transform(prices)
        
        # Create Windows
        X, y = [], []
        for i in range(len(prices_scaled) - WINDOW_SIZE):
            window = prices_scaled[i : i + WINDOW_SIZE]
            # Simple Trend Label: 1 if next price is higher than current, else 0
            label = 1 if prices[i + WINDOW_SIZE] > prices[i + WINDOW_SIZE - 1] else 0
            X.append(window.flatten())
            y.append(label)
        
        X = np.array(X)
        y = np.array(y)
        
        if len(X) < 10: return model # Not enough data
        
        # Create Pairs for Contrastive Loss
        pairs, labels = [], []
        idx_0 = np.where(y == 0)[0]
        idx_1 = np.where(y == 1)[0]
        
        if len(idx_0) == 0 or len(idx_1) == 0: return model # One class missing
        
        # Generate mini-batch of pairs
        num_pairs = min(len(X), 100) # Fast training
        for _ in range(num_pairs):
            idx_A = random.randint(0, len(X)-1)
            label_A = y[idx_A]
            # Positive or Negative pair
            target = 0 if random.random() > 0.5 else 1
            choice_pool = idx_0 if (label_A == 0 and target == 0) or (label_A == 1 and target == 1) else idx_1
            # If target=1 (Dissimilar), switch pool
            if target == 1:
                choice_pool = idx_1 if label_A == 0 else idx_0
            
            if len(choice_pool) == 0: continue
            idx_B = np.random.choice(choice_pool)
            pairs.append([X[idx_A], X[idx_B]])
            labels.append(target)
            
        if not pairs: return model

        train_in1 = torch.from_numpy(np.array(pairs)[:, 0]).float().to(device)
        train_in2 = torch.from_numpy(np.array(pairs)[:, 1]).float().to(device)
        train_labels = torch.from_numpy(np.array(labels)).float().to(device)
        
        # Train Loop
        model.train()
        criterion = ContrastiveLoss()
        optimizer = optim.Adam(model.parameters(), lr=0.001)
        
        print(f"-> Fine-tuning analysis on {len(pairs)} patterns for {epochs} epochs...")
        for _ in range(epochs):
            optimizer.zero_grad()
            o1, o2 = model(train_in1, train_in2)
            loss = criterion(o1, o2, train_labels)
            loss.backward()
            optimizer.step()
            
        model.eval()
        # Optional: Save updated weights (Online Learning Persistence)
        # torch.save(model.state_dict(), MODEL_PATH) 
        
        return model
    except Exception as e:
        print(f"Fine-tuning skipped: {e}")
        return model

# In-memory data cache for prediction speed
_PREDICT_DATA_CACHE = {}
_CACHE_EXPIRY_SEC = 300 # 5 minutes

def predict_stock(symbol):
    # 1. Check in-memory cache
    now = time.time()
    if symbol in _PREDICT_DATA_CACHE:
        df, ts = _PREDICT_DATA_CACHE[symbol]
        if now - ts < _CACHE_EXPIRY_SEC:
            print(f"Using in-memory cached data for {symbol}")
        else:
            df = None
    else:
        df = None

    if df is None:
        # Fetch 1 Month of data (Faster and sufficient for SMA20/RSI14)
        df = yf.download(symbol, period="1mo", interval="1d", progress=False) 
        if df.empty:
            # Try original granular fetch as fallback
            df = yf.download(symbol, period="5d", interval="1h", progress=False)
        
        if not df.empty:
            _PREDICT_DATA_CACHE[symbol] = (df, now)

    if df.empty or len(df) < WINDOW_SIZE + 2:
        return None
        
    # Handle MultiIndex (yfinance update)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.droplevel(1)
    
    # Extra Safety: Ensure 'Close' is a Series, not a DataFrame
    if "Close" in df.columns and isinstance(df["Close"], pd.DataFrame):
        df["Close"] = df["Close"].iloc[:, 0]
        
    # -------------------------------------------
    # AUTOMATIC BACKEND TRAINING (DISABLED FOR STABILITY ON RENDER)
    # -------------------------------------------
    # global model
    # model = fine_tune_model(model, df)
    # -------------------------------------------
            
    prices = df["Close"].pct_change().dropna().values

    if len(prices) < WINDOW_SIZE + 1: return None

    last_window = prices[-WINDOW_SIZE:]
    previous = prices[-WINDOW_SIZE - 1]

    X = torch.tensor(last_window, dtype=torch.float32).reshape(1, WINDOW_SIZE)

    print("!!!!----Size of X:", X.size())
    try:
        # Use simple technical analysis instead of just the model embedding
        # Calculate RSI
        delta = df["Close"].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss
        df['RSI'] = 100 - (100 / (1 + rs))
        
        # Calculate SMA
        df['SMA_20'] = df['Close'].rolling(window=20).mean()
        
        current_rsi = df['RSI'].iloc[-1]
        current_price = df['Close'].iloc[-1]
        sma_20 = df['SMA_20'].iloc[-1]
        
        print(f"Stats for {symbol}: RSI={current_rsi}, Price={current_price}, SMA={sma_20}")

        # Logic: TREND FOLLOWING
        # Price > SMA => Up Trend (Primary Signal)
        # RSI used for Momentum Strength, not just overbought/oversold reversal
        
        score = 0
        
        # 1. Trend Analysis (Weight: 4)
        if current_price > sma_20:
            score += 3  # Strong Bullish Bias
        else:
            score -= 3  # Strong Bearish Bias
            
        # 2. Momentum Analysis (Weight: 2)
        if 50 <= current_rsi <= 80:
            score += 1  # Healthy Bullish Momentum
        elif current_rsi > 80:
            score += 0  # Extreme Overbought (Neutralize, don't sell yet in strong trend)
        elif 20 <= current_rsi < 50:
            score -= 1  # Bearish Momentum
        elif current_rsi < 20:
            score += 1  # Oversold Bounce Potential (slight contrarian)

        # Fallback to model if TA is neutral
        with torch.no_grad():
            embedding = model.forward_one(X)
            # Normalize embedding confidence 0-1
            emb_conf = float(torch.norm(embedding).item())
        
        # Combine
        if score > 0: 
            prediction = "UP"
            # Map score (1 to 4) to 55-95%
            confidence = 0.55 + (score * 0.1)
        elif score < 0:
            prediction = "DOWN"
            confidence = 0.55 + (abs(score) * 0.1)
        else:
            # Neutral TA, trust the model trend
            prediction = "UP" if last_window[-1] > previous else "DOWN"
            confidence = 0.5 + (emb_conf * 0.1)
            
        # Boost confidence for strong trends
        if abs(score) >= 3:
            confidence += 0.1
        else:
            # Neutral TA, trust the model trend
            prediction = "UP" if last_window[-1] > previous else "DOWN"
            confidence = emb_conf
            
        # Cap confidence
        confidence = min(max(confidence, 0.51), 0.99)

    except Exception as e:
        print("!!!!----Analysis failed:", e)
        # Fallback
        prediction = "UP" if last_window[-1] > previous else "DOWN"
        confidence = 0.60

    print(f"!!!!----Prediction for {symbol}: {prediction} with confidence {confidence}")
    
    price_val = float(df["Close"].iloc[-1].item()) if hasattr(df["Close"].iloc[-1], 'item') else float(df["Close"].iloc[-1])
    
    return {
        "symbol": symbol,
        "price": price_val,
        "prediction": prediction,
        "confidence": round(confidence, 3)
    }
