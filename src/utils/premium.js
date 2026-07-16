const BALANCE_KEY = "ait_query_balance";
const PAID_KEY = "ait_paid_balance";
const REFILL_KEY = "ait_last_refill_date";
const WELCOME_KEY = "ait_welcome_done";
const PLAN_KEY = "stockjeokrib_plan";
const STREAK_KEY = "ait_streak_count";
const STREAK_BONUS_DATE_KEY = "ait_streak_bonus_date";

const WELCOME_QUERIES = 10;
const DAILY_FREE_QUERIES = 3;
export const AD_REWARD_QUERIES = 2;
export const STREAK_INTERVAL = 3;   // N일 연속마다 보너스
export const STREAK_BONUS = 3;      // 보너스 코인 수

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

// ── 구매 코인 (서버 동기화 대상 — 기기 변경 시에도 유지) ──
let paidSyncFn = null;
export function onPaidChange(fn) { paidSyncFn = fn; }
function notifyPaidChanged() { try { paidSyncFn?.(getPaidBalance()); } catch {} }

export function getPaidBalance() {
  try { return parseInt(localStorage.getItem(PAID_KEY) ?? "0", 10); }
  catch { return 0; }
}

export function setPaidBalance(n, { silent = false } = {}) {
  try { localStorage.setItem(PAID_KEY, String(Math.max(0, n))); } catch {}
  if (!silent) notifyPaidChanged();
}

export function earnPaidCoins(n) {
  const amount = Math.max(0, Math.floor(Number(n) || 0));
  if (amount > 0) setPaidBalance(getPaidBalance() + amount);
  return amount;
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function ensureDailyRefill() {
  try {
    const today = todayStr();
    const welcomeDone = localStorage.getItem(WELCOME_KEY);
    if (!welcomeDone) {
      setStoredBalance(getStoredBalance() + WELCOME_QUERIES);
      localStorage.setItem(WELCOME_KEY, "1");
      localStorage.setItem(REFILL_KEY, today);
      localStorage.setItem(STREAK_KEY, "1");
      return;
    }
    const lastRefill = localStorage.getItem(REFILL_KEY);
    if (lastRefill !== today) {
      // 연속 출석: 어제 방문했으면 +1, 아니면 리셋
      const prevStreak = parseInt(localStorage.getItem(STREAK_KEY) ?? "0", 10);
      const streak = lastRefill === yesterdayStr() ? prevStreak + 1 : 1;
      localStorage.setItem(STREAK_KEY, String(streak));

      let refill = DAILY_FREE_QUERIES;
      if (streak > 0 && streak % STREAK_INTERVAL === 0) {
        refill += STREAK_BONUS;
        localStorage.setItem(STREAK_BONUS_DATE_KEY, today);
      }
      setStoredBalance(getStoredBalance() + refill);
      localStorage.setItem(REFILL_KEY, today);
    }
  } catch {}
}

// 연속 출석 정보: { count, bonusToday, daysToBonus }
export function getStreakInfo() {
  try {
    ensureDailyRefill();
    const count = parseInt(localStorage.getItem(STREAK_KEY) ?? "0", 10);
    const bonusToday = localStorage.getItem(STREAK_BONUS_DATE_KEY) === todayStr();
    const daysToBonus = STREAK_INTERVAL - (count % STREAK_INTERVAL || STREAK_INTERVAL);
    return { count, bonusToday, daysToBonus };
  } catch {
    return { count: 0, bonusToday: false, daysToBonus: STREAK_INTERVAL };
  }
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
  return getStoredBalance() + getPaidBalance();
}

export function consumeQuery() {
  if (isBasic()) return true;
  ensureDailyRefill();
  // 무료 코인 먼저 소비, 그다음 구매 코인
  const free = getStoredBalance();
  if (free > 0) {
    setStoredBalance(free - 1);
    return true;
  }
  const paid = getPaidBalance();
  if (paid > 0) {
    setPaidBalance(paid - 1);
    return true;
  }
  return false;
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
