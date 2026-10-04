import type { Metadata } from "next";
import { HeaderHero } from "../../components/HeaderHero";
import { FieldReport, type SiteCall } from "../../components/FieldReport";
import { titleCase } from "../../lib/data";
import { fieldPriority } from "../../lib/fieldPriority";
import { fieldSignals } from "../../lib/fieldSignalsServer";
import { brief } from "../../lib/pageBriefs";

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
    </div>
  );
}
