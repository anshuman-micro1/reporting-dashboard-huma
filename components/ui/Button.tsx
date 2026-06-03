import React from 'react';
import { cn } from '../../lib/cn';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'ghost' | 'secondary';
}

export function Button({ className, variant = 'default', ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed';
  const variants: Record<string, string> = {
    default:   'bg-[var(--accent)] text-white hover:bg-[var(--accent-h)]',
    ghost:     'bg-transparent text-[var(--text)] hover:bg-[var(--surface-2)]',
    secondary: 'bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--border)]',
  };
  return (
    <button className={cn(base, variants[variant], className)} {...props} />
  );
}
