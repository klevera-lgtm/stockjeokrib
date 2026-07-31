import TickerSearch from "./TickerSearch.jsx";
import { logClick } from "../utils/analytics.js";

export default function Home({ onSelectTicker }) {
  return (
    <div className="home">
      <div className="home-hero">
        <h1 className="home-title">어떤 종목이 궁금하세요?</h1>
        <p className="home-sub">종목을 검색하면 적립·거래·배당을 한눈에 볼 수 있어요</p>
      </div>
      <TickerSearch onSelect={(t) => { logClick("home_ticker", { ticker: t }); onSelectTicker?.(t); }} />
    </div>
  );
}
