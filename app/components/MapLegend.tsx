import { statusMeta, STATUS_ORDER } from "../lib/data";
import { IconInfo } from "./icons";

export function MapLegend({ note = true }: { note?: boolean }) {
  return (
    <>
      <div className="mapLegend">
        {STATUS_ORDER.map((bucket) => {
          const meta = statusMeta(bucket);
          return (
            <span className="legendRow" key={bucket}>
              <span className="legendSwatch" style={{ background: meta.color }} />
              <span className="legendName">{meta.label}</span>
            </span>
          );
        })}
        <span className="legendRow">
          <span className="legendSwatch" style={{ background: "transparent", boxShadow: "inset 0 0 0 1px var(--line-strong)" }} />
          <span className="legendName">Boundary only</span>
        </span>
      </div>
      {note && (
        <div className="mapHint">
          <IconInfo style={{ width: 13, height: 13 }} />
          Live basemap © OpenStreetMap © CARTO. Status overlay on public prototype boundaries — not official APWRIMS/APSAC/RTGS boundaries.
        </div>
      )}
    </>
  );
}
