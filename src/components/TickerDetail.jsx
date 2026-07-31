import { useState, useEffect } from "react";
import { IconArrowLeft } from "@tabler/icons-react";
import StrategyResult from "./StrategyResult.jsx";
import TradingSimulation from "./TradingSimulation.jsx";
import DividendSimulator from "./DividendSimulator.jsx";
import TickerInfoCard from "./TickerInfoCard.jsx";
import { getTickerLabel } from "../utils/tickers.js";
import { loadDividendMeta } from "../utils/dividendData.js";
import { logClick } from "../utils/analytics.js";

const SUB_TABS = [
  { id: "acc",   label: "적립" },
  { id: "trade", label: "거래" },
  { id: "div",   label: "배당" },
];

export default function TickerDetail({ ticker, initialTab = "acc", onBack, onCoinsChanged, onNavigate }) {
  const [subTab, setSubTab] = useState(initialTab);
  const [hasDiv, setHasDiv] = useState(false);

  useEffect(() => {
    setSubTab(initialTab);
    let cancelled = false;
    loadDividendMeta()
      .then((meta) => { if (!cancelled) setHasDiv(!!meta?.[ticker]); })
      .catch(() => { if (!cancelled) setHasDiv(false); });
    return () => { cancelled = true; };
  }, [ticker, initialTab]);

  const label = getTickerLabel(ticker);
  const tabs = SUB_TABS.filter((t) => t.id !== "div" || hasDiv);

  return (
    <div className="ticker-detail">
      <div className="td-header">
        <button className="td-back" onClick={onBack} aria-label="뒤로가기">
          <IconArrowLeft size={22} stroke={1.8} />
        </button>
        <div className="td-title">
          <span className="td-title-sym">{ticker}</span>
          {label !== ticker && <span className="td-title-name">{label}</span>}
        </div>
      </div>

      <TickerInfoCard ticker={ticker} />

      <div className="td-subtabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`td-subtab${subTab === t.id ? " active" : ""}`}
            onClick={() => { setSubTab(t.id); logClick("td_subtab", { ticker, tab: t.id }); }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="td-body" key={`${ticker}-${subTab}`}>
        {subTab === "acc" && (
          <StrategyResult key={`acc-${ticker}`} initialTicker={ticker} embedded onNavigate={onNavigate} />
        )}
        {subTab === "trade" && (
          <TradingSimulation key={`trade-${ticker}`} initialTicker={ticker} onCoinsChanged={onCoinsChanged} />
        )}
        {subTab === "div" && hasDiv && (
          <DividendSimulator key={`div-${ticker}`} initialTicker={ticker} embedded onCoinsChanged={onCoinsChanged} onNavigate={onNavigate} />
        )}
      </div>
    </div>
  );
}
