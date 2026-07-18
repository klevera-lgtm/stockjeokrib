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

// 콘솔에서 자동 생성된 SKU → 코인 개수 (2026-07-19 등록분, 최우선 적용)
const SKU_COIN_MAP = {
  "ait.0000050305.2ce3d748.fe08ca7798.4413625643": 10,
  "ait.0000050305.3f46ca3d.687ae4c6b5.4413690162": 35,
  "ait.0000050305.78b5cc64.359985ed11.4413827277": 100,
};

// 코인 개수 인식: ① 명시 매핑 ② "coin_<개수>" 패턴
export function coinsFromSku(sku) {
  if (SKU_COIN_MAP[sku]) return SKU_COIN_MAP[sku];
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
