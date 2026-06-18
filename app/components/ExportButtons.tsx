"use client";

import type { MandalFusionSeed } from "../lib/types";
import { downloadCsv, mandalsToCsv } from "../lib/csv";
import { IconDownload, IconPrinter } from "./icons";

export function ExportCsvButton({
  rows,
  filename = "ap_groundwater_fusion_prototype.csv",
  label = "Export CSV",
}: {
  rows: MandalFusionSeed[];
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

export function PrintButton({ label = "Print / PDF" }: { label?: string }) {
  return (
    <button className="ghostBtn" type="button" onClick={() => window.print()}>
      <IconPrinter />
      {label}
    </button>
  );
}
