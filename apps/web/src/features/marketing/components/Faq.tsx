/** Native <details> FAQ list (keyboard and screen-reader free), styled per marketing.css. */
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';

export interface FaqItem {
  q: string;
  a: ReactNode;
}

export function Faq({ items, className }: { items: readonly FaqItem[]; className?: string }) {
  return (
    <div className={className}>
      {items.map((item) => (
        <details key={item.q} className="mk-faq group border-b border-border-subtle py-1">
          <summary className="flex cursor-pointer items-center gap-4 rounded-sm py-4 text-left text-body-lg font-medium text-fg hover:text-accent-strong focus-visible:focus-ring">
            <span className="flex-1">{item.q}</span>
            <Plus
              className="mk-faq-icon size-4 shrink-0 text-fg-tertiary"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </summary>
          <div className="mk-faq-body pr-8 pb-5 text-body text-fg-secondary">{item.a}</div>
        </details>
      ))}
    </div>
  );
}
