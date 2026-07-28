import { useState, useEffect } from "react";
import { logClick } from "../utils/analytics.js";

const BREADTH_URL =
  "https://raw.githubusercontent.com/kittycapital/market-breadth/main/data/market_breadth.json";

const TEASERS = [
  { text: "NVDA를 3년 전부터 매주 적립했다면?", ticker: "NVDA" },
  { text: "VOO vs QQQ 5년 적립 대결 — 승자는?", ticker: "QQQ" },
  { text: "배당왕 SCHD 적립 수익률 확인하기", ticker: "SCHD" },
  { text: "TSLA 적립 vs 거치식, 어떤 게 유리했을까?", ticker: "TSLA" },
  { text: "반도체 ETF SMH를 매주 적립했다면?", ticker: "SMH" },
  { text: "매달 AAPL 적립했다면 지금 얼마?", ticker: "AAPL" },
  { text: "금 ETF GLD 5년 적립 성과는?", ticker: "GLD" },
  { text: "나스닥 3배 TQQQ, 적립해도 3배일까?", ticker: "TQQQ" },
  { text: "AMD 3년 적립 수익률 확인하기", ticker: "AMD" },
  { text: "META를 2년 전부터 적립했다면?", ticker: "META" },
];

function gaugeLabel(pct) {
  if (pct >= 80) return "과열";
  if (pct >= 60) return "강세";
  if (pct >= 40) return "중립";
  if (pct >= 20) return "약세";
  return "침체";
}

function gaugeEmoji(pct) {
  if (pct >= 80) return "🔴";
  if (pct >= 60) return "🟠";
  if (pct >= 40) return "🟡";
  if (pct >= 20) return "🔵";
  return "🟣";
}

export default function InsightCard({ onNavigate }) {
  const [breadth, setBreadth] = useState(null);

  useEffect(() => {
    fetch(BREADTH_URL)
      .then((r) => r.json())
      .then((json) => {
        const spy = (json.indices ?? json)?.SPY;
        if (!spy) return;
        const keys = ["pct_above_20", "pct_above_50", "pct_above_100", "pct_above_200"];
        let len = spy.dates?.length ?? 0;
        const b = spy.breadth;
        while (len > 0 && b && keys.every((k) => (b[k]?.[len - 1] ?? 0) < 2)) len--;
        if (len === 0 || !keys.some((k) => (b?.[k]?.[len - 1] ?? 0) > 10)) len = spy.dates?.length ?? 0;
        const val = b?.pct_above_20?.[len - 1] ?? spy.current?.pct_above_20;
        const date = spy.dates?.[len - 1] ?? "";
        if (val != null) setBreadth({ val, date });
      })
      .catch(() => {});
  }, []);

  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000
  );
  const teaser = TEASERS[dayOfYear % TEASERS.length];

  return (
    <div className="insight-card">
      {breadth && (
        <button
          className="insight-row insight-market"
          onClick={() => {
            logClick("insight_market");
            onNavigate?.("trading", "trade-breadth");
          }}
        >
          <div className="insight-content">
            <span className="insight-label">오늘의 시장</span>
            <span className="insight-text">
              {gaugeEmoji(breadth.val)} S&P 500 종목 {breadth.val.toFixed(0)}%가
              20일선 위 ({gaugeLabel(breadth.val)})
            </span>
          </div>
          <span className="insight-arrow">›</span>
        </button>
      )}
      <button
        className="insight-row insight-dca"
        onClick={() => {
          logClick("insight_dca", { ticker: teaser.ticker });
          onNavigate?.("accumulation", "strategy", { ticker: teaser.ticker });
        }}
      >
        <div className="insight-content">
          <span className="insight-label">적립 인사이트</span>
          <span className="insight-text">💡 {teaser.text}</span>
        </div>
        <span className="insight-arrow">›</span>
      </button>
    </div>
  );
}
