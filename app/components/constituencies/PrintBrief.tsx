"use client";

import { IconPrinter } from "../icons";

/** Print, or save as PDF from the print dialog: the brief is laid out for one A4 page. */
export function PrintBrief({ className }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      <IconPrinter /> Print or save as PDF
    </button>
  );
}
