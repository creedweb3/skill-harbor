import type { Asset } from "../api";

export function githubRepoRootUrl(sourceRepo: string): string {
  return `https://github.com/${sourceRepo.replace(/^\/+|\/+$/g, "")}`;
}

export function githubTreeUrl(sourceRepo: string, branch: string, dirPath: string): string {
  const repo = sourceRepo.replace(/^\/+|\/+$/g, "");
  const clean = dirPath.replace(/^\/+|\/+$/g, "");
  if (!repo || !clean) return githubRepoRootUrl(sourceRepo);
  const encoded = clean
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `https://github.com/${repo}/tree/${branch || "main"}/${encoded}`;
}

function pathDirname(sourcePath: string): string {
  const parts = sourcePath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length <= 1) return "";
  parts.pop();
  return parts.join("/");
}

function commonPathPrefix(paths: string[]): string {
  if (!paths.length) return "";
  const segments = paths.map((p) =>
    p.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").split("/").filter(Boolean)
  );
  const first = segments[0];
  const prefix: string[] = [];
  for (let i = 0; i < first.length; i++) {
    const seg = first[i];
    if (segments.every((s) => s[i] === seg)) prefix.push(seg);
    else break;
  }
  return prefix.join("/");
}

/** GitHub tree URL for the folder that contains this repo's indexed skills. */
export function repoBrowseUrlFromAssets(assets: Asset[]): string | null {
  if (!assets.length) return null;

  const sourceRepo = assets[0].source_repo;
  if (!sourceRepo) return null;

  const branch = assets.find((a) => a.branch)?.branch ?? "main";
  const dirs = assets
    .map((a) => a.source_path)
    .filter(Boolean)
    .map(pathDirname)
    .filter(Boolean);

  if (!dirs.length) return githubRepoRootUrl(sourceRepo);

  const prefix = commonPathPrefix(dirs);
  if (!prefix) return githubRepoRootUrl(sourceRepo);

  return githubTreeUrl(sourceRepo, branch, prefix);
}

/** Tree URL for a single asset's containing folder. */
export function assetBrowseUrl(asset: Asset): string | null {
  if (!asset.source_repo) return asset.github_repo_url ?? null;
  const dir = asset.source_path ? pathDirname(asset.source_path) : "";
  if (!dir) return asset.github_repo_url ?? githubRepoRootUrl(asset.source_repo);
  return githubTreeUrl(asset.source_repo, asset.branch ?? "main", dir);
}
