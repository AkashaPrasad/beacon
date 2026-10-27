/** Text-only opportunity-type pill (a muted tint with a dot; no icon — the company favicon is the row's only glyph). */
import { cn } from '@/lib/utils';

const META: Record<string, { label: string; hue: string }> = {
  internship: { label: 'Internship', hue: 'mk-hue-cobalt' },
  fulltime: { label: 'Full-time', hue: 'mk-hue-pink' },
  hackathon: { label: 'Hackathon', hue: 'mk-hue-orange' },
  scholarship: { label: 'Scholarship', hue: 'mk-hue-amber' },
  fellowship: { label: 'Fellowship', hue: 'mk-hue-violet' },
  research: { label: 'Research', hue: 'mk-hue-teal' },
  opensource: { label: 'Open source', hue: 'mk-hue-lime' },
};

export function TypePill({ type, className }: { type: string; className?: string }) {
  const meta = META[type] ?? { label: type, hue: 'mk-hue-indigo' };
  return (
    <span
      className={cn(
        meta.hue,
        'inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-caption font-medium whitespace-nowrap',
        className,
      )}
      style={{ background: 'var(--mk-hue-soft)', color: 'var(--mk-hue)' }}
    >
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full"
        style={{ background: 'var(--mk-hue)' }}
      />
      {meta.label}
    </span>
  );
}
