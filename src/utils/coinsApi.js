import { getAnonKey } from "./portfolioApi.js";
import { getPaidBalance, setPaidBalance, onPaidChange } from "./premium.js";

// 구매 코인 잔액을 Supabase user_coins 테이블에 동기화
// (검수 요건: 기기 변경 시에도 구매 데이터 유지)
const REST_URL = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/user_coins`;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
};

let anonKey = null;
let pushTimer = null;

async function fetchServerBalance(key) {
  const res = await fetch(
    `${REST_URL}?anonymous_key=eq.${encodeURIComponent(key)}&select=paid_balance`,
    { headers: HEADERS }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows.length > 0 ? rows[0].paid_balance : null;
}

async function upsertServerBalance(key, balance) {
  await fetch(REST_URL, {
    method: "POST",
    headers: { ...HEADERS, "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify({
      anonymous_key: key,
      paid_balance: balance,
      updated_at: new Date().toISOString(),
    }),
  });
}

// 로컬 변경 → 서버 반영 (짧은 디바운스로 연타 흡수)
function schedulePush() {
  if (!anonKey) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    upsertServerBalance(anonKey, getPaidBalance()).catch(() => {});
  }, 800);
}

// 앱 시작 시 1회: 서버 잔액을 로컬에 반영하고, 이후 변경을 구독
export async function initPaidCoins() {
  try {
    anonKey = await getAnonKey();
    onPaidChange(schedulePush);

    const server = await fetchServerBalance(anonKey);
    if (server === null) {
      // 서버에 기록 없음 — 로컬에 남은 구매 코인이 있으면 올려둠
      if (getPaidBalance() > 0) schedulePush();
    } else {
      // 서버가 기준 (기기 변경/재설치 복원)
      setPaidBalance(server, { silent: true });
    }
  } catch {
    // 네트워크/미지원 환경 — 로컬 잔액으로 계속 동작
  }
}
