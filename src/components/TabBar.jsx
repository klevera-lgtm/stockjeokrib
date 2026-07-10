const TABS = [
  { id: "strategy", label: "시뮬레이션", icon: "📈" },
  { id: "combo", label: "조합 탐색", icon: "🔀" },
  { id: "portfolio", label: "포트폴리오", icon: "💼" },
  { id: "goal", label: "목표 계산", icon: "🎯" },
  { id: "event", label: "이벤트", icon: "📅" },
  { id: "others", label: "남들은?", icon: "👥" },
];

export default function TabBar({ activeTab, onTabChange }) {
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`tabbar-item${activeTab === t.id ? " active" : ""}`}
          onClick={() => onTabChange(t.id)}
        >
          <span className="tabbar-icon">{t.icon}</span>
          <span className="tabbar-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
