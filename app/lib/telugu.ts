/* Telugu for the pages officials take into meetings (the presenter, the district sheets):
   the months, people in lakhs and the units, worded as the share card words them. Digits stay
   Western, as State government documents print them. */

export type Lang = "en" | "te";

export const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const TE_MONTHS = ["జనవరి", "ఫిబ్రవరి", "మార్చి", "ఏప్రిల్", "మే", "జూన్", "జూలై", "ఆగస్టు", "సెప్టెంబర్", "అక్టోబర్", "నవంబర్", "డిసెంబర్"];

/** A month by its English name ("October") or number (1-12), in the language asked for. */
export function monthIn(lang: Lang, month: string | number) {
  const i = typeof month === "number" ? month - 1 : EN_MONTHS.findIndex(m => m.toLowerCase() === month.toLowerCase().slice(0, m.length) || m.slice(0, 3).toLowerCase() === month.slice(0, 3).toLowerCase());
  return i < 0 ? String(month) : (lang === "te" ? TE_MONTHS : EN_MONTHS)[i];
}

/** "October 2026" for a "2026-10" month. */
export function monthYearIn(lang: Lang, ym: string) {
  return `${monthIn(lang, Number(ym.slice(5, 7)))} ${ym.slice(0, 4)}`;
}

/** "October 2026" (English words) turned into the language asked for. */
export function namedMonthIn(lang: Lang, words: string) {
  const [month, year] = words.split(" ");
  return year ? `${monthIn(lang, month)} ${year}` : monthIn(lang, month);
}

/** People in Indian notation: "5.6 lakh" / "5.6 లక్షల". */
export function peopleIn(lang: Lang, n: number) {
  const lakh = (v: number, d: number) => v.toFixed(d);
  if (n >= 1e7) return lang === "te" ? `${lakh(n / 1e7, n >= 1e8 ? 0 : 1)} కోట్ల` : `${lakh(n / 1e7, n >= 1e8 ? 0 : 1)} crore`;
  if (n >= 1e5) return lang === "te" ? `${lakh(n / 1e5, n >= 1e6 ? 0 : 1)} లక్షల` : `${lakh(n / 1e5, n >= 1e6 ? 0 : 1)} lakh`;
  return Math.round(n).toLocaleString("en-IN");
}

/** Metres: "3.5 m" / "3.5 మీ.". */
export const metresIn = (lang: Lang, v: number, digits = 1) => `${v.toFixed(digits)} ${lang === "te" ? "మీ." : "m"}`;

/** A date as "25 Nov 2026" / "25 నవంబర్ 2026". */
export function dayIn(lang: Lang, iso: string | null, withYear = true) {
  if (!iso) return "–";
  const d = Number(iso.slice(8, 10)), m = Number(iso.slice(5, 7)), y = iso.slice(0, 4);
  const month = lang === "te" ? TE_MONTHS[m - 1] : EN_MONTHS[m - 1].slice(0, 3);
  return `${d} ${month}${withYear ? ` ${y}` : ""}`;
}
