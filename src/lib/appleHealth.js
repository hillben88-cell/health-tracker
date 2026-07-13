// Streaming parser for an Apple Health "export.xml" file (from Health app ->
// profile -> Export All Health Data). These files are XML but can easily be
// hundreds of MB and hundreds of thousands of <Record/> elements, so we never
// load it into a DOM — instead we read it in chunks and regex-match
// self-closing <Record/> and <Workout .../> tags, aggregating as we go.

const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB

function parseAttrs(str) {
  const out = {};
  const re = /(\w+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(str))) out[m[1]] = m[2];
  return out;
}

function ensureDay(daily, d) {
  if (!daily[d]) {
    daily[d] = {
      steps: 0,
      distanceKm: 0,
      activeKcal: 0,
      basalKcal: 0,
      hrSum: 0,
      hrCount: 0,
      restingHr: null,
      weightKg: null,
      sleepHours: 0,
    };
  }
  return daily[d];
}

function processRecord(attrStr, daily) {
  const a = parseAttrs(attrStr);
  const type = a.type;
  if (!type) return;
  const dateStr = (a.startDate || a.endDate || "").slice(0, 10);
  if (!dateStr) return;
  const value = parseFloat(a.value);

  switch (type) {
    case "HKQuantityTypeIdentifierStepCount":
      ensureDay(daily, dateStr).steps += value || 0;
      break;
    case "HKQuantityTypeIdentifierDistanceWalkingRunning": {
      let km = value || 0;
      if (a.unit === "mi") km *= 1.60934;
      ensureDay(daily, dateStr).distanceKm += km;
      break;
    }
    case "HKQuantityTypeIdentifierActiveEnergyBurned":
      ensureDay(daily, dateStr).activeKcal += value || 0;
      break;
    case "HKQuantityTypeIdentifierBasalEnergyBurned":
      ensureDay(daily, dateStr).basalKcal += value || 0;
      break;
    case "HKQuantityTypeIdentifierHeartRate": {
      const day = ensureDay(daily, dateStr);
      day.hrSum += value || 0;
      day.hrCount += 1;
      break;
    }
    case "HKQuantityTypeIdentifierRestingHeartRate":
      if (value) ensureDay(daily, dateStr).restingHr = value;
      break;
    case "HKQuantityTypeIdentifierBodyMass": {
      let kg = value || 0;
      if (a.unit === "lb" || a.unit === "lbs") kg *= 0.453592;
      if (kg) ensureDay(daily, dateStr).weightKg = Math.round(kg * 10) / 10;
      break;
    }
    case "HKCategoryTypeIdentifierSleepAnalysis":
      if (a.value && a.value.includes("Asleep") && a.startDate && a.endDate) {
        const hours = (new Date(a.endDate) - new Date(a.startDate)) / 3600000;
        // Attribute sleep to the date it ended (i.e. the morning you woke up).
        const wakeDate = a.endDate.slice(0, 10);
        if (hours > 0 && hours < 24) ensureDay(daily, wakeDate).sleepHours += hours;
      }
      break;
    default:
      break;
  }
}

function normalizeWorkout(a) {
  let durationMin = parseFloat(a.duration) || 0;
  if (a.durationUnit === "sec") durationMin = durationMin / 60;
  let distanceKm = parseFloat(a.totalDistance) || 0;
  if (a.totalDistanceUnit === "mi") distanceKm *= 1.60934;
  let kcal = parseFloat(a.totalEnergyBurned) || 0;
  if (a.totalEnergyBurnedUnit === "kJ") kcal *= 0.239006;

  return {
    id: `applehealth_${a.startDate}_${a.workoutActivityType}`,
    dateISO: (a.startDate || "").slice(0, 10),
    type: (a.workoutActivityType || "Other").replace("HKWorkoutActivityType", ""),
    timeMin: Math.round(durationMin),
    distanceKm: distanceKm ? Math.round(distanceKm * 100) / 100 : null,
    kcal: Math.round(kcal),
    source: "apple_health",
  };
}

// onProgress(bytesRead, totalBytes) is called after each chunk so the UI can show a progress bar.
export async function parseAppleHealthExport(file, onProgress) {
  const total = file.size;
  let offset = 0;
  let carry = "";
  const daily = {};
  const workouts = [];

  const recordRe = /<Record\b([^>]*?)\/>/g;
  const workoutRe = /<Workout\b([^>]*?)(?:\/>|>)/g;

  while (offset < total) {
    const end = Math.min(offset + CHUNK_SIZE, total);
    const text = await file.slice(offset, end).text();
    offset = end;
    const buffer = carry + text;

    // Avoid splitting a tag across a chunk boundary: only process up to the
    // last complete '>' and carry the remainder into the next iteration.
    let safeEnd = buffer.length;
    if (offset < total) {
      const lastClose = buffer.lastIndexOf(">");
      safeEnd = lastClose >= 0 ? lastClose + 1 : 0;
    }
    const chunk = buffer.slice(0, safeEnd);
    carry = buffer.slice(safeEnd);

    recordRe.lastIndex = 0;
    let m;
    while ((m = recordRe.exec(chunk))) processRecord(m[1], daily);

    workoutRe.lastIndex = 0;
    while ((m = workoutRe.exec(chunk))) {
      const attrs = parseAttrs(m[1]);
      if (attrs.workoutActivityType) workouts.push(normalizeWorkout(attrs));
    }

    if (onProgress) onProgress(offset, total);
    // Yield to the event loop between chunks so the tab stays responsive.
    await new Promise((r) => setTimeout(r, 0));
  }

  // Round/finalize aggregates.
  const dailyOut = {};
  for (const [date, d] of Object.entries(daily)) {
    dailyOut[date] = {
      steps: Math.round(d.steps),
      distanceKm: Math.round(d.distanceKm * 100) / 100,
      activeKcal: Math.round(d.activeKcal),
      basalKcal: Math.round(d.basalKcal),
      avgHr: d.hrCount ? Math.round(d.hrSum / d.hrCount) : null,
      restingHr: d.restingHr,
      weightKg: d.weightKg,
      sleepHours: Math.round(d.sleepHours * 10) / 10,
    };
  }

  return { daily: dailyOut, workouts };
}
