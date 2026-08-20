// 기간별 퍼포먼스 랭킹 사전계산 → perfRankings.json
// node scripts/computePerfRankings.mjs
//
// 8개 카테고리 × 기간(1·2·3·5·10·15·20년)별 "거치식 누적 총수익%" TOP10.
// data/prices/*.csv (close = auto_adjust 총수익, 배당 재투자 포함) 기반.
// 각 기간은 "그 기간 풀데이터 보유 종목(≥5)"만 랭크 — 짧은 이력 정직 처리.
// ⚠️ 정보 제공용 · 과거 성과 · 매매 권유 아님.

import { readFileSync, existsSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PRICES = process.env.PRICES_DIR || join(ROOT, "data", "prices");
const OUT_DIR = process.env.OUT_DIR || join(ROOT, "public");
const OUTPUT = join(OUT_DIR, "perfRankings.json");

// ── 종목 리스트 (tickers.js 기준, 자체 포함) ──
const IDX = ["VOO","SPY","IVV","QQQM","QQQ","VTI","DIA","IWM","VB","SCHG","VUG","RSP","COWZ"];
const SEMI = ["SMH","SOXX"];
const TECHS = ["XLK","VGT","MAGS","IGV","HACK","WCLD","BOTZ"];
const AIROBO = ["AIQ","CHAT","ROBO"];
const CRYPTO = ["IBIT","FBTC","ETHA","BSOL","BITO","BITX"];
const NUKE = ["URA","URNM","NLR"];
const DEF = ["XAR","PPA"];
const LEV = ["TQQQ","SOXL","UPRO","QLD","SSO","SPXL","TECL","TSLL","NVDL","MSTU","IONX","ORCX","USD","KORU","UGL","AGQ","UBT","TMF"];
const DIV = ["SCHD","JEPI","JEPQ","SPYD","DGRO","DGRW","QYLD","RYLD","VYM","DVY","VIG","HDV","SPHD","DIVO","PFF","XYLD","SDIV","QQQI","SPYI","GPIQ","SPYM"];
const COVCALL = ["MSTY","TSLY","YMAX","NVDY"];
const GICS = ["XLK","XLC","XLY","XLP","XLV","XLF","XLI","XLE","XLB","XLU","XLRE"];
const THEME = ["ITA","XBI","ICLN","LIT","ARKK","ARKF","ARKX","QTUM","VNQ","ARKG","PAVE"];
const SAFE = ["GLD","SLV","TLT","SHY","USO","BND","AGG","HYG","IAU","GDX","IEF","SGOV","JEM"];
const ASIA = ["INDA","EWJ","MCHI","KWEB","EWT","VNM","EWY","EWH","EWS","EIDO","THD","FXI","EWM"];
const EUR = ["VGK","EWG","EWU","EWQ","EWI","EWL","EZU"];
const OTHER = ["EWZ","EWW","EEM","ACWI","EWA","KSA","VT","VXUS","IEFA","IEMG","VWO"];
const BROAD = new Set(["EEM","ACWI","VT","VXUS","IEFA","IEMG","VWO"]); // 나라별에서 제외(광범위)
const uniq = (a) => [...new Set(a)];

const CATS = [
  { key: "all-etf",   label: "전체 ETF",       note: "미국 · 레버리지 제외",  leverage: false,
    tickers: uniq([...IDX,...SEMI,...TECHS,...AIROBO,...CRYPTO,...NUKE,...DEF,...DIV,...COVCALL,...GICS,...THEME,...SAFE]) },
  { key: "us-index",  label: "미국 인덱스",     note: "S&P500 · 나스닥 등",   leverage: false, tickers: IDX },
  { key: "tech",      label: "테크·반도체",     note: "테크 · 반도체 · AI",    leverage: false, tickers: uniq([...TECHS,...SEMI,...AIROBO]) },
  { key: "dividend",  label: "배당 ETF",        note: "배당 · 인컴",          leverage: false, tickers: DIV },
  { key: "sector",    label: "섹터별(GICS 11)", note: "11개 산업 섹터",       leverage: false, tickers: GICS },
  { key: "country",   label: "나라별",          note: "단일 국가 ETF",        leverage: false, tickers: uniq([...ASIA,...EUR,...OTHER]).filter(t=>!BROAD.has(t)) },
  { key: "leverage",  label: "레버리지 ETF",    note: "2~3배 · 고위험",       leverage: true,  tickers: LEV },
  { key: "mag7",      label: "매그니피센트 7",  note: "빅테크 7종",           leverage: false, tickers: ["AAPL","MSFT","GOOGL","AMZN","NVDA","META","TSLA"] },
];

const PERIODS = [1,2,3,5,10,15,20];
const MIN_TICKERS = 5;  // 랭킹 최소 종목(짧은 이력 정직 컷)
const TOP_N = 10;

// ── CSV 로드(캐시) ──
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
// 마지막 date <= cutoff 의 close (없으면 null)
function closeAsOf(s, cutoff) {
  let lo = 0, hi = s.dates.length - 1, res = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (s.dates[m] <= cutoff) { res = m; lo = m + 1; } else hi = m - 1; }
  return res < 0 ? null : s.closes[res];
}

// asof = SPY 최신일 기준
const spy = load("SPY");
const asof = spy ? spy.dates[spy.dates.length - 1] : new Date().toISOString().slice(0, 10);
const cutoffOf = (y) => { const d = new Date(asof); d.setFullYear(d.getFullYear() - y); return d.toISOString().slice(0, 10); };

const out = { updated: asof, asof, categories: {} };
for (const cat of CATS) {
  const periods = {};
  for (const p of PERIODS) {
    const cut = cutoffOf(p);
    const rows = [];
    for (const t of cat.tickers) {
      const s = load(t); if (!s) continue;
      const last = s.closes[s.closes.length - 1];
      const base = closeAsOf(s, cut);
      if (base == null || base <= 0) continue;         // 그 기간 데이터 없음 → 제외
      if (s.dates[0] > cut) continue;                  // 시작이 cutoff 이후면 이력 부족
      rows.push({ t, ret: +((last / base - 1)).toFixed(4) });
    }
    if (rows.length < MIN_TICKERS) continue;            // 정직 컷
    rows.sort((a, b) => b.ret - a.ret);
    periods[p] = { years: p, count: rows.length, rows: rows.slice(0, TOP_N) };
  }
  out.categories[cat.key] = { label: cat.label, note: cat.note, leverage: cat.leverage, periods };
}

writeFileSync(OUTPUT, JSON.stringify(out));
console.log(`\n=== 퍼포먼스 랭킹 (asof ${asof}) ===`);
for (const [k, c] of Object.entries(out.categories)) {
  const ps = Object.keys(c.periods).map(p => `${p}년(${c.periods[p].count})`).join(" ");
  console.log(`${c.label.padEnd(14)} → ${ps || "데이터부족"}`);
  const p1 = c.periods["1"] || Object.values(c.periods)[0];
  if (p1) console.log(`   1위: ${p1.rows[0].t} ${(p1.rows[0].ret*100).toFixed(1)}% (${p1.years}년)`);
}
console.log(`\n✅ perfRankings.json 저장`);
