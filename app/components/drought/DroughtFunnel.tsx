import { CATEGORY_META, type DroughtCategory, type DroughtWatch } from "../../lib/drought";
import styles from "./Drought.module.css";

const OUTCOMES: DroughtCategory[] = ["severe", "moderate|severe", "moderate", "normal|moderate", "normal"];

type Node = { key: string; label: string; note?: string; count: number; color: string; x: number; y: number; h: number };

function ribbon(x0: number, a0: number, b0: number, x1: number, a1: number, b1: number) {
  const mid = (x0 + x1) / 2;
  return `M${x0},${a0} C${mid},${a0} ${mid},${a1} ${x1},${a1} L${x1},${b1} C${mid},${b1} ${mid},${b0} ${x0},${b0} Z`;
}

/** The manual's path for every mandal on the map, as a flow: all mandals, then
 * those the data can assess, then Trigger 1, then the impact matrix. */
export function DroughtFunnel({ data }: { data: Pick<DroughtWatch, "state" | "rules"> }) {
  const { state } = data;
  const notAssessed = state.mandals - state.assessed;
  const notTriggered = state.assessed - state.trigger1;
  const top = 34, usable = 292, width = 20;
  const scale = usable / Math.max(1, state.mandals);
  const h = (count: number) => Math.max(2, count * scale);
  const xs = [30, 300, 570, 810];

  const all: Node = { key: "all", label: "Mandals on the map", count: state.mandals, color: "var(--navy)", x: xs[0], y: top, h: h(state.mandals) };
  const assessed: Node = { key: "assessed", label: "Assessed", note: "a unique gauge record", count: state.assessed, color: "var(--teal)", x: xs[1], y: top, h: h(state.assessed) };
  const missing: Node = { key: "missing", label: "Not assessed", note: "no unique gauge record", count: notAssessed, color: "#98a2b3", x: xs[1], y: top + h(state.assessed) + 26, h: h(notAssessed) };
  const set: Node = { key: "set", label: "Trigger 1 set", note: "dry spell, or large deficit", count: state.trigger1, color: "#c65a46", x: xs[2], y: top, h: h(state.trigger1) };
  const unset: Node = { key: "unset", label: "Trigger 1 not set", note: "no drought by the manual", count: notTriggered, color: CATEGORY_META.noTrigger.color, x: xs[2], y: top + h(state.trigger1) + 26, h: h(notTriggered) };
  let y = top;
  const outcomes: Node[] = OUTCOMES.map(key => {
    const node: Node = { key, label: CATEGORY_META[key].label, count: state.counts[key], color: CATEGORY_META[key].color, x: xs[3], y, h: h(state.counts[key]) };
    y += node.h + 9;
    return node;
  });

  // Ribbons leave each source in order, stacked from its top edge.
  const links: { path: string; color: string; delay: number }[] = [];
  let out = all.y;
  for (const target of [assessed, missing]) {
    links.push({ path: ribbon(all.x + width, out, out + target.h, target.x, target.y, target.y + target.h), color: target.color, delay: 0 });
    out += target.h;
  }
  out = assessed.y;
  for (const target of [set, unset]) {
    links.push({ path: ribbon(assessed.x + width, out, out + target.h, target.x, target.y, target.y + target.h), color: target.color, delay: .25 });
    out += target.h;
  }
  out = set.y;
  for (const target of outcomes) {
    links.push({ path: ribbon(set.x + width, out, out + target.h, target.x, target.y, target.y + target.h), color: target.color, delay: .5 });
    out += target.h;
  }
  const nodes = [all, assessed, missing, set, unset, ...outcomes];
  const height = Math.max(unset.y + unset.h, missing.y + missing.h, y) + 18;

  return (
    <div className={styles.funnelCard}>
      <svg className={`${styles.funnel} ${styles.funnelDesktop}`} viewBox={`0 0 1000 ${height}`} role="img"
        aria-label={`Of ${state.mandals} mandals, ${state.assessed} can be assessed; Trigger 1 is set in ${state.trigger1}; on the impact indicators ${state.counts.severe} read severe, ${state.counts["moderate|severe"]} moderate or severe, ${state.counts.moderate} moderate, ${state.counts["normal|moderate"]} normal or moderate and ${state.counts.normal} normal.`}>
        <text x={xs[0]} y={16} className={styles.stageLabel}>All</text>
        <text x={xs[1]} y={16} className={styles.stageLabel}>Data</text>
        <text x={xs[2]} y={16} className={styles.stageLabel}>Step 1 · rainfall</text>
        <text x={xs[3]} y={16} className={styles.stageLabel}>Step 2 · impact</text>
        {links.map((link, index) => (
          <path key={index} d={link.path} fill={link.color} className={styles.flow}
            style={{ fillOpacity: .22, animationDelay: `${link.delay}s` }} />
        ))}
        {nodes.map(node => (
          <g key={node.key}>
            <rect x={node.x} y={node.y} width={width} height={node.h} rx={3} fill={node.color} />
            <text x={node.x + width + 10} y={node.y + Math.min(node.h / 2, 20) + 5} className={styles.nodeLabel}>
              <tspan className={styles.nodeCount}>{node.count}</tspan>
              <tspan dx={8}>{node.label}</tspan>
            </text>
            {node.note && node.h > 30 ? <text x={node.x + width + 10} y={node.y + Math.min(node.h / 2, 20) + 21} className={styles.nodeNote}>{node.note}</text> : null}
          </g>
        ))}
      </svg>
      <div className={styles.funnelMobile} aria-hidden="true">
        {[all, assessed, set, ...outcomes].map(node => (
          <div key={node.key} className={styles.funnelMobileRow}>
            <span>{node.label}</span>
            <i style={{ width: `${(100 * node.count) / Math.max(1, state.mandals)}%`, background: node.color }} />
            <b>{node.count}</b>
          </div>
        ))}
      </div>
      <div className={styles.funnelSteps}>
        <div><b>Step 3 · ground truth (the State)</b>Field checks in 10% of the villages of each mandal at moderate or severe, about 5 sites per major crop, by smartphone app with GPS photos. A crop loss of 33% qualifies; over 50% for severe.</div>
        <div><b>Declaration (the State)</b>A notification naming the mandals and the intensity, by 31 October; valid for six months. Mandals over 75% irrigated may be moved down one rank, field checks still required.</div>
        <div><b>Central assistance</b>A memorandum for NDRF within a week of declaring, for severe drought; moderate drought is met from SDRF unless it falls short.</div>
      </div>
    </div>
  );
}
