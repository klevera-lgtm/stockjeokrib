const DATA_BASE =
  "https://raw.githubusercontent.com/klevera-lgtm/stockjeokrib/main/data";

let metaCache = null;
const priceCache = {};
const divCache = {};
const simCache = {};

export async function loadDividendMeta() {
  if (metaCache) return metaCache;
  const res = await fetch("/dividend_meta.json");
  metaCache = await res.json();
  return metaCache;
}

async function fetchCsv(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split("\n");
  let start = 0;
  if (lines[0]?.startsWith("Price,")) {
    start = lines.findIndex((l) => /^\d{4}-\d{2}-\d{2},/.test(l));
    if (start < 0) start = 3;
    lines.splice(0, start, "date,close");
  }
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const vals = line.split(",");
    const row = {};
    headers.forEach((h, i) => (row[h] = vals[i]));
    return row;
  });
}

export async function loadRawPrices(ticker) {
  if (priceCache[ticker]) return priceCache[ticker];
  const rows = await fetchCsv(`${DATA_BASE}/prices_raw/${ticker}.csv`);
  const parsed = rows.map((r) => ({ date: r.date, close: parseFloat(r.close) }));
  priceCache[ticker] = parsed;
  return parsed;
}

export async function loadDividends(ticker) {
  if (divCache[ticker]) return divCache[ticker];
  const rows = await fetchCsv(`${DATA_BASE}/dividends/${ticker}.csv`);
  const parsed = rows.map((r) => ({ date: r.date, amount: parseFloat(r.amount) }));
  divCache[ticker] = parsed;
  return parsed;
}

export async function loadSimData(ticker) {
  if (simCache[ticker]) return simCache[ticker];
  const res = await fetch(`${DATA_BASE}/dividend_sim/${ticker}.json`);
  if (!res.ok) throw new Error(`${ticker} 시뮬레이션 데이터 없음`);
  const data = await res.json();
  simCache[ticker] = data;
  return data;
}

export function getCategoryLabel(cat) {
  const map = {
    dividend_etf: "배당 ETF",
    covered_call_etf: "커버드콜 ETF",
    yieldmax_etf: "YieldMax ETF",
    reit_bdc: "리츠/BDC",
    dividend_king: "배당킹",
    dividend_stock: "배당주",
    korean: "국내",
  };
  return map[cat] || cat;
}

export function getCategoryColor(cat) {
  const map = {
    dividend_etf: "#3182F6",
    covered_call_etf: "#8B5CF6",
    yieldmax_etf: "#EF4444",
    reit_bdc: "#F59E0B",
    dividend_king: "#16A34A",
    dividend_stock: "#06B6D4",
    korean: "#EC4899",
  };
  return map[cat] || "#6B7280";
}

export function getFrequencyLabel(freq) {
  const map = {
    monthly: "월배당",
    quarterly: "분기배당",
    "semi-annual": "반기배당",
    annual: "연배당",
  };
  return map[freq] || freq;
}

export function formatPct(v) {
  if (v == null) return "-";
  return (v * 100).toFixed(1) + "%";
}

export function formatYield(v) {
  if (v == null) return "-";
  return (v * 100).toFixed(2) + "%";
}

const KR_CODES = new Set(["KS11","KQ11","005930","000660","069500","360750","088980","458730"]);
export function formatPrice(v, ticker) {
  if (v == null) return "-";
  if (ticker && (/^\d+$/.test(ticker) || KR_CODES.has(ticker))) {
    if (ticker === "KS11" || ticker === "KQ11") return v.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
    return "₩" + Math.round(v).toLocaleString("ko-KR");
  }
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatKRW(v) {
  if (v == null) return "-";
  if (v >= 1e8) return (v / 1e8).toFixed(1) + "억원";
  if (v >= 1e4) return (v / 1e4).toFixed(0) + "만원";
  return Math.round(v).toLocaleString() + "원";
}
