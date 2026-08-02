import { useEffect, useRef } from "react";
import { TossAds } from "@apps-in-toss/web-framework";
import { isBasic } from "../utils/premium.js";
import { initTossAds } from "../utils/tossAds.js";
import { BANNER_AD_GROUP_ID } from "../utils/tossConfig.js";

// 주인 확인용: 크롬 콘솔에서 localStorage.setItem('__previewAds','1') 켜면
// 베이직이어도 광고 슬롯을 렌더(자리·레이아웃 확인). 이 키를 모르는 남에겐 안 보임.
function adPreviewOn() {
  try { return localStorage.getItem("__previewAds") === "1"; } catch { return false; }
}

export default function AdBanner({ className = "" }) {
  const containerRef = useRef(null);
  const destroyRef = useRef(null);

  useEffect(() => {
    if ((isBasic() && !adPreviewOn()) || !containerRef.current) return;
    let cancelled = false;
    (async () => {
      const ready = await initTossAds();
      if (cancelled || !ready || !containerRef.current) return;
      try {
        const result = TossAds.attachBanner(BANNER_AD_GROUP_ID, containerRef.current, {
          theme: "auto",
          callbacks: {
            onAdFailedToRender: () => {
              if (containerRef.current) containerRef.current.style.display = "none";
            },
          },
        });
        destroyRef.current = result?.destroy;
      } catch {
        if (containerRef.current) containerRef.current.style.display = "none";
      }
    })();
    return () => { cancelled = true; try { destroyRef.current?.(); } catch {} };
  }, []);

  if (isBasic() && !adPreviewOn()) return null;
  return <div ref={containerRef} className={`ad-banner-slot ${className}`} />;
}
