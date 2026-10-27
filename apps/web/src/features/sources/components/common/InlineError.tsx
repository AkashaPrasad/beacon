import { AlertCircle } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** Inline form error: `small danger` with an `AlertCircle` (DESIGN §6.1 forms). */
export function InlineError({
  id,
  children,
  className,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      id={id}
      role="alert"
      className={cn('flex items-start gap-1.5 text-small text-danger', className)}
    >
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
