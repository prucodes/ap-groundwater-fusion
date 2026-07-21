import { HeaderHero } from "../../components/HeaderHero";
import { MethodologyFlow } from "../../components/MethodologyFlow";
import { DataProvenanceDates } from "../../components/DataProvenanceDates";
import { IconAlert, IconDroplet, IconFlow, IconInfo, IconSatellite } from "../../components/icons";
import { modelCard } from "../../lib/data";

const labels = [
  { code: "APWRIMS (AP-GWD)", text: "Real APWRIMS mandal readings (2014-2026). Modelled estimates — not official results." },
  { code: "measured_public", text: "Public measured groundwater (e.g. NWIC). Labeled public, never official_apwrims." },
  { code: "official_apwrims", text: "Official APWRIMS / AP government export. Pending — required for official results." },
  { code: "satellite-model", text: "NASA/NDMC GRACE-DA percentiles (0–100). Real signal, not groundwater depth." },
  { code: "satellite-gauge-rainfall", text: "CHIRPS monthly rainfall (mm). Climate context; not groundwater depth or direct measured recharge." },
  { code: "model-water-balance", text: "TerraClimate rainfall minus actual ET (mm). A climatic water-balance indicator, not measured recharge." },
  { code: "derived", text: "Nowcast, model P10–P90 range, qualitative completeness class and neutral monitoring status." },
  { code: "public_prototype", text: "Public prototype boundaries. official_flag = false until official polygons arrive." },
];

const signals = [
  {
    name: "APWRIMS-format observation",
    can: "Recorded water-table depth aggregated to the mandal display period.",
    cant: "Sparse coverage; one well does not represent a whole mandal.",
    tone: "var(--teal)",
  },
  {
    name: "NASA GRACE-FO (satellite gravity)",
    can: "Change in total water storage — the only satellite that senses water deep underground, at basin scale.",
    cant: "Native resolution is much coarser than its 0.25° grid (effective support ~100s of km / multi-district), monthly, and a storage anomaly — not an absolute water-table depth. Used only as district-scale context.",
    tone: "var(--cyan)",
  },
  {
    name: "CHIRPS rainfall (satellite-gauge)",
    can: "Shows rainfall timing and anomalies that can support hydrologic interpretation.",
    cant: "Does not see groundwater or measured recharge and cannot establish a cause.",
    tone: "var(--sig-surface)",
  },
  {
    name: "TerraClimate ET & water balance (model)",
    can: "Provides modeled climate and actual-ET context.",
    cant: "Does not measure groundwater, recharge or pumping; modeled ~4 km climate context.",
    tone: "var(--green)",
  },
];

const caveats = [
  "NASA GRACE-DA values are percentiles (0–100), not groundwater depth (mbgl). They must never be converted to depth.",
  "Level estimates are modelled (calibrated to APWRIMS) and must not be treated as official APWRIMS results.",
  "Boundaries are public prototype polygons; official APWRIMS/APSAC/RTGS boundaries are required for government-grade results.",
  "Outputs are prototype review signals, not official mandal-level groundwater determinations.",
  modelCard.disclosures.spatial,
  modelCard.disclosures.crossNetwork,
  modelCard.disclosures.climateBalance,
];

export default function MethodologyPage() {
  return (
    <div className="pageWrap">
      <HeaderHero
        title="Methodology"
        subtitle={
          <>
            How APWRIMS readings and <strong>real NASA satellite-model signals</strong> become a prototype mandal review
            layer — and where the boundaries of that claim lie.
          </>
        }
        showChips={false}
      />
      <DataProvenanceDates />

      <section className="card shellPanel">
        <div className="cardHead">
          <div className="cardTitle">
            <span className="titleIcon">
              <IconFlow />
            </span>
            Fusion Pipeline
          </div>
        </div>
        <MethodologyFlow />
      </section>

      <section className="card">
        <div className="cardHead">
          <div className="cardTitle">
            <span className="titleIcon">
              <IconInfo />
            </span>
            Data Labels
          </div>
        </div>
        <div className="labelGrid">
          {labels.map((l) => (
            <div className="labelChip" key={l.code}>
              <code>{l.code}</code>
              <p>{l.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="cardHead">
          <div className="cardTitle">
            <span className="titleIcon">
              <IconSatellite />
            </span>
            What Each Signal Can — and Can&apos;t — Tell You
          </div>
          <span className="cardSub">Only sensors give true depth; satellites add context &amp; verification</span>
        </div>
        <div className="signalExplainer">
          {signals.map((s) => (
            <div className="signalExplainRow" key={s.name}>
              <div className="seName" style={{ borderColor: s.tone }}>
                {s.name}
              </div>
              <div className="seCan">
                <span className="seTag can">Can</span> {s.can}
              </div>
              <div className="seCant">
                <span className="seTag cant">Can&apos;t</span> {s.cant}
              </div>
            </div>
          ))}
        </div>
        <div className="fusionNote" style={{ marginTop: 14 }}>
          <IconDroplet />
          <span>
            <strong>Bottom line:</strong> GRACE-FO is the only satellite that senses deep groundwater storage; rainfall
            and ET are drivers/context, and piezometers remain ground truth for absolute level. The product fuses them
            for trend, attribution and verification — not to replace measured levels.
          </span>
        </div>
      </section>

      <section className="card">
        <div className="cardHead">
          <div className="cardTitle">
            <span className="titleIcon">
              <IconAlert />
            </span>
            Caveats &amp; Limits
          </div>
        </div>
        <div className="caveatList">
          {caveats.map((c) => (
            <div className="caveatItem" key={c}>
              <IconAlert />
              <span>{c}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
