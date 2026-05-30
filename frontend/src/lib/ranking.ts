import type { Asset } from "../api";
import type { TrendPeriod } from "../hooks/useStudio";

const PERIOD_MS: Record<TrendPeriod, number> = {
  day: 86400000,
  week: 7 * 86400000,
  month: 30 * 86400000,
  year: 365 * 86400000,
  all: Infinity,
};

/** Composite quality: votes, stars, curated rank, content depth. */
export function assetQualityScore(asset: Asset): number {
  const votes = asset.vote_score ?? 0;
  const stars = Math.log10(Math.max(asset.stars, 1) + 1) * 5;
  const curated = (asset.curated_rank ?? 99) <= 5 ? 3 : 0;
  const contentDepth = Math.min((asset.content_preview?.length ?? 0) / 400, 4);
  const typed =
    asset.asset_type === "skill" ? 1 : asset.asset_type === "rule" ? 0.5 : 0;
  return votes * 12 + stars + curated + contentDepth + typed;
}

/** Sort files: quality → repo stars → votes → name */
export function compareAssets(a: Asset, b: Asset): number {
  const q = assetQualityScore(b) - assetQualityScore(a);
  if (q !== 0) return q > 0 ? 1 : -1;
  if (b.stars !== a.stars) return b.stars - a.stars;
  const voteA = a.vote_score ?? 0;
  const voteB = b.vote_score ?? 0;
  if (voteB !== voteA) return voteB - voteA;
  return a.install_name.localeCompare(b.install_name);
}

/** Prefer skills over rules when stars tie (For You). */
export function compareAssetsForYou(a: Asset, b: Asset): number {
  const typeRank = (t: string) => (t === "skill" ? 0 : t === "command" ? 1 : t === "agent" ? 2 : 3);
  const starCmp = compareAssets(a, b);
  if (starCmp !== 0) return starCmp;
  return typeRank(a.asset_type) - typeRank(b.asset_type);
}

function pathLeaf(asset: Asset): string {
  const parts = (asset.source_path ?? "").replace(/\\/g, "/").split("/").filter(Boolean);
  if (!parts.length) return "";
  return parts[parts.length - 1].replace(/\.(md|mdc)$/i, "");
}

function pathParent(asset: Asset): string {
  const parts = (asset.source_path ?? "").replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length < 2) return "";
  return parts[parts.length - 2].replace(/\.(md|mdc)$/i, "");
}

/** Short human title — never the long repo-prefixed slug. */
export function assetDisplayTitle(asset: Asset): string {
  const leaf = pathLeaf(asset);
  const parent = pathParent(asset);

  if (leaf && /^skill\.md$/i.test(`${leaf}.md`)) {
    if (parent && !/^(skills|rules)$/i.test(parent)) {
      return titleCase(parent);
    }
  }

  if (leaf && !/^(skill|skills|rules|agents)$/i.test(leaf)) {
    return titleCase(leaf);
  }

  if (parent && !/^(skills|rules|commands|agents)$/i.test(parent)) {
    return titleCase(parent);
  }

  const install = asset.install_name?.replace(/\.mdc$/i, "") ?? "";
  if (install.includes("--")) {
    const tail = install.split("--").pop() ?? install;
    if (tail.length <= 36) return titleCase(tail);
  }

  const fallback = asset.curated_title || asset.install_name;
  if (fallback.length > 40) return `${fallback.slice(0, 38)}…`;
  return fallback;
}

function titleCase(s: string): string {
  return s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function repoShortName(sourceRepo: string): string {
  return sourceRepo.split("/").pop() ?? sourceRepo;
}

export function repoOwner(sourceRepo: string): string {
  return sourceRepo.split("/")[0] ?? sourceRepo;
}

export function listRepoOwners(assets: Asset[]): string[] {
  const owners = new Set<string>();
  for (const asset of assets) {
    const owner = repoOwner(asset.source_repo);
    if (owner) owners.add(owner);
  }
  return [...owners].sort((a, b) => a.localeCompare(b));
}

/** Stable accent from repo name (for card borders / avatars). */
export function repoAccentHue(sourceRepo: string): number {
  let hash = 0;
  for (let i = 0; i < sourceRepo.length; i++) {
    hash = sourceRepo.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

function assetInPeriod(asset: Asset, period: TrendPeriod, now: number): boolean {
  if (period === "all") return true;
  const raw = asset.repo_pushed_at?.trim();
  if (!raw) return true;
  const pushed = Date.parse(raw);
  if (Number.isNaN(pushed)) return true;
  return now - pushed <= PERIOD_MS[period];
}

function groupAssetsByRepo(assets: Asset[], period: TrendPeriod, now: number): Map<string, Asset[]> {
  const byRepo = new Map<string, Asset[]>();
  for (const asset of assets) {
    if (!assetInPeriod(asset, period, now) && period !== "all") continue;
    const list = byRepo.get(asset.source_repo) ?? [];
    list.push(asset);
    byRepo.set(asset.source_repo, list);
  }
  return byRepo;
}

/** 0–1 score: 1 = just pushed, 0 = at or beyond the selected window. */
function recencyScore(
  pushedAt: string | undefined,
  period: TrendPeriod,
  now: number
): number {
  if (!pushedAt) return 0.08;
  const ts = Date.parse(pushedAt);
  if (Number.isNaN(ts)) return 0.08;
  const ageMs = Math.max(0, now - ts);
  if (period === "all") {
    const halfLife = 60 * 86400000;
    return Math.exp(-ageMs / halfLife);
  }
  const windowMs = PERIOD_MS[period];
  if (ageMs >= windowMs) return 0;
  return 1 - ageMs / windowMs;
}

/** Shorter windows lean on activity; longer windows allow star weight. */
function periodStarWeight(period: TrendPeriod): number {
  switch (period) {
    case "day":
      return 0.12;
    case "week":
      return 0.22;
    case "month":
      return 0.32;
    case "year":
      return 0.42;
    default:
      return 0.5;
  }
}

/**
 * Composite repo trend score: activity (push recency) + stars + catalog depth + community votes.
 * Watchers/forks can be wired in when persisted from GitHub repo metadata.
 */
export function repoTrendScore(
  opts: {
    stars: number;
    assetCount: number;
    latestPush?: string;
    voteTotal: number;
    period: TrendPeriod;
    now?: number;
  }
): number {
  const now = opts.now ?? Date.now();
  const recency = recencyScore(opts.latestPush, opts.period, now);
  const starScore = Math.log10(Math.max(opts.stars, 1) + 1);
  const depthScore = Math.log10(Math.max(opts.assetCount, 1) + 1) * 1.5;
  const voteScore = Math.log10(Math.max(opts.voteTotal, 0) + 1) * 2.5;
  const starW = periodStarWeight(opts.period);
  const activityW = Math.max(0.35, 1.05 - starW);

  return (
    recency * activityW * 12 +
    starScore * starW * 4 +
    depthScore * 0.35 +
    voteScore * 0.6
  );
}

export type RepoTrend = {
  source_repo: string;
  stars: number;
  assetCount: number;
  representative: Asset;
  latestPush?: string;
  trendScore: number;
  voteTotal: number;
};

export function buildRepoTrends(
  assets: Asset[],
  period: TrendPeriod,
  limit: number
): RepoTrend[] {
  if (!assets.length) return [];

  const now = Date.now();
  let byRepo = groupAssetsByRepo(assets, period, now);

  // Strict period window empty (no recent pushes) — fall back to full catalog, still trend-scored
  if (byRepo.size === 0 && period !== "all") {
    byRepo = groupAssetsByRepo(assets, "all", now);
  }

  if (byRepo.size === 0) return [];

  return [...byRepo.entries()]
    .map(([source_repo, files]) => {
      const sorted = [...files].sort(compareAssets);
      const stars = Math.max(...files.map((f) => f.stars));
      const latestPush = files
        .map((f) => f.repo_pushed_at)
        .filter(Boolean)
        .sort()
        .pop();
      const voteTotal = files.reduce((sum, f) => sum + (f.vote_score ?? 0), 0);
      const trendScore = repoTrendScore({
        stars,
        assetCount: files.length,
        latestPush,
        voteTotal,
        period,
        now,
      });
      return {
        source_repo,
        stars,
        assetCount: files.length,
        representative: sorted[0],
        latestPush,
        voteTotal,
        trendScore,
      };
    })
    .sort(
      (a, b) =>
        b.trendScore - a.trendScore ||
        b.stars - a.stars ||
        b.assetCount - a.assetCount ||
        a.source_repo.localeCompare(b.source_repo)
    )
    .slice(0, limit);
}

export type PickFilesOptions = {
  domain?: string;
  excludeInstallNames?: Set<string>;
  limit: number;
  /** Max picks from the same GitHub repo (1 = full diversity). */
  maxPerRepo?: number;
  compare?: (a: Asset, b: Asset) => number;
};

function filterPool(assets: Asset[], opts: PickFilesOptions): Asset[] {
  let pool = assets;
  if (opts.domain) {
    const domain = opts.domain;
    pool = pool.filter((a) => {
      const primary = a.primary_domain ?? (a.domains ?? a.categories)[0];
      return primary === domain;
    });
  }
  if (opts.excludeInstallNames?.size) {
    pool = pool.filter((a) => !opts.excludeInstallNames!.has(a.install_name.toLowerCase()));
  }
  return pool;
}

/**
 * Round-robin across repos (sorted by repo quality) so one mega-repo cannot fill the grid.
 * Pass 1: best file from each repo. Pass 2: second file (if maxPerRepo > 1), etc.
 */
export function pickDiverseFiles(assets: Asset[], opts: PickFilesOptions): Asset[] {
  const pool = filterPool(assets, opts);
  if (!pool.length) return [];

  const compare = opts.compare ?? compareAssets;
  const maxPerRepo = opts.maxPerRepo ?? 1;
  const limit = opts.limit;

  const byRepo = new Map<string, Asset[]>();
  for (const asset of pool) {
    const list = byRepo.get(asset.source_repo) ?? [];
    list.push(asset);
    byRepo.set(asset.source_repo, list);
  }
  for (const [repo, list] of byRepo) {
    byRepo.set(repo, [...list].sort(compare));
  }

  const repos = [...byRepo.keys()].sort((ra, rb) => {
    const bestA = byRepo.get(ra)![0];
    const bestB = byRepo.get(rb)![0];
    return compare(bestA, bestB);
  });

  const out: Asset[] = [];
  const pickedFromRepo = new Map<string, number>();

  for (let round = 0; round < maxPerRepo && out.length < limit; round++) {
    for (const repo of repos) {
      if (out.length >= limit) break;
      if ((pickedFromRepo.get(repo) ?? 0) >= maxPerRepo) continue;
      const bucket = byRepo.get(repo)!;
      const asset = bucket[round];
      if (!asset) continue;
      out.push(asset);
      pickedFromRepo.set(repo, (pickedFromRepo.get(repo) ?? 0) + 1);
    }
  }

  return dedupeDisplayAssets(out);
}

/** Drop duplicate ids / same repo+install / same display title in one list. */
export function dedupeDisplayAssets(assets: Asset[]): Asset[] {
  const seenId = new Set<string>();
  const seenInstall = new Set<string>();
  const seenTitle = new Set<string>();
  const out: Asset[] = [];
  for (const asset of assets) {
    if (seenId.has(asset.id)) continue;
    const installKey = `${asset.source_repo}:${asset.install_name.toLowerCase()}`;
    const titleKey = `${asset.source_repo}:${assetDisplayTitle(asset).toLowerCase()}`;
    if (seenInstall.has(installKey) || seenTitle.has(titleKey)) continue;
    seenId.add(asset.id);
    seenInstall.add(installKey);
    seenTitle.add(titleKey);
    out.push(asset);
  }
  return out;
}

/** @deprecated use pickDiverseFiles */
export function rankFiles(
  assets: Asset[],
  opts: { domain?: string; excludeInstallNames?: Set<string>; limit: number }
): Asset[] {
  return pickDiverseFiles(assets, { ...opts, maxPerRepo: 1 });
}

export function countUniqueRepos(assets: Asset[]): number {
  return new Set(assets.map((a) => a.source_repo)).size;
}

export function assetsForRepo(assets: Asset[], sourceRepo: string): Asset[] {
  return dedupeDisplayAssets(
    assets.filter((a) => a.source_repo === sourceRepo).sort(compareAssets)
  );
}

export function assetIdsForRepo(assets: Asset[], sourceRepo: string): string[] {
  return assetsForRepo(assets, sourceRepo).map((a) => a.id);
}

export function assetIdsForRepos(assets: Asset[], sourceRepos: string[]): string[] {
  const ids: string[] = [];
  for (const sourceRepo of sourceRepos) {
    ids.push(...assetIdsForRepo(assets, sourceRepo));
  }
  return ids;
}

export function isRepoFullySelected(
  selectedIds: Set<string>,
  assets: Asset[],
  sourceRepo: string
): boolean {
  const ids = assetIdsForRepo(assets, sourceRepo);
  return ids.length > 0 && ids.every((id) => selectedIds.has(id));
}

export function repoTrendFor(
  assets: Asset[],
  sourceRepo: string,
  period: TrendPeriod = "all"
): RepoTrend | null {
  const trends = buildRepoTrends(assets, period, assets.length);
  return trends.find((t) => t.source_repo === sourceRepo) ?? null;
}
