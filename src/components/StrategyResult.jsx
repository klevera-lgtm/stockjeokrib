import { useState, useEffect, useRef, useCallback } from "react";
import { loadPrices } from "../utils/dataLoader.js";
import {
  runStrategy,
  ALL_STRATEGIES,
  STRATEGY_LABELS,
  formatKRW,
  formatPct,
} from "../utils/calculator.js";
import { isBasic, consumeFreeQuery, getRemainingFreeQueries } from "../utils/premium.js";
import TickerSearch from "./TickerSearch.jsx";
import LineChart from "./LineChart.jsx";
import UpgradeModal from "./UpgradeModal.jsx";
import StrategyGuide from "./StrategyGuide.jsx";
import TickerInfoCard from "./TickerInfoCard.jsx";

const FREE_YEARS = 5;

function getPeriodDates(yearsBack) {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - yearsBack);
  return { start, end };
}

function ShareCard({ ticker, strategy, result, monthlyAmount }) {
  function copyShare() {
    const text = `👑 주식적립왕 시뮬레이션 결과\n\n${ticker} · ${STRATEGY_LABELS[strategy]} · ${Math.round(result.years)}년\n월 ${monthlyAmount.toLocaleString()}원 적립 시\n\n납입 원금: ${formatKRW(result.totalInvested)}\n현재 가치: ${formatKRW(result.finalValue)}\n수익률: ${formatPct(result.totalReturn)} (${formatKRW(result.finalValue - result.totalInvested)})\n\n나도 계산해보기 → 주식적립왕 (토스)`;
    if (navigator.share) {
      navigator.share({ text });
    } else {
      navigator.clipboard.writeText(text);
      alert("클립보드에 복사되었습니다.");
    }
  }
  return (
    <button className="btn-secondary share-btn" onClick={copyShare}>
      공유하기
    </button>
  );
}

export default function StrategyResult({ initialTicker = null }) {
  const [ticker, setTicker] = useState(initialTicker);
  const [monthlyAmount, setMonthlyAmount] = useState(300000);
  const [customStart, setCustomStart] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [remaining, setRemaining] = useState(getRemainingFreeQueries());
  const basic = isBasic();
  const autoRanRef = useRef(false);

  const run = useCallback(async () => {
    if (!ticker) return;
    if (!consumeFreeQuery()) {
      setShowUpgrade(true);
      return;
    }
    setRemaining(getRemainingFreeQueries());
    setLoading(true);
    setError(null);
    try {
      const prices = await loadPrices(ticker);
      let startDate, endDate;
      if (basic && customStart) {
        startDate = new Date(customStart + "-01");
        endDate = new Date();
      } else {
        const pd = getPeriodDates(FREE_YEARS);
        startDate = pd.start;
        endDate = pd.end;
      }

      const allResults = ALL_STRATEGIES.map((s) =>
        runStrategy(prices, s, monthlyAmount, startDate, endDate)
      ).filter(Boolean);

      allResults.sort((a, b) => b.totalReturn - a.totalReturn);
      setResults(allResults);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [ticker, monthlyAmount, customStart, basic]);

  useEffect(() => {
    if (initialTicker && !autoRanRef.current) {
      autoRanRef.current = true;
      run();
    }
  }, [initialTicker, run]);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">적립 시뮬레이션</h1>
        <p className="page-subtitle">과거 데이터로 적립 전략별 수익률을 비교해요</p>
        {!basic && (
          <div className="quota-badge">오늘 남은 무료 조회 {remaining}회</div>
        )}
      </div>

      <TickerSearch onSelect={setTicker} selected={ticker} />

      {ticker && <TickerInfoCard ticker={ticker} />}

      {ticker && (
        <div className="form-section">
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
            <input
              type="number"
              className="amount-input"
              value={monthlyAmount}
              min={10000}
              step={10000}
              onChange={(e) => setMonthlyAmount(Number(e.target.value))}
            />
          </div>

          {basic ? (
            <div className="period-row">
              <label className="form-label">시작 연월</label>
              <input
                type="month"
                className="month-input"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
              <span className="period-hint">~ 현재</span>
            </div>
          ) : (
            <p className="period-fixed">기간: 최근 5년 (무료 고정)</p>
          )}

          <button
            className="btn-primary run-btn"
            onClick={run}
            disabled={loading}
          >
            {loading ? "계산 중..." : `${ticker} 전략 분석하기`}
          </button>
        </div>
      )}

      {error && <p className="error-msg">{error}</p>}

      {results && (
        <div className="results-section">
          <h2 className="section-title">
            {ticker} 전략별 수익률 순위
            <span className="period-label">
              {basic && customStart ? customStart + " ~ 현재" : "최근 5년"}
            </span>
          </h2>

          {/* Chart for best strategy */}
          {results[0] && (
            <LineChart
              data={results[0].portfolioValues}
              title={`${STRATEGY_LABELS[results[0].strategy]} 포트폴리오`}
            />
          )}

          <div className="strategy-list">
            {results.map((r, idx) => {
              const isBlurred = !basic && idx !== 0 && idx !== results.length - 1;
              const isBest = idx === 0;
              const isWorst = idx === results.length - 1;

              return (
                <div
                  key={r.strategy}
                  className={`strategy-row${isBlurred ? " blurred" : ""}${isBest ? " best" : ""}${isWorst ? " worst" : ""}`}
                >
                  <div className="strategy-rank">
                    {isBest ? "🥇" : isWorst && !basic ? "🔻" : `${idx + 1}`}
                  </div>
                  <div className="strategy-info">
                    <div className="strategy-name">{STRATEGY_LABELS[r.strategy]}</div>
                    <div className="strategy-meta">
                      납입 {formatKRW(r.totalInvested)} →&nbsp;
                      <strong>{formatKRW(r.finalValue)}</strong>
                    </div>
                  </div>
                  <div className="strategy-return">
                    <div
                      className={`return-pct ${r.totalReturn >= 0 ? "pos" : "neg"}`}
                    >
                      {formatPct(r.totalReturn)}
                    </div>
                    <div className="cagr">연 {formatPct(r.cagr)}</div>
                  </div>
                  {isBlurred && (
                    <div className="blur-overlay">
                      <button
                        className="btn-primary blur-cta"
                        onClick={() => setShowUpgrade(true)}
                      >
                        베이직에서 전체 보기
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Share card for best strategy */}
          {results[0] && (
            <ShareCard
              ticker={ticker}
              strategy={results[0].strategy}
              result={results[0]}
              monthlyAmount={monthlyAmount}
            />
          )}

          <StrategyGuide monthlyAmount={monthlyAmount} />

          {!basic && (
            <div className="upgrade-banner">
              <span>베이직에서 전체 전략 순위, 최적 시작 시점 분석까지</span>
              <button
                className="btn-primary"
                onClick={() => setShowUpgrade(true)}
              >
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
