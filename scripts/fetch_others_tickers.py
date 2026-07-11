"""
WhatOthersBuy(세이브로) 인기 티커를 가져와 1년 이상 데이터가 있으면 CSV 추가
compute-combos.yml에서 주간 자동 실행됨
"""

import yfinance as yf
import pandas as pd
import requests
import json
import os
import time

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data/prices")
os.makedirs(DATA_DIR, exist_ok=True)

MIN_YEARS = 1.0


def get_others_tickers():
    base = "https://raw.githubusercontent.com/kittycapital/seibro-position-tracker/main/data"
    try:
        dash = requests.get(f"{base}/dashboard_data.json", timeout=15).json()
        ticker_map = requests.get(f"{base}/ticker_map.json", timeout=15).json()
    except Exception as e:
        print(f"❌ API 실패: {e}")
        return set()

    current_1w = dash.get("current", {}).get("1W", {}).get("미국", [])
    prev_1w    = dash.get("previous", {}).get("1W", {}).get("미국", [])
    week_data  = current_1w if current_1w else prev_1w

    tickers = set()
    for item in week_data:
        t = ticker_map.get(item.get("isin", ""))
        if t and "." not in t:  # 미국 ticker만 (점 포함은 해외거래소)
            tickers.add(t)
    return tickers


def fetch_and_save(ticker):
    try:
        df = yf.download(ticker, period="max", auto_adjust=True, progress=False)
        if df.empty:
            print(f"  ⏭️  {ticker}: 데이터 없음 (yfinance)")
            return False

        df.index = pd.to_datetime(df.index)
        df.index.name = "date"
        df.columns = [c.lower() if isinstance(c, str) else c[0].lower() for c in df.columns]

        years = (df.index.max() - df.index.min()).days / 365.25
        if years < MIN_YEARS:
            print(f"  ⏭️  {ticker}: {years:.1f}년치 — {MIN_YEARS}년 미만, 스킵")
            return False

        path = os.path.join(DATA_DIR, f"{ticker}.csv")
        df.to_csv(path)
        print(f"  ✅ {ticker}: {len(df)}행, {years:.1f}년치 저장")
        return True
    except Exception as e:
        print(f"  ❌ {ticker}: {e}")
        return False


def write_supported_tickers():
    """data/prices/ 내 모든 1년 이상 CSV → data/supportedTickers.json 갱신"""
    tickers = []
    for fname in sorted(os.listdir(DATA_DIR)):
        if not fname.endswith(".csv"):
            continue
        ticker = fname.replace(".csv", "")
        try:
            df = pd.read_csv(os.path.join(DATA_DIR, fname), index_col=0, parse_dates=True)
            if df.empty:
                continue
            years = (df.index.max() - df.index.min()).days / 365.25
            if years >= MIN_YEARS:
                tickers.append(ticker)
        except Exception:
            continue

    out_path = os.path.join(BASE_DIR, "data", "supportedTickers.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(tickers, f, indent=2)
    print(f"✅ data/supportedTickers.json: {len(tickers)}개 티커")


def main():
    print("🔍 WhatOthersBuy 인기 티커 확인 중...")
    others = get_others_tickers()
    print(f"  발견: {len(others)}개 — {sorted(others)}")

    existing = {f.replace(".csv", "") for f in os.listdir(DATA_DIR) if f.endswith(".csv")}
    new_tickers = sorted(others - existing)

    if not new_tickers:
        print("✅ 추가할 신규 티커 없음")
    else:
        print(f"\n📥 신규 티커 {len(new_tickers)}개 다운로드 시도: {new_tickers}")
        added = []
        for ticker in new_tickers:
            if fetch_and_save(ticker):
                added.append(ticker)
            time.sleep(0.5)
        print(f"\n🎉 완료: {len(added)}개 추가 — {added}")

    write_supported_tickers()


if __name__ == "__main__":
    main()
