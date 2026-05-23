import type { Studio } from "../../hooks/useStudio";

type Props = Pick<
  Studio,
  | "installUser"
  | "setInstallUser"
  | "installProject"
  | "setInstallProject"
  | "force"
  | "setForce"
>;

export function InstallTargetsBar({
  installUser,
  setInstallUser,
  installProject,
  setInstallProject,
  force,
  setForce,
}: Props) {
  return (
    <div className="install-bar" aria-label="Install targets">
      <span className="install-bar-label">Install to</span>
      <label className="toggle">
        <input
          type="checkbox"
          checked={installUser}
          onChange={(e) => setInstallUser(e.target.checked)}
        />
        Global
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={installProject}
          onChange={(e) => setInstallProject(e.target.checked)}
        />
        Project
      </label>
      <label className="toggle">
        <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
        Overwrite existing
      </label>
    </div>
  );
}
