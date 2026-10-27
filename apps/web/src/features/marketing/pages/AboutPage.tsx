/** `/about` — the problem with its sources, the thesis, the stack, and how to reach us. */
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';

import { Band, Container, Eyebrow } from '../components/Atmosphere';
import { MarketingLayout, PageIntro } from '../components/MarketingLayout';
import { PUBLIC_PAGES } from '../content/pages';
import { API_DOCS_URL, CONTACT_URL, REPO_URL, SEED } from '../content/site';

const STATS = [
  {
    n: '55%',
    t: 'of 1,050 Indian students surveyed said finding an internship is difficult; 35% said there are not enough to apply for.',
  },
  {
    n: '1 in 5',
    t: 'listings has qualified as a ghost job in any quarter since 2022 (Greenhouse data); 81% of recruiters admit their employer posts them.',
  },
  { n: '52%', t: 'of job seekers report being ghosted during the interview process.' },
  {
    n: '≈14×',
    t: 'better results from direct applications on company career pages than quick-apply on third-party boards (Huntr, 600k+ applications).',
  },
];

const PRINCIPLES = [
  [
    'Explain every score.',
    'A number without a reason is a guess with a font. Every fit shows its terms, its caps and its penalties.',
  ],
  [
    'The student chooses the sources.',
    'Beacon watches what you point it at — career pages, hackathon sites, scholarship lists — and never sells placement.',
  ],
  [
    'Cheapest path first.',
    `${SEED.atsFeeds} of ${SEED.sources} sources are free JSON. Crawling is the last resort, metered and visible.`,
  ],
  [
    'Privacy is a setting, not a promise.',
    'Bring your own AI key or switch AI off. Export or delete everything whenever you like.',
  ],
  ['Calm over clutter.', 'One glance, one decision. Power features one key away.'],
];

const STACK = [
  'React 19',
  'Tailwind v4',
  'Motion',
  'Express 5',
  'MongoDB Atlas',
  'BullMQ',
  'Firecrawl',
  'Terraform',
  'Cloudflare Pages',
  'AWS Graviton',
];

export function Component() {
  return (
    <MarketingLayout page={PUBLIC_PAGES.about} testId="about-page">
      <Band tone="wash" wash="c" grid={false}>
        <PageIntro
          eyebrow="About"
          title={
            <>
              Built because the search was the <em className="text-accent-strong">hard</em> part.
            </>
          }
          lede="Beacon started as an end-term project with a simple complaint: thirty tabs, spam alerts, missed deadlines and no way to know whether a listing fits. It became a radar."
        />
        <Container className="pb-24">
          <Eyebrow>The problem, in numbers</Eyebrow>
          <dl className="mt-6 grid gap-4 md:grid-cols-2">
            {STATS.map((s) => (
              <div key={s.n} className="mk-tile p-6">
                <dt className="mk-stat">{s.n}</dt>
                <dd className="mt-2 text-body text-fg-secondary">{s.t}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-caption text-fg-tertiary">
            Sources and citations are listed in the project’s research notes (docs/SPEC.md §1 in the
            repository).
          </p>
        </Container>
      </Band>
      <Band tone="paper">
        <Container className="py-24">
          <Eyebrow>Principles</Eyebrow>
          <h2 className="mk-display-sm mt-3 text-fg">Five things we will not trade away.</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {PRINCIPLES.map(([t, b], i) => (
              <li key={t} className="mk-step">
                <p className="font-mono text-mono-sm text-fg-tertiary">0{i + 1}</p>
                <h3 className="mt-1 text-h2 text-fg">{t}</h3>
                <p className="mt-2 text-body text-fg-secondary">{b}</p>
              </li>
            ))}
          </ol>
        </Container>
      </Band>
      <Band tone="wash" wash="a" grid={false}>
        <Container className="grid gap-12 py-24 md:grid-cols-2">
          <div>
            <Eyebrow>Open source</Eyebrow>
            <h2 className="mk-display-sm mt-3 text-fg">
              MIT licensed. Self-hostable in an afternoon.
            </h2>
            <p className="mk-lede mt-4 text-fg-secondary">
              A typed monorepo with a React app, an Express API and a BullMQ worker. One Terraform
              apply, one Docker Compose file, a runbook and a test matrix.
            </p>
            <ul className="mt-5 flex flex-wrap gap-1.5">
              {STACK.map((s) => (
                <li
                  key={s}
                  className="rounded-xs border border-border-subtle bg-surface px-1.5 py-0.5 font-mono text-mono-sm text-fg"
                >
                  {s}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild variant="secondary" size="md">
                <a href={REPO_URL} rel="noopener noreferrer">
                  Source on GitHub
                </a>
              </Button>
              <Button asChild variant="ghost" size="md">
                <a href={API_DOCS_URL} rel="noopener noreferrer">
                  API reference
                </a>
              </Button>
            </div>
          </div>
          <div className="mk-panel mk-rim flex flex-col gap-4 p-7">
            <Eyebrow>Contact</Eyebrow>
            <p className="text-h2 text-fg">
              Found a bug, want a source added, or just want to say hello?
            </p>
            <p className="text-body text-fg-secondary">
              Open an issue — it is the fastest way to reach us, and it keeps the answer public for
              the next student.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="primary" size="md">
                <a href={CONTACT_URL} rel="noopener noreferrer">
                  Open an issue
                </a>
              </Button>
              <Button asChild variant="ghost" size="md">
                <Link to="/login">Try Beacon</Link>
              </Button>
            </div>
          </div>
        </Container>
      </Band>
    </MarketingLayout>
  );
}
