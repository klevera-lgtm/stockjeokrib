import React, { useState, useEffect, useRef, useCallback } from "react";
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
import { getTickerLabel } from "../utils/tickers.js";

const RECENT_KEY = "ait_recent_tickers";
const MAX_RECENT = 5;
function loadRecent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; } }
function saveRecent(ticker) {
  const list = loadRecent().filter(t => t !== ticker);
  list.unshift(ticker);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT))); } catch {}
}
import LineChart from "./LineChart.jsx";
import UpgradeModal from "./UpgradeModal.jsx";
import QueryGateModal from "./QueryGateModal.jsx";
import StrategyGuide from "./StrategyGuide.jsx";
import TickerInfoCard from "./TickerInfoCard.jsx";
import ShareSheet from "./ShareSheet.jsx";
import { APP_LINK } from "../utils/share.js";
import AdBanner from "./AdBanner.jsx";
import StrategyScorecard from "./StrategyScorecard.jsx";

function getPeriodDates(yearsBack) {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - yearsBack);
  return { start, end };
}

function makeSimShareText(ticker, result, monthlyAmount) {
  return `👑 주식적립왕 시뮬 결과\n\n${ticker} · ${Math.round(result.years)}년\n월 ${(monthlyAmount / 10000).toFixed(0)}만원 적립 →\n원금 ${formatKRW(result.totalInvested)} → ${formatKRW(result.finalValue)}\n수익률 ${formatPct(result.totalReturn)}`;
}

export default function StrategyResult({ initialTicker = null, onOpenTest = null, onNavigate = null, embedded = false }) {
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
  const [has10yr, setHas10yr] = useState(false);
  const [chartIdx, setChartIdx] = useState(0);
  const basic = isBasic();
  const autoRanRef = useRef(false);
  const formRef = useRef(null);
  const chartRef = useRef(null);
  const [chartFlash, setChartFlash] = useState(false);
  const streak = getStreakInfo();

  useEffect(() => {
    if (!ticker) { setHas10yr(false); return; }
    let cancelled = false;
    loadPrices(ticker).then((p) => {
      if (cancelled) return;
      const tenYearsAgo = new Date();
      tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
      setHas10yr(p.length > 0 && p[0].date <= tenYearsAgo);
    }).catch(() => { if (!cancelled) setHas10yr(false); });
    return () => { cancelled = true; };
  }, [ticker]);

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
    saveRecent(ticker);
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
      const benchmark = allResults.find((r) => r.strategy === "daily") ?? null;
      setChartIdx(0);
      setResults({ list: allResults, benchmark });
      setTimeout(() => chartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
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
      {!embedded && (
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
                    : `🔥 이틀마다 +1 · 7일 연속 +${STREAK_BONUS}`}
              </span>
            </div>
          )}
        </div>
      )}

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

      {!embedded && (
        <TickerSearch onSelect={(t) => { setTicker(t); setResults(null); setRevealed(basic); setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150); }} selected={ticker} />
      )}

      {!embedded && (() => {
        const recent = loadRecent().filter(t => t !== ticker);
        return recent.length > 0 && (
          <div className="recent-tickers">
            <span className="recent-label">최근 분석</span>
            {recent.map(t => (
              <button key={t} className="recent-chip" onClick={() => { setTicker(t); setResults(null); setRevealed(basic); }}>
                {t} <span className="recent-chip-name">{getTickerLabel(t) !== t ? getTickerLabel(t) : ""}</span>
              </button>
            ))}
          </div>
        );
      })()}

      {ticker && !embedded && <TickerInfoCard ticker={ticker} />}

      {ticker && (
        <div className="form-section" ref={formRef}>
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
            <span className="period-hint">
              ~ 현재 {!customStart && <span className="period-badge">기본 최근 5년</span>}
            </span>
          </div>

          <button className="btn-primary run-btn" onClick={run} disabled={loading}>
            {loading ? "계산 중..." : `${ticker} 전략 분석하기`}
          </button>

          <StrategyScorecard
            key={ticker}
            tickers={[ticker]}
            weights={{ [ticker]: 100 }}
            monthlyAmount={monthlyAmount}
            has10yr={has10yr}
            onNeedUpgrade={() => setShowUpgrade(true)}
          />
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
          <span className="tx-fee-badge">💰 거래 비용 0.35% 반영</span>

          {results.list[chartIdx] && (() => {
            const selected = results.list[chartIdx];
            const bm = results.benchmark;
            const toReturnPct = (pv) =>
              pv.map((d) => d.invested > 0 ? (d.value / d.invested - 1) * 100 : 0);
            return (
              <div ref={chartRef} className={`chart-highlight-wrap${chartFlash ? " chart-flash" : ""}`}>
              <div className="chart-selected-label">📊 {STRATEGY_LABELS[selected.strategy]}</div>
              <LineChart
                labels={selected.portfolioValues.map((d) => d.date)}
                datasets={[
                  {
                    label: STRATEGY_LABELS[selected.strategy],
                    data: toReturnPct(selected.portfolioValues),
                    borderColor: "#3182F6",
                    backgroundColor: "rgba(49,130,246,0.1)",
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                  },
                  ...(bm && bm.strategy !== selected.strategy ? [{
                    label: "매일 적립 기준",
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
              </div>
            );
          })()}

          {!revealed && (() => {
            const top = results.list[0];
            const bm = results.benchmark;
            const delta = bm && top.strategy !== bm.strategy ? top.totalReturn - bm.totalReturn : null;
            return (
              <>
                <div className="top-strategy-card">
                  <span className="top-strategy-badge">🥇 이 종목 최고 적립 전략</span>
                  <div className="top-strategy-name">{STRATEGY_LABELS[top.strategy]}</div>
                  <div className={`top-strategy-return ${top.totalReturn >= 0 ? "pos" : "neg"}`}>
                    {formatPct(top.totalReturn)}
                  </div>
                  <div className="top-strategy-meta">
                    납입 {formatKRW(top.totalInvested)} → <strong>{formatKRW(top.finalValue)}</strong> · 연 {formatPct(top.cagr)}
                  </div>
                  {delta !== null && (
                    <div className={`top-strategy-delta ${delta >= 0 ? "pos" : "neg"}`}>
                      매일 적립 대비 {delta >= 0 ? "+" : ""}{(delta * 100).toFixed(1)}%p
                    </div>
                  )}
                </div>
                <div className="reveal-cta">
                  <p className="reveal-hint">나머지 전략 순위도 궁금하다면?</p>
                  <button className="btn-primary reveal-btn" onClick={handleReveal}>
                    🔓 전체 순위 보기 (코인 1개)
                  </button>
                  <p className="reveal-balance">남은 코인 {remaining}개 · 광고 시청 시 +2개</p>
                </div>
              </>
            );
          })()}

          {revealed && (
            <div className="strategy-list">
              {results.list.map((r, idx) => {
                const isBest = idx === 0;
                const isWorst = idx === results.list.length - 1;
                const isBenchmark = r.strategy === "daily";
                const delta = results.benchmark && !isBenchmark
                  ? r.totalReturn - results.benchmark.totalReturn
                  : null;

                return (
                  <React.Fragment key={r.strategy}>
                  {(idx === 5 || idx === 10) && <AdBanner className="ad-banner-inline" />}
                  <div
                    className={`strategy-row${isBest ? " best" : ""}${isWorst ? " worst" : ""}${isBenchmark ? " benchmark" : ""}${idx === chartIdx ? " strategy-row--selected" : ""}`}
                    onClick={() => { setChartIdx(idx); setChartFlash(true); setTimeout(() => setChartFlash(false), 600); chartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}
                  >
                    <div className="strategy-rank">
                      {isBenchmark ? "📅" : isBest ? "🥇" : `${idx + 1}`}
                    </div>
                    <div className="strategy-info">
                      <div className="strategy-name">
                        {STRATEGY_LABELS[r.strategy]}
                        {isBenchmark && <span className="benchmark-badge">매일 적립</span>}
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
                            매일 적립 대비 {delta >= 0 ? "+" : ""}{(delta * 100).toFixed(1)}%p
                          </div>
                        : <div className="cagr">연 {formatPct(r.cagr)}</div>
                      }
                    </div>
                  </div>
                  </React.Fragment>
                );
              })}
            </div>
          )}

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
      {onNavigate && (
        <button className="cross-link" onClick={() => onNavigate("dividend", "ranking")}>
          <span className="cross-link-icon">💰</span>
          <div className="cross-link-text">
            <strong>배당 투자도 확인해보세요</strong>
            <span>배당 랭킹, 월배당 캘린더, 은퇴 계산기까지</span>
          </div>
          <span className="cross-link-arrow">→</span>
        </button>
      )}

      {!results && <AdBanner className="ad-banner-results" />}
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
            strategies: revealed
              ? [`${ticker} · ${STRATEGY_LABELS[results.list[0].strategy]}`]
              : undefined,
          }}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
