/**
 * Landing copy (voice: precise, warm, no hype). Lives in the eager chunk so every scene's words are in
 * the prerendered HTML; the lazy scene bodies import the same strings.
 */
export const HERO = {
  eyebrow: 'For students in tech',
  headline: 'Every opportunity that fits you.',
  /** Second line; the first word is set in italic. */
  headlineTail: { em: 'Nothing', after: " that doesn't." },
  sentence:
    'Beacon watches every career page, hackathon and scholarship you care about and shows you only what fits — with the reason why.',
  cta: 'Start with your resume',
  secondary: 'See how it works',
  caption: 'Free, forever. Bring your own AI key, or switch AI off.',
} as const;

export const PROOF = {
  stats: [
    { value: 338, label: 'sources watched', suffix: '' },
    { value: 7, label: 'curated packs', suffix: '' },
    { value: 222, label: 'free ATS feeds, no crawling', suffix: '' },
    { value: 0, label: 'rupees, ever', prefix: '₹' },
  ],
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

export const SIGNALS = {
  eyebrow: 'Signals you can trust',
  title: 'It knows a ghost when it sees one.',
  line: 'About one listing in five is never meant to be filled. Beacon reads the age, the reposts and the apply link, and says so before you spend an application on it.',
  ghost: {
    title: 'Data Analyst Intern',
    company: 'Lotus Logistics',
    meta: 'Pune · ₹25k/mo',
    stamps: ['Posted 51 days ago', 'Reposted 4×', 'Apply link dead'],
    verdict: 'Likely ghost',
  },
  tracker: {
    eyebrow: 'Tracker',
    title: 'And it nudges you when they go quiet.',
    line: 'Ten days without a reply and Beacon suggests a follow-up. Thirty, and it lets you move on.',
    nudge: 'Northwind has been quiet for 10 days — send a follow-up?',
  },
} as const;

export const EXPLAINER = {
  title: 'Every score shows its working.',
  line: 'Drag a weight. The score, its breakdown and the ranking move with it.',
  note: 'Weights are yours to change any time in Settings.',
} as const;

export const PRIVACY = {
  eyebrow: 'Honest by design',
  title: 'Your data, plainly.',
  body: 'Your resume is parsed on our server. AI is optional: use ours, bring your own key, or switch it off. Export or delete everything, any time.',
  facts: [
    { title: 'Free', body: 'No paywall, no ads, no premium tier.' },
    {
      title: 'Yours to take',
      body: 'Export everything as JSON, or delete your account from Settings.',
    },
    {
      title: 'AI off still works',
      body: 'Embeddings and rules rank every listing. Only tailoring tips need AI.',
    },
  ],
  dont: "What Beacon doesn't do: send email or chat spam, sell or share your data, show ads, or apply anywhere on your behalf.",
} as const;

export const FAQ = [
  {
    q: 'Which opportunities does Beacon cover?',
    a: 'Internships, new-grad roles, hackathons, scholarships and fellowships, research programmes and open-source programmes such as GSoC, LFX and MLH Fellowship — anything with a page Beacon can read.',
  },
  {
    q: 'Can I add my own sources?',
    a: 'Yes. Paste any careers page, hackathon site or scholarship list. Beacon detects the cheapest way to read it (an ATS API, a public API, a feed, or a crawl) and tells you what it found before you add it.',
  },
  {
    q: 'How is the fit score calculated?',
    a: 'Semantic similarity to your profile, skill overlap (required skills weigh double), role alignment, eligibility, location and freshness, minus a ghost-listing penalty. Every component is shown, and the weights are sliders.',
  },
  {
    q: 'Do I have to use AI?',
    a: 'No. With AI off, ranking uses local embeddings and rules and still works well. With AI on, you get resume parsing boosts and written reasons; you can use Beacon’s default or your own key.',
  },
  {
    q: 'Is it really free?',
    a: 'Yes. No paid tier, no paywall on alerts, no ads. It is open source under MIT and you can self-host it.',
  },
] as const;

export const FINALE = {
  title: 'Your radar is ready when you are.',
  line: 'About three minutes from a resume to a ranked radar. Every step after sign-in can be skipped.',
  cta: 'Start with your resume',
} as const;
