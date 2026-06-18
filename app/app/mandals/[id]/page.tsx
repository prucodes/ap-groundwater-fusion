import { notFound } from "next/navigation";
import { HeaderHero } from "../../../components/HeaderHero";
import { MandalDetail } from "../../../components/MandalDetail";
import { mandals } from "../../../lib/data";

export function generateStaticParams() {
  return mandals.map((m) => ({ id: m.id }));
}

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
