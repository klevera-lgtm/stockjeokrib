import { IAP } from "@apps-in-toss/web-framework";
import { useCallback, useEffect, useState } from "react";
import { earnPaidCoins } from "../utils/premium.js";
import { coinsFromSku, coinsFromProduct } from "../utils/tossConfig.js";

// 참고문서: https://developers-apps-in-toss.toss.im/iap/intro.html
// 코인 개수 인식: ① SKU "coin_<개수>" ② 상품명 "코인 N개" ③ 구매 시 전달된 힌트
export function useInAppPurchase() {
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [purchasingSku, setPurchasingSku] = useState(null);
  const [unavailable, setUnavailable] = useState(false);
  const [lastGranted, setLastGranted] = useState(null); // { sku, coins, orderId }

  useEffect(() => {
    async function fetchProducts() {
      setProductsLoading(true);
      try {
        const response = await IAP.getProductItemList();
        setProducts(response?.products ?? []);
      } catch {
        // 브라우저 등 미지원 환경 — 조용히 비활성화
        setUnavailable(true);
      } finally {
        setProductsLoading(false);
      }
    }
    fetchProducts();
  }, []);

  const resolveCoins = useCallback((sku, hint) => {
    if (hint > 0) return hint;
    const bySku = coinsFromSku(sku);
    if (bySku > 0) return bySku;
    const product = products.find((p) => p.sku === sku);
    return product ? coinsFromProduct(product) : 0;
  }, [products]);

  const grantProduct = useCallback((orderId, sku, coinsHint = 0) => {
    const coins = resolveCoins(sku, coinsHint);
    if (coins > 0) {
      earnPaidCoins(coins);
      setLastGranted({ sku, coins, orderId });
    }
    return true;
  }, [resolveCoins]);

  const purchaseProduct = useCallback(
    (sku, coinsHint = 0) => {
      setPurchasingSku(sku);
      try {
        const cleanup = IAP.createOneTimePurchaseOrder({
          options: {
            sku,
            processProductGrant: ({ orderId }) => grantProduct(orderId, sku, coinsHint),
          },
          onEvent: () => {
            setPurchasingSku(null);
            cleanup();
          },
          onError: (error) => {
            console.error("인앱결제 실패:", error);
            setPurchasingSku(null);
            cleanup();
          },
        });
      } catch (error) {
        console.error("인앱결제 실패:", error);
        setPurchasingSku(null);
      }
    },
    [grantProduct],
  );

  const restorePendingOrders = useCallback(async () => {
    try {
      const pending = await IAP.getPendingOrders();
      const orders = pending?.orders ?? [];
      for (const order of orders) {
        grantProduct(order.orderId, order.sku ?? order.productId);
        await IAP.completeProductGrant({ params: { orderId: order.orderId } });
      }
    } catch (error) {
      console.error("주문 복원 실패:", error);
    }
  }, [grantProduct]);

  return {
    products,
    purchaseProduct,
    restorePendingOrders,
    productsLoading,
    purchasingSku,
    unavailable,
    lastGranted,
  };
}
