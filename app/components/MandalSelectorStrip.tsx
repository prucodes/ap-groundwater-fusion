"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { mandals, statusMeta, titleCase } from "../lib/data";

// Deliberately a client component, and deliberately rendered only after mount.
//
// This strip links to all ~670 mandals. Rendered on the server it inlined the
// entire mandal list into every one of the 670 mandal pages — an O(n^2) blowup
// that made the static export ~1 GB. As a mount-only client component the list
// is bundled once into a shared chunk the browser caches, and no page's HTML
// carries it. It is a navigation convenience, so appearing on hydration rather
// than first paint costs nothing; the page's own content is fully server-rendered.
export function MandalSelectorStrip({ activeId }: { activeId: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Reserve the row's height so hydration doesn't shift the layout.
  if (!mounted) return <div className="tableWrap" style={{ minHeight: 34 }} aria-hidden />;

  return (
    <div className="tableWrap" style={{ display: "flex", gap: 8, paddingBottom: 4 }}>
      {mandals.map((m) => {
        const meta = statusMeta(m.status_bucket);
        const active = m.id === activeId;
        return (
          <Link
            key={m.id}
            href={`/mandals/${m.id}`}
            className="badge"
            style={{
              whiteSpace: "nowrap",
              padding: "7px 12px",
              border: active ? `1px solid ${meta.color}` : "1px solid var(--line)",
              background: active ? meta.color : "var(--card)",
              color: active ? "#fff" : "var(--ink-soft)",
            }}
          >
            <span
              className="dot"
              style={{ background: active ? "#fff" : meta.color, width: 7, height: 7 }}
            />
            {titleCase(m.mandal_name)}
          </Link>
        );
      })}
    </div>
  );
}
