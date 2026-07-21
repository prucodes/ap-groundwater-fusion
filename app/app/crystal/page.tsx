import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Crystal Water Table — Andhra Pradesh | Cinematic 3D",
  description:
    "Cinematic liquid-map 3D view of modelled depth to water across 632 mandals — time-lapse 2014–2027, extraction-stress mode, district labels.",
};

// The cinematic view is a deliberately self-contained WebGL page (its own
// three.js build, inlined data, custom post-processing). Hosting it in a
// frame keeps the app shell around it without coupling the two runtimes.
export default function CrystalWaterTablePage() {
  return (
    <div style={{ height: "100vh", margin: "0 -24px 0 0" }}>
      <iframe
        src="/water-crystal-3d.html"
        title="Crystal Water Table — cinematic 3D view"
        allow="fullscreen"
        style={{ border: 0, width: "100%", height: "100%", display: "block" }}
      />
    </div>
  );
}
