export type AppTab = "discovery" | "browse" | "installed" | "settings";

const TABS: { id: AppTab; label: string; icon: string }[] = [
  { id: "discovery", label: "Discovery", icon: "◆" },
  { id: "browse", label: "Browse", icon: "▦" },
  { id: "installed", label: "Installed", icon: "✓" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

type Props = {
  tab: AppTab;
  onTab: (t: AppTab) => void;
};

export function SideNav({ tab, onTab }: Props) {
  return (
    <nav className="harbor-nav" aria-label="Main">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`harbor-nav-btn ${tab === t.id ? "active" : ""}`}
          onClick={() => onTab(t.id)}
        >
          <span aria-hidden>{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
