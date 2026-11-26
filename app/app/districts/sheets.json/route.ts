import { districtSheets, pdfName } from "../../../lib/districtSheet";

/* The district sheets for scripts/print-digest.mjs --manifest: each sheet's route and the
   PDF printed beside it, written once at build time. */

export const dynamic = "force-static";

export function GET() {
  return Response.json(districtSheets().map(s => ({ route: `districts/${s.slug}/sheet`, file: pdfName(s.slug) })));
}
