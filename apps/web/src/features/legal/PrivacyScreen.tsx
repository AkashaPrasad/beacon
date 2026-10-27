import { LegalPage } from './LegalPage';

/** `/privacy`: the same facts as the consent screen (USERFLOW §1.2), in full. */
export function Component() {
  return (
    <LegalPage testId="privacy-page" title="Privacy" updated="27 Oct 2026">
      <p>
        Beacon ranks opportunities against your resume and preferences. This page says what it
        stores, where, who else sees it, and how to take it back.
      </p>
      <section className="flex flex-col gap-3">
        <h2>What we store</h2>
        <ul>
          <li>Your Google name, email address and profile photo, to create your account.</li>
          <li>
            Your resume file and the profile parsed from it (skills, education, graduation year,
            links).
          </li>
          <li>
            Your preferences, sources, saved and hidden listings, tracker, alert rules and
            notifications.
          </li>
        </ul>
        <p>
          Data lives in MongoDB Atlas in the Mumbai region. Files are encrypted at rest. An API key
          you bring is encrypted with AES-256-GCM and only its last four characters are ever shown
          back.
        </p>
      </section>
      <section className="flex flex-col gap-3">
        <h2>AI, and what leaves our server</h2>
        <p>
          You choose on the first screen and can change it any time in Settings. With{' '}
          <strong>Beacon&apos;s AI</strong>, your resume text and the listings you open are sent to
          Meta&apos;s Model API to extract skills, explain fits and suggest tailoring tips;
          Meta&apos;s free contributor tier may use prompts to improve its models. With{' '}
          <strong>your own key</strong>, the same requests go to the provider you configure. With{' '}
          <strong>AI off</strong>, nothing is sent to an AI provider and ranking uses embeddings and
          rules only.
        </p>
      </section>
      <section className="flex flex-col gap-3">
        <h2>What we never do</h2>
        <ul>
          <li>Sell your data, show ads, or share your profile with companies.</li>
          <li>Apply to anything on your behalf, or send email in your name.</li>
          <li>Send marketing email. Alerts are web push and in-app only, and you set the rules.</li>
        </ul>
      </section>
      <section className="flex flex-col gap-3">
        <h2>You stay in control</h2>
        <p>
          Settings › Privacy &amp; data exports everything as JSON and deletes your account.
          Deleting removes your profile, resume, sources, tracker, alerts, notifications and push
          subscriptions immediately.
        </p>
      </section>
      <p className="text-small text-fg-tertiary">
        Beacon is open source (MIT). The code that does all of this is at{' '}
        <a
          className="text-accent-strong underline underline-offset-3"
          href="https://github.com/AkashaPrasad/beacon"
        >
          github.com/AkashaPrasad/beacon
        </a>
        .
      </p>
    </LegalPage>
  );
}
