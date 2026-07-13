import { useState, useEffect } from "react";
import { STRATEGY_LABELS } from "../utils/calculator.js";
import { getTickerLabel } from "../utils/tickers.js";
import { isBasic, consumeQuery, getQueryBalance } from "../utils/premium.js";
import QueryGateModal from "./QueryGateModal.jsx";

const COIN_SHORT = ["1mo", "3mo", "6mo"];
const COIN_MID = ["1yr", "2yr", "3yr", "4yr", "5yr"];
const FREE_LONG = ["6yr", "7yr", "8yr", "9yr", "10yr"];
const COIN_PERIODS = new Set([...COIN_SHORT, ...COIN_MID]);
const SHORT_PERIODS = new Set(COIN_SHORT);

const PERIOD_LABELS = {
  "1mo": "지난 1달", "3mo": "지난 3달", "6mo": "지난 6달",
  "1yr": "지난 1년", "2yr": "지난 2년", "3yr": "지난 3년",
  "4yr": "지난 4년", "5yr": "지난 5년",
  "6yr": "지난 6년", "7yr": "지난 7년", "8yr": "지난 8년",
  "9yr": "지난 9년", "10yr": "지난 10년",
};

export default function FeaturedCombos({ onComboSelect }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [withLeverage, setWithLeverage] = useState(false);
  const [revealedPeriods, setRevealedPeriods] = useState(new Set());
  const [showQueryGate, setShowQueryGate] = useState(false);
  const [pendingPeriod, setPendingPeriod] = useState(null);
  const basic = isBasic();

  useEffect(() => {
    fetch("/featuredCombos.json")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function handleReveal(periodKey) {
    if (basic) { setRevealedPeriods((prev) => new Set([...prev, periodKey])); return; }
    if (consumeQuery()) {
      setRevealedPeriods((prev) => new Set([...prev, periodKey]));
    } else {
      setPendingPeriod(periodKey);
      setShowQueryGate(true);
    }
  }

  function isLocked(periodKey) {
    if (basic) return false;
    if (!COIN_PERIODS.has(periodKey)) return false;
    return !revealedPeriods.has(periodKey);
  }

  if (loading) return <p className="loading-state" style={{ padding: "24px 0" }}>추천 조합 불러오는 중...</p>;
  if (!data) return null;

  const lKey = withLeverage ? "with" : "without";

  function ComboCard({ periodKey }) {
    const locked = isLocked(periodKey);
    const combo = data.combos[periodKey]?.[lKey];
    if (!combo || combo.tickers.length === 0) return null;
    const pct = combo.combinedCagr * 100;
    const isShort = SHORT_PERIODS.has(periodKey);

    return (
      <div className={`fc-card${locked ? " fc-card--locked" : ""}`}>
        <div className="fc-card-header">
          <span className="fc-period-label">{PERIOD_LABELS[periodKey]}</span>
          {locked && <span className="fc-badge">🔒 코인</span>}
        </div>
        <div className="fc-cagr">
          <span className="fc-cagr-num">{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span>
          <span className="fc-cagr-hint">연환산{isShort ? " · 단기 변동 큼" : ""}</span>
        </div>
        <div className="fc-rows">
          {combo.tickers.map((ticker, i) => (
            <div key={ticker} className="fc-row">
              <span className={`fc-row-ticker${locked ? " name--blur" : ""}`}>
                {getTickerLabel(ticker)}
              </span>
              <span className="fc-row-strategy">{STRATEGY_LABELS[combo.strategies[i]] ?? combo.strategies[i]}</span>
              <span className="fc-row-cagr">
                {(combo.cagrs[i] * 100) >= 0 ? "+" : ""}{(combo.cagrs[i] * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
        {locked && (
          <button className="btn-primary fc-reveal-btn" onClick={() => handleReveal(periodKey)}>
            🔓 티커 공개하기 (코인 1개)
          </button>
        )}
        {!locked && onComboSelect && (
          <button
            className="fc-chart-btn"
            onClick={() => onComboSelect(combo.tickers, combo.strategies, periodKey, !COIN_PERIODS.has(periodKey))}
          >
            차트로 보기
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="featured-combos">
      <div className="fc-toggle">
        <button
          className={`fc-toggle-btn${!withLeverage ? " fc-toggle-btn--on" : ""}`}
          onClick={() => setWithLeverage(false)}
        >레버리지 제외</button>
        <button
          className={`fc-toggle-btn${withLeverage ? " fc-toggle-btn--on" : ""}`}
          onClick={() => setWithLeverage(true)}
        >레버리지 포함</button>
      </div>

      <div className="fc-section">
        <p className="fc-section-title">단기 랭킹</p>
        {COIN_SHORT.map((k) => <ComboCard key={k} periodKey={k} />)}
      </div>

      <div className="fc-section">
        <p className="fc-section-title">중기 랭킹</p>
        {COIN_MID.map((k) => <ComboCard key={k} periodKey={k} />)}
      </div>

      <div className="fc-section">
        <p className="fc-section-title fc-section-title--main">기간별 최고 조합</p>
        {FREE_LONG.map((k) => <ComboCard key={k} periodKey={k} />)}
      </div>

      <p className="fc-updated">기준일: {data.updatedAt} · 매주 업데이트</p>

      {showQueryGate && (
        <QueryGateModal
          onClose={() => { setShowQueryGate(false); setPendingPeriod(null); }}
          onEarned={() => {
            if (pendingPeriod) {
              setRevealedPeriods((prev) => new Set([...prev, pendingPeriod]));
              setPendingPeriod(null);
            }
            setShowQueryGate(false);
          }}
        />
      )}
    </div>
  );
}
