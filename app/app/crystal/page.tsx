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
    <div style={{ height: "100vh", margin: "0 -24px 0 0", position: "relative" }}>
      {/* Full-bleed frame with no app chrome, so without this it would be the
          one view rendering modelled depths with no provenance on screen. */}
      <p
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 2,
          margin: 0,
          maxWidth: "min(52ch, calc(100% - 24px))",
          padding: "6px 10px",
          borderRadius: 6,
          background: "rgba(7, 29, 53, 0.78)",
          color: "#eaf1f8",
          font: "500 12px/1.45 var(--font-sans, system-ui, sans-serif)",
          pointerEvents: "none",
        }}
      >
        Prototype — cinematic view of <strong>modelled</strong> depth-to-water
        estimates with uncertainty, not official APWRIMS measurements. Height and
        motion are presentational.
      </p>
      <iframe
        // Next rewrites next/image and <Link> for basePath, but not a raw
        // iframe src, so prefix it explicitly or this 404s on GitHub Pages.
        src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/water-crystal-3d.html`}
        title="Crystal Water Table — cinematic 3D view"
        allow="fullscreen"
        style={{ border: 0, width: "100%", height: "100%", display: "block" }}
      />
    </div>
  );
}
