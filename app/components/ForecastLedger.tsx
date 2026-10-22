import ledger from "../data/forecast_ledger.json";
import { formatNumber } from "../lib/data";
import { IconActivity } from "./icons";

/* The forecasts the site actually published, frozen the week they went out and
 * scored when their month is measured (build_forecast_ledger.py). Unlike the
 * backtest, nothing here can be revised after the outcome is known. A verdict is
 * only stated once enough forecasts have been scored to mean something. */

type Block = { forecasts: number; maeM: number; biasM: number; bandCoveragePct: number | null;
  pairedForecasts?: number; noChangeMaeM?: number; gainPct?: number | null } | null;
type Ledger = { weeksFrozen: number; firstIssued: string | null; lastIssued: string | null; forecastsTracked: number;
  scored: Block; pendingByTarget: Record<string, number> };

const MIN_TO_JUDGE = 100;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (period: string) => `${MONTHS[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
const day = (iso: string | null) => iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";

export function ForecastLedger() {
  const data = ledger as unknown as Ledger;
  if (!data.forecastsTracked) return null;
  const scored = data.scored;
  const judged = scored !== null && scored.forecasts >= MIN_TO_JUDGE;
  // The earliest month with enough forecasts to judge; a few stale mandals with no
  // reading for an older month should not stand in for the next real test.
  const pending = Object.entries(data.pendingByTarget).sort((a, b) => a[0].localeCompare(b[0]));
  const next = pending.find(([, n]) => n >= MIN_TO_JUDGE) ?? pending.sort((a, b) => b[1] - a[1])[0];
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
      <p className="cardNote">
        Each mandal is scored on its earliest forecast for a month, the longest lead and the hardest test. Each
        frozen week carries a SHA-256 fingerprint, and the weekly commit dates it, so the record cannot be
        rewritten. Latest frozen week: {day(data.lastIssued)}.
      </p>
    </section>
  );
}
