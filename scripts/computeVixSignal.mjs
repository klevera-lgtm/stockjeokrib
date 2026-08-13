// VIX 공포지수 신호 사전계산
// node scripts/computeVixSignal.mjs  →  public/vixSignal.json
//
// VIX가 30/40을 상향 돌파한 과거 시점들 이후, 인덱스(SPY/QQQ/DIA)의
// 30/60/90 거래일 수익률을 집계. 평균·승률·표본수·최악사례(연도)를 함께 표시.
// "특정 종목 매수 권유"가 아니라 "과거 데이터가 이랬다"는 팩트 제공용.

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PRICES_DIR = join(ROOT, "data", "prices");
// 출력 위치: 기본은 앱 번들(public/). CI(데이터레포 main)에선 OUT_DIR=data/signals 지정
const OUT_DIR = process.env.OUT_DIR || join(ROOT, "public");
const OUTPUT = join(OUT_DIR, "vixSignal.json");

const INDICES = ["SPY", "QQQ", "DIA"];
const INDEX_NAMES = { SPY: "S&P 500", QQQ: "나스닥 100", DIA: "다우 30" };
const THRESHOLDS = [30, 40];
const HORIZONS = [30, 60, 90]; // 거래일
const COOLDOWN = 20; // 같은 공포 국면 재돌파 병합 (거래일)

function loadCsv(ticker) {
  try {
    const text = readFileSync(join(PRICES_DIR, `${ticker}.csv`), "utf8");
    const lines = text.trim().split("\n");
    const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
    const closeIdx = header.indexOf("close") >= 0 ? header.indexOf("close") : 1;
    return lines
      .slice(1)
      .map((row) => {
        const parts = row.split(",");
        return { date: parts[0]?.trim(), close: parseFloat(parts[closeIdx]) };
      })
      .filter((p) => p.date && !isNaN(p.close) && p.close > 0)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  } catch {
    return null;
  }
}

const vix = loadCsv("VIX");
if (!vix) {
  console.error("VIX.csv 없음");
  process.exit(1);
}

// 인덱스: 정렬 배열 + date→i 맵
const idxData = {};
for (const sym of INDICES) {
  const arr = loadCsv(sym);
  if (!arr) {
    console.error(`${sym}.csv 없음`);
    process.exit(1);
  }
  idxData[sym] = { arr, map: new Map(arr.map((p, i) => [p.date, i])) };
}

// 세 인덱스 공통 시작일 (forward 가능 구간)
const dataStart = INDICES.map((s) => idxData[s].arr[0].date).sort().at(-1);

// 크로스 날짜 d에 대해 date>=d인 첫 인덱스 봉 위치 (휴장 불일치 대비 이진탐색)
function entryPos(sym, date) {
  const { arr, map } = idxData[sym];
  if (map.has(date)) return map.get(date);
  let lo = 0, hi = arr.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].date >= date) { ans = mid; hi = mid - 1; }
    else lo = mid + 1;
  }
  return ans;
}

// 임계값 상향 돌파 (쿨다운 병합) 이벤트
function findCrossings(T) {
  const events = [];
  let lastIdx = -Infinity;
  for (let i = 1; i < vix.length; i++) {
    if (vix[i].date < dataStart) continue;
    if (vix[i].close >= T && vix[i - 1].close < T) {
      if (i - lastIdx < COOLDOWN) continue;
      events.push({ vi: i, date: vix[i].date, vixAtCross: +vix[i].close.toFixed(1) });
      lastIdx = i;
    }
  }
  return events;
}

// 이벤트 국면 최고 VIX (다음 60거래일 내)
function peakVixAfter(vi) {
  let pk = vix[vi].close;
  for (let j = vi; j < Math.min(vix.length, vi + 60); j++) pk = Math.max(pk, vix[j].close);
  return +pk.toFixed(1);
}

const stats = {};
const eventsOut = {};
for (const sym of INDICES) stats[sym] = {};

for (const T of THRESHOLDS) {
  const crossings = findCrossings(T);
  eventsOut[T] = [];
  const acc = {};
  for (const sym of INDICES) {
    acc[sym] = {};
    for (const h of HORIZONS) acc[sym][h] = [];
  }
  for (const ev of crossings) {
    const evRow = { date: ev.date, vixAtCross: ev.vixAtCross, peakVix: peakVixAfter(ev.vi), fwd: {} };
    for (const sym of INDICES) {
      const e = entryPos(sym, ev.date);
      evRow.fwd[sym] = {};
      if (e < 0) continue;
      const { arr } = idxData[sym];
      const p0 = arr[e].close;
      for (const h of HORIZONS) {
        if (e + h < arr.length) {
          const ret = +(((arr[e + h].close - p0) / p0) * 100).toFixed(1);
          evRow.fwd[sym][h] = ret;
          acc[sym][h].push({ ret, date: ev.date });
        } else {
          evRow.fwd[sym][h] = null;
        }
      }
    }
    eventsOut[T].push(evRow);
  }
  for (const sym of INDICES) {
    const horizons = {};
    for (const h of HORIZONS) {
      const rows = acc[sym][h];
      if (rows.length === 0) { horizons[h] = { count: 0 }; continue; }
      const rets = rows.map((r) => r.ret);
      const avg = rets.reduce((a, b) => a + b, 0) / rets.length;
      const wins = rets.filter((r) => r > 0).length;
      const worstRow = rows.reduce((m, r) => (r.ret < m.ret ? r : m), rows[0]);
      const bestRow = rows.reduce((m, r) => (r.ret > m.ret ? r : m), rows[0]);
      horizons[h] = {
        avg: +avg.toFixed(1),
        winRate: Math.round((wins / rets.length) * 100),
        count: rets.length,
        worst: { ret: worstRow.ret, year: worstRow.date.slice(0, 4) },
        best: { ret: bestRow.ret, year: bestRow.date.slice(0, 4) },
      };
    }
    stats[sym][T] = { events: crossings.length, horizons };
  }
}

// 차트 시리즈: SPY 날짜축 기준, 날짜별 vix + 각 인덱스 종가
const spyArr = idxData.SPY.arr.filter((p) => p.date >= dataStart);
const vixMap = new Map(vix.map((p) => [p.date, p.close]));
const qqqMap = new Map(idxData.QQQ.arr.map((p) => [p.date, p.close]));
const diaMap = new Map(idxData.DIA.arr.map((p) => [p.date, p.close]));
const series = { dates: [], vix: [], SPY: [], QQQ: [], DIA: [] };
for (const p of spyArr) {
  const v = vixMap.get(p.date);
  if (v == null) continue;
  series.dates.push(p.date);
  series.vix.push(+v.toFixed(2));
  series.SPY.push(+p.close.toFixed(2));
  series.QQQ.push(qqqMap.has(p.date) ? +qqqMap.get(p.date).toFixed(2) : null);
  series.DIA.push(diaMap.has(p.date) ? +diaMap.get(p.date).toFixed(2) : null);
}

const output = {
  updated: vix[vix.length - 1].date,
  current: { vix: +vix[vix.length - 1].close.toFixed(2), date: vix[vix.length - 1].date },
  thresholds: THRESHOLDS,
  horizons: HORIZONS,
  cooldownDays: COOLDOWN,
  dataStart,
  indices: INDICES,
  indexNames: INDEX_NAMES,
  stats,
  events: eventsOut,
  series,
};
writeFileSync(OUTPUT, JSON.stringify(output));

// 콘솔 요약 (정직 스토리 확인용)
console.log(`\nVIX: ${vix[0].date} ~ ${vix[vix.length - 1].date} (${vix.length}행), 현재 ${output.current.vix}`);
console.log(`인덱스 데이터 시작: ${dataStart}`);
for (const T of THRESHOLDS) {
  console.log(`\n━━ VIX ${T} 돌파 (쿨다운 ${COOLDOWN}거래일) · 이벤트 ${eventsOut[T].length}회 ━━`);
  for (const sym of INDICES) {
    const hs = stats[sym][T].horizons;
    const parts = HORIZONS.map((h) => {
      const s = hs[h];
      return s.count
        ? `${h}일 평균 ${s.avg >= 0 ? "+" : ""}${s.avg}%·승률 ${s.winRate}%(n=${s.count},최악 ${s.worst.ret}% ${s.worst.year})`
        : `${h}일 -`;
    });
    console.log(`  ${sym}: ${parts.join(" | ")}`);
  }
}
console.log(`\n✅ vixSignal.json 저장`);
