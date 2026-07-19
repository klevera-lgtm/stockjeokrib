import { isBasic } from "./premium.js";

const KEY = "stockjeokrib_goal_plans";

export const FREE_PLAN_LIMIT = 2;
export const BASIC_PLAN_LIMIT = 5;

export function planLimit() {
  return isBasic() ? BASIC_PLAN_LIMIT : FREE_PLAN_LIMIT;
}

export function getPlans() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return migrateLegacy();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// 기존 단일 키(stockjeokrib_goal_plan) → 배열로 1회 이관
function migrateLegacy() {
  try {
    const old = localStorage.getItem("stockjeokrib_goal_plan");
    if (old) {
      const plan = JSON.parse(old);
      const arr = [{ id: plan.savedAt ?? String(Date.now()), ...plan }];
      localStorage.setItem(KEY, JSON.stringify(arr));
      localStorage.removeItem("stockjeokrib_goal_plan");
      return arr;
    }
  } catch {}
  return [];
}

function save(arr) {
  try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch {}
}

// 동일 목표(티커·금액·기간)가 이미 있으면 갱신, 없으면 추가
// 반환: { ok, reason } — reason: "limit" 이면 개수 초과
export function addPlan(plan) {
  const plans = getPlans();
  const key = (p) => `${p.ticker}|${p.goalAmount}|${p.years}`;
  const idx = plans.findIndex((p) => key(p) === key(plan));
  const entry = { id: String(Date.now()), savedAt: new Date().toISOString(), ...plan };

  if (idx >= 0) {
    plans[idx] = { ...plans[idx], ...entry };
    save(plans);
    return { ok: true, updated: true };
  }
  if (plans.length >= planLimit()) {
    return { ok: false, reason: "limit" };
  }
  plans.push(entry);
  save(plans);
  return { ok: true };
}

export function removePlan(id) {
  save(getPlans().filter((p) => p.id !== id));
}

export function hasPlan(plan) {
  const key = (p) => `${p.ticker}|${p.goalAmount}|${p.years}`;
  return getPlans().some((p) => key(p) === key(plan));
}
