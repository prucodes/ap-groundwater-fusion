import { HeaderHero } from "../../components/HeaderHero";
import { MandalDetail } from "../../components/MandalDetail";
import { mandals } from "../../lib/data";
import { brief } from "../../lib/pageBriefs";
import { wellsNow } from "../../lib/pageNow";

export default function MandalInsightsPage() {
  const first = mandals[0];
  return (
    <div className="pageWrap">
      <HeaderHero
        title="Mandal Insights"
        brief={brief("/mandals", wellsNow())}
        showChips={false}
        variant="compact"
      />
      <MandalDetail mandal={first} />
    </div>
  );
}
