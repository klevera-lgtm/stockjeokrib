import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Chart } from "chart.js/auto";
import AdBanner from "./AdBanner.jsx";
import QueryGateModal from "./QueryGateModal.jsx";
import { getQueryBalance, isBasic, isUnlockedToday, unlockToday } from "../utils/premium.js";
import { logClick } from "../utils/analytics.js";
import { shareText, APP_LINK } from "../utils/share.js";

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

function findZones(arr) {
  const zones = [];
  let cur = null;
  for (let i = 0; i < arr.length; i++) {
    const t = arr[i] <= 20 ? "cold" : null; // 바닥(≤20)만 음영 — 과열(≥80)은 강세장서 계속 빨개져 의미 적어 제외
    if (t && cur?.type === t) cur.end = i;
    else {
      if (cur) zones.push(cur);
      cur = t ? { start: i, end: i, type: t } : null;
    }
  }
  if (cur) zones.push(cur);
  return zones;
}

const COLD_HORIZONS = [10, 30, 60, 90];

function computeColdStats(breadthArr, pricesArr) {
  if (!breadthArr?.length || !pricesArr?.length) return null;
  // 시작부 워밍업(이평선 계산 전 breadth≈0) 스킵 — 가짜 바닥 진입 방지
  let s = 0;
  while (s < breadthArr.length && (breadthArr[s] ?? 0) <= 2) s++;
  const entries = [];
  for (let i = s + 1; i < breadthArr.length; i++) {
    if (breadthArr[i] < 20 && breadthArr[i - 1] >= 20) entries.push(i);
  }
  if (entries.length === 0) return null;
  const horizons = COLD_HORIZONS.map((d) => {
    const returns = [];
    for (const ei of entries) {
      if (ei + d >= pricesArr.length) continue;
      const p0 = pricesArr[ei];
      if (!p0) continue;
      returns.push(((pricesArr[ei + d] - p0) / p0) * 100);
    }
    if (returns.length === 0) return { days: d, avg: null, winRate: null, count: 0 };
    const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
    const wins = returns.filter((r) => r > 0).length;
    return { days: d, avg, winRate: (wins / returns.length) * 100, count: returns.length };
  });
  return { total: entries.length, horizons };
}

const BREADTH_KEYS = ["pct_above_20", "pct_above_50", "pct_above_100", "pct_above_200"];

function cleanBreadthIndex(idx) {
  if (!idx?.dates?.length || !idx.breadth) return idx;
  let end = idx.dates.length;
  while (end > 0) {
    const allBad = BREADTH_KEYS.every((k) => (idx.breadth[k]?.[end - 1] ?? 0) < 2);
    if (!allBad) break;
    end--;
  }
  if (end === 0 || !BREADTH_KEYS.some((k) => (idx.breadth[k]?.[end - 1] ?? 0) > 10)) return idx;
  if (end === idx.dates.length) return idx;
  const trimmed = {
    ...idx,
    dates: idx.dates.slice(0, end),
    prices: idx.prices?.slice(0, end),
    breadth: Object.fromEntries(BREADTH_KEYS.map((k) => [k, idx.breadth[k]?.slice(0, end) ?? []])),
    current: { ...idx.current },
  };
  BREADTH_KEYS.forEach((k) => {
    const arr = trimmed.breadth[k];
    if (arr?.length) trimmed.current[k] = arr[arr.length - 1];
  });
  return trimmed;
}

const zoneBgPlugin = {
  id: "zoneBg",
  beforeDraw(chart) {
    const zones = chart.options.plugins.zoneBg?.zones;
    if (!zones?.length) return;
    const { ctx, chartArea: area, scales: { x } } = chart;
    if (!area) return;
    ctx.save();
    zones.forEach((z) => {
      const x1 = x.getPixelForValue(z.start);
      const x2 = x.getPixelForValue(z.end);
      ctx.fillStyle = "rgba(0,185,107,0.13)"; // 바닥(cold) = 초록 (매수하기 좋은 구간)
      ctx.fillRect(x1, area.top, Math.max(x2 - x1, 3), area.bottom - area.top);
    });
    ctx.restore();
  },
};

// breadth 패널: 20선(초록 매수)·80선(빨강 과열) — 눈금 생략/채움과 무관하게 항상 그림
const breadthRefLinesPlugin = {
  id: "breadthRefLines",
  afterDatasetsDraw(chart) {
    const { ctx, chartArea: area, scales: { y } } = chart;
    if (!y) return;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    for (const [val, color] of [[20, "rgba(0,185,107,0.6)"], [80, "rgba(255,59,48,0.45)"]]) {
      const py = y.getPixelForValue(val);
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(area.left, py);
      ctx.lineTo(area.right, py);
      ctx.stroke();
    }
    ctx.restore();
  },
};

export default function MarketBreadth({ onCoinsChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeIndex, setActiveIndex] = useState("SPY");
  const [range, setRange] = useState(252);
  const [activePeriod, setActivePeriod] = useState("pct_above_20");
  const [unlockedPeriods, setUnlockedPeriods] = useState(() => {
    const init = {};
    PERIODS.forEach((p) => { if (isUnlockedToday(`breadth_${p.key}`)) init[p.key] = true; });
    return init;
  });
  const [showGate, setShowGate] = useState(false);
  const [pendingPeriod, setPendingPeriod] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState(null);
  const [zoomedRange, setZoomedRange] = useState(null);
  const chartRef = useRef(null);
  const canvasRef = useRef(null);
  const breadthChartRef = useRef(null);
  const breadthCanvasRef = useRef(null);
  const basic = isBasic();

  function fetchBreadth() {
    setLoading(true);
    setError(null);
    fetch(BREADTH_URL)
      .then((r) => r.json())
      .then((json) => {
        const raw = json.indices ?? json;
        const indices = {};
        for (const key of Object.keys(raw)) {
          indices[key] = cleanBreadthIndex(raw[key]);
        }
        setData(indices);
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }

  useEffect(() => { fetchBreadth(); }, []);

  useEffect(() => { setZoomedRange(null); }, [activeIndex, range, activePeriod]);

  const drawChart = useCallback(() => {
    if (!data || !canvasRef.current || !breadthCanvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();
    if (breadthChartRef.current) breadthChartRef.current.destroy();

    const idx = data[activeIndex];
    if (!idx) return;

    const allDates = idx.dates ?? [];
    const allPrices = idx.prices ?? [];
    const allBreadth = idx.breadth?.[activePeriod] ?? idx.breadth?.pct_above_20 ?? [];
    const periodLabel = PERIODS.find((p) => p.key === activePeriod)?.label ?? "20일";
    const rangeStart = Math.max(0, allDates.length - range);
    // 시작부 워밍업(이평선 계산 전 breadth≈0) 구간 스킵 → 5년뷰가 진짜 데이터부터 + 가짜 초록 바닥존 방지
    let warmupEnd = 0;
    while (warmupEnd < allBreadth.length && (allBreadth[warmupEnd] ?? 0) <= 2) warmupEnd++;
    const viewStart = Math.max(rangeStart, warmupEnd);

    let slicedDates, slicedPrices, slicedBreadth;
    if (zoomedRange) {
      const zs = viewStart + zoomedRange.start;
      const ze = Math.min(allDates.length, viewStart + zoomedRange.end + 1);
      slicedDates = allDates.slice(zs, ze);
      slicedPrices = allPrices.slice(zs, ze);
      slicedBreadth = allBreadth.slice(zs, ze);
    } else {
      slicedDates = allDates.slice(viewStart);
      slicedPrices = allPrices.slice(viewStart);
      slicedBreadth = allBreadth.slice(viewStart);
    }

    const zones = findZones(slicedBreadth);
    // 두 차트 x축 정렬용: y축 폭을 동일하게 고정
    const fixYWidth = { afterFit: (s) => { s.width = 50; } };
    const xTicks = {
      maxTicksLimit: 5,
      callback(val) {
        const label = this.getLabelForValue(val);
        if (!label) return "";
        const d = new Date(label);
        return `${d.getFullYear()}.${d.getMonth() + 1}`;
      },
    };

    // ── 위: 가격 + 초록 매수존 밴드 (탭하면 확대) ──
    chartRef.current = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels: slicedDates,
        datasets: [{
          label: `${activeIndex} 가격`,
          data: slicedPrices,
          borderColor: "#3182f6",
          backgroundColor: "rgba(49,130,246,0.08)",
          fill: true, tension: 0.2, pointRadius: 0, borderWidth: 1.8,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        onClick: !zoomedRange
          ? (event, _el, chart) => {
              const ci = Math.round(chart.scales.x.getValueForPixel(event.x));
              if (ci < 0 || ci >= slicedBreadth.length) return;
              const hit = zones.find((z) => ci >= z.start && ci <= z.end);
              if (!hit) return;
              const buffer = 40;
              const start = Math.max(0, hit.start - buffer);
              const end = Math.min(slicedBreadth.length - 1, hit.end + buffer);
              const zeAbs = viewStart + hit.end;
              const pEnd = allPrices[zeAbs];
              let ret30 = null, ret60 = null;
              if (pEnd && zeAbs + 30 < allDates.length)
                ret30 = ((allPrices[zeAbs + 30] - pEnd) / pEnd) * 100;
              if (pEnd && zeAbs + 60 < allDates.length)
                ret60 = ((allPrices[zeAbs + 60] - pEnd) / pEnd) * 100;
              setZoomedRange({
                start, end, type: hit.type,
                startDate: allDates[viewStart + hit.start],
                endDate: allDates[viewStart + hit.end],
                ret30, ret60,
              });
            }
          : undefined,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => `${activeIndex}: $${ctx.raw?.toFixed(2) ?? ctx.raw}` } },
          zoneBg: { zones },
        },
        scales: {
          x: { ticks: { display: false }, grid: { display: false } },
          y: {
            position: "right", ...fixYWidth,
            ticks: { callback: (v) => `$${v >= 1000 ? Math.round(v) : v.toFixed(0)}` },
            grid: { color: "rgba(128,128,128,0.1)" },
          },
        },
      },
      plugins: [zoneBgPlugin],
    });

    // ── 아래: Breadth % 패널 (20선=초록 매수, 80선=과열 참고) ──
    breadthChartRef.current = new Chart(breadthCanvasRef.current, {
      type: "line",
      data: {
        labels: slicedDates,
        datasets: [{
          label: `${periodLabel} 이평선 상회 비율`,
          data: slicedBreadth,
          borderColor: "#f59e0b",
          backgroundColor: "rgba(245,158,11,0.08)",
          fill: true, borderWidth: 1.6, pointRadius: 0, tension: 0.2,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => `Breadth ${periodLabel}: ${ctx.raw?.toFixed(1)}%` } },
        },
        scales: {
          x: { ticks: xTicks, grid: { display: false } },
          y: {
            position: "right", ...fixYWidth,
            min: 0, max: 100,
            ticks: { callback: (v) => `${v}%`, stepSize: 20 },
            grid: { display: false },
          },
        },
      },
      plugins: [breadthRefLinesPlugin],
    });
  }, [data, activeIndex, range, activePeriod, zoomedRange]);

  useEffect(() => { drawChart(); return () => { chartRef.current?.destroy(); breadthChartRef.current?.destroy(); }; }, [drawChart]);

  const coldStats = useMemo(() => {
    try {
      if (!data) return null;
      const idx = data[activeIndex];
      if (!idx) return null;
      const breadthArr = idx.breadth?.[activePeriod] ?? [];
      const pricesArr = idx.prices ?? [];
      return computeColdStats(breadthArr, pricesArr);
    } catch (e) { return null; }
  }, [data, activeIndex, activePeriod]);

  function handleUnlock(periodKey) {
    if (basic || unlockedPeriods[periodKey]) return;
    logClick("breadth_unlock", { period: periodKey });
    if (unlockToday(`breadth_${periodKey}`)) {
      onCoinsChanged?.();
      setUnlockedPeriods((prev) => ({ ...prev, [periodKey]: true }));
      setActivePeriod(periodKey);
    } else {
      setPendingPeriod(periodKey);
      setShowGate(true);
    }
  }

  if (loading) {
    return (
      <div className="breadth-page">
        <h2 className="section-title">마켓 브레쓰</h2>
        <div className="skel-chips" style={{justifyContent:'center'}}>
          {[1,2,3].map(i => <div key={i} className="skel skel-chip" style={{width:80}} />)}
        </div>
        <div className="skel skel-gauge" />
        <div className="skel skel-block" style={{height:180,borderRadius:'var(--radius)',margin:'16px 0'}} />
        <div className="skel-chips" style={{justifyContent:'center'}}>
          {[1,2,3,4].map(i => <div key={i} className="skel skel-chip" />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="breadth-page">
        <div className="breadth-loading">데이터를 불러올 수 없어요.</div>
        <button className="retry-btn" onClick={fetchBreadth}>다시 시도</button>
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

      {/* Help accordion */}
      <div className="breadth-help-accordion">
        <button className="breadth-help-toggle" onClick={() => setHelpOpen(!helpOpen)}>
          <span>❓ 마켓 브레쓰가 뭔가요?</span>
          <span className={`breadth-help-arrow${helpOpen ? " open" : ""}`}>▼</span>
        </button>
        {helpOpen && (
          <div className="breadth-help-body">
            <p className="breadth-help-text">
              마켓 브레쓰(Market Breadth)는 시장 전체의 건강 상태를 보여주는 지표예요.
            </p>
            <dl className="breadth-help-list">
              <dt>📊 이동평균선 상회 비율이란?</dt>
              <dd>인덱스 구성 종목 중 현재 주가가 N일 이동평균선보다 높은 종목의 비율이에요. 예를 들어 S&P 500의 20일 상회 비율이 60%라면, 500개 종목 중 300개가 20일 이평선 위에 있다는 뜻이에요.</dd>
              <dt>🔴 과열 구간 (80% 이상)</dt>
              <dd>대부분의 종목이 상승 중이에요. 단기 과열 가능성이 있어요.</dd>
              <dt>🟢 침체 구간 (20% 이하)</dt>
              <dd>대부분의 종목이 하락 중이에요. 시장이 과도하게 위축된 상태예요.</dd>
              <dt>📅 이동평균 기간별 의미</dt>
              <dd>20일은 단기 추세, 50일은 중기, 200일은 장기 추세를 반영해요. 기간이 길수록 큰 흐름을 보여줘요.</dd>
            </dl>
          </div>
        )}
      </div>

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

      {/* Share button */}
      <button
        className={`breadth-share-btn${shareStatus ? " done" : ""}`}
        onClick={async () => {
          logClick("breadth_share", { index: activeIndex });
          const periodLabel = PERIODS.find((p) => p.key === activePeriod)?.label ?? "20일";
          const text = `📊 ${INDEX_NAMES[activeIndex]} 마켓 브레쓰\n${periodLabel} 이동평균선 상회 비율: ${breadthVal.toFixed(1)}% (${gaugeLabel(breadthVal)})\n기준일: ${updatedDate}\n\n주식적립왕에서 확인하기 👉 ${APP_LINK}`;
          const result = await shareText(text);
          setShareStatus(result);
          setTimeout(() => setShareStatus(null), 2000);
        }}
      >
        {shareStatus === "copied" ? "✓ 클립보드에 복사됨" : shareStatus === "shared" ? "✓ 공유 완료" : "📤 오늘의 시장온도 공유하기"}
      </button>

      {/* Banner Ad #1 */}
      <AdBanner className="breadth-ad" />

      {/* Price chart with breadth zones */}
      <div className="breadth-chart-section">
        <div className="breadth-chart-header">
          <span className="breadth-chart-title">{activeIndex} 가격 + Breadth {PERIODS.find((p) => p.key === activePeriod)?.label ?? "20일"} 구간</span>
          <div className="breadth-range-tabs">
            {!zoomedRange && RANGE_OPTIONS.map((r) => (
              <button
                key={r.label}
                className={`breadth-range-btn${range === r.days ? " active" : ""}`}
                onClick={() => setRange(r.days)}
              >
                {r.label}
              </button>
            ))}
            {zoomedRange && (
              <button className="breadth-zoom-reset" onClick={() => setZoomedRange(null)}>
                ← 전체 보기
              </button>
            )}
          </div>
        </div>

        {zoomedRange && (
          <div className="breadth-zoom-info">
            <span className={`breadth-zone-tag ${zoomedRange.type}`}>
              🟢 바닥 (과매도) 구간
            </span>
            <span className="breadth-zone-dates">
              {zoomedRange.startDate} ~ {zoomedRange.endDate}
            </span>
            {(zoomedRange.ret30 != null || zoomedRange.ret60 != null) && (
              <div className="breadth-zone-returns">
                {zoomedRange.ret30 != null && (
                  <span>구간 종료 후 30일{" "}
                    <b style={{ color: zoomedRange.ret30 >= 0 ? "#ff3b30" : "#3182f6" }}>
                      {zoomedRange.ret30 >= 0 ? "+" : ""}{zoomedRange.ret30.toFixed(1)}%
                    </b>
                  </span>
                )}
                {zoomedRange.ret60 != null && (
                  <span>60일{" "}
                    <b style={{ color: zoomedRange.ret60 >= 0 ? "#ff3b30" : "#3182f6" }}>
                      {zoomedRange.ret60 >= 0 ? "+" : ""}{zoomedRange.ret60.toFixed(1)}%
                    </b>
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        <div className="breadth-legend">
          <span className="breadth-legend-item"><span className="breadth-dot" style={{ background: "rgba(0,185,107,0.4)" }} />바닥 (20%-, 매수 유리)</span>
          <span className="breadth-legend-item"><span className="breadth-dot" style={{ background: "#f59e0b" }} />Breadth {PERIODS.find((p) => p.key === activePeriod)?.label ?? "20일"}</span>
        </div>
        {!zoomedRange && (
          <p className="breadth-zone-hint">색칠된 구간을 탭하면 확대돼요</p>
        )}
        <div className="breadth-chart-wrap breadth-chart-price">
          <canvas ref={canvasRef} />
        </div>
        <p className="breadth-panel-cap">Breadth % · {PERIODS.find((p) => p.key === activePeriod)?.label ?? "20일"} 이평선 상회</p>
        <div className="breadth-chart-wrap breadth-chart-panel">
          <canvas ref={breadthCanvasRef} />
        </div>
      </div>

      {/* Cold zone historical stats */}
      {coldStats?.horizons && (
        <div className="breadth-cold-stats">
          <h3 className="breadth-cold-title">
            📊 {PERIODS.find((p) => p.key === activePeriod)?.label ?? "20일"} 이평선 20% 이하 진입 후 통계
          </h3>
          <p className="breadth-cold-subtitle">
            과거 {coldStats.total}회 · {INDEX_NAMES[activeIndex]} 기준
          </p>
          <div className="breadth-cold-grid">
            {coldStats.horizons.map((h) => (
              h.count > 0 && h.avg != null && h.winRate != null && (
                <div key={h.days} className="breadth-cold-row">
                  <span className="breadth-cold-label">{h.days}일 후</span>
                  <span className={`breadth-cold-avg ${h.avg >= 0 ? "pos" : "neg"}`}>
                    평균 {h.avg >= 0 ? "+" : ""}{h.avg.toFixed(1)}%
                  </span>
                  <span className="breadth-cold-winrate">
                    상승 {h.winRate.toFixed(0)}%
                  </span>
                  <span className="breadth-cold-count">({h.count}회)</span>
                </div>
              )
            ))}
          </div>
          <p className="breadth-cold-note">과거 통계이며 미래 수익을 보장하지 않습니다</p>
        </div>
      )}

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
              if (unlockToday(`breadth_${pendingPeriod}`)) {
                onCoinsChanged?.();
                setUnlockedPeriods((prev) => ({ ...prev, [pendingPeriod]: true }));
                setActivePeriod(pendingPeriod);
              }
              setPendingPeriod(null);
            }
          }}
        />
      )}
    </div>
  );
}
