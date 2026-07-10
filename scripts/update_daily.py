"""
매일 7시 자동 실행: 전날 종가 업데이트
GitHub Actions에서 호출됨
"""

import yfinance as yf
import pandas as pd
import os
import json
import time
from datetime import datetime, date, timedelta
from tickers import ALL_TICKERS, TICKERS

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data/prices")
META_FILE = os.path.join(BASE_DIR, "data/last_updated.json")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(os.path.dirname(META_FILE), exist_ok=True)


def get_last_date(ticker: str) -> date | None:
    path = os.path.join(DATA_DIR, f"{ticker}.csv")
    if not os.path.exists(path):
        return None
    try:
        df = pd.read_csv(path, index_col="date", parse_dates=True)
        return df.index.max().date()
    except Exception:
        return None


def fetch_new_data(ticker: str, start: date) -> pd.DataFrame | None:
    try:
        # start 다음날부터 오늘까지
        fetch_start = (start + timedelta(days=1)).isoformat()
        fetch_end = (date.today() + timedelta(days=1)).isoformat()
        df = yf.download(ticker, start=fetch_start, end=fetch_end,
                         auto_adjust=True, progress=False)
        if df.empty:
            return None
        df.index = pd.to_datetime(df.index)
        df.index.name = "date"
        df.columns = [c.lower() if isinstance(c, str) else c[0].lower() for c in df.columns]
        return df
    except Exception as e:
        print(f"  ❌ {ticker}: {e}")
        return None


def append_to_csv(ticker: str, new_df: pd.DataFrame):
    path = os.path.join(DATA_DIR, f"{ticker}.csv")
    if os.path.exists(path):
        existing = pd.read_csv(path, index_col="date", parse_dates=True)
        combined = pd.concat([existing, new_df])
        combined = combined[~combined.index.duplicated(keep="last")]
        combined.sort_index(inplace=True)
        combined.to_csv(path)
    else:
        new_df.to_csv(path)


def main():
    today = date.today()
    print(f"🔄 일별 업데이트 시작: {today}")
    print(f"{'=' * 50}")

    updated, skipped, failed = [], [], []

    for ticker in ALL_TICKERS:
        last_date = get_last_date(ticker)

        if last_date is None:
            # CSV 없으면 20년치 새로 받기
            print(f"  📥 {ticker}: CSV 없음, 20년치 신규 다운로드")
            df = fetch_new_data.__wrapped__(ticker) if hasattr(fetch_new_data, '__wrapped__') else None
            # fallback: fetch full history
            try:
                df = yf.download(ticker, period="20y", auto_adjust=True, progress=False)
                if not df.empty:
                    df.index.name = "date"
                    df.columns = [c.lower() if isinstance(c, str) else c[0].lower() for c in df.columns]
                    append_to_csv(ticker, df)
                    updated.append(ticker)
                    print(f"  ✅ {ticker}: {len(df)}행 저장")
                else:
                    failed.append(ticker)
            except Exception as e:
                print(f"  ❌ {ticker}: {e}")
                failed.append(ticker)
        elif last_date >= today - timedelta(days=1):
            skipped.append(ticker)
            print(f"  ⏭️  {ticker}: 이미 최신 ({last_date})")
        else:
            new_df = fetch_new_data(ticker, last_date)
            if new_df is not None and not new_df.empty:
                append_to_csv(ticker, new_df)
                updated.append(ticker)
                print(f"  ✅ {ticker}: +{len(new_df)}행 추가 ({last_date} → {today})")
            else:
                skipped.append(ticker)
                print(f"  ⏭️  {ticker}: 새 데이터 없음")

        time.sleep(0.3)

    # 메타 업데이트
    meta = {
        "last_updated": today.isoformat(),
        "updated_at": datetime.now().isoformat(),
        "total_tickers": len(ALL_TICKERS),
        "updated": len(updated),
        "skipped": len(skipped),
        "failed": failed,
        "categories": {cat: tickers for cat, tickers in TICKERS.items()},
    }
    with open(META_FILE, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print(f"\n{'=' * 50}")
    print(f"✅ 업데이트: {len(updated)}개")
    print(f"⏭️  스킵: {len(skipped)}개")
    if failed:
        print(f"❌ 실패: {len(failed)}개 → {failed}")
    print(f"🎉 완료: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")


if __name__ == "__main__":
    main()
