import type { Studio } from "../../hooks/useStudio";
import { Button } from "../ui/Button";
import { Field, TextInput } from "../ui/Field";

type Props = Pick<
  Studio,
  | "connection"
  | "projectDir"
  | "setProjectDir"
  | "tokenInput"
  | "setTokenInput"
  | "tokenSet"
  | "busy"
  | "saveSettings"
  | "clearGithubToken"
>;

export function SetupPanel({
  connection,
  projectDir,
  setProjectDir,
  tokenInput,
  setTokenInput,
  tokenSet,
  busy,
  saveSettings,
  clearGithubToken,
}: Props) {
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

      <section className="sidebar-section" aria-labelledby="settings-heading">
        <h2 id="settings-heading">Settings</h2>
        <Field label="Project directory">
          <TextInput
            type="text"
            value={projectDir}
            onChange={(e) => setProjectDir(e.target.value)}
            placeholder="C:\path\to\repo"
          />
        </Field>
        <Field
          label={
            <>
              GitHub token {tokenSet ? <span className="saved-badge">saved</span> : null}
            </>
          }
          hint="For accurate star counts and optional repo search"
        >
          <TextInput
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder={tokenSet ? "••••••••" : "ghp_…"}
            autoComplete="off"
          />
        </Field>
        <div className="btn-row">
          <Button variant="ghost" full onClick={saveSettings} disabled={busy}>
            Save settings
          </Button>
          {tokenSet ? (
            <Button variant="ghost" size="sm" full onClick={clearGithubToken} disabled={busy}>
              Remove token
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
