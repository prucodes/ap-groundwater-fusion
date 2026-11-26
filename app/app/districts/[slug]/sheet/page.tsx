import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { districtSheet, districtSheets } from "../../../../lib/districtSheet";
import { SheetView } from "./SheetView";

/* One district on one A4 page, for its Collector (SheetView.tsx); in Telugu at ./te/.
   The deploy prints it to districts/<slug>/sheet/ap-<slug>-district-sheet.pdf. */

export function generateStaticParams() {
  return districtSheets().map(s => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const s = districtSheet(slug);
  return {
    title: `${s?.name ?? "District"} district sheet | AP Water Intelligence`,
    description: s ? `${s.name} on one A4 page for the District Collector: groundwater against its usual, the monsoon's recharge, rain and reservoirs, summer drinking water and the drought manual.` : undefined,
  };
}

export default async function DistrictSheetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = districtSheet(slug);
  if (!s) notFound();
  return <SheetView s={s} lang="en" caveat="Prototype built from public sources: a screening view for where to look, not a declaration or an order." />;
}
