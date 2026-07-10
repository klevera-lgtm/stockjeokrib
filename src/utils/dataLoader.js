import { BASE_URL } from "./tickers.js";

const cache = new Map();

export async function loadPrices(ticker) {
  if (cache.has(ticker)) return cache.get(ticker);

  const url = `${BASE_URL}${ticker}.csv`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${ticker} 데이터를 불러올 수 없습니다.`);

  const text = await resp.text();
  const rows = text.trim().split("\n").slice(1); // skip header
  const prices = [];

  for (const row of rows) {
    const cols = row.split(",");
    if (cols.length < 6) continue;
    const [dateStr, open, high, low, close, volume] = cols;
    const date = new Date(dateStr.trim());
    if (isNaN(date.getTime())) continue;
    prices.push({
      date,
      open: parseFloat(open),
      high: parseFloat(high),
      low: parseFloat(low),
      close: parseFloat(close),
      volume: parseFloat(volume),
    });
  }

  prices.sort((a, b) => a.date - b.date);
  cache.set(ticker, prices);
  return prices;
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

  // ISIN → ticker 맵 (실패해도 계속 진행)
  const tickerMap = mapResp.ok ? await mapResp.json() : {};

  // current["1W"]["미국"]이 비어있으면 previous로 fallback
  const current1W = data?.current?.["1W"]?.["미국"];
  const prev1W    = data?.previous?.["1W"]?.["미국"];
  const weekData  = (Array.isArray(current1W) && current1W.length > 0)
    ? current1W
    : (prev1W ?? []);

  return weekData
    .filter((item) => item.net_buy_amount > 0)
    .sort((a, b) => b.net_buy_amount - a.net_buy_amount)
    .map((item) => ({
      ...item,
      ticker: tickerMap[item.isin] ?? null,  // e.g. "NVDA", null이면 name만 표시
    }));
}
