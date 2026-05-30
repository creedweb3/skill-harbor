import type { Asset, ConnectionInfo, InstalledItem, InstalledRegistryMatch } from "../api";

export type InstalledRow = {
  item: InstalledItem | { name: string; path: string; asset_type?: string };
  scope: "user" | "project";
};

export type InstalledTypeGroup = {
  assetType: string;
  label: string;
  items: { name: string; asset_type?: string }[];
};

export type InstalledScopeSection = {
  scope: "user" | "project";
  title: string;
  path: string;
  groups: InstalledTypeGroup[];
};

const TYPE_ORDER = ["skill", "rule", "command", "agent", "agents_md"] as const;

const TYPE_LABELS: Record<string, string> = {
  skill: "Skills",
  rule: "Rules",
  command: "Commands",
  agent: "Subagents",
  agents_md: "Agents docs",
};

export function groupInstalledItems(
  rows: InstalledRow[],
  connection: ConnectionInfo | null
): InstalledScopeSection[] {
  const sections: InstalledScopeSection[] = [];

  for (const scope of ["user", "project"] as const) {
    const scopeRows = rows.filter((r) => r.scope === scope);
    if (!scopeRows.length) continue;

    const byType = new Map<string, { name: string; asset_type?: string }[]>();
    for (const { item } of scopeRows) {
      const t = item.asset_type ?? "skill";
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t)!.push({ name: item.name, asset_type: t });
    }

    const groups: InstalledTypeGroup[] = [];
    for (const t of TYPE_ORDER) {
      const items = byType.get(t);
      if (items?.length) {
        groups.push({
          assetType: t,
          label: TYPE_LABELS[t] ?? t,
          items: items.sort((a, b) => a.name.localeCompare(b.name)),
        });
      }
    }
    for (const [t, items] of byType) {
      if (TYPE_ORDER.includes(t as (typeof TYPE_ORDER)[number])) continue;
      groups.push({ assetType: t, label: TYPE_LABELS[t] ?? t, items });
    }

    sections.push({
      scope,
      title: scope === "user" ? "Global" : "This project",
      path:
        scope === "user"
          ? connection?.user_cursor_dir ?? "—"
          : connection?.project_cursor_dir ?? "—",
      groups,
    });
  }

  return sections;
}

export function installedItemKey(
  scope: "user" | "project",
  assetType: string,
  name: string
): string {
  return `${scope}:${assetType}:${name}`;
}

export function parseInstalledItemKey(key: string): {
  scope: "user" | "project";
  assetType: string;
  name: string;
} {
  const [scope, assetType, ...rest] = key.split(":");
  return {
    scope: scope as "user" | "project",
    assetType,
    name: rest.join(":"),
  };
}

export function allInstalledItemKeys(sections: InstalledScopeSection[]): string[] {
  const keys: string[] = [];
  for (const section of sections) {
    keys.push(...scopeInstalledItemKeys(section));
  }
  return keys;
}

export function scopeInstalledItemKeys(section: InstalledScopeSection): string[] {
  const keys: string[] = [];
  for (const group of section.groups) {
    for (const item of group.items) {
      keys.push(installedItemKey(section.scope, item.asset_type ?? group.assetType, item.name));
    }
  }
  return keys;
}

/** Match an installed item name to a catalog asset (same logic as dashboard/category detail). */
export function findAssetForInstalled(
  assets: Asset[],
  name: string,
  assetType?: string
): Asset | undefined {
  const key = name.toLowerCase();
  const byName = assets.filter((a) => a.install_name.toLowerCase() === key);
  if (!byName.length) return undefined;

  if (assetType) {
    const typed = byName.filter((a) => a.asset_type === assetType);
    if (typed.length === 1) return typed[0];
    if (typed.length > 1) {
      return [...typed].sort((a, b) => b.stars - a.stars)[0];
    }
  }

  if (byName.length === 1) return byName[0];
  return [...byName].sort((a, b) => b.stars - a.stars)[0];
}

const ASSET_TYPE_LABELS: Record<string, string> = {
  skill: "Skill",
  rule: "Rule",
  command: "Command",
  agent: "Agent",
  agents_md: "Agents doc",
};

const LOCAL_INSTALL_STATUS = {
  status: "none" as const,
  installed: [],
  overlap_warning: false,
  overlap_names: [],
  name_collision: false,
  safe_to_install: true,
};

function baseLocalAsset(name: string, assetType: string): Asset {
  return {
    id: "",
    install_name: name,
    curated_title: name,
    source_repo: "",
    source_path: "",
    asset_type: assetType,
    asset_type_label: ASSET_TYPE_LABELS[assetType] ?? assetType,
    categories: [],
    domains: [],
    score: 0,
    stars: 0,
    content_preview: " ",
    raw_url: "",
    curated: false,
    curated_rank: 0,
    install_status: LOCAL_INSTALL_STATUS,
  };
}

export function assetFromRegistryMatch(match: InstalledRegistryMatch): Asset {
  return {
    ...baseLocalAsset(match.name, match.asset_type),
    id: match.registry_asset_id,
    curated_title: match.registry_title,
    source_repo: match.source_repo,
    stars: match.stars ?? 0,
  };
}

export function resolveInstalledDisplayAsset(
  assets: Asset[],
  name: string,
  assetType: string,
  match?: InstalledRegistryMatch | null
): { displayAsset: Asset; openId: string | null } {
  const catalog = findAssetForInstalled(assets, name, assetType);
  if (catalog) {
    return { displayAsset: catalog, openId: catalog.id };
  }
  if (match) {
    return {
      displayAsset: assetFromRegistryMatch(match),
      openId: match.registry_asset_id,
    };
  }
  return { displayAsset: baseLocalAsset(name, assetType), openId: null };
}
