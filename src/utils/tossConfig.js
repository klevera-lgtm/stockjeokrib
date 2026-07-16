// 토스 콘솔에서 발급받는 ID 모음
// 콘솔 등록 후 .env(.env.local)에 실제 값을 넣으면 기능이 활성화돼요.

// 공유 리워드 모듈 ID (콘솔 > 공유 리워드 > 리워드 ID)
export const VIRAL_MODULE_ID = import.meta.env.VITE_VIRAL_MODULE_ID || "";
export const VIRAL_ENABLED = VIRAL_MODULE_ID !== "";

// 보상형 광고 그룹 ID (콘솔 > 인앱 광고 > 광고 그룹)
// 미설정 시 테스트 ID로 동작 (샌드박스/토스앱에서만 표시됨)
export const REWARDED_AD_GROUP_ID =
  import.meta.env.VITE_REWARDED_AD_GROUP_ID || "ait-ad-test-rewarded-id";

// 전면형 광고 그룹 ID
export const INTERSTITIAL_AD_GROUP_ID =
  import.meta.env.VITE_INTERSTITIAL_AD_GROUP_ID || "ait-ad-test-interstitial-id";

// IAP 코인 상품 SKU 규칙: "coin_<개수>" (예: coin_10, coin_35, coin_100)
// 콘솔에 이 규칙대로 상품을 등록하면 별도 코드 수정 없이 지급돼요.
export function coinsFromSku(sku) {
  const m = /^coin_(\d+)$/.exec(sku ?? "");
  return m ? parseInt(m[1], 10) : 0;
}
