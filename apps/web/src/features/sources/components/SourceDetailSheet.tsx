import { Columns3, Pencil, RefreshCw, SquareArrowOutUpRight, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { ResponsiveDrawer } from '@/components/responsive-drawer';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { RefreshInterval } from '@kestrel/shared';
import { CompanyLogo, TypeBadge, useNow } from '@kestrel/ui';

import { HealthBadge } from './HealthBadge';
import { KindBadge } from './KindBadge';
import type { SourcesTableActions } from './SourcesTable';
import { formatAbsolute, formatCount, formatRelative } from '../lib/format';
import { displayUrl, INTERVAL_LABELS, INTERVAL_OPTIONS, type SourceTableRow } from '../lib/rows';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 py-1.5">
      <dt className="text-small text-fg-secondary">{label}</dt>
      <dd className="flex min-w-0 items-center justify-end text-right">{children}</dd>
    </div>
  );
}

/**
 * Phone detail sheet for a source row (DESIGN §10.5 mobile: "tap opening a detail sheet"). Everything
 * the desktop table shows inline, plus the row menu actions as full-width buttons.
 */
export function SourceDetailSheet({
  row,
  actions,
  onOpenChange,
}: {
  row: SourceTableRow | null;
  actions: SourcesTableActions;
  onOpenChange: (open: boolean) => void;
}) {
  const now = useNow(30_000);
  const close = () => onOpenChange(false);
  return (
    <ResponsiveDrawer
      open={row !== null}
      onOpenChange={onOpenChange}
      title={row?.name ?? 'Source'}
      description={row ? displayUrl(row.url) : undefined}
      leading={row ? <CompanyLogo name={row.name} domain={row.domain} size={40} /> : undefined}
      contentKey={row?.id}
      handleLabel="Close source details"
      data-testid="sources-detail"
    >
      {row ? (
        <div className="flex flex-col gap-4 px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-col gap-1 rounded-md bg-surface-sunken px-3 py-2">
            <HealthBadge status={row.status} reason={row.reason} interactive={false} />
            <p className="text-small text-fg-secondary">{row.reason}</p>
          </div>

          <dl className="flex flex-col divide-y divide-border-subtle">
            <Field label="Read as">
              <KindBadge kind={row.kind} />
            </Field>
            <Field label="Scope">
              <span className="truncate text-small text-fg">
                {row.scope === 'personal' ? 'Personal' : (row.packName ?? 'Pack')}
              </span>
            </Field>
            <Field label="Types">
              {row.typeTag ? (
                <TypeBadge type={row.typeTag} />
              ) : (
                <span className="text-small text-fg-tertiary">Any</span>
              )}
            </Field>
            <Field label="Refresh">
              {row.editable ? (
                <Select
                  value={row.refreshInterval}
                  onValueChange={(v) => actions.onInterval(row, v as RefreshInterval)}
                >
                  <SelectTrigger aria-label={`Refresh interval for ${row.name}`} className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVAL_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="font-mono text-mono text-fg">
                  {INTERVAL_LABELS[row.refreshInterval]}
                </span>
              )}
            </Field>
            <Field label="Last check">
              <span
                className="font-mono text-mono text-fg"
                title={row.lastCheckedAt ? formatAbsolute(row.lastCheckedAt) : undefined}
              >
                {row.lastCheckedAt
                  ? formatRelative(row.lastCheckedAt, now)
                  : row.status === 'pending'
                    ? 'Checking…'
                    : 'Never'}
              </span>
            </Field>
            <Field label="Listings found">
              <span className="font-mono text-mono text-fg">{formatCount(row.listingsFound)}</span>
            </Field>
            {row.editable ? (
              <Field label="Watching">
                <Switch
                  checked={row.enabled}
                  onCheckedChange={(v) => actions.onToggle(row, v)}
                  aria-label={`${row.enabled ? 'Pause' : 'Resume'} ${row.name}`}
                />
              </Field>
            ) : null}
          </dl>

          <div className="grid grid-cols-2 gap-2">
            {row.editable ? (
              <>
                <Button size="lg" variant="secondary" onClick={() => actions.onRefresh(row)}>
                  <RefreshCw strokeWidth={1.5} /> Refresh now
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={() => {
                    close();
                    actions.onEdit(row);
                  }}
                >
                  <Pencil strokeWidth={1.5} /> Edit
                </Button>
              </>
            ) : (
              <Button
                size="lg"
                variant="secondary"
                className="col-span-2"
                onClick={() => {
                  close();
                  if (row.packId) actions.onManagePack(row.packId);
                }}
              >
                <Columns3 strokeWidth={1.5} /> Show pack
              </Button>
            )}
            <Button size="lg" variant="ghost" asChild className="col-span-2">
              <a href={row.url} target="_blank" rel="noreferrer noopener">
                <SquareArrowOutUpRight strokeWidth={1.5} /> Open page
              </a>
            </Button>
            {row.editable ? (
              <Button
                size="lg"
                variant="ghost"
                className="col-span-2 text-danger hover:text-danger"
                onClick={() => {
                  close();
                  actions.onDelete(row);
                }}
              >
                <Trash2 strokeWidth={1.5} /> Delete source
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </ResponsiveDrawer>
  );
}
