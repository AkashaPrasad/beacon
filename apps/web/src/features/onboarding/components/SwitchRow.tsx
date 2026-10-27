import { useId, type ReactNode } from 'react';

import { Switch } from '@/components/ui/switch';

/** A labelled switch on one line with a one-line description (relocation, sponsorship). */
export function SwitchRow({
  checked,
  onCheckedChange,
  label,
  description,
  testId,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  testId?: string;
}) {
  const id = useId();
  const descId = useId();
  return (
    <div className="flex items-center gap-4 border-t border-border-subtle pt-4">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <label htmlFor={id} className="text-body font-medium text-fg">
          {label}
        </label>
        {description && (
          <p id={descId} className="text-small text-fg-secondary">
            {description}
          </p>
        )}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-describedby={description ? descId : undefined}
        data-testid={testId}
      />
    </div>
  );
}
