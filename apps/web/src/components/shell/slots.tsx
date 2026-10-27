import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { ShellSlotsContext, useShellSlots, type ShellSlotName, type ShellSlotsValue } from './slots-context';

/**
 * Shell slots let a screen put content into the app chrome without touching the shell:
 *
 *   <ShellSlot name="topbar"><FitThresholdSlider /><ViewSwitch /></ShellSlot>   // top-bar controls
 *   <ShellSlot name="rail"><FilterRail /></ShellSlot>                            // left rail (≥ lg)
 *   <ShellSlot name="drawer"><ListingDrawer /></ShellSlot>                       // right pane (≥ xl push)
 *
 * Slot content is portalled, so it keeps the screen's React context (queries, state).
 */
export function ShellSlotsProvider({ children }: { children: ReactNode }) {
  const [nodes, setNodes] = useState<ShellSlotsValue['nodes']>({});
  const [filled, setFilledState] = useState<ShellSlotsValue['filled']>({});
  const register = useCallback((name: ShellSlotName, node: HTMLElement | null) => {
    setNodes((prev) => (prev[name] === node ? prev : { ...prev, [name]: node }));
  }, []);
  const setFilled = useCallback((name: ShellSlotName, delta: 1 | -1) => {
    setFilledState((prev) => ({ ...prev, [name]: Math.max(0, (prev[name] ?? 0) + delta) }));
  }, []);
  const value = useMemo(() => ({ nodes, register, filled, setFilled }), [nodes, register, filled, setFilled]);
  return <ShellSlotsContext.Provider value={value}>{children}</ShellSlotsContext.Provider>;
}

/** The container the shell renders for a slot. */
export function ShellSlotOutlet({ name, className }: { name: ShellSlotName; className?: string }) {
  const slots = useShellSlots();
  const register = slots?.register;
  const ref = useCallback((node: HTMLDivElement | null) => register?.(name, node), [name, register]);
  return <div ref={ref} data-shell-slot={name} className={className} />;
}

/** Render children into a shell slot. Renders nothing outside the shell (e.g. in unit tests). */
export function ShellSlot({ name, children }: { name: ShellSlotName; children: ReactNode }) {
  const slots = useShellSlots();
  const node = slots?.nodes[name];
  const setFilled = slots?.setFilled;
  useEffect(() => {
    if (!setFilled) return undefined;
    setFilled(name, 1);
    return () => setFilled(name, -1);
  }, [name, setFilled]);
  return node ? createPortal(children, node) : null;
}
