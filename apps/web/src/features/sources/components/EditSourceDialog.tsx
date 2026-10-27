import { OPPORTUNITY_TYPE_LABELS, OPPORTUNITY_TYPES, type OpportunityType, type RefreshInterval } from '@kestrel/shared';
import { useId, useState } from 'react';
import { toast } from 'sonner';

import { displayUrl, INTERVAL_OPTIONS, type SourceTableRow } from '../lib/rows';

import { useUpdateSource } from '@/api/sources';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { errorMessage } from '@/lib/api';

const ANY = 'any';

/** Rename, retag or change the refresh interval of a personal source. URLs are fixed: replace instead. */
export function EditSourceDialog({
  row,
  onOpenChange,
  onReplaceUrl,
}: {
  row: SourceTableRow | null;
  onOpenChange: (open: boolean) => void;
  onReplaceUrl: (row: SourceTableRow) => void;
}) {
  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {row ? <EditForm key={row.id} row={row} onClose={() => onOpenChange(false)} onReplaceUrl={onReplaceUrl} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({ row, onClose, onReplaceUrl }: { row: SourceTableRow; onClose: () => void; onReplaceUrl: (row: SourceTableRow) => void }) {
  const id = useId();
  const update = useUpdateSource();
  const [name, setName] = useState(row.name);
  const [typeTag, setTypeTag] = useState<string>(row.typeTag ?? ANY);
  const [interval, setIntervalValue] = useState<RefreshInterval>(row.refreshInterval);
  const trimmed = name.trim();
  const invalid = trimmed.length === 0 || trimmed.length > 160;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (invalid) return;
        update.mutate(
          { id: row.id, patch: { name: trimmed, typeTag: typeTag === ANY ? null : (typeTag as OpportunityType), refreshInterval: interval } },
          { onError: (error) => toast.error(`Couldn't save. ${errorMessage(error)}`, { duration: 8000 }) },
        );
        toast.success('Saved.');
        onClose();
      }}
    >
      <DialogHeader>
        <DialogTitle>Edit source</DialogTitle>
        <DialogDescription className="font-mono text-mono-sm">{displayUrl(row.url)}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          id={`${id}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-err` : undefined}
        />
        {invalid ? (
          <p id={`${id}-err`} className="text-small text-danger">
            Use 1–160 characters.
          </p>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-tag`}>Tag as</Label>
          <Select value={typeTag} onValueChange={setTypeTag}>
            <SelectTrigger id={`${id}-tag`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Detect from each listing</SelectItem>
              {OPPORTUNITY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {OPPORTUNITY_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-interval`}>Refresh</Label>
          <Select value={interval} onValueChange={(v) => setIntervalValue(v as RefreshInterval)}>
            <SelectTrigger id={`${id}-interval`} className="w-full">
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
        </div>
      </div>
      <p className="text-small text-fg-secondary">
        To watch a different address, replace the URL: Beacon adds the new page and you can delete this one.{' '}
        <button type="button" className="text-accent-strong underline-offset-3 hover:underline focus-visible:focus-ring" onClick={() => onReplaceUrl(row)}>
          Replace URL
        </button>
      </p>
      <DialogFooter className="gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={invalid}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
