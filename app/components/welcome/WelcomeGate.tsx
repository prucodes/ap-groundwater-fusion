"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CREATOR_CREDIT, CREATOR_NAME, OPENING_STORAGE_KEY, OPENING_STORAGE_VALUE, WELCOME_STORAGE_KEY, WELCOME_STORAGE_VALUE } from "../../lib/creator";
import { countEvent } from "../../lib/visit-counter";
import { Verse } from "../Verse";
import { VERSES } from "../../lib/verses";
import { WaterLandscape } from "./WaterLandscape";
import { WaterIntro } from "./WaterIntro";
import styles from "./Welcome.module.css";

const WelcomeContext = createContext<() => void>(() => {});
export const useWelcome = () => useContext(WelcomeContext);

function Arrow() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function WelcomeQuote({ paused, reduced, settled }: { paused: boolean; reduced: boolean; settled: boolean }) {
  const [visible, setVisible] = useState(true);
  const [held, setHeld] = useState(false);
  const [reading, setReading] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    update(); document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (paused || reduced || held || reading || !pageVisible) return;
    const timer = setTimeout(() => setVisible(false), 20_000);
    return () => clearTimeout(timer);
  }, [paused, reduced, held, reading, pageVisible]);
  // For tests that move the clock: the exported HTML already says data-visible,
  // but the hide timer exists only after hydration. Marked one render after the
  // gate has read the motion setting, so the timer above already reflects it.
  useEffect(() => { if (settled) setReady(true); }, [settled]);
  return <div className={styles.quote} data-testid="welcome-quote" data-visible={visible} data-ready={ready} onPointerEnter={() => setReading(true)} onPointerLeave={() => setReading(false)} onFocus={() => setReading(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setReading(false); }}>
    <div id="welcome-quote-text" className={styles.quoteSpace} aria-hidden={!visible}><div><Verse verse={VERSES.narada} className={styles.verse} /></div></div>
    <button type="button" className={styles.quoteToggle} aria-expanded={visible} aria-controls="welcome-quote-text" onClick={() => { setHeld(true); setVisible(value => !value); }}>{visible ? "Hide the quote" : "Read the quote"}</button>
  </div>;
}

// Pages people are likely to be sent, named as the sidebar names them.
const PAGE_NAMES: Record<string, string> = {
  brief: "Project brief", digest: "Weekly digest", reports: "Reports", "field-report": "Field report",
  changes: "This Week", arnab: "Cyclones Arnab, Murasu and Akvan", cyclones: "Cyclones Arnab, Murasu and Akvan", monsoon: "Monsoon Watch", drought: "Drought Watch", map: "Mandal Map",
  crystal: "Water Depth 3D", summer: "Summer Outlook", rabi: "Rabi Outlook", agriculture: "Agriculture & Water",
  districts: "Districts", constituencies: "Constituencies", mandals: "Mandal Insights", compare: "Compare",
  methodology: "Methodology", readiness: "Data Readiness", estimates: "Modelled Levels", nasa: "NASA Signals",
  climate: "Climate & Balance", scenario: "Scenario Lab", irrigation: "AWARE Preview", watchlist: "Watchlist",
};

/** A first-visit introduction. All routes and data remain public on static hosting. */
export function WelcomeGate({ children }: { children: React.ReactNode }) {
  // The home page asks for the creator's name. A shared link to any other page
  // shows the same introduction once, then opens that page with one tap.
  const route = (usePathname() ?? "/").split("/").filter(Boolean)[0] ?? "";
  const shared = route !== "";
  const destination = PAGE_NAMES[route] ?? "The page you opened";
  const [phase, setPhase] = useState<"checking" | "welcome" | "entering" | "open">("checking");
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState(false);
  const [hint, setHint] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [replay, setReplay] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusAfterEntry = useRef(false);
  // The opening: on a first visit the State fills with water in front of the welcome, then fades
  // to reveal it. Once per device, and only where that can be remembered; never with reduced motion.
  const [opening, setOpening] = useState<"none" | "playing" | "leaving">("none");
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A preview of the other way to use it: the living water as the welcome's own picture (?welcome=blend).
  const [blend, setBlend] = useState(false);

  useEffect(() => {
    let remembered = false, openingSeen = true;
    try {
      remembered = localStorage.getItem(WELCOME_STORAGE_KEY) === WELCOME_STORAGE_VALUE;
      openingSeen = localStorage.getItem(OPENING_STORAGE_KEY) === OPENING_STORAGE_VALUE;
    } catch { /* In-memory entry still works if storage is blocked; the opening, which could not be remembered, is left out. */ }
    setPhase(remembered ? "open" : "welcome");
    document.documentElement.dataset.apWelcome = remembered ? "open" : "welcome";
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const blended = new URLSearchParams(window.location.search).get("welcome") === "blend";
    setBlend(blended);
    if (!remembered && !openingSeen && !media.matches && !blended) setOpening("playing");
    else delete document.documentElement.dataset.apOpening;
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => {
      media.removeEventListener("change", update);
      if (timer.current) clearTimeout(timer.current);
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    };
  }, []);

  useEffect(() => {
    if (phase === "welcome") {
      countEvent("welcome/viewed", "Welcome: viewed the creator introduction");
      if (replay) document.getElementById("welcome-title")?.focus();
    }
    if (phase === "open") {
      countEvent("app/opened", "App: opened a workspace after the welcome");
      // Wait for the workspace to mount, rather than focusing its old entrance.
      if (focusAfterEntry.current) {
        document.querySelector<HTMLElement>("main.main")?.focus({ preventScroll: true });
        focusAfterEntry.current = false;
      }
      const anchor = window.location.hash.slice(1);
      if (anchor) {
        try { document.getElementById(decodeURIComponent(anchor))?.scrollIntoView(); } catch { /* Invalid fragment. */ }
      }
    }
  }, [phase, replay]);

  /** The opening fades and the welcome is there behind it. Remembered from here, so it plays once. */
  function leaveOpening() {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    try { localStorage.setItem(OPENING_STORAGE_KEY, OPENING_STORAGE_VALUE); } catch { /* Shown once where storage works. */ }
    delete document.documentElement.dataset.apOpening;
    setOpening("leaving");
    leaveTimer.current = setTimeout(() => setOpening("none"), 900);
  }

  /** Once the State is full, it holds a moment (a shorter one on a shared link), then fades. */
  function openingFilled() {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(leaveOpening, shared ? 350 : 1300);
  }

  function openWorkspace() {
    document.documentElement.dataset.apWelcome = "open";
    focusAfterEntry.current = true;
    setPhase("open");
    // The URL, query and hash have never changed, so a shared deep link still works.
  }

  function enter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phase === "entering") return;
    const value = phrase.trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
    if (value !== "pruthvi" && value !== "pruthvi yannam") {
      setError(true);
      input.current?.focus();
      return;
    }
    countEvent("welcome/entered", "Welcome: entered the observatory");
    setError(false);
    admit();
  }

  function continueToPage() {
    if (phase === "entering") return;
    countEvent("welcome/continued", "Welcome: continued to a shared page");
    admit();
  }

  function admit() {
    try { localStorage.setItem(WELCOME_STORAGE_KEY, WELCOME_STORAGE_VALUE); } catch { /* Entry does not depend on storage. */ }
    if (reduced || paused) openWorkspace();
    else {
      setPhase("entering");
      timer.current = setTimeout(openWorkspace, 650);
    }
  }

  function showWelcome() {
    setReplay(true);
    setPhrase("");
    setError(false);
    setPhase("welcome");
    document.documentElement.dataset.apWelcome = "welcome";
    countEvent("welcome/replayed", "Welcome: revisited the creator introduction");
    window.scrollTo(0, 0);
  }

  // While checking, the exported HTML carries both. A returning reader's page
  // paints at once (the bootstrap hides the entrance), a first visit sees the
  // entrance (CSS hides the page), and the page keeps its place so it never remounts.
  return (
    <WelcomeContext.Provider value={showWelcome}>
      {phase === "checking" || phase === "open" ? children : null}
      {phase === "open" ? null : (
        <div className={styles.welcome} data-testid="welcome" data-phase={phase} data-motion={paused || reduced ? "paused" : "running"} data-blend={blend ? "" : undefined} inert={opening === "playing" ? true : undefined}>
          <div className={styles.grain} aria-hidden="true" />
          <header className={styles.header}>
            <div className={styles.brand}>
              <span className={styles.brandMark}><svg viewBox="0 0 28 32" fill="none" aria-hidden="true"><path d="M14 2C9 9 3 15 3 21a11 11 0 0 0 22 0C25 15 19 9 14 2Z" stroke="currentColor" strokeWidth="1.3"/><path d="M5 20c4-4 7 4 11 0s6-1 8-1M6 25c4-3 7 3 11-1" stroke="currentColor" strokeWidth="1.2"/></svg></span>
              <span>AP WATER<span className={styles.brandSub}>INTELLIGENCE</span></span>
            </div>
            <div className={styles.headerRight}>
              <span className={styles.edition}>AN INDEPENDENT EXPLORATION</span>
              <button className={styles.motionButton} type="button" onClick={() => setPaused(!paused)} aria-pressed={paused || reduced} aria-label={paused || reduced ? "Resume atmosphere animation" : "Pause atmosphere animation"} disabled={reduced}>
                <span aria-hidden="true">{paused || reduced ? "▷" : "Ⅱ"}</span> Motion {paused || reduced ? "off" : "on"}
              </button>
            </div>
          </header>

          <div className={styles.content} role="main">
            <section className={styles.story} aria-labelledby="welcome-title">
              <p className={styles.eyebrow}><span /> ANDHRA PRADESH · INDIA</p>
              <h1 id="welcome-title" tabIndex={-1}>Every drop<br />has a <em>deeper</em><br />story.</h1>
              <p className={styles.description}><strong>From the monsoon above to the water beneath.</strong>Groundwater intelligence for Andhra Pradesh: the State&rsquo;s sensors read every day, satellites watching from orbit, measured water levels and modelled outlooks, and the rainfall and crops around them.</p>
              <div className={styles.creator}>
                <div><span className={styles.creatorLabel}>AN EXPLORATION BY</span><span className={styles.creatorName}>{CREATOR_NAME}<span className={styles.creatorSignature} aria-hidden="true">py.</span></span></div>
              </div>
              {shared ? !replay && (
                <div className={styles.form}>
                  <div className={styles.formHeading}><p>A small introduction, shown once.</p></div>
                  <div className={styles.inputRow}>
                    <span className={styles.destination}>{destination}</span>
                    <button type="button" onClick={continueToPage} disabled={phase === "checking" || phase === "entering"}><span>{phase === "entering" ? "Welcome in" : "Continue"}</span><Arrow /></button>
                  </div>
                  <div className={styles.formHelp}><span>A personal welcome to a public research project.</span></div>
                </div>
              ) : (
              <form className={styles.form} onSubmit={enter} aria-label="Enter the site">
                <div className={styles.formHeading}><label htmlFor="welcome-key">A small introduction. Your invitation in.</label></div>
                <div className={styles.inputRow} data-invalid={error}>
                  <input ref={input} id="welcome-key" type="text" value={phrase} onChange={event => { setPhrase(event.target.value); setError(false); }} placeholder="The creator’s first name" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={80} aria-describedby="welcome-help" aria-invalid={error} disabled={phase === "entering"} />
                  <button type="submit" disabled={phase === "checking" || phase === "entering"}><span>{phase === "entering" ? "Welcome in" : "Explore"}</span><Arrow /></button>
                </div>
                <div id="welcome-help" className={styles.formHelp} aria-live="polite">
                  {error ? <span className={styles.error}>Try PRUTHVI, the creator&rsquo;s first name.</span> : hint ? <span>Type <strong>PRUTHVI</strong>. We&rsquo;ll remember this introduction on this device.</span> : <><span>A personal welcome to a public research project.</span><button type="button" onClick={() => setHint(true)}>Need a hint?</button></>}
                </div>
              </form>
              )}
              {replay && <button className={styles.returnButton} type="button" onClick={openWorkspace}>Return to your workspace <Arrow /></button>}
              <noscript><p className={styles.noScript}>Enable JavaScript to open the site.</p></noscript>
            </section>

            <figure className={styles.landscape}>
              <WelcomeQuote paused={paused} reduced={reduced} settled={phase !== "checking"} />
              {blend ? <WaterIntro mode="figure" paused={paused || reduced} /> : <WaterLandscape />}
              {blend
                ? <figcaption><span className={styles.figureIndex}>FIG. 01</span> THE STATE, FILLED <span className={styles.figureNote}>Illustration · not measured data</span></figcaption>
                : <figcaption><span className={styles.figureIndex}>FIG. 01</span> BENEATH THE MONSOON <span className={styles.figureNote}>Illustrative landscape · not measured data</span></figcaption>}
            </figure>
          </div>

          <footer className={styles.footer}>
            <div className={styles.disciplines}><span>01 <b>Groundwater</b></span><span>02 <b>Monsoon</b></span><span>03 <b>Agriculture</b></span></div>
            <p>Independent research prototype<span>Measured evidence. Modelled possibilities.</span></p>
          </footer>
          <div className={styles.entryRipple} aria-hidden="true" />
          <span className={styles.srOnly}>{CREATOR_CREDIT}</span>
        </div>
      )}
      {phase !== "open" && opening !== "none" ? (
        <div className={styles.opening} data-state={opening} data-testid="welcome-opening">
          <WaterIntro mode="screen" copy={false} replayable={false} pace={shared ? 0.35 : 1} onDone={openingFilled} onSkip={leaveOpening} />
        </div>
      ) : null}
    </WelcomeContext.Provider>
  );
}
