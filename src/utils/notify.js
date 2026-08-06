// 푸시 알림 동의 (앱인토스 requestNotificationAgreement) 래퍼.
// 콘솔에서 알림 템플릿을 만들어 templateCode를 tossConfig에 넣어야 동작해요.
// 실기기 토스앱에서만 실제 동의 UI가 떠요(브라우저·미설정 시 조용히 미지원 처리).
import { requestNotificationAgreement } from "@apps-in-toss/web-framework";
import { NOTIFICATION_TEMPLATE_CODE } from "./tossConfig.js";

const CONSENT_KEY = "ait_notify_consent"; // "granted" | "declined"

export function notifyConsent() {
  try { return localStorage.getItem(CONSENT_KEY); } catch { return null; }
}
function setConsent(v) { try { localStorage.setItem(CONSENT_KEY, v); } catch {} }

// 알림 기능을 쓸 수 있는 환경인지 (템플릿 코드 있고 네이티브 지원)
export function notifySupported() {
  if (!NOTIFICATION_TEMPLATE_CODE) return false;
  try {
    const s = requestNotificationAgreement?.isSupported;
    return typeof s === "function" ? s() : true;
  } catch { return false; }
}

// 알림 동의 UI 요청. 반환: Promise<"granted" | "declined" | "error">
export function requestNotify() {
  return new Promise((resolve) => {
    if (!notifySupported()) { resolve("error"); return; }
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      requestNotificationAgreement({
        options: { templateCode: NOTIFICATION_TEMPLATE_CODE },
        onEvent: (r) => {
          // 'newAgreement' | 'alreadyAgreed' = 동의, 'agreementRejected' = 거절
          const granted = r?.type === "newAgreement" || r?.type === "alreadyAgreed";
          setConsent(granted ? "granted" : "declined");
          finish(granted ? "granted" : "declined");
        },
        onError: () => finish("error"),
      });
    } catch { finish("error"); }
  });
}
