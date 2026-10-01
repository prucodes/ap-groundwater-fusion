import { HeaderHero } from "../../components/HeaderHero";
import { MethodologyFlow } from "../../components/MethodologyFlow";
import { DataProvenanceDates } from "../../components/DataProvenanceDates";
import { WatchEvidenceStatus } from "../../components/WatchEvidenceStatus";
import { IconAlert, IconCloudRain, IconDroplet, IconFlow, IconInfo, IconSatellite } from "../../components/icons";
import { modelCard } from "../../lib/data";

const labels = [
  { code: "APWRIMS (AP-GWD)", text: "Recorded mandal depth history. Modelled nowcasts are separate derived values; neither is presented as a certified official output." },
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
    name: "NASA / NDMC GRACE-DA (assimilated model)",
    can: "Percentile indicators of groundwater and soil wetness from a land model assimilating satellite-gravity observations.",
    cant: "The 0.25° model grid does not imply independent well-scale observations. Regional context, not measured depth, recoverable storage or a mandal forecast.",
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
        variant="compact"
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
            <strong>Bottom line:</strong> piezometer readings establish observed depth; GRACE-DA, rainfall and ET add
            regional context. The product supports comparison and verification, not causal attribution or replacement
            of field measurements. <a href="https://nasagrace.unl.edu/" target="_blank" rel="noreferrer">NASA / NDMC product documentation</a>.
          </span>
        </div>
      </section>

      <section className="card">
        <div className="cardHead">
          <div className="cardTitle">
            <span className="titleIcon">
              <IconCloudRain />
            </span>
            Monsoon Watch — how the recharge figures are built
          </div>
          <span className="cardSub">derived depth changes / baseline review pending</span>
        </div>
        <div className="methodSteps">
          <p>
            For each source series the watch takes the change in depth from its May reading to its latest reading of the
            same year, and compares that with the median of the <strong>same mandal&rsquo;s</strong> May-to-that-month
            change over the previous ten years. These are seasonal depth changes, not direct recharge volumes.
            Station composition, gaps and changes in monitoring practice can affect comparisons.
          </p>
          <p>
            A mandal is flagged short only when it misses its own normal by at least <strong>1 m</strong> and by at
            least <strong>twice its own year-to-year spread</strong>. Either test alone fails in an opposite way:
            metres alone flag every naturally swinging hard-rock mandal, and spread alone flags a delta mandal that
            moved twenty centimetres more than usual. The spread is a median absolute deviation rather than a
            standard deviation, because one displaced well inflates a standard deviation enough to hide the very
            season it should flag. Mandals with fewer than seven comparable years are left out rather than compared
            against a normal that is not yet established.
          </p>
          <p>
            Rainfall context is CHIRPS at 0.05° averaged over each mandal polygon, walked back to <strong>1981</strong>
            &nbsp;— 45 years and thirteen El Niño events, which is what makes the rainfall composite worth reporting at
            all. The ocean state is NOAA&rsquo;s Oceanic Niño Index.
          </p>
          <p>
            <strong>ONI groups rainfall-history composites; it does not generate local groundwater predictions.</strong> Adding it to the three-month forecast was tested
            on rolling origin and made the forecast worse — 1.776 m to 1.850 m mean error, and worse in every aquifer.
            The groundwater forecast experiment remains research-only. Historical ENSO associations do not establish a local forecast or causation.
          </p>
        </div>
      </section>

      <WatchEvidenceStatus />

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

      <section className="card">
        <div className="cardHead">
          <div className="cardTitle">
            <span className="titleIcon">
              <IconFlow />
            </span>
            How this site is measured
          </div>
          <span className="cardSub">what is recorded about a visit</span>
        </div>
        <div className="methodSteps">
          <p>
            Visits are counted with <a href="https://www.goatcounter.com/" target="_blank" rel="noreferrer">
            GoatCounter</a>, which sets no cookies, stores no IP address and builds no profile across sites. What
            is recorded is the page opened, and — on the Monsoon Watch page — whether a visit used the film, the
            Pacific map, the mandal map or the download, and which of the page&rsquo;s sections came into view.
            Each of those is counted at most once per visit, so a figure means the number of visits that did
            something rather than the number of clicks one reader made.
          </p>
          <p>
            It exists to answer one question honestly: which of this evidence is actually reaching anyone. Nothing
            is recorded for a browser that sends Global Privacy Control, and any reader can switch counting off
            for this site for good by opening a page with <code>#toggle-goatcounter</code> on the end of the
            address.
          </p>
        </div>
      </section>
    </div>
  );
}
