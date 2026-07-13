// Heuristic readiness check for IRONMAN Wales training, built from generic
// age-group full-distance coaching guidelines (NOT a certified personal
// plan). Compares trailing training volume against rough weekly-volume and
// longest-session benchmarks for the current phase of the build, and reduces
// that to a red/amber/green per discipline.

export const RACE = {
  name: "IRONMAN Wales",
  location: "Tenby, Pembrokeshire",
  dateISO: "2026-09-13",
  swimKm: 3.86,
  bikeKm: 180.2,
  runKm: 42.2,
};

const SWIM_TYPES = new Set(["Swim"]);
const BIKE_TYPES = new Set(["Ride", "VirtualRide", "EBikeRide", "Handcycle"]);
const RUN_TYPES = new Set(["Run", "TrailRun", "Treadmill"]);

const WEEKLY_WINDOW_DAYS = 28; // trailing 4 weeks for weekly-average volume/frequency
const LONG_SESSION_WINDOW_DAYS = 42; // trailing 6 weeks for longest-ride/run check

// { weeklyKm, weeklySessions/longKm } thresholds per phase per discipline.
// "amber" is the floor below which it becomes "red".
const THRESHOLDS = {
  base: {
    swim: { green: { km: 6, sessions: 2 }, amber: { km: 3, sessions: 1 } },
    bike: { green: { km: 120, long: 60 }, amber: { km: 70, long: 40 } },
    run: { green: { km: 25, long: 15 }, amber: { km: 15, long: 10 } },
  },
  build: {
    swim: { green: { km: 8, sessions: 2.5 }, amber: { km: 4, sessions: 1.5 } },
    bike: { green: { km: 180, long: 110 }, amber: { km: 110, long: 70 } },
    run: { green: { km: 35, long: 20 }, amber: { km: 22, long: 14 } },
  },
  peak: {
    swim: { green: { km: 8, sessions: 3 }, amber: { km: 4, sessions: 2 } },
    bike: { green: { km: 200, long: 140 }, amber: { km: 120, long: 80 } },
    run: { green: { km: 40, long: 25 }, amber: { km: 25, long: 18 } },
  },
  taper: {
    swim: { green: { km: 5, sessions: 2 }, amber: { km: 2, sessions: 1 } },
    bike: { green: { km: 100, long: 60 }, amber: { km: 50, long: 30 } },
    run: { green: { km: 20, long: 12 }, amber: { km: 10, long: 8 } },
  },
};

function phaseForWeeksOut(weeksToRace) {
  if (weeksToRace <= 2.5) return "taper";
  if (weeksToRace <= 10) return "peak";
  if (weeksToRace <= 16) return "build";
  return "base";
}

function statusFor(value, green, amber) {
  if (value >= green) return "green";
  if (value >= amber) return "amber";
  return "red";
}

const RANK = { red: 0, amber: 1, green: 2 };
function worst(...statuses) {
  return statuses.reduce((a, b) => (RANK[a] <= RANK[b] ? a : b));
}

function windowRecords(exs, days, endDate) {
  const start = new Date(endDate);
  start.setDate(start.getDate() - days);
  const startISO = start.toISOString().slice(0, 10);
  const endISO = endDate.toISOString().slice(0, 10);
  return exs.filter((e) => e.dateISO >= startISO && e.dateISO <= endISO);
}

function summarizeDiscipline(records, types) {
  const items = records.filter((r) => types.has(r.type));
  const km = items.reduce((s, r) => s + (r.distanceKm || 0), 0);
  const min = items.reduce((s, r) => s + (r.timeMin || 0), 0);
  const longestKm = items.reduce((m, r) => Math.max(m, r.distanceKm || 0), 0);
  return { sessions: items.length, km: Math.round(km * 10) / 10, min, longestKm: Math.round(longestKm * 10) / 10 };
}

// today: JS Date, defaults to now. exs: array of {dateISO, type, distanceKm, timeMin}.
export function computeIronmanProgress(exs, today = new Date()) {
  const raceDate = new Date(`${RACE.dateISO}T00:00:00`);
  const daysToRace = Math.ceil((raceDate - today) / 86400000);
  const weeksToRace = daysToRace / 7;
  const phase = daysToRace < 0 ? "post-race" : daysToRace <= 3 ? "race week" : phaseForWeeksOut(weeksToRace);

  const weeklyWindow = windowRecords(exs, WEEKLY_WINDOW_DAYS, today);
  const longWindow = windowRecords(exs, LONG_SESSION_WINDOW_DAYS, today);
  const weeks = WEEKLY_WINDOW_DAYS / 7;

  const swim4wk = summarizeDiscipline(weeklyWindow, SWIM_TYPES);
  const bike4wk = summarizeDiscipline(weeklyWindow, BIKE_TYPES);
  const run4wk = summarizeDiscipline(weeklyWindow, RUN_TYPES);
  const swim6wk = summarizeDiscipline(longWindow, SWIM_TYPES);
  const bike6wk = summarizeDiscipline(longWindow, BIKE_TYPES);
  const run6wk = summarizeDiscipline(longWindow, RUN_TYPES);

  const t = THRESHOLDS[phase] || THRESHOLDS.peak; // race week / post-race: reuse peak table just for display

  const swimStatus = worst(
    statusFor(swim4wk.km / weeks, t.swim.green.km, t.swim.amber.km),
    statusFor(swim4wk.sessions / weeks, t.swim.green.sessions, t.swim.amber.sessions)
  );
  const bikeStatus = worst(
    statusFor(bike4wk.km / weeks, t.bike.green.km, t.bike.amber.km),
    statusFor(bike6wk.longestKm, t.bike.green.long, t.bike.amber.long)
  );
  const runStatus = worst(
    statusFor(run4wk.km / weeks, t.run.green.km, t.run.amber.km),
    statusFor(run6wk.longestKm, t.run.green.long, t.run.amber.long)
  );

  const overall = phase === "post-race" ? null : worst(swimStatus, bikeStatus, runStatus);

  return {
    race: RACE,
    daysToRace,
    weeksToRace: Math.round(weeksToRace * 10) / 10,
    phase,
    overall,
    discipline: {
      swim: {
        status: swimStatus,
        weeklyKm: Math.round((swim4wk.km / weeks) * 10) / 10,
        weeklySessions: Math.round((swim4wk.sessions / weeks) * 10) / 10,
        targetGreen: t.swim.green,
        targetAmber: t.swim.amber,
      },
      bike: {
        status: bikeStatus,
        weeklyKm: Math.round(bike4wk.km / weeks),
        longestKm6wk: bike6wk.longestKm,
        targetGreen: t.bike.green,
        targetAmber: t.bike.amber,
      },
      run: {
        status: runStatus,
        weeklyKm: Math.round(run4wk.km / weeks),
        longestKm6wk: run6wk.longestKm,
        targetGreen: t.run.green,
        targetAmber: t.run.amber,
      },
    },
  };
}
