import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Confirm before deleting a source (UX v2 D19: only the irreversible confirms). Its check history
 * goes with it; listings it already found stay in the tracker. A tiny task, so a dialog.
 */
export function DeleteSourceDialog({
  source,
  onOpenChange,
  onConfirm,
}: {
  source: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={source !== null} onOpenChange={onOpenChange}>
      <DialogContent data-testid="source-delete-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {source?.name ?? 'this source'}?</DialogTitle>
          <DialogDescription>
            Beacon stops watching this page and forgets its check history. Listings it already found
            stay in your tracker. To stop for a while instead, pause it.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            data-testid="source-delete-confirm"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            <Trash2 strokeWidth={1.5} /> Delete source
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
