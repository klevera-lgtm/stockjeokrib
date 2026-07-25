import { useState, useEffect, useMemo } from "react";
import { loadDividendMeta, getCategoryLabel, getCategoryColor, formatYield, formatKRW } from "../utils/dividendData.js";
import { consumeQuery, getQueryBalance, isBasic } from "../utils/premium.js";
import { logClick, logScreen } from "../utils/analytics.js";
import QueryGateModal from "./QueryGateModal.jsx";
import UpgradeModal from "./UpgradeModal.jsx";
import ShareSheet from "./ShareSheet.jsx";
import AdBanner from "./AdBanner.jsx";
import LineChart from "./LineChart.jsx";

const KRW_USD = 1380;
const TX_FEE = 0.0035;

const TARGET_OPTIONS = [
  { label: "50만원", value: 500000 },
  { label: "100만원", value: 1000000 },
  { label: "200만원", value: 2000000 },
  { label: "300만원", value: 3000000 },
];

const MONTHLY_OPTIONS = [
  { label: "30만원", value: 300000 },
  { label: "50만원", value: 500000 },
  { label: "100만원", value: 1000000 },
  { label: "200만원", value: 2000000 },
];

export default function RetirementCalc({ onCoinsChanged, onNavigate }) {
  const [meta, setMeta] = useState(null);
  const [targetMonthly, setTargetMonthly] = useState(1000000);
  const [monthlyInvest, setMonthlyInvest] = useState(500000);
  const [portfolio, setPortfolio] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [result, setResult] = useState(null);
  const [showGate, setShowGate] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showShare, setShowShare] = useState(false);

  useEffect(() => {
    loadDividendMeta().then(setMeta);
  }, []);

  const tickers = useMemo(() => {
    if (!meta) return [];
    return Object.values(meta)
      .filter((t) => !t.warning)
      .sort((a, b) => (b.currentYield ?? 0) - (a.currentYield ?? 0));
  }, [meta]);

  const filtered = useMemo(() => {
    if (!search.trim()) return tickers;
    const q = search.toLowerCase();
    return tickers.filter(
      (t) => t.ticker.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)
    );
  }, [tickers, search]);

  const avgYield = useMemo(() => {
    if (portfolio.length === 0) return 0;
    return portfolio.reduce((sum, t) => sum + (t.currentYield ?? 0), 0) / portfolio.length;
  }, [portfolio]);

  function addTicker(t) {
    if (portfolio.find((p) => p.ticker === t.ticker)) return;
    setPortfolio([...portfolio, t]);
    setPickerOpen(false);
    setSearch("");
  }

  function removeTicker(ticker) {
    setPortfolio(portfolio.filter((p) => p.ticker !== ticker));
    setResult(null);
  }

  function handleCalc() {
    if (portfolio.length === 0) return;
    logClick("retire_calc", { targetMonthly, monthlyInvest, count: portfolio.length });

    if (!isBasic()) {
      if (getQueryBalance() <= 0) { setShowGate(true); return; }
      if (!consumeQuery()) { setShowGate(true); return; }
      onCoinsChanged?.();
    }

    const targetAnnualUSD = (targetMonthly * 12) / KRW_USD;
    const requiredCapitalUSD = targetAnnualUSD / avgYield;
    const requiredCapitalKRW = requiredCapitalUSD * KRW_USD;

    const monthlyUSD = monthlyInvest / KRW_USD;
    const monthlyYield = avgYield / 12;

    let capital = 0;
    let months = 0;
    const maxMonths = 50 * 12;
    const projections = [];

    while (capital * avgYield < targetAnnualUSD && months < maxMonths) {
      const invest = monthlyUSD * (1 - TX_FEE);
      capital += invest;
      const divThisMonth = capital * monthlyYield;
      capital += divThisMonth * (1 - TX_FEE);
      months++;

      if (months % 3 === 0 || capital * avgYield >= targetAnnualUSD) {
        projections.push({
          date: `${Math.floor(months / 12)}년 ${months % 12}개월`,
          month: months,
          value: capital * KRW_USD,
          monthlyDiv: (capital * monthlyYield) * KRW_USD,
          annualDiv: (capital * avgYield) * KRW_USD,
        });
      }
    }

    const yearsToGoal = months / 12;
    const totalInvested = monthlyInvest * months;
    const finalCapitalKRW = capital * KRW_USD;
    const finalMonthlyDiv = (capital * monthlyYield) * KRW_USD;
    const finalAnnualDiv = (capital * avgYield) * KRW_USD;

    setResult({
      yearsToGoal,
      months,
      totalInvested,
      requiredCapitalKRW,
      finalCapitalKRW,
      finalMonthlyDiv,
      finalAnnualDiv,
      avgYield,
      projections,
      reached: months < maxMonths,
    });
    logScreen("retire_result");
  }

  if (!meta) return <div className="loading-msg">배당 데이터 로딩 중...</div>;

  return (
    <div className="page retire-page">
      <div className="page-header">
        <h1 className="page-title">은퇴 계산기</h1>
        <p className="page-subtitle">배당금만으로 생활하려면 얼마나 걸릴까요?</p>
      </div>

      <AdBanner slot="retire-top" />

      {/* Target monthly dividend */}
      <div className="sim-section">
        <div className="sim-label">목표 월 배당금</div>
        <div className="sim-chips">
          {TARGET_OPTIONS.map((o) => (
            <button
              key={o.value}
              className={`chip${targetMonthly === o.value ? " active" : ""}`}
              onClick={() => { setTargetMonthly(o.value); setResult(null); }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Monthly investment */}
      <div className="sim-section">
        <div className="sim-label">월 적립금</div>
        <div className="sim-chips">
          {MONTHLY_OPTIONS.map((o) => (
            <button
              key={o.value}
              className={`chip${monthlyInvest === o.value ? " active" : ""}`}
              onClick={() => { setMonthlyInvest(o.value); setResult(null); }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Portfolio builder */}
      <div className="sim-section">
        <div className="sim-label">포트폴리오 구성 (최대 5종목)</div>
        <div className="retire-portfolio">
          {portfolio.map((t) => (
            <div key={t.ticker} className="retire-pick">
              <div className="retire-pick-info">
                <span className="retire-pick-ticker">{t.ticker}</span>
                <span className="retire-pick-name">{t.name}</span>
                <span className="retire-pick-yield">{formatYield(t.currentYield)}</span>
              </div>
              <button className="retire-pick-remove" onClick={() => removeTicker(t.ticker)}>✕</button>
            </div>
          ))}
          {portfolio.length < 5 && (
            <button className="retire-add-btn" onClick={() => setPickerOpen(true)}>
              + 종목 추가
            </button>
          )}
        </div>
        {portfolio.length > 0 && (
          <div className="retire-avg-yield">
            평균 배당률: <strong>{(avgYield * 100).toFixed(2)}%</strong>
          </div>
        )}
      </div>

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
                const already = portfolio.find((p) => p.ticker === t.ticker);
                return (
                  <button
                    key={t.ticker}
                    className={`sim-picker-item${already ? " active" : ""}`}
                    onClick={() => !already && addTicker(t)}
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

      {/* Calculate button */}
      <div className="sim-section" style={{ padding: "0 16px" }}>
        <button
          className="btn-primary sim-run-btn"
          onClick={handleCalc}
          disabled={portfolio.length === 0}
        >
          은퇴 시점 계산하기
          {!isBasic() && <span className="sim-cost-badge">🪙 1</span>}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="retire-results">
          <h2 className="section-title">계산 결과</h2>

          {/* Hero card */}
          <div className="sim-summary">
            <div className="sim-summary-card highlight">
              <div className="sim-summary-label">목표 달성까지</div>
              <div className="sim-summary-value">
                {result.reached
                  ? `${Math.floor(result.yearsToGoal)}년 ${result.months % 12}개월`
                  : "50년 이상"}
              </div>
            </div>
            <div className="sim-summary-card">
              <div className="sim-summary-label">필요 투자 원금</div>
              <div className="sim-summary-value">{formatKRW(result.requiredCapitalKRW)}</div>
            </div>
            <div className="sim-summary-card">
              <div className="sim-summary-label">총 납입금</div>
              <div className="sim-summary-value">{formatKRW(result.totalInvested)}</div>
            </div>
            <div className="sim-summary-card">
              <div className="sim-summary-label">달성 시 월 배당금</div>
              <div className="sim-summary-value" style={{ color: "var(--primary)" }}>
                {formatKRW(result.finalMonthlyDiv)}
              </div>
            </div>
            <div className="sim-summary-card">
              <div className="sim-summary-label">달성 시 연 배당금</div>
              <div className="sim-summary-value" style={{ color: "var(--primary)" }}>
                {formatKRW(result.finalAnnualDiv)}
              </div>
            </div>
          </div>

          {/* Projection chart */}
          {result.projections.length > 2 && (
            <div className="sim-chart-wrap">
              <LineChart
                labels={result.projections.map((p) => p.date)}
                datasets={[
                  {
                    label: "포트폴리오 가치",
                    data: result.projections.map((p) => p.value),
                    borderColor: "#16A34A",
                    backgroundColor: "rgba(22,163,74,0.08)",
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                  },
                  {
                    label: "목표 금액",
                    data: result.projections.map(() => result.requiredCapitalKRW),
                    borderColor: "#F59E0B",
                    borderDash: [6, 3],
                    backgroundColor: "transparent",
                    fill: false,
                    tension: 0,
                    pointRadius: 0,
                  },
                ]}
              />
            </div>
          )}

          {/* Monthly dividend growth */}
          {result.projections.length > 2 && (
            <div className="sim-chart-wrap">
              <LineChart
                labels={result.projections.map((p) => p.date)}
                datasets={[
                  {
                    label: "월 배당금",
                    data: result.projections.map((p) => p.monthlyDiv),
                    borderColor: "#16A34A",
                    backgroundColor: "rgba(22,163,74,0.08)",
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                  },
                  {
                    label: "목표",
                    data: result.projections.map(() => targetMonthly),
                    borderColor: "#F59E0B",
                    borderDash: [6, 3],
                    backgroundColor: "transparent",
                    fill: false,
                    tension: 0,
                    pointRadius: 0,
                  },
                ]}
                title="월 배당금 성장"
              />
            </div>
          )}

          {!result.reached && (
            <div className="retire-warning">
              현재 조건으로는 목표 달성에 50년 이상 소요됩니다.
              배당률이 높은 종목을 추가하거나 월 적립금을 늘려보세요.
            </div>
          )}

          <button className="ssheet-trigger" onClick={() => setShowShare(true)}>
            📤 결과 공유하기
          </button>

          <div className="sim-fee-notice">
            배당금 재투자(DRIP) + 거래 비용(0.35%) 반영 · 배당률 고정 가정
          </div>

          <AdBanner slot="retire-result" />
        </div>
      )}

      {showGate && (
        <QueryGateModal
          onClose={() => setShowGate(false)}
          onEarned={() => onCoinsChanged?.()}
          onUpgrade={() => { setShowGate(false); setShowUpgrade(true); }}
        />
      )}
      {showUpgrade && (
        <UpgradeModal onClose={() => { setShowUpgrade(false); onCoinsChanged?.(); }} />
      )}
      {showShare && result && (
        <ShareSheet
          text={`🏖️ 배당 은퇴 계산기\n목표: 월 ${formatKRW(targetMonthly)} 배당금\n포트폴리오: ${portfolio.map((t) => t.ticker).join(", ")} (평균 ${(avgYield * 100).toFixed(2)}%)\n달성 시점: ${result.reached ? `${Math.floor(result.yearsToGoal)}년 ${result.months % 12}개월` : "50년 이상"}\n필요 원금 ${formatKRW(result.requiredCapitalKRW)}`}
          card={{
            title: `월 ${formatKRW(targetMonthly)} 배당 은퇴 플랜`,
            subtitle: `${portfolio.map((t) => t.ticker).join(" + ")} · 평균 ${(avgYield * 100).toFixed(1)}%`,
            stats: [
              { label: "달성까지", value: result.reached ? `${Math.floor(result.yearsToGoal)}년` : "50년+", color: "#4ade80" },
              { label: "필요 원금", value: formatKRW(result.requiredCapitalKRW), color: "#ffffff" },
              { label: "월 적립금", value: formatKRW(monthlyInvest), color: "#ffffff" },
              { label: "달성 시 월 배당", value: formatKRW(result.finalMonthlyDiv), color: "#4ade80" },
              { label: "달성 시 연 배당", value: formatKRW(result.finalAnnualDiv), color: "#4ade80" },
            ],
            series: result.projections.map((p) => p.value),
          }}
          onClose={() => setShowShare(false)}
        />
      )}

      {onNavigate && (
        <button className="cross-link" onClick={() => onNavigate("accumulation", "goal")}>
          <span className="cross-link-icon">🎯</span>
          <div className="cross-link-text">
            <strong>적립으로 목표 금액 세우기</strong>
            <span>목표 금액 달성에 필요한 월 납입금을 역산해요</span>
          </div>
          <span className="cross-link-arrow">→</span>
        </button>
      )}
    </div>
  );
}
