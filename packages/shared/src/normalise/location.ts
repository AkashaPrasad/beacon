import type { RemoteMode } from '../constants';

export interface NormalisedLocation {
  raw: string;
  /** Canonical city name, e.g. "Bengaluru". */
  city: string | null;
  /** State / province name when known, e.g. "Karnataka", "California". */
  region: string | null;
  /** ISO 3166-1 alpha-2. */
  country: string | null;
  remote: RemoteMode;
}

export interface KnownCity {
  name: string;
  country: string;
  region?: string;
  aliases: readonly string[];
}

// ── Countries ────────────────────────────────────────────────────────────────

/** [alpha-2, alpha-3, names/aliases..., demonyms...] (all lowercase). */
const COUNTRY_TABLE: readonly (readonly string[])[] = [
  ['IN', 'ind', 'india', 'bharat', 'republic of india', 'indian'],
  [
    'US',
    'usa',
    'united states',
    'united states of america',
    'us',
    'u s',
    'u s a',
    'america',
    'american',
  ],
  [
    'GB',
    'gbr',
    'united kingdom',
    'uk',
    'u k',
    'great britain',
    'britain',
    'england',
    'scotland',
    'wales',
    'northern ireland',
    'british',
    'english',
    'scottish',
    'welsh',
  ],
  ['CA', 'can', 'canada', 'canadian'],
  ['AU', 'aus', 'australia', 'australian'],
  ['NZ', 'nzl', 'new zealand', 'new zealander'],
  ['SG', 'sgp', 'singapore', 'singaporean'],
  ['DE', 'deu', 'germany', 'deutschland', 'german'],
  ['FR', 'fra', 'france', 'french'],
  ['NL', 'nld', 'netherlands', 'the netherlands', 'holland', 'dutch'],
  ['IE', 'irl', 'ireland', 'republic of ireland', 'irish'],
  ['CH', 'che', 'switzerland', 'swiss'],
  ['SE', 'swe', 'sweden', 'swedish'],
  ['NO', 'nor', 'norway', 'norwegian'],
  ['DK', 'dnk', 'denmark', 'danish'],
  ['FI', 'fin', 'finland', 'finnish'],
  ['ES', 'esp', 'spain', 'spanish'],
  ['PT', 'prt', 'portugal', 'portuguese'],
  ['IT', 'ita', 'italy', 'italian'],
  ['PL', 'pol', 'poland', 'polish'],
  ['AT', 'aut', 'austria', 'austrian'],
  ['BE', 'bel', 'belgium', 'belgian'],
  ['CZ', 'cze', 'czechia', 'czech republic', 'czech'],
  ['EE', 'est', 'estonia', 'estonian'],
  ['LU', 'lux', 'luxembourg', 'luxembourgish'],
  ['RO', 'rou', 'romania', 'romanian'],
  ['UA', 'ukr', 'ukraine', 'ukrainian'],
  ['GR', 'grc', 'greece', 'greek'],
  ['HU', 'hun', 'hungary', 'hungarian'],
  ['JP', 'jpn', 'japan', 'japanese'],
  ['KR', 'kor', 'south korea', 'korea', 'republic of korea', 'korean', 'south korean'],
  ['CN', 'chn', 'china', 'prc', 'peoples republic of china', 'chinese'],
  ['HK', 'hkg', 'hong kong', 'hong kong sar'],
  ['TW', 'twn', 'taiwan', 'taiwanese'],
  ['AE', 'are', 'united arab emirates', 'uae', 'u a e', 'emirates', 'emirati'],
  ['SA', 'sau', 'saudi arabia', 'ksa', 'saudi'],
  ['QA', 'qat', 'qatar', 'qatari'],
  ['IL', 'isr', 'israel', 'israeli'],
  ['TR', 'tur', 'turkey', 'turkiye', 'turkish'],
  ['EG', 'egy', 'egypt', 'egyptian'],
  ['NG', 'nga', 'nigeria', 'nigerian'],
  ['KE', 'ken', 'kenya', 'kenyan'],
  ['ZA', 'zaf', 'south africa', 'south african'],
  ['BR', 'bra', 'brazil', 'brasil', 'brazilian'],
  ['MX', 'mex', 'mexico', 'mexican'],
  ['AR', 'arg', 'argentina', 'argentine', 'argentinian'],
  ['CL', 'chl', 'chile', 'chilean'],
  ['CO', 'col', 'colombia', 'colombian'],
  ['ID', 'idn', 'indonesia', 'indonesian'],
  ['MY', 'mys', 'malaysia', 'malaysian'],
  ['PH', 'phl', 'philippines', 'filipino'],
  ['TH', 'tha', 'thailand', 'thai'],
  ['VN', 'vnm', 'vietnam', 'viet nam', 'vietnamese'],
  ['PK', 'pak', 'pakistan', 'pakistani'],
  ['BD', 'bgd', 'bangladesh', 'bangladeshi'],
  ['LK', 'lka', 'sri lanka', 'sri lankan'],
  ['NP', 'npl', 'nepal', 'nepali', 'nepalese'],
];

const COUNTRY_LOOKUP = new Map<string, string>();
for (const [code, ...names] of COUNTRY_TABLE) {
  if (!code) continue;
  COUNTRY_LOOKUP.set(code.toLowerCase(), code);
  for (const name of names) COUNTRY_LOOKUP.set(name, code);
}

/** Lowercase ASCII fold: diacritics removed, punctuation → space, whitespace collapsed. */
function fold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** "India" / "indian" / "IND" / "in" → "IN"; null when unknown. */
export function normaliseCountry(input: string): string | null {
  const key = fold(input);
  return key ? (COUNTRY_LOOKUP.get(key) ?? null) : null;
}

// ── Regions ──────────────────────────────────────────────────────────────────

const INDIAN_STATES: readonly string[] = [
  'Andhra Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Tamil Nadu',
  'Telangana',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
];

const US_STATES: Readonly<Record<string, string>> = {
  AZ: 'Arizona',
  CA: 'California',
  CO: 'Colorado',
  FL: 'Florida',
  GA: 'Georgia',
  IL: 'Illinois',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  NC: 'North Carolina',
  NJ: 'New Jersey',
  NY: 'New York',
  OH: 'Ohio',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  TX: 'Texas',
  UT: 'Utah',
  VA: 'Virginia',
  WA: 'Washington',
};

// ── Cities ───────────────────────────────────────────────────────────────────

const c = (name: string, country: string, region?: string, ...aliases: string[]): KnownCity =>
  region === undefined ? { name, country, aliases } : { name, country, region, aliases };

export const KNOWN_CITIES: readonly KnownCity[] = [
  // India
  c('Bengaluru', 'IN', 'Karnataka', 'bangalore', 'blr', 'bengaluru urban'),
  c('Mumbai', 'IN', 'Maharashtra', 'bombay'),
  c('Navi Mumbai', 'IN', 'Maharashtra'),
  c('Thane', 'IN', 'Maharashtra'),
  c('Pune', 'IN', 'Maharashtra', 'poona'),
  c('Nagpur', 'IN', 'Maharashtra'),
  c('Nashik', 'IN', 'Maharashtra'),
  c('Delhi', 'IN', 'Delhi', 'new delhi', 'delhi ncr', 'ncr'),
  c('Gurugram', 'IN', 'Haryana', 'gurgaon'),
  c('Noida', 'IN', 'Uttar Pradesh', 'greater noida'),
  c('Hyderabad', 'IN', 'Telangana', 'secunderabad', 'cyberabad', 'hyd'),
  c('Warangal', 'IN', 'Telangana'),
  c('Chennai', 'IN', 'Tamil Nadu', 'madras'),
  c('Coimbatore', 'IN', 'Tamil Nadu'),
  c('Madurai', 'IN', 'Tamil Nadu'),
  c('Tiruchirappalli', 'IN', 'Tamil Nadu', 'trichy', 'tiruchi'),
  c('Vellore', 'IN', 'Tamil Nadu'),
  c('Kolkata', 'IN', 'West Bengal', 'calcutta'),
  c('Kharagpur', 'IN', 'West Bengal'),
  c('Ahmedabad', 'IN', 'Gujarat', 'amdavad'),
  c('Gandhinagar', 'IN', 'Gujarat', 'gift city'),
  c('Vadodara', 'IN', 'Gujarat', 'baroda'),
  c('Surat', 'IN', 'Gujarat'),
  c('Jaipur', 'IN', 'Rajasthan'),
  c('Jodhpur', 'IN', 'Rajasthan'),
  c('Pilani', 'IN', 'Rajasthan'),
  c('Kochi', 'IN', 'Kerala', 'cochin', 'ernakulam'),
  c('Thiruvananthapuram', 'IN', 'Kerala', 'trivandrum'),
  c('Chandigarh', 'IN', 'Punjab', 'tricity'),
  c('Mohali', 'IN', 'Punjab'),
  c('Amritsar', 'IN', 'Punjab'),
  c('Ludhiana', 'IN', 'Punjab'),
  c('Indore', 'IN', 'Madhya Pradesh'),
  c('Bhopal', 'IN', 'Madhya Pradesh'),
  c('Bhubaneswar', 'IN', 'Odisha', 'bhubaneshwar'),
  c('Mysuru', 'IN', 'Karnataka', 'mysore'),
  c('Mangaluru', 'IN', 'Karnataka', 'mangalore'),
  c('Manipal', 'IN', 'Karnataka'),
  c('Hubballi', 'IN', 'Karnataka', 'hubli'),
  c('Lucknow', 'IN', 'Uttar Pradesh'),
  c('Kanpur', 'IN', 'Uttar Pradesh'),
  c('Varanasi', 'IN', 'Uttar Pradesh', 'banaras', 'benares'),
  c('Visakhapatnam', 'IN', 'Andhra Pradesh', 'vizag'),
  c('Vijayawada', 'IN', 'Andhra Pradesh'),
  c('Panaji', 'IN', 'Goa', 'panjim'),
  c('Dehradun', 'IN', 'Uttarakhand'),
  c('Roorkee', 'IN', 'Uttarakhand'),
  c('Guwahati', 'IN', 'Assam'),
  c('Patna', 'IN', 'Bihar'),
  c('Ranchi', 'IN', 'Jharkhand'),
  c('Raipur', 'IN', 'Chhattisgarh'),
  c('Srinagar', 'IN', 'Jammu and Kashmir'),
  c('Shimla', 'IN', 'Himachal Pradesh'),
  c('Mandi', 'IN', 'Himachal Pradesh'),
  // North America
  c('San Francisco', 'US', 'California', 'sf', 'san francisco bay area', 'bay area'),
  c('San Jose', 'US', 'California'),
  c('Mountain View', 'US', 'California'),
  c('Palo Alto', 'US', 'California'),
  c('Menlo Park', 'US', 'California'),
  c('Sunnyvale', 'US', 'California'),
  c('Santa Clara', 'US', 'California'),
  c('Cupertino', 'US', 'California'),
  c('Los Angeles', 'US', 'California'),
  c('San Diego', 'US', 'California'),
  c('Seattle', 'US', 'Washington'),
  c('Redmond', 'US', 'Washington'),
  c('Bellevue', 'US', 'Washington'),
  c('New York', 'US', 'New York', 'nyc', 'new york city', 'manhattan', 'brooklyn'),
  c('Boston', 'US', 'Massachusetts'),
  c('Austin', 'US', 'Texas'),
  c('Dallas', 'US', 'Texas'),
  c('Houston', 'US', 'Texas'),
  c('Chicago', 'US', 'Illinois'),
  c('Denver', 'US', 'Colorado'),
  c('Atlanta', 'US', 'Georgia'),
  c('Washington DC', 'US', undefined, 'washington d c', 'washington dc', 'district of columbia'),
  c('Pittsburgh', 'US', 'Pennsylvania'),
  c('Philadelphia', 'US', 'Pennsylvania'),
  c('Toronto', 'CA', 'Ontario'),
  c('Waterloo', 'CA', 'Ontario'),
  c('Ottawa', 'CA', 'Ontario'),
  c('Vancouver', 'CA', 'British Columbia'),
  c('Montreal', 'CA', 'Quebec'),
  c('Mexico City', 'MX', undefined, 'ciudad de mexico', 'cdmx'),
  // Europe
  c('London', 'GB', 'England'),
  c('Manchester', 'GB', 'England'),
  c('Edinburgh', 'GB', 'Scotland'),
  c('Oxford', 'GB', 'England'),
  c('Dublin', 'IE'),
  c('Berlin', 'DE'),
  c('Munich', 'DE', 'Bavaria', 'munchen', 'muenchen'),
  c('Hamburg', 'DE'),
  c('Frankfurt', 'DE'),
  c('Amsterdam', 'NL'),
  c('Eindhoven', 'NL'),
  c('Paris', 'FR'),
  c('Zurich', 'CH', undefined, 'zuerich'),
  c('Geneva', 'CH', undefined, 'geneve'),
  c('Stockholm', 'SE'),
  c('Copenhagen', 'DK'),
  c('Oslo', 'NO'),
  c('Helsinki', 'FI'),
  c('Madrid', 'ES'),
  c('Barcelona', 'ES'),
  c('Lisbon', 'PT', undefined, 'lisboa'),
  c('Milan', 'IT', undefined, 'milano'),
  c('Warsaw', 'PL', undefined, 'warszawa'),
  c('Krakow', 'PL'),
  c('Prague', 'CZ', undefined, 'praha'),
  c('Vienna', 'AT', undefined, 'wien'),
  c('Brussels', 'BE'),
  c('Tallinn', 'EE'),
  // Asia-Pacific & Middle East
  c('Singapore', 'SG'),
  c('Tokyo', 'JP'),
  c('Osaka', 'JP'),
  c('Seoul', 'KR'),
  c('Beijing', 'CN'),
  c('Shanghai', 'CN'),
  c('Shenzhen', 'CN'),
  c('Hong Kong', 'HK'),
  c('Taipei', 'TW'),
  c('Sydney', 'AU', 'New South Wales'),
  c('Melbourne', 'AU', 'Victoria'),
  c('Brisbane', 'AU', 'Queensland'),
  c('Auckland', 'NZ'),
  c('Dubai', 'AE'),
  c('Abu Dhabi', 'AE'),
  c('Riyadh', 'SA'),
  c('Doha', 'QA'),
  c('Tel Aviv', 'IL', undefined, 'tel aviv yafo'),
  c('Jakarta', 'ID'),
  c('Kuala Lumpur', 'MY'),
  c('Manila', 'PH'),
  c('Bangkok', 'TH'),
  c('Ho Chi Minh City', 'VN', undefined, 'saigon', 'hcmc'),
  c('Hanoi', 'VN'),
  c('Karachi', 'PK'),
  c('Lahore', 'PK'),
  c('Dhaka', 'BD'),
  c('Colombo', 'LK'),
  c('Kathmandu', 'NP'),
  // Africa & South America
  c('Cairo', 'EG'),
  c('Lagos', 'NG'),
  c('Nairobi', 'KE'),
  c('Cape Town', 'ZA'),
  c('Johannesburg', 'ZA'),
  c('Sao Paulo', 'BR'),
  c('Buenos Aires', 'AR'),
  c('Bogota', 'CO'),
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function alternation(keys: Iterable<string>): RegExp {
  const sorted = [...keys].sort((a, b) => b.length - a.length).map(escapeRegex);
  return new RegExp(`(?:^|\\s)(${sorted.join('|')})(?=\\s|$)`);
}

const CITY_LOOKUP = new Map<string, KnownCity>();
for (const city of KNOWN_CITIES) {
  CITY_LOOKUP.set(fold(city.name), city);
  for (const alias of city.aliases) CITY_LOOKUP.set(fold(alias), city);
}
const CITY_RE = alternation(CITY_LOOKUP.keys());

const REGION_LOOKUP = new Map<string, { region: string; country: string }>(
  INDIAN_STATES.map((state) => [fold(state), { region: state, country: 'IN' }]),
);
for (const name of Object.values(US_STATES))
  REGION_LOOKUP.set(fold(name), { region: name, country: 'US' });
REGION_LOOKUP.delete('washington'); // ambiguous with Washington DC; only ", WA" resolves the state
REGION_LOOKUP.delete('new york'); // handled as a city
REGION_LOOKUP.delete('delhi'); // handled as a city
const REGION_RE = alternation(REGION_LOOKUP.keys());

/** Country names (not 2/3-letter codes, which are too ambiguous in free text). */
const COUNTRY_NAME_KEYS = [...COUNTRY_LOOKUP.keys()].filter((k) => k.length > 3 || k.includes(' '));
const COUNTRY_RE = alternation([...COUNTRY_NAME_KEYS, 'usa', 'uae', 'ksa']);
/** Upper-case country codes in the raw text ("Remote, US", "Berlin, DE"). CA is California. */
const COUNTRY_CODE_RE =
  /(?:^|[\s,(/|-])(US|USA|UK|IN|IND|UAE|DE|SG|AU|NL|FR|IE|JP|GB)(?=$|[\s,)/|-])/;
const US_STATE_CODE_RE = new RegExp(`,\\s*(${Object.keys(US_STATES).join('|')})\\b`);

// ── Remote inference ─────────────────────────────────────────────────────────

const REMOTE_NEGATION =
  /\b(no|not|non)[\s-]+remote\b|\bremote\s+(is\s+)?(not|isn't|unavailable)\b|\b(on ?site|in ?office|in[- ]person|office)[\s-]+only\b/i;
const HYBRID_CUE =
  /\bhybrid\b|\bflexible (work|location|working)\b|\bpartially remote\b|\bpart[- ]remote\b/i;
const REMOTE_CUE =
  /\b(remote|remotely|wfh|work from home|work from anywhere|wfa|anywhere|distributed|telecommute|telework|virtual|online|fully remote)\b/i;
const ONSITE_CUE =
  /\b(on[- ]?site|in[- ]?office|in[- ]person|office[- ]based|work from office|wfo|offline|on[- ]?campus|on[- ]?premises?)\b/i;
const REMOTE_OR_HYBRID =
  /\bremote\s*(\/|\bor\b|\||,|&|\band\b)\s*hybrid\b|\bhybrid\s*(\/|\bor\b|\||,|&|\band\b)\s*remote\b/i;

/**
 * Work arrangement from free text. Precedence: explicit negation ("no remote") → onsite;
 * "remote/hybrid" alternatives → remote; hybrid → hybrid; remote → remote; on-site cue →
 * onsite; otherwise unknown. (A bare city is resolved to onsite by `normaliseLocation`.)
 */
export function inferRemote(text: string): RemoteMode {
  if (!text.trim()) return 'unknown';
  if (REMOTE_NEGATION.test(text)) return 'onsite';
  if (REMOTE_OR_HYBRID.test(text)) return 'remote';
  if (HYBRID_CUE.test(text)) return 'hybrid';
  if (REMOTE_CUE.test(text)) return 'remote';
  if (ONSITE_CUE.test(text)) return 'onsite';
  return 'unknown';
}

// ── Location ─────────────────────────────────────────────────────────────────

/**
 * Parse a free-text location ("Bangalore/Remote", "San Francisco, CA", "Hybrid - Pune",
 * "Remote (India)") into city / region / country and a work arrangement.
 */
export function normaliseLocation(raw: string): NormalisedLocation {
  const folded = fold(raw);
  const result: NormalisedLocation = {
    raw,
    city: null,
    region: null,
    country: null,
    remote: inferRemote(raw),
  };
  if (!folded) return result;

  const cityKey = CITY_RE.exec(folded)?.[1];
  const city = cityKey ? CITY_LOOKUP.get(cityKey) : undefined;
  if (city) {
    result.city = city.name;
    result.region = city.region ?? null;
    result.country = city.country;
  }

  if (!result.region) {
    const stateCode = US_STATE_CODE_RE.exec(raw)?.[1];
    const regionKey = REGION_RE.exec(folded)?.[1];
    const region = regionKey ? REGION_LOOKUP.get(regionKey) : undefined;
    if (stateCode && (!result.country || result.country === 'US')) {
      result.region = US_STATES[stateCode] ?? null;
      result.country = 'US';
    } else if (region && (!result.country || result.country === region.country)) {
      result.region = region.region;
      result.country = region.country;
    }
  }

  if (!result.country) {
    const name = COUNTRY_RE.exec(folded)?.[1];
    const code = COUNTRY_CODE_RE.exec(raw)?.[1];
    result.country = (name && COUNTRY_LOOKUP.get(name)) || (code && normaliseCountry(code)) || null;
  }

  if (result.remote === 'unknown' && (result.city || result.region)) result.remote = 'onsite';
  return result;
}

export function normaliseLocations(raws: readonly string[]): NormalisedLocation[] {
  return raws.map((raw) => normaliseLocation(raw));
}
