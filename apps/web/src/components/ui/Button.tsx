import { ButtonHTMLAttributes } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'md' | 'sm';
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', loading, children, disabled, className = '', type = 'button', ...rest }: Props) {
  const cls = ['btn', variant === 'primary' ? '' : variant, size === 'sm' ? 'sm' : '', className].filter(Boolean).join(' ');
  return (
    <button {...rest} type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined}>
      {loading ? 'Guardando…' : children}
    </button>
  );
}
