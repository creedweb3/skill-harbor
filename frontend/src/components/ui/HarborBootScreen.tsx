type Props = {
  phase: string;
  progress?: number;
  detail?: string;
};

export function HarborBootScreen({ phase, progress, detail }: Props) {
  const pct = progress != null ? Math.min(100, Math.max(0, progress)) : undefined;

  return (
    <div className="harbor-boot" role="status" aria-live="polite" aria-busy="true">
      <div className="harbor-boot__glow" aria-hidden />
      <div className="harbor-boot__mark" aria-hidden>
        <span className="harbor-boot__diamond">◆</span>
      </div>
      <h2 className="harbor-boot__title">Skill Harbor</h2>
      <p className="harbor-boot__phase">{phase}</p>
      {pct != null ? (
        <div className="harbor-boot__track" aria-hidden>
          <div className="harbor-boot__bar" style={{ width: `${pct}%` }} />
        </div>
      ) : (
        <div className="harbor-boot__pulse" aria-hidden />
      )}
      {detail ? <p className="harbor-boot__detail muted">{detail}</p> : null}
    </div>
  );
}
