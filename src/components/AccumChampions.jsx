import { useState, useEffect } from "react";
import AdBanner from "./AdBanner.jsx";
import { isKrTicker, TICKER_LABELS } from "../utils/tickers.js";
import { logClick } from "../utils/analytics.js";

// 국내 종목은 이름 먼저(코드 뒤), 그 외는 티커 먼저(이름 뒤)
function disp(ticker) {
  const nm = TICKER_LABELS[ticker];
  if (isKrTicker(ticker) && nm) return { primary: nm, secondary: ticker };
  return { primary: ticker, secondary: nm && nm !== ticker ? nm : null };
}

export default function AccumChampions({ onOpenDetail }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null); // 펼친 카테고리 이름

  useEffect(() => {
    let cancelled = false;
    fetch("/categoryChampions.json")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setOpen(d?.categories?.[0]?.name ?? null); // 첫 카테고리 자동 펼침
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <p className="champ-msg">불러오는 중…</p>;
  if (!data?.categories?.length) return <p className="champ-msg">데이터를 불러올 수 없어요</p>;

  const sign = (v) => (v >= 0 ? "+" : "");

  return (
    <div className="champ">
      <p className="champ-sub">카테고리별 <strong>매일 적립 5년</strong> 성적 1위 🥇</p>

      <div className="champ-cat-list">
        {data.categories.map((c) => {
          const isOpen = open === c.name;
          const top = c.ranking[0];
          return (
            <div className={`champ-cat${isOpen ? " open" : ""}`} key={c.name}>
              <button
                className="champ-cat-head"
                onClick={() => { setOpen(isOpen ? null : c.name); if (!isOpen) logClick("champ_open", { category: c.name }); }}
              >
                <div className="champ-cat-left">
                  <span className="champ-cat-name">{c.name}</span>
                  <span className="champ-cat-topline">
                    🥇 <strong>{disp(top.ticker).primary}</strong>
                    <span className={`champ-ret ${top.return >= 0 ? "pos" : "neg"}`}>{sign(top.return)}{top.return}%</span>
                  </span>
                </div>
                <span className="champ-cat-basis">
                  {c.years}년{c.note ? "*" : ""}
                  <span className={`champ-arrow${isOpen ? " open" : ""}`}>▾</span>
                </span>
              </button>

              {isOpen && (
                <div className="champ-cat-body">
                  {c.note && <p className="champ-note">ℹ️ {c.note}</p>}
                  {c.ranking.map((r, i) => {
                    const d = disp(r.ticker);
                    return (
                      <button className="champ-rank-item" key={r.ticker} onClick={() => onOpenDetail?.(r.ticker, "acc")}>
                        <span className={`champ-rank-num${i === 0 ? " gold" : ""}`}>{i + 1}</span>
                        <span className="champ-rank-info">
                          <span className="champ-rank-sym">{d.primary}</span>
                          {d.secondary && <span className="champ-rank-name">{d.secondary}</span>}
                        </span>
                        <span className="champ-rank-ret">
                          <span className={r.return >= 0 ? "pos" : "neg"}>{sign(r.return)}{r.return}%</span>
                          <span className="champ-rank-cagr">연 {r.cagr}%</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AdBanner className="ad-banner-inline" />

      <div className="trade-disclaimer">
        ⚠️ 매일 적립 총수익률 기준 · 과거 데이터이며 특정 종목의 매매를 권유하지 않습니다.
      </div>
    </div>
  );
}
