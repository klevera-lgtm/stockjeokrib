import { IAP } from "@apps-in-toss/web-framework";
import { useCallback, useEffect, useState } from "react";
import { earnCoins } from "../utils/premium.js";
import { coinsFromSku } from "../utils/tossConfig.js";

// 참고문서: https://developers-apps-in-toss.toss.im/iap/intro.html
// 코인 상품 SKU 규칙: "coin_<개수>" — 결제 성공 시 해당 개수만큼 코인 지급
export function useInAppPurchase() {
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [purchasingSku, setPurchasingSku] = useState(null);
  const [unavailable, setUnavailable] = useState(false);
  const [lastGranted, setLastGranted] = useState(null); // { sku, coins }

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

  const grantProduct = useCallback((orderId, sku) => {
    const coins = coinsFromSku(sku);
    if (coins > 0) {
      earnCoins(coins);
      setLastGranted({ sku, coins, orderId });
    }
    return true;
  }, []);

  const purchaseProduct = useCallback(
    (sku) => {
      setPurchasingSku(sku);
      try {
        const cleanup = IAP.createOneTimePurchaseOrder({
          options: {
            sku,
            processProductGrant: ({ orderId }) => grantProduct(orderId, sku),
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
