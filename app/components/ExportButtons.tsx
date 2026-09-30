"use client";

import type { MandalGroundwaterView } from "../lib/types";
import { downloadCsv, mandalsToCsv, monsoonWatchToCsv } from "../lib/csv";
import { countEvent } from "../lib/visit-counter";
import { IconDownload, IconPrinter } from "./icons";

export function ExportCsvButton({
  rows,
  filename = "ap_groundwater_fusion_prototype.csv",
  label = "Export CSV",
}: {
  rows: MandalGroundwaterView[];
  filename?: string;
  label?: string;
}) {
  return (
    <button
      className="ghostBtn"
      type="button"
      onClick={() => downloadCsv(filename, mandalsToCsv(rows))}
    >
      <IconDownload />
      {label}
    </button>
  );
}

/** The flagged-mandal list as a file a district office can work from. */
export function ExportMonsoonWatchButton({ label = "Download flagged mandals (CSV)" }: { label?: string }) {
  return (
    <button
      className="ghostBtn"
      type="button"
      onClick={() => {
        countEvent("monsoon/csv", "Monsoon: downloaded the flagged mandals");
        downloadCsv("ap_monsoon_recharge_watch.csv", monsoonWatchToCsv());
      }}
    >
      <IconDownload />
      {label}
    </button>
  );
}

export function PrintButton({ label = "Print / PDF" }: { label?: string }) {
  return (
    <button className="ghostBtn" type="button" onClick={() => window.print()}>
      <IconPrinter />
      {label}
    </button>
  );
}
