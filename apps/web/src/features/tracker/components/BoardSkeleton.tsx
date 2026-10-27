import { Skeleton, useDelayedTrue } from '@kestrel/ui';

import { COLUMNS } from '../lib/stages';

/** Same geometry as the board (DESIGN §6.1 skeletons), shown only after 150 ms. */
export function BoardSkeleton() {
  const visible = useDelayedTrue(150);
  return (
    <div aria-busy="true" aria-label="Loading tracker" className="flex gap-3 overflow-hidden px-gutter pt-1 pb-4">
      {COLUMNS.map((c, i) => (
        <div
          key={c.key}
          className="flex h-96 w-[min(85vw,20rem)] shrink-0 flex-col gap-2 rounded-lg bg-surface-sunken p-2 transition-opacity duration-fade md:w-68"
          style={{ opacity: visible ? 1 : 0 }}
        >
          <Skeleton className="m-1 h-4 w-24" />
          {Array.from({ length: Math.max(1, 3 - (i % 3)) }, (_, j) => (
            <div key={j} className="flex flex-col gap-2 rounded-md border border-border bg-surface-raised p-card">
              <div className="flex items-center gap-2">
                <Skeleton className="size-5 rounded-sm" />
                <Skeleton className="h-3.5 w-3/5" />
              </div>
              <Skeleton className="ml-7 h-3 w-2/5" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
