import type { ReactNode } from "react";

export function KpiCard({
  icon,
  label,
  value,
  unit,
  foot,
  footAccent = false,
  accent = "var(--teal)",
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  unit?: string;
  foot?: ReactNode;
  footAccent?: boolean;
  accent?: string;
}) {
  return (
    <div className="kpiCard" style={{ ["--accent" as string]: accent }}>
      <div className="kpiTop">
        <span className="kpiIcon">{icon}</span>
        <span className="kpiLabel">{label}</span>
      </div>
      <div className="kpiValue">
        {value}
        {unit ? <span className="unit">{unit}</span> : null}
      </div>
      {foot ? <div className={`kpiFoot ${footAccent ? "accent" : ""}`}>{foot}</div> : null}
    </div>
  );
}
