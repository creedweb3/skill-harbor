import { useMemo } from "react";
import type { Studio } from "../../hooks/useStudio";
import { groupInstalledItems } from "../../lib/installedGroups";
import { Button } from "../ui/Button";

type Props = Pick<
  Studio,
  "installedItems" | "connection" | "busy" | "runExport" | "runImport" | "onRemove"
>;

export function InstalledPanel({
  installedItems,
  connection,
  busy,
  runExport,
  runImport,
  onRemove,
}: Props) {
  const sections = useMemo(
    () => groupInstalledItems(installedItems, connection),
    [installedItems, connection]
  );

  const total = installedItems.length;

  return (
    <div className="sidebar-panel">
      <section className="sidebar-section grow" aria-labelledby="installed-heading">
        <div className="sidebar-section-head">
          <h2 id="installed-heading">On disk</h2>
          <span className="count-badge">{total}</span>
        </div>
        <div className="btn-row">
          <Button variant="ghost" size="sm" full onClick={runExport} disabled={busy}>
            Export backup
          </Button>
          <Button variant="ghost" size="sm" full onClick={runImport} disabled={busy}>
            Import backup
          </Button>
        </div>
        {sections.length === 0 ? (
          <p className="muted empty-sidebar">
            Nothing installed yet. Fetch the catalog and install items from Discover.
          </p>
        ) : (
          <div className="installed-sections">
            {sections.map((section) => (
              <div key={section.scope} className="installed-scope">
                <header className="installed-scope-head">
                  <h3>{section.title}</h3>
                  <code className="mono installed-path">{section.path}</code>
                </header>
                {section.groups.map((group) => (
                  <div key={`${section.scope}-${group.assetType}`} className="installed-group">
                    <h4>
                      {group.label}
                      <span className="group-count">{group.items.length}</span>
                    </h4>
                    <ul className="installed-list">
                      {group.items.map((item) => (
                        <li key={item.name}>
                          <span className="installed-name">{item.name}</span>
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() =>
                              onRemove(item.name, section.scope, item.asset_type ?? "skill")
                            }
                            aria-label={`Remove ${item.name}`}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
