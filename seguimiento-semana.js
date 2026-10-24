// =====================================================
// ESTA SEMANA · lo primero que ves al entrar a un cliente
// =====================================================
// Arriba del Resumen de la ficha, en tres partes:
//   · Cumplimiento: fuerza, cardio y comida de la semana, en números y día
//     por día (L–D). Color = lo hizo · borde rojo = le tocaba y no lo hizo ·
//     rayas = no registró comida · punteado = le toca todavía.
//   · En pocas palabras: lo mismo escrito, con sus números. Solo lo que está
//     en los datos: si falta un dato, se dice que falta.
//   · Mensajes para esta semana: 2 o 3, elegidos por cómo le fue, con sus
//     números ya puestos y con la voz del coach. Cada situación tiene varias
//     versiones y cada semana sale otra (nunca la misma que la semana pasada).
//
// Lo planeado sale de lo mismo que ve el cliente en su app: el reparto de
// rutinas de su ciclo con lo que se movió un solo día (entreno-dias.js) y
// los eventos del calendario (eventos.js). La comida, del Mealtracker
// (coach-data, emparejado por nombre como la Bandeja).
//
// Carga DESPUÉS de entrenamiento.js, eventos.js, entreno-dias.js y
// dialogos.js (usa evtSumarDias, evtPorFecha, entRepartirRutinas,
// entRutinaPorFechaDia, fzDb, dlgTrato…).
// =====================================================

const _es = { comida: null, comidaEn: 0, semana: {}, datos: null, cliente: null };
const ES_DIA_LARGO = { L: 'lunes', M: 'martes', X: 'miércoles', J: 'jueves', V: 'viernes', S: 'sábado', D: 'domingo' };
const ES_TIPOS_MED = { peso: 'el peso', medidas: 'las medidas', medicion: 'la medición', fotos: 'las fotos de progreso' };

const esLunes = (iso) => evtSumarDias(iso, -evtOffsetDia(iso));
const esDia = (f) => ES_DIA_LARGO[evtCodigoDe(f)];
// Número de semana continuo (no se reinicia en enero): para rotar versiones.
const esSemanaAbs = (lunes) => Math.round(evtDia(lunes).getTime() / 604800000);
function esHash(s) { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }
const esNum = (x, dec = 1) => { const v = Math.round(Number(x) * 10 ** dec) / 10 ** dec; return String(v).replace('.', ','); };
function esLista(xs) {
  const a = xs.filter(Boolean);
  if (a.length <= 1) return a[0] || '';
  return a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1];
}
// «el jueves», o «hoy» / «mañana» si cae ahí.
function esCuando(f, hoy) {
  if (f === hoy) return 'hoy';
  if (f === evtSumarDias(hoy, 1)) return 'mañana';
  return 'el ' + esDia(f);
}
const esFechaCorta = (f) => {
  const m = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${Number(f.slice(8, 10))} ${m[Number(f.slice(5, 7)) - 1]}`;
};

// ── Datos ───────────────────────────────────────────────────────────────
async function esLeerComida(c) {
  if (!_es.comida || Date.now() - _es.comidaEn > 120000) {
    let lista = null;
    try {
      if (typeof mtApiBase === 'function' && mtApiBase()) {
        const r = await mtApiGet('/api/coach-data?action=list');
        lista = r && Array.isArray(r.clients) ? r.clients : null;
      }
    } catch (e) { lista = null; }
    if (!lista) return null;
    const porNombre = {};
    lista.forEach(u => {
      const k = normalizeName(u.name);
      const prev = porNombre[k];
      if (!prev) { porNombre[k] = { last_active: u.last_active, recent_days: { ...(u.recent_days || {}) } }; return; }
      if ((u.last_active || '') > (prev.last_active || '')) prev.last_active = u.last_active;
      Object.entries(u.recent_days || {}).forEach(([f, v]) => { if (!prev.recent_days[f]) prev.recent_days[f] = v; });
    });
    _es.comida = porNombre;
    _es.comidaEn = Date.now();
  }
  const k = [c.nombre, ...(c.nombres_alternos || [])].map(normalizeName).find(n => _es.comida[n]);
  return k ? _es.comida[k] : null;
}

async function esLeer(c, lunes) {
  const desde = evtSumarDias(lunes, -7), hasta = evtSumarDias(lunes, 6);
  const leer = async (q) => { try { const { data, error } = await q; return error ? null : (data || []); } catch (e) { return null; } };
  const sesDesde = evtSumarDias(lunes, -42);
  const [fases, sesiones, eventos, registros, actividades, notas, meds, fotos, comida] = await Promise.all([
    leer(sb.from('fases').select('*').eq('cliente_id', c.id)),
    (async () => (await leer(sb.from('sesiones').select('id, fecha, estado, rpe, records, rutina_id, fase_id, rutinas(nombre)').eq('cliente_id', c.id).gte('fecha', sesDesde).lte('fecha', hasta)))
      || (await leer(sb.from('sesiones').select('id, fecha, estado, rpe, rutina_id, fase_id, rutinas(nombre)').eq('cliente_id', c.id).gte('fecha', sesDesde).lte('fecha', hasta)))
      || [])(),
    typeof evtDb !== 'undefined' ? evtDb.lista(c.id) : null,
    typeof evtDb !== 'undefined' ? evtDb.registros(c.id, desde) : [],
    leer(sb.from('actividades').select('*').eq('cliente_id', c.id).gte('fecha', desde).lte('fecha', hasta)),
    leer(sb.from('notas_entreno').select('*, ejercicios(nombre, alias)').eq('cliente_id', c.id).is('leida_en', null).order('created_at', { ascending: false }).limit(20)),
    leer(sb.from('mediciones_corporales').select('id, fecha, peso').eq('cliente_id', c.id).gte('fecha', desde).lte('fecha', hasta)),
    leer(sb.from('fotos_progreso').select('id, fecha').eq('cliente_id', c.id).gte('fecha', desde).lte('fecha', hasta)),
    esLeerComida(c),
  ]);

  // Los ciclos que tocan estas dos semanas y que el cliente ve.
  const fin = (f) => (f.fecha_inicio && f.semanas ? evtSumarDias(f.fecha_inicio, f.semanas * 7 - 1) : null);
  const vigentes = (fases || []).filter(f => f.estado !== 'archivada' && f.visible_cliente !== false && f.fecha_inicio
    && f.fecha_inicio <= hasta && (!fin(f) || fin(f) >= desde));
  const rutinas = vigentes.length ? (await leer(sb.from('rutinas').select('*').in('fase_id', vigentes.map(f => f.id)))) || [] : [];
  const planes = [];
  for (const f of vigentes) {
    const rs = rutinas.filter(r => r.fase_id === f.id && !r.archivada);
    let cambios = { movimientos: [], extras: [], quitados: [] };
    if (typeof fzDb !== 'undefined') { try { cambios = await fzDb.cambios(f.id); } catch (e) { /* sin tablas: el plan semanal */ } }
    const porId = Object.fromEntries(rs.map(r => [r.id, r]));
    const extras = (cambios.extras || []).filter(x => porId[x.rutina_id]).map(x => ({ fecha: String(x.fecha).slice(0, 10), rutina: porId[x.rutina_id], origen: x.origen || 'cliente' }));
    const { porDia } = entRepartirRutinas(f, rs);
    const semanal = Object.fromEntries(Object.entries(porDia).map(([d, s]) => [d, s ? s.r : null]));
    planes.push({ fase: f, fin: fin(f), rutinaDe: entRutinaPorFechaDia(f, semanal, cambios.movimientos, extras, cambios.quitados) });
  }
  planes.sort((a, b) => b.fase.fecha_inicio.localeCompare(a.fase.fecha_inicio));

  // Series de lo completado: para ver si subió de peso respecto a la vez anterior.
  const completadas = (sesiones || []).filter(s => s.estado === 'completada');
  const series = typeof entDb !== 'undefined' && completadas.length ? await entDb.seriesDeSesiones(completadas.map(s => s.id)) : [];

  const fasesPorId = Object.fromEntries((fases || []).map(f => [f.id, f]));
  return {
    planes, sesiones: sesiones || [], series,
    eventos: eventos || [], eventosPorFecha: eventos ? evtPorFecha(eventos.filter(e => e.visible_cliente !== false), fasesPorId) : {},
    registros: registros || [], actividades: actividades || [], notas: notas || [], meds: meds || [], fotos: fotos || [],
    comida,
  };
}

// ── La semana, calculada ────────────────────────────────────────────────
function esCalcular(D, lunes, hoy) {
  const fechas = Array.from({ length: 7 }, (_, i) => evtSumarDias(lunes, i));
  const dia10 = (x) => String(x || '').slice(0, 10);
  const rutinaPlan = (f) => {
    const p = D.planes.find(x => f >= x.fase.fecha_inicio && (!x.fin || f <= x.fin));
    return p ? p.rutinaDe(f) : null;
  };
  const hechos = new Set([
    ...D.registros.filter(r => r.estado === 'hecho').map(r => `${r.evento_id}:${dia10(r.fecha)}`),
    ...D.actividades.filter(a => a.evento_id).map(a => `${a.evento_id}:${dia10(a.fecha)}`),
  ]);

  // Fuerza
  const sesSem = D.sesiones.filter(s => s.estado === 'completada' && fechas.includes(dia10(s.fecha)));
  const dias = fechas.map(f => {
    const plan = rutinaPlan(f);
    const ses = sesSem.filter(s => dia10(s.fecha) === f);
    return { f, cod: evtCodigoDe(f), futuro: f > hoy, esHoy: f === hoy, plan, ses };
  });
  // Lo que hizo en otro día sin moverlo en el calendario cubre lo que faltó.
  const sobrantes = [];
  dias.forEach(d => d.ses.forEach(s => { if (!d.plan || d.plan.id !== s.rutina_id) sobrantes.push(s); }));
  dias.forEach(d => {
    if (d.ses.length) { d.fuerza = 'hecho'; return; }
    if (!d.plan) { d.fuerza = 'nada'; return; }
    const k = sobrantes.findIndex(s => s.rutina_id === d.plan.id);
    if (k >= 0) { sobrantes.splice(k, 1); d.fuerza = 'cubierto'; return; }
    d.fuerza = d.f < hoy ? 'falto' : 'pendiente';
  });
  const nombreRut = (r) => (r && r.nombre) || 'la rutina';
  const F = {
    plan: dias.filter(d => d.plan).length,
    hechas: sesSem.length,
    faltaron: dias.filter(d => d.fuerza === 'falto').map(d => ({ f: d.f, rut: nombreRut(d.plan) })),
    quedan: dias.filter(d => d.fuerza === 'pendiente').map(d => ({ f: d.f, rut: nombreRut(d.plan) })),
  };

  // Cardio y actividades que le pusiste (y las que hizo por su cuenta)
  const C = { plan: 0, hechos: 0, faltaron: [], quedan: [], extras: [] };
  dias.forEach(d => {
    const evs = (D.eventosPorFecha[d.f] || []).filter(e => e.tipo === 'actividad');
    d.cardio = 'nada';
    evs.forEach(e => {
      C.plan++;
      const titulo = e.titulo || 'cardio';
      if (hechos.has(`${e.id}:${d.f}`)) { C.hechos++; d.cardio = 'hecho'; }
      else if (d.f < hoy) { C.faltaron.push({ f: d.f, titulo, min: e.duracion_min || null }); if (d.cardio !== 'hecho') d.cardio = 'falto'; }
      else { C.quedan.push({ f: d.f, titulo, min: e.duracion_min || null }); if (d.cardio === 'nada') d.cardio = 'pendiente'; }
    });
    const suyas = D.actividades.filter(a => !a.evento_id && dia10(a.fecha) === d.f);
    suyas.forEach(a => C.extras.push(a.titulo || a.tipo || 'actividad'));
    if (suyas.length && d.cardio !== 'hecho') d.cardio = 'hecho';
  });

  // Peso, medidas y fotos que tocaban
  const M = [];
  dias.forEach(d => (D.eventosPorFecha[d.f] || []).filter(e => ES_TIPOS_MED[e.tipo]).forEach(e => {
    const porTabla = e.tipo === 'fotos' ? D.fotos.some(x => dia10(x.fecha) >= lunes && dia10(x.fecha) <= fechas[6])
      : D.meds.some(x => dia10(x.fecha) >= lunes && dia10(x.fecha) <= fechas[6]);
    M.push({ tipo: e.tipo, f: d.f, hecho: hechos.has(`${e.id}:${d.f}`) || porTabla, pasado: d.f < hoy });
  }));

  // Comida (del Mealtracker)
  let K = null;
  if (D.comida) {
    const rd = D.comida.recent_days || {};
    const pasados = fechas.filter(f => f <= hoy);
    dias.forEach(d => {
      const v = rd[d.f];
      d.comida = v && Number(v.kcal) > 0 ? 'hecho' : d.f < hoy ? 'sin' : 'nada';
    });
    const regs = pasados.map(f => rd[f]).filter(v => v && Number(v.kcal) > 0);
    const conMetaP = regs.filter(v => v.goal_p > 0);
    const conMetaK = regs.filter(v => v.goal_kcal > 0);
    const sinDias = fechas.filter(f => f < hoy && !(rd[f] && Number(rd[f].kcal) > 0));
    K = {
      dias: regs.length,
      base: pasados.filter(f => f < hoy || (rd[f] && Number(rd[f].kcal) > 0)).length,
      sinDias,
      finde: sinDias.some(f => ['S', 'D'].includes(evtCodigoDe(f))),
      prot: conMetaP.length >= 3 ? {
        prom: Math.round(conMetaP.reduce((a, v) => a + Number(v.p || 0), 0) / conMetaP.length),
        meta: Math.round(conMetaP.reduce((a, v) => a + Number(v.goal_p), 0) / conMetaP.length),
        n: conMetaP.length,
      } : null,
      enMeta: conMetaK.filter(v => Math.abs(v.kcal - v.goal_kcal) <= v.goal_kcal * 0.1).length,
      conMeta: conMetaK.length,
    };
    if (K.prot) K.prot.pct = K.prot.meta ? K.prot.prom / K.prot.meta : null;
  } else {
    dias.forEach(d => { d.comida = 'nodata'; });
  }

  // Récords y subidas de peso
  const rec = [];
  sesSem.forEach(s => (Array.isArray(s.records) ? s.records : []).forEach(r => rec.push(r)));
  const sesFecha = Object.fromEntries(D.sesiones.map(s => [s.id, dia10(s.fecha)]));
  const porEj = {};
  D.series.forEach(x => {
    const f = sesFecha[x.sesion_id];
    if (!f || !(Number(x.peso) > 0) || x.completada === false) return;
    const k = `${x.ejercicio_id}|${x.unidad || 'kg'}`;
    (porEj[k] ||= { nombre: (x.ejercicios && x.ejercicios.nombre) || 'Ejercicio', unidad: x.unidad || 'kg', sem: 0, antes: {} });
    if (f >= lunes && f <= fechas[6]) porEj[k].sem = Math.max(porEj[k].sem, Number(x.peso));
    else if (f < lunes) porEj[k].antes[f] = Math.max(porEj[k].antes[f] || 0, Number(x.peso));
  });
  const prog = Object.values(porEj).map(e => {
    const ult = Object.keys(e.antes).sort().pop();
    return ult && e.sem > e.antes[ult] ? { nombre: e.nombre, de: e.antes[ult], a: e.sem, unidad: e.unidad, pct: (e.sem - e.antes[ult]) / e.antes[ult] } : null;
  }).filter(Boolean).sort((a, b) => b.pct - a.pct).slice(0, 2);

  const rpes = sesSem.map(s => Number(s.rpe)).filter(v => v > 0);
  const rpe = rpes.length ? { prom: rpes.reduce((a, b) => a + b, 0) / rpes.length, n: rpes.length } : null;

  // La semana anterior, para comparar
  const lunesAnt = evtSumarDias(lunes, -7);
  const fechasAnt = Array.from({ length: 7 }, (_, i) => evtSumarDias(lunesAnt, i));
  const prev = {
    plan: fechasAnt.filter(f => rutinaPlan(f)).length,
    hechas: D.sesiones.filter(s => s.estado === 'completada' && fechasAnt.includes(dia10(s.fecha))).length,
  };
  // El último entreno registrado (para «no veo entrenos desde…»)
  const ultimo = D.sesiones.filter(s => s.estado === 'completada').map(s => dia10(s.fecha)).sort().pop() || null;

  return { lunes, fechas, hoy, dias, F, C, M, K, rec, prog, rpe, prev, ultimo, notas: D.notas, cierre: fechas[6] < hoy };
}

// ── Los mensajes ────────────────────────────────────────────────────────
// Escritos con la voz de los Diálogos: «Hola X!», concretos, sin adornos.
// Cada función devuelve el texto o null si con estos datos no aplica.
// La versión se elige con (cliente + situación + semana): cambia cada semana.
const ES_MSJ = {
  // ─ La semana completa ─
  completa: [
    (d) => `Hola ${d.n}! Revisé tu semana: ${d.F.hechas} de ${d.F.plan} entrenos de fuerza${d.cardioOk}. No se te escapó ninguno.\n\n${d.detalle ? d.detalle + '\n\n' : ''}Así se construye. Esta semana mantenemos el ritmo.`,
    (d) => `${d.n}, semana completa: hiciste los ${d.F.plan} entrenos del plan${d.cardioOk}.${d.detalle ? ' ' + d.detalle : ''}\n\nEso es justo lo que hace que el cuerpo cambie. Seguimos igual.`,
    (d) => `Qué tal ${d.n}! Cerraste la semana con ${d.F.hechas} de ${d.F.plan}${d.cardioOk}. Cuando la constancia está así, lo demás se va dando.${d.detalle ? '\n\n' + d.detalle : ''}\n\nVamos por otra igual.`,
    (d) => `Hola ${d.n}! Pasé por tus datos: cumpliste todos los entrenos de la semana (${d.F.hechas} de ${d.F.plan})${d.cardioOk}.${d.detalle ? ' ' + d.detalle : ''}\n\nMe gusta cómo vas. Seguimos.`,
  ],
  // ─ A medias (la mitad o más) ─
  media: [
    (d) => `Hola ${d.n}! Revisé tu semana: ${d.F.hechas} de ${d.F.plan} entrenos de fuerza${d.cardioTxt}.${d.faltoTxt ? ` Se quedó pendiente ${d.faltoTxt}.` : ''}\n\nNo hace falta hacerlo perfecto, hace falta hacerlo seguido. Para esta semana una sola cosa: ${d.foco}.`,
    (d) => `${d.n}, te cuento cómo vi tu semana: ${d.F.hechas} de ${d.F.plan} en fuerza${d.cardioTxt}.${d.prevMejor ? ' Mejor que la anterior, que fueron ' + d.prev.hechas + '.' : ' Buena base.'}\n\nLo que nos falta es ${d.foco}. Si ya sabes qué día se te complica, muévelo desde ya en el calendario de la app.`,
    (d) => `Hola ${d.n}! Semana con ${d.F.hechas} de ${d.F.plan} entrenos.${d.faltoTxt ? ` El que se cayó fue ${d.faltoTxt}.` : ''}\n\nNo pasa nada, pero que no se nos vuelva costumbre. Esta semana ${d.foco}.`,
    (d) => `Qué tal ${d.n}! Tu semana: ${d.F.hechas} de ${d.F.plan} en fuerza${d.cardioTxt}. Vas, pero se puede más.\n\n¿Qué fue lo que se complicó${d.faltoTxt ? ' con ' + d.faltoTxt : ''}? Así lo acomodamos para esta semana.`,
  ],
  // ─ Floja (menos de la mitad, pero algo hizo) ─
  floja: [
    (d) => `Hola ${d.n}! Vi que la semana costó: ${d.F.hechas} de ${d.F.plan} entrenos.\n\nPasa, y es parte del proceso. Lo importante es no soltarlo todo: con ${d.minimo} entrenos esta semana y registrar lo principal ya mantienes el avance.\n\nSi necesitas que ajuste la rutina a menos tiempo, me dices y lo hago.`,
    (d) => `${d.n}, ¿cómo estás? La semana quedó en ${d.F.hechas} de ${d.F.plan} entrenos y antes de ajustar nada quiero entender qué pasó.\n\n¿Fue tiempo, energía, algo del trabajo? Cuéntame y acomodamos el plan para que te calce.`,
    (d) => `Hola ${d.n}! Revisé tu semana: ${d.F.hechas} de ${d.F.plan}. No te escribo para regañarte, te escribo para que no se nos enfríe.\n\nEsta semana pongamos una meta realista: ${d.minimo} entrenos. ¿Qué días te quedan mejor?`,
  ],
  // ─ Ningún entreno registrado ─
  retomar: [
    (d) => `Hola ${d.n}! ${d.Mayus(d.semTxt)} no me aparece ningún entreno registrado en la app, ¿cómo vas?\n\nSi entrenaste y no lo anotaste, cuéntame. Si se complicó, no pasa nada: retomamos sin querer recuperar todo de golpe. ¿Qué día te queda bien empezar?`,
    (d) => `${d.n}, ¿todo bien? No veo entrenos en la app${d.ultimoTxt ? ' desde ' + d.ultimoTxt : ' en toda la semana'}.\n\nNo te escribo para presionarte. Quiero saber cómo estás y si hay que ajustar algo del plan para que te sea más fácil volver.`,
    (d) => `Hola ${d.n}! Te escribo porque ${d.semTxt} no quedó ningún entreno registrado. A veces es la semana, a veces es el plan. Si es el plan, lo ajustamos.\n\n¿Cuántos días reales tienes para entrenar esta semana?`,
  ],
  // ─ La semana en curso ─
  curso: [
    (d) => `Hola ${d.n}! ¿Cómo va la semana? Llevas ${d.F.hechas} de ${d.F.plan} entrenos${d.quedanTxt ? '; te ' + (d.F.quedan.length === 1 ? 'queda' : 'quedan') + ' ' + d.quedanTxt : ''}.${d.faltoTxt ? `\n\n${d.Mayus(d.faltoTxt)} se quedó pendiente. Si puedes, recupéralo en un día libre y lo mueves en el calendario de la app.` : d.F.quedan.length ? '\n\nVas al día. A cerrarla bien.' : ''}`,
    (d) => `${d.n}, pasé por tu semana: ${d.F.hechas} de ${d.F.plan} hasta ahora${d.cardioTxt}.${d.quedanTxt ? ` Lo que falta: ${d.quedanTxt}.` : ''}${d.faltoTxt ? '\n\nTodavía estamos a tiempo de recuperar ' + d.faltoTxt + '.' : '\n\nVas muy bien.'}`,
    (d) => `Qué tal ${d.n}! Vas ${d.F.hechas} de ${d.F.plan} esta semana.${d.quedanTxt ? ` Te espera${d.F.quedan.length === 1 ? '' : 'n'} ${d.quedanTxt}.` : ''}${d.faltoTxt ? `\n\n¿Qué pasó con ${d.faltoTxt}? Si lo mueves a otro día de esta semana, todavía cuenta.` : '\n\nSigue así de ordenado.'}`,
  ],
  // ─ Comida: volver a registrar ─
  registro: [
    (d) => `${d.n}, ${d.semTxt} se te pasaron ${d.K.sinDias.length} días sin registrar la comida${d.K.finde ? ', sobre todo el fin de semana' : ''}.\n\nSé que a veces da pereza, pero sin ese dato te ajusto a ciegas. Anota aunque sea lo principal y aproximado: me sirve mucho más que nada.`,
    (d) => `${d.n}, en comida tengo ${d.K.dias} de ${d.K.base} días registrados. Para ajustarte bien necesito más que eso: aunque sea lo principal en una línea. Con eso trabajo.`,
    (d) => `${d.n}, una cosa de la alimentación: ${d.sinDiasTxt} quedaron sin registro. No busco que sea perfecto, busco tener el dato. Si te sirve, usa el dictado de la app: cuentas todo el día de una vez.`,
  ],
  // ─ Comida: proteína corta ─
  proteina: [
    (d) => `${d.n}, revisando tus registros la proteína se queda corta: en promedio ${d.K.prot.prom} g y tu meta es ${d.K.prot.meta} g.\n\nUna forma fácil de cubrirla es sumar una porción de proteína en el desayuno o la merienda. No es comer más, es repartir mejor.`,
    (d) => `${d.n}, en comida vas registrando bien, pero la proteína anda en ${d.K.prot.prom} g de ${d.K.prot.meta} g. Te faltan unos ${d.K.prot.meta - d.K.prot.prom} g al día. ¿Te animas a sumar una porción más esta semana?`,
    (d) => `${d.n}, algo concreto para esta semana: llegar a ${d.K.prot.meta} g de proteína. Ahora estás en ${d.K.prot.prom} g de promedio. Cuando la proteína está bien se nota en la recuperación y en el hambre.`,
  ],
  // ─ Comida: bien ─
  comidaBien: [
    (d) => `${d.n}, en alimentación ${d.semTxt} tuviste ${d.K.enMeta} días dentro de tu meta de calorías${d.protOk ? ' y la proteína cubierta' : ''}. Eso es lo que más pesa en el resultado. Bien ahí.`,
    (d) => `${d.n}, me gustó tu registro de comida: ${d.K.dias} días anotados y ${d.K.enMeta} dentro de la meta. Así puedo ajustarte con datos reales.`,
    (d) => `${d.n}, en comida ${d.semTxt} estuviste muy cerca de tu meta: ${d.K.enMeta} de ${d.K.conMeta} días.${d.protOk ? ' Y la proteína, bien.' : ''} Seguimos así.`,
  ],
  // ─ Subió de peso o récord ─
  avance: [
    (d) => d.prog ? `${d.n}, vi tu ${d.prog.nombre}: de ${esNum(d.prog.de)} a ${esNum(d.prog.a)} ${d.prog.unidad}. Así se progresa: sin apuro y con técnica.` : null,
    (d) => d.rec ? `${d.n}, ¡récord en ${d.rec.nombre}! ${d.rec.peso ? `${esNum(d.rec.peso)} ${d.rec.unidad || 'kg'} por ${d.rec.reps}` : `${d.rec.reps} repeticiones`}.\n\nEso no es suerte, es lo que vienes haciendo semana a semana.` : null,
    (d) => d.prog ? `${d.n}, una cosa que no quiero dejar pasar: en ${d.prog.nombre} ya vas en ${esNum(d.prog.a)} ${d.prog.unidad}, y la vez anterior estabas en ${esNum(d.prog.de)}. Ese avance es tuyo.` : null,
  ],
  // ─ Intensidad muy alta ─
  fatiga: [
    (d) => `${d.n}, vi que ${d.semTxt} marcaste la intensidad muy alta (promedio ${esNum(d.rpe.prom)} de 10). ¿Cómo estás durmiendo y cómo te sientes de energía?\n\nSi vienes cargado, prefiero que bajemos un poco antes que forzar.`,
    (d) => `${d.n}, tus entrenos salieron con intensidad ${esNum(d.rpe.prom)} de 10 en promedio. Es mucho para sostenerlo semana a semana. Deja una o dos repeticiones en reserva en cada serie: el progreso viene igual y llegas más fresco.`,
    (d) => `${d.n}, una pregunta: marcaste los entrenos casi al máximo (${esNum(d.rpe.prom)}/10). ¿Es que el peso quedó alto o vienes con poco descanso? Me cuentas y lo ajustamos.`,
  ],
  // ─ Cardio pendiente ─
  cardio: [
    (d) => `${d.n}, del cardio tengo ${d.C.hechos} de ${d.C.plan} marcados. ${d.Mayus(d.cardioFaltoTxt)} quedó pendiente. ${d.cierre ? 'Si lo hiciste y no lo marcaste, la próxima vez dale «Ya lo hice» en la app: así me queda el registro.' : 'Cuando lo hagas dale «Ya lo hice» en la app, así me queda el registro.'}`,
    (d) => `${d.n}, el cardio ${d.semTxt} quedó en ${d.C.hechos} de ${d.C.plan}.${d.cardioMin ? ` No tiene que ser largo: con los ${d.cardioMin} minutos que te puse basta, si los haces.` : ' No tiene que ser largo, tiene que hacerse.'}`,
    (d) => `${d.n}, ojo con el cardio: ${d.C.hechos} de ${d.C.plan} ${d.semTxt}. Es la parte que más rápido se suelta y la que más ayuda a la recuperación entre entrenos.`,
  ],
  // ─ Peso, medidas o fotos pendientes ─
  medicion: [
    (d) => `${d.n}, te quedó pendiente ${d.medTxt}. Cuando puedas lo haces y lo marcas en la app: con eso reviso cómo va tu cuerpo y ajusto con datos.`,
    (d) => `${d.n}, ¿me ayudas con ${d.medTxt}? Es un minuto y me sirve mucho para tu seguimiento.`,
  ],
};

const ES_TITULOS = {
  completa: 'Semana completa', media: 'Semana a medias', floja: 'Semana floja', retomar: 'Retomar',
  curso: 'A mitad de semana', registro: 'Volver a registrar', proteina: 'Subir la proteína', comidaBien: 'Comida bien',
  avance: 'Felicitar el avance', fatiga: 'Intensidad muy alta', cardio: 'Cardio pendiente', medicion: 'Registros pendientes',
};

function esMensajes(c, S) {
  const n = typeof dlgTrato === 'function' ? dlgTrato(c) : String(c.nombre || '').split(/\s+/)[0];
  const corto = (r) => String(r || '').trim();
  const faltoTxt = S.F.faltaron.length ? esLista(S.F.faltaron.map(x => `el ${corto(x.rut)} del ${esDia(x.f)}`)) : '';
  const prog = S.prog[0] || null;
  const rec = S.rec[0] || null;
  const protOk = !!(S.K && S.K.prot && S.K.prot.pct >= 0.95);
  const d = {
    n, F: S.F, C: S.C, K: S.K, rpe: S.rpe, prev: S.prev,
    Mayus: (t) => t ? t[0].toUpperCase() + t.slice(1) : t,
    cardioTxt: S.C.plan ? `, y ${S.C.hechos} de ${S.C.plan} de cardio` : '',
    // En la semana completa solo se nombra el cardio si también lo cumplió.
    cardioOk: S.C.plan && S.C.hechos >= S.C.plan ? ', y el cardio completo' : '',
    faltoTxt,
    quedanTxt: esLista(S.F.quedan.map(x => `${corto(x.rut)} ${esCuando(x.f, S.hoy)}`)),
    foco: S.F.faltaron.length === 1 ? `que salga también el ${corto(S.F.faltaron[0].rut)} del ${esDia(S.F.faltaron[0].f)}` : `completar los ${S.F.plan}`,
    minimo: Math.max(2, Math.min(S.F.plan, Math.ceil(S.F.plan / 2))),
    prevMejor: S.prev.plan > 0 && S.prev.hechas > 0 && S.prev.hechas < S.F.hechas,
    ultimoTxt: S.ultimo && S.ultimo < S.lunes ? `el ${esDia(S.ultimo)} ${esFechaCorta(S.ultimo)}` : '',
    sinDiasTxt: S.K ? esLista(S.K.sinDias.map(f => 'el ' + esDia(f))) : '',
    cardioFaltoTxt: S.C.faltaron.length ? `el cardio del ${esLista([...new Set(S.C.faltaron.map(x => esDia(x.f)))].map((x, i) => (i ? 'el ' : '') + x))}` : '',
    cierre: S.cierre,
    semTxt: S.cierre ? 'la semana pasada' : 'esta semana',
    cardioMin: (S.C.faltaron.find(x => x.min) || {}).min || null,
    medTxt: esLista(S.M.filter(m => !m.hecho && m.pasado).map(m => `${ES_TIPOS_MED[m.tipo]} del ${esDia(m.f)}`)),
    prog, rec, protOk,
  };
  const medPend = [...new Set(S.M.filter(m => !m.hecho && m.pasado).map(m => m.tipo))];
  d.medTitulo = medPend.length === 1 ? { peso: 'Peso pendiente', medidas: 'Medidas pendientes', medicion: 'Medición pendiente', fotos: 'Fotos pendientes' }[medPend[0]] : 'Registros pendientes';
  // Un dato concreto para la semana completa (lo que más vale decirle).
  if (prog) d.detalle = `Vi que en ${prog.nombre} pasaste de ${esNum(prog.de)} a ${esNum(prog.a)} ${prog.unidad}.`;
  else if (rec) d.detalle = `Y récord en ${rec.nombre}${rec.peso ? `: ${esNum(rec.peso)} ${rec.unidad || 'kg'} por ${rec.reps}` : ''}.`;
  else if (S.K && S.K.enMeta >= 4) d.detalle = `Y en comida, ${S.K.enMeta} días dentro de tu meta.`;
  else if (d.prevMejor) d.detalle = `Mejor que la semana anterior, que fueron ${S.prev.hechas} de ${S.prev.plan}.`;

  const semana = esSemanaAbs(S.lunes);
  const elegir = (sit) => {
    const vs = ES_MSJ[sit];
    const base = esHash(c.id + ':' + sit) + semana;
    for (let i = 0; i < vs.length; i++) {
      const k = (base + i) % vs.length;
      const t = vs[k](d);
      if (t) return { sit, titulo: sit === 'medicion' ? d.medTitulo : ES_TITULOS[sit], texto: t, version: k + 1, de: vs.length };
    }
    return null;
  };

  const out = [];
  // 1. Cómo le fue en fuerza
  if (S.F.plan > 0 || S.F.hechas > 0) {
    let sit;
    if (!S.cierre) sit = 'curso';
    else if (S.F.hechas >= S.F.plan) sit = 'completa';
    else if (S.F.hechas === 0) sit = 'retomar';
    else sit = S.F.hechas / S.F.plan >= 0.5 ? 'media' : 'floja';
    const m = elegir(sit);
    if (m) out.push(m);
  }
  // El de semana completa ya nombra el avance: no se repite aparte.
  const usoAvance = out[0] && out[0].sit === 'completa' && !!d.detalle && !!(prog || rec);
  // 2. Lo demás, por importancia
  const candidatos = [];
  if ((prog || rec) && !usoAvance) candidatos.push('avance');
  if (S.K) {
    if (S.K.base >= 3 && S.K.dias / S.K.base < 0.6) candidatos.push('registro');
    else if (S.K.prot && S.K.prot.pct < 0.85) candidatos.push('proteina');
    else if (S.K.enMeta >= 4) candidatos.push('comidaBien');
  }
  if (S.rpe && S.rpe.n >= 2 && S.rpe.prom >= 9) candidatos.push('fatiga');
  if (S.M.some(m => !m.hecho && m.pasado)) candidatos.push('medicion');
  if (S.C.faltaron.length) candidatos.push('cardio');
  for (const sit of candidatos) {
    if (out.length >= 3) break;
    const m = elegir(sit);
    if (m) out.push(m);
  }
  return out;
}

// ── En pocas palabras ───────────────────────────────────────────────────
function esResumenHTML(c, S) {
  const nom = escapeHtml(String(c.nombre || '').split(/\s+/)[0] || 'Tu cliente');
  const b = (t) => `<b>${t}</b>`;
  const p = [];
  // Fuerza
  if (S.F.plan || S.F.hechas) {
    let t;
    if (S.cierre) {
      t = `${nom} hizo ${b(`${S.F.hechas} de ${S.F.plan} entrenos de fuerza`)}.`;
      if (S.F.faltaron.length) t += ` Le faltó ${esLista(S.F.faltaron.map(x => `el del ${esDia(x.f)} (${escapeHtml(x.rut)})`))}.`;
    } else {
      t = `${nom} lleva ${b(`${S.F.hechas} de ${S.F.plan} entrenos de fuerza`)}.`;
      if (S.F.faltaron.length) t += ` Se le pasó ${esLista(S.F.faltaron.map(x => `el del ${esDia(x.f)} (${escapeHtml(x.rut)})`))}.`;
      if (S.F.quedan.length) t += ` Le ${S.F.quedan.length === 1 ? 'queda' : 'quedan'} ${esLista(S.F.quedan.map(x => `${escapeHtml(x.rut)} ${esCuando(x.f, S.hoy)}`))}.`;
    }
    if (S.prev.plan) t += ` La semana anterior: ${S.prev.hechas} de ${S.prev.plan}.`;
    p.push(t);
  } else {
    p.push(`${nom} no tiene entrenos de fuerza en el plan esta semana.`);
  }
  // Cardio
  if (S.C.plan || S.C.extras.length) {
    let t = S.C.plan ? `Cardio y actividades: ${b(`${S.C.hechos} de ${S.C.plan}`)}.` : '';
    if (S.C.faltaron.length) t += ` Se le pasó ${esLista(S.C.faltaron.map(x => `${escapeHtml(x.titulo.toLowerCase())} del ${esDia(x.f)}`))}.`;
    if (S.C.extras.length) t += ` ${S.C.plan ? 'Además' : 'Por su cuenta'} registró ${esLista([...new Set(S.C.extras)].map(x => escapeHtml(String(x).toLowerCase())))}.`;
    p.push(t.trim());
  }
  // Comida
  if (!S.K) p.push('Comida: sin datos (no está enlazado con su registro de comidas o no ha registrado en las últimas dos semanas).');
  else if (!S.K.dias) p.push(`${b('No registró comida')} ${S.cierre ? 'esta semana' : 'en lo que va de semana'}.`);
  else {
    let t = `Registró comida ${b(`${S.K.dias} de ${S.K.base} días`)}.`;
    if (S.K.conMeta) t += ` ${S.K.enMeta} dentro de su meta de calorías (±10 %).`;
    if (S.K.prot) t += ` Proteína promedio ${b(`${S.K.prot.prom} g`)} de ${S.K.prot.meta} g.`;
    if (S.K.sinDias.length && S.K.dias) t += ` Sin registro: ${esLista(S.K.sinDias.map(esDia))}.`;
    p.push(t);
  }
  // Fuerza: avances
  const av = [];
  if (S.rec.length) av.push(`batió ${b(S.rec.length === 1 ? '1 récord' : S.rec.length + ' récords')} (${esLista(S.rec.slice(0, 3).map(r => escapeHtml(`${r.nombre || 'Ejercicio'}${r.peso ? ` ${esNum(r.peso)} ${r.unidad || 'kg'} × ${r.reps}` : ` ${r.reps} reps`}`)))})`);
  if (S.prog.length) av.push(`subió en ${esLista(S.prog.map(x => b(`${escapeHtml(x.nombre)} +${esNum(x.a - x.de)} ${x.unidad}`)))} respecto a la vez anterior`);
  let t3 = av.length ? `En fuerza ${esLista(av)}.` : '';
  if (S.rpe) t3 += ` Intensidad promedio ${b(esNum(S.rpe.prom) + '/10')}.`;
  if (t3.trim()) p.push(t3.trim());
  // Peso / fotos
  const med = S.M.filter(m => !m.hecho && m.pasado);
  if (med.length) p.push(`Tenía ${esLista(med.map(m => `${ES_TIPOS_MED[m.tipo]} el ${esDia(m.f)}`))} y no lo registró.`);

  const notas = S.notas || [];
  const ojo = notas.length ? (() => {
    const n0 = notas[0];
    const ej = n0.ejercicios ? entNombres(n0.ejercicios).grande : null;
    const args = JSON.stringify({ cliente_id: n0.cliente_id, ejercicio_id: n0.ejercicio_id || null, rutina_id: n0.rutina_id || null, rutina_ejercicio_id: n0.rutina_ejercicio_id || null }).replace(/"/g, '&quot;');
    return `<div class="es-ojo" data-es-notas="${notas.length}">
      <div>Te dejó ${notas.length === 1 ? '1 nota sin responder' : notas.length + ' notas sin responder'}${ej ? ` en ${escapeHtml(ej)}` : ''}: «${escapeHtml(String(n0.texto || '').slice(0, 140))}»</div>
      ${n0.ejercicio_id && typeof ccAbrirDesdeNota === 'function' ? `<button type="button" class="es-ojo-btn" onclick="ccAbrirDesdeNota(${args})">Responder</button>` : ''}
    </div>`;
  })() : '';
  return p.map(x => `<p>${x}</p>`).join('') + ojo;
}

// ── Pintar ──────────────────────────────────────────────────────────────
function esCumplimientoHTML(S) {
  const celda = (tipo, estado, d, txt) => `<i class="es-d es-${tipo}-${estado}${d.esHoy ? ' es-d-hoy' : ''}" title="${escapeHtml(`${esDia(d.f)} ${esFechaCorta(d.f)} · ${txt}`)}"></i>`;
  const tF = { hecho: 'entrenó', cubierto: 'lo hizo otro día', falto: 'le tocaba y no entrenó', pendiente: 'le toca', nada: 'sin fuerza' };
  const tC = { hecho: 'hizo cardio o actividad', falto: 'le tocaba y no lo marcó', pendiente: 'le toca', nada: 'sin cardio' };
  const tK = { hecho: 'registró comida', sin: 'no registró', nada: '—', nodata: 'sin datos de comida' };
  const fila = (lab, tipo, key, textos) => `<div class="es-fila"><span class="es-lab">${lab}</span>${S.dias.map(d => celda(tipo, d[key], d, textos[d[key]] || '')).join('')}</div>`;
  const kTxt = S.K ? `${S.K.dias}/${S.K.base}` : '—';
  return `
    <div class="es-k">Cumplimiento</div>
    <div class="es-big">
      <div data-es-fuerza><div class="es-n" style="color:#2F63B0">${S.F.hechas}/${S.F.plan}</div><div class="es-t">Fuerza</div></div>
      <div data-es-cardio><div class="es-n" style="color:#2F7A45">${S.C.hechos}/${S.C.plan}</div><div class="es-t">Cardio${S.C.extras.length ? ` +${S.C.extras.length}` : ''}</div></div>
      <div data-es-comida><div class="es-n" style="color:#B5611A">${kTxt}</div><div class="es-t">Comida · días</div></div>
    </div>
    ${fila('Fuerza', 'f', 'fuerza', tF)}
    ${fila('Cardio', 'c', 'cardio', tC)}
    ${fila('Comida', 'k', 'comida', tK)}
    <div class="es-fila es-dias"><span></span>${S.dias.map(d => `<span class="${d.esHoy ? 'es-hoy' : ''}">${d.cod}</span>`).join('')}</div>
    <div class="es-ley">Color = lo hizo · borde rojo = le tocaba y no lo hizo · punteado = le toca · rayas = no registró</div>`;
}

function esMensajesHTML(ms) {
  if (!ms.length) return '<div class="es-vacio">Sin plan ni registros esta semana: no hay mensajes que proponerte con datos reales. Usa los Diálogos.</div>';
  return ms.map((m, i) => `
    <div class="es-msg" data-es-msg="${m.sit}">
      <div class="es-msg-h"><b>${escapeHtml(m.titulo)}</b><button type="button" class="es-cp" data-es-copiar="${i}" onclick="esCopiar(${i})">Copiar</button></div>
      <p>${escapeHtml(m.texto)}</p>
    </div>`).join('') + '<div class="es-varia">Elegidos por cómo le fue, con sus números ya puestos. Cada semana sale otra versión.</div>';
}

window.esCopiar = async (i) => {
  const m = (_es.mensajes || [])[i];
  if (!m) return;
  try { await navigator.clipboard.writeText(m.texto); toast('Copiado. Pégalo en WhatsApp'); }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = m.texto; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Copiado. Pégalo en WhatsApp'); } catch (e2) { toast('No pude copiar'); }
    ta.remove();
  }
  const b = document.querySelector(`[data-es-copiar="${i}"]`);
  if (b) { b.textContent = 'Copiado'; setTimeout(() => { if (b.isConnected) b.textContent = 'Copiar'; }, 1800); }
  if (_es.cliente && await segRegistrar(_es.cliente.id, { origen: 'esta-semana', titulo: m.titulo, texto: m.texto })) segPintarUltimo(_es.cliente);
};

// La semana que abre: el lunes, la que acaba de terminar (es la que se revisa);
// el resto de días, la que va.
function esLunesInicial(hoy) {
  const l = esLunes(hoy);
  return evtCodigoDe(hoy) === 'L' ? evtSumarDias(l, -7) : l;
}

window.esPintar = async (c, lunes = null) => {
  const caja = document.getElementById('ficha-semana');
  if (!caja) return;
  const hoy = fmt.hoy();
  const actual = esLunes(hoy);
  lunes = lunes || esLunesInicial(hoy);
  _es.cliente = c;
  caja.dataset.lunes = lunes;
  const fin = evtSumarDias(lunes, 6);
  const titulo = lunes === actual ? 'Esta semana' : lunes === evtSumarDias(actual, -7) ? 'La semana pasada' : 'Semana';
  caja.querySelector('[data-es-titulo]') && (caja.querySelector('[data-es-titulo]').textContent = `${titulo} · ${esFechaCorta(lunes)} al ${esFechaCorta(fin)}`);
  caja.querySelectorAll('[data-es-sem]').forEach(b => b.classList.toggle('active', b.dataset.esSem === lunes));
  const cuerpo = caja.querySelector('[data-es-cuerpo]');
  if (cuerpo) cuerpo.classList.add('es-cargando');
  if (!caja.dataset.ultimoPintado) { caja.dataset.ultimoPintado = '1'; segPintarUltimo(c); }
  let S;
  try {
    const D = await esLeer(c, lunes);
    if (!document.getElementById('ficha-semana') || document.getElementById('ficha-semana').dataset.lunes !== lunes || _es.cliente !== c) return;
    S = esCalcular(D, lunes, hoy);
  } catch (e) {
    if (cuerpo) { cuerpo.classList.remove('es-cargando'); cuerpo.innerHTML = `<div class="es-vacio">No pude leer su semana (${escapeHtml(e.message || 'error')}).</div>`; }
    return;
  }
  _es.semana = S;
  _es.mensajes = esMensajes(c, S);
  cuerpo.classList.remove('es-cargando');
  cuerpo.innerHTML = `
    <div class="es-card" data-es-cumplimiento>${esCumplimientoHTML(S)}</div>
    <div class="es-card es-txt" data-es-resumen><div class="es-k">En pocas palabras</div>${esResumenHTML(c, S)}</div>
    <div class="es-card" data-es-mensajes><div class="es-k">Mensajes para esta semana</div>${esMensajesHTML(_es.mensajes)}</div>`;
};

window.esVerSemana = (lunes) => { if (_es.cliente) esPintar(_es.cliente, lunes); };

// El armazón que va en la ficha (verCliente lo pone y llama esPintar).
function esArmazonHTML(c) {
  const hoy = fmt.hoy();
  const actual = esLunes(hoy), pasada = evtSumarDias(actual, -7);
  const ini = esLunesInicial(hoy);
  const sk = '<div class="es-card es-sk"></div>';
  return `
    <div class="es-sem" id="ficha-semana" data-ficha-sec="resumen" data-lunes="${ini}">
      <div class="es-semh">
        <b data-es-titulo>${ini === actual ? 'Esta semana' : 'La semana pasada'} · ${esFechaCorta(ini)} al ${esFechaCorta(evtSumarDias(ini, 6))}</b>
        <div class="es-tog">
          <button type="button" class="${ini === pasada ? 'active' : ''}" data-es-sem="${pasada}" onclick="esVerSemana('${pasada}')">Semana pasada</button>
          <button type="button" class="${ini === actual ? 'active' : ''}" data-es-sem="${actual}" onclick="esVerSemana('${actual}')">Esta semana</button>
        </div>
      </div>
      <div class="es-ultimo" data-es-ultimo></div>
      <div class="es-grid" data-es-cuerpo>${sk}${sk}${sk}</div>
    </div>
    <div class="es-mas" data-ficha-sec="resumen">
      <button type="button" onclick="fichaVerPestana('entreno')"><b>Entrenamiento</b>Ciclo, récords e historial</button>
      <button type="button" onclick="fichaVerPestana('comida')"><b>Alimentación</b>Metas, promedios y días</button>
      <button type="button" onclick="fichaVerPestana('cuerpo')"><b>Cuerpo</b>Peso, % grasa y fotos</button>
      <button type="button" onclick="fichaVerPestana('perfil')"><b>Datos</b>Pago, inicio, canal, contraseña</button>
    </div>`;
}

// =====================================================
// LO QUE LE DIJISTE · el registro se hace solo al copiar
// =====================================================
// Cada vez que copias un mensaje para un cliente (aquí, en Diálogos, en el
// seguimiento de la semana o al pedirle videos) se guarda qué le dijiste y
// cuándo (tabla seguimiento_mensajes, migraciones/seguimiento-mensajes.sql).
// Sin esa tabla todo sigue funcionando: solo no se guarda.
// Con eso: la ficha dice «Último seguimiento: hace N días» con lo que le
// dijiste, y el Inicio, a quién hace rato no le escribes.
const SEG_SQL = 'migraciones/seguimiento-mensajes.sql';
const SEG_DIAS_AVISO = 7;
const _seg = { sinTabla: false, avisado: false };

window.segRegistrar = async (clienteId, { origen = null, titulo = null, texto } = {}) => {
  texto = String(texto || '').trim();
  if (!clienteId || !texto || _seg.sinTabla) return false;
  const hoy = fmt.hoy();
  try {
    // El mismo mensaje copiado dos veces el mismo día cuenta una vez.
    const { data: ya, error: e1 } = await sb.from('seguimiento_mensajes').select('id, texto').eq('cliente_id', clienteId).eq('fecha', hoy);
    if (e1) throw e1;
    if ((ya || []).some(x => String(x.texto || '').trim() === texto)) return true;
    const { error } = await sb.from('seguimiento_mensajes').insert({ cliente_id: clienteId, fecha: hoy, origen, titulo, texto });
    if (error) throw error;
    return true;
  } catch (e) {
    if (segFaltaTabla(e)) {
      _seg.sinTabla = true;
      if (!_seg.avisado) { _seg.avisado = true; setTimeout(() => toast(`Copiado. Para guardarlo en su historial falta correr ${SEG_SQL} en Supabase`), 1200); }
    } else setTimeout(() => toast('Copiado, pero no se pudo guardar en su historial (sin conexión)'), 1200);
    return false;
  }
};
function segFaltaTabla(e) { return /seguimiento_mensajes|relation|schema cache|42P01|PGRST20/i.test(String((e && (e.message || e.code)) || '')); }

async function segHistorial(clienteId, limite = 12) {
  try {
    const { data, error } = await sb.from('seguimiento_mensajes').select('id, fecha, origen, titulo, texto, created_at')
      .eq('cliente_id', clienteId).order('created_at', { ascending: false }).limit(limite);
    if (error) { if (segFaltaTabla(error)) _seg.sinTabla = true; return null; }
    return data || [];
  } catch (e) { return null; }
}

function segHace(fecha, hoy = fmt.hoy()) {
  const d = Math.round((evtDia(hoy) - evtDia(String(fecha).slice(0, 10))) / 86400000);
  return { d, txt: d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días` };
}

// La línea de la ficha: «Último seguimiento: hace 6 días · Semana a medias» + historial.
window.segPintarUltimo = async (c) => {
  const caja = document.querySelector('#ficha-semana [data-es-ultimo]');
  if (!caja || !c) return;
  const hist = await segHistorial(c.id);
  if (!caja.isConnected) return;
  if (hist === null) {
    caja.innerHTML = `<span class="es-ult-t">Historial de seguimiento: falta correr <b>${SEG_SQL}</b> en Supabase.</span>`;
    return;
  }
  if (!hist.length) {
    caja.innerHTML = '<span class="es-ult-t" data-es-ult-dias="">Aún no hay seguimientos guardados. Se guardan solos cuando copias un mensaje (aquí o en Diálogos).</span>';
    return;
  }
  const u = hist[0], h = segHace(u.fecha);
  const tono = h.d >= SEG_DIAS_AVISO ? ' es-ult-tarde' : '';
  caja.innerHTML = `
    <div class="es-ult-fila">
      <span class="es-ult-t${tono}" data-es-ult-dias="${h.d}">Último seguimiento: <b>${h.txt}</b> (${esFechaCorta(String(u.fecha).slice(0, 10))})${u.titulo ? ` · ${escapeHtml(u.titulo)}` : ''}</span>
      <button type="button" class="es-ult-btn" data-es-ult-ver onclick="this.closest('[data-es-ultimo]').classList.toggle('abierto')">Lo que le dijiste</button>
    </div>
    <div class="es-ult-lista" data-es-ult-lista>
      ${hist.map(x => `<div class="es-ult-item"><div class="es-ult-meta">${esFechaCorta(String(x.fecha).slice(0, 10))} · ${segHace(x.fecha).txt}${x.titulo ? ` · ${escapeHtml(x.titulo)}` : ''}</div><div class="es-ult-txt">${escapeHtml(x.texto)}</div></div>`).join('')}
    </div>`;
};

// El Inicio: a quién hace rato no le escribes (desde tu último mensaje copiado).
window.segPintarInicio = async (activos) => {
  const caja = document.getElementById('inicio-seg');
  if (!caja) return;
  let filas;
  try {
    const desde = evtSumarDias(fmt.hoy(), -120);
    const { data, error } = await sb.from('seguimiento_mensajes').select('cliente_id, fecha, titulo, created_at').gte('fecha', desde).order('created_at', { ascending: false }).limit(3000);
    if (error) throw error;
    filas = data || [];
  } catch (e) {
    caja.innerHTML = `<div class="text-sm text-slate-500">Para ver a quién le toca seguimiento, corre <b>${SEG_SQL}</b> en Supabase. Desde ahí, cada mensaje que copies queda guardado solo.</div>`;
    return;
  }
  if (!document.getElementById('inicio-seg')) return;
  if (!filas.length) {
    caja.innerHTML = '<div class="text-sm text-slate-500" data-seg-vacio>Aún no hay seguimientos guardados. Cada mensaje que copies desde la ficha del cliente o desde Diálogos queda guardado solo, y aquí verás a quién hace rato no le escribes.</div>';
    return;
  }
  const ultimo = {};
  filas.forEach(f => { if (!ultimo[f.cliente_id]) ultimo[f.cliente_id] = f; });
  const lista = activos.map(c => ({ c, u: ultimo[c.id] || null, d: ultimo[c.id] ? segHace(ultimo[c.id].fecha).d : null }))
    .sort((a, b) => (b.d ?? 9999) - (a.d ?? 9999));
  const tarde = lista.filter(x => x.d === null || x.d >= SEG_DIAS_AVISO);
  const fila = (x) => `
    <div class="flex items-center gap-3" style="border-top:1px solid #F1EFEA;padding:10px 0" data-seg-cliente="${x.c.id}" data-seg-dias="${x.d ?? ''}">
      <div class="flex-1 min-w-0">
        <div class="font-bold text-slate-900 truncate" style="font-size:15px">${escapeHtml(x.c.nombre)}</div>
        <div class="text-[13px] truncate ${x.d === null || x.d >= SEG_DIAS_AVISO ? 'text-[#B5611A]' : 'text-slate-500'}">${x.u ? `${segHace(x.u.fecha).txt}${x.u.titulo ? ` · ${escapeHtml(x.u.titulo)}` : ''}` : 'sin seguimiento guardado'}</div>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="verCliente('${x.c.id}')">Abrir</button>
    </div>`;
  const ver = lista.slice(0, 6);
  caja.innerHTML = `
    <div class="text-sm text-slate-500 mb-1" data-seg-resumen>${tarde.length ? `${tarde.length} ${tarde.length === 1 ? 'cliente lleva' : 'clientes llevan'} ${SEG_DIAS_AVISO} días o más sin seguimiento` : `Todos con seguimiento en los últimos ${SEG_DIAS_AVISO} días`}</div>
    ${ver.map(fila).join('')}
    ${lista.length > ver.length ? `<details class="mt-1"><summary class="text-sm font-semibold text-slate-500" style="cursor:pointer;list-style:none;padding:8px 0">Ver los ${lista.length}</summary>${lista.slice(ver.length).map(fila).join('')}</details>` : ''}`;
};
