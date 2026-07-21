import { notFound } from "next/navigation";
import { HeaderHero } from "../../../components/HeaderHero";
import { MandalDetail } from "../../../components/MandalDetail";
import { mandals } from "../../../lib/data";

// Rendered on-demand (SSR). Pre-generating all ~640 mandal pages at build time
// pulls the 7 MB observation-series JSON into every render and overwhelms the
// build pod; on-demand rendering keeps the build fast and pages load per request.
export const dynamic = "force-dynamic";

export default async function MandalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mandal = mandals.find((m) => m.id === id);
  if (!mandal) notFound();

  return (
    <div className="pageWrap">
      <HeaderHero title="Mandal Insights" showChips={false} />
      <MandalDetail mandal={mandal} />
    </div>
  );
}
