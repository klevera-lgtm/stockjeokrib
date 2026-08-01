// 카테고리별 "매일 적립 5년 총수익률" 챔피언 사전계산
// node scripts/computeChampions.mjs  →  data/categoryChampions.json
//
// 앱의 적립 로직(calculator.js)을 그대로 재사용해 종목 상세 수익률과 일치시킴.
// 5년 풀 데이터가 충분한 카테고리는 5년, 부족하면 3년→1년으로 낮추고 note 표기.

import fs from "fs";
import path from "path";
import { runStrategy } from "../src/utils/calculator.js";
import { TICKER_CATEGORIES } from "../src/utils/tickers.js";

const PRICES_DIR = "data/prices";
const OUT = "public/categoryChampions.json";
const TOP_N = 10;
const PERIODS = [5, 3, 1]; // 우선순위: 5년 → 3년 → 1년
const MIN_TICKERS = 3;     // 랭킹 성립 최소 종목 수
const MONTHLY = 300000;    // 총수익률은 금액과 무관 (스케일 불변)

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
function yearsAgo(n) {
  const d = new Date(now);
  d.setFullYear(d.getFullYear() - n);
  return d;
}

// 전 종목 가격 1회 로드
const allTickers = [...new Set(Object.values(TICKER_CATEGORIES).flat())];
const priceCache = {};
for (const t of allTickers) priceCache[t] = loadPrices(t);

const categories = [];

for (const [name, tickers] of Object.entries(TICKER_CATEGORIES)) {
  // 기준 기간 선택: MIN_TICKERS 이상이 풀 데이터를 가진 첫 기간
  let chosen = null;
  for (const yrs of PERIODS) {
    const start = yearsAgo(yrs);
    const qualified = tickers.filter((t) => {
      const pr = priceCache[t];
      return pr && pr[0].date <= start; // 최초 데이터가 시작일 이전 = 풀 기간 커버
    });
    if (qualified.length >= MIN_TICKERS) { chosen = { yrs, start, qualified }; break; }
  }
  if (!chosen) continue; // 데이터 부족 카테고리는 제외

  const { yrs, start, qualified } = chosen;
  const ranking = [];
  for (const t of qualified) {
    const res = runStrategy(priceCache[t], "daily", MONTHLY, start, now);
    if (res && res.totalInvested > 0) {
      ranking.push({
        ticker: t,
        return: +(res.totalReturn * 100).toFixed(1),
        cagr: +(res.cagr * 100).toFixed(1),
      });
    }
  }
  if (ranking.length < MIN_TICKERS) continue;
  ranking.sort((a, b) => b.return - a.return);

  categories.push({
    name,
    years: yrs,
    note: yrs < 5 ? `일부 종목이 상장 5년 미만이라 ${yrs}년 기준이에요` : null,
    ranking: ranking.slice(0, TOP_N),
  });
}

// ── 전체 명예의 전당 + 손실 방어 (레버리지 제외, 5년 풀데이터) ──
const LEVERAGE = new Set(TICKER_CATEGORIES["레버리지 ETF"] ?? []);
const start5 = yearsAgo(5);
const pool = [];
for (const t of allTickers) {
  if (LEVERAGE.has(t)) continue;
  const pr = priceCache[t];
  if (!pr || pr[0].date > start5) continue; // 5년 풀데이터만
  const res = runStrategy(pr, "daily", MONTHLY, start5, now);
  if (res && res.totalInvested > 0) {
    pool.push({
      ticker: t,
      return: +(res.totalReturn * 100).toFixed(1),
      cagr: +(res.cagr * 100).toFixed(1),
      mdd: +(res.mdd * 100).toFixed(1),
    });
  }
}
const overall = {
  years: 5,
  top: [...pool].sort((a, b) => b.return - a.return).slice(0, TOP_N),
  worst: [...pool].sort((a, b) => a.return - b.return).slice(0, TOP_N),
};
const defensive = {
  years: 5,
  ranking: [...pool].sort((a, b) => b.mdd - a.mdd).slice(0, TOP_N), // mdd가 0에 가까울수록 덜 빠짐
};

const output = { updated: now.toISOString().slice(0, 10), strategy: "daily", overall, defensive, categories };
fs.writeFileSync(OUT, JSON.stringify(output, null, 2));
console.log(`✓ 명예의전당·손실방어·${categories.length}개 카테고리 → ${OUT}`);
console.log(`  🏆 전체 1위: ${overall.top[0].ticker} +${overall.top[0].return}%`);
console.log(`  ⚠️ 전체 꼴찌: ${overall.worst[0].ticker} ${overall.worst[0].return}%`);
console.log(`  🛡 덜 빠진: ${defensive.ranking[0].ticker} MDD ${defensive.ranking[0].mdd}%`);
