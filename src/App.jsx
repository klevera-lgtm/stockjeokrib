import { useState, useEffect, useCallback } from "react";
import {
  IconHome, IconCompass, IconBriefcase, IconArrowLeft,
  IconActivityHeartbeat, IconRadar2, IconTrophy, IconUserStar,
  IconList, IconCalendar, IconCirclesRelation, IconNews, IconUsers,
} from "@tabler/icons-react";
import Disclaimer from "./components/Disclaimer.jsx";
import Home from "./components/Home.jsx";
import TickerDetail from "./components/TickerDetail.jsx";
import StrategyResult from "./components/StrategyResult.jsx";
import ComboBacktest from "./components/ComboBacktest.jsx";
import GoalCalculator from "./components/GoalCalculator.jsx";
import EventExplorer from "./components/EventExplorer.jsx";
import WhatOthersBuy from "./components/WhatOthersBuy.jsx";
import MyStocks from "./components/MyStocks.jsx";
import DividendRanking from "./components/DividendRanking.jsx";
import DividendSimulator from "./components/DividendSimulator.jsx";
import MonthlyCalendar from "./components/MonthlyCalendar.jsx";
import RetirementCalc from "./components/RetirementCalc.jsx";
import DividendVsGrowth from "./components/DividendVsGrowth.jsx";
import TradingSimulation from "./components/TradingSimulation.jsx";
import TradingScanner from "./components/TradingScanner.jsx";
import TradingRanking from "./components/TradingRanking.jsx";
import MarketBreadth from "./components/MarketBreadth.jsx";
import InsiderTrading from "./components/InsiderTrading.jsx";
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

const NAV_TABS = [
  { id: "home",     label: "홈",     Icon: IconHome },
  { id: "discover", label: "발견",   Icon: IconCompass },
  { id: "my",       label: "내 종목", Icon: IconBriefcase },
];

const DISCOVER_FEATURES = [
  { id: "breadth",     label: "시장 온도",   desc: "오늘 시장이 강세인지 약세인지",     Icon: IconActivityHeartbeat },
  { id: "scanner",     label: "스캐너",      desc: "조건을 충족한 종목 탐색",         Icon: IconRadar2 },
  { id: "alpha",       label: "알파 전략",   desc: "바이앤홀드를 이긴 전략 찾기",     Icon: IconTrophy },
  { id: "insider",     label: "내부자 거래", desc: "기업 임원의 자사주 매매 공시",     Icon: IconUserStar },
  { id: "div-ranking", label: "배당 랭킹",   desc: "배당 수익률 순위",               Icon: IconList },
  { id: "calendar",    label: "월배당 캘린더", desc: "달마다 배당 주는 종목",         Icon: IconCalendar },
  { id: "combo",       label: "조합 탐색",   desc: "종목을 섞은 최적 적립 조합",       Icon: IconCirclesRelation },
  { id: "event",       label: "이벤트",      desc: "급락·신고가 등 이벤트 탐색",       Icon: IconNews },
  { id: "others",      label: "남들은?",     desc: "다른 사람들이 많이 본 종목",       Icon: IconUsers },
];

export default function App() {
  const [view, setView] = useState("home");              // home | detail | discover | my
  const [detailTicker, setDetailTicker] = useState(null);
  const [detailTab, setDetailTab] = useState("acc");     // acc | trade | div
  const [discoverFeature, setDiscoverFeature] = useState(null); // null = 발견 메뉴
  const [comboFocus, setComboFocus] = useState(null);

  const [showOnboard, setShowOnboard] = useState(() => !isOnboardDone());
  const [showTest, setShowTest] = useState(false);
  const [showCoinShop, setShowCoinShop] = useState(false);
  const [coinBalance, setCoinBalance] = useState(() => getQueryBalance());
  const basic = isBasic();

  const refreshCoins = useCallback(() => setCoinBalance(getQueryBalance()), []);

  const openDetail = useCallback((ticker, tab = "acc") => {
    if (!ticker) return;
    logClick("open_detail", { ticker, tab });
    setDetailTicker(ticker);
    setDetailTab(tab);
    setView("detail");
    window.scrollTo(0, 0);
  }, []);

  const handleNavigate = useCallback((targetSection, targetTab, data) => {
    logClick("cross_nav", { to: `${targetSection}/${targetTab}` });
    if (data?.ticker) {
      const tab = targetTab === "trade-sim" ? "trade" : targetSection === "dividend" ? "div" : "acc";
      openDetail(data.ticker, tab);
      return;
    }
    // 종목에 안 묶인 이동은 발견으로
    const map = {
      combo: "combo", event: "event", others: "others",
      "trade-breadth": "breadth", "trade-scanner": "scanner", "trade-ranking": "alpha",
      "trade-insider": "insider", ranking: "div-ranking", calendar: "calendar",
    };
    const feat = map[targetTab];
    if (feat) {
      if (targetTab === "combo") setComboFocus({ leverage: false, ts: Date.now() });
      setDiscoverFeature(feat);
      setView("discover");
      window.scrollTo(0, 0);
    }
  }, [openDetail]);

  function goNav(id) {
    setView(id);
    if (id === "discover") setDiscoverFeature(null);
    window.scrollTo(0, 0);
  }

  function handleTestRoute(route) {
    if (route.tab === "combo") {
      setComboFocus({ leverage: !!route.leverage, ts: Date.now() });
      setDiscoverFeature("combo");
      setView("discover");
    } else if (route.section === "dividend") {
      setDiscoverFeature("div-ranking");
      setView("discover");
    } else if (route.section === "trading") {
      setDiscoverFeature("breadth");
      setView("discover");
    } else {
      setView("home");
    }
    window.scrollTo(0, 0);
  }

  useEffect(() => {
    logScreen(`view_${view}${view === "discover" && discoverFeature ? `_${discoverFeature}` : ""}`);
    refreshCoins();
  }, [view, discoverFeature, refreshCoins]);

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

  function renderDiscoverFeature(id) {
    switch (id) {
      case "breadth":     return <MarketBreadth onCoinsChanged={refreshCoins} />;
      case "scanner":     return <TradingScanner onNavigate={handleNavigate} onCoinsChanged={refreshCoins} />;
      case "alpha":       return <TradingRanking onCoinsChanged={refreshCoins} onNavigate={handleNavigate} />;
      case "insider":     return <InsiderTrading onCoinsChanged={refreshCoins} onNavigate={handleNavigate} />;
      case "div-ranking": return <DividendRanking onTickerSelect={(t) => openDetail(t, "div")} onNavigate={handleNavigate} />;
      case "calendar":    return <MonthlyCalendar onCoinsChanged={refreshCoins} />;
      case "combo":       return <ComboBacktest focus={comboFocus} onNavigate={handleNavigate} />;
      case "event":       return <EventExplorer />;
      case "others":      return <WhatOthersBuy onTickerSelect={(t) => openDetail(t, "acc")} />;
      default:            return null;
    }
  }

  function renderContent() {
    if (view === "detail" && detailTicker) {
      return (
        <TickerDetail
          key={detailTicker}
          ticker={detailTicker}
          initialTab={detailTab}
          onBack={() => goNav("home")}
          onCoinsChanged={refreshCoins}
          onNavigate={handleNavigate}
        />
      );
    }
    if (view === "discover") {
      if (discoverFeature) {
        const feat = DISCOVER_FEATURES.find((f) => f.id === discoverFeature);
        return (
          <div className="discover-feature">
            <div className="td-header">
              <button className="td-back" onClick={() => { setDiscoverFeature(null); window.scrollTo(0, 0); }} aria-label="뒤로가기">
                <IconArrowLeft size={22} stroke={1.8} />
              </button>
              <div className="td-title"><span className="td-title-sym">{feat?.label}</span></div>
            </div>
            {renderDiscoverFeature(discoverFeature)}
          </div>
        );
      }
      return (
        <div className="discover">
          <div className="home-hero">
            <h1 className="home-title">발견</h1>
            <p className="home-sub">종목에 얽매이지 않는 시장·랭킹·신호 도구예요</p>
          </div>
          <div className="discover-grid">
            {DISCOVER_FEATURES.map(({ id, label, desc, Icon }) => (
              <button key={id} className="discover-card" onClick={() => { logClick("discover_open", { feature: id }); setDiscoverFeature(id); window.scrollTo(0, 0); }}>
                <span className="discover-card-icon"><Icon size={24} stroke={1.6} /></span>
                <span className="discover-card-text">
                  <strong>{label}</strong>
                  <span>{desc}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      );
    }
    if (view === "my") {
      return <MyStocks onOpenDetail={openDetail} onNavigate={handleNavigate} />;
    }
    return <Home onSelectTicker={(t) => openDetail(t, "acc")} />;
  }

  const navActive = view === "detail" ? "home" : view;

  return (
    <div className="app">
      <div className="content-area">
        {!basic && (
          <div className="coin-chip-bar">
            <button className="coin-chip" onClick={() => { logClick("coin_chip_open"); setShowCoinShop(true); }}>
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
        {view === "home" && <InsightCard onNavigate={handleNavigate} />}
        <div className="view-transition" key={`${view}-${detailTicker}-${discoverFeature}`}>
          {renderContent()}
        </div>
        <Disclaimer />
      </div>

      <nav className="tabbar">
        {NAV_TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`tabbar-item${navActive === id ? " active" : ""}`}
            onClick={() => goNav(id)}
          >
            <Icon size={22} stroke={1.5} className="tabbar-icon" aria-hidden="true" />
            <span className="tabbar-label">{label}</span>
          </button>
        ))}
      </nav>

      {showOnboard && (
        <OnboardingModal
          onClose={() => setShowOnboard(false)}
          onStartTest={() => { setShowOnboard(false); setShowTest(true); }}
        />
      )}
      {showTest && <InvestTypeTest onClose={() => setShowTest(false)} onRoute={handleTestRoute} />}
      {showCoinShop && (
        <CoinShopModal
          onClose={() => { setShowCoinShop(false); refreshCoins(); }}
          onPurchased={refreshCoins}
        />
      )}
    </div>
  );
}
