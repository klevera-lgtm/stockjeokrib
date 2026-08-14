// 어제의 무버스 — 최근 거래일 등락률 상·하위 랭킹 사전계산
// node scripts/computeDailyMovers.mjs  →  public/dailyMovers.json
//
// data/prices/*.csv 를 직접 스캔(티커 목록 의존 X)해서 각 종목의 "가장 최근 1일 등락률"
// (마지막 두 종가)을 계산. 최근 거래일에 실제 거래된 종목만(스테일 제외) 랭킹.
// 매일 바뀌는 데일리 콘텐츠 → CI 파이프라인에서 매일 갱신.
// ⚠️ 정보 제공용, 매매 권유 아님.

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getTickerLabel, isKrTicker, TICKER_CATEGORIES, ALL_TICKERS } from "../src/utils/tickers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PRICES_DIR = join(ROOT, "data", "prices");
const OUT_DIR = process.env.OUT_DIR || join(ROOT, "public");
const OUTPUT = join(OUT_DIR, "dailyMovers.json");

const TOP_N = 15;
const EXCLUDE = new Set(["VIX", "KS11", "KQ11"]); // 지수(투자 대상 아님)
const FRESH_DAYS = 5; // 최근 거래일에서 이 일수 안에 거래된 종목만(미국·한국 세션 차이 흡수)

// 개별주 카테고리(태그용)
const STOCK_CATS = ["미국 개별주식", "배당주·리츠", "국내 자산"];
const stockSet = new Set();
for (const c of STOCK_CATS) for (const t of (TICKER_CATEGORIES[c] || [])) stockSet.add(t);

function lastTwoClose(file) {
  try {
    const text = readFileSync(join(PRICES_DIR, file), "utf8");
    const lines = text.trim().split("\n");
    if (lines.length < 3) return null;
    const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
    const di = header.indexOf("date");
    const ci = header.indexOf("close") >= 0 ? header.indexOf("close") : 1;
    // 뒤에서 유효한 두 종가
    const rows = [];
    for (let i = lines.length - 1; i >= 1 && rows.length < 2; i--) {
      const p = lines[i].split(",");
      const d = (di >= 0 ? p[di] : p[0])?.trim();
      const c = parseFloat(p[ci]);
      if (d && !isNaN(c) && c > 0) rows.push({ date: d, close: c });
    }
    return rows.length === 2 ? { last: rows[0], prev: rows[1] } : null;
  } catch {
    return null;
  }
}

// 큐레이션 유니버스만 (앱이 관리하는 ETF+인기주 — '남들이 본' 잡주 노이즈 제외)
const universe = new Set(ALL_TICKERS.filter((t) => !EXCLUDE.has(t)));
const files = readdirSync(PRICES_DIR).filter((f) => f.endsWith(".csv"));
const all = [];
let globalLast = "0000-00-00";
for (const f of files) {
  const ticker = f.slice(0, -4);
  if (!universe.has(ticker)) continue;
  const lt = lastTwoClose(f);
  if (!lt) continue;
  const change = +(((lt.last.close - lt.prev.close) / lt.prev.close) * 100).toFixed(2);
  if (!isFinite(change)) continue;
  if (lt.last.date > globalLast) globalLast = lt.last.date;
  all.push({ ticker, date: lt.last.date, change, price: +lt.last.close.toFixed(2) });
}

// 최근 거래일 근처에 거래된 종목만 (스테일 제외)
const cutoff = new Date(new Date(globalLast).getTime() - FRESH_DAYS * 86400000)
  .toISOString().slice(0, 10);
const fresh = all.filter((x) => x.date >= cutoff);

function decorate(x) {
  return {
    ticker: x.ticker,
    name: getTickerLabel(x.ticker) || x.ticker,
    change: x.change,
    price: x.price,
    kind: stockSet.has(x.ticker) ? (isKrTicker(x.ticker) ? "kr" : "stock") : "etf",
  };
}

const gainers = [...fresh].sort((a, b) => b.change - a.change).slice(0, TOP_N).map(decorate);
const losers = [...fresh].sort((a, b) => a.change - b.change).slice(0, TOP_N).map(decorate);

const output = {
  updated: globalLast,
  count: fresh.length,
  gainers,
  losers,
  note: "정보 제공용 · 매매 권유 아님",
};
writeFileSync(OUTPUT, JSON.stringify(output));

console.log(`\n=== 어제의 무버스 (${globalLast} 기준 · ${fresh.length}종목) ===`);
console.log("\n▲ 상승 TOP:");
for (const x of gainers.slice(0, 8)) console.log(`  ${x.name.padEnd(20)} ${x.ticker.padEnd(7)} +${x.change}%`);
console.log("\n▼ 하락 TOP:");
for (const x of losers.slice(0, 8)) console.log(`  ${x.name.padEnd(20)} ${x.ticker.padEnd(7)} ${x.change}%`);
console.log(`\n✅ dailyMovers.json 저장`);
