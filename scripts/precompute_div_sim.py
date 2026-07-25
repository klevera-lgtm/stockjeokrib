"""
배당 시뮬레이션 사전계산 — 매일 매수 방식 (기간별)
base_daily_usd = 1달러/거래일 기준, 앱에서 금액 비례 곱셈.

출력: data/dividend_sim/{TICKER}.json
{
  "ticker": "SCHD",
  "baseDailyUSD": 1,
  "periods": {
    "3": { "drip": {...}, "noDrip": {...} },
    "5": { "drip": {...}, "noDrip": {...} },
    "10": { "drip": {...}, "noDrip": {...} },
    "15": { "drip": {...}, "noDrip": {...} }
  }
}
"""

import csv
import json
import os
import math
from datetime import datetime, timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(BASE_DIR, "data", "prices_raw")
DIV_DIR = os.path.join(BASE_DIR, "data", "dividends")
OUT_DIR = os.path.join(BASE_DIR, "data", "dividend_sim")

TX_FEE = 0.0035
BASE_DAILY_USD = 1.0
PERIODS = [3, 5, 10, 15]

DIVIDEND_TICKERS = [
    "SCHD", "VYM", "JEPI", "JEPQ", "DVY", "VIG", "SPYD", "DGRO", "QYLD", "RYLD",
    "HDV", "SPHD", "DIVO", "PFF", "XYLD", "SDIV",
    "O", "MAIN", "STAG", "AGNC",
    "JNJ", "PG", "PEP", "MCD", "ABBV", "XOM",
    "CVX", "T", "VZ", "MO", "MMM", "IBM", "KO",
    "QQQI", "SPYI", "ARCC",
    "MSTY", "NVDY", "TSLY", "YMAX",
    "DGRW", "GPIQ",
]

os.makedirs(OUT_DIR, exist_ok=True)


def load_csv(path):
    rows = []
    with open(path, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


def simulate(prices, div_map, drip):
    total_shares = 0.0
    total_invested_usd = 0.0
    total_dividends = 0.0
    cash_dividends = 0.0

    portfolio_values = []
    dividend_events = []

    for p in prices:
        date_str = p["date"]
        close = float(p["close"])
        if close <= 0:
            continue

        net = BASE_DAILY_USD * (1 - TX_FEE)
        bought = net / close
        total_shares += bought
        total_invested_usd += BASE_DAILY_USD

        div_amt = div_map.get(date_str, 0)
        if div_amt > 0 and total_shares > 0:
            div_total = div_amt * total_shares
            total_dividends += div_total

            if drip and close > 0:
                reinvest_net = div_total * (1 - TX_FEE)
                total_shares += reinvest_net / close
            else:
                cash_dividends += div_total

            dividend_events.append({
                "date": date_str,
                "perShare": round(div_amt, 6),
                "totalUSD": round(div_total, 4),
            })

        stock_value = total_shares * close
        cash_value = cash_dividends
        total_value = stock_value + cash_value

        portfolio_values.append({
            "date": date_str,
            "value": total_value,
            "invested": total_invested_usd,
            "shares": total_shares,
        })

    return portfolio_values, dividend_events


def summarize(portfolio_values, dividend_events, sample_count=60):
    if not portfolio_values:
        return None

    last = portfolio_values[-1]
    final_value = last["value"]
    total_inv = last["invested"]
    total_return = (final_value / total_inv - 1) if total_inv > 0 else 0

    first_date = datetime.strptime(portfolio_values[0]["date"], "%Y-%m-%d")
    last_date = datetime.strptime(portfolio_values[-1]["date"], "%Y-%m-%d")
    years = (last_date - first_date).days / 365.25
    cagr = (math.pow(final_value / total_inv, 1 / years) - 1) if years > 0 and total_inv > 0 else 0

    total_dividends = sum(d["totalUSD"] for d in dividend_events)

    n = len(portfolio_values)
    sc = min(sample_count, n)
    step = max(1, n // sc)
    sampled = []
    for i in range(0, n, step):
        pv = portfolio_values[i]
        sampled.append([
            pv["date"],
            round(pv["value"], 4),
            round(pv["invested"], 4),
            round(pv["shares"], 4),
        ])
    if sampled[-1][0] != portfolio_values[-1]["date"]:
        pv = portfolio_values[-1]
        sampled.append([
            pv["date"],
            round(pv["value"], 4),
            round(pv["invested"], 4),
            round(pv["shares"], 4),
        ])

    return {
        "portfolioValues": sampled,
        "totalReturn": round(total_return, 6),
        "cagr": round(cagr, 6),
        "finalShares": round(last["shares"], 4),
        "totalDividendsUSD": round(total_dividends, 4),
        "dividendEvents": dividend_events,
        "firstDate": portfolio_values[0]["date"],
        "lastDate": portfolio_values[-1]["date"],
        "tradingDays": n,
    }


def process_ticker(ticker):
    raw_path = os.path.join(RAW_DIR, f"{ticker}.csv")
    div_path = os.path.join(DIV_DIR, f"{ticker}.csv")

    if not os.path.exists(raw_path):
        print(f"  SKIP {ticker}: no price data")
        return False
    if not os.path.exists(div_path):
        print(f"  SKIP {ticker}: no dividend data")
        return False

    prices = load_csv(raw_path)
    divs = load_csv(div_path)
    div_map = {d["date"]: float(d["amount"]) for d in divs}

    today = datetime.now()
    periods_data = {}

    for period_years in PERIODS:
        cutoff = (today - timedelta(days=period_years * 365.25)).strftime("%Y-%m-%d")
        period_prices = [p for p in prices if p["date"] >= cutoff]

        if len(period_prices) < 60:
            periods_data[str(period_years)] = None
            continue

        period_div_map = {k: v for k, v in div_map.items() if k >= cutoff}

        drip_pv, drip_divs = simulate(period_prices, period_div_map, drip=True)
        nodrip_pv, nodrip_divs = simulate(period_prices, period_div_map, drip=False)

        drip_result = summarize(drip_pv, drip_divs)
        nodrip_result = summarize(nodrip_pv, nodrip_divs)

        if not drip_result or not nodrip_result:
            periods_data[str(period_years)] = None
            continue

        periods_data[str(period_years)] = {
            "drip": drip_result,
            "noDrip": nodrip_result,
        }

    if all(v is None for v in periods_data.values()):
        print(f"  SKIP {ticker}: insufficient data for all periods")
        return False

    output = {
        "ticker": ticker,
        "baseDailyUSD": BASE_DAILY_USD,
        "periods": periods_data,
    }

    out_path = os.path.join(OUT_DIR, f"{ticker}.json")
    with open(out_path, "w") as f:
        json.dump(output, f, separators=(",", ":"))

    size_kb = os.path.getsize(out_path) / 1024
    avail = [k for k, v in periods_data.items() if v is not None]
    print(f"  OK   {ticker}: periods={','.join(avail)}, {size_kb:.1f}KB")
    return True


def main():
    print(f"배당 시뮬레이션 사전계산 ({len(DIVIDEND_TICKERS)}개 티커, 기간별)\n")
    ok, fail = 0, 0
    for t in DIVIDEND_TICKERS:
        if process_ticker(t):
            ok += 1
        else:
            fail += 1
    print(f"\n완료: {ok} OK, {fail} skipped")


if __name__ == "__main__":
    main()
