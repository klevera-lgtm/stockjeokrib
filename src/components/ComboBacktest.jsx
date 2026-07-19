import { useState, useCallback, useEffect, useRef } from "react";
import { loadPrices, prefetchTickers } from "../utils/dataLoader.js";
import { getCachedComboResult } from "../utils/comboResultCache.js";
import {
  runStrategy,
  ALL_STRATEGIES,
  STRATEGY_LABELS,
  formatKRW,
  formatPct,
  calcMDD,
  calcSharpe,
} from "../utils/calculator.js";
import { consumeQuery, isBasic, getQueryBalance } from "../utils/premium.js";
import { calcPercentile } from "../utils/percentile.js";
import { logClick } from "../utils/analytics.js";
import TickerSearch from "./TickerSearch.jsx";
import LineChart from "./LineChart.jsx";
import UpgradeModal from "./UpgradeModal.jsx";
import QueryGateModal from "./QueryGateModal.jsx";
import FeaturedCombos from "./FeaturedCombos.jsx";
import ShareSheet from "./ShareSheet.jsx";
import AdBanner from "./AdBanner.jsx";
import { getTickerLabel } from "../utils/tickers.js";
import { APP_LINK } from "../utils/share.js";

function hasPoolStrategy(strategyMap) {
  return Object.values(strategyMap ?? {}).some(
    (s) => s.startsWith("ma") || s.startsWith("rsi") || s === "drop3" || s === "drop5"
  );
}

function getAllocLabel(allocs) {
  return allocs.map((a) => `${getTickerLabel(a.ticker)} ${a.pct}%`).join(" / ");
}

function findBestStrategy(prices, monthlyAmount, startDate, endDate) {
  const results = ALL_STRATEGIES.map((s) =>
    runStrategy(prices, s, monthlyAmount, startDate, endDate)
  ).filter(Boolean);
  if (results.length === 0) return "monthly-first";
  results.sort((a, b) => b.totalReturn - a.totalReturn);
  return results[0].strategy;
}

export default function ComboBacktest({ focus = null }) {
  const [tickers, setTickers] = useState([]);
  const [weights, setWeights] = useState({});
  const [monthlyAmount, setMonthlyAmount] = useState(300000);
  const [customStart, setCustomStart] = useState("");
  const [useAutoStrategy, setUseAutoStrategy] = useState(false);
  const [presetStrategyMap, setPresetStrategyMap] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showQueryGate, setShowQueryGate] = useState(false);
  const [autoRun, setAutoRun] = useState(false);
  const [freeCombo, setFreeCombo] = useState(false);
  const [revealed, setRevealed] = useState(isBasic());
  const [remaining, setRemaining] = useState(getQueryBalance());
  const [showShare, setShowShare] = useState(false);
  const [percentile, setPercentile] = useState(null);
  const [gateReason, setGateReason] = useState("reveal");
  const resultRef = useRef(null);
  const basic = isBasic();

  // 결과가 나오면 같은 기간 전체 자산 대비 백분위 계산
  useEffect(() => {
    setPercentile(null);
    if (!results?.portfolioValues?.length || results.totalInvested <= 0) return;
    const pv = results.portfolioValues;
    const years = (pv.at(-1).date - pv[0].date) / (365.25 * 24 * 3600 * 1000);
    const cagr = Math.pow(results.finalValue / results.totalInvested, 1 / years) - 1;
    let cancelled = false;
    calcPercentile(years, cagr).then((p) => { if (!cancelled) setPercentile(p); });
    return () => { cancelled = true; };
  }, [results]);

  function handleReveal() {
    if (basic) { setRevealed(true); return; }
    if (consumeQuery()) {
      setRevealed(true);
      setRemaining(getQueryBalance());
    } else {
      setGateReason("reveal");
      setShowQueryGate(true);
    }
  }

  function handleTickerChange(newTickers) {
    setPresetStrategyMap(null);
    setTickers(newTickers);
    if (newTickers.length === 0) { setWeights({}); return; }
    const eq = Math.floor(100 / newTickers.length);
    const remainder = 100 - eq * newTickers.length;
    const newW = {};
    newTickers.forEach((t, i) => { newW[t] = i === 0 ? eq + remainder : eq; });
    setWeights(newW);
    prefetchTickers(newTickers);
  }

  function periodKeyToStart(periodKey) {
    const d = new Date();
    const n = parseInt(periodKey, 10);
    if (periodKey.endsWith("mo")) d.setMonth(d.getMonth() - n);
    else d.setFullYear(d.getFullYear() - n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function handleComboSelect(comboTickers, comboStrategies, periodKey, isFree = false, lKey = null) {
    logClick("featured_chart", { period: periodKey, leverage: lKey ?? "unknown" });
    const n = comboTickers.length;
    const eq = Math.floor(100 / n);
    const rem = 100 - eq * n;
    const newW = {};
    comboTickers.forEach((t, i) => { newW[t] = i === 0 ? eq + rem : eq; });
    const stratMap = {};
    comboTickers.forEach((t, i) => { stratMap[t] = comboStrategies[i]; });

    setTickers([...comboTickers]);
    setWeights(newW);
    setCustomStart(periodKeyToStart(periodKey));
    setPresetStrategyMap(stratMap);
    setUseAutoStrategy(false);
    setFreeCombo(isFree);
    setRevealed(basic || isFree);
    setError(null);

    // 캐시 hit → 즉시 표시 (기본 납입금 30만원 기준으로 미리 계산된 결과)
    if (lKey && monthlyAmount === 300000) {
      const cached = getCachedComboResult(`${periodKey}-${lKey}`);
      if (cached) {
        setResults(cached);
        setLoading(false);
        return;
      }
    }

    setResults(null);
    setLoading(true);
    setLoadingMsg("차트 준비 중...");
    setAutoRun(true);
  }

  function updateWeight(ticker, val) {
    setWeights((w) => ({ ...w, [ticker]: Math.max(0, Math.min(100, Number(val))) }));
  }

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  const run = useCallback(async () => {
    if (tickers.length < 1) return;
    if (totalWeight !== 100) { setError("비중 합계가 100%여야 합니다."); return; }
    logClick("combo_run", { assets: tickers.length, auto: useAutoStrategy, preset: !!presetStrategyMap });

    // 자동 전략 선택은 코인 1개 소모 (콤보 프리셋 제외)
    if (useAutoStrategy && !presetStrategyMap && !basic) {
      if (!consumeQuery()) {
        setGateReason("run");
        setShowQueryGate(true);
        return;
      }
      setRemaining(getQueryBalance());
    }

    setError(null);
    setResults(null);
    setRevealed(basic || freeCombo);
    const runStart = Date.now();

    try {
      const endDate = new Date();
      let startDate;
      if (customStart) {
        startDate = new Date(customStart + "-01");
      } else {
        startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 5);
      }

      setLoadingMsg("가격 데이터 불러오는 중...");
      const allPrices = {};
      await Promise.all(
        tickers.map(async (t) => { allPrices[t] = await loadPrices(t); })
      );

      const strategyMap = {};
      if (presetStrategyMap) {
        tickers.forEach((t) => { strategyMap[t] = presetStrategyMap[t] ?? "monthly-first"; });
      } else if (useAutoStrategy) {
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
        fromCombo: !!presetStrategyMap,
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
      const elapsed = Date.now() - runStart;
      if (elapsed < 1200) await new Promise(r => setTimeout(r, 1200 - elapsed));
      setLoading(false);
      setLoadingMsg("");
    }
  }, [tickers, weights, monthlyAmount, customStart, useAutoStrategy, presetStrategyMap, totalWeight, basic]);

  useEffect(() => {
    if (autoRun && tickers.length > 0 && totalWeight === 100) {
      setAutoRun(false);
      run();
    }
  }, [autoRun, tickers, totalWeight, run]);

  useEffect(() => {
    if (results) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [results]);

  // 공유 시트는 버튼 클릭으로만 열림 (검수 가이드: 바텀시트 자동 노출 금지)
  useEffect(() => {
    if (!results || loading) setShowShare(false);
  }, [results, loading]);

  const hasStrategyBox = results && (results.useAutoStrategy || results.fromCombo);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">조합 탐색</h1>
        <p className="page-subtitle">최대 5개 자산을 조합해 백테스트해요</p>
      </div>

      <FeaturedCombos onComboSelect={handleComboSelect} focus={focus} />

      <div style={{ borderTop: "1px solid var(--border)", margin: "4px 16px 16px", opacity: 0.5 }} />
      <p style={{ fontSize: 12, color: "var(--text-secondary)", padding: "0 16px 8px", fontWeight: 600 }}>
        직접 백테스트
      </p>

      <div className="form-section">
        <label className="form-label">자산 선택 (최대 5개)</label>
        <TickerSearch onSelect={handleTickerChange} multi selected={tickers} />
      </div>

      {tickers.length > 0 && (
        <div className="form-section">
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
              <span className="weight-ticker">{getTickerLabel(t)}</span>
              <input
                type="number" min={0} max={100}
                value={weights[t] ?? 0}
                onChange={(e) => updateWeight(t, e.target.value)}
                className="weight-number"
              />
              <span className="weight-pct">%</span>
            </div>
          ))}
          {totalWeight !== 100 && (
            <p className="weight-hint">
              {totalWeight > 100
                ? `비중 합계가 ${totalWeight - 100}% 초과예요. 줄여주세요.`
                : `비중 합계가 ${100 - totalWeight}% 부족해요. 늘려주세요.`}
            </p>
          )}

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

          <button
            className={`auto-strategy-toggle${useAutoStrategy ? " active" : ""}`}
            onClick={() => setUseAutoStrategy((v) => !v)}
          >
            <span className="auto-strategy-icon">{useAutoStrategy ? "✓" : "○"}</span>
            <span>
              <strong>기간 최적 전략 자동 선택{!basic ? " (코인 1개)" : ""}</strong>
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
            {loading
              ? loadingMsg || "계산 중..."
              : `조합 백테스트 실행${useAutoStrategy && !basic ? " (코인 1개)" : ""}`}
          </button>
        </div>
      )}

      {loading && (
        <>
          <div className="loading-sheet-backdrop" />
          <div className="loading-sheet">
            <p className="loading-sheet-step">
              {loadingMsg?.includes("데이터") ? "1 / 2 단계" : "2 / 2 단계"}
            </p>
            <p className="loading-sheet-title">{loadingMsg || "차트 준비 중..."}</p>
            <div className="loading-sheet-bar">
              <div className="loading-sheet-bar-fill" />
            </div>
            <p className="loading-sheet-hint">잠시만 기다려주세요</p>
          </div>
        </>
      )}

      {error && <p className="error-msg">{error}</p>}

      {results && (
        <div className="results-section" ref={resultRef}>
          <h2 className="section-title">
            {getAllocLabel(results.allocs)}
            <span className="period-label">{results.period}</span>
          </h2>

          <LineChart data={results.portfolioValues} title="포트폴리오 가치" />

          {/* 적용된 전략 — 코인 공개 */}
          {hasStrategyBox && (
            <>
              <div className="strategy-used-box">
                <p className="strategy-used-title">
                  {results.fromCombo ? "📌 콤보 전략 그대로 적용" : "📌 적용된 전략 (기간 최적)"}
                </p>
                {results.allocs.map((a) => (
                  <div key={a.ticker} className="strategy-used-row">
                    <span className="strategy-used-ticker">{getTickerLabel(a.ticker)}</span>
                    <span className="strategy-used-arrow">→</span>
                    <span className={`strategy-used-name${!revealed ? " name--blur" : ""}`}>
                      {STRATEGY_LABELS[results.strategyMap[a.ticker]] ?? "매월 첫 거래일"}
                    </span>
                  </div>
                ))}
              </div>
              {!revealed && (
                <div className="reveal-cta">
                  <p className="reveal-hint">어떤 전략이 적용됐는지 보려면 코인 1개가 필요해요.</p>
                  <button className="btn-primary reveal-btn" onClick={handleReveal}>
                    🔓 전략 공개하기 (코인 1개)
                  </button>
                  <p className="reveal-balance">남은 코인 {remaining}개 · 광고 시청 시 +2개</p>
                </div>
              )}
            </>
          )}

          {percentile && (
            <div className="pct-banner">
              <span className="pct-emoji">🏆</span>
              <div className="pct-text">
                <p className="pct-main">
                  같은 기간 {percentile.total}개 자산 중 <strong>상위 {percentile.topPct}%</strong>
                </p>
                <p className="pct-sub">
                  전체 자산에 매월 적립했을 때와 비교한 연 수익률 기준이에요
                </p>
              </div>
            </div>
          )}

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

          {hasPoolStrategy(results.strategyMap) && (
            <div className="pool-note">
              <p className="pool-note-title">ℹ️ 적립 풀 방식이란?</p>
              <p className="pool-note-body">
                이 조합에는 <strong>MA / RSI / 하락 매수</strong> 전략이 포함돼 있어요.
                이 전략들은 조건이 충족될 때만 투자하는 대신, 매일{" "}
                <strong>약 {Math.round(monthlyAmount / 21).toLocaleString()}원</strong>씩
                (월 {formatKRW(monthlyAmount)} ÷ 21거래일) 가상의 '적립 풀'에 쌓아둬요.
              </p>
              <p className="pool-note-body">
                MA 아래 / RSI 이하 / 전일 대비 하락 조건이 생기는 날, 쌓인 금액을 한꺼번에 투자하고
                풀을 초기화해요. 조건이 드물게 발생하면 풀에 현금이 남아,
                위 <strong>납입 원금이 월 {formatKRW(monthlyAmount)} × 개월 수보다 적을 수 있어요.</strong>
              </p>
            </div>
          )}

          <div className="metric-guide">
            <p className="metric-guide-title">📌 지표 안내</p>
            <p className="metric-guide-item">
              <strong>MDD (최대 낙폭)</strong> — 투자 기간 중 고점에서 최대 얼마나 떨어졌는지예요. 작을수록 안정적이에요.
            </p>
            <p className="metric-guide-item">
              <strong>샤프지수</strong> — 위험 대비 수익률이에요. 높을수록 좋고, 1 이상이면 우수한 편이에요.
            </p>
          </div>

          <button className="ssheet-trigger" onClick={() => setShowShare(true)}>
            📤 결과 공유하기
          </button>

          <AdBanner className="ad-banner-results" />

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
          onEarned={() => (gateReason === "run" ? run() : handleReveal())}
          onUpgrade={() => setShowUpgrade(true)}
        />
      )}
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
      {showShare && results && (
        <ShareSheet
          text={`📊 조합 백테스트 결과\n${getAllocLabel(results.allocs)} (${results.period})\n원금 ${formatKRW(results.totalInvested)} → ${formatKRW(results.finalValue)}\n수익률 ${formatPct(results.totalReturn)} | MDD ${formatPct(results.mdd)}${percentile ? `\n🏆 같은 기간 ${percentile.total}개 자산 중 상위 ${percentile.topPct}%` : ""}`}
          card={{
            title: getAllocLabel(results.allocs),
            period: results.period,
            invested: results.totalInvested,
            finalValue: results.finalValue,
            returnPct: results.totalReturn,
            mdd: results.mdd,
            series: results.portfolioValues.map((v) => v.value),
            strategies: results.allocs.map(
              (a) => `${getTickerLabel(a.ticker)} · ${STRATEGY_LABELS[results.strategyMap[a.ticker]] ?? "매월 첫 거래일"}`
            ),
          }}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
