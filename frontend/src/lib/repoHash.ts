const PREFIX = "repo/";

export function repoHash(sourceRepo: string): string {
  return `#${PREFIX}${encodeURIComponent(sourceRepo)}`;
}

export function parseRepoHash(hash: string): string | null {
  const raw = hash.replace(/^#/, "");
  if (!raw.startsWith(PREFIX)) return null;
  try {
    return decodeURIComponent(raw.slice(PREFIX.length));
  } catch {
    return null;
  }
}

export function setRepoHash(sourceRepo: string) {
  const next = repoHash(sourceRepo);
  if (window.location.hash !== next) {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}${next}`
    );
  }
}

export function clearRepoHash() {
  if (window.location.hash.startsWith(`#${PREFIX}`)) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}
