/**
 * One alert rule. Led by what it does in plain language ("You'll get a push the moment a Strong-fit
 * internship opens."), with the switch beside it. Stats and actions stay quiet until the card is
 * hovered or focused (always shown on touch), and the long tail lives in the ⋯ menu.
 */
import { springs, tweens } from '@kestrel/ui';
import { Copy, MoreHorizontal, Pencil, Send, Trash2 } from 'lucide-react';
import { m } from 'motion/react';
import { useId, type Ref } from 'react';
import { Link, useNavigate } from 'react-router';

import type { AlertRuleDTO } from '@/api/alerts';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatAbsolute, formatRelative } from '@/features/sources/lib/format';
import { cn } from '@/lib/utils';

import { previewSentence, ruleToDraft } from '../lib/rule-draft';
import { Sparkline } from './Sparkline';

export interface RuleCardActions {
  onToggle: (rule: AlertRuleDTO, enabled: boolean) => void;
  onDuplicate: (rule: AlertRuleDTO) => void;
  onDelete: (rule: AlertRuleDTO) => void;
  onTest: (rule: AlertRuleDTO) => void;
}

/** Revealed on hover / keyboard focus inside the card; always visible on touch screens. */
const quiet =
  'opacity-0 transition-opacity duration-fast group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100';

export function RuleCard({
  rule,
  actions,
  now,
  timezone,
  zone,
  testing,
  ref,
}: {
  rule: AlertRuleDTO;
  actions: RuleCardActions;
  now: Date;
  timezone: string;
  /** "IST" */
  zone: string;
  testing: boolean;
  ref?: Ref<HTMLLIElement>;
}) {
  const titleId = useId();
  const navigate = useNavigate();
  const pending = rule.id.startsWith('optimistic-');
  const off = !rule.enabled;
  const stats = rule.stats ?? null;
  const editPath = `/alerts/${encodeURIComponent(rule.id)}`;

  return (
    <m.li
      ref={ref}
      layout
      // The list's AnimatePresence uses initial={false}: only cards added later (saved, duplicated) enter.
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: springs.gentle }}
      exit={{ opacity: 0, x: -8, transition: tweens.exit }}
      transition={{ layout: springs.gentle }}
      data-testid="alerts-rule"
      data-rule-id={rule.id}
      data-enabled={rule.enabled}
      data-pending={pending || undefined}
      className="list-none"
    >
      <article
        aria-labelledby={titleId}
        className={cn(
          'group flex flex-col gap-4 rounded-lg border bg-surface-raised p-5 transition-colors duration-fast',
          off ? 'border-border-subtle' : 'border-border hover:border-border-strong',
        )}
      >
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="flex flex-wrap items-baseline gap-x-2 text-h3">
              {pending ? (
                <span className="text-fg">{rule.name}</span>
              ) : (
                <Link
                  to={editPath}
                  className={cn(
                    'min-w-0 truncate rounded-xs underline-offset-3 hover:underline focus-visible:focus-ring',
                    off ? 'text-fg-secondary' : 'text-fg',
                  )}
                  title={rule.name}
                >
                  {rule.name}
                </Link>
              )}
              {off ? <span className="text-caption font-normal text-fg-tertiary">Paused</span> : null}
            </h3>
            <p className="mt-1.5 text-body text-pretty text-fg-secondary" data-testid="alerts-rule-summary">
              {previewSentence(ruleToDraft(rule), zone)}
            </p>
          </div>
          <Switch
            checked={rule.enabled}
            disabled={pending}
            onCheckedChange={(v) => actions.onToggle(rule, v)}
            aria-label={`${rule.enabled ? 'Pause' : 'Turn on'} ${rule.name}`}
            className="mt-1"
          />
        </div>

        <div className="flex min-h-7 flex-wrap items-center gap-x-4 gap-y-2 text-caption text-fg-tertiary">
          <span className="whitespace-nowrap">
            {rule.lastTriggeredAt ? (
              <>
                Last alert{' '}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <time
                      dateTime={new Date(rule.lastTriggeredAt).toISOString()}
                      tabIndex={0}
                      className="rounded-xs font-mono text-mono-sm text-fg-secondary focus-visible:focus-ring"
                    >
                      {formatRelative(rule.lastTriggeredAt, now)}
                    </time>
                  </TooltipTrigger>
                  <TooltipContent>{formatAbsolute(rule.lastTriggeredAt, timezone)}</TooltipContent>
                </Tooltip>
              </>
            ) : (
              'Nothing has matched yet'
            )}
          </span>
          {stats && stats.matchesByDay.length > 0 ? (
            <span className={cn('inline-flex items-center gap-2 whitespace-nowrap', quiet)}>
              <Sparkline values={stats.matchesByDay} id={rule.id} today={now} />
              <span>
                <span className="font-mono text-mono-sm text-fg-secondary">{stats.matchesLast7d}</span> this week
              </span>
            </span>
          ) : null}
          <span className={cn('ml-auto flex items-center gap-1', quiet)}>
            <Button
              size="sm"
              variant="ghost"
              data-testid="alerts-test"
              onClick={() => actions.onTest(rule)}
              disabled={pending || testing}
            >
              <Send strokeWidth={1.5} /> {testing ? 'Sending…' : 'Send test'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`More for ${rule.name}`} disabled={pending}>
                  <MoreHorizontal strokeWidth={1.5} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onSelect={() => void navigate(editPath)}>
                  <Pencil strokeWidth={1.5} /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => actions.onDuplicate(rule)}>
                  <Copy strokeWidth={1.5} /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="danger" onSelect={() => actions.onDelete(rule)}>
                  <Trash2 strokeWidth={1.5} /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        </div>
      </article>
    </m.li>
  );
}
