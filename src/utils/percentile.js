// 백분위 비교 — 같은 기간 전체 자산(매월 적립 기준) CAGR 분포 대비 내 성과
let distPromise = null;

export function loadCagrDistribution() {
  if (!distPromise) {
    distPromise = fetch("/cagrDistribution.json")
      .then((r) => r.json())
      .catch(() => null);
  }
  return distPromise;
}

export async function calcPercentile(years, cagr) {
  if (!isFinite(years) || years <= 0 || !isFinite(cagr)) return null;
  const dist = await loadCagrDistribution();
  if (!dist?.periods) return null;

  const targetMonths = years * 12;
  let best = null;
  for (const { months, cagrs } of Object.values(dist.periods)) {
    if (!cagrs?.length) continue;
    if (!best || Math.abs(months - targetMonths) < Math.abs(best.months - targetMonths)) {
      best = { months, cagrs };
    }
  }
  if (!best || best.cagrs.length < 10) return null;
  // 기간 차이가 40% 넘으면 비교가 무의미
  if (Math.abs(best.months - targetMonths) > Math.max(1.5, targetMonths * 0.4)) return null;

  const beat = best.cagrs.filter((c) => c < cagr).length;
  const topPct = Math.max(1, Math.round((1 - beat / best.cagrs.length) * 100));
  return { topPct, beat, total: best.cagrs.length };
}
