import { createContext, useContext } from 'react';

export type ShellSlotName = 'topbar' | 'rail' | 'drawer';

export interface ShellSlotsValue {
  nodes: Partial<Record<ShellSlotName, HTMLElement | null>>;
  register: (name: ShellSlotName, node: HTMLElement | null) => void;
  /** Which slots currently have content (the shell sizes its grid from this). */
  filled: Partial<Record<ShellSlotName, number>>;
  setFilled: (name: ShellSlotName, delta: 1 | -1) => void;
}

export const ShellSlotsContext = createContext<ShellSlotsValue | null>(null);

export function useShellSlots(): ShellSlotsValue | null {
  return useContext(ShellSlotsContext);
}
