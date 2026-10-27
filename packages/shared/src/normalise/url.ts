/** Query parameters that only carry tracking / session state and never identify a page. */
const TRACKING_PARAM =
  /^(utm_.*|fbclid|gclid|gclsrc|dclid|gbraid|wbraid|msclkid|yclid|twclid|ttclid|li_fat_id|igshid|igsh|mc_cid|mc_eid|_hsenc|_hsmi|__hstc|__hssc|__hsfp|_ga|_gl|ref|ref_src|ref_url|referrer|referer|source|src|trk|trkinfo|trackingid|tracking_id|si|s_kwcid|cmpid|lipi|original_referer|gh_src|lever-source|lever-origin|lever-via|ashby_jid_source|sessionid|session_id|sid|jsessionid|phpsessid|aspsessionid\w*|cfid|cftoken|sessiontoken)$/i;

const LOCAL_HOST = /^(localhost|127(\.\d{1,3}){3}|\[::1\]|0\.0\.0\.0)$/;

export interface NormaliseUrlOptions {
  /** Upgrade http → https (except localhost) so both schemes dedupe. Default true. */
  forceHttps?: boolean;
}

/**
 * Canonicalise a URL for dedup/identity: adds https:// when no scheme, lowercases the host,
 * strips `www.`, credentials, fragments, tracking/session params (utm_*, fbclid, gclid, ref,
 * jsessionid, …) and `;jsessionid=` path params, sorts the query, collapses duplicate
 * slashes and removes the trailing slash. Throws `TypeError` for invalid / non-http(s) URLs.
 */
export function normaliseUrl(input: string, options: NormaliseUrlOptions = {}): string {
  const { forceHttps = true } = options;
  let raw = input.trim();
  if (!raw) throw new TypeError('URL is empty');
  if (!/^[a-z][a-z\d+.-]*:/i.test(raw)) raw = `https://${raw.replace(/^\/+/, '')}`;

  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError(`Unsupported URL scheme "${url.protocol}"`);
  }
  if (!url.hostname) throw new TypeError('URL has no host');

  url.hostname = url.hostname.toLowerCase().replace(/^www\d*\./, '');
  if (forceHttps && url.protocol === 'http:' && !LOCAL_HOST.test(url.hostname)) {
    url.protocol = 'https:';
  }
  url.username = '';
  url.password = '';
  url.hash = '';

  let path = url.pathname.replace(/;jsessionid=[^/]*/gi, '').replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  if (path === '/') path = '';

  const params = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAM.test(key))
    .sort(([ak, av], [bk, bv]) => (ak === bk ? cmp(av, bv) : cmp(ak, bk)));
  const query = new URLSearchParams(params).toString();

  return `${url.protocol}//${url.host}${path}${query ? `?${query}` : ''}`;
}

function cmp(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** `normaliseUrl` that returns null instead of throwing. */
export function tryNormaliseUrl(input: string, options?: NormaliseUrlOptions): string | null {
  try {
    return normaliseUrl(input, options);
  } catch {
    return null;
  }
}
