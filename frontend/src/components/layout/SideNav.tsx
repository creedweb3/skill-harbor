import { ActivityConsolePreview } from "./ActivityConsolePreview";
import type { ConsoleLine } from "../../lib/activityLog";
import { isActiveInbox, isUnreadActivity, type UserActivity } from "../../lib/activityLog";

export type AppTab =
  | "discovery"
  | "browse"
  | "domains"
  | "installed"
  | "activity"
  | "settings";

const TABS: { id: AppTab; label: string; icon: string }[] = [
  { id: "discovery", label: "Discovery", icon: "◆" },
  { id: "browse", label: "Browse", icon: "▦" },
  { id: "domains", label: "Domains", icon: "◇" },
  { id: "installed", label: "Installed", icon: "✓" },
  { id: "activity", label: "Activity", icon: "▤" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

type Props = {
  tab: AppTab;
  onTab: (t: AppTab) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  consoleLog: ConsoleLine[];
  userActivities: UserActivity[];
};

export function SideNav({
  tab,
  onTab,
  collapsed,
  onToggleCollapse,
  consoleLog,
  userActivities,
}: Props) {
  const unreadCount = userActivities.filter(isUnreadActivity).length;
  const errUnreadCount = userActivities.filter(
    (a) => isUnreadActivity(a) && a.status === "err"
  ).length;
  const runningCount = userActivities.filter(
    (a) => isActiveInbox(a) && a.status === "running"
  ).length;

  return (
    <nav
      className={`harbor-nav ${collapsed ? "harbor-nav--collapsed" : ""}`}
      aria-label="Main"
    >
      <div className="harbor-nav__items">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`harbor-nav-btn${t.id === "activity" ? " harbor-nav-btn--activity" : ""} ${tab === t.id ? "active" : ""}`}
            onClick={() => onTab(t.id)}
            title={collapsed ? t.label : undefined}
            aria-label={t.label}
            aria-current={tab === t.id ? "page" : undefined}
          >
            <span className="harbor-nav-btn__icon" aria-hidden>
              {t.icon}
            </span>
            <span className="harbor-nav-btn__label">{t.label}</span>
            {t.id === "activity" && unreadCount > 0 ? (
              <span
                className={`harbor-nav-activity-count${
                  errUnreadCount > 0
                    ? " harbor-nav-activity-count--err"
                    : runningCount > 0
                      ? " harbor-nav-activity-count--running"
                      : ""
                }`}
              >
                {errUnreadCount > 0 ? errUnreadCount : runningCount > 0 ? "…" : unreadCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {!collapsed ? (
        <div className="harbor-nav__console">
          <ActivityConsolePreview lines={consoleLog} />
        </div>
      ) : null}
      <div className="harbor-nav__footer">
        <button
          type="button"
          className="harbor-nav-toggle"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <span className="harbor-nav-toggle__chevron" aria-hidden>
            {collapsed ? "»" : "«"}
          </span>
          <span className="harbor-nav-toggle__label">{collapsed ? "Expand" : "Collapse"}</span>
        </button>
      </div>
    </nav>
  );
}
