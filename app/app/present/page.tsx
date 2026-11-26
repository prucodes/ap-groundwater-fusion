import type { Metadata } from "next";
import { Presenter, type PresentFacts } from "../../components/present/Presenter";
import { fieldCheck, place } from "../../lib/fieldPilot";
import { lakhs, summerOutlook } from "../../lib/summer";
import { summerPriority } from "../../lib/summerPriority";

export const metadata: Metadata = {
  title: "Present | AP Water Intelligence",
  description: "The water table this October, how it remembers past monsoons, one district's borewells counted down to May, where to plan summer drinking water first, and the field check with the Groundwater Department: eight steps to present full screen.",
};

/* The presenter: eight steps, moved with the arrow keys or a clicker. Everything it says is
   worked out here or from the garden's own data in the browser, as the pages that show it do. */
export default function PresentPage() {
  const p = summerPriority, o = summerOutlook.summary, f = fieldCheck;
  const wells = f.mandals.length * f.wellsPerMandal;
  const facts: PresentFacts = {
    targetMay: p.targetMay,
    outlook: { beyond: o.beyond, dry: o.dry, mandals: o.mandals },
    first: { mandals: p.summary.first.mandals, people: lakhs(p.summary.first.people), next: p.summary.next.mandals },
    priority: p.mandals.filter(r => r.band === "first").slice(0, 6).map(r => ({
      mandal: r.mandal, district: r.district, people: r.people === null ? null : lakhs(r.people), pastM: r.pastRecordM, signs: r.signs,
    })),
    pilot: {
      wells, mandals: f.mandals.length, rounds: f.rounds.length, roundDays: f.roundDays, first: f.rounds[0], status: f.status,
      districts: f.districts.map(d => ({ name: place(d.district), why: d.why })),
      fingerprint: f.planSha256.slice(0, 12), plannedAt: f.plannedAt,
      bars: [
        { label: "A dug well", alone: f.predictions.dugMandalOnlyM, own: f.predictions.dugAfterThreeM },
        ...(f.predictions.byAquifer.hard_rock ? [{ label: "Hard rock", alone: f.predictions.byAquifer.hard_rock.mandalOnlyM, own: f.predictions.byAquifer.hard_rock.withOffsetM }] : []),
        ...(f.predictions.byAquifer.alluvial ? [{ label: "Alluvial delta", alone: f.predictions.byAquifer.alluvial.mandalOnlyM, own: f.predictions.byAquifer.alluvial.withOffsetM }] : []),
      ],
    },
  };
  return <Presenter facts={facts} />;
}
