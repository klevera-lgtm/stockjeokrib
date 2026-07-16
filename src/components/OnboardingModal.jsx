import { useState } from "react";
import { logClick } from "../utils/analytics.js";

const ONBOARD_KEY = "ait_onboard_done";

const SLIDES = [
  {
    emoji: "👑",
    title: "주식적립왕에 오신 걸 환영해요",
    desc: "\"3년 전부터 매달 30만원씩 샀다면 지금 얼마일까?\"\n과거 데이터로 적립식 투자를 시뮬레이션해요.",
  },
  {
    emoji: "🏆",
    title: "매주 갱신되는 최고 조합",
    desc: "조합 탐색 탭에서 기간별로 가장 수익이 좋았던\n자산 조합과 전략을 매주 공개해요.",
  },
  {
    emoji: "🪙",
    title: "웰컴 코인 10개를 드렸어요",
    desc: "티커 공개·차트 보기에 코인을 사용해요.\n매일 3개씩 자동 충전되고, 3일 연속 방문하면 보너스!",
  },
];

export function isOnboardDone() {
  try { return !!localStorage.getItem(ONBOARD_KEY); }
  catch { return true; }
}

export default function OnboardingModal({ onClose }) {
  const [idx, setIdx] = useState(0);
  const slide = SLIDES[idx];
  const isLast = idx === SLIDES.length - 1;

  function finish() {
    logClick("onboard_done", { last_slide: idx, skipped: !isLast });
    try { localStorage.setItem(ONBOARD_KEY, "1"); } catch {}
    onClose();
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card onboard-card" onClick={(e) => e.stopPropagation()}>
        <div className="onboard-emoji">{slide.emoji}</div>
        <h2 className="modal-title onboard-title">{slide.title}</h2>
        <p className="modal-desc onboard-desc">
          {slide.desc.split("\n").map((line, i) => (
            <span key={i}>{line}<br /></span>
          ))}
        </p>

        <div className="onboard-dots">
          {SLIDES.map((_, i) => (
            <span key={i} className={`onboard-dot${i === idx ? " onboard-dot--on" : ""}`} />
          ))}
        </div>

        <button
          className="btn-primary modal-cta"
          onClick={() => (isLast ? finish() : setIdx(idx + 1))}
        >
          {isLast ? "시작하기" : "다음"}
        </button>
        {!isLast && (
          <button className="modal-cancel" onClick={finish}>건너뛰기</button>
        )}
      </div>
    </div>
  );
}
