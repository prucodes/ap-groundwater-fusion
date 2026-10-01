import type { Metadata } from "next";
import { LivingWaterTableClient } from "../../components/living-water-table/LivingWaterTableClient";

// On-demand: the 3D/WebGL client view has no meaningful static HTML to
// pre-render, so skip it in the build-time static generation pass.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Model Evidence Lab | Andhra Pradesh",
  description:
    "Interactive Phase 1 Prototype V2 groundwater-depth view with explicit modelled, measured-only and boundary-only states.",
};

export default function LivingWaterTablePage() {
  return <LivingWaterTableClient />;
}
