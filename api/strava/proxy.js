// /api/strava/proxy — forwards authenticated GET requests to Strava API v3.
// Keeps the browser from having to deal with Strava's CORS policy and keeps
// this a thin passthrough; the access token itself is supplied by the client
// (it is short-lived and safe to hold client-side) via the Authorization header.

const STRAVA_API = 'https://www.strava.com/api/v3';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Missing Authorization header' });

  const { path, ...rest } = req.query;
  if (!path || typeof path !== 'string' || !path.startsWith('/')) {
    return res.status(400).json({ error: 'Missing or invalid ?path=' });
  }

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(rest)) {
    if (Array.isArray(v)) v.forEach((val) => qs.append(k, val));
    else if (v != null) qs.append(k, v);
  }
  const url = `${STRAVA_API}${path}${qs.toString() ? `?${qs}` : ''}`;

  try {
    const r = await fetch(url, { headers: { Authorization: auth } });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
