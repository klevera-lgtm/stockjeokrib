import { useState, useEffect } from "react";
import TickerSearch from "./TickerSearch.jsx";
import AdBanner from "./AdBanner.jsx";
import UpgradeModal from "./UpgradeModal.jsx";
import { monitorStock } from "../utils/stockMonitor.js";
import { loadDividendMeta, formatYield } from "../utils/dividendData.js";
import { getAnonKey, fetchPortfolio } from "../utils/portfolioApi.js";
import { getTickerLabel } from "../utils/tickers.js";
import { isBasic } from "../utils/premium.js";
import { logClick } from "../utils/analytics.js";

const STORE_KEY = "ait_my_stocks";
const DATES_KEY = "ait_my_stocks_dates";
const MIGRATED_KEY = "ait_my_stocks_migrated";
const FREE_LIMIT = 10;
const BASIC_LIMIT = 100;

function loadStocks() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; }
}
function saveStocks(list) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch {}
}
// 담은 날짜 앵커 { ticker: "YYYY-MM-DD" } — "담은 날부터 성적" 계산용
function loadDates() {
  try { return JSON.parse(localStorage.getItem(DATES_KEY)) || {}; } catch { return {}; }
}
function saveDates(map) {
  try { localStorage.setItem(DATES_KEY, JSON.stringify(map)); } catch {}
}
function todayStr() { return new Date().toISOString().slice(0, 10); }

// 기존 3개 저장소(거래·배당 로컬)에서 종목 추출 — 데이터 보존
function localLegacyTickers() {
  const out = [];
  try {
    const trade = JSON.parse(localStorage.getItem("ait_trade_portfolio")) || [];
    for (const e of trade) if (e?.ticker) out.push(e.ticker);
  } catch {}
  try {
    const div = JSON.parse(localStorage.getItem("bdw_my_portfolio")) || [];
    for (const e of div) { const t = typeof e === "string" ? e : e?.ticker; if (t) out.push(t); }
  } catch {}
  return out;
}

function tradeCls(status) {
  if (status === "조건 진입") return "buy";
  if (status === "조건 이탈") return "sell";
  if (status === "조건 유지 중") return "hold";
  return "wait";
}

export default function MyStocks({ onOpenDetail, onNavigate }) {
  const [stocks, setStocks] = useState([]);
  const [dates, setDates] = useState({});
  const [monitors, setMonitors] = useState({});
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const basic = isBasic();
  const limit = basic ? BASIC_LIMIT : FREE_LIMIT;

  // 최초 로드 + 마이그레이션
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let list = loadStocks();
      if (!localStorage.getItem(MIGRATED_KEY)) {
        list = [...new Set([...list, ...localLegacyTickers()])];
        saveStocks(list);
        localStorage.setItem(MIGRATED_KEY, "1");
        // 적립 클라우드 종목 병합 (best-effort)
        try {
          const key = await getAnonKey();
          const cloud = await fetchPortfolio(key);
          if (Array.isArray(cloud)) {
            const merged = [...new Set([...list, ...cloud.map((c) => c?.ticker).filter(Boolean)])];
            if (merged.length !== list.length) { list = merged; saveStocks(list); }
          }
        } catch {}
      }
      if (!cancelled) { setStocks(list); setDates(loadDates()); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadDividendMeta().then((m) => { if (!cancelled) setMeta(m); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // 종목별 모니터링
  useEffect(() => {
    if (!stocks.length) { setMonitors({}); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    Promise.all(stocks.map((t) => monitorStock(t, dates[t] ?? null))).then((results) => {
      if (cancelled) return;
      const map = {};
      for (const r of results) map[r.ticker] = r;
      setMonitors(map);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [stocks, dates, refreshKey]);

  function addTicker(ticker) {
    if (stocks.includes(ticker)) { setShowAdd(false); return; }
    if (stocks.length >= limit) { setShowAdd(false); if (!basic) setShowUpgrade(true); return; }
    const updated = [...stocks, ticker];
    setStocks(updated);
    saveStocks(updated);
    const nd = { ...dates, [ticker]: todayStr() };
    setDates(nd); saveDates(nd);
    setShowAdd(false);
    logClick("mystocks_add", { ticker });
  }

  function removeTicker(ticker) {
    const updated = stocks.filter((t) => t !== ticker);
    setStocks(updated);
    saveStocks(updated);
    const nd = { ...dates }; delete nd[ticker];
    setDates(nd); saveDates(nd);
    logClick("mystocks_remove", { ticker });
  }

  const divYield = (t) => {
    const y = meta?.[t]?.currentYield;
    return y != null ? formatYield(y) : null;
  };

  // 조건 충족(신호) 종목 — 리텐션 훅
  const signalStocks = stocks.filter((t) => {
    const m = monitors[t];
    return m?.acc?.triggered || m?.trade?.status === "조건 진입";
  });

  return (
    <div className="mystocks">
      <div className="home-hero">
        <h1 className="home-title">내 종목</h1>
        <p className="home-sub">저장한 종목의 적립·거래·배당 신호를 한눈에</p>
      </div>

      {/* 신호 배너 */}
      {!loading && signalStocks.length > 0 && (
        <div className="ms-signal-banner">
          🔔 <strong>{signalStocks.map((t) => t).join(", ")}</strong> — 오늘 신호가 있어요
        </div>
      )}

      {/* 빈 상태 */}
      {stocks.length === 0 && (
        <div className="pf-empty">
          <div className="pf-empty-icon">📁</div>
          <h3 className="pf-empty-title">아직 저장한 종목이 없어요</h3>
          <p className="pf-empty-desc">
            종목을 추가하면 적립·거래·배당 신호를<br />앱을 열 때마다 바로 확인할 수 있어요
          </p>
          <button className="pf-add-btn primary" onClick={() => setShowAdd(true)}>+ 종목 추가</button>
          <button
            className="alpha-accumulate-btn"
            style={{ marginTop: 10, background: "var(--surface)", color: "var(--primary)", border: "1.5px solid var(--primary)" }}
            onClick={() => onNavigate?.("trading", "trade-scanner")}
          >
            📡 발견 탭에서 종목 찾아보기
          </button>
        </div>
      )}

      {/* 종목 리스트 */}
      {stocks.length > 0 && (
        <>
          <div className="ms-header-row">
            <span className="pf-count">{stocks.length}/{limit}개</span>
            <button className="pf-refresh-btn" onClick={() => setRefreshKey((k) => k + 1)} disabled={loading}>
              {loading ? "갱신 중..." : "새로고침"}
            </button>
          </div>

          <div className="ms-list">
            {stocks.map((t) => {
              const m = monitors[t];
              const label = getTickerLabel(t);
              const acc = m?.acc;
              const trade = m?.trade;
              const y = divYield(t);
              return (
                <div className="ms-card" key={t} onClick={() => onOpenDetail?.(t, "acc")}>
                  <button
                    className="ms-remove"
                    onClick={(e) => { e.stopPropagation(); removeTicker(t); }}
                    aria-label="삭제"
                  >×</button>
                  <div className="ms-card-head">
                    <span className="ms-sym">{t}</span>
                    {label !== t && <span className="ms-name">{label}</span>}
                    {m?.lastPrice != null && <span className="ms-price">${m.lastPrice.toFixed(2)}</span>}
                  </div>
                  {m?.sinceAdded && (() => {
                    const s = m.sinceAdded;
                    const pct = s.pct * 100;
                    const pos = pct >= 0;
                    return (
                      <div className={`ms-since ${pos ? "pos" : "neg"}`}>
                        <span className="ms-since-main">📌 담은 지 {s.days}일 · {pos ? "+" : ""}{pct.toFixed(1)}%</span>
                        <span className="ms-since-note">
                          {s.days < 5
                            ? "아직 며칠 안 됐어요 · 적립은 길게 봐요"
                            : pos ? "담은 뒤 올랐어요" : "더 싸게 담을 기회예요"}
                        </span>
                      </div>
                    );
                  })()}
                  <div className="ms-badges">
                    {loading || !m ? (
                      <span className="ms-badge loading">분석 중…</span>
                    ) : (
                      <>
                        <span className={`ms-badge acc${acc?.triggered ? " on" : ""}`}>
                          {acc?.triggered ? "🔔 적립 조건 충족" : "적립 대기"}
                        </span>
                        {trade && (
                          <span className={`ms-badge trade ${tradeCls(trade.status)}`}>
                            거래 · {trade.status}
                          </span>
                        )}
                        {y && <span className="ms-badge div">배당 {y}</span>}
                      </>
                    )}
                  </div>
                  <span className="ms-open-hint">눌러서 적립·거래·배당 상세 보기 →</span>
                </div>
              );
            })}
          </div>

          {stocks.length < limit ? (
            <button className="pf-add-btn" onClick={() => setShowAdd(true)}>
              + 종목 추가 ({stocks.length}/{limit})
            </button>
          ) : !basic ? (
            <div className="pf-paywall">
              <p>🔒 베이직에서 {BASIC_LIMIT}개까지 저장할 수 있어요</p>
              <button className="pf-add-btn primary" onClick={() => setShowUpgrade(true)} style={{ marginTop: 8 }}>
                베이직 보기
              </button>
            </div>
          ) : null}
        </>
      )}

      <AdBanner className="ad-banner-inline" />

      <div className="trade-disclaimer">
        ⚠️ 신호는 과거 데이터 기반이며, 미래 수익이나 특정 종목 매매를 권유하지 않습니다.
      </div>

      {/* 종목 추가 */}
      {showAdd && (
        <div className="pf-overlay" onClick={() => setShowAdd(false)}>
          <div className="pf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pf-modal-header">
              <h3>종목 추가</h3>
              <button className="pf-modal-close" onClick={() => setShowAdd(false)}>×</button>
            </div>
            <TickerSearch onSelect={addTicker} compact />
          </div>
        </div>
      )}

      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}
