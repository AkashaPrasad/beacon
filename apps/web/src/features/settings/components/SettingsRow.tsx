import { CircleCheck } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useId, type ReactNode } from 'react';

import { tweens } from '@/features/onboarding/lib/motion';
import { cn } from '@kestrel/ui';

export interface SettingsRowProps {
  label: ReactNode;
  help?: ReactNode;
  /** Render prop receives the label id, so controls can be `aria-labelledby` it. */
  children: (ids: { labelId: string; helpId: string | undefined }) => ReactNode;
  className?: string;
  'data-testid'?: string;
  /** Stack the control under the label even on desktop (wide controls: previews, forms). */
  stacked?: boolean;
}

/**
 * One settings row (DESIGN §10.6): label column 200 px (body 500 + caption helper), control on the
 * right. On phones the label sits above the control.
 */
export function SettingsRow({ label, help, children, className, stacked, ...rest }: SettingsRowProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const helpId = help ? `${id}-help` : undefined;
  return (
    <div
      data-testid={rest['data-testid']}
      className={cn(
        'grid gap-x-6 gap-y-2.5 border-b border-border-subtle py-4 last:border-b-0',
        stacked ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-[12.5rem_minmax(0,1fr)] sm:items-start',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5 sm:pt-1.5">
        <span id={labelId} className="text-body font-medium text-fg">
          {label}
        </span>
        {help && (
          <span id={helpId} className="text-caption text-fg-tertiary">
            {help}
          </span>
        )}
      </div>
      <div className="min-w-0">{children({ labelId, helpId })}</div>
    </div>
  );
}

export interface SettingsSectionProps {
  title: string;
  description?: ReactNode;
  /** Shows "Saved" for 1.5 s after a successful change (DESIGN §6.1 Settings). */
  saved?: boolean;
  children: ReactNode;
  className?: string;
  'data-testid'?: string;
}

export function SettingsSection({ title, description, saved, children, className, ...rest }: SettingsSectionProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn('flex flex-col', className)} data-testid={rest['data-testid']}>
      <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={id} className="text-h2 text-fg">
            {title}
          </h2>
          {description && <p className="text-small text-fg-tertiary">{description}</p>}
        </div>
        <span aria-live="polite" className="min-h-4 shrink-0">
          <AnimatePresence initial={false}>
            {saved && (
              <m.span
                key="saved"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: tweens.fadeIn }}
                exit={{ opacity: 0, transition: tweens.fadeOut }}
                className="inline-flex items-center gap-1 text-caption text-success"
                data-testid="settings-saved"
              >
                <CircleCheck className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                Saved
              </m.span>
            )}
          </AnimatePresence>
        </span>
      </div>
      {children}
    </section>
  );
}
