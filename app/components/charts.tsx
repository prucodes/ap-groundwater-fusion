/* Dependency-free SVG chart primitives: percentile ring, status donut, sparkline. */

let uid = 0;
function nextId(prefix: string) {
  uid += 1;
  return `${prefix}-${uid}`;
}

export function PercentileRing({
  value,
  size = 72,
  stroke = 8,
  color = "#12b5cb",
  track = "#e7eef5",
  children,
}: {
  value: number | null;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value ?? 0));
  const dash = (pct / 100) * c;
  const gid = nextId("ring");
  return (
    <div className="ringFig" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={color} stopOpacity="0.55" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: "var(--chart-track)" }} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 0.9s cubic-bezier(0.22,0.61,0.36,1)", filter: `drop-shadow(0 0 5px ${color}66)` }}
        />
      </svg>
      <div className="ringCenter">{children}</div>
    </div>
  );
}

export type DonutSlice = { label: string; value: number; color: string; className?: string };

export function StatusDonut({
  slices,
  total,
  size = 150,
  stroke = 22,
}: {
  slices: DonutSlice[];
  total: number;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const sum = slices.reduce((acc, s) => acc + s.value, 0) || 1;
  let offset = 0;
  return (
    <div className="donutFig" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: "var(--chart-track)" }} strokeWidth={stroke} />
        {slices
          .filter((s) => s.value > 0)
          .map((s) => {
            const len = (s.value / sum) * c;
            const gap = 2; // tiny gap between segments
            const seg = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${Math.max(0, len - gap)} ${c - Math.max(0, len - gap)}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{ transition: "stroke-dasharray 0.8s var(--ease)", filter: `drop-shadow(0 0 4px ${s.color}55)` }}
              />
            );
            offset += len;
            return seg;
          })}
      </svg>
      <div className="donutCenter">
        <span className="num">{total}</span>
        <span className="lbl">Total</span>
      </div>
    </div>
  );
}

export function Sparkline({
  series,
  width = 460,
  height = 150,
  pad = 28,
  area = false,
  markerIndex,
}: {
  series: { name: string; color: string; points: number[] }[];
  width?: number;
  height?: number;
  pad?: number;
  area?: boolean;
  markerIndex?: number;
}) {
  const n = Math.max(...series.map((s) => s.points.length), 1);
  const all = series.flatMap((s) => s.points);
  const min = Math.min(...all, 0);
  const max = Math.max(...all, 100);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (n - 1 || 1)) * (width - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Sensor vs satellite trend">
      {markerIndex !== undefined && (
        <line
          x1={x(markerIndex)}
          x2={x(markerIndex)}
          y1={pad - 6}
          y2={height - pad}
          stroke="var(--cyan)"
          strokeWidth={1.4}
          strokeDasharray="3 3"
          opacity={0.8}
        />
      )}
      <defs>
        {series.map((s, i) => (
          <linearGradient key={i} id={`spark-${uid}-${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((g) => (
        <line
          key={g}
          x1={pad}
          x2={width - pad}
          y1={pad + g * (height - pad * 2)}
          y2={pad + g * (height - pad * 2)}
          style={{ stroke: "var(--chart-track)" }}
          strokeWidth={1}
        />
      ))}
      {series.map((s, idx) => {
        const line = s.points
          .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
          .join(" ");
        const fill = `${line} L${x(s.points.length - 1).toFixed(1)} ${(height - pad).toFixed(1)} L${x(0).toFixed(1)} ${(height - pad).toFixed(1)} Z`;
        return (
          <g key={s.name}>
            {area && <path d={fill} fill={`url(#spark-${uid}-${idx})`} stroke="none" />}
            <path d={line} fill="none" stroke={s.color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            {s.points.map((v, i) => (
              <circle
                key={i}
                cx={x(i)}
                cy={y(v)}
                r={markerIndex === i ? 4.2 : 2.8}
                fill={markerIndex === i ? s.color : "#fff"}
                stroke={s.color}
                strokeWidth={1.8}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
