import type {
  Asset,
  DiscoveryProfession,
  LeaderboardsResponse,
} from "../api";
import type { TrendPeriod } from "../hooks/useStudio";
import type { InstalledRow } from "./installedGroups";
import {
  buildRepoTrends,
  compareAssetsForYou,
  countUniqueRepos,
  pickDiverseFiles,
  type RepoTrend,
} from "./ranking";

export type DashboardItem = {
  id: string;
  title: string;
  rank: number;
  domain: string;
  source_repo: string;
  install_folder: string;
  asset?: Asset;
  curated: boolean;
  stars?: number;
  isRepoTrend?: boolean;
  repoAssetCount?: number;
};

export type DiscoverySection =
  | {
      kind: "trending";
      id: "github-trending";
      label: string;
      description: string;
      items: DashboardItem[];
      repoTrends: RepoTrend[];
      featured: true;
    }
  | {
      kind: "for_you";
      id: "for-you";
      label: string;
      description: string;
      items: DashboardItem[];
      uniqueRepoCount: number;
      featured: true;
    }
  | {
      kind: "profession";
      id: string;
      label: string;
      domain: string;
      items: DashboardItem[];
      featured: false;
    };

const PERIOD_LABEL: Record<TrendPeriod, string> = {
  day: "Trending today",
  week: "Trending this week",
  month: "Trending this month",
  year: "Trending this year",
  all: "All-time top repos",
};

const PERIOD_DESC: Record<TrendPeriod, string> = {
  day: "Top GitHub repos updated in the last 24 hours — ranked by stars.",
  week: "Top repos updated in the last 7 days — ranked by stars.",
  month: "Top repos updated in the last 30 days — ranked by stars.",
  year: "Top repos updated in the last year — ranked by stars.",
  all: "Highest-star GitHub repos in the registry — one card per repository.",
};

export const TRENDING_LIMIT = 9;
export const DOMAIN_LIMIT = 5;
export const FOR_YOU_LIMIT = 9;

function itemFromAsset(asset: Asset, domain: string, rank = 99): DashboardItem {
  return {
    id: asset.id,
    title: asset.curated_title || asset.install_name,
    rank,
    domain,
    source_repo: asset.source_repo,
    install_folder: asset.install_name,
    asset,
    curated: asset.curated,
    stars: asset.stars,
  };
}

function repoTrendToItem(trend: RepoTrend, rank: number): DashboardItem {
  const [, repoName] = trend.source_repo.split("/");
  return {
    id: `repo::${trend.source_repo}`,
    title: repoName || trend.source_repo,
    rank,
    domain: "general",
    source_repo: trend.source_repo,
    install_folder: trend.representative.install_name,
    asset: trend.representative,
    curated: false,
    stars: trend.stars,
    isRepoTrend: true,
    repoAssetCount: trend.assetCount,
  };
}

function buildForYouFiles(
  assets: Asset[],
  installedItems: InstalledRow[]
): { items: DashboardItem[]; uniqueRepoCount: number } {
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

  let ranked: Asset[];

  if (installedDomains.size > 0) {
    const domainPool: Asset[] = [];
    const seen = new Set<string>();
    for (const domain of installedDomains) {
      for (const asset of assets) {
        if (!(asset.domains ?? asset.categories).includes(domain)) continue;
        if (installedNames.has(asset.install_name.toLowerCase())) continue;
        if (seen.has(asset.id)) continue;
        seen.add(asset.id);
        domainPool.push(asset);
      }
    }
    ranked = pickDiverseFiles(domainPool, {
      limit: FOR_YOU_LIMIT,
      maxPerRepo: 1,
      compare: compareAssetsForYou,
    });
  } else {
    ranked = pickDiverseFiles(assets, {
      limit: FOR_YOU_LIMIT,
      maxPerRepo: 1,
      compare: compareAssetsForYou,
    });
  }

  return {
    items: ranked.map((asset, i) =>
      itemFromAsset(
        asset,
        asset.primary_domain ?? (asset.domains ?? asset.categories)[0] ?? "docs-workflow",
        i + 1
      )
    ),
    uniqueRepoCount: countUniqueRepos(ranked),
  };
}

function buildDomainFiles(assets: Asset[], domain: string): DashboardItem[] {
  return pickDiverseFiles(assets, {
    domain,
    limit: DOMAIN_LIMIT,
    maxPerRepo: 1,
  }).map((asset, i) => itemFromAsset(asset, domain, i + 1));
}

export function buildDiscoverySections(
  professions: DiscoveryProfession[],
  _leaderboards: LeaderboardsResponse | null,
  assets: Asset[],
  installedItems: InstalledRow[],
  trendPeriod: TrendPeriod
): DiscoverySection[] {
  const repoTrends = assets.length ? buildRepoTrends(assets, trendPeriod, TRENDING_LIMIT) : [];
  const forYou = assets.length ? buildForYouFiles(assets, installedItems) : { items: [], uniqueRepoCount: 0 };

  const sections: DiscoverySection[] = [
    {
      kind: "trending",
      id: "github-trending",
      label: PERIOD_LABEL[trendPeriod],
      description: assets.length
        ? PERIOD_DESC[trendPeriod]
        : "Curated top picks — sync registry for live GitHub rankings.",
      items: repoTrends.map((t, i) => repoTrendToItem(t, i + 1)),
      repoTrends,
      featured: true,
    },
    {
      kind: "for_you",
      id: "for-you",
      label: "For You",
      description:
        installedItems.length > 0
          ? `One top skill per source — ${forYou.uniqueRepoCount} repos, matched to your categories.`
          : `Best skill from each source repo — ${forYou.uniqueRepoCount} different repositories.`,
      items: forYou.items,
      uniqueRepoCount: forYou.uniqueRepoCount,
      featured: true,
    },
  ];

  for (const prof of professions) {
    const items = assets.length ? buildDomainFiles(assets, prof.domain) : [];
    if (items.length === 0) continue;
    sections.push({
      kind: "profession",
      id: prof.domain,
      label: prof.label,
      domain: prof.domain,
      items,
      featured: false,
    });
  }

  return sections;
}

export function dashboardItemSelectable(item: DashboardItem): string | null {
  return item.asset?.id ?? null;
}
