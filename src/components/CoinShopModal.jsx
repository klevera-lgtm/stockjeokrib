import { useInAppPurchase } from "../hooks/useInAppPurchase.js";
import { coinsFromProduct } from "../utils/tossConfig.js";
import { getQueryBalance } from "../utils/premium.js";
import { logClick } from "../utils/analytics.js";

// 코인 개수별 뱃지 (SKU와 무관하게 동작)
const BADGE_BY_COINS = {
  35: "인기",
  100: "최고 가성비",
};

export default function CoinShopModal({ onClose, onPurchased }) {
  const { products, purchaseProduct, productsLoading, purchasingSku, unavailable, lastGranted } =
    useInAppPurchase();

  // 코인 상품만 필터 후 개수 순 정렬
  const coinProducts = products
    .filter((p) => coinsFromProduct(p) > 0)
    .sort((a, b) => coinsFromProduct(a) - coinsFromProduct(b));

  if (lastGranted) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <div className="modal-badge query-gate-badge">충전 완료</div>
          <h2 className="modal-title">코인 +{lastGranted.coins}개 충전됐어요!</h2>
          <p className="modal-desc">현재 보유 코인 {getQueryBalance()}개</p>
          <button
            className="btn-primary modal-cta"
            onClick={() => { onPurchased?.(); onClose(); }}
          >
            확인
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-badge query-gate-badge">코인 충전</div>
        <h2 className="modal-title">코인이 더 필요하세요?</h2>
        <p className="modal-desc">구매한 코인은 소멸되지 않고 계속 쌓여요.</p>

        {productsLoading && <p className="coinshop-state">상품 불러오는 중...</p>}

        {unavailable && (
          <p className="coinshop-state">
            코인 구매는 토스 앱에서만 가능해요.<br />
            토스 앱에서 '주식적립왕'을 열어주세요.
          </p>
        )}

        {!productsLoading && !unavailable && coinProducts.length === 0 && (
          <p className="coinshop-state">준비 중이에요. 곧 만나요!</p>
        )}

        {coinProducts.map((p) => {
          const coins = coinsFromProduct(p);
          const badge = BADGE_BY_COINS[coins];
          return (
            <button
              key={p.sku}
              className="coinshop-item"
              onClick={() => { logClick("coin_purchase", { sku: p.sku, coins }); purchaseProduct(p.sku, coins); }}
              disabled={!!purchasingSku}
            >
              <span className="coinshop-coins">
                🪙 코인 {coins}개
                {badge && <span className="coinshop-badge">{badge}</span>}
              </span>
              <span className="coinshop-price">
                {purchasingSku === p.sku ? "결제 중..." : p.displayPrice ?? p.price ?? ""}
              </span>
            </button>
          );
        })}

        <button className="modal-cancel" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
