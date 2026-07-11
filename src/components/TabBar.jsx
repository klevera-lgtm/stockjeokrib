import {
  IconDeviceAnalytics,
  IconCirclesRelation,
  IconChartPie,
  IconFlag,
  IconNews,
  IconUsers,
} from "@tabler/icons-react";

const TABS = [
  { id: "strategy",  label: "시뮬레이션", Icon: IconDeviceAnalytics },
  { id: "combo",     label: "조합 탐색",  Icon: IconCirclesRelation },
  { id: "portfolio", label: "포트폴리오", Icon: IconChartPie },
  { id: "goal",      label: "목표 계산",  Icon: IconFlag },
  { id: "event",     label: "이벤트",     Icon: IconNews },
  { id: "others",    label: "남들은?",    Icon: IconUsers },
];

export default function TabBar({ activeTab, onTabChange }) {
  return (
    <nav className="tabbar">
      {TABS.map(({ id, label, Icon }) => (
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
