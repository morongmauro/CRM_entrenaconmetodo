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
  const [fases, sesiones, segs, meds, encuestas, U] = await Promise.all([
    lisLeer(sb.from('fases').select('id, cliente_id, nombre, fecha_inicio, semanas, estado, visible_cliente, orden, created_at')),
    lisLeer(sb.from('sesiones').select('cliente_id, fecha, estado, duracion_seg, cerrada_auto, origen').gte('fecha', hace60).lte('fecha', hoy)),
    lisLeer(sb.from('seguimientos').select('cliente_id, semana, fecha, score_entreno, score_alim_metas, score_alim_registro, score_global').gte('fecha', hace35)),
    lisLeer(sb.from('mediciones_corporales').select('cliente_id, fecha, peso, grasa_pct').order('fecha', { ascending: true })),
    lisLeer(sb.from('encuesta_app').select('cliente_id, util, facil, agradable, recomienda')),
    typeof segUltimos === 'function' ? segUltimos().catch(() => null) : null,
  ]);
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
      grasaCambio: ult && ref90 && ref90 !== ult ? Math.round((Number(ult.grasa_pct) - Number(ref90.grasa_pct)) * 10) / 10 : null,
      issa: ult ? lisIssa(c.sexo, Number(ult.grasa_pct)) : null,
      seguimiento: u ? segHace(u.fecha).d : null,
      notas: U && U.notas ? (U.notas[c.id] || 0) : 0,
      tareas: U && U.tareas ? (U.tareas[c.id] || null) : null,
      ultimoEntreno, sinEntrenar: ultimoEntreno ? segHace(ultimoEntreno).d : null,
    };
  });
}

// Cómo se ordena cada ángulo: el valor (mayor = mejor) y si no hay dato.
const LIS_VALOR = {
  todo: (f) => String(f.c.nombre || ''),
  tiempo: (f) => f.tiempo,
  cumplimiento: (f) => f.cumplimiento,
  ciclo: (f) => f.ciclo ? -f.ciclo.quedan : null,               // al que le queda menos, primero
  pago: (f) => f.pago ? (f.pago.debe ? -f.pago.meses : 1) : null,
  meta: (f) => f.meta,
  performance: (f) => f.performance,
  app: (f) => f.app ? f.app.recomienda : null,
  dias: (f) => f.dias,
  composicion: (f) => f.issa ? -Math.abs(f.issa.i - 2) * 100 - (f.grasaCambio || 0) : null,   // más cerca de «Fit», y bajando
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
  pago: { t: 'Pago', h: (f) => !f.pago ? lisCelda('—', 'nada', 'sin dato de la app') : f.pago.debe ? lisCelda(`Debe ${f.pago.meses} mes${f.pago.meses > 1 ? 'es' : ''}`, 'mal', f.pago.bloqueo ? 'app bloqueada' : 'con aviso en su app') : lisCelda('Al día', 'ok') },
  meta: { t: 'Alineación a meta', h: (f) => f.meta != null ? lisCelda(`${Math.round(f.meta)}%`, f.meta >= 75 ? 'ok' : f.meta >= 50 ? 'ojo' : 'mal', f.meta >= 75 ? 'alineado' : 'no alineado') : lisCelda('—') },
  performance: { t: 'Performance', h: (f) => f.performance != null ? lisCelda(`${Math.round(f.performance)}%`, f.performance >= 75 ? 'ok' : f.performance >= 50 ? 'ojo' : 'mal', 'últimas 4 semanas') : lisCelda('—') },
  app: { t: 'Apreciación de la app', h: (f) => f.app ? lisCelda(`${f.app.recomienda}/10`, f.app.recomienda >= 9 ? 'ok' : f.app.recomienda >= 7 ? 'ojo' : 'mal', f.app.prom != null ? `promedio ${f.app.prom.toFixed(1)}/5` : '') : lisCelda('—', 'nada', 'sin encuesta') },
  dias: { t: 'Días de entreno', h: (f) => lisCelda(`${String(f.dias).replace('.', ',')}/sem`, f.diasPlan ? (f.dias >= f.diasPlan ? 'ok' : f.dias >= f.diasPlan * 0.6 ? 'ojo' : 'mal') : 'nada', f.diasPlan ? `de ${f.diasPlan} en su ficha` : 'últimas 4 semanas') },
  composicion: { t: 'Composición', h: (f) => f.grasa != null ? lisCelda(`${String(f.grasa).replace('.', ',')}% grasa`, f.issa ? (f.issa.i === 2 || f.issa.i === 1 ? 'ok' : f.issa.i === 3 ? 'ojo' : 'mal') : 'nada',
    `${f.issa ? f.issa.nombre : 'sin sexo en la ficha'}${f.grasaCambio != null ? ` · ${f.grasaCambio > 0 ? '+' : ''}${String(f.grasaCambio).replace('.', ',')} pts en 90 días` : ''}`) : lisCelda('—', 'nada', 'sin medición') },
  seguimiento: { t: 'Seguimiento', h: (f) => f.seguimiento != null ? lisCelda(f.seguimiento === 0 ? 'Hoy' : `Hace ${f.seguimiento} d`, f.seguimiento < 7 ? 'ok' : f.seguimiento < 14 ? 'ojo' : 'mal', f.seguimiento < 7 ? 'al día' : 'te toca') : lisCelda('Nunca', 'mal') },
  actividad: { t: 'Último entreno', h: (f) => f.sinEntrenar != null ? lisCelda(f.sinEntrenar === 0 ? 'Hoy' : f.sinEntrenar === 1 ? 'Ayer' : `Hace ${f.sinEntrenar} d`, f.sinEntrenar <= 3 ? 'ok' : f.sinEntrenar <= 7 ? 'ojo' : 'mal', [f.notas ? `${f.notas} nota${f.notas > 1 ? 's' : ''} sin responder` : '', f.tareas && f.tareas.abiertas ? `${f.tareas.abiertas} tarea${f.tareas.abiertas > 1 ? 's' : ''} tuya${f.tareas.abiertas > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')) : lisCelda('Sin entrenos', 'mal', 'últimos 60 días') },
};
const LIS_ORDEN_COLS = ['tiempo', 'cumplimiento', 'ciclo', 'pago', 'meta', 'performance', 'app', 'dias', 'composicion', 'seguimiento', 'actividad'];

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
    composicion: () => `${n(f => f.grasa != null)} con medición · ${n(f => f.grasaCambio != null && f.grasaCambio < 0)} bajaron grasa en 90 días`,
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

window.lisAngulo = (id) => { _lis.angulo = id; _lis.invertido = false; lisPintar(); };
window.lisInvertir = () => { _lis.invertido = !_lis.invertido; lisPintar(); };
