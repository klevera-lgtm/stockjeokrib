import React, { useState, useEffect } from "react";
import {
  loadDividendMeta,
  loadRawPrices,
  getCategoryLabel,
  getCategoryColor,
  getFrequencyLabel,
  formatYield,
  formatPct,
  formatPrice,
} from "../utils/dividendData.js";
import { logScreen, logClick } from "../utils/analytics.js";
import ShareSheet from "./ShareSheet.jsx";
import AdBanner from "./AdBanner.jsx";
import MiniSparkline from "./MiniSparkline.jsx";

function DivSparkline({ ticker }) {
  const [prices, setPrices] = useState(null);
  useEffect(() => {
    loadRawPrices(ticker).then((p) => setPrices(p.slice(-120))).catch(() => {});
  }, [ticker]);
  if (!prices) return <div className="ranking-spark-ph" />;
  return <MiniSparkline prices={prices} width={48} height={20} />;
}

const SORT_OPTIONS = [
  { id: "yield", label: "배당률 순" },
  { id: "growth", label: "배당성장률 순" },
  { id: "years", label: "연속배당 순" },
];

const FILTER_OPTIONS = [
  { id: "all", label: "전체" },
  { id: "monthly", label: "월배당" },
  { id: "etf", label: "ETF" },
  { id: "stock", label: "개별주" },
  { id: "safe", label: "안정형" },
];

export default function DividendRanking({ onTickerSelect, onNavigate }) {
  const [meta, setMeta] = useState(null);
  const [sortBy, setSortBy] = useState("yield");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [showShare, setShowShare] = useState(false);

  useEffect(() => {
    logScreen("tab_ranking");
    loadDividendMeta()
      .then(setMeta)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">배당 랭킹</h1>
        <p className="page-subtitle">배당률·성장률·연속배당으로 종목을 비교해요</p>
      </div>
      <div className="skel-chips">
        {[1,2,3,4,5].map(i => <div key={i} className="skel skel-chip" />)}
      </div>
      <div className="ranking-list">
        {[1,2,3,4,5,6].map(i => (
          <div key={i} className="skel-row">
            <div className="skel skel-circle" />
            <div style={{flex:1,display:'flex',flexDirection:'column',gap:6}}>
              <div className="skel skel-line skel-line--mid" />
              <div className="skel skel-line skel-line--short" />
            </div>
            <div className="skel skel-line skel-line--short" />
          </div>
        ))}
      </div>
    </div>
  );
  if (!meta) return (
    <div className="page">
      <div className="error-msg">데이터를 불러올 수 없습니다.</div>
      <button className="retry-btn" onClick={() => { setLoading(true); loadDividendMeta().then(setMeta).finally(() => setLoading(false)); }}>다시 시도</button>
    </div>
  );

  let items = Object.values(meta);

  if (filter === "monthly") {
    items = items.filter((t) => t.frequency === "monthly");
  } else if (filter === "etf") {
    items = items.filter((t) => t.category.includes("etf"));
  } else if (filter === "stock") {
    items = items.filter((t) => ["dividend_king", "dividend_stock", "reit_bdc"].includes(t.category));
  } else if (filter === "safe") {
    items = items.filter((t) => t.category !== "yieldmax_etf" && t.currentYield < 0.15);
  }

  if (sortBy === "yield") {
    items.sort((a, b) => b.currentYield - a.currentYield);
  } else if (sortBy === "growth") {
    items.sort((a, b) => (b.divGrowth5y ?? -999) - (a.divGrowth5y ?? -999));
  } else if (sortBy === "years") {
    items.sort((a, b) => b.consecutiveYears - a.consecutiveYears);
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">배당 랭킹</h1>
        <p className="page-subtitle">배당률·성장률·연속배당으로 종목을 비교해요</p>
      </div>

      <div className="filter-row">
        {FILTER_OPTIONS.map((f) => (
          <button
            key={f.id}
            className={`chip${filter === f.id ? " active" : ""}`}
            onClick={() => { setFilter(f.id); logClick("ranking_filter", { filter: f.id }); }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="sort-row">
        {SORT_OPTIONS.map((s) => (
          <button
            key={s.id}
            className={`sort-chip${sortBy === s.id ? " active" : ""}`}
            onClick={() => { setSortBy(s.id); logClick("ranking_sort", { sort: s.id }); }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="ranking-list">
        {items.map((item, idx) => (
          <React.Fragment key={item.ticker}>
            {(idx === 7 || idx === 15 || idx === 25 || idx === 35) && <AdBanner className="ad-banner-inline" />}
            <button
              className="ranking-row"
              onClick={() => {
                logClick("ranking_select", { ticker: item.ticker });
                onTickerSelect?.(item.ticker);
              }}
            >
              <div className="ranking-rank">{idx + 1}</div>
              <div className="ranking-info">
                <div className="ranking-name">
                  <span className="ranking-ticker">{item.ticker}</span>
                  <span className="ranking-label">{item.name}</span>
                </div>
                <div className="ranking-tags">
                  <span
                    className="cat-badge"
                    style={{ backgroundColor: getCategoryColor(item.category) + "18", color: getCategoryColor(item.category) }}
                  >
                    {getCategoryLabel(item.category)}
                  </span>
                  <span className="freq-badge">{getFrequencyLabel(item.frequency)}</span>
                  {item.warning === "yieldmax" && <span className="warn-badge">NAV 주의</span>}
                </div>
              </div>
              <div className="ranking-spark"><DivSparkline ticker={item.ticker} /></div>
              <div className="ranking-stats">
                <div className="ranking-yield">
                  <span className="stat-value">{formatYield(item.currentYield)}</span>
                  <span className="stat-label">배당률</span>
                </div>
                {sortBy === "growth" ? (
                  <div className="ranking-growth">
                    <span className={`stat-value ${(item.divGrowth5y ?? 0) >= 0 ? "pos" : "neg"}`}>
                      {item.divGrowth5y != null ? formatPct(item.divGrowth5y) : "-"}
                    </span>
                    <span className="stat-label">5년 성장</span>
                  </div>
                ) : sortBy === "years" ? (
                  <div className="ranking-years">
                    <span className="stat-value">{item.consecutiveYears}년</span>
                    <span className="stat-label">연속배당</span>
                  </div>
                ) : (
                  <div className="ranking-price">
                    <span className="stat-value">{formatPrice(item.latestPrice, item.ticker)}</span>
                    <span className="stat-label">현재가</span>
                  </div>
                )}
              </div>
            </button>
          </React.Fragment>
        ))}
      </div>

      <button className="ssheet-trigger" onClick={() => setShowShare(true)}>
        📤 랭킹 공유하기
      </button>

      {showShare && (
        <ShareSheet
          text={`📊 배당 랭킹 TOP 5 (${SORT_OPTIONS.find(s => s.id === sortBy)?.label})\n${items.slice(0, 5).map((t, i) => `${i + 1}. ${t.ticker} - ${formatYield(t.currentYield)}`).join("\n")}`}
          card={{
            title: `배당 랭킹 - ${SORT_OPTIONS.find(s => s.id === sortBy)?.label}`,
            period: `${FILTER_OPTIONS.find(f => f.id === filter)?.label} · ${items.length}종목`,
            rows: items.slice(0, 5).map((t) => ({
              label: `${t.ticker} ${t.name}`,
              value: sortBy === "growth" ? (t.divGrowth5y != null ? formatPct(t.divGrowth5y) : "-") : sortBy === "years" ? `${t.consecutiveYears}년` : formatYield(t.currentYield),
            })),
          }}
          onClose={() => setShowShare(false)}
        />
      )}

      {onNavigate && (
        <button className="cross-link" onClick={() => onNavigate("accumulation", "strategy")}>
          <span className="cross-link-icon">📈</span>
          <div className="cross-link-text">
            <strong>적립 시뮬레이션 해보기</strong>
            <span>같은 종목으로 적립 전략별 수익률도 비교해요</span>
          </div>
          <span className="cross-link-arrow">→</span>
        </button>
      )}

      <AdBanner className="ad-banner-results" />
    </div>
  );
}
