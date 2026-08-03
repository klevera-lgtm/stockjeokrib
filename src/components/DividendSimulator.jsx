import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { loadDividendMeta, getCategoryLabel, getCategoryColor, getFrequencyLabel, formatKRW } from "../utils/dividendData.js";
import { runDividendSim } from "../utils/dividendCalc.js";
import { consumeQuery, getQueryBalance, isBasic } from "../utils/premium.js";
import { logClick, logScreen } from "../utils/analytics.js";
import QueryGateModal from "./QueryGateModal.jsx";
import UpgradeModal from "./UpgradeModal.jsx";
import ShareSheet from "./ShareSheet.jsx";
import AdBanner from "./AdBanner.jsx";
import LineChart from "./LineChart.jsx";
import { getTickerName } from "../utils/tickers.js";

const AMOUNTS = [
  { label: "10만원", value: 100000 },
  { label: "30만원", value: 300000 },
  { label: "50만원", value: 500000 },
  { label: "100만원", value: 1000000 },
];

const PERIODS = [
  { label: "3년", years: 3 },
  { label: "5년", years: 5 },
  { label: "10년", years: 10 },
  { label: "15년", years: 15 },
];

export default function DividendSimulator({ initialTicker, onCoinsChanged, onNavigate, embedded = false }) {
  const [meta, setMeta] = useState(null);
  const [ticker, setTicker] = useState(initialTicker || "");
  const [amount, setAmount] = useState(300000);
  const [periodYears, setPeriodYears] = useState(5);
  const [drip, setDrip] = useState(true);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showGate, setShowGate] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showShare, setShowShare] = useState(false);
  const [revealed, setRevealed] = useState(isBasic());

  useEffect(() => {
    loadDividendMeta().then(setMeta);
  }, []);

  useEffect(() => {
    if (initialTicker) setTicker(initialTicker);
  }, [initialTicker]);

  const tickers = useMemo(() => {
    if (!meta) return [];
    return Object.values(meta).sort((a, b) => (b.currentYield ?? 0) - (a.currentYield ?? 0));
  }, [meta]);

  const filtered = useMemo(() => {
    if (!search.trim()) return tickers;
    const q = search.toLowerCase();
    return tickers.filter(
      (t) => t.ticker.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)
    );
  }, [tickers, search]);

  const selected = meta?.[ticker];

  const handleRun = useCallback(async () => {
    if (!ticker || !meta?.[ticker]) return;
    logClick("sim_run", { ticker, amount, periodYears, drip });

    setLoading(true);
    setError("");
    setResult(null);
    setRevealed(isBasic());

    try {
      const res = await runDividendSim(ticker, amount, periodYears, drip);
      if (!res) {
        setError("해당 기간의 데이터가 부족합니다.");
      } else {
        setResult(res);
        logScreen("sim_result");
      }
    } catch (e) {
      setError("데이터를 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, [ticker, amount, periodYears, drip, meta, onCoinsChanged]);

  const autoRanRef = useRef(false);
  useEffect(() => {
    if (embedded && meta && ticker && meta[ticker] && !autoRanRef.current) {
      autoRanRef.current = true;
      handleRun();
    }
  }, [embedded, meta, ticker, handleRun]);

  const chartData = useMemo(() => {
    if (!result) return null;
    const pts = result.portfolioValues;
    const step = Math.max(1, Math.floor(pts.length / 120));
    const sampled = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
    return {
      labels: sampled.map((p) => p.date),
      datasets: [
        {
          label: "포트폴리오 가치",
          data: sampled.map((p) => p.value),
          borderColor: "#16A34A",
          backgroundColor: "rgba(22,163,74,0.08)",
          fill: true,
          tension: 0.3,
          pointRadius: 0,
        },
        {
          label: "투자 원금",
          data: sampled.map((p) => p.invested),
          borderColor: "#94A3B8",
          backgroundColor: "transparent",
          borderDash: [6, 3],
          fill: false,
          tension: 0,
          pointRadius: 0,
        },
      ],
    };
  }, [result]);

  if (!meta) return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">배당 시뮬레이션</h1>
        <p className="page-subtitle">매일 꾸준히 적립하면 배당금이 얼마나 불어날까요?</p>
      </div>
      <div className="skel-card"><div className="skel skel-line" /><div className="skel skel-line skel-line--mid" /><div className="skel skel-line skel-line--short" /></div>
      <div className="skel skel-block" style={{height:120,borderRadius:'var(--radius)',margin:'8px 0'}} />
    </div>
  );

  return (
    <div className="page sim-page">
      {!embedded && (
        <div className="page-header">
          <h1 className="page-title">배당 시뮬레이션</h1>
          <p className="page-subtitle">매일 꾸준히 적립하면 배당금이 얼마나 불어날까요?</p>
        </div>
      )}

      {/* Ticker Picker */}
      {!embedded && (
        <div className="sim-section">
          <div className="sim-label">종목 선택</div>
          <button className="sim-picker-btn" onClick={() => setPickerOpen(true)}>
            {selected ? (
              <span className="sim-picker-selected">
                <strong>{selected.ticker}</strong>
                <span className="sim-picker-name">{selected.name}</span>
                <span className="sim-picker-yield" style={{ color: getCategoryColor(selected.category) }}>
                  {((selected.currentYield ?? 0) * 100).toFixed(2)}%
                </span>
              </span>
            ) : (
              <span className="sim-picker-placeholder">종목을 선택하세요</span>
            )}
            <span className="sim-picker-arrow">▾</span>
          </button>
        </div>
      )}

      {/* Ticker picker modal */}
      {pickerOpen && (
        <div className="modal-overlay" onClick={() => setPickerOpen(false)}>
          <div className="modal-card sim-picker-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sim-picker-header">
              <h3>종목 선택</h3>
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
              {filtered.map((t) => (
                <button
                  key={t.ticker}
                  className={`sim-picker-item${ticker === t.ticker ? " active" : ""}`}
                  onClick={() => { setTicker(t.ticker); setPickerOpen(false); setSearch(""); }}
                >
                  <div className="sim-picker-item-top">
                    <span className="sim-picker-item-ticker">{t.ticker}</span>
                    <span className="cat-badge" style={{ background: getCategoryColor(t.category) + "20", color: getCategoryColor(t.category) }}>
                      {getCategoryLabel(t.category)}
                    </span>
                  </div>
                  <div className="sim-picker-item-bottom">
                    <span className="sim-picker-item-name">{t.name}</span>
                    <span className="sim-picker-item-yield">배당률 {((t.currentYield ?? 0) * 100).toFixed(2)}%</span>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="sim-picker-empty">검색 결과가 없어요</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Monthly Amount */}
      <div className="sim-section">
        <div className="sim-label">월 적립금</div>
        <div className="sim-chips">
          {AMOUNTS.map((a) => (
            <button
              key={a.value}
              className={`chip${amount === a.value ? " active" : ""}`}
              onClick={() => setAmount(a.value)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Period */}
      <div className="sim-section">
        <div className="sim-label">투자 기간</div>
        <div className="sim-chips">
          {PERIODS.map((p) => (
            <button
              key={p.years}
              className={`chip${periodYears === p.years ? " active" : ""}`}
              onClick={() => setPeriodYears(p.years)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* DRIP Toggle */}
      <div className="sim-section">
        <div className="sim-drip-row">
          <div>
            <div className="sim-label" style={{ padding: 0 }}>배당금 재투자 (DRIP)</div>
            <div className="sim-drip-desc">
              {drip ? "배당금을 자동으로 재매수해요" : "배당금을 현금으로 받아요"}
            </div>
          </div>
          <button className={`sim-toggle${drip ? " on" : ""}`} onClick={() => setDrip(!drip)}>
            <span className="sim-toggle-knob" />
          </button>
        </div>
      </div>

      {/* Run button */}
      <div className="sim-section" style={{ padding: "0 16px" }}>
        <button
          className="btn-primary sim-run-btn"
          onClick={handleRun}
          disabled={!ticker || loading}
        >
          {loading ? "계산 중..." : "시뮬레이션 시작"}
        </button>
      </div>

      <AdBanner className="ad-banner-inline" />

      {error && <div className="error-msg">{error}</div>}

      {/* Results */}
      {result && (
        <div className="sim-results">
          <h2 className="section-title">시뮬레이션 결과</h2>

          {/* Investment method banner */}
          <div className="sim-method-banner">
            <span className="sim-method-icon">📊</span>
            <span className="sim-method-text">
              매 거래일 자동 매수 · 하루 {Math.round(result.dailyKRW).toLocaleString()}원씩 투자
            </span>
          </div>

          {/* Chart - teaser */}
          {chartData && (
            <div className="sim-chart-wrap">
              <LineChart labels={chartData.labels} datasets={chartData.datasets} />
            </div>
          )}

          {/* Summary (표면 무료) */}
          <div className="sim-summary">
            <div className="sim-summary-card highlight">
              <div className="sim-summary-label">최종 포트폴리오</div>
              <div className="sim-summary-value">{formatKRW(result.finalValue)}</div>
            </div>
            <div className="sim-summary-card">
              <div className="sim-summary-label">총 투자금</div>
              <div className="sim-summary-value">{formatKRW(result.totalInvested)}</div>
            </div>
            <div className="sim-summary-card">
              <div className="sim-summary-label">수익률</div>
              <div className={`sim-summary-value ${result.totalReturn >= 0 ? "pos" : "neg"}`}>
                {result.totalReturn >= 0 ? "+" : ""}{(result.totalReturn * 100).toFixed(1)}%
              </div>
            </div>
            <div className="sim-summary-card">
              <div className="sim-summary-label">연평균 수익률</div>
              <div className={`sim-summary-value ${result.cagr >= 0 ? "pos" : "neg"}`}>
                {result.cagr >= 0 ? "+" : ""}{(result.cagr * 100).toFixed(1)}%
              </div>
            </div>
          </div>

          {!revealed && (
            <div className="reveal-cta">
              <p className="reveal-hint">배당 수입 상세와 성장 그래프를 보려면 코인 1개가 필요해요</p>
              <button className="btn-primary reveal-btn" onClick={() => {
                if (isBasic()) { setRevealed(true); return; }
                if (getQueryBalance() <= 0) { setShowGate(true); return; }
                if (!consumeQuery()) { setShowGate(true); return; }
                onCoinsChanged?.();
                setRevealed(true);
              }}>
                🔓 배당 수입 상세 보기 (코인 1개)
              </button>
              <p className="reveal-balance">남은 코인 {getQueryBalance()}개 · 광고 시청 시 +2개</p>
            </div>
          )}

          {revealed && (
            <>
              {/* Dividend income */}
              <div className="sim-dividend-section">
                <h3 className="sim-div-title">예상 배당 수입</h3>
                <div className="sim-div-grid">
                  <div className="sim-div-item">
                    <div className="sim-div-label">현재 월 배당금</div>
                    <div className="sim-div-value">{formatKRW(result.monthlyDivKRW)}</div>
                  </div>
                  <div className="sim-div-item">
                    <div className="sim-div-label">현재 연 배당금</div>
                    <div className="sim-div-value">{formatKRW(result.annualDivKRW)}</div>
                  </div>
                  <div className="sim-div-item">
                    <div className="sim-div-label">누적 받은 배당금</div>
                    <div className="sim-div-value">{formatKRW(result.totalDividendsKRW)}</div>
                  </div>
                  <div className="sim-div-item">
                    <div className="sim-div-label">보유 주식 수</div>
                    <div className="sim-div-value">{result.totalShares.toFixed(2)}주</div>
                  </div>
                </div>
                <div className="sim-div-note">
                  {result.drip
                    ? "배당금이 자동 재투자되어 복리 효과를 누렸어요"
                    : `현금 배당 수령: ${formatKRW(result.totalDividendsKRW)}`}
                </div>
              </div>

              <button className="ssheet-trigger" onClick={() => setShowShare(true)}>
                📤 결과 공유하기
              </button>
            </>
          )}

          <div className="sim-fee-notice">
            매 거래일 매수 · 거래 비용(0.35%) 반영
          </div>

          <AdBanner slot="sim-result" />
        </div>
      )}

      {showGate && (
        <QueryGateModal
          onClose={() => setShowGate(false)}
          onEarned={() => { onCoinsChanged?.(); }}
          onUpgrade={() => { setShowGate(false); setShowUpgrade(true); }}
        />
      )}
      {showUpgrade && (
        <UpgradeModal
          onClose={() => { setShowUpgrade(false); onCoinsChanged?.(); }}
        />
      )}
      {showShare && result && (
        <ShareSheet
          text={`📊 ${getTickerName(ticker)} 배당 적립 시뮬레이션 (${periodYears}년)\n원금 ${formatKRW(result.totalInvested)} → ${formatKRW(result.finalValue)}\n수익률 ${result.totalReturn >= 0 ? "+" : ""}${(result.totalReturn * 100).toFixed(1)}%\n월 배당금 ${formatKRW(result.monthlyDivKRW)} | 연 배당금 ${formatKRW(result.annualDivKRW)}`}
          card={{
            title: `${getTickerName(ticker)} 배당 적립 ${periodYears}년 시뮬레이션`,
            subtitle: `월 ${formatKRW(amount)} · ${drip ? "DRIP 재투자" : "현금 수령"}`,
            stats: [
              { label: "투자 원금", value: formatKRW(result.totalInvested), color: "#ffffff" },
              { label: "최종 가치", value: formatKRW(result.finalValue), color: "#4ade80" },
              { label: "수익률", value: `${result.totalReturn >= 0 ? "+" : ""}${(result.totalReturn * 100).toFixed(1)}%`, color: result.totalReturn >= 0 ? "#4ade80" : "#f87171" },
              { label: "월 배당금", value: formatKRW(result.monthlyDivKRW), color: "#4ade80" },
              { label: "연 배당금", value: formatKRW(result.annualDivKRW), color: "#4ade80" },
            ],
            series: result.portfolioValues.filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 60)) === 0 || i === a.length - 1).map((p) => p.value),
          }}
          onClose={() => setShowShare(false)}
        />
      )}

      {onNavigate && ticker && (
        <button className="cross-link" onClick={() => onNavigate("accumulation", "strategy", { ticker })}>
          <span className="cross-link-icon">📈</span>
          <div className="cross-link-text">
            <strong>{getTickerName(ticker)} 적립 전략도 비교하기</strong>
            <span>여러 적립 전략별 수익률을 한눈에 비교해요</span>
          </div>
          <span className="cross-link-arrow">→</span>
        </button>
      )}
    </div>
  );
}
