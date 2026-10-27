import { CircleCheck, FileText, FileUp, Loader2, RotateCw, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useId, useRef, useState, type DragEvent } from 'react';

import { Button } from '@/components/ui/button';
import { springs, tweens } from '@/features/onboarding/lib/motion';
import { formatBytes, RESUME_ACCEPT, RESUME_MAX_BYTES } from '@/features/onboarding/lib/resume-file';
import { cn } from '@kestrel/ui';

export type DropzonePhase = 'idle' | 'uploading' | 'reading' | 'done' | 'failed';

export interface ResumeDropzoneProps {
  phase: DropzonePhase;
  file?: { name: string; size: number } | null;
  /** 0..1 while uploading. */
  progress?: number;
  onFile: (file: File) => void;
  onRetry?: () => void;
  onCancel?: () => void;
  /** Compact layout once a resume has been read (the preview takes the stage). */
  compact?: boolean;
  className?: string;
}

/**
 * Resume drop zone (DESIGN §6.1, 21st.dev File Drop Zone adapted): drag, click or paste. Drag-over shows
 * a `border-strong` dashed outline on `surface-hover`, no glow. The file chip carries the upload
 * progress as a 2 px bar (scaleX, so it never re-lays out).
 */
export function ResumeDropzone({
  phase,
  file,
  progress = 0,
  onFile,
  onRetry,
  onCancel,
  compact = false,
  className,
}: ResumeDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const hintId = useId();
  const busy = phase === 'uploading' || phase === 'reading';

  // Paste a file from the clipboard anywhere on the step (text pastes are ignored).
  useEffect(() => {
    if (busy) return undefined;
    function onPaste(e: ClipboardEvent) {
      const pasted = e.clipboardData?.files?.[0];
      if (!pasted) return;
      e.preventDefault();
      onFile(pasted);
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [busy, onFile]);

  function openPicker() {
    if (!busy) inputRef.current?.click();
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    depth.current = 0;
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped && !busy) onFile(dropped);
  }

  const showChip = Boolean(file) && phase !== 'idle';

  return (
    <div
      data-testid="resume-dropzone"
      data-phase={phase}
      data-dragging={dragging || undefined}
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current += 1;
        if (!busy) setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = busy ? 'none' : 'copy';
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={onDrop}
      onClick={(e) => {
        // Clicks on inner buttons handle themselves.
        if ((e.target as HTMLElement).closest('button,a,input')) return;
        if (phase === 'idle' || phase === 'failed') openPicker();
      }}
      className={cn(
        'relative flex flex-col gap-4 rounded-lg border border-dashed transition-colors duration-fast ease-out',
        compact ? 'p-3' : 'p-5 sm:p-6',
        dragging ? 'border-border-strong bg-surface-hover' : 'border-border-strong/80 bg-surface',
        (phase === 'idle' || phase === 'failed') && 'cursor-pointer hover:bg-surface-hover',
        className,
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={RESUME_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="resume-file-input"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) onFile(picked);
          e.target.value = '';
        }}
      />

      <AnimatePresence initial={false} mode="popLayout">
        {!showChip || !compact ? (
          <m.div
            key="prompt"
            layout="position"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: tweens.fadeIn }}
            exit={{ opacity: 0, transition: tweens.fadeOut }}
            className={cn('flex items-center gap-4', !compact && 'sm:flex-col sm:py-4 sm:text-center')}
          >
            <m.span
              aria-hidden="true"
              animate={{ y: dragging ? -2 : 0, scale: dragging ? 1.04 : 1 }}
              transition={springs.snappy}
              className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-sunken text-fg-secondary"
            >
              <FileUp className="size-5" strokeWidth={1.5} />
            </m.span>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-body-lg text-fg">
                {dragging ? (
                  'Drop to upload'
                ) : (
                  <>
                    Drop your resume, or{' '}
                    <button
                      type="button"
                      onClick={openPicker}
                      disabled={busy}
                      aria-describedby={hintId}
                      data-testid="onboarding-resume-choose"
                      className="rounded-xs font-medium text-accent-strong underline-offset-3 transition-colors duration-fast hover:underline focus-visible:focus-ring disabled:text-fg-disabled"
                    >
                      choose a file
                    </button>
                  </>
                )}
              </p>
              <p id={hintId} className="text-small text-fg-tertiary">
                PDF or DOCX, up to {formatBytes(RESUME_MAX_BYTES)}. You can also paste it.
              </p>
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {showChip && file && (
          <m.div
            key="chip"
            layout
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0, transition: { y: springs.smooth, opacity: tweens.fadeIn } }}
            exit={{ opacity: 0, transition: tweens.exit }}
            className="relative flex items-center gap-3 overflow-hidden rounded-md border border-border bg-surface-raised px-3 py-2.5"
            data-testid="onboarding-resume-file"
          >
            <FileText className="size-5 shrink-0 text-fg-secondary" strokeWidth={1.5} aria-hidden="true" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-body font-medium text-fg" title={file.name}>
                {file.name}
              </span>
              <span className="flex items-center gap-1.5 text-small text-fg-tertiary" aria-live="polite">
                <span className="font-mono text-mono-sm">{formatBytes(file.size)}</span>
                <span aria-hidden="true">·</span>
                {phase === 'uploading' && (
                  <span>
                    Uploading <span className="font-mono text-mono-sm">{Math.round(progress * 100)}%</span>
                  </span>
                )}
                {phase === 'reading' && <span>Reading your resume…</span>}
                {phase === 'done' && (
                  <span className="inline-flex items-center gap-1 text-success">
                    <CircleCheck className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                    Read
                  </span>
                )}
                {phase === 'failed' && <span className="text-danger">Not read</span>}
              </span>
            </div>
            {busy && (
              <Loader2
                className="size-4 shrink-0 animate-spin text-fg-tertiary motion-reduce:animate-none"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            )}
            {phase === 'uploading' && onCancel && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onCancel}
                aria-label="Cancel upload"
                data-testid="onboarding-resume-cancel"
              >
                <X className="size-4" strokeWidth={1.5} />
              </Button>
            )}
            {phase === 'failed' && onRetry && (
              <Button type="button" variant="ghost" size="sm" onClick={onRetry} data-testid="onboarding-resume-retry">
                <RotateCw className="size-4" strokeWidth={1.5} aria-hidden="true" />
                Retry
              </Button>
            )}
            {phase === 'done' && (
              <Button type="button" variant="ghost" size="sm" onClick={openPicker} data-testid="onboarding-resume-replace">
                Replace
              </Button>
            )}
            {(phase === 'uploading' || phase === 'reading') && (
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-surface-sunken">
                <m.span
                  className="block h-full origin-left bg-accent-strong"
                  initial={false}
                  animate={{ scaleX: phase === 'reading' ? 1 : Math.max(0.04, progress) }}
                  transition={springs.data}
                />
              </span>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
