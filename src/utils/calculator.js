// ── Moving average ──────────────────────────────────────────────────────────
export function calcSMA(prices, period) {
  const closes = prices.map((p) => p.close);
  const sma = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { sma.push(null); continue; }
    const slice = closes.slice(i - period + 1, i + 1);
    sma.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return sma;
}

// ── RSI ─────────────────────────────────────────────────────────────────────
export function calcRSI(prices, period = 14) {
  const closes = prices.map((p) => p.close);
  const rsi = new Array(closes.length).fill(null);
  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gainSum += diff; else lossSum += Math.abs(diff);
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

// ── MDD ─────────────────────────────────────────────────────────────────────
export function calcMDD(values) {
  let peak = -Infinity, mdd = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    const dd = (v - peak) / peak;
    if (dd < mdd) mdd = dd;
  }
  return mdd; // negative fraction, e.g. -0.35
}

// ── Sharpe ──────────────────────────────────────────────────────────────────
export function calcSharpe(portfolioValues, riskFreeRate = 0.04) {
  const returns = [];
  for (let i = 1; i < portfolioValues.length; i++) {
    if (portfolioValues[i - 1] === 0) continue;
    returns.push((portfolioValues[i] - portfolioValues[i - 1]) / portfolioValues[i - 1]);
  }
  if (returns.length === 0) return 0;
  const meanR = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - meanR) ** 2, 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  const annualMean = meanR * 252;
  const annualStd = stdDev * Math.sqrt(252);
  return (annualMean - riskFreeRate) / annualStd;
}

// ── CAGR ─────────────────────────────────────────────────────────────────────
export function calcCAGR(startValue, endValue, years) {
  if (startValue <= 0 || years <= 0) return 0;
  return Math.pow(endValue / startValue, 1 / years) - 1;
}

// ── Accumulation-pool runner (condition-based strategies) ────────────────────
// Each trading day adds monthlyAmount/21 to a virtual pool.
// When conditionFn returns true, the entire pool is deployed and reset.
// This ensures fair monthly budget comparison across all strategies.
function _runWithPool(filtered, strategy, monthlyAmount, conditionFn) {
  const dailyAmount = monthlyAmount / 21;
  let pool = 0;
  let totalInvested = 0;
  let shares = 0;
  const portfolioValues = [];

  for (let i = 0; i < filtered.length; i++) {
    const p = filtered[i];
    pool += dailyAmount;

    if (conditionFn(p, i) && p.close > 0 && pool > 0) {
      shares += pool / p.close;
      totalInvested += pool;
      pool = 0;
    }

    portfolioValues.push({ date: p.date, value: shares * p.close, invested: totalInvested });
  }

  const finalValue = portfolioValues.at(-1)?.value ?? 0;
  const totalReturn = totalInvested > 0 ? (finalValue - totalInvested) / totalInvested : 0;
  const years = (filtered.at(-1).date - filtered[0].date) / (365.25 * 24 * 3600 * 1000);
  const cagr = calcCAGR(totalInvested, finalValue, years);
  const mdd = calcMDD(portfolioValues.map((v) => v.value));
  const sharpe = calcSharpe(portfolioValues.map((v) => v.value));

  return { strategy, totalInvested, finalValue, totalReturn, cagr, mdd, sharpe, portfolioValues, years };
}

// ── Strategy runner ──────────────────────────────────────────────────────────
// strategies: 'daily' | 'weekly-fri' | 'monthly-first' | 'monthly-15' |
//             'monthly-last' | 'ma10' | 'ma50' | 'ma100' | 'ma200' |
//             'drop3' | 'drop5' | 'rsi20' | 'rsi30'
export function runStrategy(prices, strategy, monthlyAmount, startDate, endDate) {
  const filtered = prices.filter((p) => {
    const d = p.date;
    return d >= startDate && d <= (endDate ?? new Date());
  });

  if (filtered.length < 2) return null;

  // MA strategies — accumulation pool
  if (strategy.startsWith("ma")) {
    const period = parseInt(strategy.replace("ma", ""), 10);
    const allSMA = calcSMA(prices, period);
    const smaMap = new Map();
    prices.forEach((p, i) => smaMap.set(p.date.toISOString().slice(0, 10), allSMA[i]));
    return _runWithPool(filtered, strategy, monthlyAmount, (p) => {
      const smaVal = smaMap.get(p.date.toISOString().slice(0, 10));
      return smaVal != null && p.close < smaVal;
    });
  }

  // RSI strategies — accumulation pool
  if (strategy.startsWith("rsi")) {
    const threshold = parseInt(strategy.replace("rsi", ""), 10);
    const allRSI = calcRSI(prices, 14);
    const rsiMap = new Map();
    prices.forEach((p, i) => rsiMap.set(p.date.toISOString().slice(0, 10), allRSI[i]));
    return _runWithPool(filtered, strategy, monthlyAmount, (p) => {
      const rsiVal = rsiMap.get(p.date.toISOString().slice(0, 10));
      return rsiVal != null && rsiVal < threshold;
    });
  }

  // Drop strategies — accumulation pool
  if (strategy === "drop3" || strategy === "drop5") {
    const pct = strategy === "drop3" ? 0.03 : 0.05;
    return _runWithPool(filtered, strategy, monthlyAmount, (p, i) => {
      if (i === 0) return false;
      const prev = filtered[i - 1];
      return (p.close - prev.close) / prev.close <= -pct;
    });
  }

  // Time-based strategies
  // weekly-fri: monthlyAmount * 12/52 ≈ monthlyAmount / 4.33 per Friday
  const dailyAmount = monthlyAmount / 21;
  const weeklyAmount = monthlyAmount * 12 / 52;

  let totalInvested = 0;
  let shares = 0;
  const portfolioValues = [];

  for (let i = 0; i < filtered.length; i++) {
    const p = filtered[i];
    const prev = filtered[i - 1];
    let buy = false;
    let investAmt = 0;

    switch (strategy) {
      case "daily":
        buy = true;
        investAmt = dailyAmount;
        break;
      case "weekly-fri":
        buy = p.date.getDay() === 5;
        investAmt = weeklyAmount;
        break;
      case "monthly-first":
        buy = i === 0 || p.date.getMonth() !== prev.date.getMonth();
        investAmt = monthlyAmount;
        break;
      case "monthly-15": {
        const day = p.date.getDate();
        const prevDay = prev ? prev.date.getDate() : -1;
        buy = day >= 15 && (i === 0 || prevDay < 15 || p.date.getMonth() !== prev.date.getMonth());
        investAmt = monthlyAmount;
        break;
      }
      case "monthly-last": {
        const nextP = filtered[i + 1];
        buy = !nextP || nextP.date.getMonth() !== p.date.getMonth();
        investAmt = monthlyAmount;
        break;
      }
      default:
        buy = false;
    }

    if (buy && p.close > 0 && investAmt > 0) {
      shares += investAmt / p.close;
      totalInvested += investAmt;
    }

    portfolioValues.push({ date: p.date, value: shares * p.close, invested: totalInvested });
  }

  const finalValue = portfolioValues.at(-1)?.value ?? 0;
  const totalReturn = totalInvested > 0 ? (finalValue - totalInvested) / totalInvested : 0;
  const years = (filtered.at(-1).date - filtered[0].date) / (365.25 * 24 * 3600 * 1000);
  const cagr = calcCAGR(totalInvested, finalValue, years);
  const mdd = calcMDD(portfolioValues.map((v) => v.value));
  const sharpe = calcSharpe(portfolioValues.map((v) => v.value));

  return { strategy, totalInvested, finalValue, totalReturn, cagr, mdd, sharpe, portfolioValues, years };
}

export const STRATEGY_LABELS = {
  "daily":         "매일 적립",
  "weekly-fri":    "매주 금요일",
  "monthly-first": "매월 첫 거래일",
  "monthly-15":    "매월 15일",
  "monthly-last":  "매월 마지막 거래일",
  "ma10":          "MA10 아래일 때만",
  "ma50":          "MA50 아래일 때만",
  "ma100":         "MA100 아래일 때만",
  "ma200":         "MA200 아래일 때만",
  "drop3":         "전일 대비 -3% 이상 하락 시",
  "drop5":         "전일 대비 -5% 이상 하락 시",
  "rsi20":         "RSI(14) 20 이하일 때만",
  "rsi30":         "RSI(14) 30 이하일 때만",
};

export const ALL_STRATEGIES = Object.keys(STRATEGY_LABELS);

export function formatKRW(val) {
  if (val == null || isNaN(val)) return "-";
  if (Math.abs(val) >= 1e8) return `${(val / 1e8).toFixed(1)}억원`;
  if (Math.abs(val) >= 1e4) return `${Math.round(val / 1e4).toLocaleString()}만원`;
  return `${Math.round(val).toLocaleString()}원`;
}

export function formatPct(val) {
  if (val == null || isNaN(val)) return "-";
  return `${(val * 100).toFixed(1)}%`;
}
