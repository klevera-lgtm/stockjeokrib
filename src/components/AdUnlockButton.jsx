import { useEffect, useRef } from "react";
import { useInAppAds } from "../hooks/useInAppAds.js";
import { earnAdQueries, AD_REWARD_QUERIES } from "../utils/premium.js";
import { REWARDED_AD_GROUP_ID } from "../utils/tossConfig.js";
import { logClick } from "../utils/analytics.js";

// 잠긴 항목 옆 인라인 "광고 보고 열기" 버튼 (코인 부족할 때만 노출).
// 리워드 광고 시청 → 코인 +2 → onRewarded()에서 실제 잠금 해제를 실행해요.
// 리워드는 배너보다 노출당 단가가 훨씬 높아서(≈150배), 시청 유도가 광고 수익의 핵심.
export default function AdUnlockButton({ onRewarded, className = "", label }) {
  const { isAdLoaded, isSupported, showAd, lastReward } = useInAppAds(REWARDED_AD_GROUP_ID);
  const handledRef = useRef(false);

  useEffect(() => {
    if (lastReward && !handledRef.current) {
      handledRef.current = true;
      earnAdQueries();
      onRewarded?.();
    }
  }, [lastReward, onRewarded]);

  const notReady = isSupported && !isAdLoaded; // 토스앱인데 광고가 아직 로딩 전

  function handleClick() {
    logClick("inline_ad_unlock");
    if (!isSupported) { earnAdQueries(); onRewarded?.(); return; } // 브라우저·미지원 폴백
    if (!isAdLoaded) return;
    showAd();
  }

  return (
    <button className={`btn-primary ${className}`} onClick={handleClick} disabled={notReady}>
      {notReady ? "광고 준비 중..." : (label ?? `📺 광고 보고 열기 (+${AD_REWARD_QUERIES}코인)`)}
    </button>
  );
}
