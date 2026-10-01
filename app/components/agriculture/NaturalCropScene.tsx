"use client";

import { useEffect, useRef, useState } from "react";
import type { CropKey } from "../../lib/agriculture";
import { CROP_FRAMES as FRAMES } from "./cropArtwork";

export type FieldFocus = "rain" | "roots" | "crop";
type Props = {
  crop: CropKey; stage: number; rain: number; reserve: number; demand: number;
  moving: boolean; visible: boolean; focus: FieldFocus; resetCamera: number;
  lens: boolean; onReady: () => void; onFailure: () => void;
};

const seed = (n: number) => { const x = Math.sin(n * 127.1 + 11.7) * 43758.5453; return x - Math.floor(x); };

export default function NaturalCropScene(props: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const images = useRef<Partial<Record<CropKey, HTMLImageElement>>>({});
  const [loaded, setLoaded] = useState(0);
  const pointer = useRef({ x: .5, y: .68 });
  const time = useRef(0);
  const previous = useRef({ crop: props.crop, stage: props.stage });
  const ready = useRef(false);
  useEffect(() => {
    let active = true;
    for (const crop of ["maize", "groundnut"] as const) {
      const image = new Image();
      image.onload = () => { if (active) { images.current[crop] = image; setLoaded(value => value + 1); } };
      image.onerror = () => { if (active) props.onFailure(); };
      image.src = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/assets/agriculture-${crop}-stages.webp`;
    }
    return () => { active = false; };
  }, [props.onFailure]);

  useEffect(() => { pointer.current = { x: .5, y: props.focus === "crop" ? .32 : .68 }; }, [props.resetCamera, props.focus]);

  useEffect(() => {
    const element = canvas.current;
    if (!element || !images.current[props.crop]) return;
    const context = element.getContext("2d");
    if (!context) { props.onFailure(); return; }
    let raf = 0, last = 0, transition = props.moving ? 0 : 1;
    const old = previous.current;
    previous.current = { crop: props.crop, stage: props.stage };
    const image = images.current[props.crop]!;
    const [sourceY, sourceHeight, ground] = FRAMES[props.crop][props.stage];
    let width = 1, height = 1, dpr = 1;

    function draw(stamp: number) {
      const ctx = context!;
      const delta = last ? Math.min((stamp - last) / 1000, .05) : 0;
      last = stamp;
      if (props.moving) time.current += delta;
      transition = Math.min(1, transition + delta * 3);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
      const scale = Math.max(width / image.naturalWidth, height / sourceHeight);
      const drawW = image.naturalWidth * scale, drawH = sourceHeight * scale;
      const dx = (width - drawW) / 2, dy = (height - drawH) * .35;
      if (transition < 1 && images.current[old.crop]) {
        const oldImage = images.current[old.crop]!;
        const [oldY, oldH] = FRAMES[old.crop][old.stage];
        const oldScale = Math.max(width / oldImage.naturalWidth, height / oldH);
        ctx.drawImage(oldImage, 0, oldY, oldImage.naturalWidth, oldH, (width - oldImage.naturalWidth * oldScale) / 2, (height - oldH * oldScale) * .35, oldImage.naturalWidth * oldScale, oldH * oldScale);
      }
      ctx.globalAlpha = transition;
      ctx.drawImage(image, 0, sourceY, image.naturalWidth, sourceHeight, dx, dy, drawW, drawH);
      ctx.globalAlpha = 1;
      ctx.save(); ctx.translate(dx, dy); ctx.scale(drawW / 1000, drawH / 600);
      const surface = ground * 600;
      // A texture-preserving wash distinguishes the selected process without
      // implying that this illustrative soil section is a measured moisture map.
      const soilWash = ctx.createLinearGradient(0, surface - 5, 0, 600);
      soilWash.addColorStop(0, "rgba(7,27,28,0)");
      soilWash.addColorStop(.22, `rgba(8,39,40,${props.focus === "roots" ? .2 : .08})`);
      soilWash.addColorStop(1, "rgba(5,23,28,.32)");
      ctx.fillStyle = soilWash; ctx.fillRect(0, surface - 5, 1000, 605 - surface);
      // Keep the flow readable at mobile scale and against both sky and soil.
      const pixel = 1000 / drawW;
      const rainCount = props.rain > 0 ? Math.round(42 + Math.sqrt(props.rain / 70) * 66) : 0;
      ctx.lineCap = "round";
      for (let i = 0; i < rainCount; i++) {
        const phase = (seed(i + 77) + time.current * .62) % 1;
        const x = seed(i + 4) * 1000, y = phase * surface;
        const length = (12 + seed(i + 98) * 14) * pixel;
        const gradient = ctx.createLinearGradient(x, y - length, x - 3 * pixel, y);
        gradient.addColorStop(0, "#e0f4ff00");
        gradient.addColorStop(.3, "#e0f4ff48");
        gradient.addColorStop(.78, props.focus === "rain" ? "#e0f4ffda" : "#e0f4ffb8");
        gradient.addColorStop(1, "#d0edff10");
        ctx.beginPath(); ctx.moveTo(x, Math.max(0, y - length)); ctx.lineTo(x - 3 * pixel, y);
        ctx.strokeStyle = gradient; ctx.lineWidth = (.9 + seed(i + 32) * .5) * pixel; ctx.stroke();
      }
      const covered = props.demand ? Math.min(1, (props.rain + props.reserve) / props.demand) : 0;
      const rootLength = props.stage === 0 ? 116 : Math.min(182, 580 - surface);
      const flow = (point: (t: number) => { x: number; y: number }, phase: number, bright: boolean, strength: number) => {
        // Feather each moving trace at both ends, without dots or outlined tubes.
        for (let j = 0; j < 24; j++) {
          const tail = Math.max(0, phase - .28), length = Math.min(phase, .28);
          const a = point(tail + length * j / 24), b = point(tail + length * (j + 1) / 24);
          const feather = Math.sin(Math.PI * (j + .5) / 24);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = bright ? `rgba(169, 211, 227, ${strength * feather})` : `rgba(190, 223, 210, ${strength * feather})`;
          ctx.lineWidth = (.4 + feather * .9) * pixel; ctx.stroke();
        }
      };
      if (props.rain > 0) for (let i = 0; i < 8; i++) {
        const x = 75 + i * 125;
        const point = (t: number) => ({ x: x + Math.sin(t * Math.PI * 1.6) * 14, y: surface + t * rootLength * .82 });
        flow(point, (seed(i + 120) + time.current * .22) % 1, true, props.focus === "rain" ? .7 : .4);
      }
      for (let root = 0; root < 3; root++) for (let branch = 0; branch < 6; branch++) {
        const x = [215, 500, 800][root], spread = (branch - 2.5) * 35;
        if (covered > 0) {
          const point = (t: number) => ({ x: x + spread * (1 - t) ** .76 + Math.sin(t * 9 + branch) * 3 * (1 - t), y: surface + rootLength * (1 - t) ** 1.16 });
          for (let pulse = 0; pulse < Math.ceil(covered * 2); pulse++) {
            const phase = (seed(root * 4 + branch) + pulse / 2 + time.current * (.13 + covered * .1)) % 1;
            flow(point, phase, false, props.focus === "roots" ? .88 : .42);
          }
        }
      }
      if (props.focus === "crop") {
        ctx.strokeStyle = "#f3f2d780"; ctx.lineWidth = .8 * pixel;
        for (let i = 0; i < Math.round(props.demand / 84 * 30); i++) {
          const phase = (seed(i + 16) + time.current * .17) % 1;
          const x = seed(i + 63) * 1000 + Math.sin(phase * 6) * 5;
          const y = surface * .7 * (1 - phase);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 3, y - 5, x + 1, y - 9); ctx.stroke();
        }
      }
      ctx.restore();
      if (props.lens) {
        const radius = width < 500 ? 68 : 105;
        const x = Math.max(radius + 4, Math.min(width - radius - 4, pointer.current.x * width));
        const y = Math.max(radius + 4, Math.min(height - radius - 4, pointer.current.y * height));
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.clip();
        ctx.translate(x, y); ctx.scale(1.85, 1.85); ctx.translate(-x, -y);
        ctx.drawImage(element!, 0, 0, element!.width, element!.height, 0, 0, width, height); ctx.restore();
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.strokeStyle = "#eaf3ebed"; ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, radius + 4, 0, Math.PI * 2); ctx.strokeStyle = "#173a2f80"; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = "#f2f7ed"; ctx.font = "10px system-ui"; ctx.textAlign = "center"; ctx.fillText("1.85×", x, y + radius - 12);
      }
      if (!ready.current) { ready.current = true; props.onReady(); }
      if (props.visible && (props.moving || transition < 1)) raf = requestAnimationFrame(draw);
    }
    const repaint = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };
    const resize = () => {
      const rect = element.getBoundingClientRect(); width = rect.width; height = rect.height;
      dpr = Math.min(devicePixelRatio, 2); element.width = Math.round(width * dpr); element.height = Math.round(height * dpr); repaint();
    };
    const move = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      pointer.current = { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
      if (props.lens) repaint();
    };
    const key = (event: KeyboardEvent) => {
      if (!props.lens || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      pointer.current.x = Math.max(0, Math.min(1, pointer.current.x + (event.key === "ArrowLeft" ? -.05 : event.key === "ArrowRight" ? .05 : 0)));
      pointer.current.y = Math.max(0, Math.min(1, pointer.current.y + (event.key === "ArrowUp" ? -.05 : event.key === "ArrowDown" ? .05 : 0)));
      repaint();
    };
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    element.addEventListener("pointermove", move); element.addEventListener("pointerdown", move); element.addEventListener("keydown", key);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); element.removeEventListener("pointermove", move); element.removeEventListener("pointerdown", move); element.removeEventListener("keydown", key); };
  }, [props.crop, props.stage, props.rain, props.reserve, props.demand, props.moving, props.visible, props.focus, props.lens, props.resetCamera, props.onReady, props.onFailure, loaded]);

  return <canvas ref={canvas} tabIndex={props.lens ? 0 : -1} aria-label="Illustrated crop-stage cutaway; with detail lens enabled, arrow keys move the lens" data-lens={props.lens} />;
}
