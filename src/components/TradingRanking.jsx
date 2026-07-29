import { useState, useCallback } from "react";
import TickerSearch from "./TickerSearch.jsx";
import BacktestChart from "./BacktestChart.jsx";
import AdBanner from "./AdBanner.jsx";
import QueryGateModal from "./QueryGateModal.jsx";
import { loadPrices } from "../utils/dataLoader.js";
import { getTickerLabel } from "../utils/tickers.js";
import { consumeQueries, getQueryBalance, isBasic } from "../utils/premium.js";
import { logClick } from "../utils/analytics.js";
import {
  backtestMA, backtestRSI, backtestMACD, backtestDualMA, backtestBollinger,
  filterByPeriod, buyAndHold, strategyLabel, calcCAGR,
  MA_PERIODS, RSI_COMBOS, DUAL_MA_COMBOS, BOLLINGER_COMBOS, BACKTEST_PERIODS,
} from "../utils/tradingEngine.js";

const ALPHA_COST = 5;
const ALPHA_THRESHOLD = 3;

function buildStrategies() {
  const list = [];
  for (const p of MA_PERIODS)
    list.push({ type: "ma", params: { period: p }, fn: (pr) => backtestMA(pr, p) });
  for (const c of RSI_COMBOS)
    list.push({ type: "rsi", params: c, fn: (pr) => backtestRSI(pr, c) });
  list.push({ type: "macd", params: {}, fn: (pr) => backtestMACD(pr) });
  for (const d of DUAL_MA_COMBOS)
    list.push({ type: "dualma", params: { short: d.short, long: d.long }, fn: (pr) => backtestDualMA(pr, d.short, d.long) });
  for (const b of BOLLINGER_COMBOS)
    list.push({ type: "bollinger", params: b, fn: (pr) => backtestBollinger(pr, b) });
  return list;
}

const STRATEGIES = buildStrategies();

export default function TradingRanking({ onCoinsChanged, onNavigate }) {
  const [ticker, setTicker] = useState(null);
  const [period, setPeriod] = useState(BACKTEST_PERIODS[2]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState(0);
  const [showGate, setShowGate] = useState(false);
  const basic = isBasic();

  const findAlpha = useCallback(async (t, p) => {
    setLoading(true);
    setProgress(0);
    setRevealed(false);
    setResult(null);

    try {
      const raw = await loadPrices(t);
      const filtered = filterByPeriod(raw, p.years);
      if (filtered.length < 50) { setLoading(false); return; }

      const bh = buyAndHold(filtered);
      const bhCAGR = calcCAGR(bh.returnPct, p.years);
      const alphas = [];

      for (let i = 0; i < STRATEGIES.length; i++) {
        const s = STRATEGIES[i];
        try {
          const r = s.fn(filtered);
          if (r.tradeCount < 3) continue;
          const cagr = calcCAGR(r.totalReturn, p.years);
          const excess = cagr - bhCAGR;
          if (excess >= ALPHA_THRESHOLD) {
            alphas.push({
              type: s.type, params: s.params,
              label: strategyLabel(s.type, s.params),
              totalReturn: r.totalReturn, cagr, excess,
              totalExcess: r.totalReturn - bh.returnPct,
              winRate: r.winRate, mdd: r.mdd, tradeCount: r.tradeCount,
              trades: r.trades,
            });
          }
        } catch {}
        setProgress(Math.round(((i + 1) / STRATEGIES.length) * 100));
      }

      alphas.sort((a, b) => b.excess - a.excess);
      setExpandedIdx(0);
      setResult({ bh, bhCAGR, alphas, prices: filtered });
      logClick("alpha_search", { ticker: t, period: p.years, found: alphas.length });
    } catch {}
    setLoading(false);
  }, []);

  function handleReveal() {
    if (!basic && getQueryBalance() < ALPHA_COST) {
      setShowGate(true);
      return;
    }
    if (!basic) {
      consumeQueries(ALPHA_COST);
      onCoinsChanged?.();
    }
    setRevealed(true);
    logClick("alpha_reveal", { ticker, count: result.alphas.length });
  }

  function handleTickerSelect(t) {
    setTicker(t);
    setResult(null);
    setRevealed(false);
  }

  const hasAlpha = result && result.alphas.length > 0;

  return (
    <div className="trade-ranking">
      <h2 className="section-title">알파 전략</h2>
      <p className="section-desc">바이앤홀드 대비 연 {ALPHA_THRESHOLD}% 이상 초과수익을 기록한 전략만 선별</p>

      <TickerSearch onSelect={handleTickerSelect} selected={ticker} compact />

      {ticker && (
        <>
          <div className="rank-config">
            <div className="rank-config-row">
              <span className="rank-config-label">분석 기간</span>
              <div className="rank-period-chips">
                {BACKTEST_PERIODS.map((p) => (
                  <button
                    key={p.years}
                    className={`rank-period-chip${period.years === p.years ? " active" : ""}`}
                    onClick={() => { setPeriod(p); setResult(null); setRevealed(false); }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            className="rank-run-btn"
            onClick={() => findAlpha(ticker, period)}
            disabled={loading}
          >
            {loading ? `${STRATEGIES.length}개 전략 분석 중... ${progress}%` : `${ticker} 알파 전략 찾기`}
          </button>

          {loading && (
            <div className="scanner-loading">
              <div className="scanner-progress-bar">
                <div className="scanner-progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <p className="scanner-progress-text">{STRATEGIES.length}개 전략 × {period.label} 분석 중...</p>
            </div>
          )}
        </>
      )}

      {/* Result: no alpha found */}
      {result && !hasAlpha && (
        <div className="alpha-empty">
          <div className="alpha-empty-icon">📊</div>
          <h3 className="alpha-empty-title">{getTickerLabel(ticker)}는 그냥 사는 게 최선이었어요</h3>
          <p className="alpha-empty-desc">
            최근 {period.label}간 {STRATEGIES.length}개 전략 중 바이앤홀드(연 {result.bhCAGR.toFixed(1)}%)를
            연 {ALPHA_THRESHOLD}% 이상 이긴 전략이 없습니다.
          </p>
          <div className="alpha-bh-card">
            <span className="alpha-bh-label">바이앤홀드 수익률</span>
            <span className={`alpha-bh-value ${result.bh.returnPct >= 0 ? "positive" : "negative"}`}>
              {result.bh.returnPct >= 0 ? "+" : ""}{result.bh.returnPct.toFixed(1)}%
            </span>
            <span className="alpha-bh-cagr">연 {result.bhCAGR.toFixed(1)}%</span>
          </div>
          <button
            className="alpha-accumulate-btn"
            onClick={() => onNavigate?.("accumulation", "strategy", { ticker })}
          >
            💰 {ticker} 적립 시뮬레이션 해보기
          </button>
          <button
            className="alpha-accumulate-btn"
            style={{ marginTop: 8, background: 'var(--surface)', color: 'var(--primary)', border: '1.5px solid var(--primary)' }}
            onClick={() => onNavigate?.("trading", "trade-sim", { ticker })}
          >
            📊 {ticker} 거래 백테스트 하기
          </button>
        </div>
      )}

      {/* Result: alpha found — teaser */}
      {hasAlpha && !revealed && (
        <div className="alpha-teaser">
          <div className="alpha-teaser-header">
            <span className="alpha-teaser-icon">🏆</span>
            <div>
              <h3 className="alpha-teaser-title">
                {result.alphas.length}개 알파 전략 발견!
              </h3>
              <p className="alpha-teaser-subtitle">
                {getTickerLabel(ticker)}에서 바이앤홀드(연 {result.bhCAGR.toFixed(1)}%)를 <span className="alpha-highlight">연 {ALPHA_THRESHOLD}%+ 이기는 전략</span>
              </p>
            </div>
          </div>

          {/* Blurred preview */}
          <div className="alpha-preview-list">
            {result.alphas.slice(0, 3).map((a, i) => (
              <div className="alpha-preview-item" key={i}>
                <span className="alpha-preview-rank">{i + 1}</span>
                <span className="alpha-preview-label alpha-blur">
                  {a.label.slice(0, 6)}{'••••••'}
                </span>
                <span className="alpha-preview-excess positive alpha-blur">+{a.totalExcess.toFixed(1)}%p</span>
              </div>
            ))}
            {result.alphas.length > 3 && (
              <div className="alpha-preview-more alpha-blur">+{result.alphas.length - 3}개 전략 더...</div>
            )}
          </div>

          <button className="alpha-reveal-btn" onClick={handleReveal}>
            전략 상세 보기 {!basic && <span className="alpha-cost">🪙 {ALPHA_COST}</span>}
          </button>
        </div>
      )}

      {/* Result: alpha revealed */}
      {hasAlpha && revealed && (
        <div className="alpha-results">
          <div className="alpha-results-header">
            <span className="alpha-results-icon">🏆</span>
            <div>
              <h3 className="alpha-results-title">{getTickerLabel(ticker)} 알파 전략</h3>
              <p className="alpha-results-subtitle">
                바이앤홀드(연 {result.bhCAGR.toFixed(1)}%) 대비 <span className="alpha-highlight">연 {ALPHA_THRESHOLD}%+ 초과수익</span>
              </p>
            </div>
          </div>

          <div className="alpha-bh-card compact">
            <span className="alpha-bh-label">바이앤홀드 기준</span>
            <span className={`alpha-bh-value ${result.bh.returnPct >= 0 ? "positive" : "negative"}`}>
              {result.bh.returnPct >= 0 ? "+" : ""}{result.bh.returnPct.toFixed(1)}%
            </span>
            <span className="alpha-bh-cagr">연 {result.bhCAGR.toFixed(1)}%</span>
            <span className="alpha-bh-mdd">MDD {result.bh.mdd.toFixed(1)}%</span>
          </div>

          <div className="alpha-list">
            {result.alphas.map((a, i) => {
              const isOpen = expandedIdx === i;
              return (
                <div className={`alpha-item${isOpen ? " alpha-item--open" : ""}`} key={i}>
                  <div
                    className="alpha-item-header"
                    onClick={() => setExpandedIdx(isOpen ? null : i)}
                  >
                    <div className="alpha-item-rank">{i + 1}</div>
                    <div className="alpha-item-body">
                      <div className="alpha-item-top">
                        <span className="alpha-item-label">{a.label}</span>
                        <span className="alpha-excess-badge">+{a.totalExcess.toFixed(1)}%p</span>
                      </div>
                      <div className="alpha-item-metrics">
                        <span className={a.totalReturn >= 0 ? "positive" : "negative"}>
                          총 {a.totalReturn >= 0 ? "+" : ""}{a.totalReturn.toFixed(1)}%
                        </span>
                        <span>연 {a.cagr.toFixed(1)}%</span>
                        <span>승률 {a.winRate.toFixed(0)}%</span>
                        <span>{a.tradeCount}회</span>
                        <span className="alpha-mdd">MDD {a.mdd.toFixed(1)}%</span>
                      </div>
                    </div>
                    <span className={`alpha-chevron${isOpen ? " alpha-chevron--open" : ""}`}>&#9662;</span>
                  </div>
                  {isOpen && a.trades && result.prices && (
                    <div className="alpha-chart-panel">
                      <BacktestChart prices={result.prices} trades={a.trades} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <AdBanner className="ad-banner-inline" />
        </div>
      )}

      <div className="trade-disclaimer">
        ⚠️ 과거 백테스트 기반 분석이며, 미래 수익을 보장하지 않습니다.
      </div>

      {showGate && (
        <QueryGateModal
          onClose={() => setShowGate(false)}
          onPurchased={() => { setShowGate(false); onCoinsChanged?.(); }}
        />
      )}
    </div>
  );
}
