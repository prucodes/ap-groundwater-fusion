"use client";

import dynamic from "next/dynamic";

const LivingWaterTableScene = dynamic(
  () =>
    import("./LivingWaterTablePage").then(
      (module) => module.LivingWaterTablePage,
    ),
  {
    ssr: false,
    loading: () => (
      <div style={{ minHeight: 560, display: "grid", placeItems: "center" }}>
        Loading the Phase 0 V2 groundwater view…
      </div>
    ),
  },
);

export function LivingWaterTableClient() {
  return <LivingWaterTableScene />;
}
