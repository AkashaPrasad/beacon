/** Personalised, short, warm copy for the onboarding pages (DESIGN §8 voice, UX-RESTRUCTURE §1.7). */

/** ", Aarav" or "" — for prompts like "What are you studying, Aarav?". */
export function withName(firstName: string | null): string {
  return firstName ? `, ${firstName}` : '';
}

/** "Class of 2027. Nice." — the little reflection after a grad-year pick. */
export function gradYearLine(year: number, now: Date = new Date()): string {
  const y = now.getFullYear();
  if (year < y) return `Class of ${year}. We'll lead with first jobs and fellowships.`;
  if (year === y) return `Class of ${year}. Final year: internships and first jobs both count.`;
  if (year === y + 1) return `Class of ${year}. Prime internship season is coming up.`;
  return `Class of ${year}. Plenty of time for hackathons and open source.`;
}

/** "Bengaluru, Pune and 2 more" (Intl list, capped). */
export function listLine(items: readonly string[], max = 3): string {
  if (items.length === 0) return '';
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  const parts = rest > 0 ? [...shown, `${rest} more`] : shown;
  return new Intl.ListFormat('en-IN', { style: 'long', type: 'conjunction' }).format(parts);
}
