import { useEffect, useState } from "react";
import { logScreen, logClick } from "../utils/analytics.js";
import { startBasicSubscription } from "../utils/subscription.js";

export default function UpgradeModal({ onClose }) {
  const [state, setState] = useState(null); // null | "processing" | "done" | "unavailable"

  useEffect(() => { logScreen("upgrade_modal"); }, []);

  function handleStart() {
    logClick("upgrade_start");
    setState("processing");
    startBasicSubscription({
      onSuccess: () => {
        setState("done");
        // 전 화면의 isBasic() 반영을 위해 새로고침
        setTimeout(() => window.location.reload(), 1200);
      },
      onError: () => setState("unavailable"),
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-badge">베이직</div>
        <h2 className="modal-title">광고 없이 마음껏 사용하세요</h2>
        <p className="modal-desc">
          광고 없이, 코인 걱정 없이 모든 기능을 무제한으로 이용해요.
          커피 한 잔 값으로 더 나은 투자 분석을 시작하세요.
        </p>
        <ul className="modal-features">
          <li>✓ 광고 없음</li>
          <li>✓ 코인 무제한 (매일 충전 불필요)</li>
          <li>✓ 월 납입금 자유 입력</li>
          <li>✓ 포트폴리오 최대 20개 저장 (무료 3개)</li>
        </ul>
        <div className="modal-price">월 1,980원</div>
        <div className="modal-price-sub">커피 한 잔 값 · 언제든 해지 가능</div>

        {state === "done" ? (
          <div className="query-earned-msg">✓ 베이직 시작! 잠시만요...</div>
        ) : (
          <button
            className="btn-primary modal-cta"
            onClick={handleStart}
            disabled={state === "processing"}
          >
            {state === "processing" ? "결제 진행 중..." : "베이직 시작하기"}
          </button>
        )}
        {state === "unavailable" && (
          <p className="upgrade-unavailable">
            구독은 토스 앱에서 진행할 수 있어요.
          </p>
        )}
        <button className="modal-cancel" onClick={onClose}>나중에</button>
      </div>
    </div>
  );
}
