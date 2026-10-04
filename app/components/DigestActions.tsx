"use client";

import Link from "next/link";
import { IconChevronLeft, IconDownload, IconPrinter } from "./icons";
import styles from "../app/digest/Digest.module.css";

/** The digest's controls on screen: back to This Week, the PDF each deploy prints, and print. Never printed. */
export function DigestActions({ pdf, filename }: { pdf: string; filename: string }) {
  return <nav className={styles.actions} aria-label="Digest actions">
    <Link href="/changes/" className={styles.back}><IconChevronLeft /> This Week</Link>
    <span className={styles.spacer} />
    <a href={pdf} className={styles.primary} download={filename} data-testid="digest-pdf"><IconDownload /> Download PDF</a>
    <button type="button" className={styles.secondary} onClick={() => window.print()}><IconPrinter /> Print</button>
  </nav>;
}
