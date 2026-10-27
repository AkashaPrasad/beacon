import { ChevronRight } from 'lucide-react';
import { m } from 'motion/react';
import { Link } from 'react-router';

import type { CommunityRow, PackDTO } from '@/api/sources';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { CompanyLogo, hoverLift, springs, stagger } from '@kestrel/ui';

import { CountUp } from './common/CountUp';
import { formatCount } from '../lib/format';
import { PACK_BLURBS } from '../lib/packs';
import { packPath } from '../lib/paths';
import { packSummaries } from '../lib/rows';

/**
 * Packs tab (DESIGN §10.5): one calm card per pack: name, one line about it, its switch, a few logos
 * and two numbers. The full contents, kinds and health live on the pack's own page.
 */
export function PacksGrid({
  packs,
  community,
  onToggle,
}: {
  packs: readonly PackDTO[];
  community: readonly CommunityRow[];
  onToggle: (pack: PackDTO, enabled: boolean) => void;
}) {
  const summaries = packSummaries(community);
  return (
    <ul
      className="grid gap-3 px-gutter pb-8 sm:grid-cols-2 xl:grid-cols-3"
      aria-label="Source packs"
    >
      {packs.map((pack) => (
        <li key={pack.id}>
          <PackCard
            pack={pack}
            summary={summaries.get(pack.id)}
            onToggle={(v) => onToggle(pack, v)}
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
}: {
  pack: PackDTO;
  summary: { listings: number; domains: string[]; failing: number } | undefined;
  onToggle: (enabled: boolean) => void;
}) {
  const titleId = `pack-${pack.id}-title`;
  const domains = summary?.domains ?? [];
  return (
    <m.section
      aria-labelledby={titleId}
      data-testid={`sources-pack-${pack.id}`}
      data-enabled={pack.enabled}
      {...hoverLift}
      className={cn(
        'group relative flex h-full flex-col gap-4 rounded-md border bg-surface-raised p-4',
        'after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:opacity-0 after:shadow-md after:transition-opacity after:duration-fade hover:after:opacity-100',
        pack.enabled ? 'border-border-strong' : 'border-border',
      )}
    >
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="text-h3 text-fg">
            {pack.name}
          </h3>
          <p className="mt-0.5 text-small text-fg-secondary">
            {PACK_BLURBS[pack.id] ?? 'A curated list of sources, refreshed for everyone.'}
          </p>
        </div>
        <Switch
          checked={pack.enabled}
          onCheckedChange={onToggle}
          aria-label={`${pack.enabled ? 'Turn off' : 'Turn on'} ${pack.name}`}
        />
      </header>

      <div className="flex items-center gap-3">
        <div className="flex -space-x-1.5" aria-hidden="true">
          {domains.slice(0, 5).map((d, i) => (
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
        <p className="text-small text-fg-secondary">
          <span className="font-mono text-mono text-fg">{formatCount(pack.sourceCount)}</span>{' '}
          sources ·{' '}
          <span className="font-mono text-mono text-fg">
            <CountUp value={summary?.listings ?? 0} />
          </span>{' '}
          open listings
        </p>
      </div>

      <Link
        to={packPath(pack.id)}
        className="mt-auto -ml-1 inline-flex w-fit items-center gap-1 rounded-sm px-1 py-0.5 text-small font-medium text-accent-strong underline-offset-3 hover:underline focus-visible:focus-ring"
      >
        What’s in this pack<span className="sr-only">: {pack.name}</span>
        <ChevronRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
      </Link>
    </m.section>
  );
}
