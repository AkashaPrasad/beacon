import { PUBLIC_PAGES } from '@/features/marketing/content/pages';

import { LegalPage } from './LegalPage';

/** `/terms`: short, plain terms for a free student tool. */
export function Component() {
  return (
    <LegalPage page={PUBLIC_PAGES.terms} testId="terms-page" title="Terms" updated="27 Oct 2026">
      <p>
        Beacon is a free tool that helps students find and track opportunities. By using it you
        agree to these terms.
      </p>
      <section className="flex flex-col gap-3">
        <h2>Listings come from other sites</h2>
        <p>
          Beacon collects listings from public job boards, careers pages and program sites, and from
          URLs you add. We check apply links and flag listings that look stale, but we can&apos;t
          guarantee that a listing is accurate, open or genuine. Always confirm details on the
          organiser&apos;s own page before you apply.
        </p>
      </section>
      <section className="flex flex-col gap-3">
        <h2>Fit scores are guidance</h2>
        <p>
          A fit score explains how a listing matches your profile and preferences. It is not a
          prediction of an outcome, and every score shows its working so you can judge it yourself.
        </p>
      </section>
      <section className="flex flex-col gap-3">
        <h2>Use it fairly</h2>
        <ul>
          <li>
            Add sources you are allowed to read, and don&apos;t use Beacon to overload anyone&apos;s
            site.
          </li>
          <li>Keep your own API key safe; you are responsible for usage billed to it.</li>
          <li>One account per person.</li>
        </ul>
      </section>
      <section className="flex flex-col gap-3">
        <h2>No warranty</h2>
        <p>
          Beacon is provided as is, without warranty, under the MIT licence. We may change or pause
          the service, and we will say so in the app before anything that affects your data.
        </p>
      </section>
    </LegalPage>
  );
}
