const REVIEW_ASKED_KEY = "ait_review_asked";

// 공유까지 마친(만족한) 유저에게 딱 한 번만 리뷰 요청
export async function maybeRequestReview() {
  try {
    if (localStorage.getItem(REVIEW_ASKED_KEY)) return;
    const { requestReview } = await import("@apps-in-toss/web-framework");
    await requestReview();
    localStorage.setItem(REVIEW_ASKED_KEY, new Date().toISOString());
  } catch {
    // 토스 앱 밖 — 조용히 무시 (다음 기회에 다시 시도)
  }
}
