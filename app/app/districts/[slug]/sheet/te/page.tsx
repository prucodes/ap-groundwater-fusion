import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { districtSheet, districtSheets } from "../../../../../lib/districtSheet";
import { SheetView } from "../SheetView";

/* The district sheet in Telugu, for the Collector and the mandal offices (../SheetView.tsx).
   The deploy prints it to districts/<slug>/sheet/te/ap-<slug>-district-sheet-te.pdf. */

export function generateStaticParams() {
  return districtSheets().map(s => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const s = districtSheet(slug);
  return {
    title: `${s?.name ?? "జిల్లా"} జిల్లా షీట్ (తెలుగు) | AP Water Intelligence`,
    description: s ? `${s.name} జిల్లా ఒక A4 పేజీలో, కలెక్టర్ గారికి: సాధారణంతో పోలిస్తే భూగర్భ నీటి మట్టం, వర్షాకాల రీఛార్జ్, వర్షం, జలాశయాలు, వేసవి తాగునీరు, కరవు మాన్యువల్.` : undefined,
  };
}

export default async function DistrictSheetTeluguPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = districtSheet(slug);
  if (!s) notFound();
  return <SheetView s={s} lang="te" caveat="బహిరంగ వనరులతో రూపొందించిన నమూనా (Prototype): ఎక్కడ చూడాలో చూపే ప్రాథమిక పరిశీలన, ప్రకటన లేదా ఆదేశం కాదు." />;
}
