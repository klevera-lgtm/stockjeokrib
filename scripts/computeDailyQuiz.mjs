// "오늘의 적립 퀴즈" 문제 풀 사전계산
// node scripts/computeDailyQuiz.mjs  →  public/dailyQuiz.json
//
// 앱의 적립 로직(calculator.js)을 그대로 써서 "○○를 5년 매일 적립했다면 총수익률?" 3지선다를 생성.
// 사실 기반 과거 데이터 퀴즈 (예측·권유 아님). 날짜 시드로 앱에서 하루 한 문제 노출.

import fs from "fs";
import path from "path";
import { runStrategy } from "../src/utils/calculator.js";
import { TICKER_CATEGORIES, TICKER_LABELS } from "../src/utils/tickers.js";

const PRICES_DIR = "data/prices";
const OUT = "public/dailyQuiz.json";
const YEARS = 5;
const MONTHLY = 300000; // 총수익률은 금액과 무관

// 사람들이 이름만 봐도 아는 종목 위주 (데이터·상장기간 부족분은 자동 제외)
const WHITELIST = [
  "NVDA", "TSLA", "AAPL", "MSFT", "AMZN", "GOOGL", "META", "NFLX", "AMD", "AVGO",
  "INTC", "DIS", "KO", "MCD", "SBUX", "NKE", "JPM", "V", "MA", "WMT", "COST", "BA",
  "SPY", "QQQ", "VOO", "TQQQ", "SOXL", "SCHD", "JEPI", "DIA", "IWM", "SMH", "SOXX",
  "005930", "000660",
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

// 티커별 안정적 시드 RNG (재빌드 시 보기 순서 고정)
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const stepFor = (v) => { const a = Math.abs(v); return a >= 300 ? 50 : a >= 100 ? 25 : a >= 30 ? 10 : 5; };
const niceRound = (x) => { const s = stepFor(x); return Math.round(x / s) * s; };

// 정답(t%) 주변에 그럴듯한 오답 2개 → low < mid < high 보장 후 셔플
function makeChoices(t, rng) {
  const mid = niceRound(t);
  let low = niceRound(t >= 0 ? t * 0.45 : t * 1.8);
  let high = niceRound(t >= 0 ? t * 1.85 : t * 0.45);
  let g = 0;
  while (low >= mid && g++ < 30) low -= stepFor(mid);
  g = 0;
  while (high <= mid && g++ < 30) high += stepFor(mid);
  const opts = [low, mid, high];
  // Fisher–Yates (시드 고정)
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  return { choices: opts, answer: opts.indexOf(mid) };
}

const now = new Date();
const start = new Date(now); start.setFullYear(start.getFullYear() - YEARS);
const known = new Set(Object.values(TICKER_CATEGORIES).flat());

const pool = [];
for (const t of WHITELIST) {
  if (!known.has(t)) continue;
  const pr = loadPrices(t);
  if (!pr || pr[0].date > start) continue; // 5년 풀데이터만
  const res = runStrategy(pr, "daily", MONTHLY, start, now);
  if (!res || !(res.totalInvested > 0)) continue;
  const ret = +(res.totalReturn * 100).toFixed(1);
  const { choices, answer } = makeChoices(ret, mulberry32(hash(t)));
  if (new Set(choices).size !== 3) continue; // 보기 중복이면 스킵
  pool.push({
    ticker: t,
    label: TICKER_LABELS[t] || t,
    ret,
    cagr: +(res.cagr * 100).toFixed(1),
    choices,
    answer,
  });
}

// 인접일에 같은 티커가 안 나오도록 수익률 기준 섞기(간단 셔플: 티커 해시순)
pool.sort((a, b) => hash(a.ticker) - hash(b.ticker));

const output = { updated: now.toISOString().slice(0, 10), period: YEARS, pool };
fs.writeFileSync(OUT, JSON.stringify(output, null, 2));
console.log(`✓ 오늘의 퀴즈 ${pool.length}문제 → ${OUT}`);
if (pool[0]) console.log(`  예시: ${pool[0].label} 5년 매일적립 실제 ${pool[0].ret}% · 보기 ${JSON.stringify(pool[0].choices)} 정답idx ${pool[0].answer}`);
