import type { TrackerItemDTO } from '@/api/types';
import { formatAbsolute, formatShortDate } from '@/features/sources/lib/format';

import { STAGE_ICONS, historyLabel } from '../../lib/stages';

/** Status history, newest first ("Moved to Interview · Tue 28 Oct"). Ghosted events stay in history. */
export function StageTimeline({ item, timeZone }: { item: TrackerItemDTO; timeZone: string }) {
  const entries = item.history.map((h, i) => ({ ...h, label: historyLabel(h.stage, i === 0), key: `${h.stage}-${String(h.at)}-${i}` })).reverse();
  return (
    <section aria-labelledby="tracker-timeline" className="flex flex-col gap-2">
      <h3 id="tracker-timeline" className="text-label text-fg-tertiary uppercase">
        Timeline
      </h3>
      <ol className="flex flex-col">
        {entries.map((e, i) => {
          const Icon = STAGE_ICONS[e.stage];
          return (
            <li key={e.key} className="relative flex gap-3 pb-3 last:pb-0">
              {i < entries.length - 1 ? (
                <span aria-hidden="true" className="absolute top-6 bottom-0 left-3 w-px bg-border-subtle" />
              ) : null}
              <span className="grid size-6 shrink-0 place-items-center rounded-full border border-border-subtle bg-surface-raised">
                <Icon className="size-3.5 text-fg-secondary" strokeWidth={1.5} aria-hidden="true" />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-small text-fg">{e.label}</p>
                <time
                  dateTime={new Date(e.at).toISOString()}
                  title={formatAbsolute(e.at, timeZone)}
                  className="font-mono text-mono-sm text-fg-tertiary"
                >
                  {formatShortDate(e.at, timeZone)}
                </time>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
