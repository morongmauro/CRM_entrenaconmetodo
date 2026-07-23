// /api/coach-data.js
// Endpoints del dashboard de coach. Todos requieren Authorization: Bearer <token>
// donde el token viene de /api/coach-auth.
//
// GET  /api/coach-data?action=list                → lista resumida de TODOS los clientes
// GET  /api/coach-data?action=detail&user_id=...  → detalle completo de un cliente
// PATCH /api/coach-data?action=goals&user_id=...  → actualiza solo .goals dentro de .data
// PATCH /api/coach-data?action=mark_duplicate&user_id=...&duplicate_of=... → marca duplicado

import { verifyCoachToken } from './coach-auth.js';
import { checkOrigin } from './_guard.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// CORS: permite que el CRM (dominio en ALLOWED_ORIGINS) consuma esta API
// con su token de coach. La autenticación real sigue siendo el Bearer token.
function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin || !checkOrigin(req)) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function supaHeaders() {
  return {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
}

function isUuid(s) {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// Qué tan cerca quedó un día de la meta (0–100). Promedia la cercanía de
// kcal/P/C/G: cada desviación del 100% de la meta descuenta proporcionalmente
// (p.ej. quedar al 90% o al 110% de la meta = 90 puntos en ese macro).
// Devuelve null si el cliente no tiene metas configuradas.
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

// Meta VIGENTE en una fecha dada. goals_history = [{since:'YYYY-MM-DD',
// kcal,p,c,g}, ...] ordenado ascendente (lo escribe PATCH action=goals).
// Sin historial se usa la meta actual (comportamiento previo); fechas
// anteriores a la primera entrada usan la primera (era la que regía).
function goalsForDate(data, date) {
  const hist = Array.isArray(data.goals_history) ? data.goals_history : null;
  if (!hist || hist.length === 0) return data.goals || null;
  let g = null;
  for (const h of hist) {
    if (h.since <= date) g = h; else break;
  }
  return g || hist[0] || data.goals || null;
}

// Compute a quick summary for the list view from a client's `data` blob.
// Importante: el cliente puede aún no haber "cerrado" el día — el día actual
// vive en data.today + data.today_entries + data.today_totals. Lo reconstruimos
// dinámicamente para que el coach lo vea en TIEMPO REAL.
function summarize(row) {
  const data = row.data || {};
  const goals = data.goals || null;
  const baseHistory = data.history || {}; // { 'YYYY-MM-DD': { kcal, p, c, g, water } }
  const history = { ...baseHistory };

  // Fusionar el día actual del cliente (si lo mandó)
  if (data.today && data.today_totals) {
    history[data.today] = {
      kcal: data.today_totals.kcal || 0,
      p: data.today_totals.p || 0,
      c: data.today_totals.c || 0,
      g: data.today_totals.g || 0,
      water: data.today_water || 0,
    };
  }

  const dates = Object.keys(history).sort().reverse();
  const todayStr = data.today || new Date().toISOString().slice(0, 10);
  const todayInHistory = history[todayStr] || null;

  // Adherence últimos 7 días (incluyendo hoy si tiene comidas registradas)
  const last7Days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(todayStr + 'T00:00:00');
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    last7Days.push(key);
  }
  const adherence7 = last7Days.filter(d => history[d]).length;

  // Última fecha activa: si tiene entries de hoy, hoy es la última activa
  const lastActive = dates[0] || null;

  // Status (verde / amarillo / rojo)
  let status = 'inactive';
  if (lastActive) {
    const lastActiveDate = new Date(lastActive + 'T00:00:00');
    const daysSince = Math.floor((Date.now() - lastActiveDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince <= 1) status = 'active';
    else if (daysSince <= 3) status = 'recent';
    else if (daysSince <= 7) status = 'at_risk';
    else status = 'inactive';
  }

  // day_scores: últimos 45 días con registro → { 'YYYY-MM-DD': score|null }.
  // La presencia de la fecha significa "día registrado"; el score es la
  // cercanía a la meta ese día (null si no había metas). Lo usa el dashboard
  // para armar los rankings mensuales con balance semana a semana.
  const dayScores = {};
  {
    const cutoff = new Date(todayStr + 'T00:00:00');
    cutoff.setDate(cutoff.getDate() - 45);
    const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
    for (const date of Object.keys(history)) {
      if (date >= cutoffKey && date <= todayStr) {
        // Cada día se evalúa contra la meta que regía ESE día — cambiar la
        // meta hoy no reescribe el cumplimiento pasado.
        dayScores[date] = dayGoalScore(history[date], goalsForDate(data, date));
      }
    }
  }

  return {
    user_id: row.user_id,
    name: row.name || '(sin nombre)',
    updated_at: row.updated_at,
    last_active: lastActive,
    status,
    adherence_7d: adherence7,
    day_scores: dayScores,
    today: todayInHistory ? {
      kcal: todayInHistory.kcal || 0,
      p: todayInHistory.p || 0,
      c: todayInHistory.c || 0,
      g: todayInHistory.g || 0,
      water: todayInHistory.water || 0,
    } : null,
    goals,
    coach_notes: row.coach_notes || {},
  };
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Supabase env vars not configured' });
  }

  // Auth check
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const payload = verifyCoachToken(token);
  if (!payload) return res.status(401).json({ error: 'unauthorized' });

  const action = req.query.action;

  // LIST — resumen de TODOS los clientes
  if (req.method === 'GET' && action === 'list') {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/user_data?select=user_id,name,data,updated_at,coach_notes&order=updated_at.desc`,
        { headers: supaHeaders() }
      );
      const rows = await r.json();
      if (!Array.isArray(rows)) {
        return res.status(500).json({ error: 'supabase response invalid', detail: rows });
      }
      const summarized = rows.map(summarize);
      return res.status(200).json({ clients: summarized });
    } catch (e) {
      return res.status(500).json({ error: 'list failed', detail: String(e) });
    }
  }

  // DETAIL — todos los datos de un cliente, con el día actual fusionado en
  // history / historyDetail para que el coach vea EN TIEMPO REAL lo que el
  // cliente registró hoy (sin esperar a que el día se "cierre").
  if (req.method === 'GET' && action === 'detail') {
    const userId = req.query.user_id;
    if (!isUuid(userId)) return res.status(400).json({ error: 'invalid user_id' });
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/user_data?user_id=eq.${userId}&select=user_id,name,data,updated_at,coach_notes`,
        { headers: supaHeaders() }
      );
      const rows = await r.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(404).json({ error: 'client not found' });
      }
      const row = rows[0];
      const data = row.data || {};
      // Fusionar día actual en history + historyDetail
      if (data.today && data.today_totals) {
        data.history = {
          ...(data.history || {}),
          [data.today]: {
            kcal: data.today_totals.kcal || 0,
            p: data.today_totals.p || 0,
            c: data.today_totals.c || 0,
            g: data.today_totals.g || 0,
            water: data.today_water || 0,
          },
        };
      }
      if (data.today && Array.isArray(data.today_entries) && data.today_entries.length > 0) {
        data.historyDetail = {
          ...(data.historyDetail || {}),
          [data.today]: data.today_entries,
        };
      }
      return res.status(200).json({ client: { ...row, data } });
    } catch (e) {
      return res.status(500).json({ error: 'detail failed', detail: String(e) });
    }
  }

  // UPDATE GOALS — modifica solo .data.goals
  if (req.method === 'PATCH' && action === 'goals') {
    const userId = req.query.user_id;
    if (!isUuid(userId)) return res.status(400).json({ error: 'invalid user_id' });
    const { kcal, p, c, g } = req.body || {};
    const numericOk = [kcal, p, c, g].every(v => typeof v === 'number' && v >= 0 && v < 100000);
    if (!numericOk) return res.status(400).json({ error: 'invalid goals (must be numbers)' });

    try {
      // Read current data
      const r1 = await fetch(
        `${SUPABASE_URL}/rest/v1/user_data?user_id=eq.${userId}&select=data`,
        { headers: supaHeaders() }
      );
      const rows = await r1.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(404).json({ error: 'client not found' });
      }
      const currentData = rows[0].data || {};
      // goals_updated versiona la meta: la app del cliente la sondea para
      // aplicarla en vivo (con aviso en el chat), y /api/sync la usa para que
      // un push del cliente con metas viejas no pise esta meta nueva.
      const goalsUpdated = { at: new Date().toISOString(), by: 'coach' };

      // TRAZABILIDAD DE METAS: cada cambio queda en goals_history con su
      // fecha de vigencia. Así el histórico del cliente SIEMPRE se evalúa
      // contra la meta que regía ESE día — cambiar la meta hoy no
      // distorsiona el cumplimiento de semanas pasadas. La primera vez se
      // ancla la meta previa como vigente "desde siempre" para que el
      // histórico viejo conserve su referencia.
      const hoyBogota = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
      let hist = Array.isArray(currentData.goals_history) ? currentData.goals_history.slice() : [];
      if (hist.length === 0 && currentData.goals) {
        hist.push({ since: '2000-01-01', ...currentData.goals });
      }
      // Ajustes repetidos el mismo día no acumulan ruido: se reemplaza la entrada de hoy
      hist = hist.filter(h => h.since !== hoyBogota);
      hist.push({ since: hoyBogota, kcal, p, c, g });
      hist.sort((a, b) => (a.since < b.since ? -1 : 1));

      const newData = { ...currentData, goals: { kcal, p, c, g }, goals_updated: goalsUpdated, goals_history: hist };

      // Write back
      const r2 = await fetch(
        `${SUPABASE_URL}/rest/v1/user_data?user_id=eq.${userId}`,
        {
          method: 'PATCH',
          headers: { ...supaHeaders(), 'Prefer': 'return=minimal' },
          body: JSON.stringify({ data: newData, updated_at: new Date().toISOString() }),
        }
      );
      if (!r2.ok) {
        const detail = await r2.text();
        return res.status(500).json({ error: 'goals update failed', detail });
      }
      return res.status(200).json({ ok: true, goals: { kcal, p, c, g } });
    } catch (e) {
      return res.status(500).json({ error: 'goals failed', detail: String(e) });
    }
  }

  // MARK DUPLICATE — etiqueta a un cliente como duplicado de otro
  if (req.method === 'PATCH' && action === 'mark_duplicate') {
    const userId = req.query.user_id;
    const duplicateOf = req.query.duplicate_of || null;
    if (!isUuid(userId)) return res.status(400).json({ error: 'invalid user_id' });
    if (duplicateOf && !isUuid(duplicateOf)) return res.status(400).json({ error: 'invalid duplicate_of' });

    try {
      const r1 = await fetch(
        `${SUPABASE_URL}/rest/v1/user_data?user_id=eq.${userId}&select=coach_notes`,
        { headers: supaHeaders() }
      );
      const rows = await r1.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(404).json({ error: 'client not found' });
      }
      const current = rows[0].coach_notes || {};
      const newNotes = { ...current };
      if (duplicateOf) newNotes.duplicate_of = duplicateOf;
      else delete newNotes.duplicate_of;

      const r2 = await fetch(
        `${SUPABASE_URL}/rest/v1/user_data?user_id=eq.${userId}`,
        {
          method: 'PATCH',
          headers: { ...supaHeaders(), 'Prefer': 'return=minimal' },
          body: JSON.stringify({ coach_notes: newNotes }),
        }
      );
      if (!r2.ok) {
        const detail = await r2.text();
        return res.status(500).json({ error: 'mark_duplicate failed', detail });
      }
      return res.status(200).json({ ok: true, coach_notes: newNotes });
    } catch (e) {
      return res.status(500).json({ error: 'mark_duplicate failed', detail: String(e) });
    }
  }

  return res.status(400).json({ error: 'unknown action' });
}
