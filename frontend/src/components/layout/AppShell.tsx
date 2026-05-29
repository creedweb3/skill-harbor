import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Studio } from "../../hooks/useStudio";
import { SideNav, type AppTab } from "./SideNav";
import { TopNav } from "./TopNav";

const NAV_COLLAPSED_KEY = "skill-harbor-nav-collapsed";

type Props = {
  studio: Studio;
  tab: AppTab;
  onTab: (t: AppTab) => void;
  children: ReactNode;
};

function readNavCollapsed(): boolean {
  try {
    return localStorage.getItem(NAV_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function AppShell({ studio, tab, onTab, children }: Props) {
  const [navCollapsed, setNavCollapsed] = useState(readNavCollapsed);
  const { consoleLog, userActivities } = studio;

  useEffect(() => {
    document.documentElement.classList.toggle("harbor-nav-collapsed", navCollapsed);
    return () => document.documentElement.classList.remove("harbor-nav-collapsed");
  }, [navCollapsed]);

  const toggleNav = useCallback(() => {
    setNavCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(NAV_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <div
      className={`harbor-shell no-inspector${navCollapsed ? " harbor-shell--nav-collapsed" : ""}`}
    >
      <TopNav studio={studio} />
      <SideNav
        tab={tab}
        onTab={onTab}
        collapsed={navCollapsed}
        onToggleCollapse={toggleNav}
        consoleLog={consoleLog}
        userActivities={userActivities}
      />
      <main className="harbor-main">{children}</main>
    </div>
  );
}
