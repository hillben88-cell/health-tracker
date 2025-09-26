// /api/nutrition.js  (Vercel Function using API Ninjas)
export default async function handler(req, res) {
  const q = req.query.q || req.query.query;
  if (!q) return res.status(400).json({ error: 'Missing ?q=' });

  const KEY = process.env.API_NINJAS_KEY;
  if (!KEY) return res.status(500).json({ error: 'Missing API_NINJAS_KEY env var' });

  try {
    const url = `https://api.api-ninjas.com/v1/nutrition?query=${encodeURIComponent(q)}`;
    const apiRes = await fetch(url, { headers: { 'X-Api-Key': KEY } });
    if (!apiRes.ok) throw new Error(`Upstream ${apiRes.status}: ${await apiRes.text()}`);
    const items = await apiRes.json();

    const totals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, items: Array.isArray(items) ? items : [] };
    for (const it of totals.items) {
      totals.kcal      += Number(it.calories || 0);
      totals.protein_g += Number(it.protein_g || 0);
      totals.carbs_g   += Number(it.carbohydrates_total_g || 0);
      totals.fat_g     += Number(it.fat_total_g || 0);
    }
    res.status(200).json(totals);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
