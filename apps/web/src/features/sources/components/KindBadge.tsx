import { cn } from '@/lib/utils';
import type { SourceKind } from '@kestrel/shared';

import { KIND_ICONS } from '../lib/kind-icons';
import { KIND_LABELS } from '../lib/rows';


/** How Beacon reads a source: an ATS API (free), a public API / feed (free) or the crawler (credits). */
export function KindBadge({ kind, className }: { kind: SourceKind; className?: string }) {
  const Icon = KIND_ICONS[kind];
  return (
    <span
      className={cn(
        'inline-flex h-5 max-w-full items-center gap-1 truncate rounded-xs bg-surface-sunken px-1.5 text-caption font-medium text-fg-secondary',
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
      <span className="truncate">{KIND_LABELS[kind]}</span>
    </span>
  );
}
