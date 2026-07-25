import { loadSimData, loadDividendMeta } from "./dividendData.js";

const KRW_USD = 1380;
const TRADING_DAYS_PER_MONTH = 21;

export async function runDividendSim(ticker, monthlyKRW, periodYears, drip = true) {
  const sim = await loadSimData(ticker);
  const periodData = sim.periods[String(periodYears)];
  if (!periodData) return null;

  const scenario = drip ? periodData.drip : periodData.noDrip;
  if (!scenario) return null;

  const dailyKRW = monthlyKRW / TRADING_DAYS_PER_MONTH;
  const dailyUSD = dailyKRW / KRW_USD;
  const scale = dailyUSD / sim.baseDailyUSD;

  const pv = scenario.portfolioValues.map((p) => ({
    date: p[0],
    value: p[1] * scale * KRW_USD,
    invested: p[2] * scale * KRW_USD,
    shares: p[3] * scale,
  }));

  const last = pv.at(-1);

  const meta = await loadDividendMeta();
  const tickerMeta = meta[ticker];
  const ttmDividend = tickerMeta?.ttmDividend ?? 0;
  const currentYield = tickerMeta?.currentYield ?? 0;

  const monthlyDivUSD = (ttmDividend * last.shares) / 12;
  const monthlyDivKRW = monthlyDivUSD * KRW_USD;
  const annualDivKRW = monthlyDivKRW * 12;

  return {
    ticker,
    drip,
    periodYears,
    totalInvested: last.invested,
    finalValue: last.value,
    totalReturn: scenario.totalReturn,
    cagr: scenario.cagr,
    years: (new Date(scenario.lastDate) - new Date(scenario.firstDate)) / (365.25 * 86400000),
    totalShares: last.shares,
    totalDividendsUSD: scenario.totalDividendsUSD * scale,
    totalDividendsKRW: scenario.totalDividendsUSD * scale * KRW_USD,
    monthlyDivKRW,
    annualDivKRW,
    currentYield,
    portfolioValues: pv,
    dailyKRW: Math.round(dailyKRW),
  };
}
