/** CSS modifier for harbor-badge — one distinct look per asset kind. */
export function assetTypeBadgeClass(assetType: string): string {
  const slug = assetType.toLowerCase().replace(/_/g, "-");
  return `harbor-badge harbor-badge--type harbor-badge--${slug}`;
}

export function formatSourceRepo(sourceRepo: string): { owner: string; name: string } {
  const [owner = "", name = ""] = sourceRepo.split("/");
  return { owner, name };
}
