import { share, openURL, saveBase64Data } from "@apps-in-toss/web-framework";

// 외부 URL/앱 열기 — 토스 WebView에서는 window.open이 막히므로 SDK openURL 사용
export async function openExternalUrl(url) {
  try {
    await openURL(url);
    return true;
  } catch {
    try { window.open(url, "_blank", "noopener,noreferrer"); } catch {}
    return false;
  }
}

// 텍스트 공유 — 토스 네이티브 공유 시트 (카톡 등 모든 앱 선택 가능)
export async function shareTextNative(message) {
  try {
    await share({ message });
    return "shared";
  } catch {
    // 토스 밖(브라우저) 폴백
    if (navigator.share) {
      try { await navigator.share({ text: message }); return "shared"; }
      catch (e) { if (e.name === "AbortError") return "cancelled"; }
    }
    try { await navigator.clipboard.writeText(message); return "copied"; } catch {}
    return "failed";
  }
}

// 이미지를 기기 갤러리에 저장 (토스) — 성공 시 "saved"
export async function saveImageBase64(base64, fileName = "stockjeokrib.png") {
  try {
    await saveBase64Data({ data: base64, fileName, mimeType: "image/png" });
    return "saved";
  } catch {
    return "failed";
  }
}
