// "오늘의 종목 대결" 대진 풀 사전계산
// node scripts/computeDailyVersus.mjs  →  public/dailyVersus.json
//
// 사람들이 아는 라이벌 대진을 매일 하나씩. 두 종목을 5년(부족하면 공통기간) 매일 적립한
// 총수익률로 승자 결정. 사실 기반 과거 데이터 (예측·권유 아님). 날짜 시드로 앱에서 하루 하나.

import fs from "fs";
import path from "path";
import { runStrategy } from "../src/utils/calculator.js";
import { TICKER_CATEGORIES, TICKER_LABELS } from "../src/utils/tickers.js";

const PRICES_DIR = "data/prices";
const OUT = "public/dailyVersus.json";
const TARGET_YEARS = 5;
const MIN_YEARS = 2;     // 공통기간이 이보다 짧으면 대진 제외
const MONTHLY = 300000;  // 총수익률은 금액과 무관

// 인지도 높은 라이벌 대진 (둘 중 데이터 없거나 공통기간 부족하면 자동 제외)
const PAIRS = [
  // 반도체·칩
  ["NVDA", "AMD"], ["INTC", "AMD"], ["INTC", "NVDA"], ["TSM", "INTC"],
  ["AVGO", "AMD"], ["QCOM", "AVGO"], ["MRVL", "AVGO"], ["MU", "WDC"],
  ["AMAT", "LRCX"], ["ASML", "AMAT"], ["SMCI", "NVDA"],
  // 빅테크
  ["AAPL", "MSFT"], ["MSFT", "GOOGL"], ["META", "GOOGL"], ["AAPL", "NVDA"],
  ["NVDA", "TSLA"], ["ORCL", "CRM"], ["AMZN", "GOOGL"],
  // 소프트웨어·데이터
  ["PLTR", "SNOW"], ["SNOW", "DDOG"], ["PANW", "OKTA"],
  // 크립토·핀테크
  ["COIN", "MSTR"], ["MARA", "RIOT"], ["RIOT", "CLSK"], ["CLSK", "CORZ"],
  ["HOOD", "SOFI"], ["SOFI", "COIN"],
  // EV·성장
  ["RIVN", "NIO"], ["TSLA", "RIVN"], ["UBER", "SPOT"], ["SHOP", "UBER"],
  // 헬스케어·소비재
  ["LLY", "JNJ"], ["JNJ", "ABBV"], ["ABBV", "LLY"],
  ["KO", "PEP"], ["PG", "KO"], ["PG", "PEP"], ["MCD", "KO"],
  // 에너지·통신·가치
  ["XOM", "CVX"], ["T", "VZ"], ["MO", "T"], ["BRK-B", "SPY"],
  // 인덱스 ETF
  ["SPY", "QQQ"], ["QQQ", "DIA"], ["IWM", "QQQ"], ["RSP", "SPY"],
  ["SMH", "SOXX"], ["XLK", "VGT"], ["ARKK", "QQQ"],
  // 레버리지 ETF
  ["TQQQ", "SOXL"], ["TQQQ", "UPRO"], ["SOXL", "TECL"],
  // 배당·인컴 ETF
  ["SCHD", "JEPI"], ["JEPI", "JEPQ"], ["SCHD", "VYM"], ["QYLD", "RYLD"],
  // 안전자산·원자재
  ["GLD", "SLV"], ["GLD", "TLT"], ["TLT", "IEF"], ["URA", "URNM"],
  // 크립토 ETF
  ["IBIT", "FBTC"],
  // 국가 ETF
  ["EWY", "EWJ"], ["MCHI", "FXI"], ["INDA", "MCHI"], ["EWZ", "EWW"],
  // 신규 종목으로 살아난 클래식 라이벌 (2026-08 확장)
  ["MCD", "SBUX"], ["DIS", "NFLX"], ["V", "MA"], ["AXP", "V"],
  ["ADBE", "CRM"], ["PYPL", "SOFI"], ["HD", "WMT"], ["COST", "WMT"],
  ["BABA", "AMZN"], ["ABNB", "UBER"], ["F", "GM"],
  ["BAC", "JPM"], ["WFC", "BAC"], ["GS", "JPM"], ["PFE", "MRK"], ["UNH", "JNJ"],
  // 국내
  ["005930", "000660"], ["KS11", "KQ11"],
  ["035420", "035720"], ["005380", "000270"], ["207940", "068270"], ["373220", "051910"],
];

function loadPrices(ticker) {
  const p = path.join(PRICES_DIR, `${ticker}.csv`);
  if (!fs.existsSync(p)) return null;
  const lines = fs.readFileSync(p, "utf8").trim().split("\n");
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const [d, c] = lines[i].split(",");
    const close = parseFloat(c);
    const date = new Date(d);
    if (!isNaN(date.getTime()) && close > 0) out.push({ date, close });
  }
  out.sort((a, b) => a.date - b.date);
  return out.length ? out : null;
}

const now = new Date();
const target = new Date(now); target.setFullYear(target.getFullYear() - TARGET_YEARS);
const known = new Set(Object.values(TICKER_CATEGORIES).flat());
const label = (t) => TICKER_LABELS[t] || t;

const pool = [];
for (const [a, b] of PAIRS) {
  if (!known.has(a) || !known.has(b)) continue;
  const pa = loadPrices(a), pb = loadPrices(b);
  if (!pa || !pb) continue;
  // 공정 비교: 둘 다 데이터가 있는 공통 시작일 (최대 5년)
  const start = new Date(Math.max(target.getTime(), pa[0].date.getTime(), pb[0].date.getTime()));
  const years = (now - start) / (365.25 * 24 * 3600 * 1000);
  if (years < MIN_YEARS) continue;
  const ra = runStrategy(pa, "daily", MONTHLY, start, now);
  const rb = runStrategy(pb, "daily", MONTHLY, start, now);
  if (!ra || !rb || !(ra.totalInvested > 0) || !(rb.totalInvested > 0)) continue;
  const retA = +(ra.totalReturn * 100).toFixed(1);
  const retB = +(rb.totalReturn * 100).toFixed(1);
  pool.push({
    a, b, labelA: label(a), labelB: label(b),
    years: Math.round(years),
    retA, retB,
    cagrA: +(ra.cagr * 100).toFixed(1),
    cagrB: +(rb.cagr * 100).toFixed(1),
    winner: retA >= retB ? "a" : "b",
    margin: +Math.abs(retA - retB).toFixed(1),
  });
}

const output = { updated: now.toISOString().slice(0, 10), strategy: "daily", pool };
fs.writeFileSync(OUT, JSON.stringify(output, null, 2));
console.log(`✓ 오늘의 대결 ${pool.length}개 대진 → ${OUT}`);
for (const p of pool.slice(0, 6)) {
  console.log(`  ${p.labelA} ${p.retA}% vs ${p.labelB} ${p.retB}% → ${p.winner === "a" ? p.labelA : p.labelB} 승 (${p.margin}%p, ${p.years}년)`);
}
