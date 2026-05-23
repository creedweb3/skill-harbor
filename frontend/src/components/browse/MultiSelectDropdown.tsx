import { useEffect, useRef, useState } from "react";

export type MultiSelectOption = { value: string; label: string };

type Props = {
  label: string;
  options: MultiSelectOption[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
};

export function MultiSelectDropdown({ label, options, selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
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
    <div className="multi-select" ref={rootRef}>
      <button
        type="button"
        className={`multi-select__trigger ${selected.size ? "multi-select__trigger--active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="multi-select__label">{label}</span>
        <span className="multi-select__value">{summary}</span>
        {selected.size > 0 ? <span className="multi-select__badge">{selected.size}</span> : null}
        <span className="multi-select__chevron" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className="multi-select__menu" role="listbox">
          <div className="multi-select__actions">
            <button type="button" onClick={selectAll}>
              Select all
            </button>
            <button type="button" onClick={clearAll}>
              Clear
            </button>
          </div>
          <div className="multi-select__options">
            {options.map((opt) => (
              <label key={opt.value} className="multi-select__option">
                <input
                  type="checkbox"
                  checked={selected.has(opt.value)}
                  onChange={() => toggle(opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
