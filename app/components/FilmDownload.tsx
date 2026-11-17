"use client";

import { basePath } from "../lib/data";
import { countEvent } from "../lib/visit-counter";
import { IconDownload } from "./icons";

/* A film as a file to forward. The copy that downloads is not the bare film the page
   plays: it carries the State's outline, each frame's date and what it shows, and the
   source, burned into every frame (phase3_levels/build_share_films.py), so it still says
   what it is once it has left the site. */
export function FilmDownload({ video, filename, event, title }: { video: string; filename: string; event: string; title: string }) {
  return (
    <a className="filmDownload" href={`${basePath}/${video.replace(/\.mp4$/, "-share.mp4")}`} download={filename} data-testid="film-download"
      aria-label="Download this film as a video, with the date and source on every frame" title="Download as video"
      onClick={() => countEvent(event, title)}>
      <IconDownload />
    </a>
  );
}
