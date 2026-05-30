import type { Asset } from "../api";
import { buildRepoTrends, countUniqueRepos, type RepoTrend } from "./ranking";

export type AssetTypeCounts = {
  skill: number;
  rule: number;
  command: number;
  agent: number;
  other: number;
};

export type DiscoveryPulseStats = {
  repoCount: number;
  assetCount: number;
  domainCount: number;
  assetTypes: AssetTypeCounts;
  monthLeader: RepoTrend | null;
};

function countUniqueDomains(assets: Asset[]): number {
  const domains = new Set<string>();
  for (const asset of assets) {
    const domain = asset.primary_domain ?? (asset.domains ?? asset.categories)[0];
    if (domain) domains.add(domain);
  }
  return domains.size;
}

function countAssetTypes(assets: Asset[]): AssetTypeCounts {
  const counts: AssetTypeCounts = { skill: 0, rule: 0, command: 0, agent: 0, other: 0 };
  for (const asset of assets) {
    const type = asset.asset_type;
    if (type === "skill") counts.skill++;
    else if (type === "rule") counts.rule++;
    else if (type === "command") counts.command++;
    else if (type === "agent") counts.agent++;
    else counts.other++;
  }
  return counts;
}

export function buildDiscoveryPulse(assets: Asset[]): DiscoveryPulseStats {
  const repoCount = countUniqueRepos(assets);
  const monthRanked = buildRepoTrends(assets, "month", repoCount + 1);

  return {
    repoCount,
    assetCount: assets.length,
    domainCount: countUniqueDomains(assets),
    assetTypes: countAssetTypes(assets),
    monthLeader: monthRanked[0] ?? null,
  };
}
