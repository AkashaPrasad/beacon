/** `/how-it-works` — the ingestion ladder, the formula, and the three AI modes. */
import { ArrowRight } from 'lucide-react';
import { m } from 'motion/react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FitRing, variants } from '@kestrel/ui';

import { Band, Container, Eyebrow } from '../components/Atmosphere';
import { CountUp } from '../components/CountUp';
import { MarketingLayout, PageIntro } from '../components/MarketingLayout';
import { PUBLIC_PAGES } from '../content/pages';
import { SEED } from '../content/site';

const LADDER = [
  {
    step: '01',
    title: 'ATS APIs first',
    count: SEED.atsFeeds,
    unit: 'sources',
    body: 'Greenhouse, Lever, Ashby, SmartRecruiters, Workable and Workday publish job boards as JSON. Free, structured, no bot-blocking — and most of what students want is here.',
    tags: SEED.atsKinds.map((k) => `${k.kind} ${k.count}`),
  },
  {
    step: '02',
    title: 'Then public APIs',
    count: SEED.publicApis,
    unit: 'APIs',
    body: 'Devpost, Devfolio, Unstop, HackerEarth and Kaggle for hackathons; The Muse, Remotive, RemoteOK and Jobicy for remote roles.',
    tags: ['Devpost', 'Devfolio', 'Unstop', 'HackerEarth', 'Kaggle'],
  },
  {
    step: '03',
    title: 'Then feeds',
    count: SEED.rssFeeds,
    unit: 'feeds',
    body: 'RSS and Atom where a site offers one — programme announcements, fellowship calls, research openings.',
    tags: ['RSS', 'Atom'],
  },
  {
    step: '04',
    title: 'Only then, a crawler',
    count: SEED.crawled,
    unit: 'pages',
    body: 'Pages with no feed are read by Firecrawl, under a daily credit cap you can see. If credits run out, Beacon starts its own standby crawler and parks it again when idle.',
    tags: ['Firecrawl cloud', 'self-hosted standby'],
  },
] as const;

const TERMS = [
  ['0.40', 'semantic', 'how close the listing is to your whole profile'],
  ['0.25', 'skills', 'overlap of required (×2) and nice-to-have skills'],
  ['0.15', 'role', 'your preferred roles vs the listing’s family'],
  ['0.10', 'eligibility', 'grad year, degree, experience — hard fails cap the score'],
  ['0.05', 'location', 'remote preference, city, relocation'],
  ['0.05', 'freshness', 'decays over 30 days; deadlines nearby boost'],
] as const;

const MODES = [
  {
    name: 'Beacon’s AI',
    who: 'Default',
    lines: [
      'Resume parsed into a profile',
      'Written reasons, gaps and tailoring tips',
      'Prompts may train the provider’s free tier — you consent first',
    ],
  },
  {
    name: 'Your own key',
    who: 'Bring your own',
    lines: [
      'Any OpenAI-compatible provider',
      'Key encrypted at rest (AES-256-GCM)',
      'Your usage, your bill, your data policy',
    ],
  },
  {
    name: 'AI off',
    who: 'Private',
    lines: [
      'Local embeddings + rules only',
      'Still ranked, still explained',
      'Nothing leaves our server',
    ],
  },
] as const;

export function Component() {
  return (
    <MarketingLayout page={PUBLIC_PAGES.howItWorks} testId="how-it-works-page">
      <Band tone="wash" wash="a" grid={false}>
        <PageIntro
          eyebrow="How it works"
          title={
            <>
              Read the cheapest way. <em className="text-accent-strong">Score</em> the honest way.
            </>
          }
          lede={`Beacon probed ${SEED.companiesProbed} companies and kept the ${SEED.sources} sources that answer. ${Math.round((SEED.atsFeeds / SEED.sources) * 100)}% of them are free, structured JSON that never needs a crawler.`}
        />
        <Container className="pb-24">
          <Eyebrow>The ingestion ladder</Eyebrow>
          <m.ol
            className="mt-6 grid gap-4 md:grid-cols-2"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            transition={{ staggerChildren: 0.06 }}
          >
            {LADDER.map((s) => (
              <m.li key={s.step} variants={variants.reveal} className="mk-tile mk-step p-6">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-mono text-mono-sm text-fg-tertiary">{s.step}</span>
                  <span className="mk-stat">
                    <CountUp value={s.count} />{' '}
                    <span className="text-small font-normal text-fg-tertiary">{s.unit}</span>
                  </span>
                </div>
                <h3 className="mt-3 text-h2 text-fg">{s.title}</h3>
                <p className="mt-2 text-body text-fg-secondary">{s.body}</p>
                <ul className="mt-4 flex flex-wrap gap-1.5">
                  {s.tags.map((t) => (
                    <li
                      key={t}
                      className="rounded-xs border border-border-subtle bg-surface px-1.5 py-0.5 font-mono text-mono-sm text-fg"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              </m.li>
            ))}
          </m.ol>
          <p className="mt-6 text-small text-fg-tertiary">
            Verified {SEED.verifiedOn}: {SEED.postings.toLocaleString('en-IN')} open postings across
            the packs, {SEED.internPostings.toLocaleString('en-IN')} of them intern or graduate
            roles.
          </p>
        </Container>
      </Band>

      <Band tone="paper">
        <Container className="grid gap-12 py-24 md:grid-cols-[1.1fr_1fr] md:gap-16">
          <div>
            <Eyebrow>The fit score</Eyebrow>
            <h2 className="mk-display-sm mt-3 text-fg">One formula. Every term visible.</h2>
            <p className="mk-lede mt-4 text-fg-secondary">
              Candidates come from a vector search over your profile; the score itself is
              deterministic, so the same inputs always give the same number — and the breakdown is
              shown on every listing.
            </p>
            <pre
              tabIndex={0}
              role="region"
              aria-label="Fit formula"
              className="mt-6 overflow-x-auto rounded-lg border border-border bg-surface-sunken p-4 font-mono text-mono text-fg focus-visible:focus-ring"
            >
              {`fit = 100 × ( 0.40·semantic + 0.25·skills + 0.15·role
            + 0.10·eligibility + 0.05·location + 0.05·freshness )
      − ghost_penalty            // 0–20`}
            </pre>
            <p className="mt-3 text-small text-fg-tertiary">
              Weights are sliders in Settings; hard constraints (citizenship, grad year, on-site vs
              remote) cap the score visibly, never silently.
            </p>
          </div>
          <div className="mk-panel mk-rim p-6">
            <div className="flex items-center gap-5">
              <FitRing score={86} size={64} label="below" />
              <div>
                <p className="text-h2 text-fg">Platform Engineering Intern</p>
                <p className="text-small text-fg-secondary">Northwind Labs · Remote · ₹45k/mo</p>
              </div>
            </div>
            <ul className="mt-6 flex flex-col gap-2.5">
              {TERMS.map(([w, k, d]) => (
                <li
                  key={k}
                  className="grid grid-cols-[3rem_6rem_1fr] items-center gap-3 text-small"
                >
                  <span className="font-mono text-fg-tertiary">{w}</span>
                  <span className="text-fg">{k}</span>
                  <span className="text-fg-secondary">{d}</span>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </Band>

      <Band tone="wash" wash="c" grid={false}>
        <Container className="py-24">
          <Eyebrow>Privacy and AI</Eyebrow>
          <h2 className="mk-display-sm mt-3 text-fg">
            Three ways to run it. You pick on the first screen.
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {MODES.map((mode, i) => (
              <div
                key={mode.name}
                className={cn('mk-tile p-6', i === 2 && 'border-accent-strong/40')}
              >
                <p className="text-label text-fg-tertiary uppercase">{mode.who}</p>
                <h3 className="mt-1 text-h2 text-fg">{mode.name}</h3>
                <ul className="mt-4 flex flex-col gap-2 text-body text-fg-secondary">
                  {mode.lines.map((l) => (
                    <li key={l} className="flex gap-2">
                      <span
                        aria-hidden="true"
                        className="mt-2 size-1.5 shrink-0 rounded-full bg-accent"
                      />
                      {l}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-12 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Button asChild variant="primary" size="lg" className="group gap-2">
              <Link to="/login">
                Start with your resume{' '}
                <ArrowRight
                  className="size-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </Button>
            <Link
              to="/packs"
              className="press inline-flex h-control-lg items-center rounded-sm px-3 text-body text-fg-secondary hover:text-fg focus-visible:focus-ring"
            >
              Browse all {SEED.sources} sources
            </Link>
          </div>
        </Container>
      </Band>
    </MarketingLayout>
  );
}
