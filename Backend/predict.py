import torch
import numpy as np
import yfinance as yf
from model import SiameseNetwork
from config import MODEL_PATH, WINDOW_SIZE

device = torch.device("cpu")

model = SiameseNetwork(WINDOW_SIZE)
model.load_state_dict(torch.load(MODEL_PATH, map_location=device))
model.eval()

def predict_stock(symbol):
    df = yf.download(symbol, period="5d", interval="1h", progress=False)
    print(symbol)
    if df.empty or len(df) < WINDOW_SIZE + 2:
        return None

    prices = df["Close"].pct_change().dropna().values

    last_window = prices[-WINDOW_SIZE:]
    previous = prices[-WINDOW_SIZE - 1]

    X = torch.tensor(last_window, dtype=torch.float32).reshape(1, WINDOW_SIZE)

    print("!!!!----Siz of X:", X.size())
    try:
        with torch.no_grad():
            embedding = model.forward_one(X)
    except Exception as e:
        print("!!!!----Model prediction failed:", e)
        return None
    print("!!!!----Embedding:", embedding)
    # Use embedding magnitude for trend confidence
    confidence = float(torch.norm(embedding).item())


    prediction = "UP" if last_window[-1] > previous else "DOWN"

    print(f"!!!!----Prediction for {symbol}: {prediction} with confidence {confidence}")
    return {
        "symbol": symbol,
        "price": float(df["Close"].iloc[-1].item()) if hasattr(df["Close"].iloc[-1], 'item') else float(df["Close"].iloc[-1]),
        "prediction": prediction,
        "confidence": round(confidence, 3)
    }
