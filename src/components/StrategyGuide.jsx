import { useState } from "react";
import { formatKRW } from "../utils/calculator.js";

export default function StrategyGuide({ monthlyAmount = 300000 }) {
  const [open, setOpen] = useState(false);

  const daily = Math.round(monthlyAmount / 21);
  const weekly = Math.round(monthlyAmount * 12 / 52);
  const ex45 = Math.round(daily * 45);

  return (
    <div className="strategy-guide">
      <button className="strategy-guide-toggle" onClick={() => setOpen((v) => !v)}>
        <span>전략 안내</span>
        <span className="guide-arrow">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="strategy-guide-body">
          <p className="guide-basis">월 납입금 {formatKRW(monthlyAmount)} 기준 예시예요</p>

          <div className="guide-section-title">단순 주기형</div>

          <div className="guide-item">
            <div className="guide-item-name">매일 적립</div>
            <p className="guide-item-desc">
              주식시장은 한 달 평균 21거래일이에요.<br />
              {formatKRW(monthlyAmount)} ÷ 21일 = <strong>하루 약 {formatKRW(daily)}</strong><br />
              매일 장이 열릴 때 {formatKRW(daily)}어치를 자동 매수해요.
            </p>
          </div>

          <div className="guide-item">
            <div className="guide-item-name">매주 금요일</div>
            <p className="guide-item-desc">
              한 달에 금요일은 평균 4.3번이에요.<br />
              {formatKRW(monthlyAmount)} ÷ 4.3 = <strong>주당 약 {formatKRW(weekly)}</strong><br />
              매주 금요일마다 {formatKRW(weekly)}어치를 매수해요.
            </p>
          </div>

          <div className="guide-item">
            <div className="guide-item-name">매월 첫 거래일 · 15일 · 마지막 거래일</div>
            <p className="guide-item-desc">
              해당 날짜에 <strong>{formatKRW(monthlyAmount)} 전액</strong>을 한 번에 매수해요.<br />
              가장 단순하고 따라하기 쉬운 방법이에요.
            </p>
          </div>

          <div className="guide-section-title guide-section-title--gap">조건부 전략 · 적립 풀 방식</div>

          <p className="guide-pool-intro">
            조건부 전략은 공통적으로 <strong>적립 풀 방식</strong>으로 작동해요.<br />
            조건이 안 맞는 날도 매일 <strong>{formatKRW(daily)}</strong>씩 가상 지갑에 쌓이고,<br />
            조건이 충족되는 첫날 쌓인 금액을 <strong>전액 투입</strong>한 뒤 지갑이 리셋돼요.
          </p>

          <div className="guide-example-box">
            <div className="guide-example-label">예시</div>
            <div>45일간 조건 미충족</div>
            <div>→ {formatKRW(daily)} × 45일 = 약 {formatKRW(ex45)} 적립</div>
            <div>→ 조건 충족 첫날 {formatKRW(ex45)} 한 번에 투입 · 지갑 리셋</div>
            <div>→ 이후 조건 유지되는 날은 그날 쌓인 {formatKRW(daily)}씩만 추가 투입</div>
          </div>

          <div className="guide-item">
            <div className="guide-item-name">MA10 · MA50 · MA100 · MA200 아래일 때만</div>
            <p className="guide-item-desc">
              현재 주가가 N일 이동평균선(MA) 아래인 첫날 투자해요.<br />
              MA 숫자가 클수록 조건이 드물게 충족되고, 한 번에 더 큰 금액이 투입돼요.
            </p>
          </div>

          <div className="guide-item">
            <div className="guide-item-name">전일 대비 -3% · -5% 하락 시</div>
            <p className="guide-item-desc">
              전날보다 주가가 3% 또는 5% 이상 떨어진 날 투자해요.<br />
              하락 폭이 클수록 조건이 더 드물게 발생해요.
            </p>
          </div>

          <div className="guide-item">
            <div className="guide-item-name">RSI(14) 20 이하 · 30 이하일 때만</div>
            <p className="guide-item-desc">
              RSI는 최근 14일간 가격 움직임으로 계산하는 과매도 지표예요.<br />
              숫자가 낮을수록 단기 과매도 상태를 의미해요.<br />
              특히 RSI 20 이하는 매우 드물게 발생하므로, 충족 시 큰 금액이 한 번에 들어가요.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
