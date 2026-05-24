import type { DiscoveryProfession } from "../api";
import { domainViewForProfession, type DiscoverySectionView } from "./categoryDetail";

const PREFIX = "domain/";

export function domainHash(domain: string): string {
  return `#${PREFIX}${encodeURIComponent(domain)}`;
}

export function parseDomainHash(hash: string): string | null {
  const raw = hash.replace(/^#/, "");
  if (!raw.startsWith(PREFIX)) return null;
  try {
    return decodeURIComponent(raw.slice(PREFIX.length));
  } catch {
    return null;
  }
}

export function viewFromDomainSlug(
  slug: string,
  professions: DiscoveryProfession[]
): DiscoverySectionView | null {
  const p = professions.find((x) => x.domain === slug);
  return p ? domainViewForProfession(p) : null;
}

export function setDomainHash(domain: string) {
  const next = domainHash(domain);
  if (window.location.hash !== next) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${next}`);
  }
}

export function clearDomainHash() {
  if (window.location.hash.startsWith(`#${PREFIX}`)) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}
