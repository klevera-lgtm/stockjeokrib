import { useState, useEffect, useCallback } from "react";
import AdBanner from "./AdBanner.jsx";
import { loadPrices } from "../utils/dataLoader.js";
import { isBasic } from "../utils/premium.js";
import { logClick } from "../utils/analytics.js";
import { getTickerLabel, TICKER_CATEGORIES } from "../utils/tickers.js";
import {
  currentMASignal, currentRSISignal,
  MA_PERIODS,
} from "../utils/tradingEngine.js";

const SCAN_TICKERS = [
  ...TICKER_CATEGORIES["미국 개별주식"].slice(0, 20),
  ...TICKER_CATEGORIES["미국 인덱스 ETF"].slice(0, 6),
  ...TICKER_CATEGORIES["레버리지 ETF"].slice(0, 6),
  ...TICKER_CATEGORIES["배당주·리츠"].slice(0, 6),
];
const UNIQUE_TICKERS = [...new Set(SCAN_TICKERS)];

const SCAN_STRATEGIES = [
  { id: "ma-50",  label: "50일 이평선", fn: (p) => currentMASignal(p, 50) },
  { id: "ma-20",  label: "20일 이평선", fn: (p) => currentMASignal(p, 20) },
  { id: "ma-100", label: "100일 이평선", fn: (p) => currentMASignal(p, 100) },
  { id: "ma-200", label: "200일 이평선", fn: (p) => currentMASignal(p, 200) },
  { id: "rsi-30", label: "RSI 30 이하", fn: (p) => currentRSISignal(p, { buyBelow: 30, sellAbove: 70 }) },
  { id: "rsi-20", label: "RSI 20 이하", fn: (p) => currentRSISignal(p, { buyBelow: 20, sellAbove: 80 }) },
];

const FREE_LIMIT = 3;

export default function TradingScanner({ onNavigate }) {
  const [strategy, setStrategy] = useState(SCAN_STRATEGIES[0]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const basic = isBasic();

  const scan = useCallback(async (strat) => {
    setLoading(true);
    setResults([]);
    setProgress(0);

    const out = [];
    for (let i = 0; i < UNIQUE_TICKERS.length; i++) {
      const ticker = UNIQUE_TICKERS[i];
      try {
        const prices = await loadPrices(ticker);
        if (prices.length < 200) continue;
        const signal = strat.fn(prices);
        if (signal.status !== "unknown") {
          out.push({ ticker, ...signal });
        }
      } catch {}
      setProgress(Math.round(((i + 1) / UNIQUE_TICKERS.length) * 100));
    }

    out.sort((a, b) => {
      const order = { "매수 조건 충족": 0, "매도 조건 충족": 1, "보유 중": 2, "관망": 3 };
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    });

    setResults(out);
    setLoading(false);
    logClick("trade_scanner_run", { strategy: strat.id, count: out.length });
  }, []);

  useEffect(() => { scan(strategy); }, []);

  function handleStrategyChange(strat) {
    setStrategy(strat);
    scan(strat);
  }

  const displayResults = basic ? results : results.slice(0, FREE_LIMIT);
  const hasMore = !basic && results.length > FREE_LIMIT;

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
            {results.filter(r => r.status === "매수 조건 충족").length}개 매수 조건 ·{" "}
            {results.filter(r => r.status === "매도 조건 충족").length}개 매도 조건 ·{" "}
            총 {results.length}개 종목
          </div>

          <div className="scanner-list">
            {displayResults.map((r) => (
              <div key={r.ticker} className="scanner-item" onClick={() => {
                onNavigate?.("trading", "trade-sim", { ticker: r.ticker });
              }}>
                <div className="scanner-item-left">
                  <span className="scanner-ticker">{r.ticker}</span>
                  <span className="scanner-name">{getTickerLabel(r.ticker)}</span>
                </div>
                <div className="scanner-item-right">
                  <span className={`scanner-badge ${
                    r.status === "매수 조건 충족" ? "buy" :
                    r.status === "매도 조건 충족" ? "sell" :
                    r.status === "보유 중" ? "hold" : "wait"
                  }`}>
                    {r.status}
                  </span>
                  {r.proximity !== undefined && (
                    <span className="scanner-prox">
                      {r.maValue ? `$${r.maValue.toFixed(0)} / $${r.price.toFixed(0)}` :
                       r.rsi ? `RSI ${r.rsi.toFixed(1)}` : ""}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {hasMore && (
            <div className="scanner-paywall">
              <p>🔒 나머지 {results.length - FREE_LIMIT}개 종목은 베이직에서 확인할 수 있어요</p>
            </div>
          )}

          <AdBanner className="ad-banner-inline" />
        </>
      )}

      <div className="trade-disclaimer">
        ⚠️ 스캔 결과는 기계적 조건 충족 여부만 표시하며, 투자 권유가 아닙니다.
      </div>
    </div>
  );
}
