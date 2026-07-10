import { useState, useCallback } from "react";
import { loadPrices } from "../utils/dataLoader.js";
import {
  runStrategy,
  ALL_STRATEGIES,
  STRATEGY_LABELS,
  formatKRW,
  formatPct,
  calcMDD,
  calcSharpe,
} from "../utils/calculator.js";
import { consumeFreeQuery } from "../utils/premium.js";
import TickerSearch from "./TickerSearch.jsx";
import LineChart from "./LineChart.jsx";
import UpgradeModal from "./UpgradeModal.jsx";

function getAllocLabel(allocs) {
  return allocs.map((a) => `${a.ticker} ${a.pct}%`).join(" / ");
}

function findBestStrategy(prices, monthlyAmount, startDate, endDate) {
  const results = ALL_STRATEGIES.map((s) =>
    runStrategy(prices, s, monthlyAmount, startDate, endDate)
  ).filter(Boolean);
  if (results.length === 0) return "monthly-first";
  results.sort((a, b) => b.totalReturn - a.totalReturn);
  return results[0].strategy;
}

export default function ComboBacktest() {
  const [tickers, setTickers] = useState([]);
  const [weights, setWeights] = useState({});
  const [monthlyAmount, setMonthlyAmount] = useState(300000);
  const [customStart, setCustomStart] = useState("");
  const [useAutoStrategy, setUseAutoStrategy] = useState(false);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  function handleTickerChange(newTickers) {
    setTickers(newTickers);
    if (newTickers.length === 0) { setWeights({}); return; }
    const eq = Math.floor(100 / newTickers.length);
    const remainder = 100 - eq * newTickers.length;
    const newW = {};
    newTickers.forEach((t, i) => { newW[t] = i === 0 ? eq + remainder : eq; });
    setWeights(newW);
  }

  function updateWeight(ticker, val) {
    setWeights((w) => ({ ...w, [ticker]: Math.max(0, Math.min(100, Number(val))) }));
  }

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  const run = useCallback(async () => {
    if (tickers.length < 1) return;
    if (totalWeight !== 100) { setError("비중 합계가 100%여야 합니다."); return; }
    if (!consumeFreeQuery()) { setShowUpgrade(true); return; }

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const endDate = new Date();
      let startDate;
      if (customStart) {
        startDate = new Date(customStart + "-01");
      } else {
        startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 5);
      }

      // Load all price data
      setLoadingMsg("가격 데이터 불러오는 중...");
      const allPrices = {};
      await Promise.all(
        tickers.map(async (t) => { allPrices[t] = await loadPrices(t); })
      );

      // Find best strategy per ticker if auto-strategy is on
      const strategyMap = {};
      if (useAutoStrategy) {
        setLoadingMsg("각 자산의 최적 전략 분석 중...");
        await Promise.all(
          tickers.map(async (t) => {
            const pct = (weights[t] ?? 0) / 100;
            strategyMap[t] = findBestStrategy(
              allPrices[t],
              monthlyAmount * pct,
              startDate,
              endDate
            );
          })
        );
      } else {
        tickers.forEach((t) => { strategyMap[t] = "monthly-first"; });
      }

      // Run strategy per ticker
      setLoadingMsg("포트폴리오 계산 중...");
      const perTicker = {};
      tickers.forEach((t) => {
        const pct = (weights[t] ?? 0) / 100;
        perTicker[t] = runStrategy(
          allPrices[t],
          strategyMap[t],
          monthlyAmount * pct,
          startDate,
          endDate
        );
      });

      // Merge portfolio values by date
      const allDates = new Set();
      tickers.forEach((t) => {
        perTicker[t]?.portfolioValues?.forEach((v) =>
          allDates.add(v.date.toISOString().slice(0, 10))
        );
      });
      const sortedDates = [...allDates].sort();

      const portfolioValues = sortedDates.map((d) => {
        let value = 0, invested = 0;
        tickers.forEach((t) => {
          const pv = perTicker[t]?.portfolioValues ?? [];
          const entry = pv.filter((v) => v.date.toISOString().slice(0, 10) <= d).at(-1);
          if (entry) { value += entry.value; invested += entry.invested; }
        });
        return { date: new Date(d), value, invested };
      });

      const finalValue = portfolioValues.at(-1)?.value ?? 0;
      const totalInvested = Object.values(perTicker).reduce(
        (sum, r) => sum + (r?.totalInvested ?? 0), 0
      );
      const totalReturn = totalInvested > 0 ? (finalValue - totalInvested) / totalInvested : 0;
      const mdd = calcMDD(portfolioValues.map((v) => v.value));
      const sharpe = calcSharpe(portfolioValues.map((v) => v.value));

      setResults({
        allocs: tickers.map((t) => ({ ticker: t, pct: weights[t] })),
        strategyMap,
        useAutoStrategy,
        totalInvested,
        finalValue,
        totalReturn,
        mdd,
        sharpe,
        portfolioValues,
        period: customStart ? `${customStart} ~ 현재` : "최근 5년",
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  }, [tickers, weights, monthlyAmount, customStart, useAutoStrategy, totalWeight]);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">조합 탐색</h1>
        <p className="page-subtitle">최대 5개 자산을 조합해 백테스트해요</p>
      </div>

      <div className="form-section">
        <label className="form-label">자산 선택 (최대 5개)</label>
        <TickerSearch onSelect={handleTickerChange} multi selected={tickers} />
      </div>

      {tickers.length > 0 && (
        <div className="form-section">
          {/* 비중 설정 */}
          <div className="weight-header">
            <label className="form-label">
              비중 설정 (합계: <span className={totalWeight === 100 ? "pos" : "neg"}>{totalWeight}%</span>)
            </label>
            <button
              className="btn-equal-alloc"
              onClick={() => {
                const eq = Math.floor(100 / tickers.length);
                const remainder = 100 - eq * tickers.length;
                const newW = {};
                tickers.forEach((t, i) => { newW[t] = i === 0 ? eq + remainder : eq; });
                setWeights(newW);
              }}
            >
              균등 배분
            </button>
          </div>
          {tickers.map((t) => (
            <div key={t} className="weight-row">
              <span className="weight-ticker">{t}</span>
              <input
                type="range" min={0} max={100}
                value={weights[t] ?? 0}
                onChange={(e) => updateWeight(t, e.target.value)}
                className="weight-slider"
              />
              <input
                type="number" min={0} max={100}
                value={weights[t] ?? 0}
                onChange={(e) => updateWeight(t, e.target.value)}
                className="weight-number"
              />
              <span>%</span>
            </div>
          ))}
          {totalWeight !== 100 && (
            <p className="weight-hint">
              {totalWeight > 100
                ? `비중 합계가 ${totalWeight - 100}% 초과예요. 줄여주세요.`
                : `비중 합계가 ${100 - totalWeight}% 부족해요. 늘려주세요.`}
            </p>
          )}

          {/* 월 납입금 */}
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
          </div>

          {/* 기간 선택 */}
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

          {/* 최적 전략 토글 */}
          <button
            className={`auto-strategy-toggle${useAutoStrategy ? " active" : ""}`}
            onClick={() => setUseAutoStrategy((v) => !v)}
          >
            <span className="auto-strategy-icon">{useAutoStrategy ? "✓" : "○"}</span>
            <span>
              <strong>기간 최적 전략 자동 선택</strong>
              <span className="auto-strategy-desc">
                선택한 기간에서 각 자산별 가장 높은 수익 전략을 자동으로 사용해요
              </span>
            </span>
          </button>

          {totalWeight !== 100 && (
            <p className="run-blocked-hint">비중 합계를 100%로 맞춰야 실행할 수 있어요</p>
          )}
          <button
            className="btn-primary run-btn"
            onClick={run}
            disabled={loading || totalWeight !== 100}
          >
            {loading ? loadingMsg || "계산 중..." : "조합 백테스트 실행"}
          </button>
        </div>
      )}

      {error && <p className="error-msg">{error}</p>}

      {results && (
        <div className="results-section">
          <h2 className="section-title">
            {getAllocLabel(results.allocs)}
            <span className="period-label">{results.period}</span>
          </h2>

          <LineChart data={results.portfolioValues} title="포트폴리오 가치" />

          {/* 전략 사용 내역 (자동 선택 시) */}
          {results.useAutoStrategy && (
            <div className="strategy-used-box">
              <p className="strategy-used-title">📌 적용된 전략 (기간 최적)</p>
              {results.allocs.map((a) => (
                <div key={a.ticker} className="strategy-used-row">
                  <span className="strategy-used-ticker">{a.ticker}</span>
                  <span className="strategy-used-arrow">→</span>
                  <span className="strategy-used-name">
                    {STRATEGY_LABELS[results.strategyMap[a.ticker]] ?? "매월 첫 거래일"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* 스탯 */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">납입 원금</div>
              <div className="stat-value">{formatKRW(results.totalInvested)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">현재 가치</div>
              <div className="stat-value highlight">{formatKRW(results.finalValue)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">수익률</div>
              <div className={`stat-value ${results.totalReturn >= 0 ? "pos" : "neg"}`}>
                {formatPct(results.totalReturn)}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">MDD</div>
              <div className="stat-value neg">{formatPct(results.mdd)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">샤프지수</div>
              <div className="stat-value">{results.sharpe.toFixed(2)}</div>
            </div>
          </div>

          {/* 지표 안내 */}
          <div className="metric-guide">
            <p className="metric-guide-title">📌 지표 안내</p>
            <p className="metric-guide-item">
              <strong>MDD (최대 낙폭)</strong> — 투자 기간 중 고점에서 최대 얼마나 떨어졌는지예요. 작을수록 안정적이에요.
            </p>
            <p className="metric-guide-item">
              <strong>샤프지수</strong> — 위험 대비 수익률이에요. 높을수록 좋고, 1 이상이면 우수한 편이에요.
            </p>
          </div>

          {!results.useAutoStrategy && (
            <div className="upgrade-banner">
              <span>베이직에서 기간 직접 입력 및 최적 전략 조합 백테스트</span>
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
