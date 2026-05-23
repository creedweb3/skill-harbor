import type { Studio } from "../../hooks/useStudio";
import { Button } from "../ui/Button";
import { Field, TextInput } from "../ui/Field";

type Props = { studio: Studio };

export function SetupPanel({ studio }: Props) {
  const {
    connection,
    projectDir,
    setProjectDir,
    busy,
    saveSettings,
    dbStats,
  } = studio;

  return (
    <div className="sidebar-panel">
      <section className="sidebar-section" aria-labelledby="conn-heading">
        <h2 id="conn-heading">Connection</h2>
        <ul className="conn-list">
          <li>
            <span className={`status-dot ${connection?.user_exists ? "on" : ""}`} aria-hidden />
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
          {dbStats?.asset_count ?? 0} assets in local SQLite registry (
          <code className="mono">harbor.db</code>)
        </p>
        <p className="hint">
          GitHub stars:{" "}
          {dbStats?.stars_live
            ? `updated ${dbStats.stars_last_refreshed_at?.replace("T", " ").slice(0, 16) ?? "recently"}`
            : "cached/seed values — refresh via admin dashboard with a GitHub token"}
        </p>
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
