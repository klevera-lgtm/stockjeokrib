import { useState, useEffect } from "react";
import { loadWhatOthersBuy } from "../utils/dataLoader.js";
import { isBasic } from "../utils/premium.js";
import { SUPPORTED_TICKERS, SUPPORTED_TICKERS_URL } from "../utils/tickers.js";
import UpgradeModal from "./UpgradeModal.jsx";
import ShareSheet from "./ShareSheet.jsx";
import { APP_LINK } from "../utils/share.js";
import AdBanner from "./AdBanner.jsx";

const DISPLAY_LIMIT = 50;

function formatAmount(v) {
  if (!v && v !== 0) return "-";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(1)}조`;
  if (abs >= 1e8)  return `${(v / 1e8).toFixed(0)}억`;
  if (abs >= 1e4)  return `${(v / 1e4).toFixed(0)}만`;
  return v.toLocaleString();
}

function cleanTicker(raw) {
  if (!raw) return null;
  if (raw.includes(".")) return null;
  return raw;
}

export default function WhatOthersBuy({ onTickerSelect }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [supportedSet, setSupportedSet] = useState(SUPPORTED_TICKERS);

  useEffect(() => {
    loadWhatOthersBuy()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    fetch(SUPPORTED_TICKERS_URL)
      .then((r) => r.json())
      .then((list) => setSupportedSet(new Set(list)))
      .catch(() => {});
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">남들은 뭐 살까</h1>
        <p className="page-subtitle">이번 주 한국인이 가장 많이 순매수한 미국 주식</p>
      </div>

      {loading && <div className="loading-state">데이터 불러오는 중...</div>}
      {error && <div className="error-msg">데이터를 불러올 수 없습니다. ({error})</div>}
      {data && data.length === 0 && (
        <div className="empty-state">현재 표시할 데이터가 없습니다.</div>
      )}

      {data && data.length > 0 && (() => {
        const visible = data.slice(0, DISPLAY_LIMIT);
        const maxAmount = Math.max(...visible.map((i) => i.net_buy_amount || 0));
        const analyzable = visible.filter((item) => {
          const t = cleanTicker(item.ticker);
          return t && supportedSet.has(t);
        }).length;

        return (
          <div className="others-list">
            <div className="others-summary">
              TOP {visible.length} 중 <strong>{analyzable}개</strong> 전략 분석 가능
            </div>

            {visible.map((item, idx) => {
              const ticker = cleanTicker(item.ticker);
              const barPct = maxAmount > 0 ? (item.net_buy_amount / maxAmount) * 100 : 0;

              return (
                <div key={item.isin ?? idx} className="others-row">
                  <div className="others-bar" style={{ width: `${barPct.toFixed(1)}%` }} />

                  <div className="others-rank">
                    {idx < 3 ? ["🥇", "🥈", "🥉"][idx] : idx + 1}
                  </div>

                  <div className="others-info">
                    {ticker
                      ? <div className="others-ticker">{ticker}</div>
                      : <div className="others-ticker others-ticker--name">{item.name}</div>
                    }
                    {ticker && <div className="others-name">{item.name}</div>}
                  </div>

                  <div className="others-amount">
                    <span className="pos">+{formatAmount(item.net_buy_amount)}</span>
                    <span className="others-unit">원</span>
                  </div>

                  {ticker && (
                    supportedSet.has(ticker)
                      ? (
                        <button
                          className="btn-secondary others-analyze"
                          onClick={() => onTickerSelect(ticker)}
                        >
                          전략 분석
                        </button>
                      )
                      : <span className="others-no-data">분석 불가</span>
                  )}
                </div>
              );
            })}

            <button className="ssheet-trigger" onClick={() => setShowShare(true)}>
              📤 TOP5 공유하기
            </button>

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
        );
      })()}

      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
      {showShare && data?.length > 0 && (
        <ShareSheet
          text={`🏆 이번 주 한국인 미국주식 순매수 TOP5\n${data.slice(0, 5).map((item, i) => `${i + 1}. ${item.ticker || item.name} (+${formatAmount(item.net_buy_amount)}원)`).join("\n")}\n\n내 보유 종목 DCA 분석 → ${APP_LINK}`}
          card={{
            title: "이번 주 한국인 순매수 TOP 5",
            period: "미국주식 순매수 금액 · 매주 업데이트",
            rows: data.slice(0, 5).map((item) => ({
              label: item.ticker || item.name,
              value: `+${formatAmount(item.net_buy_amount)}원`,
            })),
          }}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
