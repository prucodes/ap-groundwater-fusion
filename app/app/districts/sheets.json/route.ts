import { districtSheets, pdfName } from "../../../lib/districtSheet";

/* The district sheets for scripts/print-digest.mjs --manifest: each sheet's route and the
   PDF printed beside it, in English and in Telugu, written once at build time. */

export const dynamic = "force-static";

export function GET() {
  return Response.json(districtSheets().flatMap(s => [
    { route: `districts/${s.slug}/sheet`, file: pdfName(s.slug) },
    { route: `districts/${s.slug}/sheet/te`, file: pdfName(s.slug, "te") },
  ]));
}
