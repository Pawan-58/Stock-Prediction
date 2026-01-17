import pandas as pd
import yfinance as yf
import os

# Load NSE list
nse = pd.read_csv("nse_list.csv")
symbols = nse["SYMBOL"].tolist()

os.makedirs("NSE_DATA", exist_ok=True)

for s in symbols:
    try:
        ticker = s + ".NS"
        print("Downloading", ticker)

        df = yf.download(ticker, start="2015-01-01", progress=False)

        if not df.empty:
            df.to_csv(f"NSE_DATA/{ticker}.csv")
            print("Saved", ticker)
        else:
            print("No data for", ticker)

    except:
        print("Failed:", s)
