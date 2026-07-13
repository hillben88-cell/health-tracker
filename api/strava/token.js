// /api/strava/token — exchanges an OAuth code or refresh token for Strava access tokens.
// Keeps STRAVA_CLIENT_SECRET server-side only; never expose it to the client.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Server missing STRAVA_CLIENT_ID/STRAVA_CLIENT_SECRET env vars' });
  }

  const body = req.body || {};
  const grantType = body.grant_type;

  const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret });
  if (grantType === 'authorization_code') {
    if (!body.code) return res.status(400).json({ error: 'Missing code' });
    params.set('grant_type', 'authorization_code');
    params.set('code', body.code);
  } else if (grantType === 'refresh_token') {
    if (!body.refresh_token) return res.status(400).json({ error: 'Missing refresh_token' });
    params.set('grant_type', 'refresh_token');
    params.set('refresh_token', body.refresh_token);
  } else {
    return res.status(400).json({ error: 'grant_type must be authorization_code or refresh_token' });
  }

  try {
    const r = await fetch('https://www.strava.com/oauth/token', { method: 'POST', body: params });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data });

    return res.status(200).json({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      athlete: data.athlete,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
