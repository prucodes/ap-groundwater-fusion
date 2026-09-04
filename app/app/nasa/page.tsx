import { HeaderHero } from "../../components/HeaderHero";
import { DistrictMap } from "../../components/DistrictMap";
import { PercentileBar, WetnessTag } from "../../components/Signals";
import {
  IconActivity,
  IconDatabase,
  IconDroplet,
  IconInfo,
  IconLeaf,
  IconPin,
  IconSatellite,
  IconShield,
  IconWaves,
} from "../../components/icons";
import {
  districtGeometry,
  formatNumber,
  nasaProvenance,
  satelliteSamples,
  titleCase,
  wetnessTier,
} from "../../lib/data";
import type { NasaRaster } from "../../lib/data";

const SIGNAL_ICON: Record<string, React.ReactNode> = {
  GW: <IconDroplet />,
  "Root-Zone": <IconLeaf />,
  Surface: <IconWaves />,
};

function SignalGauge({ r }: { r: NasaRaster }) {
  const tier = wetnessTier(r.mean);
  return (
    <div className="sigGauge" style={{ ["--sig" as string]: tier.color }}>
      <div className="sigGaugeHead">
        <span className="sigGaugeIcon">{SIGNAL_ICON[r.signal] ?? <IconSatellite />}</span>
        <div className="sigGaugeTitle">
          <strong>{r.signal === "GW" ? "Groundwater" : r.signal}</strong>
          <span>{r.label} · percentile</span>
        </div>
      </div>
      <div className="sigGaugeValue">
        {formatNumber(r.mean)}
        <span className="sigGaugeUnit">mean %ile</span>
      </div>
      <div className="sigGaugeTrack">
        <span className="sigGaugeSpan" style={{ left: `${r.min}%`, right: `${100 - r.max}%` }} />
        <span className="sigGaugeMean" style={{ left: `${r.mean}%` }} />
      </div>
      <div className="sigGaugeScale">
        <span>min {formatNumber(r.min)}</span>
        <span>max {formatNumber(r.max)}</span>
      </div>
      <div className="sigGaugeFoot">
        <WetnessTag value={r.mean} />
        <span className="sigGaugeN">{r.count} district samples</span>
      </div>
    </div>
  );
}

export default function NasaSignalsPage() {
  const districts = [...districtGeometry.districts].sort(
    (a, b) => (b.gw_percentile ?? 0) - (a.gw_percentile ?? 0),
  );
  const sampleDate = nasaProvenance.fetch_date || satelliteSamples[0]?.satellite_sample_date_or_fetch_date || "—";
  const gwRange = districtGeometry.layers.gw_percentile;

  return (
    <div className="pageWrap">
      <HeaderHero
        title="NASA GRACE-DA — Raw Signal & Provenance"
        subtitle={
          <>
            The <strong>unfused satellite truth layer</strong>: raw NASA/NDMC GRACE-DA groundwater, root-zone and
            surface percentiles — exactly as extracted, with full source provenance. Percentiles (0–100), <em>not</em>{" "}
            groundwater depth. This is the evidence behind every fused number in the dashboard.
          </>
        }
        showChips={false}
        variant="compact"
      />

      {/* Trust ribbon — provenance at a glance */}
      <div className="provRibbon">
        <span className="provRibbonItem"><IconSatellite /> {nasaProvenance.source}</span>
        <span className="provRibbonDot" />
        <span className="provRibbonItem"><IconDatabase /> {nasaProvenance.rasters.length} rasters · ~25 km</span>
        <span className="provRibbonDot" />
        <span className="provRibbonItem"><IconPin /> {nasaProvenance.station_points_sampled} district points</span>
        <span className="provRibbonDot" />
        <span className="provRibbonItem"><IconShield /> {nasaProvenance.total_null_or_nodata_samples} null / nodata</span>
        <span className="provRibbonDot" />
        <span className="provRibbonItem"><IconInfo /> fetched {sampleDate}</span>
      </div>

      {/* Signal-strength centerpiece */}
      <section className="card">
        <div className="cardHead">
          <div className="cardTitle"><span className="titleIcon"><IconActivity /></span>Signal Strength — across all 28 district centroids</div>
          <span className="cardSub">mean with min–max range · GRACE-DA</span>
        </div>
        <div className="sigGaugeRow">
          {nasaProvenance.rasters.map((r) => (
            <SignalGauge key={r.raster_name} r={r} />
          ))}
        </div>
        <div className="fusionNote" style={{ marginTop: 16 }}>
          <IconInfo />
          <span>
            All three signals read high this period — the aquifer-storage and soil-moisture columns are wetter than
            most years on record for this date. A <strong>percentile</strong> compares today against this location&apos;s
            own 1948–2014 history; it is a measure of <strong>stress and trend</strong>, never an absolute water depth.
          </span>
        </div>
      </section>

      {/* Map — where the signal lands */}
      <section className="card mapCard">
        <div className="cardHead">
          <div className="cardTitle">
            <span className="titleIcon"><IconDroplet /></span>
            District Groundwater Percentile — where the signal lands
          </div>
          <span className="cardSub">zonal mean per district</span>
        </div>
        <DistrictMap layer="gw_percentile" height={440} />
        <div className="choroLegend">
          <div className="choroHead">
            <span>NASA Groundwater %ile <span className="choroUnit">(0–100)</span></span>
            <span className="choroPeriod">{sampleDate}</span>
          </div>
          <div className="choroBar" style={{ background: "linear-gradient(90deg, #e6f1f8, #0e6f95)" }} />
          <div className="choroScale">
            <span>Lower · {formatNumber(gwRange.min)}</span>
            <span>Higher · {formatNumber(gwRange.max)}</span>
          </div>
          <div className="mapHint">
            <IconInfo style={{ width: 13, height: 13 }} /> GRACE works well at district/basin scale; at mandal scale it
            is a regional proxy (sub-pixel), so it is shown only at district level.
          </div>
        </div>
      </section>

      {/* Raster provenance — the unique "is this real?" layer */}
      <section className="card">
        <div className="cardHead">
          <div className="cardTitle"><span className="titleIcon"><IconDatabase /></span>Source rasters — provenance &amp; integrity</div>
          <span className="cardSub">downloaded GeoTIFFs · verifiable</span>
        </div>
        <div className="provGrid">
          {nasaProvenance.rasters.map((r) => (
            <div key={r.raster_name} className="provCard">
              <div className="provCardHead">
                <span className="provCardIcon">{SIGNAL_ICON[r.signal] ?? <IconSatellite />}</span>
                <div>
                  <strong>{r.signal === "GW" ? "Groundwater" : r.signal}</strong>
                  <code className="provFile">{r.raster_name}</code>
                </div>
              </div>
              <dl className="provMeta">
                <div><dt>Resolution</dt><dd>{r.resolution_km} <span className="provDim">({r.resolution_deg}°)</span></dd></div>
                <div><dt>Grid</dt><dd>{r.width} × {r.height} · {r.crs}</dd></div>
                <div><dt>Type</dt><dd>{r.dtype} · nodata {r.nodata}</dd></div>
                <div><dt>Size</dt><dd>{r.file_size_kb} KB</dd></div>
                <div><dt>Fetched</dt><dd>{r.fetch_date}</dd></div>
                <div><dt>SHA-256</dt><dd><code className="provHash">{r.sha256_short}…</code></dd></div>
              </dl>
              <a className="provLink" href={r.source_url} target="_blank" rel="noreferrer">
                <IconSatellite /> {r.source_url.replace(/^https?:\/\//, "")}
              </a>
            </div>
          ))}
        </div>
        <div className="fusionNote" style={{ marginTop: 14 }}>
          <IconShield />
          <span>
            Every value on this page traces to one of these open NASA files — with its source URL, resolution and a
            SHA-256 checksum so the exact raster can be re-fetched and verified. {nasaProvenance.data_label}.
          </span>
        </div>
      </section>

      <section className="card">
        <div className="cardHead">
          <div className="cardTitle"><span className="titleIcon"><IconSatellite /></span>District GRACE-DA percentiles</div>
        </div>
        <div className="tableWrap">
          <table className="dataTable">
            <thead>
              <tr><th>District</th><th>Groundwater</th><th>Root-Zone</th><th>Surface</th><th>Assessment</th><th>Mandals</th></tr>
            </thead>
            <tbody>
              {districts.map((d) => (
                <tr key={d.d}>
                  <td className="cellStrong">{titleCase(d.d)}</td>
                  <td><PercentileBar value={d.gw_percentile} /></td>
                  <td><PercentileBar value={d.rootzone_percentile} /></td>
                  <td><PercentileBar value={d.surface_percentile} /></td>
                  <td><WetnessTag value={d.gw_percentile} /></td>
                  <td>{d.mandal_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="cardHead">
          <div className="cardTitle"><span className="titleIcon"><IconPin /></span>District-centroid samples (raw extraction)</div>
          <span className="cardSub">GRACE-DA raster sampled at each of the 28 district centroids</span>
        </div>
        {/* The percentiles here repeat the table above; what is unique is the
            raster sample point and its coordinates. Collapsed so the provenance
            stays available without spending ~1,700px repeating numbers. */}
        <details className="rawTable">
          <summary>Show the raw extraction — coordinates and sample points for all 28 districts</summary>
        <div className="tableWrap">
          <table className="dataTable">
            <thead>
              <tr><th>Sample point</th><th>District</th><th>Mandal</th><th>Lat</th><th>Lon</th><th>GW %ile</th><th>Root-Zone</th><th>Surface</th><th>Sampled</th></tr>
            </thead>
            <tbody>
              {satelliteSamples.map((s) => (
                <tr key={s.station_id}>
                  <td className="cellStrong">{s.station_name}</td>
                  <td>{titleCase(s.district_name)}</td>
                  <td>{titleCase(s.mandal_name)}</td>
                  <td>{Number(s.latitude).toFixed(3)}</td>
                  <td>{Number(s.longitude).toFixed(3)}</td>
                  <td className="cellPct">{formatNumber(s.groundwater_percentile)}</td>
                  <td className="cellPct">{formatNumber(s.rootzone_percentile)}</td>
                  <td className="cellPct">{formatNumber(s.surface_percentile)}</td>
                  <td>{s.satellite_sample_date_or_fetch_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </details>
      </section>
    </div>
  );
}
