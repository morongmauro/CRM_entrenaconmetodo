// =====================================================
// LISTADO · todos los clientes, mirados desde varios ángulos
// =====================================================
// Un solo listado de clientes activos con lo que más se pregunta de cada
// uno, y unos chips arriba para ordenarlo según el ángulo que quieras ver
// (lo mejor primero, o al revés con «Invertir»):
//   · Tiempo de entreno: cuánto le dura una sesión (mediana de las que
//     cerró él en los últimos 60 días, entre 10 min y 3 h, como el tiempo
//     real del constructor).
//   · Cumplimiento: entrenos hechos frente a los que tocaban en su ciclo.
//   · Ciclo: cuál va, en qué semana y cuántos días le quedan.
//   · Pago: la misma regla del aviso de la app (Pagos → «En su app»).
//   · Alineación a la meta: comida dentro de su meta, promedio de sus
//     últimas 4 semanas (los puntajes que se guardan solos cada semana).
//   · Performance: el puntaje global de esas mismas semanas.
//   · Apreciación de la app: la encuesta (recomendaría 0-10 y el promedio
//     de útil, fácil y agradable).
//   · Días de entreno: días por semana que entrenó en las últimas 4
//     semanas, frente a los de su ficha.
//   · Composición: su último % de grasa, la categoría de ISSA (tabla 7.1)
//     y cuánto cambió en los últimos 90 días.
//   · Seguimiento: cuántos días desde el último.
// Y además: último entreno, notas sin responder y tus tareas con él.
// Solo lee: no cambia nada de ningún cliente.
//
// Carga DESPUÉS de app.js, entrenamiento.js, ciclos-vencen.js,
// seguimiento-semana.js y tareas-coach.js.
// =====================================================

const _lis = { angulo: 'todo', invertido: false, filas: null };

// La tabla 7.1 de ISSA (Bodyfat Percentage Norms), la misma de la app.
const LIS_ISSA = {
  F: [['Low / Essential', 10], ['Athletic', 13], ['Fit', 21], ['Average', 25], ['High / Overweight', 32]],
  M: [['Low / Essential', 4], ['Athletic', 7], ['Fit', 11], ['Average', 17], ['High / Overweight', 26]],
};
function lisIssa(sexo, grasa) {
  const t = LIS_ISSA[sexo];
  if (!t || grasa == null) return null;
  let i = 0; t.forEach(([, d], k) => { if (grasa >= d) i = k; });
  return { nombre: t[i][0], i };
}
const lisMediana = (xs) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const lisProm = (xs) => { const v = xs.filter(x => x != null && !Number.isNaN(Number(x))).map(Number); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const lisLeer = async (q) => { try { const { data, error } = await q; return error ? [] : (data || []); } catch (e) { return []; } };

// Los ángulos: qué columna, cómo se ordena (mayor = mejor, salvo `menor`) y
// el texto del chip.
const LIS_ANGULOS = [
  ['todo', 'Todo'],
  ['tiempo', 'Tiempo de entreno'],
  ['cumplimiento', 'Cumplimiento'],
  ['ciclo', 'Ciclo'],
  ['pago', 'Pago'],
  ['meta', 'Alineación a meta'],
  ['nutri', 'Meta nutricional'],
  ['performance', 'Performance'],
  ['app', 'Apreciación de la app'],
  ['dias', 'Días de entreno'],
  ['composicion', 'Composición'],
  ['seguimiento', 'Seguimiento'],
  ['actividad', 'Último entreno'],
];

async function lisDatos() {
  const hoy = fmt.hoy();
  const clientes = (await db.clientes.list()).filter(c => String(c.estado || 'activo').toLowerCase() === 'activo');
  const ids = clientes.map(c => c.id);
  if (!ids.length) return [];
  const hace60 = evtSumarDias(hoy, -60), hace28 = evtSumarDias(hoy, -28), hace35 = evtSumarDias(hoy, -35), hace90 = evtSumarDias(hoy, -90);
  const [fases, sesiones, segs, meds, encuestas, U, metasH, mtLista] = await Promise.all([
    lisLeer(sb.from('fases').select('id, cliente_id, nombre, fecha_inicio, semanas, estado, visible_cliente, orden, created_at')),
    lisLeer(sb.from('sesiones').select('cliente_id, fecha, estado, duracion_seg, cerrada_auto, origen').gte('fecha', hace60).lte('fecha', hoy)),
    lisLeer(sb.from('seguimientos').select('cliente_id, semana, fecha, score_entreno, score_alim_metas, score_alim_registro, score_global').gte('fecha', hace35)),
    lisLeer(sb.from('mediciones_corporales').select('cliente_id, fecha, peso, grasa_pct').order('fecha', { ascending: true })),
    lisLeer(sb.from('encuesta_app').select('cliente_id, util, facil, agradable, recomienda')),
    typeof segUltimos === 'function' ? segUltimos().catch(() => null) : null,
    lisLeer(sb.from('metas_historial').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false })),
    // La meta que tiene hoy la app de cada cliente (la misma lista de Uso de la app).
    typeof mtApiGet === 'function' && typeof mtApiBase === 'function' && mtApiBase() ? mtApiGet('/api/coach-data?action=list').catch(() => null) : null,
  ]);
  const mts = mtLista && Array.isArray(mtLista.clients) ? mtLista.clients : null;
  // Ciclos: el mismo cálculo del inicio de Entrenamiento.
  const estado = {};
  if (typeof cicEstado === 'function') {
    const porCli = {};
    fases.forEach(f => { if (f.estado !== 'archivada') (porCli[f.cliente_id] = porCli[f.cliente_id] || []).push(f); });
    clientes.forEach(c => { estado[c.id] = cicEstado(porCli[c.id] || [], hoy); });
  }
  let ciclos = {};
  try { if (typeof entResumenCiclos === 'function') ciclos = await entResumenCiclos(estado); } catch (e) { ciclos = {}; }
  // Pagos: la regla de la app (si no responde, queda «—»).
  let pagos = null;
  try {
    if (typeof cargarAvisosApp === 'function') {
      if (_avisosApp === null && !_avisosAppError) await cargarAvisosApp(clientes);
      pagos = _avisosApp;
    }
  } catch (e) { pagos = null; }

  return clientes.map(c => {
    const ses = sesiones.filter(s => s.cliente_id === c.id);
    const hechas = ses.filter(s => s.estado === 'completada');
    // Lo que cerró él (no lo importado ni lo que se cerró solo).
    const mins = hechas.filter(s => !s.cerrada_auto && (s.origen || 'cliente') === 'cliente' && s.duracion_seg >= 600 && s.duracion_seg <= 3 * 3600).map(s => s.duracion_seg / 60);
    const dias28 = new Set(hechas.filter(s => s.fecha >= hace28).map(s => s.fecha)).size;
    const ultimoEntreno = hechas.map(s => s.fecha).sort().pop() || null;
    const ss = segs.filter(s => s.cliente_id === c.id);
    const m = meds.filter(x => x.cliente_id === c.id && x.grasa_pct != null);
    const medsC = meds.filter(x => x.cliente_id === c.id);
    const ultMed = medsC[medsC.length - 1] || null;
    const ult = m[m.length - 1] || null;
    const ref90 = m.find(x => x.fecha >= hace90) || null;
    const enc = encuestas.find(e => e.cliente_id === c.id) || null;
    const ci = ciclos[c.id] || null;
    const e = estado[c.id] || null;
    const u = U && U.ultimo ? U.ultimo[c.id] : null;
    const p = pagos ? pagos[c.nombre] : undefined;
    return {
      c,
      tiempo: mins.length ? Math.round(lisMediana(mins)) : null, tiempoN: mins.length,
      cumplimiento: ci ? ci.pct : null, cumplHechas: ci ? ci.hechas : null, cumplPlan: ci ? ci.planeadas : null,
      ciclo: ci ? { nombre: ci.fase.nombre || 'Ciclo', semana: Math.min(Number(ci.fase.semanas) || 99, Math.floor((ci.lleva - 1) / 7) + 1), semanas: ci.fase.semanas, quedan: ci.quedan } : null,
      cicloTexto: e ? e.texto : null, cicloTono: e ? e.tono : null,
      pago: p === undefined ? null : (p && p.due ? { debe: true, meses: p.meses_deuda || 1, bloqueo: !!p.bloqueo } : { debe: false }),
      meta: lisProm(ss.map(s => s.score_alim_metas)),
      performance: lisProm(ss.map(s => s.score_global)),
      app: enc ? { recomienda: enc.recomienda, prom: lisProm([enc.util, enc.facil, enc.agradable]) } : null,
      dias: Math.round((dias28 / 4) * 10) / 10, diasPlan: c.dias_entreno_cantidad || (c.dias_entreno || []).length || null,
      grasa: ult ? Number(ult.grasa_pct) : null, grasaFecha: ult ? ult.fecha : null,
      medFecha: ultMed ? ultMed.fecha : null, medDias: ultMed ? segHace(ultMed.fecha).d : null,
      nutri: lisNutri(c, medsC, metasH.filter(x => x.cliente_id === c.id), mts, hoy),
      grasaCambio: ult && ref90 && ref90 !== ult ? Math.round((Number(ult.grasa_pct) - Number(ref90.grasa_pct)) * 10) / 10 : null,
      issa: ult ? lisIssa(c.sexo, Number(ult.grasa_pct)) : null,
      seguimiento: u ? segHace(u.fecha).d : null,
      notas: U && U.notas ? (U.notas[c.id] || 0) : 0,
      tareas: U && U.tareas ? (U.tareas[c.id] || null) : null,
      ultimoEntreno, sinEntrenar: ultimoEntreno ? segHace(ultimoEntreno).d : null,
    };
  });
}

// ── Meta nutricional: la vigente, si amerita cambio y si su app la muestra ──
// Composición vigente = medida en los últimos 30 días. «¿Cambio?» usa la misma
// regla del aviso de Composición (compEvaluarMeta: ±2,5 kg o 3 % del peso,
// ±2 puntos de grasa o ±100 kcal al recalcular). Solo lee.
const LIS_VIGENTE = 30;
const lisNorm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const lisMiles = (n) => Number(n).toLocaleString('es-CO');
function lisNutri(c, medsC, metasC, mts, hoy) {
  const ref = metasC.find(m => m.kcal) || null;
  const kcal = c.meta_calorias || (ref && ref.kcal) || null;
  const prot = c.meta_calorias ? c.meta_proteina_g : (ref && ref.proteina_g);
  const desde = (ref && ref.fecha) || String(c.meta_calculada_en || '').slice(0, 10) || null;
  const r = { tiene: !!kcal, kcal, prot, desde, cambio: null, razon: '', app: null, appKcal: null };
  // ¿Amerita cambio?
  const conPeso = medsC.filter(x => x.peso != null);
  const ultP = conPeso[conPeso.length - 1] || null;
  const vieja = !ultP || segHace(ultP.fecha).d > LIS_VIGENTE;
  if (kcal) {
    let ev = null;
    try { ev = typeof compEvaluarMeta === 'function' && ultP ? compEvaluarMeta(c, conPeso, metasC) : null; } catch (e) { ev = null; }
    if (ev && ev.nivel === 'revisar') {
      r.cambio = 'si';
      const kg = ev.dPeso, gr = ev.dGrasa;
      r.razon = kg != null && Math.abs(kg) >= 1 ? `${kg < 0 ? 'bajó' : 'subió'} ${String(Math.abs(Math.round(kg * 10) / 10)).replace('.', ',')} kg desde que se calculó`
        : gr != null && Math.abs(gr) >= 1 ? `${gr < 0 ? 'bajó' : 'subió'} ${String(Math.abs(Math.round(gr * 10) / 10)).replace('.', ',')} puntos de grasa`
        : ev.propuesta && ev.propuesta.kcal ? `recalculada daría ${lisMiles(ev.propuesta.kcal)} kcal` : 'revisar con la última medición';
    } else if (vieja) { r.cambio = 'nose'; r.razon = ultP ? 'su medición es vieja: no hay con qué comparar' : 'sin medición para comparar'; }
    else { r.cambio = 'no'; r.razon = 'cuadra con su última medición'; }
  }
  // ¿Su app la muestra?
  if (mts) {
    const mt = mts.find(m => c.mealtracker_id && m.user_id === c.mealtracker_id) || mts.find(m => lisNorm(m.name) === lisNorm(c.nombre)) || null;
    if (!mt) r.app = 'cuenta';
    else {
      const g = mt.goals || {};
      const k = Number(g.kcal ?? g.calories) || null;
      r.appKcal = k;
      r.app = !k ? 'sin' : kcal && Math.abs(k - Number(kcal)) >= 10 ? 'distinta' : kcal ? 'si' : 'sin_crm';
    }
  }
  // Orden (mayor = mejor): sin meta, a revisar, la app no la muestra bien, no se sabe, todo bien.
  r.valor = !r.tiene ? 0 : r.cambio === 'si' ? 1 : (r.app === 'distinta' || r.app === 'sin') ? 2 : r.cambio === 'nose' ? 3 : 4;
  return r;
}
const LIS_CHIP = { ok: ['#E6F2E9', '#2F7F45'], ojo: ['#FCEBDD', '#B4541D'], mal: ['#FDECEA', '#B4321F'], nada: ['#EFEDE7', '#6B6B6B'] };
const lisChip = (t, tono = 'nada') => `<span class="lis-chip" style="background:${LIS_CHIP[tono][0]};color:${LIS_CHIP[tono][1]}">${t}</span>`;
const lisSub = (t) => t ? `<span class="lis-sub">${t}</span>` : '';
const lisLinea = (et, v) => `<span class="lis-lin"><span>${et}</span>${v}</span>`;
function lisNutriHTML(n) {
  const app = n.app == null ? lisChip('Sin dato de la app') : n.app === 'cuenta' ? lisChip('Sin cuenta en la app')
    : n.app === 'sin' ? lisChip('No tiene meta', 'mal') : n.app === 'distinta' ? lisChip('Distinta', 'ojo') + ` <span class="lis-mini">muestra ${lisMiles(n.appKcal)} kcal</span>`
    : n.app === 'sin_crm' ? lisChip(`Tiene ${lisMiles(n.appKcal)} kcal`) : lisChip('Sí, la ve', 'ok');
  if (!n.tiene) return lisChip('Sin meta', 'mal') + lisSub('Nunca se le calculó') + lisLinea('En su app', app);
  const sem = n.desde ? Math.floor(segHace(n.desde).d / 7) : null;
  const cambio = n.cambio === 'si' ? lisChip('Sí, revisar', 'ojo') : n.cambio === 'no' ? lisChip('No', 'ok') : lisChip('No se sabe');
  return `<span class="lis-v">${lisMiles(n.kcal)} kcal${n.prot ? ` <span class="lis-mini">· ${n.prot} g proteína</span>` : ''}</span>`
    + lisSub(n.desde ? `Desde el ${fmt.fechaCorta(n.desde)} · ${sem === 0 ? 'esta semana' : `hace ${sem} semana${sem === 1 ? '' : 's'}`}` : 'Sin fecha de cálculo')
    + lisLinea('¿Cambio?', `${cambio}${n.razon && n.cambio !== 'no' ? ` <span class="lis-mini">${n.razon}</span>` : ''}`)
    + lisLinea('En su app', app);
}

// Cómo se ordena cada ángulo: el valor (mayor = mejor) y si no hay dato.
const LIS_VALOR = {
  todo: (f) => String(f.c.nombre || ''),
  tiempo: (f) => f.tiempo,
  cumplimiento: (f) => f.cumplimiento,
  ciclo: (f) => f.ciclo ? -f.ciclo.quedan : null,               // al que le queda menos, primero
  pago: (f) => f.pago ? (f.pago.debe ? -f.pago.meses : 1) : null,
  meta: (f) => f.meta,
  nutri: (f) => f.nutri.valor,
  performance: (f) => f.performance,
  app: (f) => f.app ? f.app.recomienda : null,
  dias: (f) => f.dias,
  // Sin medición, luego vencida (la más vieja primero), luego vigente (más cerca de «Fit»).
  composicion: (f) => f.medFecha == null ? 0 : f.medDias > LIS_VIGENTE ? 1 - Math.min(f.medDias, 999) / 1000 : 2 + (f.issa ? -Math.abs(f.issa.i - 2) / 10 : 0),
  seguimiento: (f) => f.seguimiento != null ? -f.seguimiento : null,
  actividad: (f) => f.sinEntrenar != null ? -f.sinEntrenar : null,
};
function lisOrdenar(filas) {
  const k = _lis.angulo, val = LIS_VALOR[k];
  if (k === 'todo') return filas.slice().sort((a, b) => String(a.c.nombre).localeCompare(String(b.c.nombre), 'es'));
  const con = filas.filter(f => val(f) != null), sin = filas.filter(f => val(f) == null);
  con.sort((a, b) => (_lis.invertido ? val(a) - val(b) : val(b) - val(a)));
  return [...con, ...sin];
}

// Celdas: texto + tono (ok · ojo · mal · nada).
const lisCelda = (txt, tono = 'nada', sub = '') => `<span class="lis-v lis-${tono}">${txt}</span>${sub ? `<span class="lis-sub">${sub}</span>` : ''}`;
const LIS_COL = {
  tiempo: { t: 'Tiempo de entreno', h: (f) => f.tiempo != null ? lisCelda(`${f.tiempo} min`, 'nada', `mediana · ${f.tiempoN} sesión${f.tiempoN === 1 ? '' : 'es'}`) : lisCelda('—') },
  cumplimiento: { t: 'Cumplimiento', h: (f) => f.cumplimiento != null ? lisCelda(`${f.cumplimiento}%`, f.cumplimiento >= 80 ? 'ok' : f.cumplimiento >= 50 ? 'ojo' : 'mal', `${f.cumplHechas} de ${f.cumplPlan} del ciclo`) : lisCelda('—') },
  ciclo: { t: 'Ciclo', h: (f) => f.ciclo ? lisCelda(`Sem ${f.ciclo.semana}${f.ciclo.semanas ? ` de ${f.ciclo.semanas}` : ''}`, f.cicloTono === 'rojo' ? 'mal' : f.cicloTono === 'ambar' ? 'ojo' : 'nada', `${escapeHtml(f.ciclo.nombre)} · ${f.ciclo.quedan === 0 ? 'termina hoy' : `quedan ${f.ciclo.quedan} días`}`) : lisCelda('—', 'nada', escapeHtml(f.cicloTexto || 'Sin ciclo vigente')) },
  // El pago se gestiona en Pagos: aquí solo el punto de color (lleva a Pagos).
  pago: { t: 'Pago', h: (f) => !f.pago ? lisCelda('—', 'nada', 'sin dato de la app') : typeof pagoPunto === 'function' ? pagoPunto(f.pago.debe, f.pago.debe ? `debe ${f.pago.meses} mes${f.pago.meses > 1 ? 'es' : ''}${f.pago.bloqueo ? ', app bloqueada' : ''}` : '') : (f.pago.debe ? lisCelda('Debe', 'mal') : lisCelda('Al día', 'ok')) },
  meta: { t: 'Alineación a meta', h: (f) => f.meta != null ? lisCelda(`${Math.round(f.meta)}%`, f.meta >= 75 ? 'ok' : f.meta >= 50 ? 'ojo' : 'mal', f.meta >= 75 ? 'alineado' : 'no alineado') : lisCelda('—') },
  performance: { t: 'Performance', h: (f) => f.performance != null ? lisCelda(`${Math.round(f.performance)}%`, f.performance >= 75 ? 'ok' : f.performance >= 50 ? 'ojo' : 'mal', 'últimas 4 semanas') : lisCelda('—') },
  app: { t: 'Apreciación de la app', h: (f) => f.app ? lisCelda(`${f.app.recomienda}/10`, f.app.recomienda >= 9 ? 'ok' : f.app.recomienda >= 7 ? 'ojo' : 'mal', f.app.prom != null ? `promedio ${f.app.prom.toFixed(1)}/5` : '') : lisCelda('—', 'nada', 'sin encuesta') },
  dias: { t: 'Días de entreno', h: (f) => lisCelda(`${String(f.dias).replace('.', ',')}/sem`, f.diasPlan ? (f.dias >= f.diasPlan ? 'ok' : f.dias >= f.diasPlan * 0.6 ? 'ojo' : 'mal') : 'nada', f.diasPlan ? `de ${f.diasPlan} en su ficha` : 'últimas 4 semanas') },
  // Vigente = medición de los últimos 30 días.
  composicion: { t: 'Composición', h: (f) => {
    if (f.medFecha == null) return lisChip('Sin medición', 'mal') + lisSub('Nunca se ha medido');
    const vig = f.medDias <= LIS_VIGENTE;
    const det = [f.medDias === 0 ? 'Hoy' : `Hace ${f.medDias} día${f.medDias === 1 ? '' : 's'}`,
      f.grasa != null && f.grasaFecha === f.medFecha ? `${String(f.grasa).replace('.', ',')} % grasa` : '', f.issa && f.grasaFecha === f.medFecha ? f.issa.nombre : '',
      f.grasaCambio != null ? `${f.grasaCambio > 0 ? '+' : ''}${String(f.grasaCambio).replace('.', ',')} pts en 90 días` : ''].filter(Boolean).join(' · ');
    return lisChip(vig ? 'Vigente' : 'Vencida', vig ? 'ok' : 'ojo') + lisSub(det);
  } },
  nutri: { t: 'Meta nutricional', h: (f) => lisNutriHTML(f.nutri) },
  seguimiento: { t: 'Seguimiento', h: (f) => f.seguimiento != null ? lisCelda(f.seguimiento === 0 ? 'Hoy' : `Hace ${f.seguimiento} d`, f.seguimiento < 7 ? 'ok' : f.seguimiento < 14 ? 'ojo' : 'mal', f.seguimiento < 7 ? 'al día' : 'te toca') : lisCelda('Nunca', 'mal') },
  actividad: { t: 'Último entreno', h: (f) => f.sinEntrenar != null ? lisCelda(f.sinEntrenar === 0 ? 'Hoy' : f.sinEntrenar === 1 ? 'Ayer' : `Hace ${f.sinEntrenar} d`, f.sinEntrenar <= 3 ? 'ok' : f.sinEntrenar <= 7 ? 'ojo' : 'mal', [f.notas ? `${f.notas} nota${f.notas > 1 ? 's' : ''} sin responder` : '', f.tareas && f.tareas.abiertas ? `${f.tareas.abiertas} tarea${f.tareas.abiertas > 1 ? 's' : ''} tuya${f.tareas.abiertas > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')) : lisCelda('Sin entrenos', 'mal', 'últimos 60 días') },
};
const LIS_ORDEN_COLS = ['tiempo', 'cumplimiento', 'ciclo', 'pago', 'meta', 'nutri', 'performance', 'app', 'dias', 'composicion', 'seguimiento', 'actividad'];

// Un resumen corto del ángulo elegido (cuántos van bien y cuántos no).
function lisResumen(filas) {
  const k = _lis.angulo;
  const n = (fn) => filas.filter(fn).length;
  const R = {
    cumplimiento: () => `${n(f => f.cumplimiento >= 80)} cumplen 80% o más · ${n(f => f.cumplimiento != null && f.cumplimiento < 50)} van por debajo del 50%`,
    pago: () => `${n(f => f.pago && !f.pago.debe)} al día · ${n(f => f.pago && f.pago.debe)} deben`,
    meta: () => `${n(f => f.meta >= 75)} alineados a su meta · ${n(f => f.meta != null && f.meta < 75)} no`,
    performance: () => `${n(f => f.performance >= 75)} con 75% o más · ${n(f => f.performance != null && f.performance < 50)} por debajo del 50%`,
    seguimiento: () => `${n(f => f.seguimiento != null && f.seguimiento < 7)} al día · ${n(f => f.seguimiento == null || f.seguimiento >= 7)} te toca`,
    dias: () => `${n(f => f.diasPlan && f.dias >= f.diasPlan)} entrenan los días de su plan · ${n(f => f.diasPlan && f.dias < f.diasPlan * 0.6)} entrenan mucho menos`,
    app: () => `${n(f => f.app)} respondieron la encuesta${n(f => f.app) ? ` · ${n(f => f.app && f.app.recomienda >= 9)} la recomiendan (9-10)` : ''}`,
    composicion: () => `${n(f => f.medFecha != null)} con medición · ${n(f => f.medFecha != null && f.medDias <= LIS_VIGENTE)} vigentes · ${n(f => f.medFecha != null && f.medDias > LIS_VIGENTE)} vencidas · ${n(f => f.medFecha == null)} sin medición`,
    nutri: () => `${n(f => f.nutri.tiene)} con meta · ${n(f => f.nutri.cambio === 'si')} amerita${n(f => f.nutri.cambio === 'si') === 1 ? '' : 'n'} cambio · ${n(f => f.nutri.app === 'distinta' || f.nutri.app === 'sin')} que su app no muestra bien · ${n(f => !f.nutri.tiene)} sin meta`,
    tiempo: () => { const t = filas.map(f => f.tiempo).filter(x => x != null); return t.length ? `Mediana del grupo: ${Math.round(lisMediana(t))} min · ${t.length} con datos` : 'Todavía no hay sesiones cerradas en la app'; },
    ciclo: () => `${n(f => f.ciclo && f.ciclo.quedan <= 7)} terminan su ciclo esta semana · ${n(f => !f.ciclo)} sin ciclo vigente`,
    actividad: () => `${n(f => f.sinEntrenar != null && f.sinEntrenar <= 3)} entrenaron en los últimos 3 días · ${n(f => f.sinEntrenar == null || f.sinEntrenar > 7)} hace más de una semana`,
  };
  return R[k] ? R[k]() : `${filas.length} clientes activos`;
}

routes.listado = async () => {
  cargando();
  try { _lis.filas = await lisDatos(); } catch (e) { _lis.filas = []; console.warn('listado', e); }
  finCargando();
  lisPintar();
};

function lisPintar() {
  const filas = lisOrdenar(_lis.filas || []);
  const k = _lis.angulo;
  const cols = k === 'todo' ? LIS_ORDEN_COLS : [k, ...LIS_ORDEN_COLS.filter(x => x !== k)];
  view.innerHTML = `
    <div class="flex items-baseline justify-between flex-wrap gap-3 mb-4">
      <div>
        <h2 class="text-2xl font-bold text-slate-900">Listado</h2>
        <p class="text-sm text-slate-500">Todos tus clientes activos, mirados desde el ángulo que elijas</p>
      </div>
    </div>
    <div class="card mb-4" data-lis-angulos>
      <div class="flex gap-1.5 flex-wrap">
        ${LIS_ANGULOS.map(([id, t]) => `<button type="button" class="chip ${k === id ? 'active' : ''}" data-lis-angulo="${id}" onclick="lisAngulo('${id}')">${t}</button>`).join('')}
      </div>
      <div class="flex items-center justify-between gap-2 flex-wrap mt-3">
        <span class="text-sm text-slate-600" data-lis-resumen>${lisResumen(_lis.filas || [])}</span>
        ${k !== 'todo' ? `<button type="button" class="btn btn-ghost btn-sm" data-lis-invertir onclick="lisInvertir()">${_lis.invertido ? 'Ver lo mejor primero' : 'Ver lo que va peor primero'}</button>` : ''}
      </div>
    </div>
    <div class="card lis-tabla-caja" data-lis-tabla>
      ${filas.length ? `
      <table class="lis-tabla">
        <thead><tr><th class="lis-nom">Cliente</th>${cols.map(id => `<th class="${id === k ? 'lis-foco' : ''}">${LIS_COL[id].t}</th>`).join('')}</tr></thead>
        <tbody>${filas.map(f => `
          <tr data-lis-fila="${f.c.id}" onclick="verCliente('${f.c.id}')">
            <td class="lis-nom">${typeof entAvatar === 'function' ? entAvatar(f.c.nombre) : ''}<b>${escapeHtml(f.c.nombre)}</b></td>
            ${cols.map(id => `<td class="${id === k ? 'lis-foco' : ''}" data-lis-col="${id}">${LIS_COL[id].h(f)}</td>`).join('')}
          </tr>`).join('')}</tbody>
      </table>` : '<p class="text-sm text-slate-500">No hay clientes activos.</p>'}
    </div>`;
}

// Estos dos se ven con lo que pide acción primero (sin meta, a revisar, sin medición…).
const LIS_PEOR_PRIMERO = new Set(['nutri', 'composicion']);
window.lisAngulo = (id) => { _lis.angulo = id; _lis.invertido = LIS_PEOR_PRIMERO.has(id); lisPintar(); };
window.lisInvertir = () => { _lis.invertido = !_lis.invertido; lisPintar(); };
