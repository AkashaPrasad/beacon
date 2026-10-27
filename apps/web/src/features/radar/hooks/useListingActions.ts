/**
 * The four row actions (DESIGN §6.2 RadarRow): Save `s`, Hide `h`, Track `a`, Apply `⌘↵`.
 * Each is optimistic (the hooks patch the cache first) and announces itself with an undo toast
 * (`withUndo`, DESIGN §8 rule 6). Used by the feed, the drawer, the board and the timeline.
 */
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { shortTitle } from '../lib/format';

import { PENDING_TRACKER_ID, useHideListing, useSaveListing, useTrackListing } from '@/api/listings';
import { withUndo } from '@/lib/undo';

export interface ActionListing {
  id: string;
  title: string;
  applyUrl: string;
  saved: boolean;
  trackerItemId: string | null;
}

const ignore = () => undefined;

export function useListingActions() {
  const save = useSaveListing();
  const hide = useHideListing();
  const track = useTrackListing();
  const navigate = useNavigate();

  return {
    toggleSave(listing: ActionListing) {
      const next = !listing.saved;
      withUndo({
        message: next ? `Saved “${shortTitle(listing.title)}”.` : `Removed “${shortTitle(listing.title)}” from saved.`,
        run: () => save.mutateAsync({ id: listing.id, saved: next }),
        undo: () => save.mutateAsync({ id: listing.id, saved: !next }),
      }).promise.catch(ignore);
    },

    hide(listing: Pick<ActionListing, 'id' | 'title'>) {
      withUndo({
        message: `Hidden “${shortTitle(listing.title)}”.`,
        run: () => hide.mutateAsync({ id: listing.id, hidden: true }),
        undo: () => hide.mutateAsync({ id: listing.id, hidden: false }),
      }).promise.catch(ignore);
    },

    track(listing: Pick<ActionListing, 'id' | 'title' | 'trackerItemId'>) {
      if (listing.trackerItemId && listing.trackerItemId !== PENDING_TRACKER_ID) {
        toast('Already in your tracker.', {
          action: { label: 'Open tracker', onClick: () => void navigate('/tracker') },
        });
        return;
      }
      if (listing.trackerItemId === PENDING_TRACKER_ID) return;
      withUndo({
        message: `Added “${shortTitle(listing.title)}” to Tracker.`,
        run: () => track.mutateAsync({ listingId: listing.id }),
        undo: (itemId) =>
          itemId ? track.mutateAsync({ listingId: listing.id, untrackItemId: itemId }) : undefined,
      }).promise.catch(ignore);
    },

    /** External apply link in a new tab, never leaking `window.opener`. */
    apply(listing: Pick<ActionListing, 'applyUrl'>) {
      const win = window.open(listing.applyUrl, '_blank', 'noopener,noreferrer');
      if (win) win.opener = null;
    },
  };
}

export type ListingActions = ReturnType<typeof useListingActions>;
