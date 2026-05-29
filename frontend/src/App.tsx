import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "./components/layout/AppShell";
import type { AppTab } from "./components/layout/SideNav";
import { HarborBootScreen } from "./components/ui/HarborBootScreen";
import { useHarborShortcuts } from "./hooks/useHarborShortcuts";
import { useStudio } from "./hooks/useStudio";
import type { DiscoverySectionView } from "./lib/categoryDetail";
import {
  clearDomainHash,
  parseDomainHash,
  setDomainHash,
  viewFromDomainSlug,
} from "./lib/domainHash";
import { clearRepoHash, parseRepoHash } from "./lib/repoHash";
import { AssetDetailPage } from "./pages/AssetDetailPage";
import { BrowsePage } from "./pages/BrowsePage";
import { DiscoveryPage } from "./pages/DiscoveryPage";
import { DomainsRouterPage } from "./pages/DomainsRouterPage";
import { InstalledPage } from "./pages/InstalledPage";
import { ActivityPage } from "./pages/ActivityPage";
import { RepoDetailPage } from "./pages/RepoDetailPage";
import { SettingsPage } from "./pages/SettingsPage";
import "./App.css";
import "./styles/tokens.css";
import "./styles/global.css";

const BOOT_DELAY_MS = 90;

export default function App() {
  const studio = useStudio();
  const {
    backendReady,
    discoveryPanelProfessions,
    openRepo,
    closeRepo,
  } = studio;
  const [tab, setTab] = useState<AppTab>("discovery");
  const [discoverySectionView, setDiscoverySectionView] =
    useState<DiscoverySectionView | null>(null);
  const [domainView, setDomainView] = useState<DiscoverySectionView | null>(null);
  const [showBoot, setShowBoot] = useState(false);

  const searchRef = useRef<HTMLInputElement | null>(null);

  const uiReady = studio.backendReady && studio.catalogReady;

  useEffect(() => {
    if (uiReady) {
      setShowBoot(false);
      return;
    }
    const t = window.setTimeout(() => setShowBoot(true), BOOT_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [uiReady]);

  useHarborShortcuts({
    searchRef,
    enabled:
      studio.catalogReady &&
      (tab === "browse" || tab === "discovery" || tab === "domains"),
  });

  const onTab = useCallback((next: AppTab) => {
    setTab(next);
    if (next !== "discovery") setDiscoverySectionView(null);
    if (next === "domains") {
      setDomainView(null);
      clearDomainHash();
    } else {
      setDomainView(null);
      clearDomainHash();
    }
    closeRepo();
    clearRepoHash();
  }, [closeRepo]);

  const onOpenDomain = useCallback(
    (view: DiscoverySectionView) => {
      if (view.kind !== "profession" || !view.domain) return;
      setTab("domains");
      setDomainView(view);
      setDiscoverySectionView(null);
      studio.setSelectedAssetId(null);
      setDomainHash(view.domain);
    },
    [studio]
  );

  useEffect(() => {
    if (!backendReady) return;

    const applyHash = () => {
      const repo = parseRepoHash(window.location.hash);
      if (repo) {
        setTab("discovery");
        setDiscoverySectionView(null);
        setDomainView(null);
        clearDomainHash();
        openRepo(repo);
        return;
      }

      const slug = parseDomainHash(window.location.hash);
      if (!slug) return;
      const view = viewFromDomainSlug(slug, discoveryPanelProfessions);
      if (view) {
        closeRepo();
        clearRepoHash();
        setTab("domains");
        setDomainView(view);
        setDiscoverySectionView(null);
      }
    };

    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [backendReady, discoveryPanelProfessions, openRepo, closeRepo]);

  const main = studio.initOffline ? (
    <div className="harbor-page harbor-page--offline">
      <HarborBootScreen
        phase="Harbor API offline"
        detail="Run npm run dev in the project folder, then retry."
      />
      <button type="button" className="harbor-btn harbor-btn--primary" onClick={() => studio.refresh()}>
        Retry connection
      </button>
    </div>
  ) : !uiReady && showBoot ? (
    <HarborBootScreen
      phase={studio.bootLabel}
      progress={studio.bootProgress}
      detail="By Devs, For Devs — your agent skill registry"
    />
  ) : !uiReady ? (
    <div className="harbor-page harbor-page--loading" aria-busy="true" />
  ) : studio.selectedAssetId ? (
    <AssetDetailPage studio={studio} />
  ) : studio.selectedRepo ? (
    <RepoDetailPage studio={studio} />
  ) : tab === "discovery" ? (
    <DiscoveryPage
      studio={studio}
      sectionView={discoverySectionView}
      setSectionView={setDiscoverySectionView}
      onOpenDomain={onOpenDomain}
      onGoToDomains={() => {
        setTab("domains");
        setDomainView(null);
        clearDomainHash();
      }}
    />
  ) : tab === "browse" ? (
    <BrowsePage studio={studio} searchRef={searchRef} />
  ) : tab === "domains" ? (
    <DomainsRouterPage
      studio={studio}
      domainView={domainView}
      setDomainView={setDomainView}
      onOpenDomain={onOpenDomain}
    />
  ) : tab === "installed" ? (
    <InstalledPage studio={studio} />
  ) : tab === "activity" ? (
    <ActivityPage studio={studio} />
  ) : (
    <SettingsPage studio={studio} mode="settings" />
  );

  return (
    <AppShell studio={studio} tab={tab} onTab={onTab}>
      {main}
    </AppShell>
  );
}
