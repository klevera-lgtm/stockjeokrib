import { useState } from "react";
import { useInAppAds } from "../hooks/useInAppAds.js";
import { REWARDED_AD_GROUP_ID } from "../utils/tossConfig.js";
import { earnAdQueries, AD_REWARD_QUERIES } from "../utils/premium.js";
import { logClick } from "../utils/analytics.js";

export default function RewardedAdBanner({ onEarned }) {
  const { isAdLoaded, isSupported, showAd, lastReward } = useInAppAds(REWARDED_AD_GROUP_ID);
  const [loading, setLoading] = useState(false);
  const [earned, setEarned] = useState(false);

  if (lastReward && !earned) {
    setEarned(true);
    earnAdQueries();
    onEarned?.();
    setTimeout(() => setEarned(false), 2000);
  }

  function handleClick() {
    logClick("reward_banner_tap");
    if (!isAdLoaded && !isSupported) {
      earnAdQueries();
      setEarned(true);
      onEarned?.();
      setTimeout(() => setEarned(false), 2000);
      return;
    }
    setLoading(true);
    showAd();
    setTimeout(() => setLoading(false), 3000);
  }

  return (
    <button
      className="reward-banner"
      onClick={handleClick}
      disabled={loading}
    >
      {earned
        ? `✓ 코인 +${AD_REWARD_QUERIES}개 충전 완료!`
        : loading
          ? "광고 로딩 중..."
          : `🎁 무료 코인 +${AD_REWARD_QUERIES} 받기`}
    </button>
  );
}
