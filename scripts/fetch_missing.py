"""
누락 티커만 골라서 다운로드
python scripts/fetch_missing.py
"""

import yfinance as yf
import pandas as pd
import os
import time

DATA_DIR = "data/prices"
os.makedirs(DATA_DIR, exist_ok=True)

# 앱에서 필요한 전체 티커 목록
# yfinance 심볼이 다른 경우: {앱티커: yf심볼}
TICKER_MAP = {
    # 미국 개별주식
    "TSLA": "TSLA", "AAPL": "AAPL", "NVDA": "NVDA", "MSFT": "MSFT",
    "AMZN": "AMZN", "GOOGL": "GOOGL", "META": "META", "NFLX": "NFLX",
    "AMD": "AMD", "AVGO": "AVGO", "MU": "MU", "TSM": "TSM",
    "KO": "KO", "BRK-B": "BRK-B", "ORCL": "ORCL", "INTC": "INTC",
    "MRVL": "MRVL", "PLTR": "PLTR", "SNOW": "SNOW", "COIN": "COIN",
    "RKLB": "RKLB", "IONQ": "IONQ", "WDC": "WDC", "LLY": "LLY",
    "COST": "COST", "V": "V", "QCOM": "QCOM", "UBER": "UBER",
    "SPOT": "SPOT", "SHOP": "SHOP", "ARM": "ARM", "AMAT": "AMAT",
    "LRCX": "LRCX", "ASML": "ASML", "BE": "BE", "SMCI": "SMCI",
    # ETF
    "VOO": "VOO", "SPY": "SPY", "QQQM": "QQQM", "QQQ": "QQQ",
    "VTI": "VTI", "SCHG": "SCHG", "VUG": "VUG",
    "SMH": "SMH", "SOXX": "SOXX",
    "XLK": "XLK", "VGT": "VGT", "IGV": "IGV", "HACK": "HACK",
    "WCLD": "WCLD", "BOTZ": "BOTZ",
    "TQQQ": "TQQQ", "SOXL": "SOXL", "UPRO": "UPRO",
    "SCHD": "SCHD", "JEPI": "JEPI", "JEPQ": "JEPQ",
    "SPYD": "SPYD", "DGRO": "DGRO", "QYLD": "QYLD", "RYLD": "RYLD",
    "XLC": "XLC", "XLY": "XLY", "XLP": "XLP", "XLV": "XLV",
    "XLF": "XLF", "XLI": "XLI", "XLE": "XLE", "XLB": "XLB",
    "XLU": "XLU", "XLRE": "XLRE",
    "ITA": "ITA", "XBI": "XBI", "ICLN": "ICLN", "LIT": "LIT",
    "ARKK": "ARKK", "ARKF": "ARKF", "ARKX": "ARKX",
    "QTUM": "QTUM", "VNQ": "VNQ", "ARKG": "ARKG",
    "GLD": "GLD", "SLV": "SLV", "TLT": "TLT", "SHY": "SHY",
    "USO": "USO", "BND": "BND", "AGG": "AGG", "HYG": "HYG",
    # 국가 ETF
    "INDA": "INDA", "EWJ": "EWJ", "MCHI": "MCHI", "EWT": "EWT",
    "VNM": "VNM", "EWY": "EWY", "EWH": "EWH", "EWS": "EWS",
    "EIDO": "EIDO", "THD": "THD",
    "VGK": "VGK", "EWG": "EWG", "EWU": "EWU", "EWQ": "EWQ",
    "EWI": "EWI", "EWL": "EWL",
    "EWZ": "EWZ", "EWW": "EWW", "EEM": "EEM", "ACWI": "ACWI",
    # 국내 자산
    "KS11":   "^KS11",
    "KQ11":   "^KQ11",
    "005930": "005930.KS",
    "000660": "000660.KS",
    "069500": "069500.KS",
    "360750": "360750.KS",
}


def fetch_and_save(app_ticker: str, yf_symbol: str) -> bool:
    try:
        df = yf.download(yf_symbol, period="max", auto_adjust=True, progress=False)
        if df.empty:
            print(f"  WARN {app_ticker}: 데이터 없음")
            return False

        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)

        df.index.name = "Date"
        df = df[["Open", "High", "Low", "Close", "Volume"]]
        path = os.path.join(DATA_DIR, f"{app_ticker}.csv")
        df.to_csv(path)
        print(f"  OK   {app_ticker} ({len(df)}rows) -> {path}")
        return True
    except Exception as e:
        print(f"  FAIL {app_ticker}: {e}")
        return False


def main():
    missing = [
        t for t in TICKER_MAP
        if not os.path.exists(os.path.join(DATA_DIR, f"{t}.csv"))
    ]

    if not missing:
        print("All tickers already exist.")
        return

    print(f"Downloading {len(missing)} missing tickers...\n")
    ok, fail = [], []

    for i, ticker in enumerate(missing, 1):
        print(f"[{i:2d}/{len(missing)}] {ticker}")
        if fetch_and_save(ticker, TICKER_MAP[ticker]):
            ok.append(ticker)
        else:
            fail.append(ticker)
        time.sleep(0.5)

    print(f"\nDone: {len(ok)} OK, {len(fail)} failed")
    if fail:
        print(f"Failed: {fail}")


if __name__ == "__main__":
    main()
