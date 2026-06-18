"use client";

import { mandals, satelliteSamples, titleCase } from "../lib/data";
import { downloadCsv, mandalsToCsv } from "../lib/csv";
import { awarePayload, districtAdvisories } from "../lib/irrigation";
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
  const head = ["district", "advisory", "gw_percentile", "water_balance_mm", "water_balance_status", "verify_first"];
  const body = rows.map((r) => [r.district, r.action, r.gw ?? "", r.balance ?? "", r.balanceStatus, r.verifyFirst].map(esc).join(","));
  return [head.join(","), ...body].join("\n");
}

function nasaSamplesCsv() {
  const head = ["station_id", "station_name", "district", "mandal", "lat", "lon", "gw_percentile", "rootzone_percentile", "surface_percentile", "sampled"];
  const body = satelliteSamples.map((s) =>
    [s.station_id, s.station_name, titleCase(s.district_name), titleCase(s.mandal_name), s.latitude, s.longitude, s.groundwater_percentile, s.rootzone_percentile, s.surface_percentile, s.satellite_sample_date_or_fetch_date]
      .map(esc)
      .join(","),
  );
  return [head.join(","), ...body].join("\n");
}

const ITEMS = [
  { icon: <IconDroplet />, name: "Mandal fusion table", desc: "APWRIMS readings fused with satellite signals, per mandal.", fmt: "CSV", run: () => downloadCsv("ap_mandal_fusion.csv", mandalsToCsv(mandals)) },
  { icon: <IconLeaf />, name: "Irrigation advisory", desc: "Draw / hold / conserve call per district.", fmt: "CSV", run: () => downloadCsv("ap_irrigation_advisory.csv", advisoryCsv()) },
  { icon: <IconDatabase />, name: "AWARE payload", desc: "Advisory records shaped for the AWARE bridge.", fmt: "JSON", run: () => downloadText("ap_aware_advisory_payload.json", JSON.stringify(awarePayload(), null, 2), "application/json") },
  { icon: <IconSatellite />, name: "NASA GRACE samples", desc: "Raw GRACE-DA percentiles at station points.", fmt: "CSV", run: () => downloadCsv("ap_nasa_grace_samples.csv", nasaSamplesCsv()) },
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
