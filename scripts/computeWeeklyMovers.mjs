// 주간/YTD 무버스 사전계산 → weeklyMovers.json
// node scripts/computeWeeklyMovers.mjs
//
// 이번주(최근 5거래일) · YTD(연초~) 수익률을 ETF·개별주식·레버리지로 나눠 상·하위 5개.
// + 전체 종목 맵(내 종목 이번주 움직임 조회용). data/prices/*.csv (총수익) 기반.
// ⚠️ 정보 제공용 · 과거 사실 · 매매 권유 아님. (사람들이 가격에 일희일비 → 관심 훅)

import { readFileSync, existsSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PRICES = process.env.PRICES_DIR || join(ROOT, "data", "prices");
const OUT_DIR = process.env.OUT_DIR || join(ROOT, "public");
const OUTPUT = join(OUT_DIR, "weeklyMovers.json");

// ── 카테고리 분류 (tickers.js 기준, 자체 포함) ──
const STOCKS = [ // 미국 개별주식 + 배당주·리츠
  "TSLA","AAPL","NVDA","MSFT","AMZN","GOOGL","META","NFLX","AMD","AVGO","MU","TSM","KO","BRK-B","ORCL","INTC","MRVL","PLTR","SNOW","COIN",
  "RKLB","IONQ","WDC","LLY","COST","V","QCOM","UBER","SPOT","SHOP","ARM","AMAT","LRCX","ASML","BE","SMCI",
  "AAOI","CRWV","DDOG","GH","IREN","JPM","MSTR","NTRA","OKTA","SMR","UCTT","HOOD","SOFI","RIVN","NIO","PANW","CRM",
  "MARA","RIOT","CLSK","CORZ","SBUX","DIS","NKE","MA","WMT","HD","PYPL","ADBE","CSCO","PFE",
  "MRK","UNH","BAC","WFC","GS","F","GM","AXP","BA","BABA","ABNB",
  "O","MAIN","STAG","AGNC","ARCC","JNJ","PG","PEP","MCD","ABBV","XOM","CVX","T","VZ","MO","MMM","IBM",
];
const LEV = ["TQQQ","SOXL","UPRO","QLD","SSO","SPXL","TECL","TSLL","NVDL","MSTU","IONX","ORCX","USD","KORU","UGL","AGQ","UBT","TMF"];
const ETF = [ // 미국 ETF (레버리지 제외)
  "VOO","SPY","IVV","QQQM","QQQ","VTI","DIA","IWM","VB","SCHG","VUG","RSP","COWZ","SMH","SOXX",
  "XLK","VGT","MAGS","IGV","HACK","WCLD","BOTZ","AIQ","CHAT","ROBO","IBIT","FBTC","ETHA","BSOL","BITO","BITX",
  "URA","URNM","NLR","XAR","PPA","SCHD","JEPI","JEPQ","SPYD","DGRO","DGRW","QYLD","RYLD","VYM","DVY","VIG","HDV","SPHD","DIVO","PFF","XYLD","SDIV","QQQI","SPYI","GPIQ","SPYM",
  "MSTY","TSLY","YMAX","NVDY","XLC","XLY","XLP","XLV","XLF","XLI","XLE","XLB","XLU","XLRE",
  "ITA","XBI","ICLN","LIT","ARKK","ARKF","ARKX","QTUM","VNQ","ARKG","PAVE","GLD","SLV","TLT","SHY","USO","BND","AGG","HYG","IAU","GDX","IEF","SGOV","JEM",
];
const CATS = { etf: new Set(ETF), stock: new Set(STOCKS), lev: new Set(LEV) };
const EXCLUDE = new Set(["VIX","KS11","KQ11"]); // 지수 제외

const cache = {};
function load(t) {
  if (t in cache) return cache[t];
  const f = join(PRICES, `${t}.csv`);
  if (!existsSync(f)) return (cache[t] = null);
  const lines = readFileSync(f, "utf8").trim().split(/\r?\n/);
  const dates = [], closes = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].indexOf(","); if (c < 0) continue;
    const d = lines[i].slice(0, c), v = parseFloat(lines[i].slice(c + 1));
    if (d && !isNaN(v) && v > 0) { dates.push(d); closes.push(v); }
  }
  return (cache[t] = dates.length ? { dates, closes } : null);
}
function closeBefore(s, dateStr) { // 마지막 date < dateStr 의 close
  let lo = 0, hi = s.dates.length - 1, res = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (s.dates[m] < dateStr) { res = m; lo = m + 1; } else hi = m - 1; }
  return res < 0 ? null : s.closes[res];
}

// asof = SPY 최신일
const spy = load("SPY");
const asof = spy ? spy.dates[spy.dates.length - 1] : new Date().toISOString().slice(0, 10);
const ytdCut = `${asof.slice(0, 4)}-01-01`;

// data/prices 전체 스캔 → 종목별 이번주(5거래일)/YTD 수익률
const files = readdirSync(PRICES).filter((f) => f.endsWith(".csv")).map((f) => f.slice(0, -4));
const all = {}; // { ticker: { w, y } }
for (const t of files) {
  if (EXCLUDE.has(t)) continue;
  const s = load(t); if (!s || s.closes.length < 6) continue;
  const last = s.closes[s.closes.length - 1];
  const wk = s.closes[s.closes.length - 6]; // 5거래일 전
  const w = wk > 0 ? +((last / wk - 1)).toFixed(4) : null;
  const yb = closeBefore(s, ytdCut);
  const y = yb && yb > 0 ? +((last / yb - 1)).toFixed(4) : null;
  all[t] = { w, y };
}

// 카테고리 × 기간 상·하위 5개
function topBottom(setKey, period) {
  const set = CATS[setKey];
  const rows = [];
  for (const t of set) {
    const a = all[t]; if (!a) continue;
    const r = a[period === "week" ? "w" : "y"];
    if (r == null) continue;
    rows.push({ t, r });
  }
  rows.sort((a, b) => b.r - a.r);
  return { up: rows.slice(0, 5), down: rows.slice(-5).reverse() };
}

const lists = {};
for (const k of ["etf", "stock", "lev"]) {
  lists[k] = { week: topBottom(k, "week"), ytd: topBottom(k, "ytd") };
}

const output = { updated: asof, asof, ytdStart: ytdCut, all, lists };
writeFileSync(OUTPUT, JSON.stringify(output));

console.log(`\n=== 주간/YTD 무버스 (asof ${asof}, YTD 기준 ${ytdCut}) ===`);
console.log(`전체 종목 맵: ${Object.keys(all).length}개`);
for (const k of ["etf", "stock", "lev"]) {
  const u = lists[k].week.up[0], d = lists[k].week.down[0];
  console.log(`${k.padEnd(6)} 이번주 → 최고 ${u?.t} ${(u?.r * 100).toFixed(1)}% / 최저 ${d?.t} ${(d?.r * 100).toFixed(1)}%`);
}
console.log(`\n✅ weeklyMovers.json 저장`);
