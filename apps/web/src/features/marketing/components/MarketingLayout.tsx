/**
 * Shared frame for every public page: glass nav (mark, links, Sign in / Get started — "Open Beacon"
 * when a session is likely), a phone menu, the footer, and the page's <head> tags. SSR-safe: the
 * signed-in state only resolves after hydration, so the prerendered nav always shows the anonymous pair.
 */
import { ArrowRight, Menu, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';

import { useMe } from '@/api/me';
import { BeaconLockup, BeaconMark } from '@/components/brand/BeaconMark';
import { ThemeToggleButton } from '@/components/shell/ThemeToggleButton';
import { Button } from '@/components/ui/button';
import { sessionHint } from '@/lib/storage';
import { useHydrated } from '@/lib/use-hydrated';
import { cn } from '@/lib/utils';
import { springs, tweens } from '@kestrel/ui';

import { Seo } from './Seo';
import type { PublicPage } from '../content/pages';
import { BRAND_LINE, FOOTER_COLUMNS, NAV_LINKS, REPO_URL } from '../content/site';

function useSignedIn(): boolean {
  const hydrated = useHydrated();
  const { data: me } = useMe({ enabled: hydrated && sessionHint.get() });
  return Boolean(me);
}

function PrimaryCta({ signedIn, className }: { signedIn: boolean; className?: string }) {
  return (
    <Button asChild variant="primary" size="md" className={cn('group gap-1.5', className)}>
      <Link to={signedIn ? '/radar' : '/login'} data-testid="mk-cta">
        {signedIn ? 'Open Beacon' : 'Start with your resume'}
        <ArrowRight
          className="size-4 transition-transform duration-fast group-hover:translate-x-0.5"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </Link>
    </Button>
  );
}

export function MarketingNav() {
  const signedIn = useSignedIn();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  const [menuPath, setMenuPath] = useState(location.pathname);
  if (menuPath !== location.pathname) {
    setMenuPath(location.pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const link = ({ isActive }: { isActive: boolean }) =>
    cn(
      'press inline-flex h-control-sm items-center rounded-sm px-2.5 text-body transition-colors duration-fast focus-visible:focus-ring',
      isActive ? 'text-fg' : 'text-fg-secondary hover:bg-surface-hover hover:text-fg',
    );

  return (
    <header className="sticky top-0 z-topbar pt-safe">
      <div
        aria-hidden="true"
        className={cn(
          'absolute inset-0 border-b border-border-subtle mk-glass transition-opacity duration-base ease-out',
          scrolled || open ? 'opacity-100' : 'opacity-0',
        )}
      />
      <nav
        aria-label="Main"
        className="relative mx-auto flex h-14 max-w-content items-center gap-1 px-gutter"
      >
        <Link
          to="/"
          aria-label="Beacon home"
          className="-ml-1 mr-2 rounded-sm px-1 py-0.5 focus-visible:focus-ring"
        >
          <BeaconLockup markClassName="text-accent-strong" />
        </Link>
        <div className="hidden items-center gap-0.5 md:flex">
          {NAV_LINKS.map((n) => (
            <NavLink key={n.to} to={n.to} className={link}>
              {n.label}
            </NavLink>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggleButton />
          {!signedIn && (
            <Link
              to="/login"
              className="press hidden h-control-sm items-center rounded-sm px-2.5 text-body text-fg-secondary hover:bg-surface-hover hover:text-fg focus-visible:focus-ring sm:inline-flex"
            >
              Sign in
            </Link>
          )}
          <PrimaryCta signedIn={signedIn} className="hidden sm:inline-flex" />
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-expanded={open}
            aria-controls="mk-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X strokeWidth={1.5} /> : <Menu strokeWidth={1.5} />}
          </Button>
        </div>
      </nav>
      <AnimatePresence>
        {open && (
          <m.div
            id="mk-menu"
            key="menu"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0, transition: springs.snappy }}
            exit={{ opacity: 0, y: -6, transition: tweens.exit }}
            className="relative border-b border-border-subtle mk-glass md:hidden"
          >
            <div className="mx-auto flex max-w-content flex-col gap-1 px-gutter py-3">
              {NAV_LINKS.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  className={({ isActive }) =>
                    cn(
                      'press flex h-control items-center rounded-sm px-3 text-body-lg focus-visible:focus-ring',
                      isActive
                        ? 'bg-surface-hover text-fg'
                        : 'text-fg-secondary hover:bg-surface-hover hover:text-fg',
                    )
                  }
                >
                  {n.label}
                </NavLink>
              ))}
              <div className="mt-2 flex flex-col gap-2 border-t border-border-subtle pt-3">
                <PrimaryCta signedIn={signedIn} className="w-full" />
                {!signedIn && (
                  <Button asChild variant="secondary" size="md" className="w-full">
                    <Link to="/login">Sign in</Link>
                  </Button>
                )}
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </header>
  );
}

export function MarketingFooter() {
  const link =
    'rounded-xs text-small text-fg-secondary underline-offset-3 hover:text-fg hover:underline focus-visible:focus-ring';
  return (
    <footer className="relative border-t border-border-subtle bg-bg">
      <div className="mx-auto grid max-w-content gap-10 px-gutter py-14 pb-[calc(3.5rem+var(--safe-bottom))] md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="flex flex-col gap-3">
          <BeaconLockup markClassName="text-accent-strong" />
          <p className="max-w-xs text-body text-fg-secondary">{BRAND_LINE}</p>
          <p className="text-caption text-fg-tertiary">
            Free and open source (MIT). Built for students in tech, from your first hackathon to
            your first offer.
          </p>
        </div>
        {FOOTER_COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title} className="flex flex-col gap-2.5">
            <p className="text-label text-fg-tertiary uppercase">{col.title}</p>
            {col.links.map((l) =>
              l.href.startsWith('/') ? (
                <Link key={l.label} to={l.href} className={link}>
                  {l.label}
                </Link>
              ) : (
                <a key={l.label} href={l.href} className={link} rel="noopener noreferrer">
                  {l.label}
                </a>
              ),
            )}
          </nav>
        ))}
      </div>
      <div className="border-t border-border-subtle">
        <div className="mx-auto flex max-w-content flex-wrap items-center gap-x-6 gap-y-2 px-gutter py-5 text-caption text-fg-tertiary">
          <span className="inline-flex items-center gap-2">
            <BeaconMark className="size-4 text-accent-strong" /> Beacon · {new Date().getFullYear()}
          </span>
          <a
            href={REPO_URL}
            rel="noopener noreferrer"
            className="rounded-xs hover:text-fg focus-visible:focus-ring"
          >
            Source on GitHub
          </a>
          <span className="ml-auto">beacon.spacesdrive.cc</span>
        </div>
      </div>
    </footer>
  );
}

export function MarketingLayout({
  page,
  testId,
  children,
}: {
  page: PublicPage;
  testId: string;
  children: ReactNode;
}) {
  return (
    <div data-testid={testId} className="flex min-h-dvh flex-col bg-bg text-fg">
      <Seo page={page} />
      <MarketingNav />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}

/** Standard page opener for the text pages: eyebrow, serif title, lede. */
export function PageIntro({
  eyebrow,
  title,
  lede,
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto max-w-content px-gutter pt-14 pb-10 md:pt-20 md:pb-14', className)}>
      <p className="text-label text-accent-strong uppercase">{eyebrow}</p>
      <h1 className="mk-display mt-3 max-w-4xl text-balance text-fg">{title}</h1>
      {lede && <p className="mk-lede mt-5 max-w-2xl text-fg-secondary">{lede}</p>}
    </div>
  );
}
