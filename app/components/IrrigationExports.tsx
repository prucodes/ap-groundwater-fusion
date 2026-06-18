"use client";

import { awarePayload, districtAdvisories } from "../lib/irrigation";
import { downloadCsv } from "../lib/csv";
import { IconDownload, IconPrinter } from "./icons";

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

function advisoryCsv() {
  const rows = districtAdvisories();
  const head = ["district", "advisory", "gw_percentile", "water_balance_mm", "water_balance_status", "verify_first"];
  const esc = (v: string | number | boolean | null) => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((r) =>
    [r.district, r.action, r.gw ?? "", r.balance ?? "", r.balanceStatus, r.verifyFirst].map(esc).join(","),
  );
  return [head.join(","), ...body].join("\n");
}

export function IrrigationExports() {
  return (
    <div className="exportRow">
      <button
        className="ghostBtn"
        type="button"
        onClick={() => downloadText("ap_aware_advisory_payload.json", JSON.stringify(awarePayload(), null, 2), "application/json")}
      >
        <IconDownload /> AWARE payload (JSON)
      </button>
      <button className="ghostBtn" type="button" onClick={() => downloadCsv("ap_irrigation_advisory.csv", advisoryCsv())}>
        <IconDownload /> Advisory (CSV)
      </button>
      <button className="ghostBtn" type="button" onClick={() => window.print()}>
        <IconPrinter /> Print / PDF
      </button>
    </div>
  );
}
