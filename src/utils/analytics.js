import { Analytics } from "@apps-in-toss/web-framework";

// 토스 콘솔 '분석 > 이벤트'에 기록되는 로그.
// 토스 앱 밖(브라우저)에서는 조용히 무시돼요.

export function logScreen(name, params = {}) {
  try { Analytics.screen({ log_name: name, ...params }); } catch {}
}

export function logClick(name, params = {}) {
  try { Analytics.click({ button_name: name, ...params }); } catch {}
}

export function logImpression(id, params = {}) {
  try { Analytics.impression({ item_id: id, ...params }); } catch {}
}
