type Props = {
  name: string;
  assetType?: string;
  updateAvailable?: boolean;
  updateTitle?: string;
  onRemove: () => void;
  onUpdate?: () => void;
};

import { assetTypeBadgeClass } from "../../lib/assetType";

const TYPE_LABELS: Record<string, string> = {
  skill: "Skill",
  rule: "Rule",
  command: "Cmd",
  agent: "Agent",
};

export function InstalledCard({
  name,
  assetType = "skill",
  updateAvailable = false,
  updateTitle,
  onRemove,
  onUpdate,
}: Props) {
  return (
    <article className={`installed-card ${updateAvailable ? "installed-card--update" : ""}`}>
      <div className="installed-card__body">
        <span className={`${assetTypeBadgeClass(assetType)} installed-card__type`}>
          {TYPE_LABELS[assetType] ?? assetType}
        </span>
        {updateAvailable ? (
          <span className="installed-card__update-badge">Update available</span>
        ) : null}
        <p className="installed-card__name" title={updateTitle ?? name}>
          {name}
        </p>
        {updateTitle && updateTitle !== name ? (
          <p className="installed-card__update-from muted">Registry: {updateTitle}</p>
        ) : null}
      </div>
      <div className="installed-card__actions">
        {updateAvailable && onUpdate ? (
          <button type="button" className="installed-card__update" onClick={onUpdate}>
            Update
          </button>
        ) : null}
        <button type="button" className="installed-card__remove" onClick={onRemove}>
          Remove
        </button>
      </div>
    </article>
  );
}
