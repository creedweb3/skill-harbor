import { useCallback, useEffect, useState } from "react";
import { getAssetDetail, postVote, type Asset } from "../api";
import type { Studio } from "../hooks/useStudio";
import { formatStars } from "../lib/format";
import { assetBrowseUrl, repoBrowseUrlFromAssets } from "../lib/githubUrls";
import { assetTypeBadgeClass } from "../lib/assetType";
import { getVoterId } from "../lib/voter";

type Props = { studio: Studio };

export function AssetDetailPage({ studio }: Props) {
  const {
    selectedAssetId,
    setSelectedAssetId,
    selectedRepo,
    openRepo,
    selectedIds,
    toggleRow,
    runInstall,
    busy,
    assets,
  } = studio;
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const voterId = getVoterId();

  const load = useCallback(() => {
    if (!selectedAssetId) return;
    const cached = assets.find((a) => a.id === selectedAssetId);
    setLoading(true);
    getAssetDetail(selectedAssetId, voterId)
      .then(setAsset)
      .catch(() => setAsset(cached ?? null))
      .finally(() => setLoading(false));
  }, [selectedAssetId, assets, voterId]);

  useEffect(() => {
    load();
  }, [load]);

  const vote = async (direction: "up" | "down") => {
    if (!selectedAssetId) return;
    try {
      const result = await postVote(selectedAssetId, direction, voterId);
      setAsset((prev) =>
        prev
          ? {
              ...prev,
              upvotes: result.upvotes,
              downvotes: result.downvotes,
              vote_score: result.score,
              user_vote: result.user_vote,
            }
          : prev
      );
    } catch {
      /* ignore */
    }
  };

  if (!selectedAssetId) return null;

  const title = asset?.curated_title || asset?.install_name || "Asset";
  const content = asset?.content || asset?.content_preview || "";
  const selected = asset ? selectedIds.has(asset.id) : false;
  const typeLabel = asset?.asset_type_label ?? "Skill";
  const repoGitHubUrl = asset
    ? repoBrowseUrlFromAssets(
        assets.filter((a) => a.source_repo === asset.source_repo).length
          ? assets.filter((a) => a.source_repo === asset.source_repo)
          : [asset]
      ) ?? assetBrowseUrl(asset)
    : null;

  return (
    <div className="asset-detail-page">
      <header className="asset-detail-header">
        <button
          type="button"
          className="harbor-btn harbor-btn--ghost asset-detail-back"
          onClick={() => {
            setSelectedAssetId(null);
          }}
        >
          ← {selectedRepo ? "Back to repo" : "Back"}
        </button>
        <div className="asset-detail-title-block">
          <span className={assetTypeBadgeClass(asset?.asset_type ?? "skill")}>{typeLabel}</span>
          <h1>{title}</h1>
          <p className="asset-detail-meta">
            <code className="mono">{asset?.source_repo}</code>
            {asset ? (
              <>
                <span className="meta-sep">·</span>
                <span>★ {formatStars(asset.stars)}</span>
              </>
            ) : null}
            {asset?.install_status?.status && asset.install_status.status !== "none" ? (
              <>
                <span className="meta-sep">·</span>
                <span className="installed-tag">Installed ({asset.install_status.status})</span>
              </>
            ) : null}
          </p>
          <div className="vote-bar">
            <button
              type="button"
              className={`vote-btn ${asset?.user_vote === 1 ? "active" : ""}`}
              onClick={() => vote("up")}
              aria-label="Upvote"
            >
              ▲ {asset?.upvotes ?? 0}
            </button>
            <button
              type="button"
              className={`vote-btn ${asset?.user_vote === -1 ? "active" : ""}`}
              onClick={() => vote("down")}
              aria-label="Downvote"
            >
              ▼ {asset?.downvotes ?? 0}
            </button>
            <span className="muted vote-hint">Anonymous · one vote per browser</span>
          </div>
        </div>
        <div className="asset-detail-actions">
          <button
            type="button"
            className="harbor-btn"
            disabled={!asset}
            onClick={() => asset && toggleRow(asset.id)}
          >
            {selected ? "Selected" : "Select"}
          </button>
          <button
            type="button"
            className="harbor-btn harbor-btn--primary"
            disabled={busy || !selected}
            onClick={runInstall}
          >
            Install
          </button>
          {asset?.github_blob_url || asset?.raw_url ? (
            <a
              href={asset.github_blob_url || asset.raw_url}
              target="_blank"
              rel="noreferrer"
              className="harbor-btn harbor-btn--ghost"
            >
              Open on GitHub
            </a>
          ) : null}
          {repoGitHubUrl ? (
            <a
              href={repoGitHubUrl}
              target="_blank"
              rel="noreferrer"
              className="harbor-btn harbor-btn--ghost"
            >
              View repository
            </a>
          ) : null}
          {asset?.source_repo && asset.source_repo !== selectedRepo ? (
            <button
              type="button"
              className="harbor-btn harbor-btn--ghost"
              onClick={() => {
                setSelectedAssetId(null);
                openRepo(asset.source_repo);
              }}
            >
              Browse repo skills
            </button>
          ) : null}
        </div>
      </header>

      <div className="asset-detail-body card-surface">
        {loading ? (
          <p className="harbor-empty">Loading file content…</p>
        ) : content ? (
          <pre className="asset-detail-content">{content}</pre>
        ) : (
          <p className="harbor-empty">
            No content in registry yet. Use <strong>Sync content</strong> in the top bar.
          </p>
        )}
      </div>
    </div>
  );
}
