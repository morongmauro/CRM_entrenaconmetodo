// =====================================================
// ENGANCHE · quién usa la app, qué usa y quién se está enfriando
// =====================================================
// Una sección con:
//   · arriba, 5 cifras: usaron la app 3+ días en los últimos 7, se están
//     enfriando (5+ días sin actividad), recetas (abiertas o cocinadas) y
//     menús creados, entrenos que se terminan (fluidez) y retención (siguen
//     activos tras el mes 1 y tras el mes 2);
//   · filtros: se están enfriando, bajando, nunca usan recetas, no registran
//     comida, más enganchados;
//   · la lista: una fila por cliente activo con su puntaje, sus días en la
//     app, qué usa, recetas, fluidez y el siguiente paso sugerido;
//   · al tocar uno, el 1 a 1: qué usó día por día (28 días) y sus indicadores.
//
// De dónde sale cada cosa (solo lee; no cambia nada de ningún cliente):
//   · lo que abre en la app (secciones y recetas): `app_uso` del Supabase de
//     la app (api/uso), vía /api/coach-data?action=uso;
//   · días con comida registrada, recetas cocinadas, menús y favoritos:
//     /api/coach-data?action=list;
//   · entrenos (hechos, sin terminar) y lo planeado: `sesiones` y `fases`.
//
// Puntaje de enganche (0 a 100), últimos 28 días:
//   40 % días activo en la app (20 o más = completo) · 30 % entrenos hechos
//   contra los planeados · 30 % días con comida registrada (21 o más =
//   completo). Si no hay plan de entreno, su parte se reparte entre las otras.
//   La tendencia es la diferencia con los 28 días anteriores.
//
// Carga DESPUÉS de app.js y entrenamiento.js.
// =====================================================

const _eng = { filtro: 'todos', datos: null, abierto: null };
const ENG_SECC = [['entreno', 'Entreno'], ['comida', 'Comida'], ['recetas', 'Recetas'], ['aprende', 'Aprende'], ['comunidad', 'Comunidad'], ['chat', 'Chat'], ['fichas', 'Ficha']];
const ENG_TONO = { entreno: ['#E8EEF8', '#2F6CC4'], comida: ['#E4F1E7', '#2F7F45'], recetas: ['#FDEFD9', '#B4541D'], aprende: ['#FCE9DB', '#C95F17'], comunidad: ['#EDE7F8', '#6A4FB0'], chat: ['#EFEFF1', '#3A3A3C'], fichas: ['#EEF0F2', '#454B54'] };
const ENG_LETRAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const engSumar = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const x = new Date(y, m - 1, d + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const engEntre = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
const engNorm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const engLetra = (iso) => ENG_LETRAS[(new Date(iso + 'T12:00:00').getDay() + 6) % 7];

// Los entrenos que tocaban entre dos fechas: los días de la fase de cada fecha.
// `fuera`: días que estuvo fuera (viaje, enfermedad…): no se planean.
function engPlaneados(fases, desde, hasta, fuera = null) {
  let n = 0;
  for (let f = desde; f <= hasta; f = engSumar(f, 1)) {
    if (fuera && fuera.has(f)) continue;
    const fa = fases.find(x => x.fecha_inicio && x.fecha_inicio <= f && engSumar(x.fecha_inicio, (Number(x.semanas) || 0) * 7 - 1) >= f);
    if (fa && (fa.dias_semana || []).map(String).includes(engLetra(f))) n++;
  }
  return n;
}

// Puro (la prueba lo usa): de lo leído a los indicadores de un cliente.
//   uso: [{ fecha, secciones: {…}, recetas: […] }] · mt: el resumen de la app
//   (day_scores, recetas_registradas, menus_creados, favoritos) · sesiones y
//   fases del CRM.
function engCliente({ c, hoy, uso = [], mt = null, sesiones = [], fases = [], fuera = null, centro = null }) {
  const d28 = engSumar(hoy, -27), d56 = engSumar(hoy, -55), d14 = engSumar(hoy, -13), d7 = engSumar(hoy, -6);
  const dias = {};   // sección → Set de fechas
  ENG_SECC.forEach(([k]) => { dias[k] = new Set(); });
  const app = new Set();
  const abiertas = {};
  uso.forEach(u => {
    if (!u || !u.fecha) return;
    app.add(u.fecha);
    Object.keys(u.secciones || {}).forEach(k => { if (dias[k]) dias[k].add(u.fecha); });
    (u.recetas || []).forEach(r => { if (u.fecha >= d28) abiertas[r] = (abiertas[r] || 0) + 1; if (dias.recetas) dias.recetas.add(u.fecha); });
  });
  // Respira: cada vez que la terminó (fecha, hora, segundos, desde dónde).
  const respira = [];
  uso.forEach(u => { const r = u && u.secciones && u.secciones.respira; if (Array.isArray(r)) r.forEach(x => respira.push({ fecha: u.fecha, ...x })); });
  respira.sort((a, b) => `${b.fecha} ${b.h}`.localeCompare(`${a.fecha} ${a.h}`));
  const resp28 = respira.filter(x => x.fecha >= d28);
  // Ficha del ejercicio: cada vez que la abrió (fecha, hora, ejercicio).
  const fichas = [];
  uso.forEach(u => { const r = u && u.secciones && u.secciones.fichas; if (Array.isArray(r)) r.forEach(x => fichas.push({ fecha: u.fecha, ...x })); });
  fichas.sort((a, b) => `${b.fecha} ${b.h}`.localeCompare(`${a.fecha} ${a.h}`));
  const fich28 = fichas.filter(x => x.fecha >= d28);
  const porEj = {}; fich28.forEach(x => { const k = x.n || x.e || 'Ejercicio'; porEj[k] = (porEj[k] || 0) + 1; });
  const hechas = sesiones.filter(s => s.estado === 'completada' && !s.bloque);
  hechas.forEach(s => { dias.entreno.add(s.fecha); app.add(s.fecha); });
  const comidaDias = new Set(Object.keys((mt && mt.day_scores) || {}));
  comidaDias.forEach(f => { dias.comida.add(f); app.add(f); });
  const cocinadas = ((mt && mt.recetas_registradas) || []).filter(r => r.fecha >= d28);
  cocinadas.forEach(r => { dias.recetas.add(r.fecha); app.add(r.fecha); });
  const enRango = (set, a, b) => [...set].filter(f => f >= a && f <= b).length;
  const puntaje = (a, b) => {
    const activos = enRango(app, a, b);
    const plan = engPlaneados(fases, a, b, fuera);
    const hechosV = hechas.filter(s => s.fecha >= a && s.fecha <= b).length;
    const comida = enRango(comidaDias, a, b);
    const partes = [[0.4, Math.min(1, activos / 20)], [0.3, plan > 0 ? Math.min(1, hechosV / plan) : null], [0.3, Math.min(1, comida / 21)]].filter(p => p[1] != null);
    const peso = partes.reduce((x, p) => x + p[0], 0);
    return { valor: Math.round((partes.reduce((x, p) => x + p[0] * p[1], 0) / peso) * 100), activos, plan, hechos: hechosV, comida };
  };
  const ahora = puntaje(d28, hoy), antes = puntaje(d56, engSumar(d28, -1));
  const huboAntes = antes.activos > 0;
  const ultima = [...app].filter(f => f <= hoy).sort().pop() || null;
  // Semanas seguidas activo: 2 o más días con actividad, de la semana en curso hacia atrás.
  const lunes = engSumar(hoy, -((new Date(hoy + 'T12:00:00').getDay() + 6) % 7));
  let semanas = 0;
  for (let k = 0; k < 26; k++) {
    const a = engSumar(lunes, -7 * k), b = engSumar(a, 6);
    const n = enRango(app, a, b);
    if (n >= 2) semanas++;
    else if (k === 0) continue;   // la semana en curso todavía puede llenarse
    else break;
  }
  // Fluidez: entrenos terminados contra los empezados (los de días ya pasados sin terminar).
  const empezadas = sesiones.filter(s => !s.bloque && s.fecha >= d28 && (s.estado === 'completada' || (s.estado !== 'saltada' && s.fecha < hoy)));
  const term = empezadas.filter(s => s.estado === 'completada').length;
  const usa = ENG_SECC.filter(([k]) => enRango(dias[k], d14, hoy) > 0).map(([k]) => k);
  const mes = c.fecha_inicio ? Math.max(1, Math.floor(engEntre(c.fecha_inicio, hoy) / 30) + 1) : null;
  return {
    c, hoy, dias, app,
    score: ahora.valor, tendencia: huboAntes ? ahora.valor - antes.valor : null,
    activos28: ahora.activos, activos7: enRango(app, d7, hoy), activos7antes: enRango(app, engSumar(d7, -7), engSumar(d7, -1)),
    plan28: ahora.plan, hechos28: ahora.hechos, comida28: ahora.comida,
    ultima, sinActividad: ultima ? engEntre(ultima, hoy) : null,
    semanas, mes,
    fluidez: empezadas.length ? Math.round((term / empezadas.length) * 100) : null, sinTerminar: empezadas.length - term,
    usa,
    abiertas: Object.entries(abiertas).sort((a, b) => b[1] - a[1]),
    cocinadas,
    menus: (mt && mt.menus_creados) || 0, favoritos: (mt && mt.favoritos) || 0,
    conApp: !!mt,
    respira: {
      veces: resp28.length, dias: new Set(resp28.map(x => x.fecha)).size,
      minutos: Math.round(resp28.reduce((a, x) => a + (Number(x.s) || 0), 0) / 60),
      ultima: respira[0] || null, lista: respira.slice(0, 12),
      origenes: resp28.reduce((o, x) => { const k = x.o || 'otro'; o[k] = (o[k] || 0) + 1; return o; }, {}),
    },
    fichas: {
      veces: fich28.length, dias: new Set(fich28.map(x => x.fecha)).size, ejercicios: Object.keys(porEj).length,
      ultima: fichas[0] || null, top: Object.entries(porEj).sort((a, b) => b[1] - a[1]).slice(0, 3),
    },
    centro,
  };
}

// El siguiente paso: una sola cosa, la más urgente.
function engPaso(f) {
  const recetas = f.abiertas.length + f.cocinadas.length;
  if (f.sinActividad == null) return 'Escríbele: todavía no usa la app';
  if (f.sinActividad >= 5) return `Escríbele: ${f.sinActividad} días sin abrir${f.mes === 1 ? ', mes 1' : ''}`;
  if (f.tendencia != null && f.tendencia <= -10) return `Pregúntale cómo va: su uso bajó ${-f.tendencia} puntos`;
  if (f.plan28 > 0 && f.hechos28 === 0) return 'Pregúntale por el entreno: no registra rutinas';
  if (f.comida28 < 4) return 'Pregúntale por la comida: casi no registra';
  if (!recetas) return 'Muéstrale las recetas: registra comida pero no las usa';
  if (f.fluidez != null && f.fluidez < 70 && f.sinTerminar >= 2) return 'Revisa sus entrenos: deja varios sin terminar';
  if (f.score >= 85 && f.semanas >= 4) return `Reconócelo: ${f.semanas} semanas seguidas`;
  return 'Va bien: sigue así';
}
const engNivel = (s) => (s >= 75 ? ['#2F7F45', 'Alto'] : s >= 50 ? ['#E2B33A', 'Medio'] : ['#C2412D', 'Bajo']);

const ENG_FILTROS = [
  ['todos', 'Todos', () => true],
  ['frio', 'Se están enfriando', (f) => f.sinActividad == null || f.sinActividad >= 5],
  ['bajando', 'Bajando', (f) => f.tendencia != null && f.tendencia <= -10],
  ['recetas', 'Nunca usan recetas', (f) => !f.abiertas.length && !f.cocinadas.length],
  ['comida', 'No registran comida', (f) => f.comida28 < 4],
  ['top', 'Más enganchados', (f) => f.score >= 75],
  ['respira', 'Usan Respira', (f) => f.respira && f.respira.veces > 0],
  ['fichas', 'Abren la ficha', (f) => f.fichas && f.fichas.veces > 0],
];

async function engDatos() {
  const hoy = fmt.hoy();
  // Las ausencias (ausencias-crm.js): esos días no se planean.
  try { if (typeof ausCargar === 'function') await ausCargar(); } catch (e) { /* sin tabla */ }
  const todos = await db.clientes.list();
  const activos = todos.filter(c => String(c.estado || 'activo').toLowerCase() === 'activo');
  const d56 = engSumar(hoy, -55);
  const leer = async (q) => { try { const { data, error } = await q; return error ? [] : (data || []); } catch (e) { return []; } };
  const [sesiones, fases, lista, uso] = await Promise.all([
    leer(sb.from('sesiones').select('cliente_id, fecha, estado').gte('fecha', d56).lte('fecha', hoy)),
    leer(sb.from('fases').select('cliente_id, fecha_inicio, semanas, dias_semana, estado, visible_cliente')),
    typeof mtApiGet === 'function' ? mtApiGet('/api/coach-data?action=list').catch(() => null) : null,
    typeof mtApiGet === 'function' ? mtApiGet('/api/coach-data?action=uso').catch(() => null) : null,
  ]);
  // Lo que vio en el centro de aprendizaje (cápsulas y videos), con la fecha.
  const filasCentro = typeof cargarLecturasCentro === 'function' ? await cargarLecturasCentro().catch(() => null) : null;
  const centroDe = (c) => {
    if (!filasCentro) return null;
    const nombres = [c.nombre, ...(c.nombres_alternos || [])].map(engNorm);
    const suyas = filasCentro.filter(f => nombres.includes(engNorm(f.client_name)));
    const pieza = (fuente, prefijo, catalogo) => suyas.filter(f => fuente.includes(f.source)).map(f => {
      const id = String(f.section_key || '').replace(prefijo, '');
      const cat = (catalogo || []).find(x => x.id === id);
      return { id, titulo: (cat && cat.title) || f.section_label || id, fecha: typeof centroFechaFila === 'function' ? centroFechaFila(f) : null };
    }).filter(x => x.id).sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
    return {
      capsulas: pieza(['capsula'], /^cap:/, typeof CENTRO_CAPSULAS !== 'undefined' ? CENTRO_CAPSULAS : []),
      videos: pieza(['podcast'], /^pod:/, typeof CENTRO_PODCASTS !== 'undefined' ? CENTRO_PODCASTS : []),
    };
  };
  const mts = (lista && lista.clients) || [];
  const filasUso = (uso && uso.uso) || [];
  const mtDe = (c) => mts.find(m => c.mealtracker_id && m.user_id === c.mealtracker_id) || mts.find(m => engNorm(m.name) === engNorm(c.nombre)) || null;
  const usoDe = (c, mt) => filasUso.filter(u => (mt && (u.user_id === mt.user_id || u.clave === mt.user_id)) || (c.mealtracker_id && u.user_id === c.mealtracker_id) || engNorm(u.name) === engNorm(c.nombre));
  const fasesDe = (id) => fases.filter(f => f.cliente_id === id && f.estado !== 'archivada' && f.visible_cliente !== false);
  const calc = (c) => { const mt = mtDe(c); return engCliente({ c, hoy, uso: usoDe(c, mt), mt, sesiones: sesiones.filter(s => s.cliente_id === c.id), fases: fasesDe(c.id), fuera: typeof ausFueraDe === 'function' ? ausFueraDe(c.id) : null, centro: centroDe(c) }); };
  const filas = activos.map(calc);
  // Retención: de todos los que empezaron hace 1+ mes (2+ meses), cuántos
  // siguen activos (estado activo y con actividad en los últimos 14 días).
  const vivo = (c) => { if (String(c.estado || 'activo').toLowerCase() !== 'activo') return false; const f = filas.find(x => x.c.id === c.id); return !!(f && f.sinActividad != null && f.sinActividad <= 13); };
  const tras = (dias) => { const base = todos.filter(c => c.fecha_inicio && engEntre(c.fecha_inicio, hoy) >= dias); return { de: base.length, siguen: base.filter(vivo).length }; };
  return {
    hoy, filas, centroListo: !!filasCentro,
    usoListo: !!(uso && uso.ok), sinTabla: !!(uso && uso.sinTabla), conApp: !!lista,
    usoDesde: filasUso.length ? filasUso.map(u => u.fecha).sort()[0] : null,
    retencion: { mes1: tras(30), mes2: tras(60) },
  };
}

function engBarras(f) {
  const out = [];
  for (let k = 27; k >= 0; k--) {
    const d = engSumar(f.hoy, -k);
    const n = ENG_SECC.filter(([s]) => f.dias[s].has(d)).length;
    out.push(n ? `<span title="${fmt.fechaCorta(d)}" style="width:5px;border-radius:2px;background:#3C7BD6;height:${8 + Math.min(4, n) * 4.5}px"></span>` : `<span title="${fmt.fechaCorta(d)}" style="width:5px;height:5px;border-radius:2px;background:#E4E0D8"></span>`);
  }
  return `<div style="display:flex;gap:2px;align-items:flex-end;height:28px">${out.join('')}</div>`;
}
const engTag = (k) => { const [bg, c] = ENG_TONO[k]; return `<span style="display:inline-block;padding:3px 9px;border-radius:999px;font-size:12px;font-weight:700;margin:2px 3px 2px 0;background:${bg};color:${c}">${ENG_SECC.find(x => x[0] === k)[1]}</span>`; };
const engHace = (d) => (d == null ? 'sin actividad' : d === 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`);

function engKpis(D) {
  const F = D.filas, n = F.length;
  const tres = F.filter(f => f.activos7 >= 3).length, tresAntes = F.filter(f => f.activos7antes >= 3).length;
  const frios = F.filter(ENG_FILTROS[1][2]).length;
  const conRecetas = F.filter(f => f.abiertas.length || f.cocinadas.length).length, conMenus = F.filter(f => f.menus > 0).length;
  const top = {};
  F.forEach(f => { f.abiertas.forEach(([r, k]) => { top[r] = (top[r] || 0) + k; }); f.cocinadas.forEach(r => { top[r.nombre] = (top[r.nombre] || 0) + 1; }); });
  const recTop = Object.entries(top).sort((a, b) => b[1] - a[1])[0];
  const emp = F.reduce((a, f) => a + (f.fluidez != null ? f.hechos28 + f.sinTerminar : 0), 0), terminados = F.reduce((a, f) => a + (f.fluidez != null ? f.hechos28 : 0), 0);
  const dif = tres - tresAntes;
  const caja = (num, de, txt, pie, color = '#6B6B6B') => `<div class="card" style="padding:16px 18px;margin:0"><b style="display:block;font-size:28px;letter-spacing:-.02em;color:#1F1F1F">${num}${de ? `<span style="font-size:17px;color:#737373"> ${de}</span>` : ''}</b><span style="display:block;font-size:13.5px;color:#6B6B6B;line-height:1.35;margin-top:3px">${txt}</span>${pie ? `<span style="display:block;font-size:13px;font-weight:700;color:${color};margin-top:4px">${pie}</span>` : ''}</div>`;
  return `<div data-eng-kpis style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:14px">
    ${caja(tres, `de ${n}`, 'usaron la app 3 o más días (últimos 7)', dif ? `${dif > 0 ? '+' : ''}${dif} vs los 7 días anteriores` : 'igual que los 7 días anteriores', dif > 0 ? '#2F7F45' : dif < 0 ? '#B4541D' : '#6B6B6B')}
    ${caja(frios, '', 'se están enfriando: 5 o más días sin actividad', frios ? 'Escríbeles hoy' : 'Nadie por ahora', frios ? '#B4541D' : '#2F7F45')}
    ${caja(conRecetas, `de ${n}`, `abrieron o cocinaron recetas (28 días) · ${conMenus} crearon menús`, recTop ? `Receta top: ${escapeHtml(recTop[0])}` : '')}
    ${caja(emp ? `${Math.round((terminados / emp) * 100)} %` : '—', '', 'de los entrenos empezados se terminan (28 días)', 'Fluidez del entreno')}
    ${(() => { const con = F.filter(f => f.respira && f.respira.veces); const veces = con.reduce((a, f) => a + f.respira.veces, 0); return caja(con.length, `de ${n}`, `usaron Respira (28 días) · ${veces} ${veces === 1 ? 'vez' : 'veces'}`, con.length ? `Más: ${escapeHtml(con.sort((a, b) => b.respira.veces - a.respira.veces)[0].c.nombre.split(' ')[0])}` : 'Nadie por ahora', '#6B6B6B'); })()}
    ${(() => { const con = F.filter(f => f.fichas && f.fichas.veces); const veces = con.reduce((a, f) => a + f.fichas.veces, 0); return caja(con.length, `de ${n}`, `abrieron la ficha de un ejercicio (28 días) · ${veces} ${veces === 1 ? 'vez' : 'veces'}`, con.length ? `Más: ${escapeHtml(con.sort((a, b) => b.fichas.veces - a.fichas.veces)[0].c.nombre.split(' ')[0])}` : 'Nadie por ahora', '#6B6B6B'); })()}
    ${(() => { const cuenta = {}; F.forEach(f => { if (!f.centro) return; [...f.centro.capsulas.map(x => ['Cápsula', x]), ...f.centro.videos.map(x => ['Video', x])].forEach(([t, x]) => { const k = `${t}: ${x.titulo}`; cuenta[k] = (cuenta[k] || 0) + 1; }); }); const top = Object.entries(cuenta).sort((a, b) => b[1] - a[1]); const vieron = F.filter(f => f.centro && (f.centro.capsulas.length || f.centro.videos.length)).length; return caja(vieron, `de ${n}`, 'han visto cápsulas o videos del centro', top.length ? `Lo más visto: ${escapeHtml(top[0][0])} (${top[0][1]})` : (D.centroListo ? 'Nadie todavía' : 'No pude leer el centro'), '#6B6B6B'); })()}
    ${caja(D.retencion.mes1.de ? `${D.retencion.mes1.siguen}` : '—', D.retencion.mes1.de ? `de ${D.retencion.mes1.de}` : '', `siguen activos tras el mes 1${D.retencion.mes2.de ? ` · ${D.retencion.mes2.siguen} de ${D.retencion.mes2.de} tras el mes 2` : ''}`, 'Retención')}
  </div>`;
}

function engAvisoUso(D) {
  if (!D.conApp) return '<div class="card" data-eng-aviso style="margin-bottom:14px;font-size:14px;color:#6B6B6B">No pude leer la app (revisa en Ajustes la dirección y la clave de la app). Sale solo lo del entreno.</div>';
  if (D.sinTabla) return '<div class="card" data-eng-aviso style="margin-bottom:14px;font-size:14px;color:#9A5B12;background:#FBF6EC">Falta un paso: corre una vez <b>sql/app-uso.sql</b> en el Supabase de la app. Hasta entonces no se ve qué secciones y recetas abren; lo demás (entreno, comida, recetas cocinadas) sí.</div>';
  if (!D.usoDesde || engEntre(D.usoDesde, D.hoy) < 27) return `<div class="card" data-eng-aviso style="margin-bottom:14px;font-size:14px;color:#6B6B6B">Lo que abren en la app (Aprende, Comunidad, Chat y recetas abiertas) se registra desde ${D.usoDesde ? `el ${fmt.fechaCorta(D.usoDesde)}` : 'hoy'}: las barras se llenan en 4 semanas. Entreno, comida y recetas cocinadas ya vienen completos.</div>`;
  return '';
}

function engLista() {
  const D = _eng.datos;
  const filtro = ENG_FILTROS.find(x => x[0] === _eng.filtro) || ENG_FILTROS[0];
  const filas = D.filas.filter(filtro[2]).sort((a, b) => (a.score - b.score) || String(a.c.nombre).localeCompare(String(b.c.nombre)));
  view.innerHTML = `
    <div class="mb-4"><h2 class="text-2xl font-bold text-slate-900">Enganche</h2><p class="text-sm text-slate-500">Quién usa la app, qué usa y quién se está enfriando. Los que más necesitan tu atención, primero.</p></div>
    ${engAvisoUso(D)}
    ${engKpis(D)}
    <div class="card lis-tabla-caja" data-eng-tabla style="padding-top:14px">
      <div class="flex gap-1.5 flex-wrap" style="padding:0 16px 10px">${ENG_FILTROS.map(([id, t, fn]) => `<button type="button" class="chip ${_eng.filtro === id ? 'active' : ''}" data-eng-filtro="${id}" onclick="engFiltro('${id}')">${t} · ${D.filas.filter(fn).length}</button>`).join('')}</div>
      ${filas.length ? `<table class="lis-tabla">
        <thead><tr><th class="lis-nom">Cliente</th><th>Enganche</th><th>Días en la app (28)</th><th>Qué usa (14 días)</th><th>Recetas</th><th>Fluidez</th><th>Siguiente paso</th></tr></thead>
        <tbody>${filas.map(f => { const [col, niv] = engNivel(f.score); const t = f.tendencia; return `
          <tr data-eng-fila="${f.c.id}" onclick="engAbrir('${f.c.id}')" style="cursor:pointer">
            <td class="lis-nom">${typeof entAvatar === 'function' ? entAvatar(f.c.nombre) : ''}<span><b>${escapeHtml(f.c.nombre)}</b>${f.mes ? `<span style="display:block;font-size:12.5px;color:#737373">Mes ${f.mes} en el programa</span>` : ''}</span></td>
            <td data-eng-score><span style="display:inline-flex;align-items:center;gap:7px;font-weight:800;font-size:17px"><span style="width:10px;height:10px;border-radius:99px;background:${col}"></span>${f.score}</span><span style="display:block;font-size:12.5px;color:#737373">${niv}${t != null ? ` · <b style="color:${t > 0 ? '#2F7F45' : t < 0 ? '#B4541D' : '#6B6B6B'}">${t > 0 ? '+' : t < 0 ? '−' : '='}${t ? Math.abs(t) : ''}</b>` : ''}</span></td>
            <td>${engBarras(f)}<span style="display:block;font-size:12.5px;color:#737373">${f.activos28} de 28 días · última ${engHace(f.sinActividad)}</span></td>
            <td style="max-width:220px">${f.usa.length ? f.usa.map(engTag).join('') : '<span style="font-size:13px;color:#737373">nada</span>'}</td>
            <td>${f.abiertas.length} abierta${f.abiertas.length === 1 ? '' : 's'} · ${f.cocinadas.length} cocinada${f.cocinadas.length === 1 ? '' : 's'}<span style="display:block;font-size:12.5px;color:#737373">${f.menus} menú${f.menus === 1 ? '' : 's'} creado${f.menus === 1 ? '' : 's'}</span></td>
            <td>${f.fluidez != null ? `${f.fluidez} %<span style="display:block;font-size:12.5px;color:#737373">${f.sinTerminar ? `${f.sinTerminar} sin terminar` : 'todos terminados'}</span>` : '—<span style="display:block;font-size:12.5px;color:#737373">sin entrenos</span>'}</td>
            <td data-eng-paso><span style="display:inline-block;font-weight:600;font-size:13.5px;background:#F7F4EE;border-radius:12px;padding:7px 10px;line-height:1.3">${escapeHtml(engPaso(f))}</span></td>
          </tr>`; }).join('')}</tbody>
      </table>` : '<p class="text-sm text-slate-500" style="padding:0 16px 16px">Nadie en este filtro.</p>'}
    </div>`;
}

function engDetalle(id) {
  const D = _eng.datos;
  const f = D.filas.find(x => x.c.id === id);
  if (!f) return engLista();
  const [col] = engNivel(f.score);
  const t = f.tendencia;
  const cuadros = ENG_SECC.map(([k, nom]) => {
    const celdas = [];
    for (let i = 27; i >= 0; i--) { const d = engSumar(D.hoy, -i); celdas.push(`<span title="${fmt.fechaCorta(d)}" style="height:18px;border-radius:4px;background:${f.dias[k].has(d) ? ENG_TONO[k][1] : '#EFEBE3'}"></span>`); }
    return `<div style="display:flex;align-items:center;gap:12px;margin-top:10px" data-eng-mapa="${k}"><span style="width:92px;flex:none;font-weight:600;font-size:14px">${nom}</span><div style="display:grid;grid-template-columns:repeat(28,1fr);gap:3px;flex:1">${celdas.join('')}</div></div>`;
  }).join('');
  const intereses = f.usa.length ? f.usa.map(k => ENG_SECC.find(x => x[0] === k)[1]).join(', ') : 'Nada en los últimos 14 días';
  const nunca = ENG_SECC.filter(([k]) => !f.dias[k].size).map(([, n]) => n.toLowerCase());
  const ind = [
    ['Retención', `${f.semanas} semana${f.semanas === 1 ? '' : 's'} seguida${f.semanas === 1 ? '' : 's'} activo${f.mes ? ` · mes ${f.mes} en el programa` : ''}`],
    ['Enganche', `${f.score}${t != null ? ` (${t > 0 ? 'subió' : t < 0 ? 'bajó' : 'igual'}${t ? ` ${Math.abs(t)}` : ''} vs las 4 semanas anteriores)` : ''} · días en la app ${f.activos28} de 28, entrenos ${f.hechos28}${f.plan28 ? ` de ${f.plan28}` : ''}, comida ${f.comida28} de 28 días`],
    ['Intereses', `${intereses}${nunca.length ? `. Nunca abrió: ${nunca.join(', ')}` : ''}`],
    ['Fluidez', f.fluidez != null ? `${f.fluidez} % de entrenos terminados${f.sinTerminar ? ` · ${f.sinTerminar} sin terminar` : ''}` : 'Sin entrenos en 28 días'],
    ['Recetas', `${f.abiertas.length} abierta${f.abiertas.length === 1 ? '' : 's'}${f.abiertas.length ? ` (${f.abiertas.slice(0, 3).map(([r]) => escapeHtml(r)).join(', ')})` : ''} · ${f.cocinadas.length} cocinada${f.cocinadas.length === 1 ? '' : 's'} · ${f.menus} menú${f.menus === 1 ? '' : 's'} creado${f.menus === 1 ? '' : 's'} · ${f.favoritos} favorita${f.favoritos === 1 ? '' : 's'}`],
  ];
  const ORIGEN_RESP = { 'fin-entreno': 'al terminar el entreno', descanso: 'en un día de descanso', dash: 'desde la app', otro: 'otro' };
  const r = f.respira || { veces: 0 };
  ind.push(['Respira', r.veces
    ? `${r.veces} ${r.veces === 1 ? 'vez' : 'veces'} en 28 días (${r.dias} día${r.dias === 1 ? '' : 's'}) · ${r.minutos} min en total · la última ${fmt.fechaCorta(r.ultima.fecha)} a las ${escapeHtml(r.ultima.h)}. ${Object.entries(r.origenes).map(([k, v]) => `${v} ${ORIGEN_RESP[k] || k}`).join(', ')}`
    : (r.ultima ? `No la usó en 28 días (la última, ${fmt.fechaCorta(r.ultima.fecha)})` : 'Nunca la ha usado')]);
  const fi = f.fichas || { veces: 0 };
  ind.push(['Ficha de ejercicios', fi.veces
    ? `${fi.veces} ${fi.veces === 1 ? 'vez' : 'veces'} en 28 días (${fi.dias} día${fi.dias === 1 ? '' : 's'}) · ${fi.ejercicios} ejercicio${fi.ejercicios === 1 ? '' : 's'} distinto${fi.ejercicios === 1 ? '' : 's'} · la última ${fmt.fechaCorta(fi.ultima.fecha)} a las ${escapeHtml(fi.ultima.h)}${fi.top.length ? `. Más vista: ${fi.top.map(([k, v]) => `${escapeHtml(k)} (${v})`).join(', ')}` : ''}`
    : (fi.ultima ? `No la abrió en 28 días (la última, ${fmt.fechaCorta(fi.ultima.fecha)})` : 'Todavía no la abre (se cuenta desde hoy)')]);
  const piezas = (l) => l.slice(0, 6).map(x => `${escapeHtml(x.titulo)}${x.fecha ? ` <span style="color:#8A8A8E">· ${fmt.fechaCorta(x.fecha)}</span>` : ''}`).join('<br>');
  if (f.centro) {
    ind.push(['Cápsulas vistas', f.centro.capsulas.length ? `${f.centro.capsulas.length}:<br>${piezas(f.centro.capsulas)}${f.centro.capsulas.length > 6 ? '<br>…' : ''}` : 'Ninguna todavía']);
    ind.push(['Videos vistos', f.centro.videos.length ? `${f.centro.videos.length}:<br>${piezas(f.centro.videos)}${f.centro.videos.length > 6 ? '<br>…' : ''}` : 'Ninguno todavía']);
  }
  const tel = String(f.c.telefono || '').replace(/[^\d]/g, '');
  view.innerHTML = `
    <button type="button" class="btn btn-ghost btn-sm" data-eng-volver onclick="engVolver()" style="margin-bottom:8px">‹ Enganche</button>
    <div class="mb-4" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">${typeof entAvatar === 'function' ? entAvatar(f.c.nombre) : ''}<div><h2 class="text-2xl font-bold text-slate-900">${escapeHtml(f.c.nombre)}</h2><p class="text-sm text-slate-500">${f.mes ? `Mes ${f.mes} en el programa · ` : ''}enganche <b style="color:${col}">${f.score}</b>${t != null && t ? ` (${t > 0 ? 'subió' : 'bajó'} ${Math.abs(t)} en 4 semanas)` : ''} · última actividad ${engHace(f.sinActividad)}</p></div>
      <button type="button" class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="verCliente('${f.c.id}')">Ver ficha</button></div>
    ${engAvisoUso(D)}
    <div class="eng-detalle" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px">
      <div class="card" style="margin:0" data-eng-mapas><div style="font-weight:800;font-size:17px">Qué usó, día por día</div><div style="font-size:13.5px;color:#6B6B6B;margin-top:3px">Últimos 28 días. Cada cuadro es un día que usó esa parte de la app.</div>${cuadros}
        <div style="display:flex;justify-content:space-between;font-size:12px;color:#737373;margin:8px 0 0 104px"><span>${fmt.fechaCorta(engSumar(D.hoy, -27))}</span><span>hoy</span></div></div>
      <div style="display:grid;gap:14px;align-content:start">
        <div class="card" style="margin:0" data-eng-indicadores><div style="font-weight:800;font-size:17px">Indicadores</div>${ind.map(([a, b]) => `<div style="padding:9px 0;border-bottom:1px solid #F1EEE8"><b style="font-size:14px">${a}</b><div style="font-size:13.5px;color:#55565B;margin-top:2px;line-height:1.4">${b}</div></div>`).join('')}</div>
        <div class="card" style="margin:0;background:#FBF6EC" data-eng-siguiente><div style="font-weight:800;font-size:17px">Siguiente paso sugerido</div><div style="font-size:15px;color:#3A3A3C;margin-top:6px;line-height:1.45">${escapeHtml(engPaso(f))}</div>
          ${tel ? `<a class="btn btn-primary" style="background:#25A35A!important;margin-top:12px;display:inline-flex" href="https://wa.me/${tel}" target="_blank" rel="noopener">Escribirle por WhatsApp</a>` : ''}</div>
      </div>
    </div>`;
}

window.engFiltro = (id) => { _eng.filtro = id; engLista(); };
window.engAbrir = (id) => { _eng.abierto = id; engDetalle(id); try { view.scrollIntoView({ block: 'start' }); } catch (e) {} };
window.engVolver = () => { _eng.abierto = null; engLista(); };
window.engCliente = engCliente;
window.engPaso = engPaso;

// El CRM repinta la vista actual cuando terminan otras cargas: se respeta lo
// que estaba abierto (el 1 a 1) y se reusan los datos del último minuto.
// Tocar «Enganche» en el menú sí vuelve a la lista con datos frescos.
routes.enganche = async () => {
  if (!_eng.datos || Date.now() - (_eng.leido || 0) > 60000) {
    cargando();
    try { _eng.datos = await engDatos(); } catch (e) { console.warn('enganche', e); _eng.datos = { hoy: fmt.hoy(), filas: [], conApp: false, retencion: { mes1: { de: 0, siguen: 0 }, mes2: { de: 0, siguen: 0 } } }; }
    _eng.leido = Date.now();
    finCargando();
  }
  if (_eng.abierto) engDetalle(_eng.abierto); else engLista();
};
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('.nav-item[data-view="enganche"]');
  if (b) { _eng.abierto = null; _eng.leido = 0; }
}, true);
