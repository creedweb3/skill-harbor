import type { Asset, DiscoveryProfession } from "../api";
import type { TrendPeriod } from "../hooks/useStudio";
import type { InstalledRow } from "./installedGroups";
import {
  assetQualityScore,
  buildRepoTrends,
  compareAssets,
  repoShortName,
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
    description: `All skills ranked in ${p.label}.`,
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
  | "rank"
  | "stars"
  | "votes"
  | "quality"
  | "name"
  | "recent";

export const CATEGORY_SORT_OPTIONS: { value: CategorySortKey; label: string }[] = [
  { value: "rank", label: "Rank score" },
  { value: "stars", label: "GitHub stars" },
  { value: "votes", label: "Community votes" },
  { value: "quality", label: "Quality score" },
  { value: "recent", label: "Recently updated repos" },
  { value: "name", label: "Name A–Z" },
];

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
    const trends = buildRepoTrends(assets, trendPeriod, assets.length);
    const reps = trends.map((t) => t.representative);
    const seen = new Set<string>();
    const out: Asset[] = [];
    for (const asset of reps) {
      if (seen.has(asset.id)) continue;
      seen.add(asset.id);
      out.push(asset);
    }
    for (const asset of assets) {
      if (seen.has(asset.id)) continue;
      seen.add(asset.id);
      out.push(asset);
    }
    return out;
  }

  return assets;
}

export function sortCategoryAssets(list: Asset[], sort: CategorySortKey): Asset[] {
  const sorted = [...list];
  switch (sort) {
    case "stars":
      sorted.sort((a, b) => b.stars - a.stars || a.install_name.localeCompare(b.install_name));
      break;
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
      sorted.sort((a, b) => a.install_name.localeCompare(b.install_name));
      break;
    case "recent":
      sorted.sort((a, b) => {
        const ta = a.repo_pushed_at ? Date.parse(a.repo_pushed_at) : 0;
        const tb = b.repo_pushed_at ? Date.parse(b.repo_pushed_at) : 0;
        return tb - ta || b.stars - a.stars || a.install_name.localeCompare(b.install_name);
      });
      break;
    case "rank":
    default:
      sorted.sort(compareAssets);
      break;
  }
  return sorted;
}

export function defaultSortForSection(kind: DiscoverySectionKind): CategorySortKey {
  if (kind === "for_you") return "quality";
  if (kind === "trending" || kind === "repos") return "stars";
  return "rank";
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
        "Browse the full catalog — sort by stars, votes, quality, or recency. Repos have their own page.",
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
      description: `All skills ranked in ${section.label}.`,
      domain: section.domain,
    };
  }
  return null;
}
