import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import {
  Asset,
  CategoryGroup,
  CATALOG_BULK_PAGE_SIZE,
  CATALOG_DEFAULT_LIMIT,
  ConnectionInfo,
  fetchAllCatalog,
  getBootstrap,
  getCatalog,
  getConnection,
  getExport,
  getLeaderboards,
  getPlatforms,
  postAutoDetectPlatform,
  patchSettings,
  type PlatformInfo,
  postImport,
  postInstall,
  postSync,
  removeAsset,
  type CatalogResponse,
  type LeaderboardEntry,
  type LeaderboardsResponse,
} from "../api";
import { clearRepoHash, setRepoHash } from "../lib/repoHash";
import {
  createConsoleLine,
  createUserActivity,
  type ActivityStatus,
  type ConsoleLine,
  type UserActivity,
  canArchiveActivity,
  isActiveInbox,
  isUnreadActivity,
} from "../lib/activityLog";
import type { InstalledRow } from "../lib/installedGroups";

const DEFAULT_CATS = [
  "agent-ai",
  "web-frameworks",
  "backend-apis",
  "growth-seo",
  "design-ux",
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
  const [discoveryPanelProfessions, setDiscoveryPanelProfessions] = useState<
    import("../api").DiscoveryProfession[]
  >([]);
  const [discoveryUi, setDiscoveryUi] = useState<import("../api").DiscoveryUiConfig | null>(
    null
  );
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [curatedHelp, setCuratedHelp] = useState("");
  const [domainLabels, setDomainLabels] = useState<Record<string, string>>({});
  const [techStackLabels, setTechStackLabels] = useState<Record<string, string>>({});
  const [repoOwners, setRepoOwners] = useState<
    { owner: string; asset_count: number; repo_count: number }[]
  >([]);
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set(DEFAULT_CATS));
  const [assets, setAssets] = useState<Asset[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  /** Full registry loaded (not bootstrap slice). UI waits on this before first paint. */
  const [catalogReady, setCatalogReady] = useState(false);
  /** When set, `assets` were loaded with FTS via GET /api/catalog?q=… */
  const [catalogSearchQuery, setCatalogSearchQuery] = useState<string | null>(null);
  const catalogFullyLoadedRef = useRef(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [projectDir, setProjectDir] = useState("");
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([]);
  const [platform, setPlatformState] = useState("cursor");
  const [platformMode, setPlatformMode] = useState<"auto" | "manual">("auto");
  const [extraInstallPlatforms, setExtraInstallPlatforms] = useState<Set<string>>(
    new Set()
  );
  const platformRef = useRef("cursor");
  const [installUser, setInstallUser] = useState(true);
  const [installProject, setInstallProject] = useState(false);
  const [force, setForce] = useState(false);
  const [topPerCategory, setTopPerCategory] = useState(5);
  const [includeDiscovery, setIncludeDiscovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [consoleLog, setConsoleLog] = useState<ConsoleLine[]>([]);
  const [userActivities, setUserActivities] = useState<UserActivity[]>([]);
  const currentActivityRef = useRef<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [hideInstalled, setHideInstalled] = useState(false);
  const [hideIncompatible, setHideIncompatible] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<"setup" | "installed">("setup");
  const [leaderboards, setLeaderboards] = useState<LeaderboardsResponse | null>(null);
  const [leaderboardTab, setLeaderboardTab] = useState<LeaderboardTab>("trending");
  const [backendReady, setBackendReady] = useState(false);
  const [initOffline, setInitOffline] = useState(false);
  const [registryHydrating, setRegistryHydrating] = useState(false);
  const [bootLabel, setBootLabel] = useState("Starting Skill Harbor…");
  const [bootProgress, setBootProgress] = useState(0);
  const autoSyncRanRef = useRef(false);
  const [discoverMode, setDiscoverMode] = useState<DiscoverMode>("discovery");
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>("week");
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [dbStats, setDbStats] = useState<{
    asset_count: number;
    synced_content_count: number;
    last_synced_at?: string;
    stars_last_refreshed_at?: string | null;
    stars_live?: boolean;
  } | null>(null);

  const appendConsoleLine = useCallback((line: string, kind: LogKind = "info") => {
    const entry = createConsoleLine(line, kind);
    setConsoleLog((prev) => [...prev.slice(-199), entry]);
    const actId = currentActivityRef.current;
    if (actId) {
      setUserActivities((prev) =>
        prev.map((a) =>
          a.id === actId ? { ...a, logs: [...a.logs.slice(-99), entry] } : a
        )
      );
    }
    return entry;
  }, []);

  const pushLog = appendConsoleLine;

  const beginUserActivity = useCallback((action: string) => {
    const activity = createUserActivity(action);
    setUserActivities((prev) => [...prev.slice(-49), activity]);
    currentActivityRef.current = activity.id;
    return activity.id;
  }, []);

  const endUserActivity = useCallback(
    (id: string, status: ActivityStatus, summary?: string) => {
      if (currentActivityRef.current === id) currentActivityRef.current = null;
      setUserActivities((prev) =>
        prev.map((a) =>
          a.id === id
            ? {
                ...a,
                status,
                summary: summary ?? a.summary,
                finishedAt: Date.now(),
              }
            : a
        )
      );
    },
    []
  );

  const runUserActivity = useCallback(
    async (
      action: string,
      run: () => Promise<{ summary: string; status?: ActivityStatus } | void>
    ) => {
      const id = beginUserActivity(action);
      try {
        const result = await run();
        endUserActivity(id, result?.status ?? "ok", result?.summary ?? action);
      } catch (e) {
        pushLog(String(e), "err");
        endUserActivity(id, "err", String(e));
      }
    },
    [beginUserActivity, endUserActivity, pushLog]
  );

  const clearConsole = useCallback(() => {
    setConsoleLog([]);
  }, []);

  const markActivitiesRead = useCallback((ids?: string[]) => {
    setUserActivities((prev) =>
      prev.map((a) => {
        if (a.archived || a.read) return a;
        if (ids && !ids.includes(a.id)) return a;
        return { ...a, read: true };
      })
    );
  }, []);

  const archiveReadActivities = useCallback(() => {
    setUserActivities((prev) =>
      prev.map((a) =>
        canArchiveActivity(a) ? { ...a, archived: true } : a
      )
    );
  }, []);

  const deleteArchivedActivities = useCallback(() => {
    setUserActivities((prev) => prev.filter((a) => !a.archived));
  }, []);

  const applyBootstrap = useCallback((data: Awaited<ReturnType<typeof getBootstrap>>) => {
    const s = data.settings;
    const active = s.active_platform ?? s.default_platform ?? "cursor";
    platformRef.current = active;
    setPlatformState(active);
    setPlatformMode(s.platform_mode ?? "auto");
    setExtraInstallPlatforms(new Set(s.extra_install_platforms ?? []));
    setProjectDir(s.project_dir);
    setDbStats({
      asset_count: s.asset_count,
      synced_content_count: s.synced_content_count,
      last_synced_at: s.last_synced_at,
      stars_last_refreshed_at: s.stars_last_refreshed_at,
      stars_live: s.stars_live,
    });
    setConnection(data.connection);
    const cats = data.categories;
    setAllCategories(cats.categories);
    setCategoryGroups(cats.groups);
    setDiscoveryProfessions(cats.discovery_professions ?? []);
    setDiscoveryPanelProfessions(
      data.discovery?.profession_domains ?? cats.discovery_professions ?? []
    );
    setDiscoveryUi(data.discovery?.config ?? null);
    setDomainLabels(cats.domain_labels ?? {});
    setTechStackLabels(cats.tech_stack_labels ?? {});
    setRepoOwners(cats.repo_owners ?? []);
    setCuratedHelp(cats.curated_help);
    setLeaderboards(data.leaderboards);
    setPlatforms(data.platforms.platforms);
    setAssets(data.catalog.assets);
    setCatalogTotal(data.catalog.total);
    setCatalogReady(true);
    setBackendReady(true);
    setInitOffline(false);
    setBootProgress(35);
  }, []);

  const hydrateCatalog = useCallback(
    async (opts?: { silent?: boolean; q?: string }) => {
      const serverQ = (opts?.q ?? "").trim() || null;
      if (!serverQ) setRegistryHydrating(true);
      try {
        const result = serverQ
          ? await fetchAllCatalog({
              q: serverQ,
              include_stats: true,
              pageSize: CATALOG_BULK_PAGE_SIZE,
            })
          : await fetchAllCatalog({
              include_stats: true,
              pageSize: CATALOG_BULK_PAGE_SIZE,
            });

        startTransition(() => {
          setAssets(result.assets);
          setCatalogTotal(result.total);
          setCatalogSearchQuery(serverQ);
          catalogFullyLoadedRef.current = !serverQ && result.assets.length >= result.total;
          setCatalogReady(true);
          if (result.stats) {
            setDbStats((prev) => ({
              asset_count: result.stats!.total_assets,
              synced_content_count: result.stats!.synced_content,
              last_synced_at: prev?.last_synced_at,
            }));
          }
        });

        if (!opts?.silent) {
          pushLog(
            serverQ
              ? `Search: ${result.assets.length.toLocaleString()} of ${result.total.toLocaleString()} matches`
              : `Loaded ${result.assets.length.toLocaleString()} catalog assets`,
            "ok"
          );
        }
        return result;
      } finally {
        if (!serverQ) setRegistryHydrating(false);
      }
    },
    [pushLog]
  );

  const runBackgroundStartup = useCallback(async () => {
    setBootLabel("Indexing full registry…");
    setBootProgress(50);
    try {
      const result = await hydrateCatalog({ silent: true });
      setBootProgress(72);

      const total = result?.total ?? 0;
      const synced =
        result?.stats?.synced_content ??
        result?.assets.filter((a) => a.content || a.content_preview).length ??
        0;
      const needsContent =
        total > 0 && synced < Math.max(1, Math.floor(total * 0.98));

      if (needsContent && !autoSyncRanRef.current) {
        autoSyncRanRef.current = true;
        setBootLabel("Syncing skill content from GitHub…");
        setBootProgress(88);
        try {
          const syncResult = await postSync(false);
          const skipped = (syncResult as { skipped?: boolean }).skipped;
          if (!skipped && syncResult.updated > 0) {
            pushLog(`Auto-synced ${syncResult.updated} asset(s) from GitHub`, "ok");
            await hydrateCatalog({ silent: true });
          }
        } catch {
          /* optional — user can sync manually */
        }
      }
    } finally {
      setBootProgress(100);
      setBootLabel("Ready");
    }
  }, [hydrateCatalog, pushLog]);

  const refresh = useCallback(
    async (opts?: { silent?: boolean }) => {
      try {
        setInitOffline(false);
        const data = await getBootstrap(platformRef.current);
        applyBootstrap(data);
        if (!opts?.silent) void runBackgroundStartup();
        else await hydrateCatalog({ silent: true });
      } catch (e) {
        setBackendReady(false);
        setCatalogReady(false);
        setInitOffline(true);
        catalogFullyLoadedRef.current = false;
        if (!opts?.silent) pushLog(String(e), "err");
      }
    },
    [pushLog, applyBootstrap, hydrateCatalog, runBackgroundStartup]
  );

  useEffect(() => {
    let cancelled = false;
    const delays = [0, 120, 280, 500, 900, 1500];

    (async () => {
      setInitOffline(false);
      setBootLabel("Connecting to Skill Harbor…");
      setBootProgress(8);

      for (let i = 0; i < delays.length; i++) {
        if (cancelled) return;
        if (delays[i] > 0) await new Promise((r) => setTimeout(r, delays[i]));
        if (cancelled) return;
        try {
          const data = await getBootstrap();
          if (cancelled) return;
          applyBootstrap(data);
          if (i > 0) pushLog("Connected to API", "ok");
          void runBackgroundStartup();
          return;
        } catch {
          setBootProgress(12 + i * 10);
        }
      }
      if (!cancelled) {
        setInitOffline(true);
        setBackendReady(false);
        setCatalogReady(false);
        pushLog(
          "Backend unavailable. Run npm run dev in the project folder, then retry.",
          "err"
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyBootstrap, runBackgroundStartup, pushLog]);

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

  const loadCatalog = useCallback(
    async (opts?: { silent?: boolean; q?: string }) => {
      try {
        return await hydrateCatalog(opts);
      } catch (e) {
        pushLog(String(e), "err");
        return null;
      }
    },
    [pushLog, hydrateCatalog]
  );

  /** Single paginated slice (FTS-aware) — useful for future server-driven Browse pages. */
  const loadCatalogPage = useCallback(
    async (params: {
      offset?: number;
      limit?: number;
      q?: string;
      domain?: string;
      asset_type?: string;
      platform?: string;
    }) => {
      return getCatalog({
        offset: params.offset ?? 0,
        limit: params.limit ?? CATALOG_DEFAULT_LIMIT,
        q: params.q,
        domain: params.domain,
        asset_type: params.asset_type,
        platform: params.platform ?? platformRef.current,
      });
    },
    []
  );

  const setPlatform = useCallback(
    async (next: string, opts?: { manual?: boolean }) => {
      platformRef.current = next;
      setPlatformState(next);
      if (opts?.manual) {
        setPlatformMode("manual");
        await patchSettings({ default_platform: next, platform_mode: "manual" });
      }
      try {
        const conn = await getConnection(next);
        setConnection(conn);
        await hydrateCatalog({ silent: true });
      } catch (e) {
        pushLog(String(e), "err");
      }
    },
    [pushLog, hydrateCatalog]
  );

  const autoDetectPlatform = useCallback(async () => {
    setBusy(true);
    await runUserActivity("Auto-detect platform", async () => {
      const detection = await postAutoDetectPlatform();
      const next = detection.recommended_platform ?? "cursor";
      platformRef.current = next;
      setPlatformState(next);
      setPlatformMode("auto");
      const msg = detection.count
        ? `Auto-detected ${detection.detected[0]?.label ?? next} (${detection.count} agent folder(s) found)`
        : `No agent folders found — defaulting to ${next}`;
      pushLog(msg, "ok");
      const conn = await getConnection(next);
      setConnection(conn);
      await loadCatalog({ silent: true });
      return { summary: msg, status: "ok" };
    });
    setBusy(false);
  }, [runUserActivity, pushLog, loadCatalog]);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!catalogReady) return;
    const q = search.trim();
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      if (q.length >= 2) {
        void loadCatalog({ silent: true, q });
      } else if (catalogSearchQuery) {
        if (catalogFullyLoadedRef.current) {
          setCatalogSearchQuery(null);
        } else {
          void loadCatalog({ silent: true });
        }
      }
    }, q.length >= 2 ? 280 : 0);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [search, catalogReady, loadCatalog, catalogSearchQuery]);

  const syncRegistry = async (force = false) => {
    setBusy(true);
    await runUserActivity("Sync registry", async () => {
      pushLog("Syncing missing content from GitHub (parallel)…");
      const result = await postSync(force);
      const skipped = (result as { skipped?: boolean }).skipped;
      if (skipped) {
        pushLog("Registry already has content — nothing to sync", "ok");
        await loadCatalog({ silent: true });
        return { summary: "Nothing to sync", status: "ok" };
      }
      pushLog(`Synced ${result.updated} asset(s)`, "ok");
      result.errors.slice(0, 5).forEach((e) => pushLog(e, "err"));
      await loadCatalog({ silent: true });
      const status: ActivityStatus = result.errors.length ? "err" : "ok";
      return {
        summary: `Synced ${result.updated} asset(s)`,
        status,
      };
    });
    setBusy(false);
  };

  const fetchCatalog = async () => {
    setBusy(true);
    await runUserActivity("Reload catalog", async () => {
      const result = await hydrateCatalog({ silent: true });
      if (!result) return { summary: "Reload failed", status: "err" };
      pushLog(
        `Loaded ${result.assets.length.toLocaleString()} catalog assets`,
        "ok"
      );
      return {
        summary: `${result.assets.length.toLocaleString()} assets loaded`,
        status: "ok",
      };
    });
    setBusy(false);
  };

  const runInstall = async () => {
    const picked = assets.filter((a) => selectedIds.has(a.id));
    if (!picked.length) {
      pushLog("Select at least one item", "err");
      return;
    }
    setBusy(true);
    await runUserActivity(`Install ${picked.length} item(s)`, async () => {
      const unsafe = picked.filter((a) => a.safety && !a.safety.safe);
      if (unsafe.length) {
        pushLog(
          `${unsafe.length} item(s) blocked by safety check — open inspector for details`,
          "err"
        );
        return {
          summary: `${unsafe.length} item(s) blocked by safety check`,
          status: "err",
        };
      }
      pushLog(`Installing ${picked.length} item(s)…`);
      const primary = platformRef.current;
      const also = [...extraInstallPlatforms].filter((p) => p !== primary);
      const targetPlatforms = also.length ? [primary, ...also] : [primary];
      const result = await postInstall({
        assets: picked,
        install_user: installUser,
        install_project: installProject,
        force,
        platform: primary,
        platforms: targetPlatforms,
      });
      const platNote =
        (result.platforms?.length ?? 0) > 1
          ? ` → ${result.platforms!.join(", ")}`
          : "";
      pushLog(
        `Installed: ${result.installed.user?.length ?? 0} global, ${result.installed.project?.length ?? 0} project${platNote}`,
        "ok"
      );
      result.errors.forEach((e) => pushLog(e, "err"));
      await loadCatalog({ silent: true });
      await refresh({ silent: true });
      const status: ActivityStatus = result.errors.length ? "err" : "ok";
      return {
        summary: `Installed ${result.installed.user?.length ?? 0} global, ${result.installed.project?.length ?? 0} project${platNote}`,
        status,
      };
    });
    setBusy(false);
  };

  const saveSettings = async () => {
    setBusy(true);
    await runUserActivity("Save settings", async () => {
      await patchSettings({
        project_dir: projectDir || undefined,
        default_platform: platformRef.current,
        platform_mode: platformMode,
        extra_install_platforms: [...extraInstallPlatforms],
      });
      pushLog("Settings saved", "ok");
      await refresh({ silent: true });
      return { summary: "Settings saved", status: "ok" };
    });
    setBusy(false);
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
    await runUserActivity(`Remove ${assetType}`, async () => {
      await removeAsset(assetType, name, scope);
      pushLog(`Removed ${name} (${scope})`, "ok");
      await refresh({ silent: true });
      await loadCatalog({ silent: true });
      return { summary: `Removed ${name} (${scope})`, status: "ok" };
    });
  };

  const runExport = async () => {
    setBusy(true);
    await runUserActivity("Export backup", async () => {
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
      return { summary: `Exported backup (${n}+ items)`, status: "ok" };
    });
    setBusy(false);
  };

  const runImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setBusy(true);
      await runUserActivity("Import backup", async () => {
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
        await refresh({ silent: true });
        await loadCatalog({ silent: true });
        return {
          summary: `Imported ${result.imported.user?.length ?? 0} global, ${result.imported.project?.length ?? 0} project paths`,
          status: "ok",
        };
      });
      setBusy(false);
    };
    input.click();
  };

  const applyCatalogFilters = useCallback(
    (
      list: Asset[],
      opts?: {
        categories?: boolean;
        /** When false, Browse shows the full registry regardless of Discovery toggles. */
        respectInstalled?: boolean;
        respectIncompatible?: boolean;
      }
    ) => {
      let out = list;
      if (opts?.categories && selectedCats.size) {
        out = out.filter((a) =>
          [...(a.domains ?? []), ...a.categories].some((c) => selectedCats.has(c))
        );
      }
      if (typeFilter !== "all") {
        out = out.filter((a) => a.asset_type === typeFilter);
      }
      const respectInstalled = opts?.respectInstalled ?? true;
      const respectIncompatible = opts?.respectIncompatible ?? true;
      if (respectInstalled && hideInstalled) {
        out = out.filter((a) => a.install_status?.status === "none");
      }
      if (respectIncompatible && hideIncompatible && platform) {
        out = out.filter(
          (a) => !a.platforms?.length || a.platforms.includes(platform)
        );
      }
      const q = search.trim();
      const serverFiltered = q && catalogSearchQuery === q;
      if (q && !serverFiltered) {
        const ql = q.toLowerCase();
        const ghMatch = ql.match(/github\.com[/:]([^/]+)\/([^/?.#\s]+)/);
        out = out.filter((a) => {
          const owner = a.source_repo.split("/")[0]?.toLowerCase() ?? "";
          const hay = [
            a.curated_title,
            a.install_name,
            a.source_repo,
            owner,
            a.source_path,
            a.content_preview,
            a.raw_url,
            a.id,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (hay.includes(ql)) return true;
          if (owner === ql || owner.startsWith(ql)) return true;
          if (ghMatch) {
            const repo = `${ghMatch[1]}/${ghMatch[2].replace(/\.git$/, "")}`;
            return a.source_repo.toLowerCase().includes(repo);
          }
          return false;
        });
      }
      return out;
    },
    [selectedCats, typeFilter, hideInstalled, hideIncompatible, platform, search, catalogSearchQuery]
  );

  /** Discovery / search — respects category chips. */
  const filteredAssets = useMemo(
    () => applyCatalogFilters(assets, { categories: true }),
    [assets, applyCatalogFilters]
  );

  /** Browse tab — full registry; Discovery hide-installed / hide-incompatible toggles do not apply. */
  const browseAssets = useMemo(
    () =>
      applyCatalogFilters(assets, {
        categories: false,
        respectInstalled: false,
        respectIncompatible: false,
      }),
    [assets, applyCatalogFilters]
  );

  const visibleIds = useMemo(() => filteredAssets.map((a) => a.id), [filteredAssets]);

  const compatiblePlatformsForSelection = useMemo(() => {
    const picked = assets.filter((a) => selectedIds.has(a.id));
    if (!picked.length) return platforms.filter((p) => p.installable).map((p) => p.id);
    const lists = picked.map((a) =>
      a.platforms?.length ? a.platforms : platforms.filter((p) => p.installable).map((p) => p.id)
    );
    return lists.reduce((acc, cur) => acc.filter((id) => cur.includes(id)), lists[0] ?? []);
  }, [assets, selectedIds, platforms]);

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

  const toggleSelectAllForIds = (ids: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
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

  const openRepo = useCallback((sourceRepo: string) => {
    setSelectedAssetId(null);
    setSelectedRepo(sourceRepo);
    setRepoHash(sourceRepo);
  }, []);

  const closeRepo = useCallback(() => {
    setSelectedRepo(null);
    clearRepoHash();
  }, []);

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
    (hideIncompatible ? 1 : 0) +
    (search.trim() ? 1 : 0);

  return {
    connection,
    categoryGroups,
    discoveryProfessions,
    discoveryPanelProfessions,
    discoveryUi,
    domainLabels,
    techStackLabels,
    repoOwners,
    curatedHelp,
    selectedCats,
    assets,
    selectedIds,
    projectDir,
    setProjectDir,
    platforms,
    platform,
    platformMode,
    setPlatform,
    autoDetectPlatform,
    extraInstallPlatforms,
    setExtraInstallPlatforms,
    compatiblePlatformsForSelection,
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
    consoleLog,
    userActivities,
    search,
    setSearch,
    typeFilter,
    setTypeFilter,
    hideInstalled,
    setHideInstalled,
    hideIncompatible,
    setHideIncompatible,
    sidebarTab,
    setSidebarTab,
    backendReady,
    catalogReady,
    initOffline,
    registryHydrating,
    bootLabel,
    bootProgress,
    discoverMode,
    setDiscoverMode,
    leaderboards,
    leaderboardTab,
    setLeaderboardTab,
    focusLeaderboardEntry,
    filteredAssets,
    browseAssets,
    catalogTotal,
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
    selectedRepo,
    setSelectedRepo,
    openRepo,
    closeRepo,
    dbStats,
    syncRegistry,
    loadCatalog,
    loadCatalogPage,
    pushLog,
    runUserActivity,
    markActivitiesRead,
    archiveReadActivities,
    deleteArchivedActivities,
    clearConsole,
    setBusy,
    toggleSelectAllVisible,
    toggleSelectAllForIds,
    deselectAll,
    toggleRow,
  };
}

export type Studio = ReturnType<typeof useStudio>;
