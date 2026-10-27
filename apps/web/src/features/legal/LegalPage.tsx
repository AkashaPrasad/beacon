import type { ReactNode } from 'react';

import { Band, Container } from '@/features/marketing/components/Atmosphere';
import { MarketingLayout } from '@/features/marketing/components/MarketingLayout';
import type { PublicPage } from '@/features/marketing/content/pages';

import '@/features/marketing/marketing.css';

/** Shared frame for the public policy pages: site nav, serif title, one prose column, footer. */
export function LegalPage({
  page,
  testId,
  title,
  updated,
  children,
}: {
  page: PublicPage;
  testId: string;
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <MarketingLayout page={page} testId={testId}>
      <Band tone="wash" wash="a" grid={false}>
        <Container narrow className="pt-14 pb-6 md:pt-20">
          <p className="text-label text-accent-strong uppercase">Beacon</p>
          <h1 className="mk-display mt-3 text-fg">{title}</h1>
          <p className="mt-3 font-mono text-mono-sm text-fg-tertiary">Updated {updated}</p>
        </Container>
      </Band>
      <Container narrow className="pt-10 pb-24">
        <div className="flex flex-col gap-6 text-body-lg text-fg-secondary [&_h2]:mt-4 [&_h2]:text-h2 [&_h2]:text-fg [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-medium [&_strong]:text-fg [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2 [&_a]:text-accent-strong [&_a]:underline-offset-3 hover:[&_a]:underline">
          {children}
        </div>
      </Container>
    </MarketingLayout>
  );
}
