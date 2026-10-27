import { Plus } from 'lucide-react';
import { useId, type ReactNode, type Ref } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@kestrel/ui';

export interface LedgerSectionProps {
  label: string;
  /** One line under the label explaining why the section matters for ranking. */
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  'data-testid'?: string;
}

/**
 * One row of the Read.cv-style ledger (DESIGN §6.1 Profile): a quiet label column (160 px) on the
 * left, the content on the right; on phones the label sits above.
 */
export function LedgerSection({ label, hint, children, className, id, ...rest }: LedgerSectionProps) {
  const headingId = useId();
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      data-testid={rest['data-testid']}
      className={cn(
        'grid scroll-mt-[calc(var(--topbar-h)+1rem)] gap-x-8 gap-y-3 border-t border-border-subtle py-6 sm:grid-cols-[10rem_minmax(0,1fr)]',
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-small font-medium text-fg-tertiary">
          {label}
        </h2>
        {hint && <p className="hidden text-caption text-fg-tertiary sm:block">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function AddButton({
  children,
  onClick,
  ref,
  ...rest
}: {
  children: ReactNode;
  onClick: () => void;
  ref?: Ref<HTMLButtonElement>;
  'data-testid'?: string;
}) {
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="sm"
      onClick={onClick}
      data-testid={rest['data-testid']}
      className="-ml-2.5 self-start text-fg-secondary"
    >
      <Plus className="size-4" strokeWidth={1.5} aria-hidden="true" />
      {children}
    </Button>
  );
}
