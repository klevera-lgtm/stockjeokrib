import { formatKRW, formatPct } from "./calculator.js";
import { saveImageBase64 } from "./tossShare.js";

const W = 1080;
const H = 1080;
const PAD = 72;

// 한 줄을 폭에 맞게 자르고 넘치면 … 처리
function fitLine(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxWidth) t = t.slice(0, -1);
  return t + "…";
}

// 긴 제목을 최대 2줄로 자르기
function wrapTitle(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return [text];
  const words = text.split(" ");
  const lines = [];
  let cur = "";
  let truncated = false;
  for (let i = 0; i < words.length; i++) {
    const next = cur ? `${cur} ${words[i]}` : words[i];
    if (ctx.measureText(next).width > maxWidth && cur) {
      lines.push(cur);
      cur = words[i];
      if (lines.length === 2) { truncated = true; break; }
    } else {
      cur = next;
    }
  }
  if (lines.length < 2 && cur) lines.push(cur);
  if (truncated || (lines[1] && ctx.measureText(lines[1]).width > maxWidth)) {
    let t = lines[1];
    while (ctx.measureText(t + "…").width > maxWidth && t.length > 1) t = t.slice(0, -1);
    lines[1] = t + "…";
  }
  return lines;
}

export function renderShareCard({ title, period, invested, finalValue, returnPct, mdd, series, rows, strategies }) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // 배경 — 딥 네이비 그라데이션
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#141d30");
  bg.addColorStop(1, "#1b2a4a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── 상단 브랜딩 ──
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 46px 'Pretendard', 'Apple SD Gothic Neo', sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText("👑 주식적립왕", PAD, PAD);

  // "토스 미니앱" 뱃지
  const badgeText = "토스 미니앱";
  ctx.font = "600 30px 'Pretendard', 'Apple SD Gothic Neo', sans-serif";
  const bw = ctx.measureText(badgeText).width + 44;
  const bx = W - PAD - bw;
  ctx.fillStyle = "#3182F6";
  ctx.beginPath();
  ctx.roundRect(bx, PAD - 2, bw, 56, 28);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(badgeText, bx + 22, PAD + 10);

  // ── 제목 ──
  ctx.font = "700 50px 'Pretendard', 'Apple SD Gothic Neo', sans-serif";
  ctx.fillStyle = "#ffffff";
  const titleLines = wrapTitle(ctx, title, W - PAD * 2);
  let y = PAD + 110;
  for (const line of titleLines) {
    ctx.fillText(line, PAD, y);
    y += 66;
  }

  // 기간
  ctx.font = "500 34px 'Pretendard', 'Apple SD Gothic Neo', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillText(period, PAD, y + 4);

  // ── 순위표 카드 (rows 지정 시 차트·스탯 대신 리스트) ──
  if (rows?.length) {
    const listTop = 400;
    const rowH = 108;
    const medals = ["🥇", "🥈", "🥉"];
    rows.slice(0, 5).forEach((row, i) => {
      const ry = listTop + i * rowH;

      // 행 구분선
      if (i > 0) {
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(PAD, ry - 18);
        ctx.lineTo(W - PAD, ry - 18);
        ctx.stroke();
      }

      // 순위
      ctx.font = "700 44px 'Pretendard', 'Apple SD Gothic Neo', sans-serif";
      ctx.fillStyle = i < 3 ? "#ffd54a" : "rgba(255,255,255,0.45)";
      ctx.fillText(medals[i] ?? String(i + 1), PAD, ry + 14);

      // 종목명 (길면 자르기)
      ctx.font = "700 42px 'Pretendard', 'Apple SD Gothic Neo', sans-serif";
      ctx.fillStyle = "#ffffff";
      let label = row.label ?? "";
      const maxLabelW = W - PAD * 2 - 100 - 300;
      while (ctx.measureText(label).width > maxLabelW && label.length > 1) {
        label = label.slice(0, -1);
      }
      if (label !== (row.label ?? "")) label += "…";
      ctx.fillText(label, PAD + 100, ry + 16);

      // 금액 (우측 정렬)
      ctx.font = "700 40px 'Pretendard', 'Apple SD Gothic Neo', sans-serif";
      ctx.fillStyle = "#4ade80";
      const vw = ctx.measureText(row.value ?? "").width;
      ctx.fillText(row.value ?? "", W - PAD - vw, ry + 18);
    });

    // 하단 CTA
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PAD, H - 120);
    ctx.lineTo(W - PAD, H - 120);
    ctx.stroke();
    ctx.font = "500 32px 'Pretendard', 'Apple SD Gothic Neo', sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText("토스 앱에서 '주식적립왕' 검색 🔍", PAD, H - 88);

    return canvas;
  }

  // ── 적용 전략 블록 (있으면 표시) ──
  const hasStrat = strategies && strategies.length > 0;
  const stratList = hasStrat ? strategies.slice(0, 5) : [];
  let stratBottom = y;
  if (hasStrat) {
    let sy = y + 60;
    ctx.font = "700 30px 'Pretendard', 'Apple SD Gothic Neo', sans-serif";
    ctx.fillStyle = "#ffd54a";
    ctx.fillText("📌 적용 전략", PAD, sy);
    sy += 50;
    ctx.font = "600 33px 'Pretendard', 'Apple SD Gothic Neo', sans-serif";
    for (const s of stratList) {
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillText(fitLine(ctx, s, W - PAD * 2), PAD, sy);
      sy += 50;
    }
    stratBottom = sy;
  }

  const statY = 680;

  // ── 차트: 전략 없으면 큰 차트, 있으면 남는 공간에 컴팩트 차트 ──
  const chartTop = hasStrat ? stratBottom + 24 : 390;
  const chartBottom = hasStrat ? statY - 48 : 620;
  const chartH = chartBottom - chartTop;
  const drawChart = series && series.length > 1 && chartH >= 110;
  if (drawChart) {
    const min = Math.min(...series);
    const max = Math.max(...series);
    const range = max - min || 1;
    const stepX = (W - PAD * 2) / (series.length - 1);
    const pts = series.map((v, i) => [
      PAD + i * stepX,
      chartBottom - ((v - min) / range) * chartH,
    ]);

    // 채우기
    const fill = ctx.createLinearGradient(0, chartTop, 0, chartBottom);
    fill.addColorStop(0, "rgba(49,130,246,0.45)");
    fill.addColorStop(1, "rgba(49,130,246,0)");
    ctx.beginPath();
    ctx.moveTo(pts[0][0], chartBottom);
    pts.forEach(([x, py]) => ctx.lineTo(x, py));
    ctx.lineTo(pts.at(-1)[0], chartBottom);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    // 라인
    ctx.beginPath();
    pts.forEach(([x, py], i) => (i === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)));
    ctx.strokeStyle = "#4e9bff";
    ctx.lineWidth = 6;
    ctx.lineJoin = "round";
    ctx.stroke();

    // 끝점 도트
    const [ex, ey] = pts.at(-1);
    ctx.beginPath();
    ctx.arc(ex, ey, 12, 0, Math.PI * 2);
    ctx.fillStyle = "#4e9bff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex, ey, 22, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(78,155,255,0.3)";
    ctx.fill();
  }

  // ── 스탯 (하단 고정) ──
  ctx.font = "500 32px 'Pretendard', 'Apple SD Gothic Neo', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillText("납입 원금", PAD, statY);
  ctx.fillText("최종 가치", W / 2 + 20, statY);

  ctx.font = "700 58px 'Pretendard', 'Apple SD Gothic Neo', sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(formatKRW(invested), PAD, statY + 44);
  ctx.fillStyle = "#4ade80";
  ctx.fillText(formatKRW(finalValue), W / 2 + 20, statY + 44);

  // 수익률 — 가장 큰 강조
  const retY = statY + 140;
  ctx.font = "500 32px 'Pretendard', 'Apple SD Gothic Neo', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillText("수익률", PAD, retY);
  ctx.font = "800 84px 'Pretendard', 'Apple SD Gothic Neo', sans-serif";
  ctx.fillStyle = returnPct >= 0 ? "#4ade80" : "#f87171";
  ctx.fillText(`${returnPct >= 0 ? "+" : ""}${formatPct(returnPct)}`, PAD, retY + 40);

  if (mdd != null) {
    ctx.font = "500 32px 'Pretendard', 'Apple SD Gothic Neo', sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText("MDD", W / 2 + 20, retY);
    ctx.font = "700 58px 'Pretendard', 'Apple SD Gothic Neo', sans-serif";
    ctx.fillStyle = "#f87171";
    ctx.fillText(formatPct(mdd), W / 2 + 20, retY + 50);
  }

  // ── 하단 CTA ──
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, H - 120);
  ctx.lineTo(W - PAD, H - 120);
  ctx.stroke();
  ctx.font = "500 32px 'Pretendard', 'Apple SD Gothic Neo', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillText("토스 앱에서 '주식적립왕' 검색 🔍", PAD, H - 88);

  return canvas;
}

// 이미지 공유: 토스 갤러리 저장 → (브라우저) 네이티브 공유 → 클립보드 → 다운로드
export async function shareCardImage(cardData) {
  const canvas = renderShareCard(cardData);
  const dataUrl = canvas.toDataURL("image/png");

  // 1) 토스 앱: 기기 갤러리에 저장
  const base64 = dataUrl.split(",")[1];
  if ((await saveImageBase64(base64)) === "saved") return "saved";

  // 2) 브라우저 폴백
  const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
  if (!blob) return "failed";

  const file = new File([blob], "stockjeokrib.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (e) {
      if (e.name === "AbortError") return "cancelled";
    }
  }

  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return "copied";
  } catch {}

  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = "주식적립왕.png";
  a.click();
  return "downloaded";
}
