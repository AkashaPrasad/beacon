import { PenLine } from 'lucide-react';
import { m } from 'motion/react';
import { Link } from 'react-router';

import { usePacks } from '@/api';
import { Question } from '@/features/onboarding/components/Question';
import { useOnboarding } from '@/features/onboarding/flow/context';
import { listLine, withName } from '@/features/onboarding/flow/copy';
import {
  countryName,
  REMOTE_CARDS,
  roleLabel,
  TYPE_CARDS,
} from '@/features/onboarding/flow/options';
import { stepPath, type StepId } from '@/features/onboarding/flow/steps';
import { rowVariants } from '@/features/onboarding/lib/motion';
import { formatStipendFloor } from '@/features/onboarding/lib/preferences';
import { primaryEducation, shown } from '@/features/profile/lib/profile-model';
import { cn } from '@kestrel/ui';

interface Row {
  step: StepId;
  label: string;
  value: string | null;
  skills?: string[];
}

/** Step 15: "Looks right?" — every answer on one page, each with an Edit link back to its question. */
export function ReviewStep() {
  const flow = useOnboarding();
  const packs = usePacks();
  const d = flow.draft;
  const a = flow.answers;
  const edu = primaryEducation(d);
  const types = TYPE_CARDS.filter((c) => c.types.some((t) => d.opportunityTypes.includes(t))).map(
    (c) => c.label,
  );
  const enabled = (packs.data ?? []).filter(
    (p) => p.enabled || (a.packs as string[] | undefined)?.includes(p.id),
  );

  const rows: Row[] = [
    { step: 'name', label: 'Name', value: flow.me.user.name || null },
    {
      step: 'education',
      label: 'Education',
      value: edu
        ? [shown(edu.degree) || null, `Class of ${edu.gradYear}`].filter(Boolean).join(' · ')
        : null,
    },
    { step: 'resume', label: 'Resume', value: flow.profile.resume?.fileName ?? null },
    {
      step: flow.answers.resumeParsed ? 'found' : 'stack',
      label: 'Skills',
      value: d.skills.length ? `${d.skills.length} skills` : null,
      skills: d.skills.map((s) => s.name),
    },
    {
      step: 'types',
      label: 'Looking for',
      value: types.length ? listLine(types, 4) : 'Every type',
    },
    {
      step: 'roles',
      label: 'Roles',
      value: d.preferredRoles.length ? listLine(d.preferredRoles.map(roleLabel), 3) : null,
    },
    {
      step: 'location',
      label: 'Where',
      value: [
        REMOTE_CARDS.find((c) => c.value === d.remotePref)?.label,
        d.preferredLocations.length ? listLine(d.preferredLocations) : null,
      ]
        .filter(Boolean)
        .join(' · '),
    },
    {
      step: 'stipend',
      label: 'Stipend floor',
      value: d.stipendFloor
        ? formatStipendFloor(
            d.stipendFloor.amount,
            d.stipendFloor.currency === 'USD' ? 'USD' : 'INR',
          )
        : 'No minimum',
    },
    {
      step: 'work-auth',
      label: 'Can work in',
      value: d.workAuth.authorisedCountries.length
        ? `${listLine(d.workAuth.authorisedCountries.map(countryName))}${d.workAuth.needsSponsorship ? ' · needs sponsorship elsewhere' : ''}`
        : null,
    },
    {
      step: 'companies',
      label: 'Dream companies',
      value: a.targetCompanies?.length ? listLine(a.targetCompanies.map((c) => c.name)) : null,
    },
    {
      step: 'packs',
      label: 'Sources',
      value: enabled.length
        ? `${listLine(
            enabled.map((p) => p.name),
            2,
          )}`
        : null,
    },
  ];

  const editing = flow.mode === 'edit';

  return (
    <Question
      step="review"
      prompt={editing ? 'Your answers' : `Looks right${withName(flow.firstName)}?`}
      helper={
        editing
          ? 'Change anything; your radar re-ranks within a minute.'
          : 'Change anything now, or later from Profile. Nothing here is final.'
      }
      width="lg"
      primary={{
        label: editing ? 'Done' : 'Start my radar',
        onClick: () => flow.complete('review'),
      }}
    >
      <dl
        className="-my-1 flex flex-col divide-y divide-border-subtle"
        data-testid="onboarding-review"
      >
        {rows.map((row, i) => (
          <m.div
            key={row.label}
            variants={rowVariants}
            custom={i}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_auto] items-start gap-3 py-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto]"
            data-testid="onboarding-review-row"
            data-step={row.step}
          >
            <dt className="pt-0.5 text-small text-fg-tertiary">{row.label}</dt>
            <dd className={cn('min-w-0 text-body', row.value ? 'text-fg' : 'text-fg-tertiary')}>
              {row.skills && row.skills.length > 0 ? (
                <span className="flex flex-wrap gap-1.5">
                  {row.skills.slice(0, 8).map((s) => (
                    <span
                      key={s}
                      className="rounded-xs bg-surface-sunken/70 px-1.5 py-0.5 text-small text-fg-secondary"
                    >
                      {s}
                    </span>
                  ))}
                  {row.skills.length > 8 && (
                    <span className="px-1 py-0.5 text-small text-fg-tertiary">
                      +{row.skills.length - 8} more
                    </span>
                  )}
                </span>
              ) : (
                (row.value ?? 'Skipped')
              )}
            </dd>
            <dd>
              <Link
                to={stepPath(row.step, '?return=review')}
                state={{ explicit: true }}
                className="inline-flex items-center gap-1 rounded-xs text-small font-medium text-accent-strong underline-offset-3 hover:underline focus-visible:focus-ring"
                aria-label={`Edit ${row.label.toLowerCase()}`}
                data-testid="onboarding-review-edit"
              >
                <PenLine className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                Edit
              </Link>
            </dd>
          </m.div>
        ))}
      </dl>
    </Question>
  );
}
