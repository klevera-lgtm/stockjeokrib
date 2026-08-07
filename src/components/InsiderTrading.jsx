import React, { useState, useEffect, useRef, useCallback } from "react";
import { Chart } from "chart.js/auto";
import AdBanner from "./AdBanner.jsx";
import QueryGateModal from "./QueryGateModal.jsx";
import { isBasic, getQueryBalance, isUnlockedToday, unlockToday } from "../utils/premium.js";
import { logClick } from "../utils/analytics.js";
import { getTickerLabel, SUPPORTED_TICKERS } from "../utils/tickers.js";

const SUMMARY_URL =
  "https://raw.githubusercontent.com/kittycapital/insider-trading/main/data/summary.json";
const FORM144_URL =
  "https://raw.githubusercontent.com/kittycapital/insider-trading/main/data/form144_summary.json";
const INSIDER_URL =
  "https://raw.githubusercontent.com/kittycapital/insider-trading/main/data/insider.json";
const CANDLE_BASE =
  "https://raw.githubusercontent.com/kittycapital/insider-trading/main/data/candles/";

const FREE_SELL_LIMIT = 3;
const UNLOCK_COST = 2;

function fmtDollar(v) {
  if (!v && v !== 0) return "-";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtDate(d) {
  if (!d) return "";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[1]}/${parts[2]}`;
  return d;
}

function InsiderChart({ ticker, transactions, txFilter }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [candle, setCandle] = useState(null);

  useEffect(() => {
    fetch(`${CANDLE_BASE}${ticker}.json`)
      .then((r) => r.json())
      .then(setCandle)
      .catch(() => {});
  }, [ticker]);

  const draw = useCallback(() => {
    if (!candle || !canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();

    const dates = candle.t.map((ts) => {
      const d = new Date(ts * 1000);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
    const closes = candle.c;

    const filtered = txFilter ? transactions.filter((tx) => tx.code === txFilter) : transactions;
    const txIndices = [];
    for (const tx of filtered) {
      const idx = dates.indexOf(tx.txDate);
      if (idx >= 0) txIndices.push(idx);
    }

    let startIdx;
    if (txIndices.length > 0) {
      const earliestTx = Math.min(...txIndices);
      startIdx = Math.max(0, earliestTx - 5);
      startIdx = Math.max(startIdx, dates.length - 150);
    } else {
      startIdx = Math.max(0, dates.length - 90);
    }

    const slicedDates = dates.slice(startIdx);
    const slicedCloses = closes.slice(startIdx);

    const lineXSet = new Map();
    for (const tx of filtered) {
      const idx = slicedDates.indexOf(tx.txDate);
      if (idx >= 0 && !lineXSet.has(idx)) {
        lineXSet.set(idx, { isBuy: tx.code === "P", name: tx.name, price: slicedCloses[idx] });
      }
    }

    const txMarkers = {
      id: "insiderMarkers",
      afterDraw: (chart) => {
        const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
        for (const [xVal, info] of lineXSet) {
          const px = x.getPixelForValue(xVal);
          const color = info.isBuy ? "#ff3b30" : "#3182f6";
          ctx.save();
          ctx.beginPath();
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = info.isBuy ? "rgba(255,59,48,0.3)" : "rgba(49,130,246,0.3)";
          ctx.lineWidth = 1;
          ctx.moveTo(px, top);
          ctx.lineTo(px, bottom);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(px, top + 8, 4, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
        }
      },
    };

    chartRef.current = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels: slicedDates,
        datasets: [
          {
            label: ticker,
            data: slicedCloses,
            borderColor: "#3182f6",
            backgroundColor: "rgba(49,130,246,0.06)",
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            borderWidth: 1.5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `$${ctx.parsed.y.toFixed(2)}`,
            },
          },
        },
        scales: {
          x: {
            display: true,
            ticks: {
              maxTicksLimit: 4,
              font: { size: 10 },
              callback: (_, i) => {
                const d = slicedDates[i];
                return d ? d.slice(5) : "";
              },
            },
            grid: { display: false },
          },
          y: {
            display: true,
            position: "right",
            ticks: {
              maxTicksLimit: 4,
              font: { size: 10 },
              callback: (v) => `$${v >= 1000 ? Math.round(v) : v.toFixed(0)}`,
            },
            grid: { color: "rgba(128,128,128,0.08)" },
          },
        },
      },
      plugins: [txMarkers],
    });
  }, [candle, ticker, transactions]);

  useEffect(() => {
    draw();
    return () => chartRef.current?.destroy();
  }, [draw]);

  if (!candle) return null;
  return (
    <div className="insider-chart-wrap">
      <div className="insider-chart-canvas"><canvas ref={canvasRef} /></div>
      <div className="insider-chart-legend">
        <span className="insider-legend-buy">● 내부자 매수</span>
        <span className="insider-legend-sell">● 내부자 매도</span>
      </div>
    </div>
  );
}

export default function InsiderTrading({ onNavigate, onCoinsChanged }) {
  const [summary, setSummary] = useState(null);
  const [form144, setForm144] = useState(null);
  const [insider, setInsider] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [revealed, setRevealed] = useState(isUnlockedToday("insider"));
  const [showGate, setShowGate] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter] = useState("all");
  const basic = isBasic();

  useEffect(() => {
    Promise.all([
      fetch(SUMMARY_URL).then((r) => r.json()),
      fetch(FORM144_URL).then((r) => r.json()),
      fetch(INSIDER_URL).then((r) => r.json()),
    ])
      .then(([s, f, ins]) => {
        setSummary(s);
        setForm144(f);
        setInsider(ins);
        setLoading(false);
        const firstBuy = (s.topBuyStocks ?? [])[0];
        if (firstBuy) setExpanded(`buy-${firstBuy[0]}`);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  function handleUnlock() {
    if (unlockToday("insider", UNLOCK_COST)) {
      onCoinsChanged?.();
      setRevealed(true);
      logClick("insider_unlock", { cost: UNLOCK_COST });
    } else {
      setShowGate(true);
    }
  }

  const unlocked = basic || revealed;

  if (loading) {
    return (
      <div className="insider-page">
        <h2 className="section-title">내부자 거래</h2>
        <div className="skel-card"><div className="skel skel-line skel-line--mid" /><div className="skel skel-line" /></div>
        <div className="skel-card"><div className="skel skel-line skel-line--mid" /><div className="skel skel-line" /><div className="skel skel-line skel-line--short" /></div>
        <div className="skel-card"><div className="skel skel-line skel-line--mid" /><div className="skel skel-line" /><div className="skel skel-line skel-line--short" /></div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="insider-page">
        <h2 className="section-title">내부자 거래</h2>
        <div className="error-msg">데이터를 불러올 수 없습니다.</div>
      </div>
    );
  }

  const buyRatio = summary.buyCount / (summary.buyCount + summary.sellCount) * 100;
  const topBuys = summary.topBuyStocks ?? [];
  const topSells = summary.topSellStocks ?? [];
  const maxSellVal = topSells.length > 0 ? topSells[0][1].total : 1;
  const topBuyInsiders = summary.topBuyInsiders ?? [];

  const recentTxs = insider
    ? (filter === "buy" ? insider.filter((t) => t.code === "P")
      : filter === "sell" ? insider.filter((t) => t.code === "S")
      : insider).slice(0, 30)
    : [];

  const txBySym = {};
  if (insider) {
    for (const tx of insider) {
      if (!txBySym[tx.sym]) txBySym[tx.sym] = [];
      txBySym[tx.sym].push(tx);
    }
  }

  return (
    <div className="insider-page">
      <h2 className="section-title">내부자 거래</h2>
      <p className="section-desc">SEC 공시 기반 임원·대주주 거래 현황</p>

      {/* 1. Summary Card */}
      <div className="insider-summary">
        <div className="insider-summary-row">
          <div className="insider-summary-buy">
            <span className="insider-summary-label">매수</span>
            <span className="insider-summary-val pos">{summary.buyCount}건</span>
            <span className="insider-summary-amt">{fmtDollar(summary.buyVal)}</span>
          </div>
          <div className="insider-summary-sell">
            <span className="insider-summary-label">매도</span>
            <span className="insider-summary-val neg">{summary.sellCount.toLocaleString()}건</span>
            <span className="insider-summary-amt">{fmtDollar(summary.sellVal)}</span>
          </div>
        </div>
        <div className="insider-ratio-bar">
          <div className="insider-ratio-buy" style={{ width: `${Math.max(buyRatio, 2)}%` }} />
        </div>
        <p className="insider-ratio-text">
          내부자 매수 비율 {buyRatio.toFixed(1)}% · {summary.uniqueSymbols}개 종목
        </p>
        {summary.updated && (
          <p className="insider-updated">기준일: {summary.updated.slice(0, 10)}</p>
        )}
      </div>

      {/* 2. Insider Buy TOP — free, all shown */}
      <div className="insider-section">
        <h3 className="insider-section-title">
          <span className="insider-dot insider-dot--buy" /> 내부자 매수 TOP
        </h3>
        <p className="insider-section-hint">임원이 자비로 매수 — 드물고 의미 있는 신호</p>
        {topBuys.length === 0 && <p className="insider-empty">최근 내부자 매수가 없습니다</p>}
        {topBuys.map(([sym, info], idx) => {
          const isExpanded = expanded === `buy-${sym}`;
          const supported = SUPPORTED_TICKERS.has(sym);
          const buyInsiders = topBuyInsiders.filter((ins) => ins[1].sym === sym);
          return (
            <React.Fragment key={sym}>
              {idx === 5 && <AdBanner className="ad-banner-inline" />}
              <div className={`insider-stock-card${isExpanded ? " insider-stock-card--open" : ""}`}>
                <div
                  className="insider-stock-header"
                  onClick={() => {
                    setExpanded(isExpanded ? null : `buy-${sym}`);
                    logClick("insider_expand", { sym, type: "buy" });
                  }}
                >
                  <span className="insider-rank">{idx + 1}</span>
                  <div className="insider-stock-info">
                    <span className="insider-ticker">{sym}</span>
                    <span className="insider-name">{getTickerLabel(sym)}</span>
                  </div>
                  <div className="insider-stock-right">
                    <span className="insider-amount pos">{fmtDollar(info.total)}</span>
                    <span className="insider-count">{info.count}건</span>
                  </div>
                  <span className={`insider-chevron${isExpanded ? " open" : ""}`}>▾</span>
                </div>
                {isExpanded && (
                  <div className="insider-stock-detail">
                    {txBySym[sym] && (
                      <InsiderChart ticker={sym} transactions={txBySym[sym]} txFilter="P" />
                    )}
                    {buyInsiders.map(([name, iInfo]) => (
                      <div key={name} className="insider-person">
                        <span className="insider-person-name">{name}</span>
                        <span className="insider-person-amt pos">{fmtDollar(iInfo.total)}</span>
                        {iInfo.txs?.slice(0, 3).map((tx, i) => (
                          <span key={i} className="insider-tx-date">{fmtDate(tx.date)}</span>
                        ))}
                      </div>
                    ))}
                    <div className="insider-stock-actions">
                      {supported && (
                        <button
                          className="btn-secondary insider-action-btn"
                          onClick={() => onNavigate?.("trading", "trade-sim", { ticker: sym })}
                        >
                          📊 백테스트
                        </button>
                      )}
                      {supported && (
                        <button
                          className="btn-secondary insider-action-btn"
                          onClick={() => onNavigate?.("accumulation", "strategy", { ticker: sym })}
                        >
                          💰 적립식 분석
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <AdBanner className="ad-banner-inline" />

      {/* 3. Insider Sell TOP — top 3 free, rest behind paywall */}
      <div className="insider-section">
        <h3 className="insider-section-title">
          <span className="insider-dot insider-dot--sell" /> 내부자 매도 TOP
        </h3>
        <p className="insider-section-hint">스톡옵션 행사·재산 분산 등 다양한 이유</p>
        {(unlocked ? topSells : topSells.slice(0, FREE_SELL_LIMIT)).map(([sym, info], idx) => {
          const barPct = (info.total / maxSellVal) * 100;
          const isExpanded = expanded === `sell-${sym}`;
          const supported = SUPPORTED_TICKERS.has(sym);
          return (
            <React.Fragment key={sym}>
              {(idx === 5 || idx === 15) && <AdBanner className="ad-banner-inline" />}
              <div className={`insider-stock-card insider-stock-card--sell${isExpanded ? " insider-stock-card--open" : ""}`}>
                <div className="insider-sell-bar" style={{ width: `${barPct.toFixed(1)}%` }} />
                <div
                  className="insider-stock-header"
                  onClick={() => {
                    setExpanded(isExpanded ? null : `sell-${sym}`);
                    logClick("insider_expand", { sym, type: "sell" });
                  }}
                >
                  <span className="insider-rank">{idx + 1}</span>
                  <div className="insider-stock-info">
                    <span className="insider-ticker">{sym}</span>
                    <span className="insider-name">{getTickerLabel(sym)}</span>
                  </div>
                  <div className="insider-stock-right">
                    <span className="insider-amount neg">{fmtDollar(info.total)}</span>
                    <span className="insider-count">{info.count}건</span>
                  </div>
                  <span className={`insider-chevron${isExpanded ? " open" : ""}`}>▾</span>
                </div>
                {isExpanded && (
                  <div className="insider-stock-detail">
                    {txBySym[sym] && (
                      <InsiderChart ticker={sym} transactions={txBySym[sym]} txFilter="S" />
                    )}
                    <div className="insider-stock-actions">
                      {supported && (
                        <button
                          className="btn-secondary insider-action-btn"
                          onClick={() => onNavigate?.("trading", "trade-sim", { ticker: sym })}
                        >
                          📊 백테스트
                        </button>
                      )}
                      {supported && (
                        <button
                          className="btn-secondary insider-action-btn"
                          onClick={() => onNavigate?.("accumulation", "strategy", { ticker: sym })}
                        >
                          💰 적립식 분석
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}

        {!unlocked && topSells.length > FREE_SELL_LIMIT && (
          <div className="insider-paywall">
            <button className="btn-primary insider-unlock-btn" onClick={handleUnlock}>
              🪙 {UNLOCK_COST}코인으로 전체 보기 (매도 + Form 144 + 타임라인)
            </button>
          </div>
        )}
      </div>

      {/* 4. Form 144 — unlocked */}
      {unlocked && form144 && (
        <>
          <AdBanner className="ad-banner-inline" />
          <div className="insider-section">
            <h3 className="insider-section-title">
              <span className="insider-dot insider-dot--form144" /> Form 144 매도 예정
            </h3>
            <p className="insider-section-hint">
              SEC에 매도 의향을 사전 신고한 내역 · 선행 지표
            </p>
            <div className="insider-form144-stats">
              <span>최근 7일 <strong>{form144.filings7d}</strong>건</span>
              <span>30일 <strong>{form144.filings30d}</strong>건</span>
              <span>90일 <strong>{form144.filings90d}</strong>건</span>
            </div>
            {(form144.topCompanies ?? []).slice(0, 10).map(([sym, info], idx) => {
              const supported = SUPPORTED_TICKERS.has(sym);
              return (
                <React.Fragment key={sym}>
                  {idx === 5 && <AdBanner className="ad-banner-inline" />}
                  <div className="insider-form144-row">
                    <span className="insider-rank">{idx + 1}</span>
                    <div className="insider-stock-info">
                      <span className="insider-ticker">{sym}</span>
                      <span className="insider-name">{info.name || getTickerLabel(sym)}</span>
                    </div>
                    <div className="insider-stock-right">
                      <span className="insider-amount neg">{fmtDollar(info.total)}</span>
                      <span className="insider-count">{info.count}건</span>
                    </div>
                    {supported && (
                      <button
                        className="insider-mini-btn"
                        onClick={() => onNavigate?.("trading", "trade-sim", { ticker: sym })}
                      >
                        분석
                      </button>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </>
      )}

      {/* 5. Recent Timeline — unlocked */}
      {unlocked && insider && (
        <>
          <AdBanner className="ad-banner-inline" />
          <div className="insider-section">
            <h3 className="insider-section-title">최근 거래 타임라인</h3>
            <div className="insider-filter-chips">
              {[
                { id: "all", label: "전체" },
                { id: "buy", label: "매수만" },
                { id: "sell", label: "매도만" },
              ].map((f) => (
                <button
                  key={f.id}
                  className={`insider-filter-chip${filter === f.id ? " active" : ""}`}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {recentTxs.map((tx, idx) => (
              <React.Fragment key={`${tx.sym}-${tx.txDate}-${tx.name}-${idx}`}>
                {(idx === 7 || idx === 20) && <AdBanner className="ad-banner-inline" />}
                <div className="insider-timeline-row">
                  <span className={`insider-timeline-badge ${tx.code === "P" ? "buy" : "sell"}`}>
                    {tx.code === "P" ? "매수" : "매도"}
                  </span>
                  <div className="insider-timeline-info">
                    <span className="insider-timeline-sym">{tx.sym}</span>
                    <span className="insider-timeline-name">{tx.name}</span>
                  </div>
                  <div className="insider-timeline-right">
                    <span className={tx.code === "P" ? "pos" : "neg"}>
                      {tx.code === "P" ? "+" : ""}{tx.change?.toLocaleString()}주
                    </span>
                    <span className="insider-timeline-price">${tx.price?.toFixed(2)}</span>
                  </div>
                  <span className="insider-timeline-date">{fmtDate(tx.txDate)}</span>
                </div>
              </React.Fragment>
            ))}
          </div>
        </>
      )}

      <div className="insider-disclaimer">
        ⚠️ SEC 공시 데이터이며 투자 권유가 아닙니다. 내부자 매도는 스톡옵션 행사, 세금 납부, 재산 분산 등 다양한 이유가 있습니다.
      </div>

      {showGate && (
        <QueryGateModal
          onClose={() => setShowGate(false)}
          onPurchased={() => { setShowGate(false); onCoinsChanged?.(); }}
        />
      )}
    </div>
  );
}
