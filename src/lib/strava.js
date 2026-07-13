// Strava OAuth + API client. Talks to our /api/strava/* serverless functions
// so the client secret never reaches the browser.

const AUTH_KEY = "hft_strava_auth"; // { access_token, refresh_token, expires_at, athlete }
const STATE_VALUE = "hft_strava_oauth";
const SCOPE = "read,activity:read_all,profile:read_all";

export function getAuth() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY));
  } catch {
    return null;
  }
}

function setAuth(auth) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

export function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
}

export function isConnected() {
  return !!getAuth()?.refresh_token;
}

export function connect() {
  const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      "Missing VITE_STRAVA_CLIENT_ID. Set it in your deployment's environment variables."
    );
  }
  const redirectUri = `${window.location.origin}${window.location.pathname}`;
  const url = new URL("https://www.strava.com/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", STATE_VALUE);
  window.location.href = url.toString();
}

// Call once on app mount. If the URL contains a Strava OAuth redirect
// (?code=...&state=hft_strava_oauth), exchanges it for tokens and cleans the URL.
export async function handleOAuthRedirect() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");

  if (error) {
    window.history.replaceState({}, "", window.location.pathname);
    return { error };
  }
  if (!code || state !== STATE_VALUE) return null;

  window.history.replaceState({}, "", window.location.pathname);

  const r = await fetch("/api/strava/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "authorization_code", code }),
  });
  const data = await r.json();
  if (!r.ok) return { error: data?.error || "Failed to connect to Strava" };

  setAuth(data);
  return { connected: true, athlete: data.athlete };
}

async function refreshIfNeeded() {
  const auth = getAuth();
  if (!auth?.refresh_token) throw new Error("Not connected to Strava");

  const soon = Math.floor(Date.now() / 1000) + 60;
  if (auth.expires_at && auth.expires_at > soon) return auth;

  const r = await fetch("/api/strava/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "refresh_token", refresh_token: auth.refresh_token }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error || "Failed to refresh Strava token");

  const merged = { ...auth, ...data };
  setAuth(merged);
  return merged;
}

async function api(path, query = {}) {
  const auth = await refreshIfNeeded();
  const qs = new URLSearchParams({ path, ...query });
  const r = await fetch(`/api/strava/proxy?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${auth.access_token}` },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.message || data?.error || "Strava API error");
  return data;
}

export function fetchActivities({ perPage = 50, page = 1 } = {}) {
  return api("/athlete/activities", { per_page: perPage, page });
}

export function fetchAthlete() {
  return api("/athlete");
}

export function fetchZones() {
  return api("/athlete/zones");
}

export function fetchGear(gearId) {
  return api(`/gear/${gearId}`);
}

// Normalize a Strava activity summary into the app's shared exercise-record shape.
export function normalizeActivity(a) {
  return {
    id: `strava_${a.id}`,
    dateISO: (a.start_date_local || a.start_date || "").slice(0, 10),
    type: a.sport_type || a.type || "Other",
    timeMin: Math.round((a.moving_time || 0) / 60),
    distanceKm: a.distance ? Math.round((a.distance / 1000) * 100) / 100 : null,
    kcal: a.calories ? Math.round(a.calories) : a.kilojoules ? Math.round(a.kilojoules * 0.239) : 0,
    source: "strava",
    meta: {
      name: a.name,
      avgHr: a.average_heartrate || null,
      maxHr: a.max_heartrate || null,
      elevationGain: a.total_elevation_gain || null,
    },
  };
}
