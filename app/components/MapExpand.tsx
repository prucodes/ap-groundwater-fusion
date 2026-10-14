"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { IconArrowRight, IconExpand, IconX } from "./icons";

export function MapExpand({ title, subtitle, detailsHref, children }: {
  title: string;
  subtitle: string;
  detailsHref?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  return <>
    <button type="button" className="mapExpandButton" aria-label="Expand map" title="Expand map"
      aria-haspopup="dialog" onClick={() => setOpen(true)}><IconExpand /></button>
    {open && <dialog ref={dialog} className="mapExpandedDialog" aria-label={title} onClose={() => setOpen(false)}>
      <header><div><strong>{title}</strong><span>{subtitle}</span></div>
        <button type="button" aria-label="Close expanded map" title="Close expanded map" autoFocus
          onClick={() => dialog.current?.close()}><IconX /></button>
      </header>
      <div className="mapExpandedCanvas">{children}</div>
      <footer><span>Snapshot evidence · not an official assessment</span>
        {detailsHref && <Link href={detailsHref}>Selected mandal evidence <IconArrowRight /></Link>}
      </footer>
    </dialog>}
  </>;
}
