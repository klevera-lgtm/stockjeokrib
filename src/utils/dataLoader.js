import { BASE_URL } from "./tickers.js";

// ── In-memory cache (session-scoped) ────────────────────────────────────────
const memCache = new Map();

// ── IndexedDB persistent cache (7-day TTL) ──────────────────────────────────
const IDB_NAME = "sjk-prices-v1";
const IDB_STORE = "prices";
const IDB_TTL = 7 * 24 * 60 * 60 * 1000;

let _db = null;
function getDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(ticker) {
  try {
    const db = await getDB();
    const entry = await new Promise((res) => {
      const req = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(ticker);
      req.onsuccess = () => res(req.result ?? null);
      req.onerror = () => res(null);
    });
    if (!entry || Date.now() - entry.ts > IDB_TTL) return null;
    return entry.dates.map((d, i) => ({ date: new Date(d), close: entry.closes[i] }));
  } catch {
    return null;
  }
}

function idbSet(ticker, prices) {
  getDB().then((db) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put({
      ts: Date.now(),
      dates: prices.map((p) => p.date.toISOString().slice(0, 10)),
      closes: prices.map((p) => p.close),
    }, ticker);
  }).catch(() => {});
}

// ── CSV parser — header-aware, handles both full and slimmed format ──────────
function parseCSV(text) {
  const lines = text.trim().split("\n");
  const header = lines[0].split(",").map((h) => h.trim());
  const dateIdx  = header.indexOf("date");
  const closeIdx = header.indexOf("close");
  if (dateIdx === -1 || closeIdx === -1) return [];

  const prices = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const date = new Date(cols[dateIdx]?.trim());
    const close = parseFloat(cols[closeIdx]);
    if (!isNaN(date.getTime()) && close > 0) prices.push({ date, close });
  }
  prices.sort((a, b) => a.date - b.date);
  return prices;
}

// ── Public API ───────────────────────────────────────────────────────────────
export async function loadPrices(ticker) {
  if (memCache.has(ticker)) return memCache.get(ticker);

  const cached = await idbGet(ticker);
  if (cached) {
    memCache.set(ticker, cached);
    return cached;
  }

  const resp = await fetch(`${BASE_URL}${ticker}.csv`);
  if (!resp.ok) throw new Error(`${ticker} 데이터를 불러올 수 없습니다.`);
  const prices = parseCSV(await resp.text());

  memCache.set(ticker, prices);
  idbSet(ticker, prices);
  return prices;
}

export function prefetchTickers(tickers) {
  for (const ticker of tickers) {
    if (!memCache.has(ticker)) {
      loadPrices(ticker).catch(() => {});
    }
  }
}

export function filterByDateRange(prices, startDate, endDate) {
  return prices.filter((p) => p.date >= startDate && p.date <= endDate);
}

export async function loadWhatOthersBuy() {
  const BASE = "https://raw.githubusercontent.com/kittycapital/seibro-position-tracker/main/data";

  const [dashResp, mapResp] = await Promise.all([
    fetch(`${BASE}/dashboard_data.json`),
    fetch(`${BASE}/ticker_map.json`),
  ]);

  if (!dashResp.ok) throw new Error("순매수 데이터를 불러올 수 없습니다.");
  const data = await dashResp.json();
  const tickerMap = mapResp.ok ? await mapResp.json() : {};

  const current1W = data?.current?.["1W"]?.["미국"];
  const prev1W    = data?.previous?.["1W"]?.["미국"];
  const weekData  = (Array.isArray(current1W) && current1W.length > 0) ? current1W : (prev1W ?? []);

  return weekData
    .filter((item) => item.net_buy_amount > 0)
    .sort((a, b) => b.net_buy_amount - a.net_buy_amount)
    .map((item) => ({ ...item, ticker: tickerMap[item.isin] ?? null }));
}
