import { AtSign, Link2, Plus, UserRound, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useId, useState } from 'react';

import type { TrackerItemDTO } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { springs, variants } from '@kestrel/ui';

import { isEmail, normaliseHttpUrl } from '../../lib/validate';

type Contact = TrackerItemDTO['contacts'][number];

/** Contacts (recruiter, referrer, interviewer): name required, email and link optional. */
export function ContactsSection({
  contacts,
  onChange,
}: {
  contacts: readonly Contact[];
  onChange: (next: Contact[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <section aria-labelledby="tracker-contacts" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 id="tracker-contacts" className="text-label text-fg-tertiary uppercase">
          Contacts
        </h3>
        {!adding ? (
          <Button variant="ghost" size="xs" onClick={() => setAdding(true)}>
            <Plus strokeWidth={1.5} /> Add contact
          </Button>
        ) : null}
      </div>
      {contacts.length === 0 && !adding ? (
        <p className="text-small text-fg-tertiary">Add the recruiter or the person who referred you.</p>
      ) : null}
      <m.ul layout className="flex flex-col gap-1" transition={{ layout: springs.gentle }}>
        <AnimatePresence mode="popLayout" initial={false}>
          {contacts.map((c, i) => (
            <m.li
              key={`${c.name}-${i}`}
              layout
              variants={variants.row}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="group/contact flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-surface-hover"
            >
              <UserRound className="mt-0.5 size-4 shrink-0 text-fg-tertiary" strokeWidth={1.5} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-small font-medium text-fg">
                  {c.name}
                  {c.role ? <span className="font-normal text-fg-secondary"> · {c.role}</span> : null}
                </p>
                <div className="flex flex-wrap gap-x-3 text-caption">
                  {c.email ? (
                    <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-accent-strong hover:underline focus-visible:focus-ring">
                      <AtSign className="size-3" strokeWidth={1.5} aria-hidden="true" />
                      {c.email}
                    </a>
                  ) : null}
                  {c.url ? (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex max-w-full items-center gap-1 truncate text-accent-strong hover:underline focus-visible:focus-ring"
                    >
                      <Link2 className="size-3" strokeWidth={1.5} aria-hidden="true" />
                      {c.url.replace(/^https?:\/\/(www\.)?/, '')}
                    </a>
                  ) : null}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${c.name}`}
                className="opacity-100 [@media(hover:hover)]:opacity-0 group-hover/contact:opacity-100 focus-visible:opacity-100"
                onClick={() => onChange(contacts.filter((_, j) => j !== i))}
              >
                <X strokeWidth={1.5} />
              </Button>
            </m.li>
          ))}
        </AnimatePresence>
      </m.ul>
      {adding ? (
        <ContactForm
          onCancel={() => setAdding(false)}
          onAdd={(contact) => {
            onChange([...contacts, contact]);
            setAdding(false);
          }}
        />
      ) : null}
    </section>
  );
}

function ContactForm({ onAdd, onCancel }: { onAdd: (c: Contact) => void; onCancel: () => void }) {
  const id = useId();
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [url, setUrl] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string; url?: string }>({});

  const submit = () => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Add a name.';
    if (email.trim() && !isEmail(email)) next.email = 'That email doesn’t look right.';
    const link = url.trim() ? normaliseHttpUrl(url) : null;
    if (url.trim() && !link) next.url = 'Use a web address like linkedin.com/in/…';
    setErrors(next);
    if (Object.keys(next).length) {
      document.getElementById(`${id}-${Object.keys(next)[0] ?? 'name'}`)?.focus();
      return;
    }
    onAdd({
      name: name.trim(),
      role: role.trim() || null,
      email: email.trim() || null,
      url: link,
      notes: null,
    });
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
      className="grid gap-2 rounded-md border border-border bg-surface-raised p-3 sm:grid-cols-2"
    >
      <Field id={`${id}-name`} label="Name" value={name} onChange={setName} error={errors.name} autoFocus />
      <Field id={`${id}-role`} label="Role" value={role} onChange={setRole} placeholder="Recruiter" />
      <Field id={`${id}-email`} label="Email" value={email} onChange={setEmail} error={errors.email} type="email" />
      <Field id={`${id}-url`} label="Link" value={url} onChange={setUrl} error={errors.url} placeholder="linkedin.com/in/…" />
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="secondary" size="sm">
          Add contact
        </Button>
      </div>
    </m.form>
  );
}

export function Field({
  id,
  label,
  value,
  onChange,
  error,
  type = 'text',
  placeholder,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  type?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-small">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="h-control-sm text-small"
      />
      {error ? (
        <p id={`${id}-error`} className="text-caption text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
