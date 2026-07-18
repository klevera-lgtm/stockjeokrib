TICKERS = {
    "미국 대형주 ETF": ["SPY", "VOO", "IVV", "VTI", "DIA"],
    "미국 대형주 레버리지": ["SSO", "SPXL"],
    "나스닥/성장 ETF": ["QQQ", "QQQM", "VGT"],
    "나스닥 레버리지": ["QLD", "TQQQ"],
    "반도체 ETF": ["SOXX", "SMH"],
    "반도체 레버리지": ["USD", "SOXL"],
    "금/은/원자재": ["GLD", "IAU", "SLV", "GDX"],
    "금/은 레버리지": ["UGL", "AGQ"],
    "채권": ["TLT", "IEF", "BND"],
    "채권 레버리지": ["UBT", "TMF"],
    "배당/인컴": ["SCHD", "VYM", "JEPI", "JEPQ", "DVY", "VIG"],
    "고배당 ETF": ["HDV", "SPHD", "DIVO", "PFF", "XYLD", "SDIV"],
    "월배당 리츠/BDC": ["O", "MAIN", "STAG", "AGNC"],
    "배당귀족 개별주": [
        "JNJ", "PG", "PEP", "MCD", "ABBV", "XOM",
        "CVX", "T", "VZ", "MO", "MMM", "IBM",
    ],
    "섹터 ETF": ["XLK", "XLF", "XLE", "XLV", "XLY", "XLI", "XLB", "XLP", "XLU", "XLRE", "XLC"],
    "테마 ETF": ["ARKK", "BOTZ", "ICLN", "HACK"],
    "단일종목 레버리지": ["NVDL", "TSLL", "TECL"],
    "현금성": ["SGOV"],
    "소형주": ["IWM", "VB"],
    "글로벌 분산": ["VT", "VXUS", "IEFA", "IEMG"],
    "M7 + 인기 성장주": [
        "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA",
        "AMD", "AVGO", "ASML", "TSM", "QCOM",
        "NFLX", "UBER", "COIN", "PLTR", "SNOW", "SHOP", "SPOT"
    ],
    "나라별 ETF": [
        "EWY", "EWJ", "FXI", "EWT", "INDA",
        "EZU", "EWG", "EWU", "EWQ",
        "EWS", "EWA", "THD", "EWM",
        "EEM", "VWO", "EWZ", "KSA", "GULF"
    ],
}

ALL_TICKERS = [t for tickers in TICKERS.values() for t in tickers]
