import { useEffect, useRef, useState } from "react";

export type MultiSelectOption = { value: string; label: string };

type Props = {
  label: string;
  options: MultiSelectOption[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
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

export function MultiSelectDropdown({ label, options, selected, onChange }: Props) {
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

  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };

  const selectAll = () => onChange(new Set(options.map((o) => o.value)));
  const clearAll = () => onChange(new Set());

  const summary =
    selected.size === 0
      ? `All ${label.toLowerCase()}`
      : selected.size === 1
        ? options.find((o) => selected.has(o.value))?.label ?? [...selected][0]
        : `${selected.size} selected`;

  return (
    <div className={`multi-select${open ? " multi-select--open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className={`multi-select__trigger${selected.size ? " multi-select__trigger--active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="multi-select__trigger-main">
          <span className="multi-select__label">{label}</span>
          <span
            className={`multi-select__value${selected.size === 0 ? " multi-select__value--placeholder" : ""}`}
          >
            {summary}
          </span>
        </span>
        <span className="multi-select__trigger-end">
          {selected.size > 1 ? (
            <span className="multi-select__badge">{selected.size}</span>
          ) : null}
          <span className="multi-select__chevron">
            <ChevronIcon />
          </span>
        </span>
      </button>
      {open ? (
        <div className="multi-select__menu" role="presentation">
          <div className="multi-select__actions">
            <button type="button" className="multi-select__action" onClick={selectAll}>
              Select all
            </button>
            <button type="button" className="multi-select__action" onClick={clearAll}>
              Clear
            </button>
          </div>
          <div className="multi-select__options harbor-scroll harbor-scroll--inset" role="listbox" aria-label={label}>
            {options.length === 0 ? (
              <p className="multi-select__empty">No options</p>
            ) : (
              options.map((opt) => {
                const checked = selected.has(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={`multi-select__option${checked ? " is-checked" : ""}`}
                  >
                    <input
                      type="checkbox"
                      className="multi-select__input"
                      checked={checked}
                      onChange={() => toggle(opt.value)}
                    />
                    <span className="multi-select__check" aria-hidden>
                      {checked ? <CheckIcon /> : null}
                    </span>
                    <span className="multi-select__option-label">{opt.label}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
