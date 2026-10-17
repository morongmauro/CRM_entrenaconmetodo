// ═══════════════════════════════════════════════════════════════════════
// TIEMPOS REALES DEL ENTRENO · cuánto tardó en cada ejercicio, en los
// descansos y en la rutina entera
// ═══════════════════════════════════════════════════════════════════════
// Sale de los toques que el cliente ya hace: cada serie que marca deja la
// hora de su teléfono (series_log.marcada_en, carga/migracion-tiempos-series.sql;
// las de antes de esa columna, la hora en que llegó: created_at).
//
// Lo que se mide y lo que se estima:
//   · rutina total: de que empezó la primera serie a que tocó «Terminar».
//     La primera serie empieza ~su tiempo de trabajo antes de marcarla.
//   · ejercicio: todo el tiempo entre la serie anterior (sea del ejercicio que
//     sea) y cada serie suya. Así los ejercicios suman la rutina.
//   · descanso entre series: lo que pasó entre dos toques del mismo ejercicio
//     menos lo que dura la serie (reps × tempo, el mismo cálculo del
//     constructor). La serie en sí no se cronometra: hay un solo toque, al
//     final. Pedir otro al empezar cada serie le complica la rutina al cliente.
//
// Lo que no cuenta: series marcadas de golpe (menos de 8 s entre una y otra:
// las hizo y las marcó al final) y pausas de más de 15 min (dejó la app).
// Si marcó de golpe casi todo, la sesión se marca como poco fiable.
//
// DESPUÉS de entrenamiento.js (usa entSegTrabajo, entNombres, ENT_T, sb).

const TMP_GOLPE = 8;            // s: menos que esto entre dos toques = marcadas juntas
const TMP_PAUSA = 15 * 60;      // s: más que esto = dejó la app, no es descanso
const TMP_CIERRE_MAX = 20 * 60; // s: «Terminar» más tarde que esto = se le olvidó

const tmpMediana = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// «1:45», «12 min», «1 h 05».
function tmpFmt(seg, { corto = false } = {}) {
  if (seg == null || !Number.isFinite(seg)) return '—';
  const s = Math.max(0, Math.round(seg));
  if (s < 600 && !corto) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
}

// ─── Datos ─────────────────────────────────────────────────────────────
async function tmpPaginas(armar) {
  const out = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await armar().range(desde, desde + 999);
    if (error) return { error, data: out };
    out.push(...(data || []));
    if (!data || data.length < 1000) return { data: out };
  }
}

// { [sesion_id]: tiempos } para las sesiones dadas (las de entDb.sesiones).
async function entTiemposCargar(sesiones) {
  const ids = (sesiones || []).filter(s => s.estado === 'completada' || s.estado === 'en_curso').map(s => s.id);
  if (!ids.length) return {};
  const series = [], fin = {};
  for (let i = 0; i < ids.length; i += 80) {
    const tanda = ids.slice(i, i + 80);
    const sel = 'id, sesion_id, rutina_ejercicio_id, ejercicio_id, serie_num, completada, created_at, ejercicios(nombre, alias)';
    // Sin la columna nueva (falta el SQL) se usa la hora de llegada.
    let r = await tmpPaginas(() => sb.from('series_log').select(sel + ', marcada_en').in('sesion_id', tanda).order('id'));
    if (r.error) r = await tmpPaginas(() => sb.from('series_log').select(sel).in('sesion_id', tanda).order('id'));
    series.push(...r.data);
    // Las importadas de Trainerize traen todas las series con la misma hora:
    // no dicen nada de tiempos y no se cuentan.
    let f = await sb.from('sesiones').select('id, finalizada_en, cerrada_auto, origen').in('id', tanda);
    if (f.error) f = await sb.from('sesiones').select('id, finalizada_en, cerrada_auto').in('id', tanda);
    if (f.error) f = await sb.from('sesiones').select('id, finalizada_en').in('id', tanda);
    (f.data || []).forEach(x => { fin[x.id] = x; });
  }
  // Lo que pidió el coach en cada línea: reps, tempo, descanso, series.
  const reIds = [...new Set(series.map(x => x.rutina_ejercicio_id).filter(Boolean))];
  const pauta = {};
  for (let i = 0; i < reIds.length; i += 80) {
    const { data } = await sb.from('rutina_ejercicios').select('id, reps, tempo, series, descanso_seg, bloque_id').in('id', reIds.slice(i, i + 80));
    (data || []).forEach(x => { pauta[x.id] = x; });
  }
  const porSesion = {};
  series.forEach(x => { (porSesion[x.sesion_id] = porSesion[x.sesion_id] || []).push(x); });
  const out = {};
  sesiones.forEach(s => {
    if (!porSesion[s.id] || (fin[s.id] && fin[s.id].origen === 'importada')) return;
    const t = entTiemposDeSesion({ ...s, ...(fin[s.id] || {}) }, porSesion[s.id], pauta);
    if (t) out[s.id] = t;
  });
  return out;
}

// ─── El cálculo de una sesión (puro) ───────────────────────────────────
function entTiemposDeSesion(sesion, series, pauta = {}) {
  const marcas = (series || [])
    .filter(x => x.completada !== false)
    .map(x => ({ ...x, t: Date.parse(x.marcada_en || x.created_at) }))
    .filter(x => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t || (a.serie_num || 0) - (b.serie_num || 0));
  if (!marcas.length) return null;

  const trabajo = (m) => {
    const p = pauta[m.rutina_ejercicio_id];
    return p ? entSegTrabajo(p) : 30;
  };
  const clave = (m) => m.rutina_ejercicio_id || m.ejercicio_id;
  const inicio = marcas[0].t - trabajo(marcas[0]) * 1000;
  const ultima = marcas[marcas.length - 1].t;
  const finalizada = sesion.finalizada_en ? Date.parse(sesion.finalizada_en) : NaN;
  const cierreOk = Number.isFinite(finalizada) && !sesion.cerrada_auto
    && finalizada >= ultima && (finalizada - ultima) / 1000 <= TMP_CIERRE_MAX;
  const fin = cierreOk ? finalizada : ultima;

  const ej = new Map();
  const de = (m) => {
    const k = clave(m);
    if (!ej.has(k)) {
      const p = pauta[m.rutina_ejercicio_id];
      ej.set(k, {
        clave: k, nombre: m.ejercicios ? entNombres(m.ejercicios).grande : 'Ejercicio',
        series: 0, seg: 0, descansos: [],
        pauta: p ? (p.descanso_seg ?? ENT_T.descanso) : null,
        circuito: !!(p && p.bloque_id),
        // Lo que debería tomar con lo pautado: sus series, sus descansos y el
        // cambio desde el ejercicio anterior.
        estimado: 0, trabajo: p ? entSegTrabajo(p) : 30,
      });
    }
    return ej.get(k);
  };

  let golpes = 0, pausas = 0, pausaExtra = 0, intervalos = 0, descansoTotal = 0, trabajoTotal = 0;
  marcas.forEach((m, i) => {
    const e = de(m);
    e.series++;
    trabajoTotal += trabajo(m);
    if (i === 0) { e.seg += (m.t - inicio) / 1000; return; }
    const d = (m.t - marcas[i - 1].t) / 1000;
    intervalos++;
    if (d < TMP_GOLPE) { golpes++; e.seg += d; return; }
    // Una pausa larga se cuenta como un descanso normal: el resto no es entreno.
    if (d > TMP_PAUSA) { pausas++; const vale = trabajo(m) + (e.pauta ?? ENT_T.descanso); pausaExtra += d - vale; e.seg += vale; return; }
    e.seg += d;
    const desc = Math.max(0, d - trabajo(m));
    descansoTotal += desc;
    if (clave(marcas[i - 1]) === e.clave && !e.circuito) e.descansos.push(desc);
  });

  let estimado = 0;
  [...ej.values()].forEach((e, i) => {
    e.descansoMedio = tmpMediana(e.descansos);
    e.estimado = e.series * (e.trabajo + ENT_T.prep_serie) + Math.max(0, e.series - 1) * (e.pauta ?? ENT_T.descanso) + (i ? ENT_T.cambio : 0);
    estimado += e.estimado;
  });
  const todos = [...ej.values()].flatMap(e => e.descansos);
  const pautas = [...ej.values()].filter(e => e.descansos.length && e.pauta != null).map(e => e.pauta);
  const total = Math.round((fin - inicio) / 1000 - pausaExtra);
  return {
    total, estimado: Math.round(estimado),
    trabajo: Math.round(trabajoTotal), descanso: Math.round(descansoTotal),
    cierre: cierreOk ? Math.round((finalizada - ultima) / 1000) : null,
    descansoMedio: tmpMediana(todos), pautaMedia: tmpMediana(pautas),
    series: marcas.length, golpes, pausas,
    // Si casi todo se marcó de golpe, los tiempos dicen poco.
    fiable: intervalos === 0 || golpes / intervalos < 0.4,
    ejercicios: [...ej.values()].map(e => ({ ...e, seg: Math.round(e.seg) })),
  };
}

// ─── Indicadores sobre varias sesiones ─────────────────────────────────
function entTiemposResumen(tiempos) {
  const lista = Object.values(tiempos || {}).filter(t => t.series >= 3);
  const fiables = lista.filter(t => t.fiable);
  if (!lista.length) return null;
  const desc = fiables.map(t => t.descansoMedio).filter(x => x != null);
  const pau = fiables.map(t => t.pautaMedia).filter(x => x != null);
  // El ejercicio que más se alarga frente a lo pautado (con 2 veces o más).
  const porEj = new Map();
  fiables.forEach(t => t.ejercicios.forEach(e => {
    const x = porEj.get(e.nombre) || { nombre: e.nombre, reales: [], estimados: [], descansos: [], pauta: e.pauta };
    x.reales.push(e.seg); x.estimados.push(e.estimado);
    if (e.descansoMedio != null) x.descansos.push(e.descansoMedio);
    porEj.set(e.nombre, x);
  }));
  const ejercicios = [...porEj.values()].map(x => ({
    nombre: x.nombre, veces: x.reales.length,
    real: tmpMediana(x.reales), estimado: tmpMediana(x.estimados),
    descanso: tmpMediana(x.descansos), pauta: x.pauta,
  })).sort((a, b) => (b.real - b.estimado) - (a.real - a.estimado));
  return {
    sesiones: lista.length, fiables: fiables.length,
    deGolpe: lista.length - fiables.length,
    total: tmpMediana(fiables.map(t => t.total)),
    estimado: tmpMediana(fiables.map(t => t.estimado)),
    descanso: tmpMediana(desc), pauta: tmpMediana(pau),
    ejercicios,
  };
}

// Las lecturas (tono, título, detalle, dato) que salen de los tiempos.
function entTiemposLecturas(r) {
  if (!r) return [];
  const out = [];
  if (r.sesiones >= 3 && r.deGolpe / r.sesiones >= 0.5) {
    out.push(['idea', 'Marca las series todas al final',
      `En ${r.deGolpe} de ${r.sesiones} entrenos marcó casi todo de golpe. Así no se ve cuánto descansa ni cuánto tarda. Pedirle que marque cada serie al terminarla.`,
      `${r.deGolpe}/${r.sesiones}`]);
  }
  if (r.fiables >= 2 && r.descanso != null && r.pauta != null) {
    if (r.descanso > r.pauta * 1.5 && r.descanso - r.pauta >= 30) {
      out.push(['ojo', 'Descansa más de lo pautado',
        `Entre series descansa ${tmpFmt(r.descanso)} (mediana) y la pauta es ${tmpFmt(r.pauta)}. Alarga el entreno y baja la densidad. Vale preguntar si es cansancio, el celular o el gimnasio lleno.`,
        `${tmpFmt(r.descanso)} vs ${tmpFmt(r.pauta)}`]);
    } else if (r.descanso < r.pauta * 0.6 && r.pauta - r.descanso >= 30) {
      out.push(['idea', 'Descansa menos de lo pautado',
        `Entre series descansa ${tmpFmt(r.descanso)} y la pauta es ${tmpFmt(r.pauta)}. Con poco descanso rinde menos en las series pesadas.`,
        `${tmpFmt(r.descanso)} vs ${tmpFmt(r.pauta)}`]);
    }
  }
  if (r.fiables >= 2 && r.total && r.estimado && r.total > r.estimado * 1.35 && r.total - r.estimado >= 10 * 60) {
    out.push(['ojo', 'Sus entrenos duran bastante más de lo previsto',
      `Tarda ${tmpFmt(r.total, { corto: true })} (mediana) en rutinas pensadas para ~${tmpFmt(r.estimado, { corto: true })}. Si le falta tiempo, es lo que hace que deje rutinas a medias.`,
      `${tmpFmt(r.total, { corto: true })}`]);
  }
  return out;
}

// ─── Lo que se pinta ───────────────────────────────────────────────────
// La tarjeta de Lecturas: duración, descanso y los ejercicios que más tardan.
function entTiemposHTML(r) {
  if (!r) return '';
  const caja = (titulo, valor, sub) => `
    <div class="rounded-xl bg-slate-50 p-3">
      <div class="text-xs text-slate-500">${titulo}</div>
      <div class="text-2xl font-bold text-slate-900 leading-tight">${valor}</div>
      <div class="text-[11px] text-slate-500">${sub}</div>
    </div>`;
  const filas = r.ejercicios.slice(0, 8).map(e => `
    <div class="flex items-center justify-between gap-2 py-1.5" style="border-bottom:1px solid #f1f5f9" data-tiempo-ej>
      <div class="min-w-0">
        <div class="text-sm font-semibold text-slate-800 truncate">${escapeHtml(e.nombre)}</div>
        <div class="text-[11px] text-slate-400">${e.veces} ${e.veces === 1 ? 'vez' : 'veces'}${e.descanso != null ? ` · descansa ${tmpFmt(e.descanso)}${e.pauta != null ? ` (pauta ${tmpFmt(e.pauta)})` : ''}` : ''}</div>
      </div>
      <div class="text-right flex-shrink-0">
        <div class="text-sm font-bold ${e.real > e.estimado * 1.3 ? 'text-amber-700' : 'text-slate-800'}">${tmpFmt(e.real)}</div>
        <div class="text-[11px] text-slate-400">previsto ${tmpFmt(e.estimado)}</div>
      </div>
    </div>`).join('');
  return `
    <div class="card mb-4" data-tiempos-crm>
      <div class="font-bold text-slate-900 text-sm">⏱ Tiempos reales</div>
      <div class="text-xs text-slate-500 mt-0.5 mb-3">Con la hora de cada serie que marca: cuánto dura su rutina, cuánto descansa y en qué ejercicio se le va el tiempo. Mediana de ${r.fiables} entreno${r.fiables === 1 ? '' : 's'}${r.deGolpe ? ` (${r.deGolpe} no cuentan: marcó las series de golpe)` : ''}.</div>
      ${r.fiables ? `
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
        ${caja('Rutina total', tmpFmt(r.total, { corto: true }), r.estimado ? `previsto ~${tmpFmt(r.estimado, { corto: true })}` : '')}
        ${caja('Descanso entre series', tmpFmt(r.descanso), r.pauta != null ? `pauta ${tmpFmt(r.pauta)}` : 'sin pauta')}
        ${caja('Por ejercicio', r.ejercicios.length ? tmpFmt(tmpMediana(r.ejercicios.map(e => e.real))) : '—', 'mediana, con sus descansos')}
      </div>
      ${filas ? `<div class="text-xs text-slate-500 mt-4 mb-1">Ejercicios · primero los que más se alargan</div>${filas}` : ''}` : '<div class="text-sm text-slate-500">Todavía no hay entrenos con las series marcadas una a una.</div>'}
    </div>`;
}

// El desglose de una sesión, para «Lo que entrenó».
function entTiempoSesionHTML(t, sesionId) {
  if (!t) return '';
  const filas = t.ejercicios.map(e => `
    <tr>
      <td class="py-1 pr-2 text-slate-700">${escapeHtml(e.nombre)}</td>
      <td class="py-1 px-2 text-center text-slate-500">${e.series}</td>
      <td class="py-1 px-2 text-right font-semibold ${e.seg > e.estimado * 1.3 ? 'text-amber-700' : 'text-slate-800'}">${tmpFmt(e.seg)}</td>
      <td class="py-1 pl-2 text-right text-slate-500">${e.descansoMedio != null ? tmpFmt(e.descansoMedio) : '—'}${e.pauta != null && e.descansoMedio != null ? ` <span class="text-slate-400">/ ${tmpFmt(e.pauta)}</span>` : ''}</td>
    </tr>`).join('');
  return `
    <details class="mt-2" data-ses-tiempos="${sesionId}">
      <summary class="cursor-pointer text-xs text-slate-500">⏱ ${tmpFmt(t.total, { corto: true })} reales${t.descansoMedio != null ? ` · descanso ${tmpFmt(t.descansoMedio)}${t.pautaMedia != null ? ` (pauta ${tmpFmt(t.pautaMedia)})` : ''}` : ''}${t.fiable ? '' : ' · <span class="text-amber-700">marcó casi todo de golpe</span>'}</summary>
      <div class="mt-2 text-[11px] text-slate-500">Trabajo ~${tmpFmt(t.trabajo, { corto: true })} · descansos y cambios ~${tmpFmt(t.descanso, { corto: true })}${t.cierre != null ? ` · ${tmpFmt(t.cierre)} hasta «Terminar»` : ''}${t.golpes ? ` · ${t.golpes} serie${t.golpes === 1 ? '' : 's'} marcada${t.golpes === 1 ? '' : 's'} de golpe` : ''}${t.pausas ? ` · ${t.pausas} pausa${t.pausas === 1 ? '' : 's'} larga${t.pausas === 1 ? '' : 's'} (no cuentan)` : ''}</div>
      <table class="w-full text-xs mt-1">
        <thead><tr class="text-[10px] uppercase text-slate-400"><th class="text-left font-bold py-1 pr-2">Ejercicio</th><th class="font-bold px-2">Series</th><th class="text-right font-bold px-2">Tiempo</th><th class="text-right font-bold pl-2">Descanso / pauta</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </details>`;
}
