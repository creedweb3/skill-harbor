import type { Studio } from "../../hooks/useStudio";
import { Button } from "../ui/Button";
import { Field, TextInput } from "../ui/Field";
import { postRegistryExpand } from "../../api";

type Props = { studio: Studio };

export function SetupPanel({ studio }: Props) {
  const {
    connection,
    projectDir,
    setProjectDir,
    busy,
    saveSettings,
    dbStats,
    syncRegistry,
    loadCatalog,
    pushLog,
    setBusy,
  } = studio;

  const expandRegistry = async () => {
    setBusy(true);
    pushLog("Expanding registry from community repos (no token needed)…");
    try {
      const result = await postRegistryExpand();
      pushLog(
        `Registry: +${result.added} new, ${result.updated} updated — ${result.stats?.total_assets ?? "?"} total`,
        "ok"
      );
      await loadCatalog();
    } catch (e) {
      pushLog(String(e), "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sidebar-panel">
      <section className="sidebar-section" aria-labelledby="conn-heading">
        <h2 id="conn-heading">Connection</h2>
        <ul className="conn-list">
          <li>
            <span
              className={`status-dot ${connection?.user_exists ? "on" : ""}`}
              aria-hidden
            />
            <div>
              <span className="conn-label">Global</span>
              <code className="mono">{connection?.user_cursor_dir ?? "—"}</code>
            </div>
          </li>
          <li>
            <span
              className={`status-dot ${connection?.project_cursor_exists ? "on" : ""}`}
              aria-hidden
            />
            <div>
              <span className="conn-label">Project</span>
              <code className="mono">{connection?.project_cursor_dir ?? "—"}</code>
            </div>
          </li>
        </ul>
      </section>

      <section className="sidebar-section" aria-labelledby="registry-heading">
        <h2 id="registry-heading">Harbor registry</h2>
        <p className="hint">
          {dbStats?.asset_count ?? 0} assets in local database · ranked by GitHub stars
        </p>
        <div className="btn-row">
          <Button variant="primary" full onClick={() => expandRegistry()} disabled={busy}>
            {busy ? "Working…" : "Expand registry"}
          </Button>
          <Button variant="ghost" full onClick={() => syncRegistry()} disabled={busy}>
            Sync file content
          </Button>
        </div>
        <p className="hint">No GitHub token required — uses public raw files.</p>
      </section>

      <section className="sidebar-section" aria-labelledby="settings-heading">
        <h2 id="settings-heading">Project</h2>
        <Field label="Project directory">
          <TextInput
            type="text"
            value={projectDir}
            onChange={(e) => setProjectDir(e.target.value)}
            placeholder="C:\path\to\repo"
          />
        </Field>
        <Button variant="ghost" full onClick={saveSettings} disabled={busy}>
          Save project path
        </Button>
      </section>
    </div>
  );
}
