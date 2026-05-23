import { useMemo } from "react";
import type { Studio } from "../hooks/useStudio";
import { groupInstalledItems } from "../lib/installedGroups";

type Props = { studio: Studio };

const TYPE_ICONS: Record<string, string> = {
  skill: "◇",
  rule: "▣",
  command: "⌘",
  agent: "◎",
};

export function InstalledPage({ studio }: Props) {
  const { installedItems, connection, busy, runExport, runImport, onRemove } = studio;
  const sections = useMemo(
    () => groupInstalledItems(installedItems, connection),
    [installedItems, connection]
  );
  const total = installedItems.length;

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
        </div>
      </header>

      <div className="installed-toolbar">
        <button type="button" className="harbor-btn harbor-btn--ghost" onClick={runExport} disabled={busy}>
          Export backup
        </button>
        <button type="button" className="harbor-btn harbor-btn--ghost" onClick={runImport} disabled={busy}>
          Import backup
        </button>
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
                  <div key={`${section.scope}-${group.assetType}`} className="installed-group-card">
                    <h3>
                      <span aria-hidden>{TYPE_ICONS[group.assetType] ?? "•"}</span>
                      {group.label}
                      <span className="group-count">{group.items.length}</span>
                    </h3>
                    <ul className="installed-item-list">
                      {group.items.map((item) => (
                        <li key={item.name} className="installed-item-row">
                          <span className="installed-item-name">{item.name}</span>
                          <button
                            type="button"
                            className="installed-remove"
                            onClick={() =>
                              onRemove(item.name, section.scope, item.asset_type ?? "skill")
                            }
                            aria-label={`Remove ${item.name}`}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
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
