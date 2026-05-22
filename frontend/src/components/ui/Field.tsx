import type { InputHTMLAttributes, ReactNode } from "react";

type Props = {
  label: ReactNode;
  hint?: string;
  children: ReactNode;
};

export function Field({ label, hint, children }: Props) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      {hint ? <p className="hint">{hint}</p> : null}
      {children}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} />;
}
