import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PRICES_DIR = join(ROOT, "data", "prices");
const OUTPUT = join(ROOT, "public", "featuredCombos.json");

const LEVERAGE_TICKERS = new Set(["TQQQ", "SOXL", "UPRO"]);

const ALL_APP_TICKERS = [...new Set([
  "TSLA","AAPL","NVDA","MSFT","AMZN","GOOGL","META","NFLX","AMD","AVGO",
  "MU","TSM","KO","BRK-B","ORCL","INTC","MRVL","PLTR","SNOW","COIN",
  "RKLB","IONQ","WDC","LLY","COST","V","QCOM","UBER","SPOT","SHOP",
  "ARM","AMAT","LRCX","ASML","BE","SMCI",
  "VOO","SPY","QQQM","QQQ","VTI","SCHG","VUG",
  "SMH","SOXX","XLK","VGT","IGV","HACK","WCLD","BOTZ",
  "TQQQ","SOXL","UPRO",
  "SCHD","JEPI","JEPQ","SPYD","DGRO","QYLD","RYLD",
  "XLC","XLY","XLP","XLV","XLF","XLI","XLE","XLB","XLU","XLRE",
  "ITA","XBI","ICLN","LIT","ARKK","ARKF","ARKX","QTUM","VNQ","ARKG",
  "GLD","SLV","TLT","SHY","USO","BND","AGG","HYG",
  "INDA","EWJ","MCHI","EWT","VNM","EWY","EWH","EWS","EIDO","THD",
  "VGK","EWG","EWU","EWQ","EWI","EWL",
  "EWZ","EWW","EEM","ACWI",
  "KS11","KQ11","005930","000660","069500","360750",
])];

const ALL_STRATEGIES = [
  "daily","weekly-fri","monthly-first","monthly-15","monthly-last",
  "ma10","ma50","ma100","ma200","drop3","drop5","rsi20","rsi30",
];

const PERIODS = [
  { key: "1mo",  months: 1  },
  { key: "3mo",  months: 3  },
  { key: "6mo",  months: 6  },
  { key: "1yr",  months: 12 },
  { key: "2yr",  months: 24 },
  { key: "3yr",  months: 36 },
  { key: "4yr",  months: 48 },
  { key: "5yr",  months: 60 },
  { key: "6yr",  months: 72 },
  { key: "7yr",  months: 84 },
  { key: "8yr",  months: 96 },
  { key: "9yr",  months: 108 },
  { key: "10yr", months: 120 },
];

// ── Price loading ───────────────────────────────────────────────────────────
function loadPricesSync(ticker) {
  try {
    const text = readFileSync(join(PRICES_DIR, `${ticker}.csv`), "utf8");
    return text.trim().split("\n").slice(1).map(row => {
      const parts = row.split(",");
      const date = new Date(parts[0]?.trim());
      const close = parseFloat(parts[4]);
      return { date, close };
    }).filter(p => !isNaN(p.date.getTime()) && !isNaN(p.close) && p.close > 0)
      .sort((a, b) => a.date - b.date);
  } catch {
    return null;
  }
}

// ── Indicators ─────────────────────────────────────────────────────────────
function calcSMA(prices, period) {
  return prices.map((_, i) => {
    if (i < period - 1) return null;
    const sum = prices.slice(i - period + 1, i + 1).reduce((s, p) => s + p.close, 0);
    return sum / period;
  });
}

function calcRSI(prices, period = 14) {
  const closes = prices.map(p => p.close);
  const rsi = new Array(closes.length).fill(null);
  if (closes.length <= period) return rsi;
  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gainSum += diff; else lossSum += Math.abs(diff);
  }
  let avgGain = gainSum / period, avgLoss = lossSum / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

function calcCAGR(invested, finalVal, years) {
  if (invested <= 0 || years <= 0) return 0;
  return Math.pow(finalVal / invested, 1 / years) - 1;
}

// ── Strategy simulation ─────────────────────────────────────────────────────
function runStrategy(allPrices, strategy, monthlyAmount, startDate, endDate) {
  const filtered = allPrices.filter(p => p.date >= startDate && p.date <= endDate);
  if (filtered.length < 10) return null;

  // Precompute indicators on full price history (for accuracy before start date)
  const smaMap = new Map();
  const rsiMap = new Map();
  if (strategy.startsWith("ma")) {
    const period = parseInt(strategy.replace("ma", ""), 10);
    const sma = calcSMA(allPrices, period);
    allPrices.forEach((p, i) => smaMap.set(p.date.toISOString().slice(0, 10), sma[i]));
  }
  if (strategy.startsWith("rsi")) {
    const rsi = calcRSI(allPrices);
    allPrices.forEach((p, i) => rsiMap.set(p.date.toISOString().slice(0, 10), rsi[i]));
  }

  const dailyAmount = monthlyAmount / 21;
  let pool = 0, totalInvested = 0, shares = 0;

  for (let i = 0; i < filtered.length; i++) {
    const p = filtered[i];
    const prev = filtered[i - 1];
    pool += dailyAmount;

    const key = p.date.toISOString().slice(0, 10);
    let buy = false;

    if (strategy === "daily") buy = true;
    else if (strategy === "weekly-fri") buy = p.date.getDay() === 5;
    else if (strategy === "monthly-first") buy = !prev || p.date.getMonth() !== prev.date.getMonth();
    else if (strategy === "monthly-15") buy = p.date.getDate() >= 15 && (!prev || prev.date.getDate() < 15);
    else if (strategy === "monthly-last") {
      const dim = new Date(p.date.getFullYear(), p.date.getMonth() + 1, 0).getDate();
      buy = p.date.getDate() >= dim - 2;
    }
    else if (strategy.startsWith("ma")) {
      const sma = smaMap.get(key);
      buy = sma != null && p.close < sma;
    }
    else if (strategy.startsWith("rsi")) {
      const threshold = parseInt(strategy.replace("rsi", ""), 10);
      const rsiVal = rsiMap.get(key);
      buy = rsiVal != null && rsiVal < threshold;
    }
    else if (strategy === "drop3") buy = prev && (p.close - prev.close) / prev.close <= -0.03;
    else if (strategy === "drop5") buy = prev && (p.close - prev.close) / prev.close <= -0.05;

    if (buy && pool > 0 && p.close > 0) {
      shares += pool / p.close;
      totalInvested += pool;
      pool = 0;
    }
  }

  if (totalInvested <= 0) return null;
  const finalValue = shares * filtered[filtered.length - 1].close;
  const years = (filtered[filtered.length - 1].date - filtered[0].date) / (365.25 * 24 * 3600 * 1000);
  const cagr = calcCAGR(totalInvested, finalValue, years);
  return isFinite(cagr) ? { strategy, cagr } : null;
}

function findBestForPeriod(allPrices, startDate, endDate) {
  const results = ALL_STRATEGIES
    .map(s => runStrategy(allPrices, s, 300000, startDate, endDate))
    .filter(r => r && r.cagr > -0.99);
  if (results.length === 0) return null;
  results.sort((a, b) => b.cagr - a.cagr);
  return results[0];
}

// ── Main ───────────────────────────────────────────────────────────────────
function main() {
  console.log(`\n가격 데이터 로드 중... (${ALL_APP_TICKERS.length}개 티커)\n`);

  const priceData = {};
  for (const ticker of ALL_APP_TICKERS) {
    const prices = loadPricesSync(ticker);
    if (prices && prices.length > 20) priceData[ticker] = prices;
  }
  console.log(`로드 성공: ${Object.keys(priceData).length}개\n`);

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const result = { updatedAt: now.toISOString().slice(0, 10), combos: {} };

  for (const { key, months } of PERIODS) {
    const startDate = new Date(now);
    startDate.setMonth(startDate.getMonth() - months);

    process.stdout.write(`${key} 계산 중...`);
    result.combos[key] = {};

    for (const withLeverage of [true, false]) {
      const lKey = withLeverage ? "with" : "without";

      const eligible = Object.entries(priceData).filter(([ticker, prices]) => {
        if (!withLeverage && LEVERAGE_TICKERS.has(ticker)) return false;
        return prices[0].date <= startDate && prices[prices.length - 1].date >= sevenDaysAgo;
      });

      const scored = [];
      for (const [ticker, prices] of eligible) {
        const best = findBestForPeriod(prices, startDate, now);
        if (best) scored.push({ ticker, strategy: best.strategy, cagr: best.cagr });
      }

      scored.sort((a, b) => b.cagr - a.cagr);
      const top5 = scored.slice(0, 5);
      const combined = top5.length > 0
        ? top5.reduce((s, r) => s + r.cagr, 0) / top5.length
        : 0;

      result.combos[key][lKey] = {
        tickers: top5.map(r => r.ticker),
        strategies: top5.map(r => r.strategy),
        cagrs: top5.map(r => Math.round(r.cagr * 10000) / 10000),
        combinedCagr: Math.round(combined * 10000) / 10000,
      };
    }

    console.log(` ✓`);
  }

  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log(`\n✅ 완료: ${OUTPUT}\n`);
}

main();
