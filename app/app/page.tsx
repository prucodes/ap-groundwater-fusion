import type { Metadata } from "next";
import { OverviewCockpit } from "../components/OverviewCockpit";
import { agricultureEvidence } from "../lib/agricultureServer";
import { lakhs, summerOutlook } from "../lib/summer";
import weeklyChanges from "../data/weekly_changes.json";
import tankFill from "../data/tank_fill.json";
import drinking from "../data/drinking_water.json";
import crossNetwork from "../data/cross_network_check.json";
import ledger from "../data/forecast_ledger.json";

export const metadata: Metadata = {
  description: "Prototype research cockpit for Andhra Pradesh groundwater: measured readings, modelled nowcasts and this water year's rainfall, soil moisture and reservoir context. Not an official result.",
};

/* Rendered on the server so the agreement count can be worked out from the full
   water context, which is too large to send to the browser; the cockpit itself
   stays a client component. */
export default function OverviewPage() {
  const { counts } = agricultureEvidence();
  const o = summerOutlook;
  const summer = { beyond: o.summary.beyond, beyondDeep: o.summary.beyondDeep, deepM: o.deepM, peopleDeep: o.people ? `${lakhs(o.people.beyondDeep)} people` : null };
  const droughtWeek = { worse: weeklyChanges.drought.worse.length, better: weeklyChanges.drought.better.length };
  // Findings computed elsewhere on the site, carried here as a few numbers each.
  const tanksBelowPct = tankFill.wetHaUsual ? Math.round(100 * (1 - tankFill.wetHaNow / tankFill.wetHaUsual)) : null;
  const usual = crossNetwork.overall.bySeason.usual;
  const proof = {
    tanksBelowPct, tanksEmptier: tankFill.emptier, tanksScored: tankFill.scoredMandals,
    drinkingGroundwaterPct: Math.round(100 * drinking.state.groundwaterShare),
    crossForecastPct: Math.round(100 * usual.forecast), crossMeasuredPct: Math.round(100 * usual.measured),
    ledgerTracked: ledger.forecastsTracked,
  };
  return <OverviewCockpit agreement={{ agreeAll: counts.agreeAll, allKnown: counts.allKnown, agreeTwo: counts.agreeTwo }} summer={summer} droughtWeek={droughtWeek} proof={proof} />;
}
