import { HeaderHero } from "../../components/HeaderHero";
import { MandalDetail } from "../../components/MandalDetail";
import { mandals } from "../../lib/data";

export default function MandalInsightsPage() {
  const first = mandals[0];
  return (
    <div className="pageWrap">
      <HeaderHero
        title="Mandal Insights"
        subtitle={
          <>
            Per-mandal fusion of <strong>real APWRIMS readings (2014-2026)</strong> and{" "}
            <strong>NASA/NDMC GRACE-DA satellite-model signals</strong>. Select a mandal to inspect.
          </>
        }
        showChips={false}
        variant="compact"
      />
      <MandalDetail mandal={first} />
    </div>
  );
}
