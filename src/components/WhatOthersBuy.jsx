import { useState, useEffect } from "react";
import { loadWhatOthersBuy } from "../utils/dataLoader.js";
import { isBasic } from "../utils/premium.js";
import { SUPPORTED_TICKERS, SUPPORTED_TICKERS_URL } from "../utils/tickers.js";
import UpgradeModal from "./UpgradeModal.jsx";

const FREE_LIMIT = 10;
const BASIC_LIMIT = 50;

function formatAmount(v) {
  if (!v && v !== 0) return "-";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(1)}조`;
  if (abs >= 1e8)  return `${(v / 1e8).toFixed(0)}억`;
  if (abs >= 1e4)  return `${(v / 1e4).toFixed(0)}만`;
  return v.toLocaleString();
}

// ".KS", ".T", ".HK" 등 비미국 서픽스 제거 — 미국 ticker는 보통 순수 알파벳
function cleanTicker(raw) {
  if (!raw) return null;
  if (raw.includes(".")) return null; // 해외 거래소 ticker는 전략 분석 불가
  return raw;
}

export default function WhatOthersBuy({ onTickerSelect }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [supportedSet, setSupportedSet] = useState(SUPPORTED_TICKERS);
  const basic = isBasic();
  const limit = basic ? BASIC_LIMIT : FREE_LIMIT;

  useEffect(() => {
    loadWhatOthersBuy()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    fetch(SUPPORTED_TICKERS_URL)
      .then((r) => r.json())
      .then((list) => setSupportedSet(new Set(list)))
      .catch(() => {}); // keep SUPPORTED_TICKERS as fallback
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">남들은 뭐 살까</h1>
        <p className="page-subtitle">이번 주 한국인이 가장 많이 순매수한 미국 주식</p>
        {!basic && (
          <div className="quota-badge">
            무료: TOP10 공개&nbsp;
            <button className="inline-link" onClick={() => setShowUpgrade(true)}>
              TOP50 보기 →
            </button>
          </div>
        )}
      </div>

      {loading && <div className="loading-state">데이터 불러오는 중...</div>}
      {error && <div className="error-msg">데이터를 불러올 수 없습니다. ({error})</div>}

      {data && data.length === 0 && (
        <div className="empty-state">현재 표시할 데이터가 없습니다.</div>
      )}

      {data && data.length > 0 && (
        <div className="others-list">
          {data.slice(0, limit).map((item, idx) => {
            const isLocked = !basic && idx >= FREE_LIMIT;
            const ticker = cleanTicker(item.ticker);

            return (
              <div
                key={item.isin ?? idx}
                className={`others-row${isLocked ? " blurred" : ""}`}
              >
                <div className="others-rank">
                  {idx < 3 ? ["🥇", "🥈", "🥉"][idx] : idx + 1}
                </div>

                <div className="others-info">
                  {ticker
                    ? <div className="others-ticker">{ticker}</div>
                    : <div className="others-ticker others-ticker--name">{item.name}</div>
                  }
                  {ticker && (
                    <div className="others-name">{item.name}</div>
                  )}
                </div>

                <div className="others-amount">
                  <span className="pos">+{formatAmount(item.net_buy_amount)}</span>
                  <span className="others-unit">원 순매수</span>
                </div>

                {ticker && (
                  supportedSet.has(ticker)
                    ? (
                      <button
                        className="btn-secondary others-analyze"
                        onClick={() => {
                          if (isLocked) { setShowUpgrade(true); return; }
                          onTickerSelect(ticker);
                        }}
                      >
                        전략 분석
                      </button>
                    )
                    : <span className="others-no-data">데이터 1년 미만</span>
                )}

                {isLocked && (
                  <div className="blur-overlay">
                    <button
                      className="btn-primary blur-cta"
                      onClick={() => setShowUpgrade(true)}
                    >
                      베이직에서 TOP50 보기
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {!basic && (
            <div className="upgrade-banner">
              <span>베이직에서 TOP50 전체 공개</span>
              <button className="btn-primary" onClick={() => setShowUpgrade(true)}>
                월 990원으로 시작
              </button>
            </div>
          )}
        </div>
      )}

      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}
