import { useNavigate } from 'react-router';

import { useShortcut, useShortcutScope } from '@/lib/shortcuts';
import { parentPath, useBackNavigation } from '@/lib/use-back-navigation';
import { PageHeader, type PageHeaderPager, type PageHeaderProps } from '@kestrel/ui';

export interface DetailPageHeaderProps
  extends Omit<PageHeaderProps, 'back' | 'breadcrumbs' | 'pager'> {
  /** The list this page belongs to: Back's label and fallback ("Radar", "/radar"). */
  parent: { label: string; to?: string };
  /** Trail after the parent, e.g. `['Packs', 'Hackathons — India & global']`; the last is this page. */
  trail?: (string | { label: string; to: string })[];
  pager?: PageHeaderPager;
}

/**
 * Header for full-page detail views (page-based navigation, docs/WEB.md §4): Back (in-app history,
 * else the parent; `Esc` / `Backspace` outside fields), the breadcrumb trail, and prev/next (`k` / `j`).
 *
 *   <DetailPageHeader parent={{ label: 'Radar', to: '/radar' }} trail={[listing.title]}
 *     title={listing.title} pager={{ onPrev, onNext, position: '3 of 142' }} actions={…} />
 */
export function DetailPageHeader({ parent, trail = [], pager, ...props }: DetailPageHeaderProps) {
  const navigate = useNavigate();
  const back = useBackNavigation(parent.to);
  useShortcutScope('detail');
  useShortcut('escape', back, {
    description: `Back to ${parent.label}`,
    group: 'Detail page',
    scope: 'detail',
    allowInInput: false,
  });
  useShortcut('backspace', back, { scope: 'detail' });
  useShortcut('k', () => pager?.onPrev?.(), {
    description: 'Previous item',
    group: 'Detail page',
    scope: 'detail',
    enabled: Boolean(pager?.onPrev),
  });
  useShortcut('j', () => pager?.onNext?.(), {
    description: 'Next item',
    group: 'Detail page',
    scope: 'detail',
    enabled: Boolean(pager?.onNext),
  });

  const parentHref = parent.to ?? parentPath(typeof window === 'undefined' ? '/' : window.location.pathname);
  const crumbs = [
    { label: parent.label, href: parentHref, onNavigate: () => void navigate(parentHref, { viewTransition: true }) },
    ...trail.map((item) =>
      typeof item === 'string'
        ? { label: item }
        : { label: item.label, href: item.to, onNavigate: () => void navigate(item.to, { viewTransition: true }) },
    ),
  ];

  return <PageHeader back={{ label: parent.label, onBack: back, href: parentHref }} breadcrumbs={crumbs} pager={pager} {...props} />;
}
