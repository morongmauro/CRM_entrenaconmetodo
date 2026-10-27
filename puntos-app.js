// ─────────────────────────────────────────────────────────────────────────
// LO QUE EL CLIENTE VE EN SUS GRÁFICAS · primero en Seguimiento
//
// Los mismos números de los aros de su app (Dash):
//   Semana         promedio del entreno y la comida (el aprendizaje no entra)
//   Entrenamiento  rutinas hechas de las planeadas esta semana
//   Alimentación   días registrados de 7
//   Aprendizaje    piezas vistas del centro de recursos
// y debajo su performance: la fuerza de las últimas 8 semanas (% de lo
// planeado), las calorías contra su meta y qué tan cerca quedó de sus metas.
//
// Las reglas son copia de src/aros.js, src/Dash.jsx (datosComida) y
// src/aprendizaje.js de la app: si cambian allá, se cambian aquí.
// Los datos: /api/coach-data?action=puntos (su comida, sus metas y su
// semana de entreno, leídos como los lee su app) y reading_state del centro.
// ─────────────────────────────────────────────────────────────────────────

// «Sobre el programa» como lo cuenta la app (aprendizaje.js · HUB).
const PA_HUB = [
  { id: 'programa', title: 'El método y sus pilares' },
  { id: 'journey', title: 'Tu trayecto: las 6 fases' },
  { id: 'faq', title: 'Preguntas frecuentes' },
  { id: 'recorrido', title: 'Recorrido de la app' },
];
function paBloques() {
  return [
    { k: 'hub', titulo: 'Sobre el programa', fuentes: ['hub'], prefijo: /^$/, catalogo: PA_HUB },
    { k: 'guia', titulo: 'Guía', fuentes: ['guia', 'ga'], prefijo: /^$/, catalogo: CENTRO_GUIA },
    { k: 'capsula', titulo: 'Cápsulas', fuentes: ['capsula'], prefijo: /^cap:/, catalogo: CENTRO_CAPSULAS },
    { k: 'podcast', titulo: 'Videos', fuentes: ['podcast'], prefijo: /^pod:/, catalogo: CENTRO_PODCASTS },
  ];
}
const paNormal = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// aprendizaje.js · avanceAprendizaje
function paAprendizaje(filas, nombre) {
  const yo = paNormal(nombre);
  const mias = (filas || []).filter(f => paNormal(f.client_name) === yo);
  const bloques = paBloques().map(b => {
    const vistos = new Set(mias.filter(f => b.fuentes.includes(f.source)).map(f => String(f.section_key || '').replace(b.prefijo, '')));
    const vistas = b.catalogo.filter(c => vistos.has(c.id)).length;
    return { k: b.k, titulo: b.titulo, vistas, total: b.catalogo.length };
  });
  const vistas = bloques.reduce((a, b) => a + b.vistas, 0);
  const total = bloques.reduce((a, b) => a + b.total, 0);
  return { bloques, vistas, total, pct: total ? Math.round((vistas / total) * 100) : 0 };
}

const paDias = (f, n) => { const [y, m, d] = f.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, d + n)); return x.toISOString().slice(0, 10); };
const paLunes = (f) => { const [y, m, d] = f.split('-').map(Number); return paDias(f, -((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7)); };

// aros.js · cumplimientoComidaSemana + progresoComida
function paComida(history = {}, goals = {}, hoy) {
  let registrados = 0, pendientes = 0, suma = 0, dias = 0;
  const metas = ['kcal', 'p', 'c', 'g'].filter(k => Number(goals && goals[k]) > 0);
  for (let f = paLunes(hoy); f <= hoy; f = paDias(f, 1)) {
    const t = history[f];
    const tiene = !!t && Number(t.kcal) > 0;
    if (tiene) registrados++; else if (f < hoy) pendientes++;
    if (f === hoy && !tiene) continue;
    dias++;
    if (!tiene || !metas.length) continue;
    suma += metas.reduce((a, k) => {
      const v = Number(t[k]) || 0, m = Number(goals[k]);
      return a + (k === 'p' ? Math.min(1, v / m) : Math.max(0, 1 - Math.abs(v - m) / m));
    }, 0) / metas.length;
  }
  return { registrados, total: 7, pendientes, cerca: metas.length && dias ? suma / dias : null };
}

// Dash.jsx · datosComida: el promedio de calorías de los días registrados
// de los 7 antes de hoy, contra su meta (el anillo verde de Alimentación).
function paCalorias(history = {}, goals = {}, hoy) {
  const meta = Number(goals && goals.kcal) || 0;
  if (!meta) return null;
  const kcal = [];
  for (let i = 7; i >= 1; i--) { const t = history[paDias(hoy, -i)]; if (t && Number(t.kcal) > 0) kcal.push(Number(t.kcal)); }
  if (!kcal.length) return null;
  const prom = kcal.reduce((a, v) => a + v, 0) / kcal.length;
  return { pct: Math.round((prom / meta) * 100), valor: Math.round(prom), meta, dias: kcal.length };
}

// aros.js · progresoEntreno + partesSemana + aroSemana, y la fuerza de las
// 8 semanas del Dash.
function paPuntos(r, lecturas, nombre) {
  const hoy = r.hoy || fmt.hoy();
  const f = r.semana && r.semana.fuerza;
  const e = f && f.planeados ? {
    hechas: f.hechos, planeadas: f.planeados,
    pendientes: Math.max(0, (f.planeados_hoy != null ? f.planeados_hoy : f.planeados) - f.hechos),
  } : null;
  const c = paComida(r.history || {}, r.goals || {}, hoy);
  const fracE = e ? (e.planeadas ? e.hechas / e.planeadas : 0) : null;
  const fracC = c.registrados / c.total;
  const con = [fracE, fracC].filter(x => x != null);
  const global = con.length ? con.reduce((a, x) => a + x, 0) / con.length : null;
  const ocho = (r.semanas || []).slice(-8).filter(w => w.planeados > 0).map(w => Math.min(100, Math.round((w.hechos / w.planeados) * 100)));
  return {
    hoy, e, c, fracE, fracC, global,
    alDia: (e ? e.pendientes : 0) + c.pendientes === 0,
    fuerza8: ocho.length ? Math.round(ocho.reduce((a, v) => a + v, 0) / ocho.length) : null,
    calorias: paCalorias(r.history || {}, r.goals || {}, hoy),
    aprende: lecturas ? paAprendizaje(lecturas, nombre) : null,
    bono: Number(r.semana && r.semana.bono) || 0, penal: Number(r.semana && r.semana.penal) || 0,
  };
}

const paMil = (n) => Number(n || 0).toLocaleString('es-CO');
const paPct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);

function paAro(frac, color, centro) {
  const R = 22, L = 2 * Math.PI * R, v = Math.max(0, Math.min(1, frac || 0));
  return `<svg class="pa-aro" viewBox="0 0 56 56" aria-hidden="true">
    <circle cx="28" cy="28" r="${R}" fill="none" stroke="#EEF0F3" stroke-width="6"/>
    <circle cx="28" cy="28" r="${R}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"
      stroke-dasharray="${(L * v).toFixed(1)} ${L.toFixed(1)}" transform="rotate(-90 28 28)"/>
    <text x="28" y="32" text-anchor="middle" font-size="12.5" font-weight="750" fill="#1F1F1F">${centro}</text>
  </svg>`;
}

function paTile(clave, nombre, frac, color, centro, linea, extra = '') {
  return `<div class="pa-tile" data-pa="${clave}">
    ${paAro(frac, color, centro)}
    <div class="pa-txt"><div class="pa-n">${nombre}</div><div class="pa-v">${linea}</div>${extra ? `<div class="pa-x">${extra}</div>` : ''}</div>
  </div>`;
}

function paHTML(p) {
  const e = p.e, c = p.c, a = p.aprende;
  const sinHacer = e && e.pendientes ? `${e.pendientes} sin hacer` : '';
  const sinReg = c.pendientes ? `${c.pendientes} sin registrar` : '';
  const perf = [
    p.fuerza8 != null ? `<span data-pa-fuerza8>Fuerza, 8 semanas <b>${p.fuerza8}%</b> de lo planeado</span>` : '',
    p.calorias ? `<span data-pa-kcal>Calorías <b>${p.calorias.pct}%</b> de su meta <i>(${paMil(p.calorias.valor)} de ${paMil(p.calorias.meta)} kcal, ${p.calorias.dias} día${p.calorias.dias === 1 ? '' : 's'})</i></span>` : '',
    c.cerca != null ? `<span data-pa-cerca>Cerca de sus metas <b>${paPct(c.cerca)}</b></span>` : '',
    p.bono > 0 ? `<span>+${p.bono} por cardio y deportes</span>` : '',
    p.penal > 0 ? `<span>−${String(p.penal).replace('.', ',')} por lo que le pusiste sin marcar</span>` : '',
  ].filter(Boolean);
  return `
    <div class="pa-cab"><span class="es-k">Lo que ve en sus gráficas</span><span class="pa-sub">Su app, esta semana · ${p.alDia ? 'al día' : 'en marcha'}</span></div>
    <div class="pa-grid">
      ${paTile('global', 'Semana', p.global, '#1F1F1F', paPct(p.global), 'Entreno y comida', 'El aprendizaje no entra')}
      ${paTile('entreno', 'Entrenamiento', p.fracE, '#3C7BD6', paPct(p.fracE), e ? `${e.hechas} de ${e.planeadas} rutinas` : 'Sin rutinas planeadas', sinHacer)}
      ${paTile('comida', 'Alimentación', p.fracC, '#46965A', paPct(p.fracC), `${c.registrados} de 7 días registrados`, sinReg)}
      ${a ? paTile('aprende', 'Aprendizaje', a.pct / 100, '#EE8434', `${a.pct}%`, `${a.vistas} de ${a.total} piezas vistas`,
        a.bloques.map(b => `${b.titulo} ${b.vistas}/${b.total}`).join(' · '))
        : paTile('aprende', 'Aprendizaje', 0, '#EE8434', '—', 'No pude leer el centro')}
    </div>
    ${perf.length ? `<div class="pa-perf" data-pa-perf><span class="pa-perf-k">Performance</span>${perf.join('')}</div>` : ''}`;
}

function paTarjetaHTML() {
  return `<div class="es-card pa-card" id="seg-puntos" data-seg-puntos><div class="pa-cab"><span class="es-k">Lo que ve en sus gráficas</span></div><div class="es-vacio">Leyendo su app…</div></div>`;
}

async function paPintar(c) {
  const caja = document.getElementById('seg-puntos');
  if (!caja || !c) return;
  const poner = (html) => { if (caja.isConnected && (typeof _es === 'undefined' || _es.cliente === c)) caja.innerHTML = html; };
  const vacio = (t) => poner(`<div class="pa-cab"><span class="es-k">Lo que ve en sus gráficas</span></div><div class="es-vacio">${t}</div>`);
  if (typeof mtConfigured === 'function' && !mtConfigured()) return vacio('Conecta su app en Ajustes para ver sus números.');
  let r = null, lecturas = null;
  try {
    const mtId = await resolverMealtrackerId(c);
    if (!mtId) return vacio('Este cliente no está vinculado con su app.');
    [r, lecturas] = await Promise.all([
      mtApiGet(`/api/coach-data?action=puntos&user_id=${encodeURIComponent(mtId)}`),
      typeof cargarLecturasCentro === 'function' ? cargarLecturasCentro().catch(() => null) : null,
    ]);
  } catch (e) { r = null; }
  if (!r || !r.ok) return vacio('No pude leer su app.');
  poner(paHTML(paPuntos(r, lecturas, r.name || c.nombre)));
}
window.paPintar = paPintar;
