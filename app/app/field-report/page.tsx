import type { Metadata } from "next";
import { HeaderHero } from "../../components/HeaderHero";
import { FieldReport, type SiteCall } from "../../components/FieldReport";
import { titleCase } from "../../lib/data";
import { fieldPriority } from "../../lib/fieldPriority";
import { fieldSignals } from "../../lib/fieldSignalsServer";
import { brief } from "../../lib/pageBriefs";
import { fieldCheckCsv, fieldCheckRows } from "../../lib/fieldCheck";
import { DownloadTextButton } from "../../components/ExportButtons";
import { RowFold, foldAt } from "../../components/RowFold";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthOf = (ym: string | null) => (ym ? `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}` : "");
const m = (v: number | null) => (v === null ? "–" : `${v.toFixed(1)} m`);

/* Where a tape in a well would test the site's numbers, for the Groundwater Department. */
function FieldCheck() {
  const rows = fieldCheckRows();
  const first = rows.filter(r => r.why.some(w => w.startsWith("summer"))).length;
  const queue = rows.filter(r => r.why.some(w => w.startsWith("field queue"))).length;
  const month = rows.find(r => r.forecastMonth)?.forecastMonth ?? null;
  return (
    <section className="card" id="field-check" aria-labelledby="field-check-title" data-testid="field-check">
      <div className="cardHead">
        <div className="cardTitle" id="field-check-title">{rows.length} mandals where a tape in a well would test our numbers</div>
        <span className="cardSub">for the Groundwater Department&rsquo;s field teams</span>
      </div>
      <p className="cardNote">
        Nothing on this site has been checked on the ground yet. These are the {first} mandals the summer list says to plan for first,
        and the {queue}{" "}where the model is least sure and the most people and irrigated land depend on it. Each row gives what the
        State&rsquo;s network last read and the forecast for {monthOf(month)} with its band: a sounding taken in {monthOf(month)} tests the
        forecast directly, and inside the band counts as a pass. The sheet has empty columns for the reading; send it back as it is.
      </p>
      <div style={{ margin: "10px 0 14px" }}>
        <DownloadTextButton filename="ap-groundwater-field-check.csv" content={fieldCheckCsv(rows)} label="Download the field sheet (CSV)"
          event={["app/field-check-csv", "Field report: downloaded the field check sheet"]} />
      </div>
      <RowFold id="field-check-rows" total={rows.length} visible={10} noun="mandals">
        <div className="tableWrap capped">
          <table className="dataTable compact" aria-label="Mandals for the field check">
            <thead><tr><th>Mandal</th><th>District</th><th>Why</th><th>State reading</th><th>Forecast, {monthOf(month)}</th></tr></thead>
            <tbody>
              {rows.map((r, i) => <tr key={`${r.district}-${r.mandal}`} {...foldAt(i, 10)}>
                <td>{r.mandal}</td><td>{r.district}</td><td>{r.why.join(", ")}</td>
                <td>{m(r.readingM)}{r.readingMonth ? <small> · {monthOf(r.readingMonth).slice(0, 3)}</small> : null}</td>
                <td>{m(r.forecastM)}{r.lower !== null && r.upper !== null ? <small> ({r.lower.toFixed(1)} to {r.upper.toFixed(1)})</small> : null}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </RowFold>
    </section>
  );
}

export const metadata: Metadata = {
  title: "Field Report | AP Water Intelligence",
  description: "For teams sent to the mandals on This Week's list: record crop condition and drinking water, compare it with what the site called, and share the report. Nothing leaves the phone until it is shared.",
};

const place = (value: string) => (/[a-z]/.test(value) ? value : titleCase(value));

export default function FieldReportPage() {
  const { rows } = fieldPriority();
  const irrigated = fieldSignals.irrigation?.share ?? [];
  // What the site said this week, per mandal: the six-signal count and the crop water check.
  const calls: SiteCall[] = rows.map(row => ({
    i: row.index, d: place(row.district), m: place(row.mandal), lit: row.lit, known: row.known,
    short: row.cropsShort, of: row.cropsKnown, vci: row.vci === null ? null : Math.round(row.vci),
    irr: irrigated[row.index] === null || irrigated[row.index] === undefined ? null : Math.round(irrigated[row.index]!),
  })).sort((a, b) => a.d.localeCompare(b.d) || a.m.localeCompare(b.m));
  const week = fieldSignals.crossCheck?.issued ?? null;

  return (
    <div className="pageWrap">
      <HeaderHero
        title="Field Report"
        brief={brief("/field-report", <><b>{rows.filter(r => r.lit >= 4).length} mandals</b> are on this week&rsquo;s field-teams list; a report stays on the phone until it is shared.</>)}
        showChips={false}
        variant="compact"
      />
      <FieldReport calls={calls} week={week} />
      <FieldCheck />
    </div>
  );
}
