import { useMemo, useState } from "react";
import type { Studio } from "../../hooks/useStudio";
import { PlatformSelector } from "../platform/PlatformSelector";
import { Button } from "../ui/Button";

type Props = Pick<
  Studio,
  | "platforms"
  | "platform"
  | "platformMode"
  | "setPlatform"
  | "autoDetectPlatform"
  | "installUser"
  | "setInstallUser"
  | "installProject"
  | "setInstallProject"
  | "force"
  | "setForce"
  | "extraInstallPlatforms"
  | "setExtraInstallPlatforms"
  | "compatiblePlatformsForSelection"
  | "busy"
>;

export function InstallTargetsBar({
  platforms,
  platform,
  platformMode,
  setPlatform,
  autoDetectPlatform,
  installUser,
  setInstallUser,
  installProject,
  setInstallProject,
  force,
  setForce,
  extraInstallPlatforms,
  setExtraInstallPlatforms,
  compatiblePlatformsForSelection,
  busy,
}: Props) {
  const [showMulti, setShowMulti] = useState(false);
  const current = platforms.find((p) => p.id === platform);
  const installable = current?.installable !== false;

  const multiOptions = useMemo(
    () =>
      platforms.filter(
        (p) =>
          p.installable &&
          p.id !== platform &&
          compatiblePlatformsForSelection.includes(p.id)
      ),
    [platforms, platform, compatiblePlatformsForSelection]
  );

  const toggleExtra = (id: string) => {
    setExtraInstallPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="install-bar install-bar--stacked" aria-label="Install targets">
      <div className="install-bar-row">
        {platformMode === "auto" ? (
          <span className="platform-auto-badge" title="Detected from folders on your machine">
            Auto: {current?.label ?? platform}
          </span>
        ) : (
          <PlatformSelector
            platforms={platforms}
            value={platform}
            onChange={(id) => setPlatform(id, { manual: true })}
            compact
            disabled={busy}
          />
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void autoDetectPlatform()}
          disabled={busy}
          title="Scan ~/.cursor, ~/.claude, etc. and switch to auto-detected platform"
        >
          Auto-detect
        </Button>
        <span className="install-bar-label">Install to</span>
        <label className="toggle">
          <input
            type="checkbox"
            checked={installUser}
            disabled={!installable}
            onChange={(e) => setInstallUser(e.target.checked)}
          />
          Global
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={installProject}
            disabled={!installable}
            onChange={(e) => setInstallProject(e.target.checked)}
          />
          Project
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={force}
            disabled={!installable}
            onChange={(e) => setForce(e.target.checked)}
          />
          Overwrite
        </label>
      </div>

      {multiOptions.length > 0 ? (
        <div className="install-bar-multi">
          <button
            type="button"
            className="install-multi-toggle"
            onClick={() => setShowMulti((v) => !v)}
            aria-expanded={showMulti}
          >
            {showMulti ? "▾" : "▸"} Also install to other agents (optional)
          </button>
          {showMulti ? (
            <div className="install-multi-checks" role="group" aria-label="Additional platforms">
              {multiOptions.map((p) => (
                <label key={p.id} className="toggle">
                  <input
                    type="checkbox"
                    checked={extraInstallPlatforms.has(p.id)}
                    onChange={() => toggleExtra(p.id)}
                    disabled={!installable || busy}
                  />
                  {p.label}
                </label>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
