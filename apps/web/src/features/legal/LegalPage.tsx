import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { BeaconMark } from '@/components/brand/BeaconMark';

/** Shared frame for the public policy pages: lockup, serif title, one prose column. */
export function LegalPage({
  testId,
  title,
  updated,
  children,
}: {
  testId: string;
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div data-testid={testId} className="flex min-h-dvh flex-col bg-bg">
      <header className="flex h-14 items-center px-gutter pt-safe">
        <Link
          to="/"
          className="flex items-center gap-2 rounded-sm text-fg focus-visible:focus-ring"
          aria-label="Beacon home"
        >
          <BeaconMark className="size-6 text-accent-strong" />
          <span className="font-display text-[1.375rem] leading-none tracking-[-0.009em]">
            Beacon
          </span>
        </Link>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-prose px-gutter pt-8 pb-20 outline-none"
      >
        <h1 className="font-display text-display text-fg">{title}</h1>
        <p className="mt-2 font-mono text-mono-sm text-fg-tertiary">Updated {updated}</p>
        <div className="mt-8 flex flex-col gap-6 text-body-lg text-fg-secondary [&_h2]:mt-2 [&_h2]:text-h2 [&_h2]:text-fg [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-medium [&_strong]:text-fg [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2">
          {children}
        </div>
      </main>
    </div>
  );
}
