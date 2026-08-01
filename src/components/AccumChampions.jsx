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

const sign = (v) => (v >= 0 ? "+" : "");

export default function AccumChampions({ onOpenDetail }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null); // 펼친 섹션 key

  useEffect(() => {
    let cancelled = false;
    fetch("/categoryChampions.json")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setData(d);
        // 명예의 전당이 있으면 그걸, 없으면 첫 카테고리 자동 펼침
        setOpen(d?.overall?.top?.length ? "★전체" : d?.categories?.[0]?.name ?? null);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <p className="champ-msg">불러오는 중…</p>;
  if (!data?.categories?.length) return <p className="champ-msg">데이터를 불러올 수 없어요</p>;

  const specials = [
    { key: "★전체", name: "🏆 전체 명예의 전당", note: "레버리지 제외 · 매일 적립 5년 총수익률 순위예요", items: data.overall?.top, metric: "return", years: data.overall?.years },
    { key: "★흑역사", name: "📉 적립 흑역사", note: "같은 기간 가장 부진했던 종목이에요. 반면교사 삼아보세요", items: data.overall?.worst, metric: "return", years: data.overall?.years },
    { key: "★방어", name: "🛡 덜 빠진 종목", note: "5년간 최대 낙폭(MDD)이 가장 작았던, 마음 편한 종목이에요", items: data.defensive?.ranking, metric: "mdd", years: data.defensive?.years },
  ].filter((s) => s.items?.length);

  const renderSection = (sec, special) => {
    const isOpen = open === sec.key;
    const top = sec.items[0];
    return (
      <div className={`champ-cat${isOpen ? " open" : ""}${special ? " special" : ""}`} key={sec.key}>
        <button
          className="champ-cat-head"
          onClick={() => { setOpen(isOpen ? null : sec.key); if (!isOpen) logClick("champ_open", { category: sec.key }); }}
        >
          <div className="champ-cat-left">
            <span className="champ-cat-name">{sec.name}</span>
            <span className="champ-cat-topline">
              {!special && "🥇 "}
              <strong>{disp(top.ticker).primary}</strong>
              {sec.metric === "mdd"
                ? <span className="champ-ret champ-mdd">MDD {top.mdd}%</span>
                : <span className={`champ-ret ${top.return >= 0 ? "pos" : "neg"}`}>{sign(top.return)}{top.return}%</span>}
            </span>
          </div>
          <span className="champ-cat-basis">
            {sec.years}년{!special && sec.note ? "*" : ""}
            <span className={`champ-arrow${isOpen ? " open" : ""}`}>▾</span>
          </span>
        </button>

        {isOpen && (
          <div className="champ-cat-body">
            {sec.note && <p className="champ-note">ℹ️ {sec.note}</p>}
            {sec.items.map((r, i) => {
              const d = disp(r.ticker);
              return (
                <button className="champ-rank-item" key={r.ticker} onClick={() => onOpenDetail?.(r.ticker, "acc")}>
                  <span className={`champ-rank-num${i === 0 ? " gold" : ""}`}>{i + 1}</span>
                  <span className="champ-rank-info">
                    <span className="champ-rank-sym">{d.primary}</span>
                    {d.secondary && <span className="champ-rank-name">{d.secondary}</span>}
                  </span>
                  {sec.metric === "mdd" ? (
                    <span className="champ-rank-ret">
                      <span className="champ-mdd">MDD {r.mdd}%</span>
                      <span className="champ-rank-cagr">수익 {sign(r.return)}{r.return}%</span>
                    </span>
                  ) : (
                    <span className="champ-rank-ret">
                      <span className={r.return >= 0 ? "pos" : "neg"}>{sign(r.return)}{r.return}%</span>
                      <span className="champ-rank-cagr">연 {r.cagr}%</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="champ">
      <p className="champ-sub">누가 <strong>매일 적립</strong>으로 가장 크게 불렸을까? 🥇</p>

      <div className="champ-cat-list">
        {specials.map((s) => renderSection(s, true))}
        {data.categories.map((c) =>
          renderSection({ key: c.name, name: c.name, note: c.note, items: c.ranking, metric: "return", years: c.years }, false)
        )}
      </div>

      <AdBanner className="ad-banner-inline" />

      <div className="trade-disclaimer">
        ⚠️ 매일 적립 총수익률 기준 · 과거 데이터이며 특정 종목의 매매를 권유하지 않습니다.
      </div>
    </div>
  );
}
