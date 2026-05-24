import type { PlatformInfo } from "../../api";

type Props = {
  platforms: PlatformInfo[];
  value: string;
  onChange: (id: string) => void;
  compact?: boolean;
  disabled?: boolean;
};

export function PlatformSelector({
  platforms,
  value,
  onChange,
  compact = false,
  disabled = false,
}: Props) {
  const current = platforms.find((p) => p.id === value);

  return (
    <label className={`platform-select${compact ? " platform-select--compact" : ""}`}>
      {!compact ? <span className="platform-select-label">Agent / IDE</span> : null}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Target agent platform"
      >
        {platforms.map((p) => (
          <option key={p.id} value={p.id} disabled={!p.installable}>
            {p.label}
            {p.status === "beta" ? " (beta)" : ""}
            {p.status === "planned" ? " (soon)" : ""}
          </option>
        ))}
      </select>
      {current && !compact ? (
        <span className="platform-select-hint">
          {current.description}
          {current.status === "planned" ? " — install coming soon." : ""}
        </span>
      ) : null}
    </label>
  );
}
