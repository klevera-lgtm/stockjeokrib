import {
  IconDeviceAnalytics,
  IconCirclesRelation,
  IconChartPie,
  IconFlag,
  IconNews,
  IconUsers,
  IconList,
  IconCalculator,
  IconCalendar,
  IconPigMoney,
  IconWallet,
  IconArrowsExchange,
  IconRadar2,
  IconTrophy,
  IconChartCandle,
  IconBriefcase,
  IconActivityHeartbeat,
  IconUserStar,
} from "@tabler/icons-react";

export const ACCUMULATION_TABS = [
  { id: "strategy",  label: "시뮬레이션", Icon: IconDeviceAnalytics },
  { id: "combo",     label: "조합 탐색",  Icon: IconCirclesRelation },
  { id: "portfolio", label: "포트폴리오", Icon: IconChartPie },
  { id: "goal",      label: "목표 계산",  Icon: IconFlag },
  { id: "event",     label: "이벤트",     Icon: IconNews },
  { id: "others",    label: "남들은?",    Icon: IconUsers },
];

export const DIVIDEND_TABS = [
  { id: "ranking",       label: "배당 랭킹",  Icon: IconList },
  { id: "div-sim",       label: "배당 시뮬",  Icon: IconCalculator },
  { id: "calendar",      label: "월배당",     Icon: IconCalendar },
  { id: "retirement",    label: "은퇴 계산",  Icon: IconPigMoney },
  { id: "div-portfolio", label: "포트폴리오", Icon: IconWallet },
  { id: "div-compare",   label: "배당vs성장", Icon: IconArrowsExchange },
];

export const TRADING_TABS = [
  { id: "trade-breadth",   label: "시장온도",   Icon: IconActivityHeartbeat },
  { id: "trade-scanner",   label: "스캐너",     Icon: IconRadar2 },
  { id: "trade-ranking",   label: "알파",        Icon: IconTrophy },
  { id: "trade-sim",       label: "시뮬레이션", Icon: IconChartCandle },
  { id: "trade-portfolio", label: "포트폴리오", Icon: IconBriefcase },
  { id: "trade-insider",  label: "내부자",     Icon: IconUserStar },
];

export default function TabBar({ activeTab, onTabChange, tabs = ACCUMULATION_TABS }) {
  return (
    <nav className="tabbar">
      {tabs.map(({ id, label, Icon }) => (
        <button
          key={id}
          className={`tabbar-item${activeTab === id ? " active" : ""}`}
          onClick={() => onTabChange(id)}
        >
          <Icon size={22} stroke={1.5} className="tabbar-icon" aria-hidden="true" />
          <span className="tabbar-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
