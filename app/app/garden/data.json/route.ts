import { waterGarden } from "../../../lib/waterGarden";

/* The water garden's data (lib/waterGarden.ts), written once at build time as a static
   file. The page and its film load it after the page itself, so 670 mandals' Octobers
   travel once, cached, instead of inside the page's HTML twice. */

export const dynamic = "force-static";

export function GET() {
  return Response.json(waterGarden());
}
