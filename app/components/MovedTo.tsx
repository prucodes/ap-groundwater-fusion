"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/* A page that has moved: replace the address at once (keeping the #section), with a
   plain link for the moment before it does. */
export function MovedTo({ href, label, notice }: { href: string; label: string; notice: string }) {
  const router = useRouter();
  useEffect(() => { router.replace(`${href}${window.location.hash}`); }, [router, href]);
  return <div className="pageWrap">
    <p>This page has moved to <Link href={href}>{label}</Link>.</p>
    <p><small><strong>Prototype.</strong> {notice}</small></p>
  </div>;
}
