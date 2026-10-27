/**
 * /alerts: one calm column of rule cards, a one-line delivery summary, and [New rule]. Building and
 * editing happen on their own page (/alerts/new, /alerts/:id). DESIGN §6.1, USERFLOW §2 / §3.4 / §6.
 */
import { BellRing, Plus, Settings2 } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router';

import { alertListKey, useAlerts } from '@/api/alerts';
import { useSettings } from '@/api/settings';
import { useCommandItems } from '@/components/command-palette/registry';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Headline, HeadlineNumber } from '@/features/sources/components/common/Headline';
import { errorMessage } from '@/lib/api';
import { cssEscape, useListMemory } from '@/lib/list-memory';
import { useShortcut, useShortcutScope } from '@/lib/shortcuts';
import { EmptyState, ListSkeleton, PageHeader, Shortcut, useNow } from '@kestrel/ui';

import { DeliverySummary } from './DeliverySummary';
import { RuleCard, type RuleCardActions } from './RuleCard';
import { zoneLabel } from '../lib/delivery';
import { readJustSaved } from '../lib/just-saved';
import { pendingDeletesSnapshot, subscribePendingDeletes } from '../lib/pending-deletes';
import { useRuleActions } from '../lib/use-rule-actions';

/** The editor returns here with history Back after a save (no second list entry). */
const FROM_LIST = { fromList: true } as const;

export function AlertsList() {
  const navigate = useNavigate();
  const alerts = useAlerts();
  const settings = useSettings();
  const ruleActions = useRuleActions();
  const now = useNow(60_000);
  const pendingDeletes = useSyncExternalStore(
    subscribePendingDeletes,
    pendingDeletesSnapshot,
    pendingDeletesSnapshot,
  );

  // The card saved on the editor page joins the list one frame after it mounts, so it plays its enter
  // animation even though the list itself never animates on first paint (MOTION §6 rule 2).
  const [justSaved] = useState(() => readJustSaved());
  const [revealed, setRevealed] = useState(justSaved === null);
  useEffect(() => {
    if (revealed) return undefined;
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, [revealed]);

  const timezone = settings.data?.notifications.timezone ?? 'Asia/Kolkata';
  const zone = zoneLabel(timezone);
  const rules = useMemo(
    () => (alerts.data ?? []).filter((r) => !pendingDeletes.has(r.id)),
    [alerts.data, pendingDeletes],
  );
  const shown = revealed ? rules : rules.filter((r) => alertListKey(r.id) !== justSaved);
  const onCount = rules.filter((r) => r.enabled).length;
  const withStats = rules.filter((r) => r.stats);
  const matchesThisWeek = withStats.reduce((n, r) => n + (r.stats?.matchesLast7d ?? 0), 0);

  // Back from a rule's page lands on its card again (UX restructure §1.1).
  useListMemory('alerts', {
    ready: rules.length > 0,
    focus: (id) => `[data-testid="alerts-rule"][data-rule-id="${cssEscape(id)}"] h3 a`,
  });

  const actions = useMemo<RuleCardActions>(
    () => ({
      onToggle: ruleActions.toggle,
      onDuplicate: ruleActions.duplicate,
      onDelete: ruleActions.remove,
      onTest: ruleActions.test,
    }),
    [ruleActions.toggle, ruleActions.duplicate, ruleActions.remove, ruleActions.test],
  );

  useShortcutScope('alerts');
  useShortcut('n', () => void navigate('/alerts/new', { state: FROM_LIST }), {
    scope: 'alerts',
    description: 'New alert rule',
    group: 'Alerts',
  });
  useCommandItems(
    () => [
      {
        id: 'alerts.new',
        group: 'Actions',
        label: 'New alert rule',
        shortcut: 'n',
        icon: Plus,
        perform: () => void navigate('/alerts/new', { state: FROM_LIST }),
      },
      {
        id: 'alerts.starter',
        group: 'Actions',
        label: 'Alert me about Strong fit internships',
        keywords: ['rule', 'notify', 'push'],
        icon: BellRing,
        perform: () => void navigate('/alerts/new?preset=starter', { state: FROM_LIST }),
      },
      {
        id: 'alerts.notification-settings',
        group: 'Settings',
        label: 'Notification settings',
        keywords: ['quiet hours', 'reminders', 'push'],
        icon: Settings2,
        perform: () => void navigate('/settings/notifications'),
      },
    ],
    [navigate],
  );

  const loading = alerts.isPending;
  const hasRules = rules.length > 0;
  // One primary per region: the empty state owns it when there are no rules. Decided once the list has
  // loaded, so the header button never flips variant mid-load.
  const emptyLoaded = !loading && !alerts.isError && !hasRules;

  return (
    <TooltipProvider>
      <div className="mx-auto flex w-full max-w-3xl flex-col">
        <PageHeader
          title="Alerts"
          className="pb-1"
          actions={
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant={emptyLoaded ? 'secondary' : 'primary'}
                  aria-keyshortcuts="N"
                >
                  <Link to="/alerts/new" state={FROM_LIST} data-testid="alerts-new">
                    <Plus strokeWidth={1.5} /> <span className="max-sm:sr-only">New rule</span>
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="flex items-center gap-2">
                New rule <Shortcut keys="n" />
              </TooltipContent>
            </Tooltip>
          }
        />

        <Headline loading={loading} testId="alerts-headline" className="pb-4">
          {!hasRules ? (
            'No rules yet. One is enough to hear about the right listing the moment it opens.'
          ) : (
            <>
              <HeadlineNumber>{rules.length}</HeadlineNumber>{' '}
              {rules.length === 1 ? 'rule' : 'rules'}
              {withStats.length > 0 ? (
                <>
                  , <HeadlineNumber>{matchesThisWeek.toLocaleString('en-IN')}</HeadlineNumber>{' '}
                  {matchesThisWeek === 1 ? 'match' : 'matches'} this week.
                </>
              ) : (
                '.'
              )}
              {onCount < rules.length ? (
                <>
                  {' '}
                  <HeadlineNumber>{rules.length - onCount}</HeadlineNumber> paused.
                </>
              ) : null}
            </>
          )}
        </Headline>

        <div className="flex flex-col gap-5 px-gutter pb-16">
          <DeliverySummary className="-mx-3 w-[calc(100%+1.5rem)]" />

          {loading ? (
            <ListSkeleton rows={3} label="Loading alert rules" />
          ) : alerts.isError && !alerts.data ? (
            <EmptyState
              icon={BellRing}
              title="Couldn't load your alert rules."
              body={errorMessage(alerts.error)}
              action={
                <Button variant="secondary" onClick={() => void alerts.refetch()}>
                  Retry
                </Button>
              }
            />
          ) : !hasRules ? (
            <EmptyState
              variant="page"
              icon={BellRing}
              title="No alert rules."
              body="Start with one: notify me when a Strong fit internship opens."
              data-testid="alerts-empty"
              action={
                <Button asChild variant="primary">
                  <Link to="/alerts/new?preset=starter" state={FROM_LIST}>
                    Create this rule
                  </Link>
                </Button>
              }
              secondaryAction={
                <Button asChild variant="ghost">
                  <Link to="/alerts/new" state={FROM_LIST}>
                    Build my own
                  </Link>
                </Button>
              }
            />
          ) : (
            <ul data-testid="alerts-list" aria-label="Alert rules" className="flex flex-col gap-4">
              <AnimatePresence initial={false} mode="popLayout">
                {shown.map((rule) => {
                  const key = alertListKey(rule.id);
                  return (
                    <RuleCard
                      key={key}
                      rule={rule}
                      actions={actions}
                      now={now}
                      timezone={timezone}
                      zone={zone}
                      testing={ruleActions.testingId === rule.id}
                    />
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
