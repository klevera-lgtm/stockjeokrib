export const TICKER_CATEGORIES = {
  "미국 개별주식": [
    "TSLA","AAPL","NVDA","MSFT","AMZN","GOOGL","META","NFLX","AMD","AVGO",
    "MU","TSM","KO","BRK-B","ORCL","INTC","MRVL","PLTR","SNOW","COIN",
    "RKLB","IONQ","WDC","LLY","COST","V","QCOM","UBER","SPOT","SHOP",
    "ARM","AMAT","LRCX","ASML","BE","SMCI",
  ],
  "미국 성장형 ETF": ["VOO","SPY","QQQM","QQQ","VTI","SCHG","VUG"],
  "반도체 ETF": ["SMH","SOXX"],
  "테크 섹터 ETF": ["XLK","VGT","IGV","HACK","WCLD","BOTZ"],
  "레버리지 ETF": ["TQQQ","SOXL","UPRO"],
  "배당·인컴 ETF": ["SCHD","JEPI","JEPQ","SPYD","DGRO","QYLD","RYLD"],
  "GICS 11섹터 ETF": ["XLK","XLC","XLY","XLP","XLV","XLF","XLI","XLE","XLB","XLU","XLRE"],
  "테마 섹터 ETF": ["ITA","XBI","ICLN","LIT","ARKK","ARKF","ARKX","QTUM","VNQ","ARKG"],
  "안전자산": ["GLD","SLV","TLT","SHY","USO","BND","AGG","HYG"],
  "아시아 국가 ETF": ["INDA","EWJ","MCHI","EWT","VNM","EWY","EWH","EWS","EIDO","THD"],
  "유럽 국가 ETF": ["VGK","EWG","EWU","EWQ","EWI","EWL"],
  "기타 국가 ETF": ["EWZ","EWW","EEM","ACWI"],
  "국내 자산": ["KS11","KQ11","005930","000660","069500","360750"],
};

export const TICKER_LABELS = {
  "KS11": "코스피",
  "KQ11": "코스닥",
  "005930": "삼성전자",
  "000660": "SK하이닉스",
  "069500": "KODEX200",
  "360750": "TIGER미국S&P500",
  "BRK-B": "버크셔B",
};

export const ALL_TICKERS = Object.values(TICKER_CATEGORIES).flat();

export function getTickerLabel(ticker) {
  return TICKER_LABELS[ticker] || ticker;
}

export const BASE_URL =
  "https://raw.githubusercontent.com/klevera-lgtm/stockjeokrib/main/data/prices/";
