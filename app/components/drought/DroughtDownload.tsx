"use client";

import { CATEGORY_META, place, type DroughtMandal } from "../../lib/drought";
import { IconDownload } from "../icons";
import styles from "./Drought.module.css";

const cell = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The whole matrix as a CSV a district office can open: one row per mandal, every value with its class. */
export function DroughtDownload({ mandals, asOf, manualUrl }: { mandals: DroughtMandal[]; asOf: string; manualUrl: string }) {
  const download = () => {
    const header = ["district", "mandal", "outcome", "outcome_light_soils", "trigger1", "trigger1_reason",
      "rain_mm", "rain_normal_mm", "rain_deviation_pct", "rain_class", "longest_dry_spell_weeks", "spi", "spi_class", "trigger1_spi_route",
      "vci", "vci_class", "pasm_pct", "pasm_class", "pasm_usual_pct", "pasm_severe_years", "pasm_years",
      "gwdi", "gwdi_band", "gwdi_class", "gwdi_years", "outcome_a_week_earlier"];
    const lines = [
      `# Drought Watch, prototype. Manual for Drought Management (2020), steps 1 and 2 only; not a declaration. Rain to ${asOf}. ${manualUrl}`,
      "# Measured: gauge rain (AP DES via APWRIMS), GWDI (APWRIMS wells). Modelled: PASM (NRSC VIC via APWRIMS). Satellite: SPI (CHIRPS v3), VCI (NOAA STAR VHP 4 km).",
      header.join(","),
      ...mandals.map(row => [
        place(row.d), place(row.m), CATEGORY_META[row.category].label, CATEGORY_META[row.categoryLight].label, row.t1, row.t1Why,
        row.rain?.mm, row.rain?.normal, row.rain?.dev, row.rain?.cls, row.dry?.longest, row.spi?.v, row.spi?.cls, row.t1Spi,
        row.vci?.v, row.vci?.cls, row.pasm?.v, row.pasm?.cls, row.pasm?.usual, row.pasm?.severeYears, row.pasm?.years,
        row.gwdi?.v, row.gwdi?.band, row.gwdi?.cls, row.gwdi?.years, CATEGORY_META[row.prev].label,
      ].map(cell).join(",")),
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n") + "\n"], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `drought-watch-${asOf}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return <button type="button" className={styles.downloadBtn} onClick={download}><IconDownload /> Download the matrix (CSV)</button>;
}
