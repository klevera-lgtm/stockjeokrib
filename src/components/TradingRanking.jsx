import { useState, useCallback } from "react";
import TickerSearch from "./TickerSearch.jsx";
import AdBanner from "./AdBanner.jsx";
import { loadPrices } from "../utils/dataLoader.js";
import { getTickerLabel, TICKER_CATEGORIES } from "../utils/tickers.js";
import { isBasic } from "../utils/premium.js";
import { logClick } from "../utils/analytics.js";
import {
  backtestMA, backtestRSI, backtestMACD,
  filterByPeriod, toWeekly, buyAndHold, scoreResult, strategyLabel,
  MA_PERIODS, RSI_COMBOS, BACKTEST_PERIODS,
} from "../utils/tradingEngine.js";

const SORT_OPTIONS = [
  { id: "score", label: "종합 점수" },
  { id: "return", label: "수익률" },
  { id: "winRate", label: "승률" },
  { id: "mdd", label: "MDD (낮은순)" },
];

const SCAN_TICKERS = [
  ...TICKER_CATEGORIES["미국 개별주식"].slice(0, 20),
  ...TICKER_CATEGORIES["미국 인덱스 ETF"].slice(0, 6),
  ...TICKER_CATEGORIES["레버리지 ETF"].slice(0, 6),
  ...TICKER_CATEGORIES["배당주·리츠"].slice(0, 6),
];
const UNIQUE_SCAN_TICKERS = [...new Set(SCAN_TICKERS)];

function buildStrategies() {
  const list = [];
  for (const p of MA_PERIODS)
    list.push({ type: "ma", params: { period: p }, fn: (prices) => backtestMA(prices, p) });
  for (const c of RSI_COMBOS)
    list.push({ type: "rsi", params: c, fn: (prices) => backtestRSI(prices, c) });
  list.push({ type: "macd", params: {}, fn: (prices) => backtestMACD(prices) });
  return list;
}

export default function TradingRanking({ onCoinsChanged, onNavigate }) {
  const [ticker, setTicker] = useState(null);
  const [timeframe, setTimeframe] = useState("daily");
  const [period, setPeriod] = useState(BACKTEST_PERIODS[2]);
  const [sortBy, setSortBy] = useState("score");
  const [rankings, setRankings] = useState([]);
  const [bh, setBh] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scanResults, setScanResults] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

  const basic = isBasic();

  const runRanking = useCallback(async (t, tf, p) => {
    setLoading(true);
    setRankings([]);
    setProgress(0);
    setScanResults(null);

    try {
      const raw = await loadPrices(t);
      const filtered = filterByPeriod(raw, p.years);
      const prices = tf === "weekly" ? toWeekly(filtered) : filtered;
      if (prices.length < 50) { setLoading(false); return; }

      setBh(buyAndHold(prices));
      const strategies = buildStrategies();
      const results = [];

      for (let i = 0; i < strategies.length; i++) {
        const s = strategies[i];
        try {
          const result = s.fn(prices);
          results.push({
            type: s.type, params: s.params,
            label: strategyLabel(s.type, s.params),
            score: scoreResult(result), ...result,
          });
        } catch {}
        setProgress(Math.round(((i + 1) / strategies.length) * 100));
      }

      results.sort((a, b) => b.score - a.score);
      setRankings(results);
      logClick("trade_ranking_run", { ticker: t, period: p.years, tf, count: results.length });
    } catch {}
    setLoading(false);
  }, []);

  function handleTickerSelect(t) {
    setTicker(t);
    setRankings([]);
    setScanResults(null);
  }

  function handleRun() {
    if (!ticker) return;
    runRanking(ticker, timeframe, period);
  }

  function handleSort(s) {
    setSortBy(s);
    if (!rankings.length) return;
    const sorted = [...rankings].sort((a, b) => {
      if (s === "return") return b.totalReturn - a.totalReturn;
      if (s === "winRate") return b.winRate - a.winRate;
      if (s === "mdd") return a.mdd - b.mdd;
      return b.score - a.score;
    });
    setRankings(sorted);
  }

  async function runCrossScan() {
    setScanning(true);
    setScanProgress(0);
    setScanResults(null);

    const strategies = buildStrategies();
    const hits = [];

    for (let t = 0; t < UNIQUE_SCAN_TICKERS.length; t++) {
      const tick = UNIQUE_SCAN_TICKERS[t];
      try {
        const raw = await loadPrices(tick);
        const filtered = filterByPeriod(raw, period.years);
        const prices = timeframe === "weekly" ? toWeekly(filtered) : filtered;
        if (prices.length < 50) continue;
        const bhRes = buyAndHold(prices);

        for (const s of strategies) {
          try {
            const result = s.fn(prices);
            if (result.totalReturn > bhRes.returnPct && result.tradeCount >= 3) {
              hits.push({
                ticker: tick,
                label: getTickerLabel(tick),
                strategy: strategyLabel(s.type, s.params),
                ret: result.totalReturn,
                bh: bhRes.returnPct,
                margin: result.totalReturn - bhRes.returnPct,
                score: scoreResult(result),
                winRate: result.winRate,
              });
            }
          } catch {}
        }
      } catch {}
      setScanProgress(Math.round(((t + 1) / UNIQUE_SCAN_TICKERS.length) * 100));
    }

    hits.sort((a, b) => b.margin - a.margin);
    setScanResults(hits);
    setScanning(false);
    logClick("trade_cross_scan", { count: hits.length, period: period.years });
  }

  function handleScanClick() {
    if (!basic) return;
    runCrossScan();
  }

  const bhBeaters = bh
    ? rankings.filter((r) => r.totalReturn > bh.returnPct && r.tradeCount >= 3)
    : [];

  return (
    <div className="trade-ranking">
      <h2 className="section-title">전략 랭킹</h2>
      <p className="section-desc">종목별 최적 전략을 찾아보세요</p>

      <TickerSearch onSelect={handleTickerSelect} compact />

      {ticker && (
        <>
          <div className="rank-config">
            <div className="rank-config-row">
              <span className="rank-config-label">타임프레임</span>
              <div className="rank-tf-toggle">
                <button className={timeframe === "daily" ? "active" : ""} onClick={() => setTimeframe("daily")}>일봉</button>
                <button className={timeframe === "weekly" ? "active" : ""} onClick={() => setTimeframe("weekly")}>주봉</button>
              </div>
            </div>
            <div className="rank-config-row">
              <span className="rank-config-label">백테스트 기간</span>
              <div className="rank-period-chips">
                {BACKTEST_PERIODS.map((p) => (
                  <button
                    key={p.years}
                    className={`rank-period-chip${period.years === p.years ? " active" : ""}`}
                    onClick={() => setPeriod(p)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button className="rank-run-btn" onClick={handleRun} disabled={loading}>
            {loading ? `분석 중... ${progress}%` : `${ticker} 전략 랭킹 보기`}
          </button>

          {loading && (
            <div className="scanner-loading">
              <div className="scanner-progress-bar">
                <div className="scanner-progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <p className="scanner-progress-text">29개 전략 분석 중... {progress}%</p>
            </div>
          )}

          {!loading && rankings.length > 0 && (
            <>
              {bh && (
                <div className="rank-baseline">
                  <span>바이앤홀드 기준</span>
                  <span className={bh.returnPct >= 0 ? "positive" : "negative"}>
                    {bh.returnPct >= 0 ? "+" : ""}{bh.returnPct.toFixed(1)}%
                  </span>
                  <span className="rank-baseline-mdd">MDD {bh.mdd.toFixed(1)}%</span>
                </div>
              )}

              <div className="rank-sort-row">
                <span className="rank-sort-label">정렬:</span>
                {SORT_OPTIONS.map((s) => (
                  <button
                    key={s.id}
                    className={`rank-sort-btn${sortBy === s.id ? " active" : ""}`}
                    onClick={() => handleSort(s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <div className="rank-list">
                {rankings.map((r, i) => {
                  const isBhWinner = bh && r.totalReturn > bh.returnPct && r.tradeCount >= 3;
                  return (
                    <div key={`${r.type}-${JSON.stringify(r.params)}`} className={`rank-item${isBhWinner ? " bh-winner" : ""}`}>
                      <div className="rank-num">{i + 1}</div>
                      <div className="rank-item-body">
                        <div className="rank-item-top">
                          <span className="rank-strategy">
                            {isBhWinner && <span className="rank-bh-badge">B&H&#8593;</span>}
                            {r.label}
                          </span>
                          <span className={`rank-score-badge ${r.score >= 60 ? "high" : r.score >= 30 ? "mid" : "low"}`}>
                            {r.score}점
                          </span>
                        </div>
                        <div className="rank-metrics">
                          <span className={r.totalReturn >= 0 ? "positive" : "negative"}>
                            {r.totalReturn >= 0 ? "+" : ""}{r.totalReturn.toFixed(1)}%
                          </span>
                          <span>승률 {r.winRate.toFixed(0)}%</span>
                          <span>{r.tradeCount}회</span>
                          <span className="rank-mdd">MDD {r.mdd.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* B&H Beater highlight */}
              {bh && bhBeaters.length > 0 && (
                <div className="rank-bh-section">
                  <div className="rank-bh-header">
                    <span className="rank-bh-trophy">🏆</span>
                    <div>
                      <h3 className="rank-bh-title">바이앤홀드를 이긴 전략</h3>
                      <p className="rank-bh-subtitle">
                        {ticker}에서 {bhBeaters.length}개 전략이 바이앤홀드(+{bh.returnPct.toFixed(0)}%)를 이겼어요!
                      </p>
                    </div>
                  </div>
                  <div className="rank-bh-winners">
                    {bhBeaters.slice(0, 5).map((r, i) => (
                      <div className="rank-bh-winner" key={i}>
                        <span className="rank-bh-winner-rank">{rankings.indexOf(r) + 1}위</span>
                        <span className="rank-bh-winner-name">{r.label}</span>
                        <span className="rank-bh-winner-ret positive">+{r.totalReturn.toFixed(0)}%</span>
                        <span className="rank-bh-winner-gap">+{(r.totalReturn - bh.returnPct).toFixed(0)}%p</span>
                      </div>
                    ))}
                    {bhBeaters.length > 5 && (
                      <p className="rank-bh-more">+{bhBeaters.length - 5}개 전략 더</p>
                    )}
                  </div>
                </div>
              )}

              <AdBanner className="ad-banner-inline" />

              {/* Cross-ticker scan — Basic only */}
              <div className="rank-scan-section">
                <div className="rank-scan-header">
                  <span className="rank-scan-fire">🔥</span>
                  <div>
                    <h3 className="rank-scan-title">{UNIQUE_SCAN_TICKERS.length}개 종목 × 29개 전략 스캔</h3>
                    <p className="rank-scan-desc">
                      인기 {UNIQUE_SCAN_TICKERS.length}개 종목에서<br />
                      바이앤홀드를 이기는 종목×전략을 자동으로 찾아드려요
                    </p>
                  </div>
                </div>

                {basic ? (
                  <>
                    {scanning && (
                      <div className="scanner-loading" style={{ margin: "12px 0 0" }}>
                        <div className="scanner-progress-bar">
                          <div className="scanner-progress-fill" style={{ width: `${scanProgress}%` }} />
                        </div>
                        <p className="scanner-progress-text">
                          {UNIQUE_SCAN_TICKERS.length}개 종목 스캔 중... {scanProgress}%
                        </p>
                      </div>
                    )}

                    {scanResults ? (
                      <div className="rank-scan-results">
                        <p className="rank-scan-summary">
                          {scanResults.length}개 종목×전략 조합이 바이앤홀드를 이겼어요!
                        </p>
                        <div className="rank-scan-list">
                          {scanResults.slice(0, 30).map((r, i) => (
                            <div className="rank-scan-item" key={i}>
                              <div className="rank-scan-item-top">
                                <span className="rank-scan-ticker">{r.ticker}</span>
                                <span className="rank-scan-strat">{r.strategy}</span>
                              </div>
                              <div className="rank-scan-item-bot">
                                <span className="positive">+{r.ret.toFixed(0)}%</span>
                                <span className="rank-scan-vs">vs B&H +{r.bh.toFixed(0)}%</span>
                                <span className="rank-scan-gap">+{r.margin.toFixed(0)}%p</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        {scanResults.length > 30 && (
                          <p className="rank-scan-list-more">+{scanResults.length - 30}개 결과 더</p>
                        )}
                      </div>
                    ) : !scanning && (
                      <div className="rank-scan-cta">
                        <button className="rank-scan-btn" onClick={handleScanClick}>
                          {UNIQUE_SCAN_TICKERS.length}개 종목 × 29개 전략 스캔 시작
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Blurred preview — teasing for free users */}
                    <div className="rank-scan-preview">
                      {[
                        { t: "NVDA", s: "50일 이동평균선", r: "+2,345%", g: "+404%p" },
                        { t: "TSLA", s: "RSI 30/70 (손절 -10%)", r: "+1,890%", g: "+312%p" },
                        { t: "AAPL", s: "MACD 시그널 교차", r: "+876%", g: "+201%p" },
                        { t: "SPY", s: "100일 이동평균선", r: "+543%", g: "+178%p" },
                      ].map((row, i) => (
                        <div className="rank-scan-item preview-item" key={i}>
                          <div className="rank-scan-item-top">
                            <span className="rank-scan-ticker">{row.t}</span>
                            <span className="rank-scan-strat scan-blur">{row.s}</span>
                          </div>
                          <div className="rank-scan-item-bot">
                            <span className="positive scan-blur">{row.r}</span>
                            <span className="rank-scan-gap scan-blur">{row.g}</span>
                          </div>
                        </div>
                      ))}
                      <div className="rank-scan-fade" />
                    </div>

                    <div className="rank-scan-cta">
                      <p className="rank-scan-hint">🔒 베이직에서 {UNIQUE_SCAN_TICKERS.length}개 종목 × 29개 전략을 무제한 스캔할 수 있어요</p>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}

      <div className="trade-disclaimer">
        ⚠️ 랭킹은 과거 백테스트 기반이며, 미래 수익을 보장하지 않습니다.
      </div>

    </div>
  );
}
