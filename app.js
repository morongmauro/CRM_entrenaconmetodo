// =====================================================
// CRM EntrenaConMétodo · App principal
// =====================================================

const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

// ===== Cliente Supabase secundario: Mealtracker externo =====
// Las credenciales pueden venir de config.js (window.MEALTRACKER_URL/KEY)
// o del panel de Ajustes (_settings.mealtracker_url/_key). config.js tiene prioridad.
let _mtClient = null;
let _mtClientKey = null;
let _mtUsersCache = null;
let _mtUsersCacheTime = 0;

// --- Modo seguro (recomendado): API de coach del Mealtracker ---
// El CRM se autentica con la contraseña del dashboard de coach
// (COACH_PASSWORD) contra /api/coach-auth y lee vía /api/coach-data.
// Así la anon key deja de ser necesaria y se puede activar RLS en user_data.
function mtApiBase() {
  const url = (_settings?.mealtracker_app_url || '').trim().replace(/\/+$/, '');
  const pass = _settings?.mealtracker_coach_password || '';
  return (url && pass) ? { url, pass } : null;
}

async function mtApiToken(force = false) {
  const cfg = mtApiBase();
  if (!cfg) return null;
  if (!force) {
    try {
      const saved = JSON.parse(localStorage.getItem('mt_coach_token') || 'null');
      if (saved && saved.url === cfg.url && saved.expiresAt > Date.now() + 60000) return saved.token;
    } catch (e) { /* token corrupto, re-login */ }
  }
  try {
    const r = await fetch(`${cfg.url}/api/coach-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: cfg.pass }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    localStorage.setItem('mt_coach_token', JSON.stringify({ token: d.token, expiresAt: d.expiresAt, url: cfg.url }));
    return d.token;
  } catch (e) { return null; }
}

async function mtApiGet(path) {
  const cfg = mtApiBase();
  if (!cfg) return null;
  let token = await mtApiToken();
  if (!token) return null;
  const call = (t) => fetch(`${cfg.url}${path}`, { headers: { Authorization: `Bearer ${t}` } }).catch(() => null);
  let r = await call(token);
  if (r && r.status === 401) {          // token vencido → re-login una vez
    token = await mtApiToken(true);
    if (!token) return null;
    r = await call(token);
  }
  if (!r || !r.ok) return null;
  return r.json().catch(() => null);
}

async function mtApiPost(path, body) {
  const cfg = mtApiBase();
  if (!cfg) return null;
  let token = await mtApiToken();
  if (!token) return null;
  const call = (t) => fetch(`${cfg.url}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null);
  let r = await call(token);
  if (r && r.status === 401) {
    token = await mtApiToken(true);
    if (!token) return null;
    r = await call(token);
  }
  if (!r || !r.ok) return null;
  return r.json().catch(() => ({}));
}

// Escribe las metas (kcal/p/c/g) en el user_data del Mealtracker.
// Devuelve { ok, causa }. Respeta el formato de claves que ya use el cliente
// (nuevo: kcal/p/c/g · viejo: calories/protein/carbs/fat) y no toca nada más del blob.
async function setMealtrackerGoals(mealtrackerId, metas) {
  const aplicar = (goalsPrevias) => {
    const goals = { ...(goalsPrevias || {}) };
    const formatoViejo = goals.calories != null && goals.kcal == null;
    if (formatoViejo) {
      goals.calories = metas.kcal; goals.protein = metas.p; goals.carbs = metas.c; goals.fat = metas.g;
    } else {
      goals.kcal = metas.kcal; goals.p = metas.p; goals.c = metas.c; goals.g = metas.g;
    }
    return goals;
  };

  // Modo directo (anon key): leer el blob completo, cambiar solo goals, reescribir
  const mt = mtClient();
  if (mt) {
    const { data: row, error } = await mt.from('user_data').select('data').eq('user_id', mealtrackerId).maybeSingle();
    if (error) return { ok: false, causa: `El Supabase del Mealtracker devolvió un error al leer: "${error.message}".` };
    if (!row) return { ok: false, causa: 'El cliente no existe en el Mealtracker. Revisa el vínculo en Ajustes → "Sincronizar clientes".' };
    const blob = row.data || {};
    blob.goals = aplicar(blob.goals);
    const { error: e2 } = await mt.from('user_data')
      .update({ data: blob, updated_at: new Date().toISOString() })
      .eq('user_id', mealtrackerId);
    if (e2) return { ok: false, causa: `No se pudo escribir en el Mealtracker: "${e2.message}". Si activaste RLS en user_data, el modo directo ya no permite escribir.` };
    return { ok: true };
  }

  // Modo seguro (API de coach): requiere que la app Mealtracker exponga un
  // endpoint de escritura de metas.
  if (mtApiBase()) {
    const res = await mtApiPost('/api/coach-data', { action: 'set_goals', user_id: mealtrackerId, goals: aplicar((await getMealtrackerUserData(mealtrackerId))?.goals) });
    if (res) return { ok: true };
    return { ok: false, causa: 'La API de coach del Mealtracker no aceptó el cambio de metas (es de solo lectura). Para enviar metas llena la URL y anon key del Mealtracker en config.js o Ajustes, o agrega el endpoint de escritura en la app Mealtracker.' };
  }

  return { ok: false, causa: 'No hay conexión configurada al Mealtracker (config.js o Ajustes).' };
}

// --- Modo directo (legado): lectura con anon key. Deja de funcionar si
// activas RLS en el Mealtracker; migra al modo seguro en Ajustes. ---
function mtClient() {
  const url = window.MEALTRACKER_URL || _settings?.mealtracker_url;
  const key = window.MEALTRACKER_ANON_KEY || _settings?.mealtracker_anon_key;
  if (!url || !key) { _mtClient = null; return null; }
  const cacheKey = `${url}|${key}`;
  if (_mtClient && _mtClientKey === cacheKey) return _mtClient;
  _mtClient = window.supabase.createClient(url, key);
  _mtClientKey = cacheKey;
  return _mtClient;
}

// ¿Hay alguna conexión al Mealtracker disponible (API segura o directa)?
function mtConfigured() {
  return !!(mtApiBase() || mtClient());
}

// Trae el blob `data` de un usuario del Mealtracker, por el modo disponible
async function getMealtrackerUserData(mealtrackerId) {
  if (!mealtrackerId) return null;
  if (mtApiBase()) {
    const res = await mtApiGet(`/api/coach-data?action=detail&user_id=${encodeURIComponent(mealtrackerId)}`);
    return res?.client?.data || null;
  }
  const mt = mtClient();
  if (!mt) return null;
  const { data: row, error } = await mt.from('user_data').select('data').eq('user_id', mealtrackerId).maybeSingle();
  if (error || !row) return null;
  return row.data || null;
}

// Cuando la lectura falla, prueba la conexión paso a paso y devuelve la causa
// más probable, para no mostrar solo "no se pudo conectar".
async function mtDiagnostico(mealtrackerId) {
  if (mtApiBase()) {
    const token = await mtApiToken(true);
    if (!token) return 'No pude autenticarme con la app del Mealtracker (modo seguro). Revisa en Ajustes la URL de la app y la contraseña de coach, y que la app esté en línea.';
    const res = await mtApiGet(`/api/coach-data?action=detail&user_id=${encodeURIComponent(mealtrackerId)}`);
    if (!res) return 'Me autentiqué con la app del Mealtracker, pero la lectura falló (puede ser algo temporal de la app). Intenta de nuevo en unos minutos.';
    return 'La app del Mealtracker respondió, pero este cliente no tiene datos allá. Revisa el vínculo en Ajustes → "Sincronizar clientes".';
  }
  const mt = mtClient();
  if (!mt) return 'No hay conexión configurada: llena la URL y la anon key del Mealtracker en config.js o en Ajustes.';
  const { error } = await mt.from('user_data').select('user_id').limit(1);
  if (error) return `El Supabase del Mealtracker devolvió un error: "${error.message}". Si el proyecto está pausado (el plan gratis se pausa tras ~1 semana sin uso), reactívalo en supabase.com.`;
  return 'Conecté al Supabase del Mealtracker pero no obtuve datos. Si activaste RLS en la tabla user_data, el modo directo ya no sirve: configura el modo seguro en Ajustes. Si no, revisa el vínculo del cliente en Ajustes → "Sincronizar clientes".';
}

// Convierte semana ISO (YYYY-Www) a rango [fecha_lunes, fecha_domingo]
function semanaISOToRange(semanaISO) {
  const [y, w] = semanaISO.split('-W').map(Number);
  // 4 de enero está siempre en la semana ISO 1
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7;
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - (jan4Dow - 1));
  const start = new Date(week1Mon);
  start.setUTCDate(week1Mon.getUTCDate() + (w - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}

// Trae el resumen de una semana desde el mealtracker externo
async function getMealtrackerWeek(mealtrackerId, semanaISO) {
  const d = await getMealtrackerUserData(mealtrackerId);
  if (!d) return null;

  const goals = d.goals || {};
  const history = d.history || {};
  const [ini, fin] = semanaISOToRange(semanaISO);

  const dias = [];
  for (const [fecha, tot] of Object.entries(history)) {
    if (fecha >= ini && fecha <= fin && tot && Number(tot.kcal) > 0) {
      dias.push({ fecha, kcal: Number(tot.kcal), p: Number(tot.p || 0), c: Number(tot.c || 0), g: Number(tot.g || 0) });
    }
  }
  if (d.today && d.today >= ini && d.today <= fin && d.today_totals && Number(d.today_totals.kcal) > 0) {
    if (!dias.find(x => x.fecha === d.today)) {
      const t = d.today_totals;
      dias.push({ fecha: d.today, kcal: Number(t.kcal), p: Number(t.p || 0), c: Number(t.c || 0), g: Number(t.g || 0) });
    }
  }

  if (dias.length === 0) {
    return { dias: 0, kcal_avg: null, prote_avg: null, carbos_avg: null, grasas_avg: null, goals, rango: [ini, fin] };
  }
  const avg = (k) => Math.round(dias.reduce((a, b) => a + b[k], 0) / dias.length);
  return {
    dias: dias.length,
    kcal_avg: avg('kcal'),
    prote_avg: avg('p'),
    carbos_avg: avg('c'),
    grasas_avg: avg('g'),
    goals,
    rango: [ini, fin],
  };
}

// Lista todos los clientes del mealtracker (con cache de 60s)
async function listarClientesMealtracker(force = false) {
  if (!mtConfigured()) return [];
  const ahora = Date.now();
  if (!force && _mtUsersCache && (ahora - _mtUsersCacheTime) < 60000) return _mtUsersCache;
  if (mtApiBase()) {
    const res = await mtApiGet('/api/coach-data?action=list');
    _mtUsersCache = (res?.clients || []).map(c => ({ user_id: c.user_id, name: c.name, updated_at: c.updated_at }));
    _mtUsersCacheTime = ahora;
    return _mtUsersCache;
  }
  const mt = mtClient();
  const { data } = await mt.from('user_data').select('user_id, name, updated_at').order('updated_at', { ascending: false });
  _mtUsersCache = data || [];
  _mtUsersCacheTime = ahora;
  return _mtUsersCache;
}

// Auto-match transparente por nombre. Devuelve el mealtracker_id resuelto (usando
// el guardado si existe, o buscando por nombre y guardándolo si hay match ≥85%).
async function resolverMealtrackerId(cliente) {
  if (!cliente) return null;
  if (cliente.mealtracker_id) return cliente.mealtracker_id;
  if (!mtConfigured()) return null;

  const users = await listarClientesMealtracker();
  if (!users.length) return null;

  // Buscar mejor match por nombre. Si hay varias filas del mismo nombre, tomar la más reciente.
  const nombresNorm = {};
  for (const u of users) {
    const n = normalizeName(u.name);
    if (!nombresNorm[n] || u.updated_at > nombresNorm[n].updated_at) nombresNorm[n] = u;
  }

  let mejor = null;
  for (const u of Object.values(nombresNorm)) {
    const score = similitudNombre(cliente.nombre, u.name);
    if (!mejor || score > mejor.score) mejor = { ...u, score };
  }

  if (mejor && mejor.score >= 85) {
    // Guardar el vínculo en el cliente
    await sb.from('clientes').update({ mealtracker_id: mejor.user_id }).eq('id', cliente.id);
    _clientesCache = null;
    return mejor.user_id;
  }
  return null;
}

function normalizeName(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

// Similitud de nombres para matching (0-100)
function similitudNombre(a, b) {
  const na = normalizeName(a), nb = normalizeName(b);
  if (na === nb) return 100;
  const ta = new Set(na.split(' ')), tb = new Set(nb.split(' '));
  const inter = [...ta].filter(x => tb.has(x)).length;
  const union = new Set([...ta, ...tb]).size;
  return Math.round((inter / union) * 100);
}


const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
const view = $('#view');
const modal = $('#modal');
const modalContent = $('#modal-content');
const modalBox = $('#modal-box');
const toastEl = $('#toast');
const loginScreen = $('#login-screen');
const appScreen = $('#app-screen');
const bootScreen = $('#boot-screen');

let _settings = { usd_cop_rate: 4000, nombre_coach: 'Coach', mealtracker_url: '', mealtracker_anon_key: '' };
let _clientesCache = null;
let _selectedClienteId = null;
let _segView = 'focus';
let _pagosView = 'table';
let _pagosYear = new Date().getFullYear();
let _pendientesFilter = 'todos';

// =====================================================
// UTILS
// =====================================================
const fmt = {
  // Fecha local (no UTC): con toISOString() en Colombia el día/mes cambiaba desde las 7pm
  hoy: () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
  mesActual: () => fmt.hoy().slice(0, 7),
  fecha: (s) => s ? new Date(s + (String(s).length === 10 ? 'T00:00:00' : '')).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
  fechaCorta: (s) => s ? new Date(s + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) : '—',
  money: (n, m = 'COP') => {
    const v = Number(n || 0);
    if (m === 'USD') return `USD ${v.toFixed(0)}`;
    return `COP ${v.toLocaleString('es-CO')}`;
  },
  moneyCop: (n) => `COP ${Number(n || 0).toLocaleString('es-CO')}`,
  mesEs: (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('es-CO', { month: 'short' }).replace('.', '');
  },
  mesEsLargo: (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  },
  semanaISO: (d = new Date()) => {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  },
  semanaPrev: (s) => {
    // Restar 7 días al lunes de la semana y rederivar (algunos años tienen 53 semanas ISO)
    const [ini] = semanaISOToRange(s);
    const d = new Date(ini + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    return fmt.semanaISO(d);
  },
  labelSemana: (s) => {
    const [y, w] = s.split('-W').map(Number);
    return `S${w} '${String(y).slice(2)}`;
  },
  diasDesde: (s) => {
    if (!s) return null;
    const a = new Date(s + (String(s).length === 10 ? 'T00:00:00' : ''));
    return Math.floor((Date.now() - a) / 86400000);
  },
  diasEntre: (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000),
  mesesDesde: (s) => {
    if (!s) return null;
    const a = new Date(s + 'T00:00:00');
    const now = new Date();
    return (now.getFullYear() - a.getFullYear()) * 12 + (now.getMonth() - a.getMonth());
  },
};

const PALETA = ['from-pink-400 to-pink-600','from-blue-400 to-blue-600','from-teal-400 to-teal-600','from-violet-400 to-violet-600','from-orange-400 to-orange-600','from-emerald-400 to-emerald-600','from-red-400 to-red-600','from-amber-400 to-amber-600','from-cyan-400 to-cyan-600','from-fuchsia-400 to-fuchsia-600'];

const helpers = {
  iniciales: (nombre) => (nombre || '?').trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase(),
  color: (nombre) => {
    const s = nombre || '?';
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % PALETA.length;
    return PALETA[Math.abs(h)];
  },
  avatar: (nombre, size = 10) => `<div class="w-${size} h-${size} rounded-full bg-gradient-to-br ${helpers.color(nombre)} flex items-center justify-center text-white font-bold flex-shrink-0" style="font-size:${size <= 9 ? '0.75rem' : '0.95rem'}">${escapeHtml(helpers.iniciales(nombre))}</div>`,
  avatarBig: (nombre) => `<div class="w-14 h-14 rounded-2xl bg-gradient-to-br ${helpers.color(nombre)} flex items-center justify-center text-white font-bold text-xl shadow-sm">${escapeHtml(helpers.iniciales(nombre))}</div>`,
  promedioAdh: (s) => {
    if (!s) return null;
    const vals = [s.adherencia_entreno, s.adherencia_alimentacion].filter(v => v !== null && v !== undefined);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  },
  pctAsistencia: (s) => {
    if (!s || !s.dias_planeados || s.dias_asistidos === null || s.dias_asistidos === undefined) return null;
    return Math.round((s.dias_asistidos / s.dias_planeados) * 100);
  },
  edadDe: (fechaNac) => {
    if (!fechaNac) return null;
    const n = new Date(fechaNac + 'T00:00:00');
    const hoy = new Date();
    let edad = hoy.getFullYear() - n.getFullYear();
    const m = hoy.getMonth() - n.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < n.getDate())) edad--;
    return edad;
  },
  diasHastaCumple: (fechaNac) => {
    if (!fechaNac) return null;
    const n = new Date(fechaNac + 'T00:00:00');
    const hoy = new Date();
    let prox = new Date(hoy.getFullYear(), n.getMonth(), n.getDate());
    if (prox < hoy) prox = new Date(hoy.getFullYear() + 1, n.getMonth(), n.getDate());
    return Math.floor((prox - hoy) / 86400000);
  },
  diaPagoEnMes: (cliente, mes) => {
    if (!cliente.dia_pago) return null;
    const [y, m] = mes.split('-').map(Number);
    return new Date(y, m - 1, Math.min(cliente.dia_pago, 28)).toISOString().slice(0, 10);
  },
  enRiesgo: (cliente, seguimientos) => {
    if (cliente.estado !== 'activo') return false;
    const segs = (seguimientos || []).filter(s => s.cliente_id === cliente.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    if (!segs.length) return fmt.mesesDesde(cliente.fecha_inicio) >= 1;
    const dias = fmt.diasDesde(segs[0].fecha);
    if (dias > 14) return true;
    if (segs.length >= 3) {
      const a = helpers.promedioAdh(segs[0]);
      const b = helpers.promedioAdh(segs[1]);
      const c = helpers.promedioAdh(segs[2]);
      if (a !== null && b !== null && c !== null && a < b - 0.5 && b < c - 0.5) return true;
    }
    return false;
  },
};

// ===== Constantes de coaching =====
const PAL_MAP = {
  sedentario: 1.2,
  ligero: 1.375,
  moderado: 1.55,
  activo: 1.725,
  muy_activo: 1.9,
};

const OBJETIVOS_KCAL = [
  { key: 'deficit_30', label: 'Déficit -30% (agresivo)', pct: -0.30 },
  { key: 'deficit_25', label: 'Déficit -25%', pct: -0.25 },
  { key: 'deficit_20', label: 'Déficit -20% (moderado)', pct: -0.20 },
  { key: 'deficit_15', label: 'Déficit -15%', pct: -0.15 },
  { key: 'deficit_10', label: 'Déficit -10% (suave)', pct: -0.10 },
  { key: 'deficit_5',  label: 'Déficit -5%', pct: -0.05 },
  { key: 'mantener',   label: 'Mantenimiento', pct: 0 },
  { key: 'superavit_5',  label: 'Superávit +5%', pct: 0.05 },
  { key: 'superavit_10', label: 'Superávit +10% (recomp)', pct: 0.10 },
  { key: 'superavit_15', label: 'Superávit +15%', pct: 0.15 },
  { key: 'superavit_20', label: 'Superávit +20%', pct: 0.20 },
  { key: 'superavit_25', label: 'Superávit +25%', pct: 0.25 },
  { key: 'superavit_30', label: 'Superávit +30% (agresivo)', pct: 0.30 },
];

// Objetivos del cliente: chips multi-selección. Se guardan como texto plano
// ("Recomposición, Fuerza, …") para no cambiar la columna ni los reportes.
const OBJETIVOS_TAGS = [
  ['⚖️', 'Recomposición'], ['🤸', 'Movilidad'], ['🏋️', 'Fuerza'], ['🤾', 'Calistenia'],
  ['❤️', 'Salud'], ['🌱', 'Longevidad'], ['🔥', 'Bajar grasa'], ['💪', 'Ganar masa'],
  ['📈', 'Resistencia'], ['🧠', 'Hábitos'],
];

const FASES_PROGRAMA = [
  { key: 'preparacion',    label: '🟢 Preparación / onboarding' },
  { key: 'bloque_fuerza',  label: '🏋️ Bloque de fuerza' },
  { key: 'hipertrofia',    label: '💪 Hipertrofia' },
  { key: 'cutting',        label: '🔥 Cutting / definición' },
  { key: 'recomposicion',  label: '⚖️ Recomposición' },
  { key: 'mantenimiento',  label: '🎯 Mantenimiento' },
  { key: 'deload',         label: '😴 Deload / descarga' },
];

const ENCUESTA_ACTIVIDAD = [
  {
    key: 'q_fuerza',
    label: '¿Cuántos días a la semana entrena fuerza?',
    opts: [ ['0', 0], ['1-2', 1], ['3-4', 2], ['5 o más', 3] ],
  },
  {
    key: 'q_cardio',
    label: '¿Cuántos días a la semana hace cardio o deporte?',
    opts: [ ['0', 0], ['1-2', 1], ['3-5', 2], ['6 o más', 3] ],
  },
  {
    key: 'q_trabajo',
    label: '¿Cómo es su trabajo?',
    opts: [ ['Oficina/sedentario', 0], ['Mixto', 2], ['Físico', 4] ],
  },
  {
    key: 'q_pasos',
    label: '¿Cuántos pasos diarios estima?',
    opts: [ ['<5.000', 0], ['5.000-8.000', 1], ['8.000-12.000', 3], ['>12.000', 4] ],
  },
  {
    key: 'q_deportes',
    label: '¿Practica deportes recreativos los fines de semana?',
    opts: [ ['No', 0], ['A veces', 1], ['Siempre', 2] ],
  },
];

function nivelDesdeEncuesta(respuestas) {
  const total = Object.values(respuestas || {}).reduce((a, b) => a + Number(b || 0), 0);
  if (total <= 3) return { nivel: 'sedentario', pal: 1.2, total };
  if (total <= 6) return { nivel: 'ligero', pal: 1.375, total };
  if (total <= 9) return { nivel: 'moderado', pal: 1.55, total };
  if (total <= 12) return { nivel: 'activo', pal: 1.725, total };
  return { nivel: 'muy_activo', pal: 1.9, total };
}

// ===== Cálculo de meta nutricional =====
function calcMetaNutricional({ peso, altura, edad, sexo, grasa_pct, pal, objetivo_pct, proteina_g_kg }) {
  const w = Number(peso), h = Number(altura), a = Number(edad), g = grasa_pct != null && grasa_pct !== '' ? Number(grasa_pct) : null;
  const gkg = Number(proteina_g_kg) || 1.8;
  if (!w || !h || !a || !sexo || !pal || objetivo_pct == null) return null;

  let bmr, metodo, formula;
  if (g !== null && g > 0 && g < 60) {
    const magra = w * (1 - g / 100);
    bmr = 370 + 21.6 * magra;
    metodo = 'Katch-McArdle';
    formula = `BMR = 370 + 21.6 × masa_magra(${magra.toFixed(1)} kg) = ${bmr.toFixed(0)} kcal`;
  } else {
    const s = sexo === 'M' ? 5 : sexo === 'F' ? -161 : -78;  // "otro" promedio
    bmr = 10 * w + 6.25 * h - 5 * a + s;
    metodo = 'Mifflin-St Jeor';
    formula = `BMR = 10×${w} + 6.25×${h} − 5×${a} ${s >= 0 ? '+' : '−'} ${Math.abs(s)} = ${bmr.toFixed(0)} kcal`;
  }

  const tdee = bmr * pal;
  const kcal = Math.round(tdee * (1 + objetivo_pct));
  const proteina = Math.round(w * gkg);
  const grasas = Math.round(kcal * 0.25 / 9);
  const carbos = Math.round((kcal - proteina * 4 - grasas * 9) / 4);

  const signo = objetivo_pct >= 0 ? '+' : '';
  const argumento = `Método: ${metodo}
${formula}
TDEE = BMR × PAL(${pal}) = ${tdee.toFixed(0)} kcal
Meta = TDEE × (1 ${signo}${(objetivo_pct * 100).toFixed(0)}%) = ${kcal} kcal
Proteína: ${w} kg × ${gkg} g/kg = ${proteina} g
Grasas: 25% de kcal = ${grasas} g
Carbos: resto = ${carbos} g`;

  return { kcal, proteina, grasas, carbos, metodo, argumento, bmr: Math.round(bmr), tdee: Math.round(tdee) };
}

// ===== Composición corporal =====
// Estimaciones basadas en fórmulas científicamente respaldadas.
// IMPORTANTE: son ESTIMACIONES, no mediciones directas. El gold standard es DEXA.
// Precisión: aceptable para trackear tendencias, no para diagnóstico clínico.
function calcComposicionCorporal({ peso, grasa_pct, edad, sexo, altura_cm }) {
  const w = Number(peso), gp = Number(grasa_pct), a = Number(edad), h = Number(altura_cm);
  if (!w || w <= 0) return null;

  const out = { peso_kg: w };

  // 1. Masa grasa y magra (trivial, exacta si %grasa es correcto)
  if (gp != null && gp > 0 && gp < 60) {
    out.masa_grasa_kg = +(w * gp / 100).toFixed(2);
    out.masa_magra_kg = +(w - out.masa_grasa_kg).toFixed(2);
  }

  // 2. Masa muscular esquelética · Lee et al. (2000) J Appl Physiol 89:465-471
  //    SMM (kg) = (altura² × 0.0553) + (peso × 0.244) + (edad × -0.130) + (sexo × 6.15) - 22.7
  //    donde altura en m, sexo: 1=H, 0=M. R² = 0.86 vs. MRI.
  if (h && a && sexo) {
    const sx = sexo === 'M' ? 1 : sexo === 'F' ? 0 : 0.5;
    const hM = h / 100;
    const smm = (hM * hM * 0.0553 * 100) + (w * 0.244) + (a * -0.130) + (sx * 6.15) - 22.7;
    if (smm > 0) out.masa_muscular_smm_kg = +smm.toFixed(2);
  }

  // 3. Masa ósea · Wagner & Heyward (2000) Med Sci Sports Exerc 32(9)
  //    H: peso × 0.04 · M: peso × 0.035  (aprox 3-5% del peso corporal)
  if (sexo === 'M') out.masa_osea_kg = +(w * 0.04).toFixed(2);
  else if (sexo === 'F') out.masa_osea_kg = +(w * 0.035).toFixed(2);
  else out.masa_osea_kg = +(w * 0.0375).toFixed(2);

  // 4. Agua corporal total · Watson et al. (1980) Am J Clin Nutr 33:27-39
  //    H: 2.447 - 0.09156×edad + 0.1074×altura + 0.3362×peso
  //    M: -2.097 + 0.1069×altura + 0.2466×peso
  if (h && sexo) {
    let tbw;
    if (sexo === 'M' && a) tbw = 2.447 - 0.09156 * a + 0.1074 * h + 0.3362 * w;
    else if (sexo === 'F') tbw = -2.097 + 0.1069 * h + 0.2466 * w;
    if (tbw && tbw > 0) out.agua_corporal_L = +tbw.toFixed(2);
  }

  // 5. Masa residual (órganos, líquidos no calculados, tejido conectivo)
  //    = peso - (grasa + músculo + hueso). Modelo 5-compartimentos.
  if (out.masa_grasa_kg && out.masa_muscular_smm_kg && out.masa_osea_kg) {
    const resid = w - out.masa_grasa_kg - out.masa_muscular_smm_kg - out.masa_osea_kg;
    if (resid > 0) out.masa_residual_kg = +resid.toFixed(2);
  }

  return out;
}

// ===== Scores calculados a partir de indicadores objetivos =====
function calcScores(s, cliente) {
  const pctSafe = (num, den) => den > 0 ? Math.min(100, (num / den) * 100) : null;

  // Entreno: el score base es la fuerza (estructurada, con meta). La actividad
  // complementaria (correr, tenis, fútbol…) es variada y sin meta fija: suma un
  // bono de +2 pts por día hecho (máx +10, tope 100). Premia sin inflar y no
  // puede hundir una semana de fuerza cumplida. cardio_ejecutados = días 0-7.
  const scoreFuerza = pctSafe(s.fuerza_ejecutados, s.fuerza_planeados);
  const diasComp = Math.max(0, Math.min(7, Number(s.cardio_ejecutados) || 0));
  const bonoComp = Math.min(10, diasComp * 2);
  let score_entreno = null;
  if (scoreFuerza !== null) score_entreno = Math.min(100, scoreFuerza + bonoComp);
  else if (s.cardio_planeados) score_entreno = pctSafe(s.cardio_ejecutados, s.cardio_planeados); // semanas viejas sin dato de fuerza

  // Alimentación metas
  let score_alim_metas = null;
  if (cliente?.meta_calorias && s.kcal_promedio != null) {
    const kcalPct = Math.max(0, 100 - Math.abs((s.kcal_promedio - cliente.meta_calorias) / cliente.meta_calorias * 100));
    let protePct = null;
    if (cliente.meta_proteina_g && s.proteina_promedio_g != null) {
      protePct = Math.min(100, (s.proteina_promedio_g / cliente.meta_proteina_g) * 100);
    }
    score_alim_metas = protePct !== null ? (kcalPct + protePct) / 2 : kcalPct;
  }

  // Alimentación registro
  const score_alim_registro = s.dias_registro_alim != null ? (s.dias_registro_alim / 7) * 100 : null;

  // Global
  const componentes = [score_entreno, score_alim_metas, score_alim_registro].filter(v => v !== null);
  const score_global = componentes.length ? componentes.reduce((a, b) => a + b, 0) / componentes.length : null;

  return { score_entreno, score_alim_metas, score_alim_registro, score_global };
}

// ===== Streaks (rachas de cumplimiento) =====
function calcStreakDim(segs, evaluador) {
  // segs desc por semana, evaluador(s) => bool
  let count = 0;
  for (const s of segs) {
    if (evaluador(s)) count++;
    else break;
  }
  return count;
}

// ===== Auto-borrador WhatsApp =====
function borradorWhatsApp(cliente, seg, scores, pendientes, streaks) {
  const nombre = (cliente.nombre || '').split(' ')[0];
  const partes = [`Hola ${nombre}!`, ''];

  // Reconocimiento por scores
  if (scores.score_global != null) {
    if (scores.score_global >= 85) partes.push(`Semana top 🔥 · cumpliste ${Math.round(scores.score_global)}% del plan.`);
    else if (scores.score_global >= 65) partes.push(`Buena semana · ${Math.round(scores.score_global)}% de cumplimiento.`);
    else if (scores.score_global >= 40) partes.push(`Semana mixta, cumpliste ${Math.round(scores.score_global)}%. Hablemos qué ajustar.`);
    else partes.push(`Semana retadora (${Math.round(scores.score_global)}%). No te preocupes, la reencauzamos.`);
    partes.push('');
  }

  // Detalle entreno
  if (seg.fuerza_planeados) {
    partes.push(`🏋️ Fuerza: ${seg.fuerza_ejecutados || 0}/${seg.fuerza_planeados} sesiones`);
  }
  if (seg.cardio_planeados) {
    partes.push(`🏃 Cardio/deporte: ${seg.cardio_ejecutados || 0}/${seg.cardio_planeados} sesiones`);
  }
  if (scores.score_alim_metas != null) {
    partes.push(`🥗 Alimentación vs metas: ${Math.round(scores.score_alim_metas)}%`);
  }
  if (seg.dias_registro_alim != null) {
    partes.push(`📝 Registros en app: ${seg.dias_registro_alim}/7 días`);
  }

  // Streaks
  if (streaks?.fuerza >= 3) partes.push('', `🎉 ¡Llevas ${streaks.fuerza} semanas seguidas cumpliendo fuerza!`);

  // Pendientes (solo los del cliente — las tareas del coach no van en su mensaje)
  const abiertos = (pendientes || []).filter(p => p.estado === 'abierto' && p.para !== 'coach').slice(0, 3);
  if (abiertos.length) {
    partes.push('', 'Para esta semana:');
    abiertos.forEach(p => partes.push(`• ${p.descripcion}`));
  }

  // Lesión
  if (cliente.lesion_actual && cliente.lesion_estado !== 'resuelta') {
    partes.push('', `⚕️ Ojo con ${cliente.lesion_actual}, seguimos monitoreando.`);
  }

  return partes.join('\n');
}

// ===== Gráfica SVG simple =====
// series = [{ label, color, points: number[] }]  · xLabels = string[]
function lineChart(series, xLabels = [], opts = {}) {
  const w = opts.width || 600;
  const h = opts.height || 180;
  const pad = { top: 14, right: 14, bottom: 28, left: 32 };
  const iw = w - pad.left - pad.right;
  const ih = h - pad.top - pad.bottom;
  const yMax = opts.yMax ?? 10;
  const yMin = opts.yMin ?? 0;
  const n = Math.max(...series.map(s => s.points.length), 1);
  const sx = (i) => pad.left + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const sy = (y) => pad.top + ih - ((y - yMin) / (yMax - yMin)) * ih;

  let svg = `<svg viewBox="0 0 ${w} ${h}" class="w-full h-auto" preserveAspectRatio="xMidYMid meet">`;
  // Grid Y
  for (let g = 0; g <= 4; g++) {
    const yv = yMin + (yMax - yMin) * (g / 4);
    const yy = sy(yv);
    svg += `<line x1="${pad.left}" y1="${yy}" x2="${w - pad.right}" y2="${yy}" stroke="#e2e8f0" stroke-width="1"/>`;
    svg += `<text x="${pad.left - 6}" y="${yy + 3}" text-anchor="end" font-size="10" fill="#94a3b8">${yv.toFixed(0)}</text>`;
  }
  // Series: línea continua (une puntos aunque haya semanas sin dato) + puntos discretos
  for (const s of series) {
    const pts = s.points
      .map((y, i) => y === null || y === undefined ? null : `${sx(i)},${sy(y)}`)
      .filter(Boolean).join(' ');
    if (pts) svg += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    s.points.forEach((y, i) => {
      if (y !== null && y !== undefined) {
        svg += `<circle cx="${sx(i)}" cy="${sy(y)}" r="2.5" fill="${s.color}" stroke="white" stroke-width="1"/>`;
      }
    });
  }
  // X labels
  xLabels.forEach((lbl, i) => {
    if (i % Math.max(1, Math.floor(xLabels.length / 8)) === 0 || i === xLabels.length - 1) {
      svg += `<text x="${sx(i)}" y="${h - 10}" text-anchor="middle" font-size="10" fill="#94a3b8">${lbl}</text>`;
    }
  });
  svg += '</svg>';
  return svg;
}

function legendDot(color, label) {
  return `<span class="inline-flex items-center gap-1.5 text-xs text-slate-600 mr-3"><span class="w-2.5 h-2.5 rounded-full" style="background:${color}"></span>${label}</span>`;
}

// ===== Días de entreno =====
const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
function metaDiasEntreno(cliente) {
  if (!cliente) return null;
  return cliente.dias_entreno_cantidad || (cliente.dias_entreno || []).length || null;
}

// ===== Checklist sobre texto libre =====
// Cada línea del texto es un ítem; el prefijo "[x] " marca el ítem como hecho.
function parseChecklist(texto) {
  return (texto || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => ({
    done: /^\[x\]/i.test(l),
    texto: l.replace(/^\[( |x)?\]\s*/i, '').replace(/^[-•]\s*/, ''),
  }));
}
function serializeChecklist(items) {
  return items.map(i => `${i.done ? '[x] ' : ''}${i.texto}`).join('\n');
}
// Versión solo-lectura: ✓ hecho · ○ pendiente
function checklistTextoPlano(texto) {
  return parseChecklist(texto).map(i => `${i.done ? '✓' : '○'} ${i.texto}`).join('\n');
}
function checklistHtml(texto, segId) {
  const items = parseChecklist(texto);
  if (!items.length) return '';
  const hechos = items.filter(i => i.done).length;
  return `
    <div class="space-y-1" onclick="event.stopPropagation()">
      ${items.map((it, i) => `
        <label class="chk-item ${it.done ? 'chk-done' : ''}">
          <input type="checkbox" class="rounded" ${it.done ? 'checked' : ''} onchange="toggleChecklistSemana('${segId}', ${i})">
          <span class="chk-text">${escapeHtml(it.texto)}</span>
        </label>`).join('')}
      ${items.length > 1 ? `<div class="chk-count">${hechos}/${items.length} completados</div>` : ''}
    </div>`;
}
// Checklist editable dentro del panel de edición de la semana:
// los bullets se editan directo (texto, check, eliminar) y el estado vive
// en el textarea oculto #sg-pend ([x] por línea), que es lo que se guarda.
window.renderPendEditPreview = () => {
  const box = $('#sg-pend-check');
  const ta = $('#sg-pend');
  if (!box || !ta) return;
  const items = parseChecklist(ta.value);
  if (!items.length) {
    box.innerHTML = '<p class="text-xs text-amber-700/70">Nada pedido aún. Escribe abajo y dale "+ Añadir".</p>';
    return;
  }
  const hechos = items.filter(i => i.done).length;
  box.innerHTML = `
    ${items.map((it, i) => `
      <div class="chk-row ${it.done ? 'chk-done' : ''}">
        <input type="checkbox" class="rounded" ${it.done ? 'checked' : ''} onchange="togglePendEditPreview(${i})" title="Marcar como hecho">
        <input class="chk-edit" value="${escapeHtml(it.texto)}" onchange="editarPendEditPreview(${i}, this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}" title="Click para editar">
        <button type="button" class="chk-del" title="Eliminar" onclick="eliminarPendEditPreview(${i})">✕</button>
      </div>`).join('')}
    ${items.length > 1 ? `<div class="chk-count">${hechos}/${items.length} completados</div>` : ''}`;
};
window.togglePendEditPreview = (idx) => {
  const ta = $('#sg-pend');
  const items = parseChecklist(ta?.value);
  if (!items[idx]) return;
  items[idx].done = !items[idx].done;
  ta.value = serializeChecklist(items);
  renderPendEditPreview();
};
window.editarPendEditPreview = (idx, valor) => {
  const ta = $('#sg-pend');
  const items = parseChecklist(ta?.value);
  if (!items[idx]) return;
  const texto = (valor || '').trim();
  if (texto) items[idx].texto = texto;
  else items.splice(idx, 1);   // texto vacío = eliminar el ítem
  ta.value = serializeChecklist(items);
  renderPendEditPreview();
};
window.eliminarPendEditPreview = (idx) => {
  const ta = $('#sg-pend');
  const items = parseChecklist(ta?.value);
  if (!items[idx]) return;
  items.splice(idx, 1);
  ta.value = serializeChecklist(items);
  renderPendEditPreview();
};
window.agregarPendClienteSeg = () => {
  const inp = $('#sg-pend-nuevo');
  const ta = $('#sg-pend');
  const texto = (inp?.value || '').trim();
  if (!texto || !ta) return;
  const items = parseChecklist(ta.value);
  items.push({ done: false, texto });
  ta.value = serializeChecklist(items);
  inp.value = '';
  inp.focus();
  renderPendEditPreview();
};

// ===== Pendientes del coach dentro del modal de la semana =====
// Se guardan directo en la tabla "pendientes" (para='coach'), así salen
// en el Panel de actividades y en Inicio sin pasos extra.
window.renderPendCoachSeg = async () => {
  const box = $('#sg-coach-list');
  const cid = window._segCliente?.id;
  if (!box || !cid) return;
  const pends = (await db.pendientes.listCliente(cid)).filter(p => p.para === 'coach');
  const abiertos = pends.filter(p => p.estado === 'abierto');
  const hechos = pends.filter(p => p.estado === 'completado').slice(0, 3);
  if (!abiertos.length && !hechos.length) {
    box.innerHTML = '<p class="text-xs text-slate-500">Sin tareas tuyas para este cliente. Anota lo que identifiques en la revisión.</p>';
    return;
  }
  box.innerHTML = [...abiertos, ...hechos].map(p => `
    <label class="chk-item chk-ink ${p.estado === 'completado' ? 'chk-done' : ''}">
      <input type="checkbox" class="rounded" ${p.estado === 'completado' ? 'checked' : ''} onchange="togglePendCoachSeg('${p.id}', '${p.estado}')">
      <span class="chk-text">${escapeHtml(p.descripcion)}</span>
      <button type="button" class="text-slate-400 hover:text-red-600 text-xs flex-shrink-0" title="Eliminar" onclick="event.preventDefault(); event.stopPropagation(); eliminarPendCoachSeg('${p.id}');">✕</button>
    </label>`).join('');
};
window.agregarPendCoachSeg = async () => {
  const inp = $('#sg-coach-nuevo');
  const descripcion = (inp?.value || '').trim();
  if (!descripcion) return;
  const row = await db.pendientes.insert({
    cliente_id: window._segCliente.id,
    para: 'coach',
    scope: 'semana',
    seguimiento_id: window._segId || null,
    descripcion,
    prioridad: 'media',
    estado: 'abierto',
  });
  if (!row) return;
  inp.value = '';
  toast('🧢 Tarea tuya guardada');
  renderPendCoachSeg();
};
window.togglePendCoachSeg = async (id, estado) => {
  await db.pendientes.toggle(id, estado);
  renderPendCoachSeg();
};
window.eliminarPendCoachSeg = async (id) => {
  if (!confirm('¿Eliminar esta tarea tuya?')) return;
  await db.pendientes.remove(id);
  renderPendCoachSeg();
};

window.toggleChecklistSemana = async (segId, idx) => {
  const s = await db.seguimientos.get(segId);
  const items = parseChecklist(s?.pendientes_semana);
  if (!items[idx]) return;
  items[idx].done = !items[idx].done;
  const { error } = await sb.from('seguimientos').update({ pendientes_semana: serializeChecklist(items) }).eq('id', segId);
  if (error) { toast(error.message); return; }
  toast(items[idx].done ? '✓ Completado' : 'Reabierto');
  rerenderView();
};

const PLANTILLAS = {
  alta: `Excelente semana! Cumpliste muy bien con el plan.

✓ Mantengamos el ritmo
✓ Subamos un escalón en [agregar reto]
✓ Foco esta semana: [reforzar lo que funciona]`,
  media: `Semana mixta, hubo logros y cosas por ajustar.

✓ Lo bueno: [logro]
✓ A mejorar: [qué fallo]
✓ Foco esta semana: [un solo objetivo claro]`,
  baja: `Semana retadora. Hablemos qué pasó y ajustemos.

Lo importante es no perder el hilo. Esta semana vamos con algo simple:
✓ Mínimo viable de entreno: [reducir]
✓ Un solo cambio en alimentación: [qué]
✓ Charla rápida [día]`,
};

function generarResumen(cliente, seguimientos, pendientes) {
  const partes = [];
  const segs = (seguimientos || []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));

  // Contacto
  if (segs.length) {
    const dias = fmt.diasDesde(segs[0].fecha);
    if (dias > 14) partes.push(`⚠️ Hace ${dias} días sin registro. Reactivar contacto urgente.`);
    else if (dias > 7) partes.push(`Último seguimiento hace ${dias} días.`);
  } else {
    partes.push(`Primer seguimiento de este cliente.`);
  }

  // Tendencia
  if (segs.length >= 2) {
    const a = helpers.promedioAdh(segs[0]);
    const b = helpers.promedioAdh(segs[1]);
    if (a !== null && b !== null) {
      if (a > b + 0.5) partes.push(`📈 Adherencia subiendo (${b.toFixed(1)}→${a.toFixed(1)}). Reconócelo.`);
      else if (a < b - 0.5) partes.push(`📉 Adherencia bajando (${b.toFixed(1)}→${a.toFixed(1)}). Pregunta qué le frenó.`);
    }
  }

  // Restricciones
  if (cliente.restricciones_lesiones) {
    partes.push(`⚕️ Ojo lesión/restricción: ${cliente.restricciones_lesiones}.`);
  }

  // Pendientes
  const abiertos = (pendientes || []).filter(p => p.cliente_id === cliente.id && p.estado === 'abierto');
  if (abiertos.length) {
    partes.push(`📌 ${abiertos.length} pendiente(s) abierto(s): ${abiertos.slice(0, 2).map(p => p.descripcion).join('; ')}.`);
  }

  // Hito
  const meses = fmt.mesesDesde(cliente.fecha_inicio);
  if (meses === 3 || meses === 6 || meses === 12 || (meses && meses % 12 === 0)) {
    partes.push(`🎉 Cumple ${meses} mes${meses > 1 ? 'es' : ''} contigo.`);
  }

  // Cumpleaños
  const diasCumple = helpers.diasHastaCumple(cliente.fecha_nacimiento);
  if (diasCumple !== null && diasCumple <= 7) {
    partes.push(`🎂 Cumple años en ${diasCumple} día(s).`);
  }

  return partes.length ? partes.join(' ') : 'Sin contexto especial. Saludo y avance normal.';
}

// =====================================================
// TOAST + MODAL
// =====================================================
function toast(msg, ms = 2200) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.add('hidden'), ms);
}
function openModal(html, opts = {}) {
  modalContent.innerHTML = html;
  modalBox.style.maxWidth = opts.wide ? '64rem' : '42rem';
  modal.classList.remove('hidden');
}
function closeModal() { modal.classList.add('hidden'); modalContent.innerHTML = ''; }
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
window.closeModal = closeModal;

function modalShell(title, body, footer = '') {
  return `
    <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
      <h3 class="font-bold text-slate-900">${title}</h3>
      <button class="btn btn-ghost" onclick="closeModal()">✕</button>
    </div>
    <div class="p-6">${body}</div>
    ${footer ? `<div class="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2 sticky bottom-0">${footer}</div>` : ''}
  `;
}

// =====================================================
// AUTH
// =====================================================
async function checkSession() {
  const { data: { session } } = await sb.auth.getSession();
  bootScreen.classList.add('hidden');
  if (session) {
    await loadSettings();
    loginScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    navigate('dashboard');
    sincronizarAccesoApps();   // mantiene al día la lista de acceso de las apps (no bloquea)
  } else {
    appScreen.classList.add('hidden');
    loginScreen.classList.remove('hidden');
  }
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#login-email').value.trim();
  const password = $('#login-pass').value;
  const err = $('#login-error');
  err.classList.add('hidden');
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { err.textContent = error.message; err.classList.remove('hidden'); return; }
  checkSession();
});

$('#logout-btn').addEventListener('click', async () => {
  await sb.auth.signOut();
  location.reload();
});

async function loadSettings() {
  const { data } = await sb.from('settings').select('*').maybeSingle();
  if (data) _settings = {
    usd_cop_rate: Number(data.usd_cop_rate) || 4000,
    nombre_coach: data.nombre_coach || 'Coach',
    mealtracker_url: data.mealtracker_url || '',
    mealtracker_anon_key: data.mealtracker_anon_key || '',
    mealtracker_app_url: data.mealtracker_app_url || '',
    mealtracker_coach_password: data.mealtracker_coach_password || '',
  };
}

// =====================================================
// DATA LAYER
// =====================================================
const db = {
  clientes: {
    async list() {
      if (_clientesCache) return _clientesCache;
      const { data } = await sb.from('clientes').select('*').order('nombre');
      _clientesCache = data || [];
      return _clientesCache;
    },
    async refresh() { _clientesCache = null; return db.clientes.list(); },
    async get(id) { const { data } = await sb.from('clientes').select('*').eq('id', id).single(); return data; },
    async insert(row) { const { data, error } = await sb.from('clientes').insert(row).select().single(); if (error) toast(error.message); _clientesCache = null; return data; },
    async update(id, row) { const { error } = await sb.from('clientes').update(row).eq('id', id); if (error) toast(error.message); _clientesCache = null; },
    async remove(id) { await sb.from('clientes').delete().eq('id', id); _clientesCache = null; },
  },
  pagos: {
    async listAnio(anio) {
      const { data } = await sb.from('pagos').select('*').gte('mes', `${anio}-01`).lte('mes', `${anio}-12`);
      return data || [];
    },
    async listMes(mes) {
      const { data } = await sb.from('pagos').select('*, clientes(nombre, moneda)').eq('mes', mes);
      return data || [];
    },
    async upsert(row) {
      const { data, error } = await sb.from('pagos').upsert(row, { onConflict: 'user_id,cliente_id,mes' }).select().single();
      if (error) toast(error.message);
      return data;
    },
    async update(id, row) { await sb.from('pagos').update(row).eq('id', id); },
    async remove(id) { await sb.from('pagos').delete().eq('id', id); },
  },
  seguimientos: {
    async listCliente(cliente_id) {
      const { data } = await sb.from('seguimientos').select('*').eq('cliente_id', cliente_id).order('semana', { ascending: false });
      return data || [];
    },
    async listSemana(semana) {
      const { data } = await sb.from('seguimientos').select('*, clientes(nombre)').eq('semana', semana);
      return data || [];
    },
    async listAll() {
      const { data } = await sb.from('seguimientos').select('*');
      return data || [];
    },
    async get(id) { const { data } = await sb.from('seguimientos').select('*').eq('id', id).single(); return data; },
    async getByClienteSemana(cliente_id, semana) {
      const { data } = await sb.from('seguimientos').select('*').eq('cliente_id', cliente_id).eq('semana', semana).maybeSingle();
      return data;
    },
    async upsert(row) {
      const { data, error } = await sb.from('seguimientos').upsert(row, { onConflict: 'user_id,cliente_id,semana' }).select().single();
      if (error) toast(error.message);
      return data;
    },
    async remove(id) { await sb.from('seguimientos').delete().eq('id', id); },
  },
  pendientes: {
    async list() { const { data } = await sb.from('pendientes').select('*, clientes(nombre)').order('estado').order('fecha_limite', { nullsFirst: false }); return data || []; },
    async listCliente(cliente_id) { const { data } = await sb.from('pendientes').select('*').eq('cliente_id', cliente_id).order('estado').order('fecha_limite'); return data || []; },
    async listAbiertos() { const { data } = await sb.from('pendientes').select('*, clientes(nombre)').eq('estado', 'abierto').order('fecha_limite'); return data || []; },
    async insert(row) { const { data, error } = await sb.from('pendientes').insert(row).select().single(); if (error) toast(error.message); return data; },
    async update(id, row) { await sb.from('pendientes').update(row).eq('id', id); },
    async toggle(id, estadoActual) {
      const nuevo = estadoActual === 'completado' ? 'abierto' : 'completado';
      await sb.from('pendientes').update({ estado: nuevo, completado_en: nuevo === 'completado' ? fmt.hoy() : null }).eq('id', id);
      return nuevo;
    },
    async hacerGeneral(id) { await sb.from('pendientes').update({ scope: 'general', seguimiento_id: null }).eq('id', id); },
    async remove(id) { await sb.from('pendientes').delete().eq('id', id); },
  },
  mediciones: {
    async listCliente(cliente_id) {
      const { data } = await sb.from('mediciones_corporales').select('*').eq('cliente_id', cliente_id).order('fecha', { ascending: true });
      return data || [];
    },
    async insert(row) {
      const { data, error } = await sb.from('mediciones_corporales').insert(row).select().single();
      if (error) toast(error.message);
      return data;
    },
    async update(id, row) { await sb.from('mediciones_corporales').update(row).eq('id', id); },
    async remove(id) { await sb.from('mediciones_corporales').delete().eq('id', id); },
  },
  settings: {
    async save(s) {
      const { data: { user } } = await sb.auth.getUser();
      const { error } = await sb.from('settings').upsert({ user_id: user.id, ...s, updated_at: new Date().toISOString() });
      if (error) toast(error.message);
      else _settings = { ..._settings, ...s };
    },
  },
};

function copConv(monto, moneda) {
  return moneda === 'USD' ? Number(monto || 0) * _settings.usd_cop_rate : Number(monto || 0);
}

// =====================================================
// ROUTER
// =====================================================
const routes = {};
let _currentView = 'dashboard';
function navigate(name) {
  _currentView = routes[name] ? name : 'dashboard';
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  (routes[name] || routes.dashboard)();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
// Re-renderiza la vista actual sin saltar el scroll (para toggles de checkboxes)
function rerenderView() { (routes[_currentView] || routes.dashboard)(); }
$$('.nav-item').forEach(b => b.addEventListener('click', () => navigate(b.dataset.view)));

// =====================================================
// VIEW: DASHBOARD
// =====================================================
routes.dashboard = async () => {
  view.innerHTML = '<div class="card">Cargando…</div>';
  const hoy = fmt.hoy();
  const mes = fmt.mesActual();
  const semana = fmt.semanaISO();
  const en7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const [clientes, pagosMes, segSemana, pendAbiertos, allSegs] = await Promise.all([
    db.clientes.list(),
    db.pagos.listMes(mes),
    db.seguimientos.listSemana(semana),
    db.pendientes.listAbiertos(),
    db.seguimientos.listAll(),
  ]);

  const activos = clientes.filter(c => c.estado === 'activo');
  const conSeg = new Set(segSemana.map(s => s.cliente_id));
  const faltaSeguimiento = activos.filter(c => !conSeg.has(c.id))
    .map(c => {
      const segCli = allSegs.filter(s => s.cliente_id === c.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
      const dias = segCli.length ? fmt.diasDesde(segCli[0].fecha) : fmt.diasDesde(c.fecha_inicio || c.created_at?.slice(0, 10));
      return { ...c, dias_desde: dias };
    })
    .sort((a, b) => (b.dias_desde || 999) - (a.dias_desde || 999));

  // Cobrado y pendiente del mes
  const pagadosMes = pagosMes.filter(p => p.pagado);
  const cobrado = pagadosMes.reduce((s, p) => s + copConv(p.monto, p.moneda), 0);
  const porCobrar = activos.reduce((s, c) => {
    const p = pagosMes.find(pp => pp.cliente_id === c.id);
    if (p && p.pagado) return s;
    // Si hay un pago pendiente registrado, usar su monto; si no, el de la ficha
    const monto = p && Number(p.monto) > 0 ? p.monto : c.monto;
    const moneda = (p && p.moneda) || c.moneda;
    return s + copConv(monto, moneda);
  }, 0);

  // Vencidos: cliente activo cuyo día_pago ya pasó este mes y no tiene pago marcado
  const diaHoy = new Date().getDate();
  const vencidos = activos.filter(c => {
    if (!c.dia_pago || c.dia_pago > diaHoy) return false;
    const p = pagosMes.find(pp => pp.cliente_id === c.id);
    return !p || !p.pagado;
  }).map(c => ({ ...c, dias_vencido: Math.max(0, diaHoy - c.dia_pago) }))
    .filter(c => c.dias_vencido > (c.dias_gracia || 0));

  // Próximos 7 días
  const proximos = activos.filter(c => {
    if (!c.dia_pago) return false;
    const diff = c.dia_pago - diaHoy;
    return diff > 0 && diff <= 7;
  }).map(c => ({ ...c, dias_falta: c.dia_pago - diaHoy }));

  // Clientes en riesgo
  const enRiesgo = clientes.filter(c => helpers.enRiesgo(c, allSegs));

  // Cumpleaños semana
  const cumples = clientes.filter(c => {
    if (!c.fecha_nacimiento) return false;
    const d = helpers.diasHastaCumple(c.fecha_nacimiento);
    return d !== null && d <= 7;
  }).sort((a, b) => helpers.diasHastaCumple(a.fecha_nacimiento) - helpers.diasHastaCumple(b.fecha_nacimiento));

  const total = cobrado + porCobrar;
  const pct = total > 0 ? Math.round((cobrado / total) * 100) : 0;

  view.innerHTML = `
    <div class="mb-6">
      <h2 class="text-2xl font-bold text-slate-900">Hola, ${escapeHtml(_settings.nombre_coach)} 👋</h2>
      <p class="text-sm text-slate-500">${new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })} · semana ${semana.split('-W')[1]} · 1 USD = COP ${_settings.usd_cop_rate.toLocaleString('es-CO')}</p>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div class="card">
        <div class="flex items-center justify-between mb-2"><span class="text-xs font-semibold text-slate-500 uppercase">Activos</span><span class="text-lg">👥</span></div>
        <div class="text-3xl font-bold">${activos.length}</div>
        <div class="text-xs text-slate-500 mt-1">${clientes.filter(c => c.estado === 'pausa').length} en pausa</div>
      </div>
      <div class="card">
        <div class="flex items-center justify-between mb-2"><span class="text-xs font-semibold text-slate-500 uppercase">Cobrado mes</span><span class="text-lg">💰</span></div>
        <div class="text-2xl font-bold text-emerald-600">${fmt.moneyCop(cobrado)}</div>
        <div class="text-xs text-slate-500 mt-1">${pagadosMes.length} pagos · ${pct}% del mes</div>
      </div>
      <div class="card">
        <div class="flex items-center justify-between mb-2"><span class="text-xs font-semibold text-slate-500 uppercase">Por cobrar</span><span class="text-lg">⏳</span></div>
        <div class="text-2xl font-bold text-amber-600">${fmt.moneyCop(porCobrar)}</div>
        <div class="text-xs text-slate-500 mt-1">${activos.length - pagadosMes.length} pendientes</div>
      </div>
      <div class="card">
        <div class="flex items-center justify-between mb-2"><span class="text-xs font-semibold text-slate-500 uppercase">En riesgo</span><span class="text-lg">⚠️</span></div>
        <div class="text-3xl font-bold text-red-600">${enRiesgo.length}</div>
        <div class="text-xs text-slate-500 mt-1">requieren atención</div>
      </div>
    </div>

    <!-- Bandeja semanal -->
    <div class="card mb-6">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 class="font-bold text-slate-900 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-emerald-500"></span>Bandeja de la semana</h3>
        <div class="text-xs text-slate-500"><strong class="text-slate-900">${activos.length - faltaSeguimiento.length}</strong> hechos · <strong class="text-amber-600">${faltaSeguimiento.length}</strong> faltan</div>
      </div>
      ${faltaSeguimiento.length === 0
        ? '<p class="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-xl">✓ ¡Todo al día! No queda nadie sin seguimiento esta semana.</p>'
        : `<div class="space-y-2">${faltaSeguimiento.slice(0, 8).map(c => `
            <div class="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl cursor-pointer" onclick="abrirNuevoSeguimiento('${c.id}')">
              ${helpers.avatar(c.nombre, 10)}
              <div class="flex-1 min-w-0">
                <div class="font-medium text-sm truncate">${escapeHtml(c.nombre)}</div>
                <div class="text-xs ${(c.dias_desde || 999) > 14 ? 'text-red-600' : 'text-slate-500'}">${c.dias_desde !== null ? `Último seguimiento hace ${c.dias_desde} días` : 'Sin seguimientos previos'}</div>
              </div>
              <button class="btn btn-primary btn-sm">Registrar</button>
            </div>
          `).join('')}
          ${faltaSeguimiento.length > 8 ? `<p class="text-xs text-slate-500 text-center pt-2">+ ${faltaSeguimiento.length - 8} más en Seguimiento</p>` : ''}
        </div>`}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">

      ${vencidos.length > 0 ? `
        <div class="card">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-slate-900 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-red-500"></span>Pagos vencidos</h3>
            <span class="tag tag-red">${vencidos.length}</span>
          </div>
          <div class="space-y-2">
            ${vencidos.map(c => `
              <div class="flex items-center justify-between p-3 bg-red-50 rounded-xl">
                <div class="flex items-center gap-3 flex-1 min-w-0">
                  ${helpers.avatar(c.nombre, 9)}
                  <div class="min-w-0">
                    <div class="font-medium text-sm truncate">${escapeHtml(c.nombre)}</div>
                    <div class="text-xs text-red-700">Día ${c.dia_pago} · ${fmt.money(c.monto, c.moneda)}</div>
                  </div>
                </div>
                <button class="btn btn-ghost btn-sm" title="Copiar recordatorio de pago para WhatsApp" onclick="copiarRecordatorioPago('${c.id}')">💬</button>
                <button class="btn btn-dark btn-sm" onclick="marcarPagoRapido('${c.id}')">Marcar pagado</button>
              </div>`).join('')}
          </div>
        </div>` : ''}

      ${proximos.length > 0 ? `
        <div class="card">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-slate-900 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-amber-500"></span>Próximos 7 días</h3>
            <span class="tag tag-yellow">${proximos.length}</span>
          </div>
          <div class="space-y-2">
            ${proximos.map(c => `
              <div class="flex items-center justify-between p-3 bg-amber-50 rounded-xl">
                <div class="flex items-center gap-3 flex-1 min-w-0">
                  ${helpers.avatar(c.nombre, 9)}
                  <div class="min-w-0">
                    <div class="font-medium text-sm truncate">${escapeHtml(c.nombre)}</div>
                    <div class="text-xs text-amber-700">En ${c.dias_falta} día(s) · ${fmt.money(c.monto, c.moneda)}</div>
                  </div>
                </div>
                <button class="btn btn-dark btn-sm" onclick="marcarPagoRapido('${c.id}')">Marcar</button>
              </div>`).join('')}
          </div>
        </div>` : ''}

      ${enRiesgo.length > 0 ? `
        <div class="card">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-slate-900 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-orange-500"></span>Clientes en riesgo</h3>
            <span class="tag tag-orange">${enRiesgo.length}</span>
          </div>
          <div class="space-y-2">
            ${enRiesgo.slice(0, 5).map(c => `
              <div class="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl cursor-pointer" onclick="abrirNuevoSeguimiento('${c.id}')">
                ${helpers.avatar(c.nombre, 9)}
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-sm truncate">${escapeHtml(c.nombre)}</div>
                  <div class="text-xs text-orange-700">Reactivar contacto</div>
                </div>
                <button class="btn btn-secondary btn-sm">Abrir</button>
              </div>`).join('')}
          </div>
        </div>` : ''}

      ${pendAbiertos.length > 0 ? `
        <div class="card">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-slate-900 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-violet-500"></span>Pendientes urgentes</h3>
            <span class="tag tag-violet">${pendAbiertos.length}</span>
          </div>
          <div class="space-y-2">
            ${pendAbiertos.slice(0, 5).map(p => `
              <div class="flex items-start gap-3 p-3 hover:bg-slate-50 rounded-xl">
                <input type="checkbox" class="mt-1 rounded" onchange="togglePendienteDash('${p.id}', '${p.estado}')">
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-sm">${escapeHtml(p.descripcion)}</div>
                  <div class="text-xs text-slate-500">${p.para === 'coach' ? '🧢 Tuyo' : escapeHtml(p.clientes?.nombre || '')} · ${p.scope === 'semana' ? '<span class="text-violet-600 font-semibold">Semanal</span>' : '<span class="text-emerald-600 font-semibold">General</span>'} ${p.fecha_limite ? '· vence ' + fmt.fechaCorta(p.fecha_limite) : ''}</div>
                </div>
                <span class="tag ${p.prioridad === 'alta' ? 'tag-red' : p.prioridad === 'baja' ? 'tag-gray' : 'tag-yellow'}">${p.prioridad}</span>
              </div>`).join('')}
          </div>
        </div>` : ''}

      ${cumples.length > 0 ? `
        <div class="card">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-slate-900 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-pink-500"></span>Cumpleaños esta semana</h3>
            <span class="tag tag-violet">${cumples.length}</span>
          </div>
          <div class="space-y-2">
            ${cumples.map(c => {
              const d = helpers.diasHastaCumple(c.fecha_nacimiento);
              return `
              <div class="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl">
                ${helpers.avatar(c.nombre, 9)}
                <div class="flex-1">
                  <div class="font-medium text-sm">${escapeHtml(c.nombre)}</div>
                  <div class="text-xs text-pink-700">🎂 ${d === 0 ? '¡Hoy!' : d === 1 ? 'Mañana' : `En ${d} días`}</div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>` : ''}

    </div>
  `;
};

window.abrirNuevoSeguimiento = async (clienteId) => {
  await abrirModalSeguimiento(clienteId, fmt.semanaISO());
};

window.togglePendienteDash = async (id, estado) => {
  await db.pendientes.toggle(id, estado);
  rerenderView();
};

// Genera y copia un recordatorio de pago amable para pegar en WhatsApp
window.copiarRecordatorioPago = async (clienteId) => {
  const c = await db.clientes.get(clienteId);
  if (!c) return;
  const nombre = (c.nombre || '').split(' ')[0];
  const partes = [
    `Hola ${nombre}! 👋`,
    '',
    `Te escribo para recordarte la mensualidad de ${fmt.mesEsLargo(fmt.mesActual())} (${fmt.money(c.monto, c.moneda)}).`,
  ];
  if (c.metodo_pago_preferido) partes.push(`Puedes hacerlo por ${c.metodo_pago_preferido === 'paypal' ? 'PayPal' : 'transferencia'} como siempre.`);
  partes.push('', 'Cualquier cosa me dices. ¡Seguimos con toda! 💪');
  const texto = partes.join('\n');
  try {
    await navigator.clipboard.writeText(texto);
    toast('✓ Recordatorio copiado, pégalo en WhatsApp');
  } catch (e) {
    prompt('Copia manualmente:', texto);
  }
};

window.marcarPagoRapido = async (clienteId) => {
  const cliente = await db.clientes.get(clienteId);
  const mes = fmt.mesActual();
  openModal(modalShell(`Registrar pago · ${escapeHtml(cliente.nombre)}`, `
    <div class="space-y-3">
      <div class="bg-slate-50 rounded-xl p-3 text-sm">
        Mes: <strong>${fmt.mesEsLargo(mes)}</strong> · Monto sugerido: <strong>${fmt.money(cliente.monto, cliente.moneda)}</strong>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div><label>Monto</label><input id="pg-monto" type="number" step="0.01" value="${cliente.monto || ''}"></div>
        <div><label>Moneda</label>
          <select id="pg-moneda">
            <option value="COP" ${(cliente.moneda || 'COP') === 'COP' ? 'selected' : ''}>COP</option>
            <option value="USD" ${cliente.moneda === 'USD' ? 'selected' : ''}>USD</option>
          </select>
        </div>
        <div><label>Fecha del pago</label><input id="pg-fecha" type="date" value="${fmt.hoy()}"></div>
        <div><label>Método</label><input id="pg-metodo" placeholder="${cliente.metodo_pago_preferido || 'Transferencia, Nequi…'}" value="${cliente.metodo_pago_preferido || ''}"></div>
      </div>
      <div><label>Nota</label><input id="pg-nota" placeholder="(opcional)"></div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="confirmarPagoRapido('${clienteId}', '${mes}')">Guardar pago</button>
  `));
};

window.confirmarPagoRapido = async (clienteId, mes) => {
  await db.pagos.upsert({
    cliente_id: clienteId, mes, pagado: true,
    monto: Number($('#pg-monto').value) || 0,
    moneda: $('#pg-moneda').value,
    fecha_pago: $('#pg-fecha').value || fmt.hoy(),
    metodo: $('#pg-metodo').value || null,
    nota: $('#pg-nota').value || null,
  });
  closeModal();
  toast('Pago registrado');
  rerenderView();
};

// =====================================================
// VIEW: SEGUIMIENTO
// =====================================================
// ===== Tandas de seguimiento =====
// Reparte los clientes ACTIVOS en tandas por día, en orden alfabético (el
// mismo orden de Trainerize), para no revisar a todos de una: 2 tandas
// (Lun · Jue) con pocos activos, 3 (Lun · Mié · Vie) con más de 8.
const TANDA_DIAS = { 2: [['Lunes', 1], ['Jueves', 4]], 3: [['Lunes', 1], ['Miércoles', 3], ['Viernes', 5]] };
window.setSegTandas = (v) => { localStorage.setItem('seg_tandas', v); routes.seguimiento(); };

function renderTandasBanner(clientes, allSegs) {
  const activos = clientes.filter(c => c.estado === 'activo')
    .slice().sort((a, b) => normalizeName(a.nombre).localeCompare(normalizeName(b.nombre)));
  if (!activos.length) return '';
  const cfg = localStorage.getItem('seg_tandas') || 'auto';
  const nAuto = activos.length > 8 ? 3 : 2;
  const n = cfg === 'auto' ? nAuto : Number(cfg);
  const semanaAct = fmt.semanaISO();
  const hechosSemana = new Set(allSegs.filter(s => s.semana === semanaAct).map(s => s.cliente_id));
  const porTanda = Math.ceil(activos.length / n);
  const hoyDow = new Date().getDay();
  const grupos = TANDA_DIAS[n].map(([label, dow], i) => ({ label, dow, lista: activos.slice(i * porTanda, (i + 1) * porTanda) }));
  const totalHechos = activos.filter(c => hechosSemana.has(c.id)).length;
  return `
    <div class="card mb-4">
      <div class="flex items-baseline justify-between flex-wrap gap-2 mb-3">
        <div class="text-xs font-bold text-slate-600 uppercase">📋 Tandas de la semana · orden alfabético (igual que Trainerize) · ${totalHechos}/${activos.length} hechos</div>
        <select class="!w-auto !py-1 text-xs" onchange="setSegTandas(this.value)" title="En cuántos días repartes los seguimientos">
          <option value="auto" ${cfg === 'auto' ? 'selected' : ''}>Auto (${nAuto} tandas)</option>
          <option value="2" ${cfg === '2' ? 'selected' : ''}>2 tandas · Lun y Jue</option>
          <option value="3" ${cfg === '3' ? 'selected' : ''}>3 tandas · Lun, Mié y Vie</option>
        </select>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-${n} gap-3">
        ${grupos.map(g => {
          const hechos = g.lista.filter(c => hechosSemana.has(c.id)).length;
          const esHoy = g.dow === hoyDow;
          const completa = g.lista.length > 0 && hechos === g.lista.length;
          return `
          <div class="rounded-xl p-3 ${esHoy ? 'bg-emerald-50 ring-2 ring-emerald-300' : 'bg-slate-50 ring-1 ring-slate-200'}">
            <div class="flex justify-between items-baseline mb-2">
              <span class="text-xs font-bold ${esHoy ? 'text-emerald-800' : 'text-slate-600'}">${g.label}${esHoy ? ' · HOY 👈' : ''}</span>
              <span class="text-xs font-bold ${completa ? 'text-emerald-600' : 'text-slate-400'}">${hechos}/${g.lista.length}${completa ? ' 🎉' : ''}</span>
            </div>
            <div class="space-y-1">
              ${g.lista.map(c => {
                const done = hechosSemana.has(c.id);
                return `
                <button class="w-full text-left text-xs px-2 py-1.5 rounded-lg flex items-center gap-2 ${done ? 'text-slate-400 bg-white/60' : 'bg-white hover:bg-emerald-100 text-slate-700 font-medium'}" onclick="abrirNuevoSeguimiento('${c.id}')" title="${done ? 'Semana ya registrada · click para revisar o editar' : 'Registrar la semana de ' + escapeHtml(c.nombre)}">
                  <span>${done ? '✅' : '○'}</span><span class="truncate">${escapeHtml(c.nombre)}</span>
                </button>`;
              }).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

routes.seguimiento = async () => {
  view.innerHTML = '<div class="card">Cargando…</div>';
  const [clientes, allSegs] = await Promise.all([db.clientes.list(), db.seguimientos.listAll()]);
  if (!_selectedClienteId && clientes.length) _selectedClienteId = clientes.find(c => c.estado === 'activo')?.id || clientes[0].id;

  // Calcular última semana por cliente
  const ultPorCliente = {};
  for (const s of allSegs) {
    if (!ultPorCliente[s.cliente_id] || s.fecha > ultPorCliente[s.cliente_id].fecha) ultPorCliente[s.cliente_id] = s;
  }

  view.innerHTML = `
    <div class="flex items-baseline justify-between mb-5 flex-wrap gap-3">
      <div>
        <h2 class="text-2xl font-bold text-slate-900">Seguimiento</h2>
        <p class="text-sm text-slate-500">Bitácora semanal por cliente</p>
      </div>
      <div class="flex items-center gap-3 flex-wrap">
        <div class="bg-slate-200 rounded-xl p-1 flex gap-1">
          <button class="toggle-btn ${_segView === 'focus' ? 'active' : ''}" onclick="switchSegView('focus')">Por cliente</button>
          <button class="toggle-btn ${_segView === 'board' ? 'active' : ''}" onclick="switchSegView('board')">Vista panel</button>
        </div>
        <button class="btn btn-primary" onclick="abrirNuevoSeguimiento(_selectedClienteId)">+ Nueva semana</button>
      </div>
    </div>
    ${renderTandasBanner(clientes, allSegs)}
    <div id="seg-content"></div>
  `;

  if (_segView === 'focus') renderSegFocus(clientes, allSegs, ultPorCliente);
  else renderSegBoard(clientes, allSegs);
};

window.switchSegView = (which) => { _segView = which; routes.seguimiento(); };

function renderSegFocus(clientes, allSegs, ultPorCliente) {
  const cliente = clientes.find(c => c.id === _selectedClienteId);
  const segs = allSegs.filter(s => s.cliente_id === _selectedClienteId).sort((a, b) => b.semana.localeCompare(a.semana));
  const ordenados = clientes.slice().sort(sortByEstado);

  const sidebar = `
    <aside class="col-span-12 lg:col-span-4 card h-fit">
      <div class="relative mb-3">
        <input id="seg-buscar" class="pl-9" placeholder="Buscar cliente…" oninput="filtrarClientesSidebar(this.value)">
        <span class="absolute left-3 top-2.5 text-slate-400 text-sm">🔍</span>
      </div>
      <div id="seg-list" class="space-y-1 max-h-[600px] overflow-y-auto scrollbar-thin">
        ${ordenados.map(c => clienteSidebarItem(c, ultPorCliente[c.id])).join('')}
      </div>
    </aside>
  `;

  if (!cliente) {
    $('#seg-content').innerHTML = sidebar + '<div class="col-span-12 lg:col-span-8 card text-slate-500">Selecciona un cliente.</div>';
    return;
  }

  // Promedio últimas 4 semanas
  const prom = segs.slice(0, 4).map(helpers.promedioAdh).filter(v => v !== null);
  const promAdh = prom.length ? prom.reduce((a, b) => a + b, 0) / prom.length : null;

  // Tendencia
  let tend = '→';
  let tendColor = 'text-slate-500';
  if (segs.length >= 2) {
    const a = helpers.promedioAdh(segs[0]);
    const b = helpers.promedioAdh(segs[1]);
    if (a !== null && b !== null) {
      if (a > b + 0.3) { tend = '↗'; tendColor = 'text-emerald-600'; }
      else if (a < b - 0.3) { tend = '↘'; tendColor = 'text-red-600'; }
    }
  }

  // Sparkline
  const points = segs.slice(0, 8).reverse().map(helpers.promedioAdh).filter(v => v !== null);
  const sparkPoints = points.length >= 2 ? points.map((v, i) => `${(i / (points.length - 1)) * 100},${24 - v * 2.4}`).join(' ') : '';

  $('#seg-content').innerHTML = `
    <div class="grid grid-cols-12 gap-4">
      ${sidebar}
      <div class="col-span-12 lg:col-span-8 space-y-4">
        ${clienteHeaderCard(cliente, segs, promAdh, tend, tendColor, sparkPoints)}

        <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider px-1 pt-2">Timeline · ${segs.length} semana(s)</h4>
        <div class="space-y-3">
          ${segs.length === 0 ? '<div class="card text-sm text-slate-500 text-center py-8">Sin registros aún. <button class="text-emerald-600 font-semibold" onclick="abrirNuevoSeguimiento(\''+cliente.id+'\')">+ Crear el primero</button></div>' : segs.map(s => seguimientoCard(s)).join('')}
        </div>
      </div>
    </div>
  `;
}

function clienteSidebarItem(c, ult) {
  const dias = ult ? fmt.diasDesde(ult.fecha) : null;
  let dot = 'bg-slate-300';
  let label = 'Sin registros';
  if (ult) {
    if (dias <= 7) { dot = 'bg-emerald-500'; label = `Última: ${fmt.labelSemana(ult.semana)} · hace ${dias}d`; }
    else if (dias <= 14) { dot = 'bg-amber-500'; label = `Última: ${fmt.labelSemana(ult.semana)} · hace ${dias}d`; }
    else { dot = 'bg-red-500'; label = `Sin registro hace ${dias}d`; }
  }
  const active = c.id === _selectedClienteId;
  return `
    <button class="w-full flex items-center gap-3 p-2.5 rounded-xl ${active ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'hover:bg-slate-50'}" onclick="seleccionarCliente('${c.id}')" data-nombre="${escapeHtml(c.nombre.toLowerCase())}">
      ${helpers.avatar(c.nombre, 10)}
      <div class="flex-1 text-left min-w-0">
        <div class="font-medium text-sm text-slate-900 truncate">${escapeHtml(c.nombre)}${c.estado !== 'activo' ? ` <span class="text-xs text-slate-400">(${c.estado})</span>` : ''}</div>
        <div class="text-xs truncate ${dias > 14 ? 'text-red-600' : 'text-slate-500'}">${label}</div>
      </div>
      <span class="w-2 h-2 rounded-full ${dot} flex-shrink-0"></span>
    </button>
  `;
}

window.filtrarClientesSidebar = (q) => {
  const ql = q.toLowerCase().trim();
  $$('#seg-list button').forEach(b => {
    b.style.display = !ql || b.dataset.nombre.includes(ql) ? '' : 'none';
  });
};

window.seleccionarCliente = (id) => { _selectedClienteId = id; routes.seguimiento(); };

function clienteHeaderCard(c, segs, promAdh, tend, tendColor, sparkPoints) {
  const edad = helpers.edadDe(c.fecha_nacimiento);
  const semanas = segs.length;
  const inicio = c.fecha_inicio ? fmt.fecha(c.fecha_inicio) : '—';

  // Últimas 8 semanas (más antiguas a la izquierda) · scores 0-100
  // Fallback: si la semana no tiene score calculado, usar la adherencia subjetiva ×10
  const ult8 = segs.slice(0, 8).reverse();
  const labels = ult8.map(s => fmt.labelSemana(s.semana));
  const scoreDe = (s, scoreCampo, adhCampo) =>
    s[scoreCampo] != null ? s[scoreCampo] : (s[adhCampo] != null ? s[adhCampo] * 10 : null);
  const ptsEnt = ult8.map(s => scoreDe(s, 'score_entreno', 'adherencia_entreno'));
  const ptsAli = ult8.map(s => scoreDe(s, 'score_alim_metas', 'adherencia_alimentacion'));
  const ptsGlob = ult8.map(s => s.score_global ?? null);
  const hayDatos = ult8.length >= 2 && [...ptsEnt, ...ptsAli, ...ptsGlob].some(v => v !== null);

  // Promedios desglosados últimas 4 sem
  const promDim = (campo) => {
    const vals = segs.slice(0, 4).map(s => s[campo]).filter(v => v !== null && v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const pEnt = promDim('adherencia_entreno');
  const pAli = promDim('adherencia_alimentacion');

  // Scores promedio últimas 4 sem (objetivos %)
  const promScore = (campo) => {
    const vals = segs.slice(0, 4).map(s => s[campo]).filter(v => v !== null && v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const sEnt = promScore('score_entreno');
  const sAlimMetas = promScore('score_alim_metas');
  const sAlimReg = promScore('score_alim_registro');

  const alignBar = (label, adherencia, score, color) => {
    const adhVal = adherencia !== null ? adherencia.toFixed(1) : '—';
    const scorePct = score !== null ? Math.round(score) : null;
    const barWidth = score !== null ? Math.round(score) : (adherencia !== null ? adherencia * 10 : 0);
    const barColor = barWidth >= 75 ? 'bg-emerald-500' : barWidth >= 50 ? 'bg-amber-500' : 'bg-red-500';
    return `<div class="flex-1 min-w-[140px]">
      <div class="flex items-center justify-between mb-1">
        <span class="text-xs font-semibold text-slate-600">${label}</span>
        <span class="text-xs font-bold" style="color:${color}">${scorePct !== null ? scorePct + '%' : adhVal + '/10'}</span>
      </div>
      <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div class="h-full rounded-full ${barColor}" style="width:${barWidth}%"></div>
      </div>
      ${scorePct !== null && adherencia !== null ? `<div class="text-right text-[10px] text-slate-400 mt-0.5">subjetivo: ${adhVal}/10</div>` : ''}
    </div>`;
  };

  return `
    <div class="card">
      <div class="flex items-start gap-4 flex-wrap">
        ${helpers.avatarBig(c.nombre)}
        <div class="flex-1 min-w-0">
          <h3 class="text-xl font-bold text-slate-900">${escapeHtml(c.nombre)}</h3>
          <div class="flex gap-2 mt-1 text-xs text-slate-500 flex-wrap">
            ${edad ? `<span>${edad} años</span><span>·</span>` : ''}
            ${c.ciudad ? `<span>${escapeHtml(c.ciudad)}</span><span>·</span>` : ''}
            <span>Inició ${inicio} · ${semanas} sem</span>
            <span>·</span>
            <span>${fmt.money(c.monto, c.moneda)}/mes · día ${c.dia_pago || '—'}</span>
            ${metaDiasEntreno(c) ? `<span>·</span><span>📆 ${metaDiasEntreno(c)} días/sem${(c.dias_entreno || []).length ? ` (${c.dias_entreno.join('·')})` : ''}</span>` : ''}
          </div>
          ${c.objetivo ? `<p class="text-xs text-slate-600 mt-2 italic">🎯 ${escapeHtml(c.objetivo)}</p>` : ''}
          ${c.restricciones_lesiones ? `<p class="text-xs text-red-700 mt-1">⚕️ ${escapeHtml(c.restricciones_lesiones)}</p>` : ''}
          ${(c.tags && c.tags.length) ? `<div class="mt-2">${c.tags.map(t => `<span class="tag-pill">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        </div>
        <div class="text-right">
          <div class="text-xs text-slate-500">Adherencia 4 sem</div>
          <div class="text-2xl font-bold ${promAdh === null ? 'text-slate-400' : promAdh >= 7.5 ? 'text-emerald-600' : promAdh >= 5 ? 'text-amber-600' : 'text-red-600'}">${promAdh === null ? '—' : promAdh.toFixed(1)}<span class="text-sm text-slate-400">/10</span></div>
          <div class="text-xs ${tendColor} font-semibold mt-0.5">${tend}</div>
        </div>
      </div>

      ${hayDatos ? `
      <div class="mt-5 pt-5 border-t border-slate-100">
        <div class="flex items-baseline justify-between mb-2 flex-wrap gap-2">
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider">Scores últimas 8 semanas (%)</h4>
          <div>
            ${legendDot('#10b981', 'Entreno')}
            ${legendDot('#3b82f6', 'Alimentación')}
            ${legendDot('#0f172a', 'Global')}
          </div>
        </div>
        ${lineChart([
          { label: 'Entreno', color: '#10b981', points: ptsEnt },
          { label: 'Alimentación', color: '#3b82f6', points: ptsAli },
          { label: 'Global', color: '#0f172a', points: ptsGlob },
        ], labels, { height: 170, yMax: 100 })}
      </div>` : ''}

      <div class="mt-4 pt-4 border-t border-slate-100">
        <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Alineación 4 semanas</h4>
        <div class="flex gap-4 flex-wrap">
          ${alignBar('Entrenamiento', pEnt, sEnt, '#10b981')}
          ${alignBar('Alimentación · metas', pAli, sAlimMetas, '#3b82f6')}
          ${alignBar('Alimentación · registro', null, sAlimReg, '#8b5cf6')}
        </div>
      </div>

      ${c.meta_calorias ? `
      <div class="mt-4 pt-4 border-t border-slate-100 bg-blue-50/50 -mx-5 -mb-5 px-5 py-3 rounded-b-2xl">
        <div class="text-xs font-bold text-blue-800 uppercase mb-1">🥗 Meta nutricional diaria</div>
        <div class="text-sm font-semibold text-blue-900">${c.meta_calorias} kcal · ${c.meta_proteina_g}g prote · ${c.meta_grasas_g}g grasas · ${c.meta_carbos_g}g carbos</div>
      </div>` : ''}

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-slate-100">
        <div><div class="text-xs text-slate-500 mb-1">Estado</div><div class="font-bold">${c.estado === 'activo' ? '<span class="text-emerald-600">● Activo</span>' : c.estado === 'pausa' ? '<span class="text-orange-600">● Pausa</span>' : '<span class="text-slate-500">● Finalizado</span>'}</div></div>
        <div><div class="text-xs text-slate-500 mb-1">Fase</div><div class="font-bold">${c.fase_programa ? (FASES_PROGRAMA.find(f => f.key === c.fase_programa)?.label || c.fase_programa) : '—'}</div></div>
        <div><div class="text-xs text-slate-500 mb-1">Lugar entreno</div><div class="font-bold capitalize">${c.lugar_entreno ? c.lugar_entreno.replace('_',' ') : '—'}</div></div>
        <div><div class="text-xs text-slate-500 mb-1">Ficha</div><button class="text-emerald-600 font-semibold text-sm hover:underline" onclick="verCliente('${c.id}')">Abrir perfil</button></div>
      </div>
    </div>
  `;
}

function seguimientoCard(s) {
  const prom = helpers.promedioAdh(s);
  const ring = prom === null ? '' : prom >= 7.5 ? 'ring-good' : prom >= 5 ? 'ring-mid' : 'ring-bad';
  const animos = { excelente: '🤩', bien: '😊', neutro: '😐', bajo: '😕', 'muy bajo': '😔' };
  const animo = animos[s.estado_animo] || '';
  const pctAsis = helpers.pctAsistencia(s);
  return `
    <div class="card card-hover ${ring} cursor-pointer" onclick="editarSeguimiento('${s.id}')">
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <span class="font-bold text-slate-900">${fmt.labelSemana(s.semana)}</span>
            <span class="text-xs text-slate-400">· ${fmt.fecha(s.fecha)}</span>
            ${pctAsis !== null ? `<span class="tag ${pctAsis >= 90 ? 'tag-green' : pctAsis >= 60 ? 'tag-yellow' : 'tag-red'}">📆 ${s.dias_asistidos}/${s.dias_planeados} días · ${pctAsis}%</span>` : ''}
          </div>
          ${s.avances ? `<p class="text-sm text-slate-700 mb-2 whitespace-pre-line">${escapeHtml(s.avances)}</p>` : '<p class="text-sm text-slate-400 italic">Sin avances escritos</p>'}
          ${s.pendientes_semana ? `<div class="bg-amber-50 rounded-lg px-3 py-2 mt-2"><div class="text-xs font-bold text-amber-800 mb-1">Le pediste:</div>${checklistHtml(s.pendientes_semana, s.id)}</div>` : ''}
          ${s.notas ? `<p class="text-xs text-slate-500 mt-2 whitespace-pre-line">📝 ${escapeHtml(s.notas)}</p>` : ''}
        </div>
        <div class="flex flex-col items-end gap-1 flex-shrink-0">
          ${prom !== null ? `<span class="tag ${prom >= 7.5 ? 'tag-green' : prom >= 5 ? 'tag-yellow' : 'tag-red'}" style="font-size:0.8rem; padding: 0.25rem 0.55rem; font-weight: 700">${prom.toFixed(1)}/10</span>` : ''}
          ${animo ? `<span class="text-xs text-slate-500">${animo} ${s.estado_animo}</span>` : ''}
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-100 text-xs">
        <div>
          <div class="flex items-center justify-between mb-1"><span class="text-slate-400">Entreno</span><span class="font-bold ${(s.adherencia_entreno || 0) >= 7 ? 'text-emerald-600' : (s.adherencia_entreno || 0) >= 4 ? 'text-amber-600' : 'text-red-600'}">${s.adherencia_entreno ?? '—'}/10</span></div>
          <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div class="h-full rounded-full ${(s.adherencia_entreno || 0) >= 7 ? 'bg-emerald-500' : (s.adherencia_entreno || 0) >= 4 ? 'bg-amber-500' : 'bg-red-500'}" style="width:${(s.adherencia_entreno || 0) * 10}%"></div></div>
          ${s.score_entreno != null ? `<div class="text-right mt-0.5 font-semibold" style="color:#10b981">${Math.round(s.score_entreno)}%</div>` : ''}
        </div>
        <div>
          <div class="flex items-center justify-between mb-1"><span class="text-slate-400">Alimentación</span><span class="font-bold ${(s.adherencia_alimentacion || 0) >= 7 ? 'text-emerald-600' : (s.adherencia_alimentacion || 0) >= 4 ? 'text-amber-600' : 'text-red-600'}">${s.adherencia_alimentacion ?? '—'}/10</span></div>
          <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div class="h-full rounded-full ${(s.adherencia_alimentacion || 0) >= 7 ? 'bg-emerald-500' : (s.adherencia_alimentacion || 0) >= 4 ? 'bg-amber-500' : 'bg-red-500'}" style="width:${(s.adherencia_alimentacion || 0) * 10}%"></div></div>
          ${s.score_alim_metas != null ? `<div class="text-right mt-0.5 font-semibold" style="color:#3b82f6">${Math.round(s.score_alim_metas)}%</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderSegBoard(clientes, allSegs) {
  const activos = clientes.filter(c => c.estado === 'activo');
  $('#seg-content').innerHTML = `
    <div class="flex gap-4 overflow-x-auto pb-3 scrollbar-thin">
      ${activos.map(c => {
        const segs = allSegs.filter(s => s.cliente_id === c.id).sort((a, b) => b.semana.localeCompare(a.semana));
        return `
          <div class="kanban-col bg-slate-200/40 rounded-2xl p-3 space-y-2 flex-shrink-0">
            <div class="flex items-center gap-2 px-2 py-1">
              ${helpers.avatar(c.nombre, 8)}
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-sm truncate">${escapeHtml(c.nombre)}</div>
                <div class="text-xs text-slate-500">${segs.length} semana(s)</div>
              </div>
              <button class="text-emerald-600 font-bold text-lg" onclick="abrirNuevoSeguimiento('${c.id}')">+</button>
            </div>
            ${segs.slice(0, 6).map(s => {
              const prom = helpers.promedioAdh(s);
              const ring = prom === null ? '' : prom >= 7.5 ? 'ring-good' : prom >= 5 ? 'ring-mid' : 'ring-bad';
              return `
                <div class="bg-white rounded-xl p-3 ring-1 ring-slate-100 ${ring} cursor-pointer" onclick="editarSeguimiento('${s.id}')">
                  <div class="text-xs text-slate-400 mb-1">${fmt.labelSemana(s.semana)} · ${fmt.fechaCorta(s.fecha)} · ${prom !== null ? prom.toFixed(1) + '/10' : '—'}</div>
                  ${s.avances ? `<div class="text-sm text-slate-700 line-clamp-3">${escapeHtml(s.avances)}</div>` : '<div class="text-xs text-slate-400 italic">Sin avances</div>'}
                  ${s.pendientes_semana ? `<div class="bg-red-50 text-red-800 text-xs rounded px-2 py-1 mt-2 line-clamp-2 whitespace-pre-line">${escapeHtml(checklistTextoPlano(s.pendientes_semana))}</div>` : ''}
                </div>
              `;
            }).join('')}
            ${segs.length === 0 ? '<div class="text-xs text-slate-400 text-center py-4">Sin registros</div>' : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// =====================================================
// MODAL: SEGUIMIENTO con panel contexto
// =====================================================
async function abrirModalSeguimiento(clienteId, semana, segExistente = null) {
  const [cliente, segsCliente, pendsCliente] = await Promise.all([
    db.clientes.get(clienteId),
    db.seguimientos.listCliente(clienteId),
    db.pendientes.listCliente(clienteId),
  ]);

  const semanaPrev = segsCliente.find(s => s.semana < semana);
  let s = segExistente || {};
  if (!segExistente) {
    const existing = await db.seguimientos.getByClienteSemana(clienteId, semana);
    if (existing) s = existing;
  }

  const resumen = generarResumen(cliente, segsCliente.filter(x => x.id !== s.id), pendsCliente);
  const abiertos = pendsCliente.filter(p => p.estado === 'abierto');

  const html = `
    <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
      <div class="flex items-center gap-3">
        ${helpers.avatar(cliente.nombre, 10)}
        <div>
          <h3 class="font-bold text-slate-900">${s.id ? 'Editar' : 'Nueva'} semana · ${escapeHtml(cliente.nombre)}</h3>
          <p class="text-xs text-slate-500">${fmt.labelSemana(semana)} · ${fmt.fecha(s.fecha || fmt.hoy())}</p>
        </div>
      </div>
      <button class="btn btn-ghost" onclick="closeModal()">✕</button>
    </div>

    <div class="grid grid-cols-12 flex-1 overflow-hidden">

      <!-- FORM -->
      <div class="col-span-12 lg:col-span-7 p-6 overflow-y-auto space-y-4">
        <!-- ENTRENO: solo números contra la meta (sin calendario) -->
        <div class="bg-slate-50 rounded-xl p-4 space-y-3">
          <div class="flex items-baseline justify-between flex-wrap gap-2">
            <div class="text-xs font-bold text-slate-600 uppercase">🏋️ Entrenamiento</div>
            <div class="text-xs text-slate-500">${metaDiasEntreno(cliente)
              ? `Meta fuerza: <strong>${metaDiasEntreno(cliente)} días</strong>/sem${(cliente.dias_entreno || []).length ? ` (${cliente.dias_entreno.join(' · ')})` : ''}`
              : 'Sin meta de fuerza · defínela en la ficha del cliente'}</div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs">Fuerza — meta vs hechas</label>
              <div class="flex items-center gap-2">
                <input id="sg-fp" type="number" min="0" class="w-16" value="${s.fuerza_planeados ?? metaDiasEntreno(cliente) ?? ''}" placeholder="3" onchange="recalcScores()">
                <span class="text-slate-400">→</span>
                <input id="sg-fe" type="number" min="0" class="w-16" value="${s.fuerza_ejecutados ?? ''}" placeholder="0" onchange="recalcScores()">
                <span id="sg-f-pct" class="ml-auto text-sm font-bold text-emerald-600"></span>
              </div>
            </div>
            <div>
              <label class="text-xs">Complementaria — días que hizo algo (0-7)</label>
              <div class="flex items-center gap-2">
                <input id="sg-ce" type="number" min="0" max="7" class="w-16" value="${s.cardio_ejecutados ?? ''}" placeholder="0" onchange="recalcScores()">
                <span id="sg-c-pct" class="text-sm font-bold text-violet-600"></span>
                ${cliente.actividades_complementarias ? `<span class="ml-auto text-xs text-slate-400 truncate" title="${escapeHtml(cliente.actividades_complementarias)}">${escapeHtml(cliente.actividades_complementarias)}</span>` : ''}
              </div>
            </div>
          </div>
          <p class="text-xs text-slate-400">La complementaria (correr, tenis, natación…) no es meta: suma +2 pts por día al score de entreno, máximo +10. Premia sin inflar.</p>
        </div>

        <!-- ALIMENTACIÓN -->
        <div class="bg-slate-50 rounded-xl p-4 space-y-3">
          <div class="flex items-baseline justify-between flex-wrap gap-2">
            <div class="text-xs font-bold text-slate-600 uppercase">🥗 Alimentación</div>
            <div class="flex items-center gap-2">
              ${mtConfigured() ? `<button type="button" class="btn btn-secondary btn-sm" onclick="jalarMealtrackerAuto('${cliente.id}', '${semana}')">🔄 ${cliente.mealtracker_id ? 'Actualizar' : 'Buscar'} Mealtracker</button>` : ''}
              ${cliente.meta_calorias ? `<div class="text-xs text-slate-500">Meta: ${cliente.meta_calorias} kcal · ${cliente.meta_proteina_g}g prote</div>` : '<div class="text-xs text-amber-600">Sin meta definida</div>'}
            </div>
          </div>
          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="text-xs">kcal promedio</label>
              <input id="sg-kcal" type="number" min="0" value="${s.kcal_promedio ?? ''}" placeholder="${cliente.meta_calorias || '—'}" onchange="recalcScores()">
            </div>
            <div>
              <label class="text-xs">Proteína promedio (g)</label>
              <input id="sg-prote" type="number" min="0" value="${s.proteina_promedio_g ?? ''}" placeholder="${cliente.meta_proteina_g || '—'}" onchange="recalcScores()">
            </div>
            <div>
              <label class="text-xs">Días registro (0-7)</label>
              <input id="sg-dr" type="number" min="0" max="7" value="${s.dias_registro_alim ?? ''}" placeholder="0" onchange="recalcScores()">
            </div>
          </div>
          <div id="sg-mt-info" class="text-xs text-slate-500 hidden"></div>
        </div>

        <!-- SCORES VIVOS -->
        <div id="sg-scores" class="grid grid-cols-4 gap-2"></div>

        <!-- COMPOSICIÓN CORPORAL (opcional en seguimiento semanal) -->
        <div class="bg-slate-50 rounded-xl p-4 space-y-3">
          <div class="flex items-baseline justify-between flex-wrap gap-2">
            <div class="text-xs font-bold text-slate-600 uppercase">🧬 Composición corporal (opcional)</div>
            <div class="text-xs text-slate-500">Si mediste esta semana, guarda aquí. Se crea una medición automáticamente.</div>
          </div>
          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="text-xs">Peso (kg)</label>
              <input id="sg-peso" type="number" step="0.1" placeholder="78.5" oninput="recalcCompSeg()">
            </div>
            <div>
              <label class="text-xs">% Grasa</label>
              <input id="sg-grasa" type="number" step="0.1" placeholder="18.5" oninput="recalcCompSeg()">
            </div>
            <div>
              <label class="text-xs">Cintura (cm)</label>
              <input id="sg-cin" type="number" step="0.1" placeholder="—">
            </div>
          </div>
          <div id="sg-comp-preview" class="hidden text-xs bg-white rounded-lg p-2 ring-1 ring-slate-200">
            <div class="font-semibold text-slate-700 mb-1">Estimaciones al vuelo:</div>
            <div id="sg-comp-body"></div>
          </div>
        </div>

        <!-- LESIÓN -->
        ${cliente.lesion_actual ? `
        <div class="bg-red-50 rounded-xl p-4 space-y-2">
          <div class="text-xs font-bold text-red-800 uppercase">⚕️ Lesión: ${escapeHtml(cliente.lesion_actual)}</div>
          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="text-xs">Estado esta semana</label>
              <select id="sg-lesion-est">
                <option value="">—</option>
                ${['mejor','igual','peor','resuelta'].map(o => `<option value="${o}" ${s.lesion_estado_semana === o ? 'selected' : ''}>${o}</option>`).join('')}
              </select>
            </div>
            <div class="col-span-2">
              <label class="text-xs">Actualización</label>
              <input id="sg-lesion-txt" value="${escapeHtml(s.lesion_actualizacion || '')}" placeholder="Cómo va la evolución…">
            </div>
          </div>
        </div>` : ''}

        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="mb-0">Avances de la semana</label>
            <div class="flex gap-1">
              ${semanaPrev ? '<button type="button" class="btn btn-secondary btn-sm" onclick="copiarSemanaAnterior()" title="Copiar de la semana pasada">↻ Copiar S anterior</button>' : ''}
              <button type="button" class="btn btn-sm" style="background:#d1fae5;color:#065f46" onclick="aplicarPlantilla('alta')">Alta</button>
              <button type="button" class="btn btn-sm" style="background:#fef3c7;color:#92400e" onclick="aplicarPlantilla('media')">Media</button>
              <button type="button" class="btn btn-sm" style="background:#fee2e2;color:#991b1b" onclick="aplicarPlantilla('baja')">Baja</button>
            </div>
          </div>
          <textarea id="sg-avances" rows="5" placeholder="Qué pasó esta semana…">${escapeHtml(s.avances || '')}</textarea>
        </div>

        <!-- PENDIENTES: DEL CLIENTE vs DEL COACH -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div class="text-xs font-bold text-amber-800 uppercase mb-2">👥 Pendientes del cliente (le pides)</div>
            <div id="sg-pend-check" class="space-y-1 mb-2"></div>
            <div class="flex gap-2">
              <input id="sg-pend-nuevo" placeholder="Ej: enviar video de sentadilla…" onkeydown="if(event.key==='Enter'){event.preventDefault();agregarPendClienteSeg();}">
              <button type="button" class="btn btn-secondary btn-sm flex-shrink-0" onclick="agregarPendClienteSeg()">+ Añadir</button>
            </div>
            <textarea id="sg-pend" class="hidden">${escapeHtml(s.pendientes_semana || '')}</textarea>
            <p class="text-xs text-amber-700 mt-1">Se guardan con la semana y salen como checklist en el timeline y en Actividades.</p>
          </div>
          <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <div class="text-xs font-bold text-emerald-800 uppercase mb-2">🧢 Pendientes del coach (tuyos)</div>
            <div id="sg-coach-list" class="space-y-1 mb-2"></div>
            <div class="flex gap-2">
              <input id="sg-coach-nuevo" placeholder="Ej: preparar rutina nueva…" onkeydown="if(event.key==='Enter'){event.preventDefault();agregarPendCoachSeg();}">
              <button type="button" class="btn btn-secondary btn-sm flex-shrink-0" onclick="agregarPendCoachSeg()">+ Añadir</button>
            </div>
            <p class="text-xs text-emerald-700 mt-1">Se guardan al instante y aparecen en Actividades y en Inicio.</p>
          </div>
        </div>

        <div>
          <label>Fecha del registro</label>
          <input id="sg-fecha" type="date" value="${s.fecha || fmt.hoy()}">
        </div>

        <div>
          <label>Notas</label>
          <textarea id="sg-notas" rows="2" placeholder="Otras observaciones…">${escapeHtml(s.notas || '')}</textarea>
        </div>
      </div>

      <!-- CONTEXTO -->
      <div class="col-span-12 lg:col-span-5 bg-slate-50 p-6 overflow-y-auto border-l border-slate-200">
        <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Contexto · qué hablarle</h4>

        <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4">
          <div class="text-xs font-bold text-emerald-900 mb-1">📌 Para tener en cuenta</div>
          <p class="text-xs text-emerald-800">${resumen}</p>
        </div>

        ${abiertos.length > 0 ? `
        <div class="bg-white rounded-xl p-3 mb-3 ring-1 ring-slate-100">
          <div class="text-xs font-bold text-slate-700 mb-2">Pendientes abiertos (${abiertos.length})</div>
          <div class="space-y-1.5">
            ${abiertos.map(p => `
              <div class="flex items-start gap-2 text-xs">
                <input type="checkbox" class="mt-0.5 rounded" onchange="togglePendienteCtx('${p.id}', '${p.estado}', '${clienteId}', '${semana}')">
                <div class="flex-1">
                  <div class="text-slate-700">${p.para === 'coach' ? '🧢 ' : ''}${escapeHtml(p.descripcion)}</div>
                  <div class="text-slate-400 text-xs">${p.para === 'coach' ? '<span class="font-semibold text-slate-600">Tarea tuya</span> · ' : ''}${p.scope === 'semana' ? '<span class="text-violet-600 font-semibold">Semanal</span>' : '<span class="text-emerald-600 font-semibold">General</span>'} ${p.fecha_limite ? '· vence ' + fmt.fechaCorta(p.fecha_limite) : ''}</div>
                </div>
              </div>`).join('')}
          </div>
        </div>` : '<div class="bg-white rounded-xl p-3 mb-3 ring-1 ring-slate-100 text-xs text-slate-500">Sin pendientes abiertos.</div>'}

        ${cliente.restricciones_lesiones || cliente.patologias ? `
        <div class="bg-red-50 rounded-xl p-3 mb-3 ring-1 ring-red-200">
          <div class="text-xs font-bold text-red-800 mb-1">⚕️ Cuidado físico</div>
          ${cliente.restricciones_lesiones ? `<div class="text-xs text-red-700">Lesiones: ${escapeHtml(cliente.restricciones_lesiones)}</div>` : ''}
          ${cliente.patologias ? `<div class="text-xs text-red-700">Patologías: ${escapeHtml(cliente.patologias)}</div>` : ''}
        </div>` : ''}

        <div class="text-xs font-bold text-slate-700 mb-2">Últimas semanas</div>
        <div class="space-y-2">
          ${segsCliente.filter(x => x.id !== s.id).slice(0, 3).map(s2 => {
            const prom = helpers.promedioAdh(s2);
            const ring = prom === null ? '' : prom >= 7.5 ? 'ring-good' : prom >= 5 ? 'ring-mid' : 'ring-bad';
            return `
              <div class="bg-white rounded-xl p-3 ring-1 ring-slate-100 ${ring}">
                <div class="flex justify-between mb-1">
                  <span class="text-xs font-bold text-slate-700">${fmt.labelSemana(s2.semana)} · ${fmt.fechaCorta(s2.fecha)}</span>
                  ${prom !== null ? `<span class="text-xs font-bold ${prom >= 7.5 ? 'text-emerald-600' : prom >= 5 ? 'text-amber-600' : 'text-red-600'}">${prom.toFixed(1)}/10</span>` : ''}
                </div>
                ${s2.avances ? `<p class="text-xs text-slate-600 line-clamp-3">${escapeHtml(s2.avances)}</p>` : ''}
                ${s2.pendientes_semana ? `<div class="text-xs text-red-700 mt-1 line-clamp-2 whitespace-pre-line">${escapeHtml(checklistTextoPlano(s2.pendientes_semana))}</div>` : ''}
              </div>
            `;
          }).join('')}
          ${segsCliente.filter(x => x.id !== s.id).length === 0 ? '<div class="text-xs text-slate-500">Sin semanas previas.</div>' : ''}
        </div>
      </div>
    </div>

    <div class="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-between gap-2 sticky bottom-0 flex-wrap">
      <div>${s.id ? `<button class="btn btn-danger" onclick="eliminarSeguimiento('${s.id}', '${clienteId}')">Eliminar</button>` : ''}</div>
      <div class="flex gap-2 flex-wrap">
        <button class="btn btn-secondary" onclick="copiarMensajeWhatsApp('${clienteId}')" title="Genera y copia un borrador de mensaje para pegar en WhatsApp">💬 Copiar mensaje</button>
        <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="guardarSeguimiento('${clienteId}', '${semana}', ${s.id ? `'${s.id}'` : 'null'})">Guardar semana</button>
      </div>
    </div>
  `;

  openModal(html, { wide: true });
  window._segPrev = semanaPrev;
  window._segCliente = cliente;
  window._segId = s.id || null;
  setTimeout(() => { recalcScores(); renderPendEditPreview(); renderPendCoachSeg(); }, 0);

  // Auto-resolver y jalar del Mealtracker si aún no hay data
  if (mtConfigured() && !s.kcal_promedio && !s.proteina_promedio_g) {
    setTimeout(async () => {
      const mtId = await resolverMealtrackerId(cliente);
      if (mtId) {
        // Actualizar el objeto cliente en memoria por si volvemos a abrir
        cliente.mealtracker_id = mtId;
        window._segCliente = cliente;
        window.jalarMealtracker(mtId, semana);
      }
    }, 200);
  }
}

// Recalcula scores vivos mientras se llena
window.recalcScores = () => {
  const seg = {
    fuerza_planeados: Number($('#sg-fp')?.value) || null,
    fuerza_ejecutados: Number($('#sg-fe')?.value) || 0,
    cardio_planeados: Number($('#sg-cp')?.value) || null,
    cardio_ejecutados: Number($('#sg-ce')?.value) || 0,
    kcal_promedio: $('#sg-kcal')?.value ? Number($('#sg-kcal').value) : null,
    proteina_promedio_g: $('#sg-prote')?.value ? Number($('#sg-prote').value) : null,
    dias_registro_alim: $('#sg-dr')?.value ? Number($('#sg-dr').value) : null,
  };
  const scores = calcScores(seg, window._segCliente);
  const el = $('#sg-scores');
  if (!el) return;

  // % de fuerza y bono de complementaria en vivo
  const fPct = seg.fuerza_planeados ? Math.min(100, Math.round((seg.fuerza_ejecutados / seg.fuerza_planeados) * 100)) : null;
  const bono = Math.min(10, Math.max(0, Math.min(7, seg.cardio_ejecutados || 0)) * 2);
  const fLabel = $('#sg-f-pct'); if (fLabel) fLabel.textContent = fPct !== null ? `${fPct}%` : '';
  const cLabel = $('#sg-c-pct'); if (cLabel) cLabel.textContent = bono ? `+${bono} pts` : '';

  const card = (titulo, valor, color) => `
    <div class="rounded-xl p-3 text-center" style="background:${color}15;border:1px solid ${color}40">
      <div class="text-xs text-slate-500">${titulo}</div>
      <div class="text-lg font-bold" style="color:${color}">${valor !== null ? Math.round(valor) + '%' : '—'}</div>
    </div>`;
  el.innerHTML = `
    ${card('Entreno', scores.score_entreno, '#10b981')}
    ${card('Alim · metas', scores.score_alim_metas, '#3b82f6')}
    ${card('Alim · registro', scores.score_alim_registro, '#8b5cf6')}
    ${card('Global', scores.score_global, '#0f172a')}
  `;
};

window.copiarSemanaAnterior = () => {
  const prev = window._segPrev;
  if (!prev) return;
  if ($('#sg-avances').value && !confirm('¿Reemplazar el contenido actual?')) return;
  $('#sg-avances').value = prev.avances || '';
  $('#sg-pend').value = prev.pendientes_semana || '';
  if ($('#sg-fp')) $('#sg-fp').value = prev.fuerza_planeados ?? '';
  if ($('#sg-cp')) $('#sg-cp').value = prev.cardio_planeados ?? '';
  recalcScores();
  renderPendEditPreview();
  toast('Copiado, ajusta ejecutados');
};

window.aplicarPlantilla = (nivel) => {
  const txt = PLANTILLAS[nivel];
  if (!txt) return;
  const cur = $('#sg-avances').value;
  if (cur && !confirm('¿Reemplazar el contenido actual?')) return;
  $('#sg-avances').value = txt;
};

window.guardarSeguimiento = async (cliente_id, semana, id) => {
  const seg = {
    fuerza_planeados: $('#sg-fp')?.value ? Number($('#sg-fp').value) : null,
    fuerza_ejecutados: $('#sg-fe')?.value ? Number($('#sg-fe').value) : null,
    cardio_planeados: $('#sg-cp')?.value ? Number($('#sg-cp').value) : null,
    cardio_ejecutados: $('#sg-ce')?.value ? Number($('#sg-ce').value) : null,
    kcal_promedio: $('#sg-kcal')?.value ? Number($('#sg-kcal').value) : null,
    proteina_promedio_g: $('#sg-prote')?.value ? Number($('#sg-prote').value) : null,
    dias_registro_alim: $('#sg-dr')?.value ? Number($('#sg-dr').value) : null,
  };
  const scores = calcScores(seg, window._segCliente);
  const row = {
    cliente_id, semana,
    fecha: $('#sg-fecha').value || fmt.hoy(),
    ...seg,
    // Ya no hay calendario en el seguimiento: los días asistidos son las
    // sesiones de fuerza hechas contra la meta (el % del timeline sigue vivo).
    dias_planeados: seg.fuerza_planeados,
    dias_asistidos: seg.fuerza_planeados != null ? (seg.fuerza_ejecutados ?? 0) : null,
    score_entreno: scores.score_entreno,
    score_alim_metas: scores.score_alim_metas,
    score_alim_registro: scores.score_alim_registro,
    score_global: scores.score_global,
    avances: $('#sg-avances').value || null,
    pendientes_semana: $('#sg-pend').value || null,
    notas: $('#sg-notas').value || null,
    lesion_estado_semana: $('#sg-lesion-est')?.value || null,
    lesion_actualizacion: $('#sg-lesion-txt')?.value || null,
    estado: 'hecho',
  };
  await db.seguimientos.upsert(row);

  // Si el coach llenó peso/grasa en el seguimiento, crear una medición corporal
  const pesoSeg = Number($('#sg-peso')?.value);
  const grasaSeg = Number($('#sg-grasa')?.value);
  const cinSeg = Number($('#sg-cin')?.value);
  if (pesoSeg > 0) {
    await db.mediciones.insert({
      cliente_id,
      fecha: row.fecha,
      peso: pesoSeg,
      grasa_pct: grasaSeg || null,
      cintura: cinSeg || null,
      notas: `Registrado desde seguimiento semanal ${semana}`,
    });
    toast('Semana + medición corporal guardadas');
  } else {
    toast('Semana guardada');
  }
  closeModal();
  navigate('seguimiento');
};

window.editarSeguimiento = async (id) => {
  const s = await db.seguimientos.get(id);
  await abrirModalSeguimiento(s.cliente_id, s.semana, s);
};

// Wrapper que auto-resuelve el mealtracker_id si no existe
window.jalarMealtrackerAuto = async (clienteId, semana) => {
  const info = $('#sg-mt-info');
  if (info) { info.classList.remove('hidden'); info.textContent = '⏳ Buscando cliente en el Mealtracker…'; }
  const cliente = await db.clientes.get(clienteId);
  const mtId = await resolverMealtrackerId(cliente);
  if (!mtId) {
    if (info) info.innerHTML = '<span class="text-amber-600">⚠️ No encontré un cliente con este nombre en el Mealtracker. Ve a Ajustes → "Sincronizar clientes" para vincular manualmente.</span>';
    return;
  }
  if (window._segCliente) window._segCliente.mealtracker_id = mtId;
  await window.jalarMealtracker(mtId, semana);
};

window.jalarMealtracker = async (mealtrackerId, semana) => {
  const info = $('#sg-mt-info');
  if (info) { info.classList.remove('hidden'); info.textContent = '⏳ Consultando mealtracker…'; }
  const r = await getMealtrackerWeek(mealtrackerId, semana);
  if (!r) {
    if (info) {
      info.innerHTML = '<span class="text-red-600">✗ Sin conexión al Mealtracker, averiguando la causa…</span>';
      const causa = await mtDiagnostico(mealtrackerId);
      info.innerHTML = `<span class="text-red-600">✗ ${escapeHtml(causa)}</span>`;
    }
    return;
  }
  if (r.dias === 0) {
    if (info) info.innerHTML = `<span class="text-amber-600">⚠️ Sin registros para esa semana (${r.rango[0]} → ${r.rango[1]}).</span>`;
    return;
  }
  $('#sg-kcal').value = r.kcal_avg;
  $('#sg-prote').value = r.prote_avg;
  $('#sg-dr').value = r.dias;
  recalcScores();
  if (info) info.innerHTML = `✓ <strong>${r.dias} días</strong> registrados · promedio <strong>${r.kcal_avg} kcal</strong> · <strong>${r.prote_avg}g</strong> proteína · rango ${r.rango[0]} → ${r.rango[1]}`;
};

window.abrirNutricionCliente = async (clienteId) => {
  const c = await db.clientes.get(clienteId);
  if (!c) { toast('Cliente no encontrado'); return; }
  const mtId = c.mealtracker_id || await resolverMealtrackerId(c);
  if (!mtId) { toast('Sin conexión a Mealtracker'); return; }

  const d = await getMealtrackerUserData(mtId);
  if (!d) { toast('Sin datos en Mealtracker'); return; }

  const goals = d.goals || {};
  const history = d.history || {};

  const hoy = new Date();
  const ultimas4Sem = [];
  for (let i = 0; i < 4; i++) {
    const ref = new Date(hoy); ref.setDate(hoy.getDate() - i * 7);
    const sem = fmt.semanaISO(ref);
    const r = await getMealtrackerWeek(mtId, sem);
    if (r) ultimas4Sem.push({ semana: sem, ...r });
  }

  const ultimos14 = [];
  const sortedDates = Object.keys(history).sort().reverse().slice(0, 14);
  for (const fecha of sortedDates) {
    const tot = history[fecha];
    if (tot && Number(tot.kcal) > 0) {
      ultimos14.push({ fecha, kcal: Number(tot.kcal), p: Number(tot.p || 0), c: Number(tot.c || 0), g: Number(tot.g || 0) });
    }
  }
  ultimos14.reverse();

  // Las metas del Mealtracker usan claves kcal/p/c/g (formato viejo: calories/protein/…)
  const metaKcal = c.meta_calorias || Number(goals.kcal ?? goals.calories) || null;
  const metaProte = c.meta_proteina_g || Number(goals.p ?? goals.protein) || null;

  const macroBar = (label, valor, meta, color, unit) => {
    const pct = meta ? Math.min(100, Math.round((valor / meta) * 100)) : null;
    const barColor = pct === null ? 'bg-slate-300' : pct >= 90 && pct <= 110 ? 'bg-emerald-500' : pct >= 75 ? 'bg-amber-500' : 'bg-red-500';
    return `<div class="mb-2">
      <div class="flex justify-between text-xs mb-0.5">
        <span class="text-slate-600 font-semibold">${label}</span>
        <span class="font-bold" style="color:${color}">${valor}${unit} ${meta ? `/ ${meta}${unit}` : ''} ${pct !== null ? `(${pct}%)` : ''}</span>
      </div>
      <div class="h-2 bg-slate-100 rounded-full overflow-hidden"><div class="h-full rounded-full ${barColor}" style="width:${pct || 50}%"></div></div>
    </div>`;
  };

  const todayData = d.today_totals && Number(d.today_totals?.kcal) > 0 ? d.today_totals : null;

  openModal(modalShell(`Alimentación · ${escapeHtml(c.nombre)}`, `
    <div class="space-y-4">
      ${todayData ? `
      <div class="bg-blue-50 rounded-xl p-4">
        <div class="text-xs font-bold text-blue-800 uppercase mb-2">Hoy (${d.today || 'hoy'})</div>
        ${macroBar('Calorías', Math.round(Number(todayData.kcal)), metaKcal, '#3b82f6', ' kcal')}
        ${macroBar('Proteína', Math.round(Number(todayData.p || 0)), metaProte, '#10b981', 'g')}
        ${macroBar('Carbos', Math.round(Number(todayData.c || 0)), c.meta_carbos_g, '#f59e0b', 'g')}
        ${macroBar('Grasas', Math.round(Number(todayData.g || 0)), c.meta_grasas_g, '#ef4444', 'g')}
      </div>` : '<div class="bg-slate-50 rounded-xl p-3 text-sm text-slate-500">Sin registro hoy.</div>'}

      ${ultimas4Sem.length > 0 ? `
      <div>
        <h4 class="text-xs font-bold text-slate-500 uppercase mb-2">Resumen semanal (últimas 4 semanas)</h4>
        <div class="space-y-2">
          ${ultimas4Sem.map(w => {
            const kcalPct = metaKcal && w.kcal_avg ? Math.round(Math.max(0, 100 - Math.abs((w.kcal_avg - metaKcal) / metaKcal * 100))) : null;
            const protePct = metaProte && w.prote_avg ? Math.min(100, Math.round((w.prote_avg / metaProte) * 100)) : null;
            const regPct = Math.round((w.dias / 7) * 100);
            return `<div class="bg-slate-50 rounded-xl p-3">
              <div class="flex justify-between items-center mb-2">
                <span class="text-xs font-bold text-slate-700">${fmt.labelSemana(w.semana)}</span>
                <span class="text-xs text-slate-500">${w.dias}/7 días registrados (${regPct}%)</span>
              </div>
              <div class="grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <div class="text-slate-400">Kcal prom</div>
                  <div class="font-bold ${kcalPct !== null && kcalPct >= 85 ? 'text-emerald-600' : kcalPct !== null && kcalPct >= 65 ? 'text-amber-600' : 'text-red-600'}">${w.kcal_avg || '—'}</div>
                  ${kcalPct !== null ? `<div class="h-1 bg-slate-200 rounded-full mt-1"><div class="h-full rounded-full ${kcalPct >= 85 ? 'bg-emerald-500' : kcalPct >= 65 ? 'bg-amber-500' : 'bg-red-500'}" style="width:${kcalPct}%"></div></div>` : ''}
                </div>
                <div>
                  <div class="text-slate-400">Prote prom</div>
                  <div class="font-bold ${protePct !== null && protePct >= 90 ? 'text-emerald-600' : protePct !== null && protePct >= 70 ? 'text-amber-600' : 'text-red-600'}">${w.prote_avg || '—'}g</div>
                  ${protePct !== null ? `<div class="h-1 bg-slate-200 rounded-full mt-1"><div class="h-full rounded-full ${protePct >= 90 ? 'bg-emerald-500' : protePct >= 70 ? 'bg-amber-500' : 'bg-red-500'}" style="width:${protePct}%"></div></div>` : ''}
                </div>
                <div>
                  <div class="text-slate-400">Registro</div>
                  <div class="font-bold ${regPct >= 85 ? 'text-emerald-600' : regPct >= 57 ? 'text-amber-600' : 'text-red-600'}">${w.dias}/7</div>
                  <div class="h-1 bg-slate-200 rounded-full mt-1"><div class="h-full rounded-full ${regPct >= 85 ? 'bg-emerald-500' : regPct >= 57 ? 'bg-amber-500' : 'bg-red-500'}" style="width:${regPct}%"></div></div>
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>` : ''}

      ${ultimos14.length >= 2 ? `
      <div>
        <h4 class="text-xs font-bold text-slate-500 uppercase mb-2">Tendencia diaria (últimos ${ultimos14.length} días)</h4>
        <div class="bg-slate-50 rounded-xl p-3">
          ${lineChart([
            { label: 'Kcal', color: '#3b82f6', points: ultimos14.map(d => d.kcal) },
            ...(metaKcal ? [{ label: 'Meta', color: '#94a3b8', points: ultimos14.map(() => metaKcal) }] : []),
          ], ultimos14.map(d => d.fecha.slice(5)), { height: 160, yMin: 0 })}
        </div>
      </div>` : ''}

      ${c.meta_calorias ? `
      <div class="bg-blue-50 rounded-xl p-3 text-sm">
        <div class="text-xs font-bold text-blue-800 mb-1">🥗 Meta nutricional configurada</div>
        <div class="text-blue-900 font-semibold">${c.meta_calorias} kcal · ${c.meta_proteina_g}g prote · ${c.meta_grasas_g}g grasas · ${c.meta_carbos_g}g carbos</div>
        <button class="btn btn-primary btn-sm mt-2" onclick="enviarMetaMealtracker('${c.id}')" title="Cambia la meta en la app Mealtracker del cliente (pide confirmación)">🎯 Enviar meta al Mealtracker</button>
      </div>` : ''}

      ${goals && Object.keys(goals).length > 0 ? `
      <div class="bg-violet-50 rounded-xl p-3 text-sm">
        <div class="text-xs font-bold text-violet-800 mb-1">🎯 Metas en Mealtracker</div>
        <div class="text-violet-900 font-semibold">${goals.kcal ?? goals.calories ?? '—'} kcal · ${goals.p ?? goals.protein ?? '—'}g prote · ${goals.c ?? goals.carbs ?? '—'}g carbos · ${goals.g ?? goals.fat ?? '—'}g grasas</div>
      </div>` : ''}
    </div>
  `));
};

// ===== Enviar la meta nutricional del CRM al Mealtracker =====
// Un solo botón + confirmación: muestra la meta actual de allá vs. la nueva
// y solo escribe si el coach confirma. metaOverride permite mandar una meta
// recién recalculada en el formulario (aún sin guardar en el CRM).
window.enviarMetaMealtracker = async (clienteId, metaOverride = null) => {
  const cliente = await db.clientes.get(clienteId);
  if (!cliente) { toast('Cliente no encontrado'); return; }
  const meta = metaOverride || {
    kcal: cliente.meta_calorias,
    p: cliente.meta_proteina_g,
    c: cliente.meta_carbos_g,
    g: cliente.meta_grasas_g,
  };
  if (!meta.kcal) { toast('Este cliente no tiene meta nutricional calculada. Calcúlala en su ficha (sección 5).'); return; }
  if (!mtConfigured()) { toast('Sin conexión al Mealtracker (config.js o Ajustes)'); return; }

  toast('⏳ Consultando Mealtracker…');
  const mtId = cliente.mealtracker_id || await resolverMealtrackerId(cliente);
  if (!mtId) { toast('⚠️ No encontré este cliente en el Mealtracker. Vincúlalo en Ajustes → "Sincronizar clientes".'); return; }

  const dataActual = await getMealtrackerUserData(mtId);
  const gPrev = dataActual?.goals || {};
  const prevKcal = gPrev.kcal ?? gPrev.calories;
  const prevTxt = prevKcal
    ? `${prevKcal} kcal · ${gPrev.p ?? gPrev.protein ?? '—'}g prote · ${gPrev.c ?? gPrev.carbs ?? '—'}g carbos · ${gPrev.g ?? gPrev.fat ?? '—'}g grasas`
    : 'sin meta definida';
  const nuevaTxt = `${meta.kcal} kcal · ${meta.p ?? '—'}g prote · ${meta.c ?? '—'}g carbos · ${meta.g ?? '—'}g grasas`;

  const okConfirm = confirm(
    `🎯 Cambiar la meta en el Mealtracker de ${cliente.nombre}\n\n` +
    `Meta actual allá: ${prevTxt}\n` +
    `Meta nueva: ${nuevaTxt}\n\n` +
    `El cliente la verá de inmediato en su app. ¿Confirmas el cambio?`
  );
  if (!okConfirm) return;

  const r = await setMealtrackerGoals(mtId, meta);
  if (r.ok) toast(`✓ Meta enviada al Mealtracker de ${cliente.nombre}`);
  else toast(`✗ ${r.causa}`);
};

// Variante para el formulario de edición: usa la meta recién recalculada
// (_pendingMeta) si existe, si no la guardada.
window.enviarMetaMealtrackerForm = () => {
  const id = window._editingClienteId;
  if (!id) { toast('Guarda el cliente primero para poder enviar su meta'); return; }
  const pm = window._pendingMeta;
  enviarMetaMealtracker(id, pm ? { kcal: pm.meta_calorias, p: pm.meta_proteina_g, c: pm.meta_carbos_g, g: pm.meta_grasas_g } : null);
};

window.copiarMensajeWhatsApp = async (cliente_id) => {
  const seg = {
    fuerza_planeados: $('#sg-fp')?.value ? Number($('#sg-fp').value) : null,
    fuerza_ejecutados: $('#sg-fe')?.value ? Number($('#sg-fe').value) : null,
    cardio_planeados: $('#sg-cp')?.value ? Number($('#sg-cp').value) : null,
    cardio_ejecutados: $('#sg-ce')?.value ? Number($('#sg-ce').value) : null,
    kcal_promedio: $('#sg-kcal')?.value ? Number($('#sg-kcal').value) : null,
    proteina_promedio_g: $('#sg-prote')?.value ? Number($('#sg-prote').value) : null,
    dias_registro_alim: $('#sg-dr')?.value ? Number($('#sg-dr').value) : null,
  };
  const scores = calcScores(seg, window._segCliente);
  const cliente = window._segCliente;
  const pendientes = await db.pendientes.listCliente(cliente_id);
  const segsDesc = (await db.seguimientos.listCliente(cliente_id)).sort((a, b) => b.semana.localeCompare(a.semana));
  const streaks = {
    fuerza: calcStreakDim(segsDesc, s => s.fuerza_planeados > 0 && (s.fuerza_ejecutados / s.fuerza_planeados) >= 0.75),
    cardio: calcStreakDim(segsDesc, s => s.cardio_planeados > 0 && (s.cardio_ejecutados / s.cardio_planeados) >= 0.75),
  };
  const texto = borradorWhatsApp(cliente, seg, scores, pendientes, streaks);
  try {
    await navigator.clipboard.writeText(texto);
    toast('✓ Mensaje copiado, pégalo en WhatsApp');
  } catch (e) {
    // Fallback: prompt
    prompt('Copia manualmente:', texto);
  }
};

window.eliminarSeguimiento = async (id, clienteId) => {
  if (!confirm('¿Eliminar esta semana?')) return;
  await db.seguimientos.remove(id);
  closeModal();
  navigate('seguimiento');
};

window.togglePendienteCtx = async (id, estado, clienteId, semana) => {
  await db.pendientes.toggle(id, estado);
  toast('Pendiente actualizado');
};

// =====================================================
// VIEW: PAGOS
// =====================================================
routes.pagos = async () => {
  view.innerHTML = '<div class="card">Cargando…</div>';
  const [clientes, pagos] = await Promise.all([db.clientes.list(), db.pagos.listAnio(_pagosYear)]);
  const meses = Array.from({ length: 12 }, (_, i) => `${_pagosYear}-${String(i + 1).padStart(2, '0')}`);
  const mesActual = fmt.mesActual();

  // Mapa cliente_id -> { mes -> pago }
  const map = {};
  for (const p of pagos) {
    map[p.cliente_id] ??= {};
    map[p.cliente_id][p.mes] = p;
  }

  // Totales — pagados siempre suman; pendientes solo si el cliente está activo
  const totalesMes = {};
  let totalAnio = 0;
  for (const mes of meses) {
    let t = 0;
    for (const c of clientes) {
      const p = map[c.id]?.[mes];
      if (!p || Number(p.monto) <= 0) continue;
      if (p.pagado) t += copConv(p.monto, p.moneda);
      else if (c.estado === 'activo') t += copConv(p.monto, p.moneda);
    }
    totalesMes[mes] = t;
    totalAnio += t;
  }

  const mesActualNum = new Date().getMonth() + 1;
  const cobradoMes = pagos.filter(p => p.mes === mesActual && p.pagado).reduce((s, p) => s + copConv(p.monto, p.moneda), 0);
  const porCobrarMes = clientes.filter(c => c.estado === 'activo').filter(c => {
    const p = map[c.id]?.[mesActual];
    return !p || !p.pagado;
  }).reduce((s, c) => s + copConv(c.monto, c.moneda), 0);

  view.innerHTML = `
    <div class="flex items-baseline justify-between flex-wrap gap-3 mb-5">
      <div>
        <h2 class="text-2xl font-bold text-slate-900">Pagos</h2>
        <p class="text-sm text-slate-500">Estado de cobros</p>
      </div>
      <div class="flex items-center gap-3 flex-wrap">
        <div class="bg-slate-200 rounded-xl p-1 flex gap-1">
          <button class="toggle-btn ${_pagosView === 'table' ? 'active' : ''}" onclick="switchPagView('table')">Tabla anual</button>
          <button class="toggle-btn ${_pagosView === 'cards' ? 'active' : ''}" onclick="switchPagView('cards')">Cards del mes</button>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="generarMesActual()" title="Crea pagos pendientes del mes actual basado en el último monto de cada cliente">📅 Generar mes</button>
        <div class="flex items-center gap-1">
          <button class="btn btn-ghost" onclick="cambiarAnio(-1)">‹</button>
          <span class="font-semibold px-2">${_pagosYear}</span>
          <button class="btn btn-ghost" onclick="cambiarAnio(1)">›</button>
        </div>
      </div>
    </div>

    <div class="bg-gradient-to-br from-slate-900 to-slate-700 text-white rounded-2xl p-6 shadow-md mb-5">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <div class="text-xs uppercase tracking-wide text-slate-300 font-semibold">Cobrado ${fmt.mesEsLargo(mesActual)}</div>
          <div class="text-3xl font-bold mt-1">${fmt.moneyCop(cobradoMes)}</div>
        </div>
        <div>
          <div class="text-xs uppercase tracking-wide text-slate-300 font-semibold">Por cobrar este mes</div>
          <div class="text-3xl font-bold mt-1 text-amber-300">${fmt.moneyCop(porCobrarMes)}</div>
        </div>
        <div>
          <div class="text-xs uppercase tracking-wide text-slate-300 font-semibold">Acumulado año</div>
          <div class="text-3xl font-bold mt-1">${fmt.moneyCop(totalAnio)}</div>
        </div>
      </div>
    </div>

    <div id="pagos-content"></div>
  `;

  if (_pagosView === 'table') renderPagosTabla(clientes, map, meses, totalesMes, totalAnio, mesActualNum);
  else renderPagosCards(clientes, map, mesActual);
};

window.switchPagView = (which) => { _pagosView = which; routes.pagos(); };
window.cambiarAnio = (d) => { _pagosYear += d; routes.pagos(); };

window.generarMesActual = async () => {
  const mesActual = fmt.mesActual();
  if (!confirm(`¿Generar pagos pendientes para ${fmt.mesEsLargo(mesActual)}?\n\nSe creará un pago pendiente por cada cliente activo, usando el monto del último mes que pagó (o el monto de su ficha si no tiene historial).`)) return;

  const clientes = await db.clientes.list();
  const activos = clientes.filter(c => c.estado === 'activo');

  // Último pago > 0 por cliente
  const { data: ultimos } = await sb.from('pagos').select('cliente_id, monto, moneda, mes').gt('monto', 0).order('mes', { ascending: false });
  const ultPorCliente = {};
  for (const p of (ultimos || [])) {
    if (!ultPorCliente[p.cliente_id]) ultPorCliente[p.cliente_id] = p;
  }
  // Ya existentes para este mes
  const { data: existentes } = await sb.from('pagos').select('cliente_id').eq('mes', mesActual);
  const yaTienen = new Set((existentes || []).map(p => p.cliente_id));

  let creados = 0, omitidos = 0;
  for (const c of activos) {
    if (yaTienen.has(c.id)) { omitidos++; continue; }
    const ult = ultPorCliente[c.id];
    const monto = ult?.monto || Number(c.monto) || 0;
    const moneda = ult?.moneda || c.moneda || 'COP';
    if (monto <= 0) { omitidos++; continue; }
    await db.pagos.upsert({ cliente_id: c.id, mes: mesActual, pagado: false, monto, moneda });
    creados++;
  }
  toast(`✓ ${creados} pago(s) creado(s) · ${omitidos} ya tenían`, 3500);
  navigate('pagos');
};

const ORDEN_ESTADO = { activo: 0, pausa: 1, finalizado: 2 };
function sortByEstado(a, b) {
  const d = (ORDEN_ESTADO[a.estado] ?? 99) - (ORDEN_ESTADO[b.estado] ?? 99);
  return d !== 0 ? d : a.nombre.localeCompare(b.nombre, 'es');
}

function renderPagosTabla(clientes, map, meses, totalesMes, totalAnio, mesActualNum) {
  const activos = clientes.filter(c => c.estado !== 'finalizado').sort(sortByEstado);
  $('#pagos-content').innerHTML = `
    <div class="card overflow-hidden p-0">
      <div class="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-wrap gap-2">
        <h3 class="font-semibold text-slate-900">Tabla anual · ${_pagosYear}</h3>
        <div class="flex gap-2 text-xs">
          <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-emerald-100"></span><span class="text-slate-500">Pagado</span></span>
          <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-amber-100"></span><span class="text-slate-500">Pendiente</span></span>
          <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-red-100"></span><span class="text-slate-500">Vencido</span></span>
        </div>
      </div>
      <div class="overflow-x-auto scrollbar-thin">
        <table class="pay-table">
          <thead>
            <tr>
              <th style="position:sticky; left:0; background:#f8fafc; z-index:3; min-width:200px;">Cliente</th>
              <th>Estado</th>
              <th>Día</th>
              ${meses.map(m => `<th>${fmt.mesEs(m)}</th>`).join('')}
              <th>Total año</th>
            </tr>
          </thead>
          <tbody>
            ${activos.length === 0 ? `<tr><td colspan="${meses.length + 4}" class="text-center text-slate-500 py-6">Sin clientes.</td></tr>` :
              activos.map(c => {
                let totalFila = 0;
                const celdas = meses.map((m, i) => {
                  const p = map[c.id]?.[m];
                  const monthNum = i + 1;
                  const monedaCel = (p && p.moneda) || c.moneda || 'COP';
                  const fmtVal = (n) => monedaCel === 'USD' ? `$${Number(n).toFixed(0)}` : Number(n).toLocaleString('es-CO');
                  let cls, val;
                  if (p && p.pagado) {
                    cls = 'pay-paid';
                    val = fmtVal(p.monto);
                    totalFila += copConv(p.monto, p.moneda);
                  } else if (p && Number(p.monto) > 0) {
                    cls = monthNum < mesActualNum ? 'pay-overdue' : 'pay-pending';
                    val = fmtVal(p.monto);
                    // Solo sumar pendientes al total anual si el cliente está activo
                    if (c.estado === 'activo') totalFila += copConv(p.monto, p.moneda);
                  } else if (monthNum < mesActualNum) {
                    cls = 'pay-overdue';
                    val = '—';
                  } else if (monthNum === mesActualNum) {
                    cls = 'pay-pending';
                    val = Number(c.monto) > 0 ? fmtVal(c.monto) : '—';
                  } else {
                    cls = 'pay-future';
                    val = '—';
                  }
                  return `<td class="pay-cell ${cls}" onclick="abrirPago('${c.id}', '${m}')" title="${fmt.mesEsLargo(m)}">${val}</td>`;
                }).join('');
                return `
                  <tr>
                    <td class="name-cell" style="position:sticky; left:0; background:white; z-index:2;">
                      <a class="text-emerald-700 cursor-pointer hover:underline" onclick="verCliente('${c.id}')">${escapeHtml(c.nombre)}</a>
                      <div class="text-xs text-slate-400 font-normal">${c.moneda}</div>
                    </td>
                    <td class="px-2"><span class="status-pill ${c.estado === 'activo' ? 'status-active' : c.estado === 'pausa' ? 'status-hold' : 'status-end'}"><span class="w-1.5 h-1.5 rounded-full ${c.estado === 'activo' ? 'bg-emerald-500' : c.estado === 'pausa' ? 'bg-orange-500' : 'bg-slate-500'}"></span>${c.estado}</span></td>
                    <td class="px-2 text-center text-slate-600">${c.dia_pago || '—'}</td>
                    ${celdas}
                    <td class="total-cell">${fmt.moneyCop(totalFila).replace('COP ', '')}</td>
                  </tr>
                `;
              }).join('')}
            <tr class="bg-slate-900 text-white font-bold">
              <td style="position:sticky; left:0; background:#0f172a; z-index:2; padding:0.65rem 0.8rem;" colspan="3">Total mes (COP equivalente)</td>
              ${meses.map(m => `<td class="px-2 py-3 text-right ${totalesMes[m] === 0 ? 'text-slate-500' : ''}">${totalesMes[m] > 0 ? totalesMes[m].toLocaleString('es-CO') : '—'}</td>`).join('')}
              <td class="px-3 py-3 text-right text-emerald-300">${totalAnio.toLocaleString('es-CO')}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="px-5 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
        Click en cualquier celda para registrar o editar el pago. Conversión USD→COP a tasa ${_settings.usd_cop_rate.toLocaleString('es-CO')}.
      </div>
    </div>
  `;
}

function renderPagosCards(clientes, map, mesActual) {
  const activos = clientes.filter(c => c.estado === 'activo');
  const diaHoy = new Date().getDate();

  const cards = activos.map(c => {
    const p = map[c.id]?.[mesActual];
    let cls = 'pay-pending';
    let banner = 'bg-amber-50';
    let labelClass = 'text-amber-700';
    let label = 'Pendiente';
    let estado = 'pending';
    if (p && p.pagado) {
      cls = 'pay-paid'; banner = 'bg-emerald-50'; labelClass = 'text-emerald-700';
      label = '✓ Pagado'; estado = 'paid';
    } else if (c.dia_pago && c.dia_pago < diaHoy) {
      banner = 'bg-red-50'; labelClass = 'text-red-700';
      label = `Vencido hace ${diaHoy - c.dia_pago} días`; estado = 'overdue';
    } else if (c.dia_pago) {
      const dif = c.dia_pago - diaHoy;
      label = dif === 0 ? 'Vence hoy' : `Vence en ${dif} día(s)`;
    }
    return { c, p, banner, labelClass, label, estado };
  });

  $('#pagos-content').innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${cards.map(({ c, p, banner, labelClass, label, estado }) => `
        <div class="card card-hover overflow-hidden p-0">
          <div class="h-1.5 ${estado === 'paid' ? 'bg-emerald-500' : estado === 'overdue' ? 'bg-red-500' : 'bg-amber-500'}"></div>
          <div class="p-5">
            <div class="flex items-center gap-3 mb-4">
              ${helpers.avatar(c.nombre, 12).replace('rounded-full','rounded-2xl')}
              <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-900 truncate cursor-pointer hover:text-emerald-700" onclick="verCliente('${c.id}')">${escapeHtml(c.nombre)}</div>
                <div class="text-xs text-slate-500">Día ${c.dia_pago || '—'} · ${c.moneda}</div>
              </div>
            </div>
            <div class="${banner} rounded-xl p-3 mb-3">
              <div class="text-xs font-bold ${labelClass} uppercase tracking-wide mb-1">${label}</div>
              <div class="text-2xl font-bold text-slate-900">${fmt.money(p?.monto || c.monto, c.moneda)}</div>
              ${p && p.fecha_pago ? `<div class="text-xs text-slate-500 mt-1">${fmt.fecha(p.fecha_pago)}${p.metodo ? ' · ' + p.metodo : ''}</div>` : ''}
            </div>
            ${estado === 'paid'
              ? `<button class="btn btn-secondary w-full" onclick="abrirPago('${c.id}', '${mesActual}')">Ver / editar</button>`
              : `<div class="flex gap-2">
                  <button class="btn btn-dark flex-1" onclick="abrirPago('${c.id}', '${mesActual}')">Marcar pagado</button>
                  <button class="btn btn-secondary" title="Copiar recordatorio de pago para WhatsApp" onclick="copiarRecordatorioPago('${c.id}')">💬</button>
                </div>`}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

window.abrirPago = async (cliente_id, mes) => {
  const cliente = await db.clientes.get(cliente_id);
  const { data: p } = await sb.from('pagos').select('*').eq('cliente_id', cliente_id).eq('mes', mes).maybeSingle();

  // Si no hay pago previo y el cliente no tiene monto, sugerir el del último mes
  let montoSug = p?.monto ?? cliente.monto ?? '';
  let monedaSug = p?.moneda || cliente.moneda || 'COP';
  if (!p && !Number(cliente.monto)) {
    const { data: ult } = await sb.from('pagos').select('monto, moneda').eq('cliente_id', cliente_id).gt('monto', 0).order('mes', { ascending: false }).limit(1).maybeSingle();
    if (ult) { montoSug = ult.monto; monedaSug = ult.moneda; }
  }

  openModal(modalShell(`Pago · ${escapeHtml(cliente.nombre)} · ${fmt.mesEsLargo(mes)}`, `
    <div class="space-y-3">
      <div class="flex items-center gap-3 mb-2">
        <input type="checkbox" id="pg-pagado" ${p?.pagado ? 'checked' : ''} class="w-5 h-5 rounded">
        <label for="pg-pagado" class="mb-0 normal-case font-semibold cursor-pointer">Marcar como pagado</label>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div><label>Monto</label><input id="pg-monto" type="number" step="0.01" value="${montoSug || ''}"></div>
        <div><label>Moneda</label>
          <select id="pg-moneda">
            <option value="COP" ${monedaSug === 'COP' ? 'selected' : ''}>COP</option>
            <option value="USD" ${monedaSug === 'USD' ? 'selected' : ''}>USD</option>
          </select>
        </div>
        <div><label>Fecha del pago</label><input id="pg-fecha" type="date" value="${p?.fecha_pago || fmt.hoy()}"></div>
        <div><label>Método</label><input id="pg-metodo" placeholder="Transferencia, Nequi…" value="${escapeHtml(p?.metodo || cliente.metodo_pago_preferido || '')}"></div>
      </div>
      <p class="text-xs text-slate-500">Si guardas sin marcar pagado, queda como pendiente del mes (amarillo).</p>
      <div><label>Nota</label><input id="pg-nota" value="${escapeHtml(p?.nota || '')}"></div>
    </div>
  `, `
    ${p?.id ? `<button class="btn btn-danger mr-auto" onclick="eliminarPago('${p.id}')">Eliminar</button>` : ''}
    <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="guardarPago('${cliente_id}', '${mes}')">Guardar</button>
  `));
};

window.guardarPago = async (cliente_id, mes) => {
  const pagado = $('#pg-pagado').checked;
  await db.pagos.upsert({
    cliente_id, mes, pagado,
    monto: Number($('#pg-monto').value) || 0,
    moneda: $('#pg-moneda').value,
    fecha_pago: pagado ? ($('#pg-fecha').value || fmt.hoy()) : null,
    metodo: $('#pg-metodo').value || null,
    nota: $('#pg-nota').value || null,
  });
  closeModal();
  toast('Guardado');
  navigate('pagos');
};

window.eliminarPago = async (id) => {
  if (!confirm('¿Eliminar este registro?')) return;
  await db.pagos.remove(id);
  closeModal();
  navigate('pagos');
};

// =====================================================
// VIEW: ACTIVIDADES (agenda del coach + pendientes de clientes y del coach)
// =====================================================
routes.pendientes = async () => {
  view.innerHTML = '<div class="card">Cargando…</div>';
  const mes = fmt.mesActual();
  const semana = fmt.semanaISO();
  const hoy = fmt.hoy();
  const [lista, clientes, pagosMes, segSemana, allSegs] = await Promise.all([
    db.pendientes.list(),
    db.clientes.list(),
    db.pagos.listMes(mes),
    db.seguimientos.listSemana(semana),
    db.seguimientos.listAll(),
  ]);
  const activos = clientes.filter(c => c.estado === 'activo');

  const pendCoach = lista.filter(p => p.para === 'coach');
  const pendClientes = lista.filter(p => p.para !== 'coach');

  // ---------- 1. Qué atender primero (agenda) ----------
  // nivel 0 = urgente (rojo) · 1 = pronto (ámbar) · 2 = normal
  const agenda = [];
  const diaHoy = new Date().getDate();

  // Pagos vencidos (día de pago pasado + días de gracia, sin pago marcado)
  activos.forEach(c => {
    if (!c.dia_pago || c.dia_pago > diaHoy) return;
    const p = pagosMes.find(pp => pp.cliente_id === c.id);
    if (p && p.pagado) return;
    if ((diaHoy - c.dia_pago) <= (c.dias_gracia || 0)) return;
    agenda.push({
      nivel: 0, icon: '💰',
      texto: `Cobrar a ${c.nombre}`,
      sub: `Venció el día ${c.dia_pago} · ${fmt.money(c.monto, c.moneda)}`,
      acciones: `<button class="btn btn-ghost btn-sm" title="Copiar recordatorio WhatsApp" onclick="copiarRecordatorioPago('${c.id}')">💬</button>
                 <button class="btn btn-dark btn-sm" onclick="marcarPagoRapido('${c.id}')">Pagado</button>`,
    });
  });

  // Pendientes abiertos vencidos o de prioridad alta (tuyos o de clientes)
  lista.filter(p => p.estado === 'abierto').forEach(p => {
    const vencido = p.fecha_limite && p.fecha_limite < hoy;
    if (!vencido && p.prioridad !== 'alta') return;
    agenda.push({
      nivel: vencido ? 0 : 1,
      icon: p.para === 'coach' ? '🧢' : '👤',
      texto: p.descripcion,
      sub: `${p.para === 'coach' ? 'Tarea tuya' : (p.clientes?.nombre || 'Cliente')}${p.fecha_limite ? ` · ${vencido ? 'venció' : 'vence'} ${fmt.fechaCorta(p.fecha_limite)}` : ''} · prioridad ${p.prioridad}`,
      check: `togglePendienteFromList('${p.id}', '${p.estado}')`,
    });
  });

  // Pagos que vencen en los próximos 7 días
  activos.forEach(c => {
    if (!c.dia_pago) return;
    const diff = c.dia_pago - diaHoy;
    if (diff <= 0 || diff > 7) return;
    const p = pagosMes.find(pp => pp.cliente_id === c.id);
    if (p && p.pagado) return;
    agenda.push({
      nivel: 1, icon: '💵',
      texto: `Cobro próximo: ${c.nombre}`,
      sub: `En ${diff} día(s) · ${fmt.money(c.monto, c.moneda)}`,
      acciones: `<button class="btn btn-dark btn-sm" onclick="marcarPagoRapido('${c.id}')">Pagado</button>`,
    });
  });

  // Clientes en riesgo
  const riesgoIds = new Set(clientes.filter(c => helpers.enRiesgo(c, allSegs)).map(c => c.id));
  riesgoIds.forEach(id => {
    const c = clientes.find(x => x.id === id);
    agenda.push({
      nivel: 1, icon: '⚠️',
      texto: `Reactivar contacto con ${c.nombre}`,
      sub: 'Cliente en riesgo',
      acciones: `<button class="btn btn-secondary btn-sm" onclick="verCliente('${c.id}')">Abrir</button>`,
    });
  });

  // Clientes sin seguimiento esta semana (los en riesgo ya salieron arriba)
  const conSeg = new Set(segSemana.map(s => s.cliente_id));
  activos.filter(c => !conSeg.has(c.id) && !riesgoIds.has(c.id)).forEach(c => {
    const segCli = allSegs.filter(s => s.cliente_id === c.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const dias = segCli.length ? fmt.diasDesde(segCli[0].fecha) : null;
    agenda.push({
      nivel: (dias || 0) > 14 ? 1 : 2, icon: '📋',
      texto: `Hacer seguimiento a ${c.nombre}`,
      sub: dias !== null ? `Último hace ${dias} días` : 'Sin seguimientos previos',
      acciones: `<button class="btn btn-primary btn-sm" onclick="abrirNuevoSeguimiento('${c.id}')">Registrar</button>`,
    });
  });

  // Cumpleaños en los próximos 7 días
  clientes.forEach(c => {
    if (!c.fecha_nacimiento) return;
    const d = helpers.diasHastaCumple(c.fecha_nacimiento);
    if (d === null || d > 7) return;
    agenda.push({ nivel: d === 0 ? 1 : 2, icon: '🎂', texto: `Cumpleaños de ${c.nombre}`, sub: d === 0 ? '¡Hoy!' : d === 1 ? 'Mañana' : `En ${d} días` });
  });

  agenda.sort((a, b) => a.nivel - b.nivel);
  const nivelBg = ['bg-red-50', 'bg-amber-50', 'bg-white ring-1 ring-slate-100'];

  // ---------- 2. Checklists semanales "Le pediste" (última semana con pendientes por cliente) ----------
  const checklists = activos.map(c => {
    const segs = allSegs.filter(s => s.cliente_id === c.id && s.pendientes_semana).sort((a, b) => b.semana.localeCompare(a.semana));
    const s = segs[0];
    if (!s) return null;
    const items = parseChecklist(s.pendientes_semana);
    if (!items.length) return null;
    return { c, s, items, abiertos: items.filter(i => !i.done).length };
  }).filter(Boolean).sort((a, b) => b.abiertos - a.abiertos);

  // ---------- 3. Lista de pendientes de clientes (con filtro) ----------
  let f = pendClientes;
  if (_pendientesFilter === 'general') f = pendClientes.filter(p => p.scope === 'general');
  else if (_pendientesFilter === 'semana') f = pendClientes.filter(p => p.scope === 'semana');
  else if (_pendientesFilter === 'abiertos') f = pendClientes.filter(p => p.estado === 'abierto');
  else if (_pendientesFilter === 'completados') f = pendClientes.filter(p => p.estado === 'completado');

  const pendRow = (p, conAvatar = true) => `
    <div class="flex items-center gap-3 py-2.5 px-2 hover:bg-slate-50 rounded-lg">
      <input type="checkbox" ${p.estado === 'completado' ? 'checked' : ''} class="rounded" onchange="togglePendienteFromList('${p.id}', '${p.estado}')">
      ${conAvatar ? helpers.avatar(p.clientes?.nombre || '?', 9) : ''}
      <div class="flex-1 min-w-0">
        <div class="font-medium text-sm ${p.estado === 'completado' ? 'line-through text-slate-400' : 'text-slate-900'}">${escapeHtml(p.descripcion)}</div>
        <div class="text-xs text-slate-500 mt-0.5">
          ${p.clientes?.nombre ? escapeHtml(p.clientes.nombre) + ' · ' : ''}${p.scope === 'semana' ? '<span class="text-violet-600 font-semibold">Semanal</span>' : '<span class="text-emerald-600 font-semibold">📌 General</span>'}
          ${p.fecha_limite ? ' · vence ' + fmt.fechaCorta(p.fecha_limite) : ''}
          ${p.estado === 'completado' && p.completado_en ? ' · ✓ ' + fmt.fechaCorta(p.completado_en) : ''}
        </div>
      </div>
      <span class="tag ${p.prioridad === 'alta' ? 'tag-red' : p.prioridad === 'baja' ? 'tag-gray' : 'tag-yellow'}">${p.prioridad}</span>
      ${p.scope === 'semana' && p.estado === 'abierto' ? `<button class="btn btn-ghost btn-sm" title="Hacer general" onclick="hacerGeneral('${p.id}')">📌</button>` : ''}
      <button class="btn btn-ghost btn-sm" onclick="editarPendiente('${p.id}')">✎</button>
      <button class="btn btn-ghost btn-sm" onclick="eliminarPendiente('${p.id}')">✕</button>
    </div>`;

  view.innerHTML = `
    <div class="flex items-baseline justify-between flex-wrap gap-3 mb-5">
      <div>
        <h2 class="text-2xl font-bold text-slate-900">Panel de actividades</h2>
        <p class="text-sm text-slate-500">Qué atender primero, tus pendientes y los de tus clientes</p>
      </div>
      <button class="btn btn-primary" onclick="nuevoPendiente()">+ Nuevo pendiente</button>
    </div>

    <!-- QUÉ ATENDER PRIMERO -->
    <div class="card mb-6">
      <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 class="font-bold text-slate-900 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-red-500"></span>🎯 Qué atender primero</h3>
        <span class="tag ${agenda.some(a => a.nivel === 0) ? 'tag-red' : agenda.length ? 'tag-yellow' : 'tag-green'}">${agenda.length}</span>
      </div>
      ${agenda.length === 0
        ? '<p class="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-xl">✓ ¡Todo al día! No hay nada urgente por atender.</p>'
        : `<div class="space-y-2">
            ${agenda.slice(0, 12).map(a => `
              <div class="flex items-center gap-3 p-3 rounded-xl ${nivelBg[a.nivel]}">
                ${a.check ? `<input type="checkbox" class="rounded" onchange="${a.check}">` : `<span class="text-lg flex-shrink-0">${a.icon}</span>`}
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-sm text-slate-900">${a.check ? a.icon + ' ' : ''}${escapeHtml(a.texto)}</div>
                  <div class="text-xs text-slate-500">${escapeHtml(a.sub)}</div>
                </div>
                <div class="flex gap-1 flex-shrink-0">${a.acciones || ''}</div>
              </div>`).join('')}
            ${agenda.length > 12 ? `<p class="text-xs text-slate-500 text-center pt-1">+ ${agenda.length - 12} más</p>` : ''}
          </div>`}
    </div>

    <!-- PENDIENTES: CLIENTES vs COACH -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      <div class="card">
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 class="font-bold text-slate-900 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-violet-500"></span>👥 Pendientes de tus clientes</h3>
          <span class="tag tag-violet">${pendClientes.filter(p => p.estado === 'abierto').length} abiertos</span>
        </div>
        <div class="flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-thin">
          <button class="chip ${_pendientesFilter === 'todos' ? 'active' : ''}" onclick="filtrarPend('todos')">Todos · ${pendClientes.length}</button>
          <button class="chip ${_pendientesFilter === 'abiertos' ? 'active' : ''}" onclick="filtrarPend('abiertos')">📌 Abiertos · ${pendClientes.filter(p => p.estado === 'abierto').length}</button>
          <button class="chip ${_pendientesFilter === 'general' ? 'active' : ''}" onclick="filtrarPend('general')">🌿 Generales · ${pendClientes.filter(p => p.scope === 'general').length}</button>
          <button class="chip ${_pendientesFilter === 'semana' ? 'active' : ''}" onclick="filtrarPend('semana')">📅 Semanales · ${pendClientes.filter(p => p.scope === 'semana').length}</button>
          <button class="chip ${_pendientesFilter === 'completados' ? 'active' : ''}" onclick="filtrarPend('completados')">✓ Hechos · ${pendClientes.filter(p => p.estado === 'completado').length}</button>
        </div>
        ${f.length === 0
          ? `<div class="text-sm text-slate-500 text-center py-6">No hay pendientes de clientes en este filtro.<br><span class="text-xs">Créalos con "+ Nuevo pendiente" o desde la ficha del cliente.</span></div>`
          : `<div class="divide-y divide-slate-100">${f.map(p => pendRow(p)).join('')}</div>`}
      </div>

      <div class="card">
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 class="font-bold text-slate-900 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-emerald-600"></span>🧢 Pendientes del coach (tuyos)</h3>
          <button class="btn btn-secondary btn-sm" onclick="nuevoPendiente(null, 'coach')">+ Tarea mía</button>
        </div>
        ${pendCoach.length === 0
          ? `<div class="text-sm text-slate-500 text-center py-6">Sin tareas tuyas.<br><span class="text-xs">Ej: "preparar rutina de Juan", "renovar plan de X", "publicar contenido"…</span></div>`
          : `<div class="divide-y divide-slate-100">
              ${pendCoach.filter(p => p.estado === 'abierto').map(p => pendRow(p, false)).join('')}
              ${pendCoach.filter(p => p.estado === 'completado').map(p => pendRow(p, false)).join('')}
            </div>`}
      </div>
    </div>

    <!-- CHECKLISTS SEMANALES GLOBALES -->
    <div class="card">
      <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 class="font-bold text-slate-900 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-amber-500"></span>✅ Lo que le pediste a cada cliente (checklist semanal)</h3>
        <span class="tag tag-yellow">${checklists.reduce((s, ch) => s + ch.abiertos, 0)} sin completar</span>
      </div>
      ${checklists.length === 0
        ? '<p class="text-sm text-slate-500 text-center py-6">Ningún cliente tiene checklist semanal. Se crean al escribir "Pendientes que le pediste" en el seguimiento de la semana.</p>'
        : `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            ${checklists.map(({ c, s, items, abiertos }) => `
              <div class="bg-amber-50 rounded-xl p-3 ${abiertos === 0 ? 'opacity-60' : ''}">
                <div class="flex items-center gap-2 mb-2">
                  ${helpers.avatar(c.nombre, 8)}
                  <div class="flex-1 min-w-0">
                    <div class="font-bold text-sm text-slate-900 truncate">${escapeHtml(c.nombre)}</div>
                    <div class="text-xs text-slate-500">${fmt.labelSemana(s.semana)} · ${fmt.fechaCorta(s.fecha)}</div>
                  </div>
                  <button class="btn btn-ghost btn-sm" title="Abrir la semana" onclick="editarSeguimiento('${s.id}')">✎</button>
                </div>
                ${checklistHtml(s.pendientes_semana, s.id)}
              </div>`).join('')}
          </div>`}
    </div>
  `;
};

window.filtrarPend = (f) => { _pendientesFilter = f; routes.pendientes(); };

window.togglePendienteFromList = async (id, estado) => {
  await db.pendientes.toggle(id, estado);
  rerenderView();
};

window.hacerGeneral = async (id) => {
  await db.pendientes.hacerGeneral(id);
  toast('Promovido a general');
  rerenderView();
};

// Campos compartidos del formulario de pendiente (nuevo y editar)
function pendienteFormHtml(p, opcionesClientes) {
  const para = p.para || 'cliente';
  return `
    <div class="space-y-3">
      <div class="grid grid-cols-2 gap-3">
        <div><label>Para quién</label>
          <select id="pn-para">
            <option value="cliente" ${para === 'cliente' ? 'selected' : ''}>👥 Cliente (le pediste algo)</option>
            <option value="coach" ${para === 'coach' ? 'selected' : ''}>🧢 Coach (tarea tuya)</option>
          </select>
        </div>
        <div><label>Cliente</label>
          <select id="pn-cliente"><option value="">— sin cliente —</option>${opcionesClientes}</select>
          <p class="text-xs text-slate-500 mt-1">Opcional si es tarea tuya.</p>
        </div>
      </div>
      <div><label>Descripción *</label><input id="pn-desc" placeholder="Qué hay que hacer…" value="${escapeHtml(p.descripcion || '')}"></div>
      <div class="grid grid-cols-3 gap-3">
        <div><label>Tipo</label><select id="pn-scope"><option value="general" ${(p.scope || 'general') === 'general' ? 'selected' : ''}>📌 General</option><option value="semana" ${p.scope === 'semana' ? 'selected' : ''}>📅 Semanal</option></select></div>
        <div><label>Prioridad</label><select id="pn-prio">${['baja','media','alta'].map(o => `<option ${(p.prioridad || 'media') === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
        <div><label>Vence</label><input id="pn-fecha" type="date" value="${p.fecha_limite || ''}"></div>
      </div>
    </div>`;
}

function leerPendienteForm() {
  const para = $('#pn-para').value;
  const cliente_id = $('#pn-cliente').value || null;
  const descripcion = $('#pn-desc').value.trim();
  if (!descripcion) { toast('Falta la descripción'); return null; }
  if (para === 'cliente' && !cliente_id) { toast('Elige el cliente (o márcalo como tarea del coach)'); return null; }
  return {
    para, cliente_id, descripcion,
    scope: $('#pn-scope').value,
    prioridad: $('#pn-prio').value,
    fecha_limite: $('#pn-fecha').value || null,
  };
}

window.nuevoPendiente = async (clienteId = null, para = 'cliente') => {
  const clientes = await db.clientes.list();
  const opciones = clientes.map(c => `<option value="${c.id}" ${clienteId === c.id ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('');
  openModal(modalShell('Nuevo pendiente', pendienteFormHtml({ para }, opciones), `
    <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="guardarPendiente()">Guardar</button>
  `));
};

window.guardarPendiente = async () => {
  const row = leerPendienteForm();
  if (!row) return;
  await db.pendientes.insert({ ...row, estado: 'abierto' });
  closeModal();
  toast('Guardado');
  navigate('pendientes');
};

window.editarPendiente = async (id) => {
  const { data: p } = await sb.from('pendientes').select('*').eq('id', id).single();
  const clientes = await db.clientes.list();
  const opciones = clientes.map(c => `<option value="${c.id}" ${p.cliente_id === c.id ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('');
  openModal(modalShell('Editar pendiente', pendienteFormHtml(p, opciones), `
    <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="actualizarPendiente('${id}')">Guardar</button>
  `));
};

window.actualizarPendiente = async (id) => {
  const row = leerPendienteForm();
  if (!row) return;
  await db.pendientes.update(id, row);
  closeModal();
  toast('Actualizado');
  rerenderView();
};

window.eliminarPendiente = async (id) => {
  if (!confirm('¿Eliminar?')) return;
  await db.pendientes.remove(id);
  rerenderView();
};

// =====================================================
// VIEW: CLIENTES
// =====================================================
routes.clientes = async () => {
  view.innerHTML = '<div class="card">Cargando…</div>';
  const [clientes, allSegs] = await Promise.all([db.clientes.list(), db.seguimientos.listAll()]);
  const activos = clientes.filter(c => c.estado === 'activo');
  const pausa = clientes.filter(c => c.estado === 'pausa');
  const fin = clientes.filter(c => c.estado === 'finalizado');

  function calcAdh(c) {
    const segs = allSegs.filter(s => s.cliente_id === c.id).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 4);
    const prom = segs.map(helpers.promedioAdh).filter(v => v !== null);
    return prom.length ? prom.reduce((a, b) => a + b, 0) / prom.length : null;
  }

  view.innerHTML = `
    <div class="flex items-baseline justify-between flex-wrap gap-3 mb-5">
      <div>
        <h2 class="text-2xl font-bold text-slate-900">Clientes</h2>
        <p class="text-sm text-slate-500">${activos.length} activos · ${pausa.length} en pausa · ${fin.length} finalizados</p>
      </div>
      <div class="flex gap-2 flex-wrap">
        <button class="btn btn-secondary" onclick="revisarEntrevistas()" title="Lee las entrevistas iniciales y propone llenar los campos vacíos de las fichas (con tu revisión antes de guardar)">🪄 Completar fichas desde entrevistas</button>
        <button class="btn btn-primary" onclick="nuevoCliente()">+ Nuevo cliente</button>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${clientes.map(c => {
        const adh = calcAdh(c);
        return `
          <div class="card card-hover cursor-pointer" onclick="verCliente('${c.id}')">
            <div class="flex items-start gap-3 mb-3">
              ${helpers.avatar(c.nombre, 12).replace('rounded-full','rounded-2xl')}
              <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-900 truncate">${escapeHtml(c.nombre)}</div>
                <div class="text-xs text-slate-500 truncate">${escapeHtml(c.ciudad || c.profesion || '—')}</div>
              </div>
              <span class="status-pill ${c.estado === 'activo' ? 'status-active' : c.estado === 'pausa' ? 'status-hold' : 'status-end'}"><span class="w-1.5 h-1.5 rounded-full ${c.estado === 'activo' ? 'bg-emerald-500' : c.estado === 'pausa' ? 'bg-orange-500' : 'bg-slate-500'}"></span>${c.estado}</span>
            </div>
            <div class="space-y-1.5 text-sm">
              <div class="flex justify-between"><span class="text-slate-500">Mensualidad</span><span class="font-medium">${fmt.money(c.monto, c.moneda)}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Día pago</span><span class="font-medium">${c.dia_pago || '—'}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Adherencia</span><span class="font-medium ${adh === null ? 'text-slate-400' : adh >= 7.5 ? 'text-emerald-600' : adh >= 5 ? 'text-amber-600' : 'text-red-600'}">${adh === null ? '—' : adh.toFixed(1) + '/10'}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Inicio</span><span class="font-medium">${c.fecha_inicio ? fmt.fechaCorta(c.fecha_inicio) : '—'}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Canal</span><span class="font-medium capitalize">${c.canal_adquisicion || '—'}</span></div>
            </div>
            ${(c.tags && c.tags.length) ? `<div class="mt-3 pt-3 border-t border-slate-100">${c.tags.map(t => `<span class="tag-pill">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
          </div>
        `;
      }).join('')}
      ${clientes.length === 0 ? '<div class="col-span-3 card text-center text-slate-500 py-10">Aún no hay clientes. <button class="text-emerald-600 font-semibold" onclick="nuevoCliente()">+ Crear el primero</button></div>' : ''}
    </div>
  `;
};

function clienteForm(c = {}) {
  // Objetivo guardado como texto → qué chips van marcados y qué queda como "otro"
  const objPartes = (c.objetivo || '').split(/[,;·|]/).map(s => s.trim()).filter(Boolean);
  const objSel = objPartes.map(normalizeName);
  const objOtros = objPartes.filter(p => !OBJETIVOS_TAGS.some(([, t]) => normalizeName(t) === normalizeName(p))).join(', ');
  return `
    <div class="space-y-5">
      <!-- 1. IDENTIDAD -->
      <div class="sec sec-slate">
        <div class="sec-title">1 · 👤 Identidad</div>
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2"><label>Nombre *</label><input id="cl-nombre" value="${escapeHtml(c.nombre || '')}" required></div>
          <div><label>Fecha de nacimiento</label><input id="cl-nac" type="date" value="${c.fecha_nacimiento || ''}"></div>
          <div><label>Sexo</label>
            <select id="cl-sexo">
              <option value="">—</option>
              ${['M','F','otro'].map(o => `<option ${c.sexo === o ? 'selected' : ''}>${o}</option>`).join('')}
            </select>
          </div>
          <div><label>Correo</label><input id="cl-email" type="email" placeholder="cliente@correo.com" value="${escapeHtml(c.email || '')}"></div>
          <div><label>Teléfono / WhatsApp</label><input id="cl-tel" placeholder="+57 300 000 0000" value="${escapeHtml(c.telefono || '')}"></div>
          <div><label>Ciudad</label><input id="cl-ciudad" value="${escapeHtml(c.ciudad || '')}"></div>
          <div><label>Profesión</label><input id="cl-prof" value="${escapeHtml(c.profesion || '')}"></div>
        </div>
      </div>

      <!-- 2. OBJETIVO Y FASE -->
      <div class="sec sec-olive">
        <div class="sec-title">2 · 🎯 Objetivo y fase</div>
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2">
            <label>Objetivos (marca los que apliquen)</label>
            <div class="flex gap-1.5 flex-wrap" id="cl-obj-tags">
              ${OBJETIVOS_TAGS.map(([emoji, t]) => `
                <label class="obj-chip">
                  <input type="checkbox" value="${t}" class="hidden" ${objSel.includes(normalizeName(t)) ? 'checked' : ''}>
                  <span>${emoji} ${t}</span>
                </label>`).join('')}
            </div>
            <input id="cl-obj-otro" class="mt-2" placeholder="Otro objetivo (opcional, texto libre)…" value="${escapeHtml(objOtros)}">
          </div>
          <div class="col-span-2">
            <label>Meta específica</label>
            <textarea id="cl-meta" rows="2" placeholder="Se llena sola con 🧮 Recalcular (sección 5). Puedes editarla a mano.">${escapeHtml(c.meta_especifica || '')}</textarea>
            <p class="text-xs text-slate-500 mt-1">🧮 Al recalcular la meta nutricional diaria, este campo se actualiza solo (y sigue siendo editable).</p>
          </div>
          <div class="col-span-2"><label>Fase del programa</label>
            <select id="cl-fase">
              <option value="">—</option>
              ${FASES_PROGRAMA.map(f => `<option value="${f.key}" ${c.fase_programa === f.key ? 'selected' : ''}>${f.label}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <!-- 3. COMPOSICIÓN CORPORAL -->
      <div class="sec sec-blue">
        <div class="sec-title">3 · 🧬 Composición corporal</div>
        <div class="grid grid-cols-2 gap-3">
          <div><label>Estatura (cm)</label><input id="cl-alt" type="number" min="120" max="230" value="${c.estatura_cm || ''}"></div>
        </div>
        <p class="text-xs text-slate-500 mt-2">📏 Las mediciones (peso, %grasa) se registran desde el perfil del cliente o desde el seguimiento semanal. Las demás variables (masa muscular, agua corporal, masa ósea) se estiman automáticamente.</p>
      </div>

      <!-- 4. NIVEL DE ACTIVIDAD -->
      <div class="sec sec-teal">
        <div class="sec-title">4 · 🏃 Nivel de actividad</div>
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2">
            <label>Nivel de actividad</label>
            <div class="flex items-center gap-2">
              <input id="cl-nivel" readonly value="${c.nivel_actividad ? c.nivel_actividad.replace('_',' ') + ' · PAL ' + (c.pal_factor || PAL_MAP[c.nivel_actividad] || '') : ''}" placeholder="—" class="!bg-white">
              <button type="button" class="btn btn-secondary btn-sm whitespace-nowrap" onclick="abrirEncuestaActividad()">Encuesta</button>
            </div>
          </div>
          <div class="col-span-2"><label>Lugar de entreno</label>
            <select id="cl-lugar">
              <option value="">—</option>
              ${['casa','gym_comercial','parque','aire_libre','mixto'].map(o => `<option value="${o}" ${c.lugar_entreno === o ? 'selected' : ''}>${o.replace('_',' ')}</option>`).join('')}
            </select>
          </div>
          <div><label>Días de fuerza / semana</label><input id="cl-dias-ent" type="number" min="0" max="7" placeholder="5" value="${c.dias_entreno_cantidad ?? ''}"></div>
          <div class="col-span-2">
            <label>Qué días hace fuerza</label>
            <div class="flex gap-1.5 flex-wrap" id="cl-dias-sem">
              ${DIAS_SEMANA.map(d => `
                <label class="day-chip">
                  <input type="checkbox" value="${d}" class="hidden" ${(c.dias_entreno || []).includes(d) ? 'checked' : ''}>
                  <span>${d}</span>
                </label>`).join('')}
            </div>
            <p class="text-xs text-slate-500 mt-1">La fuerza es estructurada: va con días fijos. El seguimiento semanal compara contra esta meta.</p>
          </div>
          <div class="col-span-2"><label>Actividades complementarias (variadas, sin meta fija)</label>
            <input id="cl-acts-comp" placeholder="Ej: correr, tenis, natación, fútbol…" value="${escapeHtml(c.actividades_complementarias || '')}">
            <p class="text-xs text-slate-500 mt-1">No llevan calendario ni meta: cada día que las haga suma puntos al score de entreno (máx +10). Son un complemento, no un compromiso.</p>
          </div>
        </div>
      </div>

      <!-- 5. META NUTRICIONAL -->
      <div class="sec sec-emerald">
        <div class="sec-title">5 · 🥗 Meta nutricional</div>
        <div class="grid grid-cols-2 gap-3">
          <div><label>Objetivo calórico</label>
            <select id="cl-objk">
              <option value="">—</option>
              ${OBJETIVOS_KCAL.map(o => `<option value="${o.key}" ${c.objetivo_calorico === o.key ? 'selected' : ''}>${o.label}</option>`).join('')}
            </select>
          </div>
          <div><label>Proteína (g/kg)</label>
            <input id="cl-prote-gkg" type="number" step="0.1" min="1" max="3.5" value="${c.proteina_g_kg ?? 1.8}">
            <p class="text-xs text-slate-500 mt-1">1.6-1.8 general · 2.0-2.4 cutting</p>
          </div>
          <div class="col-span-2 bg-white rounded-xl p-3 ring-1 ring-emerald-100">
            <div class="flex items-baseline justify-between mb-2 flex-wrap gap-1">
              <div class="text-xs font-bold text-slate-600 uppercase">Meta nutricional diaria</div>
              <div class="flex gap-1.5">
                <button type="button" class="btn btn-primary btn-sm" onclick="recalcularMeta()">🧮 Recalcular</button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="enviarMetaMealtrackerForm()" title="Cambia la meta en la app Mealtracker del cliente (pide confirmación)">🎯 Enviar al Mealtracker</button>
              </div>
            </div>
            <div id="meta-preview" class="text-sm">
              ${c.meta_calorias ? `
                <div class="font-bold text-emerald-700 text-base">${c.meta_calorias} kcal · ${c.meta_proteina_g}g prote · ${c.meta_grasas_g}g grasas · ${c.meta_carbos_g}g carbos</div>
                <div class="text-xs text-slate-500 mt-1">${c.meta_metodo || ''} · Recalculada ${c.meta_calculada_en ? new Date(c.meta_calculada_en).toLocaleDateString('es-CO') : ''}</div>
                ${c.meta_argumento ? `<details class="mt-2"><summary class="text-xs text-emerald-700 cursor-pointer">Ver argumento del cálculo</summary><pre class="text-xs text-slate-600 mt-1 whitespace-pre-wrap">${escapeHtml(c.meta_argumento)}</pre></details>` : ''}
              ` : '<div class="text-xs text-slate-500">Sin meta calculada. Llena estatura, sexo, edad, nivel actividad y objetivo calórico, luego click en "Recalcular".</div>'}
            </div>
          </div>
        </div>
      </div>

      <!-- 6. CONDICIONES MÉDICAS / LESIONES -->
      <div class="sec sec-red">
        <div class="sec-title">6 · ⚕️ Condiciones médicas / lesiones</div>
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2"><label>Condiciones de salud / patologías</label><textarea id="cl-pat" rows="2" placeholder="Ej: prediabético, hipertensión, hipotiroidismo…">${escapeHtml(c.patologias || '')}</textarea></div>
          <div class="col-span-2"><label>💊 Suplementos que toma</label><textarea id="cl-sup" rows="2" placeholder="Ej: creatina 5g/día, proteína whey, omega 3, vitamina D… (vacío = no toma)">${escapeHtml(c.suplementos || '')}</textarea></div>
          <div class="col-span-2"><label>Restricciones o lesiones (base)</label><textarea id="cl-rest" rows="2" placeholder="Ej: hernia lumbar L4-L5, rodilla derecha…">${escapeHtml(c.restricciones_lesiones || '')}</textarea></div>
          <div class="col-span-2"><label>Lesión actual (activa hoy)</label><input id="cl-lesion" placeholder="Ej: tendinitis hombro derecho" value="${escapeHtml(c.lesion_actual || '')}"></div>
          <div><label>Estado de la lesión</label>
            <select id="cl-lesion-est">
              <option value="">—</option>
              ${['activa','en_mejora','resuelta','recaida'].map(o => `<option value="${o}" ${c.lesion_estado === o ? 'selected' : ''}>${o.replace('_',' ')}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <!-- 7. ANTECEDENTES DEPORTIVOS -->
      <div class="sec sec-violet">
        <div class="sec-title">7 · 🏅 Antecedentes deportivos</div>
        <textarea id="cl-ant" rows="2" placeholder="Deportes previos, nivel, años…">${escapeHtml(c.antecedentes_deportivos || '')}</textarea>
      </div>

      <!-- 8. COMERCIAL -->
      <div class="sec sec-emerald">
        <div class="sec-title">8 · 💰 Comercial</div>
        <div class="grid grid-cols-2 gap-3">
          <div><label>Monto mensual</label><input id="cl-monto" type="number" step="0.01" value="${c.monto || ''}"></div>
          <div><label>Moneda</label>
            <select id="cl-moneda">
              <option value="COP" ${(c.moneda || 'COP') === 'COP' ? 'selected' : ''}>COP</option>
              <option value="USD" ${c.moneda === 'USD' ? 'selected' : ''}>USD</option>
            </select>
          </div>
          <div><label>Día de pago (1-31)</label><input id="cl-dia" type="number" min="1" max="31" value="${c.dia_pago || ''}"></div>
          <div><label>Fecha inicio</label><input id="cl-inicio" type="date" value="${c.fecha_inicio || fmt.hoy()}"></div>
          <div><label>Estado</label>
            <select id="cl-estado">
              ${['activo','pausa','finalizado'].map(o => `<option value="${o}" ${(c.estado || 'activo') === o ? 'selected' : ''}>${o}</option>`).join('')}
            </select>
          </div>
          <div><label>Canal de adquisición</label>
            <select id="cl-canal">
              <option value="">—</option>
              ${['instagram','referido','web','otro'].map(o => `<option ${c.canal_adquisicion === o ? 'selected' : ''}>${o}</option>`).join('')}
            </select>
          </div>
          <div><label>Método de pago</label>
            <select id="cl-mpago">
              <option value="">—</option>
              <option value="paypal" ${c.metodo_pago_preferido === 'paypal' ? 'selected' : ''}>PayPal</option>
              <option value="transferencia" ${c.metodo_pago_preferido === 'transferencia' ? 'selected' : ''}>Transferencia bancaria nacional</option>
            </select>
          </div>
          <div><label>Días de gracia</label><input id="cl-gracia" type="number" value="${c.dias_gracia ?? 3}"></div>
        </div>
      </div>

      <!-- 9. ENTREVISTA INICIAL Y TAGS -->
      <div class="sec sec-amber">
        <div class="sec-title">9 · 📋 Entrevista inicial y tags</div>
        <div class="space-y-3">
          <div>
            <div class="flex items-baseline justify-between flex-wrap gap-1">
              <label>Entrevista inicial / notas (registro largo)</label>
              <button type="button" class="btn btn-secondary btn-sm" onclick="extraerEntrevistaForm()" title="Lee la entrevista y llena los campos vacíos de la ficha (estatura, correo, fecha de nacimiento, sexo, condiciones médicas…)">🪄 Extraer datos de la entrevista</button>
            </div>
            <textarea id="cl-notas" rows="8" placeholder="Descripción completa de la primera entrevista: hábitos, historia, contexto, expectativas, y cualquier nota permanente sobre el cliente…">${escapeHtml(c.notas || '')}</textarea>
            <p class="text-xs text-slate-500 mt-1">💡 Todo lo que captaste en la entrevista inicial + notas permanentes. Sirve como referencia del contexto del cliente.</p>
            <div id="cl-extract-res" class="hidden bg-emerald-50 ring-1 ring-emerald-200 rounded-xl p-3 mt-2 text-xs text-emerald-900"></div>
          </div>
          <div>
            <label>Tags (separa con comas)</label>
            <input id="cl-tags" placeholder="viajero, principiante, motivado…" value="${(c.tags || []).join(', ')}">
          </div>
        </div>
      </div>
    </div>
  `;
}

window.nuevoCliente = () => {
  window._editingClienteId = null;
  window._pendingEncuesta = null;
  window._pendingMeta = null;
  openModal(modalShell('Nuevo cliente', clienteForm(), `
    <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="guardarCliente()">Guardar</button>
  `), { wide: true });
};

window.editarCliente = async (id) => {
  const c = await db.clientes.get(id);
  window._editingClienteId = id;
  window._pendingEncuesta = c.nivel_actividad ? { nivel: c.nivel_actividad, pal: c.pal_factor || PAL_MAP[c.nivel_actividad], respuestas: c.nivel_actividad_encuesta } : null;
  window._pendingMeta = null;
  openModal(modalShell(`Editar · ${escapeHtml(c.nombre)}`, clienteForm(c), `
    <button class="btn btn-danger mr-auto" onclick="eliminarCliente('${id}')">Eliminar</button>
    <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="guardarCliente('${id}')">Guardar</button>
  `), { wide: true });
};

window.guardarCliente = async (id = null) => {
  const tagsRaw = $('#cl-tags').value;
  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
  const row = {
    nombre: $('#cl-nombre').value.trim(),
    fecha_nacimiento: $('#cl-nac').value || null,
    sexo: $('#cl-sexo').value || null,
    email: $('#cl-email').value.trim() || null,
    telefono: $('#cl-tel').value.trim() || null,
    ciudad: $('#cl-ciudad').value.trim() || null,
    profesion: $('#cl-prof').value.trim() || null,
    objetivo: [...$$('#cl-obj-tags input:checked').map(i => i.value), $('#cl-obj-otro').value.trim()].filter(Boolean).join(', ') || null,
    meta_especifica: $('#cl-meta').value.trim() || null,
    lugar_entreno: $('#cl-lugar').value || null,
    dias_entreno_cantidad: $('#cl-dias-ent').value ? Number($('#cl-dias-ent').value) : null,
    dias_entreno: $$('#cl-dias-sem input:checked').map(i => i.value),
    fase_programa: $('#cl-fase').value || null,
    estatura_cm: $('#cl-alt').value ? Number($('#cl-alt').value) : null,
    restricciones_lesiones: $('#cl-rest').value.trim() || null,
    patologias: $('#cl-pat').value.trim() || null,
    suplementos: $('#cl-sup').value.trim() || null,
    actividades_complementarias: $('#cl-acts-comp').value.trim() || null,
    lesion_actual: $('#cl-lesion').value.trim() || null,
    lesion_estado: $('#cl-lesion-est').value || null,
    antecedentes_deportivos: $('#cl-ant').value.trim() || null,
    objetivo_calorico: $('#cl-objk').value || null,
    proteina_g_kg: $('#cl-prote-gkg').value ? Number($('#cl-prote-gkg').value) : null,
    ...(window._pendingEncuesta ? {
      nivel_actividad: window._pendingEncuesta.nivel,
      pal_factor: window._pendingEncuesta.pal,
      nivel_actividad_encuesta: window._pendingEncuesta.respuestas,
    } : {}),
    ...(window._pendingMeta || {}),
    monto: Number($('#cl-monto').value) || 0,
    moneda: $('#cl-moneda').value,
    dia_pago: $('#cl-dia').value ? Number($('#cl-dia').value) : null,
    fecha_inicio: $('#cl-inicio').value || null,
    estado: $('#cl-estado').value,
    canal_adquisicion: $('#cl-canal').value || null,
    metodo_pago_preferido: $('#cl-mpago').value || null,
    dias_gracia: $('#cl-gracia').value ? Number($('#cl-gracia').value) : 3,
    tags,
    notas: $('#cl-notas').value.trim() || null,
  };
  if (!row.nombre) { toast('Falta el nombre'); return; }
  const r = await guardarClienteSeguro(id, row);
  if (!r.ok) return;
  window._pendingEncuesta = null;
  window._pendingMeta = null;
  closeModal();
  toast(r.sinColumnas ? '⚠️ Guardado, pero sin los campos nuevos: corre la migración de schema.sql en Supabase' : 'Guardado');
  await sincronizarAccesoApps();   // activo/pausa/finalizado se refleja YA en las apps
  navigate('clientes');
};

// Guarda un cliente tolerando que la BD aún no tenga las columnas nuevas
// (email/telefono): si Supabase las rechaza, reintenta sin ellas y avisa.
const COLS_NUEVAS_CLIENTE = ['email', 'telefono', 'suplementos', 'actividades_complementarias'];
async function guardarClienteSeguro(id, row) {
  const q = (r) => id ? sb.from('clientes').update(r).eq('id', id) : sb.from('clientes').insert(r);
  let { error } = await q(row);
  let sinColumnas = false;
  if (error && COLS_NUEVAS_CLIENTE.some(col => (error.message || '').includes(`'${col}'`))) {
    sinColumnas = true;
    const r2 = { ...row };
    COLS_NUEVAS_CLIENTE.forEach(col => delete r2[col]);
    ({ error } = Object.keys(r2).length ? await q(r2) : { error: null });
  }
  if (error) { toast(error.message); return { ok: false, sinColumnas }; }
  _clientesCache = null;
  return { ok: true, sinColumnas };
}

// =====================================================
// ACCESO DE CLIENTES A LAS APPS (Mealtracker · Centro de recursos)
// El CRM es la fuente de verdad: cada vez que se crea, edita, pausa o
// elimina un cliente, reconstruye la tabla acceso_apps con SOLO los
// clientes activos. Las apps externas leen esa tabla (solo lectura con
// la anon key) en vez de tener nombres quemados en el código.
// Requiere la tabla acceso_apps (ver migración en schema.sql).
// =====================================================
let _accesoAppsAviso = false;
async function sincronizarAccesoApps() {
  try {
    const clientes = await db.clientes.refresh();
    const activos = clientes.filter(c => c.estado === 'activo');
    // dedupe por nombre normalizado (la tabla tiene unique por eso)
    const vistos = new Set();
    const rows = [];
    for (const c of activos) {
      const n = normalizeName(c.nombre);
      if (!n || vistos.has(n)) continue;
      vistos.add(n);
      rows.push({ nombre: c.nombre, nombre_normalizado: n, estado: 'activo', actualizado_en: new Date().toISOString() });
    }
    // rebuild completo: simple y a prueba de renombres, pausas y eliminaciones
    const { error: eDel } = await sb.from('acceso_apps').delete().gte('actualizado_en', '1970-01-01');
    if (eDel) throw eDel;
    if (rows.length) {
      const { error: eIns } = await sb.from('acceso_apps').insert(rows);
      if (eIns) throw eIns;
    }
    return true;
  } catch (e) {
    if (!_accesoAppsAviso) {
      _accesoAppsAviso = true;
      toast('⚠️ No pude actualizar la lista de acceso de las apps. ¿Corriste la migración acceso_apps de schema.sql en Supabase?');
    }
    console.warn('sincronizarAccesoApps:', e?.message || e);
    return false;
  }
}
window.sincronizarAccesoApps = sincronizarAccesoApps;

// =====================================================
// EXTRACCIÓN DE DATOS DESDE LA ENTREVISTA INICIAL
// Lee el texto libre de la entrevista (campo notas) y propone valores SOLO
// para campos de identidad/salud que estén vacíos. Nunca propone ni toca:
// seguimientos semanales, días de calendario, ni datos comerciales.
// =====================================================
const MESES_ES = { enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06', julio: '07', agosto: '08', septiembre: '09', setiembre: '09', octubre: '10', noviembre: '11', diciembre: '12' };
const KW_PATOLOGIAS = ['hipotiroidismo', 'hipertiroidismo', 'hipertensión', 'hipertension', 'prediabetes', 'prediabético', 'prediabetico', 'diabetes', 'resistencia a la insulina', 'colesterol alto', 'colesterol elevado', 'triglicéridos', 'trigliceridos', 'hígado graso', 'higado graso', 'gastritis', 'colon irritable', 'asma', 'ansiedad', 'depresión', 'depresion', 'ovario poliquístico', 'ovario poliquistico', 'sop', 'apnea', 'migraña', 'migrana', 'anemia', 'artritis', 'artrosis', 'fibromialgia', 'tiroides'];
const KW_LESIONES = ['hernia', 'lumbalgia', 'escoliosis', 'tendinitis', 'tendinopatía', 'tendinopatia', 'menisco', 'ligamento cruzado', 'manguito rotador', 'fascitis', 'condromalacia', 'esguince', 'fractura', 'luxación', 'luxacion', 'ciática', 'ciatica', 'pinzamiento', 'bursitis', 'túnel carpiano', 'tunel carpiano', 'dolor lumbar', 'dolor de rodilla', 'dolor de hombro', 'dolor de espalda', 'dolor de cadera', 'lesión', 'lesion'];
const KW_SUPLEMENTOS = ['creatina', 'whey', 'proteína en polvo', 'proteina en polvo', 'omega 3', 'omega-3', 'magnesio', 'vitamina d', 'vitamina c', 'multivitamínico', 'multivitaminico', 'colágeno', 'colageno', 'melatonina', 'zinc', 'pre-entreno', 'preentreno', 'bcaa', 'glutamina', 'ashwagandha', 'cafeína en cápsulas'];

function extraerDatosEntrevista(texto, c = {}) {
  const props = [];   // { campo, label, valor, fuente }
  if (!texto || !texto.trim()) return props;
  const t = texto;
  const tLow = t.toLowerCase();

  const snippet = (idx, largo = 70) => {
    if (idx == null) return '';
    const ini = Math.max(0, idx - 20);
    return (ini > 0 ? '…' : '') + t.slice(ini, idx + largo).replace(/\s+/g, ' ').trim() + (idx + largo < t.length ? '…' : '');
  };
  const add = (campo, label, valor, idx, nota = '') => {
    if (valor == null || valor === '') return;
    if (c[campo]) return;                                 // nunca pisar lo ya diligenciado
    if (props.some(p => p.campo === campo)) return;       // primera coincidencia gana
    props.push({ campo, label, valor: String(valor), fuente: snippet(idx), nota });
  };

  // --- Correo ---
  const mEmail = t.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
  if (mEmail) add('email', 'Correo', mEmail[0].toLowerCase(), mEmail.index);

  // --- Teléfono: con etiqueta (tel/cel/whatsapp) o formato internacional +XX ---
  let mTel = t.match(/(?:tel[eé]fono|tel|cel(?:ular)?|whatsapp|wpp|contacto)\s*[:.]?\s*(\+?[\d][\d\s().-]{7,18}\d)/i);
  if (!mTel) {
    const mIntl = t.match(/\+\d[\d\s().-]{8,17}\d/);
    if (mIntl) mTel = { 1: mIntl[0], index: mIntl.index };
  }
  if (mTel) {
    const digitos = (mTel[1] || '').replace(/[^\d+]/g, '');
    if (digitos.replace('+', '').length >= 10) add('telefono', 'Teléfono', digitos, mTel.index);
  }

  // --- Estatura (a cm) ---
  let mEst = tLow.match(/(?:estatura|altura|mide|mido)\D{0,12}(\d{3}|\d[.,]\d{1,2})\s*(m|mts|mt|metros|cm)?\b/);
  if (!mEst) mEst = tLow.match(/\b(1[.,]\d{2})\s*(m|mts|mt|metros)\b/) || tLow.match(/\b(1[2-9]\d|2[0-2]\d)\s*(cm)\b/);
  if (mEst) {
    let est = Number(String(mEst[1]).replace(',', '.'));
    if (est < 3) est = Math.round(est * 100);   // 1.70 m → 170 cm
    if (est >= 120 && est <= 225) add('estatura_cm', 'Estatura (cm)', est, mEst.index);
  }

  // --- Fecha de nacimiento (dd/mm/aaaa, dd-mm-aaaa o "15 de marzo de 1990") ---
  const aaaaOk = (y) => y >= 1940 && y <= 2012;   // año plausible de nacimiento
  const norm2 = (n) => String(n).padStart(2, '0');
  let fnac = null, idxNac = null;
  let mNac = t.match(/(?:naci[oó]|nacimiento|f\.?\s*(?:de\s*)?nac\w*)\D{0,20}?(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/i);
  if (mNac) {
    let y = Number(mNac[3]); if (y < 100) y += y > 25 ? 1900 : 2000;
    if (aaaaOk(y)) { fnac = `${y}-${norm2(mNac[2])}-${norm2(mNac[1])}`; idxNac = mNac.index; }
  }
  if (!fnac) {
    mNac = t.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (mNac && aaaaOk(Number(mNac[3])) && Number(mNac[2]) <= 12 && Number(mNac[1]) <= 31) {
      fnac = `${mNac[3]}-${norm2(mNac[2])}-${norm2(mNac[1])}`; idxNac = mNac.index;
    }
  }
  if (!fnac) {
    mNac = tLow.match(/(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(?:de\s+|del\s+)?(\d{4})/);
    if (mNac && aaaaOk(Number(mNac[3]))) { fnac = `${mNac[3]}-${MESES_ES[mNac[2]]}-${norm2(mNac[1])}`; idxNac = mNac.index; }
  }
  if (fnac) add('fecha_nacimiento', 'Fecha de nacimiento', fnac, idxNac);
  else {
    // Solo edad → fecha aproximada (la edad alimenta el cálculo de la meta)
    const mEdad = tLow.match(/(?:tiene|tengo|edad\s*[:=]?)\s*(\d{1,2})\s*años/) || tLow.match(/(?<!hace\s)(\b\d{1,2})\s*años\b/);
    if (mEdad) {
      const edad = Number(mEdad[1]);
      if (edad >= 14 && edad <= 85 && !c.fecha_nacimiento) {
        const y = new Date().getFullYear() - edad;
        add('fecha_nacimiento', 'Fecha de nacimiento', `${y}-01-01`, mEdad.index, `aproximada: solo dice "${edad} años"`);
      }
    }
  }

  // --- Sexo ---
  let mSexo = tLow.match(/sexo\s*[:=]?\s*(m\b|f\b|masculino|femenino|hombre|mujer)/);
  if (!mSexo) mSexo = tLow.match(/\b(masculino|femenino|hombre|mujer|varón|varon)\b/);
  if (mSexo) {
    const v = mSexo[1] || mSexo[0];
    const sexo = /^(f|femenin|mujer)/.test(v) ? 'F' : 'M';
    add('sexo', 'Sexo', sexo, mSexo.index);
  }

  // --- Ciudad ---
  const mCiudad = t.match(/(?:ciudad|vive en|vivo en|reside en|radicad[oa] en|ubicad[oa] en|desde)\s*[:=]?\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñü]+(?:\s+(?:de|del|la|las|los)?\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+)?)/);
  if (mCiudad) add('ciudad', 'Ciudad', mCiudad[1].trim(), mCiudad.index);

  // --- Profesión ---
  let mProf = t.match(/(?:profesi[oó]n|ocupaci[oó]n)\s*[:=]?\s*([^\n,.;]{3,40})/i);
  if (!mProf) mProf = t.match(/trabaja\s+(?:como|de)\s+([^\n,.;]{3,40})/i);
  if (mProf) add('profesion', 'Profesión', mProf[1].trim(), mProf.index);

  // --- Condiciones médicas / patologías ---
  let mPat = t.match(/(?:condici[oó]n(?:es)?\s+m[eé]dica(?:s)?|patolog[ií]a(?:s)?|diagn[oó]stico|enfermedad(?:es)?)\s*[:=]\s*([^\n]{3,150})/i);
  if (mPat) add('patologias', 'Condiciones médicas', mPat[1].trim(), mPat.index);
  else {
    const encontradas = [];
    let primerIdx = null;
    for (const kw of KW_PATOLOGIAS) {
      const idx = tLow.indexOf(kw);
      if (idx === -1) continue;
      if (/\b(sin|no tiene|no presenta|niega|descarta)\b[^.\n]{0,30}$/.test(tLow.slice(Math.max(0, idx - 40), idx))) continue;  // "sin diabetes"
      if (!encontradas.some(e => kw.includes(e) || e.includes(kw))) encontradas.push(kw);
      if (primerIdx === null) primerIdx = idx;
    }
    if (encontradas.length) add('patologias', 'Condiciones médicas', encontradas.join(', '), primerIdx);
  }

  // --- Restricciones / lesiones ---
  let mLes = t.match(/(?:lesi[oó]n(?:es)?|restricci[oó]n(?:es)?)\s*[:=]\s*([^\n]{3,150})/i);
  if (mLes) add('restricciones_lesiones', 'Restricciones / lesiones', mLes[1].trim(), mLes.index);
  else {
    const frases = [];
    let primerIdx = null;
    const oraciones = t.split(/(?<=[.;\n])/);
    for (const kw of KW_LESIONES) {
      const idx = tLow.indexOf(kw);
      if (idx === -1) continue;
      if (/\b(sin|no tiene|no presenta|niega|ninguna)\b[^.\n]{0,30}$/.test(tLow.slice(Math.max(0, idx - 40), idx))) continue;
      const oracion = oraciones.find(o => o.toLowerCase().includes(kw));
      const frase = (oracion || kw).replace(/\s+/g, ' ').trim().replace(/[.;\s]+$/, '');
      if (frase && !frases.some(f => f.includes(frase) || frase.includes(f))) frases.push(frase.length > 90 ? kw : frase);
      if (primerIdx === null) primerIdx = idx;
      if (frases.join('; ').length > 200) break;
    }
    if (frases.length) add('restricciones_lesiones', 'Restricciones / lesiones', frases.join('; '), primerIdx);
  }

  // --- Antecedentes deportivos ---
  let mAnt = t.match(/antecedentes\s+deportivos?\s*[:=]?\s*([^\n]{3,150})/i);
  if (!mAnt) mAnt = t.match(/(?:practic(?:ó|aba|a)|jug(?:ó|aba)|entren(?:ó|aba)|compet[ií]a)\s+([^\n,.;]{3,80})/i);
  if (mAnt) add('antecedentes_deportivos', 'Antecedentes deportivos', mAnt[1].trim(), mAnt.index);

  // --- Suplementos ---
  let mSup = t.match(/suplement(?:os|ación|acion)?\s*[:=]\s*([^\n]{3,150})/i);
  if (!mSup) mSup = t.match(/(?<!no\s)(?<!no)toma\s+(?:suplementos?\s*[:=]?\s*)?((?:[^\n,.;]*\b(?:creatina|whey|omega|magnesio|vitamina|colágeno|colageno|melatonina)\b)[^\n.;]{0,80})/i);
  if (mSup) add('suplementos', 'Suplementos', mSup[1].trim(), mSup.index);
  else {
    const sups = [];
    let primerIdxSup = null;
    for (const kw of KW_SUPLEMENTOS) {
      const idx = tLow.indexOf(kw);
      if (idx === -1) continue;
      if (/\b(sin|no toma|no usa|no consume)\b[^.\n]{0,30}$/.test(tLow.slice(Math.max(0, idx - 40), idx))) continue;
      if (!sups.some(e => kw.includes(e) || e.includes(kw))) sups.push(kw);
      if (primerIdxSup === null) primerIdxSup = idx;
    }
    if (sups.length) add('suplementos', 'Suplementos', sups.join(', '), primerIdxSup);
  }

  return props;
}

// --- Botón del formulario: llena los campos vacíos con lo extraído ---
const CAMPO_A_INPUT = {
  email: 'cl-email', telefono: 'cl-tel', fecha_nacimiento: 'cl-nac', sexo: 'cl-sexo',
  ciudad: 'cl-ciudad', profesion: 'cl-prof', estatura_cm: 'cl-alt',
  patologias: 'cl-pat', restricciones_lesiones: 'cl-rest', antecedentes_deportivos: 'cl-ant',
  suplementos: 'cl-sup', actividades_complementarias: 'cl-acts-comp',
};
window.extraerEntrevistaForm = () => {
  const texto = $('#cl-notas')?.value || '';
  if (!texto.trim()) { toast('La entrevista está vacía: pega primero el texto en el recuadro'); return; }
  // "Vacío" se evalúa contra lo que hay AHORA en el formulario
  const actual = {};
  for (const [campo, inputId] of Object.entries(CAMPO_A_INPUT)) actual[campo] = $(`#${inputId}`)?.value?.trim() || '';
  const props = extraerDatosEntrevista(texto, actual);
  const res = $('#cl-extract-res');
  if (!props.length) {
    if (res) { res.classList.remove('hidden'); res.innerHTML = 'No encontré datos nuevos que falten en la ficha. Los campos ya llenos no se tocan.'; }
    return;
  }
  for (const p of props) {
    const el = $(`#${CAMPO_A_INPUT[p.campo]}`);
    if (el) el.value = p.valor;
  }
  if (res) {
    res.classList.remove('hidden');
    res.innerHTML = `
      <div class="font-bold mb-1">🪄 Llené ${props.length} campo(s) desde la entrevista:</div>
      ${props.map(p => `<div>✓ <strong>${p.label}:</strong> ${escapeHtml(p.valor)}${p.nota ? ` <span class="text-amber-700">(${escapeHtml(p.nota)})</span>` : ''}</div>`).join('')}
      <div class="text-emerald-700 mt-1">Revisa y corrige lo que haga falta. Nada se guarda hasta que des "Guardar".</div>`;
  }
  toast(`🪄 ${props.length} campo(s) diligenciados · revisa antes de guardar`);
};

// --- Revisión masiva: extrae de las entrevistas de TODOS los clientes ---
window.revisarEntrevistas = async () => {
  const clientes = await db.clientes.refresh();
  const packs = clientes
    .filter(c => c.notas && c.notas.trim())
    .map(c => ({ clienteId: c.id, nombre: c.nombre, props: extraerDatosEntrevista(c.notas, c) }))
    .filter(p => p.props.length);
  if (!packs.length) { toast('Nada por diligenciar: no encontré en las entrevistas datos que falten en las fichas'); return; }
  window._entrevistaProps = packs;
  const total = packs.reduce((a, p) => a + p.props.length, 0);
  openModal(modalShell('🪄 Completar fichas desde entrevistas', `
    <div class="text-sm text-slate-600 mb-3">Encontré <strong>${total} dato(s)</strong> en las entrevistas de <strong>${packs.length} cliente(s)</strong> que faltan en sus fichas. Solo se llenan campos vacíos: no se tocan seguimientos, calendario de entreno ni datos comerciales. Desmarca lo que no quieras y edita el valor si hace falta.</div>
    <div class="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
      ${packs.map((pk, ci) => `
        <div class="bg-slate-50 rounded-xl p-3">
          <div class="font-bold text-slate-800 text-sm mb-2">${escapeHtml(pk.nombre)}</div>
          <div class="space-y-2">
            ${pk.props.map((p, pi) => `
              <div class="bg-white rounded-lg p-2 ring-1 ring-slate-200">
                <div class="flex items-center gap-2">
                  <input type="checkbox" id="ext-${ci}-${pi}" class="rounded" checked>
                  <label for="ext-${ci}-${pi}" class="!mb-0 !text-xs whitespace-nowrap">${p.label}</label>
                  <input id="extv-${ci}-${pi}" class="!py-1 !text-xs flex-1" value="${escapeHtml(p.valor)}">
                </div>
                ${p.nota ? `<div class="text-xs text-amber-700 mt-1 ml-6">⚠️ ${escapeHtml(p.nota)}</div>` : ''}
                ${p.fuente ? `<div class="text-xs text-slate-400 mt-1 ml-6">«${escapeHtml(p.fuente)}»</div>` : ''}
              </div>`).join('')}
          </div>
        </div>`).join('')}
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="aplicarEntrevistas()">Aplicar seleccionados</button>
  `), { wide: true });
};

window.aplicarEntrevistas = async () => {
  const packs = window._entrevistaProps || [];
  const updates = [];
  packs.forEach((pk, ci) => {
    const row = {};
    pk.props.forEach((p, pi) => {
      if (!$(`#ext-${ci}-${pi}`)?.checked) return;
      let val = ($(`#extv-${ci}-${pi}`)?.value || '').trim();
      if (!val) return;
      if (p.campo === 'estatura_cm') { const n = Number(val); if (!n) return; val = n; }
      row[p.campo] = val;
    });
    if (Object.keys(row).length) updates.push({ id: pk.clienteId, nombre: pk.nombre, row });
  });
  if (!updates.length) { toast('No hay datos seleccionados'); return; }
  const totalCampos = updates.reduce((a, u) => a + Object.keys(u.row).length, 0);
  if (!confirm(`Vas a diligenciar ${totalCampos} dato(s) en ${updates.length} cliente(s).\nSolo se llenan campos vacíos de la ficha.\n\n¿Confirmas?`)) return;
  let ok = 0, sinCols = false;
  for (const u of updates) {
    const r = await guardarClienteSeguro(u.id, u.row);
    if (r.ok) ok++;
    if (r.sinColumnas) sinCols = true;
  }
  window._entrevistaProps = null;
  closeModal();
  toast(`✓ ${ok}/${updates.length} fichas actualizadas${sinCols ? ' · correo/teléfono requieren la migración de schema.sql' : ''}`);
  navigate('clientes');
};

// ===== Encuesta nivel de actividad =====
// innerHTML no conserva lo tecleado en inputs (son propiedades, no atributos):
// guardar/restaurar los valores aparte para no perder el formulario a medio llenar.
function guardarValoresModalCliente() {
  const vals = {};
  $$('input, textarea, select', modalContent).forEach(el => {
    if (el.id) vals[el.id] = el.type === 'checkbox' ? el.checked : el.value;
  });
  window._modalClienteValores = vals;
  window._modalClienteDias = $$('#cl-dias-sem input:checked').map(i => i.value);
  window._modalClienteObj = $$('#cl-obj-tags input:checked').map(i => i.value);
}
function restaurarModalCliente() {
  modalContent.innerHTML = window._modalClienteHTML || '';
  const vals = window._modalClienteValores || {};
  for (const [id, v] of Object.entries(vals)) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = v; else el.value = v;
  }
  $$('#cl-dias-sem input').forEach(i => { i.checked = (window._modalClienteDias || []).includes(i.value); });
  $$('#cl-obj-tags input').forEach(i => { i.checked = (window._modalClienteObj || []).includes(i.value); });
}

window.abrirEncuestaActividad = () => {
  const modalActual = modalContent.innerHTML;  // guardo estado del modal cliente
  guardarValoresModalCliente();
  openModal(modalShell('Encuesta · nivel de actividad', `
    <div class="space-y-4 text-sm">
      ${ENCUESTA_ACTIVIDAD.map(q => `
        <div>
          <label class="mb-1">${q.label}</label>
          <div class="flex gap-2 flex-wrap">
            ${q.opts.map(([lbl, val]) => `
              <label class="flex items-center gap-1.5 bg-slate-50 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-slate-100">
                <input type="radio" name="${q.key}" value="${val}"> ${lbl}
              </label>
            `).join('')}
          </div>
        </div>
      `).join('')}
      <div id="enc-result" class="hidden bg-emerald-50 rounded-xl p-3 text-emerald-900 text-sm"></div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="cerrarEncuesta()">Cancelar</button>
    <button class="btn btn-primary" onclick="calcularEncuesta()">Calcular</button>
  `), { wide: false });
  window._modalClienteHTML = modalActual;
};

window.calcularEncuesta = () => {
  const respuestas = {};
  for (const q of ENCUESTA_ACTIVIDAD) {
    const el = document.querySelector(`input[name="${q.key}"]:checked`);
    if (!el) { toast(`Falta responder: ${q.label}`); return; }
    respuestas[q.key] = Number(el.value);
  }
  const r = nivelDesdeEncuesta(respuestas);
  window._pendingEncuesta = { nivel: r.nivel, pal: r.pal, respuestas };
  const el = $('#enc-result');
  el.classList.remove('hidden');
  el.innerHTML = `<strong>Resultado:</strong> nivel <strong>${r.nivel.replace('_',' ')}</strong> · PAL <strong>${r.pal}</strong> · puntaje ${r.total}. Click "Aplicar" para guardarlo en la ficha.`;
  el.insertAdjacentHTML('afterend', `<div class="flex justify-end mt-3"><button class="btn btn-primary" onclick="aplicarEncuesta()">Aplicar</button></div>`);
};

window.aplicarEncuesta = () => {
  // Volver al modal del cliente con el nivel puesto (y lo tecleado intacto)
  restaurarModalCliente();
  if (window._pendingEncuesta) {
    const el = $('#cl-nivel');
    if (el) el.value = `${window._pendingEncuesta.nivel.replace('_',' ')} · PAL ${window._pendingEncuesta.pal}`;
  }
  toast('Nivel de actividad aplicado');
};

window.cerrarEncuesta = () => {
  restaurarModalCliente();
};

// ===== Recalcular meta nutricional =====
window.recalcularMeta = async () => {
  // Datos que vienen del form actual (aún no guardado)
  const estatura = Number($('#cl-alt').value);
  const sexo = $('#cl-sexo').value;
  const fnac = $('#cl-nac').value;
  const objetivoK = $('#cl-objk').value;
  const enc = window._pendingEncuesta;

  if (!estatura) { toast('Falta estatura'); return; }
  if (!sexo) { toast('Falta sexo'); return; }
  if (!fnac) { toast('Falta fecha de nacimiento'); return; }
  if (!objetivoK) { toast('Falta objetivo calórico'); return; }
  if (!enc) { toast('Falta hacer la encuesta de nivel de actividad'); return; }

  const edad = helpers.edadDe(fnac);
  const objData = OBJETIVOS_KCAL.find(o => o.key === objetivoK);

  // Peso: última medición corporal del cliente, o pregunta
  let peso = null, grasa = null;
  const clienteId = window._editingClienteId;
  if (clienteId) {
    const meds = await db.mediciones.listCliente(clienteId);
    const ult = meds[meds.length - 1];
    if (ult) { peso = ult.peso; grasa = ult.grasa_pct; }
  }
  if (!peso) {
    const p = prompt('¿Peso actual en kg? (aún no tienes medición registrada)');
    if (!p) return;
    peso = Number(p);
  }
  if (!grasa) {
    const g = prompt('¿% de grasa corporal? (opcional, deja vacío si no lo sabes)', '');
    if (g) grasa = Number(g);
  }

  const meta = calcMetaNutricional({
    peso, altura: estatura, edad, sexo, grasa_pct: grasa,
    pal: enc.pal, objetivo_pct: objData.pct,
    proteina_g_kg: $('#cl-prote-gkg')?.value,
  });
  if (!meta) { toast('Datos insuficientes'); return; }

  window._pendingMeta = {
    meta_calorias: meta.kcal,
    meta_proteina_g: meta.proteina,
    meta_grasas_g: meta.grasas,
    meta_carbos_g: meta.carbos,
    meta_metodo: meta.metodo,
    meta_argumento: meta.argumento,
    meta_calculada_en: new Date().toISOString(),
  };

  // Meta específica (sección 2): se toma del cálculo, editable a mano después.
  // Si el coach escribió algo propio (no empieza con "#### kcal"), se conserva y
  // la línea calculada se agrega al final.
  const cm = $('#cl-meta');
  if (cm) {
    const pct = (kcalMacro) => Math.round((kcalMacro / meta.kcal) * 100);
    const linea = `${meta.kcal} kcal: ${meta.proteina}P / ${meta.carbos}C / ${meta.grasas}G (${pct(meta.proteina * 4)}% / ${pct(meta.carbos * 4)}% / ${pct(meta.grasas * 9)}%)`;
    const actual = cm.value.trim();
    if (!actual || /^\d{3,4}\s*\.?\s*kcal/i.test(actual)) cm.value = linea;
    else cm.value = actual.split('\n').filter(l => !/^\d{3,4}\s*\.?\s*kcal/i.test(l.trim())).join('\n').trim() + '\n' + linea;
  }

  $('#meta-preview').innerHTML = `
    <div class="font-bold text-emerald-700 text-base">${meta.kcal} kcal · ${meta.proteina}g prote · ${meta.grasas}g grasas · ${meta.carbos}g carbos</div>
    <div class="text-xs text-slate-500 mt-1">${meta.metodo} · calculada ahora</div>
    <details class="mt-2" open><summary class="text-xs text-emerald-700 cursor-pointer">Ver argumento del cálculo</summary><pre class="text-xs text-slate-600 mt-1 whitespace-pre-wrap">${escapeHtml(meta.argumento)}</pre></details>
    <p class="text-xs text-amber-700 mt-2">⚠️ Aún no guardada. Click en "Guardar" abajo para persistir.</p>
  `;
};

window.eliminarCliente = async (id) => {
  const c = await db.clientes.get(id);
  if (!c) return;
  // Confirmación fuerte: borra en cascada seguimientos, pagos, mediciones y pendientes
  const resp = prompt(`⚠️ Esto elimina a "${c.nombre}" y TODO su historial (seguimientos, pagos, mediciones, pendientes). No se puede deshacer.\n\nEscribe el nombre del cliente para confirmar:`);
  if (resp === null) return;
  if (normalizeName(resp) !== normalizeName(c.nombre)) { toast('El nombre no coincide · no se eliminó'); return; }
  await db.clientes.remove(id);
  closeModal();
  toast('Cliente eliminado');
  await sincronizarAccesoApps();
  navigate('clientes');
};

window.verCliente = async (id) => {
  const [c, segs, pends, pagos, meds] = await Promise.all([
    db.clientes.get(id),
    db.seguimientos.listCliente(id),
    db.pendientes.listCliente(id),
    sb.from('pagos').select('*').eq('cliente_id', id).order('mes', { ascending: false }),
    db.mediciones.listCliente(id),
  ]);
  const edad = helpers.edadDe(c.fecha_nacimiento);

  // Adherencia promedio en escala 0-10: score_global (0-100) ÷ 10, fallback a promedioAdh
  const adhVals = segs.slice(0, 4).map(s => s.score_global != null ? s.score_global / 10 : helpers.promedioAdh(s)).filter(v => v !== null);
  const promAdh = adhVals.length ? adhVals.reduce((a, b) => a + b, 0) / adhVals.length : null;

  // Streaks
  const segsDesc = segs.slice().sort((a, b) => b.semana.localeCompare(a.semana));
  const streakF = calcStreakDim(segsDesc, s => s.fuerza_planeados > 0 && (s.fuerza_ejecutados / s.fuerza_planeados) >= 0.75);
  const streakC = calcStreakDim(segsDesc, s => s.cardio_planeados > 0 && (s.cardio_ejecutados / s.cardio_planeados) >= 0.75);
  const streakGlobal = calcStreakDim(segsDesc, s => (s.score_global ?? 0) >= 75);

  // Serie de mediciones para gráfica
  const medsAsc = meds.slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
  const labelsMed = medsAsc.map(m => fmt.fechaCorta(m.fecha));
  const pesos = medsAsc.map(m => m.peso ?? null).filter(v => v !== null);
  const grasas = medsAsc.map(m => m.grasa_pct ?? null).filter(v => v !== null);

  // Composición corporal: última medición + estimaciones
  const ultMed = meds.length ? meds[meds.length - 1] : null;
  const comp = ultMed ? calcComposicionCorporal({
    peso: ultMed.peso,
    grasa_pct: ultMed.grasa_pct,
    edad,
    sexo: c.sexo,
    altura_cm: c.estatura_cm,
  }) : null;

  // Historial de composición corporal para gráfica de barras estimadas
  const compHist = medsAsc.map(m => calcComposicionCorporal({
    peso: m.peso,
    grasa_pct: m.grasa_pct,
    edad,
    sexo: c.sexo,
    altura_cm: c.estatura_cm,
  })).filter(x => x);

  openModal(modalShell(escapeHtml(c.nombre), `
    <div class="space-y-4">
      <div class="flex gap-2 flex-wrap">
        <button class="btn btn-secondary btn-sm" onclick="editarCliente('${c.id}')">✎ Editar</button>
        <button class="btn btn-secondary btn-sm" onclick="abrirNuevoSeguimiento('${c.id}')">+ Nueva semana</button>
        <button class="btn btn-secondary btn-sm" onclick="nuevoPendiente('${c.id}')">+ Pendiente</button>
        <button class="btn btn-secondary btn-sm" onclick="nuevaMedicion('${c.id}')">+ Medición corporal</button>
      </div>

      ${streakF > 1 || streakC > 1 || streakGlobal > 1 ? `
      <div class="flex gap-2 flex-wrap">
        ${streakF > 1 ? `<span class="tag tag-green">🔥 ${streakF} sem fuerza</span>` : ''}
        ${streakC > 1 ? `<span class="tag tag-green">🔥 ${streakC} sem cardio</span>` : ''}
        ${streakGlobal > 1 ? `<span class="tag tag-violet">🏆 ${streakGlobal} sem cumpliendo global</span>` : ''}
      </div>` : ''}

      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <div><span class="text-slate-500 text-xs">Estado:</span><br><strong>${c.estado}</strong></div>
        <div><span class="text-slate-500 text-xs">Mensualidad:</span><br><strong>${fmt.money(c.monto, c.moneda)}</strong></div>
        <div><span class="text-slate-500 text-xs">Día pago:</span><br><strong>${c.dia_pago || '—'}</strong></div>
        <div><span class="text-slate-500 text-xs">Adherencia 4 sem:</span><br><strong class="${promAdh === null ? '' : promAdh >= 7.5 ? 'text-emerald-600' : promAdh >= 5 ? 'text-amber-600' : 'text-red-600'}">${promAdh === null ? '—' : promAdh.toFixed(1) + '/10'}</strong></div>
        <div><span class="text-slate-500 text-xs">Inició:</span><br><strong>${c.fecha_inicio ? fmt.fecha(c.fecha_inicio) : '—'}</strong></div>
        <div><span class="text-slate-500 text-xs">Canal:</span><br><strong class="capitalize">${c.canal_adquisicion || '—'}</strong></div>
      </div>

      <!-- 1. IDENTIDAD -->
      ${edad || c.ciudad || c.profesion || c.email || c.telefono ? `
        <div class="sec sec-slate space-y-1">
          <div class="sec-title">1 · 👤 Identidad</div>
          ${edad ? `<div><span class="text-slate-500">Edad:</span> <strong>${edad} años</strong> ${c.sexo ? `(${c.sexo})` : ''}</div>` : ''}
          ${c.email ? `<div><span class="text-slate-500">Correo:</span> <strong>${escapeHtml(c.email)}</strong></div>` : ''}
          ${c.telefono ? `<div><span class="text-slate-500">Teléfono:</span> <strong>${escapeHtml(c.telefono)}</strong></div>` : ''}
          ${c.ciudad ? `<div><span class="text-slate-500">Ciudad:</span> <strong>${escapeHtml(c.ciudad)}</strong></div>` : ''}
          ${c.profesion ? `<div><span class="text-slate-500">Profesión:</span> <strong>${escapeHtml(c.profesion)}</strong></div>` : ''}
        </div>` : ''}

      <!-- 2. OBJETIVO Y FASE -->
      ${c.objetivo || c.meta_especifica || c.fase_programa ? `
        <div class="sec sec-olive">
          <div class="sec-title">2 · 🎯 Objetivo y fase</div>
          ${c.objetivo ? `<div class="text-slate-800">${escapeHtml(c.objetivo)}</div>` : ''}
          ${c.meta_especifica ? `<div class="text-slate-600 text-xs mt-1">${escapeHtml(c.meta_especifica)}</div>` : ''}
          ${c.fase_programa ? `<div class="text-slate-600 text-xs mt-1"><span class="text-slate-500">Fase:</span> ${FASES_PROGRAMA.find(f => f.key === c.fase_programa)?.label || c.fase_programa}</div>` : ''}
        </div>` : ''}

      <!-- 3. COMPOSICIÓN CORPORAL -->
      <div class="sec sec-blue">
        <div class="flex items-center justify-between">
          <div class="sec-title" style="margin-bottom:0">3 · 🧬 Composición corporal</div>
          <button class="text-xs text-blue-700 font-semibold hover:underline" onclick="nuevaMedicion('${c.id}')">+ Nueva medición</button>
        </div>
        <div class="mt-3">
        ${!comp ? `<p class="text-xs text-slate-500">Sin mediciones. ${c.estatura_cm ? '' : 'Falta estatura en el perfil. '}Registra la primera para ver estimaciones.</p>` : `
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div><div class="text-xs text-slate-500">Peso</div><div class="font-bold text-lg text-slate-900">${comp.peso_kg} kg</div></div>
            ${comp.masa_grasa_kg != null ? `<div><div class="text-xs text-slate-500">Masa grasa</div><div class="font-bold text-lg" style="color:#f59e0b">${comp.masa_grasa_kg} kg <span class="text-xs text-slate-400">(${ultMed.grasa_pct}%)</span></div></div>` : ''}
            ${comp.masa_magra_kg != null ? `<div><div class="text-xs text-slate-500">Masa magra</div><div class="font-bold text-lg" style="color:#10b981">${comp.masa_magra_kg} kg</div></div>` : ''}
            ${comp.masa_muscular_smm_kg != null ? `<div><div class="text-xs text-slate-500">Músculo esquelético <span class="text-slate-400" title="Estimado con fórmula de Lee 2000">ℹ️</span></div><div class="font-bold text-lg" style="color:#3b82f6">${comp.masa_muscular_smm_kg} kg</div></div>` : ''}
            ${comp.masa_osea_kg != null ? `<div><div class="text-xs text-slate-500">Masa ósea <span class="text-slate-400" title="Estimado con fórmula de Wagner & Heyward 2000">ℹ️</span></div><div class="font-bold text-lg" style="color:#8b5cf6">${comp.masa_osea_kg} kg</div></div>` : ''}
            ${comp.agua_corporal_L != null ? `<div><div class="text-xs text-slate-500">Agua corporal <span class="text-slate-400" title="Estimado con fórmula de Watson 1980">ℹ️</span></div><div class="font-bold text-lg" style="color:#0ea5e9">${comp.agua_corporal_L} L</div></div>` : ''}
            ${comp.masa_residual_kg != null ? `<div><div class="text-xs text-slate-500">Masa residual <span class="text-slate-400" title="Órganos, tejido conectivo, líquidos no incluidos en agua libre. Calculado por resta (modelo 5-compartimentos)">ℹ️</span></div><div class="font-bold text-lg" style="color:#64748b">${comp.masa_residual_kg} kg</div></div>` : ''}
          </div>
          <details class="mt-3">
            <summary class="text-xs text-slate-500 cursor-pointer">Ver fórmulas usadas</summary>
            <div class="text-xs text-slate-600 mt-2 space-y-1">
              <div><strong>Masa magra/grasa:</strong> peso × (%grasa/100) — exacta dado %grasa correcto</div>
              <div><strong>Músculo esquelético (SMM):</strong> Lee et al. (2000) J Appl Physiol 89:465-471. Validado vs. MRI (R²=0.86)</div>
              <div><strong>Masa ósea:</strong> Wagner & Heyward (2000) Med Sci Sports Exerc 32(9). Estimación por peso corporal</div>
              <div><strong>Agua corporal:</strong> Watson et al. (1980) Am J Clin Nutr 33:27-39. Estándar clínico</div>
              <div><strong>Masa residual:</strong> peso − (grasa + músculo + hueso). Modelo 5-compartimentos</div>
              <div class="text-amber-700 mt-2">⚠️ Son ESTIMACIONES basadas en fórmulas científicamente validadas. No reemplazan un DEXA scan. Útiles para trackear tendencias, no para diagnóstico clínico.</div>
            </div>
          </details>
        `}
        </div>
      </div>

      <!-- 4. NIVEL DE ACTIVIDAD Y ENTRENO -->
      ${c.nivel_actividad || c.lugar_entreno || metaDiasEntreno(c) ? `
        <div class="sec sec-teal space-y-1">
          <div class="sec-title">4 · 🏃 Nivel de actividad y entreno</div>
          ${c.nivel_actividad ? `<div><span class="text-slate-500">Nivel:</span> <strong class="capitalize">${c.nivel_actividad.replace('_',' ')}</strong> · PAL ${c.pal_factor || '—'}</div>` : ''}
          ${c.lugar_entreno ? `<div><span class="text-slate-500">Lugar entreno:</span> <strong class="capitalize">${c.lugar_entreno.replace('_',' ')}</strong></div>` : ''}
          ${metaDiasEntreno(c) ? `<div><span class="text-slate-500">Fuerza:</span> <strong>${metaDiasEntreno(c)} días/semana</strong>${(c.dias_entreno || []).length ? ` (${c.dias_entreno.join(' · ')})` : ''}</div>` : ''}
          ${c.actividades_complementarias ? `<div><span class="text-slate-500">Complementarias:</span> <strong>${escapeHtml(c.actividades_complementarias)}</strong> <span class="text-xs text-slate-400">(suman bonus al score, sin meta fija)</span></div>` : ''}
        </div>` : ''}

      <!-- 6. CONDICIONES MÉDICAS / LESIONES -->
      ${c.restricciones_lesiones || c.patologias || c.lesion_actual || c.suplementos ? `
        <div class="sec sec-red">
          <div class="sec-title">6 · ⚕️ Condiciones médicas / lesiones</div>
          ${c.patologias ? `<div class="text-red-700 text-xs"><span class="font-semibold">Patologías:</span> ${escapeHtml(c.patologias)}</div>` : ''}
          ${c.restricciones_lesiones ? `<div class="text-red-700 text-xs mt-1"><span class="font-semibold">Restricciones:</span> ${escapeHtml(c.restricciones_lesiones)}</div>` : ''}
          ${c.lesion_actual ? `<div class="text-red-700 text-xs mt-1"><span class="font-semibold">Lesión actual:</span> ${escapeHtml(c.lesion_actual)}${c.lesion_estado ? ` (${c.lesion_estado.replace('_',' ')})` : ''}</div>` : ''}
          ${c.suplementos ? `<div class="text-slate-700 text-xs mt-1"><span class="font-semibold">💊 Suplementos:</span> ${escapeHtml(c.suplementos)}</div>` : '<div class="text-slate-400 text-xs mt-1">💊 Sin suplementos registrados</div>'}
        </div>` : ''}

      <!-- 7. ANTECEDENTES DEPORTIVOS -->
      ${c.antecedentes_deportivos ? `
        <div class="sec sec-slate">
          <div class="sec-title">7 · 🏅 Antecedentes deportivos</div>
          <div class="text-slate-700">${escapeHtml(c.antecedentes_deportivos)}</div>
        </div>` : ''}

      ${(c.tags && c.tags.length) ? `<div>${c.tags.map(t => `<span class="tag-pill">${escapeHtml(t)}</span>`).join('')}</div>` : ''}

      <div class="sec sec-violet">
        <div class="sec-title">✅ Pendientes (${pends.filter(p => p.estado === 'abierto').length} abiertos)</div>
        ${pends.length === 0 ? '<p class="text-xs text-slate-500">Sin pendientes.</p>' : pends.slice(0, 6).map(p => `
          <div class="flex items-center gap-2 py-1 text-sm">
            <input type="checkbox" class="rounded" ${p.estado === 'completado' ? 'checked' : ''} onchange="togglePendienteFicha('${p.id}', '${p.estado}', '${c.id}')">
            <span class="${p.estado === 'completado' ? 'line-through text-slate-400' : ''}">${p.para === 'coach' ? '🧢 ' : ''}${escapeHtml(p.descripcion)}</span>
            <span class="text-xs ${p.scope === 'general' ? 'text-emerald-600' : 'text-violet-600'} font-semibold">${p.scope === 'general' ? '📌' : '📅'}</span>
          </div>`).join('')}
      </div>

      <div class="sec sec-slate">
        <div class="sec-title">🗓 Últimas semanas (${segs.length})</div>
        ${segs.length === 0 ? '<p class="text-xs text-slate-500">Sin registros.</p>' :
          segs.slice(0, 4).map(s => {
            const p = helpers.promedioAdh(s);
            return `<div class="border-l-2 ${p === null ? 'border-slate-200' : p >= 7.5 ? 'border-emerald-400' : p >= 5 ? 'border-amber-400' : 'border-red-400'} pl-3 py-1 mb-2">
              <div class="text-xs text-slate-500">${fmt.labelSemana(s.semana)} · ${fmt.fechaCorta(s.fecha)} · ${p !== null ? p.toFixed(1) + '/10' : '—'}</div>
              <div class="text-sm">${escapeHtml((s.avances || '').slice(0, 120))}${(s.avances || '').length > 120 ? '…' : ''}</div>
            </div>`;
          }).join('')}
      </div>

      ${(() => {
        const sEnt4 = segs.slice(0, 4).map(s => s.score_entreno).filter(v => v != null);
        const sAlimM4 = segs.slice(0, 4).map(s => s.score_alim_metas).filter(v => v != null);
        const sAlimR4 = segs.slice(0, 4).map(s => s.score_alim_registro).filter(v => v != null);
        const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
        const avgEnt = avg(sEnt4), avgAlimM = avg(sAlimM4), avgAlimR = avg(sAlimR4);
        const hasScores = avgEnt !== null || avgAlimM !== null || avgAlimR !== null;
        if (!hasScores) return '';
        const scoreBar = (label, val, color) => {
          const pct = val !== null ? Math.round(val) : 0;
          const barColor = pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
          return `<div>
            <div class="flex justify-between text-xs mb-1"><span class="text-slate-600 font-semibold">${label}</span><span class="font-bold" style="color:${color}">${val !== null ? pct + '%' : '—'}</span></div>
            <div class="h-2 bg-slate-100 rounded-full overflow-hidden"><div class="h-full rounded-full ${barColor}" style="width:${pct}%"></div></div>
          </div>`;
        };
        return `<div class="sec sec-emerald space-y-2">
          <div class="sec-title">📊 Alineación 4 semanas</div>
          ${scoreBar('Entrenamiento', avgEnt, '#10b981')}
          ${scoreBar('Alimentación · metas', avgAlimM, '#3b82f6')}
          ${scoreBar('Alimentación · registro', avgAlimR, '#8b5cf6')}
        </div>`;
      })()}

      ${c.meta_calorias ? `
        <div class="sec sec-blue">
          <div class="sec-title">5 · 🥗 Meta nutricional diaria</div>
          <div class="text-blue-900 font-semibold">${c.meta_calorias} kcal · ${c.meta_proteina_g}g prote · ${c.meta_grasas_g}g grasas · ${c.meta_carbos_g}g carbos</div>
          <div class="text-xs text-blue-700 mt-1">${c.meta_metodo || ''} · Nivel: ${c.nivel_actividad?.replace('_',' ') || '—'} · PAL ${c.pal_factor || '—'}</div>
          ${c.meta_argumento ? `<details class="mt-2"><summary class="text-xs text-blue-700 cursor-pointer">Ver argumento del cálculo</summary><pre class="text-xs text-slate-600 mt-1 whitespace-pre-wrap">${escapeHtml(c.meta_argumento)}</pre></details>` : ''}
          <div class="flex gap-2 flex-wrap mt-2">
            ${mtConfigured() ? `<button class="btn btn-primary btn-sm" onclick="enviarMetaMealtracker('${c.id}')" title="Cambia la meta en la app Mealtracker del cliente (pide confirmación)">🎯 Enviar meta al Mealtracker</button>` : ''}
            ${c.mealtracker_id ? `<button class="text-xs text-blue-700 font-semibold hover:underline" onclick="abrirNutricionCliente('${c.id}')">📊 Ver dashboard de alimentación</button>` : ''}
          </div>
        </div>` : ''}

      <div class="sec sec-teal">
        <div class="flex items-baseline justify-between mb-2">
          <div class="sec-title" style="margin-bottom:0">📏 Mediciones corporales (${meds.length})</div>
          <button class="text-xs text-teal-700 font-semibold hover:underline" onclick="nuevaMedicion('${c.id}')">+ Agregar</button>
        </div>
        ${meds.length === 0 ? '<p class="text-xs text-slate-500">Sin mediciones registradas.</p>' : `
          ${pesos.length >= 2 ? `
            <div class="bg-slate-50 rounded-xl p-3 mb-2">
              <div class="text-xs font-bold text-slate-700 mb-2">Evolución peso ${grasas.length >= 2 ? '· % grasa' : ''}</div>
              ${(() => {
                const series = [{ label: 'Peso', color: '#10b981', points: medsAsc.map(m => m.peso ?? null) }];
                const minP = Math.min(...pesos), maxP = Math.max(...pesos);
                const opts = { yMin: Math.floor(minP - 3), yMax: Math.ceil(maxP + 3), height: 160 };
                if (grasas.length >= 2) {
                  series.push({ label: '% grasa', color: '#f59e0b', points: medsAsc.map(m => m.grasa_pct ?? null) });
                }
                return lineChart(series, labelsMed, opts);
              })()}
            </div>` : ''}
          ${compHist.length >= 2 && compHist.some(x => x.masa_muscular_smm_kg) ? `
            <div class="bg-slate-50 rounded-xl p-3 mb-2">
              <div class="text-xs font-bold text-slate-700 mb-2">Evolución composición corporal (estimada)</div>
              ${(() => {
                const magrasVals = compHist.map(x => x.masa_magra_kg ?? null);
                const grasasKgVals = compHist.map(x => x.masa_grasa_kg ?? null);
                const smmVals = compHist.map(x => x.masa_muscular_smm_kg ?? null);
                const allVals = [...magrasVals, ...grasasKgVals, ...smmVals].filter(v => v !== null);
                if (!allVals.length) return '';
                const minV = Math.min(...allVals), maxV = Math.max(...allVals);
                const labelsComp = medsAsc.map(m => fmt.fechaCorta(m.fecha));
                return lineChart([
                  { label: 'Masa magra', color: '#10b981', points: magrasVals },
                  { label: 'Músculo esquel.', color: '#3b82f6', points: smmVals },
                  { label: 'Masa grasa', color: '#f59e0b', points: grasasKgVals },
                ], labelsComp, { yMin: Math.max(0, Math.floor(minV - 3)), yMax: Math.ceil(maxV + 3), height: 160 });
              })()}
              <div class="text-[10px] text-slate-500 mt-1">Fórmulas: Lee (SMM), peso × (1-%grasa) (magra)</div>
            </div>` : ''}
          <table><thead><tr><th>Fecha</th><th>Peso</th><th>% grasa</th><th>Cintura</th><th></th></tr></thead><tbody>
            ${meds.slice().reverse().slice(0, 6).map(m => `
              <tr>
                <td>${fmt.fechaCorta(m.fecha)}</td>
                <td>${m.peso ?? '—'}</td>
                <td>${m.grasa_pct ?? '—'}</td>
                <td>${m.cintura ?? '—'}</td>
                <td class="text-right"><button class="btn btn-ghost text-xs" onclick="eliminarMedicion('${m.id}', '${c.id}')">✕</button></td>
              </tr>`).join('')}
          </tbody></table>`}
      </div>

      <div class="sec sec-slate">
        <div class="sec-title">💰 Últimos pagos</div>
        ${(pagos.data || []).length === 0 ? '<p class="text-xs text-slate-500">Sin pagos.</p>' :
          `<table><thead><tr><th>Mes</th><th>Estado</th><th>Monto</th><th>Fecha</th></tr></thead>
          <tbody>${pagos.data.slice(0, 6).map(p => `
            <tr>
              <td>${fmt.mesEsLargo(p.mes)}</td>
              <td><span class="tag ${p.pagado ? 'tag-green' : 'tag-yellow'}">${p.pagado ? 'Pagado' : 'Pendiente'}</span></td>
              <td>${fmt.money(p.monto, p.moneda)}</td>
              <td>${p.fecha_pago ? fmt.fechaCorta(p.fecha_pago) : '—'}</td>
            </tr>`).join('')}</tbody></table>`}
      </div>

      ${c.notas ? `
        <div class="sec sec-amber">
          <div class="sec-title">9 · 📋 Entrevista inicial / notas</div>
          <details ${c.notas.length < 400 ? 'open' : ''}>
            <summary class="text-xs text-amber-700 cursor-pointer mb-2">${c.notas.length < 400 ? 'Ocultar' : 'Ver registro completo'} (${c.notas.length} caracteres)</summary>
            <div class="text-slate-700 whitespace-pre-line text-xs bg-white rounded-lg p-3 mt-2 max-h-96 overflow-y-auto">${escapeHtml(c.notas)}</div>
          </details>
        </div>` : ''}
    </div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>`), { wide: true });
};

// ===== Mediciones corporales =====
window.nuevaMedicion = async (clienteId) => {
  const c = await db.clientes.get(clienteId);
  window._medCliente = c;
  openModal(modalShell('Nueva medición corporal', `
    <div class="grid grid-cols-2 gap-3">
      <div><label>Fecha</label><input id="me-fecha" type="date" value="${fmt.hoy()}"></div>
      <div><label>Peso (kg)</label><input id="me-peso" type="number" step="0.1" placeholder="78.5" oninput="recalcComp()"></div>
      <div><label>% Grasa</label><input id="me-grasa" type="number" step="0.1" placeholder="18.5" oninput="recalcComp()"></div>
      <div><label>Cintura (cm)</label><input id="me-cin" type="number" step="0.1"></div>
      <div><label>Cadera (cm)</label><input id="me-cad" type="number" step="0.1"></div>
      <div><label>Pecho (cm)</label><input id="me-pec" type="number" step="0.1"></div>
      <div><label>Brazo (cm)</label><input id="me-bra" type="number" step="0.1"></div>
      <div><label>Pierna (cm)</label><input id="me-pie" type="number" step="0.1"></div>
      <div class="col-span-2"><label>Notas</label><textarea id="me-notas" rows="2"></textarea></div>
    </div>
    <div id="me-comp-preview" class="mt-4 hidden bg-slate-50 rounded-xl p-3 text-xs">
      <div class="font-bold text-slate-700 mb-2">🧬 Estimaciones de composición corporal</div>
      <div id="me-comp-body"></div>
      <div class="text-slate-500 mt-2">Basado en peso + %grasa + edad + sexo + estatura del perfil. Estimaciones, no diagnóstico.</div>
    </div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="guardarMedicion('${clienteId}')">Guardar</button>`));
};

// Cálculo de composición en el modal de seguimiento semanal
window.recalcCompSeg = () => {
  const c = window._segCliente;
  if (!c) return;
  const peso = Number($('#sg-peso')?.value);
  const grasa = Number($('#sg-grasa')?.value);
  if (!peso) { $('#sg-comp-preview')?.classList.add('hidden'); return; }
  const edad = helpers.edadDe(c.fecha_nacimiento);
  const comp = calcComposicionCorporal({ peso, grasa_pct: grasa || null, edad, sexo: c.sexo, altura_cm: c.estatura_cm });
  if (!comp) { $('#sg-comp-preview')?.classList.add('hidden'); return; }
  const body = $('#sg-comp-body');
  if (!body) return;
  const parts = [];
  if (comp.masa_grasa_kg != null) parts.push(`Grasa: <strong style="color:#f59e0b">${comp.masa_grasa_kg} kg</strong>`);
  if (comp.masa_magra_kg != null) parts.push(`Magra: <strong style="color:#10b981">${comp.masa_magra_kg} kg</strong>`);
  if (comp.masa_muscular_smm_kg != null) parts.push(`SMM: <strong style="color:#3b82f6">${comp.masa_muscular_smm_kg} kg</strong>`);
  if (comp.masa_osea_kg != null) parts.push(`Hueso: <strong style="color:#8b5cf6">${comp.masa_osea_kg} kg</strong>`);
  if (comp.agua_corporal_L != null) parts.push(`Agua: <strong style="color:#0ea5e9">${comp.agua_corporal_L} L</strong>`);
  body.innerHTML = parts.join(' · ');
  $('#sg-comp-preview')?.classList.remove('hidden');
};

window.recalcComp = () => {
  const c = window._medCliente;
  if (!c) return;
  const peso = Number($('#me-peso')?.value);
  const grasa = Number($('#me-grasa')?.value);
  if (!peso) { $('#me-comp-preview')?.classList.add('hidden'); return; }
  const edad = helpers.edadDe(c.fecha_nacimiento);
  const comp = calcComposicionCorporal({ peso, grasa_pct: grasa || null, edad, sexo: c.sexo, altura_cm: c.estatura_cm });
  if (!comp) { $('#me-comp-preview')?.classList.add('hidden'); return; }
  const body = $('#me-comp-body');
  if (!body) return;
  body.innerHTML = `
    <div class="grid grid-cols-2 gap-2">
      ${comp.masa_grasa_kg != null ? `<div><span class="text-slate-500">Masa grasa:</span> <strong style="color:#f59e0b">${comp.masa_grasa_kg} kg</strong></div>` : ''}
      ${comp.masa_magra_kg != null ? `<div><span class="text-slate-500">Masa magra:</span> <strong style="color:#10b981">${comp.masa_magra_kg} kg</strong></div>` : ''}
      ${comp.masa_muscular_smm_kg != null ? `<div><span class="text-slate-500">Músculo esquel.:</span> <strong style="color:#3b82f6">${comp.masa_muscular_smm_kg} kg</strong></div>` : ''}
      ${comp.masa_osea_kg != null ? `<div><span class="text-slate-500">Masa ósea:</span> <strong style="color:#8b5cf6">${comp.masa_osea_kg} kg</strong></div>` : ''}
      ${comp.agua_corporal_L != null ? `<div><span class="text-slate-500">Agua corporal:</span> <strong style="color:#0ea5e9">${comp.agua_corporal_L} L</strong></div>` : ''}
      ${comp.masa_residual_kg != null ? `<div><span class="text-slate-500">Residual:</span> <strong style="color:#64748b">${comp.masa_residual_kg} kg</strong></div>` : ''}
    </div>`;
  $('#me-comp-preview')?.classList.remove('hidden');
};

window.guardarMedicion = async (clienteId) => {
  const num = (sel) => { const v = $(sel).value; return v ? Number(v) : null; };
  await db.mediciones.insert({
    cliente_id: clienteId,
    fecha: $('#me-fecha').value || fmt.hoy(),
    peso: num('#me-peso'),
    grasa_pct: num('#me-grasa'),
    cintura: num('#me-cin'),
    cadera: num('#me-cad'),
    pecho: num('#me-pec'),
    brazo: num('#me-bra'),
    pierna: num('#me-pie'),
    notas: $('#me-notas').value || null,
  });
  closeModal();
  toast('Medición guardada');
  verCliente(clienteId);
};

window.eliminarMedicion = async (id, clienteId) => {
  if (!confirm('¿Eliminar esta medición?')) return;
  await db.mediciones.remove(id);
  verCliente(clienteId);
};

window.togglePendienteFicha = async (id, estado, clienteId) => {
  await db.pendientes.toggle(id, estado);
  verCliente(clienteId);
};

// =====================================================
// VIEW: MI NEGOCIO
// =====================================================
routes.negocio = async () => {
  view.innerHTML = '<div class="card">Cargando…</div>';
  const [clientes, allSegs, pagosAnio, pagadosHist] = await Promise.all([
    db.clientes.list(),
    db.seguimientos.listAll(),
    db.pagos.listAnio(_pagosYear),
    // Todos los pagos históricos (todos los años) para LTV e ingreso por canal reales
    sb.from('pagos').select('cliente_id, monto, moneda').eq('pagado', true).then(r => r.data || []),
  ]);

  const activos = clientes.filter(c => c.estado === 'activo');
  const finalizados = clientes.filter(c => c.estado === 'finalizado');
  const mesActual = fmt.mesActual();
  const mesAnt = (() => {
    // setMonth(-1) sobre un día 31 se desborda al mismo mes; calcular desde el día 1
    const [y, m] = mesActual.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  // Cobrado mes / mes anterior
  const cobradoMesActual = pagosAnio.filter(p => p.mes === mesActual && p.pagado).reduce((s, p) => s + copConv(p.monto, p.moneda), 0);
  const cobradoMesAnterior = pagosAnio.filter(p => p.mes === mesAnt && p.pagado).reduce((s, p) => s + copConv(p.monto, p.moneda), 0);
  const cobradoAnio = pagosAnio.filter(p => p.pagado).reduce((s, p) => s + copConv(p.monto, p.moneda), 0);
  const crecMes = cobradoMesAnterior > 0 ? Math.round(((cobradoMesActual - cobradoMesAnterior) / cobradoMesAnterior) * 100) : 0;

  // Retención: clientes que pagaron en mes anterior y también en mes actual
  const pagaronAnt = new Set(pagosAnio.filter(p => p.mes === mesAnt && p.pagado).map(p => p.cliente_id));
  const pagaronAct = new Set(pagosAnio.filter(p => p.mes === mesActual && p.pagado).map(p => p.cliente_id));
  const retenidos = [...pagaronAnt].filter(id => pagaronAct.has(id)).length;
  const retencion = pagaronAnt.size > 0 ? Math.round((retenidos / pagaronAnt.size) * 100) : null;

  // LTV (de finalizados): suma HISTÓRICA de pagos por cliente (todos los años)
  const ltvPorCliente = {};
  for (const p of pagadosHist) {
    ltvPorCliente[p.cliente_id] = (ltvPorCliente[p.cliente_id] || 0) + copConv(p.monto, p.moneda);
  }
  const ltvVals = finalizados.map(c => ltvPorCliente[c.id] || 0).filter(v => v > 0);
  const ltv = ltvVals.length ? ltvVals.reduce((a, b) => a + b, 0) / ltvVals.length : null;

  // Adherencia global últimas 4 sem
  const adhUltimas = allSegs.filter(s => {
    const dias = fmt.diasDesde(s.fecha);
    return dias <= 28;
  }).map(helpers.promedioAdh).filter(v => v !== null);
  const adhGlobal = adhUltimas.length ? adhUltimas.reduce((a, b) => a + b, 0) / adhUltimas.length : null;

  // Conversión por canal
  const porCanal = {};
  for (const c of clientes) {
    const ch = c.canal_adquisicion || 'sin canal';
    if (!porCanal[ch]) porCanal[ch] = { count: 0, ingreso: 0 };
    porCanal[ch].count++;
    porCanal[ch].ingreso += ltvPorCliente[c.id] || 0;
  }
  const canalesOrdenados = Object.entries(porCanal).sort((a, b) => b[1].ingreso - a[1].ingreso);

  // Plateau: clientes con 4 semanas seguidas con adherencia ±1 punto
  const plateau = activos.filter(c => {
    const segs = allSegs.filter(s => s.cliente_id === c.id).sort((a, b) => b.semana.localeCompare(a.semana)).slice(0, 4);
    if (segs.length < 4) return false;
    const proms = segs.map(helpers.promedioAdh).filter(v => v !== null);
    if (proms.length < 4) return false;
    const min = Math.min(...proms), max = Math.max(...proms);
    return (max - min) < 1.5;
  });

  // Próximos a renovar (próximos 7 días)
  const diaHoy = new Date().getDate();
  const proxRenovar = activos.filter(c => {
    if (!c.dia_pago) return false;
    const diff = c.dia_pago - diaHoy;
    return diff > 0 && diff <= 7;
  });

  // Nuevos este mes
  const nuevosMes = clientes.filter(c => c.fecha_inicio && c.fecha_inicio.slice(0, 7) === mesActual).length;

  view.innerHTML = `
    <div class="mb-5">
      <h2 class="text-2xl font-bold text-slate-900">Mi negocio</h2>
      <p class="text-sm text-slate-500">Indicadores del coaching · ${_pagosYear}</p>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div class="card">
        <div class="text-xs font-semibold text-slate-500 uppercase mb-1">Cobrado este mes</div>
        <div class="text-2xl font-bold text-emerald-600">${fmt.moneyCop(cobradoMesActual)}</div>
        <div class="text-xs mt-1 ${crecMes >= 0 ? 'text-emerald-600' : 'text-red-600'}">${crecMes >= 0 ? '+' : ''}${crecMes}% vs mes ant.</div>
      </div>
      <div class="card">
        <div class="text-xs font-semibold text-slate-500 uppercase mb-1">Acumulado año</div>
        <div class="text-2xl font-bold">${fmt.moneyCop(cobradoAnio)}</div>
        <div class="text-xs text-slate-500 mt-1">${pagosAnio.filter(p => p.pagado).length} pagos</div>
      </div>
      <div class="card">
        <div class="text-xs font-semibold text-slate-500 uppercase mb-1">Retención mensual</div>
        <div class="text-2xl font-bold ${retencion === null ? 'text-slate-400' : retencion >= 80 ? 'text-emerald-600' : retencion >= 60 ? 'text-amber-600' : 'text-red-600'}">${retencion === null ? '—' : retencion + '%'}</div>
        <div class="text-xs text-slate-500 mt-1">${retenidos} de ${pagaronAnt.size} siguen</div>
      </div>
      <div class="card">
        <div class="text-xs font-semibold text-slate-500 uppercase mb-1">Adherencia global</div>
        <div class="text-2xl font-bold ${adhGlobal === null ? 'text-slate-400' : adhGlobal >= 7.5 ? 'text-emerald-600' : adhGlobal >= 5 ? 'text-amber-600' : 'text-red-600'}">${adhGlobal === null ? '—' : adhGlobal.toFixed(1) + '/10'}</div>
        <div class="text-xs text-slate-500 mt-1">${adhUltimas.length} registros</div>
      </div>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div class="card">
        <div class="text-xs font-semibold text-slate-500 uppercase mb-1">Activos</div>
        <div class="text-3xl font-bold">${activos.length}</div>
        <div class="text-xs text-slate-500 mt-1">+${nuevosMes} este mes</div>
      </div>
      <div class="card">
        <div class="text-xs font-semibold text-slate-500 uppercase mb-1">En pausa</div>
        <div class="text-3xl font-bold text-orange-600">${clientes.filter(c => c.estado === 'pausa').length}</div>
      </div>
      <div class="card">
        <div class="text-xs font-semibold text-slate-500 uppercase mb-1">LTV promedio</div>
        <div class="text-2xl font-bold">${ltv === null ? '—' : fmt.moneyCop(ltv)}</div>
        <div class="text-xs text-slate-500 mt-1">histórico · ${ltvVals.length} finalizados</div>
      </div>
      <div class="card">
        <div class="text-xs font-semibold text-slate-500 uppercase mb-1">Renuevan en 7d</div>
        <div class="text-3xl font-bold text-amber-600">${proxRenovar.length}</div>
        <div class="text-xs text-slate-500 mt-1">próximos pagos</div>
      </div>
    </div>

    ${(() => {
      // Compliance global últimas 8 semanas
      const sems = [];
      for (let i = 7; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i * 7);
        sems.push(fmt.semanaISO(d));
      }
      const labelsSem = sems.map(s => fmt.labelSemana(s));
      // Score 0-100 por semana; fallback a adherencia subjetiva ×10 para registros viejos
      const promPorSem = (scoreCampo, adhCampo) => sems.map(sem => {
        const regs = allSegs.filter(s => s.semana === sem);
        const vals = regs.map(s => s[scoreCampo] != null ? s[scoreCampo] : (s[adhCampo] != null ? s[adhCampo] * 10 : null)).filter(v => v !== null);
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      });
      const pctCumplimiento = sems.map(sem => {
        const con = new Set(allSegs.filter(s => s.semana === sem).map(s => s.cliente_id)).size;
        return activos.length > 0 ? Math.round((con / activos.length) * 100) : 0;
      });
      return `
      <div class="card mb-6">
        <div class="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <h3 class="font-bold text-slate-900">Tendencia de cumplimiento · 8 semanas (%)</h3>
          <div>
            ${legendDot('#10b981', 'Entreno')}
            ${legendDot('#3b82f6', 'Alimentación')}
          </div>
        </div>
        ${lineChart([
          { label: 'Entreno', color: '#10b981', points: promPorSem('score_entreno', 'adherencia_entreno') },
          { label: 'Alimentación', color: '#3b82f6', points: promPorSem('score_alim_metas', 'adherencia_alimentacion') },
        ], labelsSem, { height: 200, yMax: 100 })}
      </div>

      <div class="card mb-6">
        <div class="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <h3 class="font-bold text-slate-900">% de clientes con seguimiento semanal</h3>
          <span class="text-xs text-slate-500">cuántos de tus ${activos.length} activos tuvieron registro cada semana</span>
        </div>
        ${lineChart([
          { label: 'Cumplimiento', color: '#f59e0b', points: pctCumplimiento },
        ], labelsSem, { height: 180, yMax: 100 })}
      </div>
      `;
    })()}

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="card">
        <h3 class="font-bold text-slate-900 mb-4">Conversión por canal <span class="text-xs font-normal text-slate-400">(ingreso histórico)</span></h3>
        ${canalesOrdenados.length === 0 ? '<p class="text-sm text-slate-500">Sin datos.</p>' :
          canalesOrdenados.map(([canal, info]) => {
            const pct = clientes.length > 0 ? Math.round((info.count / clientes.length) * 100) : 0;
            return `
              <div class="mb-3">
                <div class="flex justify-between text-sm mb-1">
                  <span class="font-medium capitalize">${canal}</span>
                  <span class="text-slate-500"><strong>${info.count}</strong> clientes · ${fmt.moneyCop(info.ingreso)}</span>
                </div>
                <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div class="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full" style="width:${pct}%"></div>
                </div>
              </div>
            `;
          }).join('')}
      </div>

      ${plateau.length > 0 ? `
      <div class="card">
        <h3 class="font-bold text-slate-900 mb-4 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-amber-500"></span>Clientes en plateau (4 sem)</h3>
        <div class="space-y-2">
          ${plateau.map(c => `
            <div class="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-xl cursor-pointer" onclick="verCliente('${c.id}')">
              ${helpers.avatar(c.nombre, 9)}
              <div class="flex-1"><div class="font-medium text-sm">${escapeHtml(c.nombre)}</div></div>
              <button class="btn btn-secondary btn-sm">Ver</button>
            </div>`).join('')}
        </div>
      </div>` : ''}

      ${proxRenovar.length > 0 ? `
      <div class="card">
        <h3 class="font-bold text-slate-900 mb-4 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-emerald-500"></span>Próximos a renovar (7 días)</h3>
        <div class="space-y-2">
          ${proxRenovar.map(c => `
            <div class="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-xl">
              ${helpers.avatar(c.nombre, 9)}
              <div class="flex-1">
                <div class="font-medium text-sm">${escapeHtml(c.nombre)}</div>
                <div class="text-xs text-slate-500">Día ${c.dia_pago} · ${fmt.money(c.monto, c.moneda)}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>` : ''}
    </div>
  `;
};

// =====================================================
// VIEW: AJUSTES
// =====================================================
routes.ajustes = async () => {
  view.innerHTML = `
    <h2 class="text-2xl font-bold text-slate-900 mb-5">Ajustes</h2>

    <div class="card max-w-xl mb-4">
      <h3 class="font-bold text-slate-900 mb-4">Conversión USD → COP</h3>
      <div>
        <label>Tasa actual</label>
        <div class="flex items-center gap-2">
          <span class="text-sm text-slate-500">1 USD =</span>
          <input id="st-rate" type="number" class="w-40 font-bold" value="${_settings.usd_cop_rate}">
          <span class="text-sm text-slate-500">COP</span>
        </div>
        <p class="text-xs text-slate-500 mt-2">Se usa para sumar pagos en USD a los totales en COP.</p>
      </div>
    </div>

    <div class="card max-w-xl mb-4">
      <h3 class="font-bold text-slate-900 mb-4">Tu cuenta</h3>
      <div>
        <label>Tu nombre (para el saludo)</label>
        <input id="st-nombre" value="${escapeHtml(_settings.nombre_coach)}">
      </div>
    </div>

    <div class="card max-w-xl mb-4">
      <h3 class="font-bold text-slate-900 mb-1">Conexión Mealtracker</h3>
      ${mtApiBase()
        ? `<div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-900 mb-3">🔒 Conectado por la <strong>API segura de coach</strong>. Puedes activar RLS en el Supabase del Mealtracker (ver <code>docs/mealtracker_rls.sql</code>) para cerrar el acceso público.</div>`
        : (window.MEALTRACKER_URL && window.MEALTRACKER_ANON_KEY
          ? `<div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 mb-3">⚠️ Conectado en <strong>modo directo</strong> (anon key de <code>config.js</code>). Funciona, pero cualquiera con esa key pública puede leer los datos. Recomendado: llena los campos de abajo para pasar a la API segura.</div>`
          : `<div class="bg-slate-50 rounded-xl p-3 text-xs text-slate-600 mb-3">Sin conexión configurada. Llena los campos de abajo (recomendado) o pon la anon key en <code>config.js</code>.</div>`)}

      <div class="text-xs font-bold text-slate-600 uppercase mb-2">🔒 Conexión segura por API (recomendada)</div>
      <div class="grid grid-cols-2 gap-3">
        <div><label>URL de la app Mealtracker</label><input id="st-mt-url" autocomplete="off" placeholder="https://tu-mealtracker.vercel.app" value="${escapeHtml(_settings.mealtracker_app_url || '')}"></div>
        <div><label>Contraseña del coach</label><input id="st-mt-pass" type="password" autocomplete="new-password" value="${escapeHtml(_settings.mealtracker_coach_password || '')}"></div>
      </div>
      <p class="text-xs text-slate-500 mt-2">Es la misma contraseña del dashboard de coach del Mealtracker (COACH_PASSWORD). Requiere que el dominio del CRM esté en <code>ALLOWED_ORIGINS</code> del proyecto mealtracker en Vercel.</p>

      ${mtConfigured() ? `
      <div class="mt-4 pt-4 border-t border-slate-100">
        <p class="text-xs text-slate-500 mb-2">Los clientes se vinculan solos cuando el nombre coincide. Si algún nombre no coincide 100%, puedes vincularlos a mano:</p>
        <button class="btn btn-secondary" onclick="abrirSyncMealtracker()">🔗 Revisar / vincular manualmente</button>
      </div>` : ''}
    </div>

    <div class="flex gap-2 max-w-xl">
      <button class="btn btn-primary" onclick="guardarAjustes()">Guardar ajustes</button>
      <button class="btn btn-danger ml-auto" id="lo">Cerrar sesión</button>
    </div>
  `;
  $('#lo').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
};

window.guardarAjustes = async () => {
  const s = {
    usd_cop_rate: Number($('#st-rate').value) || 4000,
    nombre_coach: $('#st-nombre').value.trim() || 'Coach',
  };
  if ($('#st-mt-url')) {
    s.mealtracker_app_url = $('#st-mt-url').value.trim() || null;
    s.mealtracker_coach_password = $('#st-mt-pass').value || null;
    // Forzar re-login y refrescar caches con las nuevas credenciales
    localStorage.removeItem('mt_coach_token');
    _mtUsersCache = null;
  }
  await db.settings.save(s);
  toast('Guardado');
  routes.ajustes();
};

// ===== Sincronización con Mealtracker =====
window.abrirSyncMealtracker = async () => {
  openModal(modalShell('🔗 Sincronizar clientes con Mealtracker', `
    <div class="text-sm text-slate-600 mb-4">Buscando usuarios en el Mealtracker…</div>
    <div id="sync-loading" class="text-center py-6">
      <div class="text-slate-400">⏳ Cargando…</div>
    </div>
    <div id="sync-content" class="hidden"></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button id="sync-save-btn" class="btn btn-primary hidden" onclick="guardarSyncMealtracker()">Guardar vínculos</button>`), { wide: true });

  const [clientes, mtUsers] = await Promise.all([
    db.clientes.list(),
    listarClientesMealtracker(true), // force refresh
  ]);

  if (mtUsers.length === 0) {
    $('#sync-loading').innerHTML = '<div class="text-red-600 text-sm">No se pudo conectar al Mealtracker o no hay usuarios. Verifica las credenciales en Ajustes.</div>';
    return;
  }

  // Agrupar usuarios del mealtracker por nombre normalizado (uso el más reciente si hay dupes)
  const mtPorNombre = {};
  for (const u of mtUsers) {
    const n = normalizeName(u.name);
    if (!mtPorNombre[n]) mtPorNombre[n] = [];
    mtPorNombre[n].push(u);
  }

  // Matching por cada cliente CRM
  const matches = clientes.map(c => {
    const opciones = mtUsers.map(u => ({
      user_id: u.user_id,
      name: u.name,
      score: similitudNombre(c.nombre, u.name),
    })).sort((a, b) => b.score - a.score);
    const top = opciones[0];
    const sugerido = top && top.score >= 60 ? top : null;
    return { cliente: c, sugerido, opciones: opciones.slice(0, 5), yaVinculado: c.mealtracker_id };
  });

  window._syncMatches = matches;

  $('#sync-loading').classList.add('hidden');
  $('#sync-save-btn').classList.remove('hidden');
  $('#sync-content').classList.remove('hidden');
  $('#sync-content').innerHTML = `
    <p class="text-xs text-slate-500 mb-3">
      Encontré <strong>${mtUsers.length}</strong> usuarios en el Mealtracker.
      Confirma o corrige los matches sugeridos.
    </p>
    <div class="space-y-2 max-h-[60vh] overflow-y-auto scrollbar-thin">
      ${matches.map((m, i) => {
        const c = m.cliente;
        const s = m.sugerido;
        const yaOK = c.mealtracker_id && m.opciones.find(o => o.user_id === c.mealtracker_id);
        return `
          <div class="flex items-center gap-3 p-3 rounded-xl ${yaOK ? 'bg-emerald-50' : (s ? 'bg-white ring-1 ring-slate-200' : 'bg-amber-50')}">
            <div class="w-40 shrink-0 font-semibold text-sm">${escapeHtml(c.nombre)}</div>
            <div class="flex-1">
              <select id="sync-sel-${i}" class="text-xs" data-cliente-id="${c.id}">
                <option value="">— sin vincular —</option>
                ${m.opciones.map(o => {
                  const preSel = c.mealtracker_id === o.user_id || (s && s.user_id === o.user_id && !c.mealtracker_id);
                  return `<option value="${o.user_id}" ${preSel ? 'selected' : ''}>${escapeHtml(o.name)} · ${o.score}% · ${o.user_id.slice(0, 8)}…</option>`;
                }).join('')}
              </select>
            </div>
            <div class="w-16 text-right text-xs ${yaOK ? 'text-emerald-700 font-semibold' : (s?.score >= 90 ? 'text-emerald-700 font-semibold' : s?.score >= 70 ? 'text-amber-700' : 'text-slate-500')}">
              ${yaOK ? '✓ vinculado' : (s ? s.score + '% match' : 'sin match')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
};

window.guardarSyncMealtracker = async () => {
  const matches = window._syncMatches || [];
  let vinculados = 0, desvinculados = 0;
  for (let i = 0; i < matches.length; i++) {
    const sel = $(`#sync-sel-${i}`);
    if (!sel) continue;
    const nuevoId = sel.value || null;
    const clienteId = sel.dataset.clienteId;
    const yaTenia = matches[i].cliente.mealtracker_id;
    if (nuevoId !== yaTenia) {
      await sb.from('clientes').update({ mealtracker_id: nuevoId }).eq('id', clienteId);
      if (nuevoId) vinculados++;
      else desvinculados++;
    }
  }
  _clientesCache = null;
  closeModal();
  toast(`✓ ${vinculados} vinculado(s) · ${desvinculados} desvinculado(s)`);
  routes.ajustes();
};

// =====================================================
// BOOT
// =====================================================
if (!window.SUPABASE_URL || window.SUPABASE_URL.includes('TU-PROYECTO')) {
  bootScreen.innerHTML = `
    <div class="card max-w-md text-center">
      <h2 class="font-bold text-lg mb-2">⚠️ Falta configuración</h2>
      <p class="text-sm text-slate-600">Edita el archivo <code class="bg-slate-100 px-1.5 py-0.5 rounded">config.js</code> y pon ahí la URL y la "anon key" de tu proyecto Supabase.</p>
    </div>`;
} else {
  checkSession();
}

// PWA: service worker para instalar en el celular y carga rápida / respaldo offline
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
