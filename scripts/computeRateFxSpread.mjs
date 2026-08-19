// 금리차 ↔ 환율 사전계산
// node scripts/computeRateFxSpread.mjs  →  public/rateFxSpread.json
//
// 한국 국고채3년(한국은행 ECOS, 일별) − 미국 국채3년(FRED DGS3, 일별) = 금리차,
// 원/달러 매매기준율(ECOS 731Y001, 당일)와 오버레이. 이론(자본이동)대로 금리차 낮을수록 환율↑.
// + 미국 장단기 금리차(FRED T10Y2Y, 10년−2년) — 경기 참고 신호(환율 예측 아님).
// 정직: 상관계수를 실제로 계산해 함께 보여주고, "금리차만이 요인 아님" 명시.
// ⚠️ 정보 제공용, 예측/매매 권유 아님.
//
// ECOS_API_KEY 환경변수 필요(없으면 sample — 구간 제한). CI 시크릿에서 주입.

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = process.env.OUT_DIR || join(ROOT, "public");
const OUTPUT = join(OUT_DIR, "rateFxSpread.json");
const KEY = process.env.ECOS_API_KEY || "sample";

const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const START = "20100101";

// 재시도 + UA + 타임아웃 (CI 러너의 간헐적 네트워크 실패 대응)
async function fetchRetry(url, { json = false, tries = 3, timeout = 30000 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeout);
      const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (stockjeokrib-ci)" } });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return json ? await res.json() : await res.text();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw lastErr;
}

async function fredDaily(id) {
  const text = await fetchRetry(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`);
  const m = {};
  for (const line of text.trim().split(/\r?\n/).slice(1)) {
    const [d, v] = line.split(",");
    const val = parseFloat(v);
    if (d && !isNaN(val)) m[d] = val;
  }
  return m;
}

async function ecosDaily(statCode, item) {
  const url = `https://ecos.bok.or.kr/api/StatisticSearch/${KEY}/json/kr/1/10000/${statCode}/D/${START}/${today}/${item}`;
  const j = await fetchRetry(url, { json: true });
  const rows = j?.StatisticSearch?.row || [];
  const m = {};
  for (const r of rows) {
    const t = r.TIME; // YYYYMMDD
    const val = parseFloat(r.DATA_VALUE);
    if (t?.length === 8 && !isNaN(val)) m[`${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`] = val;
  }
  return m;
}

try {
const [kr3, us3, fx, term] = await Promise.all([
  ecosDaily("817Y002", "010200000"), // 국고채(3년) 일별
  fredDaily("DGS3"),                  // 미국 국채 3년
  ecosDaily("731Y001", "0000001"),   // 원/달러 매매기준율 (당일 — 매일 갱신)
  fredDaily("T10Y2Y"),               // 미국 장단기 금리차(10년−2년) · 경기 참고
]);

if (Object.keys(kr3).length === 0) {
  console.warn("ECOS 국고채3년 0행 — 스킵(기존 JSON 유지). KEY=" + (KEY === "sample" ? "sample" : "설정됨"));
  process.exit(0);
}

// 공통 날짜 정렬
const dates = Object.keys(kr3).filter((d) => us3[d] != null && fx[d] != null).sort();
const series = { dates: [], diff: [], fx: [] };
const dailyDiff = [], dailyFx = [];
for (const d of dates) {
  const diff = +(kr3[d] - us3[d]).toFixed(2);
  dailyDiff.push(diff); dailyFx.push(fx[d]);
}
// 차트용 주 1회 다운샘플
for (let i = 0; i < dates.length; i += 5) {
  series.dates.push(dates[i]);
  series.diff.push(+(kr3[dates[i]] - us3[dates[i]]).toFixed(2));
  series.fx.push(+fx[dates[i]].toFixed(1));
}

// 상관계수 (일별 전체)
function corr(a, b) {
  const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) { cov += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
  return +(cov / Math.sqrt(va * vb)).toFixed(3);
}
const r = corr(dailyDiff, dailyFx);

// 미국 장단기 금리차(10년−2년) — 경기 참고 신호 (환율 예측 아님). 2010년 이후만.
let termSpread = null;
const tdates = Object.keys(term).filter((d) => d >= "2010-01-01").sort();
if (tdates.length) {
  const ts = { dates: [], values: [] };
  for (let i = 0; i < tdates.length; i += 5) {
    ts.dates.push(tdates[i]);
    ts.values.push(+term[tdates[i]].toFixed(2));
  }
  const tLast = tdates[tdates.length - 1];
  const tVal = +term[tLast].toFixed(2);
  const tStatus = tVal < 0 ? "역전" : tVal < 0.25 ? "평탄" : "정상";
  termSpread = { current: { date: tLast, value: tVal, status: tStatus }, series: ts };
}

// 현재 스냅샷: 공통 날짜에 묶지 않고 '각 지표의 가장 최근 가용값'을 씀.
// (환율·한국금리는 당일 발표, 미국금리 FRED는 T-1~2 지연 → 최신값 fwd-fill)
// → 환율이 미국금리 지연에 발목 잡혀 며칠 전으로 굳던 문제 해결. 매일 전진.
const fxLast = Object.keys(fx).sort().pop();
const krCur = Object.keys(kr3).filter((d) => d <= fxLast).sort().pop();
const usCur = Object.keys(us3).filter((d) => d <= fxLast).sort().pop();
const output = {
  updated: fxLast,
  startDate: dates[0],
  correlation: r,
  current: {
    date: fxLast,
    krRate: +kr3[krCur].toFixed(2),
    usRate: +us3[usCur].toFixed(2),
    diff: +(kr3[krCur] - us3[usCur]).toFixed(2),
    fx: +fx[fxLast].toFixed(1),
    rateDate: usCur, // 금리차 기준일(미국금리 최신 발표일) — 환율일과 다를 수 있음
  },
  series,
  termSpread,
  note: "한국 국고채3년 − 미국 국채3년(금리차) vs 원/달러 · 정보 제공용 · 예측 아님",
};
writeFileSync(OUTPUT, JSON.stringify(output));

console.log(`\n=== 금리차 ↔ 환율 (${dates[0]} ~ ${fxLast}, ${dates.length}일) ===`);
console.log(`상관계수 r = ${r}`);
console.log(`현재(환율 ${fxLast} · 금리차 ${usCur}): 한국3년 ${output.current.krRate}% · 미국3년 ${output.current.usRate}% · 금리차 ${output.current.diff}%p · 환율 ${output.current.fx}`);
console.log(`차트 포인트: ${series.dates.length}`);
if (termSpread) console.log(`장단기차(10Y−2Y): ${termSpread.current.value}%p (${termSpread.current.status}) · ${termSpread.series.dates.length}pt`);
console.log(`\n✅ rateFxSpread.json 저장`);
} catch (e) {
  console.warn("rateFxSpread 실패 — 스킵(기존 JSON 유지):", e.message);
  process.exit(0);
}
