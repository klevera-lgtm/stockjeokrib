import { loadPrices } from "./dataLoader.js";
import { runStrategy, ALL_STRATEGIES } from "./calculator.js";
import { calcSMA, calcRSI } from "./calculator.js";
import {
  filterByPeriod, rankAllStrategies,
  currentMASignal, currentRSISignal, currentMACDSignal, currentDualMASignal, currentBollingerSignal,
} from "./tradingEngine.js";

// 적립 조건 라벨 (MyPortfolio와 동일)
export const ACC_COND_LABELS = {
  "daily":         "매일 적립",
  "weekly-fri":    "매주 금요일 적립",
  "monthly-first": "매달 첫 거래일 적립",
  "monthly-15":    "매달 15일 전후 적립",
  "monthly-last":  "매달 마지막 거래일 적립",
  "ma10":          "10일 이평선 아래일 때",
  "ma50":          "50일 이평선 아래일 때",
  "ma100":         "100일 이평선 아래일 때",
  "ma200":         "200일 이평선 아래일 때",
  "drop3":         "전일 대비 3% 하락 시",
  "drop5":         "전일 대비 5% 하락 시",
  "rsi20":         "RSI 20 이하일 때",
  "rsi30":         "RSI 30 이하일 때",
};

function findBestAccStrategy(prices, years) {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - years);
  const results = ALL_STRATEGIES
    .map((s) => runStrategy(prices, s, 300000, start, end))
    .filter(Boolean);
  if (results.length === 0) return { strategy: "monthly-first", cagr: 0 };
  results.sort((a, b) => b.cagr - a.cagr);
  return { strategy: results[0].strategy, cagr: results[0].cagr };
}

function checkAccCondition(prices, strategy) {
  if (prices.length < 2) return false;
  const last = prices[prices.length - 1];
  const prev = prices[prices.length - 2];
  if (strategy.startsWith("ma")) {
    const period = parseInt(strategy.replace("ma", ""), 10);
    const sma = calcSMA(prices, period);
    const lastSMA = sma[sma.length - 1];
    return lastSMA != null && last.close < lastSMA;
  }
  if (strategy.startsWith("rsi")) {
    const threshold = parseInt(strategy.replace("rsi", ""), 10);
    const rsi = calcRSI(prices, 14);
    const lastRSI = rsi[rsi.length - 1];
    return lastRSI != null && lastRSI < threshold;
  }
  if (strategy === "drop3") return (last.close - prev.close) / prev.close <= -0.03;
  if (strategy === "drop5") return (last.close - prev.close) / prev.close <= -0.05;
  if (strategy === "daily") return true;
  if (strategy === "weekly-fri") return last.date.getDay() === 5;
  if (strategy === "monthly-first") return last.date.getMonth() !== prev.date.getMonth();
  if (strategy === "monthly-15") return last.date.getDate() >= 15 && prev.date.getDate() < 15;
  if (strategy === "monthly-last") {
    const daysInMonth = new Date(last.date.getFullYear(), last.date.getMonth() + 1, 0).getDate();
    return last.date.getDate() >= daysInMonth - 2;
  }
  return false;
}

function getTradeSignal(prices, type, params) {
  if (type === "ma") return currentMASignal(prices, params.period);
  if (type === "rsi") return currentRSISignal(prices, params);
  if (type === "dualma") return currentDualMASignal(prices, params.short, params.long);
  if (type === "macd") return currentMACDSignal(prices);
  if (type === "bollinger") return currentBollingerSignal(prices, params);
  return { status: "대기", proximity: 0 };
}

// 종목 하나에 대해 적립·거래 상태를 계산. 가격은 1회만 로드.
export async function monitorStock(ticker) {
  let prices;
  try { prices = await loadPrices(ticker); }
  catch { return { ticker, error: true }; }
  if (!prices?.length) return { ticker, error: true };

  const lastPrice = prices[prices.length - 1]?.close ?? null;

  // 적립: 최근 5년 최적 DCA 전략 + 오늘 조건 충족 여부
  let acc = null;
  try {
    const best = findBestAccStrategy(prices, 5);
    acc = {
      strategy: best.strategy,
      label: ACC_COND_LABELS[best.strategy] ?? best.strategy,
      triggered: checkAccCondition(prices, best.strategy),
    };
  } catch {}

  // 거래: 최근 5년 최고 점수 전략의 현재 신호
  let trade = null;
  try {
    const p5 = filterByPeriod(prices, 5);
    const top = rankAllStrategies(p5, 1)[0];
    if (top) {
      const sig = getTradeSignal(p5, top.type, top.params);
      trade = {
        label: top.label,
        type: top.type,
        params: top.params,
        status: sig.status,
        proximity: sig.proximity,
        rsi: sig.rsi,
        histogram: sig.histogram,
      };
    }
  } catch {}

  return { ticker, lastPrice, acc, trade };
}
