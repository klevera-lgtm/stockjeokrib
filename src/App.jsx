import { useState, useEffect, useCallback, useRef } from "react";
import TabBar, { ACCUMULATION_TABS, DIVIDEND_TABS, TRADING_TABS } from "./components/TabBar.jsx";
import Disclaimer from "./components/Disclaimer.jsx";
import StrategyResult from "./components/StrategyResult.jsx";
import ComboBacktest from "./components/ComboBacktest.jsx";
import GoalCalculator from "./components/GoalCalculator.jsx";
import EventExplorer from "./components/EventExplorer.jsx";
import WhatOthersBuy from "./components/WhatOthersBuy.jsx";
import MyPortfolio from "./components/MyPortfolio.jsx";
import DividendRanking from "./components/DividendRanking.jsx";
import DividendSimulator from "./components/DividendSimulator.jsx";
import MonthlyCalendar from "./components/MonthlyCalendar.jsx";
import RetirementCalc from "./components/RetirementCalc.jsx";
import DividendPortfolio from "./components/DividendPortfolio.jsx";
import DividendVsGrowth from "./components/DividendVsGrowth.jsx";
import TradingSimulation from "./components/TradingSimulation.jsx";
import TradingScanner from "./components/TradingScanner.jsx";
import TradingRanking from "./components/TradingRanking.jsx";
import TradingPortfolio from "./components/TradingPortfolio.jsx";
import MarketBreadth from "./components/MarketBreadth.jsx";
import OnboardingModal, { isOnboardDone } from "./components/OnboardingModal.jsx";
import InvestTypeTest from "./components/InvestTypeTest.jsx";
import CoinShopModal from "./components/CoinShopModal.jsx";
import RewardedAdBanner from "./components/RewardedAdBanner.jsx";
import InsightCard from "./components/InsightCard.jsx";
import { loadPrices, prefetchTickers } from "./utils/dataLoader.js";
import { precomputeFeaturedCombos } from "./utils/comboResultCache.js";
import { logScreen, logClick } from "./utils/analytics.js";
import { initPaidCoins } from "./utils/coinsApi.js";
import { getQueryBalance, isBasic, getStreakInfo, STREAK_BONUS } from "./utils/premium.js";
import "./App.css";

const PREFETCH_SEEDS = ["SPY", "QQQ", "NVDA", "AAPL", "TSLA", "VOO", "IVV", "TQQQ", "SOXL", "TLT"];
const SECTION_KEY = "ait_section";

function loadSection() {
  try { return localStorage.getItem(SECTION_KEY) || "accumulation"; } catch { return "accumulation"; }
}

export default function App() {
  const [section, setSection] = useState(loadSection);
  const [activeTab, setActiveTab] = useState(() => {
    const s = loadSection();
    return s === "dividend" ? "ranking" : s === "trading" ? "trade-breadth" : "strategy";
  });
  const [jumpTicker, setJumpTicker] = useState(null);
  const [showOnboard, setShowOnboard] = useState(() => !isOnboardDone());
  const [showTest, setShowTest] = useState(false);
  const [comboFocus, setComboFocus] = useState(null);
  const [showCoinShop, setShowCoinShop] = useState(false);
  const [coinBalance, setCoinBalance] = useState(() => getQueryBalance());
  const [favToast, setFavToast] = useState(null);
  const basic = isBasic();

  const refreshCoins = useCallback(() => setCoinBalance(getQueryBalance()), []);

  function switchSection(newSection) {
    if (newSection === section) return;
    logClick("section_switch", { to: newSection });
    setSection(newSection);
    try { localStorage.setItem(SECTION_KEY, newSection); } catch {}
    const defaultTab = newSection === "dividend" ? "ranking" : newSection === "trading" ? "trade-breadth" : "strategy";
    setActiveTab(defaultTab);
  }

  const handleNavigate = useCallback((targetSection, targetTab, data) => {
    logClick("cross_nav", { to: `${targetSection}/${targetTab}` });
    setSection(targetSection);
    try { localStorage.setItem(SECTION_KEY, targetSection); } catch {}
    setActiveTab(targetTab);
    if (targetSection === "accumulation" && data?.ticker) {
      setJumpTicker(data.ticker);
    }
    window.scrollTo(0, 0);
  }, []);

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

  function handleTestRoute(route) {
    if (route.section === "dividend") {
      switchSection("dividend");
      return;
    }
    if (route.section === "trading") {
      switchSection("trading");
      return;
    }
    if (route.tab === "combo") {
      setComboFocus({ leverage: !!route.leverage, section: route.section, ts: Date.now() });
    }
    setActiveTab(route.tab);
  }

  useEffect(() => {
    initPaidCoins();

    const timer = setTimeout(() => prefetchTickers(PREFETCH_SEEDS), 2000);

    fetch("/featuredCombos.json")
      .then((r) => r.json())
      .then(async (data) => {
        const allTickers = [...new Set(
          Object.values(data.combos ?? {}).flatMap((periodObj) =>
            Object.values(periodObj).flatMap((combo) => combo?.tickers ?? [])
          )
        )];

        await new Promise((r) => setTimeout(r, 1000));
        await Promise.all(allTickers.map((t) => loadPrices(t).catch(() => null)));
        await precomputeFeaturedCombos(data);
      })
      .catch(() => {});

    return () => clearTimeout(timer);
  }, []);

  function handleOthersTickerSelect(ticker) {
    setJumpTicker(ticker);
    setActiveTab("strategy");
  }

  function handleDividendTickerSelect(ticker) {
    handleNavigate("accumulation", "strategy", { ticker });
  }

  function renderContent() {
    if (section === "dividend") {
      switch (activeTab) {
        case "ranking":       return <DividendRanking onTickerSelect={handleDividendTickerSelect} onNavigate={handleNavigate} />;
        case "div-sim":       return <DividendSimulator onCoinsChanged={refreshCoins} onNavigate={handleNavigate} />;
        case "calendar":      return <MonthlyCalendar onCoinsChanged={refreshCoins} />;
        case "retirement":    return <RetirementCalc onCoinsChanged={refreshCoins} onNavigate={handleNavigate} />;
        case "div-portfolio": return <DividendPortfolio onCoinsChanged={refreshCoins} onNavigate={handleNavigate} />;
        case "div-compare":   return <DividendVsGrowth onCoinsChanged={refreshCoins} onNavigate={handleNavigate} />;
        default:              return <DividendRanking onTickerSelect={handleDividendTickerSelect} onNavigate={handleNavigate} />;
      }
    }
    if (section === "trading") {
      switch (activeTab) {
        case "trade-breadth":   return <MarketBreadth onCoinsChanged={refreshCoins} />;
        case "trade-sim":       return <TradingSimulation onCoinsChanged={refreshCoins} onNavigate={handleNavigate} />;
        case "trade-scanner":   return <TradingScanner onNavigate={handleNavigate} />;
        case "trade-ranking":   return <TradingRanking onCoinsChanged={refreshCoins} onNavigate={handleNavigate} />;
        case "trade-portfolio": return <TradingPortfolio onCoinsChanged={refreshCoins} onNavigate={handleNavigate} />;
        default:                return <MarketBreadth onCoinsChanged={refreshCoins} />;
      }
    }
    switch (activeTab) {
      case "strategy":
        return <StrategyResult key={jumpTicker} initialTicker={jumpTicker} onOpenTest={() => setShowTest(true)} onNavigate={handleNavigate} />;
      case "combo":
        return <ComboBacktest focus={comboFocus} onNavigate={handleNavigate} />;
      case "portfolio":
        return <MyPortfolio onNavigate={handleNavigate} />;
      case "goal":
        return <GoalCalculator onNavigate={handleNavigate} />;
      case "event":
        return <EventExplorer />;
      case "others":
        return <WhatOthersBuy onTickerSelect={handleOthersTickerSelect} />;
      default:
        return null;
    }
  }

  const currentTabs = section === "trading" ? TRADING_TABS : section === "dividend" ? DIVIDEND_TABS : ACCUMULATION_TABS;

  return (
    <div className="app">
      {/* Section toggle */}
      <div className="section-toggle-bar">
        <div className="section-toggle">
          <button
            className={`section-btn${section === "trading" ? " active" : ""}`}
            onClick={() => switchSection("trading")}
          >
            거래
          </button>
          <button
            className={`section-btn${section === "accumulation" ? " active" : ""}`}
            onClick={() => switchSection("accumulation")}
          >
            적립
          </button>
          <button
            className={`section-btn${section === "dividend" ? " active" : ""}`}
            onClick={() => switchSection("dividend")}
          >
            배당
          </button>
        </div>
      </div>

      <div className="content-area">
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
            {(() => {
              const s = getStreakInfo();
              return s.count >= 2 && (
                <span className="streak-global">
                  {s.bonusToday
                    ? `🔥 ${s.count}일 연속 · 보너스 +${STREAK_BONUS} 받음!`
                    : `🔥 ${s.count}일 연속 · ${s.daysToBonus}일 후 +${STREAK_BONUS}`}
                </span>
              );
            })()}
          </div>
        )}
        {!basic && <RewardedAdBanner onEarned={refreshCoins} />}
        <InsightCard onNavigate={handleNavigate} />
        <div className="view-transition" key={`${section}-${activeTab}`}>
          {renderContent()}
        </div>
        <Disclaimer />
      </div>
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} tabs={currentTabs} />
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
