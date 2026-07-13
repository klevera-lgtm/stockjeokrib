import { useState, useEffect, useRef } from "react";
import { loadPrices } from "../utils/dataLoader.js";
import {
  runStrategy,
  ALL_STRATEGIES,
  STRATEGY_LABELS,
  calcSMA,
  calcRSI,
} from "../utils/calculator.js";
import { isBasic } from "../utils/premium.js";
import { getTickerMeta } from "../utils/tickerMeta.js";
import { getTickerLabel } from "../utils/tickers.js";
import {
  getAnonKey,
  fetchPortfolio,
  addPortfolioItem,
  removePortfolioItem,
} from "../utils/portfolioApi.js";
import TickerSearch from "./TickerSearch.jsx";

const FREE_LIMIT = 3;
const BASIC_LIMIT = 20;

const PERIODS = [
  { label: "1년", years: 1 },
  { label: "2년", years: 2 },
  { label: "3년", years: 3 },
  { label: "5년", years: 5 },
];

const STRATEGY_COND_LABELS = {
  "daily":         "매일 매수",
  "weekly-fri":    "매주 금요일에 매수",
  "monthly-first": "매달 첫 거래일에 매수",
  "monthly-15":    "매달 15일 전후에 매수",
  "monthly-last":  "매달 마지막 거래일에 매수",
  "ma10":          "10일 이평선 아래일 때 매수",
  "ma50":          "50일 이평선 아래일 때 매수",
  "ma100":         "100일 이평선 아래일 때 매수",
  "ma200":         "200일 이평선 아래일 때 매수",
  "drop3":         "전일 대비 3% 이상 하락 시 매수",
  "drop5":         "전일 대비 5% 이상 하락 시 매수",
  "rsi20":         "RSI 20 이하 (극과매도) 시 매수",
  "rsi30":         "RSI 30 이하 (과매도) 시 매수",
};

function enrichItem(item) {
  const meta = getTickerMeta(item.ticker);
  const label = getTickerLabel(item.ticker);
  return {
    ...item,
    tickerName: meta?.name ?? (label !== item.ticker ? label : null),
  };
}

function findBestStrategyForPeriod(prices, years) {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - years);
  const results = ALL_STRATEGIES
    .map((s) => runStrategy(prices, s, 300000, start, end))
    .filter(Boolean);
  if (results.length === 0) return { strategy: "monthly-first", cagr: 0 };
  results.sort((a, b) => b.cagr - a.cagr);
  return { strategy: results[0].strategy, cagr: results[0].cagr };
}

async function analyzeAllPeriods(prices) {
  const results = await Promise.all(
    PERIODS.map(async ({ label, years }) => {
      const { strategy, cagr } = findBestStrategyForPeriod(prices, years);
      return { label, years, strategy, cagr };
    })
  );
  return results;
}

function checkTodayCondition(prices, strategy) {
  if (prices.length < 2) return false;
  const last = prices[prices.length - 1];
  const prev = prices[prices.length - 2];

  if (strategy.startsWith("ma")) {
    const period = parseInt(strategy.replace("ma", ""), 10);
    const sma = calcSMA(prices, period);
    const lastSMA = sma[sma.length - 1];
    return lastSMA != null && last.close < lastSMA;
  }
  if (strategy.startsWith("rsi")) {
    const threshold = parseInt(strategy.replace("rsi", ""), 10);
    const rsi = calcRSI(prices, 14);
    const lastRSI = rsi[rsi.length - 1];
    return lastRSI != null && lastRSI < threshold;
  }
  if (strategy === "drop3") return (last.close - prev.close) / prev.close <= -0.03;
  if (strategy === "drop5") return (last.close - prev.close) / prev.close <= -0.05;
  if (strategy === "daily") return true;
  if (strategy === "weekly-fri") return last.date.getDay() === 5;
  if (strategy === "monthly-first") return last.date.getMonth() !== prev.date.getMonth();
  if (strategy === "monthly-15") return last.date.getDate() >= 15 && prev.date.getDate() < 15;
  if (strategy === "monthly-last") {
    const daysInMonth = new Date(last.date.getFullYear(), last.date.getMonth() + 1, 0).getDate();
    return last.date.getDate() >= daysInMonth - 2;
  }
  return false;
}

export default function MyPortfolio() {
  const [items, setItems] = useState([]);
  const [loadingCloud, setLoadingCloud] = useState(true);
  const [syncError, setSyncError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [periodResults, setPeriodResults] = useState(null); // [{ label, years, strategy, totalReturn }]
  const [selectedPeriodIdx, setSelectedPeriodIdx] = useState(3); // 기본 5년
  const [conditions, setConditions] = useState({});
  const [checking, setChecking] = useState(false);
  const anonKeyRef = useRef(null);
  const basic = isBasic();
  const limit = basic ? BASIC_LIMIT : FREE_LIMIT;

  // 앱 진입 시 클라우드에서 포트폴리오 로드
  useEffect(() => {
    (async () => {
      setLoadingCloud(true);
      setSyncError(false);
      try {
        const key = await getAnonKey();
        anonKeyRef.current = key;
        const cloudItems = await fetchPortfolio(key);
        if (cloudItems === null) throw new Error("fetch failed");
        const enriched = cloudItems.map(enrichItem);
        setItems(enriched);
        if (enriched.length > 0) checkAllConditions(enriched);
      } catch {
        setSyncError(true);
      } finally {
        setLoadingCloud(false);
      }
    })();
  }, []); // eslint-disable-line

  async function checkAllConditions(currentItems) {
    setChecking(true);
    const results = {};
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    await Promise.all(
      currentItems.map(async (item) => {
        try {
          const prices = await loadPrices(item.ticker);
          const triggered = checkTodayCondition(prices, item.strategy);
          const lastDate = prices[prices.length - 1]?.date;
          const refEntry = prices.find((p) => p.date >= oneYearAgo);
          const latestClose = prices[prices.length - 1]?.close;
          const return1yr = refEntry && latestClose
            ? (latestClose / refEntry.close - 1)
            : null;
          results[item.ticker] = { triggered, lastDate, return1yr };
        } catch {
          results[item.ticker] = { triggered: false, lastDate: null, return1yr: null };
        }
      })
    );
    setConditions(results);
    setChecking(false);
  }

  useEffect(() => {
    if (!selectedTicker) { setPeriodResults(null); return; }
    (async () => {
      setAnalyzing(true);
      setPeriodResults(null);
      setSelectedPeriodIdx(3);
      try {
        const prices = await loadPrices(selectedTicker);
        const results = await analyzeAllPeriods(prices);
        setPeriodResults(results);
      } catch {
        setPeriodResults(null);
      } finally {
        setAnalyzing(false);
      }
    })();
  }, [selectedTicker]);

  async function addItem() {
    if (!periodResults || !anonKeyRef.current) return;
    const { strategy } = periodResults[selectedPeriodIdx];
    const ticker = selectedTicker;
    if (items.some((i) => i.ticker === ticker)) return;
    const result = await addPortfolioItem(anonKeyRef.current, { ticker, strategy });
    if (!result) return;
    const cloudItems = await fetchPortfolio(anonKeyRef.current);
    if (cloudItems) {
      const enriched = cloudItems.map(enrichItem);
      setItems(enriched);
      checkAllConditions(enriched);
    }
    setAdding(false);
    setSelectedTicker(null);
    setPeriodResults(null);
  }

  async function removeItem(ticker) {
    if (!anonKeyRef.current) return;
    await removePortfolioItem(anonKeyRef.current, ticker);
    setItems((prev) => prev.filter((i) => i.ticker !== ticker));
    setConditions((c) => { const n = { ...c }; delete n[ticker]; return n; });
  }

  const triggeredItems = items.filter((i) => conditions[i.ticker]?.triggered);
  const alreadyAdded = selectedTicker && items.some((i) => i.ticker === selectedTicker);

  if (loadingCloud) {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">포트폴리오</h1>
        </div>
        <p className="loading-state" style={{ padding: "40px 0", textAlign: "center" }}>
          불러오는 중...
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">포트폴리오</h1>
        <p className="page-subtitle">종목별 최적 전략 조건을 저장하고 관리해요</p>
      </div>

      {/* 동기화 오류 배너 */}
      {syncError && (
        <div className="login-connect-banner">
          <div className="login-connect-info">
            <p className="login-connect-title">⚠️ 클라우드 연결 실패</p>
            <p className="login-connect-desc">저장된 데이터를 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
          </div>
        </div>
      )}

      {/* 조건 충족 배너 */}
      {triggeredItems.length > 0 && (
        <div className="portfolio-alert-banner">
          <span className="portfolio-alert-icon">🔔</span>
          <div>
            <p className="portfolio-alert-title">오늘 조건이 충족된 종목이 있어요!</p>
            <p className="portfolio-alert-tickers">
              {triggeredItems.map((i) => i.tickerName ?? i.ticker).join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* 빈 상태 */}
      {items.length === 0 && !adding && (
        <div className="portfolio-empty">
          <p className="portfolio-empty-icon">📋</p>
          <p className="portfolio-empty-title">아직 저장된 종목이 없어요</p>
          <p className="portfolio-empty-desc">
            종목을 추가하면 기간별 최적 적립 전략과 조건 충족 알림을 받을 수 있어요
          </p>
        </div>
      )}

      {/* 포트폴리오 목록 */}
      {items.length > 0 && (
        <div className="portfolio-list">
          {checking && <p className="loading-state">조건 확인 중...</p>}
          {items.map((item) => {
            const cond = conditions[item.ticker];
            return (
              <div
                key={item.ticker}
                className={`portfolio-card${cond?.triggered ? " portfolio-card--triggered" : ""}`}
              >
                <div className="portfolio-card-header">
                  <div className="portfolio-card-info">
                    <span className="portfolio-card-ticker">{item.ticker}</span>
                    {item.tickerName && (
                      <span className="portfolio-card-name">{item.tickerName}</span>
                    )}
                  </div>
                  <div className="portfolio-card-header-right">
                    {cond?.return1yr != null && (
                      <span className={`portfolio-1yr-badge ${cond.return1yr >= 0 ? "pos" : "neg"}`}>
                        1년 {cond.return1yr >= 0 ? "+" : ""}{(cond.return1yr * 100).toFixed(1)}%
                      </span>
                    )}
                    <button
                      className="portfolio-card-delete"
                      onClick={() => removeItem(item.ticker)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="portfolio-card-strategy">
                  <span className="portfolio-card-strategy-badge">전략</span>
                  <span className="portfolio-card-strategy-name">
                    {STRATEGY_LABELS[item.strategy] ?? item.strategy}
                  </span>
                </div>
                <div className="portfolio-card-cond-desc">
                  {STRATEGY_COND_LABELS[item.strategy] ?? "조건 충족 시 알림"}
                </div>
                <div className="portfolio-card-status">
                  {cond == null ? (
                    <span className="portfolio-status portfolio-status--loading">확인 중...</span>
                  ) : cond.triggered ? (
                    <span className="portfolio-status portfolio-status--triggered">
                      🔔 오늘 매수 조건 충족!
                    </span>
                  ) : (
                    <span className="portfolio-status portfolio-status--waiting">
                      ⏳ 조건 대기 중
                    </span>
                  )}
                  {cond?.lastDate && (
                    <span className="portfolio-status-date">
                      {new Date(cond.lastDate).toLocaleDateString("ko-KR", {
                        month: "short", day: "numeric",
                      })} 기준
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 추가하기 */}
      {adding ? (
        <div className="form-section">
          <label className="form-label">종목 선택</label>
          <TickerSearch onSelect={setSelectedTicker} selected={selectedTicker} />

          {alreadyAdded && (
            <p className="weight-hint">이미 포트폴리오에 추가된 종목이에요</p>
          )}

          {selectedTicker && !alreadyAdded && (
            <div className="portfolio-analysis">
              {analyzing ? (
                <p className="loading-state">기간별 최적 전략 분석 중...</p>
              ) : periodResults ? (
                <>
                  <div className="portfolio-period-header">
                    <p className="portfolio-period-title">기간별 최적 적립 전략</p>
                    <p className="portfolio-period-desc">
                      각 기간 동안 이 전략으로 매달 적립했을 때 가장 높은 성과를 냈어요. 원하는 기간을 선택하면 조건이 충족되는 날 알림을 드려요.
                    </p>
                    <p className="portfolio-period-cagr-note">
                      수익률은 <strong>연환산(CAGR)</strong> 기준이에요. 기간이 달라도 연간 성과를 동일하게 비교할 수 있어요.
                    </p>
                  </div>
                  <div className="portfolio-period-list">
                    {(() => {
                      const bestIdx = periodResults.reduce(
                        (bi, r, i) => r.cagr > periodResults[bi].cagr ? i : bi, 0
                      );
                      return periodResults.map((r, idx) => {
                        const pct = r.cagr * 100;
                        const returnClass = pct >= 20 ? "portfolio-period-return--high"
                          : pct >= 10 ? "portfolio-period-return--mid"
                          : "portfolio-period-return--low";
                        return (
                          <button
                            key={r.label}
                            className={`portfolio-period-card${selectedPeriodIdx === idx ? " portfolio-period-card--selected" : ""}`}
                            onClick={() => setSelectedPeriodIdx(idx)}
                          >
                            <div className="portfolio-period-top">
                              <span className="portfolio-period-label">{r.label} 기준</span>
                              {idx === bestIdx && (
                                <span className="portfolio-period-best">추천</span>
                              )}
                            </div>
                            <span className="portfolio-period-strategy">{STRATEGY_LABELS[r.strategy] ?? r.strategy}</span>
                            <span className={`portfolio-period-return ${returnClass}`}>
                              {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
                            </span>
                          </button>
                        );
                      });
                    })()}
                  </div>
                  <button className="btn-primary" style={{ marginTop: 16 }} onClick={addItem}>
                    포트폴리오에 추가
                  </button>
                </>
              ) : null}
            </div>
          )}

          <button
            className="btn-secondary"
            style={{ marginTop: 12, width: "100%" }}
            onClick={() => {
              setAdding(false);
              setSelectedTicker(null);
              setPeriodResults(null);
            }}
          >
            취소
          </button>
        </div>
      ) : (
        <div style={{ padding: "12px 16px 0" }}>
          {items.length < limit ? (
            <button className="btn-primary" onClick={() => setAdding(true)}>
              + 종목 추가 ({items.length}/{limit})
            </button>
          ) : (
            <p className="portfolio-limit-msg">
              {basic
                ? `최대 ${BASIC_LIMIT}개까지 저장할 수 있어요`
                : `무료는 최대 ${FREE_LIMIT}개까지 저장할 수 있어요. 베이직에서 ${BASIC_LIMIT}개까지 가능해요.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
