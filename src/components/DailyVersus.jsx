import { useState, useEffect } from "react";
import { earnCoins } from "../utils/premium.js";
import { isKrTicker } from "../utils/tickers.js";
import { shareText, APP_LINK } from "../utils/share.js";
import { logClick } from "../utils/analytics.js";

// 하루 한 대결 · 날짜 시드로 모두 같은 대진 · 승자 맞히면 🪙+1 (하루 1회)
const PREFIX = "aiq_dailyversus_";
const load = (k) => { try { return JSON.parse(localStorage.getItem(PREFIX + k) || "null"); } catch { return null; } };
const save = (k, v) => { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch { /* noop */ } };
const pct = (v) => `${v >= 0 ? "+" : ""}${v}%`;
// 국내는 이름 먼저, 그 외는 티커 먼저 (라벨 충돌 방지)
const disp = (t, label) =>
  isKrTicker(t) ? { primary: label, secondary: t } : { primary: t, secondary: label && label !== t ? label : null };

export default function DailyVersus({ onCoinsChanged, onOpenVersus }) {
  const [q, setQ] = useState(null);
  const [dayKey, setDayKey] = useState(0);
  const [picked, setPicked] = useState(null);
  const [rewarded, setRewarded] = useState(false);
  const [shareStatus, setShareStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/dailyVersus.json")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d?.pool?.length) return;
        const dk = parseInt(new Date().toLocaleDateString("en-CA").replace(/-/g, ""), 10);
        setQ(d.pool[dk % d.pool.length]);
        setDayKey(dk);
        const saved = load(dk);
        if (saved) { setPicked(saved.picked); setRewarded(!!saved.rewarded); }
      })
      .catch(() => { /* 홈을 깨뜨리지 않게 조용히 무시 */ });
    return () => { cancelled = true; };
  }, []);

  if (!q) return null;
  const answered = picked !== null;
  const A = disp(q.a, q.labelA), B = disp(q.b, q.labelB);
  const winnerName = q.winner === "a" ? A.primary : B.primary;
  const isRight = answered && picked === q.winner;

  function choose(side) {
    if (answered) return;
    const right = side === q.winner;
    let rw = false;
    if (right) { earnCoins(1); rw = true; onCoinsChanged?.(); }
    setPicked(side); setRewarded(rw);
    save(dayKey, { picked: side, rewarded: rw });
    logClick("versus_daily_pick", { a: q.a, b: q.b, correct: right });
  }

  async function doShare() {
    const msg = `⚔️ 오늘의 종목 대결\n${A.primary} vs ${B.primary}\n최근 ${q.years}년 매일 적립하면 승자는 ${winnerName}! (${q.margin}%p 차이)\n주식적립왕에서 직접 붙여보기 👇\n${APP_LINK}`;
    try {
      const r = await shareText(msg);
      setShareStatus(r);
      setTimeout(() => setShareStatus(null), 2000);
      logClick("versus_daily_share", { a: q.a, b: q.b });
    } catch { /* noop */ }
  }

  const renderPick = (side, D, ret) => {
    const isWin = q.winner === side;
    let cls = "dv-pick";
    if (answered) cls += isWin ? " win" : picked === side ? " lose" : " dim";
    return (
      <button className={cls} onClick={() => choose(side)} disabled={answered}>
        {answered && isWin && <span className="dv-pick-crown">🏆</span>}
        <span className="dv-pick-primary">{D.primary}</span>
        {D.secondary && <span className="dv-pick-secondary">{D.secondary}</span>}
        {answered && <span className={`dv-pick-ret ${ret >= 0 ? "pos" : "neg"}`}>{pct(ret)}</span>}
      </button>
    );
  };

  return (
    <div className="dv">
      <div className="dv-head">
        <span className="dv-badge">⚔️ 오늘의 종목 대결</span>
        {!answered && <span className="dv-reward-hint">맞히면 🪙 +1</span>}
      </div>
      <p className="dv-q">최근 {q.years}년 <strong>매일 적립</strong>했다면, 누가 이겼을까?</p>

      <div className="dv-picks">
        {renderPick("a", A, q.retA)}
        <span className="dv-vs-mark">VS</span>
        {renderPick("b", B, q.retB)}
      </div>

      {answered && (
        <div className={`dv-reveal ${isRight ? "ok" : "no"}`}>
          <p className="dv-verdict">
            {isRight ? (rewarded ? "🎉 정답! 🪙 +1 받았어요" : "🎉 정답이에요!") : `🙈 아쉬워요`}
          </p>
          <p className="dv-margin"><strong>{winnerName}</strong>가 {q.margin}%p 앞섰어요 · {q.years}년 매일 적립</p>
          <div className="dv-actions">
            <button className="dv-share" onClick={doShare}>
              {shareStatus === "copied" ? "✓ 복사됨" : shareStatus === "shared" ? "✓ 공유 완료" : "📤 이 대결 공유"}
            </button>
            <button className="dv-more" onClick={() => { logClick("versus_daily_more"); onOpenVersus?.(); }}>
              직접 붙여보기 →
            </button>
          </div>
          <p className="dv-tomorrow">🕛 내일 새 대결이 나와요</p>
        </div>
      )}
    </div>
  );
}
