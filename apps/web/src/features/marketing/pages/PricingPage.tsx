/** `/pricing` — free, forever; what that means; an honest comparison with typical tools. */
import { Check, Minus } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';

import { Band, Container, Eyebrow } from '../components/Atmosphere';
import { Faq } from '../components/Faq';
import { MarketingLayout, PageIntro } from '../components/MarketingLayout';
import { PUBLIC_PAGES } from '../content/pages';
import { REPO_URL, SELF_HOST_URL } from '../content/site';

const INCLUDED = [
  'Unlimited sources and packs',
  'Fit scores with full breakdowns',
  'Deadline timeline and reminders',
  'Alert rules: web push and in-app',
  'Tracker with follow-up nudges',
  'Resume parsing, including scans',
  'Beacon’s AI, or your own key, or none',
  'Export everything as JSON',
];

const COMPARE: {
  row: string;
  beacon: string | true;
  board: string | boolean;
  tracker: string | boolean;
}[] = [
  {
    row: 'Price',
    beacon: '₹0',
    board: 'Free with ads, or paid alerts',
    tracker: 'Free up to a cap',
  },
  { row: 'Jobs, hackathons and scholarships together', beacon: true, board: false, tracker: false },
  { row: 'Add your own career pages', beacon: true, board: false, tracker: 'Manually' },
  { row: 'Explains every match', beacon: true, board: 'Opaque “match %”', tracker: false },
  { row: 'Ghost-listing detection', beacon: true, board: false, tracker: false },
  { row: 'Alerts filtered by your rules', beacon: true, board: 'Keyword alerts', tracker: false },
  { row: 'Bring your own AI, or none', beacon: true, board: false, tracker: false },
  { row: 'Open source, self-hostable', beacon: true, board: false, tracker: false },
];

const FAQ = [
  {
    q: 'How is it free?',
    a: 'The frontend is static, the database is a free tier, and one small server runs the rest for about ₹1,400 a month, which the project pays. Most sources are free JSON endpoints, so there is almost nothing to meter.',
  },
  {
    q: 'Will there be a paid tier later?',
    a: 'No plan for one. If hosting ever becomes a problem, the answer is a donation link and self-hosting, not a paywall on alerts.',
  },
  {
    q: 'What does “bring your own key” cost me?',
    a: 'Only what your provider bills you. A profile parse and a day of explanations are typically well under a rupee on the small models we default to.',
  },
  {
    q: 'Can my college run its own Beacon?',
    a: 'Yes. It is MIT licensed and deploys with one Terraform apply and one Docker Compose file; the runbook is in the repository.',
  },
];

function Cell({ v }: { v: string | boolean }) {
  if (v === true) return <Check className="size-4 text-success" strokeWidth={2} aria-label="Yes" />;
  if (v === false)
    return <Minus className="size-4 text-fg-tertiary" strokeWidth={2} aria-label="No" />;
  return <span className="text-small text-fg-secondary">{v}</span>;
}

export function Component() {
  return (
    <MarketingLayout page={PUBLIC_PAGES.pricing} testId="pricing-page">
      <Band tone="wash" wash="b" grid={false}>
        <PageIntro
          eyebrow="Pricing"
          title={
            <>
              Free, <em className="text-accent-strong">forever.</em>
            </>
          }
          lede="No paid tier, no paywall on alerts, no ads. Beacon is a student project that is open source and cheap to run, and it stays that way."
          className="text-center [&>*]:mx-auto"
        />
        <Container className="pb-24">
          <div className="mk-panel mx-auto max-w-3xl p-8 md:p-10">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-label text-fg-tertiary uppercase">Everything, for everyone</p>
                <p className="mt-2 flex items-baseline gap-2">
                  <span className="mk-stat text-[3.5rem]">₹0</span>
                  <span className="text-body text-fg-secondary">
                    per month, per student, per anything
                  </span>
                </p>
              </div>
              <Button asChild variant="primary" size="lg">
                <Link to="/login">Start with your resume</Link>
              </Button>
            </div>
            <ul className="mt-8 grid gap-2.5 sm:grid-cols-2">
              {INCLUDED.map((i) => (
                <li key={i} className="flex items-start gap-2.5 text-body text-fg">
                  <Check
                    className="mt-1 size-4 shrink-0 text-success"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                  {i}
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </Band>
      <Band tone="paper">
        <Container className="py-24">
          <Eyebrow>Compared, honestly</Eyebrow>
          <h2 className="mk-display-sm mt-3 text-fg">
            What a typical job board or tracker does, and what Beacon does.
          </h2>
          <div
            className="mk-panel mt-8 overflow-x-auto"
            role="region"
            aria-label="Comparison table"
            tabIndex={0}
          >
            <table className="w-full min-w-[40rem] text-left">
              <thead>
                <tr className="border-b border-border text-label text-fg-tertiary uppercase">
                  <th className="px-5 py-3 font-medium">&nbsp;</th>
                  <th className="px-5 py-3 font-medium text-accent-strong">Beacon</th>
                  <th className="px-5 py-3 font-medium">Typical job board</th>
                  <th className="px-5 py-3 font-medium">Typical tracker</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((r) => (
                  <tr key={r.row} className="border-b border-border-subtle last:border-0">
                    <th scope="row" className="px-5 py-3 text-body font-medium text-fg">
                      {r.row}
                    </th>
                    <td className="px-5 py-3">
                      <Cell v={r.beacon} />
                    </td>
                    <td className="px-5 py-3">
                      <Cell v={r.board} />
                    </td>
                    <td className="px-5 py-3">
                      <Cell v={r.tracker} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-caption text-fg-tertiary">
            “Typical” describes common products in the category, not any one of them.
          </p>
        </Container>
      </Band>
      <Band tone="paper">
        <Container narrow className="py-24">
          <Eyebrow>Questions about money</Eyebrow>
          <Faq items={FAQ} className="mt-6" />
          <p className="mt-8 text-body text-fg-secondary">
            Prefer to run it yourself?{' '}
            <a
              href={SELF_HOST_URL}
              className="rounded-xs text-accent-strong underline-offset-3 hover:underline focus-visible:focus-ring"
              rel="noopener noreferrer"
            >
              Self-host guide
            </a>{' '}
            ·{' '}
            <a
              href={REPO_URL}
              className="rounded-xs text-accent-strong underline-offset-3 hover:underline focus-visible:focus-ring"
              rel="noopener noreferrer"
            >
              Source on GitHub
            </a>
          </p>
        </Container>
      </Band>
    </MarketingLayout>
  );
}
