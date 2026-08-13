"""
시장 내부지표(52주 신저가·breadth)용 구성종목 시세 일별 갱신.
S&P500 + 나스닥100 + 다우30 (data/constituents.json) 종가를 배치로 받아
data/constituents/*.csv 에 tail append. 순차 대신 batch yf.download 로 빠르게.
GitHub Actions daily_update.yml 에서 호출.
"""

import yfinance as yf
import pandas as pd
import os
import sys
import json
import time
from datetime import date, timedelta

# Windows 콘솔(cp949)에서도 이모지 로그가 깨지지 않게 UTF-8 강제
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONST_JSON = os.path.join(BASE_DIR, "data/constituents.json")
DATA_DIR = os.path.join(BASE_DIR, "data/constituents")
CHUNK = 60           # 배치당 티커 수 (URL 길이/부분실패 완화)
LOOKBACK_DAYS = 10   # 최근 tail만 (연휴/실패 대비 여유)

os.makedirs(DATA_DIR, exist_ok=True)


def yf_symbol(t: str) -> str:
    # 클래스주: BRK.B → BRK-B 등 (yfinance는 대시 사용)
    return t.replace(".", "-")


def get_last_date(ticker: str):
    path = os.path.join(DATA_DIR, f"{ticker}.csv")
    if not os.path.exists(path):
        return None
    try:
        df = pd.read_csv(path, index_col="date", parse_dates=True)
        return df.index.max().date()
    except Exception:
        return None


def append_close(ticker: str, close_series: pd.Series):
    path = os.path.join(DATA_DIR, f"{ticker}.csv")
    new_df = pd.DataFrame({"close": close_series.astype(float)})
    new_df.index.name = "date"
    if os.path.exists(path):
        existing = pd.read_csv(path, index_col="date", parse_dates=True)
        combined = pd.concat([existing[["close"]], new_df])
        combined = combined[~combined.index.duplicated(keep="last")]
        combined.sort_index(inplace=True)
        combined.to_csv(path)
    else:
        new_df.sort_index(inplace=True)
        new_df.to_csv(path)


def main():
    today = date.today()
    with open(CONST_JSON, encoding="utf-8") as f:
        tickers = json.load(f)["all"]
    print(f"🔄 구성종목 시세 갱신: {len(tickers)}종목 · {today}")

    updated, skipped, failed = 0, 0, []
    fetch_start = (today - timedelta(days=LOOKBACK_DAYS)).isoformat()
    fetch_end = (today + timedelta(days=1)).isoformat()

    for i in range(0, len(tickers), CHUNK):
        chunk = tickers[i:i + CHUNK]
        symmap = {yf_symbol(t): t for t in chunk}
        try:
            df = yf.download(
                list(symmap.keys()), start=fetch_start, end=fetch_end,
                auto_adjust=True, progress=False, group_by="ticker", threads=True,
            )
        except Exception as e:
            print(f"  ❌ 배치 {i//CHUNK} 실패: {e}")
            failed.extend(chunk)
            continue

        for sym, tkr in symmap.items():
            try:
                # 단일/다중 티커에 따라 컬럼 구조 다름
                if isinstance(df.columns, pd.MultiIndex):
                    if sym not in df.columns.get_level_values(0):
                        skipped += 1
                        continue
                    close = df[sym]["Close"].dropna()
                else:
                    close = df["Close"].dropna()
                if close.empty:
                    skipped += 1
                    continue
                last = get_last_date(tkr)
                if last is not None:
                    close = close[close.index.date > last]
                if close.empty:
                    skipped += 1
                    continue
                append_close(tkr, close)
                updated += 1
            except Exception as e:
                print(f"  ❌ {tkr}: {e}")
                failed.append(tkr)
        time.sleep(1)  # 배치 간 예의

    print(f"✅ 갱신 {updated} · ⏭️ 스킵 {skipped} · ❌ 실패 {len(failed)}")
    if failed:
        print(f"   실패: {failed[:20]}{' ...' if len(failed) > 20 else ''}")


if __name__ == "__main__":
    main()
