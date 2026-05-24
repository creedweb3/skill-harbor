import type { ReactNode } from "react";

type Props = {
  start?: ReactNode;
  end?: ReactNode;
};

/** Minimal footer row inside domain cards. */
export function PanelFooter({ start, end }: Props) {
  return (
    <footer className="panel-footer">
      <div className="panel-footer__start">{start}</div>
      <div className="panel-footer__end">{end}</div>
    </footer>
  );
}
