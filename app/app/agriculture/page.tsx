import type { Metadata } from "next";
import { AgricultureWorkspace } from "../../components/agriculture/AgricultureWorkspace";
import { WatchEvidenceStatus } from "../../components/WatchEvidenceStatus";
import { buildAgricultureEvidence } from "../../lib/agriculture";
import { checkRecord } from "../../lib/cropWaterRecord";
import { fieldEvidenceInput, fieldSignals, liveField } from "../../lib/fieldSignalsServer";
import { groundwaterRecords, mandalToPath, mapGeometry, MAP_VIEW, monsoonWatch } from "../../lib/data";
import { waterContext } from "../../lib/waterContext";
import { brief } from "../../lib/pageBriefs";

export const metadata: Metadata = {
  title: "Agriculture & Water | AP Water Intelligence",
  description: "A crop-water planning lab and evidence-led agricultural water watch for Andhra Pradesh. Prototype, not a field irrigation advisory.",
};

export default function AgriculturePage() {
  const evidence = buildAgricultureEvidence(monsoonWatch, groundwaterRecords,
    mapGeometry.mandals.map(feature => ({ d: feature.d, m: feature.m, src: feature.src, path: mandalToPath(feature.rings) })), waterContext, fieldEvidenceInput({ slim: true }));
  const mostShort = (fieldSignals.crossCheck as { mostCropsShortMid?: number } | null)?.mostCropsShortMid ?? null;
  const now = mostShort !== null
    ? <>Most crops are short of water now in <b>{mostShort} mandals</b>; the check&rsquo;s record is weak, so read it as where water is needed, not as a forecast.</>
    : undefined;
  return <AgricultureWorkspace evidence={evidence} mapView={{ width: MAP_VIEW.width, height: MAP_VIEW.height }} sourceStatus={<WatchEvidenceStatus />} live={liveField()} record={checkRecord()} brief={brief("/agriculture", now)} />;
}
