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
  IconSatellite,
  IconSearch,
  IconSettings,
  IconWaves,
} from "./icons";
import { OrbitGlobe3D } from "./OrbitGlobe3D";
import { ThemeToggle } from "./ThemeToggle";
import { AlertsBell } from "./AlertsBell";
import { CommandPalette } from "./CommandPalette";
import { PageTransition } from "./PageTransition";

// Primary workflow — the day-to-day screens. `desc` is the one-line explainer.
const primaryNav = [
  { href: "/", label: "Overview", Icon: IconLayers, desc: "At-a-glance state of AP groundwater — KPIs, status map and watch-list." },
  { href: "/map", label: "Mandal Map", Icon: IconMap, desc: "Full mandal/district map with status, rainfall and water-balance layers." },
  { href: "/estimates", label: "Estimated Levels β", Icon: IconDroplet, desc: "Modelled mandal depth in metres (sensors + satellite rainfall), with confidence bands." },
  { href: "/nasa", label: "NASA Signals", Icon: IconSatellite, desc: "The raw, unfused GRACE-DA satellite truth with full source provenance." },
  { href: "/climate", label: "Climate & Balance", Icon: IconWaves, desc: "Rainfall in vs ET out — the water budget behind groundwater, with provenance." },
  { href: "/alerts", label: "Early Warning", Icon: IconAlert, desc: "Severity-ranked alerts (Critical/High/Watch) from the fusion engine." },
  { href: "/districts", label: "Districts", Icon: IconGrid, desc: "District roll-ups with an auto + AI situation brief per district." },
  { href: "/scenario", label: "Scenario Planner", Icon: IconCloudRain, desc: "Monsoon what-if: dial rainfall up/down and watch who tips into deficit." },
  { href: "/irrigation", label: "Irrigation & AWARE", Icon: IconLeaf, desc: "Draw/hold/conserve advisory per district + the AWARE export bridge." },
];

// Secondary — detail, exports, and reference. Grouped under "More".
const moreNav = [
  { href: "/mandals", label: "Mandal Insights", Icon: IconCompass, desc: "Per-mandal deep dive: signals, APWRIMS reading, trend and agreement." },
  { href: "/watchlist", label: "Verify / Watchlist", Icon: IconActivity, desc: "Mandals where satellite and sensor disagree — the review queue." },
  { href: "/compare", label: "Compare", Icon: IconColumns, desc: "Side-by-side comparison of any two mandals or districts." },
  { href: "/snapshot", label: "Executive Snapshot", Icon: IconFile, desc: "One-page printable summary for officials." },
  { href: "/readiness", label: "Data Readiness", Icon: IconDatabase, desc: "Which sources are live or pending — and their quality." },
  { href: "/reports", label: "Reports", Icon: IconFile, desc: "Generated and exportable reports (CSV / print)." },
  { href: "/methodology", label: "Methodology", Icon: IconFlow, desc: "How fusion works and what each signal means — the honesty layer." },
  { href: "/settings", label: "Settings", Icon: IconSettings, desc: "Theme and display preferences." },
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
  const [stamp, setStamp] = useState("Jun 12, 2026, 08:24 PM");

  useEffect(() => {
    const stored = window.localStorage.getItem("ap-groundwater-sidebar");
    if (stored) setCollapsed(stored === "collapsed");
    setStamp(nowStamp());
  }, []);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("ap-groundwater-sidebar", next ? "collapsed" : "expanded");
      return next;
    });
  }

  return (
    <div className={`shell ${collapsed ? "shellCollapsed" : ""}`}>
      <aside className="sidebar">
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

          <div className="navGroupLabel"><span>More</span></div>

          {moreNav.map(({ href, label, Icon, desc }) => {
            const active = pathname.startsWith(href);
            return (
              <Link className={`navItem ${active ? "active" : ""}`} href={href} key={href} title={`${label} — ${desc}`}>
                <span className="navIcon" aria-hidden="true">
                  <Icon />
                </span>
                <span className="navLabel">{label}</span>
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
