import type { ReactNode } from "react";
import type { Studio } from "../../hooks/useStudio";
import { SideNav, type AppTab } from "./SideNav";
import { TopNav } from "./TopNav";

type Props = {
  studio: Studio;
  tab: AppTab;
  onTab: (t: AppTab) => void;
  children: ReactNode;
};

export function AppShell({ studio, tab, onTab, children }: Props) {
  return (
    <div className="harbor-shell no-inspector">
      <TopNav studio={studio} />
      <SideNav tab={tab} onTab={onTab} />
      <main className="harbor-main">{children}</main>
    </div>
  );
}
