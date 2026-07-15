import { runStrategy, calcMDD, calcSharpe } from "./calculator.js";
import { loadPrices } from "./dataLoader.js";

const cache = new Map();

export function getCachedComboResult(key) {
  return cache.get(key) ?? null;
}

function periodKeyToStart(periodKey) {
  const d = new Date();
  const n = parseInt(periodKey, 10);
  if (periodKey.endsWith("mo")) d.setMonth(d.getMonth() - n);
  else d.setFullYear(d.getFullYear() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function computeComboResult(tickers, strategies, weights, monthlyAmount, startDateStr) {
  const startDate = new Date(startDateStr + "-01");
  const endDate = new Date();

  const allPrices = {};
  await Promise.all(tickers.map(async (t) => { allPrices[t] = await loadPrices(t); }));

  const strategyMap = {};
  tickers.forEach((t, i) => { strategyMap[t] = strategies[i] ?? "monthly-first"; });

  const perTicker = {};
  tickers.forEach((t) => {
    const pct = (weights[t] ?? 0) / 100;
    perTicker[t] = runStrategy(allPrices[t], strategyMap[t], monthlyAmount * pct, startDate, endDate);
  });

  // Build per-ticker lookup maps (date string → last entry on/before that date)
  const tickerMaps = {};
  tickers.forEach((t) => {
    const pv = perTicker[t]?.portfolioValues ?? [];
    const m = new Map();
    pv.forEach((v) => m.set(v.date.toISOString().slice(0, 10), v));
    tickerMaps[t] = m;
  });

  const allDates = new Set();
  tickers.forEach((t) => {
    (perTicker[t]?.portfolioValues ?? []).forEach((v) =>
      allDates.add(v.date.toISOString().slice(0, 10))
    );
  });
  const sortedDates = [...allDates].sort();

  // Track last-seen entry per ticker for O(n) portfolio combination
  const lastEntry = {};
  tickers.forEach((t) => { lastEntry[t] = null; });

  const portfolioValues = sortedDates.map((d) => {
    let value = 0, invested = 0;
    tickers.forEach((t) => {
      if (tickerMaps[t].has(d)) lastEntry[t] = tickerMaps[t].get(d);
      if (lastEntry[t]) { value += lastEntry[t].value; invested += lastEntry[t].invested; }
    });
    return { date: new Date(d), value, invested };
  });

  const finalValue = portfolioValues.at(-1)?.value ?? 0;
  const totalInvested = Object.values(perTicker).reduce((sum, r) => sum + (r?.totalInvested ?? 0), 0);
  const totalReturn = totalInvested > 0 ? (finalValue - totalInvested) / totalInvested : 0;
  const mdd = calcMDD(portfolioValues.map((v) => v.value));
  const sharpe = calcSharpe(portfolioValues.map((v) => v.value));

  return {
    allocs: tickers.map((t) => ({ ticker: t, pct: weights[t] })),
    strategyMap,
    useAutoStrategy: false,
    fromCombo: true,
    totalInvested,
    finalValue,
    totalReturn,
    mdd,
    sharpe,
    portfolioValues,
    period: `${startDateStr} ~ 현재`,
  };
}

const FREE_LONG = ["6yr", "7yr", "8yr", "9yr", "10yr"];

export async function precomputeFeaturedCombos(data, monthlyAmount = 300000) {
  for (const periodKey of FREE_LONG) {
    for (const lKey of ["without", "with"]) {
      const combo = data.combos?.[periodKey]?.[lKey];
      if (!combo || combo.tickers.length === 0) continue;

      const cacheKey = `${periodKey}-${lKey}`;
      if (cache.has(cacheKey)) continue;

      try {
        const n = combo.tickers.length;
        const eq = Math.floor(100 / n);
        const rem = 100 - eq * n;
        const weights = {};
        combo.tickers.forEach((t, i) => { weights[t] = i === 0 ? eq + rem : eq; });

        const result = await computeComboResult(
          combo.tickers, combo.strategies, weights, monthlyAmount, periodKeyToStart(periodKey)
        );
        cache.set(cacheKey, result);
      } catch {
        // 조용히 실패 — 클릭 시 일반 계산으로 fallback
      }

      // 이벤트 루프에 양보해서 UI 블로킹 방지
      await new Promise((r) => setTimeout(r, 0));
    }
  }
}
