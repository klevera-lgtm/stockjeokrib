import { useEffect, useRef } from "react";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import "chart.js/auto";

export default function LineChart({ data, labels, datasets, title, yType = "won", bands }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();

    // 매수 구간 음영 (조건부 전략) — 라인 뒤에 옅은 빨강 세로 밴드
    const buyBandsPlugin = {
      id: "buyBands",
      beforeDatasetsDraw(chart) {
        if (!bands || !bands.length) return;
        const { ctx, chartArea, scales } = chart;
        ctx.save();
        ctx.fillStyle = "rgba(229,62,62,0.12)";
        for (const b of bands) {
          let x1 = scales.x.getPixelForValue(b.startIdx);
          let x2 = scales.x.getPixelForValue(b.endIdx);
          if (!isFinite(x1) || !isFinite(x2)) continue;
          let w = x2 - x1;
          if (w < 3) { x1 = (x1 + x2) / 2 - 1.5; w = 3; } // 얇아도 보이게 최소폭
          ctx.fillRect(x1, chartArea.top, w, chartArea.bottom - chartArea.top);
        }
        ctx.restore();
      },
    };

    chartRef.current = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels: labels ?? data?.map((d) => d.date),
        datasets: datasets ?? [
          {
            label: title ?? "포트폴리오 가치",
            data: data?.map((d) => d.value),
            borderColor: "#3182F6",
            backgroundColor: "rgba(49,130,246,0.1)",
            fill: true,
            tension: 0.3,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: !!datasets },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v = ctx.raw;
                if (yType === "pct") return `${ctx.dataset.label}: ${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
                if (v >= 1e8) return `${(v / 1e8).toFixed(1)}억원`;
                if (v >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만원`;
                return `${Math.round(v).toLocaleString()}원`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: {
              maxTicksLimit: 6,
              callback: function (val, idx) {
                const label = this.getLabelForValue(val);
                if (!label) return "";
                const d = new Date(label);
                if (isNaN(d)) return label;
                const spanDays = data && data.length > 1
                  ? (new Date(data.at(-1).date) - new Date(data[0].date)) / 86400000
                  : 9999;
                if (spanDays <= 200) return `${d.getMonth() + 1}.${d.getDate()}`;
                return `${d.getFullYear()}.${d.getMonth() + 1}`;
              },
            },
            grid: { display: false },
          },
          y: {
            ticks: {
              callback: yType === "pct"
                ? (v) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`
                : (v) => {
                    if (v >= 1e8) return `${(v / 1e8).toFixed(0)}억`;
                    if (v >= 1e4) return `${(v / 1e4).toFixed(0)}만`;
                    return v;
                  },
            },
          },
        },
      },
      plugins: [buyBandsPlugin],
    });

    return () => chartRef.current?.destroy();
  }, [data, labels, datasets, title, bands]);

  return (
    <div className="chart-container">
      <canvas ref={canvasRef} />
    </div>
  );
}
