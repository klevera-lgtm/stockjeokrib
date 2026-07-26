// ── Trading Backtest Engine ─────────────────────────────────────────────────
// Computes MA / RSI / MACD / VIX strategy backtests from price arrays.
// Price format: [{ date: Date, close: number }] sorted ascending.

// ── Technical indicator helpers ─────────────────────────────────────────────

function sma(prices, period) {
  const result = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += prices[j].close;
    result.push(sum / period);
  }
  return result;
}

function ema(values, period) {
  const result = [];
  const k = 2 / (period + 1);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || v === undefined) { result.push(null); continue; }
    if (prev === null) { prev = v; result.push(v); continue; }
    prev = v * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

function calcRSI(prices, period = 14) {
  const result = new Array(prices.length).fill(null);
  if (prices.length < period + 1) return result;

  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i].close - prices[i - 1].close;
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i].close - prices[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

function calcMACD(prices, fast = 12, slow = 26, signal = 9) {
  const closes = prices.map(p => p.close);
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = emaFast.map((f, i) =>
    f !== null && emaSlow[i] !== null ? f - emaSlow[i] : null
  );
  const signalLine = ema(macdLine, signal);
  return { macdLine, signalLine };
}

// ── Filter prices by backtest period ────────────────────────────────────────

export function filterByPeriod(prices, years) {
  if (!prices.length) return [];
  const end = prices[prices.length - 1].date;
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - years);
  return prices.filter(p => p.date >= start);
}

// ── Convert daily prices to weekly ──────────────────────────────────────────

export function toWeekly(prices) {
  if (!prices.length) return [];
  const weeks = [];
  let weekStart = null;
  let weekClose = null;
  let weekDate = null;

  for (const p of prices) {
    const day = p.date.getDay();
    if (weekStart === null) {
      weekStart = p.date;
      weekClose = p.close;
      weekDate = p.date;
    }
    weekClose = p.close;
    weekDate = p.date;
    if (day === 5 || p === prices[prices.length - 1]) {
      weeks.push({ date: weekDate, close: weekClose });
      weekStart = null;
    }
  }
  return weeks;
}

// ── Buy & Hold baseline ─────────────────────────────────────────────────────

export function buyAndHold(prices) {
  if (prices.length < 2) return { returnPct: 0, mdd: 0 };
  const entry = prices[0].close;
  const exit = prices[prices.length - 1].close;
  let peak = entry, maxDD = 0;
  for (const p of prices) {
    if (p.close > peak) peak = p.close;
    const dd = (peak - p.close) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  return {
    returnPct: ((exit - entry) / entry) * 100,
    mdd: maxDD * 100,
  };
}

// ── Generic trade executor ──────────────────────────────────────────────────

function executeTrades(signals) {
  const trades = [];
  let entry = null;

  for (const s of signals) {
    if (s.action === "buy" && !entry) {
      entry = s;
    } else if ((s.action === "sell" || s.action === "stop") && entry) {
      const returnPct = ((s.price - entry.price) / entry.price) * 100;
      trades.push({
        entryDate: entry.date,
        entryPrice: entry.price,
        exitDate: s.date,
        exitPrice: s.price,
        returnPct,
        reason: s.action,
      });
      entry = null;
    }
  }

  if (entry) {
    const last = signals[signals.length - 1];
    if (last && last.action !== "buy") {
      trades.push({
        entryDate: entry.date,
        entryPrice: entry.price,
        exitDate: last.date,
        exitPrice: last.price,
        returnPct: ((last.price - entry.price) / entry.price) * 100,
        reason: "open",
      });
    }
  }

  return trades;
}

function summarizeTrades(trades, prices) {
  if (!trades.length) return {
    totalReturn: 0, winRate: 0, tradeCount: 0,
    mdd: 0, avgWin: 0, avgLoss: 0, trades: [],
  };

  const wins = trades.filter(t => t.returnPct > 0);
  const losses = trades.filter(t => t.returnPct <= 0);

  let equity = 1;
  let peak = 1;
  let maxDD = 0;
  for (const t of trades) {
    equity *= (1 + t.returnPct / 100);
    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  return {
    totalReturn: (equity - 1) * 100,
    winRate: (wins.length / trades.length) * 100,
    tradeCount: trades.length,
    mdd: maxDD * 100,
    avgWin: wins.length ? wins.reduce((s, t) => s + t.returnPct, 0) / wins.length : 0,
    avgLoss: losses.length ? losses.reduce((s, t) => s + t.returnPct, 0) / losses.length : 0,
    trades,
  };
}

// ── Strategy: Moving Average ────────────────────────────────────────────────

export function backtestMA(prices, period) {
  const ma = sma(prices, period);
  const signals = [];

  let inPosition = false;
  for (let i = 1; i < prices.length; i++) {
    if (ma[i] === null || ma[i - 1] === null) continue;
    const prev = prices[i - 1].close;
    const curr = prices[i].close;
    const prevMA = ma[i - 1];
    const currMA = ma[i];

    if (!inPosition && prev <= prevMA && curr > currMA) {
      signals.push({ date: prices[i].date, price: curr, action: "buy" });
      inPosition = true;
    } else if (inPosition && curr < currMA) {
      if (i + 1 < prices.length) {
        signals.push({ date: prices[i + 1].date, price: prices[i + 1].close, action: "sell" });
      } else {
        signals.push({ date: prices[i].date, price: curr, action: "sell" });
      }
      inPosition = false;
    }
  }

  return summarizeTrades(executeTrades(signals), prices);
}

// ── Strategy: Dual Moving Average Crossover ────────────────────────────────

export const DUAL_MA_COMBOS = [
  { short: 5,  long: 20,  label: "5/20 단기 교차" },
  { short: 10, long: 50,  label: "10/50 중기 교차" },
  { short: 20, long: 100, label: "20/100 중장기 교차" },
  { short: 50, long: 200, label: "골든크로스 (50/200)" },
];

export function backtestDualMA(prices, shortPeriod, longPeriod) {
  const maShort = sma(prices, shortPeriod);
  const maLong = sma(prices, longPeriod);
  const signals = [];

  let inPosition = false;
  for (let i = 1; i < prices.length; i++) {
    if (maShort[i] === null || maLong[i] === null ||
        maShort[i - 1] === null || maLong[i - 1] === null) continue;

    if (!inPosition && maShort[i - 1] <= maLong[i - 1] && maShort[i] > maLong[i]) {
      signals.push({ date: prices[i].date, price: prices[i].close, action: "buy" });
      inPosition = true;
    } else if (inPosition && maShort[i - 1] >= maLong[i - 1] && maShort[i] < maLong[i]) {
      signals.push({ date: prices[i].date, price: prices[i].close, action: "sell" });
      inPosition = false;
    }
  }

  return summarizeTrades(executeTrades(signals), prices);
}

// ── Strategy: RSI ───────────────────────────────────────────────────────────

export function backtestRSI(prices, { buyBelow = 30, sellAbove = 70, stopLoss = -10 } = {}) {
  const rsi = calcRSI(prices, 14);
  const signals = [];

  let inPosition = false;
  let entryPrice = 0;

  for (let i = 1; i < prices.length; i++) {
    if (rsi[i] === null) continue;
    const price = prices[i].close;

    if (!inPosition && rsi[i] < buyBelow) {
      signals.push({ date: prices[i].date, price, action: "buy" });
      inPosition = true;
      entryPrice = price;
    } else if (inPosition) {
      const pctChange = ((price - entryPrice) / entryPrice) * 100;
      if (pctChange <= stopLoss) {
        signals.push({ date: prices[i].date, price, action: "stop" });
        inPosition = false;
      } else if (rsi[i] > sellAbove) {
        signals.push({ date: prices[i].date, price, action: "sell" });
        inPosition = false;
      }
    }
  }

  return summarizeTrades(executeTrades(signals), prices);
}

// ── Strategy: MACD signal crossover ─────────────────────────────────────────

export function backtestMACD(prices) {
  const { macdLine, signalLine } = calcMACD(prices);
  const signals = [];

  let inPosition = false;
  for (let i = 1; i < prices.length; i++) {
    if (macdLine[i] === null || signalLine[i] === null ||
        macdLine[i - 1] === null || signalLine[i - 1] === null) continue;

    const prevDiff = macdLine[i - 1] - signalLine[i - 1];
    const currDiff = macdLine[i] - signalLine[i];

    if (!inPosition && prevDiff <= 0 && currDiff > 0) {
      signals.push({ date: prices[i].date, price: prices[i].close, action: "buy" });
      inPosition = true;
    } else if (inPosition && prevDiff >= 0 && currDiff < 0) {
      signals.push({ date: prices[i].date, price: prices[i].close, action: "sell" });
      inPosition = false;
    }
  }

  return summarizeTrades(executeTrades(signals), prices);
}

// ── Strategy: VIX ───────────────────────────────────────────────────────────

export function backtestVIX(stockPrices, vixPrices, { buyAbove = 30, sellBelow = 20, stopLoss = -10 } = {}) {
  const vixMap = new Map();
  for (const v of vixPrices) {
    vixMap.set(v.date.toISOString().slice(0, 10), v.close);
  }

  const signals = [];
  let inPosition = false;
  let entryPrice = 0;

  for (let i = 0; i < stockPrices.length; i++) {
    const dateKey = stockPrices[i].date.toISOString().slice(0, 10);
    const vix = vixMap.get(dateKey);
    if (vix === undefined) continue;

    const price = stockPrices[i].close;

    if (!inPosition && vix >= buyAbove) {
      signals.push({ date: stockPrices[i].date, price, action: "buy" });
      inPosition = true;
      entryPrice = price;
    } else if (inPosition) {
      const pctChange = ((price - entryPrice) / entryPrice) * 100;
      if (pctChange <= stopLoss) {
        signals.push({ date: stockPrices[i].date, price, action: "stop" });
        inPosition = false;
      } else if (vix < sellBelow) {
        signals.push({ date: stockPrices[i].date, price, action: "sell" });
        inPosition = false;
      }
    }
  }

  return summarizeTrades(executeTrades(signals), stockPrices);
}

// ── Current signal status (for scanner/portfolio) ───────────────────────────

export function currentMASignal(prices, period) {
  if (prices.length < period) return { status: "unknown", proximity: 0 };
  const ma = sma(prices, period);
  const last = prices.length - 1;
  const maVal = ma[last];
  if (maVal === null) return { status: "unknown", proximity: 0 };
  const price = prices[last].close;
  const proximity = ((price - maVal) / maVal) * 100;
  const prevAbove = prices[last - 1]?.close > ma[last - 1];
  const currAbove = price > maVal;
  let status = "대기";
  if (!prevAbove && currAbove) status = "조건 진입";
  else if (prevAbove && !currAbove) status = "조건 이탈";
  else if (currAbove) status = "조건 유지 중";
  return { status, proximity, maValue: maVal, price };
}

export function currentRSISignal(prices, { buyBelow = 30, sellAbove = 70 } = {}) {
  const rsi = calcRSI(prices, 14);
  const last = rsi.length - 1;
  if (rsi[last] === null) return { status: "unknown", rsi: null, proximity: 0 };
  const val = rsi[last];
  let status = "대기";
  if (val < buyBelow) status = "조건 진입";
  else if (val > sellAbove) status = "조건 이탈";
  const buyProx = val < 50 ? ((buyBelow - val) / buyBelow) * 100 : 0;
  const sellProx = val >= 50 ? ((val - sellAbove) / (100 - sellAbove)) * 100 : 0;
  return { status, rsi: val, proximity: val < 50 ? buyProx : sellProx };
}

export function currentMACDSignal(prices) {
  const { macdLine, signalLine } = calcMACD(prices);
  const last = prices.length - 1;
  if (last < 1 || macdLine[last] === null || signalLine[last] === null ||
      macdLine[last - 1] === null || signalLine[last - 1] === null)
    return { status: "unknown", histogram: 0, proximity: 0 };

  const histogram = macdLine[last] - signalLine[last];
  const prevHist = macdLine[last - 1] - signalLine[last - 1];

  let status = "대기";
  if (prevHist <= 0 && histogram > 0) status = "조건 진입";
  else if (prevHist >= 0 && histogram < 0) status = "조건 이탈";
  else if (histogram > 0) status = "조건 유지 중";

  return { status, histogram, macd: macdLine[last], signal: signalLine[last], proximity: histogram };
}

export function currentDualMASignal(prices, shortPeriod, longPeriod) {
  if (prices.length < longPeriod) return { status: "unknown", proximity: 0 };
  const maShort = sma(prices, shortPeriod);
  const maLong = sma(prices, longPeriod);
  const last = prices.length - 1;
  if (maShort[last] === null || maLong[last] === null ||
      maShort[last - 1] === null || maLong[last - 1] === null)
    return { status: "unknown", proximity: 0 };

  const gap = ((maShort[last] - maLong[last]) / maLong[last]) * 100;
  const prevAbove = maShort[last - 1] > maLong[last - 1];
  const currAbove = maShort[last] > maLong[last];

  let status = "대기";
  if (!prevAbove && currAbove) status = "조건 진입";
  else if (prevAbove && !currAbove) status = "조건 이탈";
  else if (currAbove) status = "조건 유지 중";

  return { status, proximity: gap, maShort: maShort[last], maLong: maLong[last], price: prices[last].close };
}

// ── Score a backtest result ─────────────────────────────────────────────────

export function scoreResult(result) {
  if (!result.tradeCount) return 0;
  const returnScore = Math.min(result.totalReturn, 200) / 2;
  const winScore = result.winRate * 0.5;
  const mddPenalty = Math.min(result.mdd, 50);
  return Math.max(0, Math.round(returnScore + winScore - mddPenalty));
}

// ── Strategy label helpers ──────────────────────────────────────────────────

export const MA_PERIODS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200];

export const RSI_COMBOS = [
  { buyBelow: 20, sellAbove: 70, stopLoss: -5 },
  { buyBelow: 20, sellAbove: 70, stopLoss: -10 },
  { buyBelow: 20, sellAbove: 80, stopLoss: -5 },
  { buyBelow: 20, sellAbove: 80, stopLoss: -10 },
  { buyBelow: 30, sellAbove: 70, stopLoss: -5 },
  { buyBelow: 30, sellAbove: 70, stopLoss: -10 },
  { buyBelow: 30, sellAbove: 80, stopLoss: -5 },
  { buyBelow: 30, sellAbove: 80, stopLoss: -10 },
];

export const VIX_COMBOS = [
  { buyAbove: 30, sellBelow: 20, stopLoss: -5 },
  { buyAbove: 30, sellBelow: 20, stopLoss: -10 },
  { buyAbove: 40, sellBelow: 20, stopLoss: -5 },
  { buyAbove: 40, sellBelow: 20, stopLoss: -10 },
];

// ── Strategy: Combo (AND entry, OR exit) ───────────────────────────────────

export const COMBO_PRESETS = [
  { id: "ma-rsi",      label: "MA + RSI",           indicators: ["ma", "rsi"] },
  { id: "ma-macd",     label: "MA + MACD",          indicators: ["ma", "macd"] },
  { id: "rsi-macd",    label: "RSI + MACD",         indicators: ["rsi", "macd"] },
  { id: "ma-rsi-macd", label: "MA + RSI + MACD",    indicators: ["ma", "rsi", "macd"] },
];

const COMBO_LOOKBACK = 5;

export function backtestCombo(prices, { indicators, stopLoss = -10 }) {
  const hasMa = indicators.some(i => i.type === "ma");
  const hasRsi = indicators.some(i => i.type === "rsi");
  const hasMacd = indicators.some(i => i.type === "macd");

  const maParams = indicators.find(i => i.type === "ma")?.params || {};
  const rsiParams = indicators.find(i => i.type === "rsi")?.params || {};

  const maData = hasMa ? sma(prices, maParams.period || 50) : null;
  const rsiData = hasRsi ? calcRSI(prices, 14) : null;
  const macdData = hasMacd ? calcMACD(prices) : null;

  const buyBelow = rsiParams.buyBelow || 30;
  const sellAbove = rsiParams.sellAbove || 70;

  function recentlyActive(checkFn, idx) {
    for (let j = Math.max(0, idx - COMBO_LOOKBACK); j <= idx; j++) {
      if (checkFn(j)) return true;
    }
    return false;
  }

  const signals = [];
  let inPosition = false;
  let entryPrice = 0;

  for (let i = 1; i < prices.length; i++) {
    const price = prices[i].close;

    if (!inPosition) {
      let allBuy = true;

      if (hasMa) {
        const ok = recentlyActive(j => maData[j] !== null && prices[j].close > maData[j], i);
        if (!ok) allBuy = false;
      }
      if (hasRsi) {
        const ok = recentlyActive(j => rsiData[j] !== null && rsiData[j] < buyBelow, i);
        if (!ok) allBuy = false;
      }
      if (hasMacd) {
        const ok = recentlyActive(j =>
          j > 0 && macdData.macdLine[j] !== null && macdData.signalLine[j] !== null &&
          macdData.macdLine[j - 1] !== null && macdData.signalLine[j - 1] !== null &&
          (macdData.macdLine[j - 1] - macdData.signalLine[j - 1]) <= 0 &&
          (macdData.macdLine[j] - macdData.signalLine[j]) > 0, i);
        if (!ok) allBuy = false;
      }

      if (allBuy) {
        signals.push({ date: prices[i].date, price, action: "buy" });
        inPosition = true;
        entryPrice = price;
      }
    } else {
      const pctChange = ((price - entryPrice) / entryPrice) * 100;
      if (pctChange <= stopLoss) {
        signals.push({ date: prices[i].date, price, action: "stop" });
        inPosition = false;
        continue;
      }

      let anySell = false;
      if (hasMa && maData[i] !== null && price < maData[i]) anySell = true;
      if (hasRsi && rsiData[i] !== null && rsiData[i] > sellAbove) anySell = true;
      if (hasMacd && macdData.macdLine[i] !== null && macdData.signalLine[i] !== null &&
          macdData.macdLine[i - 1] !== null && macdData.signalLine[i - 1] !== null) {
        const prevDiff = macdData.macdLine[i - 1] - macdData.signalLine[i - 1];
        const currDiff = macdData.macdLine[i] - macdData.signalLine[i];
        if (prevDiff >= 0 && currDiff < 0) anySell = true;
      }

      if (anySell) {
        signals.push({ date: prices[i].date, price, action: "sell" });
        inPosition = false;
      }
    }
  }

  return summarizeTrades(executeTrades(signals), prices);
}

export function comboLabel(indicators, stopLoss) {
  const parts = indicators.map(i => {
    if (i.type === "ma") return `MA${i.params.period}`;
    if (i.type === "rsi") return `RSI${i.params.buyBelow}/${i.params.sellAbove}`;
    if (i.type === "macd") return "MACD";
    return i.type;
  });
  return `${parts.join(" + ")} (손절 ${stopLoss}%)`;
}

export function strategyLabel(type, params) {
  switch (type) {
    case "ma":    return `${params.period}일 이동평균선`;
    case "rsi":   return `RSI ${params.buyBelow}/${params.sellAbove} (손절 ${params.stopLoss}%)`;
    case "dualma": return `${params.short}/${params.long} 이중이평선`;
    case "macd":  return "MACD 시그널 교차";
    case "combo": return params._comboLabel || "조합 전략";
    case "vix":   return `VIX ${params.buyAbove}↑ 매수 / ${params.sellBelow}↓ 매도 (손절 ${params.stopLoss}%)`;
    default:      return type;
  }
}

export const BACKTEST_PERIODS = [
  { label: "1년", years: 1 },
  { label: "2년", years: 2 },
  { label: "3년", years: 3 },
  { label: "10년", years: 10 },
];
