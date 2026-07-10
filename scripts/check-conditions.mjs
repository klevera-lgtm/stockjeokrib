import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PRICES_BASE_URL =
  "https://raw.githubusercontent.com/klevera-lgtm/stockjeokrib/main/data/prices/";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수가 없어요");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── 주가 데이터 로드 ──────────────────────────────────────────
async function loadPrices(ticker) {
  const res = await fetch(`${PRICES_BASE_URL}${ticker}.csv`);
  if (!res.ok) throw new Error(`${ticker} CSV 없음 (${res.status})`);
  const text = await res.text();
  return text
    .trim()
    .split("\n")
    .slice(1)
    .map((row) => {
      const [dateStr, , , , close] = row.split(",");
      const date = new Date(dateStr.trim());
      return { date, close: parseFloat(close) };
    })
    .filter((p) => !isNaN(p.date.getTime()) && !isNaN(p.close))
    .sort((a, b) => a.date - b.date);
}

// ── 지표 계산 ─────────────────────────────────────────────────
function calcSMA(prices, period) {
  return prices.map((_, i) => {
    if (i < period - 1) return null;
    const sum = prices.slice(i - period + 1, i + 1).reduce((s, p) => s + p.close, 0);
    return sum / period;
  });
}

function calcRSI(prices, period = 14) {
  const gains = [];
  const losses = [];
  for (let i = 1; i < prices.length; i++) {
    const diff = prices[i].close - prices[i - 1].close;
    gains.push(Math.max(diff, 0));
    losses.push(Math.max(-diff, 0));
  }
  return prices.map((_, i) => {
    if (i < period) return null;
    const gi = i - 1;
    const slice = (arr) => arr.slice(gi - period + 1, gi + 1);
    const avgGain = slice(gains).reduce((s, v) => s + v, 0) / period;
    const avgLoss = slice(losses).reduce((s, v) => s + v, 0) / period;
    if (avgLoss === 0) return 100;
    return 100 - 100 / (1 + avgGain / avgLoss);
  });
}

function checkTodayCondition(prices, strategy) {
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

// ── 스마트 발송 ───────────────────────────────────────────────
async function sendSmartMessage(anonymousKey, ticker, strategy) {
  const SMART_MSG_API = process.env.SMART_MSG_API;
  const SMART_MSG_TOKEN = process.env.SMART_MSG_TOKEN;

  if (!SMART_MSG_API || !SMART_MSG_TOKEN) {
    console.log(
      `  [알림 스킵] SMART_MSG_API/TOKEN 미설정 — ticker=${ticker} key=${anonymousKey.slice(0, 8)}...`
    );
    return;
  }

  const res = await fetch(SMART_MSG_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SMART_MSG_TOKEN}`,
    },
    body: JSON.stringify({
      anonymous_key: anonymousKey,
      ticker,
      strategy,
      message: `📈 ${ticker} 오늘 적립 조건이 충족됐어요 (${strategy})`,
    }),
  });

  if (res.ok) {
    console.log(`  ✅ 알림 발송 성공: ${ticker} → key=${anonymousKey.slice(0, 8)}...`);
  } else {
    console.warn(`  ⚠️ 알림 발송 실패: ${ticker} → ${res.status}`);
  }
}

// ── 메인 ─────────────────────────────────────────────────────
async function main() {
  const now = new Date().toISOString();
  console.log(`\n[${now}] 포트폴리오 조건 체크 시작\n`);

  const { data: items, error } = await supabase
    .from("portfolio_items")
    .select("anonymous_key, ticker, strategy");

  if (error) {
    console.error("DB 조회 실패:", error.message);
    process.exit(1);
  }

  if (!items?.length) {
    console.log("포트폴리오 항목 없음 — 종료");
    return;
  }

  console.log(`총 ${items.length}개 항목 체크\n`);

  // 종목별 가격 데이터를 한 번씩만 로드
  const priceCache = {};
  const triggered = [];

  for (const item of items) {
    try {
      if (!priceCache[item.ticker]) {
        priceCache[item.ticker] = await loadPrices(item.ticker);
      }
      const prices = priceCache[item.ticker];
      const met = checkTodayCondition(prices, item.strategy);
      const mark = met ? "🔔" : "⏳";
      console.log(`${mark} ${item.ticker.padEnd(8)} ${item.strategy}`);
      if (met) triggered.push(item);
    } catch (e) {
      console.warn(`⚠️  ${item.ticker} 처리 실패: ${e.message}`);
    }
  }

  console.log(`\n조건 충족: ${triggered.length} / ${items.length}개`);

  for (const item of triggered) {
    await sendSmartMessage(item.anonymous_key, item.ticker, item.strategy);
  }

  console.log("\n완료\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
