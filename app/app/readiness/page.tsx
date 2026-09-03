import { HeaderHero } from "../../components/HeaderHero";
import {
  IconCheck,
  IconClock,
  IconDatabase,
  IconFile,
  IconHash,
  IconMap,
  IconSatellite,
  IconShield,
} from "../../components/icons";
import { readinessItems } from "../../lib/data";

function tone(status: string): "available" | "pending" | "manual" {
  const s = status.toLowerCase();
  if (s === "available") return "available";
  if (s.includes("manual")) return "manual";
  return "pending";
}

const iconFor: Record<string, React.ReactNode> = {
  "Real NASA GRACE-DA data": <IconSatellite />,
  "Real APWRIMS readings (2014-2026)": <IconDatabase />,
  "Public NWIC import lane": <IconFile />,
  "Official APWRIMS export": <IconShield />,
  "Official APWRIMS/APSAC/RTGS boundaries": <IconMap />,
  "APWRIMS admin IDs": <IconHash />,
};

const detailFor: Record<string, string> = {
  "Real NASA GRACE-DA data": "GRACE-DA percentile GeoTIFFs downloaded and sampled at station points. Real satellite-model signal.",
  "Real APWRIMS readings (2014-2026)": "Real APWRIMS mandal readings (2014-2026). Modelled estimates — not official results.",
  "Public NWIC import lane": "Importer built. No stable public CSV/XLS URL, so fetch_status = manual_required.",
  "Official APWRIMS export": "Awaiting official AP government / APWRIMS groundwater export.",
  "Official APWRIMS/APSAC/RTGS boundaries": "Awaiting official mandal boundaries to replace public prototype polygons.",
  "APWRIMS admin IDs": "Awaiting official mandal / district admin identifiers for joins.",
};

const checklist = [
  { label: "Official APWRIMS / AP government groundwater readings export", done: false },
  { label: "Official APWRIMS / APSAC / RTGS mandal boundary polygons", done: false },
  { label: "Official mandal & district admin IDs (crosswalk)", done: false },
  { label: "Stable public NWIC/NWDP download URL (or manual file)", done: false },
  { label: "Real NASA/NDMC GRACE-DA percentile rasters", done: true },
  { label: "Real APWRIMS readings (2014-2026) for pipeline shape", done: true },
];

export default function ReadinessPage() {
  return (
    <div className="pageWrap">
      <HeaderHero
        title="Data Source Readiness"
        subtitle={
          <>
            What is real, what is prototype, and what is still required for{" "}
            <strong>government-grade results</strong>.
          </>
        }
        showChips={false}
        variant="compact"
      />

      {(() => {
        const ready = readinessItems.filter((i) => i.status.toLowerCase() === "available").length;
        const pct = Math.round((ready / readinessItems.length) * 100);
        return (
          <section className="card shellPanel">
            <div className="readinessOverview">
              <div>
                <span className="eyebrow">Overall data readiness</span>
                <div className="readinessBig">
                  {ready}<span className="of"> / {readinessItems.length} sources live</span>
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--muted)" }}>
                  Real NASA GRACE-DA and real APWRIMS readings are live. Official APWRIMS export and official
                  boundaries are pending — required for government-grade results.
                </p>
              </div>
              <div className="readinessTrackWrap">
                <div className="readinessTrack">
                  <span className="readinessFill" style={{ width: `${pct}%` }} />
                </div>
                <span className="readinessPct">{pct}% prototype-ready</span>
              </div>
            </div>
          </section>
        );
      })()}

      <div className="reportGrid">
        {readinessItems.map((item) => {
          const t = tone(item.status);
          return (
            <section className="card reportCard" key={item.label}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="reportIcon">{iconFor[item.label] ?? <IconDatabase />}</span>
                <span className={`readyTag ${t}`}>
                  {t === "available" ? "Available" : t === "manual" ? "Manual Required" : "Pending"}
                </span>
              </div>
              <h4>{item.label}</h4>
              <p>{detailFor[item.label] ?? ""}</p>
              <div className="reportFoot">
                <span className="formatTag">{item.data_label}</span>
                <span className="readyMeta">official_flag: {String(item.official_flag)}</span>
              </div>
            </section>
          );
        })}
      </div>

      <section className="card shellPanel">
        <div className="cardHead">
          <div className="cardTitle">
            <span className="titleIcon">
              <IconCheck />
            </span>
            Next Official Data Request Checklist
          </div>
          <span className="cardSub">Required before official use</span>
        </div>
        <div className="checklist">
          {checklist.map((c) => (
            <div className={`checklistItem ${c.done ? "done" : ""}`} key={c.label}>
              <span className="cbox">{c.done ? <IconCheck /> : null}</span>
              {c.label}
              <span style={{ marginLeft: "auto" }} className={`readyTag ${c.done ? "available" : "pending"}`}>
                {c.done ? "Ready" : "Needed"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="protoBanner">
        <span className="bannerIcon">
          <IconClock />
        </span>
        <span>
          Official APWRIMS export and official APWRIMS/APSAC/RTGS boundaries are required before any result is treated
          as official. Until then all outputs remain <strong>prototype</strong>.
        </span>
      </div>
    </div>
  );
}
