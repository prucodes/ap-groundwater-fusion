import canals from "../data/canal_releases.json";
import { formatNumber, titleCase } from "../lib/data";
import { RowFold, foldAt } from "./RowFold";
import { IconWaves } from "./icons";

/* How much water the canals have carried this season, against last season to the
 * same date (build_canal_releases.py). Released at the headworks, read weekly and
 * added up between readings: the scale and the comparison, not a water account. */

type Canal = { reservoir: string; outlet: string; basin: string; district: string; thisSeasonMm3: number; lastSeasonMm3: number | null };
type Data = {
  seasonStart: string; asOf: string; lastSeasonTo: string; method: string; caveat: string;
  snapshotsThisSeason: number; snapshotsLastSeason: number;
  deltas: Array<{ system: string; thisSeasonTmc: number; lastSeasonTmc: number | null }>;
  canalsBothSeasons: number; canalsWithLess: number;
  canals: Canal[];
};

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const change = (now: number, then: number | null) =>
  then && then > 0 ? Math.round(100 * (now / then - 1)) : null;
const name = (s: string) => titleCase(s.replace(/\s+/g, " ").trim());

export function CanalWater() {
  const d = canals as unknown as Data;
  if (!d?.deltas || d.snapshotsThisSeason < 2) return null;
  const rows = d.canals.slice(0, 40);
  return (
    <section className="card" id="canal-water" aria-labelledby="canal-water-title" data-testid="canal-water">
      <div className="cardHead">
        <div className="cardTitle" id="canal-water-title"><span className="titleIcon"><IconWaves /></span>Canal water this season</div>
        <span className="cardSub">released at the headworks, read weekly since {day(d.seasonStart)}</span>
      </div>
      <div className="monsoonHeadline">
        {d.deltas.map(delta => {
          const pct = change(delta.thisSeasonTmc, delta.lastSeasonTmc);
          return (
            <div className="monsoonStat" key={delta.system}>
              <span>{delta.system} canals</span>
              <strong>{formatNumber(delta.thisSeasonTmc)} TMC</strong>
              <em>since 1 June{pct !== null ? ` · ${Math.abs(pct)}% ${pct >= 0 ? "more" : "less"} than by this date last year (${formatNumber(delta.lastSeasonTmc ?? 0)} TMC)` : ""}</em>
            </div>
          );
        })}
        <div className="monsoonStat">
          <span>Canals running both seasons</span>
          <strong>{d.canalsWithLess} of {d.canalsBothSeasons}</strong>
          <em>carried less water this season than last</em>
        </div>
      </div>
      <p className="cardLede">
        Canal water is water a farm does not have to pump. Where releases fall short, more of the season rests on the wells this site tracks.
      </p>
      <RowFold id="canal-rows" total={rows.length} visible={8} noun="canals">
        <div className="tableWrap capped">
          <table className="dataTable compact">
            <thead><tr><th>Canal</th><th>From</th><th>This season</th><th>Last season, same date</th><th>Change</th></tr></thead>
            <tbody>
              {rows.map((c, i) => {
                const pct = change(c.thisSeasonMm3, c.lastSeasonMm3);
                return (
                  <tr key={`${c.reservoir}-${c.outlet}`} {...foldAt(i, 8)}>
                    <td>{c.outlet}</td>
                    <td>{name(c.reservoir)}</td>
                    <td>{formatNumber(c.thisSeasonMm3)} Mm³</td>
                    <td>{c.lastSeasonMm3 == null ? "–" : `${formatNumber(c.lastSeasonMm3)} Mm³`}</td>
                    <td className={pct === null ? undefined : pct < 0 ? "bad" : "good"}>{pct === null ? "–" : `${pct > 0 ? "+" : ""}${pct}%`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </RowFold>
      <p className="cardNote">
        {d.caveat} Readings this season: {d.snapshotsThisSeason}, to {day(d.asOf)}. 1 TMC is about 28.3 Mm³.
      </p>
    </section>
  );
}
