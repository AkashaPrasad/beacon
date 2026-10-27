/** One gentle sentence for the nudge banner ("2 applications could use a follow-up, and 1 test is due soon."). */
import type { AttentionItem } from './attention';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function nudgeSummary(entries: readonly AttentionItem[]): string {
  let follow = 0;
  let quiet = 0;
  let due = 0;
  for (const { nudge } of entries) {
    if (nudge.kind === 'move_to_ghosted') quiet += 1;
    else if (nudge.kind === 'oa_due' || nudge.kind === 'offer_due') due += 1;
    else follow += 1;
  }
  const parts: string[] = [];
  if (follow) parts.push(`${plural(follow, 'application', 'applications')} could use a follow-up`);
  if (quiet) parts.push(`${plural(quiet, 'has', 'have')} gone quiet for a month`);
  if (due) parts.push(`${plural(due, 'deadline is', 'deadlines are')} coming up`);
  if (parts.length === 0) return '';
  const sentence = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]!}`;
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}
