import React, { useState, useEffect } from "react";
import { STRATEGY_LABELS } from "../utils/calculator.js";
import { getTickerLabel } from "../utils/tickers.js";
import { isBasic, getQueryBalance, isUnlockedToday, unlockToday, markUnlockedToday } from "../utils/premium.js";
import QueryGateModal from "./QueryGateModal.jsx";
import { loadPrices } from "../utils/dataLoader.js";
import AdBanner from "./AdBanner.jsx";
import { saveStock, getSavedStocks } from "../utils/savedStocks.js";
import { logClick } from "../utils/analytics.js";

const COIN_SHORT = ["1mo", "3mo", "6mo"];
const COIN_MID = ["1yr", "2yr", "3yr", "4yr", "5yr"];
const FREE_LONG = ["6yr", "7yr", "8yr", "9yr", "10yr"];
const COIN_PERIODS = new Set([...COIN_SHORT, ...COIN_MID]);
const SHORT_PERIODS = new Set(COIN_SHORT);

const PERIOD_LABELS = {
  "1mo": "지난 1달", "3mo": "지난 3달", "6mo": "지난 6달",
  "1yr": "지난 1년", "2yr": "지난 2년", "3yr": "지난 3년",
  "4yr": "지난 4년", "5yr": "지난 5년",
  "6yr": "지난 6년", "7yr": "지난 7년", "8yr": "지난 8년",
  "9yr": "지난 9년", "10yr": "지난 10년",
};

// 4가지 조합 모드 (전체/ETF × 레버리지 제외/포함)
const MODE_LABEL = {
  all_without: "전체 종목 · 레버리지 제외",
  all_with: "전체 종목 · 레버리지 포함",
  etf_without: "ETF 조합 · 레버리지 제외",
  etf_with: "ETF 전체 · 레버리지 포함",
};

// 오늘의 무료 랭킹: 날짜 시드로 코인 기간 하나가 매일 무료로 열림 (데일리 리텐션 훅).
// 앱을 열면 "오늘은 뭐가 무료?"로 매일 다른 기간을 보게 돼요.
const ROTATION_POOL = ["3mo", "6mo", "1yr", "2yr", "3yr", "4yr", "5yr"];
const DAY_SEED = parseInt(new Date().toLocaleDateString("en-CA").replace(/-/g, ""), 10);
const TODAY_FREE_PERIOD = ROTATION_POOL[DAY_SEED % ROTATION_POOL.length];

export default function FeaturedCombos({ onComboSelect, focus = null }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  // 들어오면 바로 ETF가 보이게 (사람들이 제일 원하는 것) — 성향 테스트 라우팅 시엔 전체 종목
  const [universe, setUniverse] = useState(focus ? (focus.universe ?? "all") : "etf");
  const [withLeverage, setWithLeverage] = useState(!!focus?.leverage);
  const [revealedPeriods, setRevealedPeriods] = useState(() => {
    const s = new Set();
    COIN_PERIODS.forEach((k) => { if (isUnlockedToday(`fc_period_${k}`)) s.add(k); });
    return s;
  });
  const [showQueryGate, setShowQueryGate] = useState(false);
  const [pendingPeriod, setPendingPeriod] = useState(null);
  const [pendingChart, setPendingChart] = useState(null);
  const [savedSet, setSavedSet] = useState(() => new Set(getSavedStocks()));
  const [saveLimitHit, setSaveLimitHit] = useState(false);
  const basic = isBasic();

  useEffect(() => {
    fetch("/featuredCombos.json")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
        // 모든 콤보 티커 백그라운드 프리페치
        const allTickers = new Set(
          Object.values(d.combos).flatMap((byLeverage) =>
            Object.values(byLeverage).flatMap((combo) => combo?.tickers ?? [])
          )
        );
        allTickers.forEach((t) => loadPrices(t).catch(() => {}));
      })
      .catch(() => setLoading(false));
  }, []);

  // 성향 테스트 라우팅: 레버리지 토글 + 해당 섹션으로 스크롤
  useEffect(() => {
    if (!focus || !data) return;
    setUniverse(focus.universe ?? "all");
    setWithLeverage(!!focus.leverage);
    if (focus.section) {
      const t = setTimeout(() => {
        document.getElementById(`fc-section-${focus.section}`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
      return () => clearTimeout(t);
    }
  }, [focus, data]);

  function handleReveal(periodKey) {
    if (unlockToday(`fc_period_${periodKey}`)) {
      setRevealedPeriods((prev) => new Set([...prev, periodKey]));
    } else {
      setPendingPeriod(periodKey);
      setShowQueryGate(true);
    }
  }

  // 무료로 볼 수 있는 기간: ETF '이번 달 최고'(상시) + 오늘의 무료 랭킹(매일 로테이션)
  function isFreePeek(periodKey) {
    if (universe === "etf" && periodKey === "1mo") return true;
    if (periodKey === TODAY_FREE_PERIOD) return true;
    return false;
  }

  function isLocked(periodKey) {
    if (basic) return false;
    if (isFreePeek(periodKey)) return false;
    if (!COIN_PERIODS.has(periodKey)) return false;
    return !revealedPeriods.has(periodKey);
  }

  // 코인 기간의 차트 보기는 코인 1개 소모
  function handleChartClick(combo, periodKey) {
    const select = () => onComboSelect(combo.tickers, combo.strategies, periodKey, true, lKey);
    if (basic || isFreePeek(periodKey) || !COIN_PERIODS.has(periodKey)) { select(); return; }
    if (unlockToday(`fc_chart_${periodKey}`)) {
      select();
    } else {
      setPendingChart({ combo, periodKey });
      setShowQueryGate(true);
    }
  }

  // 조합을 통째로 내 종목에 담기 → '담은 날부터 성적' 추적 루프로 연결 (리텐션)
  function handleSaveCombo(combo) {
    const next = new Set(savedSet);
    let added = 0, hit = false;
    for (const t of combo.tickers) {
      if (next.has(t)) continue;
      const r = saveStock(t);
      if (r === "ok") { next.add(t); added++; }
      else if (r === "exists") next.add(t);
      else if (r === "limit") { hit = true; break; }
    }
    if (added > 0) { setSavedSet(next); logClick("combo_save", { mode: lKey, count: added }); }
    if (hit) setSaveLimitHit(true);
  }

  if (loading) return (
    <div style={{padding:'8px 0'}}>
      {[1,2,3].map(i => (
        <div key={i} className="skel-card">
          <div className="skel skel-line skel-line--mid" />
          <div className="skel skel-line" />
          <div className="skel skel-line skel-line--short" />
        </div>
      ))}
    </div>
  );
  if (!data) return null;

  const lKey = `${universe}_${withLeverage ? "with" : "without"}`;

  function ComboCard({ periodKey }) {
    const locked = isLocked(periodKey);
    const combo = data.combos[periodKey]?.[lKey];
    if (!combo || combo.tickers.length === 0) return null;
    const comboSaved = combo.tickers.every((t) => savedSet.has(t));
    const useSimple = (periodKey === "1mo" || periodKey === "3mo") && combo.combinedSimpleReturn != null;
    const isShort = SHORT_PERIODS.has(periodKey);

    let pct, capped;
    if (useSimple) {
      pct = combo.combinedSimpleReturn * 100;
      capped = false;
    } else {
      const rawPct = combo.combinedCagr * 100;
      pct = Math.min(Math.max(rawPct, -100), 9999);
      capped = Math.abs(rawPct) > 9999;
    }

    return (
      <div className={`fc-card${locked ? " fc-card--locked" : ""}`}>
        <div className="fc-card-header">
          <span className="fc-period-label">{PERIOD_LABELS[periodKey]}</span>
          {locked && <span className="fc-badge">🔒 코인</span>}
          {isFreePeek(periodKey) && (
            <span className="fc-badge fc-badge--free">
              🎁 {periodKey === TODAY_FREE_PERIOD ? "오늘 무료" : "무료"}
            </span>
          )}
        </div>
        <div className="fc-cagr">
          <span className="fc-cagr-num">{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%{capped ? "+" : ""}</span>
          <span className="fc-cagr-hint">{useSimple ? "기간 수익률" : "연환산"}{isShort ? " · 단기 변동 큼" : ""}</span>
        </div>
        <div className="fc-rows">
          {combo.tickers.map((ticker, i) => {
            let rowPct, rowCapped;
            if (useSimple && combo.simpleReturns?.[i] != null) {
              rowPct = combo.simpleReturns[i] * 100;
              rowCapped = false;
            } else {
              const rowRaw = combo.cagrs[i] * 100;
              rowPct = Math.min(Math.max(rowRaw, -100), 9999);
              rowCapped = Math.abs(rowRaw) > 9999;
            }
            return (
            <div key={ticker} className="fc-row">
              <span className={`fc-row-ticker${locked ? " name--blur" : ""}`}>
                {getTickerLabel(ticker)}
              </span>
              <span className="fc-row-strategy">{STRATEGY_LABELS[combo.strategies[i]] ?? combo.strategies[i]}</span>
              <span className="fc-row-cagr">
                {rowPct >= 0 ? "+" : ""}{rowPct.toFixed(1)}%{rowCapped ? "+" : ""}
              </span>
            </div>
            );
          })}
        </div>
        {locked && (
          <button className="btn-primary fc-reveal-btn" onClick={() => handleReveal(periodKey)}>
            🔓 티커 공개하기 (코인 1개)
          </button>
        )}
        {!locked && onComboSelect && (
          <button
            className="fc-chart-btn"
            onClick={() => handleChartClick(combo, periodKey)}
          >
            차트로 보기{!basic && !isFreePeek(periodKey) && COIN_PERIODS.has(periodKey) ? " (코인 1개)" : ""}
          </button>
        )}
        {!locked && (
          <button
            className={`fc-save-btn${comboSaved ? " done" : ""}`}
            disabled={comboSaved}
            onClick={() => handleSaveCombo(combo)}
          >
            {comboSaved ? "✓ 내 종목에 담김" : "📌 이 조합 담기"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="featured-combos">
      <div className="fc-toggle-2d">
        <div className="fc-toggle-row">
          <span className="fc-toggle-label">자산</span>
          <div className="fc-toggle">
            <button
              className={`fc-toggle-btn${universe === "all" ? " fc-toggle-btn--on" : ""}`}
              onClick={() => setUniverse("all")}
            >전체 종목</button>
            <button
              className={`fc-toggle-btn${universe === "etf" ? " fc-toggle-btn--on" : ""}`}
              onClick={() => setUniverse("etf")}
            >ETF만</button>
          </div>
        </div>
        <div className="fc-toggle-row">
          <span className="fc-toggle-label">레버리지</span>
          <div className="fc-toggle">
            <button
              className={`fc-toggle-btn${!withLeverage ? " fc-toggle-btn--on" : ""}`}
              onClick={() => setWithLeverage(false)}
            >제외</button>
            <button
              className={`fc-toggle-btn${withLeverage ? " fc-toggle-btn--on" : ""}`}
              onClick={() => setWithLeverage(true)}
            >포함</button>
          </div>
        </div>
      </div>
      <p className="fc-mode-caption">{MODE_LABEL[lKey]}</p>

      <div className="fc-daily-free">
        🎁 오늘의 무료 랭킹 · <strong>{PERIOD_LABELS[TODAY_FREE_PERIOD]}</strong> 조합 · 매일 바뀌어요
      </div>

      <div className="fc-section" id="fc-section-short">
        <p className="fc-section-title">단기 랭킹</p>
        {COIN_SHORT.map((k) => <ComboCard key={k} periodKey={k} />)}
      </div>

      <AdBanner className="ad-banner-inline" />

      <div className="fc-section" id="fc-section-mid">
        <p className="fc-section-title">중기 랭킹</p>
        {COIN_MID.map((k, i) => (
          <React.Fragment key={k}>
            {i === 3 && <AdBanner className="ad-banner-inline" />}
            <ComboCard periodKey={k} />
          </React.Fragment>
        ))}
      </div>

      <AdBanner className="ad-banner-inline" />

      <div className="fc-section" id="fc-section-long">
        <p className="fc-section-title fc-section-title--main">기간별 최고 조합</p>
        {FREE_LONG.map((k, i) => (
          <React.Fragment key={k}>
            {i === 3 && <AdBanner className="ad-banner-inline" />}
            <ComboCard periodKey={k} />
          </React.Fragment>
        ))}
      </div>

      {saveLimitHit && (
        <p className="fc-save-limit">무료 저장 10개를 다 채웠어요 · <strong>내 종목</strong>에서 관리해요</p>
      )}
      <p className="fc-updated">기준일: {data.updatedAt} · 매주 업데이트</p>

      {showQueryGate && (
        <QueryGateModal
          onClose={() => { setShowQueryGate(false); setPendingPeriod(null); setPendingChart(null); }}
          onEarned={() => {
            if (pendingPeriod) {
              markUnlockedToday(`fc_period_${pendingPeriod}`);
              setRevealedPeriods((prev) => new Set([...prev, pendingPeriod]));
              setPendingPeriod(null);
            }
            if (pendingChart) {
              const { combo, periodKey } = pendingChart;
              setPendingChart(null);
              if (unlockToday(`fc_chart_${periodKey}`)) {
                onComboSelect(combo.tickers, combo.strategies, periodKey, true, lKey);
              }
            }
            setShowQueryGate(false);
          }}
        />
      )}
    </div>
  );
}
