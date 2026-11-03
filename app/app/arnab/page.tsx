import type { Metadata } from "next";
import { MovedTo } from "../../components/MovedTo";
import { prototypeNotice } from "../../lib/data";

/* The first address of the cyclone page, already sent to officials. It stays, and
   sends readers on to /cyclones/, keeping any section they were linked to. */
export const metadata: Metadata = {
  title: "Cyclones Arnab and Murasu | AP Water Intelligence",
  robots: { index: false },
};

export default function ArnabMoved() {
  return <MovedTo href="/cyclones/" label="Cyclones Arnab and Murasu" notice={prototypeNotice} />;
}
