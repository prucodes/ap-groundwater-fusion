import type { Metadata } from "next";
import { AgricultureWorkspace } from "../../components/agriculture/AgricultureWorkspace";
import { WatchEvidenceStatus } from "../../components/WatchEvidenceStatus";
import { buildAgricultureEvidence } from "../../lib/agriculture";
import { groundwaterRecords, mandalToPath, mapGeometry, MAP_VIEW, monsoonWatch } from "../../lib/data";

export const metadata: Metadata = {
  title: "Agriculture & Water Intelligence | AP Groundwater",
  description: "A crop-water planning lab and evidence-led agricultural water watch for Andhra Pradesh. Prototype, not a field irrigation advisory.",
};

export default function AgriculturePage() {
  const evidence = buildAgricultureEvidence(monsoonWatch, groundwaterRecords,
    mapGeometry.mandals.map(feature => ({ d: feature.d, m: feature.m, path: mandalToPath(feature.rings) })));
  return <AgricultureWorkspace evidence={evidence} mapView={{ width: MAP_VIEW.width, height: MAP_VIEW.height }} sourceStatus={<WatchEvidenceStatus />} />;
}
