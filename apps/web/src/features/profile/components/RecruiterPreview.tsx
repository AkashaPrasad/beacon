import { Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DEGREE_LEVEL_LABELS,
  displayUrl,
  groupSkills,
  LINK_LABELS,
  shown,
  type ProfileDraft,
} from '@/features/profile/lib/profile-model';
import { monthYear, proficiencyLabel, profileAsText } from '@/features/profile/lib/recruiter-text';

/**
 * "What recruiters see" (DESIGN §6.1, Read.cv principles: work history as the backbone, projects
 * curated, link-first). Read-only, and without anything private: no stipend floor, no work permits.
 */
export function RecruiterPreview({ draft, name, email }: { draft: ProfileDraft; name: string; email: string | null }) {
  const groups = groupSkills(draft.skills);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(profileAsText(draft, name, email));
      toast('Copied');
    } catch {
      toast.error('Couldn’t copy. Select the text and copy it instead.');
    }
  };
  return (
    <div className="flex flex-col gap-3" data-testid="profile-recruiter-preview">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-prose text-small text-fg-tertiary">
          How your profile reads when you paste it into an application. Beacon never sends it to companies.
        </p>
        <Button variant="secondary" size="sm" onClick={() => void copy()} data-testid="profile-copy-text">
          <Copy className="size-4" strokeWidth={1.5} aria-hidden="true" />
          Copy as text
        </Button>
      </div>
      <article className="rounded-lg border border-border bg-surface-raised px-5 py-6 sm:px-10 sm:py-10" aria-label="Profile as recruiters see it">
        <header className="flex flex-col gap-1 border-b border-border-subtle pb-5">
          <h2 className="font-display text-h1 text-fg">{name}</h2>
          {draft.headline && <p className="text-body-lg text-fg-secondary">{draft.headline}</p>}
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-mono-sm text-fg-tertiary">
            {email && <span>{email}</span>}
            {draft.links.map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-xs text-accent-strong underline-offset-3 hover:underline focus-visible:focus-ring"
              >
                {LINK_LABELS[l.kind] === 'Link' ? displayUrl(l.url) : LINK_LABELS[l.kind]}
                <ExternalLink className="size-3" strokeWidth={1.5} aria-hidden="true" />
              </a>
            ))}
          </p>
        </header>

        {draft.summary && <p className="mt-5 max-w-prose text-body text-fg">{draft.summary}</p>}

        {draft.education.length > 0 && (
          <section className="mt-6 grid gap-x-8 gap-y-2 sm:grid-cols-[8rem_1fr]">
            <h3 className="text-small text-fg-tertiary">Education</h3>
            <ul className="flex flex-col gap-2">
              {draft.education.map((e, i) => (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-body">
                    <span className="font-medium text-fg">{shown(e.institution) || DEGREE_LEVEL_LABELS[e.degreeLevel]}</span>
                    {shown(e.degree) && <span className="text-fg-secondary"> · {shown(e.degree)}</span>}
                  </span>
                  <span className="font-mono text-mono-sm text-fg-tertiary">{e.gradYear}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {draft.experience.length > 0 && (
          <section className="mt-6 grid gap-x-8 gap-y-2 sm:grid-cols-[8rem_1fr]">
            <h3 className="text-small text-fg-tertiary">Experience</h3>
            <ul className="flex flex-col gap-3">
              {draft.experience.map((x, i) => (
                <li key={i} className="flex flex-col gap-0.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-body">
                      <span className="font-medium text-fg">{x.title}</span>
                      <span className="text-fg-secondary"> · {x.company}</span>
                    </span>
                    <span className="font-mono text-mono-sm text-fg-tertiary">
                      {[monthYear(x.startDate), x.current ? 'now' : monthYear(x.endDate)].filter(Boolean).join('–')}
                    </span>
                  </div>
                  {x.description && <p className="max-w-prose text-small text-fg-secondary">{x.description}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {draft.projects.length > 0 && (
          <section className="mt-6 grid gap-x-8 gap-y-2 sm:grid-cols-[8rem_1fr]">
            <h3 className="text-small text-fg-tertiary">Projects</h3>
            <ul className="flex flex-col gap-3">
              {draft.projects.map((p, i) => (
                <li key={i} className="flex flex-col gap-0.5">
                  <span className="text-body font-medium text-fg">
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="rounded-xs underline-offset-3 hover:underline focus-visible:focus-ring">
                        {p.name}
                      </a>
                    ) : (
                      p.name
                    )}
                  </span>
                  {p.description && <p className="max-w-prose text-small text-fg-secondary">{p.description}</p>}
                  {p.skills.length > 0 && <p className="font-mono text-mono-sm text-fg-tertiary">{p.skills.join(' · ')}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {groups.length > 0 && (
          <section className="mt-6 grid gap-x-8 gap-y-2 sm:grid-cols-[8rem_1fr]">
            <h3 className="text-small text-fg-tertiary">Skills</h3>
            <dl className="flex flex-col gap-1.5">
              {groups.map((g) => (
                <div key={g.key} className="flex flex-wrap gap-x-2 text-small">
                  <dt className="text-fg-tertiary">{g.label}</dt>
                  <dd className="text-fg">
                    {g.skills.map((s, i) => (
                      <span key={s.name}>
                        {i > 0 && <span className="text-fg-disabled"> · </span>}
                        {s.name}
                        <span className="text-fg-tertiary"> ({proficiencyLabel(s.proficiency).toLowerCase()})</span>
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </article>
    </div>
  );
}
