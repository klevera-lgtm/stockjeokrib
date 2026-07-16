const BALANCE_KEY = "ait_query_balance";
const REFILL_KEY = "ait_last_refill_date";
const WELCOME_KEY = "ait_welcome_done";
const PLAN_KEY = "stockjeokrib_plan";

const WELCOME_QUERIES = 10;
const DAILY_FREE_QUERIES = 3;
export const AD_REWARD_QUERIES = 2;

const DEV_MODE = false;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getStoredBalance() {
  try { return parseInt(localStorage.getItem(BALANCE_KEY) ?? "0", 10); }
  catch { return 0; }
}

function setStoredBalance(n) {
  try { localStorage.setItem(BALANCE_KEY, String(Math.max(0, n))); }
  catch {}
}

function ensureDailyRefill() {
  try {
    const today = todayStr();
    const welcomeDone = localStorage.getItem(WELCOME_KEY);
    if (!welcomeDone) {
      setStoredBalance(getStoredBalance() + WELCOME_QUERIES);
      localStorage.setItem(WELCOME_KEY, "1");
      localStorage.setItem(REFILL_KEY, today);
      return;
    }
    const lastRefill = localStorage.getItem(REFILL_KEY);
    if (lastRefill !== today) {
      setStoredBalance(getStoredBalance() + DAILY_FREE_QUERIES);
      localStorage.setItem(REFILL_KEY, today);
    }
  } catch {}
}

export function getPlanLevel() {
  try { return localStorage.getItem(PLAN_KEY) ?? "free"; }
  catch { return "free"; }
}

export function setPlanLevel(level) {
  try { localStorage.setItem(PLAN_KEY, level); }
  catch {}
}

export function isBasic() {
  if (DEV_MODE) return true;
  return getPlanLevel() === "basic";
}

export function getQueryBalance() {
  if (isBasic()) return Infinity;
  ensureDailyRefill();
  return getStoredBalance();
}

export function consumeQuery() {
  if (isBasic()) return true;
  ensureDailyRefill();
  const bal = getStoredBalance();
  if (bal <= 0) return false;
  setStoredBalance(bal - 1);
  return true;
}

export function earnAdQueries() {
  setStoredBalance(getStoredBalance() + AD_REWARD_QUERIES);
}

// 범용 코인 지급 (공유 리워드, IAP 등)
export function earnCoins(n) {
  const amount = Math.max(0, Math.floor(Number(n) || 0));
  if (amount > 0) setStoredBalance(getStoredBalance() + amount);
  return amount;
}

// backward compat
export function consumeFreeQuery() { return consumeQuery(); }
export function getRemainingFreeQueries() { return getQueryBalance(); }
