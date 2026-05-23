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
  score: number;
  stars: number;
  content_preview: string;
  content?: string;
  install_name: string;
  raw_url: string;
  curated: boolean;
  curated_rank: number;
  curated_title: string;
  install_status: InstallStatus;
  repo_pushed_at?: string;
};

export type CategoryGroup = {
  id: string;
  label: string;
  categories: string[];
};

export type ConnectionInfo = {
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

export type CategoriesResponse = {
  categories: string[];
  groups: CategoryGroup[];
  discovery_professions: DiscoveryProfession[];
  domain_labels: Record<string, string>;
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

function parseApiError(text: string, status: number, statusText: string): string {
  try {
    const data = JSON.parse(text) as { detail?: string };
    if (typeof data.detail === "string" && data.detail) return data.detail;
  } catch {
    /* not JSON */
  }
  if (text) return text;
  if (status === 429) {
    return "GitHub rate limit exceeded. Add a token in Settings and try again.";
  }
  if (status >= 500 || statusText === "Internal Server Error") {
    return "Backend unavailable. From the project folder run: npm run dev (API on port 8765).";
  }
  return statusText || `Request failed (${status})`;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
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
    github_token_set: boolean;
    db_path: string;
    asset_count: number;
    synced_content_count: number;
    last_synced_at?: string;
    last_sync_status?: string;
  }>("/api/settings");

export type CatalogResponse = {
  assets: Asset[];
  total: number;
  stats: {
    total_assets: number;
    synced_content: number;
    last_sync?: Record<string, unknown>;
  };
};

export const getCatalog = (params?: {
  domain?: string;
  asset_type?: string;
  q?: string;
  period?: string;
  limit?: number;
}) => {
  const sp = new URLSearchParams();
  if (params?.domain) sp.set("domain", params.domain);
  if (params?.asset_type) sp.set("asset_type", params.asset_type);
  if (params?.q) sp.set("q", params.q);
  if (params?.period) sp.set("period", params.period);
  if (params?.limit) sp.set("limit", String(params.limit));
  const q = sp.toString();
  return api<CatalogResponse>(`/api/catalog${q ? `?${q}` : ""}`);
};

export const getAssetDetail = (id: string) =>
  api<Asset>(`/api/asset?id=${encodeURIComponent(id)}`);

export const postSync = (force = false) =>
  api<{ updated: number; errors: string[]; status: string; stats: CatalogResponse["stats"] }>(
    "/api/sync",
    { method: "POST", body: JSON.stringify({ force }) }
  );

export const postRegistryExpand = () =>
  api<{
    added: number;
    updated: number;
    errors: string[];
    stats: CatalogResponse["stats"];
  }>("/api/registry/expand", { method: "POST" });

export const getSyncStatus = () =>
  api<{ last_sync: Record<string, unknown>; stats: CatalogResponse["stats"] }>("/api/sync/status");

export const patchSettings = (body: {
  project_dir?: string;
  github_token?: string;
}) => api("/api/settings", { method: "PATCH", body: JSON.stringify(body) });

export const getConnection = () => api<ConnectionInfo>("/api/connection");

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
}) =>
  api<{ installed: { user: string[]; project: string[] }; errors: string[] }>(
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
