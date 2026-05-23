import { useCallback, useEffect, useMemo, useState } from "react";
import type { Studio } from "../hooks/useStudio";
import {
  getAssetDetail,
  getInstalledUpdates,
  postInstall,
  type InstalledUpdate,
} from "../api";
import { groupInstalledItems } from "../lib/installedGroups";
import { InstalledCard } from "../components/installed/InstalledCard";

type Props = { studio: Studio };

export function InstalledPage({ studio }: Props) {
  const { installedItems, connection, busy, runExport, runImport, onRemove, refresh, pushLog } =
    studio;
  const [updates, setUpdates] = useState<InstalledUpdate[]>([]);
  const [updating, setUpdating] = useState<string | null>(null);

  const sections = useMemo(
    () => groupInstalledItems(installedItems, connection),
    [installedItems, connection]
  );

  const updateByKey = useMemo(() => {
    const m = new Map<string, InstalledUpdate>();
    for (const u of updates) {
      m.set(`${u.scope}:${u.asset_type}:${u.name}`, u);
    }
    return m;
  }, [updates]);

  const loadUpdates = useCallback(async () => {
    try {
      const res = await getInstalledUpdates();
      setUpdates(res.updates);
    } catch {
      setUpdates([]);
    }
  }, []);

  useEffect(() => {
    loadUpdates();
  }, [loadUpdates, installedItems.length]);

  const runUpdate = async (u: InstalledUpdate) => {
    const key = `${u.scope}:${u.asset_type}:${u.name}`;
    setUpdating(key);
    try {
      const asset = await getAssetDetail(u.registry_asset_id);
      await postInstall({
        assets: [asset],
        install_user: u.scope === "user",
        install_project: u.scope === "project",
        force: true,
      });
      pushLog(`Updated ${u.name} (${u.scope})`, "ok");
      await loadUpdates();
      await refresh({ silent: true });
    } catch (e) {
      pushLog(String(e), "err");
    } finally {
      setUpdating(null);
    }
  };

  const updateAll = async () => {
    for (const u of updates) {
      await runUpdate(u);
    }
  };

  const total = installedItems.length;
  const updateCount = updates.length;

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
          onClick={loadUpdates}
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
      </div>

      {sections.length === 0 ? (
        <div className="harbor-card installed-empty">
          <p className="empty-title">Nothing installed yet</p>
          <p className="muted">Browse the registry, open a skill to preview it, then install to Cursor.</p>
        </div>
      ) : (
        <div className="installed-scopes">
          {sections.map((section) => (
            <section key={section.scope} className="installed-scope-card harbor-card">
              <header className="installed-scope-header">
                <h2>{section.title}</h2>
                <code className="mono installed-scope-path">{section.path}</code>
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
                        const u = updateByKey.get(
                          `${section.scope}:${item.asset_type ?? group.assetType}:${item.name}`
                        );
                        const key = `${section.scope}:${item.name}`;
                        return (
                          <InstalledCard
                            key={item.name}
                            name={item.name}
                            assetType={item.asset_type ?? group.assetType}
                            updateAvailable={Boolean(u)}
                            updateTitle={u?.registry_title}
                            onUpdate={u ? () => runUpdate(u) : undefined}
                            onRemove={() =>
                              onRemove(
                                item.name,
                                section.scope,
                                item.asset_type ?? group.assetType
                              )
                            }
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
