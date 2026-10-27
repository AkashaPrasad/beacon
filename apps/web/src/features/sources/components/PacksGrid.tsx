import { CompanyLogo, hoverLift, press, springs, stagger } from '@kestrel/ui';
import { ChevronRight, CircleCheck } from 'lucide-react';
import { m } from 'motion/react';

import { formatCount } from '../lib/format';
import { PACK_BLURBS } from '../lib/packs';
import { KIND_LABELS, packSummaries } from '../lib/rows';

import { CountUp } from './common/CountUp';

import type { CommunityRow, PackDTO } from '@/api/sources';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';


/** Packs tab (DESIGN §10.5): one card per pack with its switch, logos, counts and a details sheet. */
export function PacksGrid({
  packs,
  community,
  onToggle,
  onOpen,
}: {
  packs: readonly PackDTO[];
  community: readonly CommunityRow[];
  onToggle: (pack: PackDTO, enabled: boolean) => void;
  onOpen: (pack: PackDTO) => void;
}) {
  const summaries = packSummaries(community);
  return (
    <ul className="grid gap-3 px-gutter pb-8 sm:grid-cols-2 xl:grid-cols-3" aria-label="Source packs">
      {packs.map((pack) => (
        <li key={pack.id}>
          <PackCard
            pack={pack}
            summary={summaries.get(pack.id)}
            onToggle={(v) => onToggle(pack, v)}
            onOpen={() => onOpen(pack)}
          />
        </li>
      ))}
    </ul>
  );
}

function PackCard({
  pack,
  summary,
  onToggle,
  onOpen,
}: {
  pack: PackDTO;
  summary: { listings: number; domains: string[]; failing: number } | undefined;
  onToggle: (enabled: boolean) => void;
  onOpen: () => void;
}) {
  const titleId = `pack-${pack.id}-title`;
  const kinds = Object.entries(pack.kinds)
    .filter(([, n]) => (n ?? 0) > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 3);
  const domains = summary?.domains ?? [];
  return (
    <m.section
      aria-labelledby={titleId}
      data-testid={`sources-pack-${pack.id}`}
      data-enabled={pack.enabled}
      {...hoverLift}
      className={cn(
        'group relative flex h-full flex-col gap-3 rounded-md border bg-surface-raised p-4',
        'after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:opacity-0 after:shadow-md after:transition-opacity after:duration-fade hover:after:opacity-100',
        pack.enabled ? 'border-border-strong' : 'border-border',
      )}
    >
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="text-h3 text-fg">
            {pack.name}
          </h3>
          <p className="mt-0.5 text-small text-fg-secondary">{PACK_BLURBS[pack.id] ?? 'A curated list of sources, refreshed for everyone.'}</p>
        </div>
        <Switch checked={pack.enabled} onCheckedChange={onToggle} aria-label={`${pack.enabled ? 'Turn off' : 'Turn on'} ${pack.name}`} />
      </header>

      <div className="flex items-center gap-3">
        <div className="flex -space-x-1.5" aria-hidden="true">
          {domains.slice(0, 6).map((d, i) => (
            <m.span
              key={d}
              initial={false}
              animate={{ opacity: pack.enabled ? 1 : 0.55 }}
              transition={{ ...springs.gentle, delay: stagger(i) ?? 0 }}
              className="rounded-sm ring-2 ring-surface-raised"
            >
              <CompanyLogo name={d} domain={d} size={20} />
            </m.span>
          ))}
        </div>
        {pack.sourceCount > 6 ? <span className="font-mono text-mono-sm text-fg-tertiary">+{pack.sourceCount - Math.min(6, domains.length)}</span> : null}
      </div>

      <dl className="flex flex-wrap gap-x-4 gap-y-1">
        <div className="flex items-baseline gap-1.5">
          <dt className="sr-only">Sources</dt>
          <dd className="font-mono text-mono text-fg">{formatCount(pack.sourceCount)}</dd>
          <span aria-hidden="true" className="text-small text-fg-secondary">
            sources
          </span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="sr-only">Open listings</dt>
          <dd className="font-mono text-mono text-fg">
            <CountUp value={summary?.listings ?? 0} />
          </dd>
          <span aria-hidden="true" className="text-small text-fg-secondary">
            listings
          </span>
        </div>
      </dl>
      {kinds.length ? (
        <p className="text-caption text-fg-tertiary">
          {kinds.map(([k, n]) => `${KIND_LABELS[k as keyof typeof KIND_LABELS] ?? k} ${n}`).join(' · ')}
          {summary?.failing ? ` · ${summary.failing} failing` : ''}
        </p>
      ) : null}

      <footer className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className={cn('inline-flex items-center gap-1 text-caption', pack.enabled ? 'text-success' : 'text-fg-tertiary')}>
          {pack.enabled ? <CircleCheck className="size-3.5" strokeWidth={1.5} aria-hidden="true" /> : null}
          {pack.enabled ? 'On · refreshed for everyone' : pack.optional ? 'Optional' : 'Off'}
        </span>
        <m.span {...press.button}>
          <Button variant="ghost" size="sm" onClick={onOpen} aria-label={`What's in ${pack.name}`}>
            What’s in this pack <ChevronRight strokeWidth={1.5} />
          </Button>
        </m.span>
      </footer>
    </m.section>
  );
}
