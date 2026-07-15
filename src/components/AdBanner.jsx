import { useEffect, useRef } from "react";
import { TossAds } from "@apps-in-toss/web-framework";
import { isBasic } from "../utils/premium.js";

const TEST_BANNER_ID = "ait-ad-test-banner-id";

export default function AdBanner({ className = "" }) {
  const containerRef = useRef(null);
  const destroyRef = useRef(null);

  useEffect(() => {
    if (isBasic() || !containerRef.current) return;
    try {
      const result = TossAds.attachBanner(TEST_BANNER_ID, containerRef.current, {
        callbacks: {
          onAdFailedToRender: () => {
            if (containerRef.current) containerRef.current.style.display = "none";
          },
        },
      });
      destroyRef.current = result.destroy;
    } catch {
      if (containerRef.current) containerRef.current.style.display = "none";
    }
    return () => { try { destroyRef.current?.(); } catch {} };
  }, []);

  if (isBasic()) return null;
  return <div ref={containerRef} className={`ad-banner-slot ${className}`} />;
}
