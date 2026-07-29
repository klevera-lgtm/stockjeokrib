import { useState, useEffect, useRef } from "react";
import { loadPrices } from "../utils/dataLoader.js";
import {
  runStrategy,
  ALL_STRATEGIES,
  STRATEGY_LABELS,
  formatPct,
} from "../utils/calculator.js";
import { consumeQueries, isBasic, getQueryBalance } from "../utils/premium.js";
import { logClick } from "../utils/analytics.js";
import QueryGateModal from "./QueryGateModal.jsx";

const COST = 5;
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const TOTAL_STRATEGIES = ALL_STRATEGIES.length;

export default function StrategyScorecard({
  tickers,
  weights,
  monthlyAmount,
  has10yr,
  onNeedUpgrade,
}) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [showGate, setShowGate] = useState(false);
  const resultRef = useRef(null);
  const basic = isBasic();

  useEffect(() => {
    if (results) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [results]);

  async function run() {
    if (!has10yr) return;
    logClick("scorecard_run", { assets: tickers.length });

    if (!basic && !consumeQueries(COST)) {
      setShowGate(true);
      return;
    }

    setLoading(true);
    setResults(null);
    setLoadingMsg("가격 데이터 불러오는 중...");
    await new Promise((r) => setTimeout(r, 30));

    try {
      const allPrices = {};
      await Promise.all(
        tickers.map(async (t) => { allPrices[t] = await loadPrices(t); })
      );

      const periodResults = [];

      for (const years of PERIODS) {
        setLoadingMsg(`${years}년 기간 분석 중... (${years}/10)`);
        await new Promise((r) => setTimeout(r, 10));

        const endDate = new Date();
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - years);

        const strategyReturns = ALL_STRATEGIES.map((strategy) => {
          let totalInvested = 0;
          let finalValue = 0;

          tickers.forEach((t) => {
            const pct = (weights[t] ?? 0) / 100;
            const result = runStrategy(
              allPrices[t],
              strategy,
              monthlyAmount * pct,
              startDate,
              endDate
            );
            if (result) {
              totalInvested += result.totalInvested;
              finalValue += result.finalValue;
            }
          });

          const totalReturn = totalInvested > 0
            ? (finalValue - totalInvested) / totalInvested
            : 0;
          return { strategy, totalReturn };
        });

        strategyReturns.sort((a, b) => b.totalReturn - a.totalReturn);
        const ranked = strategyReturns.map((s, i) => ({
          ...s,
          rank: i + 1,
          score: TOTAL_STRATEGIES - i,
        }));

        periodResults.push({ years, ranked });
      }

      const scoreMap = {};
      const winsMap = {};
      ALL_STRATEGIES.forEach((s) => { scoreMap[s] = 0; winsMap[s] = 0; });

      const detailMap = {};
      ALL_STRATEGIES.forEach((s) => { detailMap[s] = []; });

      periodResults.forEach(({ years, ranked }) => {
        ranked.forEach((r) => {
          scoreMap[r.strategy] += r.score;
          if (r.rank === 1) winsMap[r.strategy]++;
          detailMap[r.strategy].push({
            years,
            rank: r.rank,
            score: r.score,
            totalReturn: r.totalReturn,
          });
        });
      });

      const maxScore = TOTAL_STRATEGIES * PERIODS.length;
      const finalRanking = ALL_STRATEGIES
        .map((s) => ({
          strategy: s,
          totalScore: scoreMap[s],
          maxScore,
          wins: winsMap[s],
          details: detailMap[s],
        }))
        .sort((a, b) => b.totalScore - a.totalScore)
        .map((s, i) => ({ ...s, rank: i + 1 }));

      setResults(finalRanking);
      setExpanded(finalRanking.length > 0 ? finalRanking[0].strategy : null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  }

  if (!has10yr) return null;

  return (
    <>
      {!results && !loading && (
        <button className="btn-scorecard" onClick={run} disabled={loading}>
          <span className="scorecard-icon">🏅</span>
          <span className="scorecard-text">
            <strong>전략 종합 성적표 (1~10년)</strong>
            <span className="scorecard-desc">
              10개 기간에 걸쳐 가장 꾸준한 전략을 찾아요
            </span>
          </span>
          {!basic && <span className="scorecard-cost">코인 {COST}개</span>}
        </button>
      )}

      {loading && (
        <>
          <div className="loading-sheet-backdrop" />
          <div className="loading-sheet">
            <p className="loading-sheet-step">전략 종합 성적표</p>
            <p className="loading-sheet-title">{loadingMsg || "분석 중..."}</p>
            <div className="loading-sheet-bar">
              <div className="loading-sheet-bar-fill" />
            </div>
            <p className="loading-sheet-hint">14개 전략 × 10개 기간 = 140회 시뮬레이션</p>
          </div>
        </>
      )}

      {results && (
        <div className="scorecard-results" ref={resultRef}>
          <h2 className="section-title">
            🏅 전략 종합 성적표
            <span className="period-label">최근 1~10년</span>
          </h2>

          <div className="scorecard-method">
            <p className="scorecard-method-title">📊 선정 방법</p>
            <p className="scorecard-method-body">
              최근 1년부터 10년까지 <strong>10개 기간</strong>에서 {TOTAL_STRATEGIES}개 전략의
              수익률을 각각 계산하고, 기간마다 순위를 매겨{" "}
              <strong>1위={TOTAL_STRATEGIES}점 ~ {TOTAL_STRATEGIES}위=1점</strong>으로
              환산한 뒤 합산한 종합 점수예요.
            </p>
            <p className="scorecard-method-body">
              만점은 <strong>{results[0]?.maxScore}점</strong> (모든 기간 1위).
              점수가 높을수록 단기·장기 모두 꾸준히 좋은 전략이에요.
            </p>
          </div>

          <div className="scorecard-list">
            {results.map((r) => {
              const isOpen = expanded === r.strategy;
              const pctScore = ((r.totalScore / r.maxScore) * 100).toFixed(0);
              return (
                <div key={r.strategy} className={`scorecard-row${r.rank <= 3 ? " top" : ""}`}>
                  <div
                    className="scorecard-row-main"
                    onClick={() => setExpanded(isOpen ? null : r.strategy)}
                  >
                    <span className="scorecard-rank">
                      {r.rank <= 3
                        ? ["🥇", "🥈", "🥉"][r.rank - 1]
                        : r.rank}
                    </span>
                    <span className="scorecard-name">
                      {STRATEGY_LABELS[r.strategy]}
                    </span>
                    <span className="scorecard-score-wrap">
                      <span className="scorecard-total">{r.totalScore}점</span>
                      <span className="scorecard-pct">{pctScore}%</span>
                    </span>
                    {r.wins > 0 && (
                      <span className="scorecard-wins">👑×{r.wins}</span>
                    )}
                    <span className="scorecard-chevron">{isOpen ? "▲" : "▼"}</span>
                  </div>

                  {isOpen && (
                    <div className="scorecard-detail">
                      <div className="scorecard-detail-header">
                        <span>기간</span>
                        <span>순위</span>
                        <span>수익률</span>
                        <span>점수</span>
                      </div>
                      {r.details.map((d) => (
                        <div key={d.years} className="scorecard-detail-row">
                          <span>최근 {d.years}년</span>
                          <span className={d.rank <= 3 ? "pos" : ""}>
                            {d.rank}위
                          </span>
                          <span className={d.totalReturn >= 0 ? "pos" : "neg"}>
                            {formatPct(d.totalReturn)}
                          </span>
                          <span>{d.score}점</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showGate && (
        <QueryGateModal
          onClose={() => setShowGate(false)}
          onEarned={run}
          onUpgrade={() => { setShowGate(false); onNeedUpgrade?.(); }}
        />
      )}
    </>
  );
}
