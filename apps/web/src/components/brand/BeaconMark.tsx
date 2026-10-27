import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * The Beacon mark (brand/beacon-mark.svg), inline so it inherits `currentColor`.
 * Decorative by default; pass `title` to make it an image with a name.
 * Under 24 px use the favicon geometry instead (brand README: minimum sizes).
 */
export function BeaconMark({
  title,
  className,
  ...props
}: ComponentProps<'svg'> & { title?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="currentColor"
      className={cn('size-6 shrink-0', className)}
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
      focusable="false"
      {...props}
    >
      <path
        d="M396.7 260.7A160 160 0 1 1 251.3 115.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="30"
        strokeLinecap="round"
      />
      <path d="M334.3 46.4A248 248 0 0 1 465.6 177.7L322 238.7A92 92 0 0 0 273.3 190Z" />
      <circle cx="237.4" cy="274.6" r="62" />
    </svg>
  );
}

/** Mark + "Beacon" in Instrument Serif (the lockup). Text stays live so it scales with font settings. */
export function BeaconLockup({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-fg', className)}>
      <BeaconMark className={cn('size-6', markClassName)} />
      <span className="font-display text-[1.375rem] leading-none tracking-[-0.009em]">Beacon</span>
    </span>
  );
}
