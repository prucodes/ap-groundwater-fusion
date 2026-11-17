import { MovedTo } from "../../components/MovedTo";
import { prototypeNotice } from "../../lib/data";

/* Briefings and evidence packs: the weekly digest became the briefing, and the downloads (the
   evidence and model pack, the mandal CSV, the archive) moved to Data Readiness beside the
   sources and release gates they document, so the address now leads there. */
export default function MovedPage() {
  return <MovedTo href="/readiness/#exports" label="Data Readiness: downloads and evidence pack" notice={prototypeNotice} />;
}
