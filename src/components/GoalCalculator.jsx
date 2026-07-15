import { useState, useCallback, useEffect, useRef } from "react";
import { loadPrices } from "../utils/dataLoader.js";
import { runStrategy, ALL_STRATEGIES, STRATEGY_LABELS, formatKRW, formatPct } from "../utils/calculator.js";
import { isBasic, consumeQuery, getQueryBalance } from "../utils/premium.js";
import { getTickerLabel } from "../utils/tickers.js";
import TickerSearch from "./TickerSearch.jsx";
import UpgradeModal from "./UpgradeModal.jsx";
import QueryGateModal from "./QueryGateModal.jsx";
import ShareSheet from "./ShareSheet.jsx";
import { APP_LINK } from "../utils/share.js";
import AdBanner from "./AdBanner.jsx";

const RANK_PERIODS = [
  { key: "1yr",  label: "1년",  years: 1  },
  { key: "3yr",  label: "3년",  years: 3  },
  { key: "5yr",  label: "5년",  years: 5  },
  { key: "10yr", label: "10년", years: 10 },
];

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
  const [goalAmount, setGoalAmount] = useState(100000000);
  const [years, setYears] = useState(10);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showQueryGate, setShowQueryGate] = useState(false);
  const [revealed, setRevealed] = useState(isBasic());
  const [remaining, setRemaining] = useState(getQueryBalance());
  const [goalRanking, setGoalRanking] = useState(null);
  const [rankPeriod, setRankPeriod] = useState("5yr");
  const [rankWithLeverage, setRankWithLeverage] = useState(false);
  const [autoRun, setAutoRun] = useState(false);
  const [revealedRankPeriods, setRevealedRankPeriods] = useState(() =>
    isBasic() ? new Set(["1yr", "3yr", "5yr", "10yr"]) : new Set(["5yr"])
  );
  const [showRankQueryGate, setShowRankQueryGate] = useState(false);
  const [pendingRankPeriod, setPendingRankPeriod] = useState(null);
  const [showShare, setShowShare] = useState(false);
  const [remindStatus, setRemindStatus] = useState(null);
  const resultRef = useRef(null);
  const basic = isBasic();

  useEffect(() => { setRemindStatus(null); }, [results]);

  // 계획 저장 + 토스 알림 수신 동의 요청
  async function handleRemind() {
    try {
      localStorage.setItem("stockjeokrib_goal_plan", JSON.stringify({
        ticker,
        goalAmount,
        years,
        requiredMonthly: Math.round(results[0].requiredMonthly),
        savedAt: new Date().toISOString(),
      }));
    } catch {}
    try {
      const { requestNotificationAgreement } = await import("@apps-in-toss/web-framework");
      await requestNotificationAgreement();
      setRemindStatus("✓ 알림 신청 완료");
    } catch {
      setRemindStatus("✓ 계획 저장 완료 · 알림은 토스 앱에서 지원돼요");
    }
  }

  function handleReveal() {
    if (basic) { setRevealed(true); return; }
    if (consumeQuery()) {
      setRevealed(true);
      setRemaining(getQueryBalance());
    } else {
      setShowQueryGate(true);
    }
  }

  function handleRankReveal(periodKey) {
    if (basic) { setRevealedRankPeriods((prev) => new Set([...prev, periodKey])); return; }
    if (consumeQuery()) {
      setRevealedRankPeriods((prev) => new Set([...prev, periodKey]));
      setRemaining(getQueryBalance());
    } else {
      setPendingRankPeriod(periodKey);
      setShowRankQueryGate(true);
    }
  }

  useEffect(() => {
    fetch("/goalRanking.json")
      .then((r) => r.json())
      .then(setGoalRanking)
      .catch(() => {});
  }, []);

  const run = useCallback(async () => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    setRevealed(basic);
    try {
      const prices = await loadPrices(ticker);
      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - years);

      const allResults = ALL_STRATEGIES.map((s) => {
        const required = findRequiredMonthly(prices, s, startDate, endDate, goalAmount);
        if (!required) return null;
        const r = runStrategy(prices, s, required, startDate, endDate);
        if (!r) return null;
        return { strategy: s, requiredMonthly: required, ...r };
      }).filter(Boolean);

      allResults.sort((a, b) => a.requiredMonthly - b.requiredMonthly);
      setResults(allResults);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      setTimeout(() => setShowShare(true), 1000);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [ticker, goalAmount, years]);

  useEffect(() => {
    if (autoRun && ticker) {
      setAutoRun(false);
      run();
    }
  }, [autoRun, run, ticker]);

  const handleRankSelect = (t, periodYears) => {
    setTicker(t);
    setGoalAmount(100000000);
    setYears(periodYears);
    setAutoRun(true);
  };

  const rankRows = goalRanking
    ? (goalRanking.rankings[rankPeriod]?.[rankWithLeverage ? "with" : "without"] ?? [])
    : [];

  const selectedPeriodYears = RANK_PERIODS.find((p) => p.key === rankPeriod)?.years ?? 5;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">목표 계산기</h1>
        <p className="page-subtitle">목표 금액 달성에 필요한 월 납입금을 역산해요</p>
        {!basic && remaining !== Infinity && (
          <div className="quota-badge">남은 코인 {remaining}개</div>
        )}
      </div>

      <div className="goal-ranking-section">
        <div className="goal-ranking-header">
          <div>
            <h2 className="goal-ranking-title">1억 달성 최소 월 납입금 랭킹</h2>
            <p className="goal-ranking-desc">과거 데이터 기준 · 매달 첫 거래일 적립</p>
          </div>
          <label className="leverage-toggle">
            <input
              type="checkbox"
              checked={rankWithLeverage}
              onChange={(e) => setRankWithLeverage(e.target.checked)}
            />
            <span>레버리지 포함</span>
          </label>
        </div>

        <div className="goal-period-tabs">
          {RANK_PERIODS.map(({ key, label }) => (
            <button
              key={key}
              className={`goal-period-tab${rankPeriod === key ? " active" : ""}`}
              onClick={() => setRankPeriod(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="goal-rank-list">
          {rankRows.slice(0, 10).map((row, i) => {
            const locked = !revealedRankPeriods.has(rankPeriod) && !basic;
            return (
              <div key={row.ticker} className="goal-rank-row">
                <span className="goal-rank-num">{i + 1}</span>
                <div className="goal-rank-ticker">
                  <span className={`goal-rank-name${locked ? " name--blur" : ""}`}>
                    {getTickerLabel(row.ticker)}
                  </span>
                </div>
                <div className="goal-rank-amount">
                  <span className="goal-rank-monthly">월 {formatKRW(row.monthlyRequired)}</span>
                  <span className="goal-rank-total">총 {formatKRW(row.totalInvested)}</span>
                </div>
                {!locked && (
                  <button
                    className="goal-rank-sim-btn"
                    onClick={() => handleRankSelect(row.ticker, selectedPeriodYears)}
                  >
                    시뮬
                  </button>
                )}
              </div>
            );
          })}
          {rankRows.length === 0 && (
            <p className="goal-rank-empty">데이터 로딩 중...</p>
          )}
        </div>
        {!revealedRankPeriods.has(rankPeriod) && !basic && (
          <div className="reveal-cta">
            <p className="reveal-hint">어떤 자산인지 보려면 코인 1개가 필요해요.</p>
            <button className="btn-primary reveal-btn" onClick={() => handleRankReveal(rankPeriod)}>
              🔓 코인 1개로 확인
            </button>
            <p className="reveal-balance">남은 코인 {remaining}개 · 광고 시청 시 +2개</p>
          </div>
        )}

        {rankWithLeverage && (
          <p className="leverage-warning">⚠️ 레버리지 ETF는 변동성이 크며 원금 손실 위험이 있습니다</p>
        )}
        {goalRanking?.updatedAt && (
          <p className="goal-rank-updated">기준일: {goalRanking.updatedAt} · 매주 업데이트</p>
        )}
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
        <div className="results-section" ref={resultRef}>
          <h2 className="section-title">
            {ticker}로 {formatKRW(goalAmount)} 만들기 ({years}년)
          </h2>

          {/* 전략 공개 CTA */}
          {!revealed && (
            <div className="reveal-cta">
              <p className="reveal-hint">
                필요 납입금을 확인했어요! 어떤 전략인지 보려면 코인 1개가 필요해요.
              </p>
              <button className="btn-primary reveal-btn" onClick={handleReveal}>
                🔓 전략 공개하기 (코인 1개)
              </button>
              <p className="reveal-balance">남은 코인 {remaining}개 · 광고 시청 시 +2개</p>
            </div>
          )}

          {results.map((r, idx) => (
            <div key={r.strategy} className={`strategy-row${idx === 0 ? " best" : ""}`}>
              <div className="strategy-rank">{idx === 0 ? "🥇" : idx + 1}</div>
              <div className="strategy-info">
                <div className={`strategy-name${!revealed ? " strategy-name--hidden" : ""}`}>
                  {revealed ? STRATEGY_LABELS[r.strategy] : "●●●●●●●●"}
                </div>
                <div className="strategy-meta">수익률 {formatPct(r.totalReturn)}</div>
              </div>
              <div className="strategy-return">
                <div className="stat-label">월 납입금</div>
                <div className="return-pct pos">{formatKRW(r.requiredMonthly)}</div>
              </div>
            </div>
          ))}

          {results[0] && (
            <div className="goal-remind">
              <p className="goal-remind-text">
                월 {formatKRW(Math.round(results[0].requiredMonthly))}씩 {years}년 —
                이 계획, 잊지 않게 알려드릴까요?
              </p>
              <button
                className="btn-primary goal-remind-btn"
                onClick={handleRemind}
                disabled={!!remindStatus}
              >
                {remindStatus ?? "📅 이 계획 매월 알림 받기"}
              </button>
            </div>
          )}

          {results[0] && (
            <button className="ssheet-trigger" onClick={() => setShowShare(true)}>
              📤 결과 공유하기
            </button>
          )}

          <AdBanner className="ad-banner-results" />

          {!isBasic() && (
            <div className="upgrade-banner">
              <span>광고 지겨우세요? 베이직에서 광고 없이 무제한으로</span>
              <button className="btn-primary" onClick={() => setShowUpgrade(true)}>
                월 1,990원
              </button>
            </div>
          )}
        </div>
      )}

      {showQueryGate && (
        <QueryGateModal
          onClose={() => setShowQueryGate(false)}
          onEarned={() => handleReveal()}
          onUpgrade={() => setShowUpgrade(true)}
        />
      )}
      {showRankQueryGate && (
        <QueryGateModal
          onClose={() => { setShowRankQueryGate(false); setPendingRankPeriod(null); }}
          onEarned={() => {
            if (pendingRankPeriod) {
              setRevealedRankPeriods((prev) => new Set([...prev, pendingRankPeriod]));
              setPendingRankPeriod(null);
            }
            setShowRankQueryGate(false);
          }}
          onUpgrade={() => setShowUpgrade(true)}
        />
      )}
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
      {showShare && results?.[0] && (
        <ShareSheet
          text={`💡 ${ticker}로 ${formatKRW(goalAmount)} 만들기 (${years}년)\n월 최소 ${formatKRW(Math.round(results[0].requiredMonthly))} 필요\n수익률 ${formatPct(results[0].totalReturn)}`}
          card={{
            title: `${ticker}로 ${formatKRW(goalAmount)} 만들기`,
            period: `월 ${formatKRW(Math.round(results[0].requiredMonthly))} × ${years}년`,
            invested: results[0].totalInvested,
            finalValue: results[0].finalValue,
            returnPct: results[0].totalReturn,
            mdd: results[0].mdd,
            series: results[0].portfolioValues.map((v) => v.value),
          }}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
