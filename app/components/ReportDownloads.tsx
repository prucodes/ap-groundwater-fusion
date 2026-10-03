"use client";

import { datasetManifest, modelCard, mandals, satelliteSamples, titleCase } from "../lib/data";
import { csvBanner, downloadCsv, mandalsToCsv } from "../lib/csv";
import { awarePayload, districtAdvisories } from "../lib/irrigation";
import { waterSummary } from "../lib/waterSummary";
import { IconDownload, IconDroplet, IconLeaf, IconSatellite, IconDatabase } from "./icons";

function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const esc = (v: string | number | boolean | null) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function advisoryCsv() {
  const rows = districtAdvisories();
  const head = ["district", "advisory", "gw_percentile", "water_balance_mm", "water_balance_status", "verify_first",
    "gauge_rain_departure_pct", "soil_below_usual_mandals", "soil_mandals_compared", "reservoir_storage_pct", "reservoir_storage_last_year_pct"];
  const body = rows.map((r) => [r.district, r.action, r.gw ?? "", r.balance ?? "", r.balanceStatus, r.verifyFirst,
    r.season?.rainDeviationPct ?? "", r.season?.soilBelowUsual ?? "", r.season?.soilWithBaseline ?? "", r.season?.reservoirStoragePct ?? "", r.season?.reservoirLastYearPct ?? ""].map(esc).join(","));
  return [csvBanner(["Unreleased district monitoring preview; not a pumping or allocation advisory.", "Seasonal baseline review pending; categories require field and departmental verification."]), head.join(","), ...body].join("\n");
}

function seasonCsv() {
  const head = ["district", "gauge_rain_mm", "gauge_rain_normal_mm", "gauge_rain_departure_pct", "gauge_rain_category",
    "soil_mandals", "soil_median_pct_30cm", "soil_below_usual_mandals", "soil_mandals_compared", "soil_driest_on_record",
    "reservoirs", "reservoir_capacity_tmc", "reservoir_storage_tmc", "reservoir_storage_pct", "reservoir_storage_last_year_pct"];
  const body = waterSummary.districts.map((d) => [d.district, d.rain?.actualMm ?? null, d.rain?.normalMm ?? null, d.rain?.deviationPct ?? null, d.rain?.category ?? null,
    d.soil?.mandals ?? null, d.soil?.medianPct ?? null, d.soil?.belowOwnMedian ?? null, d.soil?.withBaseline ?? null, d.soil?.driestOnRecord ?? null,
    d.reservoirs?.count ?? null, d.reservoirs?.capacityTmc ?? null, d.reservoirs?.storageTmc ?? null, d.reservoirs?.storagePct ?? null, d.reservoirs?.lastYearPct ?? null].map(esc).join(","));
  return [csvBanner([
    `Gauge rain: AP DES mandal gauges via APWRIMS, ${waterSummary.rain?.start ?? "?"} to ${waterSummary.rain?.end ?? "?"}, against the department's normal (measured).`,
    `Soil moisture: NRSC VIC model via APWRIMS at ${waterSummary.soil?.depthCm ?? 30} cm on ${waterSummary.soil?.asOf ?? "an unconfirmed date"}; usual = same date since ${waterSummary.soil?.firstYear ?? "?"} (modelled).`,
    `Reservoirs: storage at ${waterSummary.reservoirs?.asOf ?? "?"} (measured at the dam; releases are not deliveries). Research use; source-use authorization pending.`,
  ]), head.join(","), ...body].join("\n");
}

function nasaSamplesCsv() {
  const head = ["station_id", "station_name", "district", "mandal", "lat", "lon", "gw_percentile", "rootzone_percentile", "surface_percentile", "sampled"];
  const body = satelliteSamples.map((s) =>
    [s.station_id, s.station_name, titleCase(s.district_name), titleCase(s.mandal_name), s.latitude, s.longitude, s.groundwater_percentile, s.rootzone_percentile, s.surface_percentile, s.satellite_sample_date_or_fetch_date]
      .map(esc)
      .join(","),
  );
  return [csvBanner(["NASA GRACE-DA / soil-moisture percentiles sampled at district centroids (0-100), not depth.", "The sampled column is the fetch date, not a confirmed observation period."]), head.join(","), ...body].join("\n");
}

const ITEMS = [
  { icon: <IconDroplet />, name: "Mandal fusion table", desc: "APWRIMS readings fused with satellite signals, per mandal.", fmt: "CSV", run: () => downloadCsv("ap_mandal_fusion.csv", mandalsToCsv(mandals)) },
  { icon: <IconLeaf />, name: "District monitoring preview", desc: "Monitor / review / field verify. Not operational advice.", fmt: "CSV", run: () => downloadCsv("ap_irrigation_advisory.csv", advisoryCsv()) },
  { icon: <IconDatabase />, name: "AWARE draft payload", desc: "Unreleased schema preview. Nothing is dispatched.", fmt: "JSON", run: () => downloadText("ap_aware_advisory_payload.json", JSON.stringify(awarePayload(), null, 2), "application/json") },
  { icon: <IconLeaf />, name: "Season context by district", desc: "Gauge rain, soil moisture and reservoir storage, each with its date.", fmt: "CSV", run: () => downloadCsv("ap_season_context_by_district.csv", seasonCsv()) },
  { icon: <IconSatellite />, name: "NASA GRACE samples", desc: "Satellite-model percentiles at district centroids.", fmt: "CSV", run: () => downloadCsv("ap_nasa_grace_samples.csv", nasaSamplesCsv()) },
  { icon: <IconDatabase />, name: "Evidence & model pack", desc: "Source periods, coverage, input hashes and model evaluation.", fmt: "JSON", run: () => downloadText("ap_evidence_model_pack.json", JSON.stringify({ releaseStatus: "research_only", operationalUse: false, caveats: ["Not live telemetry or official APWRIMS results.", "Seasonal baseline review pending; this pack does not independently certify source data."], manifest: datasetManifest, modelCard }, null, 2), "application/json") },
];

export function ReportDownloads() {
  return (
    <div className="dlGrid">
      {ITEMS.map((it) => (
        <button key={it.name} type="button" className="dlCard" onClick={it.run}>
          <span className="dlIcon">{it.icon}</span>
          <span className="dlBody">
            <span className="dlName">{it.name}</span>
            <span className="dlDesc">{it.desc}</span>
          </span>
          <span className="dlAction"><span className="dlFmt">{it.fmt}</span><IconDownload /></span>
        </button>
      ))}
    </div>
  );
}
