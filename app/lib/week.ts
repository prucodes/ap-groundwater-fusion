/** The Monday of the week an ISO date falls in, as ISO: a weekly product is the week of its Monday,
 *  even when a source in it was refreshed mid-week. No data imports, so safe in client components. */
export function mondayOf(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
