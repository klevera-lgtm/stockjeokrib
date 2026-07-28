import { useRef, useEffect } from "react";

export default function MiniSparkline({ prices, width = 56, height = 24 }) {
  const ref = useRef(null);

  useEffect(() => {
    const c = ref.current;
    if (!c || !prices || prices.length < 2) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr;
    c.height = height * dpr;
    c.style.width = `${width}px`;
    c.style.height = `${height}px`;
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const vals = prices.map((p) => (typeof p === "number" ? p : p.close));
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const range = hi - lo || 1;
    const pd = 1;
    const cw = width - pd * 2;
    const ch = height - pd * 2;
    const up = vals[vals.length - 1] >= vals[0];
    const color = up ? "#22c55e" : "#ef4444";
    const fill = up ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)";

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.lineJoin = "round";
    for (let i = 0; i < vals.length; i++) {
      const x = pd + (i / (vals.length - 1)) * cw;
      const y = pd + ch - ((vals[i] - lo) / range) * ch;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.lineTo(pd + cw, pd + ch);
    ctx.lineTo(pd, pd + ch);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }, [prices, width, height]);

  if (!prices || prices.length < 2) return <div style={{ width, height }} />;
  return <canvas ref={ref} className="mini-sparkline" />;
}
