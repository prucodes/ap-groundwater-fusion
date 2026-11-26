import type { Metadata } from "next";
import { WaterIntro } from "../../../components/welcome/WaterIntro";

export const metadata: Metadata = {
  title: "Water fills the State (preview) | AP Water Intelligence",
  description: "A preview of the first-visit intro: a drop lands, water fills Andhra Pradesh mandal by mandal, and the State stays water.",
  robots: { index: false, follow: false },
};

/* A preview of the first-visit intro, not linked from the site until it joins the welcome. */
export default function WaterIntroPreview() {
  return <WaterIntro caption="Prototype preview · illustration, not data" />;
}
