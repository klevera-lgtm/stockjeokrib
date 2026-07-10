"""
초기 실행용: 전 종목 20년치 히스토리 다운로드
python scripts/fetch_historical.py
"""

import yfinance as yf
import pandas as pd
import os
import json
import time
from datetime import datetime, date
from tickers import ALL_TICKERS, TICKERS

DATA_DIR = "data/prices"
META_FILE = "data/last_updated.json"

os.makedirs(DATA_DIR, exist_ok=True)


def fetch_ticker(ticker: str, period: str = "20y") -> pd.DataFrame | None:
    try:
        df = yf.download(ticker, period=period, auto_adjust=True, progress=False)
        if df.empty:
            print(f"  ⚠️  {ticker}: 데이터 없음")
            return None
        df.index = pd.to_datetime(df.index)
        df.index.name = "date"
        # 컬럼 소문자로
        df.columns = [c.lower() if isinstance(c, str) else c[0].lower() for c in df.columns]
        return df
    except Exception as e:
        print(f"  ❌ {ticker}: {e}")
        return None


def save_ticker(ticker: str, df: pd.DataFrame):
    path = os.path.join(DATA_DIR, f"{ticker}.csv")
    df.to_csv(path)
    print(f"  ✅ {ticker}: {len(df)}행 저장 → {path}")


def update_meta(success: list, failed: list):
    meta = {
        "last_updated": date.today().isoformat(),
        "total_tickers": len(ALL_TICKERS),
        "success": len(success),
        "failed": failed,
        "categories": {cat: tickers for cat, tickers in TICKERS.items()},
    }
    with open(META_FILE, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"\n📄 메타 저장: {META_FILE}")


def main():
    print(f"🚀 전 종목 20년치 다운로드 시작 ({len(ALL_TICKERS)}개 종목)")
    print(f"{'=' * 50}")

    success, failed = [], []

    for i, ticker in enumerate(ALL_TICKERS, 1):
        print(f"[{i:3d}/{len(ALL_TICKERS)}] {ticker}")
        df = fetch_ticker(ticker, period="20y")
        if df is not None:
            save_ticker(ticker, df)
            success.append(ticker)
        else:
            failed.append(ticker)
        time.sleep(0.5)  # API 과부하 방지

    update_meta(success, failed)

    print(f"\n{'=' * 50}")
    print(f"✅ 성공: {len(success)}개")
    if failed:
        print(f"❌ 실패: {len(failed)}개 → {failed}")
    print("🎉 초기 다운로드 완료!")


if __name__ == "__main__":
    main()
