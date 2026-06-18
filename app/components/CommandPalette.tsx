"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { mandals, statusMeta, titleCase } from "../lib/data";
import { IconActivity, IconCompass, IconDatabase, IconDroplet, IconFile, IconFlow, IconGrid, IconLayers, IconMap, IconSatellite, IconSearch, IconColumns } from "./icons";

type Item = {
  label: string;
  sub: string;
  href: string;
  kind: "page" | "mandal";
  color?: string;
};

const PAGES: Item[] = [
  { label: "Overview", sub: "At-a-glance state of AP groundwater", href: "/", kind: "page" },
  { label: "Mandal Map", sub: "Status, rainfall & balance map layers", href: "/map", kind: "page" },
  { label: "Estimated Levels β", sub: "Modelled depth in metres + confidence bands", href: "/estimates", kind: "page" },
  { label: "NASA Signals", sub: "Raw GRACE-DA truth + provenance", href: "/nasa", kind: "page" },
  { label: "Climate & Balance", sub: "Rainfall vs ET — the water budget", href: "/climate", kind: "page" },
  { label: "Mandal Insights", sub: "Per-mandal deep dive", href: "/mandals", kind: "page" },
  { label: "Verify / Watchlist", sub: "Where satellite & sensor disagree", href: "/watchlist", kind: "page" },
  { label: "Early Warning", sub: "Severity-ranked fusion alerts", href: "/alerts", kind: "page" },
  { label: "Districts", sub: "Roll-ups + AI situation brief", href: "/districts", kind: "page" },
  { label: "Scenario Planner", sub: "Monsoon what-if + drought sim", href: "/scenario", kind: "page" },
  { label: "Irrigation & AWARE", sub: "Draw/hold/conserve + AWARE bridge", href: "/irrigation", kind: "page" },
  { label: "Compare", sub: "Side-by-side of two areas", href: "/compare", kind: "page" },
  { label: "Executive Snapshot", sub: "One-page printable summary", href: "/snapshot", kind: "page" },
  { label: "Data Readiness", sub: "Which sources are live vs pending", href: "/readiness", kind: "page" },
  { label: "Reports", sub: "Generated & exportable reports", href: "/reports", kind: "page" },
  { label: "Methodology", sub: "How fusion works (honesty layer)", href: "/methodology", kind: "page" },
];

const PAGE_ICON: Record<string, React.ReactNode> = {
  "/": <IconLayers />,
  "/map": <IconMap />,
  "/nasa": <IconSatellite />,
  "/climate": <IconDroplet />,
  "/mandals": <IconCompass />,
  "/watchlist": <IconActivity />,
  "/alerts": <IconActivity />,
  "/districts": <IconGrid />,
  "/scenario": <IconCompass />,
  "/compare": <IconColumns />,
  "/snapshot": <IconFile />,
  "/readiness": <IconDatabase />,
  "/reports": <IconFile />,
  "/methodology": <IconFlow />,
};

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const allItems: Item[] = useMemo(() => {
    const mandalItems: Item[] = mandals.map((m) => ({
      label: `${titleCase(m.mandal_name)}`,
      sub: `${titleCase(m.district_name)} · ${statusMeta(m.status_bucket).label}`,
      href: `/mandals/${m.id}`,
      kind: "mandal",
      color: statusMeta(m.status_bucket).color,
    }));
    return [...PAGES, ...mandalItems];
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems.slice(0, 8);
    return allItems
      .filter((i) => `${i.label} ${i.sub}`.toLowerCase().includes(q))
      .slice(0, 12);
  }, [query, allItems]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    (window as unknown as { __openPalette?: () => void }).__openPalette = () => setOpen(true);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  function go(item: Item) {
    setOpen(false);
    router.push(item.href);
  }

  return (
    <div className="cmdkOverlay" onClick={() => setOpen(false)}>
      <div className="cmdkPanel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <div className="cmdkInputRow">
          <IconSearch />
          <input
            ref={inputRef}
            className="cmdkInput"
            placeholder="Search mandals and pages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && results[active]) {
                go(results[active]);
              }
            }}
          />
          <kbd className="cmdkKbd">ESC</kbd>
        </div>
        <div className="cmdkList">
          {results.length === 0 && <div className="cmdkEmpty">No matches.</div>}
          {results.map((item, i) => (
            <button
              key={item.href}
              className={`cmdkItem ${i === active ? "active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(item)}
            >
              <span className="cmdkIcon" style={item.color ? { color: item.color } : undefined}>
                {item.kind === "mandal" ? (
                  <span className="cmdkDot" style={{ background: item.color }} />
                ) : (
                  PAGE_ICON[item.href] ?? <IconLayers />
                )}
              </span>
              <span className="cmdkText">
                <span className="cmdkLabel">{item.label}</span>
                <span className="cmdkSub">{item.sub}</span>
              </span>
              <span className="cmdkKind">{item.kind}</span>
            </button>
          ))}
        </div>
        <div className="cmdkFoot">
          <span><kbd className="cmdkKbd">↑</kbd><kbd className="cmdkKbd">↓</kbd> navigate</span>
          <span><kbd className="cmdkKbd">↵</kbd> open</span>
          <span><kbd className="cmdkKbd">⌘K</kbd> toggle</span>
        </div>
      </div>
    </div>
  );
}
