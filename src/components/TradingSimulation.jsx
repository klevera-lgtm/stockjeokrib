import React, { useState, useCallback, useEffect, useRef } from "react";
import TickerSearch from "./TickerSearch.jsx";
import AdBanner from "./AdBanner.jsx";
import QueryGateModal from "./QueryGateModal.jsx";
import ShareSheet from "./ShareSheet.jsx";
import { consumeQuery, consumeQueries, getQueryBalance, isBasic } from "../utils/premium.js";
import { loadPrices } from "../utils/dataLoader.js";
import { logClick } from "../utils/analytics.js";
import { getTickerName, fmtPrice, isKrTicker } from "../utils/tickers.js";
import {
  backtestMA, backtestRSI, backtestMACD, backtestCombo, backtestDualMA, backtestBollinger,
  filterByPeriod, toWeekly, buyAndHold, scoreResult, scoreBreakdown, rankAllStrategies,
  strategyLabel, comboLabel, MA_PERIODS, RSI_COMBOS, DUAL_MA_COMBOS, BOLLINGER_COMBOS, BACKTEST_PERIODS,
  COMBO_PRESETS,
} from "../utils/tradingEngine.js";
import { Chart } from "chart.js/auto";

const STRATEGY_TYPES = [
  { id: "ma", label: "이동평균선", desc: "이평선 돌파 시 진입, 이탈 시 청산", coin: 1 },
  { id: "rsi", label: "RSI", desc: "과매도 진입, 과매수 청산", coin: 1 },
  { id: "dualma", label: "이중 이평선", desc: "단기 MA가 장기 MA를 교차할 때 매매", coin: 1 },
  { id: "macd", label: "MACD", desc: "시그널선 교차 매매", coin: 1 },
  { id: "bollinger", label: "볼린저밴드", desc: "하단 밴드 터치 시 진입, 평균 복귀 시 청산", coin: 1 },
  { id: "combo", label: "조합 전략", desc: "여러 지표를 결합해 테스트", coin: 2 },
];

const COMBO_MA_OPTIONS = [20, 50, 100, 200];
const COMBO_STOP_OPTIONS = [-5, -10];
const TOP10_COIN_COST = 5;

function fmt(n, d = 1) {
  if (n == null || isNaN(n)) return "—";
  return n.toFixed(d);
}

function TradeChart({ prices, trades, ticker }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !prices?.length) return;
    if (chartRef.current) chartRef.current.destroy();

    const step = Math.max(1, Math.floor(prices.length / 200));
    const sampled = prices.filter((_, i) => i % step === 0 || i === prices.length - 1);
    const labels = sampled.map(p => p.date.toISOString().slice(0, 10));
    const closeData = sampled.map(p => p.close);

    const buyPoints = [];
    const sellPoints = [];
    for (const t of trades) {
      const entryKey = t.entryDate.toISOString().slice(0, 10);
      const exitKey = t.exitDate.toISOString().slice(0, 10);
      const bi = labels.findIndex(l => l >= entryKey);
      const si = labels.findIndex(l => l >= exitKey);
      if (bi >= 0) buyPoints.push({ x: labels[bi], y: closeData[bi] });
      if (si >= 0) sellPoints.push({ x: labels[si], y: closeData[si], win: t.returnPct >= 0 });
    }

    chartRef.current = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "주가",
            data: closeData,
            borderColor: "#3182F6",
            backgroundColor: "rgba(49,130,246,0.08)",
            fill: true,
            tension: 0.2,
            pointRadius: 0,
            borderWidth: 1.5,
            order: 2,
          },
          {
            label: "진입",
            data: buyPoints.map(p => ({ x: p.x, y: p.y })),
            type: "scatter",
            pointRadius: 6,
            pointStyle: "triangle",
            pointBackgroundColor: "#00b96b",
            pointBorderColor: "#fff",
            pointBorderWidth: 1,
            order: 1,
          },
          {
            label: "이탈",
            data: sellPoints.map(p => ({ x: p.x, y: p.y })),
            type: "scatter",
            pointRadius: 6,
            pointStyle: "triangle",
            pointRotation: 180,
            pointBackgroundColor: sellPoints.map(p => p.win ? "#00b96b" : "#ff3b30"),
            pointBorderColor: "#fff",
            pointBorderWidth: 1,
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            labels: { boxWidth: 10, font: { size: 11 } },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                if (ctx.dataset.label === "주가") return fmtPrice(ctx.raw, ticker);
                return `${ctx.dataset.label} ${fmtPrice(ctx.raw.y, ticker)}`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: {
              maxTicksLimit: 5,
              callback(val) {
                const l = this.getLabelForValue(val);
                if (!l) return "";
                return l.slice(2, 7).replace("-", ".");
              },
            },
            grid: { display: false },
          },
          y: {
            ticks: { callback: (v) => fmtPrice(v, ticker) },
          },
        },
      },
    });

    return () => chartRef.current?.destroy();
  }, [prices, trades]);

  return (
    <div className="trade-chart-wrap">
      <canvas ref={canvasRef} />
    </div>
  );
}

export default function TradingSimulation({ onCoinsChanged, initialTicker }) {
  const [step, setStep] = useState(initialTicker ? "timeframe" : "ticker");
  const [ticker, setTicker] = useState(initialTicker || null);
  const [timeframe, setTimeframe] = useState("daily");
  const [strategyType, setStrategyType] = useState(null);
  const [strategyParams, setStrategyParams] = useState(null);
  const [period, setPeriod] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [showGate, setShowGate] = useState(false);
  const [error, setError] = useState(null);
  const [chartPrices, setChartPrices] = useState(null);
  const [comboPreset, setComboPreset] = useState(null);
  const [comboConfig, setComboConfig] = useState({ maPeriod: 50, buyBelow: 30, sellAbove: 70, stopLoss: -10 });
  const [top10Results, setTop10Results] = useState(null);
  const [top10ActiveTab, setTop10ActiveTab] = useState(0);
  const [top10Loading, setTop10Loading] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showScoreInfo, setShowScoreInfo] = useState(false);

  const reset = useCallback(() => {
    setStep("ticker");
    setTicker(null);
    setStrategyType(null);
    setStrategyParams(null);
    setPeriod(null);
    setResult(null);
    setBaseline(null);
    setRevealed(false);
    setError(null);
    setChartPrices(null);
    setComboPreset(null);
    setComboConfig({ maPeriod: 50, buyBelow: 30, sellAbove: 70, stopLoss: -10 });
    setTop10Results(null);
    setTop10ActiveTab(0);
    setTop10Loading(false);
    setShowShare(false);
    setShowScoreInfo(false);
  }, []);

  function handleTickerSelect(t) {
    setTicker(t);
    setStep("timeframe");
    logClick("trade_sim_ticker", { ticker: t });
  }

  function handleTimeframe(tf) {
    setTimeframe(tf);
    setStep("strategy");
  }

  function handleStrategyType(type) {
    setStrategyType(type);
    if (type === "macd") {
      setStrategyParams({});
      setStep("period");
    } else if (type === "ma") {
      setStep("ma-params");
    } else if (type === "rsi") {
      setStep("rsi-params");
    } else if (type === "dualma") {
      setStep("dualma-params");
    } else if (type === "bollinger") {
      setStep("bollinger-params");
    } else if (type === "combo") {
      setStep("combo-select");
    }
  }

  function handleDualMASelect(combo) {
    setStrategyParams({ short: combo.short, long: combo.long });
    setStep("period");
  }

  function handleMASelect(p) {
    setStrategyParams({ period: p });
    setStep("period");
  }

  function handleRSISelect(combo) {
    setStrategyParams(combo);
    setStep("period");
  }

  function handleBollingerSelect(combo) {
    setStrategyParams(combo);
    setStep("period");
  }

  function handleComboPreset(preset) {
    setComboPreset(preset);
    setStep("combo-params");
  }

  function handleComboConfirm() {
    const indicators = [];
    if (comboPreset.indicators.includes("ma")) {
      indicators.push({ type: "ma", params: { period: comboConfig.maPeriod } });
    }
    if (comboPreset.indicators.includes("rsi")) {
      indicators.push({ type: "rsi", params: { buyBelow: comboConfig.buyBelow, sellAbove: comboConfig.sellAbove } });
    }
    if (comboPreset.indicators.includes("macd")) {
      indicators.push({ type: "macd", params: {} });
    }
    const lbl = comboLabel(indicators, comboConfig.stopLoss);
    setStrategyParams({ indicators, stopLoss: comboConfig.stopLoss, _comboLabel: lbl });
    setStep("period");
  }

  async function runBacktest(years, overrideType = null, overrideParams = null) {
    const activeType = overrideType || strategyType;
    const activeParams = overrideParams || strategyParams;
    setPeriod(years);
    setLoading(true);
    setError(null);
    try {
      let prices = await loadPrices(ticker);
      prices = filterByPeriod(prices, years);
      if (timeframe === "weekly") prices = toWeekly(prices);
      if (prices.length < 30) throw new Error("데이터가 부족합니다");

      const bh = buyAndHold(prices);
      setBaseline(bh);

      let res;
      switch (activeType) {
        case "ma":    res = backtestMA(prices, activeParams.period); break;
        case "rsi":   res = backtestRSI(prices, activeParams); break;
        case "dualma": res = backtestDualMA(prices, activeParams.short, activeParams.long); break;
        case "macd":  res = backtestMACD(prices); break;
        case "bollinger": res = backtestBollinger(prices, activeParams); break;
        case "combo": res = backtestCombo(prices, activeParams); break;
        default: throw new Error("알 수 없는 전략");
      }
      res.score = scoreResult(res);
      setResult(res);
      setChartPrices(prices);
      if (overrideType) {
        setStrategyType(overrideType);
        setStrategyParams(overrideParams);
      }
      setStep("result");
      logClick("trade_sim_run", { ticker, strategy: activeType, period: years });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleTop10() {
    if (isBasic()) {
      setTop10Loading(true);
      setError(null);
      try {
        const raw = await loadPrices(ticker);
        const allResults = {};
        for (const bp of BACKTEST_PERIODS) {
          let prices = filterByPeriod(raw, bp.years);
          if (timeframe === "weekly") prices = toWeekly(prices);
          allResults[bp.years] = rankAllStrategies(prices, 10);
        }
        setTop10Results(allResults);
        setTop10ActiveTab(0);
        setStep("top10-result");
        logClick("trade_top10_basic", { ticker });
      } catch (e) {
        setError(e.message);
      } finally {
        setTop10Loading(false);
      }
    } else {
      setStep("top10-period");
    }
  }

  async function handleTop10Period(years) {
    if (getQueryBalance() < TOP10_COIN_COST) { setShowGate(true); return; }
    setTop10Loading(true);
    setError(null);
    try {
      const raw = await loadPrices(ticker);
      let prices = filterByPeriod(raw, years);
      if (timeframe === "weekly") prices = toWeekly(prices);
      const ranked = rankAllStrategies(prices, 10);

      if (!consumeQueries(TOP10_COIN_COST)) { setShowGate(true); return; }
      onCoinsChanged?.();

      setPeriod(years);
      setTop10Results({ [years]: ranked });
      setStep("top10-result");
      logClick("trade_top10_free", { ticker, period: years });
    } catch (e) {
      setError(e.message);
    } finally {
      setTop10Loading(false);
    }
  }

  function handleTop10Select(strat) {
    const years = isBasic() ? BACKTEST_PERIODS[top10ActiveTab].years : period;
    setRevealed(true);
    runBacktest(years, strat.type, strat.params);
  }

  const freeUsedRef = useRef(false);
  const coinCost = strategyType === "combo" ? 2 : 1;
  const firstFree = !isBasic() && strategyType !== "combo" && !freeUsedRef.current;

  function handleReveal() {
    if (isBasic()) { setRevealed(true); return; }
    // 표면 무료: 첫 단일전략 백테스트는 코인 없이
    if (firstFree) { freeUsedRef.current = true; setRevealed(true); return; }
    if (getQueryBalance() < coinCost) { setShowGate(true); return; }
    for (let i = 0; i < coinCost; i++) {
      if (!consumeQuery()) { setShowGate(true); return; }
    }
    onCoinsChanged?.();
    setRevealed(true);
  }

  const label = strategyType ? strategyLabel(strategyType, strategyParams || {}) : "";

  return (
    <div className="trade-sim">
      <h2 className="section-title">백테스트 시뮬레이션</h2>
      <p className="section-desc">전략의 과거 성과를 테스트해 보세요</p>

      {/* Step indicator */}
      <div className="trade-steps">
        <span className={`trade-step${step === "ticker" ? " active" : ticker ? " done" : ""}`}>종목</span>
        <span className="trade-step-arrow">›</span>
        <span className={`trade-step${step === "timeframe" ? " active" : timeframe && step !== "ticker" ? " done" : ""}`}>봉</span>
        <span className="trade-step-arrow">›</span>
        <span className={`trade-step${["strategy", "ma-params", "rsi-params", "dualma-params", "bollinger-params", "combo-select", "combo-params"].includes(step) ? " active" : strategyType || step === "top10-period" || step === "top10-result" ? " done" : ""}`}>전략</span>
        <span className="trade-step-arrow">›</span>
        <span className={`trade-step${step === "period" || step === "top10-period" ? " active" : period ? " done" : ""}`}>기간</span>
        <span className="trade-step-arrow">›</span>
        <span className={`trade-step${step === "result" || step === "top10-result" ? " active" : ""}`}>결과</span>
      </div>

      {/* Step 1: Ticker */}
      {step === "ticker" && (
        <TickerSearch onSelect={handleTickerSelect} selected={ticker} />
      )}

      {/* Step 2: Timeframe */}
      {step === "timeframe" && (
        <div className="trade-card">
          <h3 className="trade-card-title">{getTickerName(ticker)} — 타임프레임 선택</h3>
          <div className="trade-tf-grid">
            <button className="trade-tf-btn" onClick={() => handleTimeframe("daily")}>
              <span className="trade-tf-icon">📊</span>
              <span className="trade-tf-label">일봉</span>
              <span className="trade-tf-desc">매일 종가 기준</span>
            </button>
            <button className="trade-tf-btn" onClick={() => handleTimeframe("weekly")}>
              <span className="trade-tf-icon">📈</span>
              <span className="trade-tf-label">주봉</span>
              <span className="trade-tf-desc">주간 종가 기준</span>
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Strategy type */}
      {step === "strategy" && (
        <div className="trade-card">
          <h3 className="trade-card-title">{getTickerName(ticker)} · {timeframe === "daily" ? "일봉" : "주봉"} — 전략 선택</h3>
          <div className="trade-strategy-list">
            {STRATEGY_TYPES.map((s) => (
              <button
                key={s.id}
                className={`trade-strategy-btn${s.id === "combo" ? " combo" : ""}`}
                onClick={() => handleStrategyType(s.id)}
              >
                <span className="trade-strategy-name">{s.label}</span>
                <span className="trade-strategy-desc">{s.desc}</span>
                <span className="trade-strategy-count">
                  {s.id === "ma" ? "20가지" : s.id === "dualma" ? "4가지" : s.id === "rsi" ? "8가지" : s.id === "bollinger" ? "6가지" : s.id === "combo" ? `🪙${s.coin}` : "1가지"}
                </span>
              </button>
            ))}
          </div>

          <button
            className="trade-top10-btn"
            onClick={handleTop10}
            disabled={top10Loading}
          >
            {top10Loading ? (
              <span>33개 전략 분석 중...</span>
            ) : (
              <>
                <span className="top10-btn-label">🏆 {getTickerName(ticker)} 최적 전략 TOP 10</span>
                {isBasic() ? (
                  <span className="top10-basic-tag">Basic 무료</span>
                ) : (
                  <span className="top10-coin-tag">🪙 {TOP10_COIN_COST}</span>
                )}
              </>
            )}
          </button>
          {error && <p className="trade-error">{error}</p>}
        </div>
      )}

      {/* Step 3a: MA params */}
      {step === "ma-params" && (
        <div className="trade-card">
          <h3 className="trade-card-title">이동평균선 기간 선택</h3>
          <div className="trade-ma-grid">
            {MA_PERIODS.map((p) => (
              <button key={p} className="trade-ma-btn" onClick={() => handleMASelect(p)}>
                {p}일
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3a-2: Dual MA params */}
      {step === "dualma-params" && (
        <div className="trade-card">
          <h3 className="trade-card-title">이중 이평선 조합 선택</h3>
          <div className="trade-rsi-list">
            {DUAL_MA_COMBOS.map((d) => (
              <button key={`${d.short}-${d.long}`} className="trade-strategy-btn" onClick={() => handleDualMASelect(d)}>
                <span className="trade-strategy-name">{d.label}</span>
                <span className="trade-strategy-desc">단기 {d.short}일 / 장기 {d.long}일 교차</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3b: RSI params */}
      {step === "rsi-params" && (
        <div className="trade-card">
          <h3 className="trade-card-title">RSI 조합 선택</h3>
          <div className="trade-rsi-list">
            {RSI_COMBOS.map((c, i) => (
              <button key={i} className="trade-rsi-btn" onClick={() => handleRSISelect(c)}>
                <span>진입 RSI &lt; {c.buyBelow}</span>
                <span>이탈 RSI &gt; {c.sellAbove}</span>
                <span>손절 {c.stopLoss}%</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "bollinger-params" && (
        <div className="trade-card">
          <h3 className="trade-card-title">볼린저밴드 조합 선택</h3>
          <div className="trade-rsi-list">
            {BOLLINGER_COMBOS.map((c, i) => (
              <button key={i} className="trade-rsi-btn" onClick={() => handleBollingerSelect(c)}>
                <span>±{c.stdMult}σ 하단 진입</span>
                <span>{c.exitAt === "upper" ? "상단 밴드" : "중심선"} 청산</span>
                <span>손절 {c.stopLoss}%</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3c: Combo preset select */}
      {step === "combo-select" && (
        <div className="trade-card">
          <h3 className="trade-card-title">조합 전략 선택</h3>
          <details className="combo-accordion">
            <summary>조합 전략은 어떻게 작동하나요?</summary>
            <div className="combo-accordion-body">
              <p><strong>진입 (AND)</strong> — 선택한 지표가 최근 5일 내에 모두 진입 조건을 충족해야 진입합니다. 조건이 까다로운 만큼 더 신중한 진입이 됩니다.</p>
              <p><strong>청산 (OR)</strong> — 어떤 지표든 하나라도 청산 조건을 충족하면 즉시 청산합니다. 빠른 방어로 손실을 줄입니다.</p>
              <p><strong>손절</strong> — 지표 조건과 무관하게 손절선에 도달하면 자동 청산합니다.</p>
            </div>
          </details>
          <div className="trade-strategy-list">
            {COMBO_PRESETS.map((p) => (
              <button key={p.id} className="trade-strategy-btn combo" onClick={() => handleComboPreset(p)}>
                <span className="trade-strategy-name">{p.label}</span>
                <span className="trade-strategy-desc">
                  {p.indicators.map(i => i === "ma" ? "이동평균선" : i === "rsi" ? "RSI" : "MACD").join(" + ")}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3d: Combo params */}
      {step === "combo-params" && comboPreset && (
        <div className="trade-card">
          <h3 className="trade-card-title">{comboPreset.label} — 파라미터 설정</h3>

          {comboPreset.indicators.includes("ma") && (
            <div className="combo-param-group">
              <label className="combo-param-label">이동평균선 기간</label>
              <div className="combo-param-chips">
                {COMBO_MA_OPTIONS.map((p) => (
                  <button key={p} className={`combo-param-chip${comboConfig.maPeriod === p ? " active" : ""}`}
                    onClick={() => setComboConfig(c => ({ ...c, maPeriod: p }))}>{p}일</button>
                ))}
              </div>
            </div>
          )}

          {comboPreset.indicators.includes("rsi") && (
            <div className="combo-param-group">
              <label className="combo-param-label">RSI 진입 기준</label>
              <div className="combo-param-chips">
                {[20, 30].map((v) => (
                  <button key={v} className={`combo-param-chip${comboConfig.buyBelow === v ? " active" : ""}`}
                    onClick={() => setComboConfig(c => ({ ...c, buyBelow: v }))}>RSI &lt; {v}</button>
                ))}
              </div>
              <label className="combo-param-label">RSI 이탈 기준</label>
              <div className="combo-param-chips">
                {[70, 80].map((v) => (
                  <button key={v} className={`combo-param-chip${comboConfig.sellAbove === v ? " active" : ""}`}
                    onClick={() => setComboConfig(c => ({ ...c, sellAbove: v }))}>RSI &gt; {v}</button>
                ))}
              </div>
            </div>
          )}

          <div className="combo-param-group">
            <label className="combo-param-label">손절 기준</label>
            <div className="combo-param-chips">
              {COMBO_STOP_OPTIONS.map((s) => (
                <button key={s} className={`combo-param-chip${comboConfig.stopLoss === s ? " active" : ""}`}
                  onClick={() => setComboConfig(c => ({ ...c, stopLoss: s }))}>{s}%</button>
              ))}
            </div>
          </div>

          <button className="rank-run-btn" onClick={handleComboConfirm} style={{ marginTop: 16 }}>
            이 조합으로 테스트
          </button>
        </div>
      )}

      {/* Step 4: Period */}
      {step === "period" && (
        <div className="trade-card">
          <h3 className="trade-card-title">{getTickerName(ticker)} · {label} — 백테스트 기간</h3>
          <div className="trade-period-grid">
            {BACKTEST_PERIODS.map((bp) => (
              <button
                key={bp.years}
                className="trade-period-btn"
                onClick={() => runBacktest(bp.years)}
                disabled={loading}
              >
                {bp.label}
              </button>
            ))}
          </div>
          {loading && <div className="trade-loading">백테스트 실행 중...</div>}
          {error && <p className="trade-error">{error}</p>}
        </div>
      )}

      {/* TOP 10: Period selection (free users) */}
      {step === "top10-period" && (
        <div className="trade-card">
          <h3 className="trade-card-title">🏆 {ticker} TOP 10 — 기간 선택</h3>
          <p className="top10-period-desc">선택한 기간의 33개 전략 중 최고 점수 TOP 10을 찾습니다</p>
          <div className="trade-period-grid">
            {BACKTEST_PERIODS.map((bp) => (
              <button
                key={bp.years}
                className="trade-period-btn"
                onClick={() => handleTop10Period(bp.years)}
                disabled={top10Loading}
              >
                {bp.label}
              </button>
            ))}
          </div>
          <p className="top10-cost-hint">🪙 코인 {TOP10_COIN_COST}개가 소비됩니다 · 남은 코인 {getQueryBalance()}개</p>
          {top10Loading && <div className="trade-loading">33개 전략 분석 중...</div>}
          {error && <p className="trade-error">{error}</p>}
        </div>
      )}

      {/* TOP 10: Results */}
      {step === "top10-result" && top10Results && (
        <div className="trade-card">
          <h3 className="trade-card-title">🏆 {getTickerName(ticker)} 최적 전략 TOP 10</h3>

          {isBasic() ? (
            <div className="top10-tabs">
              {BACKTEST_PERIODS.map((bp, i) => (
                <button
                  key={bp.years}
                  className={`top10-tab${top10ActiveTab === i ? " active" : ""}`}
                  onClick={() => setTop10ActiveTab(i)}
                >
                  {bp.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="top10-period-label">
              {timeframe === "daily" ? "일봉" : "주봉"} · {period}년 백테스트 기준
            </p>
          )}

          {(() => {
            const years = isBasic() ? BACKTEST_PERIODS[top10ActiveTab].years : period;
            const list = top10Results[years] || [];
            if (!list.length) return <p className="top10-empty">해당 기간에 대한 데이터가 부족합니다</p>;
            return (
              <div className="top10-list">
                {list.map((s, i) => (
                  <React.Fragment key={i}>
                  {i === 5 && <AdBanner className="ad-banner-inline" />}
                  <button className="top10-card" onClick={() => handleTop10Select(s)}>
                    <span className={`top10-rank${i < 3 ? ` medal-${i + 1}` : ""}`}>{i + 1}</span>
                    <div className="top10-info">
                      <span className="top10-name">{s.label}</span>
                      <span className="top10-stats">
                        승률 {fmt(s.winRate, 0)}% · {s.tradeCount}회 거래 · MDD -{fmt(s.mdd, 0)}%
                      </span>
                    </div>
                    <div className="top10-right">
                      <span className={`top10-score ${s.score >= 60 ? "high" : s.score >= 30 ? "mid" : "low"}`}>
                        {s.score}점
                      </span>
                      <span className={`top10-return ${s.totalReturn >= 0 ? "up" : "down"}`}>
                        {s.totalReturn >= 0 ? "+" : ""}{fmt(s.totalReturn, 0)}%
                      </span>
                    </div>
                  </button>
                  </React.Fragment>
                ))}
              </div>
            );
          })()}

          <p className="top10-hint">전략을 탭하면 상세 백테스트 결과를 볼 수 있어요</p>

          <button className="ssheet-trigger" onClick={() => setShowShare(true)}>
            📤 TOP 10 공유하기
          </button>

          <button className="btn-secondary trade-reset-btn" onClick={() => setStep("strategy")}>
            ← 전략 선택으로
          </button>
        </div>
      )}

      {/* Step 5: Result */}
      {step === "result" && result && (
        <div className="trade-card">
          <div className="trade-result-header">
            <h3 className="trade-card-title">{getTickerName(ticker)} · {label}</h3>
            <span className="trade-result-meta">
              {timeframe === "daily" ? "일봉" : "주봉"} · {period}년
            </span>
          </div>

          {!revealed ? (
            <div className="reveal-cta">
              <p className="reveal-hint">
                {firstFree ? "첫 백테스트 결과는 무료예요" : `백테스트 결과를 확인하려면 코인 ${coinCost}개가 필요해요`}
              </p>
              <button className="btn-primary reveal-btn" onClick={handleReveal}>
                {firstFree ? "🔓 결과 보기 (무료)" : `🔓 결과 보기 (코인 ${coinCost}개)`}
              </button>
              {!isBasic() && !firstFree && (
                <p className="reveal-balance">남은 코인 {getQueryBalance()}개</p>
              )}
            </div>
          ) : (
            <>
              {/* Score */}
              <div className="trade-score-row">
                <div className="trade-score-badge">
                  <span className="trade-score-num">{result.score}</span>
                  <span className="trade-score-label">점</span>
                  <button className="score-info-btn" onClick={() => setShowScoreInfo(!showScoreInfo)}>?</button>
                </div>
              </div>
              {showScoreInfo && (() => {
                const bd = scoreBreakdown(result);
                return (
                  <div className="score-breakdown">
                    <div className="score-breakdown-row">
                      <span>수익률 점수</span>
                      <span className="up">+{bd.returnScore}</span>
                    </div>
                    <div className="score-breakdown-row">
                      <span>승률 점수</span>
                      <span className="up">+{bd.winScore}</span>
                    </div>
                    <div className="score-breakdown-row">
                      <span>MDD 패널티</span>
                      <span className="down">-{bd.mddPenalty}</span>
                    </div>
                    <div className="score-breakdown-total">
                      <span>총점</span>
                      <span>{bd.total}점</span>
                    </div>
                  </div>
                );
              })()}

              {/* Trade chart */}
              {chartPrices && result.trades.length > 0 && (
                <TradeChart prices={chartPrices} trades={result.trades} ticker={ticker} />
              )}

              {/* Summary grid */}
              <div className="trade-summary-grid">
                <div className="trade-summary-card highlight">
                  <div className="trade-summary-label">전략 수익률</div>
                  <div className={`trade-summary-value ${result.totalReturn >= 0 ? "up" : "down"}`}>
                    {result.totalReturn >= 0 ? "+" : ""}{fmt(result.totalReturn)}%
                  </div>
                </div>
                <div className="trade-summary-card">
                  <div className="trade-summary-label">바이앤홀드</div>
                  <div className={`trade-summary-value ${baseline.returnPct >= 0 ? "up" : "down"}`}>
                    {baseline.returnPct >= 0 ? "+" : ""}{fmt(baseline.returnPct)}%
                  </div>
                </div>
                <div className="trade-summary-card">
                  <div className="trade-summary-label">승률</div>
                  <div className="trade-summary-value">{fmt(result.winRate)}%</div>
                </div>
                <div className="trade-summary-card">
                  <div className="trade-summary-label">거래 횟수</div>
                  <div className="trade-summary-value">{result.tradeCount}회</div>
                </div>
                <div className="trade-summary-card">
                  <div className="trade-summary-label">최대 손실 (MDD)</div>
                  <div className="trade-summary-value down">-{fmt(result.mdd)}%</div>
                </div>
                <div className="trade-summary-card">
                  <div className="trade-summary-label">평균 수익</div>
                  <div className="trade-summary-value up">+{fmt(result.avgWin)}%</div>
                </div>
                <div className="trade-summary-card">
                  <div className="trade-summary-label">평균 손실</div>
                  <div className="trade-summary-value down">{fmt(result.avgLoss)}%</div>
                </div>
              </div>

              {/* Trade list */}
              {result.trades.length > 0 && (
                <details className="trade-detail">
                  <summary className="trade-detail-summary">거래 내역 ({result.trades.length}건)</summary>
                  <div className="trade-list-wrap">
                    <table className="trade-list-table">
                      <thead>
                        <tr>
                          <th>진입일</th>
                          <th>진입가</th>
                          <th>이탈일</th>
                          <th>이탈가</th>
                          <th>수익률</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.trades.map((t, i) => (
                          <tr key={i}>
                            <td>{t.entryDate.toISOString().slice(2, 10)}</td>
                            <td>{fmtPrice(t.entryPrice, ticker)}</td>
                            <td>{t.exitDate.toISOString().slice(2, 10)}</td>
                            <td>{fmtPrice(t.exitPrice, ticker)}</td>
                            <td className={t.returnPct >= 0 ? "up" : "down"}>
                              {t.returnPct >= 0 ? "+" : ""}{fmt(t.returnPct)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}

              <button className="ssheet-trigger" onClick={() => setShowShare(true)}>
                📤 결과 공유하기
              </button>

              <AdBanner className="ad-banner-inline" />

              <button className="btn-secondary trade-reset-btn" onClick={reset}>
                다른 전략 테스트하기
              </button>
            </>
          )}
        </div>
      )}

      {/* Banner between content and disclaimer */}
      {step !== "result" && <AdBanner className="ad-banner-inline" />}

      {showGate && (
        <QueryGateModal
          onClose={() => setShowGate(false)}
          onPurchased={() => { setShowGate(false); onCoinsChanged?.(); }}
        />
      )}

      <div className="trade-disclaimer">
        ⚠️ 과거 성과는 미래 수익을 보장하지 않습니다. 이 결과는 기계적 조건의 역사적 시뮬레이션이며, 투자 권유가 아닙니다.
      </div>

      {showShare && step === "result" && result && revealed && (
        <ShareSheet
          text={`📊 ${getTickerName(ticker)} ${label} 백테스트 (${period}년)\n점수 ${result.score}점 · 수익률 ${result.totalReturn >= 0 ? "+" : ""}${fmt(result.totalReturn)}%\n승률 ${fmt(result.winRate)}% · ${result.tradeCount}회 거래 · MDD -${fmt(result.mdd)}%`}
          card={{
            title: `${getTickerName(ticker)} ${label} 백테스트`,
            period: `${timeframe === "daily" ? "일봉" : "주봉"} · ${period}년`,
            stats: [
              { label: "전략 점수", value: `${result.score}점`, color: "#3182F6" },
              { label: "수익률", value: `${result.totalReturn >= 0 ? "+" : ""}${fmt(result.totalReturn)}%`, color: result.totalReturn >= 0 ? "#4ade80" : "#f87171" },
              { label: "바이앤홀드", value: `${baseline?.returnPct >= 0 ? "+" : ""}${fmt(baseline?.returnPct)}%`, color: baseline?.returnPct >= 0 ? "#4ade80" : "#f87171" },
              { label: "승률", value: `${fmt(result.winRate)}%`, color: "#ffffff" },
              { label: "거래 횟수", value: `${result.tradeCount}회`, color: "#ffffff" },
              { label: "MDD", value: `-${fmt(result.mdd)}%`, color: "#f87171" },
            ],
          }}
          onClose={() => setShowShare(false)}
        />
      )}

      {showShare && step === "top10-result" && top10Results && (() => {
        const years = isBasic() ? BACKTEST_PERIODS[top10ActiveTab].years : period;
        const list = top10Results[years] || [];
        if (!list.length) return null;
        const tickerName = getTickerName(ticker);
        return (
          <ShareSheet
            text={`🏆 ${tickerName} TOP 10 전략 (${years}년)\n${list.slice(0, 5).map((s, i) => `${i + 1}위 ${s.label} ${s.score}점 ${s.totalReturn >= 0 ? "+" : ""}${fmt(s.totalReturn, 0)}%`).join("\n")}`}
            card={{
              title: `${getTickerName(ticker)} 최적 전략 TOP 10`,
              period: `${timeframe === "daily" ? "일봉" : "주봉"} · ${years}년 백테스트`,
              rows: list.slice(0, 5).map((s) => ({
                label: s.label,
                value: `${s.score}점 ${s.totalReturn >= 0 ? "+" : ""}${fmt(s.totalReturn, 0)}%`,
              })),
            }}
            onClose={() => setShowShare(false)}
          />
        );
      })()}
    </div>
  );
}
