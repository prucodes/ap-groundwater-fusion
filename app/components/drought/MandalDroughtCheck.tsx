import Link from "next/link";
import { agricultureEvidence } from "../../lib/agricultureServer";
import { droughtWatch } from "../../lib/droughtWatch";
import { shortDate } from "../../lib/drought";
import { IconArrowRight, IconSun } from "../icons";
import { MandalMatrix } from "./MandalMatrix";

/** The drought manual's two steps for one mandal, on its own page. Server-rendered:
 * only this mandal's row reaches the browser. */
export function MandalDroughtCheck({ mandalId }: { mandalId: string }) {
  const matches = agricultureEvidence().mandals.filter(row => row.id === mandalId);
  if (matches.length !== 1) return null;
  const row = droughtWatch.mandals.find(entry => entry.i === matches[0].index);
  if (!row) return null;
  const sown = droughtWatch.sowingDistricts.find(entry => entry.district === row.d) ?? null;
  return (
    <section className="card" aria-labelledby="mandal-drought-title">
      <div className="cardHead">
        <div className="cardTitle" id="mandal-drought-title">
          <span className="titleIcon"><IconSun /></span>Drought manual check
          <span className="cardSub" style={{ marginLeft: 6 }}>{droughtWatch.season.name} · rain to {shortDate(droughtWatch.sources.rain.window.end, true)}</span>
        </div>
        <span className="cardSub">steps 1–2 · not a declaration</span>
      </div>
      <MandalMatrix row={row} weeks={droughtWatch.season.weeks} sown={sown} sowingAsOf={droughtWatch.sources.sowing?.asOf ?? null} />
      <Link className="linkAction" href="/drought#drought-where" style={{ marginTop: 12 }}>Every mandal on the Drought Watch <IconArrowRight /></Link>
    </section>
  );
}
