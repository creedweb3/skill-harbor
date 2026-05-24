import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  count?: string;
  className?: string;
};

/** Unified control bar for discovery sections, browse, and category detail. */
export function ActionToolbar({ children, count, className = "" }: Props) {
  return (
    <div className={`harbor-action-bar ${className}`.trim()}>
      <div className="harbor-action-bar__controls">{children}</div>
      {count ? <span className="harbor-action-bar__meta">{count}</span> : null}
    </div>
  );
}

export function ActionToolbarDivider() {
  return <span className="harbor-action-bar__divider" aria-hidden />;
}
