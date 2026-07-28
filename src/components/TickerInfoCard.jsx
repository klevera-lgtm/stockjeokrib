import { useState, useEffect } from "react";
import { getTickerMeta } from "../utils/tickerMeta.js";
import { getTickerLabel } from "../utils/tickers.js";
import { loadPrices } from "../utils/dataLoader.js";
import MiniSparkline from "./MiniSparkline.jsx";

export default function TickerInfoCard({ ticker }) {
  const [spark, setSpark] = useState(null);

  useEffect(() => {
    if (!ticker) { setSpark(null); return; }
    loadPrices(ticker)
      .then((p) => setSpark(p.slice(-120)))
      .catch(() => setSpark(null));
  }, [ticker]);

  if (!ticker) return null;
  const meta = getTickerMeta(ticker);
  const label = getTickerLabel(ticker);
  const displayName = meta?.name ?? (label !== ticker ? label : null);
  if (!displayName && !meta?.desc) return null;

  return (
    <div className="ticker-info-card">
      <div className="ticker-info-header">
        <div className="ticker-info-left">
          <span className="ticker-info-sym">{ticker}</span>
          {displayName && <span className="ticker-info-name">{displayName}</span>}
        </div>
        {spark && <MiniSparkline prices={spark} width={80} height={28} />}
      </div>
      {meta?.desc && <p className="ticker-info-desc">{meta.desc}</p>}
    </div>
  );
}
