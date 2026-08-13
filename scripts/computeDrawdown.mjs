// 낙폭(전고점 대비 하락) 트래커 사전계산
// node scripts/computeDrawdown.mjs  →  public/drawdownTracker.json
//
// 각 인덱스(SPY/QQQ/DIA)의 전고점 대비 낙폭(drawdown)을 계산.
// -10%(조정)·-20%(베어)·-30%(폭락) 진입 후 30/60/90거래일 수익률 +
// "전고점 재돌파까지 걸린 기간"을 집계. 정보 제공용(매매 권유 아님).

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PRICES_DIR = join(ROOT, "data", "prices");
// 출력 위치: 기본은 앱 번들(public/). CI(데이터레포 main)에선 OUT_DIR=data/signals 지정
const OUT_DIR = process.env.OUT_DIR || join(ROOT, "public");
const OUTPUT = join(OUT_DIR, "drawdownTracker.json");

const INDICES = ["SPY", "QQQ", "DIA"];
const INDEX_NAMES = { SPY: "S&P 500", QQQ: "나스닥 100", DIA: "다우 30" };
const THRESHOLDS = [10, 20, 30]; // 낙폭 % (절대값)
const HORIZONS = [30, 60, 90];   // 거래일
const COOLDOWN = 60;             // 같은 하락 국면 재진입 병합 (거래일)

function loadCsv(ticker) {
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
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

const stats = {};
const events = {};
const current = {};
const series = {};

for (const sym of INDICES) {
  const prices = loadCsv(sym);
  const closes = prices.map((p) => p.close);
  const n = closes.length;

  // running ATH + 낙폭%
  const ath = [];
  const dd = [];
  let peak = -Infinity;
  for (let i = 0; i < n; i++) {
    if (closes[i] > peak) peak = closes[i];
    ath.push(peak);
    dd.push(((closes[i] - peak) / peak) * 100);
  }

  current[sym] = { price: +closes[n - 1].toFixed(2), ath: +ath[n - 1].toFixed(2), dd: +dd[n - 1].toFixed(1) };
  series[sym] = { dates: prices.map((p) => p.date), price: closes.map((c) => +c.toFixed(2)) };
  stats[sym] = {};
  events[sym] = {};

  for (const T of THRESHOLDS) {
    // 진입: 낙폭이 -T를 하향 돌파 (쿨다운 병합)
    const entries = [];
    let last = -Infinity;
    for (let i = 1; i < n; i++) {
      if (dd[i] <= -T && dd[i - 1] > -T) {
        if (i - last < COOLDOWN) continue;
        entries.push(i);
        last = i;
      }
    }

    const acc = HORIZONS.map(() => []);
    const recDays = [];
    const eps = [];
    for (const e of entries) {
      const prevPeak = ath[e];
      const fwd = {};
      HORIZONS.forEach((h, hi) => {
        if (e + h < n) {
          const r = ((closes[e + h] - closes[e]) / closes[e]) * 100;
          acc[hi].push({ ret: r, date: prices[e].date });
          fwd[h] = +r.toFixed(1);
        } else fwd[h] = null;
      });
      // 저점 + 전고점 재돌파까지
      let trough = closes[e], troughIdx = e, recIdx = -1;
      for (let j = e; j < n; j++) {
        if (closes[j] < trough) { trough = closes[j]; troughIdx = j; }
        if (closes[j] >= prevPeak) { recIdx = j; break; }
      }
      const recovered = recIdx >= 0;
      const rDays = recovered ? recIdx - e : null;
      if (recovered) recDays.push(rDays);
      eps.push({
        entryDate: prices[e].date,
        troughDd: +(((trough - prevPeak) / prevPeak) * 100).toFixed(1),
        troughDate: prices[troughIdx].date,
        recoveryDays: rDays,
        recovered,
        fwd,
      });
    }

    const horizons = {};
    HORIZONS.forEach((h, hi) => {
      const rows = acc[hi];
      if (!rows.length) { horizons[h] = { count: 0 }; return; }
      const rets = rows.map((r) => r.ret);
      const avg = rets.reduce((a, b) => a + b, 0) / rets.length;
      const wins = rets.filter((r) => r > 0).length;
      const worstRow = rows.reduce((m, r) => (r.ret < m.ret ? r : m), rows[0]);
      horizons[h] = {
        avg: +avg.toFixed(1),
        winRate: Math.round((wins / rets.length) * 100),
        count: rets.length,
        worst: { ret: +worstRow.ret.toFixed(1), year: worstRow.date.slice(0, 4) },
      };
    });

    // 회복 통계
    const longest = eps.filter((e) => e.recovered).reduce((m, e) => (e.recoveryDays > (m?.recoveryDays ?? -1) ? e : m), null);
    stats[sym][T] = {
      events: entries.length,
      horizons,
      recovery: {
        recoveredCount: recDays.length,
        ongoingCount: entries.length - recDays.length,
        avgDays: recDays.length ? Math.round(recDays.reduce((a, b) => a + b, 0) / recDays.length) : null,
        medianDays: median(recDays),
        maxDays: longest?.recoveryDays ?? null,
        maxYear: longest?.entryDate?.slice(0, 4) ?? null,
      },
    };
    events[sym][T] = eps.reverse(); // 최근 먼저
  }
}

const updated = series.SPY.dates[series.SPY.dates.length - 1];
const output = {
  updated,
  indices: INDICES,
  indexNames: INDEX_NAMES,
  thresholds: THRESHOLDS,
  horizons: HORIZONS,
  cooldownDays: COOLDOWN,
  dataStart: series.SPY.dates[0],
  current,
  stats,
  events,
  series,
};
writeFileSync(OUTPUT, JSON.stringify(output));

// 콘솔 요약 (정직 스토리 확인용)
console.log(`\n낙폭 트래커 · ${series.SPY.dates[0]} ~ ${updated}`);
for (const sym of INDICES) {
  console.log(`\n━━ ${sym} (${INDEX_NAMES[sym]}) · 현재 낙폭 ${current[sym].dd}% ━━`);
  for (const T of THRESHOLDS) {
    const s = stats[sym][T];
    const rec = s.recovery;
    const h90 = s.horizons["90"];
    const recTxt = rec.avgDays != null
      ? `회복 평균 ${rec.avgDays}거래일(~${Math.round(rec.avgDays / 21)}개월), 최장 ${rec.maxDays}일(${rec.maxYear}), 미회복 ${rec.ongoingCount}`
      : "회복표본 없음";
    const h90Txt = h90.count ? `90일 평균 ${h90.avg >= 0 ? "+" : ""}${h90.avg}%·승률 ${h90.winRate}%(최악 ${h90.worst.ret}% ${h90.worst.year})` : "90일 -";
    console.log(`  -${T}% 진입 ${s.events}회 | ${h90Txt} | ${recTxt}`);
  }
}
console.log(`\n✅ drawdownTracker.json 저장`);
