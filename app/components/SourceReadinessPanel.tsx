import { readinessItems, titleCase } from "../lib/data";
import { IconCheck, IconClock, IconDatabase } from "./icons";

function tone(status: string): "available" | "pending" | "manual" {
  const s = status.toLowerCase();
  if (s === "available") return "available";
  if (s.includes("manual")) return "manual";
  return "pending";
}

function toneIcon(t: "available" | "pending" | "manual") {
  if (t === "available") return <IconCheck />;
  if (t === "manual") return <IconDatabase />;
  return <IconClock />;
}

function statusText(status: string) {
  const s = status.toLowerCase();
  if (s === "available") return "Available";
  if (s.includes("manual")) return "Manual";
  return "Pending";
}

export function SourceReadinessPanel({ compact = false }: { compact?: boolean }) {
  const items = compact ? readinessItems : readinessItems;
  return (
    <div className="readinessList">
      {items.map((item) => {
        const t = tone(item.status);
        return (
          <div className="readinessItem" key={item.label}>
            <span className={`readyIcon ${t}`}>{toneIcon(t)}</span>
            <div className="readyBody">
              <div className="readyLabel">{item.label}</div>
              <div className="readyMeta">
                <code style={{ fontSize: 10.5 }}>{item.data_label}</code> · official_flag:{" "}
                {String(item.official_flag)}
              </div>
            </div>
            <span className={`readyTag ${t}`}>{statusText(item.status)}</span>
          </div>
        );
      })}
    </div>
  );
}

export { titleCase };
