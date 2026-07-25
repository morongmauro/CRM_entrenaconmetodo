// /api/coach-auth.js
// Login del dashboard de coach.
// POST { password }  → si coincide con COACH_PASSWORD, devuelve { token, expiresAt }
// Token = base64(payload) + "." + hmac(payload, COACH_PASSWORD)
// Payload contiene { exp } (timestamp de expiración en ms).
// Dura 7 días.

import crypto from 'node:crypto';
import { guard, checkOrigin } from './_guard.js';

const COACH_PASSWORD = process.env.COACH_PASSWORD;
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// CORS: el CRM (otro dominio) hace login de coach contra este endpoint para
// leer los datos por la API en vez de la anon key. Solo se refleja el Origin
// cuando checkOrigin lo permite (host propio + ALLOWED_ORIGINS en Vercel).
function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin || !checkOrigin(req)) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function signToken(payload) {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json).toString('base64url');
  const sig = crypto.createHmac('sha256', COACH_PASSWORD).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

// Comparación en tiempo constante — evita timing attacks sobre === .
function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) {
    // Compara contra sí mismo para gastar el mismo tiempo, y falla.
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (!COACH_PASSWORD) {
    return res.status(500).json({ error: 'COACH_PASSWORD not configured' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }
  // Máx 5 intentos de login por minuto por IP — frena fuerza bruta.
  if (!guard(req, res, { key: 'coach-auth', limit: 5 })) return;
  const { password } = req.body || {};
  if (typeof password !== 'string' || !timingSafeEqualStr(password, COACH_PASSWORD)) {
    return res.status(401).json({ error: 'invalid password' });
  }
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const token = signToken({ exp: expiresAt, role: 'coach' });
  return res.status(200).json({ token, expiresAt });
}

// Verificador reusable (lo importa /api/coach-data.js)
export function verifyCoachToken(token) {
  if (!COACH_PASSWORD || !token || typeof token !== 'string') return null;
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return null;
  const expected = crypto.createHmac('sha256', COACH_PASSWORD).update(b64).digest('base64url');
  if (!timingSafeEqualStr(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch (e) { return null; }
}
