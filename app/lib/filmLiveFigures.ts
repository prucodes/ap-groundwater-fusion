import watch from "../data/monsoon_watch.json";
import ocean from "../data/enso_outlook.json";
import wells from "../data/gw_state_summary.json";
import summer from "../data/summer_outlook.json";
import drought from "../data/drought_watch_summary.json";

/** Only narrated aggregates cross the server/client boundary, never whole map files. */
export function currentFilmFigures() {
  const rain = watch.rainfall, history = watch.elNinoRainfall.swMonsoon, ne = watch.elNinoRainfall.neMonsoon;
  const example = watch.mandals.find(m => m.mandal === "Orvakal" && m.district === "Kurnool");
  return {
    rainProduct: rain.product.split(" monthly")[0], rainMonths: rain.months, rainAnomalyPct: rain.anomalyPct,
    year: watch.season.year, latestMonth: watch.season.latestMonth,
    rainRank: rain.rankDriest, rainYears: rain.ofYears, rainMm: rain.mm, rainNormalMm: rain.normalMm,
    elNinoBelowNormal: history.elNinoBelowNormal, elNinoYears: history.elNinoYears, historyMeanPct: history.elNinoAnomalyPct,
    fallingPct: watch.recharge.fallingPct, falling: watch.recharge.falling, compared: watch.recharge.mandals,
    shortOfNormalPct: watch.recharge.shortOfNormalPct,
    well: example ? { latestDepthM: example.latestDepthM, thisSeasonM: example.thisSeasonM, typicalM: example.typicalM } : null,
    oni: { asOf: watch.enso.asOf, season: watch.enso.season, oniC: watch.enso.oniC, strength: watch.enso.strength },
    ocean: { issued: ocean.issued, index: ocean.index, peak: ocean.peak, synopsis: ocean.synopsis },
    northeast: { elNinoYears: ne.elNinoYears, elNinoBelowNormal: ne.elNinoBelowNormal, elNinoAnomalyPct: ne.elNinoAnomalyPct, firstYear: ne.firstYear, lastYear: ne.lastYear },
    stateWells: wells.state,
    summer: { anchor: summer.anchor, targetMay: summer.targetMay, beyond: summer.summary.beyond, beyondDeep: summer.summary.beyondDeep, people: summer.people.beyondDeep, backtest: summer.backtest },
    drought: { asOf: drought.season.asOf, trigger1: drought.state.trigger1, counts: drought.state.counts },
  };
}
