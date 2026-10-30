"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { countEvent } from "../lib/visit-counter";

/* The Monsoon Watch teaser's way into /arnab/, counted so the card's pull is known
   apart from visits that arrive by a shared link or the menu. */
export function ArnabOpenLink({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Link className={className} href="/arnab/" data-testid="arnab-open"
      onClick={() => countEvent("arnab/opened-from-monsoon", "Arnab: opened the page from Monsoon Watch")}>
      {children}
    </Link>
  );
}
