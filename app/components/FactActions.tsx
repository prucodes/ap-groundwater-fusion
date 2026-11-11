"use client";

import { useState } from "react";
import { countEvent } from "../lib/visit-counter";
import { IconCopy } from "./icons";
import styles from "../app/facts/Facts.module.css";

/* Copy a fact with its source and link, or send it on WhatsApp: the quote travels
   with where it came from. */
export function FactActions({ id, text, source, asOf }: { id: string; text: string; source: string; asOf: string }) {
  const [copied, setCopied] = useState(false);
  const quote = () => `${text} (${source}, ${asOf}) ${window.location.origin}${window.location.pathname}#${id}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(quote());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      countEvent("app/fact-copy", "In Numbers: copied a fact");
    } catch { /* the browser refused the clipboard */ }
  };
  const send = () => {
    countEvent("app/fact-whatsapp", "In Numbers: sent a fact on WhatsApp");
    window.open(`https://wa.me/?text=${encodeURIComponent(quote())}`, "_blank", "noopener,noreferrer");
  };
  return (
    <div className={styles.actions}>
      <button type="button" onClick={copy} data-testid={`fact-copy-${id}`}><IconCopy />{copied ? "Copied" : "Copy with source"}</button>
      <button type="button" onClick={send}>WhatsApp</button>
      <a href={`#${id}`} aria-label="Link to this fact">Link</a>
    </div>
  );
}
