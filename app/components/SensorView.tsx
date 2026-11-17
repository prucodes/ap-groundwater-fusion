"use client";

import { useState, type ReactNode } from "react";
import { countEvent } from "../lib/visit-counter";
import { PickerGlide } from "./PickerGlide";
import styles from "./SensorPulse.module.css";

/* The sensor map's two arrangements. The same dots, each one a sensor: where it stands,
   or lined up by how far its water table has moved in a year. The move itself is CSS
   (SensorPulse.module.css): every dot carries both positions, and this only says which. */
export function SensorView({ children }: { children: ReactNode }) {
  const [view, setView] = useState<"map" | "spread">("map");
  const pick = (next: "map" | "spread") => {
    if (next === view) return;
    setView(next);
    if (next === "spread") countEvent("app/sensor-regroup", "This Week: lined the sensors up by their change");
  };
  return (
    <div className={styles.figure} data-view={view} data-testid="sensor-view">
      {children}
      <div className={styles.viewPick} role="group" aria-label="Arrange the sensors">
        <PickerGlide />
        <button type="button" aria-pressed={view === "map"} onClick={() => pick("map")}>On the map</button>
        <button type="button" aria-pressed={view === "spread"} onClick={() => pick("spread")}>By change</button>
      </div>
    </div>
  );
}
