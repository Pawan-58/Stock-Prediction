import requests
import pandas as pd
import os
import urllib3

urllib3.disable_warnings()  # hide SSL warnings

symbols = ["NABIL","NICA","NRIC","HBL","SCB","NMB","ADBL","UPPER"]

os.makedirs("NEPSE_DATA", exist_ok=True)

for s in symbols:
    try:
        print("Downloading", s)
        url = f"https://www.nepalstock.com/api/nots/nepse-data/market-history?symbol={s}"
        r = requests.get(url, verify=False)
        data = r.json()["data"]

        if not data:
            print("No data for", s)
            continue

        df = pd.DataFrame(data)
        df = df.rename(columns={
            "businessDate":"Date",
            "openPrice":"Open",
            "highPrice":"High",
            "lowPrice":"Low",
            "closePrice":"Close",
            "volume":"Volume"
        })

        df.to_csv(f"NEPSE_DATA/{s}.csv", index=False)
        print("Saved", s)

    except Exception as e:
        print("Failed", s, e)
