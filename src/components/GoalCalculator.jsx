import { useState, useCallback } from "react";
import { loadPrices } from "../utils/dataLoader.js";
import { runStrategy, ALL_STRATEGIES, STRATEGY_LABELS, formatKRW, formatPct } from "../utils/calculator.js";
import { isBasic, consumeFreeQuery } from "../utils/premium.js";
import TickerSearch from "./TickerSearch.jsx";
import UpgradeModal from "./UpgradeModal.jsx";

const FREE_YEARS = 5;

// Given a target final value, find required monthly investment
// using binary search on runStrategy
function findRequiredMonthly(prices, strategy, startDate, endDate, targetValue) {
  let lo = 1000, hi = 100000000;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const r = runStrategy(prices, strategy, mid, startDate, endDate);
    if (!r) return null;
    if (r.finalValue < targetValue) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export default function GoalCalculator() {
  const [ticker, setTicker] = useState(null);
  const [goalAmount, setGoalAmount] = useState(100000000); // 1억
  const [years, setYears] = useState(10);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const basic = isBasic();

  const run = useCallback(async () => {
    if (!ticker) return;
    if (!consumeFreeQuery()) { setShowUpgrade(true); return; }
    setLoading(true);
    setError(null);
    try {
      const prices = await loadPrices(ticker);
      const endDate = new Date();
      const startDate = new Date();
      const useYears = basic ? years : Math.min(years, FREE_YEARS);
      startDate.setFullYear(startDate.getFullYear() - useYears);

      // For each strategy, find required monthly amount
      const strategies = basic ? ALL_STRATEGIES : ["monthly-first"];
      const allResults = strategies.map((s) => {
        const required = findRequiredMonthly(prices, s, startDate, endDate, goalAmount);
        if (!required) return null;
        const r = runStrategy(prices, s, required, startDate, endDate);
        if (!r) return null;
        return { strategy: s, requiredMonthly: required, ...r };
      }).filter(Boolean);

      allResults.sort((a, b) => a.requiredMonthly - b.requiredMonthly);
      setResults(allResults);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [ticker, goalAmount, years, basic]);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">목표 계산기</h1>
        <p className="page-subtitle">목표 금액 달성에 필요한 월 납입금을 역산해요</p>
      </div>

      <div className="form-section">
        <label className="form-label">목표 금액</label>
        <div className="amount-row">
          {[50000000, 100000000, 300000000, 1000000000].map((v) => (
            <button
              key={v}
              className={`chip${goalAmount === v ? " active" : ""}`}
              onClick={() => setGoalAmount(v)}
            >
              {v >= 1e8 ? `${v / 1e8}억` : `${v / 1e4}만`}
            </button>
          ))}
          <input
            type="number"
            className="amount-input"
            value={goalAmount}
            min={1000000}
            step={1000000}
            onChange={(e) => setGoalAmount(Number(e.target.value))}
          />
        </div>

        <label className="form-label">기간</label>
        <div className="amount-row">
          {[5, 10, 20, 30].map((y) => (
            <button
              key={y}
              className={`chip${years === y ? " active" : ""}`}
              onClick={() => setYears(y)}
            >
              {y}년
            </button>
          ))}
          {!basic && <span className="period-hint">(무료: 최대 5년)</span>}
        </div>

        <label className="form-label">자산 선택</label>
        <TickerSearch onSelect={setTicker} selected={ticker} />

        {ticker && (
          <button className="btn-primary run-btn" onClick={run} disabled={loading}>
            {loading ? "계산 중..." : "역산하기"}
          </button>
        )}
      </div>

      {error && <p className="error-msg">{error}</p>}

      {results && (
        <div className="results-section">
          <h2 className="section-title">
            {ticker}로 {formatKRW(goalAmount)} 만들기
            ({basic ? years : Math.min(years, FREE_YEARS)}년)
          </h2>

          {results.map((r, idx) => {
            const isBlurred = !basic && idx > 0;
            return (
              <div key={r.strategy} className={`strategy-row${isBlurred ? " blurred" : ""}${idx === 0 ? " best" : ""}`}>
                <div className="strategy-rank">{idx === 0 ? "🥇" : idx + 1}</div>
                <div className="strategy-info">
                  <div className="strategy-name">{STRATEGY_LABELS[r.strategy]}</div>
                  <div className="strategy-meta">
                    수익률 {formatPct(r.totalReturn)}
                  </div>
                </div>
                <div className="strategy-return">
                  <div className="stat-label">월 납입금</div>
                  <div className="return-pct pos">{formatKRW(r.requiredMonthly)}</div>
                </div>
                {isBlurred && (
                  <div className="blur-overlay">
                    <button className="btn-primary blur-cta" onClick={() => setShowUpgrade(true)}>
                      베이직에서 전체 보기
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {!basic && (
            <div className="upgrade-banner">
              <span>베이직에서 기간 30년까지, 여러 자산 비교 가능</span>
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
