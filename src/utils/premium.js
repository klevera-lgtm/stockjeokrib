const BALANCE_KEY = "ait_query_balance";
const PAID_KEY = "ait_paid_balance";
const REFILL_KEY = "ait_last_refill_date";
const WELCOME_KEY = "ait_welcome_done";
const PLAN_KEY = "stockjeokrib_plan";
const STREAK_KEY = "ait_streak_count";
const STREAK_BONUS_DATE_KEY = "ait_streak_bonus_date";
const STREAK_CLAIM_KEY = "ait_streak_claim_date";

const WELCOME_QUERIES = 10;         // 첫 진입 웰컴 코인
export const AD_REWARD_QUERIES = 2; // 리워드 광고 시청 보상
const STREAK_COIN_EVERY = 2;        // 이틀 연속 방문마다 +1 코인
const STREAK_COIN = 1;
export const STREAK_MILESTONE = 7;  // 7일 연속 방문 마일스톤
export const STREAK_BONUS = 3;      // 마일스톤 보너스 코인 수

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

function ensureVisitReward() {
  try {
    const today = todayStr();
    const welcomeDone = localStorage.getItem(WELCOME_KEY);
    if (!welcomeDone) {
      // 첫 진입: 웰컴 코인 지급
      setStoredBalance(getStoredBalance() + WELCOME_QUERIES);
      localStorage.setItem(WELCOME_KEY, "1");
      localStorage.setItem(REFILL_KEY, today);
      localStorage.setItem(STREAK_KEY, "1");
      return;
    }
    const lastVisit = localStorage.getItem(REFILL_KEY);
    if (lastVisit !== today) {
      // 연속 방문: 어제 방문했으면 streak+1, 아니면 1로 리셋
      const prevStreak = parseInt(localStorage.getItem(STREAK_KEY) ?? "0", 10);
      const streak = lastVisit === yesterdayStr() ? prevStreak + 1 : 1;
      localStorage.setItem(STREAK_KEY, String(streak));
      localStorage.setItem(REFILL_KEY, today);
      // 코인은 출석 도장판에서 claimStreakReward()로 지급 (자동 지급 없음)
    }
  } catch {}
}

// 오늘 스트릭이 주는 코인 (2일마다 +1, 7일마다 +3, 중첩 가능)
function streakRewardFor(count) {
  let r = 0;
  if (count > 0 && count % STREAK_COIN_EVERY === 0) r += STREAK_COIN;
  if (count > 0 && count % STREAK_MILESTONE === 0) r += STREAK_BONUS;
  return r;
}

// 연속 출석 정보: { count, bonusToday, daysToBonus, reward, claimedToday }
export function getStreakInfo() {
  try {
    ensureVisitReward();
    const count = parseInt(localStorage.getItem(STREAK_KEY) ?? "0", 10);
    const bonusToday = localStorage.getItem(STREAK_BONUS_DATE_KEY) === todayStr();
    const daysToBonus = STREAK_MILESTONE - (count % STREAK_MILESTONE || STREAK_MILESTONE);
    const claimedToday = localStorage.getItem(STREAK_CLAIM_KEY) === todayStr();
    return { count, bonusToday, daysToBonus, reward: streakRewardFor(count), claimedToday };
  } catch {
    return { count: 0, bonusToday: false, daysToBonus: STREAK_MILESTONE, reward: 0, claimedToday: false };
  }
}

// 오늘의 출석 코인 받기 (하루 1회, 코인 balance에 지급). 반환: { amount, already, milestone, count }
export function claimStreakReward() {
  try {
    ensureVisitReward();
    const today = todayStr();
    const count = parseInt(localStorage.getItem(STREAK_KEY) ?? "0", 10);
    if (localStorage.getItem(STREAK_CLAIM_KEY) === today) return { amount: 0, already: true, count };
    const amount = streakRewardFor(count);
    localStorage.setItem(STREAK_CLAIM_KEY, today);
    if (amount > 0) setStoredBalance(getStoredBalance() + amount);
    const milestone = count > 0 && count % STREAK_MILESTONE === 0;
    if (milestone) localStorage.setItem(STREAK_BONUS_DATE_KEY, today);
    return { amount, already: false, milestone, count };
  } catch {
    return { amount: 0, already: false, count: 0 };
  }
}

// ── 코인 잠금 해제는 그날 하루 유지 (같은 걸 다시 열 때 재과금 없음) ──
// key: 잠금 대상 식별자 (예: `rank_TSLA`, `versus_A_B`, `lump`)
export function isUnlockedToday(key) {
  if (isBasic()) return true;
  try { return localStorage.getItem(`ait_unlock_${key}`) === todayStr(); }
  catch { return false; }
}
export function markUnlockedToday(key) {
  try { localStorage.setItem(`ait_unlock_${key}`, todayStr()); } catch {}
}
// 코인으로 잠금 해제: 오늘 이미 열었으면 무료 통과, 아니면 cost만큼 차감 후 하루 저장.
// 반환 true = 열림, false = 코인 부족.
export function unlockToday(key, cost = 1) {
  if (isUnlockedToday(key)) return true;
  if (!consumeQueries(cost)) return false;
  markUnlockedToday(key);
  return true;
}
// 적립 vs 거치 기간 토글 (기능 전체 · 하루 유지)
export function isLumpUnlocked() { return isUnlockedToday("lump"); }
export function markLumpUnlocked() { markUnlockedToday("lump"); }

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
  ensureVisitReward();
  return getStoredBalance() + getPaidBalance();
}

export function consumeQuery() {
  if (isBasic()) return true;
  ensureVisitReward();
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

export function consumeQueries(n) {
  if (isBasic()) return true;
  ensureVisitReward();
  if (getQueryBalance() < n) return false;
  for (let i = 0; i < n; i++) consumeQuery();
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
