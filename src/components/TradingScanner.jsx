import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import AdBanner from "./AdBanner.jsx";
import IndicatorChart from "./IndicatorChart.jsx";
import QueryGateModal from "./QueryGateModal.jsx";
import { loadPrices } from "../utils/dataLoader.js";
import { isBasic, consumeQueries, getQueryBalance } from "../utils/premium.js";
import { logClick } from "../utils/analytics.js";
import { getTickerLabel, TICKER_CATEGORIES, fmtPrice } from "../utils/tickers.js";
import {
  currentMASignal, currentRSISignal, currentDualMASignal,
  currentMACDSignal, currentBollingerSignal,
  MA_PERIODS,
} from "../utils/tradingEngine.js";

const SCAN_TICKERS = [
  ...TICKER_CATEGORIES["미국 개별주식"],
  ...TICKER_CATEGORIES["미국 인덱스 ETF"],
  ...TICKER_CATEGORIES["반도체 ETF"],
  ...TICKER_CATEGORIES["테크 섹터 ETF"],
  ...TICKER_CATEGORIES["AI·로보틱스 ETF"],
  ...TICKER_CATEGORIES["크립토 ETF"],
  ...TICKER_CATEGORIES["원자력·우라늄 ETF"],
  ...TICKER_CATEGORIES["방산 ETF"],
  ...TICKER_CATEGORIES["레버리지 ETF"],
  ...TICKER_CATEGORIES["GICS 11섹터 ETF"],
  ...TICKER_CATEGORIES["테마 섹터 ETF"],
  ...["GLD", "SLV"],
  ...TICKER_CATEGORIES["아시아 국가 ETF"],
  ...TICKER_CATEGORIES["유럽 국가 ETF"],
  ...TICKER_CATEGORIES["기타 국가 ETF"],
  ...TICKER_CATEGORIES["국내 자산"],
];
const UNIQUE_TICKERS = [...new Set(SCAN_TICKERS)];

const SCAN_STRATEGIES = [
  { id: "ma-50",  label: "50일 이평선", fn: (p) => currentMASignal(p, 50) },
  { id: "ma-20",  label: "20일 이평선", fn: (p) => currentMASignal(p, 20) },
  { id: "ma-100", label: "100일 이평선", fn: (p) => currentMASignal(p, 100) },
  { id: "ma-200", label: "200일 이평선", fn: (p) => currentMASignal(p, 200) },
  { id: "rsi-30", label: "RSI 30 이하", fn: (p) => currentRSISignal(p, { buyBelow: 30, sellAbove: 70 }) },
  { id: "rsi-20", label: "RSI 20 이하", fn: (p) => currentRSISignal(p, { buyBelow: 20, sellAbove: 80 }) },
  { id: "dualma-50-200", label: "골든크로스 (50/200)", fn: (p) => currentDualMASignal(p, 50, 200) },
  { id: "dualma-10-50",  label: "10/50 교차", fn: (p) => currentDualMASignal(p, 10, 50) },
  { id: "macd",          label: "MACD 골든크로스", fn: (p) => currentMACDSignal(p) },
  { id: "bollinger-2",   label: "볼린저밴드 2σ", fn: (p) => currentBollingerSignal(p, { period: 20, stdMult: 2 }) },
  { id: "bollinger-2.5", label: "볼린저밴드 2.5σ", fn: (p) => currentBollingerSignal(p, { period: 20, stdMult: 2.5 }) },
];

const FREE_LIMIT = 3;
const UNLOCK_COST = 2;

const scanCache = new Map();

function parseStratId(id) {
  if (id.startsWith("ma-")) return { type: "ma", period: parseInt(id.split("-")[1]) };
  if (id.startsWith("rsi-")) { const v = parseInt(id.split("-")[1]); return { type: "rsi", buyBelow: v, sellAbove: v === 20 ? 80 : 70 }; }
  if (id.startsWith("dualma-")) { const p = id.split("-"); return { type: "dualma", short: parseInt(p[1]), long: parseInt(p[2]) }; }
  if (id === "macd") return { type: "macd" };
  if (id.startsWith("bollinger-")) return { type: "bollinger", period: 20, stdMult: parseFloat(id.split("-")[1]) };
  return null;
}

export default function TradingScanner({ onNavigate, onCoinsChanged }) {
  const [strategy, setStrategy] = useState(SCAN_STRATEGIES[0]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [showGate, setShowGate] = useState(false);
  const basic = isBasic();

  const scan = useCallback(async (strat) => {
    if (scanCache.has(strat.id)) {
      const cached = scanCache.get(strat.id);
      setResults(cached);
      setExpanded(cached.length > 0 ? cached[0].ticker : null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setResults([]);
    setProgress(0);

    const out = [];
    const BATCH = 10;
    for (let i = 0; i < UNIQUE_TICKERS.length; i += BATCH) {
      const batch = UNIQUE_TICKERS.slice(i, i + BATCH);
      const batchResults = await Promise.allSettled(
        batch.map(async (ticker) => {
          const prices = await loadPrices(ticker);
          if (prices.length < 200) return null;
          const signal = strat.fn(prices);
          if (signal.status === "unknown") return null;
          return { ticker, ...signal };
        })
      );
      for (const r of batchResults) {
        if (r.status === "fulfilled" && r.value) out.push(r.value);
      }
      setProgress(Math.round(Math.min(i + BATCH, UNIQUE_TICKERS.length) / UNIQUE_TICKERS.length * 100));
    }

    out.sort((a, b) => {
      const order = { "조건 진입": 0, "조건 이탈": 1, "조건 유지 중": 2, "대기": 3 };
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    });

    scanCache.set(strat.id, out);
    setResults(out);
    setExpanded(out.length > 0 ? out[0].ticker : null);
    setLoading(false);
    logClick("trade_scanner_run", { strategy: strat.id, count: out.length });
  }, []);

  useEffect(() => { scan(strategy); }, []);

  function handleStrategyChange(strat) {
    setStrategy(strat);
    setRevealed(false);
    scan(strat);
  }

  function handleUnlock() {
    if (basic) return;
    if (getQueryBalance() < UNLOCK_COST) {
      setShowGate(true);
      return;
    }
    consumeQueries(UNLOCK_COST);
    onCoinsChanged?.();
    setRevealed(true);
    logClick("scanner_unlock", { strategy: strategy.id, cost: UNLOCK_COST });
  }

  const unlocked = basic || revealed;
  const displayResults = unlocked ? results : results.slice(0, FREE_LIMIT);
  const hasMore = !unlocked && results.length > FREE_LIMIT;

  return (
    <div className="trade-scanner">
      <h2 className="section-title">종목 스캐너</h2>
      <p className="section-desc">조건에 해당하는 종목을 탐색해요</p>

      {/* Strategy chips */}
      <div className="scanner-chips">
        {SCAN_STRATEGIES.map((s) => (
          <button
            key={s.id}
            className={`scanner-chip${strategy.id === s.id ? " active" : ""}`}
            onClick={() => handleStrategyChange(s)}
            disabled={loading}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Help accordion — right below chips */}
      <div className="scanner-help-accordion highlight">
        <button className="scanner-help-toggle" onClick={() => setHelpOpen(!helpOpen)}>
          <span>❓ 조건 상태가 뭔가요?</span>
          <span className={`scanner-help-arrow${helpOpen ? " open" : ""}`}>▼</span>
        </button>
        {helpOpen && (
          <div className="scanner-help-body">
            <p className="scanner-help-note">모든 판단은 <strong>마지막 거래일 종가</strong> 기준입니다.</p>
            <dl className="scanner-help-list">
              <dt><span className="scanner-badge buy">조건 진입</span></dt>
              <dd>마지막 거래일에 전략 조건을 충족했어요.
                <br />MA: 가격이 이동평균선 위로 올라감
                <br />RSI: 과매도 구간(설정값 이하) 진입
                <br />MACD: 히스토그램이 양수로 전환
                <br />볼린저: 가격이 하단밴드 이하로 진입
              </dd>
              <dt><span className="scanner-badge sell">조건 이탈</span></dt>
              <dd>마지막 거래일에 전략 조건에서 벗어났어요.
                <br />MA: 가격이 이동평균선 아래로 내려감
                <br />RSI: 과매수 구간(설정값 이상) 진입
                <br />MACD: 히스토그램이 음수로 전환
                <br />볼린저: 가격이 상단밴드 이상으로 이탈
              </dd>
              <dt><span className="scanner-badge hold">조건 유지 중</span></dt>
              <dd>이전에 조건 진입 후 아직 그 상태가 유지되고 있어요.</dd>
              <dt><span className="scanner-badge wait">대기</span></dt>
              <dd>현재 어떤 조건에도 해당하지 않아요.</dd>
            </dl>
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="scanner-loading">
          <div className="scanner-progress-bar">
            <div className="scanner-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="scanner-progress-text">{UNIQUE_TICKERS.length}개 종목 스캔 중... {progress}%</p>
        </div>
      )}

      {/* Results */}
      {!loading && (
        <>
          <div className="scanner-count">
            {results.filter(r => r.status === "조건 진입").length}개 진입 ·{" "}
            {results.filter(r => r.status === "조건 이탈").length}개 이탈 ·{" "}
            총 {results.length}개 종목
          </div>

          <div className="scanner-list">
            {displayResults.map((r, idx) => (
              <React.Fragment key={r.ticker}>
                {idx === 5 && <AdBanner className="ad-banner-inline" />}
                <div className={`scanner-item${expanded === r.ticker ? " scanner-item--open" : ""}`}>
                  <div className="scanner-item-header" onClick={() => setExpanded(expanded === r.ticker ? null : r.ticker)}>
                    <div className="scanner-item-left">
                      <span className="scanner-ticker">{r.ticker}</span>
                      <span className="scanner-name">{getTickerLabel(r.ticker)}</span>
                    </div>
                    <div className="scanner-item-right">
                      <span className={`scanner-badge ${
                        r.status === "조건 진입" ? "buy" :
                        r.status === "조건 이탈" ? "sell" :
                        r.status === "조건 유지 중" ? "hold" : "wait"
                      }`}>
                        {r.status}
                      </span>
                      {r.proximity !== undefined && (
                        <span className="scanner-prox">
                          {r.maShort ? `단기 ${fmtPrice(r.maShort, r.ticker)} / 장기 ${fmtPrice(r.maLong, r.ticker)} (${r.proximity > 0 ? "+" : ""}${r.proximity.toFixed(1)}%)` :
                           r.maValue ? `MA ${fmtPrice(r.maValue, r.ticker)} · 현재 ${fmtPrice(r.price, r.ticker)}` :
                           r.rsi ? `RSI ${r.rsi.toFixed(1)}` :
                           r.lower ? `${fmtPrice(r.lower, r.ticker)}~${fmtPrice(r.upper, r.ticker)} · ${fmtPrice(r.price, r.ticker)}` :
                           r.macd !== undefined ? `MACD ${r.histogram.toFixed(2)}` : ""}
                        </span>
                      )}
                      <span className={`scanner-chevron${expanded === r.ticker ? " scanner-chevron--open" : ""}`}>&#9662;</span>
                    </div>
                  </div>
                  {expanded === r.ticker && (
                    <div className="scanner-item-detail">
                      <IndicatorChart ticker={r.ticker} indicator={parseStratId(strategy.id)} size="medium" />
                      <button className="scanner-sim-link" onClick={() => onNavigate?.("trading", "trade-sim", { ticker: r.ticker })}>
                        📊 {r.ticker} 백테스트 하기
                      </button>
                    </div>
                  )}
                </div>
              </React.Fragment>
            ))}
          </div>

          {hasMore && (
            <div className="scanner-paywall">
              <button className="btn-primary scanner-unlock-btn" onClick={handleUnlock}>
                🪙 {UNLOCK_COST}코인으로 나머지 {results.length - FREE_LIMIT}개 종목 보기
              </button>
            </div>
          )}

          <AdBanner className="ad-banner-inline" />
        </>
      )}

      <div className="trade-disclaimer">
        ⚠️ 스캔 결과는 기계적 조건 충족 여부만 표시하며, 투자 권유가 아닙니다.
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
