from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from predict import predict_stock
import yfinance as yf
import pandas as pd
import requests
import time

import os
from datetime import datetime

# ================= FINNHUB =================
FINNHUB_KEY = os.getenv("FINNHUB_KEY", "d5ijfj9r01qo1lb2eti0d5ijfj9r01qo1lb2etig")

app = FastAPI(title="Stock AI Backend", version="1.0")

# ------------------ CORS ------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# List of major Indian stocks
TOP_INDIAN_STOCKS = [
    "RELIANCE.NS","TCS.NS","HDFCBANK.NS","ICICIBANK.NS","BHARTIARTL.NS",
    "INFY.NS","ITC.NS","SBIN.NS","LICI.NS","HINDUNILVR.NS","TATAMOTORS.NS",
    "ADANIENT.NS","SUNPHARMA.NS","TITAN.NS","BAJFINANCE.NS","ADANIPORTS.NS",
    "ASIANPAINT.NS","TATASTEEL.NS","ULTRACEMCO.NS","MARUTI.NS"
]

# ------------------ Health ------------------
@app.get("/")
def home():
    return {
        "status": "Backend running",
        "service": "AI Stock Predictor",
        "version": "1.0"
    }

# =================== FINNHUB LIVE PRICE ===================
@app.get("/live-price")
def live_price(symbol: str):
    try:
        url = f"https://finnhub.io/api/v1/quote?symbol={symbol}&token={FINNHUB_KEY}"
        data = requests.get(url).json()

        return {
            "symbol": symbol,
            "price": data["c"],
            "high": data["h"],
            "low": data["l"],
            "open": data["o"],
            "prev_close": data["pc"]
        }
    except:
        raise HTTPException(status_code=500, detail="Finnhub price error")

# =================== FINNHUB LIVE CHART ===================
@app.get("/live-chart")
def live_chart(symbol: str):
    try:
        now = int(time.time())
        past = now - 60*60*24

        url = f"https://finnhub.io/api/v1/stock/candle?symbol={symbol}&resolution=5&from={past}&to={now}&token={FINNHUB_KEY}"
        data = requests.get(url).json()

        if data.get("s") != "ok":
            raise HTTPException(status_code=404, detail="No chart data")

        return {
            "symbol": symbol,
            "prices": data["c"],
            "times": data["t"]
        }
    except:
        raise HTTPException(status_code=500, detail="Finnhub chart error")

# =================== TOP GAINERS (yfinance preserved) ===================
@app.get("/top-gainers")
def get_top_gainers():
    try:
        data = yf.download(TOP_INDIAN_STOCKS, period="2d", interval="1d", progress=False)

        if data.empty:
            raise HTTPException(status_code=404, detail="Could not fetch gainer data")

        gainers = []
        close_data = data['Close']

        for ticker in TOP_INDIAN_STOCKS:
            try:
                series = close_data[ticker].dropna()
                if len(series) < 2: 
                    continue

                prev_price = series.iloc[-2]
                curr_price = series.iloc[-1]
                change_pct = ((curr_price - prev_price) / prev_price) * 100

                gainers.append({
                    "symbol": ticker.replace(".NS", ""),
                    "price": round(curr_price, 2),
                    "change_pct": round(change_pct, 2)
                })
            except:
                continue

        return sorted(gainers, key=lambda x: x["change_pct"], reverse=True)[:5]

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =================== AI PREDICTION ===================
@app.get("/predict")
def predict(symbol: str = "AAPL"):
    try:
        # 1. Clean the input symbol
        # Remove common prefixes from TradingView/Frontend
        cleaned_symbol = symbol.upper().strip()
        
        # Handle prefixes
        if cleaned_symbol.startswith("NASDAQ:"): cleaned_symbol = cleaned_symbol.replace("NASDAQ:", "")
        elif cleaned_symbol.startswith("NYSE:"): cleaned_symbol = cleaned_symbol.replace("NYSE:", "")
        elif cleaned_symbol.startswith("AMEX:"): cleaned_symbol = cleaned_symbol.replace("AMEX:", "")
        elif cleaned_symbol.startswith("BITSTAMP:"): cleaned_symbol = cleaned_symbol.replace("BITSTAMP:", "")
        elif cleaned_symbol.startswith("NSE:"): cleaned_symbol = cleaned_symbol.replace("NSE:", "") + ".NS"
        
        # Mapping common names to tickers (Enhanced)
        common_map = {
            "MICROSOFT": "MSFT",
            "GOOG": "GOOGL",
            "GOOGLE": "GOOGL",
            "ALPHABET": "GOOGL",
            "AMAZON": "AMZN",
            "TESLA": "TSLA",
            "APPLE": "AAPL",
            "BITCOIN": "BTC-USD",
            "NVIDIA": "NVDA",
            "META": "META",
            "FACEBOOK": "META",
            "NETFLIX": "NFLX",
            # Indices
            "VIX": "^VIX",
            "SPX": "^GSPC",
            "S&P500": "^GSPC",
            "DOW": "^DJI",
            "DJIA": "^DJI",
            "NASDAQ": "^IXIC",
            # Commodities
            "GOLD": "GC=F",
            "SILVER": "SI=F",
            "CRUDE OIL": "CL=F",
            "OIL": "CL=F"
        }
        
        if cleaned_symbol in common_map:
            cleaned_symbol = common_map[cleaned_symbol]

        # Final check for .NS duplication
        if ".NS.NS" in cleaned_symbol:
            cleaned_symbol = cleaned_symbol.replace(".NS.NS", ".NS")

        print(f"!!!!Predicting for {cleaned_symbol} (Original: {symbol})")
        result = predict_stock(cleaned_symbol)

        if result is None:
            # Fallback: Try appending .NS if the user might have meant an Indian stock
            if "." not in cleaned_symbol and len(cleaned_symbol) >= 3 and not cleaned_symbol.startswith("^") and "=" not in cleaned_symbol:
                 print(f"Retrying with .NS for {cleaned_symbol}")
                 result = predict_stock(cleaned_symbol + ".NS")
            
            if result is None:
                raise HTTPException(status_code=404, detail=f"Symbol {cleaned_symbol} not found or no data")

        # Add TradingView Symbol mapping for better widget compatibility
        tv_symbol = result['symbol']
        if result['symbol'] == "GC=F": tv_symbol = "TVC:GOLD"
        elif result['symbol'] == "SI=F": tv_symbol = "TVC:SILVER"
        elif result['symbol'] == "CL=F": tv_symbol = "TVC:USOIL"
        elif result['symbol'] == "^VIX": tv_symbol = "CBOE:VIX" # More robust for news
        elif result['symbol'] == "^GSPC": tv_symbol = "FOREXCOM:SPXUSD"
        elif result['symbol'] == "^DJI": tv_symbol = "FOREXCOM:DJI"
        elif result['symbol'] == "^IXIC": tv_symbol = "NASDAQ:NDX"
        # Common Tech Stocks Prefixes
        elif result['symbol'] in ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "NFLX"]:
            tv_symbol = f"NASDAQ:{result['symbol']}"
        elif result['symbol'] == "GOOG": tv_symbol = "NASDAQ:GOOG"
        elif result['symbol'] == "TSLA": tv_symbol = "NASDAQ:TSLA"
        elif result['symbol'] == "RELIANCE.NS": tv_symbol = "NSE:RELIANCE"
        elif result['symbol'] == "^BSESN": tv_symbol = "BSE:SENSEX"
        elif result['symbol'] == "^NSEI": tv_symbol = "NSE:NIFTY"
        elif result['symbol'].endswith(".NS"):
            tv_symbol = f"NSE:{result['symbol'].replace('.NS', '')}"
        
        result['tv_symbol'] = tv_symbol
        return result
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error in predict: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# =================== NEWS ENDPOINT ===================
@app.get("/news")
def get_news(symbol: str = "AAPL"):
    try:
        # Clean symbol logic (reuse or copy-paste safe logic)
        search_symbol = symbol.upper().strip()
        if search_symbol.startswith("NASDAQ:"): search_symbol = search_symbol.replace("NASDAQ:", "")
        elif search_symbol.startswith("NSE:"): search_symbol = search_symbol.replace("NSE:", "") + ".NS"
        elif search_symbol == "GOOGLE": search_symbol = "GOOGL" # minimal map
        
        tick = yf.Ticker(search_symbol)
        raw_news = tick.news
        
        formatted_news = []
        for item in raw_news:
            # Check for new nested structure
            if 'content' in item:
                c = item['content']
                # Determine Link
                link = "#"
                if 'clickThroughUrl' in c and 'url' in c['clickThroughUrl']:
                    link = c['clickThroughUrl']['url']
                elif 'canonicalUrl' in c and 'url' in c['canonicalUrl']:
                    link = c['canonicalUrl']['url']
                
                # Determine Time (ISO to Epoch)
                pub_epoch = 0
                if 'pubDate' in c:
                    try:
                        dt = datetime.strptime(c['pubDate'], "%Y-%m-%dT%H:%M:%SZ")
                        pub_epoch = int(dt.timestamp())
                    except:
                        pass
                
                formatted_news.append({
                    "title": c.get('title', 'No Title'),
                    "link": link,
                    "providerPublishTime": pub_epoch,
                    "publisher": c.get('provider', {}).get('displayName', 'Unknown'),
                    "thumbnail": c.get('thumbnail', {}).get('url', '') # extra bonus
                })
            else:
                # Old flat structure fallback
                formatted_news.append(item)
                
        return formatted_news
    except Exception as e:
        print(f"Error fetching news: {e}")
        return []



import random
import os
from datetime import datetime, timedelta
import numpy as np
import pandas as pd
import yfinance as yf
# ==========================================
# 1. CONFIGURATION
# ==========================================
CONFIG = {
    'ticker': 'AAPL',
    'interval': '1h',
    'period': '1y',        # 1 year of hourly data
    'window_size': 20,     # Input: Last 10 hours of prices
    'embed_dim': 8,        # Output: A vector of size 8
    'batch_size': 16,
    'epochs': 15,
    'lr': 0.005,
    'model_dir': 'ModelDir',
    'data_dir': 'DataDir',
    'model_path': 'ModelDir/simple_contrastive_model.pth'
}


# Create directories
os.makedirs(CONFIG['model_dir'], exist_ok=True)
os.makedirs(CONFIG['data_dir'], exist_ok=True)

# ==========================================
# 2. DATA PREPARATION
# ==========================================
def load_or_fetch_data(
    ticker,
    period="2y",
    interval="1d",
    max_age_days=1,
    data_dir="data"
):
    """
    Loads data from cache if it exists and is recent; otherwise downloads it.
    """
    os.makedirs(data_dir, exist_ok=True)
    filename = f"{ticker}_{period}_{interval}.csv"
    filepath = os.path.join(data_dir, filename)

    # 1. Check if file exists and is fresh
    if os.path.exists(filepath):
        file_time = datetime.fromtimestamp(os.path.getmtime(filepath))
        is_fresh = (datetime.now() - file_time) < timedelta(days=max_age_days)
        
        if is_fresh:
            print(f"Loading cached data for {ticker} (Last updated: {file_time})...")
            df = pd.read_csv(filepath, index_col=0, parse_dates=True)
            
            # Basic validation to ensure cache isn't empty
            if not df.empty:
                return df
            else:
                print("Cached file was empty. Re-fetching...")

    # 2. Fetch fresh data
    print(f"Fetching fresh data for {ticker}...")
    try:
        df = yf.download(ticker, period=period, interval=interval, progress=False)
        
        # 3. Validation: Check if data is empty (bad ticker or network error)
        if df.empty:
            raise ValueError(f"No data found for {ticker}. Check ticker symbol or internet connection.")

        # 4. Clean MultiIndex columns if present (Fixes 'Close' vs ('Close', 'AAPL') issues)
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.droplevel(1)

        # Save to cache
        df.to_csv(filepath)
        return df

    except Exception as e:
        print(f"Error fetching data: {e}")
        # Return empty DF or re-raise depending on preference
        raise e
    

# =================== MARKET (yfinance preserved) ===================
@app.get("/market")
def market(symbol: str = "AAPL"):
    try:
        search_symbol = symbol.upper() if "." in symbol else f"{symbol.upper()}"
        search_symbol = search_symbol.replace(".NS", "")
        # df = yf.download(search_symbol, period="1d", interval="5m", progress=False)
        print("!!!!Fetching market data for", search_symbol)
        period='2y'
        interval='1d' 
        
        df = load_or_fetch_data(
            search_symbol, period, interval, data_dir=CONFIG['data_dir'])

        if df.empty:
            raise HTTPException(status_code=404, detail="No market data found")

        prices = df["Close"].dropna().values.flatten().tolist()

        change_pct = 0
        if len(prices) > 1:
            change_pct = ((prices[-1] - prices[0]) / prices[0]) * 100

        return {
            # "symbol": symbol.upper(),
            "symbol": search_symbol,
            "last_price": round(prices[-1], 2),
            "change": round(change_pct, 2),
            "prices": prices
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
