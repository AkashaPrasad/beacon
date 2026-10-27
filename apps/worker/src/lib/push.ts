import webpush from 'web-push';

export interface PushPayload {
  title: string;
  body: string;
  /** In-app deep link, e.g. "/radar?listing=<id>". */
  url: string;
  /** Collapses repeated notifications on the device. */
  tag?: string;
  notificationId?: string;
  kind?: string;
}

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export type PushResult = { ok: true } | { ok: false; gone: boolean; status: number | null; error: string };

export interface PushSender {
  readonly enabled: boolean;
  send(target: PushTarget, payload: PushPayload): Promise<PushResult>;
}

/** web-push with VAPID; 404/410 from the push service means the subscription is gone. */
export class WebPushSender implements PushSender {
  readonly enabled: boolean;
  constructor(vapid: { publicKey?: string; privateKey?: string; subject?: string }) {
    this.enabled = Boolean(vapid.publicKey && vapid.privateKey && vapid.subject);
    if (this.enabled) webpush.setVapidDetails(vapid.subject as string, vapid.publicKey as string, vapid.privateKey as string);
  }

  async send(target: PushTarget, payload: PushPayload): Promise<PushResult> {
    if (!this.enabled) return { ok: false, gone: false, status: null, error: 'VAPID keys not configured' };
    try {
      await webpush.sendNotification(target, JSON.stringify(payload), { TTL: 24 * 3600, urgency: 'normal', timeout: 10_000 });
      return { ok: true };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? null;
      return { ok: false, gone: status === 404 || status === 410, status, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
