import { useState, type ComponentProps } from 'react';

import { cn } from './cn';
import { hashString, isResolvableDomain } from './logo';

export type CompanyLogoSize = 20 | 28 | 40;

const AVATAR_CLASSES = [
  'bg-avatar-1',
  'bg-avatar-2',
  'bg-avatar-3',
  'bg-avatar-4',
  'bg-avatar-5',
  'bg-avatar-6',
] as const;

export interface CompanyLogoProps extends Omit<ComponentProps<'span'>, 'children'> {
  /** Company name (only its first alphanumeric character is drawn in the fallback). */
  name: string;
  /** Company site domain; never the ATS host. */
  domain?: string | null;
  size?: CompanyLogoSize;
}

/**
 * Favicon from Google's favicon service inside a `rounded-sm` tile, with a letter-avatar fallback on
 * error or when the service returns its 16 px globe (DESIGN §7). Decorative: the name is always text.
 */
export function CompanyLogo({
  name,
  domain,
  size = 28,
  className,
  style,
  ...props
}: CompanyLogoProps) {
  const [failed, setFailed] = useState(false);
  const key = (domain ?? name).toLowerCase();
  const letter = (/[a-z0-9]/i.exec(name)?.[0] ?? '?').toUpperCase();
  const showImage = isResolvableDomain(domain) && !failed;
  const inner = size - 4;

  return (
    <span
      data-slot="company-logo"
      aria-hidden="true"
      className={cn(
        'inline-grid shrink-0 select-none place-items-center overflow-hidden rounded-sm border border-border-subtle',
        showImage ? 'bg-surface-raised' : AVATAR_CLASSES[hashString(key) % AVATAR_CLASSES.length],
        className,
      )}
      style={{ width: size, height: size, ...style }}
      {...props}
    >
      {showImage ? (
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
          width={inner}
          height={inner}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          alt=""
          onError={() => setFailed(true)}
          onLoad={(e) => {
            if (e.currentTarget.naturalWidth <= 16) setFailed(true);
          }}
        />
      ) : (
        <span
          className="font-semibold text-fg-secondary"
          style={{ fontSize: Math.round(size * 0.45), lineHeight: 1 }}
        >
          {letter}
        </span>
      )}
    </span>
  );
}
