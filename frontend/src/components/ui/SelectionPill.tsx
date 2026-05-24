type Props = {
  pressed?: boolean;
  children: string;
  onClick: () => void;
  disabled?: boolean;
};

/** Pill control for bulk select actions — icon + label, no overlap. */
export function SelectionPill({ pressed = false, children, onClick, disabled }: Props) {
  return (
    <button
      type="button"
      className={`harbor-selection-pill ${pressed ? "harbor-selection-pill--on" : ""}`}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="harbor-selection-pill__check" aria-hidden>
        <svg viewBox="0 0 12 12" fill="none">
          <path
            d="M2.5 6.2 5 8.7 9.5 3.8"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="harbor-selection-pill__label">{children}</span>
    </button>
  );
}
