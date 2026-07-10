import { useState, useCallback } from "react";
import { loadPrices } from "../utils/dataLoader.js";
import { runStrategy, formatKRW, formatPct } from "../utils/calculator.js";
import { isBasic, consumeFreeQuery } from "../utils/premium.js";
import TickerSearch from "./TickerSearch.jsx";
import LineChart from "./LineChart.jsx";
import UpgradeModal from "./UpgradeModal.jsx";

const EVENTS = [
  { id: "dotcom", label: "닷컴버블 붕괴", date: "2000-03-01", desc: "나스닥 -78% 폭락" },
  { id: "gfc", label: "금융위기", date: "2008-09-01", desc: "리먼 브라더스 파산" },
  { id: "covid", label: "코로나 폭락", date: "2020-03-01", desc: "S&P500 한 달 만에 -34%" },
  { id: "rate", label: "금리 인상 시작", date: "2022-01-01", desc: "연준 긴축 사이클 시작" },
  { id: "chatgpt", label: "ChatGPT 출시", date: "2022-11-01", desc: "AI 시대의 시작" },
  { id: "aiboom", label: "AI 붐", date: "2023-01-01", desc: "엔비디아·AI 주도 랠리" },
];

const FREE_EVENT_ID = "covid"; // most recent accessible

export default function EventExplorer() {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [ticker, setTicker] = useState(null);
  const [monthlyAmount, setMonthlyAmount] = useState(300000);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const basic = isBasic();

  const run = useCallback(async () => {
    if (!selectedEvent || !ticker) return;
    if (!basic && selectedEvent.id !== FREE_EVENT_ID) {
      setShowUpgrade(true);
      return;
    }
    if (!consumeFreeQuery()) { setShowUpgrade(true); return; }
    setLoading(true);
    setError(null);
    try {
      const prices = await loadPrices(ticker);
      const startDate = new Date(selectedEvent.date);
      const endDate = new Date();
      const r = runStrategy(prices, "monthly-first", monthlyAmount, startDate, endDate);
      if (!r) throw new Error("해당 기간 데이터가 없습니다.");
      setResult({ ...r, event: selectedEvent });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedEvent, ticker, monthlyAmount, basic]);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">이벤트 탐색</h1>
        <p className="page-subtitle">역사적 이벤트 직후 적립식 투자 결과를 시뮬레이션해요</p>
      </div>

      <div className="form-section">
        <label className="form-label">이벤트 선택</label>
        <div className="event-grid">
          {EVENTS.map((ev) => {
            const locked = !basic && ev.id !== FREE_EVENT_ID;
            return (
              <button
                key={ev.id}
                className={`event-card${selectedEvent?.id === ev.id ? " selected" : ""}${locked ? " locked" : ""}`}
                onClick={() => {
                  if (locked) { setShowUpgrade(true); return; }
                  setSelectedEvent(ev);
                  setResult(null);
                }}
              >
                {locked && <span className="lock-badge">🔒</span>}
                <div className="event-label">{ev.label}</div>
                <div className="event-date">{ev.date.slice(0, 7)}</div>
                <div className="event-desc">{ev.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedEvent && (
        <div className="form-section">
          <label className="form-label">자산 선택</label>
          <TickerSearch onSelect={setTicker} selected={ticker} />

          {ticker && (
            <>
              <label className="form-label">월 납입금</label>
              <div className="amount-row">
                {[100000, 300000, 500000, 1000000].map((v) => (
                  <button
                    key={v}
                    className={`chip${monthlyAmount === v ? " active" : ""}`}
                    onClick={() => setMonthlyAmount(v)}
                  >
                    {(v / 10000).toFixed(0)}만원
                  </button>
                ))}
              </div>
              <button className="btn-primary run-btn" onClick={run} disabled={loading}>
                {loading ? "계산 중..." : `${selectedEvent.label}부터 시뮬레이션`}
              </button>
            </>
          )}
        </div>
      )}

      {error && <p className="error-msg">{error}</p>}

      {result && (
        <div className="results-section">
          <div className="event-result-header">
            <span className="event-badge">{result.event.label}</span>
            <h2 className="section-title">
              {ticker} · 매월 {formatKRW(monthlyAmount)} 적립
            </h2>
            <p className="event-result-since">{result.event.date.slice(0, 7)}부터 현재까지</p>
          </div>

          <LineChart data={result.portfolioValues} title="포트폴리오 가치" />

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">납입 원금</div>
              <div className="stat-value">{formatKRW(result.totalInvested)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">현재 가치</div>
              <div className="stat-value highlight">{formatKRW(result.finalValue)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">총 수익률</div>
              <div className={`stat-value ${result.totalReturn >= 0 ? "pos" : "neg"}`}>
                {formatPct(result.totalReturn)}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">연 수익률</div>
              <div className={`stat-value ${result.cagr >= 0 ? "pos" : "neg"}`}>
                {formatPct(result.cagr)}
              </div>
            </div>
          </div>

          {!basic && (
            <div className="upgrade-banner">
              <span>베이직에서 전체 이벤트 및 여러 자산 동시 비교</span>
              <button className="btn-primary" onClick={() => setShowUpgrade(true)}>
                월 990원으로 시작
              </button>
            </div>
          )}
        </div>
      )}

      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}
