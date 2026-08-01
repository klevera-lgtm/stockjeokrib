import { useState, useEffect } from "react";
import { earnCoins } from "../utils/premium.js";
import { logClick } from "../utils/analytics.js";

// 하루 한 문제 · 날짜 시드로 모두 같은 문제 · 정답 시 🪙+1 (하루 1회, 로컬 가드)
const PREFIX = "aiq_dailyquiz_";
const load = (k) => { try { return JSON.parse(localStorage.getItem(PREFIX + k) || "null"); } catch { return null; } };
const save = (k, v) => { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch { /* noop */ } };
const pct = (v) => `${v >= 0 ? "+" : ""}${v}%`;
// 마지막 한글 음절의 받침으로 을/를 결정 (한글 없으면 '를')
function josa(word) {
  const m = String(word).match(/[가-힣](?=[^가-힣]*$)/);
  if (!m) return "를";
  return (m[0].charCodeAt(0) - 0xac00) % 28 !== 0 ? "을" : "를";
}

export default function DailyQuiz({ onCoinsChanged, onOpenDetail }) {
  const [q, setQ] = useState(null);
  const [period, setPeriod] = useState(5);
  const [dayKey, setDayKey] = useState(0);
  const [picked, setPicked] = useState(null);
  const [rewarded, setRewarded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/dailyQuiz.json")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d?.pool?.length) return;
        const dk = parseInt(new Date().toLocaleDateString("en-CA").replace(/-/g, ""), 10);
        setQ(d.pool[dk % d.pool.length]);
        setPeriod(d.period || 5);
        setDayKey(dk);
        const saved = load(dk);
        if (saved) { setPicked(saved.picked); setRewarded(!!saved.rewarded); }
      })
      .catch(() => { /* 홈을 깨뜨리지 않게 조용히 무시 */ });
    return () => { cancelled = true; };
  }, []);

  if (!q) return null;
  const answered = picked !== null;
  const isRight = answered && picked === q.answer;

  function choose(i) {
    if (answered) return;
    const right = i === q.answer;
    let rw = false;
    if (right) { earnCoins(1); rw = true; onCoinsChanged?.(); }
    setPicked(i);
    setRewarded(rw);
    save(dayKey, { picked: i, rewarded: rw });
    logClick("quiz_answer", { ticker: q.ticker, correct: right });
  }

  return (
    <div className="quiz">
      <div className="quiz-head">
        <span className="quiz-badge">🧠 오늘의 적립 퀴즈</span>
        {!answered && <span className="quiz-reward-hint">맞히면 🪙 +1</span>}
      </div>

      <p className="quiz-q">
        <strong>{q.label}</strong>{josa(q.label)} 최근 {period}년 <strong>매일 적립</strong>했다면,<br />
        총수익률에 가장 가까운 건?
      </p>

      <div className="quiz-choices">
        {q.choices.map((c, i) => {
          let cls = "quiz-choice";
          if (answered) {
            if (i === q.answer) cls += " correct";
            else if (i === picked) cls += " wrong";
            else cls += " dim";
          }
          return (
            <button key={i} className={cls} onClick={() => choose(i)} disabled={answered}>
              <span className="quiz-choice-val">{pct(c)}</span>
              {answered && i === q.answer && <span className="quiz-mark">✓</span>}
              {answered && i === picked && i !== q.answer && <span className="quiz-mark">✕</span>}
            </button>
          );
        })}
      </div>

      {answered && (
        <div className={`quiz-reveal ${isRight ? "ok" : "no"}`}>
          <p className="quiz-verdict">
            {isRight ? (rewarded ? "🎉 정답! 🪙 +1 받았어요" : "🎉 정답이에요!") : "🙈 아쉬워요"}
          </p>
          <p className="quiz-fact">
            {q.label} · {period}년 매일 적립 실제 <strong>{pct(q.ret)}</strong> (연 {q.cagr}%)
          </p>
          <button className="quiz-detail" onClick={() => { logClick("quiz_detail", { ticker: q.ticker }); onOpenDetail?.(q.ticker, "acc"); }}>
            이 종목 자세히 보기 →
          </button>
          <p className="quiz-tomorrow">🕛 내일 0시에 새 문제가 나와요</p>
        </div>
      )}
    </div>
  );
}
