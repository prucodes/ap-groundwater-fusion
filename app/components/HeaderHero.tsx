import { dashboardSummary, prototypeNotice } from "../lib/data";
import { IconInfo } from "./icons";

const STATUS_CHIPS = [
  { label: "NASA Signal", value: "Active", dot: "live" },
  { label: "APWRIMS Sensors", value: "Prototype", dot: "proto" },
  { label: "Boundary", value: "Public", dot: "muted" },
  { label: "APWRIMS", value: "Pending", dot: "pending" },
];

export function HeaderHero({
  title = "Mandal-Level Groundwater Fusion Layer",
  subtitle,
  showChips = true,
  showBanner = true,
}: {
  title?: string;
  subtitle?: React.ReactNode;
  showChips?: boolean;
  showBanner?: boolean;
}) {
  const fetchDate = dashboardSummary.summary.sample_fetch_date;
  return (
    <>
      <header className="hero fadeUp">
        <div className="heroScan" aria-hidden="true" />
        <div className="heroInner">
          <div className="heroLeft">
            <span className="heroEyebrow">Andhra Pradesh Groundwater Assessment</span>
            <h1>{title}</h1>
            <p className="heroSub">
              {subtitle ?? (
                <>APWRIMS-format readings fused with NASA/NDMC GRACE-DA satellite-model signals.</>
              )}
            </p>
            {showChips && (
              <div className="heroStatus">
                {STATUS_CHIPS.map((chip) => (
                  <span className="statChip" key={chip.label}>
                    <span className={`chipDot ${chip.dot}`} />
                    <span className="statChipText">
                      {chip.label}
                      <b>{chip.value}</b>
                    </span>
                  </span>
                ))}
                <span className="statStamp">{fetchDate}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {showBanner && (
        <div className="protoBanner fadeUp">
          <span className="bannerIcon">
            <IconInfo />
          </span>
          <span>
            <strong>Prototype.</strong> {prototypeNotice}
          </span>
        </div>
      )}
    </>
  );
}
