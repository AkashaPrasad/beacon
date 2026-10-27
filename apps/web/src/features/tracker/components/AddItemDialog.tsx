import { useId, useState } from 'react';

import type { TrackerCreateBody } from '@/api/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fromDateInputValue } from '@/features/sources/lib/format';
import { cn } from '@/lib/utils';
import {
  OPPORTUNITY_TYPE_LABELS,
  OPPORTUNITY_TYPES,
  TRACKER_STAGES,
  type OpportunityType,
  type TrackerStage,
} from '@kestrel/shared';

import { Field } from './detail/ContactsSection';
import { STAGE_LABEL } from '../lib/stages';
import { FULL_SCREEN_ON_PHONE } from '../lib/ui';
import { normaliseHttpUrl } from '../lib/validate';

const NONE = 'none';

/** Add an application by hand (one you found outside Beacon). Title and company are enough. */
export function AddItemDialog({
  stage,
  onOpenChange,
  onCreate,
}: {
  /** Open with this stage preselected; null = closed. */
  stage: TrackerStage | null;
  onOpenChange: (open: boolean) => void;
  onCreate: (body: Extract<TrackerCreateBody, { manual: unknown }>) => void;
}) {
  return (
    <Dialog open={stage !== null} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="tracker-add-dialog"
        className={cn('flex max-h-[min(44rem,calc(100dvh-2rem))] flex-col gap-4 overflow-y-auto sm:max-w-lg', FULL_SCREEN_ON_PHONE)}
      >
        {stage ? (
          <AddForm
            key={stage}
            initialStage={stage}
            onCancel={() => onOpenChange(false)}
            onCreate={(body) => {
              onCreate(body);
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AddForm({
  initialStage,
  onCancel,
  onCreate,
}: {
  initialStage: TrackerStage;
  onCancel: () => void;
  onCreate: (body: Extract<TrackerCreateBody, { manual: unknown }>) => void;
}) {
  const id = useId();
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [url, setUrl] = useState('');
  const [type, setType] = useState<string>(NONE);
  const [stage, setStage] = useState<TrackerStage>(initialStage);
  const [deadline, setDeadline] = useState('');
  const [errors, setErrors] = useState<{ title?: string; company?: string; url?: string }>({});

  const submit = () => {
    const next: typeof errors = {};
    if (!title.trim()) next.title = 'Add the role, like “Backend Intern”.';
    if (!company.trim()) next.company = 'Add the company or organiser.';
    const link = url.trim() ? normaliseHttpUrl(url) : null;
    if (url.trim() && !link) next.url = 'That link doesn’t look right.';
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) {
      document.getElementById(`${id}-${first}`)?.focus();
      return;
    }
    const deadlineAt = deadline ? fromDateInputValue(deadline) : null;
    onCreate({
      manual: {
        title: title.trim(),
        company: company.trim(),
        ...(link ? { url: link } : {}),
        ...(type !== NONE ? { type: type as OpportunityType } : {}),
        ...(deadlineAt ? { deadlineAt } : {}),
      },
      stage,
    });
  };

  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Add to tracker</DialogTitle>
        <DialogDescription>For applications you found outside Beacon. Only the role and company are needed.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${id}-title`} label="Role" value={title} onChange={setTitle} error={errors.title} autoFocus />
        <Field id={`${id}-company`} label="Company" value={company} onChange={setCompany} error={errors.company} />
        <div className="sm:col-span-2">
          <Field id={`${id}-url`} label="Link (optional)" value={url} onChange={setUrl} error={errors.url} placeholder="jobs.example.com/backend-intern" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-stage`} className="text-small">
            Stage
          </Label>
          <Select value={stage} onValueChange={(v) => setStage(v as TrackerStage)}>
            <SelectTrigger id={`${id}-stage`} size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRACKER_STAGES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STAGE_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-type`} className="text-small">
            Type (optional)
          </Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger id={`${id}-type`} size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not set</SelectItem>
              {OPPORTUNITY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {OPPORTUNITY_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Field id={`${id}-deadline`} label="Deadline (optional)" value={deadline} onChange={setDeadline} type="date" />
      </div>
      <DialogFooter className="mt-auto gap-2 sm:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" data-testid="tracker-add-submit">
          Add to {STAGE_LABEL[stage]}
        </Button>
      </DialogFooter>
    </form>
  );
}
