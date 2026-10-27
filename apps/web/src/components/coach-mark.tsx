/* eslint-disable react-refresh/only-export-components -- Co-located public hook/context API. */
/**
 * First-visit coach marks (docs/ONBOARDING.md §5, MOTION §5.20): a small card anchored to the thing it
 * explains, shown once per user, dismissed with "Got it" or Esc. Never two at once, never while the
 * spotlight tour runs (the tour calls `suppressCoachMarks`). Pull, not push (NN/g): it waits until the
 * anchor is on screen and the page has settled.
 *
 *   <CoachMark id="profile-skills" target="[data-testid=profile-skills]" title="Edit in place" body="…" />
 */
import { X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import {
  useCallback,
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

import { useMe } from '@/api/me';
import { Button } from '@/components/ui/button';
import { readJson, writeJson } from '@/lib/storage';
import { springs, tweens, usePrefersReducedMotion, variants } from '@kestrel/ui';

const key = (userId: string, id: string) => `beacon:coach:${userId}:${id}`;

let current: string | null = null;
let suppressed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Hide every coach mark (while a tour or a modal flow owns the screen). */
export function suppressCoachMarks(value: boolean): void {
  suppressed = value;
  emit();
}

export function hasSeenCoachMark(userId: string, id: string): boolean {
  return readJson<boolean>(key(userId, id), false);
}

/**
 * `{ visible, dismiss }` for coach mark `id`: visible when this user hasn't dismissed it, no other coach
 * mark is showing and nothing suppresses them. Use it for custom placements; `<CoachMark>` uses it too.
 */
export function useCoachMark(id: string, { enabled = true }: { enabled?: boolean } = {}) {
  const { data: me } = useMe();
  const userId = me?.user.id ?? null;
  const [dismissed, setDismissed] = useState<string | null>(null);
  const seen = !userId || dismissed === `${userId}:${id}` || hasSeenCoachMark(userId, id);
  const snapshot = useSyncExternalStore(
    subscribe,
    () => `${current ?? ''}|${suppressed ? 1 : 0}`,
    () => '|1',
  );
  const [owner, isSuppressed] = snapshot.split('|') as [string, string];

  const wants = enabled && Boolean(userId) && !seen;
  useEffect(() => {
    if (!wants || isSuppressed === '1') return undefined;
    if (current === null) {
      current = id;
      emit();
    }
    return () => {
      if (current === id) {
        current = null;
        emit();
      }
    };
  }, [id, isSuppressed, wants]);

  const dismiss = useCallback(() => {
    if (userId) writeJson(key(userId, id), true);
    setDismissed(`${userId ?? ''}:${id}`);
    if (current === id) {
      current = null;
      emit();
    }
  }, [id, userId]);

  return { visible: wants && owner === id && isSuppressed !== '1', dismiss };
}

export interface CoachMarkProps {
  id: string;
  /** The anchor: a ref or a selector (first visible match). */
  target: RefObject<HTMLElement | null> | string;
  title: string;
  body: string;
  /** Wait this long after mount (and for the anchor) before showing. */
  delayMs?: number;
  enabled?: boolean;
}

type Box = { top: number; left: number; width: number; height: number };

function findTarget(target: CoachMarkProps['target']): HTMLElement | null {
  if (typeof target !== 'string') return target.current;
  for (const el of document.querySelectorAll<HTMLElement>(target)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

export function CoachMark({
  id,
  target,
  title,
  body,
  delayMs = 700,
  enabled = true,
}: CoachMarkProps) {
  const [ready, setReady] = useState(false);
  const { visible, dismiss } = useCoachMark(id, { enabled: enabled && ready });
  const [box, setBox] = useState<Box | null>(null);
  const reduced = usePrefersReducedMotion();
  const titleId = useId();

  // Arrive only after the page settles and the anchor exists (pull, not push).
  useEffect(() => {
    if (!enabled) return undefined;
    const t = window.setTimeout(() => setReady(Boolean(findTarget(target))), delayMs);
    return () => window.clearTimeout(t);
  }, [delayMs, enabled, target]);

  useEffect(() => {
    if (!visible) return undefined;
    const el = findTarget(target);
    if (!el) return undefined;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('scroll', update, { passive: true, capture: true });
    window.addEventListener('resize', update, { passive: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismiss();
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('scroll', update, { capture: true });
      window.removeEventListener('resize', update);
      window.removeEventListener('keydown', onKey);
    };
  }, [dismiss, target, visible]);

  if (typeof document === 'undefined') return null;
  const vw = typeof window === 'undefined' ? 1024 : window.innerWidth;
  const width = Math.min(288, vw - 32);
  const left = box
    ? Math.max(16, Math.min(box.left + box.width / 2 - width / 2, vw - width - 16))
    : 0;
  const top = box ? box.top + box.height + 12 : 0;

  return createPortal(
    <AnimatePresence>
      {visible && box && (
        <m.div key={id} className="pointer-events-none fixed inset-0 z-popover" initial={false}>
          <m.span
            aria-hidden="true"
            className="absolute rounded-lg outline-2 outline-accent-strong outline-offset-4"
            style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, scale: reduced ? 1 : [1.04, 1, 1.04, 1] }}
            exit={{ opacity: 0, transition: tweens.fadeOut }}
            transition={{
              opacity: tweens.fadeIn,
              scale: { ...tweens.count, duration: tweens.count.duration * 2 },
            }}
          />
          <m.div
            role="dialog"
            aria-modal="false"
            aria-labelledby={titleId}
            variants={variants.popover}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={springs.snappy}
            className="e3 pointer-events-auto absolute rounded-lg border border-border-subtle p-3.5"
            style={{ top, left, width }}
            data-testid="coach-mark"
            data-coach-id={id}
          >
            <div className="flex items-start gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p id={titleId} className="text-body font-medium text-fg">
                  {title}
                </p>
                <p className="text-small text-fg-secondary">{body}</p>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label="Dismiss tip" onClick={dismiss}>
                <X className="size-4" strokeWidth={1.5} aria-hidden="true" />
              </Button>
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={dismiss}
                data-testid="coach-mark-dismiss"
              >
                Got it
              </Button>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
