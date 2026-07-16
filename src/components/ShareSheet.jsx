import { useState, useEffect, useRef } from "react";
import { APP_LINK } from "../utils/share.js";
import { shareKakao } from "../utils/kakao.js";
import { renderShareCard, shareCardImage } from "../utils/shareCard.js";
import { maybeRequestReview } from "../utils/review.js";
import { logClick } from "../utils/analytics.js";

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
}

function KakaoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3C6.477 3 2 6.768 2 11.143c0 2.781 1.638 5.232 4.119 6.766L5.2 21.73l4.63-2.514c.713.1 1.44.153 2.17.153 5.523 0 10-3.768 10-8.286C22 6.768 17.523 3 12 3z"/>
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  );
}

function InstaIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  );
}

export default function ShareSheet({ text, card, onClose }) {
  const [copied, setCopied] = useState(false);
  const [kakaoCopied, setKakaoCopied] = useState(false);
  const [imgStatus, setImgStatus] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const imgStatusTimer = useRef(null);
  const didShare = useRef(false);

  function markShare(channel) {
    didShare.current = true;
    logClick("share", { channel, has_card: !!card });
  }

  // 공유 행동이 있었으면 시트 닫을 때 리뷰 요청 (1회 한정)
  function handleClose() {
    if (didShare.current) maybeRequestReview();
    onClose();
  }

  useEffect(() => {
    if (!card) return;
    try {
      setPreviewUrl(renderShareCard(card).toDataURL("image/png"));
    } catch {}
  }, [card]);

  async function handleImageShare() {
    markShare("image");
    const result = await shareCardImage(card);
    const msg = {
      shared: null,
      copied: "이미지 복사됨 ✓ 카톡에 붙여넣기 하세요",
      downloaded: "이미지 저장됨 ✓",
      cancelled: null,
      failed: "이미지 생성 실패",
    }[result];
    if (msg) {
      setImgStatus(msg);
      clearTimeout(imgStatusTimer.current);
      imgStatusTimer.current = setTimeout(() => setImgStatus(null), 3000);
    }
  }

  const fullText = `📈 토스 미니앱 주식적립왕\n${text}\n${APP_LINK}`;
  const encodedFull = encodeURIComponent(fullText);
  const encodedLink = encodeURIComponent(APP_LINK);
  const encodedText = encodeURIComponent(text);

  async function handleKakao() {
    markShare("kakao");
    await shareKakao(text, APP_LINK);
    setKakaoCopied(true);
    setTimeout(() => setKakaoCopied(false), 3000);
  }

  function handleX() {
    markShare("x");
    window.open(`https://x.com/intent/post?text=${encodedFull}`, "_blank", "noopener,noreferrer");
  }

  function handleTelegram() {
    markShare("telegram");
    window.open(`https://t.me/share/url?url=${encodedLink}&text=${encodedText}`, "_blank", "noopener,noreferrer");
  }

  async function handleInsta() {
    markShare("insta");
    if (navigator.share) {
      try { await navigator.share({ text: fullText }); } catch {}
    } else {
      await navigator.clipboard.writeText(fullText).catch(() => {});
    }
  }

  async function handleCopyLink() {
    markShare("copylink");
    try {
      await navigator.clipboard.writeText(APP_LINK);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <>
      <div className="ssheet-backdrop" onClick={handleClose} />
      <div className="ssheet">
        <div className="ssheet-handle" />
        <p className="ssheet-title">결과 공유하기</p>
        {card && previewUrl && (
          <div className="ssheet-card">
            <img src={previewUrl} alt="공유 카드 미리보기" className="ssheet-card-img" />
            <button className="btn-primary ssheet-card-btn" onClick={handleImageShare}>
              {imgStatus ?? "🖼 이미지로 공유하기"}
            </button>
          </div>
        )}
        <div className="ssheet-btns">
          <button className="ssheet-btn" onClick={handleX}>
            <span className="ssheet-icon ssheet-icon--x"><XIcon /></span>
            <span>트위터</span>
          </button>
          <button className="ssheet-btn" onClick={handleKakao}>
            <span className="ssheet-icon ssheet-icon--kakao"><KakaoIcon /></span>
            <span>{kakaoCopied ? "복사됨 ✓" : "카카오톡"}</span>
          </button>
          <button className="ssheet-btn" onClick={handleTelegram}>
            <span className="ssheet-icon ssheet-icon--telegram"><TelegramIcon /></span>
            <span>텔레그램</span>
          </button>
          <button className="ssheet-btn" onClick={handleInsta}>
            <span className="ssheet-icon ssheet-icon--insta"><InstaIcon /></span>
            <span>인스타</span>
          </button>
          <button className="ssheet-btn" onClick={handleCopyLink}>
            <span className="ssheet-icon ssheet-icon--link"><LinkIcon /></span>
            <span>{copied ? "복사됨 ✓" : "링크 복사"}</span>
          </button>
        </div>
        <button className="ssheet-close" onClick={handleClose}>닫기</button>
      </div>
    </>
  );
}
