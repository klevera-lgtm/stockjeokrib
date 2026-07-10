const STORAGE_KEY = "stockjeokrib_usage";
const FREE_DAILY_LIMIT = 5;

// TODO: 출시 전 DEV_MODE를 false로 되돌릴 것
const DEV_MODE = true;

function getUsageData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function getPlanLevel() {
  // For now, always "free" — extend later with IAP receipt check
  try {
    const raw = localStorage.getItem("stockjeokrib_plan");
    return raw ?? "free";
  } catch {
    return "free";
  }
}

export function setPlanLevel(level) {
  try {
    localStorage.setItem("stockjeokrib_plan", level);
  } catch {
    // ignore
  }
}

export function isBasic() {
  if (DEV_MODE) return true;
  return getPlanLevel() === "basic";
}

export function getRemainingFreeQueries() {
  if (DEV_MODE || isBasic()) return Infinity;
  const data = getUsageData();
  const today = todayStr();
  if (!data || data.date !== today) return FREE_DAILY_LIMIT;
  return Math.max(0, FREE_DAILY_LIMIT - (data.count ?? 0));
}

export function consumeFreeQuery() {
  if (DEV_MODE || isBasic()) return true;
  const data = getUsageData();
  const today = todayStr();
  if (!data || data.date !== today) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today, count: 1 }));
    return true;
  }
  if (data.count >= FREE_DAILY_LIMIT) return false;
  data.count += 1;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  return true;
}
