import ledger from "../data/forecast_ledger.json";
import { formatNumber } from "../lib/data";
import { IconActivity } from "./icons";

/* The forecasts the site actually published, frozen the week they went out and
 * scored when their month is measured (build_forecast_ledger.py). Unlike the
 * backtest, nothing here can be revised after the outcome is known. A verdict is
 * only stated once enough forecasts have been scored to mean something. */

type Block = { forecasts: number; maeM: number; biasM: number; bandCoveragePct: number | null;
  pairedForecasts?: number; noChangeMaeM?: number; gainPct?: number | null;
  origin?: string; expectedChangeM?: number | null; measuredChangeM?: number | null; yearAgoMinusMeasuredM?: number | null } | null;
/** The next month with enough forecasts to judge, read against the latest reading since their origin. */
type NextTest = { target: string; forecasts: number; issued: string | null; origin: string | null; latestMonth: string | null;
  expectedChangeM: number | null; soFarChangeM: number | null; yearAgoMinusLatestM: number | null } | null;
type Ledger = { weeksFrozen: number; firstIssued: string | null; lastIssued: string | null; forecastsTracked: number;
  scored: Block; byTarget: Record<string, NonNullable<Block>>; pendingByTarget: Record<string, number>; nextTest?: NextTest };

const MIN_TO_JUDGE = 100;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (period: string) => `${MONTHS[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
const month = (period: string) => MONTHS[Number(period.slice(5, 7)) - 1];
/** Metres below ground, so negative is the water table rising. */
const moved = (m: number) => Math.abs(m) < 0.05 ? "about where it was" : `${Math.abs(m).toFixed(1)} m ${m < 0 ? "nearer the surface" : "deeper"}`;
/* Each forecast leans partly on the same month a year earlier (build_forecast.py). Where
   that month stood a metre or more away from this year's reading, the lean is worth saying. */
const LEAN_M = 1;
function Lean({ target, gapM, against }: { target: string; gapM: number | null | undefined; against: string }) {
  if (gapM == null || Math.abs(gapM) < LEAN_M) return null;
  return <> Each forecast also leans partly on the same month a year earlier, and last {month(target)} the water table stood {moved(gapM)} than {against}: {gapM < 0 ? "in a drier year that lean pulls a forecast too shallow" : "in a wetter year that lean pulls a forecast too deep"}.</>;
}
const day = (iso: string | null) => iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";

/** The fold's one-line summary on Methodology: a verdict only once there is one to give. */
export function ledgerFoldNote() {
  const scored = (ledger as unknown as Ledger).scored?.forecasts ?? 0;
  return scored >= MIN_TO_JUDGE
    ? `Frozen calls against measured months: ${scored.toLocaleString("en-IN")} scored`
    : "Frozen calls and measured outcomes; still too few to judge";
}

export function ForecastLedger() {
  const data = ledger as unknown as Ledger;
  if (!data.forecastsTracked) return null;
  const scored = data.scored;
  const judged = scored !== null && scored.forecasts >= MIN_TO_JUDGE;
  // The earliest month with enough forecasts to judge; a few stale mandals with no
  // reading for an older month should not stand in for the next real test.
  const pending = Object.entries(data.pendingByTarget).sort((a, b) => a[0].localeCompare(b[0]));
  const next = pending.find(([, n]) => n >= MIN_TO_JUDGE) ?? pending.sort((a, b) => b[1] - a[1])[0];
  // The latest month judged on its own, for what its forecasts expected against what came.
  const lastJudged = Object.entries(data.byTarget ?? {}).filter(([, b]) => b.forecasts >= MIN_TO_JUDGE).sort((a, b) => b[0].localeCompare(a[0]))[0];
  const test = data.nextTest;
  return (
    <section className="card" id="forecast-ledger" aria-labelledby="forecast-ledger-title" data-testid="forecast-ledger">
      <div className="cardHead">
        <div className="cardTitle" id="forecast-ledger-title"><span className="titleIcon"><IconActivity /></span>The forecast track record</div>
        <span className="cardSub">published forecasts, frozen when issued, scored when measured</span>
      </div>
      <p className="cardLede">
        Every week the site&rsquo;s 3-month forecasts are written down as published and never changed. When a
        month&rsquo;s reading arrives, each forecast for that month is scored against it and against simply
        assuming no change. A backtest says how the method would have done; this says how the forecasts the site
        actually made did.
      </p>
      <div className="monsoonHeadline">
        <div className="monsoonStat"><span>Forecasts on record</span><strong>{data.forecastsTracked.toLocaleString("en-IN")}</strong><em>since {day(data.firstIssued)}, {data.weeksFrozen} weeks frozen</em></div>
        {judged ? (
          <>
            <div className="monsoonStat"><span>Average error</span><strong>{formatNumber(scored!.maeM)} m</strong><em>{scored!.forecasts.toLocaleString("en-IN")} forecasts scored</em></div>
            {scored!.noChangeMaeM != null ? <div className="monsoonStat"><span>Assuming no change</span><strong>{formatNumber(scored!.noChangeMaeM)} m</strong><em>{scored!.gainPct != null && scored!.gainPct >= 0 ? `forecast ${formatNumber(scored!.gainPct)}% better` : `forecast ${formatNumber(Math.abs(scored!.gainPct ?? 0))}% worse`}</em></div> : null}
            {scored!.bandCoveragePct != null ? <div className="monsoonStat"><span>Inside the 80% band</span><strong>{formatNumber(scored!.bandCoveragePct)}%</strong><em>of measured outcomes</em></div> : null}
          </>
        ) : (
          <div className="monsoonStat"><span>Scored so far</span><strong>{scored ? scored.forecasts : 0}</strong><em>too few to judge; a verdict needs {MIN_TO_JUDGE} or more</em></div>
        )}
        {next ? <div className="monsoonStat"><span>Next to be scored</span><strong>{next[1].toLocaleString("en-IN")}</strong><em>forecasts for {monthName(next[0])}, when that month&rsquo;s readings arrive</em></div> : null}
      </div>
      {judged && lastJudged && lastJudged[1].origin && lastJudged[1].expectedChangeM != null && lastJudged[1].measuredChangeM != null ? (
        <p className="cardNote" data-testid="forecast-ledger-expected">
          The forecasts for {monthName(lastJudged[0])} expected the median mandal&rsquo;s water table {moved(lastJudged[1].expectedChangeM)} than
          in {month(lastJudged[1].origin)}; it came {moved(lastJudged[1].measuredChangeM)}.
          <Lean target={lastJudged[0]} gapM={lastJudged[1].yearAgoMinusMeasuredM} against={`this ${month(lastJudged[0])}`} />
        </p>
      ) : !judged && test && test.origin && test.issued && test.expectedChangeM != null ? (
        <p className="cardNote" data-testid="forecast-ledger-next">
          The {test.forecasts.toLocaleString("en-IN")} forecasts for {monthName(test.target)} were frozen on {day(test.issued)} from {month(test.origin)}&rsquo;s
          readings. They expect the median mandal&rsquo;s water table {moved(test.expectedChangeM)} than in {month(test.origin)}
          {test.latestMonth && test.soFarChangeM != null ? <>; {month(test.latestMonth)}&rsquo;s readings had it {moved(test.soFarChangeM)}</> : null}.
          {test.latestMonth ? <Lean target={test.target} gapM={test.yearAgoMinusLatestM} against={`in ${month(test.latestMonth)} this year`} /> : null}
        </p>
      ) : null}
      <p className="cardNote">
        Each mandal is scored on its earliest forecast for a month, the longest lead and the hardest test. Each
        frozen week carries a SHA-256 fingerprint, and the weekly commit dates it, so the record cannot be
        rewritten. Latest frozen week: {day(data.lastIssued)}.
      </p>
    </section>
  );
}
