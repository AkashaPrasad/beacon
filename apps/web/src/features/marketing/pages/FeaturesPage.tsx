/** `/features` — every capability as a bento of live vignettes built from the real components. */
import {
  Bell,
  BrainCircuit,
  CalendarClock,
  Ghost,
  KeyRound,
  Keyboard,
  Kanban,
  Radar,
  Search,
  Smartphone,
  SlidersHorizontal,
  UploadCloud,
} from 'lucide-react';
import { m } from 'motion/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CompanyLogo,
  DeadlineCountdown,
  FitRing,
  GhostRiskBadge,
  Kbd,
  variants,
} from '@kestrel/ui';

import { Band, Container, Eyebrow } from '../components/Atmosphere';
import { MarketingLayout, PageIntro } from '../components/MarketingLayout';
import { TypePill } from '../components/TypePill';
import { PUBLIC_PAGES } from '../content/pages';
import { SEED } from '../content/site';

const NOW = new Date('2026-10-27T09:00:00+05:30');
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000);

type Hue = 'cobalt' | 'violet' | 'teal' | 'orange' | 'pink' | 'lime' | 'amber' | 'indigo';

function Tile({
  icon: Icon,
  title,
  body,
  children,
  className,
  span,
  hue = 'cobalt',
}: {
  icon: typeof Radar;
  title: string;
  body: string;
  children?: ReactNode;
  className?: string;
  span?: 'wide' | 'tall';
  hue?: Hue;
}) {
  return (
    <m.article
      variants={variants.reveal}
      className={cn(
        'mk-tile mk-hued flex flex-col',
        `mk-hue-${hue}`,
        span === 'wide' && 'md:col-span-2',
        span === 'tall' && 'md:row-span-2',
        className,
      )}
    >
      <div className="flex flex-col gap-2 p-5 pb-3">
        <span className="mk-hue-icon inline-grid size-8 place-items-center rounded-sm">
          <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <h3 className="text-h2 text-fg">{title}</h3>
        <p className="text-body text-fg-secondary">{body}</p>
      </div>
      {children && <div className="relative mt-auto overflow-hidden px-5 pb-5">{children}</div>}
    </m.article>
  );
}

function Row({
  title,
  company,
  domain,
  score,
  days,
  type,
}: {
  title: string;
  company: string;
  domain: string;
  score: number;
  days: number | null;
  type: 'internship' | 'hackathon' | 'research' | 'scholarship';
}) {
  return (
    <li className="flex items-center gap-3 rounded-md border border-border-subtle bg-surface-raised px-3 py-2.5">
      <CompanyLogo name={company} domain={domain} size={28} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-small font-medium text-fg">{title}</span>
        <span className="flex items-center gap-2 text-caption text-fg-tertiary">
          <TypePill type={type} /> <span className="truncate">{company}</span>
        </span>
      </span>
      <DeadlineCountdown
        deadlineAt={days === null ? null : inDays(days)}
        kind={days === null ? 'rolling' : 'date'}
        now={NOW}
      />
      <FitRing score={score} size={28} label="none" />
    </li>
  );
}

export function Component() {
  return (
    <MarketingLayout page={PUBLIC_PAGES.features} testId="features-page">
      <Band tone="wash" wash="a" grid={false}>
        <PageIntro
          eyebrow="Features"
          title={
            <>
              Everything a student needs. <em className="text-accent-strong">Nothing</em> you have
              to babysit.
            </>
          }
          lede="One radar across internships, jobs, hackathons, scholarships and open-source programmes — ranked by an explainable fit score, watched for deadlines, and tracked to the offer."
        />
        <Container className="pb-24">
          <m.div
            className="grid gap-4 md:grid-cols-3 md:auto-rows-[minmax(14rem,auto)]"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
            transition={{ staggerChildren: 0.05 }}
          >
            <Tile
              icon={Radar}
              title="The Radar"
              hue="cobalt"
              body="One ranked feed. Filters on the left, a fit score on every row, the reason one click away."
              span="wide"
            >
              <ul className="flex flex-col gap-2">
                <Row
                  title="Platform Engineering Intern"
                  company="Northwind Labs"
                  domain="northwind.example"
                  score={86}
                  days={6}
                  type="internship"
                />
                <Row
                  title="ML Research Intern"
                  company="Meridian AI Lab"
                  domain="meridian.example"
                  score={91}
                  days={9}
                  type="research"
                />
                <Row
                  title="Monsoon Hack 2026"
                  company="Kaveri Collective"
                  domain="kaveri.example"
                  score={78}
                  days={3}
                  type="hackathon"
                />
              </ul>
            </Tile>
            <Tile
              icon={SlidersHorizontal}
              title="Explainable fit"
              hue="teal"
              body="Semantic, skills, role, eligibility, location, freshness — with weights you can drag."
            >
              <div className="flex items-center gap-4">
                <FitRing score={86} size={64} label="below" />
                <ul className="flex flex-1 flex-col gap-1.5 text-caption text-fg-secondary">
                  {[
                    ['Semantic', 34],
                    ['Skills', 21],
                    ['Role', 12],
                    ['Eligibility', 10],
                  ].map(([k, v]) => (
                    <li key={k} className="flex items-center gap-2">
                      <span className="w-16">{k}</span>
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                        <span
                          className="block h-full rounded-full bg-accent"
                          style={{ width: `${(Number(v) / 40) * 100}%` }}
                        />
                      </span>
                      <span className="w-6 text-right font-mono text-fg">{v}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Tile>
            <Tile
              icon={Search}
              title="Any source"
              hue="indigo"
              body={`Paste a URL. Beacon detects the cheapest way to read it. ${SEED.sources} sources ship in ${SEED.packs} packs.`}
            >
              <div className="rounded-md border border-border bg-surface-raised p-3 text-small">
                <p className="truncate font-mono text-mono-sm text-fg-secondary">
                  boards.greenhouse.io/groww
                </p>
                <p className="mt-1.5 flex items-center gap-2 text-fg">
                  <span className="size-1.5 rounded-full bg-success" /> Detected: Greenhouse board{' '}
                  <span className="font-mono">groww</span> · 10 jobs
                </p>
              </div>
            </Tile>
            <Tile
              icon={CalendarClock}
              title="Deadline timeline"
              hue="orange"
              body="Hackathons and scholarships live on a week strip with a today line, not in a list."
            >
              <div className="relative h-16 overflow-hidden rounded-md border border-border-subtle bg-surface-raised">
                <div className="absolute inset-y-0 left-[22%] w-0.5 bg-accent-strong" />
                {[
                  ['14%', 'Monsoon Hack'],
                  ['40%', 'Backend Intern'],
                  ['66%', 'ML Research'],
                ].map(([l, t], i) => (
                  <span
                    key={t}
                    className="absolute rounded-xs border border-border bg-surface px-1.5 py-0.5 text-caption text-fg"
                    style={{ left: l, top: `${8 + i * 18}px` }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </Tile>
            <Tile
              icon={Ghost}
              title="Ghost detection"
              hue="amber"
              body="Age, reposts, dead apply links and boilerplate add up to a risk badge with reasons."
            >
              <div className="flex items-center justify-between rounded-md border border-border-subtle bg-surface-raised px-3 py-2.5 text-small">
                <span className="text-fg-secondary line-through">Data Analyst Intern</span>
                <GhostRiskBadge level="high" />
              </div>
            </Tile>
            <Tile
              icon={Bell}
              title="Alerts on your rules"
              hue="pink"
              body="“Fit ≥ 80 and internship and deadline ≤ 14 days → push, instantly.” Web push and in-app only."
            >
              <p className="rounded-md border border-border-subtle bg-surface-raised p-3 text-small text-fg">
                When{' '}
                <span className="rounded-xs bg-accent-subtle px-1 text-accent-strong">
                  fit ≥ 80
                </span>{' '}
                and{' '}
                <span className="rounded-xs bg-accent-subtle px-1 text-accent-strong">
                  type is Internship
                </span>{' '}
                → notify me{' '}
                <span className="rounded-xs bg-accent-subtle px-1 text-accent-strong">
                  instantly
                </span>
              </p>
            </Tile>
            <Tile
              icon={Kanban}
              title="Tracker with nudges"
              hue="violet"
              body="Saved → Applied → Interview → Offer. Ten quiet days and it suggests a follow-up."
              span="wide"
            >
              <div className="grid grid-cols-4 gap-2">
                {['Saved', 'Applied', 'Interview', 'Offer'].map((c, i) => (
                  <div key={c} className="rounded-md bg-surface-sunken/70 p-2">
                    <p className="text-label text-fg-tertiary uppercase">{c}</p>
                    <div
                      className={cn(
                        'mt-2 h-9 rounded-sm border border-border bg-surface-raised',
                        i === 1 && 'border-accent-strong/50',
                      )}
                    />
                    {i < 2 && (
                      <div className="mt-1.5 h-9 rounded-sm border border-border bg-surface-raised" />
                    )}
                  </div>
                ))}
              </div>
            </Tile>
            <Tile
              icon={UploadCloud}
              title="Resume in, profile out"
              hue="lime"
              body="PDF, DOCX or a scan. Skills, education, projects and links, parsed and editable."
            />
            <Tile
              icon={KeyRound}
              title="Your AI, or none"
              hue="indigo"
              body="Use Beacon’s default, bring an OpenAI-compatible key (encrypted at rest), or switch AI off."
            />
            <Tile
              icon={BrainCircuit}
              title="Works without AI"
              hue="teal"
              body="Local embeddings and rules rank every listing. AI only adds written reasons and tips."
            />
            <Tile
              icon={Keyboard}
              title="Keyboard first"
              hue="cobalt"
              body="Move, save, hide and track without leaving the keys. ⌘K for everything else."
            >
              <div className="flex flex-wrap gap-2 text-caption text-fg-secondary">
                {[
                  ['j / k', 'move'],
                  ['s', 'save'],
                  ['h', 'hide'],
                  ['a', 'track'],
                  ['⌘K', 'palette'],
                ].map(([k, l]) => (
                  <span key={k} className="inline-flex items-center gap-1.5">
                    <Kbd>{k}</Kbd> {l}
                  </span>
                ))}
              </div>
            </Tile>
            <Tile
              icon={Smartphone}
              title="Built for the phone too"
              hue="pink"
              body="Bottom tabs, full-page details, swipe to save or hide, push notifications."
            />
          </m.div>
          <div className="mt-14 flex flex-col items-start gap-4 border-t border-border-subtle pt-10 md:flex-row md:items-center md:justify-between">
            <div>
              <Eyebrow>Ready?</Eyebrow>
              <p className="mk-display-sm mt-2 text-fg">
                Three minutes from a resume to a ranked radar.
              </p>
            </div>
            <Button asChild variant="primary" size="lg">
              <Link to="/login">Start with your resume</Link>
            </Button>
          </div>
        </Container>
      </Band>
    </MarketingLayout>
  );
}
