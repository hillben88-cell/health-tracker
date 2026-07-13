// Import helpers for Garmin data exported by hand (there is no public consumer
// API). Supports the bulk "Export CSV" from the Garmin Connect activities
// list, and per-activity TCX/GPX file exports.

import Papa from "papaparse";

function findKey(row, candidates) {
  const keys = Object.keys(row);
  for (const cand of candidates) {
    const hit = keys.find((k) => k.trim().toLowerCase() === cand);
    if (hit) return hit;
  }
  // fall back to "contains"
  for (const cand of candidates) {
    const hit = keys.find((k) => k.trim().toLowerCase().includes(cand));
    if (hit) return hit;
  }
  return null;
}

function parseTimeToMinutes(str) {
  if (!str) return 0;
  const parts = String(str).trim().split(":").map(Number);
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return Number(str) || 0;
}

function parseDateToISO(str) {
  if (!str) return null;
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

// distanceUnit: 'km' | 'mi' — Garmin's CSV export doesn't embed the unit, it
// just reflects the account's display preference, so the caller must specify it.
export function parseGarminCSV(text, { distanceUnit = "km" } = {}) {
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (!data.length) return [];

  const sample = data[0];
  const dateKey = findKey(sample, ["date"]);
  const typeKey = findKey(sample, ["activity type"]);
  const titleKey = findKey(sample, ["title"]);
  const distKey = findKey(sample, ["distance"]);
  const calKey = findKey(sample, ["calories"]);
  const timeKey = findKey(sample, ["time"]);
  const avgHrKey = findKey(sample, ["avg hr"]);
  const maxHrKey = findKey(sample, ["max hr"]);

  return data
    .map((row, i) => {
      const dateISO = dateKey ? parseDateToISO(row[dateKey]) : null;
      if (!dateISO) return null;

      let distanceKm = distKey ? parseFloat(String(row[distKey]).replace(/,/g, "")) : null;
      if (distanceKm != null && !isNaN(distanceKm) && distanceUnit === "mi") distanceKm *= 1.60934;

      const kcal = calKey ? parseFloat(String(row[calKey]).replace(/,/g, "")) : 0;
      const timeMin = timeKey ? parseTimeToMinutes(row[timeKey]) : 0;

      return {
        id: `garmin_${dateISO}_${i}`,
        dateISO,
        type: typeKey ? row[typeKey] : "Other",
        timeMin: Math.round(timeMin),
        distanceKm: distanceKm && !isNaN(distanceKm) ? Math.round(distanceKm * 100) / 100 : null,
        kcal: kcal && !isNaN(kcal) ? Math.round(kcal) : 0,
        source: "garmin",
        meta: {
          title: titleKey ? row[titleKey] : null,
          avgHr: avgHrKey ? parseFloat(row[avgHrKey]) || null : null,
          maxHr: maxHrKey ? parseFloat(row[maxHrKey]) || null : null,
        },
      };
    })
    .filter(Boolean);
}

function num(el, selector) {
  const node = el?.querySelector(selector);
  return node ? parseFloat(node.textContent) : null;
}

export function parseTCX(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const activities = Array.from(doc.getElementsByTagName("Activity"));

  return activities.map((act, i) => {
    const sport = act.getAttribute("Sport") || "Other";
    const laps = Array.from(act.getElementsByTagName("Lap"));
    const idNode = act.querySelector("Id");
    const startISO = idNode?.textContent?.slice(0, 10) || null;

    let totalSec = 0,
      totalDist = 0,
      totalCal = 0,
      hrSum = 0,
      hrCount = 0,
      maxHr = 0;

    for (const lap of laps) {
      totalSec += num(lap, "TotalTimeSeconds") || 0;
      totalDist += num(lap, "DistanceMeters") || 0;
      totalCal += num(lap, "Calories") || 0;
      const avgHr = num(lap, "AverageHeartRateBpm > Value");
      if (avgHr) {
        hrSum += avgHr;
        hrCount += 1;
      }
      const lapMaxHr = num(lap, "MaximumHeartRateBpm > Value");
      if (lapMaxHr) maxHr = Math.max(maxHr, lapMaxHr);
    }

    return {
      id: `garmin_tcx_${startISO || i}_${i}`,
      dateISO: startISO,
      type: sport,
      timeMin: Math.round(totalSec / 60),
      distanceKm: totalDist ? Math.round((totalDist / 1000) * 100) / 100 : null,
      kcal: Math.round(totalCal),
      source: "garmin",
      meta: { avgHr: hrCount ? Math.round(hrSum / hrCount) : null, maxHr: maxHr || null },
    };
  });
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function parseGPX(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const tracks = Array.from(doc.getElementsByTagName("trk"));

  return tracks.map((trk, i) => {
    const name = trk.querySelector("name")?.textContent || "Activity";
    const points = Array.from(trk.getElementsByTagName("trkpt"));

    let distanceKm = 0;
    for (let j = 1; j < points.length; j++) {
      const a = points[j - 1],
        b = points[j];
      distanceKm += haversineKm(
        parseFloat(a.getAttribute("lat")),
        parseFloat(a.getAttribute("lon")),
        parseFloat(b.getAttribute("lat")),
        parseFloat(b.getAttribute("lon"))
      );
    }

    const times = points.map((p) => p.querySelector("time")?.textContent).filter(Boolean);
    const startISO = times[0]?.slice(0, 10) || null;
    const timeMin =
      times.length >= 2 ? (new Date(times[times.length - 1]) - new Date(times[0])) / 60000 : 0;

    return {
      id: `garmin_gpx_${startISO || i}_${i}`,
      dateISO: startISO,
      type: name,
      timeMin: Math.round(timeMin),
      distanceKm: distanceKm ? Math.round(distanceKm * 100) / 100 : null,
      kcal: 0,
      source: "garmin",
      meta: {},
    };
  });
}

export function parseGarminFile(filename, text, opts) {
  const ext = filename.split(".").pop().toLowerCase();
  if (ext === "csv") return parseGarminCSV(text, opts);
  if (ext === "tcx") return parseTCX(text);
  if (ext === "gpx") return parseGPX(text);
  throw new Error(`Unsupported file type: .${ext} (use CSV, TCX, or GPX)`);
}
