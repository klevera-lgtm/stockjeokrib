// 금리차 ↔ 환율 사전계산
// node scripts/computeRateFxSpread.mjs  →  public/rateFxSpread.json
//
// 한국 국고채3년(한국은행 ECOS, 일별) − 미국 국채3년(FRED DGS3, 일별) = 금리차,
// 원/달러(FRED DEXKOUS)와 오버레이. 이론(자본이동)대로 금리차 낮을수록 환율↑.
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
const [kr3, us3, fx] = await Promise.all([
  ecosDaily("817Y002", "010200000"), // 국고채(3년) 일별
  fredDaily("DGS3"),                  // 미국 국채 3년
  fredDaily("DEXKOUS"),               // 원/달러
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

const lastD = dates[dates.length - 1];
const output = {
  updated: lastD,
  startDate: dates[0],
  correlation: r,
  current: {
    date: lastD,
    krRate: +kr3[lastD].toFixed(2),
    usRate: +us3[lastD].toFixed(2),
    diff: +(kr3[lastD] - us3[lastD]).toFixed(2),
    fx: +fx[lastD].toFixed(1),
  },
  series,
  note: "한국 국고채3년 − 미국 국채3년(금리차) vs 원/달러 · 정보 제공용 · 예측 아님",
};
writeFileSync(OUTPUT, JSON.stringify(output));

console.log(`\n=== 금리차 ↔ 환율 (${dates[0]} ~ ${lastD}, ${dates.length}일) ===`);
console.log(`상관계수 r = ${r}`);
console.log(`현재: 한국3년 ${output.current.krRate}% · 미국3년 ${output.current.usRate}% · 금리차 ${output.current.diff}%p · 환율 ${output.current.fx}`);
console.log(`차트 포인트: ${series.dates.length}`);
console.log(`\n✅ rateFxSpread.json 저장`);
} catch (e) {
  console.warn("rateFxSpread 실패 — 스킵(기존 JSON 유지):", e.message);
  process.exit(0);
}
