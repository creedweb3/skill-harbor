import type {
  Asset,
  DiscoveryProfession,
  LeaderboardEntry,
  LeaderboardsResponse,
} from "../api";
import type { TrendPeriod } from "../hooks/useStudio";
import type { InstalledRow } from "./installedGroups";

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
};

export type DiscoverySection =
  | {
      kind: "trending";
      id: "github-trending";
      label: string;
      description: string;
      items: DashboardItem[];
      featured: true;
    }
  | {
      kind: "for_you";
      id: "for-you";
      label: string;
      description: string;
      items: DashboardItem[];
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

const PERIOD_MS: Record<TrendPeriod, number> = {
  day: 86400000,
  week: 7 * 86400000,
  month: 30 * 86400000,
  year: 365 * 86400000,
  all: Infinity,
};

const PERIOD_MAX_RANK: Record<TrendPeriod, number> = {
  day: 1,
  week: 2,
  month: 3,
  year: 4,
  all: 99,
};

const PERIOD_LABEL: Record<TrendPeriod, string> = {
  day: "Trending today",
  week: "Trending this week",
  month: "Trending this month",
  year: "Trending this year",
  all: "All-time top",
};

const PERIOD_DESC: Record<TrendPeriod, string> = {
  day: "Repos updated in the last 24 hours — ranked by stars.",
  week: "Updated in the last 7 days — ranked by stars.",
  month: "Updated in the last 30 days — ranked by stars.",
  year: "Updated in the last year — ranked by stars.",
  all: "Highest GitHub star count across the catalog.",
};

function itemFromAsset(asset: Asset, domain: string): DashboardItem {
  return {
    id: asset.id,
    title: asset.curated_title || asset.install_name,
    rank: asset.curated_rank || 99,
    domain,
    source_repo: asset.source_repo,
    install_folder: asset.install_name,
    asset,
    curated: asset.curated,
    stars: asset.stars,
  };
}

function itemFromLeaderboard(entry: LeaderboardEntry): DashboardItem {
  return {
    id: entry.id,
    title: entry.title,
    rank: entry.rank,
    domain: entry.domain,
    source_repo: entry.source_repo,
    install_folder: entry.install_folder,
    curated: true,
  };
}

function mergeDomainItems(
  domain: string,
  lbEntries: LeaderboardEntry[],
  domainAssets: Asset[]
): DashboardItem[] {
  const assetByFolder = new Map(domainAssets.map((a) => [a.install_name.toLowerCase(), a]));
  const merged = new Map<string, DashboardItem>();

  for (const entry of lbEntries) {
    const matched =
      assetByFolder.get(entry.install_folder.toLowerCase()) ??
      domainAssets.find((a) => a.source_repo === entry.source_repo);
    merged.set(entry.id, { ...itemFromLeaderboard(entry), asset: matched, stars: matched?.stars });
  }

  for (const asset of domainAssets) {
    if (!merged.has(asset.id)) {
      merged.set(asset.id, itemFromAsset(asset, domain));
    }
  }

  return [...merged.values()]
    .sort((a, b) => (b.stars ?? b.asset?.stars ?? 0) - (a.stars ?? a.asset?.stars ?? 0) || a.title.localeCompare(b.title))
    .slice(0, 5);
}

function assetInPeriod(asset: Asset, period: TrendPeriod, now: number): boolean {
  if (period === "all") return true;
  const pushed = asset.repo_pushed_at ? Date.parse(asset.repo_pushed_at) : NaN;
  if (!Number.isNaN(pushed)) {
    return now - pushed <= PERIOD_MS[period];
  }
  return (asset.curated_rank || 99) <= PERIOD_MAX_RANK[period];
}

function buildTrending(
  leaderboards: LeaderboardsResponse | null,
  assets: Asset[],
  period: TrendPeriod
): DashboardItem[] {
  const now = Date.now();
  const maxRank = PERIOD_MAX_RANK[period];

  if (assets.length) {
    let pool = assets.filter((a) => assetInPeriod(a, period, now));
    if (pool.length < 4 && period !== "all") {
      pool = assets.filter((a) => (a.curated_rank || 99) <= maxRank + 1);
    }
    if (pool.length < 4) pool = assets;

    const seen = new Set<string>();
    return [...pool]
      .sort((a, b) => b.stars - a.stars || a.install_name.localeCompare(b.install_name))
      .filter((a) => {
        if (seen.has(a.install_name)) return false;
        seen.add(a.install_name);
        return true;
      })
      .slice(0, 20)
      .map((a, i) => ({
        ...itemFromAsset(a, (a.domains ?? a.categories)[0] ?? "general"),
        rank: i + 1,
      }));
  }

  const pool = (leaderboards?.trending ?? []).filter((e) => e.rank <= maxRank);
  const fallback = leaderboards?.top_picks ?? [];
  const merged = pool.length ? pool : fallback;
  return merged.slice(0, 16).map((e, i) => ({
    ...itemFromLeaderboard(e),
    rank: i + 1,
  }));
}

function buildForYou(
  leaderboards: LeaderboardsResponse | null,
  assets: Asset[],
  installedItems: InstalledRow[]
): DashboardItem[] {
  const installedNames = new Set(installedItems.map(({ item }) => item.name.toLowerCase()));

  const installedDomains = new Set<string>();
  for (const { item } of installedItems) {
    const match = assets.find((a) => a.install_name.toLowerCase() === item.name.toLowerCase());
    if (match) {
      for (const d of match.domains ?? match.categories) installedDomains.add(d);
    }
  }

  const pickFromDomain = (domain: string, limit: number): DashboardItem[] => {
    const lb = leaderboards?.by_domain.find((d) => d.domain === domain)?.items ?? [];
    const domainAssets = assets.filter((a) => (a.domains ?? a.categories).includes(domain));
    return mergeDomainItems(domain, lb, domainAssets)
      .filter((item) => !installedNames.has(item.install_folder.toLowerCase()))
      .slice(0, limit);
  };

  if (installedDomains.size > 0) {
    const out: DashboardItem[] = [];
    const seen = new Set<string>();
    for (const domain of installedDomains) {
      for (const item of pickFromDomain(domain, 3)) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        out.push(item);
      }
    }
    return out.slice(0, 12);
  }

  return (leaderboards?.top_picks ?? []).slice(0, 10).map((e) => itemFromLeaderboard(e));
}

export function buildDiscoverySections(
  professions: DiscoveryProfession[],
  leaderboards: LeaderboardsResponse | null,
  assets: Asset[],
  installedItems: InstalledRow[],
  trendPeriod: TrendPeriod
): DiscoverySection[] {
  const assetsByDomain = new Map<string, Asset[]>();
  for (const asset of assets) {
    for (const domain of asset.domains ?? asset.categories) {
      if (!assetsByDomain.has(domain)) assetsByDomain.set(domain, []);
      assetsByDomain.get(domain)!.push(asset);
    }
  }

  const lbByDomain = new Map(
    (leaderboards?.by_domain ?? []).map((d) => [d.domain, d.items])
  );

  const sections: DiscoverySection[] = [
    {
      kind: "trending",
      id: "github-trending",
      label: PERIOD_LABEL[trendPeriod],
      description: assets.length
        ? PERIOD_DESC[trendPeriod]
        : "Curated top picks — fetch catalog for live GitHub ranking.",
      items: buildTrending(leaderboards, assets, trendPeriod),
      featured: true,
    },
    {
      kind: "for_you",
      id: "for-you",
      label: "For You",
      description:
        installedItems.length > 0
          ? "Based on what you already installed."
          : "Popular picks until you install your first skill.",
      items: buildForYou(leaderboards, assets, installedItems),
      featured: true,
    },
  ];

  for (const prof of professions) {
    const items = mergeDomainItems(
      prof.domain,
      lbByDomain.get(prof.domain) ?? [],
      assetsByDomain.get(prof.domain) ?? []
    );
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
