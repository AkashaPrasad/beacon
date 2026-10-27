/** `/packs` — the public, searchable directory of every source Beacon ships with. */
import { useVirtualizer } from '@tanstack/react-virtual';
import { ExternalLink, Search } from 'lucide-react';
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { CompanyLogo } from '@kestrel/ui';

import { Band, Container, Eyebrow } from '../components/Atmosphere';
import { MarketingLayout, PageIntro } from '../components/MarketingLayout';
import { TypePill } from '../components/TypePill';
import {
  countBy,
  DIRECTORY,
  DIRECTORY_PACKS,
  kindLabel,
  PATH_LABEL,
  TYPE_LABEL,
  type DirectorySource,
  type DirectoryType,
  type ReadPath,
} from '../content/directory';
import { PUBLIC_PAGES } from '../content/pages';
import { requestSourceUrl, SEED } from '../content/site';

const ROW_H = 56;
const PATHS: ReadPath[] = ['ats', 'api', 'feed', 'crawl'];
const TYPES = Object.keys(TYPE_LABEL) as DirectoryType[];

function Chip({
  on,
  onClick,
  children,
  count,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'press inline-flex h-control-sm items-center gap-1.5 rounded-full border px-3 text-small transition-colors duration-fast focus-visible:focus-ring',
        on
          ? 'border-accent-strong bg-accent-subtle text-fg'
          : 'border-border text-fg-secondary hover:border-border-strong hover:text-fg',
      )}
    >
      {children}
      {count !== undefined && (
        <span className="font-mono text-mono-sm text-fg-tertiary">{count}</span>
      )}
    </button>
  );
}

function RowView({ s }: { s: DirectorySource }) {
  return (
    <div className="flex h-full items-center gap-3 border-b border-border-subtle px-3">
      <CompanyLogo name={s.name} domain={s.domain} size={28} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2">
          <span className="truncate text-body font-medium text-fg">{s.name}</span>
          <span className="hidden rounded-xs bg-surface-sunken px-1.5 py-0.5 font-mono text-mono-sm text-fg-tertiary sm:inline">
            {kindLabel(s.kind)}
          </span>
        </span>
        <span className="flex items-center gap-1.5 overflow-hidden text-caption text-fg-tertiary">
          <span className="truncate">{s.pack.name}</span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0">{s.country}</span>
          {s.verifiedCount !== null && (
            <>
              <span aria-hidden="true">·</span>
              <span className="shrink-0 font-mono">{s.verifiedCount} open</span>
            </>
          )}
        </span>
      </span>
      <span className="hidden items-center gap-1 lg:flex">
        {s.types.slice(0, 3).map((t) => (
          <TypePill key={t} type={t} />
        ))}
      </span>
      <span
        className={cn(
          'hidden shrink-0 rounded-xs px-1.5 py-0.5 text-caption md:inline',
          s.path === 'ats'
            ? 'bg-success-subtle text-success'
            : s.path === 'crawl'
              ? 'bg-warning-subtle text-warning'
              : 'bg-surface-sunken text-fg-secondary',
        )}
      >
        {PATH_LABEL[s.path]}
      </span>
      <a
        href={s.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${s.name} (new tab)`}
        className="press-icon grid size-8 shrink-0 place-items-center rounded-sm text-fg-tertiary hover:bg-surface-hover hover:text-fg focus-visible:focus-ring"
      >
        <ExternalLink className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </a>
    </div>
  );
}

export function Component() {
  const [q, setQ] = useState('');
  const query = useDeferredValue(q.trim().toLowerCase());
  const [pack, setPack] = useState<string | null>(null);
  const [path, setPath] = useState<ReadPath | null>(null);
  const [type, setType] = useState<DirectoryType | null>(null);

  const rows = useMemo(
    () =>
      DIRECTORY.filter(
        (s) =>
          (!query || s.search.includes(query)) &&
          (!pack || s.pack.id === pack) &&
          (!path || s.path === path) &&
          (!type || s.types.includes(type)),
      ),
    [query, pack, path, type],
  );
  const byPack = useMemo(() => countBy(DIRECTORY, (s) => s.pack.id), []);
  const byPath = useMemo(() => countBy(DIRECTORY, (s) => s.path), []);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 8,
  });

  return (
    <MarketingLayout page={PUBLIC_PAGES.sources} testId="sources-directory-page">
      <Band tone="wash" wash="b" grid={false}>
        <PageIntro
          eyebrow="Source directory"
          title={
            <>
              {SEED.sources} sources. <em className="text-accent-strong">Every</em> one checked.
            </>
          }
          lede={`Seven packs you can switch on in a click, each source verified on ${SEED.verifiedOn}. Most are free ATS feeds; the rest are public APIs, feeds and a few crawled pages.`}
        />
        <Container className="pb-24">
          <div className="mk-panel mk-rim overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-border-subtle p-4">
              <label className="relative block">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-tertiary"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search a company, programme or pack"
                  aria-label="Search sources"
                  className="pl-9"
                  data-testid="sources-directory-search"
                />
              </label>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Packs">
                <Chip on={pack === null} onClick={() => setPack(null)}>
                  All packs
                </Chip>
                {DIRECTORY_PACKS.map((p) => (
                  <Chip
                    key={p.id}
                    on={pack === p.id}
                    onClick={() => setPack(pack === p.id ? null : p.id)}
                    count={byPack[p.id] ?? 0}
                  >
                    {p.name}
                  </Chip>
                ))}
              </div>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="How it is read and what it lists"
              >
                {PATHS.map((p) => (
                  <Chip
                    key={p}
                    on={path === p}
                    onClick={() => setPath(path === p ? null : p)}
                    count={byPath[p] ?? 0}
                  >
                    {PATH_LABEL[p]}
                  </Chip>
                ))}
                <span
                  aria-hidden="true"
                  className="mx-1 hidden w-px self-stretch bg-border sm:block"
                />
                {TYPES.map((t) => (
                  <Chip key={t} on={type === t} onClick={() => setType(type === t ? null : t)}>
                    {TYPE_LABEL[t]}
                  </Chip>
                ))}
              </div>
            </div>
            <p
              className="border-b border-border-subtle px-4 py-2 font-mono text-mono-sm text-fg-tertiary"
              aria-live="polite"
            >
              {rows.length} of {DIRECTORY.length} sources
            </p>
            <div
              ref={parentRef}
              className="h-[32rem] overflow-y-auto"
              data-testid="sources-directory-list"
            >
              {rows.length === 0 ? (
                <div className="grid h-full place-items-center p-8 text-center">
                  <div>
                    <p className="text-body text-fg">Nothing matches that yet.</p>
                    <p className="mt-1 text-small text-fg-secondary">
                      Try a shorter search, or ask for the source to be added.
                    </p>
                    <Button asChild variant="secondary" size="sm" className="mt-4">
                      <a href={requestSourceUrl(q)} rel="noopener noreferrer">
                        Request “{q || 'a source'}”
                      </a>
                    </Button>
                  </div>
                </div>
              ) : (
                <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                  {virtualizer.getVirtualItems().map((v) => {
                    const s = rows[v.index]!;
                    return (
                      <div
                        key={s.id}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: v.size,
                          transform: `translateY(${v.start}px)`,
                        }}
                      >
                        <RowView s={s} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="mk-tile p-6">
              <Eyebrow>Add your own</Eyebrow>
              <h2 className="mt-2 text-h2 text-fg">Any URL works.</h2>
              <p className="mt-2 text-body text-fg-secondary">
                Paste a careers page, a hackathon site or a scholarship list inside Beacon. It
                detects an ATS board, a public API or a feed before falling back to a crawl, and
                shows you what it found before you add it.
              </p>
              <Button asChild variant="primary" size="md" className="mt-4">
                <Link to="/login">Add a source</Link>
              </Button>
            </div>
            <div className="mk-tile p-6">
              <Eyebrow>Missing something?</Eyebrow>
              <h2 className="mt-2 text-h2 text-fg">Ask for a source in the shared packs.</h2>
              <p className="mt-2 text-body text-fg-secondary">
                Requests land as GitHub issues; verified sources join the packs for everyone.
              </p>
              <Button asChild variant="secondary" size="md" className="mt-4">
                <a href={requestSourceUrl()} rel="noopener noreferrer">
                  Request a source
                </a>
              </Button>
            </div>
          </div>
        </Container>
      </Band>
    </MarketingLayout>
  );
}
