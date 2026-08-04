import { useEffect, useRef, useState } from "react";
import { TossAds } from "@apps-in-toss/web-framework";
import { isBasic } from "../utils/premium.js";
import { initTossAds } from "../utils/tossAds.js";
import { BANNER_AD_GROUP_ID } from "../utils/tossConfig.js";

// 주인 확인용: 면책 문구를 7번 탭하면 __previewAds가 켜져요(Disclaimer.jsx).
// 베이직이어도 광고 슬롯을 렌더해서 실기기 토스앱에서 배너가 뜨는지 확인해요.
// 이 키를 모르는 남에겐 안 보임.
function adPreviewOn() {
  try { return localStorage.getItem("__previewAds") === "1"; } catch { return false; }
}

export default function AdBanner({ className = "" }) {
  const containerRef = useRef(null);
  const destroyRef = useRef(null);
  const preview = isBasic() && adPreviewOn(); // 오너 미리보기 여부
  const [failed, setFailed] = useState(false);

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
              // 미리보기 모드: 숨기지 말고 '미충전/실패' 표식을 남겨서 판독 가능하게
              if (preview) { setFailed(true); return; }
              if (containerRef.current) containerRef.current.style.display = "none";
            },
          },
        });
        destroyRef.current = result?.destroy;
      } catch {
        if (preview) { setFailed(true); return; }
        if (containerRef.current) containerRef.current.style.display = "none";
      }
    })();
    return () => { cancelled = true; try { destroyRef.current?.(); } catch {} };
  }, []);

  if (isBasic() && !adPreviewOn()) return null;
  return (
    <>
      <div ref={containerRef} className={`ad-banner-slot ${className}${preview && failed ? " ad-preview-empty" : ""}`} />
      {preview && (
        <div className={`ad-preview-note${failed ? " failed" : ""}`}>
          {failed
            ? "⚠️ 광고 미충전 · 렌더 실패 (슬롯은 정상, 광고만 안 참)"
            : "🔧 광고 미리보기 슬롯 · 실기기 토스앱에서만 실제 광고가 채워져요"}
        </div>
      )}
    </>
  );
}
