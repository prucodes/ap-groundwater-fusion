import { MovedTo } from "../../components/MovedTo";
import { prototypeNotice } from "../../lib/data";
export default function MovedPage() {
  return <MovedTo href="/digest/" label="Weekly digest" notice={prototypeNotice} />;
}
