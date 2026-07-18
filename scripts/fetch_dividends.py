"""
배당왕 준비: 배당 이력 + 원본 종가(배당 미반영) 수집
- data/dividends/{ticker}.csv : date,amount (주당 배당금, 분할 조정됨)
- data/prices_raw/{ticker}.csv : date,close (분할만 조정, 배당 미반영)

주의: data/prices/ 의 종가는 auto_adjust=True(배당 반영)라서
배당 재투자 백테스트에는 이 원본 종가를 써야 이중 계산이 없다.
검증: 원본종가+배당 재투자 성장률이 수정종가와 0.07% 오차로 일치 (SCHD 10y)
"""

import yfinance as yf
import os
import time

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIV_DIR = os.path.join(BASE_DIR, "data/dividends")
RAW_DIR = os.path.join(BASE_DIR, "data/prices_raw")

# 배당왕 대상 유니버스 (배당 지급 자산)
DIVIDEND_TICKERS = [
    # 배당 ETF (기존)
    "SCHD", "VYM", "JEPI", "JEPQ", "DVY", "VIG", "SPYD", "DGRO", "QYLD", "RYLD",
    # 고배당 ETF (신규)
    "HDV", "SPHD", "DIVO", "PFF", "XYLD", "SDIV",
    # 월배당 리츠/BDC
    "O", "MAIN", "STAG", "AGNC",
    # 배당귀족 개별주
    "JNJ", "PG", "PEP", "MCD", "ABBV", "XOM",
    "CVX", "T", "VZ", "MO", "MMM", "IBM", "KO",
    # 한국인 수요 실측 기반 추가 (2026-07: QQQI 순매수 18위)
    "QQQI", "SPYI", "ARCC",
    # YieldMax 계열 — 초고분배·NAV 잠식 주의, 노출 시 위험 맥락 필수
    "MSTY", "NVDY", "TSLY", "YMAX",
]

# 국내 상장 배당 자산: yfinance 심볼 → 저장 파일명 (앱 관례: 접미사 없는 종목코드)
KOREAN_DIVIDEND_TICKERS = {
    "088980.KS": "088980",  # 맥쿼리인프라
    "458730.KS": "458730",  # TIGER 미국배당다우존스
}

os.makedirs(DIV_DIR, exist_ok=True)
os.makedirs(RAW_DIR, exist_ok=True)


def fetch_one(ticker: str, save_name: str | None = None) -> bool:
    save_name = save_name or ticker
    try:
        tk = yf.Ticker(ticker)
        h = tk.history(period="20y", auto_adjust=False)
        if h.empty:
            print(f"  ⚠️  {ticker}: 데이터 없음")
            return False

        # 원본 종가 (분할 조정, 배당 미반영)
        raw = h[["Close"]].dropna().reset_index()
        raw.columns = ["date", "close"]
        raw["date"] = raw["date"].dt.strftime("%Y-%m-%d")
        raw.to_csv(os.path.join(RAW_DIR, f"{save_name}.csv"), index=False)

        # 배당 이력
        div = h["Dividends"]
        div = div[div > 0].reset_index()
        div.columns = ["date", "amount"]
        div["date"] = div["date"].dt.strftime("%Y-%m-%d")
        div.to_csv(os.path.join(DIV_DIR, f"{save_name}.csv"), index=False)

        print(f"  ✅ {ticker}: 종가 {len(raw)}건, 배당 {len(div)}건")
        return True
    except Exception as e:
        print(f"  ❌ {ticker}: {e}")
        return False


def main():
    print(f"배당 데이터 수집 시작 ({len(DIVIDEND_TICKERS)}개 티커)\n")
    success = 0
    for t in DIVIDEND_TICKERS:
        if fetch_one(t):
            success += 1
        time.sleep(0.3)  # rate limit 배려
    print(f"\n완료: {success}/{len(DIVIDEND_TICKERS)}")


if __name__ == "__main__":
    main()
