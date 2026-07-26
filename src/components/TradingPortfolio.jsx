import { useState, useEffect } from "react";
import TickerSearch from "./TickerSearch.jsx";
import AdBanner from "./AdBanner.jsx";
import { loadPrices } from "../utils/dataLoader.js";
import { getTickerLabel } from "../utils/tickers.js";
import { isBasic } from "../utils/premium.js";
import { logClick } from "../utils/analytics.js";
import {
  backtestMA, backtestRSI, backtestMACD, backtestDualMA,
  filterByPeriod, scoreResult, strategyLabel,
  currentMASignal, currentRSISignal, currentMACDSignal, currentDualMASignal,
  MA_PERIODS, RSI_COMBOS, DUAL_MA_COMBOS,
} from "../utils/tradingEngine.js";

const PF_KEY = "ait_trade_portfolio";
const FREE_LIMIT = 3;
const BASIC_LIMIT = 20;

function load() {
  try { return JSON.parse(localStorage.getItem(PF_KEY)) || []; } catch { return []; }
}
function save(list) {
  try { localStorage.setItem(PF_KEY, JSON.stringify(list)); } catch {}
}

async function findTopStrategies(ticker, count = 10) {
  const raw = await loadPrices(ticker);
  const prices = filterByPeriod(raw, 5);
  if (prices.length < 50) return [];

  const results = [];
  for (const p of MA_PERIODS) {
    try {
      const r = backtestMA(prices, p);
      results.push({ type: "ma", params: { period: p }, score: scoreResult(r),
        label: strategyLabel("ma", { period: p }), totalReturn: r.totalReturn });
    } catch {}
  }
  for (const c of RSI_COMBOS) {
    try {
      const r = backtestRSI(prices, c);
      results.push({ type: "rsi", params: c, score: scoreResult(r),
        label: strategyLabel("rsi", c), totalReturn: r.totalReturn });
    } catch {}
  }
  try {
    const r = backtestMACD(prices);
    results.push({ type: "macd", params: {}, score: scoreResult(r),
      label: strategyLabel("macd", {}), totalReturn: r.totalReturn });
  } catch {}
  for (const d of DUAL_MA_COMBOS) {
    try {
      const r = backtestDualMA(prices, d.short, d.long);
      results.push({ type: "dualma", params: { short: d.short, long: d.long }, score: scoreResult(r),
        label: strategyLabel("dualma", { short: d.short, long: d.long }), totalReturn: r.totalReturn });
    } catch {}
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, count);
}

function getSignal(prices, type, params) {
  if (type === "ma") return currentMASignal(prices, params.period);
  if (type === "rsi") return currentRSISignal(prices, params);
  if (type === "dualma") return currentDualMASignal(prices, params.short, params.long);
  if (type === "macd") return currentMACDSignal(prices);
  return { status: "unknown", proximity: 0 };
}

function badgeCls(status) {
  if (status === "조건 진입") return "buy";
  if (status === "조건 이탈") return "sell";
  if (status === "조건 유지 중") return "hold";
  return "wait";
}

function proxText(entry, sig) {
  if (!sig) return "";
  const { type, params } = entry.strategy;
  if (type === "ma")
    return `MA(${params.period}) 대비 ${sig.proximity > 0 ? "+" : ""}${sig.proximity?.toFixed(1)}%`;
  if (type === "dualma")
    return `${params.short}일 vs ${params.long}일 간격 ${sig.proximity > 0 ? "+" : ""}${sig.proximity?.toFixed(1)}%`;
  if (type === "rsi")
    return `RSI ${sig.rsi?.toFixed(1)}`;
  if (type === "macd")
    return `히스토그램 ${sig.histogram > 0 ? "+" : ""}${sig.histogram?.toFixed(2)}`;
  return "";
}

export default function TradingPortfolio({ onCoinsChanged, onNavigate }) {
  const [portfolio, setPortfolio] = useState(load);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addingTicker, setAddingTicker] = useState(null);
  const [topStrats, setTopStrats] = useState([]);
  const [signals, setSignals] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const basic = isBasic();
  const limit = basic ? BASIC_LIMIT : FREE_LIMIT;

  useEffect(() => {
    if (!portfolio.length) { setLoading(false); return; }
    setLoading(true);

    Promise.all(
      portfolio.map(async (entry) => {
        try {
          const prices = await loadPrices(entry.ticker);
          const sig = getSignal(prices, entry.strategy.type, entry.strategy.params);
          const lastPrice = prices[prices.length - 1]?.close;
          return [entry.ticker, { ...sig, lastPrice }];
        } catch {
          return [entry.ticker, { status: "데이터 없음", proximity: 0 }];
        }
      })
    ).then((results) => {
      const map = {};
      for (const [t, s] of results) map[t] = s;
      setSignals(map);
      setLoading(false);
    });
  }, [portfolio, refreshKey]);

  async function handleTickerSelect(ticker) {
    if (portfolio.some((e) => e.ticker === ticker)) return;
    if (portfolio.length >= limit) return;

    setAddingTicker(ticker);
    setAdding(true);

    try {
      const top = await findTopStrategies(ticker);
      if (!top.length) { setAdding(false); setAddingTicker(null); return; }

      if (basic) {
        setTopStrats(top);
        setAdding(false);
      } else {
        addEntry(ticker, top[0]);
      }
    } catch {
      setAdding(false);
      setAddingTicker(null);
    }
  }

  function addEntry(ticker, strat) {
    const entry = {
      ticker,
      strategy: { type: strat.type, params: strat.params, label: strat.label },
      score: strat.score,
      addedAt: Date.now(),
    };
    const updated = [...portfolio, entry];
    setPortfolio(updated);
    save(updated);
    closeModal();
    logClick("trade_portfolio_add", { ticker, strategy: strat.label });
  }

  function handleRemove(ticker) {
    const updated = portfolio.filter((e) => e.ticker !== ticker);
    setPortfolio(updated);
    save(updated);
    logClick("trade_portfolio_remove", { ticker });
  }

  function closeModal() {
    setShowAdd(false);
    setAdding(false);
    setAddingTicker(null);
    setTopStrats([]);
  }

  return (
    <div className="trade-portfolio">
      <h2 className="section-title">전략 포트폴리오</h2>
      <p className="section-desc">종목별 최적 전략을 저장하고 조건을 모니터링하세요</p>

      {/* Empty state */}
      {!portfolio.length && !showAdd && (
        <div className="pf-empty">
          <div className="pf-empty-icon">📊</div>
          <h3 className="pf-empty-title">포트폴리오가 비어있어요</h3>
          <p className="pf-empty-desc">
            종목을 추가하면 최적 전략이 자동 배정되고<br />
            조건 상태를 모니터링합니다
          </p>
          <button className="pf-add-btn primary" onClick={() => setShowAdd(true)}>
            + 종목 추가
          </button>
        </div>
      )}

      {/* Portfolio list */}
      {portfolio.length > 0 && (
        <>
          <div className="pf-header-row">
            <span className="pf-count">{portfolio.length}/{limit}개 종목</span>
            <button
              className="pf-refresh-btn"
              onClick={() => setRefreshKey((k) => k + 1)}
              disabled={loading}
            >
              {loading ? "갱신 중..." : "새로고침"}
            </button>
          </div>

          <div className="pf-list">
            {portfolio.map((entry) => {
              const sig = signals[entry.ticker];
              const cls = sig ? badgeCls(sig.status) : "wait";
              return (
                <div className="pf-card" key={entry.ticker}>
                  <div className="pf-card-top">
                    <div className="pf-ticker-info">
                      <span className="pf-ticker">{entry.ticker}</span>
                      <span className="pf-ticker-name">{getTickerLabel(entry.ticker)}</span>
                    </div>
                    <button className="pf-remove-btn" onClick={() => handleRemove(entry.ticker)}>×</button>
                  </div>
                  <div className="pf-card-mid">
                    <span className="pf-strat-name">{entry.strategy.label}</span>
                    <span className={`rank-score-badge ${entry.score >= 60 ? "high" : entry.score >= 30 ? "mid" : "low"}`}>
                      {entry.score}점
                    </span>
                  </div>
                  <div className="pf-card-bot">
                    <span className={`pf-signal ${cls}`}>
                      {loading ? "분석 중..." : sig?.status || "로딩 중"}
                    </span>
                    <div className={`pf-proximity${!basic ? " locked" : ""}`}>
                      {sig && !loading && (
                        <>
                          {sig.lastPrice != null && (
                            <span className="pf-price">${sig.lastPrice.toFixed(2)}</span>
                          )}
                          <span className="pf-prox-val">{proxText(entry, sig)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {portfolio.length < limit && (
            <button className="pf-add-btn" onClick={() => setShowAdd(true)}>
              + 종목 추가 ({portfolio.length}/{limit})
            </button>
          )}

          {!basic && portfolio.length >= FREE_LIMIT && (
            <div className="pf-paywall">
              <p>🔒 베이직에서 {BASIC_LIMIT}개 종목까지 추가하고 상세 근접도를 확인하세요</p>
            </div>
          )}
        </>
      )}

      {/* Basic proximity teaser for free users */}
      {!basic && portfolio.length > 0 && (
        <div className="pf-prox-teaser">
          <p className="pf-prox-teaser-title">📈 베이직 전용: 상세 근접도</p>
          <p className="pf-prox-teaser-desc">
            조건 충족까지 남은 거리를 추적하고<br />
            Top 10 전략 중 원하는 전략으로 변경 가능
          </p>
        </div>
      )}

      <AdBanner className="ad-banner-inline" />

      <div className="trade-disclaimer">
        ⚠️ 포트폴리오는 과거 백테스트 기반이며, 미래 수익을 보장하지 않습니다.
      </div>

      {/* Add overlay */}
      {showAdd && (
        <div className="pf-overlay" onClick={() => { if (!adding) closeModal(); }}>
          <div className="pf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pf-modal-header">
              <h3>{topStrats.length ? `${addingTicker} 전략 선택` : "종목 추가"}</h3>
              <button className="pf-modal-close" onClick={closeModal}>×</button>
            </div>

            {!topStrats.length ? (
              <>
                <TickerSearch onSelect={handleTickerSelect} compact />
                {adding && (
                  <div className="pf-adding">
                    <div className="pf-adding-spinner" />
                    <p>{addingTicker} 최적 전략 분석 중...</p>
                  </div>
                )}
              </>
            ) : (
              <div className="pf-picker">
                <p className="pf-picker-desc">모니터링할 전략을 선택하세요</p>
                <div className="pf-picker-list">
                  {topStrats.map((s, i) => (
                    <button className="pf-picker-item" key={i} onClick={() => addEntry(addingTicker, s)}>
                      <span className="pf-picker-rank">{i + 1}위</span>
                      <span className="pf-picker-name">{s.label}</span>
                      <span className={`pf-picker-score ${s.score >= 60 ? "high" : s.score >= 30 ? "mid" : "low"}`}>
                        {s.score}점
                      </span>
                      <span className={`pf-picker-ret ${s.totalReturn >= 0 ? "positive" : "negative"}`}>
                        {s.totalReturn >= 0 ? "+" : ""}{s.totalReturn?.toFixed(0)}%
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
