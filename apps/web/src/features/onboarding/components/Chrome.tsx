/* eslint-disable react-refresh/only-export-components -- Co-located public hook/context API. */
import { Check } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { createContext, useContext } from 'react';

import { BeaconMark } from '@/components/brand/BeaconMark';
import { springs, tweens } from '@/features/onboarding/lib/motion';

/** Announcer for step changes ("Step 3 of 11. What are you studying?"), rendered once by the frame. */
export const AnnounceContext = createContext<(text: string) => void>(() => undefined);
export const useAnnounce = () => useContext(AnnounceContext);

export interface ProgressHeaderProps {
  /** 1-based position, or null in edit mode / on the customising screen. */
  index: number | null;
  total: number;
  label: string;
  saved: boolean;
  /** Edit mode: "Editing · Stipend floor". */
  editing?: string | null;
}

/** Top strip: mark, thin progress bar, "3 of 11", and a quiet "Saved" so resuming feels safe. */
export function ProgressHeader({ index, total, label, saved, editing }: ProgressHeaderProps) {
  const fraction = index === null || total === 0 ? 1 : Math.min(1, index / total);
  return (
    <header className="glass sticky top-0 z-sticky border-b pt-safe">
      <div className="mx-auto flex h-14 w-full max-w-[56rem] items-center gap-4 px-gutter">
        <span className="flex items-center gap-2 text-fg" aria-hidden="true">
          <BeaconMark className="size-6" />
          <span className="hidden font-medium text-body sm:inline">Beacon</span>
        </span>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
          {editing ? (
            <span className="truncate text-small text-fg-secondary">
              Editing <span aria-hidden="true">·</span> {editing}
            </span>
          ) : index !== null ? (
            <span
              className="font-mono text-mono-sm text-fg-tertiary tabular-nums"
              data-testid="onboarding-position"
            >
              {index} of {total}
            </span>
          ) : null}
          <AnimatePresence initial={false}>
            {saved && !editing && (
              <m.span
                key="saved"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: tweens.fadeIn }}
                exit={{ opacity: 0, transition: tweens.fadeOut }}
                className="hidden items-center gap-1 text-caption text-fg-tertiary sm:inline-flex"
              >
                <Check className="size-3.5 text-success" strokeWidth={2} aria-hidden="true" />
                Progress saved
              </m.span>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div
        role="progressbar"
        aria-label="Setup progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={index ?? total}
        aria-valuetext={index === null ? label : `Step ${index} of ${total}: ${label}`}
        className="h-0.5 w-full overflow-hidden bg-surface-sunken"
      >
        <m.div
          className="h-full origin-left bg-accent-strong"
          initial={false}
          animate={{ scaleX: fraction }}
          transition={springs.data}
        />
      </div>
    </header>
  );
}

/** Polite live region the question pages write into. */
export function LiveRegion({ text }: { text: string }) {
  return (
    <p aria-live="polite" aria-atomic="true" className="sr-only" data-testid="onboarding-announcer">
      {text}
    </p>
  );
}
