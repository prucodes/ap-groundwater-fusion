import type { Metadata } from "next";
import Link from "next/link";
import { WeeklyFilmPlayer } from "../../components/film/WeeklyFilmPlayer";
import { IconArrowRight } from "../../components/icons";
import { filmSeconds, weeklyFilm } from "../../lib/weeklyFilm";
import styles from "./WeeklyFilmPage.module.css";

/* This week as a film of about a minute: the same figures as This Week and the digest,
   one to a scene, each with its source and date. The page plays it live; each deploy
   also records it to MP4 in three shapes for forwarding (scripts/render-weekly-film.mjs). */

export const metadata: Metadata = {
  title: "This Week in a Minute | AP Water Intelligence",
  description: "The week's water figures for Andhra Pradesh as a one-minute film: sensors, what moved, rain and reservoirs, the drought manual, the monsoon's recharge and next summer, each with its source and date.",
};

export default function WeeklyFilmPage() {
  const film = weeklyFilm();
  const seconds = Math.round(filmSeconds(film));
  return (
    <div className={`pageWrap ${styles.page}`}>
      <header className={styles.head}>
        <span className={styles.kicker}>Andhra Pradesh / Weekly water briefing · Prototype</span>
        <h1>This week in a minute</h1>
        <p>{film.title}. {film.scenes.length} figures in {seconds} seconds, each from the page that explains it.</p>
      </header>
      <WeeklyFilmPlayer film={film} />
      <details className={`foldMore ${styles.transcript}`} data-testid="film-transcript">
        <summary><span>What the film says</span><span>{film.scenes.length} figures, with source and date</span></summary>
        <ol>
          {film.scenes.map(scene => (
            <li key={scene.kind}>
              <p>{scene.text}</p>
              <small>{scene.source} · as of {scene.asOf}</small>
            </li>
          ))}
        </ol>
        <p className={styles.caveat}>{film.caveat}</p>
      </details>
      <nav className={styles.more} aria-label="The same week, in full">
        <Link href="/changes/">This Week, in full <IconArrowRight /></Link>
        <Link href="/digest/">One-page digest <IconArrowRight /></Link>
      </nav>
    </div>
  );
}
