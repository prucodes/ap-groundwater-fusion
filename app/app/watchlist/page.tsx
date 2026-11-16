import { MovedTo } from "../../components/MovedTo";
import { prototypeNotice } from "../../lib/data";
export default function MovedPage() {
  return <MovedTo href="/changes/#field-teams" label="This Week’s field-team register" notice={prototypeNotice} />;
}
