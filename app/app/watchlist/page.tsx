import { MovedTo } from "../../components/MovedTo";
import { prototypeNotice } from "../../lib/data";

/* The mandal watchlist was the first list of places whose evidence needed a field check. This
   Week's field-team register replaced it (four or more of six stress signals at once), so the
   address now leads there. */
export default function MovedPage() {
  return <MovedTo href="/changes/#field-teams" label="This Week’s field-team register" notice={prototypeNotice} />;
}
