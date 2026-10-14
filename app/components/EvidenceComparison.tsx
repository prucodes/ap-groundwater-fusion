import { formatNumber } from "../lib/data";
import styles from "./EvidenceComparison.module.css";

type Props = {
  label: string;
  value: number | null;
  reference: number | null;
  referenceLabel: string;
  unit: string;
  maximum?: number;
};

/** One zero-based scale, with an explicitly named reference rather than a target. */
export function EvidenceComparison({ label, value, reference, referenceLabel, unit, maximum }: Props) {
  if (value == null || reference == null || !Number.isFinite(value) || !Number.isFinite(reference) || value < 0 || reference < 0) return null;
  const scale = Math.max(maximum ?? 0, value, reference, 1);
  const currentText = formatNumber(value, unit);
  const referenceText = formatNumber(reference, unit);
  return (
    <figure className={styles.figure} aria-label={`${label}: ${currentText}; ${referenceLabel}: ${referenceText}. Zero-based scale.`}
      data-testid="evidence-comparison" data-value={value} data-reference={reference} data-maximum={scale}>
      <div className={styles.track} aria-hidden="true">
        <span className={styles.fill} style={{ width: `${100 * value / scale}%` }} />
        <span className={styles.marker} style={{ left: `${100 * reference / scale}%` }} />
      </div>
      <figcaption className={styles.caption}>
        <span><i className={styles.currentKey} />{label}<b>{currentText}</b></span>
        <span><i className={styles.referenceKey} />{referenceLabel}<b>{referenceText}</b></span>
      </figcaption>
    </figure>
  );
}
