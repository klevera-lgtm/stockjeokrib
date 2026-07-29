import React, { useState, useMemo } from "react";
import { TICKER_CATEGORIES, SUPPORTED_TICKERS, getTickerLabel } from "../utils/tickers.js";
import AdBanner from "./AdBanner.jsx";

const POPULAR = ["TSLA", "NVDA", "AAPL", "QQQ", "SPY", "MSFT"];
const CAT_KEYS = Object.keys(TICKER_CATEGORIES);

export default function TickerSearch({ onSelect, multi = false, selected = [], compact = false }) {
  const [query, setQuery] = useState("");
  const [openCat, setOpenCat] = useState(null);

  const searchResults = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    const upper = q.toUpperCase();
    return [...SUPPORTED_TICKERS]
      .filter((t) => t.toUpperCase().includes(upper) || getTickerLabel(t).toLowerCase().includes(q.toLowerCase()))
      .sort();
  }, [query]);

  function toggle(ticker) {
    if (!multi) {
      onSelect(ticker);
      return;
    }
    if (selected.includes(ticker)) {
      onSelect(selected.filter((t) => t !== ticker));
    } else {
      if (selected.length >= 5) return;
      onSelect([...selected, ticker]);
    }
  }

  function renderChip(ticker) {
    const isSelected = multi ? selected.includes(ticker) : selected === ticker;
    const isKR = TICKER_CATEGORIES["국내 자산"]?.includes(ticker);
    return (
      <button
        key={ticker}
        className={`ticker-chip${isSelected ? " selected" : ""}${isKR ? " ticker-chip--kr" : ""}`}
        onClick={() => toggle(ticker)}
      >
        {isKR ? (
          <>
            <span className="ticker-name ticker-name--primary">{getTickerLabel(ticker)}</span>
            <span className="ticker-sym ticker-sym--secondary">{ticker}</span>
          </>
        ) : (
          <span className="ticker-sym">{ticker}</span>
        )}
      </button>
    );
  }

  const isSearching = query.trim().length > 0;

  return (
    <div className="ticker-search">
      <input
        className="search-input"
        placeholder="TSLA, 테슬라, tesla..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {isSearching ? (
        <div className="ts-search-results">
          {searchResults && searchResults.length > 0 ? (
            <div className="ticker-grid">{searchResults.map(renderChip)}</div>
          ) : (
            <div className="ts-no-result">
              <p className="ts-no-result-msg">이 종목은 아직 지원하지 않아요</p>
              <p className="ts-no-result-hint">인기 종목으로 시작해보세요</p>
              <div className="ticker-grid">{POPULAR.map(renderChip)}</div>
            </div>
          )}
        </div>
      ) : (
        <>
          {!compact && (
            <div className="ts-popular">
              <p className="ts-section-label">🔥 인기 종목</p>
              <div className="ticker-grid">
                {POPULAR.map(renderChip)}
              </div>
            </div>
          )}

          <div className="ts-categories">
            <p className="ts-section-label">📂 카테고리별 탐색</p>
            {CAT_KEYS.map((cat, catIdx) => {
              const tickers = TICKER_CATEGORIES[cat];
              const isOpen = openCat === cat;
              return (
                <React.Fragment key={cat}>
                {(catIdx === 5 || catIdx === 12) && <AdBanner className="ad-banner-inline" />}
                <div className={`ts-cat${isOpen ? " ts-cat--open" : ""}`}>
                  <button
                    className="ts-cat-header"
                    onClick={() => setOpenCat(isOpen ? null : cat)}
                  >
                    <span className="ts-cat-name">{cat}</span>
                    <span className="ts-cat-meta">
                      <span className="ts-cat-count">{tickers.length}</span>
                      <span className={`ts-cat-arrow${isOpen ? " open" : ""}`}>▼</span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="ts-cat-body">
                      <div className="ticker-grid">{tickers.map(renderChip)}</div>
                    </div>
                  )}
                </div>
                </React.Fragment>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
