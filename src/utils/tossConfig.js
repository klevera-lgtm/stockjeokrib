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

// 배너 광고 그룹 ID (결과 화면 하단)
export const BANNER_AD_GROUP_ID =
  import.meta.env.VITE_BANNER_AD_GROUP_ID || "ait-ad-test-banner-id";

// IAP 코인 상품 SKU 규칙: "coin_<개수>" (예: coin_10, coin_35, coin_100)
export function coinsFromSku(sku) {
  const m = /^coin_(\d+)$/.exec(sku ?? "");
  return m ? parseInt(m[1], 10) : 0;
}

// SKU가 콘솔 자동 생성이어도 동작하도록 상품명("코인 10개")에서 개수 추출
export function coinsFromProduct(product) {
  const bySku = coinsFromSku(product?.sku);
  if (bySku > 0) return bySku;
  const name = product?.displayName ?? product?.name ?? product?.productName ?? "";
  const m = /코인\s*(\d+)\s*개/.exec(name);
  return m ? parseInt(m[1], 10) : 0;
}
