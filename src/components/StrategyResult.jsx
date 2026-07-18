import { useState, useEffect, useRef, useCallback } from "react";
import { loadPrices } from "../utils/dataLoader.js";
import {
  runStrategy,
  ALL_STRATEGIES,
  STRATEGY_LABELS,
  formatKRW,
  formatPct,
} from "../utils/calculator.js";
import { isBasic, consumeQuery, getQueryBalance, getStreakInfo, STREAK_BONUS } from "../utils/premium.js";
import { logClick } from "../utils/analytics.js";
import TickerSearch from "./TickerSearch.jsx";
import LineChart from "./LineChart.jsx";
import UpgradeModal from "./UpgradeModal.jsx";
import QueryGateModal from "./QueryGateModal.jsx";
import StrategyGuide from "./StrategyGuide.jsx";
import TickerInfoCard from "./TickerInfoCard.jsx";
import ShareSheet from "./ShareSheet.jsx";
import { APP_LINK } from "../utils/share.js";
import AdBanner from "./AdBanner.jsx";

function getPeriodDates(yearsBack) {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - yearsBack);
  return { start, end };
}

function makeSimShareText(ticker, result, monthlyAmount) {
  return `👑 주식적립왕 시뮬 결과\n\n${ticker} · ${Math.round(result.years)}년\n월 ${(monthlyAmount / 10000).toFixed(0)}만원 적립 →\n원금 ${formatKRW(result.totalInvested)} → ${formatKRW(result.finalValue)}\n수익률 ${formatPct(result.totalReturn)}`;
}

export default function StrategyResult({ initialTicker = null, onOpenTest = null }) {
  const [ticker, setTicker] = useState(initialTicker);
  const [monthlyAmount, setMonthlyAmount] = useState(300000);
  const [customStart, setCustomStart] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showQueryGate, setShowQueryGate] = useState(false);
  const [remaining, setRemaining] = useState(getQueryBalance());
  const [revealed, setRevealed] = useState(isBasic());
  const [showShare, setShowShare] = useState(false);
  const basic = isBasic();
  const autoRanRef = useRef(false);
  const streak = getStreakInfo();

  function handleReveal() {
    if (basic) { setRevealed(true); return; }
    if (consumeQuery()) {
      setRevealed(true);
      setRemaining(getQueryBalance());
    } else {
      setShowQueryGate(true);
    }
  }

  const run = useCallback(async () => {
    if (!ticker) return;
    logClick("sim_run", { ticker, amount: monthlyAmount });
    setLoading(true);
    setError(null);
    setRevealed(basic);
    try {
      const prices = await loadPrices(ticker);
      let startDate, endDate;
      if (customStart) {
        startDate = new Date(customStart + "-01");
        endDate = new Date();
      } else {
        const pd = getPeriodDates(5);
        startDate = pd.start;
        endDate = pd.end;
      }

      const allResults = ALL_STRATEGIES.map((s) =>
        runStrategy(prices, s, monthlyAmount, startDate, endDate)
      ).filter(Boolean);

      allResults.sort((a, b) => b.totalReturn - a.totalReturn);
      const benchmark = allResults.find((r) => r.strategy === "monthly-25") ?? null;
      setResults({ list: allResults, benchmark });
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

  // 공유 시트는 버튼 클릭으로만 열림 (검수 가이드: 바텀시트 자동 노출 금지)
  useEffect(() => {
    if (!results) setShowShare(false);
  }, [results]);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">적립 시뮬레이션</h1>
        <p className="page-subtitle">과거 데이터로 적립 전략별 수익률을 비교해요</p>
        {!basic && remaining !== Infinity && (
          <div className="quota-badge">
            남은 코인 {remaining}개
            <span className="streak-chip">
              {streak.bonusToday
                ? `🔥 ${streak.count}일 연속 · 보너스 +${STREAK_BONUS} 받음!`
                : streak.count >= 2
                  ? `🔥 ${streak.count}일 연속 · ${streak.daysToBonus}일 후 +${STREAK_BONUS}`
                  : `🔥 매일 오면 3일마다 +${STREAK_BONUS}`}
            </span>
          </div>
        )}
      </div>

      {onOpenTest && (
        <button className="itt-entry" onClick={() => { logClick("invtest_start", { from: "strategy_tab" }); onOpenTest(); }}>
          <span className="itt-entry-icon">🧭</span>
          <span className="itt-entry-text">
            <strong>나는 어떤 투자자일까?</strong>
            <span>8문항 투자성향 테스트 · 30초</span>
          </span>
          <span className="itt-entry-arrow">→</span>
        </button>
      )}

      <TickerSearch onSelect={(t) => { setTicker(t); setResults(null); setRevealed(basic); }} selected={ticker} />

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
            {basic ? (
              <input
                type="number"
                className="amount-input"
                value={monthlyAmount}
                min={10000}
                step={10000}
                onChange={(e) => setMonthlyAmount(Number(e.target.value))}
              />
            ) : (
              <button className="chip chip--locked" onClick={() => setShowUpgrade(true)}>
                직접 입력 🔒
              </button>
            )}
          </div>

          <div className="period-row">
            <label className="form-label">시작 연월</label>
            <input
              type="month"
              className="month-input"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
            <span className="period-hint">~ 현재 {!customStart && "(미입력 시 최근 5년)"}</span>
          </div>

          <button className="btn-primary run-btn" onClick={run} disabled={loading}>
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
              {customStart ? customStart + " ~ 현재" : "최근 5년"}
            </span>
          </h2>

          {results.list[0] && (() => {
            const best = results.list[0];
            const bm = results.benchmark;
            const toReturnPct = (pv) =>
              pv.map((d) => d.invested > 0 ? (d.value / d.invested - 1) * 100 : 0);
            return (
              <LineChart
                labels={best.portfolioValues.map((d) => d.date)}
                datasets={[
                  {
                    label: revealed ? STRATEGY_LABELS[best.strategy] : "최고 수익 전략",
                    data: toReturnPct(best.portfolioValues),
                    borderColor: "#3182F6",
                    backgroundColor: "rgba(49,130,246,0.1)",
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                  },
                  ...(bm && bm.strategy !== best.strategy ? [{
                    label: "월급날(25일) 기준",
                    data: toReturnPct(bm.portfolioValues),
                    borderColor: "rgba(150,150,150,0.6)",
                    borderDash: [5, 4],
                    backgroundColor: "transparent",
                    fill: false,
                    tension: 0.3,
                    pointRadius: 0,
                  }] : []),
                ]}
                yType="pct"
              />
            );
          })()}

          {/* 전략 공개 CTA */}
          {!revealed && (
            <div className="reveal-cta">
              <p className="reveal-hint">
                수익률을 확인했어요! 어떤 전략인지 보려면 코인 1개가 필요해요.
              </p>
              <button className="btn-primary reveal-btn" onClick={handleReveal}>
                🔓 전략 공개하기 (코인 1개)
              </button>
              <p className="reveal-balance">남은 코인 {remaining}개 · 광고 시청 시 +2개</p>
            </div>
          )}

          <div className="strategy-list">
            {results.list.map((r, idx) => {
              const isBest = idx === 0;
              const isWorst = idx === results.list.length - 1;
              const isBenchmark = r.strategy === "monthly-25";
              const delta = results.benchmark && !isBenchmark
                ? r.totalReturn - results.benchmark.totalReturn
                : null;

              return (
                <div
                  key={r.strategy}
                  className={`strategy-row${isBest ? " best" : ""}${isWorst ? " worst" : ""}${isBenchmark ? " benchmark" : ""}`}
                >
                  <div className="strategy-rank">
                    {isBenchmark ? "📅" : isBest ? "🥇" : `${idx + 1}`}
                  </div>
                  <div className="strategy-info">
                    <div className="strategy-name">
                      <span className={!revealed ? "name--blur" : ""}>
                        {STRATEGY_LABELS[r.strategy]}
                      </span>
                      {revealed && isBenchmark && <span className="benchmark-badge">월급날 기준</span>}
                    </div>
                    <div className="strategy-meta">
                      납입 {formatKRW(r.totalInvested)} →&nbsp;
                      <strong>{formatKRW(r.finalValue)}</strong>
                    </div>
                  </div>
                  <div className="strategy-return">
                    <div className={`return-pct ${r.totalReturn >= 0 ? "pos" : "neg"}`}>
                      {formatPct(r.totalReturn)}
                    </div>
                    {delta !== null
                      ? <div className={`vs-benchmark ${delta >= 0 ? "pos" : "neg"}`}>
                          월급날 대비 {delta >= 0 ? "+" : ""}{(delta * 100).toFixed(1)}%p
                        </div>
                      : <div className="cagr">연 {formatPct(r.cagr)}</div>
                    }
                  </div>
                </div>
              );
            })}
          </div>

          {results.list[0] && (
            <button className="ssheet-trigger" onClick={() => setShowShare(true)}>
              📤 결과 공유하기
            </button>
          )}

          <AdBanner className="ad-banner-results" />

          <StrategyGuide monthlyAmount={monthlyAmount} />

          {!basic && (
            <div className="upgrade-banner">
              <span>광고 지겨우세요? 베이직에서 광고 없이 무제한으로</span>
              <button className="btn-primary" onClick={() => setShowUpgrade(true)}>
                월 1,980원
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
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
      {showShare && results?.list?.[0] && (
        <ShareSheet
          text={makeSimShareText(ticker, results.list[0], monthlyAmount)}
          card={{
            title: `${ticker} · 월 ${(monthlyAmount / 10000).toFixed(0)}만원 적립`,
            period: `${Math.round(results.list[0].years)}년`,
            invested: results.list[0].totalInvested,
            finalValue: results.list[0].finalValue,
            returnPct: results.list[0].totalReturn,
            mdd: results.list[0].mdd,
            series: results.list[0].portfolioValues.map((v) => v.value),
          }}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
