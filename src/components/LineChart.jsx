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

export default function LineChart({ data, labels, datasets, title, yType = "won" }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();

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
                return isNaN(d) ? label : `${d.getFullYear()}.${d.getMonth() + 1}`;
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
    });

    return () => chartRef.current?.destroy();
  }, [data, labels, datasets, title]);

  return (
    <div className="chart-container">
      <canvas ref={canvasRef} />
    </div>
  );
}
