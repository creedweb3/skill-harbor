import type { Studio } from "../../hooks/useStudio";
import { Brand } from "../layout/Brand";
import { InstalledPanel } from "./InstalledPanel";
import { SetupPanel } from "./SetupPanel";

type Props = { studio: Studio };

export function Sidebar({ studio }: Props) {
  const { sidebarTab, setSidebarTab, installedItems } = studio;

  return (
    <aside className="sidebar" aria-label="Workspace">
      <Brand />
      <nav className="sidebar-tabs" aria-label="Sidebar sections">
        <button
          type="button"
          className={`sidebar-tab ${sidebarTab === "setup" ? "active" : ""}`}
          onClick={() => setSidebarTab("setup")}
          aria-current={sidebarTab === "setup" ? "page" : undefined}
        >
          Setup
        </button>
        <button
          type="button"
          className={`sidebar-tab ${sidebarTab === "installed" ? "active" : ""}`}
          onClick={() => setSidebarTab("installed")}
          aria-current={sidebarTab === "installed" ? "page" : undefined}
        >
          Installed
          {installedItems.length > 0 ? (
            <span className="tab-badge">{installedItems.length}</span>
          ) : null}
        </button>
      </nav>
      {sidebarTab === "setup" ? <SetupPanel studio={studio} /> : <InstalledPanel studio={studio} />}
    </aside>
  );
}
