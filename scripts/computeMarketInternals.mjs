// 시장 내부지표(Market Internals) 사전계산
// node scripts/computeMarketInternals.mjs  →  public/marketInternals.json
//
// 인덱스(S&P500=SPY / NDX100=QQQ / DOW30=DIA) 구성종목으로부터:
//  - 52주 신저가% / 신고가% (일자별)  ← B(신저가 바닥확률)
//  - 이평선(20/50/100/200) 상회 비율  ← 기존 마켓브레쓰 대체
//  - B study: 신저가%가 임계값(10/20/30/40) 상향 돌파 후 인덱스 30/60/90일 수익률
// ⚠️ 고정 유니버스(현재 구성종목)라 과거는 생존편향 있음 — 앱에서 주석 표기.

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
// 인덱스=data/prices, 구성종목 시세=data/constituents (데이터레포 main 커밋 레이아웃).
// 로컬(앱 레포)에서 검증 시 CONST_DIR env로 scratchpad 등 다른 경로 주입 가능.
const INDEX_DIR = join(ROOT, "data", "prices");
const CONST_DIR = process.env.CONST_DIR || join(ROOT, "data", "constituents");
const CONSTITUENTS = process.env.CONSTITUENTS || join(ROOT, "data", "constituents.json");
// 출력: 기본은 앱 번들(public/), CI에선 OUT_DIR=data/signals 지정
const OUT_DIR = process.env.OUT_DIR || join(ROOT, "public");
const OUTPUT = join(OUT_DIR, "marketInternals.json");

const INDEX_MAP = { SPY: "sp500", QQQ: "ndx100", DIA: "dow30" };
const INDEX_NAMES = { SPY: "S&P 500", QQQ: "나스닥 100", DIA: "다우 30" };
const MA_WINDOWS = [20, 50, 100, 200];
const MATURE = 252;        // 52주 = 1년 히스토리 있어야 카운트
// 하루 유효 종목 수 최소(미만이면 null)는 인덱스별로 members*0.7 (아래에서 계산)
const THRESHOLDS = [10, 20, 30, 40]; // 신저가% 임계값
const HORIZONS = [30, 60, 90];
const COOLDOWN = 20;

function loadClose(dir, ticker) {
  try {
    const text = readFileSync(join(dir, `${ticker}.csv`), "utf8");
    const lines = text.trim().split("\n");
    const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
    const di = header.indexOf("date"); const ci = header.indexOf("close");
    if (di < 0 || ci < 0) return null;
    const out = [];
    for (let i = 1; i < lines.length; i++) {
      const p = lines[i].split(",");
      const d = p[di]?.trim(); const c = parseFloat(p[ci]);
      if (d && !isNaN(c) && c > 0) out.push({ date: d, close: c });
    }
    out.sort((a, b) => (a.date < b.date ? -1 : 1));
    return out.length ? out : null;
  } catch { return null; }
}

// 구성종목별 성숙일(j>=252) 플래그: date -> {low,high,a20,a50,a100,a200}
function constituentFlags(series) {
  const n = series.length;
  const close = series.map((p) => p.close);
  // rolling 252 min/max (monotonic deque)
  const isLow = new Array(n).fill(false), isHigh = new Array(n).fill(false);
  const dqMin = [], dqMax = [];
  for (let i = 0; i < n; i++) {
    while (dqMin.length && close[dqMin[dqMin.length - 1]] >= close[i]) dqMin.pop();
    dqMin.push(i);
    while (dqMin[0] <= i - MATURE) dqMin.shift();
    while (dqMax.length && close[dqMax[dqMax.length - 1]] <= close[i]) dqMax.pop();
    dqMax.push(i);
    while (dqMax[0] <= i - MATURE) dqMax.shift();
    if (i >= MATURE - 1) {
      isLow[i] = close[i] <= close[dqMin[0]];   // 창 최소 = 신저가
      isHigh[i] = close[i] >= close[dqMax[0]];   // 창 최대 = 신고가
    }
  }
  // prefix sum → MA
  const pre = new Array(n + 1).fill(0);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + close[i];
  const flags = new Map();
  for (let i = MATURE - 1; i < n; i++) {
    const f = { low: isLow[i], high: isHigh[i] };
    for (const w of MA_WINDOWS) {
      const ma = (pre[i + 1] - pre[i + 1 - w]) / w;
      f[`a${w}`] = close[i] > ma;
    }
    flags.set(series[i].date, f);
  }
  return flags;
}

function median(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); }

const constituentsData = JSON.parse(readFileSync(CONSTITUENTS, "utf8"));
const availConst = new Set(readdirSync(CONST_DIR).filter((f) => f.endsWith(".csv")).map((f) => f.slice(0, -4)));

const outIndices = {};
const study = {};
const universeSize = {};

for (const [etf, listKey] of Object.entries(INDEX_MAP)) {
  const idxSeries = loadClose(INDEX_DIR, etf);
  if (!idxSeries) { console.error(`${etf} 인덱스 CSV 없음`); continue; }
  const axis = idxSeries.map((p) => p.date);
  const axisPrice = idxSeries.map((p) => p.close);
  const axisIdx = new Map(axis.map((d, i) => [d, i]));

  const members = constituentsData[listKey].filter((t) => availConst.has(t));
  universeSize[etf] = members.length;

  // 일자별 카운터
  const N = axis.length;
  const cnt = new Array(N).fill(0);
  const low = new Array(N).fill(0), high = new Array(N).fill(0);
  const ma = Object.fromEntries(MA_WINDOWS.map((w) => [w, new Array(N).fill(0)]));

  for (const t of members) {
    const s = loadClose(CONST_DIR, t);
    if (!s || s.length < MATURE) continue;
    const flags = constituentFlags(s);
    for (const [date, f] of flags) {
      const i = axisIdx.get(date);
      if (i === undefined) continue;
      cnt[i]++;
      if (f.low) low[i]++;
      if (f.high) high[i]++;
      for (const w of MA_WINDOWS) if (f[`a${w}`]) ma[w][i]++;
    }
  }

  const minDenom = Math.max(15, Math.round(members.length * 0.7)); // 인덱스별 최소 표본
  const pct = (num, den) => (den >= minDenom ? +((num / den) * 100).toFixed(1) : null);
  const newLow = low.map((v, i) => pct(v, cnt[i]));
  const newHigh = high.map((v, i) => pct(v, cnt[i]));
  const breadth = {};
  for (const w of MA_WINDOWS) breadth[`pct_above_${w}`] = ma[w].map((v, i) => pct(v, cnt[i]));

  // 현재값
  let last = N - 1; while (last > 0 && newLow[last] == null) last--;
  const current = {
    newLow: newLow[last], newHigh: newHigh[last],
    pct_above_20: breadth.pct_above_20[last], pct_above_50: breadth.pct_above_50[last],
    pct_above_100: breadth.pct_above_100[last], pct_above_200: breadth.pct_above_200[last],
    denom: cnt[last], date: axis[last],
  };

  outIndices[etf] = {
    dates: axis, prices: axisPrice.map((p) => +p.toFixed(2)),
    newLow, newHigh, breadth, current,
  };

  // ── B study: 신저가% 임계값 상향 돌파 후 인덱스 수익률 ──
  study[etf] = {};
  for (const T of THRESHOLDS) {
    const entries = [];
    let lastE = -Infinity;
    for (let i = 1; i < N; i++) {
      if (newLow[i] == null || newLow[i - 1] == null) continue;
      if (newLow[i] >= T && newLow[i - 1] < T) {
        if (i - lastE < COOLDOWN) continue;
        entries.push(i); lastE = i;
      }
    }
    const horizons = {};
    for (const h of HORIZONS) {
      const rets = [];
      for (const e of entries) {
        if (e + h < N) rets.push({ ret: ((axisPrice[e + h] - axisPrice[e]) / axisPrice[e]) * 100, year: axis[e].slice(0, 4) });
      }
      if (!rets.length) { horizons[h] = { count: 0 }; continue; }
      const vals = rets.map((r) => r.ret);
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const wins = vals.filter((v) => v > 0).length;
      const worst = rets.reduce((m, r) => (r.ret < m.ret ? r : m), rets[0]);
      horizons[h] = { avg: +avg.toFixed(1), winRate: Math.round((wins / vals.length) * 100), count: vals.length, worst: { ret: +worst.ret.toFixed(1), year: worst.year } };
    }
    study[etf][T] = { events: entries.length, horizons };
  }
}

const output = {
  updated: outIndices.SPY?.current?.date ?? null,
  indices: outIndices,
  study,
  universeSize,
  thresholds: THRESHOLDS,
  horizons: HORIZONS,
  note: "고정 유니버스(현재 구성종목) 기준 — 과거는 생존편향 있음",
};
writeFileSync(OUTPUT, JSON.stringify(output));

// 요약
console.log("\n=== 시장 내부지표 ===");
for (const etf of Object.keys(INDEX_MAP)) {
  const o = outIndices[etf]; if (!o) continue;
  console.log(`\n${etf} (${INDEX_NAMES[etf]}) · 유니버스 ${universeSize[etf]} · 현재 신저가 ${o.current.newLow}% 신고가 ${o.current.newHigh}% (denom ${o.current.denom})`);
  for (const T of THRESHOLDS) {
    const s = study[etf][T]; const h = s.horizons["90"];
    console.log(`  신저가≥${T}% 돌파 ${s.events}회 | ${h.count ? `90일 평균 ${h.avg >= 0 ? "+" : ""}${h.avg}%·승률 ${h.winRate}%(최악 ${h.worst.ret}% ${h.worst.year})` : "표본없음"}`);
  }
}
console.log(`\n✅ marketInternals.json 저장`);
