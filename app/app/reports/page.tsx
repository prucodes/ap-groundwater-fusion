import { HeaderHero } from "../../components/HeaderHero";
import { IconCheck, IconClock, IconFile } from "../../components/icons";
import { ReportDownloads } from "../../components/ReportDownloads";

const reports = [
  {
    name: "Phase 1C — NASA Sampling Summary",
    slug: "phase1c_nasa_sampling_summary",
    desc: "Summary of NASA/NDMC GRACE-DA percentile sampling at station points (groundwater, root-zone, surface).",
    formats: ["md", "csv", "json"],
    status: "generated",
  },
  {
    name: "Phase 1C — Fusion Summary",
    slug: "phase1c_fusion_summary",
    desc: "Fusion-engine output summary joining APWRIMS readings with satellite-model percentiles per mandal.",
    formats: ["md"],
    status: "generated",
  },
  {
    name: "Phase 1D — Public Measured Data Summary",
    slug: "phase1d_public_measured_data_summary",
    desc: "Status of the public NWIC measured-groundwater import lane. Currently fetch_status = manual_required.",
    formats: ["md"],
    status: "generated",
  },
  {
    name: "Phase 1D — Public vs Satellite Fusion Summary",
    slug: "phase1d_public_vs_satellite_fusion_summary",
    desc: "Comparison of public measured readings against NASA satellite-model percentiles (when public data is supplied).",
    formats: ["md"],
    status: "pending",
  },
];

export default function ReportsPage() {
  return (
    <div className="pageWrap">
      <HeaderHero
        title="Reports"
        subtitle={
          <>
            Generated pipeline reports backing this prototype. Status cards only — see the repository{" "}
            <strong>reports/</strong> directory for full output.
          </>
        }
        showChips={false}
        variant="compact"
      />

      <section className="card">
        <div className="cardHead">
          <div className="cardTitle"><span className="titleIcon"><IconFile /></span>Downloads</div>
          <span className="cardSub">live exports · generated in-browser</span>
        </div>
        <ReportDownloads />
      </section>

      <h3 className="sectionLabel">Pipeline reports</h3>
      <div className="reportGrid">
        {reports.map((r) => {
          const generated = r.status === "generated";
          return (
            <section className="card reportCard" key={r.slug}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="reportIcon">
                  <IconFile />
                </span>
                <span className={`readyTag ${generated ? "available" : "pending"}`}>
                  {generated ? "Generated" : "Pending"}
                </span>
              </div>
              <h4>{r.name}</h4>
              <p>{r.desc}</p>
              <div className="reportFoot">
                <div className="reportFormats">
                  {r.formats.map((f) => (
                    <span className="formatTag" key={f}>
                      {f}
                    </span>
                  ))}
                </div>
                <span className="readyMeta" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  {generated ? <IconCheck style={{ width: 14, height: 14, color: "var(--st-normal)" }} /> : <IconClock style={{ width: 14, height: 14, color: "var(--amber)" }} />}
                  reports/{r.slug}
                </span>
              </div>
            </section>
          );
        })}
      </div>

      <div className="protoBanner">
        <span className="bannerIcon">
          <IconFile />
        </span>
        <span>
          Reports describe a prototype pipeline using real APWRIMS readings (2014-2026) and real NASA satellite-model
          signals. They are <strong>not official APWRIMS results</strong>.
        </span>
      </div>
    </div>
  );
}
