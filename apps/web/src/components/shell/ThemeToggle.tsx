import { Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTheme } from '@/lib/theme/context';

/**
 * Light/dark switch. The icon is chosen by CSS (`dark:`), not state, so the prerendered landing
 * never mismatches on hydration.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { toggleTheme } = useTheme();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={className}
          aria-label="Switch between light and dark theme"
          data-testid="theme-toggle"
          onClick={toggleTheme}
        >
          <Sun className="dark:hidden" strokeWidth={1.5} />
          <Moon className="hidden dark:block" strokeWidth={1.5} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Theme</TooltipContent>
    </Tooltip>
  );
}
