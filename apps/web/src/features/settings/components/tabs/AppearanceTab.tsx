import { Keyboard } from 'lucide-react';
import { m } from 'motion/react';
import { useCallback, useEffect, useRef, useSyncExternalStore, type KeyboardEvent } from 'react';

import { openSheet } from '@/components/shell/shell-state';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { press } from '@/features/onboarding/lib/motion';
import { SegmentedControl } from '@/features/settings/components/controls/SegmentedControl';
import { SettingsRow, SettingsSection } from '@/features/settings/components/SettingsRow';
import {
  ACCENT_CHOICES,
  ACCENT_SWATCH,
  DENSITY_CHOICES,
  FONT_SIZE_CHOICES,
  MOTION_CHOICES,
  THEME_CHOICES,
} from '@/features/settings/lib/appearance';
import { useSavedFlash } from '@/features/settings/lib/use-saved-flash';
import { shortcuts } from '@/lib/shortcuts';
import type { Appearance, Density, ResolvedTheme, ThemePref } from '@/lib/theme/appearance';
import { useTheme } from '@/lib/theme/context';
import { cn, CompanyLogo, FitRing } from '@kestrel/ui';

/** A miniature Beacon window drawn with the real tokens of `theme` (scoped `data-theme`). */
function MiniWindow({ theme, className }: { theme: ResolvedTheme; className?: string }) {
  return (
    <span data-theme={theme} className={cn('flex h-full flex-col bg-bg', className)}>
      <span className="flex h-3 items-center gap-1 border-b border-border-subtle px-1.5">
        <span className="size-1 rounded-full bg-accent" />
        <span className="h-0.5 w-5 rounded-full bg-fg-tertiary/50" />
        <span className="ml-auto h-0.5 w-3 rounded-full bg-fg-tertiary/40" />
      </span>
      <span className="flex flex-1 flex-col gap-1 bg-surface p-1.5">
        {[0.8, 0.6, 0.7].map((w, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="size-2 shrink-0 rounded-[2px] border border-border-subtle bg-surface-raised" />
            <span className="h-1 rounded-full bg-fg-secondary/60" style={{ width: `${w * 60}%` }} />
            <span
              className={cn('ml-auto size-2 shrink-0 rounded-full border', i === 0 ? 'border-fit-great' : 'border-fit-good')}
            />
          </span>
        ))}
        <span className="mt-auto h-1.5 w-8 self-end rounded-[2px] bg-accent" />
      </span>
    </span>
  );
}

function ThemeTiles({
  value,
  onChange,
  labelledBy,
}: {
  value: ThemePref;
  onChange: (theme: ThemePref) => void;
  labelledBy: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  // Toggle buttons rather than a radio group: every tile is a Tab stop (and arrows move between them),
  // so the choice is reachable the way people expect from a row of big cards.
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    refs.current[(index + delta + THEME_CHOICES.length) % THEME_CHOICES.length]?.focus();
  }
  return (
    <div role="group" aria-labelledby={labelledBy} className="grid grid-cols-3 gap-2 sm:gap-3" data-testid="settings-theme">
      {THEME_CHOICES.map((choice, i) => {
        const on = value === choice.value;
        return (
          <m.button
            key={choice.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            aria-pressed={on}
            data-value={choice.value}
            data-state={on ? 'on' : 'off'}
            data-testid="settings-theme-option"
            onClick={() => onChange(choice.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            {...press.card}
            className={cn(
              'group flex min-w-0 flex-col gap-2 rounded-lg border p-1.5 text-left transition-colors duration-fast ease-out focus-visible:focus-ring',
              on ? 'border-accent-strong bg-accent-subtle' : 'border-border bg-surface-raised hover:border-border-strong',
            )}
          >
            <span
              aria-hidden="true"
              className="relative block h-16 overflow-hidden rounded-md border border-border-subtle sm:h-20"
            >
              {choice.value === 'system' ? (
                <span className="grid h-full grid-cols-2">
                  <MiniWindow theme="light" />
                  <MiniWindow theme="dark" className="border-l border-border-subtle" />
                </span>
              ) : (
                <MiniWindow theme={choice.value} />
              )}
            </span>
            <span className="flex items-center gap-2 px-1 pb-0.5">
              <span
                aria-hidden="true"
                className={cn(
                  'grid size-4 shrink-0 place-items-center rounded-full border transition-colors duration-fast',
                  on ? 'border-transparent bg-accent' : 'border-border-input bg-surface-raised',
                )}
              >
                <m.span
                  initial={false}
                  animate={{ scale: on ? 1 : 0, opacity: on ? 1 : 0 }}
                  className="size-1.5 rounded-full bg-accent-fg"
                />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className={cn('truncate text-body font-medium', on ? 'text-accent-subtle-fg' : 'text-fg')}>
                  {choice.label}
                </span>
                <span
                  className={cn(
                    'hidden truncate text-caption sm:block',
                    on ? 'text-accent-subtle-fg' : 'text-fg-tertiary',
                  )}
                >
                  {choice.hint}
                </span>
              </span>
            </span>
          </m.button>
        );
      })}
    </div>
  );
}

/** One radar row at the chosen density (scoped `data-density`), so the choice is visible before you leave. */
function DensityPreview({ density }: { density: Density }) {
  const compact = density === 'compact';
  return (
    <div
      data-density={density}
      aria-hidden="true"
      data-testid="settings-density-preview"
      className="overflow-hidden rounded-md border border-border bg-surface"
    >
      <div className="relative flex h-row items-center gap-3 border-b border-border-subtle px-3">
        <span className="absolute inset-y-0 left-0 w-0.5 bg-accent-strong" />
        <CompanyLogo name="Northwind Labs" size={compact ? 20 : 28} />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <p className="truncate text-body">
            <span className="font-medium text-fg">Platform Engineering Intern</span>
            <span className="text-fg-secondary"> · Northwind Labs</span>
            {compact && <span className="text-small text-fg-tertiary"> · Remote · ₹45k/mo</span>}
          </p>
          {!compact && (
            <p className="flex items-center gap-1.5 truncate text-small text-fg-tertiary">
              Remote · ₹45k/mo · 2d ago
              <span className="hidden h-5 items-center rounded-xs bg-surface-sunken px-1.5 text-caption text-fg-secondary sm:inline-flex">
                Go
              </span>
              <span className="hidden h-5 items-center rounded-xs bg-surface-sunken px-1.5 text-caption text-fg-secondary sm:inline-flex">
                Postgres
              </span>
            </p>
          )}
        </div>
        <span className="w-14 shrink-0 text-right font-mono text-mono-sm text-deadline-near">6d left</span>
        <FitRing score={86} size={compact ? 24 : 28} label={compact ? 'none' : 'below'} />
      </div>
    </div>
  );
}

function useSingleKeyShortcuts(): [boolean, (on: boolean) => void] {
  const enabled = useSyncExternalStore(
    shortcuts.subscribe,
    () => shortcuts.isSingleKeyEnabled,
    () => true,
  );
  const set = useCallback((on: boolean) => shortcuts.setSingleKeyEnabled(on), []);
  return [enabled, set];
}

/**
 * Settings > Appearance (DESIGN §10.6): theme with live preview tiles, accent presets, density with a
 * live row, text size, motion and single-key shortcuts. Everything applies instantly through the
 * ThemeProvider and syncs to the account (AppearanceSync, debounced) — no Save button.
 */
export function AppearanceTab() {
  const { appearance, resolvedTheme, setAppearance, onUserChange } = useTheme();
  const [saved, flash] = useSavedFlash();
  const [singleKey, setSingleKey] = useSingleKeyShortcuts();

  // AppearanceSync PATCHes after 400 ms; the caption confirms right after the change lands locally.
  useEffect(() => onUserChange(() => flash()), [onUserChange, flash]);

  const set = (patch: Partial<Appearance>) => setAppearance(patch, 'user');

  return (
    <SettingsSection
      title="Appearance"
      description="Applies on this device right away, and follows you to your other devices."
      saved={saved}
      data-testid="settings-appearance"
    >
      <SettingsRow label="Theme" help="System follows your device, day and night." stacked>
        {({ labelId }) => (
          <ThemeTiles value={appearance.theme} onChange={(theme) => set({ theme })} labelledBy={labelId} />
        )}
      </SettingsRow>

      <SettingsRow label="Accent" help="The one colour Beacon spends on what matters.">
        {({ labelId, helpId }) => (
          <SegmentedControl
            aria-labelledby={labelId}
            aria-describedby={helpId}
            data-testid="settings-accent"
            value={appearance.accent}
            className="flex-wrap"
            options={ACCENT_CHOICES.map((c) => ({
              value: c.value,
              testId: `settings-accent-${c.value}`,
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="size-3 rounded-full ring-1 ring-border-strong ring-inset"
                    style={{ backgroundColor: ACCENT_SWATCH[c.value][resolvedTheme] }}
                  />
                  {c.label}
                </span>
              ),
            }))}
            onChange={(accent) => set({ accent })}
          />
        )}
      </SettingsRow>

      <SettingsRow label="Density" help="Compact fits about 40 % more rows.">
        {({ labelId, helpId }) => (
          <div className="flex flex-col gap-3">
            <SegmentedControl
              aria-labelledby={labelId}
              aria-describedby={helpId}
              data-testid="settings-density"
              value={appearance.density}
              options={DENSITY_CHOICES}
              onChange={(density) => set({ density })}
            />
            <DensityPreview density={appearance.density} />
          </div>
        )}
      </SettingsRow>

      <SettingsRow label="Text size" help="Scales every screen, including numbers.">
        {({ labelId, helpId }) => (
          <SegmentedControl
            aria-labelledby={labelId}
            aria-describedby={helpId}
            data-testid="settings-font-size"
            value={appearance.fontSize}
            options={FONT_SIZE_CHOICES.map((c) => ({ value: c.value, label: c.label, ariaLabel: c.ariaLabel }))}
            onChange={(fontSize) => set({ fontSize })}
          />
        )}
      </SettingsRow>

      <SettingsRow label="Motion" help={MOTION_CHOICES.find((c) => c.value === appearance.motion)?.hint}>
        {({ labelId, helpId }) => (
          <SegmentedControl
            aria-labelledby={labelId}
            aria-describedby={helpId}
            data-testid="settings-motion"
            value={appearance.motion}
            options={MOTION_CHOICES.map((c) => ({ value: c.value, label: c.label }))}
            onChange={(motion) => set({ motion })}
          />
        )}
      </SettingsRow>

      <SettingsRow label="Shortcuts" help="Single keys like J, K, S and H. ⌘K and Esc always work.">
        {({ labelId, helpId }) => (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2.5 text-body text-fg">
              <Switch
                checked={singleKey}
                onCheckedChange={(on) => {
                  setSingleKey(on);
                  flash();
                }}
                aria-labelledby={labelId}
                aria-describedby={helpId}
                data-testid="settings-single-key"
              />
              <span aria-hidden="true">Single-key shortcuts</span>
            </label>
            <Button variant="ghost" size="sm" onClick={() => openSheet('shortcuts')} data-testid="settings-shortcuts-sheet">
              <Keyboard className="size-4" strokeWidth={1.5} aria-hidden="true" />
              View all
              <kbd className="rounded-xs border border-border bg-surface-sunken px-1 font-mono text-mono-sm text-fg-tertiary">?</kbd>
            </Button>
          </div>
        )}
      </SettingsRow>
    </SettingsSection>
  );
}
