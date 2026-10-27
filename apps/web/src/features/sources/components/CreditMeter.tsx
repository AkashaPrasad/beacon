import { springs } from '@kestrel/ui';
import { Info, KeyRound, Server } from 'lucide-react';
import { m } from 'motion/react';
import { Link } from 'react-router';

import { formatCount } from '../lib/format';
import { meterState, type Credits } from '../lib/health';

import { CountUp } from './common/CountUp';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const BAR_TONE = { normal: 'bg-fg-secondary', warning: 'bg-warning', danger: 'bg-danger' } as const;

/**
 * Crawl credit meter (DESIGN §6.1 / §10.5): "312 / 500 credits today" in mono with a 4 px bar
 * (`fg-secondary`, `warning` ≥ 80 %, `danger` at 100 %), the active backend, and a details popover.
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
      <div
        className={cn('flex h-control items-center gap-2 text-small text-fg-tertiary', className)}
        aria-busy={loading}
      >
        <span>Crawl credits today</span>
        <span className="font-mono">— / —</span>
      </div>
    );
  }
  const s = meterState(credits);
  return (
    <div
      data-testid="sources-credit-meter"
      data-mode={s.mode}
      className={cn('flex items-center gap-2', className)}
    >
      <div
        data-testid="credit-meter"
        role="meter"
        aria-label="Crawl credits used today"
        aria-valuemin={0}
        aria-valuemax={credits.cap}
        aria-valuenow={Math.min(credits.cloudUsedToday, credits.cap)}
        aria-valuetext={s.description}
        className="flex min-w-0 flex-col gap-1"
      >
        <div className="flex items-baseline gap-2 whitespace-nowrap">
          <span className="hidden text-caption text-fg-tertiary sm:inline">
            Crawl credits today
          </span>
          <span className="font-mono text-mono text-fg">
            <CountUp value={credits.cloudUsedToday} onceId="credit-meter" /> /{' '}
            {formatCount(credits.cap)}
          </span>
          <span className="text-caption text-fg-tertiary sm:hidden">credits today</span>
        </div>
        <div className="h-1 w-full min-w-24 overflow-hidden rounded-full bg-surface-sunken">
          <m.div
            className={cn('h-full w-full origin-left rounded-full', BAR_TONE[s.tone])}
            initial={false}
            animate={{ scaleX: s.ratio }}
            transition={springs.data}
          />
        </div>
      </div>
      <BackendBadge mode={s.mode} />
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="About crawl credits">
            <Info strokeWidth={1.5} />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <CreditDetails credits={credits} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function BackendBadge({ mode }: { mode: 'cloud' | 'selfhosted' | 'paused' }) {
  if (mode === 'selfhosted') {
    return (
      <span className="inline-flex h-5 items-center gap-1 rounded-xs bg-info-subtle px-1.5 text-caption font-medium whitespace-nowrap text-info">
        <Server className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
        Self-hosted standby (active)
      </span>
    );
  }
  if (mode === 'paused') {
    return (
      <span className="inline-flex h-5 items-center rounded-xs bg-warning-subtle px-1.5 text-caption font-medium whitespace-nowrap text-warning">
        Paused
      </span>
    );
  }
  return (
    <span className="inline-flex h-5 items-center rounded-xs bg-surface-sunken px-1.5 text-caption font-medium text-fg-secondary">
      Cloud
    </span>
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
      <Link
        to="/settings/ai"
        className="inline-flex items-center gap-1.5 text-small text-accent-strong underline-offset-3 hover:underline focus-visible:focus-ring"
      >
        <KeyRound className="size-4" strokeWidth={1.5} aria-hidden="true" />
        Use my own Firecrawl key
      </Link>
    </div>
  );
}
