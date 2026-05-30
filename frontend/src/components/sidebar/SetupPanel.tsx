import type { Studio } from "../../hooks/useStudio";
import { PlatformSelector } from "../platform/PlatformSelector";
import { SettingsModeSwitch } from "../settings/SettingsModeSwitch";
import { Button } from "../ui/Button";
import { Field, TextInput } from "../ui/Field";

type Props = { studio: Studio };

export function SetupPanel({ studio }: Props) {
  const {
    connection,
    platforms,
    platform,
    platformMode,
    setPlatformMode,
    setPlatform,
    autoDetectPlatform,
    projectDir,
    setProjectDir,
    projectDirMode,
    setProjectDirMode,
    autoDetectProject,
    busy,
    saveSettings,
    dbStats,
  } = studio;

  const platformLabel = platforms.find((p) => p.id === platform)?.label ?? platform;

  const handlePlatformMode = (mode: "auto" | "manual") => {
    if (mode === platformMode) return;
    if (mode === "auto") {
      void autoDetectPlatform();
      return;
    }
    setPlatformMode("manual");
    void setPlatform(platform, { manual: true });
  };

  const handleProjectMode = (mode: "auto" | "manual") => {
    if (mode === projectDirMode) return;
    if (mode === "auto") {
      void autoDetectProject();
      return;
    }
    setProjectDirMode("manual");
  };

  return (
    <div className="sidebar-panel">
      <section className="sidebar-section" aria-labelledby="platform-heading">
        <h2 id="platform-heading">Agent platform</h2>
        <SettingsModeSwitch
          ariaLabel="Platform selection mode"
          value={platformMode}
          onChange={handlePlatformMode}
          disabled={busy}
        />
        {platformMode === "auto" ? (
          <>
            <p className="hint">
              Using <strong>{platformLabel}</strong> — detected from agent folders on this machine.
            </p>
            <Button variant="ghost" full onClick={() => void autoDetectPlatform()} disabled={busy}>
              Re-detect platform
            </Button>
          </>
        ) : (
          <>
            <PlatformSelector
              platforms={platforms}
              value={platform}
              onChange={(id) => setPlatform(id, { manual: true })}
              disabled={busy}
            />
            <p className="hint">Pick a platform manually. Installs target this agent until you switch back.</p>
          </>
        )}
      </section>

      <section className="sidebar-section" aria-labelledby="conn-heading">
        <h2 id="conn-heading">Connection</h2>
        {connection?.platform_label ? (
          <p className="hint">
            {connection.platform_label}
            {connection.platform_status === "beta" ? " (beta)" : ""}
          </p>
        ) : null}
        <ul className="conn-list">
          <li>
            <span
              className={`status-dot ${(connection?.global_exists ?? connection?.user_exists) ? "on" : ""}`}
              aria-hidden
            />
            <div>
              <span className="conn-label">Global</span>
              <code className="mono">
                {connection?.global_root ?? connection?.user_cursor_dir ?? "—"}
              </code>
            </div>
          </li>
          <li>
            <span
              className={`status-dot ${(connection?.project_exists ?? connection?.project_cursor_exists) ? "on" : ""}`}
              aria-hidden
            />
            <div>
              <span className="conn-label">Project</span>
              <code className="mono">
                {connection?.project_root ?? connection?.project_cursor_dir ?? "—"}
              </code>
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
        <SettingsModeSwitch
          ariaLabel="Project directory mode"
          value={projectDirMode}
          onChange={handleProjectMode}
          disabled={busy}
        />
        {projectDirMode === "auto" ? (
          <>
            <p className="hint">
              Using <code className="mono">{projectDir || "—"}</code> — detected from git root or agent
              folders.
            </p>
            <Button variant="ghost" full onClick={() => void autoDetectProject()} disabled={busy}>
              Re-detect project
            </Button>
          </>
        ) : (
          <>
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
            <p className="hint">Custom path for project-scoped installs (.cursor, .claude, etc.).</p>
          </>
        )}
      </section>
    </div>
  );
}
