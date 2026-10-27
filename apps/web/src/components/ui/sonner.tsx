import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert } from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

import { useTheme } from '@/lib/theme/context';
import { useMediaQuery } from '@/lib/use-media-query';

/**
 * Toasts (DESIGN §6.1): `overlay`, `border`, `shadow-md`, `rounded-lg`, `body` text, a semantic status
 * icon on the left and a ghost accent action ("Undo"). Bottom-right at 16 px on desktop; bottom-centre
 * above the tab bar on phones. At most 3 visible. No `richColors`.
 */
function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();
  const phone = useMediaQuery('(max-width: 767.98px)');
  return (
    <Sonner
      theme={resolvedTheme}
      position={phone ? 'bottom-center' : 'bottom-right'}
      offset={16}
      mobileOffset={{
        bottom: 'calc(var(--tabbar-h) + var(--safe-bottom) + 12px)',
        left: 12,
        right: 12,
      }}
      visibleToasts={3}
      expand
      duration={5000}
      gap={8}
      containerAriaLabel="Notifications"
      icons={{
        success: <CircleCheck className="size-4 text-success" strokeWidth={1.5} />,
        info: <Info className="size-4 text-info" strokeWidth={1.5} />,
        warning: <TriangleAlert className="size-4 text-warning" strokeWidth={1.5} />,
        error: <CircleAlert className="size-4 text-danger" strokeWidth={1.5} />,
        loading: (
          <LoaderCircle className="size-4 animate-spin text-fg-secondary" strokeWidth={1.5} />
        ),
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'group/toast z-toast flex w-full items-center gap-3 rounded-lg border border-border bg-overlay px-4 py-3 text-body text-fg shadow-md sm:w-(--width)',
          content: 'flex min-w-0 flex-1 flex-col gap-0.5',
          title: 'text-body text-fg',
          description: 'text-small text-fg-secondary',
          icon: 'shrink-0',
          actionButton:
            'ml-auto shrink-0 rounded-sm px-2 py-1 text-body font-medium text-accent-strong press transition-colors duration-fast hover:underline focus-visible:focus-ring',
          cancelButton:
            'shrink-0 rounded-sm px-2 py-1 text-body text-fg-secondary transition-colors duration-fast hover:bg-surface-hover focus-visible:focus-ring',
          closeButton: 'text-fg-tertiary',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
