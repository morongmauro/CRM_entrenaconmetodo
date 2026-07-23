// /api/push-subscribe.js
// Suscripciones web-push de los clientes.
//
// GET  → { publicKey }  (la llave VAPID pública que el navegador necesita
//         para suscribirse; la privada JAMÁS sale del servidor)
// POST → { user_id, name, tz, sub }  guarda/actualiza la suscripción del
//         dispositivo en la tabla push_subs (upsert por endpoint).
//
// Tabla (Supabase del mealtracker — correr una vez en el SQL editor):
//   create table if not exists push_subs (
//     endpoint text primary key,
//     user_id text,
//     name text,
//     tz text default 'America/Bogota',
//     sub jsonb not null,
//     updated_at timestamptz default now()
//   );
//
// Env (Vercel): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (par generado una vez).

import { guard } from './_guard.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = () => ({
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
});

export default async function handler(req, res) {
  if (req.method === 'GET') {
    if (!guard(req, res, { key: 'push-sub', limit: 30, allowNoOrigin: true })) return;
    return res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!guard(req, res, { key: 'push-sub', limit: 20 })) return;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'not configured' });

  const { user_id, name, tz, sub } = req.body || {};
  if (!sub || typeof sub !== 'object' || typeof sub.endpoint !== 'string' || !sub.endpoint.startsWith('https://')) {
    return res.status(400).json({ error: 'invalid subscription' });
  }

  try {
    const row = {
      endpoint: sub.endpoint,
      user_id: typeof user_id === 'string' ? user_id.slice(0, 64) : null,
      name: typeof name === 'string' ? name.slice(0, 120) : null,
      tz: typeof tz === 'string' && tz.length <= 64 ? tz : 'America/Bogota',
      sub,
      updated_at: new Date().toISOString(),
    };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/push_subs?on_conflict=endpoint`, {
      method: 'POST',
      headers: { ...headers(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row),
    });
    if (!r.ok) {
      const detail = await r.text();
      return res.status(500).json({ error: 'save failed', detail });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'save failed', detail: String(e) });
  }
}
