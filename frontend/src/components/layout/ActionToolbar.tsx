import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  count?: string;
  className?: string;
  metaChrome?: boolean;
};

/** Unified control bar — inline toolbar styling matches discovery section bars. */
export function ActionToolbar({ children, count, className = "", metaChrome = false }: Props) {
  return (
    <div className={`harbor-action-bar harbor-inline-toolbar ${className}`.trim()}>
      <div className="harbor-action-bar__controls">{children}</div>
      {count ? (
        <span
          className={
            metaChrome
              ? "harbor-action-bar__meta harbor-chrome-meta harbor-chrome-meta--ruled"
              : "harbor-action-bar__meta harbor-inline-toolbar__meta"
          }
        >
          {count}
        </span>
      ) : null}
    </div>
  );
}

export function ActionToolbarDivider() {
  return <span className="harbor-action-bar__divider" aria-hidden />;
}
