import { HeaderHero } from "../../components/HeaderHero";
import { DistrictChoropleth } from "../../components/DistrictChoropleth";
import { RankList } from "../../components/RankList";
import { PercentileBar, WetnessTag } from "../../components/Signals";
import { IconSatellite } from "../../components/icons";
import { datasetManifest, districtGeometry, districtLayerColor, formatNumber, nasaProvenance, satelliteSamples, titleCase, wetnessLabel, wetnessTier } from "../../lib/data";
import { day } from "../../components/agriculture/waterContextFormat";
import { brief } from "../../lib/pageBriefs";
import shared from "../rabi/Rabi.module.css";

/* NASA's GRACE-DA, as fetched: groundwater, root-zone and surface wetness as percentiles of
   the product's own record, sampled at each district's centre. The page leads with what the
   three signals say this period and where the groundwater signal lands; the source files,
   checksums and raw extraction are a fold away. Context beside the wells, never a depth. */

const NAME: Record<string, string> = { GW: "Groundwater storage", "Root-Zone": "Root-zone soil", Surface: "Surface soil" };
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

export default function NasaSignalsPage() {
  const fetched = nasaProvenance.fetch_date || satelliteSamples[0]?.satellite_sample_date_or_fetch_date || null;
  const byName = Object.fromEntries(nasaProvenance.rasters.map(r => [r.signal, r]));
  const gw = byName.GW, root = byName["Root-Zone"], surface = byName.Surface;
  const known = districtGeometry.districts.filter(d => d.gw_percentile !== null);
  const ranked = [...known].sort((a, b) => (a.gw_percentile as number) - (b.gw_percentile as number));
  const driestFifth = known.filter(d => (d.gw_percentile as number) < 20).length;
  const gwMean = gw?.mean !== null && gw?.mean !== undefined ? Math.round(gw.mean) : null;
  const drierThan = gwMean !== null ? 100 - gwMean : null;
  const soil = [root, surface].filter(r => r?.mean !== null && r?.mean !== undefined).map(r => wetnessLabel(r!.mean).toLowerCase());
  const range = districtGeometry.layers.gw_percentile;

  return (
    <div className={`pageWrap ${shared.page}`}>
      <HeaderHero title="NASA Signals" brief={brief("/nasa", <>Values as fetched on {datasetManifest.periods.graceFetchDate ?? "the last refresh"}; a fetch date is not the period the values describe.</>)} showChips={false} variant="compact" />

      <section className={shared.hero} aria-label="The three signals this period" data-testid="nasa-summary">
        <div className={shared.heroText}>
          <span className={shared.kicker}>GRACE-DA from orbit{fetched ? ` · fetched ${day(fetched)}` : ""}</span>
          {gwMean !== null ? (
            <h2>Groundwater storage across the State reads at the <b>{ordinal(gwMean)} percentile</b> for the time of year{drierThan !== null && drierThan >= 55 ? <>: drier than about {Math.round(drierThan / 10) * 10}% of past years</> : null}. {soil.length ? <>The soil above reads <b>{[...new Set(soil)].join(" to ")}</b>.</> : null}</h2>
          ) : <h2>No groundwater signal in this fetch.</h2>}
          <p>A percentile is wetness against the product&rsquo;s own history, not a depth or a trend. GRACE sees regions hundreds of kilometres across, so it is shown by district only, beside the wells, never in place of them.</p>
        </div>
        <ul className={shared.tiles}>
          {[gw, root, surface].map(r => r ? (
            <li key={r.raster_name}><span>{NAME[r.signal] ?? r.signal}</span><b data-tone={r.mean !== null && r.mean < 30 ? "bad" : undefined}>{r.mean === null ? "–" : Math.round(r.mean)}<small> %ile</small></b><em>{wetnessLabel(r.mean)} · districts range {Math.round(r.min ?? 0)} to {Math.round(r.max ?? 0)}</em></li>
          ) : null)}
          <li><span>Districts in the driest fifth</span><b data-tone={driestFifth > known.length / 3 ? "bad" : undefined}>{driestFifth}<small> of {known.length}</small></b><em>groundwater percentile under 20</em></li>
        </ul>
      </section>

      <section className={shared.block} aria-labelledby="nasa-where">
        <header className={shared.blockHead}>
          <span className={shared.eyebrow}><IconSatellite /> Groundwater storage, by district</span>
          <h2 id="nasa-where">Where the signal lands</h2>
          {ranked.length ? <p>Driest in <b>{titleCase(ranked[0].d)}</b> ({Math.round(ranked[0].gw_percentile as number)}), wettest in <b>{titleCase(ranked[ranked.length - 1].d)}</b> ({Math.round(ranked[ranked.length - 1].gw_percentile as number)}). Each district is the raster read at its centre: a regional reading, not a mandal&rsquo;s.</p> : null}
        </header>
        <div className={shared.soilGrid}>
          <div>
            <DistrictChoropleth layer="gw_percentile" testId="nasa-district-map" label="Districts coloured by NASA GRACE-DA groundwater percentile, 0 to 100" />
            <div className="choroLegend">
              <div className="choroHead"><span>Groundwater percentile <span className="choroUnit">(0 to 100)</span></span>{fetched ? <span className="choroPeriod">Fetched {day(fetched, false)}</span> : null}</div>
              <div className="choroBar seqRamp" />
              <div className="choroScale"><span>Drier · {Math.round(range.min)}</span><span>Wetter · {Math.round(range.max)}</span></div>
            </div>
          </div>
          <div className={shared.soilSide}>
            <RankList title="Driest five" rows={ranked.slice(0, 5).map(d => ({ name: titleCase(d.d), value: Math.round(d.gw_percentile as number), share: d.gw_percentile as number, color: districtLayerColor("gw_percentile", d.gw_percentile, false), note: wetnessLabel(d.gw_percentile) }))} />
            <RankList title="Wettest three" rows={ranked.slice(-3).reverse().map(d => ({ name: titleCase(d.d), value: Math.round(d.gw_percentile as number), share: d.gw_percentile as number, color: districtLayerColor("gw_percentile", d.gw_percentile, false), note: wetnessLabel(d.gw_percentile) }))}
              foot={<>Valid period: {datasetManifest.periods.graceValidPeriod || "not supplied in the published manifest"}. {nasaProvenance.total_null_or_nodata_samples} empty samples in this fetch.</>} />
          </div>
        </div>
      </section>

      <details className="foldMore">
        <summary><span>All {known.length} districts</span><span>Groundwater, root zone and surface, driest first</span></summary>
        <div className="tableWrap">
          <table className="dataTable">
            <thead><tr><th>District</th><th>Groundwater</th><th>Root zone</th><th>Surface</th><th>Reads</th><th>Mandals</th></tr></thead>
            <tbody>
              {ranked.map(d => (
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
      </details>

      <details className="foldMore">
        <summary><span>The source files</span><span>{nasaProvenance.rasters.length} rasters, each with its address and checksum</span></summary>
        <div className="provGrid">
          {nasaProvenance.rasters.map(r => (
            <div key={r.raster_name} className="provCard" style={{ borderTopColor: wetnessTier(r.mean).color }}>
              <div className="provCardHead"><div><strong>{NAME[r.signal] ?? r.signal}</strong><code className="provFile">{r.raster_name}</code></div></div>
              <dl className="provMeta">
                <div><dt>Resolution</dt><dd>{r.resolution_km} <span className="provDim">({r.resolution_deg}°)</span></dd></div>
                <div><dt>Grid</dt><dd>{r.width} × {r.height} · {r.crs}</dd></div>
                <div><dt>Type</dt><dd>{r.dtype} · nodata {r.nodata}</dd></div>
                <div><dt>Size</dt><dd>{r.file_size_kb} KB</dd></div>
                <div><dt>Fetched</dt><dd>{r.fetch_date}</dd></div>
                <div><dt>SHA-256</dt><dd><code className="provHash">{r.sha256_short}…</code></dd></div>
              </dl>
              <a className="provLink" href={r.source_url} target="_blank" rel="noreferrer">{r.source_url.replace(/^https?:\/\//, "")}</a>
            </div>
          ))}
        </div>
        <p className="cardNote">Every value on this page traces to one of these open NASA files. Current-file addresses may later serve a different raster, so reproducing a value needs the original bytes, identified by the checksum. {nasaProvenance.data_label}.</p>
      </details>

      <details className="foldMore">
        <summary><span>The raw extraction</span><span>The raster read at each district&rsquo;s centre, with coordinates</span></summary>
        <div className="tableWrap">
          <table className="dataTable">
            <thead><tr><th>Sample point</th><th>District</th><th>Mandal</th><th>Lat</th><th>Lon</th><th>Groundwater</th><th>Root zone</th><th>Surface</th><th>Sampled</th></tr></thead>
            <tbody>
              {satelliteSamples.map(s => (
                <tr key={s.station_id}>
                  <td className="cellStrong">{s.station_name}</td>
                  <td>{titleCase(s.district_name)}</td>
                  <td>{titleCase(s.mandal_name)}</td>
                  <td>{Number(s.latitude).toFixed(2)}</td>
                  <td>{Number(s.longitude).toFixed(2)}</td>
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
    </div>
  );
}
