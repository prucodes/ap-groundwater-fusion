import { boundarySummary, statusMeta, STATUS_ORDER } from "../lib/data";
import { IconInfo } from "./icons";

/* With onPick, each status is a toggle: picking one steps every other mandal back on the map. */
export function MapLegend({ note = true, picked = null, onPick }: { note?: boolean; picked?: string | null; onPick?: (bucket: string | null) => void }) {
  return (
    <>
      <div className="mapLegend" role={onPick ? "group" : undefined} aria-label={onPick ? "Show one status on the map" : undefined}>
        {STATUS_ORDER.map((bucket) => {
          const meta = statusMeta(bucket);
          const inner = <><span className="legendSwatch" style={{ background: meta.color }} /><span className="legendName">{meta.label}</span></>;
          return onPick
            ? <button type="button" className="legendRow legendPick" key={bucket} aria-pressed={picked === bucket} data-dim={picked !== null && picked !== bucket ? "" : undefined}
                onClick={() => onPick(picked === bucket ? null : bucket)}>{inner}</button>
            : <span className="legendRow" key={bucket}>{inner}</span>;
        })}
        <span className="legendRow">
          <span className="legendSwatch" style={{ background: "transparent", boxShadow: "inset 0 0 0 1px var(--line-strong)" }} />
          <span className="legendName">Boundary only</span>
        </span>
      </div>
      {note && (
        <div className="mapHint">
          <IconInfo style={{ width: 13, height: 13 }} />
          Basemap © OpenFreeMap · OpenMapTiles · OpenStreetMap. {boundarySummary}
        </div>
      )}
    </>
  );
}
