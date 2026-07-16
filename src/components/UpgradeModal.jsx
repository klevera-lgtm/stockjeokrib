import { useEffect } from "react";
import { logScreen, logClick } from "../utils/analytics.js";

export default function UpgradeModal({ onClose }) {
  useEffect(() => { logScreen("upgrade_modal"); }, []);
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
          <li>✓ 모든 기능 동일 제공</li>
          <li>✓ 포트폴리오 최대 20개 저장 (무료 3개)</li>
        </ul>
        <div className="modal-price">월 1,990원</div>
        <div className="modal-price-sub">커피 한 잔 값</div>
        <button className="btn-primary modal-cta" onClick={() => logClick("upgrade_start")}>베이직 시작하기</button>
        <button className="modal-cancel" onClick={onClose}>나중에</button>
      </div>
    </div>
  );
}
