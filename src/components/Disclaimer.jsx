import { useRef, useState } from "react";

// 오너 전용 히든 스위치: 면책 문구 첫 줄을 1.2초 안에 7번 탭하면
// 광고 미리보기(__previewAds) ON/OFF. 베이직이어도 배너 슬롯이 렌더돼서
// 실기기 토스앱에서 배너가 뜨는지 눈으로 확인할 수 있어요.
export default function Disclaimer() {
  const tapRef = useRef({ count: 0, timer: null });
  const [toast, setToast] = useState("");
  let previewOn = false;
  try { previewOn = localStorage.getItem("__previewAds") === "1"; } catch {}

  function handleSecretTap() {
    const t = tapRef.current;
    t.count += 1;
    clearTimeout(t.timer);
    t.timer = setTimeout(() => { t.count = 0; }, 1200);
    if (t.count < 7) return;
    t.count = 0;
    clearTimeout(t.timer);
    try {
      const on = localStorage.getItem("__previewAds") === "1";
      if (on) localStorage.removeItem("__previewAds");
      else localStorage.setItem("__previewAds", "1");
      setToast(on ? "🔧 광고 미리보기 OFF" : "🔧 광고 미리보기 ON · 새로고침돼요");
      setTimeout(() => { try { location.reload(); } catch {} }, 900);
    } catch {}
  }

  return (
    <div className="disclaimer">
      <p className="disclaimer-lead" onClick={handleSecretTap}>
        본 서비스는 투자 자문이 아닌 정보 제공 목적이며, 투자 판단과 그에 따른 손실은 이용자 본인에게 귀속됩니다.
      </p>
      <p><strong>백테스트 한계</strong> 시뮬레이션 결과는 과거 데이터를 기반으로 한 가상의 수익률이며, 미래 수익률을 보장하지 않습니다. 매수 시 거래 비용(수수료 + 환전 스프레드) 0.35%가 반영되어 있으며, 세금은 반영되지 않습니다.</p>
      <p><strong>데이터 출처</strong> 주가 데이터는 공개 시장 데이터를 기반으로 하며, 실시간이 아닙니다. 수치는 참고용이며 실제 거래 가격과 다를 수 있습니다.</p>
      <p><strong>갱신 주기</strong> 주가는 미국·한국 증시의 직전 거래일 종가 기준이며 매일 오전 7시(KST)에 갱신돼요. 전략 랭킹·조합은 주 1회 갱신됩니다. 실시간 시세가 아니에요.</p>
      <p>본 앱은 자본시장법상 투자자문업·투자일임업으로 등록되어 있지 않으며, 특정 종목의 매수·매도를 권유하지 않습니다.</p>
      {toast && <div className="preview-toast">{toast}</div>}
      {previewOn && <div className="preview-badge">🔧 광고 미리보기 ON · 문구 7번 탭하면 끄기</div>}
    </div>
  );
}
