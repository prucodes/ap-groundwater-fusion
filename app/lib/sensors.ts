import sensorsJson from "../data/gw_sensors.json";
import historyJson from "../data/gw_sensors_history.json";

/* The State's automatic water-level sensors, as fetch_apwrims_sensors.py reads
   them each day: every station's latest level beside the same station a year ago.
   Server code only (about 160 KB). */

export type SensorStation = [name: string, lat: number, lng: number, district: string, mandal: string, levelM: number,
  yearAgoM: number | null, hours: number | null, boundary: number | null];

export type Sensors = {
  fetchedAt: string; latestReading: string; source: string; url: string; activeHours: number;
  state: { stations: number; active: number; medianM: number; medianYearAgoM: number; deeperThanYearAgo: number;
    shallowerThanYearAgo: number; compared: number; mandalsReporting: number; mandalsDeeperThanYearAgo: number };
  mandals: Array<[boundary: number, stations: number, levelM: number, yearAgoM: number | null]>;
  stations: SensorStation[];
};

export const sensors = sensorsJson as unknown as Sensors;
export const sensorHistory = historyJson as unknown as { days: Array<[string, number, number, number, number, number]> };

/** A short summary the client cockpit can carry. */
export function sensorSummary() {
  const s = sensors.state;
  return {
    latest: sensors.latestReading, active: s.active, stations: s.stations, medianM: s.medianM, yearAgoM: s.medianYearAgoM,
    deeperPct: Math.round((100 * s.deeperThanYearAgo) / Math.max(s.compared, 1)),
  };
}
