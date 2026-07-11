import { useState, useMemo } from "react";
import { TICKER_CATEGORIES, SUPPORTED_TICKERS, getTickerLabel } from "../utils/tickers.js";

const ALL_CATS = ["전체", ...Object.keys(TICKER_CATEGORIES)];

export default function TickerSearch({ onSelect, multi = false, selected = [] }) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("전체");

  const candidates = useMemo(() => {
    const q = query.trim().toUpperCase();

    // 검색어가 있으면 SUPPORTED_TICKERS 전체(CSV 보유 티커)에서 검색
    if (q) {
      return [...SUPPORTED_TICKERS].filter(
        (t) => t.toUpperCase().includes(q) || getTickerLabel(t).includes(query.trim())
      ).sort();
    }

    // 검색어 없으면 카테고리 그리드
    let list;
    if (activeCategory === "전체") {
      list = Object.values(TICKER_CATEGORIES).flat();
    } else {
      list = TICKER_CATEGORIES[activeCategory] ?? [];
    }
    return [...new Set(list)];
  }, [query, activeCategory]);

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

  return (
    <div className="ticker-search">
      <input
        className="search-input"
        placeholder="티커 또는 종목명 검색..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="category-chips">
        {ALL_CATS.map((cat) => (
          <button
            key={cat}
            className={`chip${activeCategory === cat ? " active" : ""}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>
      <div className="ticker-grid">
        {candidates.slice(0, 60).map((ticker) => {
          const isSelected = multi
            ? selected.includes(ticker)
            : selected === ticker;
          return (
            <button
              key={ticker}
              className={`ticker-chip${isSelected ? " selected" : ""}${TICKER_CATEGORIES["국내 자산"]?.includes(ticker) ? " ticker-chip--kr" : ""}`}
              onClick={() => toggle(ticker)}
            >
              {TICKER_CATEGORIES["국내 자산"]?.includes(ticker) ? (
                <>
                  <span className="ticker-name ticker-name--primary">{getTickerLabel(ticker)}</span>
                  <span className="ticker-sym ticker-sym--secondary">{ticker}</span>
                </>
              ) : (
                <span className="ticker-sym">{ticker}</span>
              )}
            </button>
          );
        })}
        {candidates.length === 0 && (
          <p className="empty-state">검색 결과가 없습니다.</p>
        )}
      </div>
    </div>
  );
}
