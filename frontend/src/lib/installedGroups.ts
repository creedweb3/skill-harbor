import type { ConnectionInfo, InstalledItem } from "../api";

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
