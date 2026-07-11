import { useState, useEffect } from "react";
import { STRATEGY_LABELS } from "../utils/calculator.js";
import { getTickerLabel } from "../utils/tickers.js";
import { isBasic } from "../utils/premium.js";

const FREE_PERIODS = ["1yr", "2yr", "3yr", "4yr", "5yr"];
const BASIC_SHORT = ["1mo", "3mo", "6mo"];
const BASIC_LONG = ["6yr", "7yr", "8yr", "9yr", "10yr"];
const SHORT_PERIODS = new Set(["1mo", "3mo", "6mo"]);

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
  const basic = isBasic();

  useEffect(() => {
    fetch("/featuredCombos.json")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <p className="loading-state" style={{ padding: "24px 0" }}>추천 조합 불러오는 중...</p>;
  if (!data) return null;

  const lKey = withLeverage ? "with" : "without";

  function ComboCard({ periodKey, locked }) {
    const combo = data.combos[periodKey]?.[lKey];
    if (!combo || combo.tickers.length === 0) return null;
    const pct = combo.combinedCagr * 100;
    const isShort = SHORT_PERIODS.has(periodKey);

    return (
      <div className={`fc-card${locked ? " fc-card--locked" : ""}`}>
        <div className="fc-card-header">
          <span className="fc-period-label">{PERIOD_LABELS[periodKey]}</span>
          {locked && <span className="fc-badge">🔒 베이직</span>}
        </div>
        <div className="fc-cagr">
          <span className="fc-cagr-num">{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span>
          <span className="fc-cagr-hint">연환산{isShort ? " · 단기 변동 큼" : ""}</span>
        </div>
        <div className="fc-rows-wrap">
          <div className={`fc-rows${locked ? " fc-rows--blur" : ""}`}>
            {combo.tickers.map((ticker, i) => (
              <div key={ticker} className="fc-row">
                <span className="fc-row-ticker">{getTickerLabel(ticker)}</span>
                <span className="fc-row-strategy">{STRATEGY_LABELS[combo.strategies[i]] ?? combo.strategies[i]}</span>
                <span className="fc-row-cagr">
                  {(combo.cagrs[i] * 100) >= 0 ? "+" : ""}{(combo.cagrs[i] * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
          {locked && (
            <div className="fc-overlay">
              <p className="fc-overlay-msg">베이직에서 어떤 종목인지 확인하세요</p>
            </div>
          )}
        </div>
        {!locked && onComboSelect && (
          <button
            className="fc-chart-btn"
            onClick={() => onComboSelect(combo.tickers, combo.strategies, periodKey)}
          >
            차트로 보기
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="featured-combos">
      {/* 레버리지 토글 */}
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

      {/* 단기 (베이직) */}
      <div className="fc-section">
        <p className="fc-section-title">
          단기 랭킹
          {!basic && <span className="fc-section-badge">베이직</span>}
        </p>
        {BASIC_SHORT.map((k) => <ComboCard key={k} periodKey={k} locked={!basic} />)}
      </div>

      {/* 무료 공개 */}
      <div className="fc-section">
        <p className="fc-section-title">기간별 최고 조합</p>
        {FREE_PERIODS.map((k) => <ComboCard key={k} periodKey={k} locked={false} />)}
      </div>

      {/* 장기 (베이직) */}
      <div className="fc-section">
        <p className="fc-section-title">
          장기 랭킹
          {!basic && <span className="fc-section-badge">베이직</span>}
        </p>
        {BASIC_LONG.map((k) => <ComboCard key={k} periodKey={k} locked={!basic} />)}
      </div>

      <p className="fc-updated">기준일: {data.updatedAt} · 매주 업데이트</p>
    </div>
  );
}
