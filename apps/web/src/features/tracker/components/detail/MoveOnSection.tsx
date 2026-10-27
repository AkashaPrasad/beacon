import { ArrowUpRight, Plus } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { CompanyLogo, FitRing } from '@kestrel/ui';

import { useListingSimilar } from '../../lib/use-listing-similar';

/** Move on (USERFLOW §4.3): high-fit listings still open elsewhere, each one tap from Saved. */
export function MoveOnSection({
  listingId,
  onTrack,
}: {
  listingId: string | null;
  onTrack: (listingId: string, title: string) => void;
}) {
  const similar = useListingSimilar(listingId, true);
  const list = similar.data ?? [];
  if (!listingId || list.length === 0) return null;
  return (
    <section aria-labelledby="tracker-move-on" className="flex flex-col gap-2">
      <h3 id="tracker-move-on" className="text-label text-fg-tertiary uppercase">
        Still open and similar <span className="font-mono">{list.length}</span>
      </h3>
      <ul className="flex flex-col divide-y divide-border-subtle rounded-md border border-border">
        {list.map(({ listing, score }) => (
          <li key={listing.id} className="flex items-center gap-2 px-3 py-2">
            <CompanyLogo name={listing.company} size={20} />
            <div className="min-w-0 flex-1">
              <Link
                to={`/radar/${encodeURIComponent(listing.id)}`}
                className="block truncate text-small font-medium text-fg hover:underline focus-visible:focus-ring"
              >
                {listing.title}
              </Link>
              <p className="truncate text-caption text-fg-secondary">{listing.company}</p>
            </div>
            {score != null ? <FitRing score={score} size={24} /> : null}
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Track ${listing.title}`}
              onClick={() => onTrack(listing.id, listing.title)}
            >
              <Plus strokeWidth={1.5} />
            </Button>
          </li>
        ))}
      </ul>
      <Link
        to="/radar"
        className="inline-flex w-fit items-center gap-1 text-small text-accent-strong underline-offset-3 hover:underline focus-visible:focus-ring"
      >
        More on your radar <ArrowUpRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
      </Link>
    </section>
  );
}
