import type { Studio } from "../hooks/useStudio";
import { InstalledPanel } from "../components/sidebar/InstalledPanel";
import { SetupPanel } from "../components/sidebar/SetupPanel";

type Props = { studio: Studio; mode: "settings" | "installed" };

export function SettingsPage({ studio, mode }: Props) {
  if (mode === "installed") {
    return (
      <div className="harbor-page">
        <h2 style={{ margin: "1rem 0" }}>Installed</h2>
        <InstalledPanel studio={studio} />
      </div>
    );
  }
  return (
    <div className="harbor-page">
      <h2 style={{ margin: "1rem 0" }}>Settings</h2>
      <SetupPanel studio={studio} />
    </div>
  );
}
