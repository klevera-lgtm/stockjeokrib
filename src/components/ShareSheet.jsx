import { useState, useEffect, useRef } from "react";
import { APP_LINK } from "../utils/share.js";
import { renderShareCard, shareCardImage } from "../utils/shareCard.js";
import { maybeRequestReview } from "../utils/review.js";
import { logClick } from "../utils/analytics.js";
import { shareTextNative } from "../utils/tossShare.js";

export default function ShareSheet({ text, card, onClose }) {
  const [copied, setCopied] = useState(false);
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

  const fullText = `📈 토스 미니앱 주식적립왕\n${text}\n${APP_LINK}`;

  // 이미지 → 갤러리 저장
  async function handleImageSave() {
    markShare("image");
    const result = await shareCardImage(card);
    const msg = {
      saved: "✓ 갤러리에 저장됐어요 · 카톡·인스타에 올려보세요",
      shared: null,
      copied: "✓ 이미지 복사됨 · 붙여넣기 하세요",
      downloaded: "✓ 이미지 저장됨",
      cancelled: null,
      failed: "이미지 저장 실패",
    }[result];
    if (msg) {
      setImgStatus(msg);
      clearTimeout(imgStatusTimer.current);
      imgStatusTimer.current = setTimeout(() => setImgStatus(null), 3500);
    }
  }

  // 텍스트+링크 → 네이티브 공유 시트 (카톡·X·텔레·인스타 선택)
  async function handleShare() {
    markShare("sheet");
    await shareTextNative(fullText);
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
          <img src={previewUrl} alt="공유 카드 미리보기" className="ssheet-card-img" />
        )}

        <div className="ssheet-actions">
          {card && (
            <button className="btn-primary ssheet-action" onClick={handleImageSave}>
              {imgStatus ?? "🖼 이미지 저장하기"}
            </button>
          )}
          <button className="btn-secondary ssheet-action" onClick={handleShare}>
            📤 링크 공유하기
          </button>
          <button className="btn-secondary ssheet-action" onClick={handleCopyLink}>
            {copied ? "✓ 링크 복사됨" : "🔗 링크 복사"}
          </button>
        </div>

        <button className="ssheet-close" onClick={handleClose}>닫기</button>
      </div>
    </>
  );
}
