import { useEffect, type RefObject } from "react";

type Options = {
  searchRef?: RefObject<HTMLInputElement | null>;
  enabled?: boolean;
};

/** Global shortcuts: / focuses search, Escape blurs. */
export function useHarborShortcuts({ searchRef, enabled = true }: Options) {
  useEffect(() => {
    if (!enabled) return;

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inField =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      if (e.key === "/" && !inField && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        searchRef?.current?.focus();
        searchRef?.current?.select();
      }

      if (e.key === "Escape" && document.activeElement === searchRef?.current) {
        searchRef?.current?.blur();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchRef, enabled]);
}
