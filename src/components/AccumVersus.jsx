import { useState, useCallback } from "react";
import TickerSearch from "./TickerSearch.jsx";
import LineChart from "./LineChart.jsx";
import QueryGateModal from "./QueryGateModal.jsx";
import UpgradeModal from "./UpgradeModal.jsx";
import AdBanner from "./AdBanner.jsx";
import { loadPrices } from "../utils/dataLoader.js";
import { runStrategy, formatKRW, formatPct } from "../utils/calculator.js";
import { isKrTicker, TICKER_LABELS } from "../utils/tickers.js";
import { isBasic, consumeQuery, getQueryBalance } from "../utils/premium.js";
import { logClick } from "../utils/analytics.js";

const PERIODS = [3, 5, 10];
const MONTHLY = 300000;

function disp(t) {
  const nm = TICKER_LABELS[t];
  return isKrTicker(t) && nm ? nm : t;
}

export default function AccumVersus({ onOpenDetail, onCoinsChanged }) {
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  const [years, setYears] = useState(5);
  const [picking, setPicking] = useState(null); // "a" | "b" | null
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [revealed, setRevealed] = useState(isBasic());
  const [showGate, setShowGate] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const basic = isBasic();

  const run = useCallback(async () => {
    if (!a || !b || a === b) return;
    setLoading(true); setResult(null); setError(null); setRevealed(basic);
    try {
      const [pa, pb] = await Promise.all([loadPrices(a), loadPrices(b)]);
      if (!pa?.length || !pb?.length) { setError("데이터를 불러올 수 없어요"); setLoading(false); return; }
      const now = new Date();
      const target = new Date(now); target.setFullYear(target.getFullYear() - years);
      // 공정 비교: 둘 다 데이터가 있는 공통 시작일
      const start = new Date(Math.max(target.getTime(), pa[0].date.getTime(), pb[0].date.getTime()));
      const ra = runStrategy(pa, "daily", MONTHLY, start, now);
      const rb = runStrategy(pb, "daily", MONTHLY, start, now);
      if (!ra || !rb) { setError("비교할 만한 기간의 데이터가 부족해요"); setLoading(false); return; }
      setResult({ ra, rb });
      logClick("versus_run", { a, b, years });
    } catch {
      setError("데이터를 불러올 수 없어요");
    }
    setLoading(false);
  }, [a, b, years, basic]);

  function handleReveal() {
    if (basic) { setRevealed(true); return; }
    if (getQueryBalance() <= 0 || !consumeQuery()) { setShowGate(true); return; }
    onCoinsChanged?.();
    setRevealed(true);
    logClick("versus_reveal", { a, b });
  }

  function pick(ticker) {
    if (picking === "a") setA(ticker);
    else if (picking === "b") setB(ticker);
    setPicking(null);
    setResult(null);
  }

  const winner = result ? (result.ra.totalReturn >= result.rb.totalReturn ? "a" : "b") : null;
  const chart = result && (() => {
    const { ra, rb } = result;
    const n = Math.min(ra.portfolioValues.length, rb.portfolioValues.length);
    const toPct = (pv) => pv.slice(0, n).map((d) => (d.invested > 0 ? (d.value / d.invested - 1) * 100 : 0));
    return {
      labels: ra.portfolioValues.slice(0, n).map((d) => d.date),
      datasets: [
        { label: disp(a), data: toPct(ra.portfolioValues), borderColor: "#E53E3E", backgroundColor: "transparent", fill: false, tension: 0.3, pointRadius: 0 },
        { label: disp(b), data: toPct(rb.portfolioValues), borderColor: "#3182F6", backgroundColor: "transparent", fill: false, tension: 0.3, pointRadius: 0 },
      ],
    };
  })();

  return (
    <div className="vs">
      <p className="vs-sub">두 종목을 <strong>매일 적립</strong>했다면 누가 이겼을까? ⚔️</p>

      {/* 종목 선택 */}
      <div className="vs-slots">
        <button className={`vs-slot a${a ? " filled" : ""}`} onClick={() => setPicking("a")}>
          {a ? <><span className="vs-slot-sym">{a}</span><span className="vs-slot-name">{disp(a) !== a ? disp(a) : ""}</span></> : <span className="vs-slot-add">+ 종목 A</span>}
        </button>
        <span className="vs-mark">VS</span>
        <button className={`vs-slot b${b ? " filled" : ""}`} onClick={() => setPicking("b")}>
          {b ? <><span className="vs-slot-sym">{b}</span><span className="vs-slot-name">{disp(b) !== b ? disp(b) : ""}</span></> : <span className="vs-slot-add">+ 종목 B</span>}
        </button>
      </div>

      {/* 기간 */}
      <div className="vs-periods">
        {PERIODS.map((y) => (
          <button key={y} className={`vs-period${years === y ? " active" : ""}`} onClick={() => { setYears(y); setResult(null); }}>
            {y}년
          </button>
        ))}
      </div>

      <button className="btn-primary vs-run" onClick={run} disabled={!a || !b || a === b || loading}>
        {loading ? "대결 중..." : a === b && a ? "다른 종목을 골라주세요" : "⚔️ 대결 시작"}
      </button>

      {error && <p className="error-msg">{error}</p>}

      {/* 결과 */}
      {result && (
        <div className="vs-result">
          {revealed && chart && (
            <>
              <div className="vs-winner">
                🏆 <strong>{disp(winner === "a" ? a : b)}</strong> 승리
                <span className="vs-margin">
                  {Math.abs((result.ra.totalReturn - result.rb.totalReturn) * 100).toFixed(1)}%p 앞섬
                </span>
              </div>
              <p className="vs-basis">매일 적립 · 최근 {Math.round(result.ra.years)}년 기준</p>
              <LineChart labels={chart.labels} datasets={chart.datasets} yType="pct" />
              <div className="vs-stats">
                {[["a", a, result.ra, "#E53E3E"], ["b", b, result.rb, "#3182F6"]].map(([k, t, r, c]) => (
                  <button
                    key={k}
                    className={`vs-stat${winner === k ? " win" : ""}`}
                    onClick={() => onOpenDetail?.(t, "acc")}
                  >
                    <span className="vs-stat-dot" style={{ background: c }} />
                    <span className="vs-stat-sym">{disp(t)}</span>
                    <span className={`vs-stat-ret ${r.totalReturn >= 0 ? "pos" : "neg"}`}>{formatPct(r.totalReturn)}</span>
                    <span className="vs-stat-meta">{formatKRW(r.totalInvested)} → {formatKRW(r.finalValue)}</span>
                  </button>
                ))}
              </div>
              <button className="vs-again" onClick={() => { setA(null); setB(null); setResult(null); }}>다시 대결하기</button>
            </>
          )}

          {!revealed && (
            <div className="vs-teaser">
              <div className="vs-teaser-vs">
                <span>{disp(a)}</span><span className="vs-teaser-mark">VS</span><span>{disp(b)}</span>
              </div>
              <p className="vs-teaser-hint">누가 이겼을까요? 승자와 수익률 격차를 확인해보세요</p>
              <button className="btn-primary vs-reveal" onClick={handleReveal}>
                🔓 결과 보기 {!basic && <span className="vs-cost">🪙 1</span>}
              </button>
              {!basic && <p className="vs-balance">남은 코인 {getQueryBalance()}개 · 광고 시청 시 +2개</p>}
            </div>
          )}
        </div>
      )}

      <AdBanner className="ad-banner-inline" />

      <div className="trade-disclaimer">
        ⚠️ 매일 적립 총수익률 기준 · 과거 데이터이며 특정 종목의 매매를 권유하지 않습니다.
      </div>

      {/* 종목 선택 모달 */}
      {picking && (
        <div className="pf-overlay" onClick={() => setPicking(null)}>
          <div className="pf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pf-modal-header">
              <h3>종목 {picking === "a" ? "A" : "B"} 선택</h3>
              <button className="pf-modal-close" onClick={() => setPicking(null)}>×</button>
            </div>
            <TickerSearch onSelect={pick} compact />
          </div>
        </div>
      )}

      {showGate && (
        <QueryGateModal
          onClose={() => setShowGate(false)}
          onEarned={handleReveal}
          onUpgrade={() => { setShowGate(false); setShowUpgrade(true); }}
        />
      )}
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}
