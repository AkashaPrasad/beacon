import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** Small uppercase section label above a landing heading (`label` style). */
export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-label text-fg-tertiary uppercase', className)}>{children}</p>;
}
