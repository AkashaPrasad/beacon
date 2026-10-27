/**
 * The API sends dates as ISO-8601 strings (docs/API.md). Shared types use `Date`, so responses are parsed
 * with a reviver that turns full ISO date-times into Dates. Date-only strings ("2026-10-27") stay strings.
 */
const ISO_DATETIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/;

export function reviveDates(_key: string, value: unknown): unknown {
  if (
    typeof value === 'string' &&
    value.length >= 16 &&
    value.length <= 35 &&
    ISO_DATETIME.test(value)
  ) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return value;
}

export function parseJson<T = unknown>(text: string): T {
  return JSON.parse(text, reviveDates) as T;
}
