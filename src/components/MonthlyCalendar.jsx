import { useState, useEffect, useMemo } from "react";
import { loadDividendMeta, getCategoryLabel, getCategoryColor, getFrequencyLabel, formatYield } from "../utils/dividendData.js";
import { getQueryBalance, isBasic, isUnlockedToday, unlockToday } from "../utils/premium.js";
import { logClick, logScreen } from "../utils/analytics.js";
import QueryGateModal from "./QueryGateModal.jsx";
import UpgradeModal from "./UpgradeModal.jsx";
import ShareSheet from "./ShareSheet.jsx";
import AdBanner from "./AdBanner.jsx";

const MONTHS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

export default function MonthlyCalendar({ onCoinsChanged }) {
  const [meta, setMeta] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [showCombo, setShowCombo] = useState(isUnlockedToday("calendar_combo"));
  const [showGate, setShowGate] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showShare, setShowShare] = useState(false);

  useEffect(() => {
    loadDividendMeta().then(setMeta);
  }, []);

  const calendarData = useMemo(() => {
    if (!meta) return null;
    const months = Array.from({ length: 12 }, () => []);
    Object.values(meta).forEach((t) => {
      if (!t.paymentMonths) return;
      t.paymentMonths.forEach((m) => {
        months[m - 1].push(t);
      });
    });
    months.forEach((arr) => arr.sort((a, b) => (b.currentYield ?? 0) - (a.currentYield ?? 0)));
    return months;
  }, [meta]);

  const combo = useMemo(() => {
    if (!meta || !showCombo) return null;
    const tickers = Object.values(meta).filter((t) => !t.warning);
    const monthly = tickers.filter((t) => t.frequency === "monthly");
    if (monthly.length > 0) {
      const best = [...monthly].sort((a, b) => (b.currentYield ?? 0) - (a.currentYield ?? 0));
      return { type: "monthly", picks: best.slice(0, 3) };
    }
    const covered = new Set();
    const picks = [];
    const sorted = [...tickers].sort((a, b) => (b.currentYield ?? 0) - (a.currentYield ?? 0));
    for (const t of sorted) {
      if (covered.size >= 12) break;
      const newMonths = (t.paymentMonths ?? []).filter((m) => !covered.has(m));
      if (newMonths.length > 0) {
        picks.push(t);
        newMonths.forEach((m) => covered.add(m));
      }
    }
    return { type: "combo", picks, coveredMonths: covered.size };
  }, [meta, showCombo]);

  function handleShowCombo() {
    logClick("calendar_combo");
    if (showCombo) return;
    if (unlockToday("calendar_combo")) {
      onCoinsChanged?.();
      setShowCombo(true);
      logScreen("calendar_combo_result");
    } else {
      setShowGate(true);
    }
  }

  if (!meta || !calendarData) return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">월배당 캘린더</h1>
        <p className="page-subtitle">매월 배당 받는 포트폴리오를 만들어보세요</p>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,padding:'0 16px'}}>
        {[...Array(12)].map((_,i) => <div key={i} className="skel" style={{height:60,borderRadius:'var(--radius)'}} />)}
      </div>
    </div>
  );

  return (
    <div className="page cal-page">
      <div className="page-header">
        <h1 className="page-title">월배당 캘린더</h1>
        <p className="page-subtitle">매월 배당 받는 포트폴리오를 만들어보세요</p>
      </div>

      {/* 12-month grid */}
      <div className="cal-grid">
        {calendarData.map((stocks, i) => (
          <button
            key={i}
            className={`cal-cell${selectedMonth === i ? " active" : ""}${stocks.length === 0 ? " empty" : ""}`}
            onClick={() => setSelectedMonth(selectedMonth === i ? null : i)}
          >
            <div className="cal-month">{MONTHS[i]}</div>
            <div className="cal-count">{stocks.length}종목</div>
            <div className="cal-dots">
              {stocks.slice(0, 4).map((t) => (
                <span key={t.ticker} className="cal-dot" style={{ background: getCategoryColor(t.category) }} />
              ))}
              {stocks.length > 4 && <span className="cal-dot-more">+{stocks.length - 4}</span>}
            </div>
          </button>
        ))}
      </div>

      <AdBanner className="ad-banner-inline" />

      {/* Month detail */}
      {selectedMonth !== null && (
        <div className="cal-detail">
          <h3 className="cal-detail-title">{MONTHS[selectedMonth]} 배당 종목</h3>
          <div className="cal-detail-list">
            {calendarData[selectedMonth].map((t) => (
              <div key={t.ticker} className="cal-detail-item">
                <div className="cal-detail-left">
                  <span className="cal-detail-ticker">{t.ticker}</span>
                  <span className="cal-detail-name">{t.name}</span>
                </div>
                <div className="cal-detail-right">
                  <span className="cat-badge" style={{ background: getCategoryColor(t.category) + "20", color: getCategoryColor(t.category) }}>
                    {getCategoryLabel(t.category)}
                  </span>
                  <span className="cal-detail-yield">{formatYield(t.currentYield)}</span>
                </div>
              </div>
            ))}
            {calendarData[selectedMonth].length === 0 && (
              <div className="cal-detail-empty">이 달에 배당하는 종목이 없어요</div>
            )}
          </div>
        </div>
      )}

      {/* Frequency summary */}
      <div className="cal-freq-summary">
        <h3 className="section-title">배당 주기별 분류</h3>
        <div className="cal-freq-grid">
          {["monthly", "quarterly", "semi-annual", "annual"].map((freq) => {
            const count = Object.values(meta).filter((t) => t.frequency === freq).length;
            if (count === 0) return null;
            return (
              <div key={freq} className="cal-freq-card">
                <div className="cal-freq-label">{getFrequencyLabel(freq)}</div>
                <div className="cal-freq-count">{count}종목</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Optimal combo */}
      <div className="cal-combo-section">
        <h3 className="section-title">매월 배당 최적 조합</h3>
        <p className="cal-combo-desc">매월 빠짐없이 배당 받을 수 있는 조합을 추천해요</p>
        {!showCombo ? (
          <button className="btn-primary cal-combo-btn" onClick={handleShowCombo}>
            최적 조합 보기
            {!isBasic() && <span className="sim-cost-badge">🪙 1</span>}
          </button>
        ) : combo && (
          <div className="cal-combo-result">
            {combo.type === "monthly" ? (
              <>
                <div className="cal-combo-tag">월배당 TOP 3</div>
                <p className="cal-combo-note">월배당 종목만으로 매월 배당 수령 가능!</p>
              </>
            ) : (
              <>
                <div className="cal-combo-tag">최적 조합 ({combo.coveredMonths}/12월 커버)</div>
                <p className="cal-combo-note">{combo.picks.length}개 종목으로 {combo.coveredMonths}개월 배당 수령</p>
              </>
            )}
            <div className="cal-combo-picks">
              {combo.picks.map((t) => (
                <div key={t.ticker} className="cal-combo-pick">
                  <div className="cal-combo-pick-top">
                    <span className="cal-combo-pick-ticker">{t.ticker}</span>
                    <span className="cat-badge" style={{ background: getCategoryColor(t.category) + "20", color: getCategoryColor(t.category) }}>
                      {getCategoryLabel(t.category)}
                    </span>
                  </div>
                  <div className="cal-combo-pick-name">{t.name}</div>
                  <div className="cal-combo-pick-info">
                    <span>배당률 {formatYield(t.currentYield)}</span>
                    <span>{getFrequencyLabel(t.frequency)}</span>
                    <span>{(t.paymentMonths ?? []).map((m) => `${m}월`).join(" · ")}</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Coverage visualization */}
            <div className="cal-coverage">
              <div className="cal-coverage-title">월별 커버리지</div>
              <div className="cal-coverage-grid">
                {MONTHS.map((m, i) => {
                  const covering = combo.picks.filter((t) => (t.paymentMonths ?? []).includes(i + 1));
                  return (
                    <div key={i} className={`cal-coverage-cell${covering.length > 0 ? " covered" : ""}`}>
                      <div className="cal-coverage-month">{m}</div>
                      <div className="cal-coverage-count">{covering.length > 0 ? `${covering.length}종목` : "-"}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          <button className="ssheet-trigger" onClick={() => setShowShare(true)}>
            📤 조합 공유하기
          </button>
          </div>
        )}
      </div>

      <AdBanner slot="cal-bottom" />

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
      {showShare && combo && (
        <ShareSheet
          text={`📅 매월 배당 최적 조합\n${combo.picks.map((t) => `${t.ticker} (${formatYield(t.currentYield)})`).join(" + ")}\n${combo.coveredMonths ?? 12}/12개월 배당 수령`}
          card={{
            title: "매월 배당 최적 조합",
            subtitle: `${combo.picks.length}종목 · ${combo.coveredMonths ?? 12}/12개월 커버`,
            rows: combo.picks.map((t) => ({ label: `${t.ticker} ${t.name}`, value: formatYield(t.currentYield) })),
          }}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
