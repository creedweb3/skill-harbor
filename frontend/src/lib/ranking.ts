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
  const pushed = asset.repo_pushed_at ? Date.parse(asset.repo_pushed_at) : NaN;
  if (!Number.isNaN(pushed)) return now - pushed <= PERIOD_MS[period];
  return (asset.curated_rank ?? 99) <= 5;
}

export type RepoTrend = {
  source_repo: string;
  stars: number;
  assetCount: number;
  representative: Asset;
  latestPush?: string;
};

export function buildRepoTrends(
  assets: Asset[],
  period: TrendPeriod,
  limit: number
): RepoTrend[] {
  if (!assets.length) return [];

  const now = Date.now();
  const byRepo = new Map<string, Asset[]>();

  for (const asset of assets) {
    if (!assetInPeriod(asset, period, now) && period !== "all") continue;
    const list = byRepo.get(asset.source_repo) ?? [];
    list.push(asset);
    byRepo.set(asset.source_repo, list);
  }

  if (byRepo.size === 0) {
    for (const asset of assets) {
      const list = byRepo.get(asset.source_repo) ?? [];
      list.push(asset);
      byRepo.set(asset.source_repo, list);
    }
  }

  return [...byRepo.entries()]
    .map(([source_repo, files]) => {
      const sorted = [...files].sort(compareAssets);
      const stars = Math.max(...files.map((f) => f.stars));
      const latestPush = files
        .map((f) => f.repo_pushed_at)
        .filter(Boolean)
        .sort()
        .pop();
      return {
        source_repo,
        stars,
        assetCount: files.length,
        representative: sorted[0],
        latestPush,
      };
    })
    .sort(
      (a, b) =>
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

  return dedupePickedAssets(out);
}

/** Drop duplicate ids / same repo+install / same display title in one list. */
function dedupePickedAssets(assets: Asset[]): Asset[] {
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
