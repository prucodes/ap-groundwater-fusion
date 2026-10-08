import type { Metadata, Viewport } from "next";
import "./fonts.css";
import "./globals.css";
import { AppShell } from "../components/AppShell";
import { VISIT_COUNTER_SCRIPT } from "../lib/visit-counter";

export const metadata: Metadata = {
  title: "AP Water Intelligence — Groundwater, Monsoon & Agriculture (Prototype)",
  description:
    "Research prototype for Andhra Pradesh: measured APWRIMS groundwater (2014-2026), this water year's rain gauges, soil moisture and reservoirs, CHIRPS v3 rainfall since 1981, El Niño context and NASA/NDMC GRACE-DA signals. Not official results.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var q=new URLSearchParams(location.search).get('theme');var t=q||localStorage.getItem('ap-gw-theme');if(t){document.documentElement.dataset.theme=t;if(q){localStorage.setItem('ap-gw-theme',q);}}}catch(e){}})();",
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: VISIT_COUNTER_SCRIPT }} />
      </head>
      <body
        suppressHydrationWarning
        style={{
          fontFamily:
            "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
