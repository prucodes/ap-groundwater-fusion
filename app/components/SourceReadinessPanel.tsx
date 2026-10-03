import { mapGeometry, readinessItems, titleCase } from "../lib/data";
import { IconCheck, IconClock, IconDatabase } from "./icons";

type Tone = "available" | "partial" | "pending" | "manual";

function tone(status: string): Tone {
  const s = status.toLowerCase();
  if (s === "available") return "available";
  if (s === "partial") return "partial";
  if (s.includes("manual")) return "manual";
  return "pending";
}

function toneIcon(t: Tone) {
  if (t === "available" || t === "partial") return <IconCheck />;
  if (t === "manual") return <IconDatabase />;
  return <IconClock />;
}

function statusText(status: string) {
  const s = status.toLowerCase();
  if (s === "available") return "Available";
  if (s === "partial") return "Partial";
  if (s.includes("manual")) return "Manual";
  return "Pending";
}

/** How far a partial source reaches, read from the published outlines, never typed in. */
function coverage(dataLabel: string): string | null {
  const total = mapGeometry.mandals.length;
  const summary = mapGeometry.official_summary;
  if (!summary) return null;
  if (dataLabel === "official_boundary") return `${summary.outlines} of ${total} mandals`;
  if (dataLabel === "official_admin_ids") return `${summary.matched} of ${total} mandals`;
  return null;
}

/** A pending or partial source in a few words; the full label stays on hover. */
function compactLabel(label: string) {
  return label.replace(/\s*\([^)]*\)/g, "").replace(/:.*$/, "").replace(/ via APWRIMS.*$/, "").replace(/\s+/g, " ").trim();
}

/** Connected sources as short names: in the compact panel they become tags. */
function shortName(label: string) {
  return label.replace(/^Real /, "").replace(/\s*\(.*$/, "").replace(/ via APWRIMS.*$/, "").trim();
}

export function SourceReadinessPanel({ compact = false }: { compact?: boolean }) {
  const counts = { available: 0, partial: 0, pending: 0, manual: 0 };
  for (const item of readinessItems) counts[tone(item.status)] += 1;
  // Compact (the Overview): what is connected as tags, what is partial or
  // missing in full -- the rows a reviewer acts on.
  const items = compact ? readinessItems.filter((item) => tone(item.status) !== "available") : readinessItems;
  const connected = readinessItems.filter((item) => tone(item.status) === "available");
  return (
    <div className={`readinessList ${compact ? "compact" : ""}`}>
      {compact ? (
        <>
          <div className="readinessCounts" aria-label="Source counts">
            <span className="readyTag available">{`${counts.available} available`}</span>
            <span className="readyTag partial">{`${counts.partial} partial`}</span>
            <span className="readyTag pending">{`${counts.pending} pending`}</span>
          </div>
          <ul className="readinessConnected" aria-label="Connected sources">
            {connected.map((item) => <li key={item.label} title={item.label}>{shortName(item.label)}</li>)}
          </ul>
        </>
      ) : null}
      {items.map((item) => {
        const t = tone(item.status);
        const reach = t === "partial" ? coverage(item.data_label) : null;
        return (
          <div className="readinessItem" key={item.label}>
            <span className={`readyIcon ${t}`}>{toneIcon(t)}</span>
            <div className="readyBody">
              <div className="readyLabel" title={compact ? item.label : undefined}>{compact ? compactLabel(item.label) : item.label}</div>
              {compact ? (
                reach ? <div className="readyMeta"><strong>{reach}</strong></div> : null
              ) : (
                <div className="readyMeta">
                  {reach ? <><strong>{reach}</strong> · </> : null}
                  <code style={{ fontSize: 10.5 }}>{item.data_label}</code> · official_flag:{" "}
                  {String(item.official_flag)}
                </div>
              )}
            </div>
            <span className={`readyTag ${t}`}>{statusText(item.status)}</span>
          </div>
        );
      })}
    </div>
  );
}

export { titleCase };
