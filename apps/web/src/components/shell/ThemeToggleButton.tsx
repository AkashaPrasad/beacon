import { Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useTheme } from '@/lib/theme/context';

/**
 * Light/dark switch without a Radix tooltip (public pages keep Radix out of their first-load JS; the
 * native `title` names it on hover). The icon is chosen by CSS (`dark:`), not state, so prerendered
 * markup never mismatches on hydration. In the app shell use `ThemeToggle` (with the shared tooltip).
 */
export function ThemeToggleButton({
  className,
  title = 'Theme',
}: {
  className?: string;
  title?: string;
}) {
  const { toggleTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={className}
      aria-label="Switch between light and dark theme"
      title={title}
      data-testid="theme-toggle"
      onClick={toggleTheme}
    >
      <Sun className="dark:hidden" strokeWidth={1.5} />
      <Moon className="hidden dark:block" strokeWidth={1.5} />
    </Button>
  );
}
