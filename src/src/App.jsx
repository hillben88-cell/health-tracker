import React, { useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Droplets, Apple, Dumbbell, Timer, Gauge, Activity, Flame, Calendar, Scale } from "lucide-react";

// ---------- Utility helpers ----------
// Baseline daily burn (BMR + light NEAT, excludes logged exercise)
const BASELINE_KCAL = 2244; // default; can be swapped to settings-driven if using the Settings build
const GREEN = "#16a34a"; // tailwind green-600
const YELLOW = "#facc15"; // yellow-400
const GRAY = "#6b7280";   // gray-500

const todayISO = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const toISO = (d) => new Date(d).toISOString().slice(0, 10);
const fmtLitres = (ml) => (ml / 1000).toFixed(2);
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

function saveLS(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function loadLS(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } }

// ---------- Minimal in-app nutrition lookup (offline) ----------
const MINI_DB = [
  { key: "roasted chicken breast", kcal: 165, p: 31, c: 0, f: 3.6, unit: "per 100g" },
  { key: "banana", kcal: 105, p: 1.3, c: 27, f: 0.3, unit: "per medium" },
  { key: "oat milk", kcal: 120, p: 3, c: 16, f: 5, unit: "per 250ml" },
  { key: "cooked rice", kcal: 206, p: 4.3, c: 45, f: 0.4, unit: "per cup" },
  { key: "avocado", kcal: 240, p: 3, c: 12.5, f: 22, unit: "per fruit" },
  { key: "egg", kcal: 78, p: 6, c: 0.6, f: 5, unit: "per egg" },
  { key: "olive oil tbsp", kcal: 119, p: 0, c: 0, f: 13.5, unit: "per tbsp" },
  { key: "protein bar", kcal: 200, p: 20, c: 20, f: 7, unit: "per bar" },
  { key: "greek yogurt 0%", kcal: 59, p: 10, c: 3.6, f: 0.4, unit: "per 100g" },
  { key: "pasta cooked", kcal: 220, p: 8, c: 43, f: 1.3, unit: "per cup" },
];

function estimateFood(description) {
  const d = description.toLowerCase().trim();
  const hit = MINI_DB.find((x) => d.includes(x.key));
  if (hit) {
    let qty = 1; const qtyMatch = d.match(/(\d+\.?\d*)/); if (qtyMatch) qty = parseFloat(qtyMatch[1]);
    const kcal = hit.kcal * qty;
    return { description, kcal, macros: { protein_g: hit.p * qty, carbs_g: hit.c * qty, fat_g: hit.f * qty }, source: `estimation (${hit.unit})` };
  }
  if (d.includes("chicken")) return { description, kcal: 250, macros: { protein_g: 40, carbs_g: 0, fat_g: 8 }, source: "estimate" };
  if (d.includes("beef")) return { description, kcal: 300, macros: { protein_g: 30, carbs_g: 0, fat_g: 20 }, source: "estimate" };
  if (d.includes("salad")) return { description, kcal: 180, macros: { protein_g: 6, carbs_g: 12, fat_g: 10 }, source: "estimate" };
  if (d.includes("sandwich")) return { description, kcal: 350, macros: { protein_g: 15, carbs_g: 40, fat_g: 12 }, source: "estimate" };
  return { description, kcal: 250, macros: { protein_g: 8, carbs_g: 30, fat_g: 10 }, source: "generic estimate" };
}

// ---------- Main App ----------
export default function App() {
  const [tab, setTab] = useState("summary");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [toast, setToast] = useState("");

  // Data stores
  const [water, setWater] = useState(() => loadLS("hft_water", [])); // {id,dateISO,amountMl}
  const [foods, setFoods] = useState(() => loadLS("hft_foods", [])); // {id,dateISO,desc,kcal,macros}
  const [exs, setExs] = useState(() => loadLS("hft_exs", [])); // {id,dateISO,type,timeMin,distanceKm,kcal}
  const [weights, setWeights] = useState(() => loadLS("hft_weights", [])); // {id,dateISO,kg}

  useEffect(() => saveLS("hft_water", water), [water]);
  useEffect(() => saveLS("hft_foods", foods), [foods]);
  useEffect(() => saveLS("hft_exs", exs), [exs]);
  useEffect(() => saveLS("hft_weights", weights), [weights]);

  const [date, setDate] = useState(todayISO());

  // ---------- Aggregations ----------
  const dayWaterMl = useMemo(() => sum(water.filter((w) => w.dateISO === date).map((w) => w.amountMl)), [water, date]);
  const dayFood = useMemo(() => foods.filter((f) => f.dateISO === date), [foods, date]);
  const dayFoodKcal = useMemo(() => sum(dayFood.map((f) => f.kcal)), [dayFood]);
  const dayMacros = useMemo(() => ({ protein_g: sum(dayFood.map((f) => f.macros?.protein_g || 0)), carbs_g: sum(dayFood.map((f) => f.macros?.carbs_g || 0)), fat_g: sum(dayFood.map((f) => f.macros?.fat_g || 0)) }), [dayFood]);
  const dayEx = useMemo(() => exs.filter((e) => e.dateISO === date), [exs, date]);
  const dayExKcal = useMemo(() => sum(dayEx.map((e) => Number(e.kcal) || 0)), [dayEx]);
  const dayExTime = useMemo(() => sum(dayEx.map((e) => Number(e.timeMin) || 0)), [dayEx]);
  const netCalories = useMemo(() => dayFoodKcal - (BASELINE_KCAL + dayExKcal), [dayFoodKcal, dayExKcal]);
  const dayWeights = useMemo(() => weights.filter((w) => w.dateISO === date).map(w => w.kg), [weights, date]);

  // ---------- Add Handlers ----------
  function showEntered() { setToast("entered"); setTimeout(() => setToast(""), 1400); }

  function addWater(amountMl, d = date) { if (!amountMl) return; setWater((prev) => [...prev, { id: uuidv4(), dateISO: d, amountMl: Number(amountMl) }]); showEntered(); }
  function addFood(desc, d = date) { if (!desc?.trim()) return; const est = estimateFood(desc); const rec = { id: uuidv4(), dateISO: d, desc: desc.trim(), kcal: Math.round(est.kcal), macros: est.macros, source: est.source }; setFoods((prev) => [rec, ...prev]); showEntered(); }
  function addExercise({ type, timeMin, distanceKm, kcal }, d = date) { if (!type || !timeMin) return; setExs((prev) => [{ id: uuidv4(), dateISO: d, type, timeMin: Number(timeMin), distanceKm: distanceKm ? Number(distanceKm) : null, kcal: kcal ? Number(kcal) : 0 }, ...prev]); showEntered(); }
  function addWeight(kg, d = date) { if (!kg) return; setWeights(prev => [{ id: uuidv4(), dateISO: d, kg: Number(kg) }, ...prev]); showEntered(); }

  function deleteEntry(kind, id) {
    if (kind === "water") setWater((prev) => prev.filter((x) => x.id !== id));
    if (kind === "food") setFoods((prev) => prev.filter((x) => x.id !== id));
    if (kind === "ex") setExs((prev) => prev.filter((x) => x.id !== id));
    if (kind === "weight") setWeights((prev) => prev.filter((x) => x.id !== id));
  }

  // ---------- Trends Data ----------
  function lastNDays(n) { const arr = []; for (let i = n - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); arr.push(toISO(d)); } return arr; }

  // returns array of {date: MM-DD, weight: number|null} carrying forward last known weight for a smooth line
  function weightSeries(days) {
    let last = null;
    return days.map((d) => {
      const entries = weights.filter(w => w.dateISO === d).map(w => w.kg);
      if (entries.length > 0) last = entries[0]; // take most recent of that day
      return { date: d.slice(5), weight: last };
    });
  }

  function aggregate(days) {
    return days.map((d) => {
      const waterMl = sum(water.filter((w) => w.dateISO === d).map((w) => w.amountMl));
      const foodsK = sum(foods.filter((f) => f.dateISO === d).map((f) => f.kcal));
      const exK = sum(exs.filter((e) => e.dateISO === d).map((e) => Number(e.kcal) || 0));
      const exTime = sum(exs.filter((e) => e.dateISO === d).map((e) => Number(e.timeMin) || 0));
      return { date: d.slice(5), waterL: Number(fmtLitres(waterMl)), foodKcal: foodsK, netKcal: foodsK - (BASELINE_KCAL + exK), exMin: exTime };
    });
  }

  const days7 = useMemo(() => lastNDays(7), []);
  const days30 = useMemo(() => lastNDays(30), []);
  const weekData = useMemo(() => aggregate(days7), [water, foods, exs]);
  const monthData = useMemo(() => aggregate(days30), [water, foods, exs]);
  const weekWeight = useMemo(() => weightSeries(days7), [weights]);
  const monthWeight = useMemo(() => weightSeries(days30), [weights]);

  // ---------- UI Components ----------
  const TitleBar = ({ title }) => (
    <div className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-100">
      <div className="mx-auto max-w-md px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg md:text-xl font-semibold" style={{ color: GREEN }}>{title}</h1>
        {/* Desktop date */}
        <div className="hidden sm:flex items-center text-xs text-gray-500">{date}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="ml-3 rounded-xl border border-gray-200 px-2 py-1 text-gray-700" />
        </div>
        {/* Mobile date btn */}
        <button className="sm:hidden inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 text-gray-700" onClick={() => setShowDatePicker((v) => !v)} aria-label="Pick date">
          <Calendar size={16} />
          <span className="text-xs">{date}</span>
        </button>
      </div>
      {showDatePicker && (
        <div className="sm:hidden absolute right-3 top-14 bg-white border border-gray-200 rounded-xl shadow-lg p-3">
          <input autoFocus type="date" value={date} onChange={(e) => { setDate(e.target.value); setShowDatePicker(false); }} className="rounded-xl border border-gray-200 px-3 py-2 text-gray-700" />
        </div>
      )}
    </div>
  );

  const Card = ({ title, icon, children, right }) => (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">{icon}<h3 className="text-base font-semibold text-gray-800">{title}</h3></div>
        {right}
      </div>
      {children}
    </div>
  );

  const Stat = ({ label, value, sub }) => (
    <div className="rounded-2xl bg-gray-50 p-4 flex-1 min-w-[120px]">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-semibold text-gray-900">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );

  const BottomTab = ({ id, label, icon }) => (
    <button onClick={() => setTab(id)} className={`flex-1 py-2 flex flex-col items-center justify-center text-xs ${tab===id?"text-green-600":"text-gray-500"}`}>
      {icon}
      <span className="mt-1">{label}</span>
    </button>
  );

  // ---------- Uncontrolled refs (avoid focus loss) ----------
  const waterRef = React.useRef(null);
  const foodRef = React.useRef(null);
  const exTypeRef = React.useRef(null);
  const exTimeRef = React.useRef(null);
  const exDistRef = React.useRef(null);
  const exKcalRef = React.useRef(null);
  const weightRef = React.useRef(null);

  function submitWater(){ const val = Number(waterRef.current?.value || 0); if(val>0){ addWater(val); waterRef.current.value = 500; showEntered(); } }
  function submitFood(){ const txt = (foodRef.current?.value || "").trim(); if(txt){ addFood(txt); foodRef.current.value = ""; showEntered(); } }
  function submitExercise(){ const payload = { type: exTypeRef.current?.value || "Run", timeMin: exTimeRef.current?.value || "", distanceKm: exDistRef.current?.value || "", kcal: exKcalRef.current?.value || "" }; if(payload.timeMin){ addExercise(payload); exTypeRef.current.value = "Run"; exTimeRef.current.value = ""; exDistRef.current.value = ""; exKcalRef.current.value = ""; showEntered(); } }
  function submitWeight(){ const kg = Number(weightRef.current?.value || 0); if(kg>0){ addWeight(kg); weightRef.current.value = ""; showEntered(); } }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <TitleBar title="HEALTH & FITNESS TRACKER" />

      <div className="mx-auto max-w-md px-4 py-4 space-y-4">
        {/* Summary */}
        <div className={tab!=="summary"?"hidden":"block"}>
          <div className="grid gap-4">
            <Card title="Today's Water" icon={<Droplets size={18} color={GREEN} />} right={<span className="text-sm text-gray-500">{fmtLitres(dayWaterMl)} L</span>}>
              <div className="flex gap-3"><Stat label="Water" value={`${fmtLitres(dayWaterMl)} L`} sub="sum of entries" /></div>
            </Card>
            <Card title="Today's Calories" icon={<Flame size={18} color={GREEN} />}>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Food" value={`${dayFoodKcal} kcal`} />
                <Stat label="Exercise" value={`${dayExKcal} kcal`} />
                <Stat label="Baseline" value={`${BASELINE_KCAL} kcal`} sub="BMR + light NEAT" />
                <Stat label="Net" value={`${netCalories} kcal`} sub="food - (baseline + exercise)" />
                <div className="rounded-2xl bg-gray-50 p-4 col-span-2">
                  <div className="text-xs text-gray-500">Macros</div>
                  <div className="text-sm text-gray-800 mt-1">P {Math.round(dayMacros.protein_g)} g · C {Math.round(dayMacros.carbs_g)} g · F {Math.round(dayMacros.fat_g)} g</div>
                </div>
              </div>
            </Card>
            <Card title="Today's Exercise" icon={<Activity size={18} color={GREEN} />}>
              <div className="flex flex-col gap-2">
                <div className="text-sm text-gray-600">Total time: <span className="font-medium text-gray-900">{dayExTime} min</span></div>
                {dayEx.length === 0 && <div className="text-sm text-gray-400">No sessions logged yet.</div>}
                {dayEx.map((e) => (
                  <div key={e.id} className="flex justify-between items-center bg-gray-50 rounded-xl px-3 py-2">
                    <div className="text-sm text-gray-800">{e.type}</div>
                    <div className="text-xs text-gray-500">{e.timeMin} min{e.distanceKm ? ` · ${e.distanceKm} km` : ""} · {e.kcal || 0} kcal</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>

        {/* Add */}
        <div className={tab!=="add"?"hidden":"block"}>
          <div className="grid gap-4">
            <Card title="Add Water" icon={<Droplets size={18} color={GREEN} />}>
              <div className="flex items-end gap-2">
                <div className="flex-1"><label className="text-xs text-gray-500">Amount (ml)</label><input ref={waterRef} defaultValue={500} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-3 text-base" type="number" min="0" /></div>
                <button onClick={submitWater} className="rounded-xl bg-green-600 text-white px-4 py-3 flex items-center gap-2"><Plus size={16}/> Enter</button>
              </div>
            </Card>
            <Card title="Add Food" icon={<Apple size={18} color={GREEN} />}>
              <label className="text-xs text-gray-500">Description (e.g., "1 banana", "one portion of roasted chicken breast")</label>
              <textarea ref={foodRef} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-3 h-24 text-base" placeholder="What did you eat?" />
              <div className="flex justify-between items-center mt-2"><div className="text-xs text-gray-500">Calories & macros are estimated automatically.</div><button onClick={submitFood} className="rounded-xl bg-green-600 text-white px-4 py-3 flex items-center gap-2"><Plus size={16}/> Enter</button></div>
            </Card>
            <Card title="Add Exercise" icon={<Dumbbell size={18} color={GREEN} />}>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-gray-500">Type</label><select ref={exTypeRef} defaultValue="Run" className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-3 text-base"><option>Run</option><option>Cycle</option><option>Swim</option><option>HIIT</option><option>Strength</option><option>Other</option></select></div>
                <div><label className="text-xs text-gray-500">Time (min)</label><input ref={exTimeRef} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-3 text-base" type="number" /></div>
                <div><label className="text-xs text-gray-500">Distance (km, if relevant)</label><input ref={exDistRef} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-3 text-base" type="number" /></div>
                <div><label className="text-xs text-gray-500">Calories burned (kcal)</label><input ref={exKcalRef} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-3 text-base" type="number" /></div>
              </div>
              <div className="flex justify-end mt-2"><button onClick={submitExercise} className="rounded-xl bg-green-600 text-white px-4 py-3 flex items-center gap-2"><Plus size={16}/> Enter</button></div>
            </Card>
            <Card title="Log Weight" icon={<Scale size={18} color={GREEN} />}>
              <div className="flex items-end gap-2">
                <div className="flex-1"><label className="text-xs text-gray-500">Weight (kg)</label><input ref={weightRef} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-3 text-base" type="number" step="0.1" placeholder="e.g., 99.4" /></div>
                <button onClick={submitWeight} className="rounded-xl bg-green-600 text-white px-4 py-3 flex items-center gap-2"><Plus size={16}/> Enter</button>
              </div>
              {dayWeights.length>0 && <div className="text-xs text-gray-500 mt-2">Today: {dayWeights[0]} kg</div>}
            </Card>
          </div>
        </div>

        {/* Trends */}
        <div className={tab!=="trends"?"hidden":"block"}>
          <div className="space-y-4">
            <Card title="Weekly Trends" icon={<Gauge size={18} color={GREEN} />}> 
              <div className="grid gap-4">
                <div className="h-56"><div className="text-xs text-gray-500 mb-1">Water (L)</div><ResponsiveContainer width="100%" height="100%"><BarChart data={weekData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip /><Bar dataKey="waterL" fill={GREEN} radius={[8,8,0,0]} /></BarChart></ResponsiveContainer></div>
                <div className="h-56"><div className="text-xs text-gray-500 mb-1">Calories: Food vs Net</div><ResponsiveContainer width="100%" height="100%"><LineChart data={weekData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip /><Legend /><Line type="monotone" dataKey="foodKcal" stroke={GREEN} strokeWidth={2} dot={false} name="Food" /><Line type="monotone" dataKey="netKcal" stroke={YELLOW} strokeWidth={2} dot={false} name="Net" /></LineChart></ResponsiveContainer></div>
                <div className="h-56"><div className="text-xs text-gray-500 mb-1">Exercise Time (min)</div><ResponsiveContainer width="100%" height="100%"><BarChart data={weekData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip /><Bar dataKey="exMin" fill={GRAY} radius={[8,8,0,0]} /></BarChart></ResponsiveContainer></div>
                <div className="h-56"><div className="text-xs text-gray-500 mb-1">Weight (kg)</div><ResponsiveContainer width="100%" height="100%"><LineChart data={weekWeight}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis domain={["auto","auto"]} /><Tooltip /><Line type="monotone" dataKey="weight" stroke={GREEN} strokeWidth={2} dot={true} name="Weight" /></LineChart></ResponsiveContainer></div>
              </div>
            </Card>
            <Card title="Monthly Trends" icon={<Timer size={18} color={GREEN} />}> 
              <div className="grid gap-4">
                <div className="h-56"><div className="text-xs text-gray-500 mb-1">Water (L)</div><ResponsiveContainer width="100%" height="100%"><BarChart data={monthData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip /><Bar dataKey="waterL" fill={GREEN} radius={[8,8,0,0]} /></BarChart></ResponsiveContainer></div>
                <div className="h-56"><div className="text-xs text-gray-500 mb-1">Calories: Food vs Net</div><ResponsiveContainer width="100%" height="100%"><LineChart data={monthData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip /><Legend /><Line type="monotone" dataKey="foodKcal" stroke={GREEN} strokeWidth={2} dot={false} name="Food" /><Line type="monotone" dataKey="netKcal" stroke={YELLOW} strokeWidth={2} dot={false} name="Net" /></LineChart></ResponsiveContainer></div>
                <div className="h-56"><div className="text-xs text-gray-500 mb-1">Exercise Time (min)</div><ResponsiveContainer width="100%" height="100%"><BarChart data={monthData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip /><Bar dataKey="exMin" fill={GRAY} radius={[8,8,0,0]} /></BarChart></ResponsiveContainer></div>
                <div className="h-56"><div className="text-xs text-gray-500 mb-1">Weight (kg)</div><ResponsiveContainer width="100%" height="100%"><LineChart data={monthWeight}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis domain={["auto","auto"]} /><Tooltip /><Line type="monotone" dataKey="weight" stroke={GREEN} strokeWidth={2} dot={false} name="Weight" /></LineChart></ResponsiveContainer></div>
              </div>
            </Card>
          </div>
        </div>

        {/* Raw Data */}
        <div className={tab!=="raw"?"hidden":"block"}>
          <div className="space-y-4">
            <Card title="Water Entries" icon={<Droplets size={18} color={GREEN} />}> 
              <div className="overflow-auto"><table className="min-w-full text-sm"><thead className="text-left text-gray-500"><tr><th className="py-2">Date</th><th>Amount (ml)</th><th></th></tr></thead><tbody>{water.length===0 && (<tr><td className="py-2 text-gray-400" colSpan={3}>No entries yet.</td></tr>)}{water.map((w)=>(<tr key={w.id} className="border-t border-gray-100"><td className="py-2">{w.dateISO}</td><td>{w.amountMl}</td><td className="text-right"><button onClick={()=>deleteEntry('water', w.id)} className="inline-flex items-center gap-1 text-red-600 hover:text-red-700"><Trash2 size={16}/>Delete</button></td></tr>))}</tbody></table></div>
            </Card>
            <Card title="Food Entries" icon={<Apple size={18} color={GREEN} />}> 
              <div className="overflow-auto"><table className="min-w-full text-sm"><thead className="text-left text-gray-500"><tr><th className="py-2">Date</th><th>Description</th><th>Kcal</th><th>Macros (P/C/F g)</th><th></th></tr></thead><tbody>{foods.length===0 && (<tr><td className="py-2 text-gray-400" colSpan={5}>No entries yet.</td></tr>)}{foods.map((f)=>(<tr key={f.id} className="border-t border-gray-100"><td className="py-2">{f.dateISO}</td><td>{f.desc}</td><td>{f.kcal}</td><td>{Math.round(f.macros.protein_g)}/{Math.round(f.macros.carbs_g)}/{Math.round(f.macros.fat_g)}</td><td className="text-right"><button onClick={()=>deleteEntry('food', f.id)} className="inline-flex items-center gap-1 text-red-600 hover:text-red-700"><Trash2 size={16}/>Delete</button></td></tr>))}</tbody></table></div>
            </Card>
            <Card title="Exercise Entries" icon={<Activity size={18} color={GREEN} />}> 
              <div className="overflow-auto"><table className="min-w-full text-sm"><thead className="text-left text-gray-500"><tr><th className="py-2">Date</th><th>Type</th><th>Time (min)</th><th>Distance (km)</th><th>Kcal</th><th></th></tr></thead><tbody>{exs.length===0 && (<tr><td className="py-2 text-gray-400" colSpan={6}>No entries yet.</td></tr>)}{exs.map((e)=>(<tr key={e.id} className="border-t border-gray-100"><td className="py-2">{e.dateISO}</td><td>{e.type}</td><td>{e.timeMin}</td><td>{e.distanceKm ?? '-'}</td><td>{e.kcal || 0}</td><td className="text-right"><button onClick={()=>deleteEntry('ex', e.id)} className="inline-flex items-center gap-1 text-red-600 hover:text-red-700"><Trash2 size={16}/>Delete</button></td></tr>))}</tbody></table></div>
            </Card>
            <Card title="Weight Entries" icon={<Scale size={18} color={GREEN} />}> 
              <div className="overflow-auto"><table className="min-w-full text-sm"><thead className="text-left text-gray-500"><tr><th className="py-2">Date</th><th>Weight (kg)</th><th></th></tr></thead><tbody>{weights.length===0 && (<tr><td className="py-2 text-gray-400" colSpan={3}>No entries yet.</td></tr>)}{weights.map((w)=>(<tr key={w.id} className="border-t border-gray-100"><td className="py-2">{w.dateISO}</td><td>{w.kg}</td><td className="text-right"><button onClick={()=>deleteEntry('weight', w.id)} className="inline-flex items-center gap-1 text-red-600 hover:text-red-700"><Trash2 size={16}/>Delete</button></td></tr>))}</tbody></table></div>
            </Card>
          </div>
        </div>
      </div>

      {/* Bottom Tab Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200">
        <div className="mx-auto max-w-md px-2 flex">
          <BottomTab id="summary" label="Summary" icon={<Activity size={18} color={tab==='summary'?GREEN:GRAY} />} />
          <BottomTab id="add" label="Add" icon={<Plus size={18} color={tab==='add'?GREEN:GRAY} />} />
          <BottomTab id="trends" label="Trends" icon={<Gauge size={18} color={tab==='trends'?GREEN:GRAY} />} />
          <BottomTab id="raw" label="Raw Data" icon={<Trash2 size={18} color={tab==='raw'?GREEN:GRAY} />} />
        </div>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (<motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed bottom-16 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-xl shadow-lg">entered</motion.div>)}
      </AnimatePresence>
    </div>
  );
}
