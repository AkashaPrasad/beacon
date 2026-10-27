import { FileText, Plus, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useId, useState } from 'react';

import type { TrackerItemDTO } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { springs, variants } from '@kestrel/ui';

import { Field } from './ContactsSection';
import { normaliseHttpUrl } from '../../lib/validate';

type Doc = TrackerItemDTO['documents'][number];
type DocKind = Doc['kind'];

const KIND_LABELS: Record<DocKind, string> = {
  resume: 'Resume',
  cover_letter: 'Cover letter',
  portfolio: 'Portfolio',
  other: 'Other',
};

/** Document links (the resume version you sent, a cover letter, a portfolio). Links only, no uploads. */
export function DocumentsSection({
  documents,
  onChange,
}: {
  documents: readonly Doc[];
  onChange: (next: Doc[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <section aria-labelledby="tracker-documents" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 id="tracker-documents" className="text-label text-fg-tertiary uppercase">
          Documents
        </h3>
        {!adding ? (
          <Button variant="ghost" size="xs" onClick={() => setAdding(true)}>
            <Plus strokeWidth={1.5} /> Add link
          </Button>
        ) : null}
      </div>
      {documents.length === 0 && !adding ? (
        <p className="text-small text-fg-tertiary">Link the resume version you sent, so you know what they saw.</p>
      ) : null}
      <m.ul layout className="flex flex-col gap-1" transition={{ layout: springs.gentle }}>
        <AnimatePresence mode="popLayout" initial={false}>
          {documents.map((d, i) => (
            <m.li
              key={`${d.url}-${i}`}
              layout
              variants={variants.row}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="group/doc flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-hover"
            >
              <FileText className="size-4 shrink-0 text-fg-tertiary" strokeWidth={1.5} aria-hidden="true" />
              <a
                href={d.url}
                target="_blank"
                rel="noreferrer noopener"
                className="min-w-0 flex-1 truncate text-small text-accent-strong hover:underline focus-visible:focus-ring"
              >
                {d.name}
              </a>
              <span className="text-caption text-fg-tertiary">{KIND_LABELS[d.kind]}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${d.name}`}
                className="opacity-100 [@media(hover:hover)]:opacity-0 group-hover/doc:opacity-100 focus-visible:opacity-100"
                onClick={() => onChange(documents.filter((_, j) => j !== i))}
              >
                <X strokeWidth={1.5} />
              </Button>
            </m.li>
          ))}
        </AnimatePresence>
      </m.ul>
      {adding ? (
        <DocumentForm
          onCancel={() => setAdding(false)}
          onAdd={(doc) => {
            onChange([...documents, doc]);
            setAdding(false);
          }}
        />
      ) : null}
    </section>
  );
}

function DocumentForm({ onAdd, onCancel }: { onAdd: (d: Doc) => void; onCancel: () => void }) {
  const id = useId();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<DocKind>('resume');
  const [errors, setErrors] = useState<{ name?: string; url?: string }>({});
  const submit = () => {
    const link = normaliseHttpUrl(url);
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Add a name, like “Resume v4”.';
    if (!link) next.url = 'Paste a link (Google Drive, Notion, GitHub…).';
    setErrors(next);
    if (Object.keys(next).length || !link) {
      document.getElementById(`${id}-${Object.keys(next)[0] ?? 'url'}`)?.focus();
      return;
    }
    onAdd({ name: name.trim(), url: link, kind, addedAt: new Date() });
  };
  return (
    <m.form
      variants={variants.fade}
      initial="hidden"
      animate="visible"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="grid gap-2 rounded-md border border-border bg-surface-raised p-3 sm:grid-cols-[1fr_1fr_auto]"
    >
      <Field id={`${id}-name`} label="Name" value={name} onChange={setName} error={errors.name} autoFocus />
      <Field id={`${id}-url`} label="Link" value={url} onChange={setUrl} error={errors.url} placeholder="drive.google.com/…" />
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-kind`} className="text-small">
          Kind
        </Label>
        <Select value={kind} onValueChange={(v) => setKind(v as DocKind)}>
          <SelectTrigger id={`${id}-kind`} size="sm" className="w-full sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(KIND_LABELS) as DocKind[]).map((k) => (
              <SelectItem key={k} value={k}>
                {KIND_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-2 sm:col-span-3">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="secondary" size="sm">
          Add link
        </Button>
      </div>
    </m.form>
  );
}
