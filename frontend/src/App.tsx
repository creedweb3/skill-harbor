import { useState } from "react";
import { AppShell } from "./components/layout/AppShell";
import type { AppTab } from "./components/layout/SideNav";
import { ActivityLog } from "./components/ActivityLog";
import { useStudio } from "./hooks/useStudio";
import { AssetDetailPage } from "./pages/AssetDetailPage";
import { BrowsePage } from "./pages/BrowsePage";
import { DiscoveryPage } from "./pages/DiscoveryPage";
import { InstalledPage } from "./pages/InstalledPage";
import { SettingsPage } from "./pages/SettingsPage";
import "./App.css";
import "./styles/tokens.css";
import "./styles/global.css";

export default function App() {
  const studio = useStudio();
  const [tab, setTab] = useState<AppTab>("discovery");

  const main =
    !studio.backendReady ? (
      <div className="harbor-empty" role="alert">
        <p>
          API not connected — run <code className="mono">npm run dev</code> in the project folder.
        </p>
        <button type="button" className="harbor-btn" onClick={() => studio.refresh()}>
          Retry
        </button>
      </div>
    ) : studio.selectedAssetId ? (
      <AssetDetailPage studio={studio} />
    ) : tab === "discovery" ? (
      <DiscoveryPage studio={studio} />
    ) : tab === "browse" ? (
      <BrowsePage studio={studio} />
    ) : tab === "installed" ? (
      <InstalledPage studio={studio} />
    ) : (
      <SettingsPage studio={studio} mode="settings" />
    );

  return (
    <>
      <AppShell studio={studio} tab={tab} onTab={setTab}>
        {main}
      </AppShell>
      <ActivityLog log={studio.log} logOpen={studio.logOpen} setLogOpen={studio.setLogOpen} />
    </>
  );
}
