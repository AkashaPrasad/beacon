import { CompanyLogo } from '@kestrel/ui';

import { formatCount } from '../lib/format';
import { displayHealth, healthReason, type CreditMode } from '../lib/health';
import { PACK_BLURBS } from '../lib/packs';
import { displayUrl } from '../lib/rows';

import { HealthBadge } from './HealthBadge';
import { KindBadge } from './KindBadge';

import type { CommunityRow, PackDTO } from '@/api/sources';
import { ResponsiveDrawer } from '@/components/responsive-drawer';
import { Switch } from '@/components/ui/switch';

/** "What's in this pack" (sheet/drawer): every source with how it's read and its health. */
export function PackDetail({
  pack,
  sources,
  mode,
  onOpenChange,
  onToggle,
}: {
  pack: PackDTO | null;
  sources: readonly CommunityRow[];
  mode: CreditMode | null;
  onOpenChange: (open: boolean) => void;
  onToggle: (pack: PackDTO, enabled: boolean) => void;
}) {
  const inPack = pack
    ? sources.filter((s) => s.packId === pack.id).sort((a, b) => b.listingsFound - a.listingsFound)
    : [];
  const listings = inPack.reduce((n, s) => n + s.listingsFound, 0);
  return (
    <ResponsiveDrawer
      open={pack !== null}
      onOpenChange={onOpenChange}
      title={pack?.name ?? 'Pack'}
      description={
        pack
          ? `${formatCount(pack.sourceCount)} sources · ${formatCount(listings)} open listings`
          : undefined
      }
      contentKey={pack?.id}
      data-testid="sources-pack-detail"
      actions={
        pack ? (
          <Switch
            checked={pack.enabled}
            onCheckedChange={(v) => onToggle(pack, v)}
            aria-label={`${pack.enabled ? 'Turn off' : 'Turn on'} ${pack.name}`}
            className="mt-1"
          />
        ) : null
      }
    >
      {pack ? (
        <div className="flex flex-col gap-3 px-4 py-3">
          <p className="text-small text-fg-secondary">
            {PACK_BLURBS[pack.id] ?? 'A curated list of sources.'} Packs are refreshed for everyone,
            so they don’t use your crawl budget.
          </p>
          <ul
            className="flex flex-col divide-y divide-border-subtle"
            aria-label={`Sources in ${pack.name}`}
          >
            {inPack.map((s) => {
              const input = {
                health: s.health,
                kind: s.kind,
                enabled: true,
                errorReason: s.errorReason,
                healthCode: s.healthCode,
              };
              const status = displayHealth(input, mode);
              return (
                <li key={s.id} className="flex items-center gap-3 py-2">
                  <CompanyLogo name={s.name} domain={s.companyDomain} size={20} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-body font-medium text-fg">{s.name}</div>
                    <div className="truncate text-caption text-fg-tertiary">
                      {displayUrl(s.url)}
                    </div>
                  </div>
                  <KindBadge kind={s.kind} className="max-sm:hidden" />
                  <HealthBadge status={status} reason={healthReason(input, status)} />
                  <span className="w-10 text-right font-mono text-mono text-fg">
                    {formatCount(s.listingsFound)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </ResponsiveDrawer>
  );
}
