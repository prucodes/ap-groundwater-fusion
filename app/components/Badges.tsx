import { agreementMeta, confidenceClass, statusMeta } from "../lib/data";

export function StatusBadge({ bucket }: { bucket: string }) {
  const meta = statusMeta(bucket);
  return (
    <span className={`badge ${meta.className}`}>
      <span className="dot" />
      {meta.label}
    </span>
  );
}

export function ConfidenceBadge({ label }: { label: string }) {
  const cls = confidenceClass(label);
  const display = label ? (/confidence/i.test(label) ? label : `${label} Confidence`) : "Unknown";
  return <span className={`badge ${cls}`}>{display}</span>;
}

/* The full agreement wording runs to five lines in a narrow column. The pill
   says it in three words; the full sentence stays on hover and for readers. */
const SHORT_SIGNAL: Record<string, string> = {
  strong: "Falls despite surplus",
  partial: "Falls, no surplus",
  agree: "Stable / recovering",
  unknown: "Context unknown",
};

export function SignalPill({ value }: { value: string }) {
  const meta = agreementMeta(value);
  return (
    <span className={`signalPill ${meta.className}`} title={meta.label} aria-label={meta.label}>
      {SHORT_SIGNAL[meta.className] ?? meta.label}
    </span>
  );
}

export function AgreementTag({ value }: { value: string }) {
  const meta = agreementMeta(value);
  return (
    <span className={`agreeTag ${meta.className}`}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "currentColor" }} />
      {meta.label}
    </span>
  );
}
