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
    <div className="crystalFrameWrap">
      {/* Full-bleed frame with no app chrome, so without this it would be the
          one view rendering modelled depths with no provenance on screen. It
          sits above the frame in normal flow rather than floating over it —
          as an overlay it covered the 3D view's own heading on a phone. */}
      <p className="crystalNotice">
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
        className="crystalFrame"
      />
    </div>
  );
}
