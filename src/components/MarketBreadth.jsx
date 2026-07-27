import { useState, useEffect, useRef, useCallback } from "react";
import { Chart } from "chart.js/auto";
import AdBanner from "./AdBanner.jsx";
import QueryGateModal from "./QueryGateModal.jsx";
import { consumeQuery, getQueryBalance, isBasic } from "../utils/premium.js";
import { logClick } from "../utils/analytics.js";

const BREADTH_URL =
  "https://raw.githubusercontent.com/kittycapital/market-breadth/main/data/market_breadth.json";
const INDICES = ["SPY", "QQQ", "DIA"];
const INDEX_NAMES = { SPY: "S&P 500", QQQ: "나스닥 100", DIA: "다우 30" };
const PERIODS = [
  { key: "pct_above_20", label: "20일", free: true },
  { key: "pct_above_50", label: "50일", free: false },
  { key: "pct_above_100", label: "100일", free: false },
  { key: "pct_above_200", label: "200일", free: false },
];
const RANGE_OPTIONS = [
  { label: "6M", days: 126 },
  { label: "1Y", days: 252 },
  { label: "2Y", days: 504 },
  { label: "5Y", days: 9999 },
];

function gaugeColor(pct) {
  if (pct >= 80) return "#ff3b30";
  if (pct >= 60) return "#f59e0b";
  if (pct >= 40) return "#3182f6";
  if (pct >= 20) return "#00b96b";
  return "#00b96b";
}

function gaugeLabel(pct) {
  if (pct >= 80) return "과열";
  if (pct >= 60) return "강세";
  if (pct >= 40) return "중립";
  if (pct >= 20) return "약세";
  return "침체";
}

export default function MarketBreadth({ onCoinsChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeIndex, setActiveIndex] = useState("SPY");
  const [range, setRange] = useState(252);
  const [activePeriod, setActivePeriod] = useState("pct_above_20");
  const [unlockedPeriods, setUnlockedPeriods] = useState({});
  const [showGate, setShowGate] = useState(false);
  const [pendingPeriod, setPendingPeriod] = useState(null);
  const chartRef = useRef(null);
  const canvasRef = useRef(null);
  const basic = isBasic();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(BREADTH_URL)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const indices = json.indices ?? json;
        setData(indices);
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) { setError(e.message); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, []);

  const drawChart = useCallback(() => {
    if (!data || !canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();

    const idx = data[activeIndex];
    if (!idx) return;

    const dates = idx.dates ?? [];
    const prices = idx.prices ?? [];
    const breadthData = idx.breadth?.[activePeriod] ?? idx.breadth?.pct_above_20 ?? [];
    const sliceStart = Math.max(0, dates.length - range);
    const slicedDates = dates.slice(sliceStart);
    const slicedPrices = prices.slice(sliceStart);
    const slicedBreadth = breadthData.slice(sliceStart);
    const periodLabel = PERIODS.find((p) => p.key === activePeriod)?.label ?? "20일";

    const bgColors = slicedBreadth.map((b) =>
      b >= 80 ? "rgba(255,59,48,0.12)" : b <= 20 ? "rgba(0,185,107,0.12)" : "transparent"
    );

    chartRef.current = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels: slicedDates,
        datasets: [
          {
            label: `${activeIndex} 가격`,
            data: slicedPrices,
            borderColor: "#3182f6",
            backgroundColor: "rgba(49,130,246,0.08)",
            fill: true,
            tension: 0.2,
            pointRadius: 0,
            borderWidth: 2,
            yAxisID: "y",
          },
          {
            label: `${periodLabel} 이평선 상회 비율`,
            data: slicedBreadth,
            borderColor: "#f59e0b",
            borderWidth: 1.5,
            borderDash: [4, 3],
            pointRadius: 0,
            tension: 0.2,
            fill: false,
            yAxisID: "y1",
          },
          {
            label: "구간 배경",
            data: slicedPrices,
            backgroundColor: bgColors,
            borderWidth: 0,
            pointRadius: 0,
            fill: true,
            yAxisID: "y",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                if (ctx.datasetIndex === 0)
                  return `${activeIndex}: $${ctx.raw?.toFixed(2) ?? ctx.raw}`;
                if (ctx.datasetIndex === 1)
                  return `Breadth ${periodLabel}: ${ctx.raw?.toFixed(1)}%`;
                return null;
              },
              filter: (item) => item.datasetIndex < 2,
            },
          },
        },
        scales: {
          x: {
            ticks: {
              maxTicksLimit: 5,
              callback(val) {
                const label = this.getLabelForValue(val);
                if (!label) return "";
                const d = new Date(label);
                return `${d.getFullYear()}.${d.getMonth() + 1}`;
              },
            },
            grid: { display: false },
          },
          y: {
            position: "right",
            ticks: {
              callback: (v) => `$${v >= 1000 ? Math.round(v) : v.toFixed(0)}`,
            },
            grid: { color: "rgba(128,128,128,0.1)" },
          },
          y1: {
            position: "left",
            min: 0,
            max: 100,
            ticks: { callback: (v) => `${v}%`, stepSize: 20 },
            grid: {
              drawOnChartArea: true,
              color: (ctx) =>
                ctx.tick.value === 80 || ctx.tick.value === 20
                  ? "rgba(255,59,48,0.3)"
                  : "transparent",
              lineWidth: (ctx) =>
                ctx.tick.value === 80 || ctx.tick.value === 20 ? 1.5 : 0,
              borderDash: [4, 4],
            },
          },
        },
      },
    });
  }, [data, activeIndex, range, activePeriod]);

  useEffect(() => { drawChart(); return () => chartRef.current?.destroy(); }, [drawChart]);

  function handleUnlock(periodKey) {
    if (basic || unlockedPeriods[periodKey]) return;
    logClick("breadth_unlock", { period: periodKey });
    if (getQueryBalance() <= 0) {
      setPendingPeriod(periodKey);
      setShowGate(true);
      return;
    }
    consumeQuery();
    onCoinsChanged?.();
    setUnlockedPeriods((prev) => ({ ...prev, [periodKey]: true }));
    setActivePeriod(periodKey);
  }

  if (loading) {
    return (
      <div className="breadth-page">
        <div className="breadth-loading">시장 데이터 불러오는 중...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="breadth-page">
        <div className="breadth-loading">데이터를 불러올 수 없어요. 잠시 후 다시 시도해 주세요.</div>
      </div>
    );
  }

  const idx = data[activeIndex];
  const current = idx?.current ?? {};
  const breadthVal = current[activePeriod] ?? current.pct_above_20 ?? 0;
  const updatedDate = idx?.dates?.at(-1) ?? "";

  return (
    <div className="breadth-page">
      <h2 className="section-title">마켓 브레쓰</h2>
      <p className="section-subtitle">이동평균선 상회 종목 비율</p>

      {/* Index tabs */}
      <div className="breadth-idx-tabs">
        {INDICES.map((sym) => (
          <button
            key={sym}
            className={`breadth-idx-tab${activeIndex === sym ? " active" : ""}`}
            onClick={() => { setActiveIndex(sym); logClick("breadth_index", { index: sym }); }}
          >
            <span className="breadth-idx-sym">{sym}</span>
            <span className="breadth-idx-name">{INDEX_NAMES[sym]}</span>
          </button>
        ))}
      </div>

      {/* Current breadth card — FREE */}
      <div className="breadth-current-card">
        <div className="breadth-current-header">
          <span className="breadth-current-title">{PERIODS.find((p) => p.key === activePeriod)?.label ?? "20일"} 이동평균선 상회 비율</span>
          <span className="breadth-updated">{updatedDate}</span>
        </div>
        <div className="breadth-gauge-row">
          <span className="breadth-big-num" style={{ color: gaugeColor(breadthVal) }}>
            {breadthVal.toFixed(1)}%
          </span>
          <span className="breadth-gauge-label" style={{ background: gaugeColor(breadthVal) }}>
            {gaugeLabel(breadthVal)}
          </span>
        </div>
        <div className="breadth-gauge-bar">
          <div className="breadth-gauge-fill" style={{ width: `${breadthVal}%`, background: gaugeColor(breadthVal) }} />
          <div className="breadth-gauge-mark breadth-gauge-20" />
          <div className="breadth-gauge-mark breadth-gauge-80" />
        </div>
        <div className="breadth-gauge-labels">
          <span>침체 20%</span>
          <span>과열 80%</span>
        </div>
      </div>

      {/* Banner Ad #1 */}
      <AdBanner className="breadth-ad" />

      {/* Price chart with breadth zones */}
      <div className="breadth-chart-section">
        <div className="breadth-chart-header">
          <span className="breadth-chart-title">{activeIndex} 가격 + Breadth {PERIODS.find((p) => p.key === activePeriod)?.label ?? "20일"} 구간</span>
          <div className="breadth-range-tabs">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r.label}
                className={`breadth-range-btn${range === r.days ? " active" : ""}`}
                onClick={() => setRange(r.days)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div className="breadth-legend">
          <span className="breadth-legend-item"><span className="breadth-dot" style={{ background: "rgba(255,59,48,0.35)" }} />과열 (80%+)</span>
          <span className="breadth-legend-item"><span className="breadth-dot" style={{ background: "rgba(0,185,107,0.35)" }} />침체 (20%-)</span>
          <span className="breadth-legend-item"><span className="breadth-dot" style={{ background: "#f59e0b" }} />Breadth {PERIODS.find((p) => p.key === activePeriod)?.label ?? "20일"}</span>
        </div>
        <div className="breadth-chart-wrap">
          <canvas ref={canvasRef} />
        </div>
      </div>

      {/* Banner Ad #2 */}
      <AdBanner className="breadth-ad" />

      {/* Period selector buttons */}
      <div className="breadth-premium-section">
        <h3 className="breadth-premium-title">이동평균선별 상회 비율</h3>
        <div className="breadth-period-grid">
          {PERIODS.map((p) => {
            const val = current[p.key] ?? 0;
            const unlocked = p.free || basic || unlockedPeriods[p.key];
            const isActive = activePeriod === p.key;
            return (
              <button
                key={p.key}
                className={`breadth-period-card${unlocked ? "" : " locked"}${isActive ? " active" : ""}`}
                onClick={() => {
                  if (!unlocked) { handleUnlock(p.key); return; }
                  setActivePeriod(p.key);
                  logClick("breadth_period", { period: p.key });
                }}
              >
                <div className="breadth-period-header">
                  <span className="breadth-period-label">{p.label}</span>
                  {!p.free && !unlocked && (
                    <span className="breadth-unlock-btn">🪙 1</span>
                  )}
                </div>
                {unlocked ? (
                  <>
                    <span className="breadth-period-val" style={{ color: gaugeColor(val) }}>
                      {val.toFixed(1)}%
                    </span>
                    <div className="breadth-mini-bar">
                      <div className="breadth-mini-fill" style={{ width: `${val}%`, background: gaugeColor(val) }} />
                    </div>
                    <span className="breadth-period-tag" style={{ color: gaugeColor(val) }}>
                      {gaugeLabel(val)}
                    </span>
                  </>
                ) : (
                  <div className="breadth-locked-overlay">
                    <span>🔒</span>
                    <span>코인으로 확인</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <p className="breadth-disclaimer">
        본 데이터는 정보 제공 목적이며 투자 권유가 아닙니다. 과거 데이터는 미래 수익을 보장하지 않습니다.
      </p>

      {showGate && (
        <QueryGateModal
          onClose={() => setShowGate(false)}
          onEarned={() => {
            onCoinsChanged?.();
            if (pendingPeriod) {
              consumeQuery();
              onCoinsChanged?.();
              setUnlockedPeriods((prev) => ({ ...prev, [pendingPeriod]: true }));
              setActivePeriod(pendingPeriod);
              setPendingPeriod(null);
            }
          }}
        />
      )}
    </div>
  );
}
