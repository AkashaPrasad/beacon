/**
 * Logo wall of real sources from the packs (favicon service, letter fallback), as a slow marquee:
 * greyscale at rest, colour on hover, paused on hover/focus, static under reduced motion.
 */
import { Link } from 'react-router';

import { cn } from '@/lib/utils';
import { CompanyLogo, usePrefersReducedMotion } from '@kestrel/ui';

import { DIRECTORY } from '../content/directory';

/** Well-known names first so the wall reads instantly; the rest fill in deterministically. */
const FEATURED = [
  'stripe.com',
  'figma.com',
  'notion.so',
  'razorpay.com',
  'cred.club',
  'swiggy.com',
  'zomato.com',
  'postman.com',
  'browserstack.com',
  'atlassian.com',
  'databricks.com',
  'cloudflare.com',
  'vercel.com',
  'supabase.com',
  'linear.app',
  'anthropic.com',
  'openai.com',
  'huggingface.co',
  'nvidia.com',
  'adobe.com',
  'canva.com',
  'duolingo.com',
  'discord.com',
  'spotify.com',
  'shopify.com',
  'gitlab.com',
  'mongodb.com',
  'snowflake.com',
  'datadoghq.com',
  'okta.com',
  'groww.in',
  'phonepe.com',
  'flipkart.com',
  'zepto.com',
  'meesho.com',
  'devpost.com',
  'devfolio.co',
  'mlh.io',
  'unstop.com',
];

function pick(): { name: string; domain: string }[] {
  const byDomain = new Map<string, string>();
  for (const s of DIRECTORY)
    if (s.domain && !byDomain.has(s.domain)) byDomain.set(s.domain, s.name);
  const out: { name: string; domain: string }[] = [];
  for (const d of FEATURED) {
    const name = byDomain.get(d);
    if (name) out.push({ name, domain: d });
  }
  for (const [domain, name] of byDomain) {
    if (out.length >= 48) break;
    if (!FEATURED.includes(domain)) out.push({ name, domain });
  }
  return out;
}

const LOGOS = pick();

function Tile({ name, domain }: { name: string; domain: string }) {
  return (
    <li className="mk-logo relative flex h-12 shrink-0 items-center gap-2.5 rounded-md border border-border-subtle bg-surface px-3 text-small text-fg-secondary">
      <span className="relative grid size-6 place-items-center">
        <span className="mk-logo-grey absolute inset-0 grid place-items-center">
          <CompanyLogo name={name} domain={domain} size={20} />
        </span>
        <span className="mk-logo-colour grid place-items-center">
          <CompanyLogo name={name} domain={domain} size={20} />
        </span>
      </span>
      <span className="whitespace-nowrap">{name}</span>
    </li>
  );
}

export function LogoMarquee({ className }: { className?: string }) {
  const reduced = usePrefersReducedMotion();
  const half = Math.ceil(LOGOS.length / 2);
  const rows = [LOGOS.slice(0, half), LOGOS.slice(half)];
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {rows.map((row, i) => (
        <div
          key={i}
          className={cn('mk-marquee overflow-hidden', reduced && 'overflow-x-auto scrollbar-none')}
        >
          <ul
            aria-label={i === 0 ? 'Some of the sources Beacon watches' : undefined}
            className={cn(
              'flex w-max gap-3',
              !reduced && 'mk-marquee-track',
              i === 1 && !reduced && '[animation-direction:reverse]',
            )}
          >
            {row.map((l) => (
              <Tile key={l.domain} {...l} />
            ))}
            {!reduced && row.map((l) => <Tile key={`${l.domain}-dup`} {...l} />)}
          </ul>
        </div>
      ))}
      <p className="text-caption text-fg-tertiary">
        Company logos identify sources only; none endorses Beacon.{' '}
        <Link
          to="/packs"
          className="rounded-xs text-accent-strong underline-offset-3 hover:underline focus-visible:focus-ring"
        >
          See all {DIRECTORY.length} sources
        </Link>
      </p>
    </div>
  );
}
