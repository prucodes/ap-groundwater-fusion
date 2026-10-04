"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  IconActivity,
  IconArrowDown,
  IconAlert,
  IconChevronRight,
  IconChevrons,
  IconCloudRain,
  IconSun,
  IconTarget,
  IconCalendar,
  IconClock,
  IconCompass,
  IconDatabase,
  IconDroplet,
  IconFile,
  IconFlow,
  IconLayers,
  IconLeaf,
  IconColumns,
  IconGrid,
  IconMap,
  IconMenu,
  IconSatellite,
  IconSearch,
  IconSettings,
  IconWaves,
  IconX,
} from "./icons";
import { OrbitGlobe3D } from "./OrbitGlobe3D";
import { ThemeToggle } from "./ThemeToggle";
import { AlertsBell } from "./AlertsBell";
import { CommandPalette } from "./CommandPalette";
import { datasetManifest, formatPeriod } from "../lib/data";
import { waterSummary } from "../lib/waterSummary";
import { stateSummary } from "../lib/stateSummary";
import { PageTransition } from "./PageTransition";

type NavItem = { href: string; label: string; Icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactNode; desc: string };

// The menu, grouped by the question an official brings to it. `desc` is the one-line explainer.
// Review Queue, Verify / Watchlist, Executive Snapshot and Reports are no longer listed: the
// field-teams list on This Week and the weekly digest do their jobs. Their pages still open.
const navGroups: Array<{ label: string; items: NavItem[] }> = [
  { label: "This week", items: [
      { href: "/", label: "Overview", Icon: IconLayers, desc: "Executive cockpit: status map, priority mandals, source readiness and selected-area evidence." },
      { href: "/changes", label: "This Week", Icon: IconCalendar, desc: "What moved since the last weekly refresh: rain, soil, reservoirs, drought triggers, groundwater and the El Niño outlook, each with its date." },
  ] },
  { label: "Water now", items: [
      { href: "/monsoon", label: "Monsoon Watch", Icon: IconCloudRain, desc: "Is this season recharging? Measured per mandal against its own past seasons, with the ENSO state beside it." },
      { href: "/drought", label: "Drought Watch", Icon: IconSun, desc: "Every mandal through the national drought manual's triggers, with the declaration calendar. Not a declaration." },
      { href: "/map", label: "Mandal Map", Icon: IconMap, desc: "Full mandal/district map with status, rainfall and water-balance layers." },
      { href: "/crystal", label: "Water Depth 3D", Icon: IconWaves, desc: "Recorded May depth by mandal and district; optional schematic relief." },
  ] },
  { label: "Season ahead", items: [
      { href: "/summer", label: "Summer Outlook", Icon: IconArrowDown, desc: "Where the water table may stand by May, mandal by mandal, against each mandal's own deepest May on record." },
      { href: "/rabi", label: "Rabi Outlook", Icon: IconClock, desc: "What the rabi season starts with: reservoir storage, rainfed soil moisture and the northeast monsoon under El Niño." },
  ] },
  { label: "Farms", items: [
      { href: "/agriculture", label: "Agriculture & Water", Icon: IconLeaf, desc: "Crop-water planning lab and observed groundwater evidence. Not a field irrigation advisory." },
  ] },
  { label: "Places", items: [
      { href: "/districts", label: "Districts", Icon: IconGrid, desc: "District roll-ups with an auto + AI situation brief per district." },
      { href: "/constituencies", label: "Constituencies", Icon: IconTarget, desc: "Groundwater, the State's latest well readings, the drought manual and rain, by assembly and parliamentary constituency." },
      { href: "/mandals", label: "Mandal Insights", Icon: IconCompass, desc: "Per-mandal deep dive: readings, satellite context, trend and agreement." },
      { href: "/compare", label: "Compare", Icon: IconColumns, desc: "Side-by-side comparison of any two mandals or districts." },
  ] },
];

// Evidence and tools: how the figures are made and the specialist views. Folded unless one is open.
const evidenceNav: NavItem[] = [
      { href: "/methodology", label: "Methodology", Icon: IconFlow, desc: "How fusion works and what each signal means." },
      { href: "/readiness", label: "Data Readiness", Icon: IconDatabase, desc: "Source periods, coverage and operational release gates." },
      { href: "/estimates", label: "Modelled Levels β", Icon: IconDroplet, desc: "Calculated mandal groundwater depth in metres with model bands." },
      { href: "/nasa", label: "NASA Signals", Icon: IconSatellite, desc: "Raw, unfused GRACE-DA satellite-model context with provenance." },
      { href: "/climate", label: "Climate & Balance", Icon: IconWaves, desc: "Rainfall in vs ET out — the water budget behind groundwater." },
      { href: "/scenario", label: "Scenario Lab", Icon: IconCloudRain, desc: "Monsoon what-if: dial rainfall up/down and watch who tips into deficit." },
      { href: "/irrigation", label: "AWARE Preview", Icon: IconLeaf, desc: "Monitor, review and field-verify preview + the AWARE export bridge." },
      { href: "/settings", label: "Workspace", Icon: IconSettings, desc: "Appearance, dataset edition and data policy." },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-09-18T16:44:22+00:00" -> "18 Sep 2026". Deterministic, so server and client render alike. */
function formatDay(iso: string | null | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return match ? `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}` : "—";
}

// The weekly refresh runs every Monday; past this the published data is stale.
const REFRESH_OVERDUE_MS = 9 * 24 * 60 * 60 * 1000;
const { periods } = datasetManifest;

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const { href, label, Icon, desc } = item;
  const active = href === "/" ? pathname === href : pathname.startsWith(href);
  return (
    <Link className={`navItem ${active ? "active" : ""}`} href={href} title={`${label} — ${desc}`} aria-current={active ? "page" : undefined}>
      <span className="navIcon" aria-hidden="true">
        <Icon />
      </span>
      <span className="navLabel">{label}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const onEvidencePage = evidenceNav.some(item => pathname.startsWith(item.href));
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const evidenceShown = evidenceOpen || onEvidencePage;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("ap-groundwater-sidebar");
      if (stored) setCollapsed(stored === "collapsed");
      setEvidenceOpen(window.localStorage.getItem("ap-groundwater-evidence") === "open");
    } catch { /* storage unavailable: the defaults stand */ }
    // Checked against the viewer's clock after mount: the static page cannot know
    // how long ago it was built, and a missed refresh should be visible, not silent.
    setOverdue(Date.now() - Date.parse(periods.uiGenerationTimestamp) > REFRESH_OVERDUE_MS);
  }, []);

  // On phones the sidebar is an off-canvas drawer. Navigating should dismiss it,
  // or the new page loads hidden behind the still-open menu.
  useEffect(() => setNavOpen(false), [pathname]);

  // While the drawer is open it owns the screen: Escape closes it, and the page
  // behind must not scroll under the overlay.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [navOpen]);

  function toggleEvidence() {
    setEvidenceOpen(current => {
      const next = !(current || onEvidencePage);
      try { window.localStorage.setItem("ap-groundwater-evidence", next ? "open" : "closed"); } catch { /* storage unavailable */ }
      return next;
    });
  }

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("ap-groundwater-sidebar", next ? "collapsed" : "expanded");
      return next;
    });
  }

  return (
    <div className={`shell ${collapsed ? "shellCollapsed" : ""} ${navOpen ? "navOpen" : ""}`}>
      {/* Phone-only bar. The sidebar becomes a drawer below the breakpoint, so
          without this there would be no way to reach navigation. */}
      <header className="mobileBar">
        <button
          type="button"
          className="mobileNavBtn"
          onClick={() => setNavOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={navOpen}
          aria-controls="app-sidebar"
        >
          <IconMenu />
        </button>
        <Link href="/" className="mobileBrand">
          <span className="mobileBrandMark">
            <IconDroplet style={{ color: "#fff", width: 16, height: 16 }} />
          </span>
          <strong>AP Water Intelligence</strong>
        </Link>
      </header>

      {/* Dismiss layer. aria-hidden because Escape and the close button already
          give an accessible way out. */}
      <div
        className="navScrim"
        onClick={() => setNavOpen(false)}
        aria-hidden="true"
      />

      <aside className="sidebar" id="app-sidebar">
        <button
          type="button"
          className="sidebarCloseBtn"
          onClick={() => setNavOpen(false)}
          aria-label="Close navigation menu"
        >
          <IconX />
        </button>
        <div className="sidebarBrand">
          <div className="brandMark">
            <IconDroplet style={{ color: "#fff" }} />
          </div>
          <div className="brandText">
            <strong>AP Water</strong>
            <span>Intelligence</span>
          </div>
        </div>

        <div className="sidebarUtils">
          <button
            className="utilBtn searchBtn"
            type="button"
            onClick={() => (window as unknown as { __openPalette?: () => void }).__openPalette?.()}
            title="Search (⌘K)"
            aria-label="Search"
          >
            <IconSearch />
            <span className="utilLabel">Search</span>
            <kbd className="utilKbd">⌘K</kbd>
          </button>
          <AlertsBell collapsed={collapsed} />
          <ThemeToggle collapsed={collapsed} />
        </div>

        <nav className="sidebarNav" aria-label="Primary">
          {navGroups.map(group => (
            <div className="navGroup" key={group.label}>
              <div className="navGroupLabel"><span>{group.label}</span></div>
              {group.items.map(item => <NavLink key={item.href} item={item} pathname={pathname} />)}
            </div>
          ))}

          <button type="button" className="navGroupLabel navGroupToggle" aria-expanded={evidenceShown} onClick={toggleEvidence}>
            <span>Evidence &amp; tools</span>
            <IconChevronRight className={evidenceShown ? "navChevronOpen" : undefined} />
          </button>
          {evidenceShown ? evidenceNav.map(item => <NavLink key={item.href} item={item} pathname={pathname} />) : null}
        </nav>

        <div className="sidebarSpacer" />

        <div className="sidebarStatus">
          <h4>Data status</h4>
          <div className={`statusLive ${overdue ? "statusOverdue" : ""}`}>
            <span className="liveDot" />
            {overdue ? "Refresh overdue" : "Refreshed"} · {formatDay(periods.uiGenerationTimestamp)}
          </div>
          <div className="statusFeed">
            <span className="feedDot" /> Sensor readings · {formatPeriod(periods.latestObservationPeriod)}
          </div>
          <div className="statusFeed">
            <span className="feedDot" /> NASA GRACE-DA · {formatDay(periods.graceFetchDate)}
          </div>
          <div className="statusFeed">
            <span className="feedDot" /> CHIRPS rainfall · {formatPeriod(periods.rainfallValidPeriod)}
          </div>
          {waterSummary.rain ? (
            <div className="statusFeed">
              <span className="feedDot" /> Rain gauges · to {formatDay(waterSummary.rain.end)}
            </div>
          ) : null}
          {waterSummary.soil ? (
            <div className="statusFeed">
              <span className="feedDot" /> Soil moisture · {formatDay(waterSummary.soil.asOf)}
            </div>
          ) : null}
          {waterSummary.reservoirs ? (
            <div className="statusFeed">
              <span className="feedDot" /> Reservoirs · {formatDay(waterSummary.reservoirs.asOf)}
            </div>
          ) : null}
          {stateSummary.readingDates.last ? (
            <div className="statusFeed">
              <span className="feedDot" /> State wells · {formatDay(stateSummary.readingDates.last)}
            </div>
          ) : null}
          <OrbitGlobe3D />
        </div>

        <button
          className="sidebarCollapseBtn"
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <IconChevrons />
          <span className="collapseLabel">Collapse Sidebar</span>
        </button>
      </aside>

      <main className="main"><PageTransition>{children}</PageTransition></main>
      <CommandPalette />
    </div>
  );
}
