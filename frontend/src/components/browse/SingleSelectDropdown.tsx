import { useEffect, useRef, useState } from "react";
import type { MultiSelectOption } from "./MultiSelectDropdown";

type Props = {
  label: string;
  options: MultiSelectOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  "aria-label"?: string;
};

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M2.5 4.5 6 8l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
      <path
        d="M2 5.2 4.1 7.3 8 3.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SingleSelectDropdown({
  label,
  options,
  value,
  onChange,
  className = "",
  "aria-label": ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <div
      className={`multi-select multi-select--single${open ? " multi-select--open" : ""} ${className}`.trim()}
      ref={rootRef}
    >
      <button
        type="button"
        className="multi-select__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel ?? label}
      >
        <span className="multi-select__trigger-main">
          <span className="multi-select__label">{label}</span>
          <span className="multi-select__value">{selectedLabel}</span>
        </span>
        <span className="multi-select__trigger-end">
          <span className="multi-select__chevron">
            <ChevronIcon />
          </span>
        </span>
      </button>
      {open ? (
        <div className="multi-select__menu" role="presentation">
          <div
            className="multi-select__options harbor-scroll harbor-scroll--inset"
            role="listbox"
            aria-label={ariaLabel ?? label}
          >
            {options.map((opt) => {
              const checked = value === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  className={`multi-select__option${checked ? " is-checked" : ""}`}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <span className="multi-select__check" aria-hidden>
                    {checked ? <CheckIcon /> : null}
                  </span>
                  <span className="multi-select__option-label">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
