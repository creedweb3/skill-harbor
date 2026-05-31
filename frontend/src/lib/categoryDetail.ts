import type { Asset, DiscoveryProfession } from "../api";
import type { TrendPeriod } from "../hooks/useStudio";
import type { InstalledRow } from "./installedGroups";
import {
  assetDisplayTitle,
  assetQualityScore,
  buildRepoTrends,
  compareAssets,
  compareSkillsWithinRepo,
  interleaveAssetsByRepoOrder,
  repoLatestPushMs,
  repoMaxStars,
  repoShortName,
  sortAssetsByRepoOrder,
  type BuildRepoTrendsOpts,
} from "./ranking";

export type DiscoverySectionKind = "trending" | "for_you" | "profession" | "repos";

export type DiscoverySectionView = {
  kind: DiscoverySectionKind;
  id: string;
  label: string;
  description?: string;
  domain?: string;
};

export function domainViewForProfession(p: DiscoveryProfession): DiscoverySectionView {
  return {
    kind: "profession",
    id: `profession-${p.domain}`,
    label: p.label,
    description: `All skills in ${p.label}. Sort by repo stars (popular first), push date, or name.`,
    domain: p.domain,
  };
}

export function reposListView(): DiscoverySectionView {
  return {
    kind: "repos",
    id: "repos-all",
    label: "All ranked repositories",
    description: "Browse every indexed GitHub repo and open one to see its skills, rules, and commands.",
  };
}

export type CategorySortKey =
  | "trend"
  | "rank"
  | "stars"
  | "votes"
  | "quality"
  | "name"
  | "recent";

/** Domain / For You — flat skill sorts (distinct from trending interleave). */
export const CATEGORY_SORT_OPTIONS: { value: CategorySortKey; label: string }[] = [
  { value: "stars", label: "GitHub stars" },
  { value: "recent", label: "Recently pushed" },
  { value: "name", label: "Name A–Z" },
];

export function categorySortOptions(kind: DiscoverySectionKind) {
  if (kind === "trending" || kind === "repos") return [];
  return CATEGORY_SORT_OPTIONS;
}

export const TREND_PERIOD_LABEL: Record<TrendPeriod, string> = {
  day: "Last 24 hours",
  week: "Last 7 days",
  month: "Last 30 days",
  year: "Last year",
  all: "All time",
};

export type SortCategoryOptions = {
  trendPeriod?: TrendPeriod;
  /** Full catalog for repo-level trend scores (defaults to `list`). */
  trendCatalog?: Asset[];
  trendOpts?: BuildRepoTrendsOpts;
};

/**
 * Skills ranked for the trending catalog view: repos follow the same trend order as
 * Discovery home, but skills are interleaved (best skill per repo, round-robin) so
 * period changes are visible on page 1 instead of one mega-repo filling the grid.
 */
export function assetsInTrendOrder(assets: Asset[], trendPeriod: TrendPeriod): Asset[] {
  if (!assets.length) return [];
  const trends = buildRepoTrends(assets, trendPeriod, assets.length);
  if (!trends.length) return [];

  const byRepo = new Map<string, Asset[]>();
  for (const asset of assets) {
    const list = byRepo.get(asset.source_repo) ?? [];
    list.push(asset);
    byRepo.set(asset.source_repo, list);
  }

  const repoOrder = trends.map((t) => t.source_repo);
  const interleaved = interleaveAssetsByRepoOrder(repoOrder, byRepo);
  const seen = new Set(interleaved.map((a) => a.id));

  // Repos without trend scores (edge case) append in star order at the end.
  const tail: Asset[] = [];
  for (const asset of assets) {
    if (seen.has(asset.id)) continue;
    tail.push(asset);
  }
  tail.sort(compareAssets);

  return [...interleaved, ...tail];
}

export function assetInDomain(asset: Asset, domain: string): boolean {
  const primary = asset.primary_domain ?? (asset.domains ?? asset.categories)[0];
  return (
    primary === domain ||
    (asset.domains ?? asset.categories).includes(domain) ||
    (asset.secondary_domains ?? []).includes(domain)
  );
}

function forYouPool(assets: Asset[], installedItems: InstalledRow[]): Asset[] {
  const installedNames = new Set(
    installedItems.map(({ item }) => item.name.toLowerCase())
  );
  const installedDomains = new Set<string>();
  for (const { item } of installedItems) {
    const match = assets.find((a) => a.install_name.toLowerCase() === item.name.toLowerCase());
    if (match) {
      if (match.primary_domain) installedDomains.add(match.primary_domain);
      for (const d of match.domains ?? match.categories) installedDomains.add(d);
    }
  }

  if (installedDomains.size === 0) {
    return assets.filter((a) => !installedNames.has(a.install_name.toLowerCase()));
  }

  const pool: Asset[] = [];
  const seen = new Set<string>();
  for (const domain of installedDomains) {
    for (const asset of assets) {
      if (!assetInDomain(asset, domain)) continue;
      if (installedNames.has(asset.install_name.toLowerCase())) continue;
      if (seen.has(asset.id)) continue;
      seen.add(asset.id);
      pool.push(asset);
    }
  }
  return pool;
}

export function assetsForSectionView(
  view: DiscoverySectionView,
  assets: Asset[],
  installedItems: InstalledRow[],
  trendPeriod: TrendPeriod
): Asset[] {
  if (!assets.length) return [];

  if (view.kind === "profession" && view.domain) {
    return assets.filter((a) => assetInDomain(a, view.domain!));
  }

  if (view.kind === "for_you") {
    return forYouPool(assets, installedItems);
  }

  if (view.kind === "trending") {
    return assetsInTrendOrder(assets, trendPeriod);
  }

  return assets;
}

export function sortCategoryAssets(
  list: Asset[],
  sort: CategorySortKey,
  opts?: SortCategoryOptions
): Asset[] {
  const sorted = [...list];
  switch (sort) {
    case "trend": {
      const catalog = opts?.trendCatalog ?? list;
      const period = opts?.trendPeriod ?? "week";
      const scores = new Map(
        buildRepoTrends(catalog, period, catalog.length, opts?.trendOpts).map((t) => [
          t.source_repo,
          t.trendScore,
        ])
      );
      sorted.sort((a, b) => {
        const scoreA = scores.get(a.source_repo) ?? 0;
        const scoreB = scores.get(b.source_repo) ?? 0;
        return scoreB - scoreA || compareAssets(a, b);
      });
      break;
    }
    case "stars":
      return sortAssetsByRepoOrder(list, (ra, rb, byRepo) => {
        const sa = repoMaxStars(byRepo.get(ra) ?? []);
        const sb = repoMaxStars(byRepo.get(rb) ?? []);
        return sb - sa || ra.localeCompare(rb);
      });
    case "votes":
      sorted.sort(
        (a, b) =>
          (b.vote_score ?? 0) - (a.vote_score ?? 0) ||
          b.stars - a.stars ||
          a.install_name.localeCompare(b.install_name)
      );
      break;
    case "quality":
      sorted.sort(
        (a, b) =>
          assetQualityScore(b) - assetQualityScore(a) ||
          b.stars - a.stars ||
          a.install_name.localeCompare(b.install_name)
      );
      break;
    case "name":
      sorted.sort((a, b) =>
        assetDisplayTitle(a).localeCompare(assetDisplayTitle(b))
      );
      break;
    case "recent":
      return sortAssetsByRepoOrder(list, (ra, rb, byRepo) => {
        const pa = repoLatestPushMs(byRepo.get(ra) ?? []);
        const pb = repoLatestPushMs(byRepo.get(rb) ?? []);
        if (pa !== pb) {
          if (!pa) return 1;
          if (!pb) return -1;
          return pb - pa;
        }
        // Never fall back to star rank — use repo name so this differs from GitHub stars.
        return ra.localeCompare(rb);
      });
    case "rank":
    default:
      sorted.sort((a, b) => {
        const rankA = a.curated_rank ?? 99;
        const rankB = b.curated_rank ?? 99;
        if (rankA !== rankB) return rankA - rankB;
        return compareAssets(a, b);
      });
      break;
  }
  return sorted;
}

export function defaultSortForSection(kind: DiscoverySectionKind): CategorySortKey {
  if (kind === "trending") return "trend";
  return "stars";
}

type ChartItem = { label: string; value: number };

function topCounts(
  entries: Map<string, number>,
  limit = 6,
  labelFn?: (key: string) => string
): ChartItem[] {
  return [...entries.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, value]) => ({
      label: labelFn ? labelFn(key) : key,
      value,
    }));
}

export type CategoryAnalytics = {
  total: number;
  byAssetType: ChartItem[];
  topRepos: ChartItem[];
  voteLeaders: ChartItem[];
  starsDistribution: ChartItem[];
};

export function buildCategoryAnalytics(assets: Asset[]): CategoryAnalytics {
  const byType = new Map<string, number>();
  const byRepo = new Map<string, number>();
  const voteLeaders: ChartItem[] = [];

  for (const asset of assets) {
    const type = asset.asset_type_label || asset.asset_type;
    byType.set(type, (byType.get(type) ?? 0) + 1);
    byRepo.set(asset.source_repo, (byRepo.get(asset.source_repo) ?? 0) + 1);
  }

  voteLeaders.push(
    ...[...assets]
      .sort((a, b) => (b.vote_score ?? 0) - (a.vote_score ?? 0) || b.stars - a.stars)
      .slice(0, 6)
      .map((a) => ({
        label: a.curated_title || a.install_name,
        value: Math.max(0, a.vote_score ?? 0),
      }))
      .filter((i) => i.value > 0)
  );

  const starBuckets = [
    { label: "100k+", min: 100_000, max: Infinity },
    { label: "10k–99k", min: 10_000, max: 99_999 },
    { label: "1k–9k", min: 1_000, max: 9_999 },
    { label: "<1k", min: 0, max: 999 },
  ];
  const starsDistribution = starBuckets.map((bucket) => ({
    label: bucket.label,
    value: assets.filter((a) => a.stars >= bucket.min && a.stars <= bucket.max).length,
  }));

  return {
    total: assets.length,
    byAssetType: topCounts(byType),
    topRepos: topCounts(byRepo, 6, repoShortName),
    voteLeaders,
    starsDistribution,
  };
}

export function sectionViewFromSection(
  section: import("./dashboard").DiscoverySection
): DiscoverySectionView | null {
  if (section.kind === "trending") {
    return {
      kind: "trending",
      id: section.id,
      label: "All ranked skills & rules",
      description:
        "One top skill per trending repo on each page — period tabs reorder repos (same as GitHub Trending). Within a repo, skills sort by votes and quality.",
    };
  }
  if (section.kind === "for_you") {
    return {
      kind: "for_you",
      id: section.id,
      label: section.label,
      description: section.description,
    };
  }
  if (section.kind === "profession") {
    return {
      kind: "profession",
      id: section.id,
      label: section.label,
      description: `All skills in ${section.label}, sorted by GitHub stars by default.`,
      domain: section.domain,
    };
  }
  return null;
}
