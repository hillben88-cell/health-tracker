// /api/nutrition.js — Flexible nutrition lookup
// 1) Try API Ninjas (needs API_NINJAS_KEY in Vercel).
// 2) If no usable result, fall back to Open Food Facts (no key needed).

export default async function handler(req, res) {
  const q = (req.query.q || req.query.query || '').toString().trim();
  if (!q) return res.status(400).json({ error: 'Missing ?q=' });

  try {
    // 1) API Ninjas
    const ninjas = await fetchFromApiNinjas(q, process.env.API_NINJAS_KEY);
    if (ninjas && ninjas.kcal > 0) return res.status(200).json({ ...ninjas, source: 'api_ninjas' });

    // 2) Open Food Facts fallback (good for branded/supermarket items)
    const off = await fetchFromOpenFoodFacts(q);
    if (off && off.kcal > 0) return res.status(200).json({ ...off, source: 'open_food_facts' });

    // Fallback: nothing found
    return res.status(200).json({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, source: 'none' });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}

async function fetchFromApiNinjas(query, key) {
  if (!key) return null;
  const url = `https://api.api-ninjas.com/v1/nutrition?query=${encodeURIComponent(query)}`;
  const r = await fetch(url, { headers: { 'X-Api-Key': key } });
  if (!r.ok) return null;
  const items = await r.json();
  if (!Array.isArray(items) || items.length === 0) return null;

  const totals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  for (const it of items) {
    totals.kcal      += num(it.calories);
    totals.protein_g += num(it.protein_g);
    totals.carbs_g   += num(it.carbohydrates_total_g);
    totals.fat_g     += num(it.fat_total_g);
  }
  if (totals.kcal <= 0) return null;
  return totals;
}

async function fetchFromOpenFoodFacts(query) {
  // Search OFF for the product
  const searchUrl =
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5`;
  const r = await fetch(searchUrl, { headers: { 'User-Agent': 'HFT/1.0 (vercel)' } });
  if (!r.ok) return null;
  const data = await r.json();
  const products = Array.isArray(data?.products) ? data.products : [];
  if (products.length === 0) return null;

  // Pick the first product that has usable nutriments
  const p = products.find(hasNutriments) || products[0];
  if (!p || !hasNutriments(p)) return null;

  // kcal per 100g
  const nutr = p.nutriments || {};
  let kcalPer100 = num(nutr['energy-kcal_100g']);
  if (!kcalPer100) {
    const kjPer100 = num(nutr['energy_100g']); // sometimes kJ
    if (kjPer100) kcalPer100 = Math.round(kjPer100 / 4.184);
  }
  if (!kcalPer100) return null;

  // Decide a portion (grams)
  const portionG = portionFromQueryOrProduct(query, p) || 100;

  // Scale macros
  const factor = portionG / 100;
  return {
    kcal: Math.round(kcalPer100 * factor),
    protein_g: round2(num(nutr['proteins_100g']) * factor),
    carbs_g:   round2((num(nutr['carbohydrates_100g']) || num(nutr['carbohydrates_total_g'])) * factor),
    fat_g:     round2(num(nutr['fat_100g']) * factor),
  };
}

function portionFromQueryOrProduct(query, product) {
  // Try to read grams from the user query: e.g. "200g", "250 g"
  const m = query.match(/(\d+(?:\.\d+)?)\s*(g|gram|grams)\b/i);
  if (m) return parseFloat(m[1]);

  // Try serving_size like "2 samosas (100 g)" or "100 g"
  const ss = product.serving_size;
  if (typeof ss === 'string') {
    const mg = ss.match(/(\d+(?:\.\d+)?)\s*g/i);
    if (mg) return parseFloat(mg[1]);
  }

  // Try package quantity (some products have product_quantity in grams)
  if (product.product_quantity) {
    const q = parseFloat(product.product_quantity);
    if (!isNaN(q) && q > 0) return q;
  }

  // Try parsing the "quantity" string: e.g. "300 g", "3 x 60 g"
  if (product.quantity) {
    const q1 = product.quantity.match(/(\d+(?:\.\d+)?)\s*g/i);
    if (q1) return parseFloat(q1[1]);
    // Pattern like "3 x 60 g"
    const q2 = product.quantity.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*g/i);
    if (q2) return parseInt(q2[1], 10) * parseFloat(q2[2]);
  }

  return null; // default later to 100 g
}

function hasNutriments(p) {
  const n = p?.nutriments || {};
  return (
    n['energy-kcal_100g'] ||
    n['energy_100g'] ||
    n['proteins_100g'] ||
    n['carbohydrates_100g'] ||
    n['fat_100g']
  );
}

const num = (v) => (v ? Number(v) : 0);
const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
