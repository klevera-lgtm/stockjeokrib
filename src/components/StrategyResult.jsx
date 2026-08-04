import React, { useState, useEffect, useRef, useCallback } from "react";
import { loadPrices } from "../utils/dataLoader.js";
import {
  runStrategy,
  ALL_STRATEGIES,
  STRATEGY_LABELS,
  formatKRW,
  formatPct,
} from "../utils/calculator.js";
import { isBasic, getQueryBalance, getStreakInfo, STREAK_BONUS, isLumpUnlocked, isUnlockedToday, unlockToday } from "../utils/premium.js";
import { logClick } from "../utils/analytics.js";
import TickerSearch from "./TickerSearch.jsx";
import { getTickerLabel, getTickerName } from "../utils/tickers.js";

const RECENT_KEY = "ait_recent_tickers";
const MAX_RECENT = 5;
function loadRecent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; } }
function saveRecent(ticker) {
  const list = loadRecent().filter(t => t !== ticker);
  list.unshift(ticker);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT))); } catch {}
}
import LineChart from "./LineChart.jsx";
import UpgradeModal from "./UpgradeModal.jsx";
import QueryGateModal from "./QueryGateModal.jsx";
import StrategyGuide from "./StrategyGuide.jsx";
import TickerInfoCard from "./TickerInfoCard.jsx";
import ShareSheet from "./ShareSheet.jsx";
import { APP_LINK } from "../utils/share.js";
import AdBanner from "./AdBanner.jsx";
import StrategyScorecard from "./StrategyScorecard.jsx";

function getPeriodDates(yearsBack) {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - yearsBack);
  return { start, end };
}

function makeSimShareText(ticker, result, monthlyAmount) {
  return `👑 주식적립왕 시뮬 결과\n\n${getTickerName(ticker)} · ${Math.round(result.years)}년\n월 ${(monthlyAmount / 10000).toFixed(0)}만원 적립 →\n원금 ${formatKRW(result.totalInvested)} → ${formatKRW(result.finalValue)}\n수익률 ${formatPct(result.totalReturn)}`;
}

export default function StrategyResult({ initialTicker = null, onOpenTest = null, onNavigate = null, embedded = false }) {
  const [ticker, setTicker] = useState(initialTicker);
  const [monthlyAmount, setMonthlyAmount] = useState(300000);
  const [customStart, setCustomStart] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showQueryGate, setShowQueryGate] = useState(false);
  const [remaining, setRemaining] = useState(getQueryBalance());
  const [revealed, setRevealed] = useState(isBasic());
  const [showShare, setShowShare] = useState(false);
  const [dataMeta, setDataMeta] = useState(null); // { years, start }
  const [lumpSel, setLumpSel] = useState(1); // 적립 vs 거치 선택 기간(년)
  const [lumpUnlocked, setLumpUnlocked] = useState(isLumpUnlocked()); // 기간 토글 잠금 해제 (세션 유지)
  const [chartIdx, setChartIdx] = useState(0);
  const basic = isBasic();
  const autoRanRef = useRef(false);
  const formRef = useRef(null);
  const chartRef = useRef(null);
  const gateActionRef = useRef("reveal"); // 코인 게이트 모달이 어떤 행동을 위해 열렸는지
  const gateLumpYearsRef = useRef(null);
  const [chartFlash, setChartFlash] = useState(false);
  const streak = getStreakInfo();

  useEffect(() => {
    if (!ticker) { setDataMeta(null); return; }
    let cancelled = false;
    loadPrices(ticker).then((p) => {
      if (cancelled) return;
      if (!p?.length) { setDataMeta(null); return; }
      const years = (Date.now() - p[0].date.getTime()) / (365.25 * 24 * 3600 * 1000);
      setDataMeta({ years, start: p[0].date });
    }).catch(() => { if (!cancelled) setDataMeta(null); });
    return () => { cancelled = true; };
  }, [ticker]);

  function handleReveal() {
    if (unlockToday(`rank_${ticker}`)) {
      setRevealed(true);
      setRemaining(getQueryBalance());
    } else {
      gateActionRef.current = "reveal";
      setShowQueryGate(true);
    }
  }

  // 적립 vs 거치 기간 토글 잠금 해제 (코인 1개로 모든 기간 · 그날 하루 유지)
  function handleLumpUnlock(years) {
    if (lumpUnlocked) { if (years != null) setLumpSel(years); return; }
    if (unlockToday("lump")) {
      setLumpUnlocked(true);
      if (years != null) setLumpSel(years);
      setRemaining(getQueryBalance());
      logClick("lump_unlock", { ticker, years });
    } else {
      gateActionRef.current = "lump";
      gateLumpYearsRef.current = years;
      setShowQueryGate(true);
    }
  }

  const run = useCallback(async () => {
    if (!ticker) return;
    logClick("sim_run", { ticker, amount: monthlyAmount });
    saveRecent(ticker);
    setLoading(true);
    setError(null);
    setRevealed(basic || isUnlockedToday(`rank_${ticker}`));
    try {
      const prices = await loadPrices(ticker);
      let startDate, endDate;
      if (customStart) {
        startDate = new Date(customStart + "-01");
        endDate = new Date();
      } else {
        const pd = getPeriodDates(5);
        startDate = pd.start;
        endDate = pd.end;
      }

      const allResults = ALL_STRATEGIES.map((s) =>
        runStrategy(prices, s, monthlyAmount, startDate, endDate)
      ).filter(Boolean);

      allResults.sort((a, b) => b.totalReturn - a.totalReturn);
      const benchmark = allResults.find((r) => r.strategy === "daily") ?? null;
      // 적립 vs 거치 — 최근 1/2/3/5/10년(데이터 있는 만큼) 각각 계산해서 버튼으로 토글
      const availYears = (endDate.getTime() - prices[0].date.getTime()) / (365.25 * 24 * 3600 * 1000);
      const lumpPeriods = [1, 2, 3, 5, 10]
        .filter((n) => n <= availYears + 0.15)
        .map((n) => {
          const s = new Date(endDate); s.setFullYear(s.getFullYear() - n);
          const dca = runStrategy(prices, "daily", monthlyAmount, s, endDate);
          const lump = runStrategy(prices, "lumpsum", monthlyAmount, s, endDate);
          return dca && lump ? { years: n, dca, lump } : null;
        })
        .filter(Boolean);
      setChartIdx(0);
      setResults({ list: allResults, benchmark, lumpPeriods });
      setTimeout(() => chartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [ticker, monthlyAmount, customStart, basic]);

  useEffect(() => {
    if (initialTicker && !autoRanRef.current) {
      autoRanRef.current = true;
      run();
    }
  }, [initialTicker, run]);

  // 공유 시트는 버튼 클릭으로만 열림 (검수 가이드: 바텀시트 자동 노출 금지)
  useEffect(() => {
    if (!results) setShowShare(false);
  }, [results]);

  // 결과 나오면 적립 vs 거치 기본 기간을 가장 짧은 기간(무료 노출)으로
  useEffect(() => {
    const ps = results?.lumpPeriods;
    if (ps?.length) setLumpSel(ps[0].years);
  }, [results]);

  // 결과의 실제 커버 구간 (요청 기간이 데이터보다 길면 clamp 표시)
  const periodInfo = (() => {
    const r0 = results?.list?.[0];
    if (!r0) return null;
    const first = r0.portfolioValues?.[0]?.date ?? null;
    const yrs = r0.years ?? 0;
    const reqStart = customStart ? new Date(customStart + "-01") : getPeriodDates(5).start;
    const clamped = !!first && first.getTime() - reqStart.getTime() > 40 * 864e5;
    const label = first
      ? `${first.getFullYear()}.${first.getMonth() + 1} ~ 현재 · ${yrs.toFixed(1)}년`
      : customStart ? `${customStart} ~ 현재` : "최근 5년";
    return { label, clamped, yrs, reqLabel: customStart ? `${customStart}부터` : "최근 5년" };
  })();

  return (
    <div className="page">
      {!embedded && (
        <div className="page-header">
          <h1 className="page-title">적립 시뮬레이션</h1>
          <p className="page-subtitle">과거 데이터로 적립 전략별 수익률을 비교해요</p>
          {!basic && remaining !== Infinity && (
            <div className="quota-badge">
              남은 코인 {remaining}개
              <span className="streak-chip">
                {streak.bonusToday
                  ? `🔥 ${streak.count}일 연속 · 보너스 +${STREAK_BONUS} 받음!`
                  : streak.count >= 2
                    ? `🔥 ${streak.count}일 연속 · ${streak.daysToBonus}일 후 +${STREAK_BONUS}`
                    : `🔥 이틀마다 +1 · 7일 연속 +${STREAK_BONUS}`}
              </span>
            </div>
          )}
        </div>
      )}

      {onOpenTest && (
        <button className="itt-entry" onClick={() => { logClick("invtest_start", { from: "strategy_tab" }); onOpenTest(); }}>
          <span className="itt-entry-icon">🧭</span>
          <span className="itt-entry-text">
            <strong>나는 어떤 투자자일까?</strong>
            <span>8문항 투자성향 테스트 · 30초</span>
          </span>
          <span className="itt-entry-arrow">→</span>
        </button>
      )}

      {!embedded && (
        <TickerSearch onSelect={(t) => { setTicker(t); setResults(null); setRevealed(basic); setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150); }} selected={ticker} />
      )}

      {!embedded && (() => {
        const recent = loadRecent().filter(t => t !== ticker);
        return recent.length > 0 && (
          <div className="recent-tickers">
            <span className="recent-label">최근 분석</span>
            {recent.map(t => (
              <button key={t} className="recent-chip" onClick={() => { setTicker(t); setResults(null); setRevealed(basic); }}>
                {t} <span className="recent-chip-name">{getTickerLabel(t) !== t ? getTickerLabel(t) : ""}</span>
              </button>
            ))}
          </div>
        );
      })()}

      {ticker && !embedded && <TickerInfoCard ticker={ticker} />}

      {ticker && (
        <div className="form-section" ref={formRef}>
          <label className="form-label">월 납입금</label>
          <div className="amount-row">
            {[100000, 300000, 500000, 1000000].map((v) => (
              <button
                key={v}
                className={`chip${monthlyAmount === v ? " active" : ""}`}
                onClick={() => setMonthlyAmount(v)}
              >
                {(v / 10000).toFixed(0)}만원
              </button>
            ))}
            {basic ? (
              <input
                type="number"
                className="amount-input"
                value={monthlyAmount}
                min={10000}
                step={10000}
                onChange={(e) => setMonthlyAmount(Number(e.target.value))}
              />
            ) : (
              <button className="chip chip--locked" onClick={() => setShowUpgrade(true)}>
                직접 입력 🔒
              </button>
            )}
          </div>

          <div className="period-row">
            <label className="form-label">시작 연월</label>
            <input
              type="month"
              className="month-input"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
            <span className="period-hint">
              ~ 현재 {!customStart && <span className="period-badge">기본 최근 5년</span>}
            </span>
          </div>

          {dataMeta && (
            <p className="data-span">
              📅 데이터 약 {dataMeta.years >= 10 ? Math.round(dataMeta.years) : dataMeta.years.toFixed(1)}년 ({dataMeta.start.getFullYear()}.{dataMeta.start.getMonth() + 1}~)
            </p>
          )}

          <button className="btn-primary run-btn" onClick={run} disabled={loading}>
            {loading ? "계산 중..." : `${getTickerName(ticker)} 전략 분석하기`}
          </button>

          <StrategyScorecard
            key={ticker}
            tickers={[ticker]}
            weights={{ [ticker]: 100 }}
            monthlyAmount={monthlyAmount}
            dataYears={dataMeta?.years ?? 0}
            onNeedUpgrade={() => setShowUpgrade(true)}
          />
        </div>
      )}

      {error && <p className="error-msg">{error}</p>}

      {results && (
        <div className="results-section">
          <h2 className="section-title">
            {getTickerName(ticker)} 전략별 수익률 순위
            <span className="period-label">
              {periodInfo?.label ?? (customStart ? customStart + " ~ 현재" : "최근 5년")}
            </span>
          </h2>
          <span className="tx-fee-badge">💰 거래 비용 0.35% 반영</span>
          {periodInfo?.clamped && (
            <p className="period-clamp-note">
              ⚠️ 요청은 {periodInfo.reqLabel}이지만 {getTickerName(ticker)} 데이터가 <strong>{periodInfo.yrs.toFixed(1)}년</strong>뿐이라 이 구간만 계산했어요. 이력이 다른 종목끼리 수익률을 직접 비교하면 오해가 생길 수 있어요.
            </p>
          )}

          {results.list[chartIdx] && (() => {
            const selected = results.list[chartIdx];
            const bm = results.benchmark;
            const toReturnPct = (pv) =>
              pv.map((d) => d.invested > 0 ? (d.value / d.invested - 1) * 100 : 0);
            return (
              <div ref={chartRef} className={`chart-highlight-wrap${chartFlash ? " chart-flash" : ""}`}>
              <div className="chart-selected-label">📊 {STRATEGY_LABELS[selected.strategy]}</div>
              <LineChart
                labels={selected.portfolioValues.map((d) => d.date)}
                datasets={[
                  {
                    label: STRATEGY_LABELS[selected.strategy],
                    data: toReturnPct(selected.portfolioValues),
                    borderColor: "#3182F6",
                    backgroundColor: "rgba(49,130,246,0.1)",
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                  },
                  ...(bm && bm.strategy !== selected.strategy ? [{
                    label: "매일 적립 기준",
                    data: toReturnPct(bm.portfolioValues),
                    borderColor: "rgba(150,150,150,0.6)",
                    borderDash: [5, 4],
                    backgroundColor: "transparent",
                    fill: false,
                    tension: 0.3,
                    pointRadius: 0,
                  }] : []),
                ]}
                yType="pct"
              />
              </div>
            );
          })()}

          {results.lumpPeriods?.length > 0 && (() => {
            const shortest = results.lumpPeriods[0].years;
            const displayYears = lumpUnlocked ? lumpSel : shortest;
            const sel = results.lumpPeriods.find((p) => p.years === displayYears) ?? results.lumpPeriods[0];
            const dca = sel.dca, lump = sel.lump;
            const diff = (lump.totalReturn - dca.totalReturn) * 100;
            const lumpWins = lump.totalReturn >= dca.totalReturn;
            const toPct = (pv) => pv.map((d) => (d.invested > 0 ? (d.value / d.invested - 1) * 100 : 0));
            const mdd = (m) => `${(m * 100).toFixed(0)}%`;
            const multiPeriod = results.lumpPeriods.length > 1;
            return (
              <div className="lump-card">
                <div className="lump-head">📊 적립 vs 거치 <span className="lump-sub">같은 돈 · 나눠 넣기 vs 한 번에</span></div>
                {multiPeriod && (
                  <div className="lump-periods">
                    {results.lumpPeriods.map((p, i) => {
                      const locked = !lumpUnlocked && i !== 0;
                      const active = p.years === sel.years;
                      return (
                        <button
                          key={p.years}
                          className={`lump-period${active ? " active" : ""}${locked ? " locked" : ""}`}
                          onClick={() => (locked ? handleLumpUnlock(p.years) : setLumpSel(p.years))}
                        >
                          {p.years}년{locked ? " 🔒" : ""}
                        </button>
                      );
                    })}
                  </div>
                )}
                {multiPeriod && !lumpUnlocked && (
                  <p className="lump-lock-hint">🔒 다른 기간도 코인 1개로 한 번에 열려요</p>
                )}
                <div className="lump-nums">
                  <div className="lump-num">
                    <span className="lump-num-label">매일 적립</span>
                    <span className={`lump-num-val ${dca.totalReturn >= 0 ? "pos" : "neg"}`}>{formatPct(dca.totalReturn)}</span>
                    <span className="lump-num-mdd">최대낙폭 {mdd(dca.mdd)}</span>
                  </div>
                  <div className="lump-num">
                    <span className="lump-num-label">거치 (첫날 한 번에)</span>
                    <span className={`lump-num-val ${lump.totalReturn >= 0 ? "pos" : "neg"}`}>{formatPct(lump.totalReturn)}</span>
                    <span className="lump-num-mdd">최대낙폭 {mdd(lump.mdd)}</span>
                  </div>
                </div>
                <div className="lump-chart">
                  <LineChart
                    labels={dca.portfolioValues.map((d) => d.date)}
                    datasets={[
                      { label: "매일 적립", data: toPct(dca.portfolioValues), borderColor: "#3182F6", backgroundColor: "transparent", fill: false, tension: 0.25, pointRadius: 0, borderWidth: 2 },
                      { label: "거치", data: toPct(lump.portfolioValues), borderColor: "#E53E3E", backgroundColor: "transparent", fill: false, tension: 0.25, pointRadius: 0, borderWidth: 2 },
                    ]}
                    yType="pct"
                  />
                </div>
                <p className="lump-verdict">최근 {sel.years}년엔 <strong>{lumpWins ? "거치(한 번에)" : "적립(나눠서)"}</strong>가 {Math.abs(diff).toFixed(1)}%p 유리했어요</p>
                <p className="lump-note">📌 오른 종목·긴 기간일수록 거치가 유리해요. 하지만 <strong>적립</strong>은 목돈 없이 <strong>월급으로</strong> 할 수 있고, <strong>하락·변동장에 강하고</strong>, 미래를 모를 때 마음이 편해요. (거치는 첫날 목돈이 있어야 가능해요.)</p>
              </div>
            );
          })()}

          {!revealed && (() => {
            const top = results.list[0];
            const bm = results.benchmark;
            const delta = bm && top.strategy !== bm.strategy ? top.totalReturn - bm.totalReturn : null;
            return (
              <>
                <div className="top-strategy-card">
                  <span className="top-strategy-badge">🥇 이 종목 최고 적립 전략</span>
                  <div className="top-strategy-name">{STRATEGY_LABELS[top.strategy]}</div>
                  <div className={`top-strategy-return ${top.totalReturn >= 0 ? "pos" : "neg"}`}>
                    {formatPct(top.totalReturn)}
                  </div>
                  <div className="top-strategy-meta">
                    납입 {formatKRW(top.totalInvested)} → <strong>{formatKRW(top.finalValue)}</strong> · 연 {formatPct(top.cagr)}
                  </div>
                  {delta !== null && (
                    <div className={`top-strategy-delta ${delta >= 0 ? "pos" : "neg"}`}>
                      매일 적립 대비 {delta >= 0 ? "+" : ""}{(delta * 100).toFixed(1)}%p
                    </div>
                  )}
                </div>
                <div className="reveal-cta">
                  <p className="reveal-hint">나머지 전략 순위도 궁금하다면?</p>
                  <button className="btn-primary reveal-btn" onClick={handleReveal}>
                    🔓 전체 순위 보기 (코인 1개)
                  </button>
                  <p className="reveal-balance">남은 코인 {remaining}개 · 광고 시청 시 +2개</p>
                </div>
              </>
            );
          })()}

          {revealed && (
            <div className="strategy-list">
              {results.list.map((r, idx) => {
                const isBest = idx === 0;
                const isWorst = idx === results.list.length - 1;
                const isBenchmark = r.strategy === "daily";
                const delta = results.benchmark && !isBenchmark
                  ? r.totalReturn - results.benchmark.totalReturn
                  : null;

                return (
                  <React.Fragment key={r.strategy}>
                  {(idx === 5 || idx === 10) && <AdBanner className="ad-banner-inline" />}
                  <div
                    className={`strategy-row${isBest ? " best" : ""}${isWorst ? " worst" : ""}${isBenchmark ? " benchmark" : ""}${idx === chartIdx ? " strategy-row--selected" : ""}`}
                    onClick={() => { setChartIdx(idx); setChartFlash(true); setTimeout(() => setChartFlash(false), 600); chartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}
                  >
                    <div className="strategy-rank">
                      {isBenchmark ? "📅" : isBest ? "🥇" : `${idx + 1}`}
                    </div>
                    <div className="strategy-info">
                      <div className="strategy-name">
                        {STRATEGY_LABELS[r.strategy]}
                        {isBenchmark && <span className="benchmark-badge">매일 적립</span>}
                      </div>
                      <div className="strategy-meta">
                        납입 {formatKRW(r.totalInvested)} →&nbsp;
                        <strong>{formatKRW(r.finalValue)}</strong>
                      </div>
                    </div>
                    <div className="strategy-return">
                      <div className={`return-pct ${r.totalReturn >= 0 ? "pos" : "neg"}`}>
                        {formatPct(r.totalReturn)}
                      </div>
                      {delta !== null
                        ? <div className={`vs-benchmark ${delta >= 0 ? "pos" : "neg"}`}>
                            매일 적립 대비 {delta >= 0 ? "+" : ""}{(delta * 100).toFixed(1)}%p
                          </div>
                        : <div className="cagr">연 {formatPct(r.cagr)}</div>
                      }
                    </div>
                  </div>
                  </React.Fragment>
                );
              })}
            </div>
          )}

          {results.list[0] && (
            <button className="ssheet-trigger" onClick={() => setShowShare(true)}>
              📤 결과 공유하기
            </button>
          )}

          <AdBanner className="ad-banner-results" />

          <StrategyGuide monthlyAmount={monthlyAmount} />

          {!basic && (
            <div className="upgrade-banner">
              <span>광고 지겨우세요? 베이직에서 광고 없이 무제한으로</span>
              <button className="btn-primary" onClick={() => setShowUpgrade(true)}>
                월 1,980원
              </button>
            </div>
          )}
        </div>
      )}

      {showQueryGate && (
        <QueryGateModal
          onClose={() => setShowQueryGate(false)}
          onEarned={() => (gateActionRef.current === "lump" ? handleLumpUnlock(gateLumpYearsRef.current) : handleReveal())}
          onUpgrade={() => setShowUpgrade(true)}
        />
      )}
      {onNavigate && (
        <button className="cross-link" onClick={() => onNavigate("dividend", "ranking")}>
          <span className="cross-link-icon">💰</span>
          <div className="cross-link-text">
            <strong>배당 투자도 확인해보세요</strong>
            <span>배당 랭킹, 월배당 캘린더, 은퇴 계산기까지</span>
          </div>
          <span className="cross-link-arrow">→</span>
        </button>
      )}

      {!results && <AdBanner className="ad-banner-results" />}
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
      {showShare && results?.list?.[0] && (
        <ShareSheet
          text={makeSimShareText(ticker, results.list[0], monthlyAmount)}
          card={{
            title: `${getTickerName(ticker)} · 월 ${(monthlyAmount / 10000).toFixed(0)}만원 적립`,
            period: `${Math.round(results.list[0].years)}년`,
            invested: results.list[0].totalInvested,
            finalValue: results.list[0].finalValue,
            returnPct: results.list[0].totalReturn,
            mdd: results.list[0].mdd,
            series: results.list[0].portfolioValues.map((v) => v.value),
            strategies: revealed
              ? [`${getTickerName(ticker)} · ${STRATEGY_LABELS[results.list[0].strategy]}`]
              : undefined,
          }}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
