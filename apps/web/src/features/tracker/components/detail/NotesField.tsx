import { CircleAlert, CircleCheck } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { variants } from '@kestrel/ui';

const DEBOUNCE_MS = 700;
const SAVED_VISIBLE_MS = 1500;
export const NOTES_MAX = 20_000;

type Status = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/**
 * Notes with autosave (debounced 700 ms, flushed on blur and when the panel closes). "Saved" fades
 * after 1.5 s like Settings. A change from another tab is adopted while the field is not being edited.
 */
export function NotesField({ notes, onSave }: { notes: string; onSave: (notes: string) => Promise<unknown> }) {
  const id = useId();
  const [value, setValue] = useState(notes);
  const [status, setStatus] = useState<Status>('idle');
  const [server, setServer] = useState(notes);
  if (server !== notes) {
    setServer(notes);
    if (status !== 'pending' && status !== 'saving') setValue(notes);
  }

  const persisted = useRef(notes);
  const current = useRef(notes);
  const saveRef = useRef(onSave);
  useEffect(() => {
    saveRef.current = onSave;
  });
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback((text: string) => {
    if (text === persisted.current) {
      setStatus((s) => (s === 'pending' ? 'idle' : s));
      return;
    }
    setStatus('saving');
    saveRef.current(text).then(
      () => {
        persisted.current = text;
        setStatus((s) => (s === 'saving' ? 'saved' : s));
        if (hide.current) clearTimeout(hide.current);
        hide.current = setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), SAVED_VISIBLE_MS);
      },
      () => setStatus('error'),
    );
  }, []);

  useEffect(() => {
    if (status !== 'pending') return undefined;
    const t = setTimeout(() => save(value), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [status, value, save]);

  // Closing the panel never loses a note.
  useEffect(
    () => () => {
      if (hide.current) clearTimeout(hide.current);
      if (current.current !== persisted.current) void saveRef.current(current.current).catch(() => undefined);
    },
    [],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-label text-fg-tertiary uppercase">
          Notes
        </label>
        <span className="min-h-4 text-caption" aria-live="polite">
          <AnimatePresence mode="popLayout" initial={false}>
            {status === 'saving' ? (
              <m.span key="saving" variants={variants.fade} initial="hidden" animate="visible" exit="exit" className="text-fg-tertiary">
                Saving…
              </m.span>
            ) : status === 'saved' ? (
              <m.span
                key="saved"
                variants={variants.fade}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="inline-flex items-center gap-1 text-success"
              >
                <CircleCheck className="size-3.5" strokeWidth={1.5} aria-hidden="true" /> Saved
              </m.span>
            ) : status === 'error' ? (
              <m.span key="error" variants={variants.fade} initial="hidden" animate="visible" exit="exit" className="inline-flex items-center gap-1 text-danger">
                <CircleAlert className="size-3.5" strokeWidth={1.5} aria-hidden="true" /> Couldn't save.
                <Button variant="link" size="xs" className="h-auto px-0" onClick={() => save(current.current)}>
                  Retry
                </Button>
              </m.span>
            ) : null}
          </AnimatePresence>
        </span>
      </div>
      <Textarea
        id={id}
        data-testid="tracker-card-notes"
        value={value}
        maxLength={NOTES_MAX}
        rows={5}
        placeholder="Recruiter name, referral, what you sent, what to prepare…"
        onChange={(e) => {
          setValue(e.target.value);
          current.current = e.target.value;
          setStatus('pending');
        }}
        onBlur={() => {
          if (status === 'pending') save(current.current);
        }}
        className="min-h-28 resize-y text-body"
      />
    </div>
  );
}
