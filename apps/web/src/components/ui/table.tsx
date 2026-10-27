import type * as React from 'react';

import { cn } from '@/lib/utils';

/** Vercel-style dense table: `h-row-table` rows, `border-subtle` dividers, `label`-style headers. */
function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div
      data-slot="table-container"
      tabIndex={0}
      role="region"
      aria-label={props['aria-label'] ?? 'Scrollable data table'}
      className="relative w-full overflow-x-auto focus-visible:focus-ring-inset"
    >
      <table
        data-slot="table"
        className={cn('w-full caption-bottom text-small', className)}
        {...props}
      />
    </div>
  );
}
function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        'sticky top-0 z-sticky bg-surface [&_tr]:border-b [&_tr]:border-border',
        className,
      )}
      {...props}
    />
  );
}
function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  );
}
function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        'border-t border-border bg-surface-sunken font-medium [&>tr]:last:border-b-0',
        className,
      )}
      {...props}
    />
  );
}
function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'h-row-table border-b border-border-subtle transition-colors duration-fast hover:bg-surface-hover has-aria-expanded:bg-surface-hover data-[state=selected]:bg-surface-active',
        className,
      )}
      {...props}
    />
  );
}
function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-9 whitespace-nowrap px-cell text-left align-middle text-label font-medium uppercase text-fg-tertiary [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  );
}
function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'whitespace-nowrap px-cell align-middle text-fg [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  );
}
function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-4 text-small text-fg-tertiary', className)}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
