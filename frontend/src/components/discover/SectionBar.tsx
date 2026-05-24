import type { ReactNode } from "react";

type Props = {
  start?: ReactNode;
  end?: ReactNode;
  meta?: string;
  sticky?: boolean;
  className?: string;
};

/**
 * Discovery section controls — flat Claude-style row (no boxed toolbar).
 */
export function SectionBar({ start, end, meta, sticky = false, className = "" }: Props) {
  return (
    <div
      className={`section-bar ${sticky ? "section-bar--sticky" : ""} ${className}`.trim()}
    >
      {start ? <div className="section-bar__start">{start}</div> : null}
      <div className="section-bar__end">
        {end}
        {meta ? <span className="section-bar__meta">{meta}</span> : null}
      </div>
    </div>
  );
}
