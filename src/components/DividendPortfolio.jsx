import { useState, useEffect, useMemo } from "react";
import { loadDividendMeta, getCategoryLabel, getCategoryColor, getFrequencyLabel, formatYield, formatKRW } from "../utils/dividendData.js";
import { isBasic } from "../utils/premium.js";
import { logClick, logScreen } from "../utils/analytics.js";
import UpgradeModal from "./UpgradeModal.jsx";
import ShareSheet from "./ShareSheet.jsx";
import AdBanner from "./AdBanner.jsx";

const KRW_USD = 1380;
const STORAGE_KEY = "bdw_my_portfolio";
const MONTHS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePortfolio(items) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
}

export default function DividendPortfolio({ onCoinsChanged, onNavigate }) {
  const [meta, setMeta] = useState(null);
  const [holdings, setHoldings] = useState(() => loadSaved());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editTicker, setEditTicker] = useState(null);
  const [editShares, setEditShares] = useState("");
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showShare, setShowShare] = useState(false);

  useEffect(() => { loadDividendMeta().then(setMeta); }, []);

  useEffect(() => {
    if (isBasic()) savePortfolio(holdings);
  }, [holdings]);

  const tickers = useMemo(() => {
    if (!meta) return [];
    return Object.values(meta).sort((a, b) => (b.currentYield ?? 0) - (a.currentYield ?? 0));
  }, [meta]);

  const filtered = useMemo(() => {
    if (!search.trim()) return tickers;
    const q = search.toLowerCase();
    return tickers.filter((t) => t.ticker.toLowerCase().includes(q) || t.name.toLowerCase().includes(q));
  }, [tickers, search]);

  const summary = useMemo(() => {
    if (!meta || holdings.length === 0) return null;
    let totalValue = 0;
    let annualDivUSD = 0;
    const monthMap = {};

    holdings.forEach((h) => {
      const t = meta[h.ticker];
      if (!t) return;
      const isKR = t.category === "korean";
      const price = t.latestPrice ?? 0;
      const value = isKR ? price * h.shares : price * h.shares * KRW_USD;
      totalValue += value;

      const ttm = t.ttmDividend ?? t.annualDividend ?? 0;
      const divTotal = ttm * h.shares;
      annualDivUSD += isKR ? divTotal / KRW_USD : divTotal;

      (t.paymentMonths ?? []).forEach((m) => {
        if (!monthMap[m]) monthMap[m] = [];
        monthMap[m].push({ ticker: h.ticker, name: t.name });
      });
    });

    const annualDivKRW = annualDivUSD * KRW_USD;
    const monthlyDivKRW = annualDivKRW / 12;
    const avgYield = totalValue > 0 ? annualDivKRW / totalValue : 0;
    const coveredMonths = Object.keys(monthMap).length;

    return { totalValue, annualDivKRW, monthlyDivKRW, avgYield, monthMap, coveredMonths };
  }, [meta, holdings]);

  function addHolding(ticker) {
    if (holdings.find((h) => h.ticker === ticker)) return;
    setHoldings([...holdings, { ticker, shares: 1 }]);
    setPickerOpen(false);
    setSearch("");
    setEditTicker(ticker);
    setEditShares("1");
  }

  function updateShares(ticker, shares) {
    const n = Math.max(0, parseFloat(shares) || 0);
    if (n === 0) {
      setHoldings(holdings.filter((h) => h.ticker !== ticker));
    } else {
      setHoldings(holdings.map((h) => h.ticker === ticker ? { ...h, shares: n } : h));
    }
    setEditTicker(null);
  }

  function removeHolding(ticker) {
    setHoldings(holdings.filter((h) => h.ticker !== ticker));
  }

  function handleSave() {
    if (!isBasic()) {
      logClick("portfolio_save_gate");
      setShowUpgrade(true);
      return;
    }
    savePortfolio(holdings);
    logClick("portfolio_saved");
  }

  if (!meta) return <div className="loading-msg">배당 데이터 로딩 중...</div>;

  return (
    <div className="page portfolio-page">
      <div className="page-header">
        <h1 className="page-title">내 배당 포트폴리오</h1>
        <p className="page-subtitle">보유 종목의 배당 현황을 한눈에 확인해요</p>
      </div>

      <AdBanner slot="port-top" />

      {/* Holdings list */}
      <div className="sim-section">
        <div className="sim-label">보유 종목</div>
        <div className="port-holdings">
          {holdings.map((h) => {
            const t = meta[h.ticker];
            if (!t) return null;
            const isKR = t.category === "korean";
            const value = isKR ? (t.latestPrice ?? 0) * h.shares : (t.latestPrice ?? 0) * h.shares * KRW_USD;
            return (
              <div key={h.ticker} className="port-holding-row">
                <div className="port-holding-info">
                  <div className="port-holding-top">
                    <span className="port-holding-ticker">{h.ticker}</span>
                    <span className="cat-badge" style={{ background: getCategoryColor(t.category) + "20", color: getCategoryColor(t.category) }}>
                      {getCategoryLabel(t.category)}
                    </span>
                  </div>
                  <div className="port-holding-name">{t.name}</div>
                  <div className="port-holding-meta">
                    <span>배당률 {formatYield(t.currentYield)}</span>
                    <span>{getFrequencyLabel(t.frequency)}</span>
                    <span>평가금 {formatKRW(value)}</span>
                  </div>
                </div>
                <div className="port-holding-right">
                  {editTicker === h.ticker ? (
                    <div className="port-shares-edit">
                      <input
                        className="port-shares-input"
                        type="number"
                        value={editShares}
                        onChange={(e) => setEditShares(e.target.value)}
                        onBlur={() => updateShares(h.ticker, editShares)}
                        onKeyDown={(e) => e.key === "Enter" && updateShares(h.ticker, editShares)}
                        autoFocus
                      />
                      <span className="port-shares-unit">주</span>
                    </div>
                  ) : (
                    <button
                      className="port-shares-btn"
                      onClick={() => { setEditTicker(h.ticker); setEditShares(String(h.shares)); }}
                    >
                      {h.shares}주
                    </button>
                  )}
                  <button className="retire-pick-remove" onClick={() => removeHolding(h.ticker)}>✕</button>
                </div>
              </div>
            );
          })}
          {holdings.length < 10 && (
            <button className="retire-add-btn" onClick={() => setPickerOpen(true)}>
              + 종목 추가
            </button>
          )}
        </div>
      </div>

      {/* Save button */}
      {holdings.length > 0 && (
        <div className="sim-section" style={{ padding: "0 16px" }}>
          <button className="btn-primary port-save-btn" onClick={handleSave}>
            {isBasic() ? "포트폴리오 저장하기" : (
              <>포트폴리오 저장하기 <span className="port-basic-tag">Basic</span></>
            )}
          </button>
          {!isBasic() && (
            <div className="port-save-hint">Basic 구독 시 포트폴리오를 저장하고 언제든 확인할 수 있어요</div>
          )}
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="port-summary-section">
          <h2 className="section-title">포트폴리오 요약</h2>
          <div className="sim-summary">
            <div className="sim-summary-card highlight">
              <div className="sim-summary-label">총 평가금액</div>
              <div className="sim-summary-value">{formatKRW(summary.totalValue)}</div>
            </div>
            <div className="sim-summary-card">
              <div className="sim-summary-label">예상 월 배당금</div>
              <div className="sim-summary-value" style={{ color: "var(--primary)" }}>{formatKRW(summary.monthlyDivKRW)}</div>
            </div>
            <div className="sim-summary-card">
              <div className="sim-summary-label">예상 연 배당금</div>
              <div className="sim-summary-value" style={{ color: "var(--primary)" }}>{formatKRW(summary.annualDivKRW)}</div>
            </div>
            <div className="sim-summary-card">
              <div className="sim-summary-label">평균 배당률</div>
              <div className="sim-summary-value">{(summary.avgYield * 100).toFixed(2)}%</div>
            </div>
          </div>

          {/* My dividend calendar */}
          <div className="port-cal-section">
            <h3 className="sim-div-title">내 배당 캘린더</h3>
            <div className="port-cal-grid">
              {MONTHS.map((m, i) => {
                const stocks = summary.monthMap[i + 1] ?? [];
                return (
                  <div key={i} className={`port-cal-cell${stocks.length > 0 ? " has-div" : ""}`}>
                    <div className="port-cal-month">{m}</div>
                    <div className="port-cal-count">
                      {stocks.length > 0 ? `${stocks.length}종목` : "-"}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="port-cal-coverage">
              {summary.coveredMonths}/12개월 배당 수령
              {summary.coveredMonths === 12 && " — 매월 배당 달성!"}
            </div>
          </div>

          <button className="ssheet-trigger" onClick={() => setShowShare(true)}>
            📤 포트폴리오 공유하기
          </button>

          {/* Per-holding breakdown */}
          <div className="port-breakdown">
            <h3 className="sim-div-title">종목별 배당 상세</h3>
            {holdings.map((h) => {
              const t = meta[h.ticker];
              if (!t) return null;
              const isKR = t.category === "korean";
              const ttm = t.ttmDividend ?? t.annualDividend ?? 0;
              const annDiv = isKR ? ttm * h.shares : ttm * h.shares * KRW_USD;
              return (
                <div key={h.ticker} className="port-break-item">
                  <div className="port-break-left">
                    <span className="port-break-ticker">{h.ticker}</span>
                    <span className="port-break-shares">{h.shares}주</span>
                  </div>
                  <div className="port-break-right">
                    <span className="port-break-div">연 {formatKRW(annDiv)}</span>
                    <span className="port-break-monthly">월 {formatKRW(annDiv / 12)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {holdings.length === 0 && (
        <div className="port-empty">
          <div className="port-empty-icon">📊</div>
          <div className="port-empty-text">보유 종목을 추가하면<br />배당 현황을 분석해 드려요</div>
        </div>
      )}

      {onNavigate && (
        <button className="cross-link" onClick={() => onNavigate("accumulation", "portfolio")}>
          <span className="cross-link-icon">📈</span>
          <div className="cross-link-text">
            <strong>적립 포트폴리오도 관리하기</strong>
            <span>종목별 최적 적립 전략을 저장하고 관리해요</span>
          </div>
          <span className="cross-link-arrow">→</span>
        </button>
      )}

      <AdBanner slot="port-bottom" />

      {/* Picker modal */}
      {pickerOpen && (
        <div className="modal-overlay" onClick={() => setPickerOpen(false)}>
          <div className="modal-card sim-picker-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sim-picker-header">
              <h3>종목 추가</h3>
              <button className="sim-picker-close" onClick={() => setPickerOpen(false)}>✕</button>
            </div>
            <input
              className="sim-search-input"
              placeholder="종목명 또는 티커 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <div className="sim-picker-list">
              {filtered.map((t) => {
                const already = holdings.find((h) => h.ticker === t.ticker);
                return (
                  <button
                    key={t.ticker}
                    className={`sim-picker-item${already ? " active" : ""}`}
                    onClick={() => !already && addHolding(t.ticker)}
                    disabled={!!already}
                  >
                    <div className="sim-picker-item-top">
                      <span className="sim-picker-item-ticker">{t.ticker}</span>
                      <span className="cat-badge" style={{ background: getCategoryColor(t.category) + "20", color: getCategoryColor(t.category) }}>
                        {getCategoryLabel(t.category)}
                      </span>
                    </div>
                    <div className="sim-picker-item-bottom">
                      <span className="sim-picker-item-name">{t.name}</span>
                      <span className="sim-picker-item-yield">배당률 {formatYield(t.currentYield)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showUpgrade && (
        <UpgradeModal onClose={() => { setShowUpgrade(false); onCoinsChanged?.(); }} />
      )}
      {showShare && summary && (
        <ShareSheet
          text={`📊 내 배당 포트폴리오\n${holdings.map((h) => h.ticker).join(", ")} (${holdings.length}종목)\n총 평가금 ${formatKRW(summary.totalValue)} | 평균 배당률 ${(summary.avgYield * 100).toFixed(2)}%\n월 배당금 ${formatKRW(summary.monthlyDivKRW)} | 연 배당금 ${formatKRW(summary.annualDivKRW)}\n${summary.coveredMonths}/12개월 배당 수령`}
          card={{
            title: "내 배당 포트폴리오",
            subtitle: `${holdings.length}종목 · ${summary.coveredMonths}/12개월 배당 수령`,
            stats: [
              { label: "총 평가금액", value: formatKRW(summary.totalValue), color: "#ffffff" },
              { label: "평균 배당률", value: `${(summary.avgYield * 100).toFixed(2)}%`, color: "#4ade80" },
              { label: "월 배당금", value: formatKRW(summary.monthlyDivKRW), color: "#4ade80" },
              { label: "연 배당금", value: formatKRW(summary.annualDivKRW), color: "#4ade80" },
            ],
            rows: holdings.slice(0, 5).map((h) => {
              const t = meta[h.ticker];
              return { label: `${h.ticker} (${h.shares}주)`, value: formatYield(t?.currentYield) };
            }),
          }}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
