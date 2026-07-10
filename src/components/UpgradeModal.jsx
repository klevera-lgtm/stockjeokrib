export default function UpgradeModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-badge">베이직</div>
        <h2 className="modal-title">더 많은 기능을 사용하세요</h2>
        <p className="modal-desc">
          베이직 업그레이드 시 무제한 조회, 전체 전략 결과,
          포트폴리오 저장, 광고 제거, 푸시 알림을 이용할 수 있어요.
        </p>
        <ul className="modal-features">
          <li>✓ 티커 무제한 조회</li>
          <li>✓ 기간 직접 입력 (1년~최대)</li>
          <li>✓ 전체 전략 순위 공개</li>
          <li>✓ 포트폴리오 저장</li>
          <li>✓ 광고 제거</li>
          <li>✓ 푸시 알림</li>
          <li>✓ 남들은 뭐 살까 TOP50</li>
        </ul>
        <div className="modal-price">월 990원</div>
        <button className="btn-primary modal-cta">베이직 시작하기</button>
        <button className="modal-cancel" onClick={onClose}>나중에</button>
      </div>
    </div>
  );
}
