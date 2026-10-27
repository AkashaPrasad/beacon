import { Check, Copy } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { TrackerItemDTO } from '@/api/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { springs, tweens } from '@kestrel/ui';

import { buildFollowUpTemplate } from '../lib/template';
import { FULL_SCREEN_ON_PHONE } from '../lib/ui';

/**
 * Follow-up template (USERFLOW §4.2): prefilled with the role, company, applied date and a contact,
 * editable, copied to the clipboard. Beacon never sends email; the student sends it themselves.
 */
export function FollowUpTemplateDialog({
  item,
  userName,
  onOpenChange,
  onFollowedUp,
}: {
  item: TrackerItemDTO | null;
  userName: string | null;
  onOpenChange: (open: boolean) => void;
  onFollowedUp: (item: TrackerItemDTO) => void;
}) {
  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="tracker-template"
        className={cn('flex max-h-[min(44rem,calc(100dvh-2rem))] flex-col gap-4 overflow-y-auto sm:max-w-xl', FULL_SCREEN_ON_PHONE)}
      >
        {item ? (
          <TemplateForm
            key={item.id}
            item={item}
            userName={userName}
            onDone={() => onOpenChange(false)}
            onFollowedUp={() => {
              onFollowedUp(item);
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TemplateForm({
  item,
  userName,
  onDone,
  onFollowedUp,
}: {
  item: TrackerItemDTO;
  userName: string | null;
  onDone: () => void;
  onFollowedUp: () => void;
}) {
  const id = useId();
  const template = useMemo(
    () =>
      buildFollowUpTemplate({
        title: item.title,
        company: item.company,
        appliedAt: item.appliedAt,
        name: userName,
        contactName: item.contacts[0]?.name ?? null,
      }),
    [item, userName],
  );
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = async () => {
    const text = `Subject: ${subject}\n\n${body}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard blocked (insecure context, permissions): select the text so ⌘C / Ctrl C works.
      bodyRef.current?.select();
      toast('Selected. Press ⌘C or Ctrl C to copy.');
      return;
    }
    setCopied(true);
    toast.success('Copied.');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Follow up with {item.company}</DialogTitle>
        <DialogDescription>
          Edit it so it sounds like you, copy it, and send it from your own email. Beacon never sends email.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-subject`}>Subject</Label>
        <Input id={`${id}-subject`} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <Label htmlFor={`${id}-body`}>Message</Label>
        <Textarea
          id={`${id}-body`}
          ref={bodyRef}
          data-testid="tracker-template-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={9}
          className="min-h-48 flex-1 font-sans text-body"
        />
      </div>
      <DialogFooter className="mt-auto gap-2 sm:justify-between">
        <Button variant="ghost" onClick={onFollowedUp}>
          I followed up
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onDone}>
            Close
          </Button>
          <Button variant="primary" onClick={() => void copy()} data-testid="tracker-template-copy">
            <span className="relative inline-flex size-4 items-center justify-center">
              <AnimatePresence mode="popLayout" initial={false}>
                <m.span
                  key={copied ? 'done' : 'copy'}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1, transition: springs.snappy }}
                  exit={{ opacity: 0, transition: tweens.exit }}
                  className="inline-flex"
                >
                  {copied ? <Check strokeWidth={1.5} /> : <Copy strokeWidth={1.5} />}
                </m.span>
              </AnimatePresence>
            </span>
            {copied ? 'Copied' : 'Copy template'}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
