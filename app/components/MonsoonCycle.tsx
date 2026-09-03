import { medianRecharge, type SeasonalYear } from "../lib/data";

/**
 * Pre-monsoon low against post-monsoon recovery, year by year.
 *
 * In Indian groundwater practice this pairing IS the assessment — it is how CGWB
 * reports, and it is what separates ordinary seasonal drawdown from genuine
 * depletion. A dumbbell per year reads the comparison directly: the span is the
 * recharge, and a year whose span collapses is visible without reading a number.
 */

const MIN_YEARS = 2;

export function MonsoonCycle({ cycle }: { cycle: SeasonalYear[] }) {
  const usable = cycle.filter((y) => y.preMonsoon !== null && y.postMonsoon !== null);
  if (usable.length < MIN_YEARS) {
    return (
      <p className="muted" style={{ fontSize: 13 }}>
        Not enough paired May and November readings to compare the monsoon cycle for this mandal.
      </p>
    );
  }

  const median = medianRecharge(usable);
  const depths = usable.flatMap((y) => [y.preMonsoon as number, y.postMonsoon as number]);
  const maxDepth = Math.max(...depths) * 1.06;
  const scale = (d: number) => (d / maxDepth) * 100;

  const weakest = usable.reduce((a, b) => ((a.rechargeM ?? 0) <= (b.rechargeM ?? 0) ? a : b));

  return (
    <div className="monsoonCycle">
      <div className="mcSummary">
        <div className="mcStat">
          <span className="mcStatLabel">Typical monsoon recovery</span>
          <span className="mcStatValue">
            {median !== null ? `${median > 0 ? "+" : ""}${median.toFixed(2)}` : "—"}
            <small> m</small>
          </span>
          <span className="mcStatNote">median across {usable.length} paired years</span>
        </div>
        <div className="mcStat">
          <span className="mcStatLabel">Weakest recovery</span>
          <span className="mcStatValue" style={{ color: "var(--st-verify)" }}>
            {weakest.rechargeM !== null ? `${weakest.rechargeM > 0 ? "+" : ""}${weakest.rechargeM.toFixed(2)}` : "—"}
            <small> m</small>
          </span>
          <span className="mcStatNote">in {weakest.year}</span>
        </div>
      </div>

      <ol className="mcRows">
        {usable.map((y) => {
          const pre = scale(y.preMonsoon as number);
          const post = scale(y.postMonsoon as number);
          // Depth runs downward, so the post-monsoon level is the shallower end.
          const left = Math.min(pre, post);
          const width = Math.abs(pre - post);
          const gained = (y.rechargeM ?? 0) > 0;
          return (
            <li className="mcRow" key={y.year}>
              <span className="mcYear">{y.year}</span>
              <span className="mcTrack">
                <span
                  className="mcSpan"
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(width, 0.6)}%`,
                    background: gained ? "var(--st-normal)" : "var(--st-verify)",
                  }}
                />
                <span className="mcDot mcDotPre" style={{ left: `${pre}%` }} title={`Pre-monsoon (May) ${(y.preMonsoon as number).toFixed(2)} m`} />
                <span className="mcDot mcDotPost" style={{ left: `${post}%` }} title={`Post-monsoon (Nov) ${(y.postMonsoon as number).toFixed(2)} m`} />
              </span>
              <span className={`mcDelta ${gained ? "up" : "down"}`}>
                {gained ? "▲" : "▼"} {Math.abs(y.rechargeM as number).toFixed(2)} m
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mcKey">
        <span className="mcKeyItem"><i className="mcSwatch mcSwatchPre" /> Pre-monsoon (May) — the annual low</span>
        <span className="mcKeyItem"><i className="mcSwatch mcSwatchPost" /> Post-monsoon (Nov) — after recharge</span>
        <span className="mcKeyItem mcKeyNote">
          Recovery is the metres the water table rose over the monsoon. A short bar is a monsoon that did not refill the aquifer.
        </span>
      </div>
    </div>
  );
}
