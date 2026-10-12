/** The ink that reads on a solid colour: white where it clears 4.5:1, else the dark ink.
 *  White on the amber and orange status colours fell to 2.4–3:1. */
const DARK_INK = "#0d2138";

function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const channel = (i: number) => {
    const v = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

export function inkOn(background: string): string {
  const l = luminance(background);
  if (l === null) return "#fff";
  const onWhite = 1.05 / (l + 0.05), onDark = (l + 0.05) / ((luminance(DARK_INK) ?? 0) + 0.05);
  return onWhite >= 4.5 || onWhite >= onDark ? "#fff" : DARK_INK;
}
