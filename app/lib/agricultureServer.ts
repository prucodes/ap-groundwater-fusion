import { buildAgricultureEvidence, type AgricultureEvidence } from "./agriculture";
import { groundwaterRecords, mapGeometry, monsoonWatch } from "./data";
import { fieldEvidenceInput } from "./fieldSignalsServer";
import { waterContext } from "./waterContext";

let cached: AgricultureEvidence | null = null;

/** The Agriculture page's evidence, without map paths, built once per server
 * process. For server-rendered pages that need the same per-mandal rain, soil
 * and agreement figures the Agriculture page shows, so the two never disagree.
 * Server code only: it reads the full water context. */
export function agricultureEvidence(): AgricultureEvidence {
  cached ??= buildAgricultureEvidence(monsoonWatch, groundwaterRecords,
    mapGeometry.mandals.map(feature => ({ d: feature.d, m: feature.m, src: feature.src, path: "" })), waterContext, fieldEvidenceInput());
  return cached;
}
