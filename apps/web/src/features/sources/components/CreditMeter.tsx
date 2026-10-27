import { ChevronDown, Server } from 'lucide-react';
import { m } from 'motion/react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { springs } from '@kestrel/ui';

import { CountUp } from './common/CountUp';
import { formatCount } from '../lib/format';
import { meterState, type Credits } from '../lib/health';

const BAR_TONE = { normal: 'bg-fg-secondary', warning: 'bg-warning', danger: 'bg-danger' } as const;

const BACKEND_LABEL = {
  cloud: 'Cloud',
  selfhosted: 'Self-hosted standby',
  paused: 'Paused until 00:00 IST',
} as const;

/**
 * Crawl credit meter as one quiet line (DESIGN §6.1 / §10.5): "312 / 500 crawl credits today" in mono
 * with a 4 px bar (`fg-secondary`, `warning` ≥ 80 %, `danger` at 100 %). Everything else (backend,
 * standby calls, your own usage, what costs credits) is one click away in the popover. The line only
 * gets louder when it matters: the backend word appears when crawls run on the standby or pause.
 * The whole line is the popover trigger, so its accessible name reads the numbers and the backend.
 */
export function CreditMeter({
  credits,
  loading,
  className,
}: {
  credits: Credits | undefined;
  loading?: boolean;
  className?: string;
}) {
  if (!credits) {
    return (
      <p
        className={cn('flex h-7 items-center gap-2 text-small text-fg-tertiary', className)}
        aria-busy={loading}
      >
        <span className="font-mono">— / —</span> crawl credits today
      </p>
    );
  }
  const s = meterState(credits);
  return (
    <div
      data-testid="sources-credit-meter"
      data-mode={s.mode}
      data-tone={s.tone}
      className={cn('flex min-w-0 items-center', className)}
    >
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="sources-credit-backend"
            className="group/credits -mx-1.5 inline-flex h-7 min-w-0 items-center gap-2 rounded-sm px-1.5 text-small text-fg-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-fg focus-visible:focus-ring"
          >
            <span
              data-testid="credit-meter"
              data-used={credits.cloudUsedToday}
              data-cap={credits.cap}
              className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap"
            >
              <span className="font-mono text-mono-sm text-fg">
                <CountUp value={credits.cloudUsedToday} onceId="credit-meter" /> /{' '}
                {formatCount(credits.cap)}
              </span>
              <span className="truncate">crawl credits today</span>
              <span
                aria-hidden="true"
                className="h-1 w-12 shrink-0 overflow-hidden rounded-full bg-surface-sunken max-sm:hidden"
              >
                <m.span
                  className={cn('block h-full w-full origin-left rounded-full', BAR_TONE[s.tone])}
                  initial={false}
                  animate={{ scaleX: s.ratio }}
                  transition={springs.data}
                />
              </span>
            </span>
            {s.mode === 'cloud' ? null : (
              <span
                className={cn(
                  'inline-flex items-center gap-1 whitespace-nowrap',
                  s.mode === 'selfhosted' ? 'text-info' : 'text-warning',
                )}
              >
                {s.mode === 'selfhosted' ? (
                  <Server className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                ) : null}
                {s.mode === 'selfhosted' ? 'Self-hosted standby' : 'Paused'}
              </span>
            )}
            <ChevronDown
              className="size-3.5 shrink-0 text-fg-tertiary transition-transform duration-fast group-data-[state=open]/credits:rotate-180"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span className="sr-only">. Crawl backend: {BACKEND_LABEL[s.mode]}. Show details</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0">
          <CreditDetails credits={credits} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="text-small text-fg-secondary">{label}</dt>
      <dd className="font-mono text-mono text-fg">{value}</dd>
    </div>
  );
}

function CreditDetails({ credits }: { credits: Credits }) {
  const s = meterState(credits);
  return (
    <div className="flex flex-col gap-3 p-4">
      <div>
        <h3 className="text-h3 text-fg">Crawl credits</h3>
        <p className="mt-1 text-small text-fg-secondary">
          Only pages Beacon has to read itself use credits. Greenhouse, Lever, Ashby and other
          job-board APIs, RSS feeds and public APIs are free.
        </p>
      </div>
      <dl className="divide-y divide-border-subtle border-y border-border-subtle">
        <Row label="Crawling on" value={BACKEND_LABEL[s.mode]} />
        <Row
          label="Cloud credits today"
          value={`${formatCount(credits.cloudUsedToday)} / ${formatCount(credits.cap)}`}
        />
        <Row label="Self-hosted standby calls" value={formatCount(credits.selfHostedUsedToday)} />
        <Row label="Your sources today" value={formatCount(credits.userUsedToday)} />
      </dl>
      <p className="text-small text-fg-secondary">
        {s.mode === 'selfhosted'
          ? 'The cloud budget ran low, so crawls run on Beacon’s self-hosted standby. It starts on demand and stops when idle, and it uses no cloud credits.'
          : s.mode === 'paused'
            ? 'Today’s crawl budget is used up. Your sources refresh after 00:00 IST; shared packs keep updating.'
            : 'Crawls run on Firecrawl cloud. If the budget runs low, a self-hosted standby takes over automatically.'}
      </p>
      <p className="text-caption text-fg-tertiary">
        The budget is shared by everyone on Beacon, which keeps it free. Job-board links never use
        it.
      </p>
    </div>
  );
}
