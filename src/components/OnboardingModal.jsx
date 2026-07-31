import { useState, useRef } from "react";
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
    desc: "전체 순위·상세 분석에 코인을 사용해요.\n이틀 연속 오면 +1, 7일 연속이면 +3 보너스!",
  },
];

export function isOnboardDone() {
  try { return !!localStorage.getItem(ONBOARD_KEY); }
  catch { return true; }
}

export default function OnboardingModal({ onClose, onStartTest }) {
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState(1);
  const touchRef = useRef(null);
  const slide = SLIDES[idx];
  const isLast = idx === SLIDES.length - 1;

  function go(next) {
    if (next < 0 || next >= SLIDES.length) return;
    setDir(next > idx ? 1 : -1);
    setIdx(next);
  }

  function finish() {
    logClick("onboard_done", { last_slide: idx, skipped: !isLast });
    try { localStorage.setItem(ONBOARD_KEY, "1"); } catch {}
    onClose();
  }

  function onTouchStart(e) { touchRef.current = e.touches[0].clientX; }
  function onTouchEnd(e) {
    if (touchRef.current == null) return;
    const diff = e.changedTouches[0].clientX - touchRef.current;
    touchRef.current = null;
    if (diff < -40) go(idx + 1);
    else if (diff > 40) go(idx - 1);
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card onboard-card" onClick={(e) => e.stopPropagation()} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="onboard-slide" key={idx} style={{ animation: `slideIn${dir > 0 ? 'Right' : 'Left'} 0.25s ease-out` }}>
          <div className="onboard-emoji">{slide.emoji}</div>
          <h2 className="modal-title onboard-title">{slide.title}</h2>
          <p className="modal-desc onboard-desc">
            {slide.desc.split("\n").map((line, i) => (
              <span key={i}>{line}<br /></span>
            ))}
          </p>
        </div>

        <div className="onboard-dots">
          {SLIDES.map((_, i) => (
            <span key={i} className={`onboard-dot${i === idx ? " onboard-dot--on" : ""}`} />
          ))}
        </div>

        {isLast ? (
          <>
            <button
              className="btn-primary modal-cta"
              onClick={() => {
                logClick("onboard_to_test");
                try { localStorage.setItem(ONBOARD_KEY, "1"); } catch {}
                onStartTest?.();
              }}
            >
              🧭 내 투자성향 알아보고 시작하기
            </button>
            <button className="modal-cancel" onClick={finish}>그냥 시작하기</button>
          </>
        ) : (
          <>
            <button className="btn-primary modal-cta" onClick={() => setIdx(idx + 1)}>
              다음
            </button>
            <button className="modal-cancel" onClick={finish}>건너뛰기</button>
          </>
        )}
      </div>
    </div>
  );
}
