import { useState } from "react";
import { useInAppAds } from "../hooks/useInAppAds.js";
import { earnAdQueries, earnCoins, AD_REWARD_QUERIES } from "../utils/premium.js";
import { openContactsViral } from "../utils/viral.js";
import { VIRAL_ENABLED, REWARDED_AD_GROUP_ID } from "../utils/tossConfig.js";
import CoinShopModal from "./CoinShopModal.jsx";

export default function QueryGateModal({ onClose, onEarned, onUpgrade }) {
  const [rewarding, setRewarding] = useState(false);
  const [earned, setEarned] = useState(false);
  const [earnedMsg, setEarnedMsg] = useState("");
  const [showShop, setShowShop] = useState(false);
  const { isAdLoaded, isSupported, showAd, lastReward } = useInAppAds(REWARDED_AD_GROUP_ID);

  function finish(msg) {
    setEarnedMsg(msg);
    setEarned(true);
    setTimeout(() => { onEarned?.(); onClose(); }, 1200);
  }

  function handleWatchAd() {
    if (!isAdLoaded && !isSupported) {
      earnAdQueries();
      finish(`✓ 코인 +${AD_REWARD_QUERIES}개 충전 완료!`);
      return;
    }
    setRewarding(true);
    showAd();
  }

  function handleInvite() {
    openContactsViral({
      onReward: (data) => {
        const granted = earnCoins(data?.rewardAmount ?? 0);
        if (granted > 0) finish(`✓ 초대 완료! 코인 +${granted}개`);
      },
      onError: () => {
        // 토스 앱 밖이거나 모듈 미설정 — 조용히 무시
      },
    });
  }

  if (lastReward && !earned) {
    earnAdQueries();
    finish(`✓ 코인 +${AD_REWARD_QUERIES}개 충전 완료!`);
  }

  if (showShop) {
    return (
      <CoinShopModal
        onClose={() => setShowShop(false)}
        onPurchased={() => { onEarned?.(); onClose(); }}
      />
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-badge query-gate-badge">코인 소진</div>
        <h2 className="modal-title">오늘 코인을 모두 사용했어요</h2>
        <p className="modal-desc">
          광고를 시청하면 코인 +{AD_REWARD_QUERIES}개를 바로 받아요.<br />
          내일 오전에 3개가 자동으로 충전됩니다.
        </p>

        {earned ? (
          <div className="query-earned-msg">{earnedMsg}</div>
        ) : (
          <>
            <button
              className="btn-primary modal-cta"
              onClick={handleWatchAd}
              disabled={rewarding && !isAdLoaded && isSupported}
            >
              {rewarding && !isAdLoaded && isSupported ? "광고 로딩 중..." : `📺 광고 보고 +${AD_REWARD_QUERIES}개 받기`}
            </button>
            {VIRAL_ENABLED && (
              <button className="btn-secondary modal-cta-secondary" onClick={handleInvite}>
                👥 친구 초대하고 코인 받기
              </button>
            )}
            <button className="btn-secondary modal-cta-secondary" onClick={() => setShowShop(true)}>
              🪙 코인 구매하기
            </button>
            <button className="btn-secondary modal-cta-secondary" onClick={() => { onClose(); onUpgrade?.(); }}>
              광고 없이 무제한 쓰기 →
            </button>
          </>
        )}
        <button className="modal-cancel" onClick={onClose}>나중에</button>
      </div>
    </div>
  );
}
