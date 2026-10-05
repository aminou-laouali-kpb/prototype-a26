import { useState } from 'react';
import { ErrorBanner, Field, Modal, inputClass } from './ui';

export interface FormField {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'select' | 'textarea';
  options?: Array<{ value: string; label: string }>;
  defaultValue?: string;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number | 'any';
}

interface FormModalProps {
  title: string;
  subtitle?: string;
  fields: FormField[];
  submitLabel: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => void;
}

/** Petit formulaire modal générique (champs texte, nombre, date, liste). */
export function FormModal({ title, subtitle, fields, submitLabel, busy, error, onClose, onSubmit }: FormModalProps) {
  const [values, setValues] = useState<Record<string, string>>(
    () => Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? f.options?.[0]?.value ?? ''])),
  );
  const set = (name: string, value: string) => setValues((v) => ({ ...v, [name]: value }));

  return (
    <Modal open onClose={onClose} title={title} subtitle={subtitle}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(values);
        }}
      >
        <ErrorBanner message={error} />
        {fields.map((f) => (
          <Field key={f.name} label={f.label} hint={f.hint}>
            {f.type === 'select' ? (
              <select className={inputClass} value={values[f.name]} onChange={(e) => set(f.name, e.target.value)} required={f.required}>
                {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea className={inputClass} rows={3} value={values[f.name]} placeholder={f.placeholder}
                onChange={(e) => set(f.name, e.target.value)} required={f.required} />
            ) : (
              <input
                type={f.type ?? 'text'}
                className={inputClass}
                value={values[f.name]}
                placeholder={f.placeholder}
                min={f.min}
                max={f.max}
                step={f.step}
                required={f.required}
                onChange={(e) => set(f.name, e.target.value)}
              />
            )}
          </Field>
        ))}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Annuler</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">{submitLabel}</button>
        </div>
      </form>
    </Modal>
  );
}
