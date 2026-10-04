import fieldMandalsJson from "../data/field_signals_mandals.json";
import { GEC_CATEGORIES, VCI_CLASSES, type GecCategory, type VciClass } from "./agriculture";

/* Crop vegetation (NOAA VHP, weighted to cropland) and the official groundwater
   assessment (INGRES), per mandal, for the map layers (~30 KB). Client-safe:
   the full record, with weekly series and volumes, is server-only
   (lib/fieldSignalsServer.ts). */

type FieldMandals = {
  generatedAt: string;
  vegetation: { averaged: Array<{ approxStart: string; approxEnd: string }> | null; product: string; classes: string } | null;
  assessment: { year: string; source: string; url: string } | null;
  codes: { vciClass: VciClass[]; category: GecCategory[] };
  /** "DISTRICT|MANDAL" -> [VCI, VCI class code, category code, stage of extraction %]. */
  values: Record<string, [number | null, number | null, number | null, number | null]>;
};

export const fieldMandals = fieldMandalsJson as unknown as FieldMandals;

export type FieldLayer = "vci" | "gec_category";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso: string | undefined) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return match ? `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]}` : "?";
};
const averaged = fieldMandals.vegetation?.averaged;

export const FIELD_LAYER_META: Record<FieldLayer, { label: string; period: string; note: string }> = {
  vci: {
    label: "Crop vegetation (VCI)",
    period: averaged?.length ? `${day(averaged[0].approxStart)} to ${day(averaged[averaged.length - 1].approxEnd)}` : "not available",
    note: "Satellite index: NOAA STAR Vegetation Health Product, 4 km weekly, weighted to cropland (ESA WorldCover). Greenness against the same weeks in every year on record; classes per the drought manual, Table 3.4.",
  },
  gec_category: {
    label: `Groundwater category${fieldMandals.assessment ? ` ${fieldMandals.assessment.year}` : ""}`,
    period: fieldMandals.assessment ? `assessment year ${fieldMandals.assessment.year}` : "not available",
    note: "Official assessment: Dynamic Ground Water Resources (CGWB and the AP State Ground Water Department, GEC-2015), via INGRES. Stage of extraction = annual extraction / annual extractable resource.",
  },
};

export function isFieldLayer(layer: string | null | undefined): layer is FieldLayer {
  return layer === "vci" || layer === "gec_category";
}

export function fieldForMandal(district: string, mandal: string) {
  const row = fieldMandals.values[`${district.toUpperCase()}|${mandal.toUpperCase()}`];
  if (!row) return null;
  return {
    vci: row[0], vciClass: row[1] === null ? null : fieldMandals.codes.vciClass[row[1]] ?? null,
    category: row[2] === null ? null : fieldMandals.codes.category[row[2]] ?? null, stagePct: row[3],
  };
}

const NO_VALUE = "#d3d9dc";

export function fieldLayerColor(layer: FieldLayer, district: string, mandal: string): string {
  const row = fieldForMandal(district, mandal);
  if (layer === "vci") return row?.vciClass ? VCI_CLASSES[row.vciClass].color : NO_VALUE;
  return row?.category ? GEC_CATEGORIES[row.category].color : NO_VALUE;
}

export function fieldLayerText(layer: FieldLayer, district: string, mandal: string): string | null {
  const row = fieldForMandal(district, mandal);
  if (!row) return null;
  if (layer === "vci") return row.vci === null || !row.vciClass ? null : `${row.vci.toFixed(0)} · ${VCI_CLASSES[row.vciClass].short}`;
  return row.category ? `${GEC_CATEGORIES[row.category].label}${row.stagePct !== null ? ` · ${row.stagePct.toFixed(0)}% extracted` : ""}` : null;
}

/** Legend entries, with how many mapped mandals fall in each. */
export function fieldLegend(layer: FieldLayer) {
  const rows = Object.values(fieldMandals.values);
  if (layer === "vci") {
    return (Object.keys(VCI_CLASSES) as VciClass[]).map(key => ({
      key, label: `${VCI_CLASSES[key].label} (${VCI_CLASSES[key].range})`, color: VCI_CLASSES[key].color,
      count: rows.filter(row => row[1] !== null && fieldMandals.codes.vciClass[row[1]] === key).length,
    }));
  }
  return (Object.keys(GEC_CATEGORIES) as GecCategory[]).map(key => ({
    key, label: `${GEC_CATEGORIES[key].label} (${GEC_CATEGORIES[key].range})`, color: GEC_CATEGORIES[key].color,
    count: rows.filter(row => row[2] !== null && fieldMandals.codes.category[row[2]] === key).length,
  }));
}
