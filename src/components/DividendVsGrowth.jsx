import { useState, useEffect, useMemo, useCallback } from "react";
import { loadDividendMeta, loadRawPrices, getCategoryLabel, getCategoryColor, formatKRW } from "../utils/dividendData.js";
import { consumeQuery, getQueryBalance, isBasic } from "../utils/premium.js";
import { logClick, logScreen } from "../utils/analytics.js";
import QueryGateModal from "./QueryGateModal.jsx";
import UpgradeModal from "./UpgradeModal.jsx";
import ShareSheet from "./ShareSheet.jsx";
import AdBanner from "./AdBanner.jsx";
import LineChart from "./LineChart.jsx";

const KRW_USD = 1380;
const TX_FEE = 0.0035;

const GROWTH_TICKERS = [
  { ticker: "SPY", name: "S&P500 ETF" },
  { ticker: "QQQ", name: "나스닥100 ETF" },
];

const AMOUNTS = [
  { label: "30만원", value: 300000 },
  { label: "50만원", value: 500000 },
  { label: "100만원", value: 1000000 },
];

const PERIODS = [
  { label: "3년", years: 3 },
  { label: "5년", years: 5 },
  { label: "10년", years: 10 },
];

async function simPriceOnly(ticker, monthlyKRW, startDate, endDate) {
  const prices = await loadRawPrices(ticker);
  const start = startDate.toISOString().slice(0, 10);
  const end = endDate.toISOString().slice(0, 10);
  const filtered = prices.filter((p) => p.date >= start && p.date <= end);
  if (filtered.length < 2) return null;

  const monthlyUSD = monthlyKRW / KRW_USD;
  let shares = 0;
  let invested = 0;
  let lastMonth = "";
  const values = [];

  for (const p of filtered) {
    const ym = p.date.slice(0, 7);
    if (ym !== lastMonth && p.close > 0) {
      const net = monthlyUSD * (1 - TX_FEE);
      shares += net / p.close;
      invested += monthlyKRW;
      lastMonth = ym;
    }
    values.push({
      date: p.date,
      value: shares * p.close * KRW_USD,
      invested,
    });
  }

  const last = values.at(-1);
  return {
    ticker,
    finalValue: last.value,
    totalInvested: last.invested,
    totalReturn: last.invested > 0 ? last.value / last.invested - 1 : 0,
    values,
  };
}

export default function DividendVsGrowth({ onCoinsChanged, onNavigate }) {
  const [meta, setMeta] = useState(null);
  const [divTicker, setDivTicker] = useState("");
  const [growthTicker, setGrowthTicker] = useState("SPY");
  const [amount, setAmount] = useState(500000);
  const [periodYears, setPeriodYears] = useState(5);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showGate, setShowGate] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [revealed, setRevealed] = useState(isBasic());

  useEffect(() => { loadDividendMeta().then(setMeta); }, []);

  const divTickers = useMemo(() => {
    if (!meta) return [];
    return Object.values(meta)
      .filter((t) => t.category !== "korean")
      .sort((a, b) => (b.currentYield ?? 0) - (a.currentYield ?? 0));
  }, [meta]);

  const filtered = useMemo(() => {
    if (!search.trim()) return divTickers;
    const q = search.toLowerCase();
    return divTickers.filter((t) => t.ticker.toLowerCase().includes(q) || t.name.toLowerCase().includes(q));
  }, [divTickers, search]);

  const selectedDiv = meta?.[divTicker];

  const handleRun = useCallback(async () => {
    if (!divTicker || !meta?.[divTicker]) return;
    logClick("vs_run", { divTicker, growthTicker, amount, periodYears });

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const end = new Date();
      const start = new Date();
      start.setFullYear(end.getFullYear() - periodYears);

      const [divResult, growthResult] = await Promise.all([
        simPriceOnly(divTicker, amount, start, end),
        simPriceOnly(growthTicker, amount, start, end),
      ]);

      if (!divResult || !growthResult) {
        setError("해당 기간의 데이터가 부족합니다.");
      } else {
        const divMeta = meta[divTicker];
        const ttm = divMeta?.ttmDividend ?? 0;
        const divShares = divResult.values.at(-1).value / (KRW_USD * (divMeta?.latestPrice ?? 1));
        const annualDivKRW = ttm * divShares * KRW_USD;

        setResult({
          div: { ...divResult, name: divMeta?.name, yield: divMeta?.currentYield, annualDivKRW },
          growth: { ...growthResult, name: GROWTH_TICKERS.find((g) => g.ticker === growthTicker)?.name },
        });
        logScreen("vs_result");
      }
    } catch {
      setError("비교 시뮬레이션 중 오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  }, [divTicker, growthTicker, amount, periodYears, meta, onCoinsChanged]);

  const chartData = useMemo(() => {
    if (!result) return null;
    const divV = result.div.values;
    const growV = result.growth.values;
    const dateSet = new Set([...divV.map((v) => v.date), ...growV.map((v) => v.date)]);
    const dates = [...dateSet].sort();
    const step = Math.max(1, Math.floor(dates.length / 100));
    const sampled = dates.filter((_, i) => i % step === 0 || i === dates.length - 1);

    const divMap = {};
    divV.forEach((v) => { divMap[v.date] = v.value; });
    const growMap = {};
    growV.forEach((v) => { growMap[v.date] = v.value; });

    let lastDiv = 0, lastGrow = 0;

    return {
      labels: sampled,
      datasets: [
        {
          label: `${result.div.ticker} (배당주)`,
          data: sampled.map((d) => { lastDiv = divMap[d] ?? lastDiv; return lastDiv; }),
          borderColor: "#16A34A",
          backgroundColor: "rgba(22,163,74,0.08)",
          fill: true,
          tension: 0.3,
          pointRadius: 0,
        },
        {
          label: `${result.growth.ticker} (성장주)`,
          data: sampled.map((d) => { lastGrow = growMap[d] ?? lastGrow; return lastGrow; }),
          borderColor: "#3B82F6",
          backgroundColor: "rgba(59,130,246,0.08)",
          fill: true,
          tension: 0.3,
          pointRadius: 0,
        },
      ],
    };
  }, [result]);

  if (!meta) return <div className="loading-msg">배당 데이터 로딩 중...</div>;

  return (
    <div className="page vs-page">
      <div className="page-header">
        <h1 className="page-title">배당 vs 성장</h1>
        <p className="page-subtitle">같은 조건에서 배당주와 성장주, 어디가 유리할까?</p>
      </div>

      {/* Dividend ticker */}
      <div className="sim-section">
        <div className="sim-label">배당주 선택</div>
        <button className="sim-picker-btn" onClick={() => setPickerOpen(true)}>
          {selectedDiv ? (
            <span className="sim-picker-selected">
              <strong>{selectedDiv.ticker}</strong>
              <span className="sim-picker-name">{selectedDiv.name}</span>
              <span className="sim-picker-yield" style={{ color: "#16A34A" }}>
                {((selectedDiv.currentYield ?? 0) * 100).toFixed(2)}%
              </span>
            </span>
          ) : (
            <span className="sim-picker-placeholder">배당주를 선택하세요</span>
          )}
          <span className="sim-picker-arrow">▾</span>
        </button>
      </div>

      {/* Growth ticker */}
      <div className="sim-section">
        <div className="sim-label">성장주 비교 대상</div>
        <div className="sim-chips">
          {GROWTH_TICKERS.map((g) => (
            <button
              key={g.ticker}
              className={`chip${growthTicker === g.ticker ? " active" : ""}`}
              onClick={() => setGrowthTicker(g.ticker)}
              style={growthTicker === g.ticker ? { background: "#3B82F6", borderColor: "#3B82F6" } : {}}
            >
              {g.ticker} ({g.name})
            </button>
          ))}
        </div>
      </div>

      {/* Amount */}
      <div className="sim-section">
        <div className="sim-label">월 적립금</div>
        <div className="sim-chips">
          {AMOUNTS.map((a) => (
            <button key={a.value} className={`chip${amount === a.value ? " active" : ""}`} onClick={() => setAmount(a.value)}>
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
            <button key={p.years} className={`chip${periodYears === p.years ? " active" : ""}`} onClick={() => setPeriodYears(p.years)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Investment approach explanation */}
      <div className="vs-explainer">
        <div className="vs-explainer-card">
          <div className="vs-explainer-icon">💰</div>
          <div className="vs-explainer-title">배당 투자</div>
          <div className="vs-explainer-desc">기업 이익의 일부를 배당금으로 정기 수령하는 전략이에요. 주가 변동과 무관한 현금 흐름을 만들 수 있고, DRIP(배당 재투자)로 복리 효과를 극대화해요.</div>
        </div>
        <div className="vs-explainer-card">
          <div className="vs-explainer-icon">📈</div>
          <div className="vs-explainer-title">성장 투자</div>
          <div className="vs-explainer-desc">S&P500, 나스닥100 같은 시장 지수를 추종하며 주가 상승(자본 이득)에 집중하는 전략이에요. 장기적으로 높은 수익률을 기대할 수 있지만 변동성이 더 커요.</div>
        </div>
      </div>

      {/* Run */}
      <div className="sim-section" style={{ padding: "0 16px" }}>
        <button className="btn-primary sim-run-btn" onClick={handleRun} disabled={!divTicker || loading}>
          {loading ? "비교 중..." : (
            "비교 시뮬레이션 시작"
          )}
        </button>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {/* Results */}
      {result && (
        <div className="vs-results">
          <h2 className="section-title">비교 결과</h2>

          {/* Side by side cards */}
          <div className="vs-compare">
            <div className="vs-card div-card">
              <div className="vs-card-tag">배당주</div>
              <div className="vs-card-ticker">{result.div.ticker}</div>
              <div className="vs-card-name">{result.div.name}</div>
              <div className="vs-card-value">{formatKRW(result.div.finalValue)}</div>
              <div className={`vs-card-return ${result.div.totalReturn >= 0 ? "pos" : "neg"}`}>
                {result.div.totalReturn >= 0 ? "+" : ""}{(result.div.totalReturn * 100).toFixed(1)}%
              </div>
              <div className="vs-card-extra">
                배당률 {((result.div.yield ?? 0) * 100).toFixed(2)}%
              </div>
              <div className="vs-card-extra">
                연 배당금 {formatKRW(result.div.annualDivKRW)}
              </div>
            </div>
            <div className="vs-card growth-card">
              <div className="vs-card-tag">성장주</div>
              <div className="vs-card-ticker">{result.growth.ticker}</div>
              <div className="vs-card-name">{result.growth.name}</div>
              <div className="vs-card-value">{formatKRW(result.growth.finalValue)}</div>
              <div className={`vs-card-return ${result.growth.totalReturn >= 0 ? "pos" : "neg"}`}>
                {result.growth.totalReturn >= 0 ? "+" : ""}{(result.growth.totalReturn * 100).toFixed(1)}%
              </div>
              <div className="vs-card-extra">자본 이득 중심</div>
              <div className="vs-card-extra">배당 수입 적음</div>
            </div>
          </div>

          {/* Winner banner */}
          <div className="vs-winner">
            {result.div.finalValue > result.growth.finalValue ? (
              <>배당주 <strong>{result.div.ticker}</strong>가 {formatKRW(result.div.finalValue - result.growth.finalValue)} 더 유리했어요</>
            ) : result.growth.finalValue > result.div.finalValue ? (
              <>성장주 <strong>{result.growth.ticker}</strong>가 {formatKRW(result.growth.finalValue - result.div.finalValue)} 더 유리했어요</>
            ) : (
              <>두 전략의 결과가 비슷해요</>
            )}
          </div>

          <AdBanner className="ad-banner-inline" />

          {/* Chart + insight - gated */}
          <div className={revealed ? "" : "div-gated"}>
          {chartData && (
            <div className="sim-chart-wrap">
              <LineChart labels={chartData.labels} datasets={chartData.datasets} />
            </div>
          )}

          <div className="vs-insight">
            <div className="vs-insight-title">인사이트</div>
            <p>배당주는 하락장에서 배당금이 쿠션 역할을 하고, 성장주는 상승장에서 자본이득이 더 큽니다.</p>
            <p>두 전략을 섞으면 안정성과 성장성을 동시에 추구할 수 있어요.</p>
          </div>
          </div>
          {!revealed && (
            <div className="reveal-cta">
              <p className="reveal-hint">상세 차트와 분석을 보려면 코인 1개가 필요해요</p>
              <button className="btn-primary reveal-btn" onClick={() => {
                if (isBasic()) { setRevealed(true); return; }
                if (getQueryBalance() <= 0) { setShowGate(true); return; }
                if (!consumeQuery()) { setShowGate(true); return; }
                onCoinsChanged?.();
                setRevealed(true);
              }}>
                🔓 상세 분석 보기 {!isBasic() && "(코인 1개)"}
              </button>
              {!isBasic() && <p className="reveal-balance">남은 코인 {getQueryBalance()}개</p>}
            </div>
          )}

          <button className="ssheet-trigger" onClick={() => setShowShare(true)}>
            📤 비교 결과 공유하기
          </button>

          <div className="sim-fee-notice">
            주가 수익률만 반영 · 배당금 재투자 미포함 · 거래 비용 0.35% 반영
          </div>

          <AdBanner slot="vs-result" />
        </div>
      )}

      {/* Picker */}
      {pickerOpen && (
        <div className="modal-overlay" onClick={() => setPickerOpen(false)}>
          <div className="modal-card sim-picker-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sim-picker-header">
              <h3>배당주 선택</h3>
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
                  className={`sim-picker-item${divTicker === t.ticker ? " active" : ""}`}
                  onClick={() => { setDivTicker(t.ticker); setPickerOpen(false); setSearch(""); }}
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
            </div>
          </div>
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
          text={`⚔️ 배당 vs 성장 비교 (${periodYears}년)\n${result.div.ticker}(배당) ${formatKRW(result.div.finalValue)} (${result.div.totalReturn >= 0 ? "+" : ""}${(result.div.totalReturn * 100).toFixed(1)}%)\n${result.growth.ticker}(성장) ${formatKRW(result.growth.finalValue)} (${result.growth.totalReturn >= 0 ? "+" : ""}${(result.growth.totalReturn * 100).toFixed(1)}%)\n${result.div.finalValue > result.growth.finalValue ? `배당주 ${result.div.ticker}` : `성장주 ${result.growth.ticker}`}가 ${formatKRW(Math.abs(result.div.finalValue - result.growth.finalValue))} 더 유리!`}
          card={{
            title: `${result.div.ticker} vs ${result.growth.ticker} ${periodYears}년 비교`,
            subtitle: `월 ${formatKRW(amount)} 적립 · 거래 비용 0.35% 반영`,
            stats: [
              { label: `${result.div.ticker}(배당)`, value: formatKRW(result.div.finalValue), color: "#4ade80" },
              { label: `${result.growth.ticker}(성장)`, value: formatKRW(result.growth.finalValue), color: "#60a5fa" },
              { label: "차이", value: formatKRW(Math.abs(result.div.finalValue - result.growth.finalValue)), color: "#ffd54a" },
            ],
            series: [
              result.div.values.filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 60)) === 0 || i === a.length - 1).map((v) => v.value),
              result.growth.values.filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 60)) === 0 || i === a.length - 1).map((v) => v.value),
            ],
            seriesColors: ["#4ade80", "#3B82F6"],
          }}
          onClose={() => setShowShare(false)}
        />
      )}

      {onNavigate && (
        <button className="cross-link" onClick={() => onNavigate("accumulation", "strategy")}>
          <span className="cross-link-icon">📈</span>
          <div className="cross-link-text">
            <strong>적립 전략별 수익률 비교하기</strong>
            <span>여러 적립 전략으로 더 자세히 분석해요</span>
          </div>
          <span className="cross-link-arrow">→</span>
        </button>
      )}
    </div>
  );
}
