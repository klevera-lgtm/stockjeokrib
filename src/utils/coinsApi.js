import { getAnonKey } from "./portfolioApi.js";
import { getPaidBalance, setPaidBalance, onPaidChange } from "./premium.js";
import { getSubOrderId, saveSubOrderId, refreshSubscriptionStatus } from "./subscription.js";

// 구매 코인 잔액 + 구독 주문 ID를 Supabase user_coins 테이블에 동기화
// (검수 요건: 기기 변경 시에도 결제 데이터 유지)
const REST_URL = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/user_coins`;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
};

let anonKey = null;
let pushTimer = null;

async function fetchServerRow(key) {
  const res = await fetch(
    `${REST_URL}?anonymous_key=eq.${encodeURIComponent(key)}&select=*`,
    { headers: HEADERS }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows.length > 0 ? rows[0] : null;
}

async function upsertServerRow(key, balance) {
  const body = {
    anonymous_key: key,
    paid_balance: balance,
    updated_at: new Date().toISOString(),
  };
  const orderId = getSubOrderId();
  if (orderId) body.subscription_order_id = orderId;

  const post = (b) =>
    fetch(REST_URL, {
      method: "POST",
      headers: { ...HEADERS, "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify(b),
    });

  let res = await post(body);
  if (!res.ok && body.subscription_order_id) {
    // 컬럼 미생성 등 — 구독 필드 제외하고 재시도 (코인 동기화는 유지)
    delete body.subscription_order_id;
    await post(body);
  }
}

// 로컬 변경 → 서버 반영 (짧은 디바운스로 연타 흡수)
function schedulePush() {
  if (!anonKey) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    upsertServerRow(anonKey, getPaidBalance()).catch(() => {});
  }, 800);
}

// 앱 시작 시 1회: 서버 값을 로컬에 반영하고, 이후 변경을 구독
export async function initPaidCoins() {
  try {
    anonKey = await getAnonKey();
    onPaidChange(schedulePush);

    const row = await fetchServerRow(anonKey);
    if (row === null) {
      // 서버에 기록 없음 — 로컬에 남은 데이터가 있으면 올려둠
      if (getPaidBalance() > 0 || getSubOrderId()) schedulePush();
    } else {
      // 서버가 기준 (기기 변경/재설치 복원)
      setPaidBalance(row.paid_balance ?? 0, { silent: true });
      if (row.subscription_order_id && !getSubOrderId()) {
        saveSubOrderId(row.subscription_order_id);
      }
    }
  } catch {
    // 네트워크/미지원 환경 — 로컬 값으로 계속 동작
  }

  // 구독 상태 재확인 (갱신/만료 반영 — 토스 앱에서만 실제 조회됨)
  try { await refreshSubscriptionStatus(); } catch {}
}
