import { useState } from "react";
import { shareText } from "../utils/share.js";

export default function ShareButton({ text, label = "결과 공유하기" }) {
  const [status, setStatus] = useState(null);

  async function handleShare() {
    try {
      const result = await shareText(text);
      setStatus(result);
      setTimeout(() => setStatus(null), 2000);
    } catch {}
  }

  const lines = text.split("\n").filter((l) => l.trim());
  const body = lines.slice(0, -1);
  const link = lines.at(-1);

  return (
    <div className="share-card">
      <div className="share-card-body">
        {body.map((line, i) => (
          <p key={i} className={i === 0 ? "share-card-title" : "share-card-line"}>
            {line}
          </p>
        ))}
        {link && <p className="share-card-link">{link}</p>}
      </div>
      <button
        className={`share-card-btn${status ? " share-card-btn--done" : ""}`}
        onClick={handleShare}
      >
        {status === "copied" ? "✓ 클립보드에 복사됨" : status === "shared" ? "✓ 공유 완료" : `📤 ${label}`}
      </button>
    </div>
  );
}
