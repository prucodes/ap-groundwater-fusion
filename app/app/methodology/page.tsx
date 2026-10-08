import Link from "next/link";
import { HeaderHero } from "../../components/HeaderHero";
import { MethodologyFlow } from "../../components/MethodologyFlow";
import { DataProvenanceDates } from "../../components/DataProvenanceDates";
import { WatchEvidenceStatus } from "../../components/WatchEvidenceStatus";
import { IconAlert, IconCloudRain, IconDroplet, IconFlow, IconInfo, IconLeaf, IconSatellite } from "../../components/icons";
import { basePath, mapGeometry, modelCard } from "../../lib/data";
import { stateSummary } from "../../lib/stateSummary";
import { checkRecord } from "../../lib/cropWaterRecord";
import { summerOutlook as summer } from "../../lib/summer";
import { brief } from "../../lib/pageBriefs";
import crossNetwork from "../../data/cross_network_check.json";

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
  { code: "official_rebuilt", text: "Official outline rebuilt from the State's AWARE boundary points, kept only within 3% of the official area. official_flag stays false: rebuilt, not an official export." },
  { code: "public_prototype", text: "Public prototype outline, used where no official outline passed its checks." },
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
  "Most mandal outlines are rebuilt from the State's official boundary points (AWARE); the rest are public prototypes. An official boundary export from APSAC/RTGS would remove the rebuild step.",
  "Outputs are prototype review signals, not official mandal-level groundwater determinations.",
  modelCard.disclosures.spatial,
  modelCard.disclosures.crossNetwork,
  modelCard.disclosures.climateBalance,
  ...(modelCard.disclosures.rainfall ? [modelCard.disclosures.rainfall] : []),
  ...(modelCard.disclosures.carriedForward ? [modelCard.disclosures.carriedForward] : []),
];

export default function MethodologyPage() {
  const record = checkRecord();
  const tallyOf = (pick: (entry: (typeof record.record)[string]) => string) =>
    Object.values(record.record).reduce<Record<string, number>>((tally, entry) => ({ ...tally, [pick(entry)]: (tally[pick(entry)] ?? 0) + 1 }), {});
  const verdicts = tallyOf(entry => entry.rainfed.verdict), allCropland = tallyOf(entry => entry.allCropland.verdict);
  const fieldTally = tallyOf(entry => entry.sentinel?.verdict ?? "untested");
  const seasonSpan = `${record.seasons[0]}–${String(record.seasons[record.seasons.length - 1]).slice(2)}`;
  return (
    <div className="pageWrap">
      <HeaderHero
        title="Methodology"
        brief={brief("/methodology")}
        showChips={false}
        variant="compact"
        actions={
          <>
            <a className="heroAction heroActionLead" href={`${basePath}/brief/ap-water-intelligence-brief.pdf`} download="AP-Water-Intelligence-brief.pdf" data-testid="methodology-brief-pdf">
              <span className="heroActionLabel">Download the six-page brief</span>
              <span className="heroActionSub">Sources, model and this week&rsquo;s maps (PDF)</span>
            </a>
            <Link className="heroAction" href="/brief/">
              <span className="heroActionLabel">Read it on screen</span>
              <span className="heroActionSub">The same brief as a page</span>
            </Link>
          </>
        }
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
          <p data-sourced="phase3_levels/data/mandal_rain_history_imd.csv reports/imd_rainfall_experiment.json">
            <strong>Checked against IMD&rsquo;s own rainfall grid.</strong>{" "}The India Meteorological Department&rsquo;s 0.25° grid
            (Pai et al. 2014), the rainfall officials quote, agrees with the CHIRPS record the model reads: across 604 mandals from
            2014 to 2025 the June to September totals match on average (CHIRPS at 1.00 of IMD), month by month they move together
            (r&nbsp;=&nbsp;0.87), and a wet or a dry season reads the same way in 78% of mandal-seasons. As the model&rsquo;s rain,
            IMD would cut the nowcast&rsquo;s error by about 2% (1.060 m to 1.041 m over 2024 and 2025, better in 18 of 24 months).
            IMD publishes a year&rsquo;s grid only after the year ends, while CHIRPS posts each month in about three weeks, and the
            weekly nowcast needs this season&rsquo;s rain, so CHIRPS stays the input.
          </p>
          <p>
            <strong>When the three-month forecast can and cannot be trusted in a dry year.</strong>{" "}Retrained every quarter since
            2018 and scored on what followed, forecasts whose three months turned out at least 25% drier than normal during the
            monsoon expected about 1.2 m more recharge than happened (2.26 m mean error against 1.81 m for assuming no change).
            That happens when the forecast is made before the season fails, as from June for September: nothing measured then
            says the monsoon will fail. Forecasts made from October, once the season is over, carry no such bias (between
            &minus;0.3 m and +0.6 m). Shrinking toward no change and correcting by past bias were both tested;
            neither improved every period, so the released forecast is unchanged. The model was also re-run on the State&rsquo;s
            official mandal outlines: error moved by under 0.3% (1.797 m against 1.800 m), so its inputs are unchanged.
          </p>
          <p>
            <strong>Each released forecast says how such forecasts have fared.</strong>{" "}The same backtest, split by the month a
            forecast is made and by whether the rain over the three months before it ran short, near normal or above, shows where
            the forecast earns its place: made in June it beat assuming no change by 11&ndash;21% whatever the rain; made in July,
            after a dry or ordinary spell (24% and 16%) but not after a wet one; made in August or September, after an ordinary
            spell (19% and 12%), and about as well as no change after a dry or wet one. Every forecast carries the verdict of its own cell, with the error behind it,
            and &ldquo;lower confidence&rdquo; where it has not beaten no change. A rule built on El Ni&ntilde;o at the forecast
            date was tested first and rejected: forecasts made while the Pacific was already warm beat no change as often as any
            others. In October 2026 the rainfall record was rebuilt from 1981 so that mandals drawn in more than one part average
            rain over every part (seven mandals moved by 1.8&ndash;3.1%); retrained on it, the forecast&rsquo;s error was 1.794 m.
            Later that month the months the State carried forward in 2021 were taken out as missing (see the caveats below):
            over the backtest since 2018 the released forecast&rsquo;s error fell from 2.22 m to 2.17 m; over the months since
            2024 it rose from 1.73 m to 1.81 m, still well under assuming no change (2.22 m).
          </p>
        </div>
      </section>

      <CrossNetworkCheck />

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

      <section className="card" aria-labelledby="method-summer" data-testid="method-summer">
        <div className="cardHead">
          <div className="cardTitle" id="method-summer">
            <span className="titleIcon">
              <IconDroplet />
            </span>
            Summer water outlook: next May against each mandal&rsquo;s own record
          </div>
          <span className="cardSub">APWRIMS monthly levels / own past winters / leave-one-year-out record</span>
        </div>
        <div className="methodSteps">
          <p>
            <strong>The projection.</strong>{" "}For each mandal with at least four past winters in the APWRIMS monthly series ({summer.firstYear} on),
            the May depth is its latest reading plus its own drawdown from the same month to May: the median of its past winters for a
            typical winter, and the largest for a dry one. Set against the deepest May the same series has recorded, a mandal is
            &ldquo;beyond its record&rdquo; when the typical projection is deeper, &ldquo;in a dry winter&rdquo; when only the dry one is.
            Against its own record, because the depth at which a well fails depends on how deep it was drilled, which no public record
            gives; beside it, whether the May depth would be more than {summer.deepM} m down, a class boundary on CGWB&rsquo;s
            depth-to-water maps, since a delta mandal can break its own record with water three metres down.
            {summer.people ? <>{" "}How many people live in those mandals comes from WorldPop&rsquo;s {summer.people.year} population grid (1 km,
            UN-adjusted, CC BY 4.0), summed over each outline: a modelled estimate that counts everyone in the mandal, towns with piped
            supply included, not a census and not a count of people on wells.</> : null}
          </p>
          {summer.backtest ? <p>
            <strong>How it has fared.</strong>{" "}Each past year was projected from the other years&rsquo; winters alone, from its{" "}
            {summer.backtest.anchorMonth} reading ({summer.backtest.comparisons.toLocaleString("en-IN")} mandal-years). The typical projection was
            off by a median {summer.backtest.typicalErrorM.toFixed(1)} m, against {summer.backtest.persistenceErrorM.toFixed(1)} m for assuming no
            change. Mandals called beyond their record went past it in {summer.backtest.pastRecordPct.beyond?.toFixed(0)}% of years, against{" "}
            {summer.backtest.baseRatePct.toFixed(0)}% of all mandal-years and {summer.backtest.pastRecordPct.within?.toFixed(0)}% of those called
            within it. A ranking of where to look first, not a forecast of this winter&rsquo;s rain.
          </p> : null}
        </div>
      </section>

      <section className="card" aria-labelledby="method-field-week">
        <div className="cardHead">
          <div className="cardTitle" id="method-field-week">
            <span className="titleIcon">
              <IconLeaf />
            </span>
            This week in the fields: crop water, crop vegetation and the groundwater category
          </div>
          <span className="cardSub">FAO-56 water balance / satellite index / official assessment</span>
        </div>
        <div className="methodSteps">
          <p>
            <strong>The crop water check</strong>{" "}is an FAO-56 Chapter 8 root-zone water balance run for every mandal, for a crop
            and growth stage the reader chooses. It starts from the soil moisture APWRIMS publishes (NRSC&rsquo;s VIC model:
            plant-available water to 5, 30, 100 and 150 cm as a share of what the soil holds) and steps forward a day at a time
            to a week ahead with ECMWF&rsquo;s open IFS forecast of reference evapotranspiration (Penman-Monteith) and rain, via
            Open-Meteo. How much the soil holds in millimetres comes from ISRIC SoilGrids 2.0 (field capacity minus wilting point,
            by depth). Rain under a fifth of the day&rsquo;s reference evapotranspiration is treated as evaporated; the crop uses
            Ks&nbsp;&times;&nbsp;Kc&nbsp;&times;&nbsp;ETo; stress begins once it has used the share p of the root zone&rsquo;s
            available water that Table 22 gives it, adjusted for its rate of use, and below that its water use falls in proportion
            (Eq.&nbsp;84). Roots are 0.2 m at the initial stage and afterwards the larger Table 22 depth, the one its footnote gives
            for rainfed crops, capped at 1.5 m, the deepest the soil model reports. The pipeline runs its own copy of the
            calculation for every crop and stage and the page must reproduce its counts. Crop and stage are chosen, not observed;
            no irrigation, runoff or capillary rise is modelled; it is a screening view, not a watering instruction.
          </p>
          <p>
            <strong>Crop vegetation</strong>{" "}is NOAA STAR&rsquo;s weekly Vegetation Condition Index, the same 4 km files Drought
            Watch reads: this week&rsquo;s greenness against the same week in every year on record. Here each 4 km cell is weighted
            by its cropland share from ESA WorldCover 2021 (10 m, read at about 330 m), so forest on the Eastern Ghats does not stand
            in for fields; a mandal with less than half a cell of cropland keeps the plain value and says so. The headline is the
            mean of the last four weeks, classed by the drought manual&rsquo;s Table 3.4 (60&ndash;100 normal, 40&ndash;60
            moderate, below 40 severe). WorldCover is a 2021 snapshot, not this season&rsquo;s sowing, and the index measures plant
            vigour, not yield.
          </p>
          <p>
            <strong>The groundwater category</strong>{" "}is the official Dynamic Ground Water Resources assessment, made each year by
            the Central Ground Water Board and the State Ground Water Department under the GEC-2015 method, read from the public
            dashboard of INGRES. In Andhra Pradesh the assessment unit is the mandal; its stage of extraction is the year&rsquo;s
            groundwater draft over the annual extractable resource (safe up to 70%, semi-critical to 90%, critical to 100%,
            over-exploited above; saline where the water is too salty to use). Units are matched to our boundaries by district and
            name, then by the district a boundary&rsquo;s neighbours give it (the prototype map labels some same-named mandals with
            another district), then by spelling; city wards assessed separately stay unmatched, and every match records how it was
            made. The statewide stage is INGRES&rsquo;s own figure, not a sum we recompute.
          </p>
          <p>
            <strong>How the crop water check has fared.</strong>{" "}The check is re-run on every week from early July to early September of
            each kharif season from {record.seasons[0]}, with the soil moisture APWRIMS held on each date and the weather that actually
            followed (ERA5 reanalysis, so &ldquo;within seven days&rdquo; is tested as if the forecast were perfect). The outcome is crop
            vegetation three weeks later: the satellite index over cropland, which the soil model does not use. Two comparisons were run
            first and are kept on record, because each misleads for a reason that is not the check. Pooled across mandals, the calls do
            not separate vegetation at all: the places called short most often are the chronically dry ones, the index compares each
            place with its own past, and irrigated fields stay green whatever the soil model says. Inside one mandal but pooled across
            seasons, the gap is large, mostly because &ldquo;short&rdquo; calls come in drier seasons: the check tells a dry season from a
            wet one, as rainfall alone would. The verdict holds both fixed: the same mandal in the same season, vegetation after a
            &ldquo;short&rdquo; call against after a &ldquo;comfortable&rdquo; one. And because the check is a rainfed water balance, it
            is read over rainfed fields: the {record.rainfed.mandals} mandals where less than {record.rainfed.belowPct}% of the cropland
            was mapped irrigated (ESA WorldCereal), with the vegetation index weighted to rainfed cropland only. &ldquo;Backed by its
            record&rdquo; needs it at least {record.rules.backedPoints} index points lower, overall and in every season;
            &ldquo;weak&rdquo; at least {record.rules.notedPoints} point lower; &ldquo;not borne out&rdquo; otherwise. On {seasonSpan},
            of {Object.keys(record.record).length} crop-stage pairs, {verdicts.backed ?? 0} {(verdicts.backed ?? 0) === 1 ? "is" : "are"}{" "}
            backed, {verdicts.weak ?? 0} weak, {verdicts["not borne out"] ?? 0} not borne out and {verdicts.untested ?? 0} untested over
            rainfed fields (over all cropland, irrigated fields included: {allCropland.backed ?? 0} backed, {allCropland.weak ?? 0} weak,{" "}
            {allCropland["not borne out"] ?? 0} not borne out, {allCropland.untested ?? 0} untested). The index covers whatever is
            growing, not the chosen crop, so this tests whether the check finds real water shortage, not whether a particular crop
            suffered.
          </p>
          {record.sentinel ? <p data-testid="method-sentinel">
            <strong>At field scale.</strong>{" "}The 4 km index is one value for some 1,600 hectares, irrigated and rainfed, crop and
            scrub. Sentinel-2 (ESA) sees the same ground at 10 m every two to three days; the record reads it at {record.sentinel.resolutionM} m
            over rainfed cropland pixels only (WorldCover cropland that WorldCereal does not map as irrigated), takes the greenest clear
            view of each week, and compares the three-week change in NDVI, less the State&rsquo;s change that week, inside the same
            mandal and season. The bars were set before the outcomes were read: &ldquo;backed&rdquo; at {record.sentinel.rules.backedNdvi} less NDVI
            change after &ldquo;short&rdquo;, in every season of at least two; &ldquo;weak&rdquo; at {record.sentinel.rules.notedNdvi}. Kharif is
            cloudy: {record.sentinel.coverage.readPct}% of rainfed mandal-weeks had a clear view in both weeks. A greenest-view composite can
            read a little lower in a week with fewer clear passes; taking out the State&rsquo;s change that week removes most of that, not
            all. Correction: the first build of this reading, published on 4 October 2026, took the archive&rsquo;s reflectance
            offset off a second time, which pushed every pixel&rsquo;s NDVI towards 1; its verdicts are withdrawn, and the figures
            here are rebuilt from the corrected reads. On {seasonSpan}:{" "}
            {fieldTally.backed ?? 0} backed, {fieldTally.weak ?? 0} weak, {fieldTally["not borne out"] ?? 0} not borne out and{" "}
            {fieldTally.untested ?? 0} untested.
          </p> : null}
          <p>
            <strong>Where field teams would learn most.</strong>{" "}This Week lists the mandals where four or more of six published signals
            point to stress at once: groundwater short of its seasonal normal, gauge rain 20% or more below normal, soil among the driest
            quarter of years, four or more of the seven reference crops short of water at mid-season, crop vegetation severely below
            normal, and a semi-critical or worse official category. It is a count of stated tests, shown signal by signal, to direct
            verification visits: not a ranking of need, an allocation or a declaration. The signals are not all independent.
          </p>
          <p>
            <strong>The live scorecard.</strong>{" "}The track record re-runs the check with the weather that happened. The stricter test
            is the calls the page actually made: each Monday the refresh writes down every mandal&rsquo;s call for every crop and stage,
            on that week&rsquo;s ECMWF forecast, and never changes it (phase3_levels/data/field_calls). Three weeks on, when NOAA has
            published that week&rsquo;s vegetation index, the calls are scored the way the track record scores them, over rainfed fields.
            {record.live?.frozen ? ` ${record.live.frozen} week${record.live.frozen === 1 ? "" : "s"} frozen so far, ${record.live.scored} scored.` : ""}
          </p>
          <p>
            <strong>Rainfed or irrigated.</strong>{" "}ESA WorldCereal maps actively irrigated cropland at 10 m from Sentinel-1 and -2; over
            Andhra Pradesh its season is rabi 2020&ndash;21. Counted per 4 km vegetation cell and per mandal against ESA WorldCover&rsquo;s
            cropland, it marks {record.rainfed.mandals} of {record.rainfed.of} mandals as mostly rainfed ({record.rainfed.stateIrrigatedPct}%
            of the State&rsquo;s cropland mapped irrigated). It is one season&rsquo;s satellite detection, not the irrigation census, and
            it cannot say which crop is grown: no open map does for groundnut, cotton, chilli or the pulses.
          </p>
          <p>
            <strong>Rabi Outlook, the digest and field reports.</strong>{" "}The Rabi Outlook puts reservoir storage by basin beside soil
            moisture against its own past in the mostly rainfed mandals, and the northeast monsoon beside what past El Niño years brought;
            it recommends no crop, release or sowing date. The weekly digest is the same figures on one A4 sheet, printed to PDF by each
            deploy. Field reports are written on the phone and shared as text; nothing is sent anywhere until a person shares it, and a
            collector&rsquo;s page reads the shared messages back into a table beside what the site called that week.
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
            declare drought. Step 1, Trigger 1 (Table 3.11): a <strong>dry spell</strong>{" "}of four weeks in a row with under half the
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
            <strong>Boundaries.</strong>{" "}The State&rsquo;s mandal geography gives every boundary vertex with the official area, LGD codes,
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
            <strong>Constituencies.</strong>{" "}Each mandal is counted in the one assembly constituency its State record names, or,
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

const pct = (share: number | null) => (share === null ? "—" : `${Math.round(share * 100)}%`);

/** The forecast on CGWB's wells, which the model never trained on (phase3_levels/validate_cross_network.py). */
function CrossNetworkCheck() {
  const c = crossNetwork;
  const o = c.overall;
  const first = c.years[0], last = c.years[c.years.length - 1];
  return (
    <section className="card" aria-labelledby="method-cross-network" data-testid="method-cross-network">
      <div className="cardHead">
        <div className="cardTitle" id="method-cross-network">
          <span className="titleIcon"><IconDroplet /></span>
          Checked on wells it never saw
        </div>
        <span className="cardSub">CGWB &middot; {c.stations.toLocaleString("en-IN")} wells &middot; {first} to {last}</span>
      </div>
      <p className="crossLead">
        On CGWB&rsquo;s own wells, which the model never trained on, the three-month forecast called whether the water table
        would rise or fall in <b>{pct(o.direction.forecast)}</b>{" "}of mandal-seasons; the State&rsquo;s own wells agree with
        CGWB&rsquo;s {pct(o.direction.measured)} of the time. It keeps pace in an ordinary season and misses most turns when
        the monsoon breaks the pattern.
      </p>
      <div className="overviewHeadlines headlines3">
        <div className="headlineCard headlineStatic">
          <span className="headlineKicker">The forecast</span>
          <strong>{pct(o.direction.forecast)}<small>rise or fall called right</small></strong>
          <span className="headlineText">{o.clearMoves.toLocaleString("en-IN")} mandal-seasons where CGWB&rsquo;s wells moved at least {c.minMoveM} m, in {c.mandals} mandals.</span>
        </div>
        <div className="headlineCard headlineStatic">
          <span className="headlineKicker">The State&rsquo;s own wells</span>
          <strong>{pct(o.direction.measured)}<small>agree with CGWB</small></strong>
          <span className="headlineText">The ceiling: two networks of different wells do not always move together.</span>
        </div>
        <div className="headlineCard headlineStatic">
          <span className="headlineKicker">When the season broke the pattern</span>
          <strong>{pct(o.bySeason.broke.forecast)}<small>of turns caught</small></strong>
          <span className="headlineText">The State&rsquo;s wells caught {pct(o.bySeason.broke.measured)}; in an ordinary season the forecast matched {pct(o.bySeason.usual.forecast)}. After a failing monsoon, read it with care.</span>
        </div>
      </div>
      <details className="foldMore">
        <summary><span>How this was checked</span><span>Windows, years, what was left out and why</span></summary>
        <p className="cardNote">
          CGWB reads its National Hydrograph Network by hand in May, August and November. None of these wells feeds the
          model, which learns only from the State&rsquo;s APWRIMS series. The rolling backtest retrains the forecast every
          quarter and scores the three months that follow, and two of its windows line up with CGWB&rsquo;s rounds: May to
          August and August to November. Each mandal-season compares the forecast&rsquo;s change with the median change of
          CGWB&rsquo;s wells inside that mandal&rsquo;s outline.
        </p>
        <p className="cardNote">
          Depths are not compared. CGWB&rsquo;s wells are mostly shallow dug wells and the State&rsquo;s are piezometers: in
          metres of change even the State&rsquo;s wells sit {o.errorM.measured.toFixed(1)} m from CGWB&rsquo;s on average, more
          than assuming no change ({o.errorM.noChange.toFixed(1)} m). The direction of the change is what the two networks share.
        </p>
        <div className="tableWrap">
          <table className="dataTable compact">
            <thead><tr><th>Window</th><th>Years</th><th>Mandal-seasons</th><th>Forecast</th><th>State&rsquo;s wells</th></tr></thead>
            <tbody>
              {Object.values(c.windows).map((w) => (
                <tr key={w.label}>
                  <td>{w.label}</td>
                  <td>{w.years.join(", ")}</td>
                  <td>{w.clearMoves.toLocaleString("en-IN")}</td>
                  <td>{pct(w.direction.forecast)}</td>
                  <td>{pct(w.direction.measured)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="cardNote">
          Left out: {c.frozenMonths.join(", ")}. In those months nearly every mandal in the State&rsquo;s series repeats the
          month before, against about one in twenty in an ordinary month, so a change over them is zero by construction.
          CGWB&rsquo;s readings come from India Data Portal (ISB), which runs to August 2023; India-WRIS did not answer on
          8 October 2026. Built by <code>phase3_levels/validate_cross_network.py</code>.
        </p>
      </details>
    </section>
  );
}
