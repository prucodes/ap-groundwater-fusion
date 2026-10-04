import { mapGeometry } from "../../../lib/data";
import { districtOutlines, mandalOutlines, STATIC_MAP_VIEW } from "../../../lib/staticMap";

/* The State's mandal and district outlines, simplified for drawing (lib/staticMap.ts),
   written once at build time as a static file. A page that draws the whole State
   loads it after the page itself, and the browser caches it for every such map,
   instead of carrying 670 outlines inside its own HTML. */

export const dynamic = "force-static";

export function GET() {
  return Response.json({
    view: STATIC_MAP_VIEW,
    names: mapGeometry.mandals.map(feature => [feature.d, feature.m]),
    mandals: mandalOutlines(),
    districts: districtOutlines(),
  });
}
