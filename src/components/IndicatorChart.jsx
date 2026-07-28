import { useRef, useEffect, useState } from "react";
import { loadPrices } from "../utils/dataLoader.js";

const DISPLAY = 90;

function sma(closes, period) {
  const r = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { r.push(null); continue; }
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += closes[j];
    r.push(s / period);
  }
  return r;
}

function ema(values, period) {
  const r = [];
  const k = 2 / (period + 1);
  for (let i = 0; i < values.length; i++) {
    if (values[i] === null) { r.push(null); continue; }
    r.push(!r.length || r[r.length - 1] === null
      ? values[i]
      : values[i] * k + r[i - 1] * (1 - k));
  }
  return r;
}

function calcRSI(closes, period = 14) {
  const r = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return r;
  let ag = 0, al = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) ag += d; else al -= d;
  }
  ag /= period; al /= period;
  r[period] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + Math.max(d, 0)) / period;
    al = (al * (period - 1) + Math.max(-d, 0)) / period;
    r[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return r;
}

function calcMACD(closes) {
  const ef = ema(closes, 12);
  const es = ema(closes, 26);
  const ml = ef.map((f, i) => f !== null && es[i] !== null ? f - es[i] : null);
  const sl = ema(ml, 9);
  return ml.map((m, i) => m !== null && sl[i] !== null ? m - sl[i] : null);
}

function fmtP(v) {
  if (v >= 10000) return (v / 1000).toFixed(0) + "K";
  if (v >= 1000) return (v / 1000).toFixed(1) + "K";
  if (v >= 1) return v.toFixed(1);
  return v.toFixed(2);
}

export default function IndicatorChart({ ticker, indicator, size = "medium" }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [allPrices, setAllPrices] = useState(null);

  useEffect(() => {
    if (!ticker) return;
    loadPrices(ticker).then(setAllPrices).catch(() => {});
  }, [ticker]);

  useEffect(() => {
    if (!allPrices?.length || !canvasRef.current || !containerRef.current) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const dpr = window.devicePixelRatio || 1;
    const W = container.clientWidth;
    const H = size === "small" ? 90 : 160;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const type = indicator?.type;
    const hasSub = type === "rsi" || type === "macd";
    const n = Math.min(DISPLAY, allPrices.length);
    const off = allPrices.length - n;
    const ac = allPrices.map((p) => p.close);

    let maL = null, maL2 = null, bU = null, bL = null;
    let rsiD = null, macdH = null;

    if (type === "ma") maL = sma(ac, indicator.period);
    if (type === "dualma") { maL = sma(ac, indicator.short); maL2 = sma(ac, indicator.long); }
    if (type === "bollinger") {
      const bp = indicator.period || 20;
      const bm = sma(ac, bp);
      bU = []; bL = [];
      for (let i = 0; i < ac.length; i++) {
        if (bm[i] === null) { bU.push(null); bL.push(null); continue; }
        let sq = 0;
        for (let j = i - bp + 1; j <= i; j++) sq += (ac[j] - bm[i]) ** 2;
        const std = Math.sqrt(sq / bp);
        bU.push(bm[i] + (indicator.stdMult || 2) * std);
        bL.push(bm[i] - (indicator.stdMult || 2) * std);
      }
    }
    if (type === "rsi") rsiD = calcRSI(ac);
    if (type === "macd") macdH = calcMACD(ac);

    const sl = (a) => a ? a.slice(off) : null;
    const closes = ac.slice(off);
    const dates = allPrices.slice(off);
    const dMA = sl(maL), dMA2 = sl(maL2), dBU = sl(bU), dBL = sl(bL);
    const dRSI = sl(rsiD), dMH = sl(macdH);

    const pad = size === "small"
      ? { top: 4, right: 4, bottom: 14, left: 36 }
      : { top: 8, right: 8, bottom: 20, left: 44 };
    const totalH = H - pad.top - pad.bottom;
    const priceH = hasSub ? totalH * 0.62 : totalH;
    const subGap = hasSub ? totalH * 0.06 : 0;
    const subH = hasSub ? totalH * 0.32 : 0;
    const cw = W - pad.left - pad.right;

    let pMin = Math.min(...closes), pMax = Math.max(...closes);
    for (const arr of [dMA, dMA2, dBU, dBL]) {
      if (!arr) continue;
      const v = arr.filter((x) => x !== null);
      if (v.length) { pMin = Math.min(pMin, ...v); pMax = Math.max(pMax, ...v); }
    }
    const pR = pMax - pMin || 1;
    pMin -= pR * 0.03; pMax += pR * 0.03;
    const pr = pMax - pMin;

    const xOf = (i) => pad.left + (i / (n - 1)) * cw;
    const yOf = (v) => pad.top + priceH - ((v - pMin) / pr) * priceH;

    const gs = size === "small" ? 2 : 3;
    ctx.font = `${size === "small" ? 8 : 9}px system-ui, sans-serif`;
    ctx.textAlign = "right";
    for (let i = 0; i <= gs; i++) {
      const v = pMin + (pr * i) / gs;
      const y = yOf(v);
      ctx.fillStyle = "rgba(156,163,175,0.10)";
      ctx.fillRect(pad.left, y, cw, 0.5);
      ctx.fillStyle = "#9ca3af";
      ctx.fillText(fmtP(v), pad.left - 4, y + 3);
    }

    if (dBU && dBL) {
      ctx.fillStyle = "rgba(99,102,241,0.08)";
      ctx.beginPath();
      let s = false;
      for (let i = 0; i < n; i++) { if (dBU[i] === null) continue; if (!s) { ctx.moveTo(xOf(i), yOf(dBU[i])); s = true; } else ctx.lineTo(xOf(i), yOf(dBU[i])); }
      for (let i = n - 1; i >= 0; i--) { if (dBL[i] === null) continue; ctx.lineTo(xOf(i), yOf(dBL[i])); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(99,102,241,0.3)"; ctx.lineWidth = 0.8; ctx.setLineDash([4, 3]);
      for (const band of [dBU, dBL]) {
        ctx.beginPath(); s = false;
        for (let i = 0; i < n; i++) { if (band[i] === null) continue; if (!s) { ctx.moveTo(xOf(i), yOf(band[i])); s = true; } else ctx.lineTo(xOf(i), yOf(band[i])); }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    const drawLine = (data, color, dash) => {
      if (!data) return;
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      if (dash) ctx.setLineDash([5, 3]);
      let s = false;
      for (let i = 0; i < n; i++) { if (data[i] === null) continue; if (!s) { ctx.moveTo(xOf(i), yOf(data[i])); s = true; } else ctx.lineTo(xOf(i), yOf(data[i])); }
      ctx.stroke(); ctx.setLineDash([]);
    };
    if (type === "ma") drawLine(dMA, "#f59e0b");
    if (type === "dualma") { drawLine(dMA, "#f59e0b"); drawLine(dMA2, "#8b5cf6", true); }

    ctx.beginPath(); ctx.strokeStyle = "#3182F6"; ctx.lineWidth = 1.5;
    for (let i = 0; i < n; i++) { const x = xOf(i); const y = yOf(closes[i]); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();

    ctx.fillStyle = "#9ca3af"; ctx.textAlign = "center";
    ctx.font = `${size === "small" ? 7 : 9}px system-ui, sans-serif`;
    const tk = size === "small" ? 2 : 3;
    for (let i = 0; i <= tk; i++) {
      const idx = Math.round((i * (n - 1)) / tk);
      const d = dates[idx].date;
      ctx.fillText(`${d.getMonth() + 1}/${d.getDate()}`, xOf(idx), H - 4);
    }

    if (type === "rsi" && dRSI) {
      const st = pad.top + priceH + subGap;
      const yR = (v) => st + subH - (v / 100) * subH;
      const bb = indicator.buyBelow || 30;
      const sa = indicator.sellAbove || 70;

      ctx.fillStyle = "rgba(239,68,68,0.05)"; ctx.fillRect(pad.left, yR(100), cw, yR(sa) - yR(100));
      ctx.fillStyle = "rgba(34,197,94,0.05)"; ctx.fillRect(pad.left, yR(bb), cw, yR(0) - yR(bb));
      ctx.strokeStyle = "rgba(156,163,175,0.25)"; ctx.lineWidth = 0.5; ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(pad.left, yR(sa)); ctx.lineTo(pad.left + cw, yR(sa));
      ctx.moveTo(pad.left, yR(bb)); ctx.lineTo(pad.left + cw, yR(bb));
      ctx.stroke(); ctx.setLineDash([]);

      if (size !== "small") {
        ctx.fillStyle = "#9ca3af"; ctx.textAlign = "right"; ctx.font = "8px system-ui, sans-serif";
        ctx.fillText(String(sa), pad.left - 4, yR(sa) + 3);
        ctx.fillText(String(bb), pad.left - 4, yR(bb) + 3);
      }

      ctx.beginPath(); ctx.strokeStyle = "#8b5cf6"; ctx.lineWidth = 1.5;
      let s = false;
      for (let i = 0; i < n; i++) { if (dRSI[i] === null) continue; if (!s) { ctx.moveTo(xOf(i), yR(dRSI[i])); s = true; } else ctx.lineTo(xOf(i), yR(dRSI[i])); }
      ctx.stroke();

      const lastR = dRSI.findLast((v) => v !== null);
      if (lastR != null) {
        const li = dRSI.lastIndexOf(lastR);
        ctx.fillStyle = lastR < bb ? "#22c55e" : lastR > sa ? "#ef4444" : "#8b5cf6";
        ctx.beginPath(); ctx.arc(xOf(li), yR(lastR), 3, 0, Math.PI * 2); ctx.fill();
      }
    }

    if (type === "macd" && dMH) {
      const st = pad.top + priceH + subGap;
      const valid = dMH.filter((v) => v !== null);
      if (valid.length) {
        const hMax = Math.max(...valid.map(Math.abs), 0.01);
        const yH = (v) => st + subH / 2 - (v / hMax) * (subH / 2);
        ctx.strokeStyle = "rgba(156,163,175,0.25)"; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(pad.left, st + subH / 2); ctx.lineTo(pad.left + cw, st + subH / 2); ctx.stroke();
        const bw = Math.max(1.5, (cw / n) * 0.7);
        for (let i = 0; i < n; i++) {
          if (dMH[i] === null) continue;
          const x = xOf(i); const mid = st + subH / 2; const y = yH(dMH[i]);
          ctx.fillStyle = dMH[i] >= 0 ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.6)";
          ctx.fillRect(x - bw / 2, Math.min(y, mid), bw, Math.abs(y - mid));
        }
      }
    }

    if (size === "medium") {
      ctx.font = "9px system-ui, sans-serif"; ctx.textAlign = "left";
      const ly = H - 4; let lx = pad.left;
      ctx.fillStyle = "#3182F6"; ctx.fillRect(lx, ly - 4, 8, 2); lx += 10;
      ctx.fillStyle = "#9ca3af"; ctx.fillText("가격", lx, ly); lx += 28;
      if (type === "ma") { ctx.fillStyle = "#f59e0b"; ctx.fillRect(lx, ly - 4, 8, 2); lx += 10; ctx.fillStyle = "#9ca3af"; ctx.fillText(`MA${indicator.period}`, lx, ly); }
      if (type === "dualma") { ctx.fillStyle = "#f59e0b"; ctx.fillRect(lx, ly - 4, 8, 2); lx += 10; ctx.fillStyle = "#9ca3af"; ctx.fillText(`MA${indicator.short}`, lx, ly); lx += 32; ctx.fillStyle = "#8b5cf6"; ctx.fillRect(lx, ly - 4, 8, 2); lx += 10; ctx.fillStyle = "#9ca3af"; ctx.fillText(`MA${indicator.long}`, lx, ly); }
      if (type === "bollinger") { ctx.fillStyle = "rgba(99,102,241,0.5)"; ctx.fillRect(lx, ly - 6, 8, 8); lx += 10; ctx.fillStyle = "#9ca3af"; ctx.fillText(`볼린저 ${indicator.stdMult}σ`, lx, ly); }
      if (type === "rsi") { ctx.fillStyle = "#8b5cf6"; ctx.fillRect(lx, ly - 4, 8, 2); lx += 10; ctx.fillStyle = "#9ca3af"; ctx.fillText("RSI", lx, ly); }
      if (type === "macd") { ctx.fillStyle = "#22c55e"; ctx.fillRect(lx, ly - 6, 4, 8); ctx.fillStyle = "#ef4444"; ctx.fillRect(lx + 4, ly - 6, 4, 8); lx += 10; ctx.fillStyle = "#9ca3af"; ctx.fillText("MACD", lx, ly); }
    }
  }, [allPrices, indicator, size]);

  if (!allPrices) return (
    <div ref={containerRef} className={`ind-chart ind-chart--${size}`}>
      <div className="ind-chart-loading">차트 로딩 중...</div>
    </div>
  );

  return (
    <div ref={containerRef} className={`ind-chart ind-chart--${size}`}>
      <canvas ref={canvasRef} />
    </div>
  );
}
