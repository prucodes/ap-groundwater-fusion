/** Formatting for the dated water context. Manual rather than Intl, so the
 * server render and the browser's hydration always produce the same text. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "1 Oct 2026" from an ISO date or timestamp; the date as written, no timezone shift. */
export function day(iso: string | null | undefined, withYear = true) {
  if (!iso) return "date unconfirmed";
  const [year, month, date] = iso.slice(0, 10).split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1] ?? month}${withYear ? ` ${year}` : ""}`;
}

/** "Jun to Aug" from a month span written "06-08". */
export function monthSpan(span: string) {
  const [first, last] = span.split("-").map(month => MONTHS[Number(month) - 1] ?? month);
  return last && last !== first ? `${first} to ${last}` : first;
}

/** "2 Oct 2026, 15:03 IST" from the portal's IST timestamps. */
export function stamp(iso: string | null | undefined) {
  return iso ? `${day(iso)}, ${iso.slice(11, 16)} IST` : "time unknown";
}

/** Signed with a true minus sign. */
export function signed(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  const text = Math.abs(value).toFixed(digits);
  return value > 0 ? `+${text}%` : value < 0 ? `−${text}%` : `${text}%`;
}

export function thousands(value: number) {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** "driest", "2nd driest", "13th driest". */
export function driest(rank: number) {
  if (rank === 1) return "driest";
  const tens = rank % 100, ones = rank % 10;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ones === 1 ? "st" : ones === 2 ? "nd" : ones === 3 ? "rd" : "th";
  return `${rank}${suffix} driest`;
}

/** Title case for the portal's ALL-CAPS names; mixed-case names pass through. */
export function placeName(value: string) {
  if (/[a-z]/.test(value)) return value;
  return value.toLowerCase().replace(/(^|[\s(\-/.])([a-z])/g, (_, lead: string, letter: string) => lead + letter.toUpperCase()).replace(/\bNtr\b/g, "NTR");
}
