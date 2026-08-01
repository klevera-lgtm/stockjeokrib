import { useState, useMemo } from "react";
import AdBanner from "./AdBanner.jsx";
import { logClick } from "../utils/analytics.js";

// 통화 무관 순수 계산 도구. 입력 단위(원/$)를 그대로 결과에 전달.
const num = (s) => {
  const v = parseFloat(String(s).replace(/,/g, ""));
  return Number.isFinite(v) ? v : NaN;
};
const fmtN = (n, d = 2) =>
  Number.isFinite(n)
    ? (Math.round(n * 10 ** d) / 10 ** d).toLocaleString("ko-KR", { maximumFractionDigits: d })
    : "—";

export default function AvgCostCalculator() {
  const [mode, setMode] = useState("blend"); // blend | target
  const [unit, setUnit] = useState("원");

  // ── 평단 계산 (여러 매수 블렌디드) ──
  const [lots, setLots] = useState([{ qty: "", price: "" }, { qty: "", price: "" }]);
  const setLot = (i, k, v) => setLots((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const addLot = () => setLots((ls) => [...ls, { qty: "", price: "" }]);
  const rmLot = (i) => setLots((ls) => ls.filter((_, j) => j !== i));

  const blend = useMemo(() => {
    let tq = 0, tc = 0;
    for (const l of lots) {
      const q = num(l.qty), p = num(l.price);
      if (q > 0 && p >= 0) { tq += q; tc += q * p; }
    }
    return tq > 0 ? { avg: tc / tq, qty: tq, cost: tc } : null;
  }, [lots]);

  // ── 목표 평단 역산 (물타기/불타기) ──
  const [hold, setHold] = useState({ qty: "", price: "" });
  const [target, setTarget] = useState("");
  const [buyPrice, setBuyPrice] = useState("");

  const goal = useMemo(() => {
    const N = num(hold.qty), P0 = num(hold.price), Pt = num(target), Pb = num(buyPrice);
    if (!(N > 0) || !(P0 > 0) || !(Pt > 0) || !(Pb > 0)) return null;
    if (Pt === P0) return { impossible: "보유 평단과 목표가 같아요" };
    const lowering = Pt < P0;
    const M = (N * (Pt - P0)) / (Pb - Pt);
    if (!(M > 0) || !Number.isFinite(M)) {
      return {
        impossible: lowering
          ? `평단을 낮추려면 목표 평단보다 싸게 매수해야 해요`
          : `평단을 높이려면 목표 평단보다 비싸게 매수해야 해요`,
        dir: lowering ? "down" : "up",
      };
    }
    return { M, amount: M * Pb, newQty: N + M, dir: lowering ? "down" : "up" };
  }, [hold, target, buyPrice]);

  const u = (v, d) => `${fmtN(v, d)} ${unit}`;

  return (
    <div className="avg">
      <p className="avg-sub">나눠 담으면 <strong>평단</strong>이 어떻게 될까? 🧮</p>

      <div className="avg-modes">
        <button className={`avg-mode${mode === "blend" ? " active" : ""}`} onClick={() => setMode("blend")}>평단 계산</button>
        <button className={`avg-mode${mode === "target" ? " active" : ""}`} onClick={() => setMode("target")}>목표 평단</button>
      </div>

      <div className="avg-unit">
        <span className="avg-unit-label">단위</span>
        {["원", "$"].map((x) => (
          <button key={x} className={`avg-unit-btn${unit === x ? " active" : ""}`} onClick={() => setUnit(x)}>{x}</button>
        ))}
      </div>

      {/* ── 평단 계산 ── */}
      {mode === "blend" && (
        <div className="avg-form">
          {lots.map((l, i) => (
            <div className="avg-lot" key={i}>
              <span className="avg-lot-n">{i + 1}차</span>
              <input className="avg-in" inputMode="decimal" placeholder="수량"
                value={l.qty} onChange={(e) => setLot(i, "qty", e.target.value)} />
              <span className="avg-x">×</span>
              <input className="avg-in" inputMode="decimal" placeholder="단가"
                value={l.price} onChange={(e) => setLot(i, "price", e.target.value)} />
              {lots.length > 2
                ? <button className="avg-rm" onClick={() => rmLot(i)} aria-label="삭제">×</button>
                : <span className="avg-rm-sp" />}
            </div>
          ))}
          <button className="avg-add" onClick={addLot}>+ 매수 추가</button>

          {blend ? (
            <div className="avg-result">
              <div className="avg-result-main">
                <span className="avg-result-cap">평균 단가</span>
                <span className="avg-result-big">{u(blend.avg)}</span>
              </div>
              <div className="avg-result-rows">
                <div className="avg-rrow"><span>총 수량</span><span>{fmtN(blend.qty, 4)}주</span></div>
                <div className="avg-rrow"><span>총 투자금</span><span>{u(blend.cost, 0)}</span></div>
              </div>
            </div>
          ) : (
            <p className="avg-hint">수량과 단가를 입력하면 평단이 계산돼요</p>
          )}
        </div>
      )}

      {/* ── 목표 평단 역산 ── */}
      {mode === "target" && (
        <div className="avg-form">
          <div className="avg-row2">
            <label className="avg-field"><span>보유 수량</span>
              <input className="avg-in" inputMode="decimal" placeholder="예: 10"
                value={hold.qty} onChange={(e) => setHold((h) => ({ ...h, qty: e.target.value }))} /></label>
            <label className="avg-field"><span>보유 평단</span>
              <input className="avg-in" inputMode="decimal" placeholder="예: 70000"
                value={hold.price} onChange={(e) => setHold((h) => ({ ...h, price: e.target.value }))} /></label>
          </div>
          <div className="avg-row2">
            <label className="avg-field"><span>목표 평단</span>
              <input className="avg-in" inputMode="decimal" placeholder="낮추거나 높일 평단"
                value={target} onChange={(e) => setTarget(e.target.value)} /></label>
            <label className="avg-field"><span>추가 매수 단가</span>
              <input className="avg-in" inputMode="decimal" placeholder="지금 살 가격"
                value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} /></label>
          </div>

          {goal?.M ? (
            <div className="avg-result">
              <div className="avg-result-main">
                <span className="avg-result-cap">{goal.dir === "down" ? "🩹 필요한 추가 매수" : "🔥 필요한 추가 매수"}</span>
                <span className="avg-result-big">{fmtN(goal.M, 2)}주</span>
              </div>
              <div className="avg-result-rows">
                <div className="avg-rrow"><span>필요 금액</span><span>{u(goal.amount, 0)}</span></div>
                <div className="avg-rrow"><span>매수 후 총 수량</span><span>{fmtN(goal.newQty, 2)}주</span></div>
                <div className="avg-rrow"><span>도달 평단</span><span>{u(num(target))}</span></div>
              </div>
            </div>
          ) : goal?.impossible ? (
            <p className="avg-warn">⚠️ {goal.impossible}</p>
          ) : (
            <p className="avg-hint">네 칸을 채우면 필요한 수량을 계산해요</p>
          )}
        </div>
      )}

      <AdBanner className="ad-banner-inline" />

      <div className="trade-disclaimer">
        ⚠️ 입력값 기준 단순 계산이에요 · 특정 종목의 매매를 권유하지 않습니다.
      </div>
    </div>
  );
}
