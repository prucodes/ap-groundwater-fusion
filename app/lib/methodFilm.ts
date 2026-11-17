import { CREATOR_CREDIT } from "./creator";
import { modelCard, monsoonWatch } from "./data";
import { waterContext } from "./waterContext";

/* How the site works, as a film of under a minute: one drop of rain followed from the cloud
   to the page. Seven stops, each saying what the Methodology page says about that step and
   whether it is measured, modelled or only context. The figures are read from the same
   files as the page (the model card, the season's recharge, the gauge network), so the
   film cannot quote a different accuracy from the one published. Server code only. */

export type MethodKind = "Measured" | "Modelled" | "Worked out from wells" | "Context only" | "What comes out";
export type MethodStep = {
  id: "rain" | "soil" | "recharge" | "well" | "orbit" | "model" | "output";
  kind: MethodKind; headline: string; line: string; foot: string; seconds: number;
};
export type MethodFilm = {
  /** The model build this film describes: the manifest's edition. */
  edition: string;
  kicker: string; title: string; sub: string;
  steps: MethodStep[];
  /** The three things a mandal can be marked for; the last stop draws them. */
  outputs: string[];
  close: { line: string; site: string; credit: string; caveat: string };
  openSeconds: number; closeSeconds: number;
};

const n = (value: number) => Math.round(value).toLocaleString("en-IN");

export function methodFilm(): MethodFilm {
  const test = modelCard.evaluations.temporalNowcast as unknown as {
    sampleCount: number; model: { maeM: number }; lastReadingBaseline: { maeM: number }; evaluationPeriod: { start: string; end: string };
  };
  const gauges = waterContext.rainfall?.state?.gauges ?? null, banked = monsoonWatch.banked;
  const span = `${test.evaluationPeriod.start.slice(0, 4)}–${test.evaluationPeriod.end.slice(2, 4)}`;
  const steps: MethodStep[] = [
    { id: "rain", kind: "Measured", seconds: 6.5,
      headline: gauges ? `Rain is counted at ${n(gauges)} State gauges.` : "Rain is counted at the State's gauges.",
      line: "Satellite rainfall (CHIRPS) carries the record back to 1981.", foot: "AP rain gauges, via APWRIMS · CHIRPS v3" },
    { id: "soil", kind: "Modelled", seconds: 6.5,
      headline: "The soil takes its share first.",
      line: "Soil moisture at four depths comes from a model, not from a probe in the field.", foot: "NRSC VIC soil moisture, via APWRIMS" },
    { id: "recharge", kind: "Worked out from wells", seconds: 7,
      headline: "What gets past the roots lifts the water table.",
      line: banked ? `This monsoon the median mandal banked ${banked.medianSharePct}% of its rain.` : "How much is worked out from the rise in the wells, not from the rain.",
      foot: "Water-table fluctuation method (GEC-2015), from APWRIMS readings" },
    { id: "well", kind: "Measured", seconds: 7,
      headline: "Only a well measures depth.",
      line: "Monthly readings since 2014, and automatic sensors that report every few hours.", foot: "APWRIMS piezometers and telemetry" },
    { id: "orbit", kind: "Context only", seconds: 6.5,
      headline: "From orbit, GRACE weighs all the water at once.",
      line: "It arrives as a percentile from 0 to 100 and is never converted to a depth.", foot: "NASA / NDMC GRACE-DA" },
    { id: "model", kind: "Modelled", seconds: 8,
      headline: "Between readings, a model estimates each mandal.",
      line: `On ${n(test.sampleCount)} readings it had not seen it was off by ${test.model.maeM.toFixed(1)} m on average. Carrying the last reading forward misses by ${test.lastReadingBaseline.maeM.toFixed(1)} m.`,
      foot: `Held-out test, ${span} · every estimate is published with its band` },
    { id: "output", kind: "What comes out", seconds: 7,
      headline: "A screening signal, not a decision.",
      line: "Monitor, review, or verify in the field. No permit, no pumping order, no declaration.", foot: "Prototype · does not replace field measurements or APWRIMS outputs" },
  ];
  return {
    edition: modelCard.buildTimestamp.slice(0, 10),
    kicker: "AP Water Intelligence · How it works", title: "From rain to a reading", sub: "What is measured, what is modelled, and what comes out.",
    steps, outputs: ["Monitor", "Review", "Verify in the field"],
    close: { line: "Measured stays measured. Modelled says so.", site: "prucodes.github.io/ap-groundwater-fusion", credit: `AP Water Intelligence · ${CREATOR_CREDIT}`, caveat: modelCard.disclosures.officialUse },
    openSeconds: 4.5, closeSeconds: 5,
  };
}

export const methodFilmSeconds = (film: MethodFilm) => film.openSeconds + film.steps.reduce((sum, step) => sum + step.seconds, 0) + film.closeSeconds;
