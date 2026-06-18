/* Elegant wireframe data-globe with a satellite revolving on a thin orbit.
   Minimal, luminous line-art (no cartoon continents) for a premium, modern feel.
   variant="hero" renders sharper/brighter as a focal element; "sidebar" is subtle. */

export function OrbitGlobe({
  idScope = "og",
  variant = "sidebar",
}: {
  idScope?: string;
  variant?: "sidebar" | "hero";
}) {
  const id = (s: string) => `${idScope}-${s}`;
  const hero = variant === "hero";

  // Sharper line weights / opacities for the hero focal globe.
  const wire = {
    sphere: hero ? 1.3 : 1,
    sphereOp: hero ? 0.85 : 0.55,
    merid: hero ? 0.9 : 0.7,
    meridOp: hero ? 0.5 : 0.3,
    meridOp2: hero ? 0.4 : 0.22,
    lineOp: hero ? 0.55 : 0.32,
    parOp: hero ? 0.34 : 0.18,
  };

  return (
    <div className={`orbitGlobe ${hero ? "orbitHero" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 240 172" preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id={id("fill")} cx="42%" cy="34%" r="72%">
            <stop offset="0%" stopColor="#2ec3e6" stopOpacity={hero ? 0.32 : 0.22} />
            <stop offset="60%" stopColor="#0e5e94" stopOpacity={hero ? 0.18 : 0.1} />
            <stop offset="100%" stopColor="#04203d" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={id("glow")} cx="50%" cy="50%" r="50%">
            <stop offset="58%" stopColor="#5fe0ff" stopOpacity="0" />
            <stop offset="88%" stopColor="#5fe0ff" stopOpacity={hero ? 0.42 : 0.28} />
            <stop offset="100%" stopColor="#5fe0ff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={id("rim")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#bff3ff" />
            <stop offset="100%" stopColor="#2ec3e6" />
          </linearGradient>
          <clipPath id={id("clip")}>
            <circle cx="120" cy="108" r="48" />
          </clipPath>
        </defs>

        {/* stars */}
        <g className="ogStars">
          <circle cx="28" cy="26" r="1" />
          <circle cx="206" cy="22" r="1.1" />
          <circle cx="224" cy="58" r="0.8" />
          <circle cx="18" cy="64" r="0.8" />
          <circle cx="200" cy="92" r="0.7" />
        </g>

        {/* soft glow + atmosphere */}
        <circle cx="120" cy="108" r="56" fill={`url(#${id("glow")})`} />
        <circle cx="120" cy="108" r="48" fill={`url(#${id("fill")})`} />

        {/* wireframe sphere */}
        <g stroke="#8fe6f7" fill="none" className="ogWire" strokeLinecap="round">
          <circle cx="120" cy="108" r="48" stroke={`url(#${id("rim")})`} strokeWidth={wire.sphere} opacity={wire.sphereOp} />
          {/* meridians */}
          <ellipse cx="120" cy="108" rx="16" ry="48" strokeWidth={wire.merid} opacity={wire.meridOp} />
          <ellipse cx="120" cy="108" rx="33" ry="48" strokeWidth={wire.merid} opacity={wire.meridOp2} />
          <line x1="120" y1="60" x2="120" y2="156" strokeWidth={wire.merid} opacity={wire.lineOp} />
          {/* parallels */}
          <line x1="72" y1="108" x2="168" y2="108" strokeWidth={wire.merid} opacity={wire.lineOp} />
          <ellipse cx="120" cy="108" rx="48" ry="15" strokeWidth={wire.merid} opacity={wire.meridOp2} />
          <g clipPath={`url(#${id("clip")})`}>
            <ellipse cx="120" cy="88" rx="48" ry="14" strokeWidth="0.7" opacity={wire.parOp} />
            <ellipse cx="120" cy="128" rx="48" ry="14" strokeWidth="0.7" opacity={wire.parOp} />
          </g>
        </g>

        {/* monitored data nodes on the surface */}
        <g clipPath={`url(#${id("clip")})`}>
          <circle cx="104" cy="96" r="1.7" fill="#9befff" />
          <circle cx="132" cy="118" r="1.7" fill="#9befff" />
          <circle cx="124" cy="84" r="1.5" fill="#9befff" opacity="0.7" />
          <circle className="ogNode" cx="116" cy="104" r="2.2" fill="#5fe0ff" />
        </g>

        {/* orbit ring */}
        <path className="ogOrbit" d="M34 72 a86 24 0 1 0 172 0 a86 24 0 1 0 -172 0 Z" />

        {/* revolving satellite */}
        <g className="ogSat">
          <g transform="translate(-11 -6)">
            {hero && <circle cx="11" cy="6" r="10" fill="#12b5cb" opacity="0.18" />}
            <rect x="-9" y="2" width="9" height="8" rx="1.2" fill="#1f4f7d" stroke="#8fd2e6" strokeWidth="0.7" />
            <rect x="22" y="2" width="9" height="8" rx="1.2" fill="#1f4f7d" stroke="#8fd2e6" strokeWidth="0.7" />
            <line x1="2" y1="6" x2="7" y2="6" stroke="#bfe9f5" strokeWidth="1" />
            <line x1="15" y1="6" x2="20" y2="6" stroke="#bfe9f5" strokeWidth="1" />
            <rect x="7" y="1.5" width="8" height="9" rx="1.8" fill="#eaf7fd" stroke="#12b5cb" strokeWidth="1" />
            <circle cx="11" cy="-1" r="2.1" fill="#12b5cb" />
          </g>
        </g>
      </svg>
    </div>
  );
}
