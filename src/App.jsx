import { useState, useEffect } from "react";
import TabBar from "./components/TabBar.jsx";
import Disclaimer from "./components/Disclaimer.jsx";
import StrategyResult from "./components/StrategyResult.jsx";
import ComboBacktest from "./components/ComboBacktest.jsx";
import GoalCalculator from "./components/GoalCalculator.jsx";
import EventExplorer from "./components/EventExplorer.jsx";
import WhatOthersBuy from "./components/WhatOthersBuy.jsx";
import MyPortfolio from "./components/MyPortfolio.jsx";
import { prefetchTickers } from "./utils/dataLoader.js";
import "./App.css";

// 앱 시작 시 자주 쓰이는 티커 백그라운드 프리페치
const PREFETCH_SEEDS = ["SPY", "QQQ", "NVDA", "AAPL", "TSLA", "VOO", "IVV", "TQQQ", "SOXL", "TLT"];

export default function App() {
  const [activeTab, setActiveTab] = useState("strategy");
  const [jumpTicker, setJumpTicker] = useState(null);

  useEffect(() => {
    // 인기 티커 프리페치 (2초 지연으로 초기 렌더 방해 안 함)
    const timer = setTimeout(() => prefetchTickers(PREFETCH_SEEDS), 2000);

    // 추천 조합 티커도 프리페치
    fetch("/featuredCombos.json")
      .then((r) => r.json())
      .then((data) => {
        const tickers = new Set();
        Object.values(data.combos ?? {}).forEach((periodObj) =>
          Object.values(periodObj).forEach((combo) =>
            combo?.tickers?.forEach((t) => tickers.add(t))
          )
        );
        setTimeout(() => prefetchTickers([...tickers]), 4000);
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
        return <StrategyResult key={jumpTicker} initialTicker={jumpTicker} />;
      case "combo":
        return <ComboBacktest />;
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
        {renderContent()}
        <Disclaimer />
      </div>
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
