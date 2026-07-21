import { useState, useEffect, useCallback } from "react";
import TabBar from "./components/TabBar.jsx";
import Disclaimer from "./components/Disclaimer.jsx";
import StrategyResult from "./components/StrategyResult.jsx";
import ComboBacktest from "./components/ComboBacktest.jsx";
import GoalCalculator from "./components/GoalCalculator.jsx";
import EventExplorer from "./components/EventExplorer.jsx";
import WhatOthersBuy from "./components/WhatOthersBuy.jsx";
import MyPortfolio from "./components/MyPortfolio.jsx";
import OnboardingModal, { isOnboardDone } from "./components/OnboardingModal.jsx";
import InvestTypeTest from "./components/InvestTypeTest.jsx";
import CoinShopModal from "./components/CoinShopModal.jsx";
import { loadPrices, prefetchTickers } from "./utils/dataLoader.js";
import { precomputeFeaturedCombos } from "./utils/comboResultCache.js";
import { logScreen, logClick } from "./utils/analytics.js";
import { initPaidCoins } from "./utils/coinsApi.js";
import { getQueryBalance, isBasic } from "./utils/premium.js";
import "./App.css";

// 앱 시작 시 자주 쓰이는 티커 백그라운드 프리페치
const PREFETCH_SEEDS = ["SPY", "QQQ", "NVDA", "AAPL", "TSLA", "VOO", "IVV", "TQQQ", "SOXL", "TLT"];

export default function App() {
  const [activeTab, setActiveTab] = useState("strategy");
  const [jumpTicker, setJumpTicker] = useState(null);
  const [showOnboard, setShowOnboard] = useState(() => !isOnboardDone());
  const [showTest, setShowTest] = useState(false);
  const [comboFocus, setComboFocus] = useState(null);
  const [showCoinShop, setShowCoinShop] = useState(false);
  const [coinBalance, setCoinBalance] = useState(() => getQueryBalance());
  const [favToast, setFavToast] = useState(null);
  const basic = isBasic();

  const refreshCoins = useCallback(() => setCoinBalance(getQueryBalance()), []);

  const FAV_TOAST_KEY = "ait_fav_toast_shown";
  function showFavToast() {
    try { if (localStorage.getItem(FAV_TOAST_KEY)) return; } catch {}
    try { localStorage.setItem(FAV_TOAST_KEY, "1"); } catch {}
    setFavToast("⭐ 상단 ☆를 누르면 토스 홈에서 바로 열 수 있어요");
    setTimeout(() => setFavToast(null), 4000);
  }

  useEffect(() => {
    logScreen(`tab_${activeTab}`);
    refreshCoins();
  }, [activeTab, refreshCoins]);

  // 성향 테스트 결과 → 해당 기능으로 라우팅
  function handleTestRoute(route) {
    if (route.tab === "combo") {
      setComboFocus({ leverage: !!route.leverage, section: route.section, ts: Date.now() });
    }
    setActiveTab(route.tab);
  }

  useEffect(() => {
    // 구매 코인 서버 잔액 복원 (기기 변경 대응)
    initPaidCoins();

    // 인기 티커 프리페치 (2초 지연으로 초기 렌더 방해 안 함)
    const timer = setTimeout(() => prefetchTickers(PREFETCH_SEEDS), 2000);

    // 추천 조합: 티커 프리페치 → 결과 미리 계산
    fetch("/featuredCombos.json")
      .then((r) => r.json())
      .then(async (data) => {
        const allTickers = [...new Set(
          Object.values(data.combos ?? {}).flatMap((periodObj) =>
            Object.values(periodObj).flatMap((combo) => combo?.tickers ?? [])
          )
        )];

        // 초기 렌더 후 프리페치 시작
        await new Promise((r) => setTimeout(r, 1000));
        await Promise.all(allTickers.map((t) => loadPrices(t).catch(() => null)));

        // 가격 로드 완료 → 결과 미리 계산 (클릭 즉시 표시용)
        await precomputeFeaturedCombos(data);
      })
      .catch(() => {});

    return () => clearTimeout(timer);
  }, []);

  function handleOthersTickerSelect(ticker) {
    setJumpTicker(ticker);
    setActiveTab("strategy");
  }

  function renderContent() {
    switch (activeTab) {
      case "strategy":
        return <StrategyResult key={jumpTicker} initialTicker={jumpTicker} onOpenTest={() => setShowTest(true)} />;
      case "combo":
        return <ComboBacktest focus={comboFocus} />;
      case "portfolio":
        return <MyPortfolio />;
      case "goal":
        return <GoalCalculator />;
      case "event":
        return <EventExplorer />;
      case "others":
        return <WhatOthersBuy onTickerSelect={handleOthersTickerSelect} />;
      default:
        return null;
    }
  }

  return (
    <div className="app">
      <div className="content-area">
        {/* 코인 잔액 칩 — 콘텐츠 최상단, 네비바 아래 */}
        {!basic && (
          <div className="coin-chip-bar">
            <button
              className="coin-chip"
              onClick={() => { logClick("coin_chip_open"); setShowCoinShop(true); }}
            >
              <span className="coin-chip-icon">🪙</span>
              {coinBalance === Infinity ? "∞" : coinBalance}
              <span className="coin-chip-plus">+</span>
            </button>
          </div>
        )}
        {renderContent()}
        <Disclaimer />
      </div>
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      {showOnboard && (
        <OnboardingModal
          onClose={() => { setShowOnboard(false); showFavToast(); }}
          onStartTest={() => { setShowOnboard(false); setShowTest(true); showFavToast(); }}
        />
      )}
      {showTest && <InvestTypeTest onClose={() => setShowTest(false)} onRoute={handleTestRoute} />}
      {showCoinShop && (
        <CoinShopModal
          onClose={() => { setShowCoinShop(false); refreshCoins(); }}
          onPurchased={refreshCoins}
        />
      )}
      {favToast && <div className="fav-toast">{favToast}</div>}
    </div>
  );
}
