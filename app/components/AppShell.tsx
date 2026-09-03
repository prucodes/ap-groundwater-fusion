"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  IconActivity,
  IconAlert,
  IconChevrons,
  IconCloudRain,
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
  IconWaves,
  IconX,
} from "./icons";
import { OrbitGlobe3D } from "./OrbitGlobe3D";
import { ThemeToggle } from "./ThemeToggle";
import { AlertsBell } from "./AlertsBell";
import { CommandPalette } from "./CommandPalette";
import { PageTransition } from "./PageTransition";

// Primary workflow — the day-to-day screens. `desc` is the one-line explainer.
const primaryNav = [
  { href: "/", label: "Overview", Icon: IconLayers, desc: "Executive cockpit: status map, priority mandals, source readiness and selected-area evidence." },
  { href: "/map", label: "Mandal Map", Icon: IconMap, desc: "Full mandal/district map with status, rainfall and water-balance layers." },
  { href: "/mandals", label: "Mandal Insights", Icon: IconCompass, desc: "Per-mandal deep dive: readings, satellite context, trend and agreement." },
  { href: "/watchlist", label: "Verify / Watchlist", Icon: IconActivity, desc: "Mandals where evidence needs field review or source verification." },
  { href: "/alerts", label: "Early Warning", Icon: IconAlert, desc: "Severity-ranked alerts from the fusion engine." },
  { href: "/districts", label: "Districts", Icon: IconGrid, desc: "District roll-ups with an auto + AI situation brief per district." },
];

// Secondary — evidence, exports, and lab-style views. Kept reachable without
// making every prototype capability compete with the operational workflow.
const moreNav = [
  { href: "/estimates", label: "Modelled Levels β", Icon: IconDroplet, desc: "Calculated mandal groundwater depth in metres with model bands." },
  { href: "/nasa", label: "NASA Signals", Icon: IconSatellite, desc: "Raw, unfused GRACE-DA satellite-model context with provenance." },
  { href: "/climate", label: "Climate & Balance", Icon: IconWaves, desc: "Rainfall in vs ET out — the water budget behind groundwater." },
  { href: "/readiness", label: "Data Readiness", Icon: IconDatabase, desc: "Which sources are live or pending — and their quality." },
  { href: "/methodology", label: "Methodology", Icon: IconFlow, desc: "How fusion works and what each signal means." },
  { href: "/reports", label: "Reports", Icon: IconFile, desc: "Generated and exportable reports." },
  { href: "/snapshot", label: "Executive Snapshot", Icon: IconFile, desc: "One-page printable summary for officials." },
  { href: "/compare", label: "Compare", Icon: IconColumns, desc: "Side-by-side comparison of any two mandals or districts." },
  { href: "/scenario", label: "Scenario Lab", Icon: IconCloudRain, desc: "Monsoon what-if: dial rainfall up/down and watch who tips into deficit." },
  { href: "/irrigation", label: "AWARE Preview", Icon: IconLeaf, desc: "Draw/hold/conserve advisory preview + the AWARE export bridge." },
  { href: "/living-water-table", label: "Living Water Table", Icon: IconDroplet, desc: "Experimental 3D groundwater-depth view.", badge: "3D" },
  { href: "/crystal", label: "Crystal 3D Lab", Icon: IconWaves, desc: "Cinematic liquid-map view for demos.", badge: "LAB" },
];

function nowStamp() {
  return new Date().toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [stamp, setStamp] = useState("Jun 12, 2026, 08:24 PM");

  useEffect(() => {
    const stored = window.localStorage.getItem("ap-groundwater-sidebar");
    if (stored) setCollapsed(stored === "collapsed");
    setStamp(nowStamp());
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
          <strong>AP Groundwater</strong>
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
            <strong>AP Groundwater</strong>
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
          {primaryNav.map(({ href, label, Icon, desc }) => {
            const active = href === "/" ? pathname === href : pathname.startsWith(href);
            return (
              <Link className={`navItem ${active ? "active" : ""}`} href={href} key={href} title={`${label} — ${desc}`}>
                <span className="navIcon" aria-hidden="true">
                  <Icon />
                </span>
                <span className="navLabel">{label}</span>
              </Link>
            );
          })}

          <div className="navGroupLabel"><span>Evidence &amp; Labs</span></div>

          {moreNav.map(({ href, label, Icon, desc, badge }) => {
            const active = pathname.startsWith(href);
            return (
              <Link className={`navItem ${active ? "active" : ""}`} href={href} key={href} title={`${label} — ${desc}`}>
                <span className="navIcon" aria-hidden="true">
                  <Icon />
                </span>
                <span className="navLabel">{label}</span>
                {badge ? <span className="navBadge">{badge}</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className="sidebarSpacer" />

        <div className="sidebarStatus">
          <h4>System Status</h4>
          <div className="statusLive">
            <span className="liveDot" />
            All Systems Operational
          </div>
          <div className="statusMeta">
            Last Updated
            <strong>{stamp}</strong>
          </div>
          <div className="statusFeed">
            <span className="feedDot" /> NASA GRACE-DA · linked
          </div>
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
