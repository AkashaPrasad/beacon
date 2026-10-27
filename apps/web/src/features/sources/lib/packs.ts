/** One-line "what's in it" per pack (Packs tab, pack sheet). */
export const PACK_BLURBS: Record<string, string> = {
  'top-indian-product': 'Razorpay, CRED, Swiggy and other Indian product companies.',
  'faang-plus-india': 'Global tech companies with engineering teams in India.',
  'yc-startups-interns': 'Early-stage startups that hire interns.',
  'hackathons-india': 'Devpost, MLH, Devfolio and other hackathon calendars.',
  'scholarships-engineering': 'National and private scholarships and fellowships.',
  'remote-friendly-startups': 'Teams that hire remote-first.',
  'opensource-programs': 'GSoC, LFX, MLH Fellowship, Outreachy and more.',
};

/** USERFLOW §6 "Sources · all packs off" → [Turn on recommended packs]. */
export const RECOMMENDED_PACKS = ['top-indian-product', 'faang-plus-india', 'yc-startups-interns', 'hackathons-india'] as const;
