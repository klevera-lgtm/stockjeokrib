import { useRef, useEffect } from "react";

function fmtPrice(v) {
  if (v >= 10000) return (v / 1000).toFixed(0) + "K";
  if (v >= 1000) return (v / 1000).toFixed(1) + "K";
  if (v >= 1) return v.toFixed(0);
  return v.toFixed(2);
}

function fmtDate(d) {
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDateFull(d) {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function avgHoldDays(trades) {
  if (!trades.length) return 0;
  let total = 0;
  for (const t of trades) total += (t.exitDate - t.entryDate) / 86400000;
  return Math.round(total / trades.length);
}

export default function BacktestChart({ prices, trades }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !prices.length) return;

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = 200;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const pad = { top: 12, right: 12, bottom: 22, left: 48 };
    const cw = width - pad.left - pad.right;
    const ch = height - pad.top - pad.bottom;

    const closes = prices.map((p) => p.close);
    const minP = Math.min(...closes);
    const maxP = Math.max(...closes);
    const range = maxP - minP || 1;
    const yMin = minP - range * 0.05;
    const yMax = maxP + range * 0.05;

    const xOf = (i) => pad.left + (i / (prices.length - 1)) * cw;
    const yOf = (v) => pad.top + ch - ((v - yMin) / (yMax - yMin)) * ch;

    ctx.clearRect(0, 0, width, height);

    const dateIdx = new Map();
    prices.forEach((p, i) => dateIdx.set(p.date.getTime(), i));

    for (const t of trades) {
      const ei = dateIdx.get(t.entryDate.getTime());
      const xi = dateIdx.get(t.exitDate.getTime());
      if (ei == null || xi == null) continue;
      const x1 = xOf(ei);
      const x2 = xOf(xi);
      ctx.fillStyle =
        t.returnPct >= 0 ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)";
      ctx.fillRect(x1, pad.top, x2 - x1, ch);
    }

    ctx.fillStyle = "rgba(156,163,175,0.12)";
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const v = yMin + ((yMax - yMin) * i) / 4;
      const y = yOf(v);
      ctx.fillStyle = "rgba(156,163,175,0.12)";
      ctx.fillRect(pad.left, y, cw, 0.5);
      ctx.fillStyle = "#9ca3af";
      ctx.fillText(fmtPrice(v), pad.left - 5, y + 3);
    }

    ctx.beginPath();
    ctx.strokeStyle = "#6b7280";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < prices.length; i++) {
      const x = xOf(i);
      const y = yOf(prices[i].close);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    const r = 3.5;
    for (const t of trades) {
      const ei = dateIdx.get(t.entryDate.getTime());
      if (ei != null) {
        const x = xOf(ei);
        const y = yOf(t.entryPrice);
        ctx.fillStyle = "#22c55e";
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y + r * 0.6);
        ctx.lineTo(x - r, y + r * 0.6);
        ctx.closePath();
        ctx.fill();
      }
      const xi = dateIdx.get(t.exitDate.getTime());
      if (xi != null) {
        const x = xOf(xi);
        const y = yOf(t.exitPrice);
        ctx.fillStyle = t.returnPct >= 0 ? "#22c55e" : "#ef4444";
        ctx.beginPath();
        ctx.moveTo(x, y + r);
        ctx.lineTo(x + r, y - r * 0.6);
        ctx.lineTo(x - r, y - r * 0.6);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.fillStyle = "#9ca3af";
    ctx.textAlign = "center";
    ctx.font = "9px system-ui, sans-serif";
    const ticks = Math.min(4, prices.length - 1);
    for (let i = 0; i <= ticks; i++) {
      const idx = Math.round((i * (prices.length - 1)) / ticks);
      const d = prices[idx].date;
      const label =
        ticks <= 2
          ? fmtDate(d)
          : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
      ctx.fillText(label, xOf(idx), height - 4);
    }
  }, [prices, trades]);

  const wins = trades.filter((t) => t.returnPct > 0);
  const losses = trades.filter((t) => t.returnPct <= 0);

  return (
    <div className="bt-chart">
      <div ref={containerRef} className="bt-chart-canvas-wrap">
        <canvas ref={canvasRef} />
      </div>
      <div className="bt-chart-legend">
        <span className="bt-legend-entry">
          <span className="bt-dot bt-dot--entry" />
          진입
        </span>
        <span className="bt-legend-entry">
          <span className="bt-dot bt-dot--exit-win" />
          이탈(수익)
        </span>
        <span className="bt-legend-entry">
          <span className="bt-dot bt-dot--exit-loss" />
          이탈(손실)
        </span>
        <span className="bt-legend-entry">
          <span className="bt-swatch bt-swatch--hold" />
          보유 구간
        </span>
      </div>

      <div className="bt-stats-row">
        <div className="bt-stat">
          <span className="bt-stat-val">{trades.length}회</span>
          <span className="bt-stat-label">거래</span>
        </div>
        <div className="bt-stat">
          <span className="bt-stat-val">
            {trades.length ? ((wins.length / trades.length) * 100).toFixed(0) : 0}%
          </span>
          <span className="bt-stat-label">승률</span>
        </div>
        <div className="bt-stat">
          <span className="bt-stat-val">{avgHoldDays(trades)}일</span>
          <span className="bt-stat-label">평균 보유</span>
        </div>
        <div className="bt-stat">
          <span className="bt-stat-val positive">
            {wins.length ? "+" + (wins.reduce((s, t) => s + t.returnPct, 0) / wins.length).toFixed(1) + "%" : "-"}
          </span>
          <span className="bt-stat-label">평균 수익</span>
        </div>
        <div className="bt-stat">
          <span className="bt-stat-val negative">
            {losses.length ? (losses.reduce((s, t) => s + t.returnPct, 0) / losses.length).toFixed(1) + "%" : "-"}
          </span>
          <span className="bt-stat-label">평균 손실</span>
        </div>
      </div>

      {trades.length > 0 && (
        <div className="bt-trades">
          <div className="bt-trades-header">
            <span>구간</span>
            <span>수익률</span>
          </div>
          <div className="bt-trades-list">
            {trades.map((t, i) => (
              <div
                key={i}
                className={`bt-trade-row ${t.returnPct >= 0 ? "bt-trade--win" : "bt-trade--loss"}`}
              >
                <span className="bt-trade-dates">
                  {fmtDateFull(t.entryDate)} → {fmtDateFull(t.exitDate)}
                </span>
                <span className={`bt-trade-ret ${t.returnPct >= 0 ? "positive" : "negative"}`}>
                  {t.returnPct >= 0 ? "+" : ""}
                  {t.returnPct.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="bt-note">일봉 종가 기준 백테스트 · 장중 가격 변동은 미반영</p>
    </div>
  );
}
