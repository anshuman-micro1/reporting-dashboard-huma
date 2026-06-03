import React from 'react';
import { cn } from '../../lib/cn';

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label?: string }

export function Input({ className, label, ...props }: InputProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {label && <label className="text-xs font-semibold text-gray-300">{label}</label>}
      <input className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:ring-0" {...props} />
    </div>
  );
}
