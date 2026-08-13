// 섹터 히트맵 + 섹터 바닥 신호 사전계산
// node scripts/computeSectorHeatmap.mjs  →  public/sectorHeatmap.json
//
// (1) 히트맵: 미국 11개 섹터 ETF의 기간별 수익률 + SPY 대비 상대강도 (현황 지도)
// (2) 바닥 신호: 9개 섹터 중 200일선 위 섹터 수(섹터 breadth)가 ≤2/≤1/0개로
//     급감(washout)한 과거 시점 이후 SPY의 30/60/90일 수익률(승률·최악).
//     → 데이터 검증 결과 "적을수록 강한 반등"(30·60일). 90일이면 기준선 수렴.
// "특정 섹터 매수 권유"가 아니라 "과거 데이터가 이랬다"는 팩트 제공용.

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PRICES_DIR = join(ROOT, "data", "prices");
const OUT_DIR = process.env.OUT_DIR || join(ROOT, "public");
const OUTPUT = join(OUT_DIR, "sectorHeatmap.json");

// 섹터 정의 (순서 = 경기민감 → 방어). type: cyclical=경기민감, defensive=방어
const SECTORS = [
  { etf: "XLK", name: "기술", type: "cyclical" },
  { etf: "XLC", name: "통신", type: "cyclical" },
  { etf: "XLY", name: "경기소비", type: "cyclical" },
  { etf: "XLF", name: "금융", type: "cyclical" },
  { etf: "XLI", name: "산업", type: "cyclical" },
  { etf: "XLB", name: "소재", type: "cyclical" },
  { etf: "XLE", name: "에너지", type: "cyclical" },
  { etf: "XLRE", name: "부동산", type: "defensive" },
  { etf: "XLV", name: "헬스케어", type: "defensive" },
  { etf: "XLP", name: "필수소비", type: "defensive" },
  { etf: "XLU", name: "유틸리티", type: "defensive" },
];

const HORIZONS = [
  { key: "1D", days: 1, label: "1일" },
  { key: "1W", days: 5, label: "1주" },
  { key: "1M", days: 21, label: "1개월" },
  { key: "3M", days: 63, label: "3개월" },
  { key: "6M", days: 126, label: "6개월" },
  { key: "1Y", days: 252, label: "1년" },
  { key: "YTD", days: null, label: "올해" },
];

// 바닥 신호: 긴 히스토리(2006~) 확보되는 9개 섹터로 breadth 계산 (XLRE/XLC 제외)
const BREADTH_SECTORS = ["XLK", "XLY", "XLF", "XLI", "XLB", "XLE", "XLV", "XLP", "XLU"];
const MA_WINDOW = 200;
const WASH_THRESHOLDS = [2, 1, 0]; // "200일선 위 섹터 ≤ k개로 하향" (깊을수록 강한 신호)
const FWD = [30, 60, 90];
const WASH_COOLDOWN = 21;

function loadCsv(ticker) {
  try {
    const text = readFileSync(join(PRICES_DIR, `${ticker}.csv`), "utf8");
    const lines = text.trim().split("\n");
    const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
    const di = header.indexOf("date");
    const ci = header.indexOf("close") >= 0 ? header.indexOf("close") : 1;
    const out = [];
    for (let i = 1; i < lines.length; i++) {
      const p = lines[i].split(",");
      const d = (di >= 0 ? p[di] : p[0])?.trim();
      const c = parseFloat(p[ci]);
      if (d && !isNaN(c) && c > 0) out.push({ date: d, close: c });
    }
    out.sort((a, b) => (a.date < b.date ? -1 : 1));
    return out.length ? out : null;
  } catch {
    return null;
  }
}

const pct = (a, b) => (b > 0 ? +(((a - b) / b) * 100).toFixed(1) : null);

function horizonReturns(series) {
  const n = series.length;
  const last = series[n - 1].close;
  const lastYear = series[n - 1].date.slice(0, 4);
  const ret = {};
  for (const h of HORIZONS) {
    if (h.key === "YTD") {
      let base = null;
      for (let i = n - 1; i >= 0; i--) {
        if (series[i].date.slice(0, 4) < lastYear) { base = series[i].close; break; }
      }
      ret[h.key] = base != null ? pct(last, base) : null;
    } else {
      const j = n - 1 - h.days;
      ret[h.key] = j >= 0 ? pct(last, series[j].close) : null;
    }
  }
  return ret;
}

// ── (1) 히트맵 + 상대강도 ──
const spy = loadCsv("SPY");
if (!spy) { console.error("SPY.csv 없음"); process.exit(1); }
const spyRet = horizonReturns(spy);

const sectors = [];
for (const s of SECTORS) {
  const series = loadCsv(s.etf);
  if (!series) { console.error(`${s.etf}.csv 없음 — 스킵`); continue; }
  const ret = horizonReturns(series);
  const rel = {};
  for (const h of HORIZONS) {
    rel[h.key] = ret[h.key] != null && spyRet[h.key] != null
      ? +(ret[h.key] - spyRet[h.key]).toFixed(1) : null;
  }
  sectors.push({
    etf: s.etf, name: s.name, type: s.type,
    price: +series[series.length - 1].close.toFixed(2),
    date: series[series.length - 1].date,
    ret, rel,
  });
}

// ── (2) 섹터 바닥 신호 (breadth washout) ──
const bmaps = {};
let bok = true;
for (const t of BREADTH_SECTORS) {
  const arr = loadCsv(t);
  if (!arr) { console.error(`breadth: ${t} 없음`); bok = false; break; }
  bmaps[t] = new Map(arr.map((p) => [p.date, p.close]));
}

let washout = null;
if (bok) {
  // SPY 축 중 9개 섹터 모두 값 있는 날만 정렬
  const dates = [];
  const closes = {}; for (const t of [...BREADTH_SECTORS, "SPY"]) closes[t] = [];
  for (const p of spy) {
    if (BREADTH_SECTORS.every((t) => bmaps[t].has(p.date))) {
      dates.push(p.date);
      for (const t of BREADTH_SECTORS) closes[t].push(bmaps[t].get(p.date));
      closes.SPY.push(p.close);
    }
  }
  const N = dates.length;
  // 각 섹터 200일 이동평균 → 일자별 "200일선 위 섹터 수"
  const above = new Array(N).fill(null);
  for (let i = MA_WINDOW - 1; i < N; i++) {
    let cnt = 0;
    for (const t of BREADTH_SECTORS) {
      let sum = 0; for (let j = i - MA_WINDOW + 1; j <= i; j++) sum += closes[t][j];
      if (closes[t][i] > sum / MA_WINDOW) cnt++;
    }
    above[i] = cnt;
  }
  // 기준선(무조건 매수) 승률 — 정직 비교용
  const baseline = {};
  for (const h of FWD) {
    const v = []; for (let i = 0; i + h < N; i++) v.push((closes.SPY[i + h] - closes.SPY[i]) / closes.SPY[i] * 100);
    baseline[h] = { winRate: Math.round(v.filter((x) => x > 0).length / v.length * 100), avg: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) };
  }
  // 하향 돌파 이벤트 → forward SPY
  const study = {};
  for (const T of WASH_THRESHOLDS) {
    const events = []; let lastE = -Infinity;
    for (let i = MA_WINDOW; i < N; i++) {
      if (above[i] == null || above[i - 1] == null) continue;
      if (above[i] <= T && above[i - 1] > T) {
        if (i - lastE < WASH_COOLDOWN) continue;
        events.push(i); lastE = i;
      }
    }
    const horizons = {};
    for (const h of FWD) {
      const rows = [];
      for (const e of events) if (e + h < N) rows.push({ ret: (closes.SPY[e + h] - closes.SPY[e]) / closes.SPY[e] * 100, year: dates[e].slice(0, 4) });
      if (!rows.length) { horizons[h] = { count: 0 }; continue; }
      const vals = rows.map((r) => r.ret);
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const wins = vals.filter((v) => v > 0).length;
      const worst = rows.reduce((m, r) => (r.ret < m.ret ? r : m), rows[0]);
      horizons[h] = { avg: +avg.toFixed(1), winRate: Math.round((wins / vals.length) * 100), count: vals.length, worst: { ret: +worst.ret.toFixed(1), year: worst.year } };
    }
    study[T] = { events: events.length, horizons };
  }
  // 현재값 + 차트용 다운샘플(주 1회)
  let cur = null; for (let i = N - 1; i >= 0; i--) { if (above[i] != null) { cur = above[i]; break; } }
  const series = { dates: [], above: [], spy: [] };
  for (let i = MA_WINDOW - 1; i < N; i += 5) { series.dates.push(dates[i]); series.above.push(above[i]); series.spy.push(+closes.SPY[i].toFixed(2)); }
  washout = {
    maWindow: MA_WINDOW, total: BREADTH_SECTORS.length, thresholds: WASH_THRESHOLDS,
    sectors: BREADTH_SECTORS, dataStart: dates[0], cooldownDays: WASH_COOLDOWN,
    current: { above: cur, total: BREADTH_SECTORS.length, date: dates[N - 1] },
    baseline, study, series,
  };
}

const output = {
  updated: sectors[0]?.date ?? null,
  horizons: HORIZONS,
  fwd: FWD,
  spy: { ret: spyRet, price: +spy[spy.length - 1].close.toFixed(2) },
  sectors,
  washout,
  note: "정보 제공용 · 매매 권유 아님",
};
writeFileSync(OUTPUT, JSON.stringify(output));

// 요약
console.log(`\n=== 섹터 히트맵 (${output.updated}) ===`);
console.log(`SPY: 1D ${spyRet["1D"]}% · 1M ${spyRet["1M"]}% · 1Y ${spyRet["1Y"]}% · YTD ${spyRet.YTD}%`);
const sorted = [...sectors].sort((a, b) => (b.ret["1M"] ?? -999) - (a.ret["1M"] ?? -999));
for (const s of sorted) console.log(`  ${s.name.padEnd(5)} ${s.etf.padEnd(5)} 1M ${(s.ret["1M"] ?? 0) >= 0 ? "+" : ""}${s.ret["1M"]}% (SPY대비 ${(s.rel["1M"] ?? 0) >= 0 ? "+" : ""}${s.rel["1M"]}%p)`);
if (washout) {
  console.log(`\n=== 섹터 바닥 신호 (200일선 위 섹터, ${washout.dataStart}~) ===`);
  console.log(`현재: ${washout.current.above}/${washout.current.total}개 · 기준선 승률 ${FWD.map((h) => `${h}일 ${washout.baseline[h].winRate}%`).join(" ")}`);
  for (const T of WASH_THRESHOLDS) {
    const st = washout.study[T];
    const parts = FWD.map((h) => { const s = st.horizons[h]; return s.count ? `${h}일 ${s.winRate}%(Δ${s.winRate - washout.baseline[h].winRate >= 0 ? "+" : ""}${s.winRate - washout.baseline[h].winRate})·평균${s.avg >= 0 ? "+" : ""}${s.avg}%` : `${h}일 -`; });
    console.log(`  ≤${T}개 하향(${st.events}회): ${parts.join(" | ")}`);
  }
}
console.log(`\n✅ sectorHeatmap.json 저장`);
