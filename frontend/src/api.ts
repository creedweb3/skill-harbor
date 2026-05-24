export type InstallStatus = {
  status: "none" | "global" | "project" | "both";
  installed: { name: string; scope: string; match: string }[];
  overlap_warning: boolean;
  overlap_names: string[];
  name_collision: boolean;
  safe_to_install: boolean;
};

export type Asset = {
  id: string;
  source_repo: string;
  source_path: string;
  asset_type: string;
  asset_type_label: string;
  categories: string[];
  domains: string[];
  primary_domain?: string;
  secondary_domains?: string[];
  tech_tags?: string[];
  platforms?: string[];
  branch?: string;
  github_blob_url?: string;
  github_repo_url?: string;
  score: number;
  stars: number;
  content_preview: string;
  content_sha256?: string;
  content?: string;
  install_name: string;
  raw_url: string;
  curated: boolean;
  curated_rank: number;
  curated_title: string;
  install_status: InstallStatus;
  repo_pushed_at?: string;
  source_type?: string;
  upvotes?: number;
  downvotes?: number;
  vote_score?: number;
  user_vote?: number;
  safety?: {
    safe: boolean;
    reason: string;
    warnings: string[];
    verdict: "pass" | "block";
  };
};

export type CategoryGroup = {
  id: string;
  label: string;
  categories: string[];
};

export type PlatformInfo = {
  id: string;
  label: string;
  vendor: string;
  status: "stable" | "beta" | "planned";
  description: string;
  global_root: string;
  project_root: string;
  supported_assets: string[];
  installable: boolean;
  docs_url?: string | null;
  restart_hint?: string;
};

export type PlatformsResponse = {
  platforms: PlatformInfo[];
  default_platform: string;
};

export type ConnectionInfo = {
  platform?: string;
  platform_label?: string;
  platform_status?: string;
  vendor?: string;
  global_root?: string;
  global_exists?: boolean;
  project_root?: string;
  project_exists?: boolean;
  supported_assets?: string[];
  installable?: boolean;
  restart_hint?: string;
  docs_url?: string | null;
  user_cursor_dir: string;
  user_exists: boolean;
  project_dir: string;
  project_cursor_dir: string;
  project_cursor_exists: boolean;
  note: string;
  scopes: {
    user: ScopeInfo;
    project: ScopeInfo;
  };
};

export type InstalledItem = { name: string; path?: string; asset_type?: string };

export type InstalledUpdate = {
  name: string;
  scope: "user" | "project";
  asset_type: string;
  local_hash: string;
  registry_hash: string;
  registry_asset_id: string;
  registry_title: string;
  source_repo: string;
  stars: number;
};

export type ScopeInfo = {
  exists: boolean;
  skills: { name: string; path: string }[];
  rules: InstalledItem[];
  commands: InstalledItem[];
  agents: InstalledItem[];
};

export type ExportBundle = {
  version: number;
  exported_at: string;
  scopes: Record<string, {
    skills: { name: string; content: string; content_sha256: string }[];
    rules: { name: string; content: string; content_sha256: string }[];
    commands: { name: string; content: string; content_sha256: string }[];
    agents: { name: string; content: string; content_sha256: string }[];
  }>;
};

export type RepoOwnerMeta = {
  owner: string;
  asset_count: number;
  repo_count: number;
};

export type CategoriesResponse = {
  categories: string[];
  groups: CategoryGroup[];
  discovery_professions: DiscoveryProfession[];
  domain_labels: Record<string, string>;
  tech_stack_labels?: Record<string, string>;
  repo_owners?: RepoOwnerMeta[];
  curated_help: string;
};

export type DiscoveryProfession = {
  domain: string;
  label: string;
};

export type LeaderboardEntry = {
  id: string;
  title: string;
  install_folder: string;
  category: string;
  domain: string;
  rank: number;
  owner: string;
  repo: string;
  path: string;
  source_repo: string;
  optional?: boolean;
  notes?: string;
};

export type LeaderboardsResponse = {
  top_picks: LeaderboardEntry[];
  trending: LeaderboardEntry[];
  by_domain: { domain: string; label: string; items: LeaderboardEntry[] }[];
  total_curated: number;
};

export function formatApiError(text: string, status: number, statusText: string): string {
  return parseApiError(text, status, statusText);
}

function parseApiError(text: string, status: number, statusText: string): string {
  try {
    const data = JSON.parse(text) as { detail?: string | { msg?: string }[] };
    if (typeof data.detail === "string" && data.detail) {
      if (data.detail === "Internal Server Error") {
        return "API crashed or is not responding. Stop and restart: npm run dev (check the api terminal for Traceback).";
      }
      return data.detail;
    }
    if (Array.isArray(data.detail) && data.detail.length) {
      const first = data.detail[0];
      if (first && typeof first.msg === "string") return first.msg;
    }
  } catch {
    /* not JSON */
  }
  const plain = text.trim();
  if (plain === "Internal Server Error" || plain.includes("ECONNREFUSED")) {
    return "Cannot reach the API on port 8765. Run npm run dev from the project root and reload this page.";
  }
  if (plain) return plain;
  if (status === 401) {
    return "Admin sign-in required — open /admin-dashboard and log in.";
  }
  if (status === 403) {
    return "Forbidden — you do not have permission for this action.";
  }
  if (status === 429) {
    return "GitHub rate limit exceeded. Add a token in Settings and try again.";
  }
  if (status >= 500 || statusText === "Internal Server Error") {
    return "Backend unavailable. From the project folder run: npm run dev (API on port 8765).";
  }
  return statusText || `Request failed (${status})`;
}

async function api<T>(path: string, init?: RequestInit & { admin?: boolean }): Promise<T> {
  const { admin, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    credentials: admin ? "include" : rest.credentials,
    headers: {
      "Content-Type": "application/json",
      ...(rest.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseApiError(text, res.status, res.statusText));
  }
  return res.json() as Promise<T>;
}

export const getSettings = () =>
  api<{
    project_dir: string;
    db_path: string;
    asset_count: number;
    synced_content_count: number;
    last_synced_at?: string;
    last_sync_status?: string;
    database?: string;
    stars_last_refreshed_at?: string | null;
    stars_live?: boolean;
    min_repo_stars: number;
    default_platform?: string;
    platform_mode?: "auto" | "manual";
    extra_install_platforms?: string[];
    active_platform?: string;
    platform_auto_detect?: boolean;
  }>("/api/settings");

export type PlatformDetection = {
  detected: {
    id: string;
    label: string;
    status: string;
    score: number;
    global_root: string;
    global_exists: boolean;
    project_root: string;
    project_exists: boolean;
  }[];
  recommended_platform: string;
  count: number;
  platform_mode?: string;
  active_platform?: string;
};

export const getPlatforms = (includePlanned = true) =>
  api<PlatformsResponse>(`/api/platforms?include_planned=${includePlanned}`);

export type DiscoveryUiConfig = {
  version?: number;
  layout?: { columns?: number; rows?: number };
  limits?: {
    profession_domain_count?: number;
    items_per_domain?: number;
    trending_limit?: number;
    for_you_limit?: number;
  };
  profession_domains?: string[];
  rotate_domains?: boolean;
  rotation_week_offset?: number;
};

export type DiscoveryBootstrap = {
  config: DiscoveryUiConfig;
  profession_domains: DiscoveryProfession[];
};

export type BootstrapResponse = {
  settings: {
    project_dir: string;
    default_platform: string;
    platform_mode: "auto" | "manual";
    extra_install_platforms: string[];
    active_platform: string;
    asset_count: number;
    synced_content_count: number;
    last_synced_at?: string;
    stars_last_refreshed_at?: string | null;
    stars_live?: boolean;
  };
  connection: ConnectionInfo;
  categories: CategoriesResponse;
  discovery: DiscoveryBootstrap;
  leaderboards: LeaderboardsResponse;
  platforms: PlatformsResponse;
  catalog: { assets: Asset[]; total: number };
};

export const getBootstrap = (platform?: string) => {
  const q = platform ? `?platform=${encodeURIComponent(platform)}` : "";
  return api<BootstrapResponse>(`/api/bootstrap${q}`);
};

export const getPlatformDetect = () => api<PlatformDetection>("/api/platforms/detect");

export const postAutoDetectPlatform = () =>
  api<PlatformDetection>("/api/platforms/auto-detect", { method: "POST" });

export type CatalogResponse = {
  assets: Asset[];
  total: number;
  offset?: number;
  limit?: number;
  has_more?: boolean;
  stats?: {
    total_assets: number;
    synced_content: number;
    last_sync?: Record<string, unknown>;
  };
};

/** Default page size for GET /api/catalog (matches backend). */
export const CATALOG_DEFAULT_LIMIT = 60;

/** Page size when bulk-loading the full registry client-side. */
export const CATALOG_BULK_PAGE_SIZE = 500;

export type CatalogQueryParams = {
  domain?: string;
  tech?: string;
  asset_type?: string;
  platform?: string;
  q?: string;
  period?: string;
  include_stats?: boolean;
};

export type CatalogPageParams = CatalogQueryParams & {
  limit?: number;
  offset?: number;
};

export const getCatalog = (params?: CatalogPageParams) => {
  const sp = new URLSearchParams();
  if (params?.domain) sp.set("domain", params.domain);
  if (params?.tech) sp.set("tech", params.tech);
  if (params?.asset_type) sp.set("asset_type", params.asset_type);
  if (params?.platform) sp.set("platform", params.platform);
  if (params?.q) sp.set("q", params.q);
  if (params?.period) sp.set("period", params.period);
  sp.set("limit", String(params?.limit ?? CATALOG_DEFAULT_LIMIT));
  sp.set("offset", String(params?.offset ?? 0));
  if (params?.include_stats) sp.set("include_stats", "true");
  const q = sp.toString();
  return api<CatalogResponse>(`/api/catalog?${q}`);
};

/** Load every catalog row (paginated) for install selection / client-side Browse filters. */
export async function fetchAllCatalog(
  params?: CatalogQueryParams & { pageSize?: number }
): Promise<CatalogResponse> {
  const pageSize = params?.pageSize ?? CATALOG_BULK_PAGE_SIZE;
  const { pageSize: _drop, ...rest } = params ?? {};

  const first = await getCatalog({
    ...rest,
    limit: pageSize,
    offset: 0,
    include_stats: true,
  });

  const all = [...first.assets];
  const total = first.total;
  const stats = first.stats;

  if (all.length >= total || first.assets.length < pageSize) {
    return { assets: all, total, stats };
  }

  const offsets: number[] = [];
  for (let offset = pageSize; offset < total; offset += pageSize) {
    offsets.push(offset);
  }

  const restPages = await Promise.all(
    offsets.map((offset) =>
      getCatalog({
        ...rest,
        limit: pageSize,
        offset,
        include_stats: false,
      })
    )
  );

  for (const page of restPages) {
    all.push(...page.assets);
  }

  return { assets: all, total, stats };
}

export const getAssetDetail = (id: string, voterId?: string) => {
  const sp = new URLSearchParams({ id });
  if (voterId) sp.set("voter_id", voterId);
  return api<Asset>(`/api/asset?${sp}`);
};

export const postVote = (assetId: string, direction: "up" | "down", voterId: string) =>
  api<{ upvotes: number; downvotes: number; score: number; user_vote: number }>("/api/vote", {
    method: "POST",
    body: JSON.stringify({ asset_id: assetId, direction, voter_id: voterId }),
  });

export type AdminDashboard = {
  kpis: {
    total_assets: number;
    synced_content: number;
    sync_coverage_pct: number;
    unique_repos: number;
    queue_pending?: number;
    queue_total?: number;
    below_min_stars: number;
    min_repo_stars: number;
    total_upvotes: number;
    total_downvotes: number;
    unique_voters: number;
    total_vote_records: number;
    db_size_mb: number;
  };
  charts: {
    by_asset_type: { label: string; value: number }[];
    by_source_type: { label: string; value: number }[];
    top_repos: { label: string; assets: number; stars: number }[];
    top_domains: { label: string; value: number }[];
    registry_growth: { label: string; value: number }[];
  };
  top_voted: {
    id: string;
    title: string;
    install_name: string;
    source_repo: string;
    upvotes: number;
    downvotes: number;
    score: number;
  }[];
  sync_history: {
    id: number;
    started_at: string;
    finished_at: string;
    status: string;
    assets_updated: number;
    error_count: number;
    message: string;
  }[];
  last_sync?: Record<string, unknown>;
  db_path: string;
};

export const getAdminSession = () =>
  api<{
    authenticated: boolean;
    github_token_set: boolean;
    credentials_configured: boolean;
  }>("/api/admin/auth/session", { admin: true });

export const postAdminLogin = (username: string, password: string) =>
  api<{ ok: boolean }>("/api/admin/auth/login", {
    admin: true,
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

export const postAdminLogout = () =>
  api<{ ok: boolean }>("/api/admin/auth/logout", { admin: true, method: "POST" });

export const patchAdminSettings = (body: { admin_github_token?: string | null }) =>
  api<{ github_token_set: boolean; stars_last_refreshed_at?: string | null }>(
    "/api/admin/settings",
    { admin: true, method: "PATCH", body: JSON.stringify(body) }
  );

export type RegistrySetting = {
  key: string;
  value: number | string | boolean;
  value_type: string;
  description: string;
  updated_at: string | null;
  updated_by: string;
};

export const getRegistrySettings = () =>
  api<{ settings: RegistrySetting[] }>("/api/admin/settings/registry", { admin: true });

export const getDiscoverySettings = () =>
  api<{ discovery_ui: DiscoveryUiConfig; profession_domains: DiscoveryProfession[] }>(
    "/api/admin/settings/discovery",
    { admin: true }
  );

export const patchDiscoverySettings = (discovery_ui: DiscoveryUiConfig) =>
  api<{ discovery_ui: DiscoveryUiConfig; profession_domains: DiscoveryProfession[] }>(
    "/api/admin/settings/discovery",
    {
      admin: true,
      method: "PATCH",
      body: JSON.stringify({ discovery_ui }),
    }
  );

export const patchRegistrySettings = (body: {
  min_repo_stars?: number;
  max_files_per_repo_expand?: number;
  discover_max_per_skills_query?: number;
  discover_max_per_domain_query?: number;
}) =>
  api<{ updated: string[]; settings: RegistrySetting[] }>("/api/admin/settings/registry", {
    admin: true,
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const getAdminUsers = () =>
  api<{ users: { id: number; username: string; role: string; active: number }[] }>(
    "/api/admin/users",
    { admin: true }
  );

export const postAdminUser = (body: { username: string; password: string; role?: string }) =>
  api<{ user: Record<string, unknown> }>("/api/admin/users", {
    admin: true,
    method: "POST",
    body: JSON.stringify(body),
  });

export const getAdminDashboard = () =>
  api<AdminDashboard>("/api/admin/dashboard", { admin: true });

export type AdminJobStart = {
  activity_id: number;
  status: string;
  message: string;
  snapshot_before?: {
    total_assets: number;
    unique_repos: number;
    synced_content: number;
    captured_at: string;
  };
};

export type AdminActivityLogLine = {
  ts: string;
  level: string;
  message: string;
  kind?: "human" | "dev";
};

export type AdminActivityRow = {
  id: number;
  action: string;
  detail: string;
  status: string;
  created_at: string;
  progress?: number;
  step?: string;
  finished_at?: string;
  summary?: string;
  logs?: AdminActivityLogLine[];
  result?: Record<string, unknown> | null;
  snapshot_before?: AdminJobStart["snapshot_before"];
  snapshot_after?: AdminJobStart["snapshot_before"];
};

export const getAdminActivity = () =>
  api<{ items: AdminActivityRow[] }>("/api/admin/activity", { admin: true });

export const getAdminActivityRunning = () =>
  api<{ running: boolean; job: AdminActivityRow | null }>("/api/admin/activity/running", {
    admin: true,
  });

export const getAdminActivityDetail = (id: number) =>
  api<AdminActivityRow>(`/api/admin/activity/${id}`, { admin: true });

export const postAdminActivityCancel = (activityId?: number) =>
  api<{ ok: boolean; message: string; activity_id?: number; status?: string }>(
    "/api/admin/activity/cancel",
    {
      admin: true,
      method: "POST",
      body: JSON.stringify(activityId != null ? { activity_id: activityId } : {}),
    }
  );

const jobPost = (path: string, body?: string) =>
  api<AdminJobStart>(path, { admin: true, method: "POST", ...(body ? { body } : {}) });

export const postAdminRegistryRefresh = () => jobPost("/api/admin/registry/refresh");

export const postAdminRegistryExpand = () => jobPost("/api/admin/registry/expand");

export const postAdminRegistryDedupe = () => jobPost("/api/admin/registry/dedupe");

export const postAdminRegistryReclassify = () => jobPost("/api/admin/registry/reclassify");

export const postAdminRegistryPrune = () => jobPost("/api/admin/registry/prune");

export const postAdminRegistrySync = (force = false) =>
  jobPost("/api/admin/registry/sync", JSON.stringify({ force }));

export const postAdminRefreshStars = () => jobPost("/api/admin/registry/refresh-stars");

export const postCustomRepoImport = (repo_url: string) =>
  api<{ added: number; owner: string; repo: string }>("/api/admin/registry/custom", {
    admin: true,
    method: "POST",
    body: JSON.stringify({ repo_url }),
  });

/** Public: sync file content from GitHub into harbor.db */
export const postSync = (force = false) =>
  api<{ updated: number; errors: string[]; status: string }>("/api/sync", {
    method: "POST",
    body: JSON.stringify({ force }),
  });

export const postRegistryExpand = () => postAdminRegistryExpand();

export const getSyncStatus = () =>
  api<{ last_sync: Record<string, unknown>; stats: CatalogResponse["stats"] }>("/api/sync/status");

export const patchSettings = (body: {
  project_dir?: string;
  default_platform?: string;
  platform_mode?: "auto" | "manual";
  extra_install_platforms?: string[];
}) =>
  api("/api/settings", { method: "PATCH", body: JSON.stringify(body) });

export const getConnection = (platform?: string) => {
  const q = platform ? `?platform=${encodeURIComponent(platform)}` : "";
  return api<ConnectionInfo>(`/api/connection${q}`);
};

export const getInstalledUpdates = () =>
  api<{ updates: InstalledUpdate[]; count: number }>("/api/installed/updates");

export const postAdminRegistryEvolve = (force = false) =>
  jobPost(`/api/admin/registry/evolve${force ? "?force=true" : ""}`);

export const postAdminRegistryDiscover = (force = false) =>
  jobPost(`/api/admin/registry/discover${force ? "?force=true" : ""}`);

export const postAdminRegistryCrawlBatch = (force = false) =>
  jobPost(`/api/admin/registry/crawl-batch${force ? "?force=true" : ""}`);

export const getAdminRegistryQueue = () =>
  api<{ queue: Record<string, number> }>("/api/admin/registry/queue", { admin: true });

export const getCategories = () => api<CategoriesResponse>("/api/categories");

export const getLeaderboards = () => api<LeaderboardsResponse>("/api/leaderboards");

export const postPreview = (body: {
  categories: string[];
  top_per_category: number;
  curated_only: boolean;
  include_discovery: boolean;
}) =>
  api<{
    assets: Asset[];
    errors: string[];
    repos_scanned: string[];
    rate_limited?: boolean;
    category_meta?: CategoriesResponse;
  }>("/api/preview", { method: "POST", body: JSON.stringify(body) });

export const postInstall = (body: {
  assets: Asset[];
  install_user: boolean;
  install_project: boolean;
  force: boolean;
  platform?: string;
  platforms?: string[];
}) =>
  api<{
    installed: { user: string[]; project: string[] };
    errors: string[];
    platform?: string;
    platforms?: string[];
    installed_by_platform?: Record<string, { user: string[]; project: string[] }>;
  }>(
    "/api/install",
    { method: "POST", body: JSON.stringify(body) }
  );

export const getExport = (includeUser = true, includeProject = true) =>
  api<ExportBundle>(
    `/api/export?include_user=${includeUser}&include_project=${includeProject}`
  );

export const postImport = (body: {
  bundle: ExportBundle;
  import_user: boolean;
  import_project: boolean;
  force: boolean;
}) => api<{ imported: { user: string[]; project: string[] } }>("/api/import", {
  method: "POST",
  body: JSON.stringify(body),
});

export const removeAsset = (
  assetType: string,
  name: string,
  scope: "user" | "project"
) =>
  api(
    `/api/assets/${encodeURIComponent(assetType)}/${encodeURIComponent(name)}?scope=${scope}`,
    { method: "DELETE" }
  );

export const removeSkill = (name: string, scope: "user" | "project") =>
  removeAsset("skill", name, scope);
