import { forwardRef, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, useId } from 'react';

interface FieldProps {
  label: string;
  error?: string;
  help?: string;
  children: (a: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}

/** Envoltorio accesible: label asociado, ayuda y error anunciado (role=alert). */
export function FormField({ label, error, help, children }: FieldProps) {
  const id = useId();
  const describedBy = [help ? `${id}-help` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {help && <span id={`${id}-help`} className="help">{help}</span>}
      {error && <span id={`${id}-err`} className="error" role="alert">{error}</span>}
    </div>
  );
}

type Common = { label: string; error?: string; help?: string };

export const Input = forwardRef<HTMLInputElement, Common & InputHTMLAttributes<HTMLInputElement>>(function Input({ label, error, help, ...rest }, ref) {
  return <FormField label={label} error={error} help={help}>{(a) => <input ref={ref} className="input" id={a.id} aria-describedby={a.describedBy} aria-invalid={a.invalid} {...rest} />}</FormField>;
});

/** DatePicker nativo (teclado y lectores de pantalla accesibles). */
export const DatePicker = forwardRef<HTMLInputElement, Common & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { withTime?: boolean }>(function DatePicker({ withTime, ...rest }, ref) {
  return <Input ref={ref} type={withTime ? 'datetime-local' : 'date'} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, Common & SelectHTMLAttributes<HTMLSelectElement> & { placeholder?: string }>(function Select({ label, error, help, placeholder, children, ...rest }, ref) {
  return (
    <FormField label={label} error={error} help={help}>
      {(a) => (
        <select ref={ref} className="input" id={a.id} aria-describedby={a.describedBy} aria-invalid={a.invalid} {...rest}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {children}
        </select>
      )}
    </FormField>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, Common & TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ label, error, help, ...rest }, ref) {
  return <FormField label={label} error={error} help={help}>{(a) => <textarea ref={ref} className="input" id={a.id} aria-describedby={a.describedBy} aria-invalid={a.invalid} {...rest} />}</FormField>;
});
