import { useState } from "react";
import ShareSheet from "./ShareSheet.jsx";
import { logClick } from "../utils/analytics.js";

const TYPE_KEY = "ait_invest_type";

// 채점 축: r = 위험 감수(0~10), t = 장기 지향(0~8), i = 현금흐름 선호(0~4)
const QUESTIONS = [
  {
    q: "보유 주식이 하루에 -15% 빠졌어요.",
    options: [
      { label: "오히려 물타기 기회다", s: { r: 3 } },
      { label: "흔들리지 않고 버틴다", s: { r: 2 } },
      { label: "일부라도 판다", s: { r: 1 } },
      { label: "전량 매도, 못 버틴다", s: { r: 0 } },
    ],
  },
  {
    q: "생각하는 투자 기간은?",
    options: [
      { label: "1년 미만", s: { t: 0 } },
      { label: "1~3년", s: { t: 1 } },
      { label: "3~10년", s: { t: 2 } },
      { label: "10년 이상, 평생", s: { t: 3 } },
    ],
  },
  {
    q: "둘 중 더 끌리는 것은?",
    options: [
      { label: "10년 뒤 10배가 된 계좌", s: { r: 1, i: 0 } },
      { label: "매달 따박따박 들어오는 배당", s: { i: 2 } },
    ],
  },
  {
    q: "레버리지 ETF(3배)에 대한 생각은?",
    options: [
      { label: "이미 하고 있다", s: { r: 3 } },
      { label: "관심 있다", s: { r: 2 } },
      { label: "무서워서 못 한다", s: { r: 1 } },
      { label: "그게 뭔데?", s: { r: 0 } },
    ],
  },
  {
    q: "투자금을 넣는 방식은?",
    options: [
      { label: "정해진 날 기계처럼 자동으로", s: { t: 2 } },
      { label: "떨어질 때를 노렸다가", s: { r: 1, t: 1 } },
      { label: "그때그때 기분 따라", s: { t: 0 } },
    ],
  },
  {
    q: "은퇴 후 꿈꾸는 모습은?",
    options: [
      { label: "\"자산 00억\" — 큰 덩어리", s: { i: 0 } },
      { label: "\"월 000만원\" — 꾸준한 현금흐름", s: { i: 2 } },
    ],
  },
  {
    q: "계좌를 확인하는 빈도는?",
    options: [
      { label: "하루에도 수십 번", s: { t: 0 } },
      { label: "하루 한 번", s: { t: 1 } },
      { label: "일주일에 한 번", s: { t: 2 } },
      { label: "한 달에 한 번 이하", s: { t: 3 } },
    ],
  },
  {
    q: "뉴스에 '폭락장' 헤드라인이 떴어요.",
    options: [
      { label: "드디어 기회가 왔다", s: { r: 2 } },
      { label: "불안해서 잠이 안 온다", s: { r: 0 } },
      { label: "어차피 장기전, 관심 없다", s: { r: 1, t: 1 } },
    ],
  },
];

const TYPES = {
  aggressive: {
    emoji: "🚀",
    name: "공격 성장형",
    desc: "높은 변동성을 견디고 큰 성장을 노리는 타입이에요.\n레버리지가 포함된 조합들의 과거 기록이 흥미로울 거예요.",
    cta: "레버리지 포함 랭킹 구경하기",
    route: { tab: "combo", leverage: true, section: "mid" },
  },
  steady: {
    emoji: "🌱",
    name: "꾸준 적립형",
    desc: "시간을 내 편으로 만드는 장기 분산 투자 타입이에요.\n지난 10년간의 장기 조합 기록부터 구경해보세요.",
    cta: "장기 조합 랭킹 구경하기",
    route: { tab: "combo", leverage: false, section: "long" },
  },
  sprinter: {
    emoji: "⚡",
    name: "단기 승부형",
    desc: "짧은 호흡으로 기회를 잡는 타입이에요.\n최근 1달~6달 구간의 랭킹이 잘 맞을 거예요.",
    cta: "단기 랭킹 구경하기",
    route: { tab: "combo", leverage: false, section: "short" },
  },
  dividend: {
    emoji: "💰",
    name: "배당 안정형",
    desc: "매달 들어오는 현금흐름을 사랑하는 타입이에요.\n배당 투자에 특화된 '배당적립왕'을 준비하고 있어요!",
    cta: "목표 금액 계산해보기",
    route: { tab: "goal" },
  },
};

function decideType(score) {
  if ((score.i ?? 0) >= 3) return "dividend";
  if ((score.t ?? 0) <= 3) return "sprinter";
  if ((score.r ?? 0) >= 6) return "aggressive";
  return "steady";
}

function levelLabel(v, max) {
  const p = v / max;
  return p >= 0.67 ? "높음" : p >= 0.34 ? "보통" : "낮음";
}

export function getSavedInvestType() {
  try { return localStorage.getItem(TYPE_KEY); } catch { return null; }
}

export default function InvestTypeTest({ onClose, onRoute }) {
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState({ r: 0, t: 0, i: 0 });
  const [typeKey, setTypeKey] = useState(null);
  const [showShare, setShowShare] = useState(false);
  const [waitlisted, setWaitlisted] = useState(false);

  const done = typeKey !== null;
  const type = done ? TYPES[typeKey] : null;

  function answer(opt) {
    const next = {
      r: score.r + (opt.s.r ?? 0),
      t: score.t + (opt.s.t ?? 0),
      i: score.i + (opt.s.i ?? 0),
    };
    if (idx + 1 < QUESTIONS.length) {
      setScore(next);
      setIdx(idx + 1);
    } else {
      const k = decideType(next);
      setScore(next);
      setTypeKey(k);
      try { localStorage.setItem(TYPE_KEY, k); } catch {}
      logClick("invtest_done", { type: k });
    }
  }

  async function handleWaitlist() {
    logClick("divapp_waitlist");
    try {
      const { requestNotificationAgreement } = await import("@apps-in-toss/web-framework");
      await requestNotificationAgreement();
      setWaitlisted(true);
    } catch {
      setWaitlisted(true);
    }
  }

  function handleRoute() {
    logClick("invtest_route", { type: typeKey });
    onRoute?.(type.route);
    onClose();
  }

  const traits = [
    { label: "위험 감수", value: levelLabel(score.r, 10) },
    { label: "장기 지향", value: levelLabel(score.t, 8) },
    { label: "현금흐름 선호", value: levelLabel(score.i, 4) },
  ];

  return (
    <div className="itt-overlay">
      <div className="itt-card">
        {!done ? (
          <>
            <div className="itt-top">
              <span className="itt-progress-label">{idx + 1} / {QUESTIONS.length}</span>
              <button className="itt-close" onClick={onClose}>✕</button>
            </div>
            <div className="itt-bar">
              <div className="itt-bar-fill" style={{ width: `${((idx) / QUESTIONS.length) * 100}%` }} />
            </div>
            <h2 className="itt-question">{QUESTIONS[idx].q}</h2>
            <div className="itt-options">
              {QUESTIONS[idx].options.map((opt) => (
                <button key={opt.label} className="itt-option" onClick={() => answer(opt)}>
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="itt-top">
              <span className="itt-progress-label">결과</span>
              <button className="itt-close" onClick={onClose}>✕</button>
            </div>
            <div className="itt-result-emoji">{type.emoji}</div>
            <h2 className="itt-result-name">{type.name}</h2>
            <p className="itt-result-desc">
              {type.desc.split("\n").map((line, i) => <span key={i}>{line}<br /></span>)}
            </p>
            <div className="itt-traits">
              {traits.map((tr) => (
                <div key={tr.label} className="itt-trait">
                  <span className="itt-trait-label">{tr.label}</span>
                  <span className="itt-trait-value">{tr.value}</span>
                </div>
              ))}
            </div>

            {typeKey === "dividend" && (
              <button
                className="btn-secondary itt-waitlist"
                onClick={handleWaitlist}
                disabled={waitlisted}
              >
                {waitlisted ? "✓ 출시되면 알려드릴게요!" : "🔔 배당적립왕 출시 알림 받기"}
              </button>
            )}

            <button className="btn-primary itt-cta" onClick={handleRoute}>
              {type.cta} →
            </button>
            <button className="btn-secondary itt-share" onClick={() => setShowShare(true)}>
              📤 내 유형 공유하기
            </button>
            <p className="itt-disclaimer">
              이 테스트는 재미와 정보 제공 목적이며 투자 권유가 아니에요.
            </p>
          </>
        )}
      </div>

      {showShare && type && (
        <ShareSheet
          text={`${type.emoji} 나의 투자성향: ${type.name}\n${traits.map((t) => `${t.label} ${t.value}`).join(" · ")}\n\n너는 어떤 투자자야? 주식적립왕에서 테스트해봐!`}
          card={{
            title: `나는 ${type.emoji} ${type.name}`,
            period: "주식적립왕 투자성향 테스트",
            rows: traits.map((t) => ({ label: t.label, value: t.value })),
          }}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
