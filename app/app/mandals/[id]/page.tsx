import { notFound } from "next/navigation";
import { HeaderHero } from "../../../components/HeaderHero";
import { MandalDetail } from "../../../components/MandalDetail";
import { mandals } from "../../../lib/data";

// Rendered on-demand (SSR). Pre-generating all ~640 mandal pages at build time
// pulls the 7 MB observation-series JSON into every render and overwhelms the
// build pod; on-demand rendering keeps the build fast and pages load per request.
//
// The static-export build (GitHub Pages, `npm run build:static`) has no server,
// so scripts/build-static.mjs rewrites this literal to "force-static" for that
// build only and generateStaticParams below emits every mandal page.
export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return mandals.map((m) => ({ id: m.id }));
}

export default async function MandalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mandal = mandals.find((m) => m.id === id);
  if (!mandal) notFound();

  return (
    <div className="pageWrap">
      <HeaderHero title="Mandal Insights" showChips={false} variant="compact" />
      <MandalDetail mandal={mandal} />
    </div>
  );
}
