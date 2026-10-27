import { cn } from '@kestrel/ui';

/** Text input styled per DESIGN §6.1 (h-control, rounded-sm, border-input, surface-raised). */
export const inputClass = cn(
  'h-control w-full min-w-0 rounded-sm border border-border-input bg-surface-raised px-3 text-body text-fg',
  'placeholder:text-fg-tertiary transition-colors duration-fast',
  'hover:border-fg-tertiary focus-visible:border-focus-ring focus-visible:focus-ring',
  'aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:opacity-60',
  'max-sm:text-body-lg',
);
