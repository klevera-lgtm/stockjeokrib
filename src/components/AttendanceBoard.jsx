import { useState } from "react";
import { getStreakInfo, claimStreakReward, isBasic, STREAK_BONUS, STREAK_MILESTONE } from "../utils/premium.js";
import { logClick } from "../utils/analytics.js";

export default function AttendanceBoard({ onCoinsChanged }) {
  const [info, setInfo] = useState(() => getStreakInfo());
  const [justClaimed, setJustClaimed] = useState(0);
  const basic = isBasic();

  const count = info.count || 0;
  if (count < 1) return null;

  const cyclePos = ((count - 1) % STREAK_MILESTONE) + 1; // 이번 7일 주기에서 오늘 위치 (1~7)
  const canClaim = !basic && info.reward > 0 && !info.claimedToday;

  function claim() {
    const res = claimStreakReward();
    if (res.amount > 0) { setJustClaimed(res.amount); onCoinsChanged?.(); }
    setInfo(getStreakInfo());
    logClick("streak_claim", { count: res.count, amount: res.amount });
  }

  return (
    <div className="att">
      <div className="att-head">
        <span className="att-title">🔥 {count}일 연속 출석</span>
        {!basic && (info.daysToBonus > 0
          ? <span className="att-sub">{info.daysToBonus}일 더 오면 🪙 +{STREAK_BONUS}</span>
          : <span className="att-sub">🎉 {STREAK_MILESTONE}일 달성!</span>)}
      </div>

      <div className="att-stamps">
        {Array.from({ length: STREAK_MILESTONE }, (_, i) => {
          const day = i + 1;
          const done = day <= cyclePos;
          const isToday = day === cyclePos;
          const isBonus = day === STREAK_MILESTONE;
          const cls = `att-stamp${done ? " done" : ""}${isToday ? " today" : ""}${isBonus ? " bonus" : ""}`;
          return (
            <div key={day} className={cls}>
              {isBonus ? (done ? "🎉" : "🎁") : done ? "✓" : day}
            </div>
          );
        })}
      </div>

      {canClaim ? (
        <button className="att-claim" onClick={claim}>
          오늘 출석 도장 찍고 🪙 +{info.reward} 받기
        </button>
      ) : (
        <p className="att-done">
          {justClaimed > 0
            ? `🎉 출석 완료! 🪙 +${justClaimed} 받았어요`
            : "오늘 출석 완료 ✓"}
        </p>
      )}
    </div>
  );
}
