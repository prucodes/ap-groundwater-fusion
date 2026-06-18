import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { AppShell } from "../components/AppShell";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mandal Groundwater Fusion Layer — AP Prototype",
  description:
    "Static Phase 2A prototype for the Andhra Pradesh mandal-level groundwater fusion layer. Real APWRIMS readings (2014-2026) with real NASA/NDMC GRACE-DA satellite-model signals. Not official results.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var q=new URLSearchParams(location.search).get('theme');var t=q||localStorage.getItem('ap-gw-theme');if(t){document.documentElement.dataset.theme=t;if(q){localStorage.setItem('ap-gw-theme',q);}}}catch(e){}})();",
          }}
        />
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
