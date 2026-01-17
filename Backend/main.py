from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import yfinance as yf
from nsepython import *
from predict import predict_stock
import pandas as pd

app = FastAPI(
    title="StockAI Backend",
    version="2.0",
    description="Real-time Stock Market + AI Prediction API"
)

# ================== CORS ==================
# This allows your HTML file to communicate with this Python server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

# ================== HEALTH ==================
@app.get("/")
def home():
    return {
        "status": "ONLINE",
        "service": "StockAI Engine",
        "version": "2.0"
    }

# ================== UTILS ==================
def is_nse(symbol: str):
    # If it doesn't have a dot, it's a raw NSE symbol (like RELIANCE)
    return "." not in symbol   

def yahoo_symbol(symbol):
    # Converts RELIANCE to RELIANCE.NS for yfinance
    return symbol if not is_nse(symbol) else symbol.upper() + ".NS"

# ================== STOCK INFO ==================
def get_stock_info(symbol: str):
    try:
        symbol = symbol.upper()
        if is_nse(symbol):
            # Fetching from NSE India directly
            data = nse_eq(symbol)
            return {
                "symbol": symbol,
                "name": data["info"]["companyName"],
                "price": data["priceInfo"]["lastPrice"],
                "change": data["priceInfo"]["change"],
                "percent": data["priceInfo"]["pChange"]
            }
        else:
            # Fetching Global/Yahoo symbols
            stock = yf.Ticker(symbol)
            info = stock.info
            price = info.get("currentPrice") or info.get("previousClose")
            prev_close = info.get("previousClose", price)

            return {
                "symbol": symbol,
                "name": info.get("shortName", symbol),
                "price": price,
                "change": price - prev_close,
                "percent": ((price - prev_close) / prev_close) * 100
            }

    except Exception as e:
        print(f"Info Error: {e}")
        raise HTTPException(status_code=404, detail="Invalid stock symbol")

# ================== LIVE MARKET (FOR CHART & SEARCH) ==================
@app.get("/market")
def market(symbol: str):
    try:
        symbol = symbol.upper()
        info = get_stock_info(symbol)

        # Download recent history for the Chart.js graph
        df = yf.download(yahoo_symbol(symbol), period="1d", interval="5m", progress=False)

        if df.empty:
            # Fallback to 5 days if 1 day interval fails
            df = yf.download(yahoo_symbol(symbol), period="5d", interval="60m", progress=False)

        # Extract closing prices as a simple list for the frontend
        prices = df["Close"].dropna().tolist()
        # Flatten if it's a MultiIndex (sometimes yfinance does this)
        if isinstance(prices[0], (list, pd.Series)):
             prices = [float(p) for p in prices]
        
        return {
            "symbol": info["symbol"],
            "name": info["name"],
            "last_price": info["price"],
            "change": info["change"],
            "percent": round(info["percent"], 2),
            "prices": prices[-40:] # Send last 40 data points
        }

    except Exception as e:
        print(f"Market Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ================== AI PREDICTION ==================
@app.get("/predict")
def ai_prediction(symbol: str):
    try:
        symbol = symbol.upper()
        # predict_stock should return {"symbol": "...", "prediction": "UP/DOWN"}
        result = predict_stock(symbol)

        if not result:
            raise HTTPException(status_code=400, detail="Insufficient data for AI model")

        return result

    except Exception as e:
        print(f"Prediction Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ================== TOP GAINERS (MATCHED TO FRONTEND) ==================
@app.get("/top-gainers")
def get_gainers():
    try:
        data = nse_get_top_gainers()
        # We rename the keys to match your JavaScript 'stock.change_pct'
        return [
            {
                "symbol": s["symbol"],
                "price": s["lastPrice"],
                "change": s["change"],
                "change_pct": s["pChange"]
            } for s in data["data"][:10]
        ]
    except Exception as e:
        print(f"Gainers Error: {e}")
        raise HTTPException(status_code=500, detail="NSE API error")

# ================== TOP LOSERS ==================
@app.get("/top-losers")
def get_losers():
    try:
        data = nse_get_top_losers()
        return [
            {
                "symbol": s["symbol"],
                "price": s["lastPrice"],
                "change": s["change"],
                "change_pct": s["pChange"]
            } for s in data["data"][:10]
        ]
    except:
        raise HTTPException(status_code=500, detail="NSE error")

# ================== NSE INDEX ==================
@app.get("/live")
def live_index():
    try:
        data = nse_get_index_quote("NIFTY 50")
        return {
            "index": "NIFTY 50",
            "last": data["last"],
            "change": data["change"],
            "percent": data["percentChange"]
        }
    except:
        raise HTTPException(status_code=500, detail="NSE API unavailable")

if __name__ == "__main__":
    import uvicorn
    # Start the server
    uvicorn.run(app, host="127.0.0.1", port=8000)

    import os

FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY")
PORT = int(os.getenv("PORT", 8000))
