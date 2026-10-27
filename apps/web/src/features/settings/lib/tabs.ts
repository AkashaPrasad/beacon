import { Bell, KeyRound, Palette, ShieldCheck, type LucideIcon } from 'lucide-react';

export const SETTINGS_TABS = ['appearance', 'ai', 'notifications', 'privacy'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const SETTINGS_TAB_META: Record<SettingsTab, { label: string; icon: LucideIcon; blurb: string }> = {
  appearance: { label: 'Appearance', icon: Palette, blurb: 'Theme, accent, density, text size, motion' },
  ai: { label: 'AI & keys', icon: KeyRound, blurb: 'Beacon’s AI, your own key, or none' },
  notifications: { label: 'Notifications', icon: Bell, blurb: 'Push, reminders, quiet hours, time zone' },
  privacy: { label: 'Privacy & data', icon: ShieldCheck, blurb: 'Consent, export, delete account' },
};

export function isSettingsTab(value: unknown): value is SettingsTab {
  return typeof value === 'string' && (SETTINGS_TABS as readonly string[]).includes(value);
}

export function settingsPath(tab: SettingsTab): string {
  return `/settings/${tab}`;
}
