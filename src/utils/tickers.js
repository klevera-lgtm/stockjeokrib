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

// All tickers that have a CSV price file and can be used in simulation
// (fallback — runtime loads data/supportedTickers.json from GitHub raw)
export const SUPPORTED_TICKERS = new Set([
  "000660","005930","069500","360750",
  "AAOI","AAPL","ACWI","AGG","AGQ","AMAT","AMD","AMZN","ARKF","ARKG","ARKK","ARKX",
  "ARM","ASML","AVGO","BE","BND","BOTZ","BRK-B","COIN","COST","CRWV","DDOG","DGRO",
  "DIA","DVY","EEM","EIDO","EWA","EWG","EWH","EWI","EWJ","EWL","EWM","EWQ","EWS",
  "EWT","EWU","EWW","EWY","EWZ","EZU","FXI","GDX","GH","GLD","GOOGL",
  "HACK","HYG","IAU","ICLN","IEF","IEFA","IEMG","IGV","INDA","INTC","IONQ","IONX",
  "IREN","ITA","IVV","IWM","JEM","JEPI","JEPQ","JPM","KO","KORU","KQ11","KS11","KSA",
  "LIT","LLY","LRCX","MCHI","META","MRVL","MSFT","MSTR","MSTU","MU","NFLX","NTRA",
  "NVDA","NVDL","OKTA","ORCL","ORCX","PAVE","PLTR","QCOM","QLD","QQQ","QQQI","QQQM",
  "QTUM","QYLD","RKLB","RYLD","SCHD","SCHG","SGOV","SHOP","SHY","SLV","SMCI","SMH",
  "SMR","SNOW","SOXL","SOXX","SPOT","SPXL","SPY","SPYD","SPYM","SSO","TECL","THD",
  "TLT","TMF","TQQQ","TSLA","TSLL","TSM","UBER","UBT","UCTT","UGL","UPRO","USD","USO",
  "V","VB","VGK","VGT","VIG","VNM","VNQ","VOO","VT","VTI","VUG","VWO","VXUS","VYM",
  "WCLD","WDC","XBI","XLB","XLC","XLE","XLF","XLI","XLK","XLP","XLRE","XLU","XLV","XLY",
]);

export function getTickerLabel(ticker) {
  return TICKER_LABELS[ticker] || ticker;
}

export const BASE_URL =
  "https://raw.githubusercontent.com/klevera-lgtm/stockjeokrib/main/data/prices/";

export const SUPPORTED_TICKERS_URL =
  "https://raw.githubusercontent.com/klevera-lgtm/stockjeokrib/main/data/supportedTickers.json";
