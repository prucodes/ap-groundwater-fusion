"use client";

import { useEffect, useState } from "react";
import type { QualityChoice, ResolvedQuality } from "./types";

export function useDeviceQuality(choice: QualityChoice): {
  resolved: ResolvedQuality;
  reducedMotion: boolean;
  autoReason: string;
} {
  const [signals, setSignals] = useState({
    reducedMotion: false,
    constrained: false,
    reason: "desktop defaults",
  });

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarseQuery = window.matchMedia("(pointer: coarse)");
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    const update = () => {
      const narrow = window.innerWidth < 900;
      const lowConcurrency =
        typeof navigator.hardwareConcurrency === "number" &&
        navigator.hardwareConcurrency <= 4;
      const saveData = Boolean(connection?.saveData);
      const constrained = narrow || lowConcurrency || saveData || coarseQuery.matches;
      const reasons = [
        narrow ? "compact viewport" : "",
        lowConcurrency ? "limited logical cores" : "",
        saveData ? "data saver" : "",
        coarseQuery.matches ? "touch-first pointer" : "",
      ].filter(Boolean);
      setSignals({
        reducedMotion: motionQuery.matches,
        constrained,
        reason: reasons.join(", ") || "desktop defaults",
      });
    };
    update();
    motionQuery.addEventListener("change", update);
    coarseQuery.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      motionQuery.removeEventListener("change", update);
      coarseQuery.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const resolved =
    choice === "auto" ? (signals.constrained ? "reduced" : "standard") : choice;
  return {
    resolved,
    reducedMotion: signals.reducedMotion,
    autoReason: signals.reason,
  };
}
