import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { env } from '@/lib/env';

import { queryKeys } from './keys';
import type { PushSubscriptionDTO } from './types';

export type PushSupport =
  | 'unsupported'
  /** iOS Safari outside an installed PWA: show the Add to Home Screen hint instead (USERFLOW §2). */
  | 'ios-needs-install'
  | 'default'
  | 'granted'
  | 'denied';

function isIos(): boolean {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function getPushSupport(): PushSupport {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
  if (!('PushManager' in window) || !('Notification' in window)) {
    return isIos() && !isStandalone() ? 'ios-needs-install' : 'unsupported';
  }
  if (isIos() && !isStandalone()) return 'ios-needs-install';
  return Notification.permission;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function vapidKey(): Promise<string> {
  if (env.vapidPublicKey) return env.vapidPublicKey;
  const { publicKey } = await api.get<{ publicKey: string }>('/v1/push/vapid-public-key', {
    auth: 'optional',
  });
  return publicKey;
}

export function usePushSubscriptions(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.push.subscriptions,
    queryFn: ({ signal }) =>
      api.get<{ items: PushSubscriptionDTO[] }>('/v1/push/subscriptions', { signal }),
    select: (d) => d.items,
    enabled: options.enabled ?? true,
    meta: { persist: false },
  });
}

/**
 * Web push for this browser. **Never asks for permission on its own**: `subscribe()` must run from a
 * click on our own button (after the soft ask, USERFLOW §2). Reads the existing subscription on mount
 * without prompting.
 */
export function usePushSubscription() {
  const qc = useQueryClient();
  // Read once on mount (never prompts). Only rendered client-side, inside the signed-in shell.
  const [support, setSupport] = useState<PushSupport>(getPushSupport);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  useEffect(() => {
    if (getPushSupport() !== 'granted') return;
    let cancelled = false;
    void navigator.serviceWorker.getRegistration().then(async (reg) => {
      const sub = (await reg?.pushManager.getSubscription()) ?? null;
      if (!cancelled) setSubscription(sub);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      if (getPushSupport() === 'unsupported' || getPushSupport() === 'ios-needs-install') {
        throw new Error('Push notifications are not available in this browser.');
      }
      const permission = await Notification.requestPermission();
      setSupport(permission);
      if (permission !== 'granted') throw new Error('Notifications are blocked in this browser.');
      const registration = await navigator.serviceWorker.ready;
      const sub =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(await vapidKey()),
        }));
      await api.post('/v1/push/subscriptions', { ...sub.toJSON(), userAgent: navigator.userAgent });
      setSubscription(sub);
      return sub;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.push.subscriptions });
      void qc.invalidateQueries({ queryKey: queryKeys.me });
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const sub = await registration?.pushManager.getSubscription();
      if (sub) {
        await api.delete('/v1/push/subscriptions', { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setSubscription(null);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.push.subscriptions }),
  });

  const subscribe = useCallback(() => subscribeMutation.mutateAsync(), [subscribeMutation]);
  const unsubscribe = useCallback(() => unsubscribeMutation.mutateAsync(), [unsubscribeMutation]);

  return {
    support,
    permission: support,
    isSubscribed: Boolean(subscription),
    subscribe,
    unsubscribe,
    isPending: subscribeMutation.isPending || unsubscribeMutation.isPending,
    error: subscribeMutation.error ?? unsubscribeMutation.error,
  };
}
