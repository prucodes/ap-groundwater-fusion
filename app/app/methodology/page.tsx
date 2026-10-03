import Link from "next/link";
import { HeaderHero } from "../../components/HeaderHero";
import { MethodologyFlow } from "../../components/MethodologyFlow";
import { DataProvenanceDates } from "../../components/DataProvenanceDates";
import { WatchEvidenceStatus } from "../../components/WatchEvidenceStatus";
import { IconAlert, IconCloudRain, IconDroplet, IconFlow, IconInfo, IconSatellite } from "../../components/icons";
import { mapGeometry, modelCard } from "../../lib/data";
import { stateSummary } from "../../lib/stateSummary";

const labels = [
  { code: "APWRIMS (AP-GWD)", text: "Recorded mandal depth history. Modelled nowcasts are separate derived values; neither is presented as a certified official output." },
  { code: "measured_public", text: "Public measured groundwater (e.g. NWIC). Labeled public, never official_apwrims." },
  { code: "official_apwrims", text: "Official APWRIMS / AP government export. Pending — required for official results." },
  { code: "satellite-model", text: "NASA/NDMC GRACE-DA percentiles (0–100). Real signal, not groundwater depth." },
  { code: "satellite-gauge-rainfall", text: "CHIRPS v3 monthly rainfall (mm), rebuilt from 1981. Climate context; not groundwater depth or direct measured recharge." },
  { code: "measured-gauge-rainfall", text: "AP DES mandal rain gauges via APWRIMS (mm), against the department's normal for the water year to date. Measured; not recharge or crop loss." },
  { code: "model-soil-moisture", text: "NRSC VIC land-surface model via APWRIMS: plant-available soil water at 5, 30, 100 and 150 cm, % of capacity. Modelled and rainfall-driven; not a field probe." },
  { code: "measured-reservoir-storage", text: "Reservoir telemetry via APWRIMS (TMC; releases in cusecs). Measured at the dam; a canal release is not water delivered to a mandal." },
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
    name: "CHIRPS v3 rainfall (satellite-gauge)",
    can: "Shows rainfall timing and anomalies that can support hydrologic interpretation.",
    cant: "Does not see groundwater or measured recharge and cannot establish a cause.",
    tone: "var(--sig-surface)",
  },
  {
    name: "AP DES rain gauges (measured, via APWRIMS)",
    can: "Measure this water year's rainfall per mandal against the department's own normal, updated daily.",
    cant: "Gauge density varies by mandal; a deficit does not measure recharge, crop stress or loss.",
    tone: "var(--sig-surface)",
  },
  {
    name: "NRSC VIC soil moisture (model, via APWRIMS)",
    can: "Shows how much plant-available water the soil holds at four depths, against the same calendar day in earlier years.",
    cant: "Modelled from rainfall and weather, so not independent of the gauges; not a field probe or a crop-water instruction.",
    tone: "var(--green)",
  },
  {
    name: "Reservoir storage and releases (measured, via APWRIMS)",
    can: "Gives storage against capacity and last year, and the release into each canal at the headworks.",
    cant: "Cannot say which mandals a canal reaches or how much arrives: the command-area map and delivery records are not public.",
    tone: "var(--cyan)",
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
            all. Since October 2026 the whole record is <strong>CHIRPS v3</strong>, rebuilt from 1981 rather than
            spliced: v2 production ends after December 2026, and v3 corrects gauges for wind undercatch and uses about
            four times the station sources, so the same month reads differently. The state&rsquo;s own rain gauges
            are shown beside it for the current water year; for June to August 2026 they read drier still. The ocean
            state is NOAA&rsquo;s Oceanic Niño Index.
          </p>
          <p>
            <strong>ONI groups rainfall-history composites; it does not generate local groundwater predictions.</strong> Adding it to the three-month forecast was tested
            on rolling origin and made the forecast worse — 1.776 m to 1.850 m mean error, and worse in every aquifer.
            The groundwater forecast experiment remains research-only. Historical ENSO associations do not establish a local forecast or causation.
          </p>
        </div>
      </section>

      <section className="card">
        <div className="cardHead">
          <div className="cardTitle">
            <span className="titleIcon">
              <IconDroplet />
            </span>
            Agriculture water watch — when the sources agree
          </div>
          <span className="cardSub">a count of stated tests / not a score</span>
        </div>
        <div className="methodSteps">
          <p>
            For each prototype mandal the water watch asks three questions and counts the yes answers. Is its groundwater
            flagged short of its own seasonal normal (the Monsoon Watch rule above, from measured wells)? Is its gauge
            rainfall for the water year <strong>20% or more below the department&rsquo;s normal</strong> (measured)? Is
            its soil moisture at 30 cm among the <strong>driest quarter of years</strong> for the same calendar day
            (modelled)? A source with no usable value for the mandal is left out of the count, never counted as a yes.
          </p>
          <p>
            Three yeses mean three sources point the same way, which is a reason to check that mandal first. It is not a
            drought declaration, a crop-loss estimate or a ranking of need. The soil model is driven by rainfall, so the
            rain and soil answers are not independent; groundwater is. Each source is joined to its boundary only when the
            join is unique: a boundary two source rows claim gets no value rather than the first or the worst.
          </p>
        </div>
      </section>

      <section className="card" aria-labelledby="method-drought">
        <div className="cardHead">
          <div className="cardTitle" id="method-drought">
            <span className="titleIcon">
              <IconDroplet />
            </span>
            Drought Watch — the national drought manual, applied per mandal
          </div>
          <span className="cardSub">steps 1–2 of 3 / not a declaration</span>
        </div>
        <div className="methodSteps">
          <p>
            The Drought Watch follows the <strong>Manual for Drought Management (2020)</strong>, the procedure a State must use to
            declare drought. Step 1, Trigger 1 (Table 3.11): a <strong>dry spell</strong> of four weeks in a row with under half the
            week&rsquo;s normal rain sets it; without one, only <strong>large-deficient</strong> rainfall (60% or more below normal)
            does. Weekly totals come from the AP DES gauges via APWRIMS; SPI from CHIRPS v3 since 1981 is reported as the second
            rainfall route.
          </p>
          <p>
            Step 2, Trigger 2 (Table 3.12), uses three of the manual&rsquo;s four impact indicators per mandal, each with its own
            table: the <strong>Vegetation Condition Index</strong> (NOAA&rsquo;s 4 km product; the manual prefers 56–500 m), the{" "}
            <strong>Percent Available Soil Moisture</strong> (the NRSC model at 30 cm, a four-week mean) and the{" "}
            <strong>Groundwater Drought Index</strong> (APWRIMS wells, ten years or more). Severe needs two severe and the third at
            least moderate; moderate needs two at moderate or worse. Area sown and reservoir storage are shown where they exist,
            by district and by reservoir. Step 3, field verification of crop loss (33% qualifies, over 50% for severe), and the
            notification by 31 October are the State&rsquo;s. Each judgement the manual leaves open is listed on the page.
          </p>
          <p><Link href="/drought">Open the Drought Watch</Link></p>
        </div>
      </section>

      <section className="card">
        <div className="cardHead">
          <div className="cardTitle">
            <span className="titleIcon">
              <IconDroplet />
            </span>
            The State&rsquo;s own geography and well readings (AWARE, via the AI Living Labs data lake)
          </div>
          <span className="cardSub">official boundaries, constituencies, latest State reading</span>
        </div>
        <div className="methodSteps">
          <p>
            <strong>Boundaries.</strong> The State&rsquo;s mandal geography gives every boundary vertex with the official area, LGD codes,
            revenue division and assembly and parliamentary constituency, but not the order the vertices run in. The outline is
            rebuilt as the shortest closed path through them (or, failing that, a concave hull tuned to the official area) and is
            drawn only where it lands within 3% of the official area, does not lie over its official neighbours, and touches the
            mandal it replaces (names repeat across districts, so a record that lands far from its mandal is treated as someone
            else&rsquo;s and withheld, codes and all); elsewhere the public prototype stays.{" "}
            {mapGeometry.official_summary
              ? `${mapGeometry.official_summary.outlines} of ${mapGeometry.mandals.length} outlines are official today. `
              : ""}
            Compared with the prototypes, about a third were the wrong shape (area off by more than 15%, or overlapping less than
            their coarseness explains). The model still computes its inputs on the prototype outlines until it is re-tested on these.
          </p>
          <p>
            <strong>Constituencies.</strong> Each mandal is counted in the one assembly constituency its State record names, or,
            without one, the constituency its centre falls in; a constituency&rsquo;s figures are its mandals&rsquo; counts and
            medians. Its outline is the State&rsquo;s own, rebuilt the same way and kept within 3% of the official area, else the
            union of its mandals.
          </p>
          <p>
            <strong>The State network&rsquo;s latest reading.</strong> One recent reading per location (early September), with the
            pre-monsoon, post-monsoon and year-ago levels. Its pre-monsoon value equals our APWRIMS May reading for{" "}
            {`${stateSummary.summary.preMonsoonSameAsOurMay} of ${stateSummary.summary.preMonsoonComparable}`} mandals, so it is the
            same department series, a month ahead. It is shown beside our monthly series, never merged into it, and the model
            does not use it.
          </p>
          <p><Link href="/constituencies">Open Constituencies</Link></p>
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
