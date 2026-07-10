import { getTickerMeta } from "../utils/tickerMeta.js";
import { getTickerLabel } from "../utils/tickers.js";

export default function TickerInfoCard({ ticker }) {
  if (!ticker) return null;
  const meta = getTickerMeta(ticker);
  const label = getTickerLabel(ticker);
  const displayName = meta?.name ?? (label !== ticker ? label : null);
  if (!displayName && !meta?.desc) return null;

  return (
    <div className="ticker-info-card">
      <div className="ticker-info-header">
        <span className="ticker-info-sym">{ticker}</span>
        {displayName && <span className="ticker-info-name">{displayName}</span>}
      </div>
      {meta?.desc && <p className="ticker-info-desc">{meta.desc}</p>}
    </div>
  );
}
