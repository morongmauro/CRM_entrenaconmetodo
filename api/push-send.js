// /api/push-send.js
// Push MANUAL del coach a un cliente ("📲 Push" en el CRM): escribe el
// mensaje y llega al teléfono al instante. Autenticado con el token de
// coach (mismo esquema que coach-data). Envía a TODOS los dispositivos
// suscritos del cliente (por user_id del mealtracker y/o nombre).
//
// POST { user_id?, name?, title?, body }  → { ok, sent } | { ok:false, causa }

import { verifyCoachToken } from './coach-auth.js';
import { checkOrigin } from './_guard.js';
import webpush from 'web-push';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const sbHeaders = () => ({
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
});

const normalizeName = (str) => String(str || '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ').trim();

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin || !checkOrigin(req)) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token || !verifyCoachToken(token)) return res.status(401).json({ error: 'unauthorized' });

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return res.status(200).json({ ok: false, causa: 'Faltan las llaves VAPID en Vercel (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).' });
  }
  webpush.setVapidDetails('mailto:morongmauro@gmail.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

  const { user_id, name, title, body } = req.body || {};
  const texto = String(body || '').trim().slice(0, 400);
  if (!texto) return res.status(400).json({ error: 'body requerido' });

  try {
    const rs = await fetch(`${SUPABASE_URL}/rest/v1/push_subs?select=endpoint,user_id,name,sub`, { headers: sbHeaders() });
    const subs = rs.ok ? await rs.json() : [];
    const objetivo = (Array.isArray(subs) ? subs : []).filter(s =>
      (user_id && s.user_id === user_id) ||
      (name && s.name && normalizeName(s.name) === normalizeName(name))
    );
    if (objetivo.length === 0) {
      return res.status(200).json({ ok: false, causa: 'Este cliente no tiene el push activado en su app (aún no ha tocado "Activar" en el banner de recordatorios).' });
    }

    let sent = 0;
    for (const s of objetivo) {
      try {
        await webpush.sendNotification(s.sub, JSON.stringify({
          title: String(title || 'Tu coach').slice(0, 80),
          body: texto,
          tag: 'ecm-coach',
          url: '/',
        }));
        sent++;
      } catch (e) {
        const code = e && e.statusCode;
        if (code === 404 || code === 410) {
          await fetch(`${SUPABASE_URL}/rest/v1/push_subs?endpoint=eq.${encodeURIComponent(s.endpoint)}`, {
            method: 'DELETE', headers: sbHeaders(),
          });
        }
      }
    }
    return res.status(200).json({ ok: sent > 0, sent, ...(sent === 0 ? { causa: 'Las suscripciones del cliente ya no son válidas (revocó el permiso o reinstaló). Pídele re-activar en la app.' } : {}) });
  } catch (e) {
    return res.status(500).json({ error: 'push failed', detail: String(e) });
  }
}
