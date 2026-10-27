import type * as React from 'react';

import { cn } from '@/lib/utils';

import { controlClasses } from './styles';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        controlClasses,
        'h-control px-3 file:mr-3 file:inline-flex file:h-full file:border-0 file:bg-transparent file:text-small file:font-medium file:text-fg',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
