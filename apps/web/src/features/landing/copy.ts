/**
 * Landing copy (DESIGN §6.3, §8 voice). Lives in the eager chunk so every scene's words are in the
 * prerendered HTML; the lazy scene bodies import the same strings.
 */
export const HERO = {
  headline: ['Every opportunity', 'that fits you.'],
  headlineTail: "Nothing that doesn't.",
  caption: 'Free. Bring your own AI key, or switch AI off.',
} as const;

export const STORY = {
  title: 'One signal out of the noise.',
  acts: [
    {
      key: 'sources',
      label: 'Sources',
      title: '338 sources. Watched for you.',
      line: 'Company job boards, hackathon calendars and scholarship lists, checked every few hours.',
    },
    {
      key: 'fit',
      label: 'Fit',
      title: 'Ranked against your resume. With the working shown.',
      line: 'Every score breaks down into meaning, skills, role, eligibility, location and freshness.',
    },
    {
      key: 'alerts',
      label: 'Alerts',
      title: 'And it tells you the moment one fits.',
      line: 'A web push or an in-app note when a strong fit opens. No email, no spam.',
    },
  ],
} as const;

export const TIMELINE = {
  title: 'Every deadline on one line.',
  line: 'Saved and tracked listings land on a timeline, with reminders 7, 3 and 1 day before each closes.',
  counter: { value: 6, rest: 'deadlines in the next 14 days' },
} as const;

export const EXPLAINER = {
  title: 'Every score shows its working.',
  line: 'Drag a weight. The score, its breakdown and the ranking move with it.',
  note: 'Weights are yours to change any time in Settings.',
} as const;

export const PRIVACY = {
  title: 'Your data, plainly.',
  body: 'Your resume is parsed on our server. AI is optional: use ours, bring your own key, or switch it off. Export or delete everything, any time.',
  facts: [
    { title: 'Free', body: 'No paywall, no ads, no premium tier.' },
    { title: 'Yours to take', body: 'Export everything as JSON, or delete your account from Settings.' },
    { title: 'AI off still works', body: 'Embeddings and rules rank every listing. Only tailoring tips need AI.' },
  ],
  dont: "What Beacon doesn't do: send email or chat spam, sell or share your data, show ads, or apply anywhere on your behalf.",
} as const;

export const FINALE = {
  title: 'Your radar is ready when you are.',
  line: 'About three minutes from here to a ranked radar. Every step after sign-in can be skipped.',
} as const;
