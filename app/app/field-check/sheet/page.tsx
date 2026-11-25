import type { Metadata } from "next";
import Link from "next/link";
import { basePath } from "../../../lib/data";
import { day, fieldCheck, place, PROTOCOL, TERRAIN, type FieldMandal } from "../../../lib/fieldPilot";
import sheet from "../../summer/brief/SummerBrief.module.css";
import styles from "./FieldSheet.module.css";

export const metadata: Metadata = {
  title: "Field check protocol | AP Water Intelligence",
  description: "The field check pilot on one A4 page: how a well is read, what the site expects the wells to show, and the ten mandals.",
};

/* One sheet to hand the Groundwater Department: printed by the deploy to
   field-check/sheet/ap-field-check-protocol.pdf (scripts/print-digest.mjs --route field-check/sheet). */

const PDF = "ap-field-check-protocol.pdf";
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const SHORT: Record<string, string> = { first: "Plan first", next: "Plan next", watch: "Watch", beyond: "Past its record", dry: "Dry-winter risk", within: "Within record" };
const short = (m: FieldMandal) => SHORT[m.band ?? m.tier ?? ""] ?? "Not projected";

export default function FieldSheetPage() {
  const f = fieldCheck, p = f.predictions;
  const wells = f.mandals.reduce((n, m) => n + m.observationWells + m.privateWellsToAdd, 0);
  const observed = f.mandals.reduce((n, m) => n + m.observationWells, 0);
  const last = f.rounds[f.rounds.length - 1];
  const hard = p.byAquifer.hard_rock, alluvial = p.byAquifer.alluvial;
  return (
    <div className="pageWrap">
      <div className={sheet.viewer}>
        <div className={sheet.toolbar}>
          <p>The field check pilot on one A4 page. The plan, the map and the score are on <Link href="/field-check/">Field check pilot</Link>.</p>
          <a className={sheet.download} href={`${basePath}/field-check/sheet/${PDF}`} download="AP-field-check-protocol.pdf" data-testid="field-sheet-pdf">Download PDF</a>
        </div>
        <section className={sheet.page} data-testid="field-sheet">
          <div className={sheet.band}>
            <div className={sheet.eyebrow}>Andhra Pradesh · Field check pilot · proposed to the Groundwater Department</div>
            <h1>{wells} wells, {WORDS[f.districts.length] ?? f.districts.length} districts, every fortnight</h1>
            <p className={sheet.sub}>
              {f.mandals.length} mandals in {f.districts.map(d => place(d.district)).join(" and ")}: the {observed} observation wells already there and{" "}
              {wells - observed} private wells, three or more of one kind in a village. Rounds every {f.roundDays} days, <b>{day(f.rounds[0])}</b> to <b>{day(last)}</b>.
              Every reading is scored in public against what the site wrote down on {day(f.plannedAt)}, before the first one.
            </p>
          </div>
          <div className={sheet.body}>
            <div className={styles.cols}>
              <div>
                <div className={sheet.sec}>How a well is read</div>
                <ol className={styles.steps}>{PROTOCOL.map(([t, x]) => <li key={t}><b>{t}.</b> {x}</li>)}</ol>
              </div>
              <div>
                <div className={sheet.sec}>What the site expects</div>
                <ul className={styles.claims}>
                  <li><span>Dug wells</span><b>{p.dugMandalOnlyM.toFixed(1)} m → {p.dugAfterThreeM.toFixed(1)} m</b><em>off on the mandal figure alone, then after three readings of the well</em></li>
                  <li><span>Bore wells</span><b>{p.boreMandalOnlyM.toFixed(1)} m → {p.boreAfterThreeM.toFixed(1)} m</b><em>three readings help far less</em></li>
                  {hard && alluvial ? <li><span>Hard rock · alluvial</span><b>{hard.mandalOnlyM.toFixed(1)} → {hard.withOffsetM.toFixed(1)} m · {alluvial.mandalOnlyM.toFixed(1)} → {alluvial.withOffsetM.toFixed(1)} m</b><em>with each well&rsquo;s own offset</em></li> : null}
                  {p.mayDropListedM != null && p.mayDropOthersM != null ? <li><span>By May</span><b>{p.mayDropListedM.toFixed(1)} m against {p.mayDropOthersM.toFixed(1)} m</b><em>the fall in priority-list mandals against the others</em></li> : null}
                </ul>
              </div>
            </div>
            <div className={sheet.sec} style={{ marginTop: "4mm" }}>The {WORDS[f.mandals.length] ?? f.mandals.length} mandals</div>
            <table className={styles.table} data-testid="field-sheet-mandals">
              <thead><tr><th>Mandal</th><th>Summer call</th><th className={styles.num}>Wells there</th><th className={styles.num}>To add</th><th>Villages with wells</th></tr></thead>
              {f.districts.map(d => (
                <tbody key={d.district}>
                  <tr className={styles.group}><td colSpan={5}>{place(d.district)} · {TERRAIN[f.mandals.find(m => m.district === d.district)?.aquifer ?? ""] ?? ""}</td></tr>
                  {f.mandals.filter(m => m.district === d.district).map(m => <tr key={m.index}>
                    <td><b>{m.mandal}</b></td><td>{short(m)}</td>
                    <td className={styles.num}>{m.observationWells}</td><td className={styles.num}>{m.privateWellsToAdd}</td>
                    <td>{[...new Set(m.villages.map(v => v.village))].slice(0, 4).join(", ")}</td>
                  </tr>)}
                </tbody>
              ))}
            </table>
            <p className={styles.small}><b>Reading sheet:</b> {f.readingFields.join(", ")}; one CSV per district per round, a dry well written &ldquo;dry&rdquo;. <b>Scored</b> against the mandal&rsquo;s hand-read figure for the month, plus the village&rsquo;s recorded offset, plus the well&rsquo;s own offset from its earlier readings. A proposal: the department sets the wells and the dates.</p>
          </div>
          <div className={sheet.foot}>
            <span>Predictions from the site&rsquo;s tests on CGWB&rsquo;s past readings, fingerprint {f.planSha256.slice(0, 12)}. Prototype built from public sources: a screening view, not a declaration or an order.</span>
            <span><b>AP Water Intelligence</b> · prucodes.github.io/ap-groundwater-fusion/field-check</span>
          </div>
        </section>
      </div>
    </div>
  );
}
