import { useState, useCallback, useEffect } from "react";
import { loadPrices } from "../utils/dataLoader.js";
import { runStrategy, formatKRW, formatPct } from "../utils/calculator.js";
import { isBasic, consumeQuery, getQueryBalance } from "../utils/premium.js";
import { getTickerLabel } from "../utils/tickers.js";
import TickerSearch from "./TickerSearch.jsx";
import LineChart from "./LineChart.jsx";
import UpgradeModal from "./UpgradeModal.jsx";
import QueryGateModal from "./QueryGateModal.jsx";
import ShareButton from "./ShareButton.jsx";
import { APP_LINK } from "../utils/share.js";
import AdBanner from "./AdBanner.jsx";

const EVENTS = [
  { id: "dotcom",   label: "닷컴버블 붕괴",   date: "2000-03-01", desc: "나스닥 -78% 폭락" },
  { id: "gfc",      label: "금융위기",         date: "2008-09-01", desc: "리먼 브라더스 파산" },
  { id: "china",    label: "차이나 쇼크",      date: "2015-08-01", desc: "상하이증시 버블 붕괴" },
  { id: "uschina",  label: "미중 무역전쟁",    date: "2018-03-01", desc: "트럼프 관세폭탄 1차" },
  { id: "dec2018",  label: "2018 연말 폭락",   date: "2018-12-01", desc: "S&P500 한 달 -20%" },
  { id: "covid",    label: "코로나 폭락",      date: "2020-03-01", desc: "S&P500 한 달 만에 -34%" },
  { id: "covidV",   label: "코로나 반등",      date: "2020-04-01", desc: "역대급 V자 반등 시작" },
  { id: "meme",     label: "밈주식 열풍",      date: "2021-01-01", desc: "게임스톱·AMC 광풍" },
  { id: "rate",     label: "금리 인상 시작",   date: "2022-01-01", desc: "연준 긴축 사이클 시작" },
  { id: "ruwu",     label: "러우 전쟁",        date: "2022-02-01", desc: "러시아 우크라이나 침공" },
  { id: "chatgpt",  label: "ChatGPT 출시",     date: "2022-11-01", desc: "AI 시대의 시작" },
  { id: "svb",      label: "SVB 파산",         date: "2023-03-01", desc: "실리콘밸리은행 뱅크런" },
  { id: "aiboom",   label: "AI 붐",            date: "2023-01-01", desc: "엔비디아·AI 주도 랠리" },
  { id: "trump24",  label: "트럼프 재당선",    date: "2024-11-01", desc: "트럼프 트레이드 시작" },
  { id: "tariff",   label: "관세 쇼크",        date: "2025-04-01", desc: "미국 상호관세 발표" },
];

function formatReturn(pct) {
  if (pct >= 1000) return `+${Math.round(pct).toLocaleString()}%`;
  return `+${pct.toFixed(1)}%`;
}

export default function EventExplorer() {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [ticker, setTicker] = useState(null);
  const [monthlyAmount, setMonthlyAmount] = useState(300000);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showQueryGate, setShowQueryGate] = useState(false);
  const [gainersData, setGainersData] = useState(null);
  const [gainersRevealed, setGainersRevealed] = useState(isBasic());
  const [showGainersQueryGate, setShowGainersQueryGate] = useState(false);
  const [gainersRemaining, setGainersRemaining] = useState(getQueryBalance());

  useEffect(() => {
    fetch("/eventGainers.json")
      .then((r) => r.json())
      .then(setGainersData)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setGainersRevealed(isBasic());
    setGainersRemaining(getQueryBalance());
  }, [selectedEvent?.id]);

  function handleGainersReveal() {
    if (isBasic()) { setGainersRevealed(true); return; }
    if (consumeQuery()) {
      setGainersRevealed(true);
      setGainersRemaining(getQueryBalance());
    } else {
      setShowGainersQueryGate(true);
    }
  }

  const run = useCallback(async () => {
    if (!selectedEvent || !ticker) return;
    if (!consumeQuery()) { setShowQueryGate(true); return; }
    setLoading(true);
    setError(null);
    try {
      const prices = await loadPrices(ticker);
      const startDate = new Date(selectedEvent.date);
      const endDate = new Date();
      const r = runStrategy(prices, "monthly-first", monthlyAmount, startDate, endDate);
      if (!r) throw new Error("해당 기간 데이터가 없습니다.");
      setResult({ ...r, event: selectedEvent });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedEvent, ticker, monthlyAmount]);

  const topGainers = selectedEvent
    ? (gainersData?.events[selectedEvent.id]?.topGainers ?? [])
    : [];

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">이벤트 탐색</h1>
        <p className="page-subtitle">역사적 이벤트 직후 적립식 투자 결과를 시뮬레이션해요</p>
      </div>

      <div className="form-section">
        <label className="form-label">이벤트 선택</label>
        <div className="event-grid">
          {EVENTS.map((ev) => (
            <button
              key={ev.id}
              className={`event-card${selectedEvent?.id === ev.id ? " selected" : ""}`}
              onClick={() => {
                setSelectedEvent(ev);
                setTicker(null);
                setResult(null);
                setError(null);
              }}
            >
              <div className="event-label">{ev.label}</div>
              <div className="event-date">{ev.date.slice(0, 7)}</div>
              <div className="event-desc">{ev.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {selectedEvent && topGainers.length > 0 && (
        <div className="gainers-section">
          <div className="gainers-header">
            <span className="gainers-event-tag">{selectedEvent.label}</span>
            <span className="gainers-title">이후 주가 상승 TOP 10</span>
          </div>
          <p className="gainers-note">
            {selectedEvent.date.slice(0, 7)} 기준 · 단순 주가 수익률
          </p>
          <div className="gainers-list">
            {topGainers.map((g, i) => (
              <div key={g.ticker} className="gainer-row">
                <span className="gainer-rank">{i + 1}</span>
                <span className={`gainer-ticker${!gainersRevealed ? " name--blur" : ""}`}>
                  {getTickerLabel(g.ticker)}
                </span>
                <span className={`gainer-return ${g.returnPct >= 0 ? "pos" : "neg"}`}>
                  {g.returnPct >= 0 ? formatReturn(g.returnPct) : `${g.returnPct.toFixed(1)}%`}
                </span>
                {gainersRevealed && (
                  <button
                    className="gainer-sim-btn"
                    onClick={() => {
                      setTicker(g.ticker);
                      document.querySelector(".event-sim-section")?.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    적립 시뮬
                  </button>
                )}
              </div>
            ))}
          </div>
          {!gainersRevealed && (
            <div className="reveal-cta">
              <p className="reveal-hint">어떤 자산인지 보려면 코인 1개가 필요해요.</p>
              <button className="btn-primary reveal-btn" onClick={handleGainersReveal}>
                🔓 코인 1개로 확인
              </button>
              <p className="reveal-balance">남은 코인 {gainersRemaining}개 · 광고 시청 시 +2개</p>
            </div>
          )}
          {gainersRevealed && gainersData?.updatedAt && (
            <p className="gainers-updated">기준일: {gainersData.updatedAt} · 매주 업데이트</p>
          )}
          {gainersRevealed && (
            <ShareButton
              text={`📈 ${selectedEvent.label} 이후 TOP 3 상승 자산\n${topGainers.slice(0, 3).map((g, i) => `${i + 1}. ${getTickerLabel(g.ticker)} ${g.returnPct >= 0 ? "+" : ""}${g.returnPct.toFixed(1)}%`).join("\n")}\n\n나도 확인하기 → ${APP_LINK}`}
              label="랭킹 공유하기"
            />
          )}
        </div>
      )}

      {selectedEvent && (
        <div className="form-section event-sim-section">
          <label className="form-label">자산 선택</label>
          <TickerSearch onSelect={setTicker} selected={ticker} />

          {ticker && (
            <>
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
              </div>
              <button className="btn-primary run-btn" onClick={run} disabled={loading}>
                {loading ? "계산 중..." : `${selectedEvent.label}부터 시뮬레이션`}
              </button>
            </>
          )}
        </div>
      )}

      {error && <p className="error-msg">{error}</p>}

      {result && (
        <div className="results-section">
          <div className="event-result-header">
            <span className="event-badge">{result.event.label}</span>
            <h2 className="section-title">
              {ticker} · 매월 {formatKRW(monthlyAmount)} 적립
            </h2>
            <p className="event-result-since">{result.event.date.slice(0, 7)}부터 현재까지</p>
          </div>

          <LineChart data={result.portfolioValues} title="포트폴리오 가치" />

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">납입 원금</div>
              <div className="stat-value">{formatKRW(result.totalInvested)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">현재 가치</div>
              <div className="stat-value highlight">{formatKRW(result.finalValue)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">총 수익률</div>
              <div className={`stat-value ${result.totalReturn >= 0 ? "pos" : "neg"}`}>
                {formatPct(result.totalReturn)}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">연 수익률</div>
              <div className={`stat-value ${result.cagr >= 0 ? "pos" : "neg"}`}>
                {formatPct(result.cagr)}
              </div>
            </div>
          </div>

          <ShareButton
            text={`📊 ${result.event.label} 직후 ${ticker} 적립 결과\n원금 ${formatKRW(result.totalInvested)} → ${formatKRW(result.finalValue)}\n수익률 ${formatPct(result.totalReturn)} (${result.event.date.slice(0,7)}~현재)\n\n나도 해보기 → ${APP_LINK}`}
            label="이 결과 공유하기"
          />

          <AdBanner className="ad-banner-results" />

          {!isBasic() && (
            <div className="upgrade-banner">
              <span>광고 지겨우세요? 베이직에서 광고 없이 무제한으로</span>
              <button className="btn-primary" onClick={() => setShowUpgrade(true)}>
                월 1,990원
              </button>
            </div>
          )}
        </div>
      )}

      {showQueryGate && (
        <QueryGateModal
          onClose={() => setShowQueryGate(false)}
          onEarned={() => run()}
          onUpgrade={() => setShowUpgrade(true)}
        />
      )}
      {showGainersQueryGate && (
        <QueryGateModal
          onClose={() => setShowGainersQueryGate(false)}
          onEarned={() => handleGainersReveal()}
          onUpgrade={() => setShowUpgrade(true)}
        />
      )}
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}
