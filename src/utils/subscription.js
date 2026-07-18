import { IAP } from "@apps-in-toss/web-framework";
import { setPlanLevel, getPlanLevel } from "./premium.js";

const SUB_ORDER_KEY = "ait_sub_order_id";
const SUB_EXPIRES_KEY = "ait_sub_expires";

export function getSubOrderId() {
  try { return localStorage.getItem(SUB_ORDER_KEY); } catch { return null; }
}

export function saveSubOrderId(id) {
  try { if (id) localStorage.setItem(SUB_ORDER_KEY, id); } catch {}
}

// 앱 시작 시 구독 상태 재확인 — 갱신/만료/해지를 반영
export async function refreshSubscriptionStatus() {
  const orderId = getSubOrderId();
  if (!orderId) return getPlanLevel() === "basic";
  try {
    const res = await IAP.getSubscriptionInfo({ params: { orderId } });
    const info = res?.subscription ?? res ?? {};
    const active = info.isAccessible ?? false;
    setPlanLevel(active ? "basic" : "free");
    if (info.expiresAt) {
      try { localStorage.setItem(SUB_EXPIRES_KEY, String(info.expiresAt)); } catch {}
    }
    return active;
  } catch {
    // 토스 밖/네트워크 실패 — 기존 상태 유지
    return getPlanLevel() === "basic";
  }
}

// 베이직 구독 시작: 콘솔의 구독형 상품을 찾아 결제 진행
export async function startBasicSubscription({ onSuccess, onError } = {}) {
  try {
    const res = await IAP.getProductItemList();
    const products = res?.products ?? [];
    const sub = products.find((p) => p.type === "SUBSCRIPTION" || p.renewalCycle);
    if (!sub) {
      onError?.(new Error("구독 상품이 아직 등록되지 않았어요."));
      return;
    }
    const cleanup = IAP.createSubscriptionPurchaseOrder({
      options: {
        sku: sub.sku,
        processProductGrant: ({ orderId }) => {
          saveSubOrderId(orderId);
          setPlanLevel("basic");
          return true;
        },
      },
      onEvent: (event) => {
        if (event?.type === "success") onSuccess?.();
        cleanup();
      },
      onError: (error) => {
        onError?.(error);
        cleanup();
      },
    });
  } catch (error) {
    onError?.(error);
  }
}
