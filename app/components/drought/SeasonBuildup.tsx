import { RAIN_CLASS_META, shortDate, type DroughtWatch, type RainClass } from "../../lib/drought";
import styles from "./Drought.module.css";

const STACK: RainClass[] = ["noRain", "largeDeficient", "deficient", "normal", "excess"];

/** How the season dried: mandals by rainfall-to-date class at each week end,
 * and the count that had run a four-week dry spell by then. */
export function SeasonBuildup({ timeline, facts = [] }: {
  timeline: DroughtWatch["timeline"];
  facts?: { label: string; value: string; note: string }[];
}) {
  if (!timeline.length) return null;
  const width = 640, height = 260, left = 38, right = 14, top = 14, bottom = 30;
  const plotW = width - left - right, plotH = height - top - bottom;
  const totals = timeline.map(t => STACK.reduce((sum, key) => sum + (t.classes[key] ?? 0), 0));
  const max = Math.max(...totals, 1);
  const x = (i: number) => left + (timeline.length === 1 ? plotW / 2 : (i / (timeline.length - 1)) * plotW);
  const y = (value: number) => top + plotH - (value / max) * plotH;

  const layers = STACK.map((key, k) => {
    const lower = timeline.map(t => STACK.slice(0, k).reduce((sum, below) => sum + (t.classes[below] ?? 0), 0));
    const upper = timeline.map((t, i) => lower[i] + (t.classes[key] ?? 0));
    const path = `M${timeline.map((_, i) => `${x(i)},${y(upper[i])}`).join(" L")} L${timeline.map((_, i) => `${x(timeline.length - 1 - i)},${y(lower[timeline.length - 1 - i])}`).join(" L")} Z`;
    return { key, path };
  });
  // The dry-spell count only ever rises; Trigger 1 itself also counts early-June
  // large deficits that later rain undid, so the line is the spell count.
  const trigger = timeline.map((t, i) => `${x(i)},${y(t.drySpell)}`).join(" ");
  const last = timeline[timeline.length - 1];
  const ticks = [0, Math.round(max / 2 / 100) * 100, max].filter((v, i, all) => all.indexOf(v) === i);

  return (
    <div className={styles.chartCard}>
      <h3>How the season dried</h3>
      <p>Mandals by rainfall so far at the end of each week, and how many had already run four dry weeks in a row (the line). Measured, AP DES gauges.</p>
      <svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} role="img"
        aria-label={`By ${shortDate(last.end)}, ${last.classes.deficient} mandals deficient and ${last.classes.largeDeficient} large deficient for the season; ${last.drySpell} had run a four-week dry spell.`}>
        {ticks.map(value => (
          <g key={value}>
            <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="var(--line)" strokeDasharray="3 4" />
            <text x={left - 6} y={y(value) + 3} textAnchor="end">{value}</text>
          </g>
        ))}
        {layers.map(layer => <path key={layer.key} d={layer.path} fill={RAIN_CLASS_META[layer.key].color} fillOpacity={.82} />)}
        <polyline points={trigger} fill="none" stroke="var(--ink)" strokeWidth={2.4} strokeLinejoin="round" />
        {timeline.map((t, i) => {
          const lastIndex = timeline.length - 1;
          const show = i === lastIndex || (i % 3 === 0 && lastIndex - i >= 2);
          return show ? <text key={t.end} x={x(i)} y={height - 10} textAnchor={i === lastIndex ? "end" : "middle"}>{shortDate(t.end)}</text> : null;
        })}
        <circle cx={x(timeline.length - 1)} cy={y(last.drySpell)} r={4.5} fill="var(--ink)" />
        <text x={x(timeline.length - 1) - 8} y={y(last.drySpell) - 10} textAnchor="end" className={styles.strong}>{last.drySpell} with a dry spell</text>
      </svg>
      <div className={styles.legend}>
        {STACK.slice().reverse().map(key => <span key={key}><i style={{ background: RAIN_CLASS_META[key].color }} />{RAIN_CLASS_META[key].label}</span>)}
        <span><i style={{ background: "var(--ink)", height: 3 }} />4-week dry spell so far</span>
      </div>
      {facts.length ? (
        <dl className={styles.facts}>
          {facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd><small>{fact.note}</small></div>)}
        </dl>
      ) : null}
    </div>
  );
}
