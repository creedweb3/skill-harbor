type Props = {
  value: "auto" | "manual";
  onChange: (mode: "auto" | "manual") => void;
  disabled?: boolean;
  autoLabel?: string;
  customLabel?: string;
  ariaLabel: string;
};

export function SettingsModeSwitch({
  value,
  onChange,
  disabled = false,
  autoLabel = "Auto-detect",
  customLabel = "Custom",
  ariaLabel,
}: Props) {
  return (
    <div className="harbor-periods settings-mode-switch" role="tablist" aria-label={ariaLabel}>
      <button
        type="button"
        role="tab"
        className={`harbor-periods__pill ${value === "auto" ? "is-active" : ""}`}
        aria-selected={value === "auto"}
        disabled={disabled}
        onClick={() => onChange("auto")}
      >
        {autoLabel}
      </button>
      <button
        type="button"
        role="tab"
        className={`harbor-periods__pill ${value === "manual" ? "is-active" : ""}`}
        aria-selected={value === "manual"}
        disabled={disabled}
        onClick={() => onChange("manual")}
      >
        {customLabel}
      </button>
    </div>
  );
}
