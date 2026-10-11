// =====================================================
// ASISTENCIA AL ARMAR RUTINAS · y Trainerize al lado de lo tuyo
// =====================================================
// Dos cosas que se leen de los mismos datos:
//
// 1. En el constructor de una rutina de cliente, una columna al lado con lo
//    que hay que saber para decidir: qué ejercicios se le repiten ciclo tras
//    ciclo, en cuáles sube y en cuáles lleva semanas igual, cuáles salta, el
//    último registro (series × reps @ peso) para arrancar con la carga
//    correcta, y qué conviene proponerle. Todo calculado aquí, sin modelo y
//    sin costo, con lo que marcó en su app + el historial importado de
//    Trainerize.
//
// 2. La foto de Trainerize (tabla `trainerize_resumen`, la llena
//    carga-trainerize-10oct.sql) AL LADO de lo que tú anotaste en el CRM:
//    cumplimiento, días de fuerza y cardio. No se mezcla con lo tuyo: se
//    muestra junto y tú decides (con un botón para pasar sus días a la ficha
//    si los de Trainerize son los buenos).
//
// Nada de esto escribe solo. Las sugerencias son sugerencias; lo que se
// añade a la rutina es con tu clic.
//
// Carga DESPUÉS de entrenamiento.js (usa _ent, entDb, entNombres, entE1rm,
// ENT_LB_KG, ENT_ESTANCADO_*, evtSumarDias y entPintarConstructor).
// =====================================================

const _asi = { porCliente: new Map() };   // clienteId → { t, datos }
const ASI_VIGENCIA_MS = 60 * 1000;
const ASI_DIAS = 'LMXJVSD';
const ASI_DIA_LARGO = { L: 'Lun', M: 'Mar', X: 'Mié', J: 'Jue', V: 'Vie', S: 'Sáb', D: 'Dom' };

const asiNorm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const asiFechaCorta = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${d} ${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][m - 1]}`;
};
const asiDiasTxt = (dias) => (dias || []).slice().sort((a, b) => ASI_DIAS.indexOf(a) - ASI_DIAS.indexOf(b)).map(d => ASI_DIA_LARGO[d] || d).join(' · ');
const asiTandas = (ids, n = 80) => { const t = []; for (let i = 0; i < ids.length; i += n) t.push(ids.slice(i, i + n)); return t; };

// ─── Datos de un cliente (de un viaje, con caché corta) ─────────────────
async function asiDatos(clienteId, force = false) {
  const c = _asi.porCliente.get(clienteId);
  if (c && !force && Date.now() - c.t < ASI_VIGENCIA_MS) return c.datos;

  const { data: fases } = await sb.from('fases')
    .select('id, nombre, fecha_inicio, semanas, orden, estado, visible_cliente, created_at')
    .eq('cliente_id', clienteId);
  const fasesOrd = (fases || []).filter(f => f.estado !== 'archivada').sort((a, b) =>
    String(a.fecha_inicio || '').localeCompare(String(b.fecha_inicio || '')) || (a.orden || 0) - (b.orden || 0)
    || String(a.created_at || '').localeCompare(String(b.created_at || '')));

  const rutinas = [];
  for (const ids of asiTandas(fasesOrd.map(f => f.id))) {
    const { data } = await sb.from('rutinas').select('id, fase_id, nombre, archivada').in('fase_id', ids);
    (data || []).filter(r => !r.archivada).forEach(r => rutinas.push(r));
  }
  const lineas = [];
  for (const ids of asiTandas(rutinas.map(r => r.id))) {
    const { data } = await sb.from('rutina_ejercicios')
      .select('id, rutina_id, ejercicio_id, series, reps, orden').in('rutina_id', ids);
    lineas.push(...(data || []));
  }

  const { data: ses } = await sb.from('sesiones')
    .select('id, fecha, estado, rutina_id, fase_id, origen')
    .eq('cliente_id', clienteId).order('fecha', { ascending: false }).limit(1000);
  const sesiones = ses || [];
  const series = await entDb.seriesDeSesiones(sesiones.filter(s => s.estado === 'completada').map(s => s.id));

  // La foto de Trainerize: puede no existir (SQL sin correr) y no pasa nada.
  let tz = null;
  try {
    const { data, error } = await sb.from('trainerize_resumen').select('*')
      .eq('cliente_id', clienteId).order('exportado', { ascending: false }).limit(1);
    if (!error && data && data[0]) tz = data[0];
  } catch (e) { /* sin tabla */ }

  const datos = { fases: fasesOrd, rutinas, lineas, sesiones, series, tz };
  _asi.porCliente.set(clienteId, { t: Date.now(), datos });
  return datos;
}

// ─── El análisis por ejercicio ──────────────────────────────────────────
// Rango de reps prescrito → [mín, máx]. «6-12», «12», «8-15 por lado».
function asiRango(reps) {
  const m = String(reps || '').match(/^\s*(\d+)\s*(?:-\s*(\d+))?\s*(?:por lado)?\s*$/);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2] || m[1]);
  return [Math.min(a, b), Math.max(a, b)];
}

// Siguiente escalón de carga: el salto que de verdad existe en un gimnasio.
function asiSiguienteCarga(kg) {
  const paso = kg < 10 ? 1 : kg < 30 ? 2 : 2.5;
  return Math.round((kg + paso) * 2) / 2;
}

const asiKg = (l) => {
  const p = Number(l.peso);
  if (!Number.isFinite(p) || p <= 0) return 0;
  return l.unidad === 'lb' ? p * ENT_LB_KG : p;
};

// «4× 12 @ 5 kg» o «12 @ 45, 15 @ 45 kg».
function asiResumenSeries(lista) {
  const fmtUna = (l) => {
    const kg = asiKg(l);
    const r = l.reps != null ? (l.notas === 'segundos' ? `${l.reps}s` : `${l.reps}`) : '—';
    return kg ? `${r} @ ${Math.round(kg * 10) / 10}` : r;
  };
  const partes = lista.map(fmtUna);
  const hayPeso = lista.some(l => asiKg(l) > 0);
  const iguales = partes.every(p => p === partes[0]);
  const txt = iguales && partes.length > 1 ? `${partes.length}× ${partes[0]}` : partes.join(', ');
  return txt + (hayPeso ? ' kg' : '');
}

function asiAnalizar(datos, { faseId, ejercicios }) {
  const hoy = fmt.hoy();
  const dias = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
  const { fases, rutinas, lineas, sesiones, series, tz } = datos;

  const faseDeRut = new Map(rutinas.map(r => [r.id, r.fase_id]));
  const idxFase = new Map(fases.map((f, i) => [f.id, i]));
  const hastaIdx = idxFase.has(faseId) ? idxFase.get(faseId) : fases.length - 1;

  // Ciclos en que aparece cada ejercicio (hasta la fase que se está armando).
  const ciclosDe = new Map();
  // Lo prescrito más reciente de cada ejercicio: el de la última fase ANTERIOR
  // que lo tuvo (lo que el cliente venía haciendo); si solo está en la que se
  // está armando, el de esa.
  const prescDe = new Map();   // ejercicio → { reps, series, peso }
  for (const l of lineas) {
    const fi = idxFase.get(faseDeRut.get(l.rutina_id));
    if (fi == null || fi > hastaIdx) continue;
    if (!ciclosDe.has(l.ejercicio_id)) ciclosDe.set(l.ejercicio_id, new Set());
    ciclosDe.get(l.ejercicio_id).add(fi);
    const peso = fi === hastaIdx ? -0.5 : fi;
    const p = prescDe.get(l.ejercicio_id);
    if (!p || peso > p.peso) prescDe.set(l.ejercicio_id, { reps: l.reps, series: l.series, peso });
  }
  const seguidos = (set) => {
    // Cuántos ciclos SEGUIDOS lo trae, contando hacia atrás desde el último en que está.
    if (!set || !set.size) return 0;
    let i = Math.max(...set), n = 0;
    while (set.has(i)) { n++; i--; }
    return n;
  };

  // Historial por ejercicio y por día: la mejor serie del día.
  const sesPorId = new Map(sesiones.map(s => [s.id, s]));
  const porEj = new Map();
  for (const l of series) {
    if (l.completada === false) continue;
    const s = sesPorId.get(l.sesion_id);
    if (!s || s.estado !== 'completada') continue;
    const e = porEj.get(l.ejercicio_id) || { dias: new Map(), sesionesCon: new Set() };
    e.sesionesCon.add(l.sesion_id);
    const d = e.dias.get(s.fecha) || { fecha: s.fecha, lineas: [], origen: s.origen };
    d.lineas.push(l);
    e.dias.set(s.fecha, d);
    porEj.set(l.ejercicio_id, e);
  }

  // La foto de Trainerize: por ejercicio, su último registro (incluye los del
  // ciclo anterior y los ⚠, que no entraron como sesión).
  const tzPorNombre = new Map();
  for (const r of (tz?.datos?.rutinas || [])) {
    for (const x of (r.ejercicios || [])) {
      const k = asiNorm(x.alias);
      const prev = tzPorNombre.get(k);
      if (!prev || String(x.fecha || '') > String(prev.fecha || '')) tzPorNombre.set(k, { ...x, rutina: r.nombre, rutinaHechas: r.hechas });
    }
  }
  const tzDe = (ej) => ej ? (tzPorNombre.get(asiNorm(ej.alias)) || tzPorNombre.get(asiNorm(ej.nombre))) : null;

  // La fase de referencia para «lo salta»: la última con sesiones hechas,
  // hasta la que se está armando.
  let faseRef = null;
  for (let i = hastaIdx; i >= 0; i--) {
    if (sesiones.some(s => s.fase_id === fases[i]?.id && s.estado === 'completada')) { faseRef = fases[i]; break; }
  }
  const sesRefPorRut = new Map();
  // Solo sesiones marcadas en su app: las importadas de Trainerize traen
  // únicamente el ÚLTIMO registro de cada ejercicio, así que a una sesión
  // importada le «faltan» ejercicios que sí hizo. Para lo importado manda
  // el «sin registro» de la foto de Trainerize (más abajo).
  if (faseRef) sesiones.filter(s => s.fase_id === faseRef.id && s.estado === 'completada' && s.rutina_id && (s.origen || 'cliente') === 'cliente')
    .forEach(s => { if (!sesRefPorRut.has(s.rutina_id)) sesRefPorRut.set(s.rutina_id, []); sesRefPorRut.get(s.rutina_id).push(s); });

  const ejById = new Map((ejercicios || []).map(e => [e.id, e]));
  const out = new Map();
  const ids = new Set([...ciclosDe.keys(), ...porEj.keys()]);
  for (const id of ids) {
    const ej = ejById.get(id);
    const h = porEj.get(id);
    const puntos = h ? [...h.dias.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)).map(d => {
      const conPeso = d.lineas.filter(l => asiKg(l) > 0);
      const mejor = conPeso.length
        ? conPeso.reduce((m, l) => (entE1rm(asiKg(l), l.reps) > entE1rm(asiKg(m), m.reps) ? l : m))
        : d.lineas.reduce((m, l) => ((Number(l.reps) || 0) > (Number(m.reps) || 0) ? l : m));
      const kg = asiKg(mejor);
      return { fecha: d.fecha, kg, reps: Number(mejor.reps) || 0, valor: kg ? entE1rm(kg, mejor.reps) : (Number(mejor.reps) || 0),
               lineas: d.lineas.sort((a, b) => (a.serie_num || 0) - (b.serie_num || 0)), origen: d.origen };
    }) : [];
    const tzx = tzDe(ej);

    // Tendencia: el último contra lo mejor de antes.
    let tendencia = 'pocos';
    let marca = null, desde = null;
    if (puntos.length >= 2) {
      const ultimo = puntos[puntos.length - 1];
      const antes = puntos.slice(0, -1);
      const mejorAntes = Math.max(...antes.map(p => p.valor));
      const maximo = Math.max(...puntos.map(p => p.valor));
      const primeraEnMax = puntos.find(p => p.valor >= maximo * 0.995);
      const sesDesde = puntos.filter(p => p.fecha >= primeraEnMax.fecha).length;
      if (ultimo.valor > mejorAntes * 1.005) tendencia = 'sube';
      else if (dias(primeraEnMax.fecha, hoy) >= ENT_ESTANCADO_DIAS && sesDesde >= ENT_ESTANCADO_MIN_SES) {
        tendencia = 'estancado'; desde = primeraEnMax.fecha;
        marca = primeraEnMax.kg ? `${Math.round(primeraEnMax.kg * 10) / 10} kg × ${primeraEnMax.reps}` : `${primeraEnMax.reps} reps`;
      } else if (ultimo.valor < mejorAntes * 0.93) tendencia = 'baja';
      else tendencia = 'estable';
    }

    // Lo salta: estaba en una rutina de la fase de referencia, esa rutina se
    // entrenó, y en esas sesiones este ejercicio no tiene ni una serie.
    let salto = null;
    if (faseRef) {
      const rutsCon = lineas.filter(l => l.ejercicio_id === id && faseDeRut.get(l.rutina_id) === faseRef.id).map(l => l.rutina_id);
      const sesR = [...new Set(rutsCon)].flatMap(rid => sesRefPorRut.get(rid) || []);
      if (sesR.length) {
        const hechas = sesR.filter(s => h?.sesionesCon.has(s.id)).length;
        if (hechas < sesR.length && sesR.length >= 2 && hechas / sesR.length <= 0.5) salto = { hechas, de: sesR.length };
      }
    }
    if (!salto && tzx && !tzx.fecha && (tzx.rutinaHechas || 0) >= 2) salto = { hechas: 0, de: tzx.rutinaHechas, tz: true };

    const set = ciclosDe.get(id);
    const ult = puntos[puntos.length - 1] || null;
    out.set(id, {
      id, ej, puntos, tendencia, marca, desde, salto,
      ciclos: set ? set.size : 0, seguidos: seguidos(set),
      enFaseActual: !!(set && set.has(hastaIdx)),
      presc: prescDe.get(id) || null,
      ultimo: ult ? { fecha: ult.fecha, txt: asiResumenSeries(ult.lineas), kgTop: Math.max(0, ...ult.lineas.map(asiKg)), lineas: ult.lineas, origen: ult.origen } : null,
      tz: tzx || null,
    });
  }
  return { porEj: out, faseRef, hastaIdx };
}

// La sugerencia de UN ejercicio: una línea, con tono.
function asiSugerencia(a, prescActual) {
  const rango = asiRango(prescActual?.reps) || asiRango(a.presc?.reps);
  const u = a.ultimo;
  if (a.tz?.alerta && (!u || (a.tz.fecha && a.tz.fecha >= u.fecha))) {
    return { tono: 'ojo', txt: `Último registro dudoso en Trainerize (${a.tz.alerta}): ${a.tz.ultimo}. Confírmalo antes de poner carga.` };
  }
  if (a.salto) {
    return { tono: 'ojo', txt: a.salto.tz
      ? `Sin registro en todo el ciclo aunque hizo la rutina ${a.salto.de} veces: lo está saltando. Pregúntale o cámbialo por otro del mismo patrón.`
      : `Lo hizo en ${a.salto.hechas} de ${a.salto.de} sesiones de esa rutina: lo salta. Pregúntale por qué o cámbialo.` };
  }
  // Solo en el trabajo principal (2+ series): en un calentamiento de 1 serie
  // pasarse de reps no es señal de subir carga.
  const seriesPresc = Number(a.presc?.series ?? prescActual?.series) || 0;
  if (u && rango && u.kgTop > 0 && seriesPresc >= 2) {
    const reps = u.lineas.map(l => Number(l.reps) || 0).filter(n => n > 0);
    if (reps.length && reps.every(r => r >= rango[1])) {
      return { tono: 'bien', txt: `Llegó al tope del rango (${rango[1]} reps en todas las series con ${Math.round(u.kgTop * 10) / 10} kg): sube carga, prueba ${asiSiguienteCarga(u.kgTop)} kg.` };
    }
    if (reps.length && reps.every(r => r < rango[0])) {
      return { tono: 'idea', txt: `Se queda por debajo del rango (${reps.join(', ')} reps de ${rango[0]}-${rango[1]}): mantén o baja un escalón la carga.` };
    }
  }
  if (a.tendencia === 'estancado') {
    return { tono: 'idea', txt: a.seguidos >= 2
      ? `Sin superar ${a.marca} desde el ${asiFechaCorta(a.desde)} y ya lleva ${a.seguidos} ciclos seguidos: buen candidato para cambiar por una variante.`
      : `Sin superar ${a.marca} desde el ${asiFechaCorta(a.desde)}: cambia el estímulo (otro rango de reps, tempo o variante).` };
  }
  if (a.tendencia === 'sube') {
    return { tono: 'bien', txt: a.seguidos >= 3
      ? `Sigue progresando después de ${a.seguidos} ciclos: le está funcionando, mantenlo.`
      : 'Progresando: mantenlo y sigue subiendo.' };
  }
  if (a.tendencia === 'baja') return { tono: 'ojo', txt: 'Su última marca quedó por debajo de las anteriores: puede ser cansancio o técnica. Mantén la carga.' };
  if (a.seguidos >= 3) return { tono: 'idea', txt: `Lleva ${a.seguidos} ciclos seguidos sin cambios grandes: puedes moverlo o variarlo para darle un estímulo nuevo.` };
  if (!u && !a.tz?.fecha) return { tono: 'nada', txt: a.ciclos > 1 ? 'Lo ha tenido antes pero no hay registros de cómo le fue.' : 'Nuevo para este cliente: sin historial todavía.' };
  if (a.tendencia === 'pocos') return { tono: 'nada', txt: 'Pocos registros todavía: mantenlo para tener con qué comparar.' };
  return { tono: 'nada', txt: 'Estable.' };
}

// ─── Trainerize al lado de lo tuyo ──────────────────────────────────────
async function asiCompara(cliente, segs, datos) {
  const tz = datos?.tz;
  if (!tz) return null;
  const finCuenta = (tz.fin && tz.exportado && tz.fin > tz.exportado) ? tz.exportado : tz.fin;
  // Lo que anotaste tú en los seguimientos de esas semanas.
  const enRango = (segs || []).filter(s => {
    if (!s.semana || typeof semanaISOToRange !== 'function') return false;
    const [ini, fin] = semanaISOToRange(s.semana);
    return fin >= tz.inicio && ini <= finCuenta;
  });
  const conFuerza = enRango.filter(s => s.fuerza_planeados != null || s.fuerza_ejecutados != null);
  const crmHechas = conFuerza.reduce((n, s) => n + (Number(s.fuerza_ejecutados) || 0), 0);
  const crmPlan = conFuerza.reduce((n, s) => n + (Number(s.fuerza_planeados) || 0), 0);
  const semanasCiclo = Math.max(1, Math.ceil((Date.parse(finCuenta + 'T12:00:00Z') - Date.parse(tz.inicio + 'T12:00:00Z')) / 86400000 / 7));
  // Lo que marcó en su app (no lo importado).
  const deApp = (datos.sesiones || []).filter(s => s.estado === 'completada' && (s.origen || 'cliente') === 'cliente'
    && s.fecha >= tz.inicio && s.fecha <= finCuenta).length;
  return { tz, crmHechas, crmPlan, semanasCRM: conFuerza.length, semanasCiclo, deApp, finCuenta };
}

function asiComparaHTML(cliente, cmp, { compacto = false } = {}) {
  if (!cmp) return '';
  const { tz } = cmp;
  const pct = (a, b) => b ? Math.round((a / b) * 100) : null;
  const pTz = pct(tz.hechas, tz.programadas), pCrm = pct(cmp.crmHechas, cmp.crmPlan);
  const diasFicha = cliente?.dias_entreno || [];
  const mismos = asiDiasTxt(diasFicha) === asiDiasTxt(tz.dias_fuerza);
  const cardio = (tz.datos?.cardio || []).filter(x => x.tipo);
  const rutinas = tz.datos?.rutinas || [];
  const celda = (titulo, cuerpo, pie = '') => `
    <div class="rounded-xl border border-slate-200 bg-white p-2.5 min-w-0">
      <div class="text-[10px] font-bold uppercase tracking-wide text-slate-400">${titulo}</div>
      <div class="text-sm font-bold text-slate-900 mt-0.5">${cuerpo}</div>
      ${pie ? `<div class="text-[11px] text-slate-500 mt-0.5">${pie}</div>` : ''}
    </div>`;
  return `
    <div class="rounded-2xl border border-slate-200 bg-slate-50 p-3" data-tz-compara>
      <div class="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div class="font-bold text-slate-900 text-sm">📦 Trainerize al lado de lo tuyo</div>
          <div class="text-[11px] text-slate-500">${escapeHtml(String(tz.ciclo || '').replace(/\bcycle\b/i, 'Ciclo'))} · ${asiFechaCorta(tz.inicio)} → ${asiFechaCorta(tz.fin)} · exportado el ${asiFechaCorta(tz.exportado)}. No se mezcla con lo tuyo: tú decides cuál vale.</div>
        </div>
      </div>
      <div class="text-[11px] font-bold text-slate-600 mt-2 mb-1">Sesiones de fuerza del ciclo</div>
      <div class="grid grid-cols-3 gap-2">
        ${celda('Trainerize', `${tz.hechas}/${tz.programadas}${pTz != null ? ` · ${pTz}%` : ''}`, 'marcadas allá')}
        ${celda('Tu CRM', cmp.semanasCRM ? `${cmp.crmHechas}/${cmp.crmPlan}${pCrm != null ? ` · ${pCrm}%` : ''}` : '—',
          cmp.semanasCRM ? `${cmp.semanasCRM} de ${cmp.semanasCiclo} semanas anotadas` : 'sin seguimientos en esas semanas')}
        ${celda('Su app nueva', `${cmp.deApp}`, 'marcadas en la app')}
      </div>
      <div class="text-[11px] font-bold text-slate-600 mt-2 mb-1">Días de fuerza</div>
      <div class="grid grid-cols-2 gap-2">
        ${celda('Trainerize', escapeHtml(asiDiasTxt(tz.dias_fuerza) || '—'), escapeHtml(tz.datos?.calendario ? String(tz.datos.calendario).replace(/\s*·\s*/g, ' · ').slice(0, compacto ? 90 : 400) + (compacto && String(tz.datos.calendario).length > 90 ? '…' : '') : ''))}
        ${celda('Tu ficha', escapeHtml(asiDiasTxt(diasFicha) || '—'), mismos ? '✓ coinciden' : `
          <button type="button" class="text-emerald-700 font-semibold underline" data-usar-dias-tz onclick="asiUsarDiasTz('${cliente.id}')">Usar los de Trainerize en su ficha</button>`)}
      </div>
      ${!compacto && rutinas.length ? `
        <div class="text-[11px] font-bold text-slate-600 mt-2 mb-1">Por rutina (Trainerize)</div>
        <div class="space-y-1">
          ${rutinas.map(r => `<div class="flex justify-between gap-2 text-xs">
            <span class="text-slate-700 truncate">${escapeHtml(r.nombre)} <span class="text-slate-400">· ${escapeHtml(asiDiasTxt(r.dias))}</span></span>
            <span class="font-semibold text-slate-800 whitespace-nowrap">${r.hechas}/${r.programadas}${r.ultima ? ` · última ${asiFechaCorta(r.ultima)}` : ' · nunca'}</span>
          </div>`).join('')}
        </div>` : ''}
      ${cardio.length ? `
        <div class="text-[11px] font-bold text-slate-600 mt-2 mb-1">Cardio programado en Trainerize</div>
        <div class="flex flex-wrap gap-1">
          ${cardio.map(x => `<span class="tag" title="${escapeHtml(asiDiasTxt(x.dias))}">${escapeHtml(x.tipo)} ${x.hechas}/${x.programadas}</span>`).join('')}
        </div>` : ''}
    </div>`;
}

// En la ficha del cliente.
window.asiPintarCompara = async (cliente, contenedorId, segs) => {
  const caja = document.getElementById(contenedorId);
  if (!caja || !cliente?.id) return;
  try {
    const datos = await asiDatos(cliente.id);
    const cmp = await asiCompara(cliente, segs || await db.seguimientos.listCliente(cliente.id), datos);
    caja.innerHTML = cmp ? asiComparaHTML(cliente, cmp) : '';
  } catch (e) { caja.innerHTML = ''; }
};

window.asiUsarDiasTz = async (clienteId) => {
  const d = await asiDatos(clienteId);
  const dias = (d?.tz?.dias_fuerza || []).slice().sort((a, b) => ASI_DIAS.indexOf(a) - ASI_DIAS.indexOf(b));
  if (!dias.length) return;
  if (!confirm(`¿Poner en su ficha que entrena ${asiDiasTxt(dias)} (${dias.length} días de fuerza)? Es lo que dice Trainerize.`)) return;
  await db.clientes.update(clienteId, { dias_entreno: dias, dias_entreno_cantidad: dias.length });
  toast('Días de la ficha actualizados');
  document.querySelectorAll('[data-usar-dias-tz]').forEach(b => { b.outerHTML = '✓ coinciden'; });
};

// ─── La columna del constructor ─────────────────────────────────────────
window.asiMontarConstructor = async (r) => {
  const caja = $('#asi-panel');
  if (!caja) return;
  if (!r?.cliente_id) { caja.remove(); return; }
  try {
    const [datos, todos, cliente, segs] = await Promise.all([
      asiDatos(r.cliente_id), entDb.ejercicios(), db.clientes.get(r.cliente_id), db.seguimientos.listCliente(r.cliente_id),
    ]);
    if (_ent.rutinaId !== r.id || !document.body.contains(caja)) return;
    const an = asiAnalizar(datos, { faseId: r.fase_id, ejercicios: todos });
    const cmp = await asiCompara(cliente, segs, datos);
    caja.innerHTML = asiPanelHTML(r, an, cliente, cmp, todos, datos);
  } catch (e) {
    console.warn('asistencia', e);
    caja.innerHTML = '<div class="card text-xs text-slate-400">No pude leer el historial de este cliente.</div>';
  }
};

function asiPanelHTML(r, an, cliente, cmp, todos, datos) {
  const T = {
    bien: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    ojo: 'border-amber-200 bg-amber-50 text-amber-900',
    idea: 'border-blue-200 bg-blue-50 text-blue-900',
    nada: 'border-slate-200 bg-white text-slate-600',
  };
  const chip = (txt, cls = 'bg-slate-100 text-slate-600') => `<span class="inline-block rounded-full px-1.5 py-px text-[10px] font-semibold ${cls}">${txt}</span>`;
  const chipTend = (a) => ({
    sube: chip('↗ sube', 'bg-emerald-100 text-emerald-800'),
    estancado: chip('＝ estancado', 'bg-amber-100 text-amber-800'),
    baja: chip('↘ bajó', 'bg-amber-100 text-amber-800'),
    estable: chip('→ estable'),
  })[a.tendencia] || '';
  const nombre = (ej) => ej ? escapeHtml(entNombres(ej).grande) : 'ejercicio';
  const enEsta = new Set(r.ejercicios.map(x => x.ejercicio_id));

  // 1. Los de esta rutina.
  const filas = r.ejercicios.map(re => {
    const a = an.porEj.get(re.ejercicio_id) || { ciclos: 0, seguidos: 0, tendencia: 'pocos', puntos: [], ultimo: null, tz: null, salto: null, ej: re.ejercicios };
    a.ej = a.ej || re.ejercicios;
    const s = asiSugerencia(a, re);
    const ultimo = a.ultimo
      ? `${escapeHtml(a.ultimo.txt)} <span class="text-slate-400">· ${asiFechaCorta(a.ultimo.fecha)}${a.ultimo.origen === 'importada' ? ' · Trainerize' : ''}</span>`
      : (a.tz?.fecha ? `${escapeHtml(a.tz.ultimo)} <span class="text-slate-400">· Trainerize</span>` : '<span class="text-slate-400">sin registro</span>');
    return `
      <div class="py-2" style="border-bottom:1px solid #eef0f3" data-asi-ej="${re.ejercicio_id}">
        <div class="flex items-start justify-between gap-2">
          <div class="text-[13px] font-bold text-slate-900 leading-tight min-w-0">${nombre(a.ej)}</div>
          <div class="flex gap-1 flex-shrink-0">${a.ciclos > 1 ? chip(`${a.seguidos >= 2 ? a.seguidos + ' ciclos seguidos' : a.ciclos + ' ciclos'}`) : ''}${chipTend(a)}</div>
        </div>
        <div class="text-[11px] text-slate-600 mt-0.5">Último: ${ultimo}</div>
        <div class="text-[11px] mt-1 rounded-lg border px-2 py-1 ${T[s.tono]}">${escapeHtml(s.txt)}</div>
      </div>`;
  }).join('');

  // 2. Los que más se le repiten (en toda su historia).
  const repetidos = [...an.porEj.values()].filter(a => a.ciclos >= 3)
    .sort((a, b) => b.ciclos - a.ciclos || b.seguidos - a.seguidos).slice(0, 8);

  // 3. Para proponer: le funcionaron antes y hoy no los tiene, y variantes
  //    de los estancados (mismo patrón y segmento, mejor si tienen video).
  const rutDeFase = new Set(datos.rutinas.filter(x => x.fase_id === r.fase_id).map(x => x.id));
  const enFase = new Set(datos.lineas.filter(l => rutDeFase.has(l.rutina_id)).map(l => l.ejercicio_id));
  const volver = [...an.porEj.values()].filter(a => a.tendencia === 'sube' && !enEsta.has(a.id) && !enFase.has(a.id) && a.ej && !a.ej.archivado)
    .sort((a, b) => (b.ultimo?.fecha || '').localeCompare(a.ultimo?.fecha || '')).slice(0, 5);
  const usados = new Set([...an.porEj.keys()]);
  const variantes = r.ejercicios.map(re => an.porEj.get(re.ejercicio_id)).filter(a => a && (a.tendencia === 'estancado' || a.seguidos >= 3 || a.salto) && a.ej)
    .slice(0, 4).map(a => {
      const base = a.ej;
      const alt = todos.filter(e => !e.archivado && e.id !== base.id && !usados.has(e.id) && !enEsta.has(e.id)
        && e.patron && e.patron === base.patron && e.segmento === base.segmento
        && (!base.tipo || e.tipo === base.tipo))
        .sort((x, y) => ((y.video_fuente && y.video_fuente !== 'ninguno') - (x.video_fuente && x.video_fuente !== 'ninguno'))
          || (((_ent.enUso && _ent.enUso.get(y.id)) || 0) - ((_ent.enUso && _ent.enUso.get(x.id)) || 0)))
        .slice(0, 3);
      return { a, alt };
    }).filter(v => v.alt.length);

  const salta = [...an.porEj.values()].filter(a => a.salto).slice(0, 8);
  const btnAdd = (id) => `<button class="btn btn-ghost btn-sm !py-0 !px-2 !text-xs" onclick="entAgregarARutina('${id}')">+ Añadir</button>`;
  const sec = (titulo, nota, cuerpo, abierta = true) => cuerpo ? `
    <details class="card !p-3 mb-3" ${abierta ? 'open' : ''}>
      <summary class="font-bold text-slate-900 text-sm cursor-pointer">${titulo}</summary>
      ${nota ? `<div class="text-[11px] text-slate-500 mt-0.5 mb-1">${nota}</div>` : ''}
      ${cuerpo}
    </details>` : '';

  return `
    <div class="text-sm font-bold text-slate-700 mb-2">🧭 Asistencia · ${escapeHtml(cliente?.nombre || '')}</div>
    ${cmp ? `<div class="mb-3">${asiComparaHTML(cliente, cmp, { compacto: true })}</div>` : ''}
    ${sec('En esta rutina', an.faseRef ? `Lo que se sabe de cada ejercicio, hasta ${escapeHtml(an.faseRef.nombre)}. La carga para arrancar es la del último registro.` : 'Todavía no hay sesiones registradas de este cliente.',
      filas || '<div class="text-xs text-slate-400 py-2">Añade ejercicios y aquí sale su historial.</div>')}
    ${sec('🔁 Los que más se le repiten', 'Ciclos en los que ha estado cada uno. Muchos seguidos = pensar en variarlo, salvo que siga subiendo.',
      repetidos.map(a => `<div class="flex items-center justify-between gap-2 py-1 text-xs" style="border-bottom:1px solid #f1f5f9">
        <span class="min-w-0 truncate ${enEsta.has(a.id) ? 'font-bold text-slate-900' : 'text-slate-700'}">${nombre(a.ej)}${enEsta.has(a.id) ? ' · en esta' : ''}</span>
        <span class="flex gap-1 flex-shrink-0">${chip(`${a.ciclos} ciclos`)}${chipTend(a)}</span></div>`).join(''), false)}
    ${sec('💡 Para proponer', 'Le funcionaron antes y hoy no los tiene, y variantes para los que están estancados o se repiten mucho.',
      (volver.length ? `<div class="text-[11px] font-bold text-slate-600 mt-1">Le funcionaron (subió) y no están en esta fase</div>` + volver.map(a => `
        <div class="flex items-center justify-between gap-2 py-1 text-xs">
          <span class="min-w-0"><span class="font-semibold text-slate-800">${nombre(a.ej)}</span> <span class="text-slate-400">· ${escapeHtml(a.ultimo?.txt || '')}</span></span>
          ${btnAdd(a.id)}</div>`).join('') : '')
      + variantes.map(v => `<div class="text-[11px] font-bold text-slate-600 mt-2">En vez de ${nombre(v.a.ej)}</div>` + v.alt.map(e => `
        <div class="flex items-center justify-between gap-2 py-1 text-xs">
          <span class="min-w-0 truncate text-slate-800">${escapeHtml(entNombres(e).grande)}${e.video_fuente && e.video_fuente !== 'ninguno' ? ' <span class="text-slate-400">· con video</span>' : ''}</span>
          ${btnAdd(e.id)}</div>`).join('')).join(''), false)}
    ${sec('⏭️ Lo que salta', 'En su último ciclo con registros: estaba en la rutina, la rutina se hizo y este ejercicio casi nunca se marcó.',
      salta.map(a => `<div class="flex items-center justify-between gap-2 py-1 text-xs" style="border-bottom:1px solid #f1f5f9">
        <span class="min-w-0 truncate text-slate-800">${nombre(a.ej)}</span>
        <span class="text-amber-700 font-semibold flex-shrink-0">${a.salto.tz ? `0 de ${a.salto.de}` : `${a.salto.hechas} de ${a.salto.de}`}</span></div>`).join(''), false)}
  `;
}
