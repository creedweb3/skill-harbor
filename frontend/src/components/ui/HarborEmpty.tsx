import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  children?: ReactNode;
};

export function HarborEmpty({ title, description, children }: Props) {
  return (
    <div className="harbor-empty-state">
      <div className="harbor-empty-state__glyph" aria-hidden>
        ◇
      </div>
      <h3 className="harbor-empty-state__title">{title}</h3>
      {description ? <p className="harbor-empty-state__desc muted">{description}</p> : null}
      {children ? <div className="harbor-empty-state__actions">{children}</div> : null}
    </div>
  );
}
