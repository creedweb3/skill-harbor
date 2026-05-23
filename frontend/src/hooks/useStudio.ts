import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Asset,
  CategoryGroup,
  ConnectionInfo,
  getCategories,
  getConnection,
  getExport,
  getCatalog,
  getLeaderboards,
  getSettings,
  patchSettings,
  postImport,
  postInstall,
  postSync,
  removeAsset,
  type LeaderboardEntry,
  type LeaderboardsResponse,
} from "../api";
import type { InstalledRow } from "../lib/installedGroups";

const DEFAULT_CATS = [
  "web-development",
  "full-stack",
  "marketing-seo",
  "product-design",
  "agent-ai",
];

export type LogKind = "info" | "ok" | "err";

export type { InstalledRow };

export type TrendPeriod = "day" | "week" | "month" | "year" | "all";

export type LeaderboardTab = "trending" | "top_picks" | "profession" | "domain";

export type DiscoverMode = "discovery" | "search";

export function useStudio() {
  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [discoveryProfessions, setDiscoveryProfessions] = useState<
    import("../api").DiscoveryProfession[]
  >([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [curatedHelp, setCuratedHelp] = useState("");
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set(DEFAULT_CATS));
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [projectDir, setProjectDir] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [tokenSet, setTokenSet] = useState(false);
  const [installUser, setInstallUser] = useState(true);
  const [installProject, setInstallProject] = useState(false);
  const [force, setForce] = useState(false);
  const [topPerCategory, setTopPerCategory] = useState(5);
  const [includeDiscovery, setIncludeDiscovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [hideInstalled, setHideInstalled] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"setup" | "installed">("setup");
  const [logOpen, setLogOpen] = useState(true);
  const [leaderboards, setLeaderboards] = useState<LeaderboardsResponse | null>(null);
  const [leaderboardTab, setLeaderboardTab] = useState<LeaderboardTab>("trending");
  const [backendReady, setBackendReady] = useState(false);
  const [discoverMode, setDiscoverMode] = useState<DiscoverMode>("discovery");
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>("week");
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [dbStats, setDbStats] = useState<{
    asset_count: number;
    synced_content_count: number;
    last_synced_at?: string;
  } | null>(null);

  const pushLog = useCallback((line: string, kind: LogKind = "info") => {
    const prefix = kind === "ok" ? "✓ " : kind === "err" ? "✗ " : "";
    setLog((prev) => [...prev.slice(-80), `${prefix}${line}`]);
    setLogOpen(true);
  }, []);

  const refresh = useCallback(
    async (opts?: { silent?: boolean }) => {
      try {
        const [settings, conn, cats, boards] = await Promise.all([
          getSettings(),
          getConnection(),
          getCategories(),
          getLeaderboards(),
        ]);
        setProjectDir(settings.project_dir);
        setTokenSet(settings.github_token_set);
        setDbStats({
          asset_count: settings.asset_count,
          synced_content_count: settings.synced_content_count,
          last_synced_at: settings.last_synced_at,
        });
        setConnection(conn);
        setAllCategories(cats.categories);
        setCategoryGroups(cats.groups);
      setDiscoveryProfessions(cats.discovery_professions ?? []);
        setCuratedHelp(cats.curated_help);
        setLeaderboards(boards);
        setBackendReady(true);
      } catch (e) {
        setBackendReady(false);
        if (!opts?.silent) pushLog(String(e), "err");
      }
    },
    [pushLog]
  );

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    let cancelled = false;
    const delays = [0, 800, 1600, 3000, 5000];

    (async () => {
      for (let i = 0; i < delays.length; i++) {
        if (cancelled) return;
        if (delays[i] > 0) await new Promise((r) => setTimeout(r, delays[i]));
        if (cancelled) return;
        const healthy = await fetch("/api/health")
          .then((r) => r.ok)
          .catch(() => false);
        if (!healthy) continue;
        await refreshRef.current({ silent: i < delays.length - 1 });
        if (!cancelled && i > 0) pushLog("Connected to API", "ok");
        if (!cancelled) {
          try {
            const cat = await getCatalog({ limit: 500 });
            setAssets(cat.assets);
          } catch {
            /* catalog loads on next refresh */
          }
        }
        return;
      }
      if (!cancelled) {
        pushLog(
          "Backend unavailable. Run npm run dev in the skill-harbor folder, then click Refresh.",
          "err"
        );
      }
    })();

    return () => {
      cancelled = true;
    };
    // Mount-only: retry until API is up (Vite often starts before uvicorn)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCat = (cat: string) => {
    setSelectedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const selectAllCats = () => setSelectedCats(new Set(allCategories));
  const clearCats = () => setSelectedCats(new Set());

  const loadCatalog = useCallback(async () => {
    try {
      const result = await getCatalog({ limit: 500 });
      setAssets(result.assets);
      setDbStats({
        asset_count: result.stats.total_assets,
        synced_content_count: result.stats.synced_content,
        last_synced_at: dbStats?.last_synced_at,
      });
      return result;
    } catch (e) {
      pushLog(String(e), "err");
      return null;
    }
  }, [pushLog, dbStats?.last_synced_at]);

  const syncRegistry = async (force = false) => {
    setBusy(true);
    pushLog("Syncing file content from GitHub (no token)…");
    try {
      const result = await postSync(force);
      pushLog(`Synced ${result.updated} assets`, "ok");
      result.errors.slice(0, 5).forEach((e) => pushLog(e, "err"));
      await loadCatalog();
      await refresh({ silent: true });
    } catch (e) {
      pushLog(String(e), "err");
    } finally {
      setBusy(false);
    }
  };

  const fetchCatalog = syncRegistry;

  const runInstall = async () => {
    const picked = assets.filter((a) => selectedIds.has(a.id));
    if (!picked.length) {
      pushLog("Select at least one item", "err");
      return;
    }
    setBusy(true);
    pushLog(`Installing ${picked.length} item(s)…`);
    try {
      const result = await postInstall({
        assets: picked,
        install_user: installUser,
        install_project: installProject,
        force,
      });
      pushLog(
        `Installed: ${result.installed.user?.length ?? 0} global, ${result.installed.project?.length ?? 0} project`,
        "ok"
      );
      result.errors.forEach((e) => pushLog(e, "err"));
      await loadCatalog();
      await refresh();
    } catch (e) {
      pushLog(String(e), "err");
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async () => {
    setBusy(true);
    try {
      await patchSettings({
        project_dir: projectDir || undefined,
        github_token: tokenInput || undefined,
      });
      setTokenInput("");
      pushLog("Settings saved", "ok");
      await refresh();
    } catch (e) {
      pushLog(String(e), "err");
    } finally {
      setBusy(false);
    }
  };

  const clearGithubToken = async () => {
    if (!tokenSet && !tokenInput) return;
    if (!confirm("Remove saved GitHub token from this machine?")) return;
    setBusy(true);
    try {
      await patchSettings({ github_token: "" });
      setTokenInput("");
      pushLog("GitHub token removed", "ok");
      await refresh();
    } catch (e) {
      pushLog(String(e), "err");
    } finally {
      setBusy(false);
    }
  };

  const focusLeaderboardEntry = (entry: LeaderboardEntry) => {
    setSelectedCats((prev) => {
      const next = new Set(prev);
      if (entry.domain) next.add(entry.domain);
      return next;
    });
    setSearch(entry.install_folder || entry.title);
    pushLog(`Filtering catalog for “${entry.title}”`, "info");
  };

  const onRemove = async (
    name: string,
    scope: "user" | "project",
    assetType = "skill"
  ) => {
    if (!confirm(`Remove ${assetType} "${name}" from ${scope}?`)) return;
    try {
      await removeAsset(assetType, name, scope);
      pushLog(`Removed ${name} (${scope})`, "ok");
      await refresh();
      await loadCatalog();
    } catch (e) {
      pushLog(String(e), "err");
    }
  };

  const runExport = async () => {
    setBusy(true);
    try {
      const bundle = await getExport(true, installProject);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `skill-harbor-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const n =
        (bundle.scopes.user?.skills?.length ?? 0) +
        (bundle.scopes.user?.rules?.length ?? 0);
      pushLog(`Exported backup (${n}+ items)`, "ok");
    } catch (e) {
      pushLog(String(e), "err");
    } finally {
      setBusy(false);
    }
  };

  const runImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setBusy(true);
      try {
        const bundle = JSON.parse(await file.text());
        const result = await postImport({
          bundle,
          import_user: installUser,
          import_project: installProject,
          force,
        });
        pushLog(
          `Imported: ${result.imported.user?.length ?? 0} global, ${result.imported.project?.length ?? 0} project paths`,
          "ok"
        );
        await refresh();
        await loadCatalog();
      } catch (e) {
        pushLog(String(e), "err");
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };

  const filteredAssets = useMemo(() => {
    let list = assets;
    if (selectedCats.size) {
      list = list.filter((a) =>
        [...(a.domains ?? []), ...a.categories].some((c) => selectedCats.has(c))
      );
    }
    if (typeFilter !== "all") {
      list = list.filter((a) => a.asset_type === typeFilter);
    }
    if (hideInstalled) {
      list = list.filter((a) => a.install_status?.status === "none");
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.curated_title?.toLowerCase().includes(q) ||
          a.install_name.toLowerCase().includes(q) ||
          a.source_repo.toLowerCase().includes(q) ||
          a.content_preview.toLowerCase().includes(q)
      );
    }
    return list;
  }, [assets, selectedCats, typeFilter, hideInstalled, search]);

  const visibleIds = useMemo(() => filteredAssets.map((a) => a.id), [filteredAssets]);

  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const deselectAll = () => setSelectedIds(new Set());

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const installedItems = useMemo(() => {
    const rows: InstalledRow[] = [];
    for (const s of connection?.scopes.user.skills ?? []) {
      rows.push({ item: { ...s, asset_type: "skill" }, scope: "user" });
    }
    for (const s of connection?.scopes.project.skills ?? []) {
      rows.push({ item: { ...s, asset_type: "skill" }, scope: "project" });
    }
    for (const r of connection?.scopes.user.rules ?? []) {
      rows.push({ item: r, scope: "user" });
    }
    for (const r of connection?.scopes.project.rules ?? []) {
      rows.push({ item: r, scope: "project" });
    }
    for (const c of connection?.scopes.user.commands ?? []) {
      rows.push({ item: c, scope: "user" });
    }
    for (const c of connection?.scopes.project.commands ?? []) {
      rows.push({ item: c, scope: "project" });
    }
    return rows;
  }, [connection]);

  const hasCatalog = assets.length > 0;
  const activeFilterCount =
    (typeFilter !== "all" ? 1 : 0) +
    (hideInstalled ? 1 : 0) +
    (search.trim() ? 1 : 0);

  return {
    connection,
    categoryGroups,
    discoveryProfessions,
    curatedHelp,
    selectedCats,
    assets,
    selectedIds,
    projectDir,
    setProjectDir,
    tokenInput,
    setTokenInput,
    tokenSet,
    installUser,
    setInstallUser,
    installProject,
    setInstallProject,
    force,
    setForce,
    topPerCategory,
    setTopPerCategory,
    includeDiscovery,
    setIncludeDiscovery,
    busy,
    log,
    search,
    setSearch,
    typeFilter,
    setTypeFilter,
    hideInstalled,
    setHideInstalled,
    sidebarTab,
    setSidebarTab,
    logOpen,
    setLogOpen,
    backendReady,
    discoverMode,
    setDiscoverMode,
    leaderboards,
    leaderboardTab,
    setLeaderboardTab,
    focusLeaderboardEntry,
    clearGithubToken,
    filteredAssets,
    installedItems,
    hasCatalog,
    activeFilterCount,
    allVisibleSelected,
    toggleCat,
    selectAllCats,
    clearCats,
    fetchCatalog,
    runInstall,
    saveSettings,
    onRemove,
    runExport,
    runImport,
    refresh,
    trendPeriod,
    setTrendPeriod,
    selectedAssetId,
    setSelectedAssetId,
    dbStats,
    syncRegistry,
    loadCatalog,
    pushLog,
    setBusy,
    toggleSelectAllVisible,
    deselectAll,
    toggleRow,
  };
}

export type Studio = ReturnType<typeof useStudio>;
