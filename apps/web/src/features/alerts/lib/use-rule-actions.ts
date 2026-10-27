/**
 * Rule actions shared by the list and the editor page: pause/resume, duplicate (with Undo), delete
 * (deferred, with Undo: the same rule comes back), and [Send test].
 */
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import {
  deleteAlertRequest,
  reinsertAlertInCache,
  removeAlertFromCache,
  useCreateAlert,
  useTestAlert,
  useUpdateAlert,
  type AlertRuleDTO,
} from '@/api/alerts';
import { queryKeys } from '@/api/keys';
import { usePushSubscription } from '@/api/push';
import { deferCommit } from '@/features/sources/lib/deferred';
import { errorMessage } from '@/lib/api';
import { withUndo } from '@/lib/undo';

import { duplicateName, ruleToInput, testToastCopy } from './delivery';
import { clearPendingDelete, markPendingDelete } from './pending-deletes';

export function useRuleActions() {
  const qc = useQueryClient();
  const createAlert = useCreateAlert();
  const updateAlert = useUpdateAlert();
  const testAlert = useTestAlert();
  const push = usePushSubscription();
  const [testingId, setTestingId] = useState<string | null>(null);

  const toggle = useCallback(
    (rule: AlertRuleDTO, enabled: boolean) =>
      updateAlert.mutate(
        { id: rule.id, patch: { enabled } },
        {
          onError: (e) =>
            toast.error(`Couldn't ${enabled ? 'turn on' : 'pause'} “${rule.name}”. ${errorMessage(e)}`, {
              duration: 8000,
            }),
        },
      ),
    [updateAlert],
  );

  const duplicate = useCallback(
    (rule: AlertRuleDTO) => {
      const input = ruleToInput(rule, { name: duplicateName(rule.name) });
      let inflight: Promise<{ rule: AlertRuleDTO }> | null = null;
      withUndo({
        message: `Duplicated “${rule.name}”.`,
        run: () => (inflight = createAlert.mutateAsync(input)),
        undo: async () => {
          const created = await inflight?.catch(() => null);
          if (!created) return;
          removeAlertFromCache(qc, created.rule.id);
          await deleteAlertRequest(qc, created.rule.id);
        },
      });
    },
    [createAlert, qc],
  );

  const remove = useCallback(
    (rule: AlertRuleDTO) => {
      const index = (qc.getQueryData<{ items: AlertRuleDTO[] }>(queryKeys.alerts)?.items ?? []).findIndex(
        (r) => r.id === rule.id,
      );
      removeAlertFromCache(qc, rule.id);
      markPendingDelete(rule.id);
      const restore = () => {
        clearPendingDelete(rule.id);
        reinsertAlertInCache(qc, rule, index);
      };
      const pending = deferCommit(`alert:${rule.id}`, () =>
        deleteAlertRequest(qc, rule.id)
          .then(() => clearPendingDelete(rule.id))
          .catch((error: unknown) => {
            restore();
            toast.error(`Couldn't delete “${rule.name}”. ${errorMessage(error)}`, { duration: 8000 });
          }),
      );
      withUndo({
        message: `Deleted “${rule.name}”.`,
        run: () => undefined,
        undo: () => {
          pending.cancel();
          restore();
        },
      });
    },
    [qc],
  );

  const test = useCallback(
    (rule: AlertRuleDTO) => {
      setTestingId(rule.id);
      testAlert.mutate(rule.id, {
        onSuccess: () => toast.success(testToastCopy(rule.channels, push.isSubscribed)),
        onError: (e) => toast.error(`Couldn't send the test. ${errorMessage(e)}`, { duration: 8000 }),
        onSettled: () => setTestingId(null),
      });
    },
    [push.isSubscribed, testAlert],
  );

  return { toggle, duplicate, remove, test, testingId };
}
