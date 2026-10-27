import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { ThemeToggleButton } from './ThemeToggleButton';

/** Light/dark switch with the shared tooltip (inside the app shell's TooltipProvider). */
export function ThemeToggle({ className }: { className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <ThemeToggleButton className={className} title="" />
      </TooltipTrigger>
      <TooltipContent>Theme</TooltipContent>
    </Tooltip>
  );
}
