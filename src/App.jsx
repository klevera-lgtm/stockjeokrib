import { useState } from "react";
import TabBar from "./components/TabBar.jsx";
import Disclaimer from "./components/Disclaimer.jsx";
import StrategyResult from "./components/StrategyResult.jsx";
import ComboBacktest from "./components/ComboBacktest.jsx";
import GoalCalculator from "./components/GoalCalculator.jsx";
import EventExplorer from "./components/EventExplorer.jsx";
import WhatOthersBuy from "./components/WhatOthersBuy.jsx";
import MyPortfolio from "./components/MyPortfolio.jsx";
import "./App.css";

export default function App() {
  const [activeTab, setActiveTab] = useState("strategy");
  const [jumpTicker, setJumpTicker] = useState(null);

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
      <div className="content-area">{renderContent()}</div>
      <Disclaimer />
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
