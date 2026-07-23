// /api/ranking.js
// Datos PÚBLICOS del reto para la página /ranking (sin login).
//
// GET /api/ranking → {
//   challenge: { start, end, today },
//   clients: [{ name: "Diana M.", days: { "2026-07-09": 88, ... } }]
// }
//
// `days` cubre SOLO el período del reto: la fecha presente = ese día registró;
// el valor = % de cercanía a SU meta diaria (kcal + macros), o null si ese
// cliente no tiene meta configurada. Con eso la página calcula la adherencia
// diaria, semanal y del reto completo.
//
// Privacidad: NO requiere token porque solo expone lo mínimo para un tablero
// motivacional — nombre de pila + inicial del apellido y porcentajes.
// Nada de user_ids, calorías, gramos, historial ni metas.

import { guard } from './_guard.js';

// ── PERÍODO DEL RETO (lo edita el coach) ──────────────────────────────────
const CHALLENGE_START = '2026-07-09';
const CHALLENGE_END = '2026-08-09';
// Zona horaria para decidir qué día es "hoy" (los clientes están en LatAm;
// con UTC el tablero de "hoy" saltaría al día siguiente desde las 7 pm).
const TIMEZONE = 'America/Bogota';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Cercanía de un día a la meta (0–100) — misma fórmula del dashboard coach:
// promedia kcal/P/C/G; cada % de desvío de la meta descuenta proporcional.
function dayGoalScore(totals, goals) {
  if (!goals || !totals) return null;
  let sum = 0, n = 0;
  for (const key of ['kcal', 'p', 'c', 'g']) {
    const goal = Number(goals[key]);
    if (!goal || goal <= 0) continue;
    const val = Number(totals[key]) || 0;
    sum += Math.max(0, 1 - Math.abs(val - goal) / goal);
    n++;
  }
  return n === 0 ? null : Math.round((sum / n) * 100);
}

// days de una fila: { 'YYYY-MM-DD': score|null } SOLO dentro del reto.
// La fila viene del select con alias (goals/history/today/today_totals
// extraídos del JSONB), no con el blob `data` completo.
// Meta vigente en una fecha (misma lógica que coach-data.js): cada día del
// reto se evalúa contra la meta que regía ese día.
function goalsForDateRow(row, date) {
  const hist = Array.isArray(row.goals_history) ? row.goals_history : null;
  if (!hist || hist.length === 0) return row.goals || null;
  let g = null;
  for (const h of hist) { if (h.since <= date) g = h; else break; }
  return g || hist[0] || row.goals || null;
}

function rowChallengeDays(row, todayStr) {
  const goals = row.goals || null;
  const history = { ...(row.history || {}) };
  // El día en curso del cliente aún no está "cerrado" en history — se fusiona
  // para que el tablero refleje EN TIEMPO REAL lo que registró hoy.
  if (row.today && row.today_totals) {
    history[row.today] = {
      kcal: row.today_totals.kcal || 0,
      p: row.today_totals.p || 0,
      c: row.today_totals.c || 0,
      g: row.today_totals.g || 0,
    };
  }
  const out = {};
  for (const date of Object.keys(history)) {
    if (date < CHALLENGE_START || date > CHALLENGE_END || date > todayStr) continue;
    const t = history[date] || {};
    // Un día en cero (solo abrió la app, registró agua, o el día se archivó
    // vacío) NO cuenta como "día registrado": sin este filtro, abrir la app
    // bastaba para sumar adherencia e incluso rankear en la pestaña "Hoy".
    const total = (Number(t.kcal) || 0) + (Number(t.p) || 0) + (Number(t.c) || 0) + (Number(t.g) || 0);
    if (total <= 0) continue;
    out[date] = dayGoalScore(t, goalsForDateRow(row, date));
  }
  return out;
}

const normalize = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// Fusiona filas del mismo cliente (varios dispositivos / duplicados por
// nombre), igual que el dashboard: unión de días quedándonos con el mejor
// score por fecha, y el nombre más completo.
function groupByName(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = normalize(row.name);
    if (!key) continue; // sin nombre no puede aparecer en un tablero público
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const result = [];
  for (const [, members] of groups) {
    const days = {};
    for (const m of members) {
      for (const [date, sc] of Object.entries(m._days)) {
        if (!(date in days) || (sc != null && (days[date] == null || sc > days[date]))) {
          days[date] = sc;
        }
      }
    }
    const bestName = members.reduce((acc, m) => ((m.name || '').length > (acc || '').length ? m.name : acc), '');
    result.push({ name: bestName, days });
  }
  return result;
}

// "Diana Morales" → "Diana M." (privacidad: la página es pública).
// `letters` = cuántas letras del apellido usar, para distinguir a dos
// clientes que colisionen ("Diana Morales" vs "Diana Martínez" →
// "Diana Mo." / "Diana Ma."). React además usa este nombre como key.
function publicName(fullName, letters = 1) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  if (parts.length === 1) return first;
  const sur = parts[1].charAt(0).toUpperCase() + parts[1].slice(1, letters);
  return `${first} ${sur}.`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Supabase env vars not configured' });
  }
  // Página pública: se permite sin Origin (apertura directa del link) y con
  // rate limit. El CDN de Vercel cachea 60s (ver Cache-Control abajo), así
  // que Supabase recibe como mucho ~1 consulta por minuto.
  if (!guard(req, res, { key: 'ranking', limit: 30, allowNoOrigin: true })) return;

  try {
    // 'en-CA' da el formato YYYY-MM-DD directamente
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });

    // Select con alias JSON (mismo patrón que api/sync.js): trae SOLO lo que
    // el ranking necesita. El blob `data` completo incluye historyDetail
    // (cada item de cada comida desde el registro), que crece sin límite —
    // bajarlo entero por cliente en cada consulta era un desperdicio enorme.
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/user_data?select=name,goals:data->goals,goals_history:data->goals_history,history:data->history,today:data->today,today_totals:data->today_totals`,
      { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const rows = await r.json();
    if (!Array.isArray(rows)) {
      return res.status(500).json({ error: 'supabase response invalid' });
    }
    for (const row of rows) row._days = rowChallengeDays(row, todayStr);
    const grouped = groupByName(rows)
      .filter(c => Object.keys(c.days).length > 0); // al menos un día registrado en el reto
    // Nombre público único por cliente: si "Diana Morales" y "Diana Martínez"
    // colisionan como "Diana M.", la segunda pasa a "Diana Ma." (y así). Sin
    // esto el tablero muestra dos escaladores indistinguibles y React recibe
    // keys duplicadas.
    const clients = [];
    for (const c of grouped) {
      let letters = 1;
      let name = publicName(c.name, letters);
      while (name && clients.some(x => x.name === name) && letters < 8) {
        letters++;
        name = publicName(c.name, letters);
      }
      if (name) clients.push({ name, days: c.days });
    }

    // CDN cache: la página puede sondear cada minuto sin castigar a Supabase.
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({
      challenge: { start: CHALLENGE_START, end: CHALLENGE_END, today: todayStr },
      clients,
    });
  } catch (e) {
    return res.status(500).json({ error: 'ranking failed', detail: String(e) });
  }
}
