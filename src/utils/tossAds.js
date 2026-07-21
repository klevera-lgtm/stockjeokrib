import { TossAds } from "@apps-in-toss/web-framework";

// TossAds SDK는 attachBanner/광고 표시 전에 반드시 initialize()를 먼저 호출해야 함.
// 앱 생명주기당 1회만 초기화하고, 결과를 공유 Promise로 캐시.
let initPromise = null;

export function initTossAds() {
  if (initPromise) return initPromise;
  initPromise = new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      // 토스 앱 밖(브라우저)에서는 미지원 → 즉시 false
      const supported = TossAds?.initialize?.isSupported?.();
      if (supported === false) { finish(false); return; }
      TossAds.initialize({
        callbacks: {
          onInitialized: () => finish(true),
          onInitializationFailed: () => finish(false),
        },
      });
      // 콜백이 오지 않는 환경 대비 안전 타임아웃
      setTimeout(() => finish(false), 4000);
    } catch {
      finish(false);
    }
  });
  return initPromise;
}
