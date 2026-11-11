"use client";

import { useEffect, useRef, useState } from "react";
import type { MandalCardFacts } from "../lib/mandalCard";
import { countEvent } from "../lib/visit-counter";
import { IconDownload } from "./icons";
import styles from "./MandalShareCard.module.css";

/* The mandal's season as one picture, in Telugu or English, to send on WhatsApp:
   drawn on a canvas so what is previewed is exactly what is shared. On a phone the
   share sheet carries the picture; elsewhere WhatsApp gets the same words and a link. */

type Lang = "te" | "en";
const W = 1080, H = 1350;
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const TE_MONTHS = ["జనవరి", "ఫిబ్రవరి", "మార్చి", "ఏప్రిల్", "మే", "జూన్", "జూలై", "ఆగస్టు", "సెప్టెంబర్", "అక్టోబర్", "నవంబర్", "డిసెంబర్"];
const TE_FONT = `"Noto Sans Telugu", "Kohinoor Telugu", "Telugu Sangam MN", "Nirmala UI", "Gautami", sans-serif`;
const EN_FONT = `"Inter", "Helvetica Neue", Arial, sans-serif`;
const BAND = { te: { first: "ముందుగా ప్రణాళిక", next: "తదుపరి ప్రణాళిక", watch: "పర్యవేక్షణ" }, en: { first: "Plan first", next: "Plan next", watch: "Watch" } };

type Row = { label: string; value: string; note?: string; tone?: "bad" | "warn" | "calm" };

function words(f: MandalCardFacts, lang: Lang) {
  const mon = (ym: string) => (lang === "te" ? TE_MONTHS : EN_MONTHS)[Number(ym.slice(5, 7)) - 1];
  const m = (v: number) => (lang === "te" ? `${v.toFixed(1)} మీ.` : `${v.toFixed(1)} m`);
  const te = lang === "te";
  const clock: Row = {
    label: te ? "భూగర్భ జల గడియారం" : "The groundwater clock",
    ...(f.clock.kind === "already" ? { value: te ? "ఇప్పటికే రికార్డు లోతును దాటింది" : "Already past its deepest May", note: te ? `రికార్డు కంటే ${m(f.depthM - f.deepestMayM)} లోతు` : `${m(f.depthM - f.deepestMayM)} deeper than its deepest May`, tone: "bad" as const }
      : f.clock.kind === "typical" ? { value: te ? `${mon(f.clock.month!)} నాటికి రికార్డు లోతును దాటవచ్చు` : `Passes its deepest May by ${mon(f.clock.month!)}`, note: te ? "సాధారణ శీతాకాలంలో" : "on a typical winter", tone: "bad" as const }
        : f.clock.kind === "dry" ? { value: te ? `పొడి శీతాకాలమైతే ${mon(f.clock.month!)} నాటికి దాటవచ్చు` : `Passes it by ${mon(f.clock.month!)} only in a dry winter`, tone: "warn" as const }
          : { value: te ? "రికార్డు పరిధిలోనే ఉండవచ్చు" : "Stays within its record", tone: "calm" as const }),
  };
  const rows: Row[] = [
    { label: te ? "ప్రస్తుత నీటి మట్టం" : "Water table now", value: m(f.depthM), note: te ? `భూమి నుండి లోతు, ${mon(f.readingMonth)} రీడింగ్` : `below ground, ${mon(f.readingMonth)} reading` },
    { label: te ? "రికార్డులో అత్యంత లోతైన మే" : "Deepest May on record", value: m(f.deepestMayM) },
    clock,
  ];
  if (f.band) rows.push({ label: te ? "వేసవి తాగునీరు" : "Summer drinking water", value: BAND[lang][f.band], tone: f.band === "watch" ? "warn" : "bad" });
  if (f.cycloneMm !== null) rows.push({ label: te ? "అర్ణబ్, మురసు తుఫాన్లు" : "Cyclones Arnab and Murasu", value: te ? `${Math.round(f.cycloneMm)} మి.మీ. వర్షం` : `${Math.round(f.cycloneMm)} mm of rain`, note: f.cycloneDays ? (te ? `${f.cycloneDays} రోజుల్లో` : `in ${f.cycloneDays} days`) : undefined });
  return {
    kicker: te ? `భూగర్భ జలం · ${mon(f.readingMonth)} ${f.readingMonth.slice(0, 4)} రీడింగ్` : `GROUNDWATER · ${mon(f.readingMonth).toUpperCase()} ${f.readingMonth.slice(0, 4)} READING`,
    sub: te ? `${f.district} జిల్లా` : `${f.district} district`,
    rows,
    footer: te ? "పరిశోధన నమూనా, అధికారిక సమాచారం కాదు · APWRIMS రీడింగ్‌లు" : "Research sample pending authorisation, not official data · APWRIMS readings",
    message: (url: string) => te
      ? `${f.mandal} మండలం: భూగర్భ నీటి మట్టం ${m(f.depthM)} (${mon(f.readingMonth)}). ${clock.value}. ${url}`
      : `${f.mandal} mandal: water table ${m(f.depthM)} below ground (${mon(f.readingMonth)}). ${clock.value}. ${url}`,
  };
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) { out.push(line); line = word; } else line = next;
  }
  if (line) out.push(line);
  return out;
}

function draw(canvas: HTMLCanvasElement, f: MandalCardFacts, lang: Lang) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const t = words(f, lang), font = lang === "te" ? TE_FONT : EN_FONT;
  canvas.width = W;
  const X = 84, R = W - 84;

  // Each row as tall as what it holds: label, one or two lines of value, and a note.
  // Telugu's vowel signs hang below the line, so its lines stand further apart.
  const BIG = 54, LABEL = 42, PAD = 26, gap = 16, LINE = BIG + (lang === "te" ? 20 : 8), NOTE = lang === "te" ? 44 : 36;
  const laid = t.rows.map(row => {
    ctx.font = `700 ${BIG}px ${/[\u0C00-\u0C7F]/.test(row.value) ? TE_FONT : EN_FONT}`;
    const lines = wrap(ctx, row.value, R - X - 24).slice(0, 2);
    return { row, lines, h: LABEL + lines.length * LINE + (row.note ? NOTE : 0) + PAD };
  });
  const height = Math.max(H, 350 + laid.reduce((sum, r) => sum + r.h + gap, 0) + 190);
  canvas.height = height;   // resizing clears the canvas, so the ground is painted after it
  const sky = ctx.createLinearGradient(0, 0, W, height);
  sky.addColorStop(0, "#0b1d33"); sky.addColorStop(1, "#12324f");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, height);
  const glow = ctx.createRadialGradient(W * .92, -60, 10, W * .92, -60, 620);
  glow.addColorStop(0, "rgba(18,181,203,.35)"); glow.addColorStop(1, "rgba(18,181,203,0)");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, height);

  ctx.fillStyle = "#7edcec"; ctx.font = `600 30px ${font}`;
  ctx.fillText(t.kicker, X, 128);
  ctx.fillStyle = "#ffffff"; ctx.font = `700 92px ${EN_FONT}`;
  ctx.fillText(f.mandal, X, 238, R - X);
  ctx.fillStyle = "rgba(232,241,250,.72)"; ctx.font = `500 38px ${font}`;
  ctx.fillText(t.sub, X, 300);

  let y = 350;
  for (const { row, lines, h } of laid) {
    ctx.fillStyle = "rgba(255,255,255,.06)";
    ctx.beginPath(); ctx.roundRect(X - 20, y, R - X + 40, h, 26); ctx.fill();
    if (row.tone) {
      ctx.fillStyle = row.tone === "bad" ? "#e2725c" : row.tone === "warn" ? "#f2c46d" : "#8fd4b8";
      ctx.beginPath(); ctx.roundRect(X - 20, y, 10, h, 5); ctx.fill();
    }
    ctx.fillStyle = "rgba(232,241,250,.66)"; ctx.font = `600 27px ${font}`;
    ctx.fillText(row.label, X + 12, y + LABEL);
    ctx.fillStyle = row.tone === "bad" ? "#ffb39f" : row.tone === "warn" ? "#f2c46d" : "#ffffff";
    ctx.font = `700 ${BIG}px ${/[\u0C00-\u0C7F]/.test(row.value) ? TE_FONT : EN_FONT}`;
    lines.forEach((line, i) => ctx.fillText(line, X + 12, y + LABEL + (i + 1) * LINE - (lang === "te" ? 14 : 4)));
    if (row.note) {
      ctx.fillStyle = "rgba(232,241,250,.7)"; ctx.font = `500 27px ${font}`;
      ctx.fillText(row.note, X + 12, y + LABEL + lines.length * LINE + NOTE - 8);
    }
    y += h + gap;
  }

  ctx.fillStyle = "rgba(255,255,255,.14)"; ctx.fillRect(X, height - 150, R - X, 2);
  ctx.fillStyle = "#ffffff"; ctx.font = `700 34px ${EN_FONT}`;
  ctx.fillText("AP Water Intelligence", X, height - 92);
  ctx.fillStyle = "rgba(232,241,250,.62)"; ctx.font = `500 24px ${font}`;
  ctx.fillText(t.footer, X, height - 50, R - X);
}

export function MandalShareCard({ facts }: { facts: MandalCardFacts }) {
  const [lang, setLang] = useState<Lang>("te");
  const [preview, setPreview] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let live = true;
    const paint = () => {
      if (!live) return;
      canvas.current = canvas.current ?? document.createElement("canvas");
      draw(canvas.current, facts, lang);
      setPreview(canvas.current.toDataURL("image/png"));
    };
    // Telugu needs its font before it is drawn, or the first picture comes out in boxes.
    if (document.fonts?.load) document.fonts.load(`600 30px ${TE_FONT}`, "భూగర్భ").then(paint, paint);
    else paint();
    return () => { live = false; };
  }, [facts, lang]);

  const file = async () => {
    const c = canvas.current;
    if (!c) return null;
    const blob = await new Promise<Blob | null>(done => c.toBlob(done, "image/png"));
    return blob ? new File([blob], `${facts.mandal.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-groundwater.png`, { type: "image/png" }) : null;
  };
  const share = async () => {
    const text = words(facts, lang).message(window.location.href.split("#")[0]);
    countEvent("app/mandal-card-share", "Mandal: shared the mandal card");
    const picture = await file();
    if (picture && navigator.canShare?.({ files: [picture] })) {
      try { await navigator.share({ files: [picture], text }); return; } catch { /* closed the sheet */ return; }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };
  const save = async () => {
    const picture = await file();
    if (!picture) return;
    countEvent("app/mandal-card-save", "Mandal: saved the mandal card picture");
    const url = URL.createObjectURL(picture);
    const a = document.createElement("a");
    a.href = url; a.download = picture.name; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <section className={`card ${styles.wrap}`} aria-labelledby="share-card-title" data-testid="mandal-share-card">
      <div className={styles.text}>
        <span className={styles.kicker}>Share this mandal</span>
        <h3 id="share-card-title">One picture for WhatsApp, in Telugu or English</h3>
        <p>The latest reading, its deepest May, when the groundwater clock says it passes it, and the cyclones&rsquo; rain: ready for a sarpanch, an MPDO or a district meeting.</p>
        <div className={styles.lang} role="group" aria-label="Card language">
          <button type="button" aria-pressed={lang === "te"} onClick={() => setLang("te")} lang="te">తెలుగు</button>
          <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>English</button>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.share} onClick={share} data-testid="share-card-send">Share on WhatsApp</button>
          <button type="button" className={styles.save} onClick={save} data-testid="share-card-save"><IconDownload /> Save picture</button>
        </div>
      </div>
      <div className={styles.preview}>
        {preview ? <img src={preview} alt={`${facts.mandal} groundwater card in ${lang === "te" ? "Telugu" : "English"}`} data-testid="share-card-preview" /> : <span className={styles.placeholder} />}
      </div>
    </section>
  );
}
