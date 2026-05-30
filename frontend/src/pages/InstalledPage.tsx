import { useCallback, useEffect, useMemo, useState } from "react";
import type { Studio } from "../hooks/useStudio";
import {
  getAssetDetail,
  getInstalledMatches,
  getInstalledUpdates,
  postInstall,
  removeAsset,
  type InstalledRegistryMatch,
  type InstalledUpdate,
} from "../api";
import { InstalledCard } from "../components/installed/InstalledCard";
import { SelectionPill } from "../components/ui/SelectionPill";
import {
  allInstalledItemKeys,
  groupInstalledItems,
  installedItemKey,
  parseInstalledItemKey,
  resolveInstalledDisplayAsset,
  scopeInstalledItemKeys,
} from "../lib/installedGroups";

type Props = { studio: Studio };

export function InstalledPage({ studio }: Props) {
  const {
    installedItems,
    connection,
    busy,
    runExport,
    runImport,
    onRemove,
    refresh,
    runUserActivity,
    pushLog,
    assets,
    selectedAssetId,
    setSelectedAssetId,
    loadCatalog,
  } = studio;
  const [updates, setUpdates] = useState<InstalledUpdate[]>([]);
  const [matches, setMatches] = useState<InstalledRegistryMatch[]>([]);
  const [updating, setUpdating] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const sections = useMemo(
    () => groupInstalledItems(installedItems, connection),
    [installedItems, connection]
  );

  const allKeys = useMemo(() => allInstalledItemKeys(sections), [sections]);

  const updateByKey = useMemo(() => {
    const m = new Map<string, InstalledUpdate>();
    for (const u of updates) {
      m.set(`${u.scope}:${u.asset_type}:${u.name}`, u);
    }
    return m;
  }, [updates]);

  const matchByKey = useMemo(() => {
    const m = new Map<string, InstalledRegistryMatch>();
    for (const match of matches) {
      m.set(`${match.scope}:${match.asset_type}:${match.name}`, match);
    }
    return m;
  }, [matches]);

  const loadInstalledMeta = useCallback(async () => {
    try {
      const [updatesRes, matchesRes] = await Promise.all([
        getInstalledUpdates(),
        getInstalledMatches(),
      ]);
      setUpdates(updatesRes.updates);
      setMatches(matchesRes.matches);
    } catch {
      setUpdates([]);
      setMatches([]);
    }
  }, []);

  useEffect(() => {
    loadInstalledMeta();
  }, [loadInstalledMeta, installedItems.length]);

  useEffect(() => {
    setSelectedKeys((prev) => {
      const valid = new Set(allKeys);
      const next = new Set([...prev].filter((key) => valid.has(key)));
      return next.size === prev.size ? prev : next;
    });
  }, [allKeys]);

  const toggleSelectAllForKeys = (keys: string[]) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const allSelected = keys.length > 0 && keys.every((key) => prev.has(key));
      if (allSelected) {
        keys.forEach((key) => next.delete(key));
      } else {
        keys.forEach((key) => next.add(key));
      }
      return next;
    });
  };

  const toggleInstalledKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const deselectAllInstalled = () => setSelectedKeys(new Set());

  const allSelected = allKeys.length > 0 && allKeys.every((key) => selectedKeys.has(key));

  const runUpdate = async (u: InstalledUpdate) => {
    const key = `${u.scope}:${u.asset_type}:${u.name}`;
    setUpdating(key);
    await runUserActivity(`Update ${u.name}`, async () => {
      const asset = await getAssetDetail(u.registry_asset_id);
      await postInstall({
        assets: [asset],
        install_user: u.scope === "user",
        install_project: u.scope === "project",
        force: true,
      });
      pushLog(`Updated ${u.name} (${u.scope})`, "ok");
      await loadInstalledMeta();
      await refresh({ silent: true });
      return { summary: `Updated ${u.name} (${u.scope})`, status: "ok" };
    });
    setUpdating(null);
  };

  const updateAll = async () => {
    for (const u of updates) {
      await runUpdate(u);
    }
  };

  const removeSelected = async () => {
    if (selectedKeys.size === 0) return;
    const count = selectedKeys.size;
    if (!confirm(`Remove ${count} installed item${count === 1 ? "" : "s"}?`)) return;

    await runUserActivity(`Remove ${count} items`, async () => {
      for (const key of selectedKeys) {
        const { scope, assetType, name } = parseInstalledItemKey(key);
        await removeAsset(assetType, name, scope);
      }
      pushLog(`Removed ${count} item${count === 1 ? "" : "s"}`, "ok");
      setSelectedKeys(new Set());
      await refresh({ silent: true });
      await loadCatalog({ silent: true });
      return {
        summary: `Removed ${count} item${count === 1 ? "" : "s"}`,
        status: "ok",
      };
    });
  };

  const total = installedItems.length;
  const updateCount = updates.length;
  const selectedCount = selectedKeys.size;

  return (
    <div className="harbor-page installed-page">
      <header className="installed-page-header">
        <div>
          <h1>Installed</h1>
          <p className="muted">Skills, rules, and agents on your machine</p>
        </div>
        <div className="installed-page-stats">
          <span className="installed-stat-pill">
            <strong>{total}</strong> items
          </span>
          {selectedCount > 0 ? (
            <span className="installed-stat-pill installed-stat-pill--selected">
              <strong>{selectedCount}</strong> selected
            </span>
          ) : null}
          {updateCount > 0 ? (
            <span className="installed-stat-pill installed-stat-pill--update">
              <strong>{updateCount}</strong> updates
            </span>
          ) : null}
        </div>
      </header>

      <div className="installed-toolbar">
        <button type="button" className="harbor-btn harbor-btn--ghost" onClick={runExport} disabled={busy}>
          Export backup
        </button>
        <button type="button" className="harbor-btn harbor-btn--ghost" onClick={runImport} disabled={busy}>
          Import backup
        </button>
        <button
          type="button"
          className="harbor-btn harbor-btn--ghost"
          onClick={loadInstalledMeta}
          disabled={busy}
        >
          Check updates
        </button>
        {updateCount > 0 ? (
          <button
            type="button"
            className="harbor-btn harbor-btn--primary"
            onClick={updateAll}
            disabled={busy || Boolean(updating)}
          >
            Update all ({updateCount})
          </button>
        ) : null}
        {total > 0 ? (
          <>
            <span className="installed-toolbar__divider" aria-hidden />
            <SelectionPill
              pressed={allSelected}
              onClick={() => toggleSelectAllForKeys(allKeys)}
              disabled={allKeys.length === 0}
            >
              {allSelected ? "Deselect all" : "Select all"}
            </SelectionPill>
            <SelectionPill
              pressed={false}
              onClick={deselectAllInstalled}
              disabled={selectedCount === 0}
            >
              Clear selection
            </SelectionPill>
            {selectedCount > 0 ? (
              <button
                type="button"
                className="harbor-btn harbor-btn--ghost installed-toolbar__remove"
                onClick={removeSelected}
                disabled={busy}
              >
                Remove selected ({selectedCount})
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      {sections.length === 0 ? (
        <div className="harbor-card installed-empty">
          <p className="empty-title">Nothing installed yet</p>
          <p className="muted">Browse the registry, open a skill to preview it, then install to Cursor.</p>
        </div>
      ) : (
        <div className="installed-scopes">
          {sections.map((section) => {
            const scopeKeys = scopeInstalledItemKeys(section);
            const allScopeSelected =
              scopeKeys.length > 0 && scopeKeys.every((key) => selectedKeys.has(key));

            return (
              <section key={section.scope} className="installed-scope-card harbor-card">
                <header className="installed-scope-header">
                  <div className="installed-scope-header__main">
                    <h2>{section.title}</h2>
                    <code className="mono installed-scope-path">{section.path}</code>
                  </div>
                  <SelectionPill
                    pressed={allScopeSelected}
                    onClick={() => toggleSelectAllForKeys(scopeKeys)}
                    disabled={scopeKeys.length === 0}
                  >
                    {allScopeSelected ? "Deselect scope" : "Select scope"}
                  </SelectionPill>
                </header>
                <div className="installed-groups-grid">
                  {section.groups.map((group) => (
                    <div key={`${section.scope}-${group.assetType}`} className="installed-group-block">
                      <h3>
                        {group.label}
                        <span className="group-count">{group.items.length}</span>
                      </h3>
                      <div className="installed-card-grid">
                        {group.items.map((item) => {
                          const itemType = item.asset_type ?? group.assetType;
                          const itemKey = installedItemKey(section.scope, itemType, item.name);
                          const u = updateByKey.get(itemKey);
                          const match = matchByKey.get(itemKey);
                          const { displayAsset, openId } = resolveInstalledDisplayAsset(
                            assets,
                            item.name,
                            itemType,
                            match
                          );
                          return (
                            <InstalledCard
                              key={itemKey}
                              asset={displayAsset}
                              selected={Boolean(openId && selectedAssetId === openId)}
                              openable={Boolean(openId)}
                              checked={selectedKeys.has(itemKey)}
                              onToggleCheck={() => toggleInstalledKey(itemKey)}
                              updateAvailable={Boolean(u)}
                              onOpen={openId ? () => setSelectedAssetId(openId) : undefined}
                              onUpdate={u ? () => runUpdate(u) : undefined}
                              onRemove={() => onRemove(item.name, section.scope, itemType)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
