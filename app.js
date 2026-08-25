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

async function mtApiPatch(path, body) {
  const cfg = mtApiBase();
  if (!cfg) return null;
  let token = await mtApiToken();
  if (!token) return null;
  const call = (t) => fetch(`${cfg.url}${path}`, {
    method: 'PATCH',
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
// Devuelve { ok, causa }.
//
// IMPORTANTE: siempre se sella goals_updated = { at, by: 'coach' }. Ese sello
// es el que hace que (1) la app del cliente detecte el cambio y muestre el
// ANUNCIO en su chat ("tu coach actualizó tu meta…"), y (2) el próximo push
// del cliente NO pise la meta nueva con la vieja (anti-pisado de /api/sync).
async function setMealtrackerGoals(mealtrackerId, metas) {
  const aplicar = (goalsPrevias) => {
    const goals = { ...(goalsPrevias || {}) };
    const formatoViejo = goals.calories != null && goals.kcal == null;
    // Siempre escribimos las claves nuevas (kcal/p/c/g): el ANUNCIO en la app
    // del cliente las lee. Si el blob traía el formato viejo, actualizamos
    // también esas claves para no dejar datos contradictorios.
    goals.kcal = metas.kcal; goals.p = metas.p; goals.c = metas.c; goals.g = metas.g;
    if (formatoViejo) {
      goals.calories = metas.kcal; goals.protein = metas.p; goals.carbs = metas.c; goals.fat = metas.g;
    }
    return goals;
  };

  // Modo seguro (API de coach) — PRIMERA opción: el endpoint PATCH
  // action=goals del Mealtracker escribe la meta Y sella goals_updated en el
  // servidor, con lo que el anuncio al cliente sale solo.
  if (mtApiBase()) {
    const res = await mtApiPatch(
      `/api/coach-data?action=goals&user_id=${encodeURIComponent(mealtrackerId)}`,
      { kcal: Number(metas.kcal), p: Number(metas.p), c: Number(metas.c), g: Number(metas.g) }
    );
    if (res && res.ok) return { ok: true };
    // Si falla (URL/contraseña mal, red), probamos el modo directo abajo.
  }

  // Modo directo (anon key): leer el blob completo, cambiar solo goals +
  // goals_updated, reescribir.
  const mt = mtClient();
  if (mt) {
    const { data: row, error } = await mt.from('user_data').select('data').eq('user_id', mealtrackerId).maybeSingle();
    if (error) return { ok: false, causa: `El Supabase del Mealtracker devolvió un error al leer: "${error.message}".` };
    if (!row) return { ok: false, causa: 'El cliente no existe en el Mealtracker. Revisa el vínculo en Ajustes → "Sincronizar clientes".' };
    const blob = row.data || {};
    blob.goals = aplicar(blob.goals);
    blob.goals_updated = { at: new Date().toISOString(), by: 'coach' };
    const { error: e2 } = await mt.from('user_data')
      .update({ data: blob, updated_at: new Date().toISOString() })
      .eq('user_id', mealtrackerId);
    if (e2) return { ok: false, causa: `No se pudo escribir en el Mealtracker: "${e2.message}". Si activaste RLS en user_data, configura la URL y contraseña de coach en Ajustes (modo seguro).` };
    return { ok: true };
  }

  return { ok: false, causa: 'No hay conexión configurada al Mealtracker (config.js o Ajustes).' };
}

// =====================================================
// RECORDATORIOS EN LA APP DEL CLIENTE (Mealtracker)
// El coach los escribe desde el modal de seguimiento; el cliente los ve en
// Herramientas → Mis recordatorios (y con anuncio en su chat) y los marca
// "cumplido" — ese ✓ vuelve aquí. Cada item:
//   { id, text, created_at, done_at|null, done_by: 'cliente'|'coach'|null }
// =====================================================
let _mtRem = { userId: null, list: [], device: null };

async function fetchRemindersMT(mtId) {
  if (mtApiBase()) {
    const res = await mtApiGet(`/api/coach-data?action=reminders&user_id=${encodeURIComponent(mtId)}`);
    if (res && Array.isArray(res.reminders)) {
      return { list: res.reminders, device: { pwa: res.pwa_installed_at || null, push: res.push_enabled_at || null, upd: res.mt_updated_at || null } };
    }
  }
  const mt = mtClient();
  if (mt) {
    const { data: row } = await mt.from('user_data')
      .select('rem:data->coach_reminders,pwa:data->pwa_installed_at,push:data->push_enabled_at,upd:updated_at')
      .eq('user_id', mtId).maybeSingle();
    if (row && Array.isArray(row.rem)) {
      return { list: row.rem, device: { pwa: row.pwa || null, push: row.push || null, upd: row.upd || null } };
    }
  }
  return { list: [], device: null };
}

async function saveRemindersMT(mtId, list) {
  if (mtApiBase()) {
    const res = await mtApiPatch(`/api/coach-data?action=reminders&user_id=${encodeURIComponent(mtId)}`, { reminders: list });
    if (res && res.ok) return true;
  }
  const mt = mtClient();
  if (mt) {
    const { data: row, error } = await mt.from('user_data').select('data').eq('user_id', mtId).maybeSingle();
    if (error || !row) return false;
    const blob = row.data || {};
    blob.coach_reminders = list;
    blob.reminders_updated = { at: new Date().toISOString(), by: 'coach' };
    const { error: e2 } = await mt.from('user_data')
      .update({ data: blob, updated_at: new Date().toISOString() })
      .eq('user_id', mtId);
    return !e2;
  }
  return false;
}

function renderRemindersMT() {
  // Badges de dispositivo: ¿tiene la app en homescreen? ¿activó los push?
  // (las marcas las manda la propia app del cliente al sincronizar)
  const dev = $('#sg-mt-device');
  if (dev) {
    if (!_mtRem.userId || !_mtRem.device) {
      dev.innerHTML = '';
    } else {
      const d = _mtRem.device;
      dev.innerHTML = [
        d.pwa
          ? `<span class="tag tag-green" title="Abrió la app instalada (pantalla de inicio) el ${fmt.fecha(String(d.pwa).slice(0, 10))}">📲 instalada</span>`
          : `<span class="tag" style="background:#f1f5f9;color:#94a3b8" title="Aún no ha abierto la app desde la pantalla de inicio — quizás no la ha agregado">sin instalar</span>`,
        d.push
          ? `<span class="tag tag-green" title="Activó las notificaciones push el ${fmt.fecha(String(d.push).slice(0, 10))}">🔔 push activo</span>`
          : `<span class="tag" style="background:#fef3c7;color:#b45309" title="No ha aceptado los recordatorios push — pídele tocar Activar en el aviso de su app">🔕 sin push</span>`,
      ].join(' ');
    }
  }
  const el = $('#sg-mt-rem-list');
  if (!el) return;
  if (!_mtRem.userId) {
    el.innerHTML = '<div class="text-xs text-slate-400">Este cliente no está vinculado al Mealtracker.</div>';
    return;
  }
  if (!_mtRem.list.length) {
    el.innerHTML = '<div class="text-xs text-slate-400">Sin recordatorios en su app. Agrega uno abajo 👇</div>';
    return;
  }
  el.innerHTML = _mtRem.list.map(r => `
    <div class="flex items-center gap-2 text-xs ${r.done_at ? 'opacity-60' : ''}">
      <input type="checkbox" class="rounded flex-shrink-0" ${r.done_at ? 'checked' : ''} onchange="toggleReminderMT('${r.id}')" title="${r.done_at ? 'Desmarcar' : 'Marcar cumplido'}">
      <span class="flex-1 min-w-0 ${r.done_at ? 'line-through text-slate-400' : 'text-slate-700'}">${escapeHtml(r.text)}</span>
      ${r.done_at
        ? `<span class="tag tag-green flex-shrink-0" title="${r.done_at.slice(0, 10)}">✓ ${r.done_by === 'cliente' ? 'cliente' : 'tú'}</span>`
        : r.seen_at
          ? `<span class="tag flex-shrink-0" style="background:#e0f2fe;color:#0369a1" title="Lo vio en su app el ${fmt.fecha(r.seen_at.slice(0, 10))}">👁 visto</span>`
          : `<span class="flex-shrink-0 text-slate-300" title="Aún no ha abierto la app desde que lo dejaste">sin ver</span>`}
      <button type="button" class="text-slate-300 hover:text-red-500 flex-shrink-0 font-bold" onclick="quitarReminderMT('${r.id}')" title="Quitar de su app">✕</button>
    </div>`).join('');
}

async function cargarRemindersMT(cliente) {
  _mtRem = { userId: null, list: [], device: null };
  const el = $('#sg-mt-rem-list');
  if (el) el.innerHTML = '<div class="text-xs text-slate-400">Cargando…</div>';
  if (!mtConfigured()) {
    if (el) el.innerHTML = '<div class="text-xs text-amber-600">Configura la conexión al Mealtracker en Ajustes para usar esto.</div>';
    return;
  }
  const mtId = await resolverMealtrackerId(cliente);
  if (!mtId) { renderRemindersMT(); return; }
  _mtRem.userId = mtId;
  const r = await fetchRemindersMT(mtId);
  _mtRem.list = r.list;
  _mtRem.device = r.device;
  renderRemindersMT();
}

async function persistRemindersMT() {
  renderRemindersMT(); // pintar optimista
  const ok = await saveRemindersMT(_mtRem.userId, _mtRem.list);
  if (!ok) toast('⚠️ No se pudo guardar el recordatorio en el Mealtracker');
}

window.agregarReminderMT = async () => {
  const inp = $('#sg-mt-rem-nuevo');
  const texto = (inp?.value || '').trim();
  if (!texto || !_mtRem.userId) { if (!_mtRem.userId) toast('Este cliente no está vinculado al Mealtracker'); return; }
  inp.value = '';
  _mtRem.list = [..._mtRem.list, {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: texto.slice(0, 200),
    created_at: new Date().toISOString(),
    done_at: null, done_by: null,
  }];
  await persistRemindersMT();
};

window.toggleReminderMT = async (id) => {
  _mtRem.list = _mtRem.list.map(r => r.id === id
    ? (r.done_at ? { ...r, done_at: null, done_by: null } : { ...r, done_at: new Date().toISOString(), done_by: 'coach' })
    : r);
  await persistRemindersMT();
};

window.quitarReminderMT = async (id) => {
  _mtRem.list = _mtRem.list.filter(r => r.id !== id);
  await persistRemindersMT();
};

// =====================================================
// JOURNEY DEL CLIENTE — la línea de onboarding→rutina que muestra en qué
// paso va cada cliente. Los pasos `auto` se llenan solos con señales reales
// (mediciones, seguimientos, la app del cliente); los demás los marca el
// coach con un clic. Se guarda en clientes.journey (jsonb: { pasoId: fecha }).
// Requiere columna:  alter table clientes add column if not exists journey jsonb default '{}'::jsonb;
// =====================================================
const JOURNEY_STEPS = [
  { id: 'onboarding',    label: 'Vio el onboarding / bienvenida', auto: true, hint: 'Se marca solo cuando lee "Cómo funciona el programa" en el Centro de Recursos' },
  { id: 'peso',          label: 'Peso inicial registrado', auto: true, hint: 'Se marca solo con la primera medición corporal en el CRM' },
  { id: 'fotos',         label: 'Fotos iniciales' },
  { id: 'clips',         label: 'Clips iniciales enviados' },
  { id: 'dudas',         label: 'Dudas iniciales resueltas' },
  { id: 'faq',           label: 'Leyó preguntas frecuentes', auto: true, hint: 'Se marca solo cuando lee la sección FAQ del Centro de Recursos' },
  { id: 'app_instalada', label: 'App en su pantalla de inicio', auto: true, hint: 'Lo reporta su app al abrirla instalada' },
  { id: 'push',          label: 'Notificaciones push activadas', auto: true, hint: 'Lo reporta su app al aceptar los avisos' },
  { id: 'registra',      label: 'Usó el mealtracker por primera vez', auto: true, hint: 'Primera sincronización de su app' },
  { id: 'training',      label: 'Entrenamiento en marcha', auto: true, hint: 'Se marca solo con el primer seguimiento semanal en el CRM' },
  { id: 'guia',          label: 'Leyó la guía de alimentación', auto: true, hint: 'Se marca solo cuando lee capítulos de la guía en el Centro de Recursos' },
  { id: 'capsulas',      label: 'Empezó las cápsulas informativas', auto: true, hint: 'Se marca solo cuando abre su primera cápsula en el Centro de Recursos. El detalle de cuáles vio está más abajo, en "Centro de recursos"' },
];

// ── Lecturas del Centro de Recursos (Supabase propio del centro) ──
// El centro registra qué leyó o vio cada cliente en reading_state
// (client_name, source, section_key). Las fuentes son:
//
//   'hub'     → onboarding ('programa', 'app', 'meal-tracker', 'journey') y 'faq'
//   'ga'      → capítulos de la guía de alimentación
//   'capsula' → cápsulas informativas, con la llave 'cap:<id>'
//   'podcast' → episodios recomendados, con la llave 'pod:<id>'
//
// La llave es pública (la misma que usa la página del centro) y de solo
// lectura.
const CENTRO_SUPA_URL = 'https://kkoayfexdhpazufmyeoj.supabase.co';
const CENTRO_SUPA_KEY = 'sb_publishable_9UimuwTGp2aIhe-4oSwJpw_ORwmzzhn';

// Catálogo de cápsulas publicadas en el centro. Es la copia de
// capsulas/capsulas.js del repo del Centro de Recursos, y sirve para saber
// cuáles FALTAN por ver, no solo cuáles vio.
// >>> Si publicas una cápsula nueva allá, añade aquí su id y su título. <<<
// Si se te olvida no se rompe nada: una cápsula vista que no esté en esta
// lista igual aparece, con el título que traiga el registro.
const CENTRO_CAPSULAS = [
  { id: 'nutricion-proteina',   cat: 'Nutrición',     title: 'Proteína: cuánta y cuándo' },
  { id: 'nutricion-plato',      cat: 'Nutrición',     title: 'El plato balanceado, en 3 pasos' },
  { id: 'entreno-sobrecarga',   cat: 'Entrenamiento', title: 'Cómo elegir el peso y progresar' },
  { id: 'entreno-orden',        cat: 'Entrenamiento', title: 'El orden de los ejercicios importa' },
  { id: 'entreno-rpe',          cat: 'Entrenamiento', title: 'RPE: entrena con percepción' },
  { id: 'entreno-maquinas',     cat: 'Entrenamiento', title: 'Configura la máquina antes de la serie' },
  { id: 'entreno-herramientas', cat: 'Entrenamiento', title: 'Bandas, kettlebell y mancuernas' },
  { id: 'movilidad-para-que',   cat: 'Movilidad',     title: 'Movilidad: para qué sirve de verdad' },
  { id: 'habitos-sueno',        cat: 'Hábitos',       title: 'Dormir es entrenar' },
  { id: 'habitos-pasos',        cat: 'Hábitos',       title: 'Pasos diarios: el cardio invisible' },
];

let _centroLecturas = null;   // cache de sesión: todas las filas del centro
let _centroPendiente = null;  // la petición en curso, para no pedirla dos veces

// Una sola llamada por sesión para todos los clientes. Se pide primero con
// section_label (el título que viajó con la lectura); si la vista del centro
// todavía no expone esa columna, se reintenta sin ella en vez de fallar.
function cargarLecturasCentro() {
  if (_centroLecturas) return Promise.resolve(_centroLecturas);
  if (_centroPendiente) return _centroPendiente;
  const headers = { apikey: CENTRO_SUPA_KEY, Authorization: `Bearer ${CENTRO_SUPA_KEY}` };
  const pedir = (cols) => fetch(`${CENTRO_SUPA_URL}/rest/v1/reading_state?select=${cols}`, { headers });
  _centroPendiente = (async () => {
    try {
      let r = await pedir('client_name,source,section_key,section_label');
      if (!r.ok) r = await pedir('client_name,source,section_key');
      _centroLecturas = r.ok ? await r.json() : [];
    } catch (e) {
      _centroLecturas = null; // sin conexión al centro
    }
    _centroPendiente = null;
    return _centroLecturas;
  })();
  return _centroPendiente;
}

// Devuelve TODO lo que el centro sabe de un cliente: los hitos que usa el
// journey y, además, el detalle de cápsulas y podcast para la trazabilidad.
async function fetchLecturasCentro(nombre) {
  const todas = await cargarLecturasCentro();
  if (!todas) return null;
  const buscado = normalizeName(nombre);
  const filas = todas.filter(f => normalizeName(f.client_name) === buscado);

  // Cápsulas: la llave viaja como 'cap:<id>'
  const vistasCap = new Map();
  filas.filter(f => f.source === 'capsula').forEach(f => {
    const id = String(f.section_key || '').replace(/^cap:/, '');
    if (id) vistasCap.set(id, f.section_label || null);
  });
  const capsulas = CENTRO_CAPSULAS.map(c => ({
    id: c.id, cat: c.cat, title: c.title, vista: vistasCap.has(c.id),
  }));
  // Cápsulas vistas que no están en el catálogo de arriba (publicaste una
  // nueva en el centro y no la copiaste aquí): se muestran igual.
  vistasCap.forEach((label, id) => {
    if (!CENTRO_CAPSULAS.some(c => c.id === id)) {
      capsulas.push({ id, cat: 'Otras', title: label || id, vista: true });
    }
  });

  // Podcast: llave 'pod:<id>'. No hay catálogo, así que solo se listan los
  // que sí vio, con el título que quedó registrado.
  const podcasts = filas.filter(f => f.source === 'podcast').map(f => {
    const id = String(f.section_key || '').replace(/^pod:/, '');
    return { id, title: f.section_label || id };
  });

  const capsVistas = capsulas.filter(c => c.vista).length;
  return {
    onboarding: filas.some(f => f.source === 'hub' && f.section_key === 'programa'),
    faq: filas.some(f => f.source === 'hub' && f.section_key === 'faq'),
    guia: filas.some(f => f.source === 'ga'),
    // Detalle para el panel de trazabilidad
    hub: filas.filter(f => f.source === 'hub').map(f => f.section_key),
    guiaCaps: filas.filter(f => f.source === 'ga').length,
    capsulas,
    capsVistas,
    capsTotal: capsulas.length,
    podcasts,
  };
}

// Resumen corto (vistas/total) para las tarjetas del listado de clientes.
async function resumenCapsulas(nombre) {
  const lec = await fetchLecturasCentro(nombre);
  if (!lec) return null;
  return { vistas: lec.capsVistas, total: lec.capsTotal };
}

// ── Panel "Centro de recursos" de la ficha ────────────────────────────
// Qué material ha consumido el cliente, pieza por pieza. El avance llega
// solo: lo registra el propio centro cuando el cliente abre cada cosa.
const CENTRO_HUB_SECCIONES = [
  ['programa',     'Cómo funciona el programa'],
  ['app',          'Cómo funciona la app de entrenamiento'],
  ['meal-tracker', 'Cómo usar el Meal Tracker'],
  ['journey',      'Tu Journey en el programa'],
  ['faq',          'Preguntas frecuentes'],
];

function chipCentro(label, hechas, total, titulo) {
  const completo = total > 0 && hechas >= total;
  const cero = !hechas;
  const color = completo ? 'background:#d1fae5;color:#065f46'
              : cero     ? 'background:#f1f5f9;color:#94a3b8'
                         : 'background:#fef3c7;color:#92400e';
  return `<span class="tag" style="${color}" title="${escapeHtml(titulo || '')}">${escapeHtml(label)} ${hechas}${total ? '/' + total : ''}</span>`;
}

function lineaMaterial(titulo, vista, extra) {
  return `<div class="flex items-center gap-2 text-xs py-0.5">
    <span class="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${vista ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}">${vista ? '✓' : '○'}</span>
    <span class="flex-1 min-w-0 ${vista ? 'text-slate-700' : 'text-slate-400'}">${escapeHtml(titulo)}</span>
    ${extra ? `<span class="flex-shrink-0 text-slate-400">${extra}</span>` : ''}
  </div>`;
}

// El cliente que está pintado ahora mismo, para poder refrescar el panel
// sin volver a abrir la ficha.
let _centroPanelCliente = null;

// Las lecturas se piden una vez por sesión. Este botón vuelve a preguntarle
// al centro: útil cuando acabas de pedirle a alguien que vea una cápsula.
window.refrescarCentro = async () => {
  _centroLecturas = null;
  const el = $('#centro-panel');
  if (el) el.innerHTML = '<div class="text-xs text-slate-400">Consultando el centro…</div>';
  if (_centroPanelCliente) await cargarPanelCentro(_centroPanelCliente);
};

async function cargarPanelCentro(cliente) {
  _centroPanelCliente = cliente;
  const el = $('#centro-panel');
  if (!el) return;
  const lec = await fetchLecturasCentro(cliente.nombre);
  const el2 = $('#centro-panel'); // la ficha pudo cerrarse mientras cargaba
  if (!el2) return;
  if (!lec) {
    el2.innerHTML = '<div class="text-xs text-amber-600">No se pudo consultar el Centro de Recursos ahora mismo. Vuelve a abrir la ficha en un momento.</div>';
    return;
  }

  const hubHechas = CENTRO_HUB_SECCIONES.filter(([k]) => lec.hub.includes(k)).length;
  const capsPend = lec.capsulas.filter(c => !c.vista);

  // Las cápsulas se agrupan por categoría, igual que en el centro
  const porCat = [];
  lec.capsulas.forEach(c => {
    const g = porCat.find(x => x.cat === c.cat);
    if (g) g.items.push(c); else porCat.push({ cat: c.cat, items: [c] });
  });

  el2.innerHTML = `
    <div class="flex gap-1.5 flex-wrap mb-2">
      ${chipCentro('🚀 Onboarding', hubHechas, CENTRO_HUB_SECCIONES.length, 'Secciones del onboarding y preguntas frecuentes')}
      ${chipCentro('📖 Guía', lec.guiaCaps, 0, 'Capítulos leídos de la guía de alimentación')}
      ${chipCentro('🖼️ Cápsulas', lec.capsVistas, lec.capsTotal, 'Infografías abiertas')}
      ${lec.podcasts.length ? chipCentro('🎧 Podcast', lec.podcasts.length, 0, 'Episodios abiertos') : ''}
    </div>

    <div class="mb-2">
      <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Onboarding</div>
      ${CENTRO_HUB_SECCIONES.map(([k, t]) => lineaMaterial(t, lec.hub.includes(k))).join('')}
    </div>

    <div class="mb-2">
      <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">
        Cápsulas informativas · ${lec.capsVistas} de ${lec.capsTotal}
      </div>
      ${porCat.map(g => `
        <div class="text-[10px] text-slate-400 mt-1.5 mb-0.5">${escapeHtml(g.cat)}</div>
        ${g.items.map(c => lineaMaterial(c.title, c.vista)).join('')}
      `).join('')}
      ${capsPend.length
        ? `<div class="text-[11px] text-slate-500 mt-1.5">Le faltan <strong>${capsPend.length}</strong>: ${escapeHtml(capsPend.map(c => c.title).join(' · '))}</div>`
        : `<div class="text-[11px] text-emerald-700 mt-1.5">Las vio todas ✓</div>`}
    </div>

    ${lec.podcasts.length ? `
    <div>
      <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Podcast abiertos</div>
      ${lec.podcasts.map(p => lineaMaterial(p.title, true)).join('')}
    </div>` : ''}

    <div class="flex items-center justify-between gap-2 mt-2">
      <div class="text-[10px] text-slate-400 flex-1">Se registra solo cuando el cliente abre cada pieza en el Centro de Recursos. Si entra desde otro teléfono, el avance lo sigue igual.</div>
      <button type="button" class="tag flex-shrink-0" style="background:#e0f2fe;color:#075985" onclick="refrescarCentro()" title="Volver a consultar el centro">↻ actualizar</button>
    </div>
  `;
}

// Pinta "Cápsulas x/10" en las tarjetas del listado de clientes. Una sola
// consulta al centro para todos: las filas quedan en cache de sesión.
async function pintarCapsulasEnCards(clientes) {
  if (!document.querySelector('[data-caps-cell]')) return;
  const todas = await cargarLecturasCentro();
  if (!todas) {
    document.querySelectorAll('[data-caps-cell]').forEach(el => { el.innerHTML = ''; });
    return;
  }
  for (const c of clientes) {
    const celda = document.querySelector(`[data-caps-cell="${c.id}"]`);
    if (!celda) continue;
    const r = await resumenCapsulas(c.nombre);
    if (!r) { celda.innerHTML = ''; continue; }
    const color = r.total && r.vistas >= r.total ? 'text-emerald-600'
                : r.vistas ? 'text-amber-600' : 'text-slate-400';
    celda.innerHTML = `<span class="text-slate-500">Cápsulas</span><span class="font-medium ${color}">🖼️ ${r.vistas}/${r.total}</span>`;
  }
}

let _journeyCtx = { id: null, journey: {} };

function renderJourneyList() {
  const el = $('#journey-list');
  if (!el) return;
  const j = _journeyCtx.journey || {};
  const hechos = JOURNEY_STEPS.filter(s => j[s.id]).length;
  const prog = $('#journey-prog');
  if (prog) {
    prog.textContent = `${hechos}/${JOURNEY_STEPS.length}`;
    prog.className = `tag flex-shrink-0 ${hechos === JOURNEY_STEPS.length ? 'tag-green' : ''}`;
  }
  el.innerHTML = JOURNEY_STEPS.map((s, i) => {
    const done = j[s.id];
    return `
      <div class="flex items-center gap-2 text-xs py-0.5">
        <span class="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}">${done ? '✓' : i + 1}</span>
        <span class="flex-1 min-w-0 ${done ? 'text-slate-400 line-through' : 'text-slate-700'}" ${s.hint ? `title="${s.hint}"` : ''}>${s.label}${s.auto ? ' <span class="text-[9px] text-sky-500 no-underline" title="' + (s.hint || 'Se llena solo') + '">⚡auto</span>' : ''}</span>
        ${done
          ? `<span class="flex-shrink-0 text-slate-300" title="Completado">${fmt.fechaCorta(String(done).slice(0, 10))}</span>
             <button type="button" class="flex-shrink-0 text-slate-300 hover:text-red-400" title="Desmarcar" onclick="toggleJourney('${s.id}')">✕</button>`
          : `<button type="button" class="flex-shrink-0 tag" style="background:#f1f5f9;color:#475569" onclick="toggleJourney('${s.id}')">marcar ✓</button>`}
      </div>`;
  }).join('');
}

async function persistJourney() {
  renderJourneyList();
  const { error } = await sb.from('clientes').update({ journey: _journeyCtx.journey }).eq('id', _journeyCtx.id);
  if (error) toast('⚠️ No se pudo guardar el journey. ¿Corriste el SQL de la columna `journey`?');
  _clientesCache = null;
}

window.toggleJourney = async (stepId) => {
  const j = { ..._journeyCtx.journey };
  if (j[stepId]) delete j[stepId];
  else j[stepId] = new Date().toISOString();
  _journeyCtx.journey = j;
  await persistJourney();
};

// Llena los pasos automáticos con señales reales. Marca solo hacia ADELANTE
// (nunca desmarca): una vez logrado, el paso queda como hito histórico.
async function autollenarJourney(cliente, segs, meds) {
  const j = { ...(_journeyCtx.journey || {}) };
  let cambio = false;
  const marca = (id, fecha) => {
    if (!j[id]) { j[id] = fecha || new Date().toISOString(); cambio = true; }
  };

  // Primer hito = fecha más antigua (medición inicial / primer seguimiento)
  const primera = (arr, k) => arr.slice().sort((a, b) => String(a[k] || '').localeCompare(String(b[k] || '')))[0]?.[k];
  if (meds && meds.length) marca('peso', primera(meds, 'fecha'));
  if (segs && segs.length) marca('training', primera(segs, 'fecha'));

  // Lecturas del Centro de Recursos: onboarding, FAQ y guía de alimentación
  const lec = await fetchLecturasCentro(cliente.nombre);
  if (lec) {
    if (lec.onboarding) marca('onboarding');
    if (lec.faq) marca('faq');
    if (lec.guia) marca('guia');
    if (lec.capsVistas) marca('capsulas');
  }

  // Señales de la app del cliente (si está vinculado al Mealtracker)
  try {
    if (mtConfigured()) {
      const mtId = await resolverMealtrackerId(cliente);
      if (mtId) {
        const r = await fetchRemindersMT(mtId);
        if (r.device) {
          if (r.device.pwa) marca('app_instalada', r.device.pwa);
          if (r.device.push) marca('push', r.device.push);
          // Primera vez que usó el tracker = existe sincronización (la cuenta
          // vinculada ya subió datos alguna vez)
          if (r.device.upd) marca('registra', r.device.upd);
        }
      }
    }
  } catch (e) { /* sin conexión MT: los pasos auto quedan pendientes */ }

  if (cambio) {
    _journeyCtx.journey = j;
    await persistJourney();
  }
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

// Junta TODAS las cuentas del Mealtracker que tengan el MISMO nombre que el
// cliente (duplicados que se crean cuando entra desde otro dispositivo/sesión)
// y fusiona su history/historyDetail — exactamente como lo hace el
// CoachDashboard del Mealtracker. Sin esto, el CRM leía una sola cuenta y
// contaba de menos los días registrados.
let _mtMergedCache = { key: null, at: 0, data: null };
async function getMealtrackerDataMerged(cliente) {
  if (!cliente || !mtConfigured()) return null;
  // Cache corto por cliente: la vista de nutrición pide varias semanas seguidas
  const ck = `${cliente.id || ''}|${normalizeName(cliente.nombre)}`;
  if (_mtMergedCache.key === ck && (Date.now() - _mtMergedCache.at) < 30000) return _mtMergedCache.data;
  const users = await listarClientesMealtracker();
  const target = normalizeName(cliente.nombre);
  // ids del mismo nombre, más reciente primero (para que "gane" el más nuevo por fecha)
  let ids = users
    .filter(u => normalizeName(u.name) === target)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
    .map(u => u.user_id);
  if (cliente.mealtracker_id && !ids.includes(cliente.mealtracker_id)) ids.unshift(cliente.mealtracker_id);
  if (!ids.length && cliente.mealtracker_id) ids = [cliente.mealtracker_id];
  if (!ids.length) return null;

  const datas = (await Promise.all(ids.map(id => getMealtrackerUserData(id)))).filter(Boolean);
  if (!datas.length) return null;

  // REGLA DE FUSIÓN — idéntica a mergeClientRows() del CoachDashboard del
  // Mealtracker: las cuentas van de más reciente a más vieja y, para CADA
  // fecha, gana la primera cuenta que tenga datos de esa fecha. Nada se suma
  // entre cuentas (sumar duplicaba los días en que el cliente registró desde
  // dos dispositivos).
  const history = {}, historyDetail = {}, wellbeing = {};
  let goals = null, goals_history = null, today = null, today_totals = null, today_water = 0;
  const favMap = new Map();
  const favIngSet = new Set();
  for (const d of datas) {                     // datas ya viene en orden de más reciente primero
    // El DÍA EN CURSO se pliega a history/historyDetail ANTES de fusionar. En
    // modo seguro la API ya lo hace en el servidor; en modo directo el blob lo
    // trae aparte (today_totals / today_entries) y sin esto el día de hoy
    // desaparecía del análisis. Se pliega SIEMPRE, aunque las kcal sean 0:
    // "registró el día" y "comió 0 kcal" no son lo mismo.
    const dHist = { ...(d.history || {}) };
    const dDet = { ...(d.historyDetail || {}) };
    if (d.today && d.today_totals && !dHist[d.today]) {
      dHist[d.today] = {
        kcal: d.today_totals.kcal || 0, p: d.today_totals.p || 0,
        c: d.today_totals.c || 0, g: d.today_totals.g || 0, water: d.today_water || 0,
      };
    }
    if (d.today && Array.isArray(d.today_entries) && d.today_entries.length && !dDet[d.today]) {
      dDet[d.today] = d.today_entries;
    }
    for (const [date, tot] of Object.entries(dHist)) if (!history[date]) history[date] = tot;
    for (const [date, ent] of Object.entries(dDet)) if (!historyDetail[date]) historyDetail[date] = ent;
    for (const [date, wb] of Object.entries(d.wellbeing || {})) if (!wellbeing[date]) wellbeing[date] = wb;

    // METAS — goals y goals_history se toman de la MISMA cuenta (la primera
    // que tenga meta). Antes se tomaban por separado y podían salir de cuentas
    // distintas: la meta vigente de un teléfono y el historial del otro, con
    // lo que una semana vieja se comparaba contra una meta que nunca rigió.
    if (!goals && d.goals && Object.keys(d.goals).length) {
      goals = d.goals;
      goals_history = Array.isArray(d.goals_history) && d.goals_history.length ? d.goals_history : null;
    }
    if (d.today && (!today || d.today > today)) {
      today = d.today;
      today_totals = d.today_totals || null;
      today_water = d.today_water || 0;
    }

    // Favoritos e ingredientes favoritos: unión por nombre entre cuentas
    // (mismo criterio del CoachDashboard). Los usa la pestaña "Su despensa".
    for (const f of (Array.isArray(d.favorites) ? d.favorites : [])) {
      const k = normalizeName(f && (f.name || f.id) || '');
      if (k && !favMap.has(k)) favMap.set(k, f);
    }
    for (const ing of (Array.isArray(d.favoriteIngredients) ? d.favoriteIngredients : [])) {
      const k = normalizeName(typeof ing === 'string' ? ing : (ing && ing.name) || '');
      if (k) favIngSet.add(k);
    }
  }
  // Si ninguna cuenta tenía goals_history, se busca en cualquiera antes de
  // rendirse (mejor un historial de otra cuenta que ninguno).
  if (!goals_history) {
    const conHist = datas.find(d => Array.isArray(d.goals_history) && d.goals_history.length);
    if (conHist) goals_history = conHist.goals_history;
  }
  // Menús armados en el Recetario: los sincroniza la app del cliente
  // (data.recetario_menus). Se toma la lista de la primera cuenta que la
  // traiga; si ninguna la trae, queda null y la vista lo dice en vez de
  // mostrar una lista vacía como si el cliente no hubiera guardado nada.
  // ── BORRADOS DEL CLIENTE ──────────────────────────────────────────────
  // Si el cliente borra un día (o una comida) en su app, esa cuenta deja de
  // tener la fecha y guarda una LÁPIDA. Pero cuando el cliente tiene VARIAS
  // cuentas (pasa solo con entrar desde otro teléfono), la cuenta vieja aún
  // trae el día — y como acá gana "la primera cuenta que tenga esa fecha",
  // el día borrado RESUCITABA en el CRM. Es el peor error posible: le muestras
  // al cliente una semana con una comida que él ya borró.
  //
  // Se aplican las lápidas de TODAS las cuentas con la misma regla que usa la
  // app del cliente al sincronizar (bitácora historyDayOps sobre lápidas
  // historyDeleted: entre "borrado" y "re-registrado" gana la acción más
  // reciente).
  aplicarBorradosMT(datas, history, historyDetail);

  const conMenus = datas.find(d => Array.isArray(d.recetario_menus) && d.recetario_menus.length);
  const merged = {
    history, historyDetail, wellbeing,
    goals: goals || (datas[0].goals || {}), goals_history,
    today, today_totals, today_water,
    favorites: [...favMap.values()],
    favoriteIngredients: [...favIngSet],
    recetario_menus: conMenus ? conMenus.recetario_menus : (datas.some(d => 'recetario_menus' in d) ? [] : null),
    _cuentas: datas.length,
  };
  _mtMergedCache = { key: ck, at: Date.now(), data: merged };
  return merged;
}

// Quita del historial fusionado lo que el cliente borró en su app. Espejo
// exacto de la fusión que hace src/MealTracker.jsx al sincronizar: si cambias
// una, cambia la otra.
//
//   · historyDayOps = { 'YYYY-MM-DD': { op:'del'|'add', at:ISO } } — la
//     bitácora. Manda sobre las lápidas: un día borrado y luego re-registrado
//     sigue vivo.
//   · historyDeleted = ['YYYY-MM-DD', 'YYYY-MM-DD#idComida', …] — las lápidas.
//     Las de día completo se descartan si la última acción de ese día fue
//     'add'; las de comida suelta siempre valen.
//
// Muta history/historyDetail en sitio (los acaba de construir el llamador).
function aplicarBorradosMT(datas, history, historyDetail) {
  // Bitácora: por día, gana la marca con fecha más reciente entre cuentas.
  const ops = {};
  for (const d of datas) {
    const o = (d.historyDayOps && typeof d.historyDayOps === 'object') ? d.historyDayOps : {};
    for (const [dia, op] of Object.entries(o)) {
      if (!op || !op.at) continue;
      if (!ops[dia] || String(op.at) > String(ops[dia].at || '')) ops[dia] = op;
    }
  }

  const crudas = new Set();
  for (const d of datas) {
    for (const t of (Array.isArray(d.historyDeleted) ? d.historyDeleted : [])) crudas.add(t);
  }

  const muertas = new Set();
  for (const t of crudas) {
    if (String(t).includes('#')) { muertas.add(t); continue; }   // comida suelta: siempre vale
    if (!(ops[t] && ops[t].op === 'add')) muertas.add(t);        // día: vale si no fue re-registrado
  }
  for (const [dia, op] of Object.entries(ops)) {
    if (op && op.op === 'del') muertas.add(dia);
  }
  if (!muertas.size) return;

  const diasMuertos = new Set([...muertas].filter(t => !String(t).includes('#')));
  for (const dia of diasMuertos) { delete history[dia]; delete historyDetail[dia]; }

  // Comidas sueltas borradas. Si se cae una comida, los totales del día se
  // recalculan desde las que quedan — con la MISMA fórmula de la app del
  // cliente (kcal al entero, macros a un decimal). Si no, el día seguiría
  // sumando calorías de una comida que ya no está en el detalle: los dos
  // números en la misma pantalla, y sin cuadrar.
  const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
  for (const [dia, arr] of Object.entries(historyDetail)) {
    if (!Array.isArray(arr) || !arr.length) continue;
    const quedan = arr.filter(e => !muertas.has(`${dia}#${e && e.id}`));
    if (quedan.length === arr.length) continue;
    if (!quedan.length) { delete history[dia]; delete historyDetail[dia]; continue; }
    historyDetail[dia] = quedan;
    const t = quedan.reduce((a, e) => ({
      kcal: a.kcal + (Number(e.kcal) || 0), p: a.p + (Number(e.p) || 0),
      c: a.c + (Number(e.c) || 0), g: a.g + (Number(e.g) || 0),
    }), { kcal: 0, p: 0, c: 0, g: 0 });
    history[dia] = {
      kcal: Math.round(t.kcal), p: r1(t.p), c: r1(t.c), g: r1(t.g),
      water: (history[dia] && history[dia].water) || 0,
    };
  }
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

// Trae el resumen de una semana del cliente (fusionando sus cuentas duplicadas)
async function getMealtrackerWeek(cliente, semanaISO) {
  const d = await getMealtrackerDataMerged(cliente);
  if (!d) return null;
  return resumenSemanaDeData(d, semanaISO);
}

// ─── REGLA ÚNICA DE "DÍA REGISTRADO" ────────────────────────────────────
// Toda la app cuenta un día como registrado con ESTE criterio y con ningún
// otro. Antes convivían dos: la sección Nutrición contaba kcal>0 O detalle,
// y la adherencia rápida contaba solo kcal>0 — con lo que el mismo cliente
// salía con 5/7 en un tablero y 4/7 en el otro. El criterio bueno es el del
// Mealtracker: si la fecha existe en history, el cliente abrió y registró ese
// día (aunque el total quede en 0 tras borrar una comida) o hay detalle.
function diaRegistradoMT(tot, det) {
  if (Array.isArray(det) && det.length > 0) return true;
  return !!tot && typeof tot === 'object';
}

// Cuenta los días de una semana a partir de un blob de datos ya fusionado.
// El día en curso ya viene plegado dentro de history por
// getMealtrackerDataMerged(): acá no se vuelve a inyectar (hacerlo dos veces
// con reglas distintas era otra fuente de descuadre).
function resumenSemanaDeData(d, semanaISO) {
  const goals = d.goals || {};
  const history = d.history || {};
  const detalle = d.historyDetail || {};
  const [ini, fin] = semanaISOToRange(semanaISO);

  const dias = [];
  for (const fecha of nutFechasSemana(semanaISO)) {
    const tot = history[fecha];
    if (!diaRegistradoMT(tot, detalle[fecha])) continue;
    dias.push({
      fecha,
      kcal: Number(tot?.kcal || 0), p: Number(tot?.p || 0),
      c: Number(tot?.c || 0), g: Number(tot?.g || 0),
    });
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

// Meta del mealtracker VIGENTE en una semana dada (usa goals_history si el
// cliente lo tiene — trazabilidad: la semana vieja se compara con SU meta).
function goalsDeSemanaMT(d, semanaISO) {
  const [, fin] = semanaISOToRange(semanaISO);
  return goalsMTEnFecha(d, fin);
}

// Meta VIGENTE en UNA fecha. Es la misma función goalsEnFecha() del
// CoachDashboard del Mealtracker: cada día del histórico se juzga contra la
// meta que regía ESE día, así cambiar la meta hoy no reescribe el pasado.
// Normaliza además el formato viejo ({calories, protein, carbs, fat}) al
// nuevo ({kcal,p,c,g}) — sin esto, un cliente antiguo salía "sin meta" en el
// CRM y con meta en el Mealtracker.
function goalsMTEnFecha(d, fecha) {
  const hist = Array.isArray(d.goals_history) ? d.goals_history : null;
  let g = null;
  if (hist && hist.length) {
    for (const h of hist) { if (h.since <= fecha) g = h; else break; }
    g = g || hist[0];
  }
  return normalizarGoalsMT(g || d.goals || {});
}

function normalizarGoalsMT(g) {
  const n = (v) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : null; };
  const o = g || {};
  return {
    kcal: n(o.kcal ?? o.calories),
    p: n(o.p ?? o.protein),
    c: n(o.c ?? o.carbs),
    g: n(o.g ?? o.fat),
  };
}

// ─── Quick view: adherencia últimas 3 semanas (Seguimiento y ficha) ──────
// Entreno desde los seguimientos del CRM; alimentación EN VIVO desde el
// mealtracker. Async: el contenedor arranca en "Cargando…" y se llena solo.
async function quickAdherencia3Sem(c, contId, segsPre) {
  const el = document.getElementById(contId);
  if (!el) return;
  try {
    const s0 = fmt.semanaISO();
    const s1 = fmt.semanaPrev(s0);
    const s2 = fmt.semanaPrev(s1);
    const semanas = [s2, s1, s0];
    const [segs, mtData] = await Promise.all([
      segsPre ? Promise.resolve(segsPre) : db.seguimientos.listCliente(c.id),
      getMealtrackerDataMerged(c).catch(() => null),
    ]);
    const bySem = new Map((segs || []).map(s => [s.semana, s]));
    const pctColor = (p) => p == null ? 'text-slate-400' : p >= 85 ? 'text-emerald-600' : p >= 60 ? 'text-amber-600' : 'text-red-500';
    const cols = semanas.map((sem, i) => {
      const tag = i === 2 ? 'En curso' : i === 1 ? 'Pasada' : 'Hace 2';
      const sg = bySem.get(sem);
      const entPct = sg && sg.dias_planeados ? Math.round(((sg.dias_asistidos || 0) / sg.dias_planeados) * 100) : null;
      const ent = sg && sg.dias_planeados ? `${sg.dias_asistidos ?? 0}/${sg.dias_planeados}` : '—';
      let ali = '—', aliPct = null;
      if (mtData) {
        const r = resumenSemanaDeData(mtData, sem);
        ali = `${r.dias}/7`;
        const g = goalsDeSemanaMT(mtData, sem);
        if (r.kcal_avg != null && g && g.kcal) aliPct = Math.round((r.kcal_avg / g.kcal) * 100);
      }
      return `<div class="flex-1 min-w-[120px] bg-white rounded-xl border border-slate-200 p-2.5 text-center">
        <div class="text-[10px] uppercase tracking-wide text-slate-400 font-bold">${tag} · ${fmt.labelSemana(sem)}</div>
        <div class="mt-1.5 text-[11px] text-slate-500">🏋️ <span class="font-bold ${pctColor(entPct)}">${ent}</span>${entPct != null ? ` <span class="${pctColor(entPct)}">(${entPct}%)</span>` : ''}</div>
        <div class="mt-1 text-[11px] text-slate-500">🍽 <span class="font-bold text-slate-700">${ali}</span>${aliPct != null ? ` · <span class="${pctColor(aliPct)}">${aliPct}% kcal</span>` : ''}</div>
      </div>`;
    });
    el.innerHTML = `<div class="flex gap-2 flex-wrap">${cols.join('')}</div>
      <div class="text-[10px] text-slate-400 mt-1.5">🏋️ entrenos asistidos/planeados (seguimiento) · 🍽 días con registro/7 y % kcal vs la meta de ESA semana (mealtracker, en vivo)</div>`;
  } catch (e) {
    el.innerHTML = '<div class="text-xs text-slate-400">No se pudo cargar la adherencia rápida</div>';
  }
}

// ─── Vinculación MANUAL cliente CRM ↔ cuenta Mealtracker ────────────────
// Para cuando el nombre no matchea solo (el cliente escribió "Juan M." en
// la app). Lista todas las cuentas ordenadas por parecido; un clic guarda
// el vínculo en clientes.mealtracker_id y los envíos de meta salen directo.
window.vincularMealtrackerMenu = async (clienteId) => {
  const c = await db.clientes.get(clienteId);
  if (!c) return;
  toast('⏳ Buscando cuentas en el Mealtracker…');
  const users = await listarClientesMealtracker(true);
  if (!users.length) { toast('No pude listar las cuentas del Mealtracker (revisa la conexión en Ajustes)'); return; }
  const conScore = users.map(u => ({ ...u, score: similitudNombre(c.nombre, u.name) }))
    .sort((a, b) => b.score - a.score);
  openModal(modalShell(`Vincular a ${escapeHtml(c.nombre)}`, `
    <div class="space-y-2">
      <p class="text-xs text-slate-500">Elige la cuenta del Mealtracker que corresponde a este cliente (así escribió su nombre en la app). El vínculo queda guardado y no se vuelve a preguntar.</p>
      <div class="max-h-96 overflow-y-auto space-y-1">
        ${conScore.map(u => `
          <button class="w-full flex items-center justify-between text-left px-3 py-2 rounded-lg border ${u.score >= 85 ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'} hover:bg-slate-50"
            onclick="confirmarVinculoMealtracker('${c.id}', '${u.user_id}')">
            <span class="text-sm">${escapeHtml(u.name || '(sin nombre)')}</span>
            <span class="text-[10px] text-slate-400">${u.score}% parecido${u.updated_at ? ' · activo ' + fmt.fechaCorta(String(u.updated_at).slice(0, 10)) : ''}</span>
          </button>`).join('')}
      </div>
    </div>
  `));
};
window.confirmarVinculoMealtracker = async (clienteId, mtId) => {
  const { error } = await sb.from('clientes').update({ mealtracker_id: mtId }).eq('id', clienteId);
  if (error) { toast('✗ ' + error.message); return; }
  _clientesCache = null;
  closeModal();
  toast('✓ Vinculado. Ya puedes enviarle la meta nutricional y ver su adherencia.');
};

// ─── Push manual al teléfono del cliente ────────────────────────────────
// El coach escribe el mensaje y llega como notificación push al instante
// (a todos los dispositivos donde el cliente activó los recordatorios).
window.enviarPushManual = async (clienteId) => {
  const c = await db.clientes.get(clienteId);
  if (!c) return;
  if (!mtApiBase()) { toast('El push manual necesita el modo seguro del Mealtracker (Ajustes: URL de la app + contraseña de coach).'); return; }
  const msg = prompt(`📲 Mensaje push para ${c.nombre}\n\n(Llega a su teléfono como notificación, con "Tu coach" de título)`);
  if (!msg || !msg.trim()) return;
  toast('⏳ Enviando…');
  const mtId = c.mealtracker_id || await resolverMealtrackerId(c);
  const res = await mtApiPost('/api/push-send', { user_id: mtId || undefined, name: c.nombre, body: msg.trim() });
  if (res && res.ok) toast(`✓ Push enviado a ${c.nombre} (${res.sent} dispositivo${res.sent === 1 ? '' : 's'})`);
  else toast(`✗ ${res?.causa || 'No se pudo enviar (revisa la conexión al Mealtracker)'}`, 6000);
};

// Campo de texto largo colapsable (patrón <details> de las notas): muestra
// las primeras líneas y el resto al clic — no se come la visual de la ficha.
function campoColapsable(label, valor, cls = 'text-slate-700', extra = '') {
  if (!valor) return '';
  const v = escapeHtml(valor);
  if (valor.length <= 140) {
    return `<div class="${cls} text-xs mt-1"><span class="font-semibold">${label}:</span> ${v}${extra}</div>`;
  }
  return `<details class="${cls} text-xs mt-1">
    <summary class="cursor-pointer"><span class="font-semibold">${label}:</span> ${escapeHtml(valor.slice(0, 140))}… <span class="text-blue-600 font-semibold">ver todo</span></summary>
    <div class="whitespace-pre-line bg-white rounded-lg p-2 mt-1 max-h-72 overflow-y-auto">${v}${extra}</div>
  </details>`;
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
  // SUBCONJUNTO = misma persona: en la app el cliente casi nunca escribe su
  // nombre completo ("Juan Mariño" vs "Juan Sebastián Mariño" del CRM daba
  // 67% y el envío de metas fallaba con "no sincronizado"). Con 2+ palabras
  // en común y un nombre contenido en el otro, se considera match (90).
  const minLen = Math.min(ta.size, tb.size);
  if (inter >= 2 && inter === minLen) return 90;
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
  semanaNext: (s) => {
    const [ini] = semanaISOToRange(s);
    const d = new Date(ini + 'T00:00:00');
    d.setDate(d.getDate() + 7);
    return fmt.semanaISO(d);
  },
  labelSemana: (s) => {
    const [y, w] = s.split('-W').map(Number);
    return `S${w} '${String(y).slice(2)}`;
  },
  // Rango lunes-domingo de una semana ISO, compacto pero claro:
  //   misma mes  → "1–7 sep"
  //   cruza mes  → "29 sep – 5 oct"
  rangoSemana: (s) => {
    if (!s || !String(s).includes('-W')) return '';
    const [ini, fin] = semanaISOToRange(s);
    const di = new Date(ini + 'T00:00:00');
    const df = new Date(fin + 'T00:00:00');
    const mes = (d) => d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '');
    const mi = mes(di), mf = mes(df);
    return mi === mf
      ? `${di.getDate()}–${df.getDate()} ${mf}`
      : `${di.getDate()} ${mi} – ${df.getDate()} ${mf}`;
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

// Encuesta de actividad — modelo ADITIVO CONTINUO en vez de puntos
// abstractos: cada respuesta guarda su efecto real sobre el PAL (o los días,
// en el caso del cardio) y el PAL final es la SUMA sobre la base sedentaria
// (1.2). Más preciso que los 5 cajones fijos: dos personas "moderadas" ya no
// reciben el mismo 1.55 si una camina 12.000 pasos y la otra 5.000.
//  · Pasos diarios = NEAT, el gran diferenciador del gasto (hasta +0.20).
//  · El TIPO de cardio pesa distinto: caminata suave < cardio moderado <
//    deporte < cardio intenso (efecto POR DÍA de práctica).
//  · Se eliminó "¿deportes recreativos los fines de semana?" — redundaba
//    con los días/semana de cardio o deporte.
const ENCUESTA_ACTIVIDAD = [
  {
    key: 'q_trabajo',
    label: '¿Cómo es su trabajo?',
    opts: [ ['Oficina/sedentario', 0], ['Mixto / de pie', 0.07], ['Físico', 0.15] ],
  },
  {
    key: 'q_pasos',
    label: '¿Cuántos pasos diarios promedia? (ideal: que mire el conteo de su teléfono o reloj)',
    opts: [ ['<5.000', 0], ['5.000-7.500', 0.05], ['7.500-10.000', 0.10], ['10.000-12.500', 0.15], ['>12.500', 0.20] ],
  },
  {
    key: 'q_fuerza',
    label: '¿Cuántos días a la semana entrena fuerza?',
    opts: [ ['0', 0], ['1-2', 0.03], ['3-4', 0.07], ['5 o más', 0.11] ],
  },
  {
    key: 'q_cardio_dias',
    label: '¿Cuántos días a la semana hace cardio o deporte (aparte de la fuerza)?',
    opts: [ ['0', 0], ['1-2', 1.5], ['3-5', 4], ['6 o más', 6] ],
  },
  {
    key: 'q_cardio_tipo',
    label: '¿De qué tipo, principalmente?',
    opts: [
      ['Caminatas suaves', 0.015],
      ['Cardio moderado (trote, bici, natación, clases)', 0.03],
      ['Deporte (fútbol, tenis, básquet…)', 0.035],
      ['Cardio intenso / HIIT', 0.045],
    ],
  },
];

function nivelDesdeEncuesta(respuestas) {
  const r = respuestas || {};
  // Compatibilidad: encuestas guardadas con el formato viejo (puntos
  // enteros, claves q_cardio/q_deportes) se evalúan con la escala vieja.
  if (r.q_deportes != null || r.q_cardio != null) {
    const total = Object.values(r).reduce((a, b) => a + Number(b || 0), 0);
    if (total <= 3) return { nivel: 'sedentario', pal: 1.2, total };
    if (total <= 6) return { nivel: 'ligero', pal: 1.375, total };
    if (total <= 9) return { nivel: 'moderado', pal: 1.55, total };
    if (total <= 12) return { nivel: 'activo', pal: 1.725, total };
    return { nivel: 'muy_activo', pal: 1.9, total };
  }

  // La suma aditiva es SOLO el clasificador: ubica a la persona en el nivel
  // correcto con más señal (pasos + tipo de cardio). El PAL asignado es
  // SIEMPRE el factor canónico de la bibliografía (FAO/OMS vía PAL_MAP) —
  // nada de decimales inventados fuera de la evidencia. Cortes = punto
  // medio entre factores canónicos (se asigna el nivel más cercano).
  const num = (k) => Number(r[k] || 0);
  const cardio = +(num('q_cardio_dias') * (num('q_cardio_tipo') || 0.03)).toFixed(3);
  const score = Math.round((1.2 + num('q_trabajo') + num('q_pasos') + num('q_fuerza') + cardio) * 100) / 100;
  const nivel = score < 1.29 ? 'sedentario' : score < 1.46 ? 'ligero' : score < 1.64 ? 'moderado' : score < 1.81 ? 'activo' : 'muy_activo';
  const pal = PAL_MAP[nivel];
  const desglose = `clasificador: 1.2 + trabajo ${num('q_trabajo')} + pasos ${num('q_pasos')} + fuerza ${num('q_fuerza')} + cardio ${cardio} = ${score} → nivel ${nivel.replace('_', ' ')} → PAL ${pal} (FAO/OMS)`;
  return { nivel, pal, total: score, desglose };
}

// ===== Cálculo de meta nutricional =====
// Métodos y respaldo científico (ver también GUIA_MACROS para los rangos):
//  · BMR con %grasa conocido → Katch-McArdle (usa masa magra; el gasto basal
//    lo determina el tejido metabólicamente activo, no el peso total).
//  · BMR sin %grasa → Mifflin-St Jeor (1990), la ecuación con mejor precisión
//    poblacional según la revisión sistemática de la ADA (Frankenfield 2005).
//  · TDEE = BMR × PAL (factores de actividad FAO/OMS 1985 / Black 1996).
//  · Ajuste calórico como % del TDEE (déficit/superávit gradual).
//  · Proteína en g/kg (así la dosifica la evidencia: ISSN 2017, Morton 2018,
//    Helms 2014) — NUNCA como % de las kcal, porque la necesidad de proteína
//    depende de la masa corporal, no de cuánta energía se coma.
//  · Grasa como % de las kcal (configurable; AMDR 20-35%, IOM 2005), con piso
//    de 0.5 g/kg para no comprometer función hormonal (Helms 2014).
//  · Carbohidrato = el resto de las kcal (combustible flexible del entreno).
function calcMetaNutricional({ peso, altura, edad, sexo, grasa_pct, pal, objetivo_pct, proteina_g_kg, grasa_pct_kcal }) {
  const w = Number(peso), h = Number(altura), a = Number(edad), g = grasa_pct != null && grasa_pct !== '' ? Number(grasa_pct) : null;
  const gkg = Number(proteina_g_kg) || 1.8;
  const fatPct = Math.min(45, Math.max(10, Number(grasa_pct_kcal) || 25));
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
  const grasas = Math.round(kcal * fatPct / 100 / 9);
  const carbos = Math.round(Math.max(0, kcal - proteina * 4 - grasas * 9) / 4);

  // Derivados para mostrar las tres lecturas de cada macro (g · % kcal · g/kg)
  const pct = (kcalMacro) => Math.round((kcalMacro / kcal) * 100);
  const porKg = (gr) => +(gr / w).toFixed(1);
  const detalle = {
    proteina: { g: proteina, pct: pct(proteina * 4), gkg: porKg(proteina) },
    carbos:   { g: carbos,   pct: pct(carbos * 4),   gkg: porKg(carbos) },
    grasas:   { g: grasas,   pct: pct(grasas * 9),   gkg: porKg(grasas) },
  };

  // Ritmo esperado de cambio de peso (≈7700 kcal por kg de tejido adiposo)
  const cambioSemanalKg = +(((kcal - tdee) * 7) / 7700).toFixed(2);

  // Avisos de seguridad — el cálculo sale igual, pero el coach los ve.
  const avisos = [];
  if (detalle.grasas.gkg < 0.5) avisos.push(`Grasa en ${detalle.grasas.gkg} g/kg — por debajo de 0.5 g/kg puede afectar la función hormonal (Helms 2014). Sube el % de grasa o las kcal.`);
  if (kcal < bmr) avisos.push(`La meta (${kcal} kcal) queda por debajo del BMR (${Math.round(bmr)} kcal). Déficit muy agresivo: úsalo solo por periodos cortos y con supervisión.`);
  if (detalle.carbos.gkg < 2 && objetivo_pct < 0) avisos.push(`Carbohidrato en ${detalle.carbos.gkg} g/kg — con entreno frecuente puede costar rendimiento (referencia mínima ~3 g/kg, Burke 2011).`);
  if (kcal - proteina * 4 - grasas * 9 < 0) avisos.push('Proteína + grasa ya superan las kcal de la meta: el carbo quedó en 0. Baja proteína g/kg o % de grasa.');

  const signo = objetivo_pct >= 0 ? '+' : '';
  const argumento = `Método: ${metodo}${metodo === 'Katch-McArdle' ? ' (usa masa magra; %grasa conocido)' : ' (mayor precisión poblacional; Frankenfield 2005)'}
${formula}
TDEE = BMR × PAL(${pal}) = ${tdee.toFixed(0)} kcal  [factores FAO/OMS]
Meta = TDEE × (1 ${signo}${(objetivo_pct * 100).toFixed(0)}%) = ${kcal} kcal
Ritmo esperado: ${cambioSemanalKg > 0 ? '+' : ''}${cambioSemanalKg} kg/semana aprox.
Proteína: ${w} kg × ${gkg} g/kg = ${proteina} g (${detalle.proteina.pct}% kcal)  [ISSN 2017 · Morton 2018]
Grasas: ${fatPct}% de kcal = ${grasas} g (${detalle.grasas.gkg} g/kg)  [AMDR 20-35%, piso 0.5 g/kg]
Carbos: resto = ${carbos} g (${detalle.carbos.pct}% kcal · ${detalle.carbos.gkg} g/kg)${avisos.length ? '\n⚠️ ' + avisos.join('\n⚠️ ') : ''}`;

  // Versión REDONDEADA de cara al cliente — redondeo DIRECCIONAL, no al más
  // cercano. La precisión de 1625/P146 es falsa (Katch-McArdle ±10%, el
  // etiquetado permite 20% de desvío, y el registro del cliente suma otro
  // 10-20%), y además fomenta rigidez. Reglas:
  //  · kcal a múltiplos de 50: en DÉFICIT hacia ABAJO (el registro promedio
  //    subreporta — redondear abajo deja colchón), en SUPERÁVIT hacia ARRIBA
  //    (el riesgo ahí es quedarse corto), en mantenimiento al más cercano.
  //  · proteína a múltiplos de 5, SIEMPRE hacia ARRIBA (pasarse no cuesta,
  //    quedarse corto sí).
  //  · grasas a múltiplos de 5 hacia ABAJO (libera carbo para el entreno),
  //    sin romper el piso de 0.5 g/kg.
  //  · carbos: el RESTO de las kcal redondeadas — el set del cliente queda
  //    internamente consistente (suma ≈ kcal redondeadas).
  const floor50 = (n) => Math.floor(n / 50) * 50;
  const ceil50 = (n) => Math.ceil(n / 50) * 50;
  const kcalRed = objetivo_pct < 0 ? floor50(kcal) : objetivo_pct > 0 ? ceil50(kcal) : Math.round(kcal / 50) * 50;
  const proteRed = Math.ceil(proteina / 5) * 5;
  let grasaRed = Math.floor(grasas / 5) * 5;
  if (grasas / w >= 0.5 && grasaRed / w < 0.5) grasaRed = Math.ceil(grasas / 5) * 5; // el redondeo no rompe el piso
  const carbosRed = Math.max(0, Math.round(((kcalRed - proteRed * 4 - grasaRed * 9) / 4) / 5) * 5);
  const redondeo = { kcal: kcalRed, proteina: proteRed, carbos: carbosRed, grasas: grasaRed };

  return { kcal, proteina, grasas, carbos, redondeo, metodo, argumento: argumento + `\nRedondeo para el cliente (direccional): ${redondeo.kcal} kcal · P${redondeo.proteina} / C${redondeo.carbos} / G${redondeo.grasas} — kcal ${objetivo_pct < 0 ? 'hacia abajo (colchón anti-subreporte en déficit)' : objetivo_pct > 0 ? 'hacia arriba (no quedarse corto en superávit)' : 'al más cercano'}, proteína hacia arriba, grasa hacia abajo, carbo = resto. (Exacto: ${kcal} · P${proteina}/C${carbos}/G${grasas})`, bmr: Math.round(bmr), tdee: Math.round(tdee), detalle, cambioSemanalKg, avisos, grasa_pct_kcal: fatPct };
}

// Guía de rangos por objetivo — respaldo para configurar proteína y grasa.
// Proteína: ISSN position stand (Jäger 2017) 1.4-2.0 g/kg general; Morton et
// al. 2018 (meta-análisis, Br J Sports Med) ~1.6-2.2 g/kg para hipertrofia;
// Helms et al. 2014 (revisión, IJSNEM) 2.3-3.1 g/kg de masa MAGRA en déficit
// (≈2.0-2.7 g/kg de peso total con %grasa moderado) — más proteína protege
// el músculo cuando faltan calorías. Grasa: AMDR 20-35% (IOM 2005), piso 0.5
// g/kg (Helms 2014). Carbo: Burke et al. 2011 (J Sports Sci) 3-5 g/kg entreno
// moderado, 5-7 g/kg volumen alto.
// Bases científicas del cálculo — SIEMPRE visibles en la sección 5 de la
// ficha: nombre del método + explicación en cristiano + la fórmula al lado,
// para que el coach las tenga a la vista y se las vaya aprendiendo.
const FORMULAS_META = [
  ['Mifflin-St Jeor (1990)',
   'Estima las kcal que el cuerpo quema en reposo total (BMR) con peso, estatura, edad y sexo. Es la ecuación más precisa a nivel poblacional (revisión ADA, Frankenfield 2005). Se usa cuando NO conocemos el %grasa.',
   'BMR = 10×peso + 6.25×estatura − 5×edad (+5 H · −161 M)'],
  ['Katch-McArdle',
   'Estima el BMR desde la masa magra: el músculo y los órganos son lo que gasta energía, la grasa casi nada. Más preciso — se usa automáticamente cuando SÍ tenemos el %grasa del cliente.',
   'BMR = 370 + 21.6 × masa magra · magra = peso × (1 − %grasa/100)'],
  ['Factor de actividad PAL (FAO/OMS)',
   'Convierte el gasto en reposo en el gasto REAL del día (TDEE) multiplicando por cuánto se mueve la persona en total: trabajo, pasos, entreno, deporte.',
   'TDEE = BMR × PAL (1.2 sedentario → 1.9 muy activo)'],
  ['Objetivo como % del TDEE + regla de Wishnofsky (1958)',
   'El déficit/superávit se aplica como porcentaje del gasto (gradual y proporcional al tamaño de la persona). Como ~7700 kcal acumuladas ≈ 1 kg de grasa, de ahí sale el ritmo esperado en kg/semana.',
   'Meta = TDEE × (1 ± %) · kg/sem ≈ (Meta − TDEE) × 7 ÷ 7700'],
  ['Proteína en g/kg (ISSN 2017 · Morton 2018 · Helms 2014)',
   'La necesidad de proteína depende de la MASA CORPORAL, no de cuántas calorías se coman — por eso se dosifica en gramos por kg de peso, nunca como %. En déficit se sube (2.0-2.7 g/kg) para proteger el músculo.',
   'Proteína (g) = peso × g/kg elegido'],
  ['Grasa en % de las kcal (AMDR, IOM 2005)',
   'La grasa sí se asigna como fracción de la energía total: el rango aceptable es 20-35% de las kcal, con un PISO de 0.5 g/kg para no comprometer la función hormonal (Helms 2014).',
   'Grasas (g) = Meta × % ÷ 9'],
  ['Carbohidrato = el resto (Burke 2011)',
   'Es el combustible flexible del entreno: recibe todas las kcal que quedan tras cubrir proteína y grasa. Referencia de suficiencia: 3-5 g/kg entreno moderado, 5-7 g/kg volumen alto.',
   'Carbos (g) = (Meta − prote×4 − grasas×9) ÷ 4'],
];

// Referencias bibliográficas completas del cálculo y la distribución.
const BIBLIOGRAFIA_META = [
  'Mifflin MD, St Jeor ST, et al. (1990). "A new predictive equation for resting energy expenditure in healthy individuals". Am J Clin Nutr 51(2):241-247.',
  'Frankenfield D, Roth-Yousey L, Compher C (2005). "Comparison of predictive equations for resting metabolic rate…" (Mifflin-St Jeor, la más precisa). J Am Diet Assoc 105(5):775-789.',
  'McArdle WD, Katch FI, Katch VL. "Exercise Physiology" — fórmula Katch-McArdle sobre masa magra (deriva de Cunningham 1980, Am J Clin Nutr 33:2372-2374).',
  'FAO/OMS/UNU (2001). "Human Energy Requirements" — factores de actividad PAL.',
  'Jäger R, et al. (2017). "ISSN Position Stand: protein and exercise". J Int Soc Sports Nutr 14:20 → proteína 1.4-2.0 g/kg base.',
  'Morton RW, et al. (2018). Meta-análisis proteína e hipertrofia. Br J Sports Med 52(6):376-384 → techo de beneficio ≈1.6-2.2 g/kg.',
  'Helms ER, Aragon AA, Fitschen PJ (2014). "Evidence-based recommendations for natural bodybuilding contest preparation". J Int Soc Sports Nutr 11:20 → proteína alta en déficit (2.3-3.1 g/kg magra) y grasa mínima 0.5 g/kg.',
  'Institute of Medicine (2005). "Dietary Reference Intakes" → AMDR de grasa: 20-35% de las kcal.',
  'Burke LM, Hawley JA, Wong SH, Jeukendrup AE (2011). "Carbohydrates for training and competition". J Sports Sci 29(sup1):S17-S27 → carbo 3-5 g/kg moderado · 5-7 g/kg volumen alto.',
  'Wishnofsky M (1958). "Caloric equivalents of gained or lost weight". Am J Clin Nutr 6(5):542-546 → ≈7700 kcal por kg.',
];

// Rangos de % de grasa corporal (norma ISSA, tabla 7.1). Coinciden casi
// exactamente con los de ACE (la referencia más citada): ACE solo difiere en
// la grasa esencial de hombres (2-5% ACE vs 4-6% ISSA) y llama "obesidad" al
// rango alto. ACSM y Gallagher et al. 2000 (Am J Clin Nutr 72:694-701) dan
// rangos saludables AJUSTADOS POR EDAD: después de los 40 el rango sano se
// corre unos puntos hacia arriba — tenerlo en cuenta al interpretar.
const RANGOS_GRASA_HEADERS = ['', 'Esencial', 'Atlético', 'Fit', 'Promedio', 'Alto'];
const RANGOS_GRASA = [
  ['Hombres', '4-6%', '7-10%', '11-16%', '17-25%', '≥26%'],
  ['Mujeres', '10-12%', '13-20%', '21-24%', '25-31%', '≥32%'],
];
function tablaGrasaHtml() {
  return `
    <div class="text-[11px] font-bold text-slate-600 mb-1">📊 % de grasa corporal — rangos de referencia (ISSA/ACE)</div>
    <table class="w-full text-[11px]">
      <tr>${RANGOS_GRASA_HEADERS.map((h, i) => `<th class="text-${i === 0 ? 'left' : 'center'} py-0.5 px-1 ${i === 0 ? '' : 'text-slate-500 font-semibold uppercase text-[9px] tracking-wide'}">${h}</th>`).join('')}</tr>
      ${RANGOS_GRASA.map(fila => `
        <tr class="border-t border-slate-100">
          ${fila.map((celda, i) => `<td class="py-1 px-1 ${i === 0 ? 'font-semibold text-slate-700' : 'text-center num'} ${i === 4 ? 'bg-emerald-50/60' : ''} ${i === 5 ? 'text-red-600' : ''}">${celda}</td>`).join('')}
        </tr>`).join('')}
    </table>
    <div class="text-[10px] text-slate-400 mt-1">ISSA · coincide con ACE (esencial hombres: 2-5% según ACE) · en 40+ años el rango sano sube unos puntos (Gallagher 2000, ACSM)</div>`;
}

const GUIA_MACROS = {
  proteina: [
    ['Pérdida de grasa (déficit)', '2.0 – 2.7 g/kg', 'Preserva masa magra en déficit (Helms 2014)'],
    ['Recomposición', '1.8 – 2.2 g/kg', 'Rango alto del meta-análisis Morton 2018'],
    ['Ganancia muscular (superávit)', '1.6 – 2.2 g/kg', 'Techo de beneficio ≈1.6-2.2 (Morton 2018)'],
    ['Mantenimiento / salud general', '1.4 – 1.8 g/kg', 'Piso para entrenados (ISSN 2017)'],
  ],
  grasa: [
    ['Estándar', '25 – 30% kcal', 'Punto medio del AMDR; saciedad y adherencia'],
    ['Más carbo para entrenar', '20 – 25% kcal', 'Libera kcal para carbohidrato en volumen alto'],
    ['Preferencia alta en grasa', '30 – 35% kcal', 'Válido si el carbo no cae bajo ~3 g/kg'],
    ['Piso absoluto', '≥ 0.5 g/kg', 'Función hormonal (Helms 2014)'],
  ],
  carbo: [
    ['Entreno moderado (3-4 d/sem)', '3 – 5 g/kg', 'Burke 2011'],
    ['Volumen alto (5+ d/sem)', '5 – 7 g/kg', 'Burke 2011'],
  ],
};

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

// Marca/desmarca una tarea del coach directo desde el timeline del seguimiento
window.togglePendienteTimeline = async (id, estado) => {
  await db.pendientes.toggle(id, estado);
  rerenderView();
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
// OJO: NO se cierra al hacer clic fuera del cuadro. Un clic accidental en el
// fondo botaba el formulario a medio llenar (seguimiento, ficha del cliente…)
// y se perdía todo lo escrito. Salir es SIEMPRE explícito: Cancelar o la X.
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
  // Historial de metas nutricionales. Cada meta que se fija o se envía al
  // Mealtracker deja una fila, para poder leer cualquier resultado contra la
  // meta que estaba VIGENTE en ese momento.
  // listCliente devuelve null (no []) si la tabla aún no existe en Supabase:
  // así la UI distingue "sin historial" de "falta la migración" y nunca
  // rompe una ficha por una tabla que no se ha creado.
  metas: {
    async listCliente(cliente_id) {
      const { data, error } = await sb.from('metas_historial').select('*')
        .eq('cliente_id', cliente_id)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) return null;
      return data || [];
    },
    async insert(row) {
      const { data, error } = await sb.from('metas_historial').insert(row).select().single();
      if (error) return null;
      return data;
    },
    async update(id, row) { await sb.from('metas_historial').update(row).eq('id', id); },
    async remove(id) { await sb.from('metas_historial').delete().eq('id', id); },
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

  const [clientes, pagosMes, pendAbiertos, allSegs] = await Promise.all([
    db.clientes.list(),
    db.pagos.listMes(mes),
    db.pendientes.listAbiertos(),
    db.seguimientos.listAll(),
  ]);

  const activos = clientes.filter(c => c.estado === 'activo');

  // Cobrado y pendiente del mes
  const pagadosMes = pagosMes.filter(p => p.pagado);
  const cobrado = pagadosMes.reduce((s, p) => s + copConv(p.monto, p.moneda), 0);
  const porCobrar = activos.reduce((s, c) => {
    const p = pagosMes.find(pp => pp.cliente_id === c.id);
    if (p && p.pagado) return s;
    if (p && Number(p.monto) === 0) return s; // monto 0 = mes sin cobro (premio, cortesía)
    // Si hay un pago pendiente registrado, usar su monto; si no, el de la ficha
    const monto = p && Number(p.monto) > 0 ? p.monto : c.monto;
    const moneda = (p && p.moneda) || c.moneda;
    return s + copConv(monto, moneda);
  }, 0);

  // Vencidos: cliente activo cuyo día_pago YA PASÓ este mes (desde el día
  // siguiente — el mismo día aún no cuenta) y no tiene pago marcado. Esta
  // lista además respeta los días de gracia: es la bandeja de "ya toca
  // cobrarle", no el estado visual (la tabla de Pagos muestra el vencido
  // desde el día siguiente, sin gracia).
  const diaHoy = new Date().getDate();
  const vencidos = activos.filter(c => {
    if (!c.dia_pago || c.dia_pago >= diaHoy) return false;
    const p = pagosMes.find(pp => pp.cliente_id === c.id);
    if (p && (p.pagado || Number(p.monto) === 0)) return false; // pagado o mes sin cobro
    return true;
  }).map(c => ({ ...c, dias_vencido: diaHoy - c.dia_pago }))
    .filter(c => c.dias_vencido > (c.dias_gracia || 0));

  // Próximos 7 días (incluye el que vence HOY)
  const proximos = activos.filter(c => {
    if (!c.dia_pago) return false;
    const p = pagosMes.find(pp => pp.cliente_id === c.id);
    if (p && (p.pagado || Number(p.monto) === 0)) return false; // pagado o mes sin cobro
    const diff = c.dia_pago - diaHoy;
    return diff >= 0 && diff <= 7;
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

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">

      ${vencidos.length > 0 ? `
        <div class="card">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-slate-900 flex items-center gap-2" title="Clientes cuyo día de pago ya pasó (contando sus días de gracia) sin pago registrado"><span class="w-2 h-2 rounded-full bg-red-500"></span>Pagos vencidos <span class="text-xs font-normal text-slate-400">(pasada su gracia)</span></h3>
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
                    <div class="text-xs text-amber-700">${c.dias_falta === 0 ? '⏰ Vence HOY' : `En ${c.dias_falta} día(s)`} · ${fmt.money(c.monto, c.moneda)}</div>
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
  // El seguimiento se hace sobre la semana YA vencida (la que acaba de cerrar),
  // no la semana en curso: así se garantiza que el cliente terminó sus entrenos
  // (algunos entrenan el fin de semana). Siempre se puede navegar con ◀ ▶.
  await abrirModalSeguimiento(clienteId, fmt.semanaPrev(fmt.semanaISO()));
};

// Cambia la semana del modal de seguimiento sin cerrarlo. Si esa semana ya
// tiene registro, lo abre para editar; si no, abre una vacía. Avisa si hay
// datos sin guardar en la semana actual.
window.cambiarSemanaSeg = (clienteId, semanaActual, delta) => {
  const nueva = delta < 0 ? fmt.semanaPrev(semanaActual) : fmt.semanaNext(semanaActual);
  if (delta > 0 && nueva > fmt.semanaISO()) { toast('No puedes registrar una semana futura'); return; }
  const hayDatos = ['#sg-fe', '#sg-ce', '#sg-kcal', '#sg-prote', '#sg-avances', '#sg-notas', '#sg-pend']
    .some(sel => ($(sel)?.value || '').trim());
  if (hayDatos && !confirm('¿Cambiar de semana? Se perderá lo que no hayas guardado en esta.')) return;
  abrirModalSeguimiento(clienteId, nueva);
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
// Caché de datos del seguimiento: al hacer click en un cliente se pinta AL
// INSTANTE con los datos ya cargados (cero parpadeo de "Cargando…") y la
// data fresca se trae en silencio por detrás y re-pinta solo si cambió algo.
let _segDataCache = null;

routes.seguimiento = async () => {
  const renderSeguimiento = (clientes, allSegs) => {
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
    <div id="seg-content"></div>
  `;

  if (_segView === 'focus') renderSegFocus(clientes, allSegs, ultPorCliente);
  else renderSegBoard(clientes, allSegs);
  };

  if (_segDataCache) {
    renderSeguimiento(_segDataCache.clientes, _segDataCache.allSegs);
  } else {
    view.innerHTML = '<div class="card">Cargando…</div>';
  }
  const [clientes, allSegs] = await Promise.all([db.clientes.list(), db.seguimientos.listAll()]);
  // Re-pintar solo si la data cambió respecto a lo ya pintado (evita el
  // doble render — y el salto de scroll — cuando no hay nada nuevo). La
  // firma es el contenido completo: cualquier edición, por chica que sea,
  // sí re-pinta.
  const firma = JSON.stringify([clientes, allSegs]);
  const igual = _segDataCache && _segDataCache.firma === firma;
  _segDataCache = { clientes, allSegs, firma };
  if (!igual) renderSeguimiento(clientes, allSegs);
};

window.switchSegView = (which) => { _segView = which; routes.seguimiento(); };

async function renderSegFocus(clientes, allSegs, ultPorCliente) {
  // Conservar la posición de scroll del sidebar entre re-renders (al
  // seleccionar un cliente la lista no debe saltar al inicio).
  const prevScroll = $('#seg-list')?.scrollTop || 0;
  const cliente = clientes.find(c => c.id === _selectedClienteId);
  const segs = allSegs.filter(s => s.cliente_id === _selectedClienteId).sort((a, b) => b.semana.localeCompare(a.semana));
  const ordenados = clientes.slice().sort(sortByEstado);

  // Pendientes del coach (para='coach') agrupados por la semana a la que
  // pertenecen, para mostrarlos en cada tarjeta del timeline junto a los
  // del cliente.
  const coachPorSeg = {};
  let medsCliente = [];
  let metasCliente = [];
  if (cliente) {
    const [pendsAll, meds, metas] = await Promise.all([
      db.pendientes.listCliente(_selectedClienteId),
      db.mediciones.listCliente(_selectedClienteId),
      db.metas.listCliente(_selectedClienteId),
    ]);
    medsCliente = meds;
    metasCliente = metas;
    for (const p of pendsAll.filter(p => p.para === 'coach')) {
      if (!p.seguimiento_id) continue;
      (coachPorSeg[p.seguimiento_id] ||= []).push(p);
    }
  }

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
    const sl0 = $('#seg-list'); if (sl0 && prevScroll) sl0.scrollTop = prevScroll;
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

        <details class="card">
          <summary class="cursor-pointer text-xs font-bold text-slate-500 uppercase tracking-wider">🥗 Historial de meta nutricional y macros</summary>
          <div class="mt-3">${historialMetasHTML(cliente, metasCliente, { max: 12 })}</div>
        </details>

        <details class="card">
          <summary class="cursor-pointer text-xs font-bold text-slate-500 uppercase tracking-wider">📏 Historial de peso y composición corporal</summary>
          <div class="mt-3">${historialCorporalHTML(cliente, medsCliente, {})}</div>
        </details>

        <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider px-1 pt-2">Timeline · ${segs.length} semana(s)</h4>
        <div class="space-y-3">
          ${segs.length === 0 ? '<div class="card text-sm text-slate-500 text-center py-8">Sin registros aún. <button class="text-emerald-600 font-semibold" onclick="abrirNuevoSeguimiento(\''+cliente.id+'\')">+ Crear el primero</button></div>' : segs.map(s => seguimientoCard(s, coachPorSeg[s.id] || [])).join('')}
        </div>
      </div>
    </div>
  `;
  const sl = $('#seg-list'); if (sl && prevScroll) sl.scrollTop = prevScroll;
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
  // Quick view de 3 semanas: el placeholder va en el template y se llena
  // async apenas el HTML esté en el DOM (mismo tick + timeout).
  setTimeout(() => quickAdherencia3Sem(c, 'quick3-seg', segs), 60);

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
          ${c.objetivo ? `<p class="text-xs text-slate-600 mt-2 italic">🎯 ${textoExpandible(c.objetivo, 110)}</p>` : ''}
          ${c.restricciones_lesiones ? `<p class="text-xs text-red-700 mt-1">⚕️ ${textoExpandible(c.restricciones_lesiones, 110)}</p>` : ''}
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
        <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Adherencia rápida · últimas 3 semanas</h4>
        <div id="quick3-seg"><div class="text-xs text-slate-400">Cargando…</div></div>
      </div>

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

      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5 pt-5 border-t border-slate-100">
        <div><div class="text-xs text-slate-500 mb-1">Estado</div><div class="font-bold">${c.estado === 'activo' ? '<span class="text-emerald-600">● Activo</span>' : c.estado === 'pausa' ? '<span class="text-orange-600">● Pausa</span>' : '<span class="text-slate-500">● Finalizado</span>'}</div></div>
        <div><div class="text-xs text-slate-500 mb-1">Lugar entreno</div><div class="font-bold capitalize">${c.lugar_entreno ? c.lugar_entreno.replace('_',' ') : '—'}</div></div>
        <div><div class="text-xs text-slate-500 mb-1">Ficha</div><button class="text-emerald-600 font-semibold text-sm hover:underline" onclick="verCliente('${c.id}')">Abrir perfil</button></div>
      </div>
    </div>
  `;
}

function seguimientoCard(s, coachPends = []) {
  const prom = helpers.promedioAdh(s);
  const ring = prom === null ? '' : prom >= 7.5 ? 'ring-good' : prom >= 5 ? 'ring-mid' : 'ring-bad';
  const pctAsis = helpers.pctAsistencia(s);
  return `
    <div class="card card-hover ${ring} cursor-pointer" onclick="editarSeguimiento('${s.id}')">
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <span class="font-bold text-slate-900">Sem ${fmt.rangoSemana(s.semana)}</span>
            <span class="text-xs text-slate-400">${fmt.labelSemana(s.semana)} · reg. ${fmt.fechaCorta(s.fecha)}</span>
            ${pctAsis !== null ? `<span class="tag ${pctAsis >= 90 ? 'tag-green' : pctAsis >= 60 ? 'tag-yellow' : 'tag-red'}">📆 ${s.dias_asistidos}/${s.dias_planeados} días · ${pctAsis}%</span>` : ''}
          </div>
          ${s.avances ? `<p class="text-sm text-slate-700 mb-2 whitespace-pre-line">${textoExpandible(s.avances, 220)}</p>` : '<p class="text-sm text-slate-400 italic">Sin avances escritos</p>'}
          ${s.pendientes_semana ? `<div class="bg-amber-50 rounded-lg px-3 py-2 mt-2"><div class="text-xs font-bold text-amber-800 mb-1">👥 Le pediste al cliente:</div>${checklistHtml(s.pendientes_semana, s.id)}</div>` : ''}
          ${coachPends.length ? `<div class="bg-emerald-50 rounded-lg px-3 py-2 mt-2"><div class="text-xs font-bold text-emerald-800 mb-1">🧢 Tus tareas (coach):</div><div class="space-y-1" onclick="event.stopPropagation()">${coachPends.map(p => `
            <label class="chk-item chk-ink ${p.estado === 'completado' ? 'chk-done' : ''}">
              <input type="checkbox" class="rounded" ${p.estado === 'completado' ? 'checked' : ''} onchange="togglePendienteTimeline('${p.id}', '${p.estado}')">
              <span class="chk-text">${escapeHtml(p.descripcion)}</span>
            </label>`).join('')}${coachPends.length > 1 ? `<div class="chk-count">${coachPends.filter(p => p.estado === 'completado').length}/${coachPends.length} completados</div>` : ''}</div></div>` : ''}
          ${s.notas ? `<p class="text-xs text-slate-500 mt-2 whitespace-pre-line">📝 ${textoExpandible(s.notas, 140)}</p>` : ''}
        </div>
        <div class="flex flex-col items-end gap-1 flex-shrink-0">
          ${prom !== null ? `<span class="tag ${prom >= 7.5 ? 'tag-green' : prom >= 5 ? 'tag-yellow' : 'tag-red'}" style="font-size:0.8rem; padding: 0.25rem 0.55rem; font-weight: 700">${prom.toFixed(1)}/10</span>` : ''}
        </div>
      </div>
      ${(() => {
        // Una sola fuente de verdad por pilar: el SCORE calculado (0-100).
        // Antes la barra y el "x/10" salían de la adherencia subjetiva (que
        // ya no se diligencia → "—/10" rojo con barra vacía) mientras el %
        // verdadero aparecía aparte — se veía contradictorio. Fallback: si
        // la semana es vieja y solo tiene adherencia, se usa esa ×10.
        const pilar = (nombre, score, adh) => {
          const val = score != null ? Math.round(score) : (adh != null ? adh * 10 : null);
          const cls = val == null ? 'text-slate-300' : val >= 75 ? 'text-emerald-600' : val >= 50 ? 'text-amber-600' : 'text-red-600';
          const bar = val == null ? 'bg-slate-200' : val >= 75 ? 'bg-emerald-500' : val >= 50 ? 'bg-amber-500' : 'bg-red-500';
          return `
          <div>
            <div class="flex items-center justify-between mb-1"><span class="text-slate-400">${nombre}</span><span class="font-bold ${cls}">${val == null ? 'sin datos' : val + '%'}</span></div>
            <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div class="h-full rounded-full ${bar}" style="width:${val || 0}%"></div></div>
          </div>`;
        };
        return `
      <div class="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-100 text-xs">
        ${pilar('Entreno', s.score_entreno, s.adherencia_entreno)}
        ${pilar('Alimentación', s.score_alim_metas, s.adherencia_alimentacion)}
      </div>`;
      })()}
    </div>
  `;
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ===== Texto largo compacto =====
// Los campos libres (patologías, restricciones, antecedentes, avances) se
// escriben largos y estiraban las tarjetas hasta volver ilegible la vista.
// Se muestran los primeros caracteres y el resto queda a un click.
let _txtSeq = 0;
function textoExpandible(texto, max = 90) {
  const t = (texto || '').trim();
  if (!t) return '';
  if (t.length <= max) return escapeHtml(t);
  const id = `tx${++_txtSeq}`;
  // Corta en el último espacio para no partir una palabra por la mitad.
  const corto = t.slice(0, max).replace(/\s+\S*$/, '');
  const boton = (accion, label) => `<button type="button" class="text-[11px] font-semibold ml-1" style="color:#2563eb;background:none;padding:0" onclick="event.stopPropagation(); ${accion}('${id}')">${label}</button>`;
  return `<span id="${id}-c">${escapeHtml(corto)}…${boton('verTextoCompleto', 'ver más')}</span>`
       + `<span id="${id}-f" class="hidden whitespace-pre-line">${escapeHtml(t)}${boton('verTextoCorto', 'ver menos')}</span>`;
}
window.verTextoCompleto = (id) => {
  $(`#${id}-c`)?.classList.add('hidden');
  $(`#${id}-f`)?.classList.remove('hidden');
};
window.verTextoCorto = (id) => {
  $(`#${id}-f`)?.classList.add('hidden');
  $(`#${id}-c`)?.classList.remove('hidden');
};

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
                  <div class="text-xs text-slate-400 mb-1">Sem ${fmt.rangoSemana(s.semana)} <span class="text-slate-300">· ${fmt.labelSemana(s.semana)}</span> · ${prom !== null ? prom.toFixed(1) + '/10' : '—'}</div>
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
// Franja de CONTEXTO del seguimiento: la "película 360" del cliente que se
// lee de izquierda a derecha. 5 bloques auto-generados a partir de la data.
// =====================================================
function ctxSeguimientoHTML(cliente, past, pendsCliente) {
  const recientes = past.slice(0, 4);
  const proms = recientes.map(helpers.promedioAdh).filter(v => v !== null);
  const promAdh = proms.length ? proms.reduce((a, b) => a + b, 0) / proms.length : null;
  let tend = '→', tcol = '#94a3b8';
  if (past.length >= 2) {
    const a = helpers.promedioAdh(past[0]), b = helpers.promedioAdh(past[1]);
    if (a !== null && b !== null) { if (a > b + 0.3) { tend = '↗'; tcol = '#059669'; } else if (a < b - 0.3) { tend = '↘'; tcol = '#dc2626'; } }
  }
  const fase = (FASES_PROGRAMA.find(f => f.key === cliente.fase_programa)?.label) || '';
  const linea = (t) => `<div class="text-xs text-slate-600 mb-1">${t}</div>`;
  const col = (titulo, color, inner) => `<div class="ctx-col" style="border-top:3px solid ${color}"><div class="ctx-col-title">${titulo}</div>${inner || linea('<span class="text-slate-400">—</span>')}</div>`;

  // 1. Panorama
  const panorama = [
    cliente.objetivo ? linea(`🎯 <strong>${textoExpandible(cliente.objetivo, 70)}</strong>`) : '',
    fase ? linea(`Fase: ${fase}`) : '',
    linea(`${past.length} semana(s) registradas`),
    promAdh !== null ? linea(`Adherencia 4 sem: <strong style="color:${promAdh >= 7.5 ? '#059669' : promAdh >= 5 ? '#d97706' : '#dc2626'}">${promAdh.toFixed(1)}/10</strong> <span style="color:${tcol};font-weight:700">${tend}</span>`) : linea('Sin adherencia previa'),
  ].join('');

  // 2. Entrenamiento
  const filaEnt = (s2) => {
    const f = s2.fuerza_planeados ? `${s2.fuerza_ejecutados ?? 0}/${s2.fuerza_planeados}` : '—';
    const comp = s2.cardio_ejecutados ? ` +${s2.cardio_ejecutados}d compl.` : '';
    return `<div class="text-xs text-slate-600">${fmt.rangoSemana(s2.semana)}: fuerza <strong>${f}</strong>${comp}${s2.score_entreno != null ? ` · <span style="color:#10b981;font-weight:700">${Math.round(s2.score_entreno)}%</span>` : ''}</div>`;
  };
  const streakF = calcStreakDim(past, s2 => s2.fuerza_planeados > 0 && (s2.fuerza_ejecutados / s2.fuerza_planeados) >= 0.75);
  const entreno = (recientes.length ? recientes.slice(0, 3).map(filaEnt).join('') : linea('Sin registros de entreno'))
    + (streakF > 1 ? `<div class="text-xs mt-1" style="color:#059669;font-weight:600">🔥 ${streakF} sem cumpliendo fuerza</div>` : '')
    + (metaDiasEntreno(cliente) ? `<div class="text-xs text-slate-400 mt-1">Meta: ${metaDiasEntreno(cliente)} días/sem</div>` : '');

  // 3. Alimentación
  const filaAlim = (s2) => `<div class="text-xs text-slate-600">${fmt.rangoSemana(s2.semana)}: ${s2.kcal_promedio ?? '—'} kcal · ${s2.proteina_promedio_g ?? '—'}g P · ${s2.dias_registro_alim ?? 0}/7 reg</div>`;
  const alim = (recientes.length ? recientes.slice(0, 3).map(filaAlim).join('') : linea('Sin registros de alimentación'))
    + (cliente.meta_calorias ? `<div class="text-xs text-slate-400 mt-1">Meta: ${cliente.meta_calorias} kcal · ${cliente.meta_proteina_g}g P</div>` : `<div class="text-xs text-amber-600 mt-1">Sin meta definida</div>`);

  // 4. Salud y lesiones — texto recortado: la columna no puede crecer sin
  // límite o empuja el resto de la franja fuera de pantalla.
  const salud = [
    cliente.lesion_actual ? `<div class="text-xs text-red-700 mb-1">🩹 <strong>Lesión:</strong> ${textoExpandible(cliente.lesion_actual, 70)}${cliente.lesion_estado ? ` (${cliente.lesion_estado.replace('_', ' ')})` : ''}</div>` : '',
    cliente.restricciones_lesiones ? `<div class="text-xs text-red-700 mb-1"><strong>Restric.:</strong> ${textoExpandible(cliente.restricciones_lesiones, 70)}</div>` : '',
    cliente.patologias ? `<div class="text-xs text-red-700 mb-1"><strong>Patologías:</strong> ${textoExpandible(cliente.patologias, 70)}</div>` : '',
    cliente.suplementos ? `<div class="text-xs text-slate-600 mb-1">💊 ${textoExpandible(cliente.suplementos, 70)}</div>` : '',
  ].filter(Boolean).join('') || linea('Sin alertas de salud ✓');

  // 5. Pendientes y foco
  const abiertos = pendsCliente.filter(p => p.estado === 'abierto');
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const cands = [
    ['Entrenamiento', avg(recientes.map(s2 => s2.score_entreno).filter(v => v != null))],
    ['Alim · metas', avg(recientes.map(s2 => s2.score_alim_metas).filter(v => v != null))],
    ['Registro comidas', avg(recientes.map(s2 => s2.score_alim_registro).filter(v => v != null))],
  ].filter(c => c[1] != null).sort((a, b) => a[1] - b[1]);
  const foco = cands.length && cands[0][1] < 75 ? `<div class="text-xs mt-1" style="color:#d97706;font-weight:600">👉 Reforzar: ${cands[0][0]} (${Math.round(cands[0][1])}%)</div>` : '';
  const pend = (abiertos.length ? abiertos.slice(0, 6).map(p => `<div class="text-xs text-slate-600">${p.para === 'coach' ? '🧢' : '👥'} ${textoExpandible(p.descripcion, 60)}</div>`).join('') : linea('Sin pendientes abiertos ✓')) + foco;

  return col('📌 Panorama', '#0ea5e9', panorama)
    + col('🏋️ Entrenamiento', '#10b981', entreno)
    + col('🥗 Alimentación', '#3b82f6', alim)
    + col('⚕️ Salud y lesiones', '#ef4444', salud)
    + col('✅ Pendientes y foco', '#8b5cf6', pend);
}

// =====================================================
// HISTORIAL DE METAS NUTRICIONALES · trazabilidad
// =====================================================
// Un resultado ("bajó 2 kg", "se estancó") solo se puede leer contra la meta
// que estaba VIGENTE cuando pasó. Por eso cada meta que se fija o se envía al
// Mealtracker deja una fila en metas_historial: los números, desde cuándo,
// con qué método y sobre qué peso de referencia se calcularon.
const ORIGENES_META = {
  calculo:  { icono: '🧮', label: 'Calculada en la ficha' },
  envio_mt: { icono: '📤', label: 'Enviada al Mealtracker' },
  manual:   { icono: '✍️', label: 'Ajuste manual' },
  ficha:    { icono: '📋', label: 'Meta vigente de la ficha' },
};

function metaNums(m) {
  return { kcal: m?.kcal ?? null, p: m?.proteina_g ?? null, c: m?.carbos_g ?? null, g: m?.grasas_g ?? null };
}
function mismaMeta(a, b) {
  const x = metaNums(a), y = metaNums(b);
  return x.kcal === y.kcal && x.p === y.p && x.c === y.c && x.g === y.g;
}

// Une el historial guardado con la meta vigente de la ficha. La vigente
// SIEMPRE aparece, aunque la tabla esté vacía o falte la migración: así la
// trazabilidad se ve desde hoy y no desde el próximo cambio de meta.
function metasHistorialFilas(cliente, rows) {
  const lista = (rows || []).map(r => ({ ...r, fecha: r.fecha || (r.created_at || '').slice(0, 10) }));
  const vigente = cliente && cliente.meta_calorias ? {
    kcal: cliente.meta_calorias,
    proteina_g: cliente.meta_proteina_g,
    carbos_g: cliente.meta_carbos_g,
    grasas_g: cliente.meta_grasas_g,
  } : null;
  if (vigente && !lista.some(m => mismaMeta(m, vigente))) {
    lista.push({
      ...vigente,
      id: null,
      virtual: true,
      fecha: (cliente.meta_calculada_en || '').slice(0, 10) || null,
      metodo: cliente.meta_metodo || null,
      argumento: cliente.meta_argumento || null,
      origen: 'ficha',
      enviada_mt: !!(cliente.meta_enviada_mt && cliente.meta_enviada_mt.kcal === cliente.meta_calorias),
      enviada_at: (cliente.meta_enviada_mt || {}).at || null,
    });
  }
  // Más nueva primero. Sin fecha = meta vigente recién puesta → va arriba.
  return lista.sort((a, b) => (b.fecha || '9999-99-99').localeCompare(a.fecha || '9999-99-99'));
}

// Delta neutro: una meta que sube no es "buena" ni "mala" por sí sola, así
// que se colorea por dirección (azul sube · ámbar baja), no por juicio.
function deltaMeta(actual, previo, unidad = '') {
  if (actual == null || previo == null) return '<span class="text-slate-300">—</span>';
  const d = actual - previo;
  if (!d) return '<span class="text-slate-400">=</span>';
  return `<span style="color:${d > 0 ? '#2563eb' : '#d97706'};font-weight:600">${d > 0 ? '+' : ''}${d}${unidad}</span>`;
}

// Historial completo de metas y macros: gráficas + tabla con el delta contra
// la meta anterior y el periodo en que estuvo vigente cada una.
function historialMetasHTML(cliente, rows, opts = {}) {
  const filas = metasHistorialFilas(cliente, rows);
  const aviso = rows === null
    ? '<div class="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1 mb-2">⚠️ El historial de metas aún no se está guardando: falta crear la tabla <strong>metas_historial</strong> en Supabase (corre <strong>schema.sql</strong>, al final está la migración). Por ahora solo se ve la meta vigente.</div>'
    : '';
  if (!filas.length) {
    return aviso + '<p class="text-xs text-slate-500">Sin metas registradas. Calcula la meta en la ficha del cliente (sección 5 · 🥗) y quedará el primer punto del historial.</p>';
  }

  const max = opts.max || 12;
  const visibles = filas.slice(0, max);
  const asc = filas.slice().filter(m => m.kcal).reverse();

  // Gráficas: kcal por un lado (escala de miles) y macros por otro (gramos).
  const labels = asc.map(m => m.fecha ? fmt.fechaCorta(m.fecha) : 'hoy');
  let graficas = '';
  if (asc.length >= 2) {
    const kcals = asc.map(m => m.kcal);
    const macros = asc.flatMap(m => [m.proteina_g, m.carbos_g, m.grasas_g]).filter(v => v != null);
    const minK = Math.min(...kcals), maxK = Math.max(...kcals);
    graficas = `
      <div class="grid grid-cols-1 ${opts.compacto ? '' : 'md:grid-cols-2'} gap-3 mb-3">
        <div class="bg-slate-50 rounded-xl p-3">
          <div class="text-xs font-bold text-slate-700 mb-1">Meta de calorías</div>
          ${lineChart([{ label: 'kcal', color: '#059669', points: kcals }], labels,
            { yMin: Math.max(0, Math.floor((minK - 200) / 100) * 100), yMax: Math.ceil((maxK + 200) / 100) * 100, height: 150 })}
        </div>
        <div class="bg-slate-50 rounded-xl p-3">
          <div class="text-xs font-bold text-slate-700 mb-1">Macros (g/día)</div>
          ${macros.length ? lineChart([
            { label: 'Proteína', color: '#2563eb', points: asc.map(m => m.proteina_g ?? null) },
            { label: 'Carbos', color: '#d97706', points: asc.map(m => m.carbos_g ?? null) },
            { label: 'Grasas', color: '#dc2626', points: asc.map(m => m.grasas_g ?? null) },
          ], labels, { yMin: 0, yMax: Math.ceil((Math.max(...macros) + 30) / 25) * 25, height: 150 })
            : '<p class="text-xs text-slate-400">Sin macros registrados</p>'}
          <div class="mt-1">${legendDot('#2563eb', 'Proteína')}${legendDot('#d97706', 'Carbos')}${legendDot('#dc2626', 'Grasas')}</div>
        </div>
      </div>`;
  }

  const fila = (m, i) => {
    const prev = filas[i + 1];                       // la meta anterior en el tiempo
    const sig = i === 0 ? null : filas[i - 1];       // la que la reemplazó
    const vigencia = sig
      ? `hasta ${sig.fecha ? fmt.fechaCorta(sig.fecha) : '—'}${m.fecha && sig.fecha ? ` · ${fmt.diasEntre(m.fecha, sig.fecha)} días` : ''}`
      : `<span class="text-emerald-700 font-semibold">vigente hoy</span>${m.fecha ? ` · ${fmt.diasDesde(m.fecha)} días` : ''}`;
    const org = ORIGENES_META[m.origen] || ORIGENES_META.manual;
    const ref = [
      m.peso_kg ? `${m.peso_kg} kg` : '',
      m.grasa_pct ? `${m.grasa_pct}% grasa` : '',
      m.objetivo ? escapeHtml(m.objetivo) : '',
      m.tdee ? `TDEE ${m.tdee}` : '',
      m.proteina_g_kg ? `${m.proteina_g_kg} g/kg prote` : '',
    ].filter(Boolean).join(' · ');
    return `
      <tr class="align-top">
        <td class="whitespace-nowrap">
          <div class="font-semibold text-slate-800">${m.fecha ? fmt.fechaCorta(m.fecha) : 'sin fecha'}</div>
          <div class="text-[10px] text-slate-500">${vigencia}</div>
        </td>
        <td class="whitespace-nowrap">
          <div class="font-bold text-emerald-700">${m.kcal ?? '—'} kcal</div>
          <div class="text-[10px]">${deltaMeta(m.kcal, prev?.kcal, ' kcal')}</div>
        </td>
        <td class="whitespace-nowrap text-xs">
          <span style="color:#2563eb;font-weight:700">${m.proteina_g ?? '—'}P</span> ·
          <span style="color:#d97706;font-weight:700">${m.carbos_g ?? '—'}C</span> ·
          <span style="color:#dc2626;font-weight:700">${m.grasas_g ?? '—'}G</span>
          <div class="text-[10px] text-slate-500">${deltaMeta(m.proteina_g, prev?.proteina_g)} / ${deltaMeta(m.carbos_g, prev?.carbos_g)} / ${deltaMeta(m.grasas_g, prev?.grasas_g)}</div>
        </td>
        <td class="text-xs">
          <div>${org.icono} ${org.label}</div>
          ${m.metodo ? `<div class="text-[10px] text-slate-500">${escapeHtml(m.metodo)}</div>` : ''}
          ${ref ? `<div class="text-[10px] text-slate-500">${ref}</div>` : ''}
          ${m.nota ? `<div class="text-[10px] text-slate-500">${escapeHtml(m.nota)}</div>` : ''}
        </td>
        <td class="text-xs whitespace-nowrap">
          ${m.enviada_mt
            ? `<span class="tag tag-violet">📤 en la app</span>${m.enviada_at ? `<div class="text-[10px] text-slate-500">${fmt.fechaCorta(String(m.enviada_at).slice(0, 10))}</div>` : ''}`
            : '<span class="text-slate-400">—</span>'}
        </td>
      </tr>
      ${m.argumento ? `
      <tr><td colspan="5" class="pt-0">
        <details><summary class="text-[11px] text-emerald-700 cursor-pointer">Ver argumento del cálculo</summary><pre class="text-[11px] text-slate-600 mt-1 whitespace-pre-wrap">${escapeHtml(m.argumento)}</pre></details>
      </td></tr>` : ''}`;
  };

  return `
    ${aviso}
    <div class="text-xs text-slate-500 mb-2">${filas.length} meta(s) en el historial${filas.length > 1 && filas[0].kcal && filas[filas.length - 1].kcal ? ` · desde ${filas[filas.length - 1].kcal} kcal hasta ${filas[0].kcal} kcal (${filas[0].kcal - filas[filas.length - 1].kcal >= 0 ? '+' : ''}${filas[0].kcal - filas[filas.length - 1].kcal})` : ''}</div>
    ${graficas}
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead><tr><th>Desde</th><th>Calorías</th><th>Macros</th><th>Origen y referencia</th><th>Mealtracker</th></tr></thead>
        <tbody>${visibles.map(fila).join('')}</tbody>
      </table>
    </div>
    ${filas.length > visibles.length ? `<div class="text-xs text-slate-400 mt-1">Mostrando las ${visibles.length} más recientes de ${filas.length}.</div>` : ''}`;
}

// Guarda un punto del historial de metas. No duplica: si la última fila tiene
// exactamente los mismos números, solo la marca como enviada al Mealtracker
// cuando corresponde.
async function registrarMetaHistorial(clienteId, meta, opts = {}) {
  if (!clienteId || !meta || !meta.kcal) return null;
  const rows = await db.metas.listCliente(clienteId);
  if (rows === null) return null;                     // sin tabla: no se registra
  const ultima = rows[0];
  if (ultima && mismaMeta(ultima, meta)) {
    if (opts.enviada_mt && !ultima.enviada_mt) {
      await db.metas.update(ultima.id, { enviada_mt: true, enviada_at: new Date().toISOString() });
    }
    return ultima;
  }
  return db.metas.insert({
    cliente_id: clienteId,
    fecha: fmt.hoy(),
    ...meta,
    ...(opts.enviada_mt ? { enviada_mt: true, enviada_at: new Date().toISOString() } : {}),
  });
}

// =====================================================
// HISTORIAL DE PESO Y COMPOSICIÓN CORPORAL
// =====================================================
// Todas las mediciones cargadas, con el delta contra la anterior y contra la
// primera: el peso solo dice algo comparado consigo mismo en el tiempo.
function historialCorporalHTML(cliente, meds, opts = {}) {
  const asc = (meds || []).slice().sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
  if (!asc.length) {
    return `<p class="text-xs text-slate-500">Sin mediciones registradas.${cliente.estatura_cm ? '' : ' Falta la estatura en el perfil para estimar composición.'}</p>`;
  }
  const edad = helpers.edadDe(cliente.fecha_nacimiento);
  const compDe = (m) => calcComposicionCorporal({ peso: m.peso, grasa_pct: m.grasa_pct, edad, sexo: cliente.sexo, altura_cm: cliente.estatura_cm });
  const comps = asc.map(compDe);

  const conPeso = asc.filter(m => m.peso != null);
  const primera = conPeso[0];
  const ultima = conPeso[conPeso.length - 1];
  const anterior = conPeso.length >= 2 ? conPeso[conPeso.length - 2] : null;
  const dTotal = primera && ultima && primera !== ultima ? +(ultima.peso - primera.peso).toFixed(1) : null;
  const dUlt = anterior ? +(ultima.peso - anterior.peso).toFixed(1) : null;
  const semanasEntre = anterior && ultima.fecha && anterior.fecha ? fmt.diasEntre(anterior.fecha, ultima.fecha) / 7 : null;
  const ritmo = dUlt != null && semanasEntre > 0 ? +(dUlt / semanasEntre).toFixed(2) : null;
  const flecha = (d) => d == null ? '' : d > 0 ? '▲' : d < 0 ? '▼' : '=';
  const colD = (d) => d == null ? '#94a3b8' : d > 0 ? '#2563eb' : d < 0 ? '#d97706' : '#94a3b8';

  const resumen = ultima ? `
    <div class="bg-teal-50 ring-1 ring-teal-100 rounded-xl px-3 py-2 mb-2 text-sm text-teal-900 flex flex-wrap gap-x-4 gap-y-1">
      <span><strong>Último:</strong> ${ultima.peso} kg${ultima.grasa_pct ? ` · ${ultima.grasa_pct}% grasa` : ''}${ultima.cintura ? ` · ${ultima.cintura} cm cintura` : ''} <span class="text-teal-700/70 text-xs">(${fmt.fechaCorta(ultima.fecha)})</span></span>
      ${dUlt != null ? `<span style="color:${colD(dUlt)}"><strong>vs anterior:</strong> ${flecha(dUlt)} ${dUlt > 0 ? '+' : ''}${dUlt} kg${ritmo != null ? ` (${ritmo > 0 ? '+' : ''}${ritmo} kg/sem)` : ''}</span>` : ''}
      ${dTotal != null ? `<span style="color:${colD(dTotal)}"><strong>vs inicio:</strong> ${flecha(dTotal)} ${dTotal > 0 ? '+' : ''}${dTotal} kg <span class="text-xs text-teal-700/70">(desde ${fmt.fechaCorta(primera.fecha)})</span></span>` : ''}
    </div>` : '';

  const labels = asc.map(m => fmt.fechaCorta(m.fecha));
  const pesos = asc.map(m => m.peso ?? null).filter(v => v !== null);
  const grasasPct = asc.map(m => m.grasa_pct ?? null).filter(v => v !== null);
  let graficas = '';
  if (pesos.length >= 2) {
    const series = [{ label: 'Peso', color: '#10b981', points: asc.map(m => m.peso ?? null) }];
    if (grasasPct.length >= 2) series.push({ label: '% grasa', color: '#f59e0b', points: asc.map(m => m.grasa_pct ?? null) });
    graficas += `
      <div class="bg-slate-50 rounded-xl p-3 mb-2">
        <div class="text-xs font-bold text-slate-700 mb-2">Evolución peso ${grasasPct.length >= 2 ? '· % grasa' : ''}</div>
        ${lineChart(series, labels, { yMin: Math.floor(Math.min(...pesos) - 3), yMax: Math.ceil(Math.max(...pesos) + 3), height: 160 })}
        <div class="mt-1">${legendDot('#10b981', 'Peso (kg)')}${grasasPct.length >= 2 ? legendDot('#f59e0b', '% grasa') : ''}</div>
      </div>`;
  }
  const conComp = comps.filter(Boolean);
  if (conComp.length >= 2 && conComp.some(x => x.masa_muscular_smm_kg)) {
    const magras = comps.map(x => x?.masa_magra_kg ?? null);
    const grasasKg = comps.map(x => x?.masa_grasa_kg ?? null);
    const smm = comps.map(x => x?.masa_muscular_smm_kg ?? null);
    const todos = [...magras, ...grasasKg, ...smm].filter(v => v !== null);
    if (todos.length) {
      graficas += `
        <div class="bg-slate-50 rounded-xl p-3 mb-2">
          <div class="text-xs font-bold text-slate-700 mb-2">Evolución composición corporal (estimada)</div>
          ${lineChart([
            { label: 'Masa magra', color: '#10b981', points: magras },
            { label: 'Músculo esquel.', color: '#3b82f6', points: smm },
            { label: 'Masa grasa', color: '#f59e0b', points: grasasKg },
          ], labels, { yMin: Math.max(0, Math.floor(Math.min(...todos) - 3)), yMax: Math.ceil(Math.max(...todos) + 3), height: 160 })}
          <div class="mt-1">${legendDot('#10b981', 'Masa magra')}${legendDot('#3b82f6', 'Músculo esquel.')}${legendDot('#f59e0b', 'Masa grasa')}</div>
          <div class="text-[10px] text-slate-500 mt-1">Fórmulas: Lee 2000 (SMM) · peso × (1 − %grasa) (magra). Estimaciones, no DEXA.</div>
        </div>`;
    }
  }

  // Tabla completa, de la más reciente a la más antigua, con delta contra la
  // medición previa (que es la lectura que de verdad usa el coach).
  const idxDesc = asc.map((_, i) => i).reverse();
  const filas = idxDesc.map(i => {
    const m = asc[i], c = comps[i];
    const p = i > 0 ? asc[i - 1] : null;
    const dp = p && m.peso != null && p.peso != null ? +(m.peso - p.peso).toFixed(1) : null;
    const dg = p && m.grasa_pct != null && p.grasa_pct != null ? +(m.grasa_pct - p.grasa_pct).toFixed(1) : null;
    return `
      <tr>
        <td class="whitespace-nowrap">${fmt.fechaCorta(m.fecha)}</td>
        <td class="whitespace-nowrap">${m.peso ?? '—'}${dp != null ? ` <span class="text-[10px]" style="color:${colD(dp)}">${dp > 0 ? '+' : ''}${dp}</span>` : ''}</td>
        <td class="whitespace-nowrap">${m.grasa_pct ?? '—'}${dg != null ? ` <span class="text-[10px]" style="color:${colD(dg)}">${dg > 0 ? '+' : ''}${dg}</span>` : ''}</td>
        <td>${c?.masa_magra_kg ?? '—'}</td>
        <td>${c?.masa_muscular_smm_kg ?? '—'}</td>
        <td>${c?.masa_grasa_kg ?? '—'}</td>
        <td>${m.cintura ?? '—'}</td>
        ${opts.editable ? `<td class="text-right"><button class="btn btn-ghost text-xs" onclick="eliminarMedicion('${m.id}', '${cliente.id}')" title="Eliminar medición">✕</button></td>` : ''}
      </tr>
      ${m.notas ? `<tr><td colspan="${opts.editable ? 8 : 7}" class="text-[11px] text-slate-500 pt-0">📝 ${textoExpandible(m.notas, 100)}</td></tr>` : ''}`;
  }).join('');

  return `
    ${resumen}
    ${graficas}
    <div class="overflow-x-auto" style="max-height:${opts.compacto ? '260px' : '420px'};overflow-y:auto">
      <table class="w-full text-sm">
        <thead><tr><th>Fecha</th><th>Peso</th><th>% grasa</th><th>Magra</th><th>SMM</th><th>Grasa kg</th><th>Cintura</th>${opts.editable ? '<th></th>' : ''}</tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
    <div class="text-[10px] text-slate-400 mt-1">Magra · SMM · Grasa kg son estimaciones a partir de peso, %grasa, edad, sexo y estatura.</div>`;
}

// =====================================================
// SEMANAS ANTERIORES · la visual completa dentro del modal de la semana
// =====================================================
// Antes tocaba salir del modal para recordar qué se registró la semana
// pasada (días cumplidos, qué se le pidió al cliente, qué quedó pendiente del
// coach). Ahora esa película va DENTRO de la edición: se decide qué poner en
// la semana nueva sin cerrar nada.
function semanaAnteriorCardHTML(cliente, s, coachPends = [], abierta = false) {
  const pctF = s.fuerza_planeados ? Math.round(((s.fuerza_ejecutados ?? 0) / s.fuerza_planeados) * 100) : null;
  const colorPct = (p) => p == null ? '#94a3b8' : p >= 90 ? '#059669' : p >= 60 ? '#d97706' : '#dc2626';
  const animos = { excelente: '🤩', bien: '😊', neutro: '😐', bajo: '😕', 'muy bajo': '😔' };
  const pendCliente = parseChecklist(s.pendientes_semana);
  const pendPendientes = pendCliente.filter(p => !p.done);
  const coachAbiertos = coachPends.filter(p => p.estado !== 'completado');
  const chip = (txt, color) => `<span class="tag" style="background:${color}18;color:${color};font-weight:700">${txt}</span>`;
  const metaAlim = cliente.meta_calorias;
  const dKcal = metaAlim && s.kcal_promedio != null ? s.kcal_promedio - metaAlim : null;

  return `
    <details class="bg-white rounded-xl ring-1 ring-slate-200 mb-2" ${abierta ? 'open' : ''}>
      <summary class="cursor-pointer px-3 py-2 flex items-center gap-2 flex-wrap">
        <span class="font-bold text-slate-800">${fmt.labelSemana(s.semana)}</span>
        <span class="text-xs text-slate-400">${fmt.fechaCorta(s.fecha)}</span>
        ${s.score_global != null ? chip(`${Math.round(s.score_global)}% global`, colorPct(s.score_global)) : ''}
        ${pctF != null ? chip(`💪 ${s.fuerza_ejecutados ?? 0}/${s.fuerza_planeados}`, colorPct(pctF)) : ''}
        ${s.dias_registro_alim != null ? chip(`📓 ${s.dias_registro_alim}/7 reg`, colorPct(Math.round((s.dias_registro_alim / 7) * 100))) : ''}
        ${s.estado_animo ? `<span class="text-xs text-slate-500">${animos[s.estado_animo] || ''} ${s.estado_animo}</span>` : ''}
        ${pendPendientes.length ? chip(`👥 ${pendPendientes.length} sin cumplir`, '#b45309') : ''}
        ${coachAbiertos.length ? chip(`🧢 ${coachAbiertos.length} tuyas abiertas`, '#047857') : ''}
      </summary>
      <div class="px-3 pb-3 space-y-2">

        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div class="bg-slate-50 rounded-lg p-2">
            <div class="text-slate-400">Fuerza</div>
            <div class="font-bold" style="color:${colorPct(pctF)}">${s.fuerza_planeados ? `${s.fuerza_ejecutados ?? 0}/${s.fuerza_planeados} · ${pctF}%` : '—'}</div>
          </div>
          <div class="bg-slate-50 rounded-lg p-2">
            <div class="text-slate-400">Complementaria</div>
            <div class="font-bold text-violet-600">${s.cardio_ejecutados ? `${s.cardio_ejecutados} día(s)` : '—'}</div>
          </div>
          <div class="bg-slate-50 rounded-lg p-2">
            <div class="text-slate-400">kcal promedio</div>
            <div class="font-bold text-blue-700">${s.kcal_promedio ?? '—'}${dKcal != null ? ` <span class="text-[10px]" style="color:${dKcal > 0 ? '#2563eb' : '#d97706'}">${dKcal > 0 ? '+' : ''}${dKcal} vs meta</span>` : ''}</div>
          </div>
          <div class="bg-slate-50 rounded-lg p-2">
            <div class="text-slate-400">Proteína prom.</div>
            <div class="font-bold text-blue-700">${s.proteina_promedio_g != null ? `${s.proteina_promedio_g} g` : '—'}${cliente.meta_proteina_g && s.proteina_promedio_g != null ? ` <span class="text-[10px] text-slate-400">/ ${cliente.meta_proteina_g}</span>` : ''}</div>
          </div>
        </div>

        ${s.avances ? `<div><div class="text-xs font-bold text-slate-500 uppercase mb-1">Avances</div><p class="text-sm text-slate-700 whitespace-pre-line">${textoExpandible(s.avances, 260)}</p></div>` : '<p class="text-xs text-slate-400 italic">Sin avances escritos</p>'}

        ${pendCliente.length ? `
          <div class="bg-amber-50 rounded-lg px-3 py-2">
            <div class="flex items-center justify-between gap-2 flex-wrap mb-1">
              <div class="text-xs font-bold text-amber-800">👥 Le pediste al cliente (${pendCliente.filter(p => p.done).length}/${pendCliente.length} cumplidos)</div>
              ${pendPendientes.length ? `<button type="button" class="btn btn-secondary btn-sm" onclick="traerPendientesPrevios('${s.semana}')" title="Copia a esta semana lo que quedó sin cumplir">↓ Traer ${pendPendientes.length} sin cumplir</button>` : ''}
            </div>
            <div class="space-y-0.5">${pendCliente.map(p => `<div class="text-xs ${p.done ? 'text-slate-400 line-through' : 'text-amber-900'}">${p.done ? '✓' : '○'} ${escapeHtml(p.texto)}</div>`).join('')}</div>
          </div>` : ''}

        ${coachPends.length ? `
          <div class="bg-emerald-50 rounded-lg px-3 py-2">
            <div class="text-xs font-bold text-emerald-800 mb-1">🧢 Tus tareas de esa semana (${coachPends.filter(p => p.estado === 'completado').length}/${coachPends.length} hechas)</div>
            <div class="space-y-0.5">${coachPends.map(p => `<div class="text-xs ${p.estado === 'completado' ? 'text-slate-400 line-through' : 'text-emerald-900'}">${p.estado === 'completado' ? '✓' : '○'} ${escapeHtml(p.descripcion)}</div>`).join('')}</div>
          </div>` : ''}

        ${s.lesion_actualizacion || s.lesion_estado_semana ? `<div class="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">🩹 Lesión: <strong>${escapeHtml(s.lesion_estado_semana || '')}</strong> ${escapeHtml(s.lesion_actualizacion || '')}</div>` : ''}
        ${s.notas ? `<div class="text-xs text-slate-500 whitespace-pre-line">📝 ${textoExpandible(s.notas, 160)}</div>` : ''}
      </div>
    </details>`;
}

function semanasAnterioresHTML(cliente, segs, coachPorSeg = {}, opts = {}) {
  const lista = (segs || []).slice(0, opts.max || 6);
  if (!lista.length) return '<p class="text-xs text-slate-500">Es la primera semana registrada de este cliente: no hay historial que revisar todavía.</p>';
  return lista.map((s, i) => semanaAnteriorCardHTML(cliente, s, coachPorSeg[s.id] || [], i === 0)).join('');
}

// Copia a la semana en edición los pendientes que el cliente NO cumplió en la
// semana elegida, sin duplicar los que ya estén escritos.
window.traerPendientesPrevios = (semana) => {
  const s = (window._segPrevios || []).find(x => x.semana === semana);
  const ta = $('#sg-pend');
  if (!s || !ta) return;
  const faltantes = parseChecklist(s.pendientes_semana).filter(p => !p.done);
  if (!faltantes.length) { toast('No quedó nada sin cumplir esa semana'); return; }
  const actuales = parseChecklist(ta.value);
  const yaEstan = new Set(actuales.map(p => p.texto.toLowerCase()));
  const nuevos = faltantes.filter(p => !yaEstan.has(p.texto.toLowerCase()));
  if (!nuevos.length) { toast('Ya están todos en esta semana'); return; }
  ta.value = serializeChecklist([...actuales, ...nuevos.map(p => ({ done: false, texto: p.texto }))]);
  renderPendEditPreview();
  toast(`↓ ${nuevos.length} pendiente(s) traído(s) de ${fmt.labelSemana(semana)}`);
};

// =====================================================
// MODAL: SEGUIMIENTO con panel contexto
// =====================================================
async function abrirModalSeguimiento(clienteId, semana, segExistente = null) {
  const [cliente, segsCliente, pendsCliente, medsCliente, metasCliente] = await Promise.all([
    db.clientes.get(clienteId),
    db.seguimientos.listCliente(clienteId),
    db.pendientes.listCliente(clienteId),
    db.mediciones.listCliente(clienteId),
    db.metas.listCliente(clienteId),
  ]);

  const semanaPrev = segsCliente.find(s => s.semana < semana);
  let s = segExistente || {};
  if (!segExistente) {
    const existing = await db.seguimientos.getByClienteSemana(clienteId, semana);
    if (existing) s = existing;
  }

  // Rango lunes-domingo de la semana + si es la semana en curso (no dejar ir al futuro)
  const [wkIni, wkFin] = semanaISOToRange(semana);
  const esSemanaActual = semana >= fmt.semanaISO();

  // Serie para la gráfica de tendencia de cumplimiento (últimas 8 semanas, cronológico)
  const chartSegs = segsCliente.slice().sort((a, b) => a.semana.localeCompare(b.semana)).slice(-8);
  const chartLabels = chartSegs.map(x => fmt.labelSemana(x.semana));
  const chartSerie = (key, color, label) => ({ label, color, points: chartSegs.map(x => x[key] != null ? x[key] : null) });
  const tendenciaChart = chartSegs.length >= 2
    ? lineChart([
        chartSerie('score_entreno', '#10b981', 'Entreno'),
        chartSerie('score_alim_metas', '#3b82f6', 'Alim · metas'),
        chartSerie('score_alim_registro', '#8b5cf6', 'Alim · registro'),
      ], chartLabels, { yMin: 0, yMax: 100, height: 150 })
    : '<p class="text-xs text-slate-400 text-center py-4">Necesitas 2+ semanas registradas para ver la tendencia.</p>';

  // Semanas ya registradas (sin contar la que se está editando) + las tareas
  // del coach que pertenecen a cada una: es la visual que antes obligaba a
  // salir del modal para consultarla.
  const previas = segsCliente.filter(x => x.semana < semana).sort((a, b) => b.semana.localeCompare(a.semana));
  const coachPorSegModal = {};
  for (const p of pendsCliente) {
    if (p.para !== 'coach' || !p.seguimiento_id) continue;
    (coachPorSegModal[p.seguimiento_id] ||= []).push(p);
  }
  window._segPrevios = previas;

  // Última medición corporal, solo para mostrarla (el registro vive en el perfil)
  const medsAscModal = (medsCliente || []).slice().sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
  const ultMedModal = medsAscModal.length ? medsAscModal[medsAscModal.length - 1] : null;
  const prevMedModal = medsAscModal.length >= 2 ? medsAscModal[medsAscModal.length - 2] : null;
  const deltaPesoModal = ultMedModal?.peso != null && prevMedModal?.peso != null
    ? +(ultMedModal.peso - prevMedModal.peso).toFixed(1) : null;

  const html = `
    <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
      <div class="flex items-center gap-3">
        ${helpers.avatar(cliente.nombre, 10)}
        <div>
          <h3 class="font-bold text-slate-900">${s.id ? 'Editar' : 'Nueva'} semana · ${escapeHtml(cliente.nombre)}</h3>
          <div class="flex items-center gap-1.5 mt-1">
            <button type="button" class="seg-wk-nav" title="Semana anterior" onclick="cambiarSemanaSeg('${clienteId}','${semana}',-1)">◀</button>
            <span class="text-xs font-semibold text-slate-600">${fmt.labelSemana(semana)} · ${fmt.fechaCorta(wkIni)}–${fmt.fechaCorta(wkFin)}</span>
            <button type="button" class="seg-wk-nav ${esSemanaActual ? 'seg-wk-nav-off' : ''}" title="${esSemanaActual ? 'No puedes registrar una semana futura' : 'Semana siguiente'}" ${esSemanaActual ? 'disabled' : ''} onclick="cambiarSemanaSeg('${clienteId}','${semana}',1)">▶</button>
            ${s.id ? '<span class="text-xs text-emerald-600 font-semibold ml-1">✎ ya registrada</span>' : ''}
          </div>
        </div>
      </div>
      <button class="btn btn-ghost" onclick="closeModal()">✕</button>
    </div>

    <div class="p-5 space-y-5">

      <!-- SCORES vivos · lo primero: la foto de adherencia de la semana -->
      <div>
        <div class="seg-section-title">📊 Scores de la semana</div>
        <div id="sg-scores" class="grid grid-cols-2 md:grid-cols-4 gap-2"></div>
      </div>

      <!-- CONTEXTO · la película 360, se lee de izquierda a derecha -->
      <div>
        <div class="seg-section-title">📖 Contexto · la película del cliente <span style="text-transform:none;letter-spacing:normal;font-weight:400;color:#94a3b8">(lee de izquierda a derecha)</span></div>
        <div class="ctx-strip">${ctxSeguimientoHTML(cliente, segsCliente.filter(x => x.id !== s.id), pendsCliente)}</div>
      </div>

      <!-- SEMANAS ANTERIORES · toda la visual sin salir de la edición -->
      <div>
        <div class="seg-section-title">🗓 Semanas anteriores <span style="text-transform:none;letter-spacing:normal;font-weight:400;color:#94a3b8">(consistencia, lo que le pediste, tus tareas y comentarios — abre la que necesites)</span></div>
        <div class="bg-slate-50 rounded-xl p-3">${semanasAnterioresHTML(cliente, previas, coachPorSegModal, { max: 6 })}</div>
      </div>

      <!-- HISTORIAL DE METAS Y DE CUERPO · trazabilidad a la mano -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <details class="bg-slate-50 rounded-xl p-3">
          <summary class="cursor-pointer text-xs font-bold text-slate-600 uppercase tracking-wider">🥗 Historial de meta nutricional y macros</summary>
          <div class="mt-3">${historialMetasHTML(cliente, metasCliente, { compacto: true, max: 8 })}</div>
        </details>
        <details class="bg-slate-50 rounded-xl p-3">
          <summary class="cursor-pointer text-xs font-bold text-slate-600 uppercase tracking-wider">📏 Historial de peso y composición corporal</summary>
          <div class="mt-3">${historialCorporalHTML(cliente, medsCliente, { compacto: true })}</div>
        </details>
      </div>

      <!-- REGISTRO · 3 pilares -->
      <div>
        <div class="seg-section-title">✍️ Registro de la semana</div>
        <div class="seg-pillars">

          <!-- PILAR ENTRENAMIENTO -->
          <div class="seg-pillar seg-pillar-ent">
            <div class="seg-pillar-title">🏋️ Entrenamiento</div>
            <div class="text-xs text-slate-500">${metaDiasEntreno(cliente)
              ? `Meta fuerza: <strong>${metaDiasEntreno(cliente)} días</strong>/sem${(cliente.dias_entreno || []).length ? ` (${cliente.dias_entreno.join(' · ')})` : ''}`
              : 'Sin meta de fuerza · defínela en la ficha'}</div>
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
              <label class="text-xs">Complementaria — días (0-7)${cliente.actividades_complementarias ? ` · <span style="text-transform:none;font-weight:400" class="text-slate-400">${escapeHtml(cliente.actividades_complementarias)}</span>` : ''}</label>
              <div class="flex items-center gap-2">
                <input id="sg-ce" type="number" min="0" max="7" class="w-16" value="${s.cardio_ejecutados ?? ''}" placeholder="0" onchange="recalcScores()">
                <span id="sg-c-pct" class="text-sm font-bold text-violet-600"></span>
              </div>
              <p class="text-xs text-slate-400 mt-1">Suma +2 pts/día al score, máx +10.</p>
            </div>
            ${cliente.lesion_actual ? `
            <div class="bg-white rounded-lg p-2 ring-1 ring-red-200">
              <div class="text-xs font-bold text-red-800 mb-1">🩹 Lesión: ${escapeHtml(cliente.lesion_actual)}</div>
              <div class="grid grid-cols-2 gap-2">
                <select id="sg-lesion-est" class="text-xs"><option value="">Estado…</option>${['mejor','igual','peor','resuelta'].map(o => `<option value="${o}" ${s.lesion_estado_semana === o ? 'selected' : ''}>${o}</option>`).join('')}</select>
                <input id="sg-lesion-txt" class="text-xs" value="${escapeHtml(s.lesion_actualizacion || '')}" placeholder="Evolución…">
              </div>
            </div>` : ''}
            <!-- Composición: SOLO lectura aquí. Se registra desde el perfil
                 del cliente, que es donde vive la calculadora de metas y
                 donde se decide si el peso nuevo cambia la meta. -->
            <div class="bg-white rounded-lg p-2 ring-1 ring-slate-200">
              <div class="text-xs font-semibold text-slate-600 mb-1">🧬 Composición corporal</div>
              ${ultMedModal ? `
                <div class="text-xs text-slate-700">
                  <strong>${ultMedModal.peso ?? '—'} kg</strong>${ultMedModal.grasa_pct ? ` · ${ultMedModal.grasa_pct}% grasa` : ''}${ultMedModal.cintura ? ` · ${ultMedModal.cintura} cm cintura` : ''}
                  <span class="text-slate-400">(${fmt.fechaCorta(ultMedModal.fecha)}${fmt.diasDesde(ultMedModal.fecha) != null ? ` · hace ${fmt.diasDesde(ultMedModal.fecha)}d` : ''})</span>
                </div>
                ${deltaPesoModal != null ? `<div class="text-xs mt-0.5" style="color:${deltaPesoModal > 0 ? '#2563eb' : deltaPesoModal < 0 ? '#d97706' : '#94a3b8'}">${deltaPesoModal > 0 ? '+' : ''}${deltaPesoModal} kg vs la medición anterior</div>` : ''}`
                : '<div class="text-xs text-slate-400">Sin mediciones registradas.</div>'}
              <p class="text-xs text-slate-400 mt-1">Se registra desde el perfil del cliente (✎ Editar → 📏 Agregar): allí se ve al instante si el peso nuevo cambia la meta y decides si la actualizas.</p>
            </div>
          </div>

          <!-- PILAR ALIMENTACIÓN -->
          <div class="seg-pillar seg-pillar-alim">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <div class="seg-pillar-title">🥗 Alimentación</div>
              ${mtConfigured() ? `<button type="button" class="btn btn-secondary btn-sm" onclick="jalarMealtrackerAuto('${cliente.id}', '${semana}')">🔄 ${cliente.mealtracker_id ? 'Actualizar' : 'Buscar'} MT</button>` : ''}
            </div>
            <div class="text-xs ${cliente.meta_calorias ? 'text-slate-500' : 'text-amber-600'}">${cliente.meta_calorias ? `Meta: ${cliente.meta_calorias} kcal · ${cliente.meta_proteina_g}g prote` : 'Sin meta definida'}</div>
            <div>
              <label class="text-xs">kcal promedio</label>
              <input id="sg-kcal" type="number" min="0" value="${s.kcal_promedio ?? ''}" placeholder="${cliente.meta_calorias || '—'}" onchange="recalcScores()">
            </div>
            <div>
              <label class="text-xs">Proteína promedio (g)</label>
              <input id="sg-prote" type="number" min="0" value="${s.proteina_promedio_g ?? ''}" placeholder="${cliente.meta_proteina_g || '—'}" onchange="recalcScores()">
            </div>
            <div>
              <label class="text-xs">Días con registro (0-7)</label>
              <input id="sg-dr" type="number" min="0" max="7" value="${s.dias_registro_alim ?? ''}" placeholder="0" onchange="recalcScores()">
            </div>
            <div id="sg-mt-info" class="text-xs text-slate-500 hidden"></div>
          </div>

          <!-- PILAR GENERAL -->
          <div class="seg-pillar seg-pillar-gen">
            <div class="seg-pillar-title">📋 General</div>
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-xs mb-0">Avances</label>
                <div class="flex gap-1">
                  ${semanaPrev ? '<button type="button" class="btn btn-sm" style="background:#e2e8f0;color:#334155;padding:.15rem .5rem" onclick="copiarSemanaAnterior()" title="Copiar de la semana pasada">↻</button>' : ''}
                  <button type="button" class="btn btn-sm" style="background:#d1fae5;color:#065f46;padding:.15rem .5rem" onclick="aplicarPlantilla('alta')" title="Plantilla adherencia alta">A</button>
                  <button type="button" class="btn btn-sm" style="background:#fef3c7;color:#92400e;padding:.15rem .5rem" onclick="aplicarPlantilla('media')" title="Plantilla media">M</button>
                  <button type="button" class="btn btn-sm" style="background:#fee2e2;color:#991b1b;padding:.15rem .5rem" onclick="aplicarPlantilla('baja')" title="Plantilla baja">B</button>
                </div>
              </div>
              <textarea id="sg-avances" rows="4" placeholder="Qué pasó esta semana…">${escapeHtml(s.avances || '')}</textarea>
            </div>
            <div class="bg-amber-50 border border-amber-200 rounded-lg p-2">
              <div class="text-xs font-bold text-amber-800 mb-1">👥 Le pides al cliente</div>
              <div id="sg-pend-check" class="space-y-1 mb-1"></div>
              <div class="flex gap-1">
                <input id="sg-pend-nuevo" class="text-xs" placeholder="Ej: enviar video…" onkeydown="if(event.key==='Enter'){event.preventDefault();agregarPendClienteSeg();}">
                <button type="button" class="btn btn-secondary btn-sm flex-shrink-0" onclick="agregarPendClienteSeg()">+</button>
              </div>
              <textarea id="sg-pend" class="hidden">${escapeHtml(s.pendientes_semana || '')}</textarea>
            </div>
            <div class="bg-emerald-50 border border-emerald-200 rounded-lg p-2">
              <div class="text-xs font-bold text-emerald-800 mb-1">🧢 Tus tareas (coach)</div>
              <div id="sg-coach-list" class="space-y-1 mb-1"></div>
              <div class="flex gap-1">
                <input id="sg-coach-nuevo" class="text-xs" placeholder="Ej: preparar rutina…" onkeydown="if(event.key==='Enter'){event.preventDefault();agregarPendCoachSeg();}">
                <button type="button" class="btn btn-secondary btn-sm flex-shrink-0" onclick="agregarPendCoachSeg()">+</button>
              </div>
            </div>
            <div class="bg-sky-50 border border-sky-200 rounded-lg p-2">
              <div class="text-xs font-bold text-sky-800 mb-1 flex items-center gap-1 flex-wrap" title="El cliente los ve en su app (Herramientas → Mis recordatorios) con anuncio en su chat. Cuando lo marque cumplido, aquí aparece el ✓.">📲 Recordatorios en su app <span id="sg-mt-device" class="font-normal"></span></div>
              <div id="sg-mt-rem-list" class="space-y-1 mb-1"></div>
              <div class="flex gap-1">
                <input id="sg-mt-rem-nuevo" class="text-xs" placeholder="Ej: usar el mealtracker a diario…" onkeydown="if(event.key==='Enter'){event.preventDefault();agregarReminderMT();}">
                <button type="button" class="btn btn-secondary btn-sm flex-shrink-0" onclick="agregarReminderMT()">+</button>
              </div>
            </div>
            <div>
              <label class="text-xs">Notas</label>
              <textarea id="sg-notas" rows="2" placeholder="Otras observaciones…">${escapeHtml(s.notas || '')}</textarea>
            </div>
            <div>
              <label class="text-xs">Fecha del registro</label>
              <input id="sg-fecha" type="date" value="${s.fecha || fmt.hoy()}">
            </div>
          </div>
        </div>
      </div>

      <!-- TENDENCIA de cumplimiento · al final, como cierre de contexto -->
      <div>
        <div class="seg-section-title flex items-center justify-between">
          <span>📈 Tendencia de cumplimiento</span>
          <span class="flex" style="text-transform:none;letter-spacing:normal">${legendDot('#10b981', 'Entreno')}${legendDot('#3b82f6', 'Alim · metas')}${legendDot('#8b5cf6', 'Alim · registro')}</span>
        </div>
        <div class="bg-slate-50 rounded-xl p-3">${tendenciaChart}</div>
      </div>
    </div>

    <div class="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-between gap-2 sticky bottom-0 flex-wrap">
      <div>${s.id ? `<button class="btn btn-danger" onclick="eliminarSeguimiento('${s.id}', '${clienteId}')">Eliminar</button>` : ''}</div>
      <div class="flex gap-2 flex-wrap">
        <button class="btn btn-secondary" onclick="enviarPushManual('${clienteId}')" title="Escribe un mensaje y le llega al teléfono como notificación push (si tiene los recordatorios activados en su app)">📲 Push al teléfono</button>
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
  // Recordatorios visibles en la app del cliente (async, no bloquea el modal)
  cargarRemindersMT(cliente);

  // Auto-resolver y jalar del Mealtracker si aún no hay data
  if (mtConfigured() && !s.kcal_promedio && !s.proteina_promedio_g) {
    setTimeout(async () => {
      const mtId = await resolverMealtrackerId(cliente);
      if (mtId) {
        // Actualizar el objeto cliente en memoria por si volvemos a abrir
        cliente.mealtracker_id = mtId;
        window._segCliente = cliente;
        window.jalarMealtracker(cliente, semana);
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
    estado_animo: $('#sg-animo')?.value || null,
    notas: $('#sg-notas').value || null,
    lesion_estado_semana: $('#sg-lesion-est')?.value || null,
    lesion_actualizacion: $('#sg-lesion-txt')?.value || null,
    estado: 'hecho',
  };
  await db.seguimientos.upsert(row);
  // Las mediciones corporales ya NO se cargan desde aquí: se registran en el
  // perfil del cliente, donde el peso nuevo se ve contra la calculadora de
  // metas y el coach decide si actualiza la meta y la envía al Mealtracker.
  toast('Semana guardada');
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
  await window.jalarMealtracker(window._segCliente || cliente, semana);
};

// Tarjeta visual del resumen semanal del Mealtracker: días registrados,
// kcal y proteína promedio vs meta, con barras y color por adherencia.
function mtInfoCard(r, cliente) {
  const g = r.goals || {};
  const metaK = cliente?.meta_calorias || Number(g.kcal ?? g.calories) || null;
  const metaP = cliente?.meta_proteina_g || Number(g.p ?? g.protein) || null;
  const regPct = Math.round((r.dias / 7) * 100);
  const regColor = r.dias >= 6 ? '#10b981' : r.dias >= 4 ? '#f59e0b' : '#ef4444';
  const kcalPct = metaK ? Math.max(0, Math.round(100 - Math.abs((r.kcal_avg - metaK) / metaK * 100))) : null;
  const protePct = metaP ? Math.min(100, Math.round((r.prote_avg / metaP) * 100)) : null;
  const cK = kcalPct == null ? '#94a3b8' : kcalPct >= 85 ? '#10b981' : kcalPct >= 65 ? '#f59e0b' : '#ef4444';
  const cP = protePct == null ? '#94a3b8' : protePct >= 90 ? '#10b981' : protePct >= 70 ? '#f59e0b' : '#ef4444';
  const bar = (label, valTxt, pct, color) => `
    <div>
      <div class="flex justify-between text-xs mb-0.5"><span class="text-slate-500">${label}</span><span class="font-bold" style="color:${color}">${valTxt}</span></div>
      <div class="h-1.5 bg-slate-200 rounded-full overflow-hidden"><div class="h-full rounded-full" style="width:${pct == null ? 0 : pct}%;background:${color}"></div></div>
    </div>`;
  return `
    <div class="bg-white rounded-lg p-2.5 ring-1 ring-slate-200 space-y-2 mt-1">
      <div class="flex items-center justify-between">
        <span class="text-xs font-bold text-slate-700">📊 Mealtracker · ${r.dias}/7 días</span>
        <span class="text-xs" style="color:${regColor};font-weight:700">${regPct}% registro</span>
      </div>
      <div class="h-1.5 bg-slate-200 rounded-full overflow-hidden"><div class="h-full rounded-full" style="width:${regPct}%;background:${regColor}"></div></div>
      ${bar('kcal promedio', `${r.kcal_avg}${metaK ? ` / ${metaK}` : ''}`, kcalPct, cK)}
      ${bar('Proteína promedio', `${r.prote_avg}g${metaP ? ` / ${metaP}g` : ''}`, protePct, cP)}
      ${(r.carbos_avg != null || r.grasas_avg != null) ? `<div class="text-xs text-slate-400">Carbos ${r.carbos_avg ?? '—'}g · Grasas ${r.grasas_avg ?? '—'}g promedio</div>` : ''}
      <div class="text-xs text-slate-400">${r.rango[0].slice(5)} → ${r.rango[1].slice(5)} · valores aplicados a los campos de arriba</div>
    </div>`;
}

// Recibe el CLIENTE (no un id): fusiona sus cuentas duplicadas del Mealtracker.
window.jalarMealtracker = async (cliente, semana) => {
  const info = $('#sg-mt-info');
  if (info) { info.classList.remove('hidden'); info.textContent = '⏳ Consultando mealtracker…'; }
  const r = await getMealtrackerWeek(cliente, semana);
  if (!r) {
    if (info) {
      info.innerHTML = '<span class="text-red-600">✗ Sin conexión al Mealtracker, averiguando la causa…</span>';
      const causa = await mtDiagnostico(cliente?.mealtracker_id);
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
  if (info) info.innerHTML = mtInfoCard(r, cliente);
};

window.abrirNutricionCliente = async (clienteId) => {
  const c = await db.clientes.get(clienteId);
  if (!c) { toast('Cliente no encontrado'); return; }
  const mtId = c.mealtracker_id || await resolverMealtrackerId(c);
  if (!mtId) { toast('Sin conexión a Mealtracker'); return; }

  const d = await getMealtrackerDataMerged(c);   // fusiona cuentas duplicadas
  if (!d) { toast('Sin datos en Mealtracker'); return; }

  const goals = d.goals || {};
  const history = d.history || {};

  const hoy = new Date();
  const ultimas4Sem = [];
  for (let i = 0; i < 4; i++) {
    const ref = new Date(hoy); ref.setDate(hoy.getDate() - i * 7);
    const sem = fmt.semanaISO(ref);
    const r = await getMealtrackerWeek(c, sem);
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
  if (!mtId) {
    // Sin match automático: en vez de un callejón sin salida, se abre el
    // selector de vinculación manual con las cuentas ordenadas por parecido.
    toast('⚠️ No lo encontré por nombre — elige su cuenta para vincularlo.');
    vincularMealtrackerMenu(clienteId);
    return;
  }

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
    `El cliente recibirá un ANUNCIO en el chat de su app avisando la meta nueva. ¿Confirmas el cambio?`
  );
  if (!okConfirm) return;

  const r = await setMealtrackerGoals(mtId, meta);
  if (r.ok) {
    // Registrar QUÉ se envió y cuándo: queda en la ficha (columna
    // meta_enviada_mt) y visible en la sección 5, para saber siempre cuál
    // fue la última meta que el cliente efectivamente recibió en su app.
    const registro = { kcal: meta.kcal, p: meta.p, c: meta.c, g: meta.g, at: new Date().toISOString() };
    const { error: eReg } = await sb.from('clientes').update({ meta_enviada_mt: registro }).eq('id', clienteId);
    // Y queda también en el historial de metas: así la trazabilidad muestra
    // no solo qué se calculó, sino qué recibió de verdad el cliente en su app.
    await registrarMetaHistorial(clienteId, {
      kcal: meta.kcal,
      proteina_g: meta.p ?? null,
      carbos_g: meta.c ?? null,
      grasas_g: meta.g ?? null,
      metodo: cliente.meta_metodo || null,
      origen: 'envio_mt',
      nota: 'Cargada en la app del cliente',
    }, { enviada_mt: true });
    // Si la columna aún no existe (falta migración), el envío igual fue OK.
    const info = $('#mt-enviada-info');
    if (info && !eReg) {
      info.classList.remove('text-slate-400');
      info.classList.add('text-violet-700');
      info.innerHTML = `📤 Último envío al Mealtracker: <strong>${registro.kcal} kcal</strong> · P${registro.p} C${registro.c} G${registro.g} · ahora mismo`;
    }
    toast(`✓ Enviado al Mealtracker de ${cliente.nombre}: ${meta.kcal} kcal · P${meta.p} C${meta.c} G${meta.g} — le llegará el anuncio en su app${eReg ? ' (corre la migración de schema.sql para que quede registrado en la ficha)' : ''}`, 5000);
  } else toast(`✗ ${r.causa}`);
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
    if (p && (p.pagado || Number(p.monto) === 0)) return false; // pagado o mes sin cobro
    return true;
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
        <button class="btn btn-secondary btn-sm" onclick="enviarRecordatoriosPago()" title="Envía un push de recordatorio de pago a TODOS los clientes en deuda (con push activo). Te muestra la lista antes de enviar.">🔔 Recordatorio de pago</button>
        <button class="btn btn-ghost btn-sm" onclick="verHistorialPago()" title="Ver a quiénes y qué día se enviaron recordatorios de pago">🗒️ Historial</button>
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
  const diaHoy = new Date().getDate();
  $('#pagos-content').innerHTML = `
    <div class="card overflow-hidden p-0">
      <div class="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-wrap gap-2">
        <h3 class="font-semibold text-slate-900">Tabla anual · ${_pagosYear}</h3>
        <div class="flex gap-2 text-xs">
          <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-emerald-100"></span><span class="text-slate-500">Pagado</span></span>
          <span class="flex items-center gap-1.5" title="Aún no llega su día de pago (o es hoy)"><span class="w-3 h-3 rounded bg-amber-100"></span><span class="text-slate-500">Pendiente (no llega su día)</span></span>
          <span class="flex items-center gap-1.5" title="Pasó su día de pago sin registrar el pago (desde el día siguiente), o es un mes anterior sin pago"><span class="w-3 h-3 rounded bg-red-100"></span><span class="text-slate-500">Vencido (pasó su día)</span></span>
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
                  let cls, val, titleExtra = '';
                  if (p && p.pagado) {
                    cls = 'pay-paid';
                    val = fmtVal(p.monto);
                    totalFila += copConv(p.monto, p.moneda);
                  } else if (c.estado === 'pausa') {
                    // Cliente en pausa: rayita neutra salvo que el mes esté
                    // pagado (arriba). Nada de amarillos/rojos que ensucien.
                    cls = 'pay-future';
                    val = '—';
                    titleExtra = ' · en pausa, sin cobro';
                  } else if (p && Number(p.monto) === 0) {
                    // Monto 0 manual = mes sin cobro (premio del reto,
                    // cortesía…): neutro, no cuenta por cobrar, y al cliente
                    // no le sale el recordatorio en su Mealtracker.
                    cls = 'pay-future';
                    val = '0';
                    titleExtra = ' · mes sin cobro (monto 0)';
                  } else if (p && Number(p.monto) > 0) {
                    // Vencido = mes anterior sin pago, O mes en curso cuyo día
                    // de pago YA pasó (desde el día siguiente; el mismo día
                    // aún cuenta como pendiente). Antes el mes en curso nunca
                    // se marcaba vencido aunque la fecha hubiera pasado —
                    // misma convención que las cards y que el recordatorio
                    // que le llega al cliente en su Mealtracker.
                    const vencido = monthNum < mesActualNum ||
                      (monthNum === mesActualNum && c.dia_pago && diaHoy > c.dia_pago);
                    cls = vencido ? 'pay-overdue' : 'pay-pending';
                    val = fmtVal(p.monto);
                    // Solo sumar pendientes al total anual si el cliente está activo
                    if (c.estado === 'activo') totalFila += copConv(p.monto, p.moneda);
                  } else if (monthNum < mesActualNum) {
                    cls = 'pay-overdue';
                    val = '—';
                  } else if (monthNum === mesActualNum) {
                    // Sin registro de pago este mes: misma regla de vencimiento
                    cls = (c.dia_pago && diaHoy > c.dia_pago) ? 'pay-overdue' : 'pay-pending';
                    val = Number(c.monto) > 0 ? fmtVal(c.monto) : '—';
                  } else {
                    cls = 'pay-future';
                    val = '—';
                  }
                  return `<td class="pay-cell ${cls}" onclick="abrirPago('${c.id}', '${m}')" title="${fmt.mesEsLargo(m)}${titleExtra}">${val}</td>`;
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
        Convención: una celda del mes en curso pasa de <strong>Pendiente</strong> a <strong>Vencido</strong> al día siguiente del día de pago del cliente — el mismo día en que le empieza a salir el recordatorio en su Mealtracker.
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
    } else if (p && Number(p.monto) === 0) {
      banner = 'bg-slate-50'; labelClass = 'text-slate-500';
      label = '🎁 Mes sin cobro'; estado = 'free';
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
          <div class="h-1.5 ${estado === 'paid' ? 'bg-emerald-500' : estado === 'overdue' ? 'bg-red-500' : estado === 'free' ? 'bg-slate-300' : 'bg-amber-500'}"></div>
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
            ${(estado === 'paid' || estado === 'free')
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
      <p class="text-xs text-slate-500">Si guardas sin marcar pagado, queda como pendiente del mes (amarillo) y pasa a vencido al día siguiente de su día de pago. <strong>Monto 0 = mes sin cobro</strong> (🎁 premio del reto, cortesía, pausa): no suma por cobrar, no vence, y al cliente NO le sale el recordatorio en su Mealtracker.</p>
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

  // Pagos vencidos (día de pago pasado + días de gracia, sin pago marcado).
  // Misma convención de todo el CRM: vencido desde el día SIGUIENTE al de pago.
  activos.forEach(c => {
    if (!c.dia_pago || c.dia_pago >= diaHoy) return;
    const p = pagosMes.find(pp => pp.cliente_id === c.id);
    if (p && (p.pagado || Number(p.monto) === 0)) return; // pagado o mes sin cobro
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
// Misma estrategia anti-parpadeo que Seguimiento: con caché se pinta al
// instante y la data fresca re-pinta solo si algo cambió.
let _cliDataCache = null;
// =====================================================
// 📲 APP EN PANTALLA DE INICIO — listado global (vista Clientes)
// La app del cliente marca data.pwa_installed_at la primera vez que se abre
// instalada (Agregar a inicio); aquí se cruza esa señal con los clientes del
// CRM para ver de un vistazo quién ya la tiene y a quién recordárselo.
// =====================================================
let _pwaInstallCache = null; // { rows, at } — caché corto para no re-pedir en cada re-render

async function fetchInstalacionesMT() {
  if (_pwaInstallCache && Date.now() - _pwaInstallCache.at < 60000) return _pwaInstallCache.rows;
  let filas = null;
  // Modo seguro (API de coach): action=list ya incluye pwa_installed_at/push_enabled_at
  if (mtApiBase()) {
    const res = await mtApiGet('/api/coach-data?action=list');
    if (res && Array.isArray(res.clients)) {
      filas = res.clients.map(c => ({ name: c.name, pwa: c.pwa_installed_at || null, push: c.push_enabled_at || null }));
    }
  }
  // Modo directo (anon key)
  if (!filas) {
    const mt = mtClient();
    if (mt) {
      const { data } = await mt.from('user_data').select('name,pwa:data->pwa_installed_at,push:data->push_enabled_at');
      if (Array.isArray(data)) filas = data.map(r => ({ name: r.name, pwa: r.pwa || null, push: r.push || null }));
    }
  }
  if (!filas) return null;
  // Un cliente puede tener varias sesiones/dispositivos con el mismo nombre:
  // basta con que UNA haya marcado la instalación. Se conserva la fecha más antigua.
  const porNombre = new Map();
  for (const f of filas) {
    const n = normalizeName(f.name || '');
    if (!n) continue;
    const prev = porNombre.get(n);
    if (!prev) { porNombre.set(n, { pwa: f.pwa, push: f.push }); continue; }
    if (f.pwa && (!prev.pwa || String(f.pwa) < String(prev.pwa))) prev.pwa = f.pwa;
    if (f.push && (!prev.push || String(f.push) < String(prev.push))) prev.push = f.push;
  }
  _pwaInstallCache = { rows: porNombre, at: Date.now() };
  return porNombre;
}

async function cargarPanelInstalaciones(clientes) {
  const el = $('#cli-pwa-panel');
  if (!el) return;
  if (!mtConfigured()) {
    el.innerHTML = '<div class="text-xs text-amber-600">Configura la conexión al Mealtracker en Ajustes para ver quién tiene la app instalada.</div>';
    return;
  }
  const mapa = await fetchInstalacionesMT();
  const el2 = $('#cli-pwa-panel'); // la vista pudo re-renderizarse mientras cargaba
  if (!el2) return;
  if (!mapa) {
    el2.innerHTML = '<div class="text-xs text-amber-600">No se pudo consultar el Mealtracker (revisa la conexión en Ajustes).</div>';
    return;
  }
  const conApp = [], sinApp = [];
  for (const c of clientes) {
    const d = mapa.get(normalizeName(c.nombre || ''));
    if (d && d.pwa) conApp.push({ c, pwa: d.pwa, push: d.push });
    else sinApp.push(c);
  }
  conApp.sort((a, b) => String(b.pwa).localeCompare(String(a.pwa)));
  el2.innerHTML = `
    <div class="text-xs text-slate-500 mb-2">${conApp.length} de ${clientes.length} clientes ya abrieron la app desde su pantalla de inicio.</div>
    ${conApp.length ? `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
      ${conApp.map(({ c, pwa, push }) => `
        <div class="flex items-center gap-2 text-xs bg-emerald-50/60 border border-emerald-100 rounded-lg px-2 py-1.5 cursor-pointer" onclick="verCliente('${c.id}')" title="Abrió la app instalada por primera vez el ${fmt.fecha(String(pwa).slice(0, 10))}">
          <span class="flex-1 min-w-0 font-medium text-slate-700 truncate">📲 ${escapeHtml(c.nombre)}${c.estado !== 'activo' ? ` <span class="text-slate-400 font-normal">(${c.estado})</span>` : ''}</span>
          <span class="text-slate-400 flex-shrink-0">${fmt.fechaCorta(String(pwa).slice(0, 10))}</span>
          ${push ? '<span class="flex-shrink-0" title="También tiene los recordatorios push activados">🔔</span>' : '<span class="flex-shrink-0 opacity-40" title="Aún sin activar los recordatorios push">🔕</span>'}
        </div>`).join('')}
    </div>` : '<div class="text-xs text-slate-400">Ningún cliente ha abierto la app desde la pantalla de inicio todavía.</div>'}
    ${sinApp.length ? `<div class="text-xs text-slate-400 mt-2"><span class="font-semibold text-slate-500">Sin instalar aún:</span> ${sinApp.map(c => escapeHtml(c.nombre)).join(' · ')}</div>` : ''}
  `;
}

routes.clientes = async () => {
  const renderClientes = (clientes, allSegs) => {
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

    <div class="card mb-5">
      <div class="font-bold text-slate-900 text-sm mb-2" title="La app del cliente lo reporta sola la primera vez que la abre instalada (Agregar a pantalla de inicio)">📲 App en pantalla de inicio</div>
      <div id="cli-pwa-panel" class="text-xs text-slate-400">Cargando…</div>
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
              ${(() => {
                const j = (c.journey && typeof c.journey === 'object') ? c.journey : {};
                const n = JOURNEY_STEPS.filter(s => j[s.id]).length;
                const tot = JOURNEY_STEPS.length;
                return `<div class="flex justify-between" title="Journey del cliente — abre la ficha para ver el detalle"><span class="text-slate-500">Journey</span><span class="font-medium ${n === tot ? 'text-emerald-600' : n >= tot / 2 ? 'text-amber-600' : 'text-slate-500'}">🚀 ${n}/${tot}</span></div>`;
              })()}
              <div class="flex justify-between" data-caps-cell="${c.id}" title="Cápsulas informativas abiertas — abre la ficha para ver cuáles"></div>
            </div>
            ${(c.tags && c.tags.length) ? `<div class="mt-3 pt-3 border-t border-slate-100">${c.tags.map(t => `<span class="tag-pill">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
          </div>
        `;
      }).join('')}
      ${clientes.length === 0 ? '<div class="col-span-3 card text-center text-slate-500 py-10">Aún no hay clientes. <button class="text-emerald-600 font-semibold" onclick="nuevoCliente()">+ Crear el primero</button></div>' : ''}
    </div>
  `;
  cargarPanelInstalaciones(clientes);
  pintarCapsulasEnCards(clientes);
  };

  if (_cliDataCache) {
    renderClientes(_cliDataCache.clientes, _cliDataCache.allSegs);
  } else {
    view.innerHTML = '<div class="card">Cargando…</div>';
  }
  const [clientes, allSegs] = await Promise.all([db.clientes.list(), db.seguimientos.listAll()]);
  const firma = JSON.stringify([clientes, allSegs]);
  const igual = _cliDataCache && _cliDataCache.firma === firma;
  _cliDataCache = { clientes, allSegs, firma };
  if (!igual) renderClientes(clientes, allSegs);
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
          <div><label>Fecha de nacimiento</label><input id="cl-nac" type="date" value="${c.fecha_nacimiento || ''}" onchange="actualizarCalcVivo()"></div>
          <div><label>Sexo</label>
            <select id="cl-sexo" onchange="actualizarCalcVivo()">
              <option value="">—</option>
              ${['M','F','otro'].map(o => `<option ${c.sexo === o ? 'selected' : ''}>${o}</option>`).join('')}
            </select>
          </div>
          <div><label>Correo</label><input id="cl-email" type="email" placeholder="cliente@correo.com" value="${escapeHtml(c.email || '')}"></div>
          <div><label>Teléfono / WhatsApp</label><input id="cl-tel" placeholder="+57 300 000 0000" value="${escapeHtml(c.telefono || '')}"></div>
          <div><label>Ciudad</label><input id="cl-ciudad" value="${escapeHtml(c.ciudad || '')}"></div>
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
        </div>
      </div>

      <!-- 3. COMPOSICIÓN CORPORAL -->
      <div class="sec sec-blue">
        <div class="sec-title">3 · 🧬 Composición corporal</div>
        <div class="grid grid-cols-2 gap-3">
          <div><label>Estatura (cm)</label><input id="cl-alt" type="number" min="120" max="230" value="${c.estatura_cm || ''}" oninput="actualizarCalcVivo()"></div>
        </div>
        <p class="text-xs text-slate-500 mt-2">📏 Las mediciones (peso, %grasa) se registran desde el perfil del cliente o desde el seguimiento semanal. Las demás variables (masa muscular, agua corporal, masa ósea) se estiman automáticamente.</p>
      </div>

      <!-- 4. NIVEL DE ACTIVIDAD -->
      <div class="sec sec-teal">
        <div class="sec-title">4 · 🏃 Nivel de actividad</div>
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2">
            <label>Nivel de actividad (factor PAL)</label>
            <div class="flex items-center gap-2">
              <select id="cl-nivel-sel" class="flex-1" onchange="actualizarCalcVivo()">
                <option value="">—</option>
                ${Object.entries(PAL_MAP).map(([k, v]) => `<option value="${k}" ${c.nivel_actividad === k ? 'selected' : ''}>${k.replace('_', ' ')} · PAL ${v}</option>`).join('')}
              </select>
              <button type="button" class="btn btn-secondary btn-sm whitespace-nowrap" onclick="abrirEncuestaActividad()" title="5 preguntas rápidas que estiman el nivel por ti">📋 Estimarlo con encuesta</button>
            </div>
            <p class="text-xs text-slate-500 mt-1">Elígelo directo si ya lo conoces, o usa la encuesta (fuerza, cardio, trabajo, pasos, deporte) para estimarlo. Factores PAL de FAO/OMS: 1.2 sedentario → 1.9 muy activo.</p>
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
          <div><label>Peso actual (kg)</label>
            <input id="cl-peso-calc" type="number" step="0.1" min="30" max="250" oninput="actualizarCalcVivo()">
            <p class="text-xs text-slate-500 mt-1">Se precarga de la última medición; edítalo si cambió</p>
          </div>
          <div><label>% grasa corporal (opcional)</label>
            <input id="cl-grasa-corp-calc" type="number" step="0.1" min="3" max="60" oninput="actualizarCalcVivo()">
            <p class="text-xs text-slate-500 mt-1">Con él uso Katch-McArdle (más preciso); sin él, Mifflin-St Jeor</p>
          </div>
          <div id="calc-ultima-med" class="col-span-2 text-xs text-slate-500"></div>
          <div class="col-span-2 bg-white rounded-xl px-3 py-2 ring-1 ring-slate-100">
            ${tablaGrasaHtml()}
          </div>
          <div><label>Objetivo calórico</label>
            <select id="cl-objk" onchange="actualizarCalcVivo()">
              <option value="">—</option>
              ${OBJETIVOS_KCAL.map(o => `<option value="${o.key}" ${c.objetivo_calorico === o.key ? 'selected' : ''}>${o.label}</option>`).join('')}
            </select>
            <p class="text-xs text-slate-500 mt-1">Elígelo VIENDO el TDEE del panel de abajo — cada % se aplica sobre ese gasto</p>
          </div>
          <div><label>Proteína (g/kg de peso)</label>
            <input id="cl-prote-gkg" type="number" step="0.1" min="1" max="3.5" value="${c.proteina_g_kg ?? 1.8}" oninput="actualizarCalcVivo()">
            <p class="text-xs text-slate-500 mt-1">Déficit 2.0-2.7 · recomp 1.8-2.2 · superávit 1.6-2.2</p>
          </div>
          <div><label>Grasas (% de las kcal)</label>
            <input id="cl-grasa-pct" type="number" step="1" min="15" max="40" value="${c.grasa_pct_kcal ?? 25}" oninput="actualizarCalcVivo()">
            <p class="text-xs text-slate-500 mt-1">AMDR 20-35% · típico 25% · piso 0.5 g/kg</p>
          </div>
          <div class="flex items-end pb-1">
            <p class="text-xs text-slate-500">El carbohidrato no se configura: es el <strong>resto</strong> de las kcal tras proteína y grasa (es el combustible flexible del entreno).</p>
          </div>
          <div id="calc-live" class="col-span-2 bg-white rounded-xl p-3 ring-1 ring-emerald-200"></div>
          <details class="col-span-2 bg-emerald-50/60 rounded-xl px-3 py-2 ring-1 ring-emerald-100">
            <summary class="text-xs font-bold text-emerald-800 cursor-pointer">📚 Guía de rangos por objetivo (respaldo científico)</summary>
            <div class="mt-2 space-y-3 text-xs">
              ${[['Proteína (g por kg de peso corporal)', GUIA_MACROS.proteina], ['Grasa (% de las kcal)', GUIA_MACROS.grasa], ['Carbohidrato (referencia, no se configura)', GUIA_MACROS.carbo]].map(([titulo, filas]) => `
                <div>
                  <div class="font-bold text-slate-700 mb-1">${titulo}</div>
                  <table class="w-full">
                    ${filas.map(([caso, rango, nota]) => `<tr class="border-b border-emerald-100/70"><td class="py-1 pr-2 text-slate-600">${caso}</td><td class="py-1 pr-2 font-semibold text-emerald-800 whitespace-nowrap">${rango}</td><td class="py-1 text-slate-500">${nota}</td></tr>`).join('')}
                  </table>
                </div>`).join('')}
              <div class="font-bold text-slate-700 mt-2 mb-1">🎚️ ¿Cómo elegir DENTRO del rango? (no siempre el tope)</div>
              <div class="space-y-1 text-slate-600">
                <p><strong>Proteína en déficit:</strong> parte de 2.0-2.2 g/kg y súbela hacia 2.4-2.7 solo si el cliente es MAGRO (más riesgo de perder músculo), el déficit es agresivo (-20% o más), tiene mucha hambre (la proteína sacia) o es 40+. Bájala a 1.8-2.0 si su %grasa es ALTO (H >25% · M >32%): en sobrepeso, dosificar 2.7 sobre el peso total sobredosifica — la necesidad la marca la masa magra, no la grasa.</p>
                <p><strong>Grasa:</strong> 20-25% cuando entrena mucho volumen (libera kcal para carbo) o prefiere platos voluminosos; 28-35% si la comida baja en grasa no lo sacia, por preferencia cultural o señales hormonales. Nunca bajo 0.5 g/kg.</p>
                <p><strong>Carbo (se valida, no se elige):</strong> mira su g/kg en el panel en vivo contra su entreno — 3-5 g/kg moderado, 5-7 g/kg volumen alto. Si queda corto para lo que entrena: baja el % de grasa, modera la proteína o suaviza el déficit.</p>
                <p class="text-slate-500">Regla general: el rango existe para ajustarse al CLIENTE (composición, hambre, adherencia, volumen de entreno) — no para usar siempre el máximo.</p>
              </div>
              <p class="text-slate-500 mt-2">La proteína se dosifica por kg (depende de la masa corporal); la grasa por % de kcal (depende de la energía total); el cliente siempre la ve en gramos. Referencias completas en el recuadro "Bases científicas" de abajo.</p>
            </div>
          </details>
          <div class="col-span-2 bg-white rounded-xl px-3 py-2.5 ring-1 ring-emerald-100">
            <div class="text-xs font-bold text-emerald-800 mb-2">🔬 Bases científicas del cálculo — siempre a la vista</div>
            <div class="space-y-2">
              ${FORMULAS_META.map(([nombre, explicacion, formula]) => `
                <div class="text-xs border-b border-emerald-50 pb-2">
                  <div class="font-bold text-slate-700">${nombre}</div>
                  <div class="text-slate-600 mt-0.5">${explicacion}</div>
                  <div class="font-mono text-[11px] text-emerald-700 mt-0.5 bg-emerald-50/70 rounded px-1.5 py-0.5 inline-block">${formula}</div>
                </div>`).join('')}
            </div>
            <details class="mt-2">
              <summary class="text-xs text-emerald-700 cursor-pointer font-semibold">📖 Referencias bibliográficas completas (${BIBLIOGRAFIA_META.length})</summary>
              <ol class="mt-1.5 space-y-1 list-decimal list-inside">
                ${BIBLIOGRAFIA_META.map(ref => `<li class="text-[11px] text-slate-500">${ref}</li>`).join('')}
              </ol>
            </details>
          </div>
          <div class="col-span-2 bg-white rounded-xl p-3 ring-1 ring-emerald-100">
            <div class="flex items-baseline justify-between mb-2 flex-wrap gap-1">
              <div class="text-xs font-bold text-slate-600 uppercase">Meta nutricional diaria</div>
              <div class="flex gap-1.5">
                <button type="button" class="btn btn-primary btn-sm" onclick="recalcularMeta()" title="Toma lo que muestra el panel en vivo y lo deja listo para Guardar">📌 Fijar esta meta</button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="enviarMetaMealtrackerForm()" title="Cambia la meta en la app Mealtracker del cliente (pide confirmación)">🎯 Enviar al Mealtracker</button>
              </div>
            </div>
            <div id="meta-preview" class="text-sm">
              ${c.meta_calorias ? `
                <div class="font-bold text-emerald-700 text-base">${c.meta_calorias} kcal · ${c.meta_proteina_g}g prote · ${c.meta_grasas_g}g grasas · ${c.meta_carbos_g}g carbos</div>
                <div class="text-xs text-slate-500 mt-1">${c.meta_metodo || ''} · Recalculada ${c.meta_calculada_en ? new Date(c.meta_calculada_en).toLocaleDateString('es-CO') : ''}</div>
                ${c.meta_argumento ? `<details class="mt-2"><summary class="text-xs text-emerald-700 cursor-pointer">Ver argumento del cálculo</summary><pre class="text-xs text-slate-600 mt-1 whitespace-pre-wrap">${escapeHtml(c.meta_argumento)}</pre></details>` : ''}
              ` : '<div class="text-xs text-slate-500">Sin meta fijada. Ajusta las perillas viendo el panel en vivo de arriba y dale "📌 Fijar esta meta".</div>'}
            </div>
            <div id="mt-enviada-info" class="text-xs mt-2 pt-2 border-t border-emerald-50 ${c.meta_enviada_mt?.kcal ? 'text-violet-700' : 'text-slate-400'}">
              ${c.meta_enviada_mt?.kcal
                ? `📤 Último envío al Mealtracker: <strong>${c.meta_enviada_mt.kcal} kcal</strong> · P${c.meta_enviada_mt.p} C${c.meta_enviada_mt.c} G${c.meta_enviada_mt.g} · ${c.meta_enviada_mt.at ? new Date(c.meta_enviada_mt.at).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}`
                : '📤 Aún no has enviado ninguna meta al Mealtracker de este cliente.'}
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
  window._pendingMetaCtx = null;
  openModal(modalShell('Nuevo cliente', clienteForm(), `
    <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="guardarCliente()">Guardar</button>
  `), { wide: true });
  actualizarCalcVivo();
};

window.editarCliente = async (id) => {
  const c = await db.clientes.get(id);
  window._editingClienteId = id;
  window._pendingEncuesta = c.nivel_actividad ? { nivel: c.nivel_actividad, pal: c.pal_factor || PAL_MAP[c.nivel_actividad], respuestas: c.nivel_actividad_encuesta } : null;
  window._pendingMeta = null;
  window._pendingMetaCtx = null;
  openModal(modalShell(`Editar · ${escapeHtml(c.nombre)}`, clienteForm(c), `
    <button class="btn btn-danger mr-auto" onclick="eliminarCliente('${id}')">Eliminar</button>
    <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="guardarCliente('${id}')">Guardar</button>
  `), { wide: true });
  // Meta guardada actual: referencia para comparar "lo que había" vs. "lo
  // nuevo que voy ajustando" (el panel en vivo muestra el delta contra esta).
  window._metaGuardada = c.meta_calorias ? {
    kcal: c.meta_calorias, p: c.meta_proteina_g, ca: c.meta_carbos_g, g: c.meta_grasas_g,
    en: c.meta_calculada_en,
  } : null;
  actualizarCalcVivo();
  // Precargar peso y %grasa desde la última medición (editables): así el
  // panel en vivo arranca con datos reales sin escribir nada. El recuadro
  // #calc-ultima-med SIEMPRE dice algo: la última medición si existe, o un
  // aviso claro de que no hay — antes quedaba vacío y parecía que faltaba.
  const info = $('#calc-ultima-med');
  try {
    const meds = await db.mediciones.listCliente(id);
    const ult = meds[meds.length - 1];
    if (ult) {
      const pe = $('#cl-peso-calc');
      if (pe && !pe.value && ult.peso) pe.value = ult.peso;
      const gr = $('#cl-grasa-corp-calc');
      if (gr && !gr.value && ult.grasa_pct) gr.value = ult.grasa_pct;
      if (info) {
        const partes = [];
        if (ult.peso) partes.push(`<strong>${ult.peso} kg</strong>`);
        if (ult.grasa_pct) partes.push(`<strong>${ult.grasa_pct}%</strong> grasa`);
        if (ult.cintura) partes.push(`${ult.cintura} cm cintura`);
        info.innerHTML = `📏 Última medición registrada: ${partes.join(' · ')}${ult.fecha ? ` · ${fmt.fechaCorta(ult.fecha)}` : ''} — los campos de arriba arrancan con estos valores.`;
      }
    } else if (info) {
      info.innerHTML = `📏 <span class="text-amber-700">Este cliente aún no tiene mediciones registradas</span> — escribe peso y %grasa a mano (se usan solo para el cálculo; la medición formal se registra desde el seguimiento semanal o el perfil).`;
    }
  } catch (e) {
    if (info) info.innerHTML = '📏 No pude leer las mediciones ahora; escribe peso y %grasa a mano.';
  }
  actualizarCalcVivo();
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
    objetivo: [...$$('#cl-obj-tags input:checked').map(i => i.value), $('#cl-obj-otro').value.trim()].filter(Boolean).join(', ') || null,
    meta_especifica: $('#cl-meta').value.trim() || null,
    lugar_entreno: $('#cl-lugar').value || null,
    dias_entreno_cantidad: $('#cl-dias-ent').value ? Number($('#cl-dias-ent').value) : null,
    dias_entreno: $$('#cl-dias-sem input:checked').map(i => i.value),
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
    grasa_pct_kcal: $('#cl-grasa-pct')?.value ? Number($('#cl-grasa-pct').value) : null,
    // Nivel de actividad: manda lo elegido en el select (manual o puesto por
    // la encuesta). Las respuestas de la encuesta solo se guardan si el nivel
    // seleccionado sigue siendo el que la encuesta arrojó.
    ...(($('#cl-nivel-sel')?.value) ? {
      nivel_actividad: $('#cl-nivel-sel').value,
      // Siempre el PAL canónico del nivel (FAO/OMS)
      pal_factor: PAL_MAP[$('#cl-nivel-sel').value] || null,
      ...(window._pendingEncuesta && window._pendingEncuesta.nivel === $('#cl-nivel-sel').value
        ? { nivel_actividad_encuesta: window._pendingEncuesta.respuestas } : {}),
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
  const pendingMeta = window._pendingMeta;
  const pendingCtx = window._pendingMetaCtx || {};
  const r = await guardarClienteSeguro(id, row);
  if (!r.ok) return;
  // Trazabilidad: cada meta que se fija deja su punto en el historial, con el
  // peso y el objetivo con que se calculó.
  if (pendingMeta && r.id) {
    await registrarMetaHistorial(r.id, {
      kcal: pendingMeta.meta_calorias,
      proteina_g: pendingMeta.meta_proteina_g,
      carbos_g: pendingMeta.meta_carbos_g,
      grasas_g: pendingMeta.meta_grasas_g,
      metodo: pendingMeta.meta_metodo || null,
      argumento: pendingMeta.meta_argumento || null,
      origen: 'calculo',
      ...pendingCtx,
    });
  }
  window._pendingEncuesta = null;
  window._pendingMeta = null;
  window._pendingMetaCtx = null;
  closeModal();
  toast(r.sinColumnas ? '⚠️ Guardado, pero sin los campos nuevos: corre la migración de schema.sql en Supabase' : 'Guardado');
  navigate('clientes');
};

// Guarda un cliente tolerando que la BD aún no tenga las columnas nuevas
// (email/telefono): si Supabase las rechaza, reintenta sin ellas y avisa.
const COLS_NUEVAS_CLIENTE = ['email', 'telefono', 'suplementos', 'actividades_complementarias', 'grasa_pct_kcal'];
async function guardarClienteSeguro(id, row) {
  // Devuelve el id (el que venía, o el que asigna Supabase al insertar) para
  // poder colgar el punto del historial de metas del cliente recién creado.
  const q = (r) => id
    ? sb.from('clientes').update(r).eq('id', id).select('id').maybeSingle()
    : sb.from('clientes').insert(r).select('id').single();
  let { data, error } = await q(row);
  let sinColumnas = false;
  if (error && COLS_NUEVAS_CLIENTE.some(col => (error.message || '').includes(`'${col}'`))) {
    sinColumnas = true;
    const r2 = { ...row };
    COLS_NUEVAS_CLIENTE.forEach(col => delete r2[col]);
    ({ data, error } = Object.keys(r2).length ? await q(r2) : { data: null, error: null });
  }
  if (error) { toast(error.message); return { ok: false, sinColumnas }; }
  _clientesCache = null;
  return { ok: true, sinColumnas, id: id || data?.id || null };
}

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
  ciudad: 'cl-ciudad', estatura_cm: 'cl-alt',
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
  el.innerHTML = `<strong>Resultado:</strong> nivel <strong>${r.nivel.replace('_',' ')}</strong> · PAL <strong>${r.pal}</strong>${r.desglose ? `<br><span class="text-[11px] text-emerald-700">${r.desglose}</span>` : ` · puntaje ${r.total}`}. Click "Aplicar" para guardarlo en la ficha.`;
  el.insertAdjacentHTML('afterend', `<div class="flex justify-end mt-3"><button class="btn btn-primary" onclick="aplicarEncuesta()">Aplicar</button></div>`);
};

window.aplicarEncuesta = () => {
  // Volver al modal del cliente con el nivel puesto (y lo tecleado intacto)
  restaurarModalCliente();
  if (window._pendingEncuesta) {
    const el = $('#cl-nivel-sel');
    if (el) el.value = window._pendingEncuesta.nivel;
  }
  actualizarCalcVivo();
  toast('Nivel de actividad aplicado');
};

window.cerrarEncuesta = () => {
  restaurarModalCliente();
  actualizarCalcVivo();
};

// ===== Calculadora de meta EN VIVO =====
// Lee del formulario todo lo que alimenta el cálculo. El peso y el %grasa
// viven en campos visibles de la sección 5 (precargados de la última
// medición): el coach ve y controla TODAS las variables, nada de prompts.
function leerInputsCalc() {
  const peso = Number($('#cl-peso-calc')?.value);
  const estatura = Number($('#cl-alt')?.value);
  const fnac = $('#cl-nac')?.value;
  const sexo = $('#cl-sexo')?.value;
  const nivel = $('#cl-nivel-sel')?.value;
  const grasaRaw = $('#cl-grasa-corp-calc')?.value;
  const faltan = [];
  if (!peso) faltan.push('peso');
  if (!estatura) faltan.push('estatura (sección 3)');
  if (!fnac) faltan.push('fecha de nacimiento (sección 1)');
  if (!sexo) faltan.push('sexo (sección 1)');
  if (!nivel) faltan.push('nivel de actividad (sección 4)');
  return {
    faltan, peso, estatura, sexo,
    edad: fnac ? helpers.edadDe(fnac) : null,
    grasa: grasaRaw ? Number(grasaRaw) : null,
    // PAL: siempre el factor canónico de la bibliografía para el nivel
    // (la encuesta refinada solo mejora la CLASIFICACIÓN del nivel).
    pal: nivel ? PAL_MAP[nivel] : null,
    objetivoK: $('#cl-objk')?.value || '',
    gkg: $('#cl-prote-gkg')?.value,
    fatPct: $('#cl-grasa-pct')?.value,
  };
}

// Panel 360 en tiempo real: BMR y TDEE apenas hay datos (ANTES de elegir el
// % de objetivo, para elegirlo con criterio), y al mover cualquier perilla
// (objetivo, g/kg de proteína, % de grasa, peso…) se ve al instante cómo
// queda la meta, cómo se reparte (barra + tabla g · % · g/kg), el ritmo
// esperado en kg/semana y los avisos de seguridad. Nada se guarda hasta
// "Fijar esta meta" + Guardar.
window.actualizarCalcVivo = () => {
  const el = $('#calc-live');
  if (!el) return;
  const i = leerInputsCalc();
  if (i.faltan.length) {
    el.innerHTML = `<div class="text-xs text-slate-500">🧮 <strong>Cálculo en vivo:</strong> faltan datos → <strong class="text-amber-700">${i.faltan.join(' · ')}</strong>. Al completarlos verás aquí BMR, TDEE y la meta al instante.</div>`;
    return;
  }
  const base = calcMetaNutricional({
    peso: i.peso, altura: i.estatura, edad: i.edad, sexo: i.sexo, grasa_pct: i.grasa,
    pal: i.pal, objetivo_pct: 0, proteina_g_kg: i.gkg, grasa_pct_kcal: i.fatPct,
  });
  if (!base) { el.innerHTML = '<div class="text-xs text-slate-500">Datos insuficientes.</div>'; return; }

  // El gasto SIEMPRE visible: es la referencia para elegir el % con criterio
  const gastoHtml = `
    <div class="flex items-baseline gap-3 flex-wrap">
      <span class="text-xs font-bold text-slate-600 uppercase">🧮 En vivo</span>
      <span class="text-sm"><span class="text-slate-500">BMR</span> <strong>${base.bmr}</strong></span>
      <span class="text-sm"><span class="text-slate-500">TDEE (mantenimiento)</span> <strong class="text-emerald-700">${base.tdee} kcal</strong></span>
      <span class="text-xs text-slate-400">${base.metodo} · PAL ${i.pal}</span>
    </div>`;

  const objData = OBJETIVOS_KCAL.find(o => o.key === i.objetivoK);
  if (!objData) {
    el.innerHTML = gastoHtml + `<div class="text-xs text-slate-500 mt-2">Ese TDEE es tu referencia: elige ahora el <strong>objetivo calórico</strong> arriba y verás aquí la meta resultante, el reparto de macros y el ritmo esperado.</div>`;
    return;
  }

  const meta = calcMetaNutricional({
    peso: i.peso, altura: i.estatura, edad: i.edad, sexo: i.sexo, grasa_pct: i.grasa,
    pal: i.pal, objetivo_pct: objData.pct, proteina_g_kg: i.gkg, grasa_pct_kcal: i.fatPct,
  });
  const d = meta.detalle;
  const rd = meta.redondeo;
  const barSeg = (pct, color) => `<div style="width:${pct}%; background:${color};" class="h-full"></div>`;
  const fila = (nombre, dd, redond, color) => `
    <tr class="border-b border-slate-100">
      <td class="py-0.5 pr-2 font-semibold" style="color:${color}">${nombre}</td>
      <td class="py-0.5 pr-2 text-right text-slate-400">${dd.g} g</td>
      <td class="py-0.5 pr-2 font-bold text-right">${redond} g</td>
      <td class="py-0.5 pr-2 text-right text-slate-500">${dd.pct}%</td>
      <td class="py-0.5 text-right text-slate-500">${dd.gkg} g/kg</td>
    </tr>`;
  el.innerHTML = `
    ${gastoHtml}
    <div class="mt-2 flex items-baseline gap-3 flex-wrap">
      <span class="text-lg font-bold text-emerald-700">Meta: ${rd.kcal} kcal</span>
      <span class="text-xs text-slate-400">(exacta: ${meta.kcal})</span>
      <span class="text-xs text-slate-500">= TDEE ${objData.pct >= 0 ? '+' : ''}${Math.round(objData.pct * 100)}% (${meta.kcal - meta.tdee >= 0 ? '+' : ''}${meta.kcal - meta.tdee} kcal/día)</span>
      <span class="text-xs font-semibold ${meta.cambioSemanalKg <= 0 ? 'text-blue-700' : 'text-orange-700'}">ritmo ≈ ${meta.cambioSemanalKg > 0 ? '+' : ''}${meta.cambioSemanalKg} kg/semana</span>
      ${window._metaGuardada?.kcal ? `<span class="text-xs text-violet-700 bg-violet-50 rounded px-1.5 py-0.5">vs guardada (${window._metaGuardada.kcal} kcal): ${rd.kcal - window._metaGuardada.kcal >= 0 ? '+' : ''}${rd.kcal - window._metaGuardada.kcal} kcal</span>` : ''}
    </div>
    <div class="flex h-2.5 rounded-full overflow-hidden mt-2 mb-1" title="Reparto de las kcal: proteína / carbos / grasas">
      ${barSeg(d.proteina.pct, '#2563eb')}${barSeg(d.carbos.pct, '#d97706')}${barSeg(d.grasas.pct, '#dc2626')}
    </div>
    <table class="w-full text-sm">
      <tr class="text-[10px] uppercase text-slate-400"><td></td><td class="text-right pr-2">Exacto</td><td class="text-right pr-2">Cliente ve</td><td class="text-right pr-2">% kcal</td><td class="text-right">g/kg</td></tr>
      ${fila('Proteína', d.proteina, rd.proteina, '#2563eb')}
      ${fila('Carbos', d.carbos, rd.carbos, '#d97706')}
      ${fila('Grasas', d.grasas, rd.grasas, '#dc2626')}
    </table>
    <div class="text-[10px] text-slate-400 mt-0.5">"Cliente ve" = redondeo direccional (kcal a 50: ↓ en déficit / ↑ en superávit · proteína a 5 ↑ · grasa a 5 ↓ · carbo = resto): es lo que se fija y se envía. La precisión decimal es falsa: fórmula ±10%, etiquetado ±20%, registro ±10-20%.</div>
    <div class="text-[11px] text-emerald-800 bg-emerald-50/70 rounded-lg px-2 py-1 mt-1">💬 Para comunicárselo como rango (más honesto y mejor adherencia): <strong>${rd.kcal - 50}–${rd.kcal + 50} kcal · mínimo ${rd.proteina} g de proteína</strong> · carbos ~${rd.carbos} g · grasas ~${rd.grasas} g</div>
    ${meta.avisos.map(a => `<div class="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1 mt-1">⚠️ ${escapeHtml(a)}</div>`).join('')}
    <div class="text-[11px] text-slate-400 mt-2">Juega con objetivo, proteína y grasa viendo cómo cambia todo. Cuando te convenza: "📌 Fijar esta meta" y luego Guardar.</div>
  `;
};

// ===== Fijar la meta calculada (la deja lista para Guardar) =====
window.recalcularMeta = async () => {
  const i = leerInputsCalc();
  if (i.faltan.length) { toast(`Faltan datos: ${i.faltan.join(', ')}`); return; }
  if (!i.objetivoK) { toast('Falta el objetivo calórico (elígelo viendo el TDEE del panel en vivo)'); return; }
  const objData = OBJETIVOS_KCAL.find(o => o.key === i.objetivoK);

  const meta = calcMetaNutricional({
    peso: i.peso, altura: i.estatura, edad: i.edad, sexo: i.sexo, grasa_pct: i.grasa,
    pal: i.pal, objetivo_pct: objData.pct,
    proteina_g_kg: i.gkg,
    grasa_pct_kcal: i.fatPct,
  });
  if (!meta) { toast('Datos insuficientes'); return; }

  // Se fija la versión REDONDEADA (kcal a 50, macros a 5 g): es la que ve el
  // cliente y la que viaja al Mealtracker. La exacta queda en el argumento.
  window._pendingMeta = {
    meta_calorias: meta.redondeo.kcal,
    meta_proteina_g: meta.redondeo.proteina,
    meta_grasas_g: meta.redondeo.grasas,
    meta_carbos_g: meta.redondeo.carbos,
    meta_metodo: meta.metodo,
    meta_argumento: meta.argumento,
    meta_calculada_en: new Date().toISOString(),
  };
  // Contexto del cálculo: NO va en la fila del cliente (rompería el update
  // con columnas que no existen), va al historial de metas para poder
  // releer meses después con qué peso y qué objetivo se fijó esta meta.
  window._pendingMetaCtx = {
    peso_kg: i.peso || null,
    grasa_pct: i.grasa ?? null,
    objetivo: objData.label,
    objetivo_pct: objData.pct,
    proteina_g_kg: i.gkg ? Number(i.gkg) : null,
    grasa_pct_kcal: meta.grasa_pct_kcal ?? null,
    pal: i.pal || null,
    bmr: meta.bmr,
    tdee: meta.tdee,
    cambio_semanal_kg: meta.cambioSemanalKg,
  };

  // Meta específica (sección 2): se toma del cálculo, editable a mano después.
  // Si el coach escribió algo propio (no empieza con "#### kcal"), se conserva y
  // la línea calculada se agrega al final.
  const cm = $('#cl-meta');
  if (cm) {
    const linea = `${meta.redondeo.kcal} kcal: ${meta.redondeo.proteina}P / ${meta.redondeo.carbos}C / ${meta.redondeo.grasas}G (${meta.detalle.proteina.pct}% / ${meta.detalle.carbos.pct}% / ${meta.detalle.grasas.pct}%)`;
    const actual = cm.value.trim();
    if (!actual || /^\d{3,4}\s*\.?\s*kcal/i.test(actual)) cm.value = linea;
    else cm.value = actual.split('\n').filter(l => !/^\d{3,4}\s*\.?\s*kcal/i.test(l.trim())).join('\n').trim() + '\n' + linea;
  }

  const filaMacro = (nombre, d, redond, color) => `
    <tr class="border-b border-slate-100">
      <td class="py-1 pr-2 font-semibold" style="color:${color}">${nombre}</td>
      <td class="py-1 pr-2 text-right text-slate-400">${d.g} g</td>
      <td class="py-1 pr-2 font-bold text-right">${redond} g</td>
      <td class="py-1 pr-2 text-right text-slate-500">${d.pct}% kcal</td>
      <td class="py-1 text-right text-slate-500">${d.gkg} g/kg</td>
    </tr>`;
  $('#meta-preview').innerHTML = `
    ${window._metaGuardada?.kcal ? `
      <div class="text-xs text-slate-500 bg-slate-50 rounded-lg px-2 py-1 mb-2">
        📋 Anterior (guardada${window._metaGuardada.en ? ` ${new Date(window._metaGuardada.en).toLocaleDateString('es-CO')}` : ''}): ${window._metaGuardada.kcal} kcal · P${window._metaGuardada.p} C${window._metaGuardada.ca} G${window._metaGuardada.g}
        <span class="text-violet-700 font-semibold">→ Nueva: ${meta.redondeo.kcal} kcal (${meta.redondeo.kcal - window._metaGuardada.kcal >= 0 ? '+' : ''}${meta.redondeo.kcal - window._metaGuardada.kcal})</span>
      </div>` : ''}
    <div class="font-bold text-emerald-700 text-base">${meta.redondeo.kcal} kcal / día <span class="text-xs font-normal text-slate-400">(exacta: ${meta.kcal})</span></div>
    <div class="text-xs text-slate-500 mb-2">BMR ${meta.bmr} · TDEE ${meta.tdee} (${meta.metodo}) · ritmo esperado ${meta.cambioSemanalKg > 0 ? '+' : ''}${meta.cambioSemanalKg} kg/semana</div>
    <table class="w-full text-sm mb-1">
      <tr class="text-[10px] uppercase text-slate-400"><td></td><td class="text-right pr-2">Exacto</td><td class="text-right pr-2">Cliente ve</td><td class="text-right pr-2">% kcal</td><td class="text-right">g/kg</td></tr>
      ${filaMacro('Proteína', meta.detalle.proteina, meta.redondeo.proteina, '#2563eb')}
      ${filaMacro('Carbos', meta.detalle.carbos, meta.redondeo.carbos, '#d97706')}
      ${filaMacro('Grasas', meta.detalle.grasas, meta.redondeo.grasas, '#dc2626')}
    </table>
    ${meta.avisos.map(a => `<div class="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1 mt-1">⚠️ ${escapeHtml(a)}</div>`).join('')}
    <details class="mt-2"><summary class="text-xs text-emerald-700 cursor-pointer">Ver argumento del cálculo (métodos y fuentes)</summary><pre class="text-xs text-slate-600 mt-1 whitespace-pre-wrap">${escapeHtml(meta.argumento)}</pre></details>
    <p class="text-xs text-amber-700 mt-2">⚠️ Aún no guardada. Click en "Guardar" abajo para persistir, y luego "🎯 Enviar al Mealtracker" si quieres cargarla al cliente.</p>
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
  navigate('clientes');
};

window.verCliente = async (id) => {
  const [c, segs, pends, pagos, meds, metas] = await Promise.all([
    db.clientes.get(id),
    db.seguimientos.listCliente(id),
    db.pendientes.listCliente(id),
    sb.from('pagos').select('*').eq('cliente_id', id).order('mes', { ascending: false }),
    db.mediciones.listCliente(id),
    db.metas.listCliente(id),
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

  // Composición corporal: última medición + estimaciones. Las gráficas y la
  // tabla completa del historial las arma historialCorporalHTML (compartido
  // con la vista de Seguimiento y con el modal de la semana).
  const medsAsc = meds.slice().sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
  const ultMed = medsAsc.length ? medsAsc[medsAsc.length - 1] : null;
  const comp = ultMed ? calcComposicionCorporal({
    peso: ultMed.peso,
    grasa_pct: ultMed.grasa_pct,
    edad,
    sexo: c.sexo,
    altura_cm: c.estatura_cm,
  }) : null;

  // El quick view se llena async cuando el modal ya está en el DOM
  setTimeout(() => quickAdherencia3Sem(c, 'quick3-modal', segs), 60);
  // Journey: pinta lo guardado ya, y los pasos auto se completan async
  _journeyCtx = { id: c.id, journey: (c.journey && typeof c.journey === 'object') ? { ...c.journey } : {} };
  setTimeout(() => { renderJourneyList(); autollenarJourney(c, segs, meds); cargarPanelCentro(c); }, 80);
  openModal(modalShell(escapeHtml(c.nombre), `
    <div class="space-y-4">
      <div class="flex gap-2 flex-wrap">
        <button class="btn btn-secondary btn-sm" onclick="editarCliente('${c.id}')">✎ Editar</button>
        <button class="btn btn-secondary btn-sm" onclick="abrirNuevoSeguimiento('${c.id}')">+ Nueva semana</button>
        <button class="btn btn-secondary btn-sm" onclick="nuevoPendiente('${c.id}')">+ Pendiente</button>
        <button class="btn btn-secondary btn-sm" onclick="nuevaMedicion('${c.id}')">+ Medición corporal</button>
        <button class="btn btn-secondary btn-sm" onclick="enviarPushManual('${c.id}')">📲 Push al teléfono</button>
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

      <!-- Adherencia rápida · últimas 3 semanas (entreno + alimentación) -->
      <div class="sec sec-slate">
        <div class="sec-title">⚡ Adherencia rápida · últimas 3 semanas</div>
        <div id="quick3-modal"><div class="text-xs text-slate-400">Cargando…</div></div>
      </div>

      <!-- Journey del cliente: del onboarding a la rutina. Lo automático se
           llena solo (mediciones, seguimientos, señales de su app); el resto
           lo marca el coach. -->
      <div class="sec sec-violet">
        <div class="sec-title flex items-center justify-between">🚀 Journey del cliente <span id="journey-prog" class="tag flex-shrink-0">…</span></div>
        <div id="journey-list" class="space-y-0.5"><div class="text-xs text-slate-400">Cargando…</div></div>
      </div>

      <!-- Centro de recursos: qué material ha consumido, pieza por pieza.
           Se llena solo con lo que registra el propio centro. -->
      <div class="sec sec-blue">
        <div class="sec-title">📚 Centro de recursos · qué ha visto</div>
        <div id="centro-panel"><div class="text-xs text-slate-400">Consultando el centro…</div></div>
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
          ${c.objetivo ? `<div class="text-slate-800">${textoExpandible(c.objetivo, 140)}</div>` : ''}
          ${c.meta_especifica ? `<div class="text-slate-600 text-xs mt-1">${textoExpandible(c.meta_especifica, 140)}</div>` : ''}
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
          ${campoColapsable('Patologías', c.patologias, 'text-red-700')}
          ${campoColapsable('Restricciones', c.restricciones_lesiones, 'text-red-700')}
          ${campoColapsable('Lesión actual', c.lesion_actual, 'text-red-700', c.lesion_estado ? ` (${c.lesion_estado.replace('_', ' ')})` : '')}
          ${c.suplementos ? campoColapsable('💊 Suplementos', c.suplementos, 'text-slate-700') : '<div class="text-slate-400 text-xs mt-1">💊 Sin suplementos registrados</div>'}
        </div>` : ''}

      <!-- 7. ANTECEDENTES DEPORTIVOS -->
      ${c.antecedentes_deportivos ? `
        <div class="sec sec-slate">
          <div class="sec-title">7 · 🏅 Antecedentes deportivos</div>
          ${campoColapsable('Historial', c.antecedentes_deportivos)}
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
          ${c.meta_enviada_mt?.kcal ? `<div class="text-xs text-violet-700 mt-1">📤 Último envío al Mealtracker: <strong>${c.meta_enviada_mt.kcal} kcal</strong> · P${c.meta_enviada_mt.p} C${c.meta_enviada_mt.c} G${c.meta_enviada_mt.g} · ${c.meta_enviada_mt.at ? new Date(c.meta_enviada_mt.at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) : ''}</div>` : ''}
          ${c.meta_argumento ? `<details class="mt-2"><summary class="text-xs text-blue-700 cursor-pointer">Ver argumento del cálculo</summary><pre class="text-xs text-slate-600 mt-1 whitespace-pre-wrap">${escapeHtml(c.meta_argumento)}</pre></details>` : ''}
          <div class="flex gap-2 flex-wrap mt-2">
            ${mtConfigured() ? `<button class="btn btn-primary btn-sm" onclick="enviarMetaMealtracker('${c.id}')" title="Cambia la meta en la app Mealtracker del cliente (pide confirmación)">🎯 Enviar meta al Mealtracker</button>` : ''}
            ${mtConfigured() ? `<button class="btn btn-secondary btn-sm" onclick="verNutricionCliente('${c.id}')" title="Semana completa: gráficas, alimentos y oportunidades de mejora">🥗 Ver su alimentación de la semana</button>` : ''}
            ${c.mealtracker_id ? `<button class="text-xs text-blue-700 font-semibold hover:underline" onclick="abrirNutricionCliente('${c.id}')">📊 Resumen rápido</button>` : ''}
          </div>
          <details class="mt-3 bg-white/70 rounded-lg p-2" open>
            <summary class="text-xs text-blue-700 font-semibold cursor-pointer">📜 Historial de metas y macros cargadas · trazabilidad</summary>
            <div class="mt-2">${historialMetasHTML(c, metas, { max: 12 })}</div>
          </details>
        </div>` : `
        <div class="sec sec-blue">
          <div class="sec-title">5 · 🥗 Meta nutricional diaria</div>
          <p class="text-xs text-slate-500">Sin meta definida. Calcúlala en "✎ Editar" (sección 5) y desde ahí queda el historial.</p>
          ${(metas || []).length ? `<details class="mt-2 bg-white/70 rounded-lg p-2"><summary class="text-xs text-blue-700 font-semibold cursor-pointer">📜 Metas anteriores</summary><div class="mt-2">${historialMetasHTML(c, metas, { max: 12 })}</div></details>` : ''}
        </div>`}

      <div class="sec sec-teal">
        <div class="flex items-baseline justify-between mb-2">
          <div class="sec-title" style="margin-bottom:0">📏 Historial de peso y composición corporal (${meds.length})</div>
          <button class="text-xs text-teal-700 font-semibold hover:underline" onclick="nuevaMedicion('${c.id}')">+ Agregar</button>
        </div>
        ${historialCorporalHTML(c, meds, { editable: true })}
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
// Registrar peso/%grasa es el momento en que la meta puede quedar vieja: el
// gasto se calcula sobre el peso. Por eso el modal recalcula la meta EN VIVO
// con los mismos ajustes del cliente (objetivo, g/kg de proteína, % de grasa)
// y muestra el delta contra la meta guardada — el coach decide si la actualiza
// y si la manda al Mealtracker. Nada se cambia sin que él lo pida.
function metaSugeridaDesdeMedicion(c, peso, grasaPct) {
  const objData = OBJETIVOS_KCAL.find(o => o.key === c.objetivo_calorico);
  const faltan = [];
  if (!peso) faltan.push('peso');
  if (!c.estatura_cm) faltan.push('estatura');
  if (!c.fecha_nacimiento) faltan.push('fecha de nacimiento');
  if (!c.sexo) faltan.push('sexo');
  if (!c.pal_factor && !c.nivel_actividad) faltan.push('nivel de actividad');
  if (!objData) faltan.push('objetivo calórico');
  if (faltan.length) return { faltan };
  const meta = calcMetaNutricional({
    peso,
    altura: c.estatura_cm,
    edad: helpers.edadDe(c.fecha_nacimiento),
    sexo: c.sexo,
    grasa_pct: grasaPct,
    pal: c.pal_factor || PAL_MAP[c.nivel_actividad],
    objetivo_pct: objData.pct,
    proteina_g_kg: c.proteina_g_kg,
    grasa_pct_kcal: c.grasa_pct_kcal,
  });
  return meta ? { meta, objetivo: objData } : { faltan: ['datos suficientes'] };
}

window.nuevaMedicion = async (clienteId) => {
  const [c, meds] = await Promise.all([db.clientes.get(clienteId), db.mediciones.listCliente(clienteId)]);
  const ult = meds.length ? meds[meds.length - 1] : null;
  window._medCliente = c;
  window._medUltima = ult;
  window._medMetaSugerida = null;
  openModal(modalShell('Nueva medición corporal', `
    ${ult ? `<div class="text-xs text-slate-500 mb-3">Última medición: <strong>${ult.peso ?? '—'} kg</strong>${ult.grasa_pct ? ` · ${ult.grasa_pct}% grasa` : ''}${ult.cintura ? ` · ${ult.cintura} cm cintura` : ''} · ${fmt.fechaCorta(ult.fecha)}</div>` : ''}
    <div class="grid grid-cols-2 gap-3">
      <div><label>Fecha</label><input id="me-fecha" type="date" value="${fmt.hoy()}"></div>
      <div><label>Peso (kg)</label><input id="me-peso" type="number" step="0.1" placeholder="${ult?.peso ?? '78.5'}" oninput="recalcComp()"></div>
      <div><label>% Grasa</label><input id="me-grasa" type="number" step="0.1" placeholder="${ult?.grasa_pct ?? '18.5'}" oninput="recalcComp()"></div>
      <div><label>Cintura (cm)</label><input id="me-cin" type="number" step="0.1" placeholder="${ult?.cintura ?? ''}"></div>
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
      <div class="mt-2 pt-2 border-t border-slate-200">${tablaGrasaHtml()}</div>
    </div>
    <div id="me-meta-impacto" class="mt-3 hidden rounded-xl p-3 text-xs" style="background:#eff6ff;border:1px solid #bfdbfe"></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-secondary" onclick="guardarMedicion('${clienteId}', false)">Guardar solo la medición</button>
      <button id="me-btn-meta" class="btn btn-primary hidden" onclick="guardarMedicion('${clienteId}', true)">Guardar y actualizar meta</button>`));
};

// Panel de impacto: meta guardada vs meta recalculada con el peso nuevo.
window.renderImpactoMetaMedicion = () => {
  const c = window._medCliente;
  const box = $('#me-meta-impacto');
  const btn = $('#me-btn-meta');
  if (!c || !box) return;
  window._medMetaSugerida = null;
  btn?.classList.add('hidden');

  const peso = Number($('#me-peso')?.value);
  if (!peso) { box.classList.add('hidden'); return; }
  // Si no escriben %grasa, se usa el de la última medición: el método del
  // cálculo (Katch-McArdle vs Mifflin) depende de tenerlo o no.
  const grasaInput = $('#me-grasa')?.value;
  const grasa = grasaInput ? Number(grasaInput) : (window._medUltima?.grasa_pct ?? null);
  const grasaHeredada = !grasaInput && grasa != null;

  const r = metaSugeridaDesdeMedicion(c, peso, grasa);
  box.classList.remove('hidden');
  if (r.faltan) {
    box.innerHTML = `<div class="text-amber-700">Para ver si esta medición cambia la meta falta en el perfil: <strong>${r.faltan.join(', ')}</strong>. Complétalo en "✎ Editar" y vuelve a intentar.</div>`;
    return;
  }
  const nueva = r.meta.redondeo;
  const act = { kcal: c.meta_calorias, p: c.meta_proteina_g, ca: c.meta_carbos_g, g: c.meta_grasas_g };
  const hayActual = !!act.kcal;
  const dK = hayActual ? nueva.kcal - act.kcal : null;
  const igual = hayActual && dK === 0 && nueva.proteina === act.p && nueva.carbos === act.ca && nueva.grasas === act.g;
  window._medMetaSugerida = { meta: r.meta, objetivo: r.objetivo, peso, grasa };

  const dLine = (label, nuevo, actual, color) => {
    const d = actual != null ? nuevo - actual : null;
    return `<div class="flex justify-between gap-2"><span style="color:${color};font-weight:600">${label}</span><span>${actual != null ? `<span class="text-slate-400">${actual}</span> → ` : ''}<strong>${nuevo}</strong>${d ? ` <span style="color:${d > 0 ? '#2563eb' : '#d97706'}">(${d > 0 ? '+' : ''}${d})</span>` : ''}</span></div>`;
  };

  box.innerHTML = `
    <div class="font-bold text-blue-900 mb-1">🎯 ¿Cambia la meta con este peso?</div>
    ${igual
      ? '<div class="text-emerald-700 font-semibold">No. Con este peso la meta da exactamente lo mismo que la guardada — no hace falta tocarla.</div>'
      : hayActual
        ? `<div class="text-blue-900 mb-2">Sí: recalculada con <strong>${peso} kg</strong>${grasa != null ? ` y ${grasa}% grasa${grasaHeredada ? ' (de la medición anterior)' : ''}` : ''} da <strong>${dK > 0 ? '+' : ''}${dK} kcal</strong> respecto a la guardada.</div>`
        : `<div class="text-blue-900 mb-2">Este cliente no tiene meta guardada. Con <strong>${peso} kg</strong> saldría así:</div>`}
    <div class="space-y-0.5 bg-white/70 rounded-lg p-2">
      ${dLine('Calorías', nueva.kcal, act.kcal, '#059669')}
      ${dLine('Proteína (g)', nueva.proteina, act.p, '#2563eb')}
      ${dLine('Carbos (g)', nueva.carbos, act.ca, '#d97706')}
      ${dLine('Grasas (g)', nueva.grasas, act.g, '#dc2626')}
    </div>
    <div class="text-blue-700 mt-2">${r.meta.metodo} · ${escapeHtml(r.objetivo.label)} · TDEE ${r.meta.tdee} · ritmo esperado ${r.meta.cambioSemanalKg > 0 ? '+' : ''}${r.meta.cambioSemanalKg} kg/semana</div>
    ${r.meta.avisos.map(a => `<div class="text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1">⚠️ ${escapeHtml(a)}</div>`).join('')}
    <div class="text-slate-500 mt-2">${igual ? 'Guarda solo la medición.' : 'Tú decides: "Guardar solo la medición" deja la meta como está · "Guardar y actualizar meta" la cambia en el CRM y te pregunta si la mandas al Mealtracker.'}</div>`;
  if (!igual) btn?.classList.remove('hidden');
};

window.recalcComp = () => {
  const c = window._medCliente;
  if (!c) return;
  renderImpactoMetaMedicion();
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

window.guardarMedicion = async (clienteId, actualizarMeta = false) => {
  const num = (sel) => { const v = $(sel).value; return v ? Number(v) : null; };
  const fecha = $('#me-fecha').value || fmt.hoy();
  await db.mediciones.insert({
    cliente_id: clienteId,
    fecha,
    peso: num('#me-peso'),
    grasa_pct: num('#me-grasa'),
    cintura: num('#me-cin'),
    cadera: num('#me-cad'),
    pecho: num('#me-pec'),
    brazo: num('#me-bra'),
    pierna: num('#me-pie'),
    notas: $('#me-notas').value || null,
  });

  // Actualizar la meta es SIEMPRE decisión del coach: solo pasa si pulsó el
  // botón que lo dice, y aun así se le confirma el cambio exacto.
  const sug = window._medMetaSugerida;
  let metaCambiada = false;
  if (actualizarMeta && sug) {
    const r = sug.meta.redondeo;
    const ok = confirm(
      `Actualizar la meta nutricional con el peso nuevo (${sug.peso} kg)\n\n` +
      `Meta guardada: ${window._medCliente?.meta_calorias ? `${window._medCliente.meta_calorias} kcal · P${window._medCliente.meta_proteina_g} C${window._medCliente.meta_carbos_g} G${window._medCliente.meta_grasas_g}` : 'sin meta'}\n` +
      `Meta nueva:    ${r.kcal} kcal · P${r.proteina} C${r.carbos} G${r.grasas}\n\n` +
      `Esto cambia la meta en el CRM. ¿Confirmas?`
    );
    if (ok) {
      const { error } = await sb.from('clientes').update({
        meta_calorias: r.kcal,
        meta_proteina_g: r.proteina,
        meta_grasas_g: r.grasas,
        meta_carbos_g: r.carbos,
        meta_metodo: sug.meta.metodo,
        meta_argumento: sug.meta.argumento,
        meta_calculada_en: new Date().toISOString(),
      }).eq('id', clienteId);
      if (error) toast(error.message);
      else {
        metaCambiada = true;
        _clientesCache = null;
        await registrarMetaHistorial(clienteId, {
          kcal: r.kcal, proteina_g: r.proteina, carbos_g: r.carbos, grasas_g: r.grasas,
          metodo: sug.meta.metodo,
          argumento: sug.meta.argumento,
          origen: 'calculo',
          nota: `Recalculada al registrar la medición del ${fecha}`,
          fecha,
          peso_kg: sug.peso,
          grasa_pct: sug.grasa ?? null,
          objetivo: sug.objetivo.label,
          objetivo_pct: sug.objetivo.pct,
          proteina_g_kg: window._medCliente?.proteina_g_kg ?? null,
          grasa_pct_kcal: sug.meta.grasa_pct_kcal ?? null,
          pal: window._medCliente?.pal_factor ?? null,
          bmr: sug.meta.bmr,
          tdee: sug.meta.tdee,
          cambio_semanal_kg: sug.meta.cambioSemanalKg,
        });
      }
    }
  }

  closeModal();
  toast(metaCambiada ? '✓ Medición guardada y meta actualizada' : 'Medición guardada');
  // Si la meta cambió, se ofrece mandarla al cliente (con su propia
  // confirmación mostrando la meta vieja y la nueva de su app).
  if (metaCambiada && mtConfigured()) await enviarMetaMealtracker(clienteId);
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

// ── Auto-actualización del CRM ──────────────────────────────────────────
// El CRM es una SPA que el coach deja abierta días: sin esto, subir un
// app.js nuevo NO se reflejaba hasta un refresh manual, y daba la impresión
// de que el cambio "no quedó". Compara la firma (ETag/Last-Modified) de
// /app.js contra el servidor al volver a la pestaña y cada 5 minutos, y si
// cambió recarga — pero NUNCA con un modal abierto (no bota un formulario a
// medio llenar; espera al siguiente momento seguro).
(() => {
  let firma = null;
  let recargado = false;
  const leerFirma = async () => {
    try {
      const r = await fetch('/app.js', { method: 'HEAD', cache: 'no-store' });
      if (!r.ok) return null;
      return r.headers.get('etag') || r.headers.get('last-modified') || null;
    } catch (e) { return null; }
  };
  leerFirma().then(f => { firma = f; });
  const chequear = async () => {
    if (recargado || !firma) return;
    if (modal && !modal.classList.contains('hidden')) return; // formulario abierto: no molestar
    const f = await leerFirma();
    if (f && f !== firma) {
      recargado = true;
      location.reload();
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') chequear();
  });
  setInterval(chequear, 5 * 60 * 1000);
})();

// =====================================================
// CONSUMO DE IA · Tablero de tokens y costo por cliente
// Lee la tabla ia_uso (la llena api/chat.js del Mealtracker). Muestra
// totales del período, tabla por cliente y detalle de mensajes.
// =====================================================
let _iaPeriod = 'mes'; // 'dia' | 'semana' | 'mes'
let _iaTab = 'consumo'; // 'consumo' | 'mensajes' — qué sub-vista de IA se muestra
let _iaMsgCliente = ''; // filtro de cliente en la sub-vista de mensajes ('' = todos)

function _iaDesde(period) {
  const d = new Date();
  if (period === 'dia') { d.setHours(0, 0, 0, 0); return d.toISOString(); }
  if (period === 'semana') { d.setDate(d.getDate() - 7); return d.toISOString(); }
  // mes: primer día del mes en curso
  const m = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0);
  return m.toISOString();
}

const _usd = (n) => `$${(Number(n) || 0).toFixed(Math.abs(Number(n) || 0) < 1 ? 3 : 2)}`;
const _cop = (n) => `COP ${Math.round((Number(n) || 0) * (Number(_settings.usd_cop_rate) || 4000)).toLocaleString('es-CO')}`;
const _fmtDateTime = (s) => { try { return new Date(s).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return s; } };

routes.ia = async () => {
  view.innerHTML = '<div class="card">Cargando consumo…</div>';
  const desde = _iaDesde(_iaPeriod);
  const { data, error } = await sb.from('ia_uso')
    .select('cliente_nombre,modelo,accion,input_tokens,output_tokens,cache_read,cache_write,costo_usd,creado_en,mensaje')
    .gte('creado_en', desde)
    .order('creado_en', { ascending: false });

  if (error) {
    view.innerHTML = `<div class="card text-red-600">No se pudo leer el consumo: ${error.message}.<br><span class="text-slate-500 text-sm">Si la tabla no existe aún, corre el bloque <code>ia_uso</code> del schema.sql en Supabase.</span></div>`;
    return;
  }

  const rows = data || [];
  // Agregado por cliente
  const porCliente = {};
  let totCosto = 0, totTokens = 0, totMsgs = 0, totCacheRead = 0, totInputAll = 0;
  for (const r of rows) {
    const nombre = r.cliente_nombre || '(sin nombre)';
    const tk = (r.input_tokens || 0) + (r.output_tokens || 0) + (r.cache_read || 0) + (r.cache_write || 0);
    // Entrada total y qué parte vino del caché (al ~10% del precio): el
    // termómetro del ahorro del prompt compartido.
    const inputAll = (r.input_tokens || 0) + (r.cache_read || 0) + (r.cache_write || 0);
    if (!porCliente[nombre]) porCliente[nombre] = { nombre, msgs: 0, tokens: 0, costo: 0, planes: 0, cacheRead: 0, inputAll: 0 };
    porCliente[nombre].msgs++;
    porCliente[nombre].tokens += tk;
    porCliente[nombre].costo += Number(r.costo_usd || 0);
    porCliente[nombre].cacheRead += (r.cache_read || 0);
    porCliente[nombre].inputAll += inputAll;
    if (r.accion === 'plan') porCliente[nombre].planes++;
    totCosto += Number(r.costo_usd || 0); totTokens += tk; totMsgs++;
    totCacheRead += (r.cache_read || 0); totInputAll += inputAll;
  }
  const pctCache = (cr, ia) => ia > 0 ? Math.round(cr / ia * 100) : 0;
  const lista = Object.values(porCliente).sort((a, b) => b.costo - a.costo);
  const activos = lista.length;
  const proyMes = _iaPeriod === 'dia' ? totCosto * 30 : _iaPeriod === 'semana' ? totCosto * 4.3 : totCosto;

  const periodoLabel = { dia: 'Hoy', semana: 'Últimos 7 días', mes: 'Este mes' }[_iaPeriod];
  const tab = (k, txt) => `<button class="toggle-btn ${_iaPeriod === k ? 'active' : ''}" onclick="switchIaPeriod('${k}')">${txt}</button>`;
  const vtab = (k, txt) => `<button class="toggle-btn ${_iaTab === k ? 'active' : ''}" onclick="switchIaTab('${k}')">${txt}</button>`;

  // ── Sub-vista MENSAJES: qué le escriben los clientes al chat, tal cual ──
  // (la columna `mensaje` la llena api/chat.js del Mealtracker en cada envío;
  // recortada a 500 caracteres). Sirve para analizar CÓMO usan la app.
  if (_iaTab === 'mensajes') {
    // Se excluyen las filas de prueba Y las filas viejas que guardaron el
    // bloque de CONTEXTO interno en vez del texto del cliente (bug corregido
    // en api/chat.js del Mealtracker: se veía "lo mismo" en todos). El texto
    // viejo puede empezar con salto de línea, por eso el trim().
    const conTexto = rows.filter(r => r.mensaje &&
      !String(r.mensaje).trim().startsWith('CONTEXTO DEL CLIENTE') &&
      r.cliente_nombre !== '__PRUEBA__' && r.cliente_nombre !== '__PING_CHAT__');
    const nombres = Array.from(new Set(conTexto.map(r => r.cliente_nombre || '(sin nombre)'))).sort((a, b) => a.localeCompare(b));
    if (_iaMsgCliente && !nombres.includes(_iaMsgCliente)) _iaMsgCliente = '';
    const filtradas = _iaMsgCliente ? conTexto.filter(r => (r.cliente_nombre || '(sin nombre)') === _iaMsgCliente) : conTexto;
    const esc = (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    view.innerHTML = `
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 class="text-xl font-bold text-slate-900">Mensajes de los clientes</h2>
          <p class="text-xs text-slate-500 mt-1">Todo lo que escriben (o dictan) al chat del Mealtracker · ${periodoLabel}</p>
        </div>
        <div class="flex gap-2 flex-wrap items-center">
          <div class="flex gap-1">${vtab('consumo', '📊 Consumo')}${vtab('mensajes', '💬 Mensajes')}</div>
          <div class="flex gap-1">${tab('dia', 'Hoy')}${tab('semana', 'Semana')}${tab('mes', 'Mes')}</div>
        </div>
      </div>
      <div class="card">
        <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div class="text-sm text-slate-600">${filtradas.length} mensaje(s) · ${_iaMsgCliente ? escapeHtml(_iaMsgCliente) : `${nombres.length} cliente(s)`}</div>
          <select class="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white" onchange="filtrarIaMsgs(this.value)">
            <option value="">Todos los clientes</option>
            ${nombres.map(n => `<option value="${esc(n)}" ${n === _iaMsgCliente ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('')}
          </select>
        </div>
        ${filtradas.length === 0 ? '<div class="text-slate-500 text-sm py-6 text-center">Sin mensajes en este período. En cuanto los clientes escriban al chat, aparecerán aquí.</div>' : `
        <div>
          ${filtradas.slice(0, 500).map(r => `
            <div class="py-2 border-b border-slate-50">
              <div class="text-xs text-slate-400 mb-0.5"><strong class="text-slate-600">${escapeHtml(r.cliente_nombre || '(sin nombre)')}</strong> · ${_fmtDateTime(r.creado_en)} · ${r.accion === 'plan' ? '🍽 plan' : '💬 chat'}</div>
              <div class="text-sm text-slate-700">${escapeHtml(r.mensaje)}</div>
            </div>`).join('')}
          ${filtradas.length > 500 ? `<div class="text-xs text-slate-400 pt-2">Mostrando los 500 más recientes de ${filtradas.length}.</div>` : ''}
        </div>`}
        <p class="text-xs text-slate-400 mt-3">Cada mensaje queda recortado a 500 caracteres. Útil para ver cómo le hablan a la app, qué piden y dónde se traban.</p>
      </div>`;
    return;
  }

  view.innerHTML = `
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <div>
        <h2 class="text-xl font-bold text-slate-900">Consumo de IA</h2>
        <p class="text-xs text-slate-500 mt-1">Tokens y costo del chat del Mealtracker · ${periodoLabel}</p>
      </div>
      <div class="flex gap-2 flex-wrap items-center">
        <div class="flex gap-1">${vtab('consumo', '📊 Consumo')}${vtab('mensajes', '💬 Mensajes')}</div>
        <div class="flex gap-1">${tab('dia', 'Hoy')}${tab('semana', 'Semana')}${tab('mes', 'Mes')}</div>
      </div>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
      <div class="card"><div class="text-xs text-slate-500">Costo ${periodoLabel.toLowerCase()}</div><div class="text-2xl font-bold text-slate-900 mt-1">${_usd(totCosto)}</div><div class="text-xs text-slate-400">${_cop(totCosto)}</div></div>
      <div class="card"><div class="text-xs text-slate-500">${_iaPeriod === 'mes' ? 'Costo del mes' : 'Proyección a 30 días'}</div><div class="text-2xl font-bold text-slate-900 mt-1">${_usd(proyMes)}</div><div class="text-xs text-slate-400">${_cop(proyMes)}</div></div>
      <div class="card"><div class="text-xs text-slate-500">Mensajes</div><div class="text-2xl font-bold text-slate-900 mt-1">${totMsgs.toLocaleString('es-CO')}</div><div class="text-xs text-slate-400">${activos} cliente(s) activo(s)</div></div>
      <div class="card"><div class="text-xs text-slate-500">Tokens</div><div class="text-2xl font-bold text-slate-900 mt-1">${(totTokens / 1000).toFixed(0)}K</div><div class="text-xs ${pctCache(totCacheRead, totInputAll) >= 40 ? 'text-emerald-600' : 'text-slate-400'}" title="Porcentaje de la entrada servido desde el caché (cuesta ~10% del precio normal). Más alto = más ahorro.">${pctCache(totCacheRead, totInputAll)}% servido de caché</div></div>
    </div>

    <div class="card">
      ${lista.length === 0 ? '<div class="text-slate-500 text-sm py-6 text-center">Sin actividad en este período. En cuanto los clientes usen el chat, aparecerá aquí.</div>' : `
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead><tr class="text-left text-slate-400 border-b border-slate-100">
            <th class="py-2 pr-3 font-medium">Cliente</th>
            <th class="py-2 px-3 font-medium text-right">Mensajes</th>
            <th class="py-2 px-3 font-medium text-right">Planes</th>
            <th class="py-2 px-3 font-medium text-right">Tokens</th>
            <th class="py-2 px-3 font-medium text-right" title="Parte de la entrada servida desde caché (~10% del precio). Más alto = más barato.">% caché</th>
            <th class="py-2 px-3 font-medium text-right">Costo</th>
            <th class="py-2 pl-3 font-medium text-right">≈ COP</th>
          </tr></thead>
          <tbody>
            ${lista.map(c => `
              <tr class="border-b border-slate-50 hover:bg-slate-50 cursor-pointer" onclick="verClienteIA(${JSON.stringify(c.nombre).replace(/"/g, '&quot;')})">
                <td class="py-2 pr-3 font-medium text-slate-800">${c.nombre}</td>
                <td class="py-2 px-3 text-right text-slate-600">${c.msgs}</td>
                <td class="py-2 px-3 text-right text-slate-600">${c.planes || '·'}</td>
                <td class="py-2 px-3 text-right text-slate-600">${(c.tokens / 1000).toFixed(0)}K</td>
                <td class="py-2 px-3 text-right ${pctCache(c.cacheRead, c.inputAll) >= 40 ? 'text-emerald-600 font-semibold' : 'text-slate-500'}">${pctCache(c.cacheRead, c.inputAll)}%</td>
                <td class="py-2 px-3 text-right font-semibold text-slate-900">${_usd(c.costo)}</td>
                <td class="py-2 pl-3 text-right text-slate-400">${_cop(c.costo)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="text-xs text-slate-400 mt-3">Toca un cliente para ver sus mensajes y en qué se fue el gasto.</p>`}
    </div>`;
};

window.switchIaPeriod = (k) => { _iaPeriod = k; routes.ia(); };
window.switchIaTab = (k) => { _iaTab = k; routes.ia(); };
window.filtrarIaMsgs = (nombre) => { _iaMsgCliente = nombre; routes.ia(); };

// ── Recordatorio de pago manual: lista los deudores, confirma y envía ──
window.enviarRecordatoriosPago = async () => {
  toast('Buscando deudores…');
  const lista = await mtApiPost('/api/push-send', { mode: 'list_debtors' });
  if (!lista || !lista.ok) { toast('No se pudo consultar (revisa la conexión con el Mealtracker en Ajustes).'); return; }
  const deudores = lista.deudores || [];
  if (deudores.length === 0) { openModal('<div class="text-center py-4"><p class="text-slate-700">🎉 Nadie está en deuda hoy — no hay a quién recordarle.</p><button class="btn btn-secondary btn-sm mt-4" onclick="closeModal()">Cerrar</button></div>'); return; }
  const conPush = deudores.filter(d => d.tiene_push);
  const sinPush = deudores.filter(d => !d.tiene_push);
  const esc = (t) => String(t).replace(/"/g, '&quot;');
  // Los que tienen push: fila CON checkbox (marcado por defecto) para elegir
  // a quién sí y a quién no.
  const filaChk = (d) => `<label class="flex items-center justify-between py-2 border-b border-slate-50 text-sm cursor-pointer">
      <span class="flex items-center gap-2 min-w-0">
        <input type="checkbox" class="pago-chk" data-nombre="${esc(d.nombre)}" checked onchange="actualizarConteoPago()" style="width:16px;height:16px;flex-shrink:0">
        <span class="text-slate-800 truncate">${d.nombre}</span>
      </span>
      <span class="text-xs text-emerald-600 flex-shrink-0">${d.dias_vencido}d vencido</span>
    </label>`;
  const filaInfo = (d) => `<div class="flex items-center justify-between py-1.5 border-b border-slate-50 text-sm">
      <span class="text-slate-500">${d.nombre}</span>
      <span class="text-xs text-slate-400">sin push · no le llega</span>
    </div>`;
  openModal(`
    <div class="flex items-center justify-between mb-3">
      <h3 class="font-bold text-slate-900">Enviar recordatorio de pago</h3>
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">✕</button>
    </div>
    <p class="text-sm text-slate-600 mb-1">Marca a quién enviarle (destildá a quien NO quieras molestar hoy):</p>
    <div class="overflow-y-auto mb-3" style="max-height:45vh">
      ${conPush.map(filaChk).join('') || '<p class="text-slate-500 text-sm py-2">Ninguno de los deudores tiene el push activo.</p>'}
      ${sinPush.length ? `<p class="text-xs text-slate-400 mt-3 mb-1">${sinPush.length} deudor(es) SIN push activo (no les llega — que lo activen en su app):</p>${sinPush.map(filaInfo).join('')}` : ''}
    </div>
    <div class="flex gap-2 justify-end items-center">
      <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cancelar</button>
      <button id="btn-enviar-pago" class="btn btn-primary btn-sm" ${conPush.length ? '' : 'disabled'} onclick="confirmarEnvioPago()">Enviar a <span id="cnt-pago">${conPush.length}</span></button>
    </div>`, { wide: true });
};

// Actualiza el número del botón según los checkboxes marcados.
window.actualizarConteoPago = () => {
  const n = document.querySelectorAll('.pago-chk:checked').length;
  const cnt = document.getElementById('cnt-pago');
  const btn = document.getElementById('btn-enviar-pago');
  if (cnt) cnt.textContent = n;
  if (btn) btn.disabled = n === 0;
};

window.confirmarEnvioPago = async () => {
  const names = Array.from(document.querySelectorAll('.pago-chk:checked')).map(el => el.dataset.nombre);
  if (names.length === 0) { toast('No marcaste a nadie.'); return; }
  toast('Enviando…');
  const res = await mtApiPost('/api/push-send', { mode: 'send_payment_all', names });
  if (!res) { toast('No hubo respuesta del servidor.'); return; }
  openModal(`
    <div class="text-center py-3">
      <div class="text-3xl mb-2">${res.enviados > 0 ? '✅' : '⚠️'}</div>
      <p class="text-slate-800 font-semibold mb-1">${res.enviados > 0 ? `Enviado a ${res.enviados} cliente(s)` : 'No se envió a nadie'}</p>
      ${res.destinatarios && res.destinatarios.length ? `<p class="text-xs text-slate-500 mb-4">${res.destinatarios.join(', ')}</p>` : ''}
      ${res.causa ? `<p class="text-xs text-amber-700 mb-4">${res.causa}</p>` : ''}
      <button class="btn btn-secondary btn-sm" onclick="closeModal()">Listo</button>
    </div>`);
};

window.verHistorialPago = async () => {
  openModal('<div class="card">Cargando…</div>', { wide: true });
  const { data, error } = await sb.from('push_pago_log')
    .select('creado_en,enviados,destinatarios')
    .order('creado_en', { ascending: false })
    .limit(90);
  if (error) { modalContent.innerHTML = `<div class="text-red-600 text-sm">No se pudo leer el historial: ${error.message}.<br>Si la tabla no existe aún, corre el bloque <code>push_pago_log</code> del schema.sql.</div>`; return; }
  const rows = data || [];
  openModal(`
    <div class="flex items-center justify-between mb-3">
      <h3 class="font-bold text-slate-900">Historial de recordatorios de pago</h3>
      <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cerrar</button>
    </div>
    ${rows.length === 0 ? '<p class="text-slate-500 text-sm py-4">Todavía no has enviado ningún recordatorio de pago.</p>' : `
    <div class="overflow-y-auto" style="max-height:60vh">
      <table class="w-full text-sm">
        <thead><tr class="text-left text-slate-400 border-b border-slate-100">
          <th class="py-2 pr-3 font-medium">Fecha</th>
          <th class="py-2 px-3 font-medium text-right">Enviados</th>
          <th class="py-2 pl-3 font-medium">A quiénes</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => `<tr class="border-b border-slate-50 align-top">
            <td class="py-2 pr-3 text-slate-600 whitespace-nowrap">${_fmtDateTime(r.creado_en)}</td>
            <td class="py-2 px-3 text-right font-semibold text-slate-900">${r.enviados || 0}</td>
            <td class="py-2 pl-3 text-slate-600">${Array.isArray(r.destinatarios) ? r.destinatarios.join(', ') : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`}`, { wide: true });
};

window.verClienteIA = async (nombre) => {
  openModal('<div class="card">Cargando…</div>', { wide: true });
  const desde = _iaDesde(_iaPeriod);
  const { data, error } = await sb.from('ia_uso')
    .select('creado_en,accion,modelo,input_tokens,output_tokens,cache_read,cache_write,costo_usd,mensaje')
    .eq('cliente_nombre', nombre)
    .gte('creado_en', desde)
    .order('creado_en', { ascending: false })
    .limit(200);
  if (error) { modalContent.innerHTML = `<div class="card text-red-600">${error.message}</div>`; return; }
  const rows = data || [];
  const totCosto = rows.reduce((s, r) => s + Number(r.costo_usd || 0), 0);
  openModal(`
    <div class="flex items-center justify-between mb-3">
      <div><h3 class="font-bold text-slate-900">${nombre}</h3><p class="text-xs text-slate-500">${rows.length} mensaje(s) · ${_usd(totCosto)} · ${_cop(totCosto)}</p></div>
      <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cerrar</button>
    </div>
    <div class="overflow-y-auto" style="max-height:60vh">
      ${rows.length === 0 ? '<div class="text-slate-500 text-sm py-4">Sin mensajes en este período.</div>' : rows.map(r => `
        <div class="py-2 border-b border-slate-50">
          <div class="flex items-center justify-between text-xs text-slate-400 mb-0.5">
            <span>${_fmtDateTime(r.creado_en)} · ${r.accion === 'plan' ? '🍽 plan' : '💬 registro'}</span>
            <span class="font-semibold text-slate-600">${_usd(r.costo_usd)} · ${((r.input_tokens||0)+(r.output_tokens||0)+(r.cache_read||0)+(r.cache_write||0)).toLocaleString('es-CO')} tk</span>
          </div>
          <div class="text-sm text-slate-700">${(String(r.mensaje || '').trim().startsWith('CONTEXTO DEL CLIENTE')
            ? '(texto no capturado — registro de una versión anterior de la app)'
            : (r.mensaje || '(sin texto)')).replace(/</g, '&lt;')}</div>
        </div>`).join('')}
    </div>`, { wide: true });
};

// Inyecta el botón "IA" en la barra de navegación clonando uno existente,
// así no hace falta editar el HTML del shell (que vive fuera de app.js).
(function addIaNav() {
  try {
    const anchor = document.querySelector('.nav-item');
    if (!anchor || document.querySelector('.nav-item[data-view="ia"]')) return;
    const btn = anchor.cloneNode(true);
    btn.dataset.view = 'ia';
    btn.classList.remove('active');
    btn.textContent = '🤖 IA';
    anchor.parentNode.appendChild(btn);
    btn.addEventListener('click', () => navigate('ia'));
  } catch (e) { /* si el shell cambia, no rompe nada */ }
})();

// =====================================================
// VIEW: NUTRICIÓN — qué comió el cliente esta semana
// =====================================================
// Lee EN VIVO el Mealtracker del cliente (history + historyDetail fusionados
// de todas sus cuentas) y arma, para una semana ISO:
//   · el resumen global graficado (kcal y macros día a día vs. su meta),
//   · el detalle de alimentos agregados de la semana,
//   · los que más calorías aportaron y los de mejor/peor densidad nutricional,
//   · patrones (horarios, entre semana vs. fin de semana, variabilidad),
//   · y las OPORTUNIDADES DE MEJORA que genera Claude para que el coach se
//     las diga al cliente (api/coach-insight.js).
//
// Todo el cálculo es local: acá no se inventan números, solo se agregan los
// que el cliente registró. La IA recibe ese análisis ya hecho, nunca la data
// cruda, y su trabajo es la LECTURA experta, no la aritmética.

// ─── Micronutrientes estimados ──────────────────────────────────────────
// Misma tabla y misma lógica que usa el Mealtracker en su panel de
// rendimiento: si el registro ya trae fibra/omega3/azúcar (los estima el LLM
// al registrar la comida) se usan tal cual; si es un registro viejo, se
// estima por palabra clave sobre los gramos del item.
// Valores por 1 g de alimento.
const NUT_MICRO_DB = {
  'arroz': { fiber: 0.004, omega3: 0, sugar: 0 },
  'pollo': { fiber: 0, omega3: 0.0001, sugar: 0 },
  'pechuga': { fiber: 0, omega3: 0.0001, sugar: 0 },
  'pescado': { fiber: 0, omega3: 0.012, sugar: 0 },
  'salmon': { fiber: 0, omega3: 0.022, sugar: 0 },
  'atun': { fiber: 0, omega3: 0.013, sugar: 0 },
  'sardina': { fiber: 0, omega3: 0.015, sugar: 0 },
  'huevo': { fiber: 0, omega3: 0.001, sugar: 0 },
  'avena': { fiber: 0.1, omega3: 0.0014, sugar: 0 },
  'banana': { fiber: 0.026, omega3: 0, sugar: 0 },
  'platano': { fiber: 0.026, omega3: 0, sugar: 0 },
  'manzana': { fiber: 0.024, omega3: 0, sugar: 0 },
  'palta': { fiber: 0.067, omega3: 0.0011, sugar: 0 },
  'aguacate': { fiber: 0.067, omega3: 0.0011, sugar: 0 },
  'arepa': { fiber: 0.03, omega3: 0, sugar: 0 },
  'pan': { fiber: 0.07, omega3: 0, sugar: 0 },
  'yogur': { fiber: 0, omega3: 0, sugar: 0 },
  'leche': { fiber: 0, omega3: 0, sugar: 0 },
  'queso': { fiber: 0, omega3: 0.001, sugar: 0 },
  'almendra': { fiber: 0.13, omega3: 0.0001, sugar: 0 },
  'mantequilla mani': { fiber: 0.06, omega3: 0.0001, sugar: 0 },
  'espinaca': { fiber: 0.022, omega3: 0.0014, sugar: 0 },
  'brocoli': { fiber: 0.026, omega3: 0.001, sugar: 0 },
  'lenteja': { fiber: 0.079, omega3: 0.001, sugar: 0 },
  'frijol': { fiber: 0.06, omega3: 0.001, sugar: 0 },
  'tomate': { fiber: 0.012, omega3: 0, sugar: 0 },
  'aceite oliva': { fiber: 0, omega3: 0.008, sugar: 0 },
  'nuez': { fiber: 0.067, omega3: 0.09, sugar: 0 },
  'nueces': { fiber: 0.067, omega3: 0.09, sugar: 0 },
  'chia': { fiber: 0.34, omega3: 0.178, sugar: 0 },
  'linaza': { fiber: 0.27, omega3: 0.228, sugar: 0 },
  'gaseosa': { fiber: 0, omega3: 0, sugar: 0.106 },
  'refresco': { fiber: 0, omega3: 0, sugar: 0.106 },
  'coca': { fiber: 0, omega3: 0, sugar: 0.106 },
  'jugo': { fiber: 0.002, omega3: 0, sugar: 0.09 },
  'chocolate': { fiber: 0.07, omega3: 0, sugar: 0.47 },
  'galleta': { fiber: 0.02, omega3: 0, sugar: 0.30 },
  'helado': { fiber: 0, omega3: 0, sugar: 0.21 },
  'postre': { fiber: 0.01, omega3: 0, sugar: 0.30 },
  'torta': { fiber: 0.01, omega3: 0, sugar: 0.35 },
  'pastel': { fiber: 0.01, omega3: 0, sugar: 0.35 },
  'dulce': { fiber: 0, omega3: 0, sugar: 0.55 },
  'miel': { fiber: 0, omega3: 0, sugar: 0.82 },
};

function nutMicroKey(name) {
  if (!name) return null;
  const n = String(name).toLowerCase();
  for (const key of Object.keys(NUT_MICRO_DB)) if (n.includes(key)) return key;
  return null;
}

// Gramos de un item a partir de su texto de cantidad ("120 g", "1 unidad (~50g)").
// Si no hay gramos declarados, se aproxima por calorías (1,5 kcal/g de mezcla).
function nutGramos(it) {
  const amt = String(it.amount || '').toLowerCase();
  const m = amt.match(/(\d+(?:[.,]\d+)?)\s*g\b/);
  if (m) return parseFloat(m[1].replace(',', '.'));
  const kcal = Number(it.kcal) || 0;
  return kcal > 0 ? kcal / 1.5 : 0;
}

function nutMicrosItem(it) {
  if (it.fiber != null || it.omega3 != null || it.sugar != null) {
    return {
      fiber: Number(it.fiber) > 0 ? Number(it.fiber) : 0,
      omega3: Number(it.omega3) > 0 ? Number(it.omega3) : 0,
      sugar: Number(it.sugar) > 0 ? Number(it.sugar) : 0,
      estimado: false,
    };
  }
  const key = nutMicroKey(it.name);
  const grams = nutGramos(it);
  if (!key || grams <= 0) return { fiber: 0, omega3: 0, sugar: 0, estimado: true };
  const db = NUT_MICRO_DB[key];
  return { fiber: db.fiber * grams, omega3: db.omega3 * grams, sugar: db.sugar * grams, estimado: true };
}

// ─── Utilidades de la semana ────────────────────────────────────────────
const NUT_DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function nutFechasSemana(semanaISO) {
  const [ini] = semanaISOToRange(semanaISO);
  const out = [];
  const base = new Date(ini + 'T00:00:00');
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
}

const nutR0 = (n) => Math.round(Number(n) || 0);
const nutR1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const nutPct = (v, meta) => (meta ? Math.round((v / meta) * 100) : null);

// Hora ("07:35") → número decimal, para promediar
function nutHoraNum(t) {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) + Number(m[2]) / 60;
}
function nutHoraTxt(h) {
  if (h == null) return '—';
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
}

// ─── EL ANÁLISIS ────────────────────────────────────────────────────────
// Devuelve un objeto plano y autoexplicado: lo pinta la vista y lo lee la IA.
function analizarNutricionSemana(d, semanaISO, cliente, pesoKg) {
  const [ini, fin] = semanaISOToRange(semanaISO);
  const goalsMT = goalsDeSemanaMT(d, semanaISO) || {};
  const meta = {
    kcal: goalsMT.kcal || Number(cliente?.meta_calorias) || null,
    p: goalsMT.p || Number(cliente?.meta_proteina_g) || null,
    c: goalsMT.c || Number(cliente?.meta_carbos_g) || null,
    g: goalsMT.g || Number(cliente?.meta_grasas_g) || null,
    // De dónde salió: la del Mealtracker manda (es la que ve el cliente en su
    // app); la de la ficha del CRM solo se usa si allá no hay ninguna.
    origen: goalsMT.kcal ? 'mealtracker' : (cliente?.meta_calorias ? 'crm' : null),
  };

  const fechas = nutFechasSemana(semanaISO);
  const history = d.history || {};
  const detalle = d.historyDetail || {};
  const wellbeing = d.wellbeing || {};

  // Agregado por alimento de TODA la semana
  const foods = new Map();
  // Agregado por tipo de comida (desayuno/almuerzo/…)
  const comidas = new Map();

  const dias = fechas.map((fecha, i) => {
    const tot = history[fecha] || null;
    const det = Array.isArray(detalle[fecha]) ? detalle[fecha] : [];
    const kcal = nutR0(tot?.kcal);
    // Mismo criterio que resumenSemanaDeData() y que el Mealtracker.
    const registrado = diaRegistradoMT(tot, det);
    const micros = { fiber: 0, omega3: 0, sugar: 0 };
    let nItems = 0;
    const horas = [];

    for (const e of det) {
      const h = nutHoraNum(e.time);
      if (h != null) horas.push(h);
      const tipo = String(e.meal || 'sin tipo').toLowerCase();
      const cm = comidas.get(tipo) || { tipo, veces: 0, kcal: 0 };
      cm.veces++; cm.kcal += Number(e.kcal) || 0;
      comidas.set(tipo, cm);

      for (const it of (e.items || [])) {
        nItems++;
        const m = nutMicrosItem(it);
        micros.fiber += m.fiber; micros.omega3 += m.omega3; micros.sugar += m.sugar;
        const nombre = String(it.name || '').trim();
        if (!nombre) continue;
        const key = normalizeName(nombre);
        const f = foods.get(key) || {
          nombre, veces: 0, kcal: 0, p: 0, c: 0, g: 0, fiber: 0, sugar: 0, dias: new Set(), gramos: 0,
        };
        f.veces++;
        f.kcal += Number(it.kcal) || 0;
        f.p += Number(it.p) || 0;
        f.c += Number(it.c) || 0;
        f.g += Number(it.g) || 0;
        f.fiber += m.fiber;
        f.sugar += m.sugar;
        f.gramos += nutGramos(it);
        f.dias.add(fecha);
        foods.set(key, f);
      }
    }

    const wb = wellbeing[fecha] || null;
    // La meta que regía ESE día (no la de hoy): es contra la que se pinta el
    // calendario y las barras, igual que en el Mealtracker.
    const metaDia = goalsMTEnFecha(d, fecha);
    return {
      fecha,
      dow: NUT_DOW[i],
      finde: i >= 5,
      registrado,
      meta_dia: (metaDia.kcal || metaDia.p || metaDia.c || metaDia.g) ? metaDia : null,
      kcal,
      p: nutR0(tot?.p),
      c: nutR0(tot?.c),
      g: nutR0(tot?.g),
      agua: nutR0(tot?.water),
      comidas: det.length,
      items: nItems,
      primera: horas.length ? nutHoraTxt(Math.min(...horas)) : null,
      ultima: horas.length ? nutHoraTxt(Math.max(...horas)) : null,
      fibra: nutR1(micros.fiber),
      omega3: nutR1(micros.omega3),
      azucar: nutR1(micros.sugar),
      energia: wb?.energy ?? null,
      hambre: wb?.hunger ?? null,
      animo: wb?.mood ?? null,
    };
  });

  const reg = dias.filter(x => x.registrado);
  const nReg = reg.length;
  const prom = (k) => (nReg ? nutR0(reg.reduce((s, x) => s + (x[k] || 0), 0) / nReg) : null);

  // Fibra, omega3, azúcar y número de comidas solo existen si ese día trae el
  // DETALLE de alimentos. Promediarlos sobre todos los días registrados los
  // diluía a la mitad y hacía leer "casi no come fibra" donde en realidad
  // faltaba el detalle. Se promedian sobre los días que sí lo tienen.
  const conDetalle = dias.filter(x => x.comidas > 0);
  const nDet = conDetalle.length;
  const promDet = (k) => (nDet ? nutR1(conDetalle.reduce((s, x) => s + (x[k] || 0), 0) / nDet) : null);
  // Lo mismo con el agua: solo cuentan los días en que la registró.
  const conAgua = reg.filter(x => x.agua > 0);

  const promedio = {
    kcal: prom('kcal'), p: prom('p'), c: prom('c'), g: prom('g'),
    fibra: promDet('fibra'), omega3: promDet('omega3'), azucar: promDet('azucar'),
    comidas: promDet('comidas'), items: promDet('items'),
    agua: conAgua.length ? nutR0(conAgua.reduce((s, x) => s + x.agua, 0) / conAgua.length) : null,
    dias_agua: conAgua.length,
    base_detalle: nDet,
  };

  // Desviación estándar de kcal: mide qué tan parejo comió la semana.
  let sd = null;
  if (nReg >= 2) {
    const m = promedio.kcal;
    sd = nutR0(Math.sqrt(reg.reduce((s, x) => s + Math.pow(x.kcal - m, 2), 0) / nReg));
  }

  const laborables = reg.filter(x => !x.finde);
  const finde = reg.filter(x => x.finde);
  const promDe = (arr, k) => (arr.length ? nutR0(arr.reduce((s, x) => s + (x[k] || 0), 0) / arr.length) : null);

  const horasPrimera = reg.map(x => nutHoraNum(x.primera)).filter(v => v != null);
  const horasUltima = reg.map(x => nutHoraNum(x.ultima)).filter(v => v != null);

  // ── Alimentos ──
  // Denominador honesto: las calorías que vienen desglosadas en alimentos.
  // Con el total de la semana, un día sin detalle hundía todos los porcentajes.
  const totalKcalDetalle = [...foods.values()].reduce((s, f) => s + f.kcal, 0);
  const alimentos = [...foods.values()].map(f => {
    const kcal = nutR0(f.kcal);
    // Densidad nutricional simple y honesta: qué parte de esas calorías vino
    // acompañada de proteína y fibra. No es un "score de salud", es el dato
    // que de verdad mueve saciedad y composición corporal.
    const densidadProte = kcal > 0 ? Math.round((f.p * 4 / kcal) * 100) : 0;
    const fibraPor100 = kcal > 0 ? nutR1((f.fiber / kcal) * 100) : 0;
    return {
      nombre: f.nombre,
      veces: f.veces,
      dias: f.dias.size,
      kcal,
      kcal_por_vez: f.veces ? nutR0(f.kcal / f.veces) : 0,
      pct_kcal_detalle: totalKcalDetalle ? Math.round((f.kcal / totalKcalDetalle) * 100) : 0,
      p: nutR1(f.p), c: nutR1(f.c), g: nutR1(f.g),
      fibra: nutR1(f.fiber),
      azucar: nutR1(f.sugar),
      densidad_proteica_pct: densidadProte,
      fibra_por_100kcal: fibraPor100,
      // Calidad = proteína + fibra por caloría, penalizando azúcar añadida.
      calidad: Math.round(densidadProte + fibraPor100 * 4 - (kcal > 0 ? (f.sugar * 4 / kcal) * 100 : 0)),
    };
  }).sort((a, b) => b.kcal - a.kcal);

  // "Significativos": lo que de verdad pesa en la semana. Sin este filtro el
  // top de mejores/peores se llena de una pizca de sal y un té.
  const signif = alimentos.filter(a => a.kcal >= 150);

  const resultado = {
    cliente: {
      nombre: cliente?.nombre || '',
      objetivo: cliente?.objetivo || cliente?.meta_especifica || null,
      peso_kg: pesoKg || null,
      restricciones: cliente?.restricciones_lesiones || null,
      patologias: cliente?.patologias || null,
      preferencias: cliente?.preferencias_dieteticas || null,
    },
    semana: semanaISO,
    rango: [ini, fin],
    meta,
    registro: {
      dias_registrados: nReg,
      de: 7,
      pct: Math.round((nReg / 7) * 100),
      dias_sin_registro: dias.filter(x => !x.registrado).map(x => x.dow),
      // Días con el desglose de alimentos (no solo los totales del día): es la
      // base real de todo lo que se dice sobre ALIMENTOS y micros.
      dias_con_detalle: nDet,
      kcal_con_detalle: nutR0(totalKcalDetalle),
    },
    promedio,
    cumplimiento: {
      kcal_pct: nutPct(promedio.kcal, meta.kcal),
      prote_pct: nutPct(promedio.p, meta.p),
      carbos_pct: nutPct(promedio.c, meta.c),
      grasas_pct: nutPct(promedio.g, meta.g),
      // Balance semanal: lo que de verdad manda en un déficit/superávit.
      balance_kcal_semana: (meta.kcal && nReg) ? nutR0(reg.reduce((s, x) => s + (x.kcal - meta.kcal), 0)) : null,
      dias_en_rango_kcal: meta.kcal ? reg.filter(x => Math.abs(x.kcal - meta.kcal) <= meta.kcal * 0.1).length : null,
      dias_sobre_meta: meta.kcal ? reg.filter(x => x.kcal > meta.kcal * 1.1).length : null,
      dias_bajo_meta: meta.kcal ? reg.filter(x => x.kcal < meta.kcal * 0.9).length : null,
      prote_g_por_kg: (pesoKg && promedio.p) ? nutR1(promedio.p / pesoKg) : null,
    },
    consistencia: {
      desviacion_kcal: sd,
      dia_mas_alto: reg.length ? reg.reduce((a, b) => (b.kcal > a.kcal ? b : a)) : null,
      dia_mas_bajo: reg.length ? reg.reduce((a, b) => (b.kcal < a.kcal ? b : a)) : null,
      entre_semana_kcal: promDe(laborables, 'kcal'),
      fin_de_semana_kcal: promDe(finde, 'kcal'),
      entre_semana_prote: promDe(laborables, 'p'),
      fin_de_semana_prote: promDe(finde, 'p'),
      primera_comida_prom: horasPrimera.length ? nutHoraTxt(horasPrimera.reduce((a, b) => a + b, 0) / horasPrimera.length) : null,
      ultima_comida_prom: horasUltima.length ? nutHoraTxt(horasUltima.reduce((a, b) => a + b, 0) / horasUltima.length) : null,
    },
    dias,
    comidas_por_tipo: [...comidas.values()].sort((a, b) => b.veces - a.veces).map(c => ({ ...c, kcal: nutR0(c.kcal), kcal_prom: nutR0(c.kcal / c.veces) })),
    alimentos,
    top_calorias: alimentos.slice(0, 8),
    top_frecuentes: [...alimentos].sort((a, b) => b.veces - a.veces).slice(0, 8),
    mas_nutritivos: [...signif].sort((a, b) => b.calidad - a.calidad).slice(0, 5),
    menos_nutritivos: [...signif].sort((a, b) => a.calidad - b.calidad).slice(0, 5),
    bienestar: {
      energia: nReg ? nutR1(reg.filter(x => x.energia != null).reduce((s, x, _, arr) => s + x.energia / arr.length, 0)) || null : null,
      hambre: nReg ? nutR1(reg.filter(x => x.hambre != null).reduce((s, x, _, arr) => s + x.hambre / arr.length, 0)) || null : null,
      animo: nReg ? nutR1(reg.filter(x => x.animo != null).reduce((s, x, _, arr) => s + x.animo / arr.length, 0)) || null : null,
    },
  };
  return resultado;
}

// ─── Gráficas de la sección ─────────────────────────────────────────────
// SVG inline, sin librerías (el CRM es estático y así se mantiene).

// Barras por día contra la meta. Verde = dentro de ±10% de la meta,
// ámbar = por encima, azul = por debajo, gris = sin registro.
function nutBarras(dias, key, meta, colorBajo, unidad = '') {
  const w = 640, h = 190, pad = { t: 22, r: 10, b: 30, l: 40 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const valores = dias.map(d => d[key] || 0);
  const maxV = Math.max(meta || 0, ...valores, 1);
  const top = maxV * 1.18;
  const y = (v) => pad.t + ih - (v / top) * ih;
  const bw = iw / dias.length;

  let svg = `<svg viewBox="0 0 ${w} ${h}" class="w-full h-auto" preserveAspectRatio="xMidYMid meet">`;
  for (let i = 0; i <= 3; i++) {
    const v = (top / 3) * i, yy = y(v);
    svg += `<line x1="${pad.l}" y1="${yy}" x2="${w - pad.r}" y2="${yy}" stroke="#e2e8f0" stroke-width="1"/>`;
    svg += `<text x="${pad.l - 5}" y="${yy + 3}" text-anchor="end" font-size="9" fill="#94a3b8">${Math.round(v)}</text>`;
  }
  dias.forEach((d, i) => {
    const v = d[key] || 0;
    const x = pad.l + i * bw + bw * 0.18;
    const bwidth = bw * 0.64;
    let color = '#cbd5e1';
    if (d.registrado && v > 0) {
      if (!meta) color = colorBajo;
      else if (v >= meta * 0.9 && v <= meta * 1.1) color = '#10b981';
      else if (v > meta * 1.1) color = '#f59e0b';
      else color = colorBajo;
    }
    const alto = v > 0 ? Math.max(3, ih - (y(v) - pad.t)) : 3;
    const yy = v > 0 ? y(v) : pad.t + ih - 3;
    svg += `<rect x="${x}" y="${yy}" width="${bwidth}" height="${alto}" rx="3" fill="${color}"/>`;
    if (v > 0) svg += `<text x="${x + bwidth / 2}" y="${yy - 5}" text-anchor="middle" font-size="9" font-weight="600" fill="${color}">${Math.round(v)}</text>`;
    svg += `<text x="${x + bwidth / 2}" y="${h - 12}" text-anchor="middle" font-size="10" fill="${d.registrado ? '#475569' : '#cbd5e1'}">${d.dow}</text>`;
    if (!d.registrado) svg += `<text x="${x + bwidth / 2}" y="${h - 2}" text-anchor="middle" font-size="8" fill="#cbd5e1">sin dato</text>`;
  });
  if (meta) {
    const ym = y(meta);
    svg += `<line x1="${pad.l}" y1="${ym}" x2="${w - pad.r}" y2="${ym}" stroke="#0f766e" stroke-width="1.5" stroke-dasharray="5 4"/>`;
    svg += `<text x="${w - pad.r}" y="${ym - 5}" text-anchor="end" font-size="9" font-weight="700" fill="#0f766e">meta ${meta}${unidad}</text>`;
  }
  svg += '</svg>';
  return svg;
}

// Anillo de distribución de macros (% de las calorías). Real vs. meta.
function nutAnillo(p, c, g, titulo) {
  const kp = p * 4, kc = c * 4, kg = g * 9;
  const tot = kp + kc + kg;
  if (!tot) return `<div class="text-xs text-slate-400 text-center py-6">Sin datos</div>`;
  const segs = [
    { v: kp / tot, color: '#3b82f6', label: 'Proteína', g: Math.round(p) },
    { v: kc / tot, color: '#f59e0b', label: 'Carbos', g: Math.round(c) },
    { v: kg / tot, color: '#8b5cf6', label: 'Grasas', g: Math.round(g) },
  ];
  const r = 42, cx = 60, cy = 60, circ = 2 * Math.PI * r;
  let off = 0;
  let svg = `<svg viewBox="0 0 120 120" class="w-28 h-28"><g transform="rotate(-90 60 60)">`;
  for (const s of segs) {
    const len = s.v * circ;
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="16" stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-off}"/>`;
    off += len;
  }
  svg += `</g><text x="60" y="58" text-anchor="middle" font-size="15" font-weight="700" fill="#0f172a">${Math.round(tot)}</text>`;
  svg += `<text x="60" y="72" text-anchor="middle" font-size="9" fill="#94a3b8">kcal</text></svg>`;
  return `<div class="flex flex-col items-center gap-1">
    <div class="text-[10px] uppercase font-bold tracking-wider text-slate-400">${titulo}</div>
    ${svg}
    <div class="text-[11px] space-y-0.5 mt-1">
      ${segs.map(s => `<div class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full" style="background:${s.color}"></span><span class="text-slate-500">${s.label}</span> <span class="font-bold text-slate-700">${Math.round(s.v * 100)}%</span> <span class="text-slate-400">· ${s.g}g</span></div>`).join('')}
    </div>
  </div>`;
}

// Barra de progreso contra la meta (verde en rango, ámbar arriba, rojo lejos)
function nutBarraMeta(label, valor, meta, unidad) {
  const pct = meta ? Math.round((valor / meta) * 100) : null;
  const ancho = pct == null ? 0 : Math.min(140, pct);
  const color = pct == null ? 'bg-slate-300'
    : pct >= 90 && pct <= 110 ? 'bg-emerald-500'
    : pct > 110 ? 'bg-amber-500'
    : pct >= 75 ? 'bg-sky-500' : 'bg-red-500';
  return `<div>
    <div class="flex justify-between items-baseline text-xs mb-1">
      <span class="text-slate-600 font-semibold">${label}</span>
      <span class="text-slate-500"><span class="font-bold text-slate-800">${valor ?? '—'}${unidad}</span>${meta ? ` / ${meta}${unidad}` : ''}${pct != null ? ` · <span class="font-bold">${pct}%</span>` : ''}</span>
    </div>
    <div class="h-2 bg-slate-100 rounded-full overflow-hidden relative">
      ${meta ? '<div class="absolute inset-y-0" style="left:71.4%;width:1px;background:#94a3b8"></div>' : ''}
      <div class="h-full rounded-full ${color}" style="width:${(ancho / 140) * 100}%"></div>
    </div>
  </div>`;
}

function nutKpi(label, valor, sub, color = 'text-slate-900') {
  return `<div class="bg-white rounded-xl border border-slate-200 p-3">
    <div class="text-[10px] uppercase tracking-wider text-slate-400 font-bold">${label}</div>
    <div class="text-xl font-bold ${color} leading-tight mt-0.5">${valor}</div>
    ${sub ? `<div class="text-[11px] text-slate-500 mt-0.5">${sub}</div>` : ''}
  </div>`;
}

function nutColorPct(p, ideal = 100) {
  if (p == null) return 'text-slate-400';
  const dif = Math.abs(p - ideal);
  return dif <= 10 ? 'text-emerald-600' : dif <= 25 ? 'text-amber-600' : 'text-red-600';
}

// ─── Estado de la vista ─────────────────────────────────────────────────
let _nut = {
  clienteId: null,
  semana: null,
  cliente: null,
  data: null,        // blob del Mealtracker fusionado
  analisis: null,
  ia: null,          // { texto, at, modelo } — oportunidades generadas
  cargando: false,
  error: null,
  tab: 'resumen',    // resumen | alimentos | detalle | ia
};

// Historial de la IA en Supabase. La tabla es opcional: si el coach todavía no
// corrió la migración, la sección funciona igual, solo que no recuerda.
async function nutCargarIaGuardada(clienteId, semana) {
  try {
    const { data, error } = await sb.from('nutricion_insights')
      .select('contenido, modelo, created_at')
      .eq('cliente_id', clienteId).eq('semana', semana)
      .order('created_at', { ascending: false }).limit(1);
    if (error || !data || !data.length) return null;
    return { texto: data[0].contenido, at: data[0].created_at, modelo: data[0].modelo };
  } catch (e) { return null; }
}

async function nutGuardarIa(clienteId, semana, texto, modelo) {
  try {
    await sb.from('nutricion_insights').insert({ cliente_id: clienteId, semana, contenido: texto, modelo });
  } catch (e) { /* sin tabla: no pasa nada */ }
}

// ─── Carga de una semana ────────────────────────────────────────────────
async function nutCargar(clienteId, semana, { forzar = false } = {}) {
  _nut.cargando = true; _nut.error = null;
  _nut.clienteId = clienteId; _nut.semana = semana;
  rerenderView();
  try {
    const cliente = await db.clientes.get(clienteId);
    if (!cliente) throw new Error('Cliente no encontrado');
    _nut.cliente = cliente;

    if (!mtConfigured()) throw new Error('No hay conexión al Mealtracker. Configúrala en config.js o en Ajustes.');

    if (forzar) _mtMergedCache = { key: null, at: 0, data: null };
    const d = await getMealtrackerDataMerged(cliente);
    if (!d) {
      const causa = await mtDiagnostico(cliente.mealtracker_id || await resolverMealtrackerId(cliente));
      throw new Error(causa);
    }
    _nut.data = d;

    // Peso más reciente, para poder leer la proteína en g/kg
    let peso = null;
    try {
      const meds = await db.mediciones.listCliente(clienteId);
      const conPeso = (meds || []).filter(m => m.peso != null);
      if (conPeso.length) peso = Number(conPeso[conPeso.length - 1].peso);
    } catch (e) { /* sin mediciones */ }

    _nut.analisis = analizarNutricionSemana(d, semana, cliente, peso);
    _nut.ia = await nutCargarIaGuardada(clienteId, semana);
  } catch (e) {
    _nut.error = e.message || String(e);
    _nut.analisis = null;
    _nut.ia = null;
  }
  _nut.cargando = false;
  rerenderView();
}

window.nutElegirCliente = (id) => { _nut.ia = null; nutCargar(id, _nut.semana || fmt.semanaISO()); };
window.nutSemana = (dir) => {
  const s = dir < 0 ? fmt.semanaPrev(_nut.semana) : fmt.semanaNext(_nut.semana);
  if (dir > 0 && s > fmt.semanaISO()) { toast('Esa semana todavía no empieza'); return; }
  nutCargar(_nut.clienteId, s);
};
window.nutRefrescar = () => nutCargar(_nut.clienteId, _nut.semana, { forzar: true });
window.nutTab = (t) => { _nut.tab = t; rerenderView(); };

// ─── Vista ──────────────────────────────────────────────────────────────
routes.nutricion = async () => {
  const clientes = (await db.clientes.list()).filter(c => c.estado !== 'finalizado');

  if (!_nut.semana) _nut.semana = fmt.semanaISO();
  if (!_nut.clienteId && clientes.length) {
    // Arranca en el primero que ya esté vinculado al Mealtracker
    const pref = clientes.find(c => c.mealtracker_id) || clientes[0];
    _nut.clienteId = pref.id;
    nutCargar(pref.id, _nut.semana);
    view.innerHTML = '<div class="card">Cargando alimentación…</div>';
    return;
  }

  const selector = `
    <div class="flex flex-wrap items-center gap-2">
      <select class="text-sm !w-auto min-w-[200px]" onchange="nutElegirCliente(this.value)">
        ${clientes.map(c => `<option value="${c.id}" ${c.id === _nut.clienteId ? 'selected' : ''}>${escapeHtml(c.nombre)}${c.mealtracker_id ? '' : ' (sin vincular)'}</option>`).join('')}
      </select>
      <div class="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
        <button class="btn btn-secondary btn-sm !py-1" onclick="nutSemana(-1)" title="Semana anterior">←</button>
        <span class="text-sm font-bold text-slate-700 px-2 whitespace-nowrap">${fmt.labelSemana(_nut.semana)}</span>
        <button class="btn btn-secondary btn-sm !py-1" onclick="nutSemana(1)" title="Semana siguiente">→</button>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="nutRefrescar()" title="Volver a leer el Mealtracker">🔄 Actualizar</button>
    </div>`;

  const cabecera = `
    <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <h2 class="text-lg font-bold text-slate-900">🥗 Alimentación por cliente</h2>
        <p class="text-xs text-slate-500">Lo que registró en su app, semana a semana · datos en vivo</p>
      </div>
      ${selector}
    </div>`;

  if (_nut.cargando) { view.innerHTML = `${cabecera}<div class="card">Leyendo el Mealtracker…</div>`; return; }
  if (_nut.error) {
    view.innerHTML = `${cabecera}<div class="card border-l-4 border-amber-400"><div class="font-bold text-slate-800 mb-1">No pude leer la alimentación</div><p class="text-sm text-slate-600">${escapeHtml(_nut.error)}</p></div>`;
    return;
  }
  const a = _nut.analisis;
  if (!a) { view.innerHTML = `${cabecera}<div class="card">Sin datos.</div>`; return; }

  const tabs = [
    ['resumen', '📊 Resumen'],
    ['alimentos', '🍽 Alimentos'],
    ['detalle', '📅 Día a día'],
    ['ia', '🧠 Oportunidades'],
  ].map(([k, l]) => `<button class="px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${_nut.tab === k ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}" onclick="nutTab('${k}')">${l}</button>`).join('');

  view.innerHTML = `${cabecera}
    <div class="bg-slate-100 rounded-xl p-1 flex gap-1 mb-4 overflow-x-auto">${tabs}</div>
    ${_nut.tab === 'resumen' ? nutVistaResumen(a)
      : _nut.tab === 'alimentos' ? nutVistaAlimentos(a)
      : _nut.tab === 'detalle' ? nutVistaDetalle(a, _nut.data)
      : nutVistaIA(a)}`;
};

// ── Pestaña: resumen global graficado ──
function nutVistaResumen(a) {
  const c = a.cumplimiento, m = a.meta, p = a.promedio;
  const balance = c.balance_kcal_semana;
  const balanceTxt = balance == null ? '—' : `${balance > 0 ? '+' : ''}${balance.toLocaleString('es-CO')} kcal`;
  const promP = a.promedio.p, promC = a.promedio.c, promG = a.promedio.g;

  return `
  <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
    ${nutKpi('Días registrados', `${a.registro.dias_registrados}/7`,
      a.registro.dias_sin_registro.length ? `Faltó: ${a.registro.dias_sin_registro.join(', ')}` : 'Semana completa',
      a.registro.pct >= 85 ? 'text-emerald-600' : a.registro.pct >= 57 ? 'text-amber-600' : 'text-red-600')}
    ${nutKpi('Kcal promedio', p.kcal ?? '—', m.kcal ? `meta ${m.kcal} · ${c.kcal_pct}%` : 'sin meta', nutColorPct(c.kcal_pct))}
    ${nutKpi('Proteína promedio', p.p != null ? `${p.p} g` : '—',
      c.prote_g_por_kg ? `${c.prote_g_por_kg} g/kg${m.p ? ` · ${c.prote_pct}% de meta` : ''}` : (m.p ? `meta ${m.p} g · ${c.prote_pct}%` : 'sin meta'),
      nutColorPct(c.prote_pct))}
    ${nutKpi('Balance de la semana', balanceTxt,
      balance == null ? 'sin meta' : (balance > 0 ? 'por encima de su meta' : 'por debajo de su meta'),
      balance == null ? 'text-slate-400' : Math.abs(balance) < (m.kcal || 2000) * 0.5 ? 'text-emerald-600' : 'text-amber-600')}
  </div>

  ${a.registro.dias_registrados < 4 ? `
  <div class="card border-l-4 border-amber-400 mb-4">
    <div class="font-bold text-slate-800 text-sm">⚠️ Solo ${a.registro.dias_registrados} día(s) registrados</div>
    <p class="text-xs text-slate-600 mt-1">Con menos de 4 días, los promedios de esta semana no representan cómo come. Antes de ajustarle macros, el trabajo es que registre.</p>
  </div>` : ''}

  ${a.registro.dias_con_detalle < a.registro.dias_registrados ? `
  <div class="card border-l-4 border-slate-300 mb-4">
    <div class="text-xs text-slate-600">De los ${a.registro.dias_registrados} días registrados, <strong>${a.registro.dias_con_detalle}</strong> traen el desglose de alimentos. Las calorías y macros de arriba salen de los ${a.registro.dias_registrados}; los alimentos, la fibra y el azúcar solo de esos ${a.registro.dias_con_detalle}.</div>
  </div>` : ''}

  <div class="card mb-4">
    <div class="sec-title">Calorías día a día</div>
    ${nutBarras(a.dias, 'kcal', m.kcal, '#3b82f6', ' kcal')}
    <div class="text-[11px] text-slate-400 mt-1">Verde = dentro de ±10% de su meta · ámbar = por encima · azul = por debajo · gris = sin registro</div>
  </div>

  <div class="grid md:grid-cols-2 gap-4 mb-4">
    <div class="card">
      <div class="sec-title">Proteína día a día</div>
      ${nutBarras(a.dias, 'p', m.p, '#3b82f6', ' g')}
    </div>
    <div class="card">
      <div class="sec-title">Promedio vs. meta</div>
      <div class="space-y-3 mt-2">
        ${nutBarraMeta('Calorías', p.kcal, m.kcal, ' kcal')}
        ${nutBarraMeta('Proteína', p.p, m.p, ' g')}
        ${nutBarraMeta('Carbohidratos', p.c, m.c, ' g')}
        ${nutBarraMeta('Grasas', p.g, m.g, ' g')}
      </div>
      <div class="text-[11px] text-slate-400 mt-3">La marca gris es el 100% de la meta.</div>
    </div>
  </div>

  <div class="grid md:grid-cols-2 gap-4 mb-4">
    <div class="card">
      <div class="sec-title">Reparto de macros</div>
      <div class="flex items-center justify-around gap-4 mt-2">
        ${nutAnillo(promP || 0, promC || 0, promG || 0, 'Lo que comió')}
        ${m.p && m.c && m.g ? nutAnillo(m.p, m.c, m.g, 'Su meta') : '<div class="text-xs text-slate-400 self-center">Sin meta configurada</div>'}
      </div>
    </div>
    <div class="card">
      <div class="sec-title">Calidad estimada (por día con detalle)</div>
      <div class="grid grid-cols-3 gap-2 mt-2 text-center">
        <div class="bg-slate-50 rounded-xl p-3">
          <div class="text-[10px] uppercase text-slate-400 font-bold">Fibra</div>
          <div class="text-lg font-bold ${p.fibra >= 25 ? 'text-emerald-600' : p.fibra >= 15 ? 'text-amber-600' : 'text-red-500'}">${p.fibra ?? '—'} g</div>
          <div class="text-[10px] text-slate-400">referencia 25-35</div>
        </div>
        <div class="bg-slate-50 rounded-xl p-3">
          <div class="text-[10px] uppercase text-slate-400 font-bold">Omega 3</div>
          <div class="text-lg font-bold ${p.omega3 >= 1.5 ? 'text-emerald-600' : 'text-amber-600'}">${p.omega3 ?? '—'} g</div>
          <div class="text-[10px] text-slate-400">referencia 1,5-3</div>
        </div>
        <div class="bg-slate-50 rounded-xl p-3">
          <div class="text-[10px] uppercase text-slate-400 font-bold">Azúcar añadida</div>
          <div class="text-lg font-bold ${p.azucar <= 25 ? 'text-emerald-600' : p.azucar <= 50 ? 'text-amber-600' : 'text-red-500'}">${p.azucar ?? '—'} g</div>
          <div class="text-[10px] text-slate-400">referencia &lt;25</div>
        </div>
      </div>
      <div class="text-[11px] text-slate-400 mt-2">Promedio de los <strong>${a.registro.dias_con_detalle}</strong> día(s) que traen el desglose de alimentos. Estimado a partir de lo que registró: exacto cuando la app calculó los micros del alimento, aproximado en registros viejos.</div>
      ${p.agua ? `<div class="text-xs text-slate-600 mt-2">💧 Agua: <strong>${p.agua}</strong> ml/día promedio (${p.dias_agua} día(s) con registro de agua)</div>` : ''}
    </div>
  </div>

  <div class="card mb-4">
    <div class="sec-title">Patrones de la semana</div>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2 text-sm">
      <div><div class="text-[10px] uppercase text-slate-400 font-bold">Entre semana</div><div class="font-bold text-slate-800">${a.consistencia.entre_semana_kcal ?? '—'} kcal</div><div class="text-[11px] text-slate-500">${a.consistencia.entre_semana_prote ?? '—'} g prote</div></div>
      <div><div class="text-[10px] uppercase text-slate-400 font-bold">Fin de semana</div><div class="font-bold ${a.consistencia.fin_de_semana_kcal && a.consistencia.entre_semana_kcal && a.consistencia.fin_de_semana_kcal > a.consistencia.entre_semana_kcal * 1.15 ? 'text-amber-600' : 'text-slate-800'}">${a.consistencia.fin_de_semana_kcal ?? '—'} kcal</div><div class="text-[11px] text-slate-500">${a.consistencia.fin_de_semana_prote ?? '—'} g prote</div></div>
      <div><div class="text-[10px] uppercase text-slate-400 font-bold">Variabilidad</div><div class="font-bold text-slate-800">±${a.consistencia.desviacion_kcal ?? '—'} kcal</div><div class="text-[11px] text-slate-500">entre sus días</div></div>
      <div><div class="text-[10px] uppercase text-slate-400 font-bold">Ventana de comida</div><div class="font-bold text-slate-800">${a.consistencia.primera_comida_prom ?? '—'} → ${a.consistencia.ultima_comida_prom ?? '—'}</div><div class="text-[11px] text-slate-500">primera y última</div></div>
    </div>
    ${a.comidas_por_tipo.length ? `
    <div class="mt-4 pt-3 border-t border-slate-100">
      <div class="text-[10px] uppercase text-slate-400 font-bold mb-2">Comidas registradas por tipo</div>
      <div class="flex flex-wrap gap-2">
        ${a.comidas_por_tipo.map(t => `<span class="text-xs bg-slate-100 rounded-lg px-2.5 py-1"><strong class="text-slate-700">${escapeHtml(t.tipo)}</strong> · ${t.veces}× · ${t.kcal_prom} kcal prom</span>`).join('')}
      </div>
    </div>` : ''}
  </div>

  ${nutTarjetaMetas(a)}`;
}

function nutTarjetaMetas(a) {
  const c = _nut.cliente || {};
  return `<div class="grid md:grid-cols-2 gap-4">
    <div class="card bg-violet-50 border-violet-100">
      <div class="text-xs font-bold text-violet-800 uppercase mb-1">🎯 Meta vigente en su app esta semana</div>
      <div class="text-violet-900 font-semibold text-sm">${a.meta.kcal ?? '—'} kcal · ${a.meta.p ?? '—'} g prote · ${a.meta.c ?? '—'} g carbos · ${a.meta.g ?? '—'} g grasas</div>
      <div class="text-[11px] text-violet-700/70 mt-1">Se compara cada semana contra la meta que regía ESA semana, no contra la de hoy.</div>
    </div>
    <div class="card bg-blue-50 border-blue-100">
      <div class="text-xs font-bold text-blue-800 uppercase mb-1">🥗 Meta calculada en el CRM</div>
      <div class="text-blue-900 font-semibold text-sm">${c.meta_calorias ? `${c.meta_calorias} kcal · ${c.meta_proteina_g} g prote · ${c.meta_carbos_g} g carbos · ${c.meta_grasas_g} g grasas` : 'Sin calcular — hazlo en la ficha del cliente (sección 5).'}</div>
      ${c.meta_calorias ? `<button class="btn btn-primary btn-sm mt-2" onclick="enviarMetaMealtracker('${c.id}')">🎯 Enviar meta al Mealtracker</button>` : ''}
    </div>
  </div>`;
}

// ── Pestaña: alimentos ──
function nutVistaAlimentos(a) {
  if (!a.alimentos.length) {
    return '<div class="card">Esta semana no hay comidas registradas con detalle de alimentos.</div>';
  }
  const fila = (f, extra = '') => `
    <tr class="border-b border-slate-50">
      <td class="py-2 pr-2"><div class="font-semibold text-slate-800 text-sm">${escapeHtml(f.nombre)}</div><div class="text-[11px] text-slate-400">${f.veces}× en ${f.dias} día(s)</div></td>
      <td class="text-right whitespace-nowrap"><span class="font-bold text-slate-800">${f.kcal.toLocaleString('es-CO')}</span><div class="text-[11px] text-slate-400">${f.pct_kcal_detalle}% del detalle</div></td>
      <td class="text-right text-xs text-slate-600 whitespace-nowrap">${f.p} / ${f.c} / ${f.g}</td>
      <td class="text-right whitespace-nowrap"><span class="font-bold ${f.densidad_proteica_pct >= 30 ? 'text-emerald-600' : f.densidad_proteica_pct >= 15 ? 'text-amber-600' : 'text-slate-400'}">${f.densidad_proteica_pct}%</span><div class="text-[11px] text-slate-400">${f.fibra} g fibra</div></td>
      ${extra}
    </tr>`;

  const mini = (titulo, lista, nota, color) => `
    <div class="card">
      <div class="sec-title">${titulo}</div>
      <div class="text-[11px] text-slate-400 mb-2 -mt-1">${nota}</div>
      ${lista.length ? lista.map(f => `
        <div class="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
          <div class="min-w-0">
            <div class="font-semibold text-slate-800 text-sm truncate">${escapeHtml(f.nombre)}</div>
            <div class="text-[11px] text-slate-400">${f.veces}× · ${f.kcal.toLocaleString('es-CO')} kcal · ${f.p} g prote${f.azucar > 1 ? ` · ${f.azucar} g azúcar` : ''}</div>
          </div>
          <div class="text-right pl-2 whitespace-nowrap">
            <div class="text-sm font-bold ${color}">${f.densidad_proteica_pct}%</div>
            <div class="text-[10px] text-slate-400">prote/kcal</div>
          </div>
        </div>`).join('') : '<div class="text-xs text-slate-400 py-2">Sin alimentos con peso suficiente esta semana.</div>'}
    </div>`;

  return `
  <div class="grid md:grid-cols-2 gap-4 mb-4">
    <div class="card">
      <div class="sec-title">Los que más calorías aportaron</div>
      <div class="text-[11px] text-slate-400 mb-2 -mt-1">Dónde está de verdad su semana. El top 3 suele explicar más que toda la lista.</div>
      ${a.top_calorias.map(f => `
        <div class="py-1.5 border-b border-slate-50 last:border-0">
          <div class="flex items-center justify-between gap-2">
            <span class="font-semibold text-slate-800 text-sm truncate">${escapeHtml(f.nombre)}</span>
            <span class="text-sm font-bold text-slate-800 whitespace-nowrap">${f.kcal.toLocaleString('es-CO')} kcal</span>
          </div>
          <div class="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden"><div class="h-full rounded-full bg-blue-500" style="width:${Math.min(100, f.pct_kcal_detalle * 3)}%"></div></div>
          <div class="text-[11px] text-slate-400 mt-0.5">${f.pct_kcal_detalle}% de las calorías desglosadas · ${f.veces}× · ${f.kcal_por_vez} kcal por vez</div>
        </div>`).join('')}
    </div>
    <div class="card">
      <div class="sec-title">Los que más repite</div>
      <div class="text-[11px] text-slate-400 mb-2 -mt-1">Su dieta real. Un cambio acá pesa más que cualquier alimento nuevo.</div>
      ${a.top_frecuentes.map(f => `
        <div class="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
          <span class="font-semibold text-slate-800 text-sm truncate">${escapeHtml(f.nombre)}</span>
          <span class="text-xs text-slate-500 whitespace-nowrap"><strong class="text-slate-700">${f.veces}×</strong> · ${f.dias} día(s)</span>
        </div>`).join('')}
    </div>
  </div>

  <div class="grid md:grid-cols-2 gap-4 mb-4">
    ${mini('Mejor densidad nutricional', a.mas_nutritivos, 'Más proteína y fibra por caloría: lo que conviene proteger y repetir.', 'text-emerald-600')}
    ${mini('Menor densidad nutricional', a.menos_nutritivos, 'Muchas calorías con poca proteína o fibra (o con azúcar añadida): el terreno donde hay margen.', 'text-amber-600')}
  </div>

  <div class="card">
    <div class="sec-title">Todo lo que comió esta semana (${a.alimentos.length} alimentos)</div>
    <div class="overflow-x-auto -mx-1 mt-2">
      <table class="w-full text-sm">
        <thead><tr class="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-200">
          <th class="text-left pb-2">Alimento</th><th class="text-right pb-2">Calorías</th>
          <th class="text-right pb-2">P / C / G</th><th class="text-right pb-2">Prote/kcal</th>
        </tr></thead>
        <tbody>${a.alimentos.map(f => fila(f)).join('')}</tbody>
      </table>
    </div>
  </div>`;
}

// ── Pestaña: día a día, con las comidas tal cual las registró ──
function nutVistaDetalle(a, d) {
  const detalle = d?.historyDetail || {};
  return `<div class="space-y-3">
    ${a.dias.map(dia => {
      const entradas = Array.isArray(detalle[dia.fecha]) ? detalle[dia.fecha] : [];
      const pct = a.meta.kcal ? Math.round((dia.kcal / a.meta.kcal) * 100) : null;
      return `<details class="card" ${dia.registrado && entradas.length ? '' : ''}>
        <summary class="cursor-pointer list-none">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span class="font-bold text-slate-800">${dia.dow}</span>
              <span class="text-xs text-slate-400 ml-1">${fmt.fechaCorta(dia.fecha)}</span>
              ${dia.primera ? `<span class="text-[11px] text-slate-400 ml-2">${dia.primera} → ${dia.ultima}</span>` : ''}
            </div>
            ${dia.registrado ? `
            <div class="flex items-center gap-3 text-xs">
              <span class="font-bold ${nutColorPct(pct)}">${dia.kcal.toLocaleString('es-CO')} kcal${pct != null ? ` (${pct}%)` : ''}</span>
              <span class="text-slate-500">P ${dia.p} · C ${dia.c} · G ${dia.g}</span>
              <span class="text-slate-400">${dia.comidas} comida(s)</span>
            </div>` : '<span class="text-xs text-slate-400">Sin registro</span>'}
          </div>
        </summary>
        ${entradas.length ? `
        <div class="mt-3 pt-3 border-t border-slate-100 space-y-2">
          ${entradas.map(e => `
            <div class="bg-slate-50 rounded-xl p-3">
              <div class="flex items-center justify-between text-xs mb-1.5">
                <span class="font-bold text-slate-700 uppercase tracking-wide">${escapeHtml(String(e.meal || 'comida'))}${e.time ? ` · ${escapeHtml(e.time)}` : ''}</span>
                <span class="text-slate-500 font-semibold">${nutR0(e.kcal)} kcal · P ${nutR1(e.p)} · C ${nutR1(e.c)} · G ${nutR1(e.g)}</span>
              </div>
              ${(e.items || []).length ? `<div class="space-y-0.5">${e.items.map(it => `
                <div class="flex items-center justify-between text-xs">
                  <span class="text-slate-700">${escapeHtml(String(it.name || ''))}${it.amount ? ` <span class="text-slate-400">(${escapeHtml(String(it.amount))})</span>` : ''}</span>
                  <span class="text-slate-500 whitespace-nowrap pl-2">${nutR0(it.kcal)} kcal${it.p ? ` · ${nutR1(it.p)} g P` : ''}</span>
                </div>`).join('')}</div>` : ''}
              ${e.rawInput ? `<div class="text-[11px] text-slate-400 mt-1.5 italic">“${escapeHtml(String(e.rawInput).slice(0, 160))}”</div>` : ''}
            </div>`).join('')}
          ${(dia.energia != null || dia.hambre != null || dia.animo != null) ? `
          <div class="text-[11px] text-slate-500 pt-1">Ese día reportó: ${[dia.energia != null ? `energía ${dia.energia}/5` : '', dia.hambre != null ? `hambre ${dia.hambre}/5` : '', dia.animo != null ? `ánimo ${dia.animo}/5` : ''].filter(Boolean).join(' · ')}</div>` : ''}
        </div>` : (dia.registrado ? '<div class="mt-2 text-xs text-slate-400">Registró totales pero sin el detalle de alimentos.</div>' : '')}
      </details>`;
    }).join('')}
  </div>`;
}

// ─── Oportunidades de mejora (Claude) ───────────────────────────────────
// El navegador manda SOLO el análisis ya calculado; el prompt de coach y la
// API key viven en /api/coach-insight.js. La respuesta llega por streaming y
// se pinta a medida que se genera.

// Parser del formato @@BLOQUE. Tolera respuestas a medio llegar: lo que ya
// está completo se pinta, lo que falta simplemente todavía no aparece.
function nutParseIa(txt) {
  const out = { diagnostico: '', oportunidades: [], noTocar: '', preguntas: [], alerta: '' };
  if (!txt) return out;
  const partes = String(txt).split(/\n?@@/g).filter(s => s.trim());
  for (const parte of partes) {
    const nl = parte.indexOf('\n');
    const head = (nl === -1 ? parte : parte.slice(0, nl)).trim().toUpperCase();
    const body = (nl === -1 ? '' : parte.slice(nl + 1)).trim();
    if (head === 'DIAGNOSTICO' || head === 'DIAGNÓSTICO') out.diagnostico = body;
    else if (head === 'OPORTUNIDAD') {
      const o = { titulo: '', impacto: '', dato: '', porque: '', accion: '', mensaje: '' };
      let campo = null;
      for (const linea of body.split('\n')) {
        const m = linea.match(/^\s*(titulo|título|impacto|dato|porque|por qué|porqué|accion|acción|mensaje)\s*:\s*(.*)$/i);
        if (m) {
          const k = m[1].toLowerCase();
          campo = k.startsWith('tit') ? 'titulo'
            : k.startsWith('imp') ? 'impacto'
            : k.startsWith('dat') ? 'dato'
            : k.startsWith('por') ? 'porque'
            : k.startsWith('acc') ? 'accion' : 'mensaje';
          o[campo] = m[2].trim();
        } else if (campo) {
          o[campo] += (o[campo] ? '\n' : '') + linea.trim();
        }
      }
      if (o.titulo || o.accion || o.mensaje) out.oportunidades.push(o);
    }
    else if (head === 'NO_TOCAR') out.noTocar = body;
    else if (head === 'PREGUNTAS') out.preguntas = body.split('\n').map(s => s.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
    else if (head === 'ALERTA') out.alerta = /^ningun/i.test(body) ? '' : body;
  }
  return out;
}

const NUT_IMPACTO = {
  alto: ['bg-red-50', 'text-red-700', 'border-red-200'],
  medio: ['bg-amber-50', 'text-amber-700', 'border-amber-200'],
  bajo: ['bg-slate-50', 'text-slate-600', 'border-slate-200'],
};

function nutRenderIa(txt) {
  const r = nutParseIa(txt);
  if (!r.diagnostico && !r.oportunidades.length) {
    return `<div class="text-sm text-slate-500 whitespace-pre-wrap">${escapeHtml(txt || '')}</div>`;
  }
  return `
    ${r.diagnostico ? `<div class="card bg-slate-900 text-white border-0 mb-4">
      <div class="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Diagnóstico de la semana</div>
      <div class="text-sm leading-relaxed whitespace-pre-wrap">${escapeHtml(r.diagnostico)}</div>
    </div>` : ''}

    ${r.oportunidades.map((o, i) => {
      const imp = NUT_IMPACTO[(o.impacto || 'medio').toLowerCase()] || NUT_IMPACTO.medio;
      return `<div class="card mb-3 border-l-4 ${imp[2].replace('border-', 'border-l-')}">
        <div class="flex items-start justify-between gap-3 mb-2">
          <div class="font-bold text-slate-900">${i + 1}. ${escapeHtml(o.titulo || 'Oportunidad')}</div>
          ${o.impacto ? `<span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${imp[0]} ${imp[1]} whitespace-nowrap">impacto ${escapeHtml(o.impacto)}</span>` : ''}
        </div>
        ${o.dato ? `<div class="text-xs bg-slate-50 rounded-lg px-3 py-2 mb-2 font-mono text-slate-700">📊 ${escapeHtml(o.dato)}</div>` : ''}
        ${o.porque ? `<div class="text-sm text-slate-600 mb-2"><span class="font-semibold text-slate-700">Por qué importa:</span> ${escapeHtml(o.porque)}</div>` : ''}
        ${o.accion ? `<div class="text-sm text-slate-800 mb-2"><span class="font-semibold">Qué hacer:</span> ${escapeHtml(o.accion)}</div>` : ''}
        ${o.mensaje ? `<div class="bg-emerald-50 border border-emerald-100 rounded-xl p-3 mt-2">
          <div class="flex items-center justify-between mb-1">
            <span class="text-[10px] uppercase tracking-wider font-bold text-emerald-800">Para copiarle al cliente</span>
            <button class="text-[11px] font-semibold text-emerald-700 hover:underline" onclick="nutCopiar(${i})">📋 Copiar</button>
          </div>
          <div class="text-sm text-emerald-900 whitespace-pre-wrap" id="nut-msg-${i}">${escapeHtml(o.mensaje)}</div>
        </div>` : ''}
      </div>`;
    }).join('')}

    ${r.noTocar ? `<div class="card bg-emerald-50 border-emerald-100 mb-3">
      <div class="text-[10px] uppercase tracking-wider font-bold text-emerald-800 mb-1">✅ Esto NO se toca esta semana</div>
      <div class="text-sm text-emerald-900 whitespace-pre-wrap">${escapeHtml(r.noTocar)}</div>
    </div>` : ''}

    ${r.preguntas.length ? `<div class="card mb-3">
      <div class="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">❓ Pregúntale antes de ajustar</div>
      <ul class="text-sm text-slate-700 space-y-1 list-disc pl-5">${r.preguntas.map(q => `<li>${escapeHtml(q)}</li>`).join('')}</ul>
    </div>` : ''}

    ${r.alerta ? `<div class="card bg-amber-50 border-amber-200">
      <div class="text-[10px] uppercase tracking-wider font-bold text-amber-800 mb-1">⚠️ Para vigilar o derivar</div>
      <div class="text-sm text-amber-900">${escapeHtml(r.alerta)}</div>
    </div>` : ''}`;
}

window.nutCopiar = (i) => {
  const el = document.getElementById(`nut-msg-${i}`);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent.trim())
    .then(() => toast('✓ Mensaje copiado'))
    .catch(() => toast('No pude copiar'));
};

function nutVistaIA(a) {
  const yaHay = !!_nut.ia?.texto;
  return `
  <div class="card mb-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="max-w-xl">
        <h3 class="font-bold text-slate-900">🧠 Oportunidades de mejora</h3>
        <p class="text-xs text-slate-500 mt-1">Claude lee el análisis completo de esta semana (registro, macros, alimentos, patrones, su objetivo y sus restricciones) y te devuelve las 3-5 palancas que de verdad mueven la aguja, con el mensaje listo para enviarle.</p>
        ${yaHay ? `<p class="text-[11px] text-slate-400 mt-1">Última generación: ${_fmtDateTime(_nut.ia.at)}</p>` : ''}
      </div>
      <button class="btn btn-primary" id="nut-ia-btn" onclick="nutGenerarIA()">${yaHay ? '🔄 Volver a generar' : '✨ Generar oportunidades'}</button>
    </div>
    <details class="mt-3">
      <summary class="cursor-pointer text-xs font-semibold text-slate-500">➕ Agregar contexto que la data no ve (opcional)</summary>
      <textarea id="nut-ia-nota" rows="2" class="text-sm mt-2" placeholder="Ej: viajó jueves y viernes · está con gastritis · dijo que el gym le queda lejos esta semana"></textarea>
    </details>
    ${a.registro.dias_registrados < 3 ? '<div class="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">Con menos de 3 días registrados, lo único que la IA puede recomendar honestamente es que registre. Igual puedes generarlo.</div>' : ''}
  </div>
  <div id="nut-ia-out">${yaHay ? nutRenderIa(_nut.ia.texto) : '<div class="card text-sm text-slate-400">Todavía no has generado las oportunidades de esta semana.</div>'}</div>`;
}

window.nutGenerarIA = async () => {
  const a = _nut.analisis;
  if (!a) { toast('Primero carga una semana'); return; }
  const btn = document.getElementById('nut-ia-btn');
  const out = document.getElementById('nut-ia-out');
  const nota = (document.getElementById('nut-ia-nota')?.value || '').trim();
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Analizando…'; }
  if (out) out.innerHTML = '<div class="card text-sm text-slate-500">Leyendo la semana y buscando las palancas…</div>';

  let texto = '';
  try {
    const r = await fetch('/api/coach-insight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analisis: a, extra: nota }),
    });
    if (!r.ok || !r.body) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.code === 'no_api_key'
        ? 'Falta la variable ANTHROPIC_API_KEY en el proyecto del CRM en Vercel (Settings → Environment Variables) y volver a desplegar.'
        : (err.error || `El servidor respondió ${r.status}`));
    }
    // SSE de Anthropic: solo nos interesan los text_delta del bloque de texto.
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let ultimoPintado = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lineas = buf.split('\n');
      buf = lineas.pop() || '';
      for (const linea of lineas) {
        if (!linea.startsWith('data:')) continue;
        const raw = linea.slice(5).trim();
        if (!raw || raw === '[DONE]') continue;
        let ev; try { ev = JSON.parse(raw); } catch (e) { continue; }
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') texto += ev.delta.text;
        if (ev.type === 'error') throw new Error(ev.error?.message || 'Error de la API');
      }
      // Repintar como mucho 4 veces por segundo: el parser corre sobre todo
      // el texto y no vale la pena hacerlo en cada chunk.
      if (out && Date.now() - ultimoPintado > 250) {
        ultimoPintado = Date.now();
        out.innerHTML = nutRenderIa(texto) + '<div class="text-xs text-slate-400 mt-2">✍️ escribiendo…</div>';
      }
    }
    if (!texto.trim()) throw new Error('La respuesta llegó vacía. Intenta de nuevo.');
    _nut.ia = { texto, at: new Date().toISOString(), modelo: 'claude-opus-5' };
    if (out) out.innerHTML = nutRenderIa(texto);
    await nutGuardarIa(_nut.clienteId, _nut.semana, texto, 'claude-opus-5');
    toast('✓ Oportunidades listas');
  } catch (e) {
    if (out) out.innerHTML = `<div class="card border-l-4 border-red-400">
      <div class="font-bold text-slate-800 mb-1">No pude generar las oportunidades</div>
      <p class="text-sm text-slate-600">${escapeHtml(e.message || String(e))}</p>
      ${texto ? `<div class="mt-3 pt-3 border-t border-slate-100">${nutRenderIa(texto)}</div>` : ''}
    </div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = _nut.ia?.texto ? '🔄 Volver a generar' : '✨ Generar oportunidades'; }
  }
};

// Botón "Nutrición" en la barra de navegación (mismo truco que el de IA:
// se clona un botón existente para no depender del HTML del shell).
(function addNutricionNav() {
  try {
    const anchor = document.querySelector('.nav-item');
    if (!anchor || document.querySelector('.nav-item[data-view="nutricion"]')) return;
    const btn = anchor.cloneNode(true);
    btn.dataset.view = 'nutricion';
    btn.classList.remove('active');
    btn.textContent = '🥗 Nutrición';
    const negocio = document.querySelector('.nav-item[data-view="negocio"]');
    anchor.parentNode.insertBefore(btn, negocio || null);
    btn.addEventListener('click', () => navigate('nutricion'));
  } catch (e) { /* si el shell cambia, no rompe nada */ }
})();

// Atajo desde la ficha del cliente: abre la sección ya parada en ese cliente.
window.verNutricionCliente = (clienteId) => {
  _nut.clienteId = clienteId;
  _nut.semana = _nut.semana || fmt.semanaISO();
  _nut.ia = null;
  closeModal();
  navigate('nutricion');
  nutCargar(clienteId, _nut.semana);
};
