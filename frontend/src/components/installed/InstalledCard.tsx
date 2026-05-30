import type { KeyboardEvent, MouseEvent } from "react";
import type { Asset } from "../../api";
import { AssetRankCard } from "../dashboard/AssetRankCard";

type Props = {
  asset: Asset;
  selected?: boolean;
  openable?: boolean;
  checked?: boolean;
  onToggleCheck?: () => void;
  updateAvailable?: boolean;
  onOpen?: () => void;
  onRemove: () => void;
  onUpdate?: () => void;
};

export function InstalledCard({
  asset,
  selected = false,
  openable = false,
  checked = false,
  onToggleCheck,
  updateAvailable = false,
  onOpen,
  onRemove,
  onUpdate,
}: Props) {
  const canOpen = openable && Boolean(onOpen);

  const stopCardNav = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      className={[
        "installed-card-wrap",
        updateAvailable ? "installed-card-wrap--update" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {updateAvailable ? (
        <span className="installed-card__update-badge installed-card__update-badge--float">
          Update available
        </span>
      ) : null}
      <AssetRankCard
        asset={asset}
        selected={selected}
        clickable={canOpen}
        checked={checked}
        onToggleCheck={onToggleCheck}
        onSelect={onOpen ?? (() => {})}
        footer={
          <>
            {!asset.source_repo ? (
              <p className="asset-card-foot installed-card__local-foot">Installed locally</p>
            ) : null}
            <div
              className="installed-card__actions"
              onClick={stopCardNav}
              onKeyDown={stopCardNav}
              role="presentation"
            >
              {updateAvailable && onUpdate ? (
                <button
                  type="button"
                  className="harbor-text-action harbor-text-action--accent installed-card__action"
                  onClick={onUpdate}
                >
                  Update
                </button>
              ) : null}
              <button
                type="button"
                className="harbor-text-action installed-card__action"
                onClick={onRemove}
              >
                Remove
              </button>
            </div>
          </>
        }
      />
    </div>
  );
}
