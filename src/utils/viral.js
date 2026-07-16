import { contactsViral } from "@apps-in-toss/web-framework";
import { VIRAL_MODULE_ID } from "./tossConfig.js";

// 토스 공유 리워드(친구 초대) 모듈 열기
// onReward({ rewardAmount, rewardUnit }) — 공유 완료마다 호출
// onClose({ closeReason, sentRewardsCount, ... }) — 모듈 종료 시 호출
export function openContactsViral({ onReward, onClose, onError } = {}) {
  if (!VIRAL_MODULE_ID) {
    onError?.(new Error("공유 리워드 모듈 ID가 설정되지 않았어요."));
    return false;
  }
  let cleanup = null;
  try {
    cleanup = contactsViral({
      options: { moduleId: VIRAL_MODULE_ID },
      onEvent: (event) => {
        if (event.type === "sendViral") {
          onReward?.(event.data);
        } else if (event.type === "close") {
          onClose?.(event.data);
          cleanup?.();
        }
      },
      onError: (error) => {
        onError?.(error);
        cleanup?.();
      },
    });
    return true;
  } catch (error) {
    onError?.(error);
    return false;
  }
}
