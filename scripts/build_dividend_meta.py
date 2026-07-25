"""
배당 메타데이터 생성: data/dividends/ + data/prices_raw/ → data/dividend_meta.json
앱에서 배당 랭킹, 캘린더, 시뮬레이션에 사용하는 종목별 요약 정보
"""

import csv
import json
import os
from datetime import datetime, timedelta
from collections import defaultdict

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIV_DIR = os.path.join(BASE_DIR, "data/dividends")
RAW_DIR = os.path.join(BASE_DIR, "data/prices_raw")
OUT_PATH = os.path.join(BASE_DIR, "data/dividend_meta.json")

TICKER_NAMES = {
    "SCHD": "슈왑 배당 ETF",
    "VYM": "뱅가드 고배당 ETF",
    "JEPI": "JP모건 인컴 ETF",
    "JEPQ": "JP모건 나스닥 인컴 ETF",
    "DVY": "iShares 배당주 ETF",
    "VIG": "뱅가드 배당성장 ETF",
    "SPYD": "S&P500 고배당 ETF",
    "DGRO": "iShares 배당성장 ETF",
    "QYLD": "나스닥 커버드콜 ETF",
    "RYLD": "러셀2000 커버드콜 ETF",
    "HDV": "iShares 고배당 ETF",
    "SPHD": "고배당 저변동 ETF",
    "DIVO": "배당 커버드콜 ETF",
    "PFF": "우선주 ETF",
    "XYLD": "S&P500 커버드콜 ETF",
    "SDIV": "글로벌 고배당 ETF",
    "QQQI": "나스닥100 인컴 ETF",
    "SPYI": "S&P500 인컴 ETF",
    "ARCC": "에어스 캐피탈",
    "MSTY": "마이크로스트래티지 옵션 ETF",
    "NVDY": "엔비디아 옵션 ETF",
    "TSLY": "테슬라 옵션 ETF",
    "YMAX": "YieldMax 유니버스 ETF",
    "O": "리얼티인컴",
    "MAIN": "메인스트리트 캐피털",
    "STAG": "스태그 인더스트리얼",
    "AGNC": "AGNC 인베스트먼트",
    "JNJ": "존슨앤드존슨",
    "PG": "P&G",
    "PEP": "펩시코",
    "MCD": "맥도날드",
    "ABBV": "애브비",
    "XOM": "엑슨모빌",
    "CVX": "셰브론",
    "T": "AT&T",
    "VZ": "버라이즌",
    "MO": "알트리아",
    "MMM": "3M",
    "IBM": "IBM",
    "KO": "코카콜라",
    "088980": "맥쿼리인프라",
    "458730": "TIGER 미국배당다우존스",
}

CATEGORIES = {
    "dividend_etf": ["SCHD", "VYM", "DVY", "VIG", "SPYD", "DGRO", "HDV", "SPHD", "SDIV"],
    "covered_call_etf": ["JEPI", "JEPQ", "QYLD", "RYLD", "DIVO", "PFF", "XYLD", "QQQI", "SPYI"],
    "yieldmax_etf": ["MSTY", "NVDY", "TSLY", "YMAX"],
    "reit_bdc": ["O", "MAIN", "STAG", "AGNC", "ARCC"],
    "dividend_king": ["KO", "JNJ", "PG", "PEP", "MCD", "MMM"],
    "dividend_stock": ["ABBV", "XOM", "CVX", "T", "VZ", "MO", "IBM"],
    "korean": ["088980", "458730"],
}

TICKER_TO_CAT = {}
for cat, tickers in CATEGORIES.items():
    for t in tickers:
        TICKER_TO_CAT[t] = cat

YIELDMAX_TICKERS = set(CATEGORIES["yieldmax_etf"])


def read_csv(path):
    rows = []
    with open(path, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


def get_latest_price(ticker):
    path = os.path.join(RAW_DIR, f"{ticker}.csv")
    if not os.path.exists(path):
        return None
    rows = read_csv(path)
    if not rows:
        return None
    return float(rows[-1]["close"])


def analyze_ticker(ticker):
    div_path = os.path.join(DIV_DIR, f"{ticker}.csv")
    if not os.path.exists(div_path):
        return None

    divs = read_csv(div_path)
    if not divs:
        return None

    for d in divs:
        d["date"] = datetime.strptime(d["date"], "%Y-%m-%d")
        d["amount"] = float(d["amount"])

    latest_price = get_latest_price(ticker)
    if not latest_price:
        return None

    now = datetime.now()
    one_year_ago = now - timedelta(days=365)

    # TTM 배당금 (최근 12개월)
    ttm_divs = [d for d in divs if d["date"] >= one_year_ago]
    ttm_dividend = sum(d["amount"] for d in ttm_divs)
    current_yield = ttm_dividend / latest_price if latest_price > 0 else 0

    # 배당 지급 월 패턴
    recent_divs = [d for d in divs if d["date"] >= now - timedelta(days=730)]
    payment_months = sorted(set(d["date"].month for d in recent_divs))

    # 지급 빈도 판단
    payments_per_year = len(ttm_divs)
    if payments_per_year >= 11:
        frequency = "monthly"
    elif payments_per_year >= 3:
        frequency = "quarterly"
    elif payments_per_year >= 1:
        frequency = "semi-annual"
    else:
        frequency = "annual"

    # 5년 배당 성장률 (CAGR)
    five_years_ago = now - timedelta(days=5 * 365)
    four_years_ago = now - timedelta(days=4 * 365)

    old_year_divs = [d for d in divs if five_years_ago <= d["date"] < four_years_ago]
    old_annual = sum(d["amount"] for d in old_year_divs)

    new_annual = ttm_dividend

    if old_annual > 0 and new_annual > 0:
        div_growth_5y = (new_annual / old_annual) ** (1 / 5) - 1
    else:
        div_growth_5y = None

    # 3년 배당 성장률
    three_years_ago = now - timedelta(days=3 * 365)
    two_years_ago = now - timedelta(days=2 * 365)
    old3_year_divs = [d for d in divs if three_years_ago <= d["date"] < two_years_ago]
    old3_annual = sum(d["amount"] for d in old3_year_divs)

    if old3_annual > 0 and new_annual > 0:
        div_growth_3y = (new_annual / old3_annual) ** (1 / 3) - 1
    else:
        div_growth_3y = None

    # 연속 배당 연수
    years_with_div = set()
    for d in divs:
        years_with_div.add(d["date"].year)

    current_year = now.year
    consecutive = 0
    for y in range(current_year, current_year - 50, -1):
        if y in years_with_div:
            consecutive += 1
        else:
            break

    # 최근 배당일
    last_div_date = divs[-1]["date"].strftime("%Y-%m-%d") if divs else None
    last_div_amount = divs[-1]["amount"] if divs else None

    # 연간 배당금 (예상)
    annual_dividend = ttm_dividend

    category = TICKER_TO_CAT.get(ticker, "other")

    result = {
        "ticker": ticker,
        "name": TICKER_NAMES.get(ticker, ticker),
        "category": category,
        "frequency": frequency,
        "paymentMonths": payment_months,
        "currentYield": round(current_yield, 4),
        "ttmDividend": round(ttm_dividend, 4),
        "annualDividend": round(annual_dividend, 4),
        "latestPrice": round(latest_price, 2),
        "consecutiveYears": consecutive,
        "lastDivDate": last_div_date,
        "lastDivAmount": round(last_div_amount, 4) if last_div_amount else None,
        "divCount": len(divs),
    }

    if div_growth_5y is not None:
        result["divGrowth5y"] = round(div_growth_5y, 4)
    if div_growth_3y is not None:
        result["divGrowth3y"] = round(div_growth_3y, 4)

    if ticker in YIELDMAX_TICKERS:
        result["warning"] = "yieldmax"

    return result


def main():
    tickers = [f.replace(".csv", "") for f in os.listdir(DIV_DIR) if f.endswith(".csv")]
    tickers.sort()

    meta = {}
    for t in tickers:
        info = analyze_ticker(t)
        if info:
            meta[t] = info
            print(f"  ✅ {t}: yield={info['currentYield']:.2%}, freq={info['frequency']}, months={info['paymentMonths']}")
        else:
            print(f"  ⚠️ {t}: 데이터 부족")

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print(f"\n완료: {len(meta)}개 종목 → {OUT_PATH}")


if __name__ == "__main__":
    main()
