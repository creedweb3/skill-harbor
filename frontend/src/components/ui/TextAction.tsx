import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  accent?: boolean;
};

/** Claude-style text control — no pill chrome. */
export function TextAction({ children, accent = false, className = "", ...rest }: Props) {
  return (
    <button
      type="button"
      className={`harbor-text-action ${accent ? "harbor-text-action--accent" : ""} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}
