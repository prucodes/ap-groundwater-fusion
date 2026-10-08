import type { Metadata } from "next";
import { OverviewCockpit } from "../components/OverviewCockpit";
import { agricultureEvidence } from "../lib/agricultureServer";
import { lakhs, summerOutlook } from "../lib/summer";

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
  return <OverviewCockpit agreement={{ agreeAll: counts.agreeAll, allKnown: counts.allKnown, agreeTwo: counts.agreeTwo }} summer={summer} />;
}
