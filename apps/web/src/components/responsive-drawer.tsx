import { tweens, variants } from '@kestrel/ui';
import { XIcon } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { ShellSlot } from '@/components/shell/slots';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useShortcut } from '@/lib/shortcuts';
import { useBreakpoint } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';

export interface ResponsiveDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible title (rendered as the `h2` in the header). */
  title: ReactNode;
  /** Optional one-line description under the title (also the dialog description). */
  description?: ReactNode;
  /** Header actions (Apply ↗, Save, Track…), placed before the close button. */
  actions?: ReactNode;
  /** Header content above the title (e.g. a logo + ring row). */
  leading?: ReactNode;
  children: ReactNode;
  /** Changes when the shown item changes (e.g. listing id): content crossfades instead of sliding again. */
  contentKey?: string;
  className?: string;
  /** Label of the mobile sheet's drag handle (DESIGN §9: "Close details"). */
  handleLabel?: string;
  'data-testid'?: string;
}

/**
 * Detail drawer that adapts per breakpoint (DESIGN §6.1, MOTION §5.3/§5.4):
 * - xl+: non-modal `<aside>` pushed into the shell's `drawer` slot (the column appears instantly; content
 *   slides x 16 → 0 on `springs.smooth`; changing `contentKey` crossfades).
 * - lg: non-modal overlay panel from the right (`variants.sidePanel`), no scrim.
 * - md: modal Sheet from the right.
 * - phones: Vaul bottom sheet with snap points 0.6 / 1.
 * `Esc` closes in every mode; focus moves to the title on open (non-modal modes).
 */
export function ResponsiveDrawer(props: ResponsiveDrawerProps) {
  const bp = useBreakpoint();
  if (bp === 'xl' || bp === '2xl') return <PushDrawer {...props} />;
  if (bp === 'lg') return <OverlayDrawer {...props} />;
  if (bp === 'md') return <SheetDrawer {...props} />;
  return <BottomSheetDrawer {...props} />;
}

function Header({
  titleId,
  title,
  description,
  actions,
  leading,
  onClose,
}: Pick<ResponsiveDrawerProps, 'title' | 'description' | 'actions' | 'leading'> & {
  titleId: string;
  onClose: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <header className="sticky top-0 z-sticky flex flex-col gap-2 border-b border-border-subtle bg-surface px-4 py-3">
      {leading}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} ref={titleRef} tabIndex={-1} className="text-h2 text-fg outline-none">
            {title}
          </h2>
          {description != null && <p className="mt-0.5 text-small text-fg-secondary">{description}</p>}
        </div>
        {actions}
        <Button variant="ghost" size="icon-sm" aria-label="Close details" onClick={onClose}>
          <XIcon strokeWidth={1.5} />
        </Button>
      </div>
    </header>
  );
}

function Body({ children, contentKey }: { children: ReactNode; contentKey?: string }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <m.div
        key={contentKey ?? 'content'}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: tweens.fadeIn }}
        exit={{ opacity: 0, transition: tweens.fadeOut }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {children}
      </m.div>
    </AnimatePresence>
  );
}

function useEscToClose(open: boolean, onOpenChange: (open: boolean) => void) {
  useShortcut('escape', () => onOpenChange(false), { enabled: open, scope: 'drawer', allowInInput: false });
}

function PushDrawer({ open, onOpenChange, className, ...props }: ResponsiveDrawerProps) {
  const titleId = useId();
  useEscToClose(open, onOpenChange);
  if (!open) return null;
  return (
    <ShellSlot name="drawer">
      <m.aside
        aria-labelledby={titleId}
        data-testid={props['data-testid']}
        variants={variants.drawerContent}
        initial="hidden"
        animate="visible"
        exit="exit"
        className={cn('flex h-full min-h-0 flex-col bg-surface', className)}
      >
        <Header titleId={titleId} {...props} onClose={() => onOpenChange(false)} />
        <Body contentKey={props.contentKey}>{props.children}</Body>
      </m.aside>
    </ShellSlot>
  );
}

function OverlayDrawer({ open, onOpenChange, className, ...props }: ResponsiveDrawerProps) {
  const titleId = useId();
  useEscToClose(open, onOpenChange);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <m.aside
          aria-labelledby={titleId}
          data-testid={props['data-testid']}
          variants={variants.sidePanel}
          initial="hidden"
          animate="visible"
          exit="exit"
          className={cn(
            'fixed top-(--topbar-h) right-0 bottom-0 z-drawer flex w-(--drawer-w) flex-col border-l border-border bg-surface shadow-md',
            className,
          )}
        >
          <Header titleId={titleId} {...props} onClose={() => onOpenChange(false)} />
          <Body contentKey={props.contentKey}>{props.children}</Body>
        </m.aside>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function SheetDrawer({ open, onOpenChange, className, title, description, actions, leading, children, contentKey, ...rest }: ResponsiveDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" showCloseButton={false} className={cn('gap-0', className)} data-testid={rest['data-testid']}>
        <header className="sticky top-0 z-sticky flex flex-col gap-2 border-b border-border-subtle bg-surface px-4 py-3">
          {leading}
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <SheetTitle>{title}</SheetTitle>
              {description != null ? (
                <SheetDescription>{description}</SheetDescription>
              ) : (
                <SheetDescription className="sr-only">Details</SheetDescription>
              )}
            </div>
            {actions}
            <Button variant="ghost" size="icon-sm" aria-label="Close details" onClick={() => onOpenChange(false)}>
              <XIcon strokeWidth={1.5} />
            </Button>
          </div>
        </header>
        <Body contentKey={contentKey}>{children}</Body>
      </SheetContent>
    </Sheet>
  );
}

function BottomSheetDrawer({
  open,
  onOpenChange,
  className,
  title,
  description,
  actions,
  leading,
  children,
  contentKey,
  handleLabel = 'Close details',
  ...rest
}: ResponsiveDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} snapPoints={[0.6, 1]} fadeFromIndex={0}>
      <DrawerContent handleLabel={handleLabel} className={cn('h-dvh', className)} data-testid={rest['data-testid']}>
        <div className="flex flex-col gap-2 border-b border-border-subtle px-4 pb-3">
          {leading}
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <DrawerTitle>{title}</DrawerTitle>
              {description != null ? (
                <DrawerDescription>{description}</DrawerDescription>
              ) : (
                <DrawerDescription className="sr-only">Details</DrawerDescription>
              )}
            </div>
            {actions}
          </div>
        </div>
        <Body contentKey={contentKey}>{children}</Body>
      </DrawerContent>
    </Drawer>
  );
}
