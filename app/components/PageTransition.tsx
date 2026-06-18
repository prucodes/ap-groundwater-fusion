"use client";

import { motion } from "motion/react";
import { usePathname } from "next/navigation";

/* Subtle page-enter animation on each route change. Keyed by pathname so the
   content re-mounts and fades up — no exit animation (App Router swaps children
   before exit could finish), which keeps it robust. Respects reduced-motion. */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
