import { useMemo, useState } from "react";
import type { Studio } from "../hooks/useStudio";
import { AssetRankCard } from "../components/dashboard/AssetRankCard";

type Props = { studio: Studio };

export function BrowsePage({ studio }: Props) {
  const {
    filteredAssets,
    search,
    setSearch,
    typeFilter,
    setTypeFilter,
    selectedAssetId,
    setSelectedAssetId,
    toggleRow,
    assets,
  } = studio;
  const [domainFilter, setDomainFilter] = useState("all");

  const domains = useMemo(() => {
    const s = new Set<string>();
    for (const a of assets) {
      for (const d of a.domains ?? a.categories) s.add(d);
    }
    return ["all", ...[...s].sort()];
  }, [assets]);

  const shown = useMemo(() => {
    let list = filteredAssets;
    if (domainFilter !== "all") {
      list = list.filter((a) => (a.domains ?? a.categories).includes(domainFilter));
    }
    return list;
  }, [filteredAssets, domainFilter]);

  return (
    <div className="harbor-page">
      <header
        style={{
          padding: "1rem 0",
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
        }}
      >
        <input
          type="search"
          placeholder="Search registry…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: "1 1 200px",
            padding: "0.55rem 0.85rem",
            borderRadius: "var(--harbor-radius)",
            border: "1px solid var(--harbor-border)",
            background: "var(--harbor-surface)",
            color: "var(--harbor-text)",
          }}
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{
            padding: "0.55rem 0.85rem",
            borderRadius: "var(--harbor-radius)",
            border: "1px solid var(--harbor-border)",
            background: "var(--harbor-surface)",
            color: "var(--harbor-text)",
          }}
        >
          <option value="all">All types</option>
          <option value="skill">Skills</option>
          <option value="rule">Rules</option>
          <option value="command">Commands</option>
          <option value="agent">Agents</option>
        </select>
        <select
          value={domainFilter}
          onChange={(e) => setDomainFilter(e.target.value)}
          style={{
            padding: "0.55rem 0.85rem",
            borderRadius: "var(--harbor-radius)",
            border: "1px solid var(--harbor-border)",
            background: "var(--harbor-surface)",
            color: "var(--harbor-text)",
          }}
        >
          {domains.map((d) => (
            <option key={d} value={d}>
              {d === "all" ? "All domains" : d}
            </option>
          ))}
        </select>
        <span style={{ fontSize: "0.75rem", color: "var(--harbor-muted)" }}>{shown.length} assets</span>
      </header>
      <div className="harbor-masonry">
        {shown.map((asset) => (
          <AssetRankCard
            key={asset.id}
            asset={asset}
            selected={selectedAssetId === asset.id}
            onSelect={() => {
              setSelectedAssetId(asset.id);
            }}
          />
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="harbor-empty">No assets match. Try Sync registry or adjust filters.</p>
      ) : null}
    </div>
  );
}
