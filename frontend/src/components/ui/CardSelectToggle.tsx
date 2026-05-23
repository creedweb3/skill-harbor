type Props = {
  checked: boolean;
  label: string;
  onToggle: () => void;
};

export function CardSelectToggle({ checked, label, onToggle }: Props) {
  return (
    <button
      type="button"
      className={`harbor-select-toggle ${checked ? "harbor-select-toggle--on" : ""}`}
      aria-pressed={checked}
      aria-label={checked ? `Remove ${label} from install queue` : `Add ${label} to install queue`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <span className="harbor-select-toggle__ring" aria-hidden />
      <svg
        className="harbor-select-toggle__icon"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden
      >
        <path
          d="M2.5 6.2 5 8.7 9.5 3.8"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
