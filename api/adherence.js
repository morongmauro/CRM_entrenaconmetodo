// /api/adherence.js
// Adherencia de ENTRENAMIENTO de la semana pasada, leída del CRM (misma
// fuente que authorize.js y payment-status.js: el Supabase del CRM). El coach
// registra cada semana en la tabla `seguimientos` cuántos días planeó y
// cuántos asistió el cliente; este endpoint se lo devuelve a la app para el
// tablero "Mi Semana". La parte de alimentación NO pasa por aquí: la app la
// calcula localmente con su propio historial (history + goals).
//
// La semana es la ISO anterior a la actual (formato YYYY-Www, igual que el
// CRM), calculada en hora de Colombia para que el cambio de semana no se
// adelante 5 horas por el UTC de Vercel (mismo motivo que en payment-status).
//
// GET /api/adherence?name=...   (o POST { name })
//   → { ok: true, semana, entreno: {
//        cerrado: true,  planeados, asistidos, dias: ['L','X',...]   // hay seguimiento
//     |  cerrado: false, plan: number|null                           // el coach aún no lo carga
//     } }
//   → { ok: false }  ante cliente desconocido, CRM sin configurar o error.
// Fail-safe: nunca rompe la app; sin datos el tablero simplemente muestra
// "tu coach aún no cierra la semana".

import { guard } from './_guard.js';

const CRM_URL = process.env.CRM_SUPABASE_URL;
const CRM_KEY = process.env.CRM_SUPABASE_SERVICE_KEY;

// Igual que en authorize.js: ignora mayúsculas, tildes y espacios de más.
const normalizeName = (str) => String(str || '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ').trim();

// Semana ISO (YYYY-Www) — mismo algoritmo que fmt.semanaISO del CRM.
function semanaISO(d) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Semana ISO ANTERIOR a la actual, con "hoy" en hora de Colombia.
function semanaPasadaBogota() {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' })
    .format(new Date()); // "YYYY-MM-DD"
  const [y, m, d] = ymd.split('-').map(Number);
  const hoy = new Date(Date.UTC(y, m - 1, d));
  const dow = (hoy.getUTCDay() + 6) % 7; // 0 = lunes
  const lunesPasado = new Date(hoy);
  lunesPasado.setUTCDate(hoy.getUTCDate() - dow - 7);
  return semanaISO(lunesPasado);
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'method not allowed' });
  }
  // GET solo lee; se permite sin Origin igual que payment-status y /api/sync.
  if (!guard(req, res, { key: 'adherence', limit: 40, allowNoOrigin: req.method === 'GET' })) return;

  if (!CRM_URL || !CRM_KEY) return res.status(200).json({ ok: false });

  const rawName = req.method === 'POST' ? req.body?.name : req.query.name;
  const normalized = normalizeName(rawName);
  if (!normalized) return res.status(200).json({ ok: false });

  const headers = { 'apikey': CRM_KEY, 'Authorization': `Bearer ${CRM_KEY}` };
  const semana = semanaPasadaBogota();

  try {
    // 1) Cliente en el CRM por nombre normalizado (mismo emparejamiento que
    //    authorize.js/payment-status.js).
    const rc = await fetch(
      `${CRM_URL}/rest/v1/clientes?select=id,nombre,dias_entreno_cantidad`,
      { headers }
    );
    if (!rc.ok) return res.status(200).json({ ok: false });
    const clientes = await rc.json();
    const cliente = Array.isArray(clientes)
      ? clientes.find(c => normalizeName(c.nombre) === normalized)
      : null;
    if (!cliente) return res.status(200).json({ ok: false });

    // 2) Seguimiento de la semana pasada. Ausencia de fila = el coach todavía
    //    no cerró la semana (o no hubo seguimiento); se devuelve el plan base
    //    del cliente para que la app pueda dar contexto sin inventar un 0%.
    const rs = await fetch(
      `${CRM_URL}/rest/v1/seguimientos?select=dias_planeados,dias_asistidos,dias_entrenados` +
      `&cliente_id=eq.${cliente.id}&semana=eq.${encodeURIComponent(semana)}&limit=1`,
      { headers }
    );
    const seguimientos = rs.ok ? await rs.json() : [];
    const seg = Array.isArray(seguimientos) ? seguimientos[0] : null;

    const plan = Number(cliente.dias_entreno_cantidad);
    if (!seg || !Number(seg.dias_planeados)) {
      return res.status(200).json({
        ok: true, semana,
        entreno: { cerrado: false, plan: Number.isFinite(plan) && plan > 0 ? plan : null },
      });
    }

    return res.status(200).json({
      ok: true, semana,
      entreno: {
        cerrado: true,
        planeados: Number(seg.dias_planeados) || 0,
        asistidos: Number(seg.dias_asistidos) || 0,
        dias: Array.isArray(seg.dias_entrenados) ? seg.dias_entrenados : [],
      },
    });
  } catch (e) {
    return res.status(200).json({ ok: false });
  }
}
