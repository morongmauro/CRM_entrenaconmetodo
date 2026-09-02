// =====================================================
// AGENTE DE RUTINAS · dentro de la sección Entrenamiento
// =====================================================
// "Agrégale press inclinado al push de Amali", "ponle el push el miércoles",
// "qué ejercicios de empuje no le he puesto", "qué pesos ha venido moviendo".
//
// LO QUE ESCRIBE NO SE GUARDA SOLO
// --------------------------------
// Las herramientas que MODIFICAN la rutina no tocan la base de datos: dejan
// el cambio PROPUESTO en una tarjeta, y tú lo aplicas o lo descartas. Es a
// propósito. Un modelo que se equivoca leyendo te da un dato malo y lo ves;
// un modelo que se equivoca escribiendo te deja la rutina de un cliente mal
// puesta y te enteras cuando el cliente entrena. El costo de revisar dos
// segundos es mucho menor que el de esa segunda posibilidad.
//
// Reusa el motor de asistente.js (mismo bucle, mismo endpoint, mismo contador
// de gasto) con su propio juego de herramientas y su propio perfil.
// Se carga DESPUÉS de entrenamiento.js y de asistente.js.
// =====================================================

const _rut = {
  chat: null,          // estado de la conversación (asisEstadoNuevo)
  propuestas: [],      // cambios pendientes de que el coach los apruebe
  seq: 0,
  abierto: false,      // el panel está desplegado
  aplicando: false,
};

const RUT_MAX_PROPUESTAS = 25;

const RUT_EJEMPLOS = [
  '¿Qué ejercicios de empuje NO le he puesto?',
  '¿Qué pesos ha venido moviendo en press banca?',
  'Agrégale fondos en paralelas al Push, 3×10',
  'Pon el Lower el miércoles',
  '¿Le falta algún patrón de movimiento en esta fase?',
];

// =====================================================
// UTILIDADES
// =====================================================

// El cliente del panel es el que ya está abierto en la sección; si el coach
// nombra a otro, se busca. Así "agrégale X al push" funciona sin repetir el
// nombre en cada frase.
async function rutCliente(nombre) {
  if (nombre) {
    const c = await asisBuscarCliente(nombre);
    if (c) return c;
    return null;
  }
  if (!_ent.clienteId) return null;
  return (await db.clientes.list()).find(c => c.id === _ent.clienteId)
      || await db.clientes.get(_ent.clienteId);
}

function rutSinCliente(nombre) {
  return nombre
    ? { error: `No encontré a ningún cliente que se llame "${nombre}".` }
    : { error: 'No hay ningún cliente abierto. Pídele al coach que abra uno, o dime el nombre.' };
}

// Fases + rutinas de un cliente, que es lo que casi toda herramienta necesita.
async function rutContexto(cliente, nombreFase) {
  const fases = await entDb.fases(cliente.id);
  if (!fases.length) return { fases: [], fase: null, rutinas: [] };
  let fase = null;
  if (nombreFase) {
    const n = normalizeName(nombreFase);
    fase = fases.find(f => normalizeName(f.nombre).includes(n)) || null;
  }
  // Sin fase nombrada: la que el coach tiene abierta, si es de este cliente;
  // si no, la activa; si no, la última.
  if (!fase) fase = fases.find(f => f.id === _ent.faseId) || null;
  if (!fase) fase = fases.find(f => f.estado === 'activa') || fases[fases.length - 1];
  const rutinas = await entDb.rutinasDeFase(fase.id);
  return { fases, fase, rutinas };
}

// "push", "el push", "Push · Empuje", "día 1" — todas deben encontrar la misma.
function rutBuscarRutina(rutinas, texto) {
  if (!texto) return null;
  const n = normalizeName(texto);
  return rutinas.find(r => normalizeName(r.nombre) === n)
      || rutinas.find(r => normalizeName(r.nombre).includes(n))
      || rutinas.find(r => n.includes(normalizeName(r.nombre)))
      || rutinas.find(r => String(r.dia_orden) === texto.replace(/\D/g, ''))
      || null;
}

async function rutBuscarEjercicio(texto) {
  if (!texto) return null;
  const todos = await entDb.ejercicios();
  const n = normalizeName(texto);
  return todos.find(e => normalizeName(e.nombre) === n)
      || todos.find(e => e.alias && normalizeName(e.alias) === n)
      || todos.find(e => normalizeName(e.nombre).includes(n))
      || todos.map(e => ({ e, s: similitudNombre(e.nombre, texto) }))
          .filter(x => x.s >= 75).sort((a, b) => b.s - a.s)[0]?.e
      || null;
}

const RUT_DIAS_ALIAS = {
  lunes: 'L', lun: 'L', l: 'L',
  martes: 'M', mar: 'M', m: 'M',
  miercoles: 'X', mie: 'X', x: 'X',
  jueves: 'J', jue: 'J', j: 'J',
  viernes: 'V', vie: 'V', v: 'V',
  sabado: 'S', sab: 'S', s: 'S',
  domingo: 'D', dom: 'D', d: 'D',
};
// El modelo puede mandar 'X', 'miércoles' o 'Mie'. Todas valen.
function rutDia(txt) {
  if (!txt) return null;
  const k = normalizeName(String(txt));
  if (RUT_DIAS_ALIAS[k]) return RUT_DIAS_ALIAS[k];
  const may = String(txt).trim().toUpperCase();
  return ENT_DIAS.some(([d]) => d === may) ? may : null;
}

// =====================================================
// PROPUESTAS · lo que el agente quiere cambiar, sin cambiarlo
// =====================================================
function rutProponer(descripcion, detalle, aplicar) {
  if (_rut.propuestas.length >= RUT_MAX_PROPUESTAS) {
    return { error: 'Ya hay demasiados cambios sin aplicar. Aplícalos o descártalos antes de proponer más.' };
  }
  const id = ++_rut.seq;
  _rut.propuestas.push({ id, descripcion, detalle, aplicar });
  rutPintar();
  return {
    estado: 'PROPUESTO — todavía NO está guardado',
    id,
    descripcion,
    nota: 'El coach tiene que pulsar "Aplicar" en la pantalla. No le digas que ya quedó hecho.',
  };
}

window.rutAplicar = async () => {
  if (!_rut.propuestas.length || _rut.aplicando) return;
  _rut.aplicando = true;
  rutPintar();
  let hechos = 0;
  const fallos = [];
  // En orden: un "agrega el ejercicio" y un "ahora súbele las series" tienen
  // que pasar en ese orden o el segundo no encuentra qué editar.
  for (const p of _rut.propuestas) {
    try { await p.aplicar(); hechos++; }
    catch (e) { fallos.push(`${p.descripcion}: ${e?.message || e}`); }
  }
  _rut.propuestas = [];
  _rut.aplicando = false;
  _ent.ejercicios = null;                 // la galería puede haber cambiado
  toast(fallos.length
    ? `✓ ${hechos} aplicado(s) · ${fallos.length} con error`
    : `✓ ${hechos} cambio(s) aplicado(s)`);
  if (fallos.length) console.warn('Cambios que fallaron:', fallos);
  await entVistaClientes();               // repinta la sección con lo nuevo
  rutPintar();
};

window.rutDescartar = () => {
  _rut.propuestas = [];
  rutPintar();
  toast('Cambios descartados');
};

window.rutQuitarPropuesta = (id) => {
  _rut.propuestas = _rut.propuestas.filter(p => p.id !== id);
  rutPintar();
};

// =====================================================
// HERRAMIENTAS · lectura
// =====================================================
const RUT_HERRAMIENTAS = {

  async plan_del_cliente({ nombre } = {}) {
    const c = await rutCliente(nombre);
    if (!c) return rutSinCliente(nombre);
    const fases = await entDb.fases(c.id);
    if (!fases.length) return { cliente: c.nombre, fases: [], nota: 'Este cliente no tiene ninguna fase creada.' };

    const salida = [];
    for (const f of fases) {
      const rutinas = await entDb.rutinasDeFase(f.id);
      const ejs = await entDb.ejerciciosDeRutinas(rutinas.map(r => r.id));
      const { porDia, sinDia } = entRepartirRutinas(f, rutinas);
      salida.push({
        fase: f.nombre,
        estado: f.estado,
        semanas: f.semanas,
        desde: f.fecha_inicio,
        hasta: entFechaFin(f),
        semana_en_curso: entSemanaActual(f),
        dias_declarados: f.dias_semana || [],
        objetivo: f.objetivo || null,
        calendario: ENT_DIAS.map(([d, lab]) => ({
          dia: lab,
          codigo: d,
          rutina: porDia[d] ? porDia[d].r.nombre : null,
          dia_fijado_en_la_rutina: porDia[d] ? porDia[d].fijada : null,
        })),
        rutinas: rutinas.map(r => ({
          nombre: r.nombre,
          dia_orden: r.dia_orden,
          dia_semana: r.dia_semana || null,
          ejercicios: (ejs[r.id] || []).length,
          duracion_min: r.duracion_estimada_min || null,
        })),
        rutinas_sin_dia: sinDia.map(r => r.nombre),
      });
    }
    return {
      cliente: c.nombre,
      dias_de_entreno_en_su_ficha: (c.dias_entreno || []).join(', ') || null,
      lugar_de_entreno: c.lugar_entreno || null,
      lesion_actual: c.lesion_actual || null,
      restricciones: c.restricciones_lesiones || null,
      fase_abierta_en_pantalla: fases.find(f => f.id === _ent.faseId)?.nombre || null,
      fases: salida,
    };
  },

  async ver_rutina({ nombre, rutina, fase } = {}) {
    const c = await rutCliente(nombre);
    if (!c) return rutSinCliente(nombre);
    const { fase: f, rutinas } = await rutContexto(c, fase);
    if (!f) return { error: `${c.nombre} no tiene fases.` };
    const r = rutBuscarRutina(rutinas, rutina);
    if (!r) return { error: `No encontré la rutina "${rutina}" en la fase "${f.nombre}".`, rutinas_de_esta_fase: rutinas.map(x => x.nombre) };
    const ejs = (await entDb.ejerciciosDeRutinas([r.id]))[r.id] || [];
    return {
      cliente: c.nombre,
      fase: f.nombre,
      rutina: r.nombre,
      dia_semana: r.dia_semana || null,
      dia_orden: r.dia_orden,
      duracion_min: r.duracion_estimada_min || null,
      ejercicios: ejs.map((re, i) => {
        const e = re.ejercicios || {};
        return {
          posicion: i + 1,
          ejercicio: e.nombre,
          patron: entLabel(ENT_PATRONES, e.patron),
          musculos: (e.musculos_primarios || []).join(', ') || null,
          equipo: (e.equipo || []).join(', ') || null,
          series: re.series,
          reps: re.reps,
          peso_objetivo: re.peso_objetivo || null,
          descanso_seg: re.descanso_seg,
          rir: re.rir,
          notas: re.notas || null,
        };
      }),
    };
  },

  async buscar_ejercicios({ q, patron, segmento, musculo, equipo, lugar, nivel, limite = 25 } = {}) {
    let lista = await entDb.ejercicios();
    const n = (v) => normalizeName(String(v || ''));
    if (q) lista = lista.filter(e => n(e.nombre).includes(n(q)) || n(e.alias).includes(n(q)));
    if (patron) lista = lista.filter(e => e.patron === patron);
    if (segmento) lista = lista.filter(e => e.segmento === segmento);
    if (nivel) lista = lista.filter(e => e.nivel === nivel);
    if (musculo) lista = lista.filter(e =>
      [...(e.musculos_primarios || []), ...(e.musculos_secundarios || [])].some(m => n(m).includes(n(musculo))));
    if (equipo) lista = lista.filter(e => (e.equipo || []).some(x => n(x).includes(n(equipo))));
    if (lugar) lista = lista.filter(e => (e.lugar || []).includes(lugar));
    return {
      total_encontrados: lista.length,
      mostrando: Math.min(lista.length, limite),
      ejercicios: lista.slice(0, limite).map(e => ({
        nombre: e.nombre,
        patron: entLabel(ENT_PATRONES, e.patron),
        segmento: entLabel(ENT_SEGMENTOS, e.segmento),
        musculos_primarios: (e.musculos_primarios || []).join(', ') || null,
        equipo: (e.equipo || []).join(', ') || null,
        nivel: e.nivel,
        unilateral: e.unilateral || false,
        notas_del_coach: e.notas_coach || null,
      })),
    };
  },

  // "Sugiéreme qué ejercicios NO le he puesto en empuje" — esta es la
  // herramienta que responde eso. Cruza lo que hay en el plan contra la
  // galería completa y devuelve la diferencia, que es lo que el coach quiere
  // ver. Hacerlo aquí y no en el modelo evita que se invente un ejercicio que
  // no está en la galería.
  async cobertura_del_plan({ nombre, fase, patron } = {}) {
    const c = await rutCliente(nombre);
    if (!c) return rutSinCliente(nombre);
    const { fase: f, rutinas } = await rutContexto(c, fase);
    if (!f) return { error: `${c.nombre} no tiene fases.` };
    const ejsPorRutina = await entDb.ejerciciosDeRutinas(rutinas.map(r => r.id));

    const enPlan = [];
    rutinas.forEach(r => (ejsPorRutina[r.id] || []).forEach(re => {
      if (re.ejercicios) enPlan.push({ ...re.ejercicios, _rutina: r.nombre, _series: re.series });
    }));
    const idsEnPlan = new Set(enPlan.map(e => e.id));
    const galeria = await entDb.ejercicios();
    const musculos = await entDb.musculos();
    const nombreMusculo = (slug) => (musculos.find(m => m.slug === slug) || {}).nombre || slug;

    const patrones = patron ? [patron] : ENT_PATRONES.map(([p]) => p);
    const porPatron = patrones.map(p => {
      const dentro = enPlan.filter(e => e.patron === p);
      const fuera = galeria.filter(e => e.patron === p && !idsEnPlan.has(e.id));
      return {
        patron: entLabel(ENT_PATRONES, p),
        codigo: p,
        series_semanales: dentro.reduce((a, e) => a + (e._series || 0), 0),
        en_el_plan: dentro.map(e => `${e.nombre} (${e._rutina}, ${e._series} series)`),
        en_la_galeria_sin_usar: fuera.map(e => ({
          nombre: e.nombre,
          musculos: (e.musculos_primarios || []).map(nombreMusculo).join(', ') || null,
          equipo: (e.equipo || []).join(', ') || null,
          nivel: e.nivel,
        })),
      };
    });

    // Músculos: cuántas series semanales recibe cada uno como primario.
    const seriesPorMusculo = {};
    enPlan.forEach(e => (e.musculos_primarios || []).forEach(m => {
      seriesPorMusculo[m] = (seriesPorMusculo[m] || 0) + (e._series || 0);
    }));
    const cobertura = musculos.map(m => ({
      musculo: m.nombre,
      series_semanales: seriesPorMusculo[m.slug] || 0,
    })).sort((a, b) => a.series_semanales - b.series_semanales);

    return {
      cliente: c.nombre,
      fase: f.nombre,
      lugar_de_entreno: c.lugar_entreno || null,
      restricciones: c.restricciones_lesiones || null,
      lesion_actual: c.lesion_actual || null,
      total_ejercicios_en_el_plan: enPlan.length,
      por_patron: porPatron,
      series_por_musculo: cobertura,
      nota: 'en_la_galeria_sin_usar son ejercicios que YA existen en la galería del coach. No propongas ejercicios que no estén en esta lista: no los podría añadir.',
    };
  },

  // "Dime qué pesos ha venido registrando" — sale de lo que el cliente marcó
  // en su app (sesiones + series_log), no de lo que el coach prescribió.
  async pesos_registrados({ nombre, ejercicio, semanas = 8 } = {}) {
    const c = await rutCliente(nombre);
    if (!c) return rutSinCliente(nombre);
    const dias = Math.min(Math.max(Number(semanas) || 8, 1), 52) * 7;
    const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);

    const sesiones = await entDb.sesiones(c.id, { desde });
    if (sesiones === null) {
      return { error: 'No pude leer el historial de entreno. Puede que falte correr el schema del módulo de entrenamiento en Supabase.' };
    }
    if (!sesiones.length) {
      return { cliente: c.nombre, sesiones: 0, nota: `No hay sesiones registradas en las últimas ${semanas} semanas. Ojo: eso significa que no hay REGISTRO, no que no haya entrenado.` };
    }

    const series = await entDb.seriesDeSesiones(sesiones.map(s => s.id));
    const porFecha = Object.fromEntries(sesiones.map(s => [s.id, s]));

    // Un ejercicio concreto: la progresión sesión por sesión, que es como se
    // lee de verdad. Sin promediar: "60×8, 60×8, 60×7, 57.5×6" es el dato.
    if (ejercicio) {
      const e = await rutBuscarEjercicio(ejercicio);
      if (!e) return { error: `No encontré el ejercicio "${ejercicio}" en la galería.` };
      const suyas = series.filter(s => s.ejercicio_id === e.id);
      if (!suyas.length) {
        return { cliente: c.nombre, ejercicio: e.nombre, sesiones: 0, nota: `Nunca ha registrado ${e.nombre} en ese periodo.` };
      }
      const porSesion = {};
      suyas.forEach(s => { (porSesion[s.sesion_id] ||= []).push(s); });
      const record = await entDb.recordEjercicio(c.id, e.id);
      return {
        cliente: c.nombre,
        ejercicio: e.nombre,
        record: record ? `${record.peso} ${record.unidad || 'kg'} × ${record.reps} el ${record.fecha}` : null,
        sesiones: Object.keys(porSesion).length,
        historial: Object.entries(porSesion)
          .map(([sid, filas]) => ({
            fecha: porFecha[sid]?.fecha,
            rpe_de_la_sesion: porFecha[sid]?.rpe ?? null,
            notas_del_cliente: porFecha[sid]?.notas_cliente || null,
            series: filas.sort((a, b) => a.serie_num - b.serie_num)
              .map(f => `${f.peso ?? '—'} ${f.unidad || 'kg'} × ${f.reps ?? '—'}${f.rir != null ? ` (RIR ${f.rir})` : ''}`),
          }))
          .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))),
      };
    }

    // Sin ejercicio: el panorama — qué movió y cómo va cada cosa.
    const porEjercicio = {};
    series.forEach(s => {
      const nom = s.ejercicios?.nombre || s.ejercicio_id;
      const f = porFecha[s.sesion_id]?.fecha;
      const reg = (porEjercicio[nom] ||= { veces: new Set(), maximo: null, ultimo: null, ultimaFecha: null });
      reg.veces.add(s.sesion_id);
      if (s.peso != null && (reg.maximo === null || s.peso > reg.maximo)) reg.maximo = s.peso;
      if (f && (!reg.ultimaFecha || f > reg.ultimaFecha)) { reg.ultimaFecha = f; reg.ultimo = s.peso; }
    });
    return {
      cliente: c.nombre,
      periodo: `últimas ${semanas} semanas`,
      sesiones_registradas: sesiones.length,
      sesiones: sesiones.slice(0, 12).map(s => ({
        fecha: s.fecha,
        rutina: s.rutinas?.nombre || null,
        estado: s.estado,
        rpe: s.rpe ?? null,
        notas_del_cliente: s.notas_cliente || null,
      })),
      ejercicios: Object.entries(porEjercicio).map(([nom, r]) => ({
        ejercicio: nom,
        sesiones: r.veces.size,
        peso_maximo: r.maximo,
        ultimo_peso: r.ultimo,
        ultima_vez: r.ultimaFecha,
      })).sort((a, b) => b.sesiones - a.sesiones),
    };
  },

  // =====================================================
  // HERRAMIENTAS · escritura (dejan el cambio PROPUESTO)
  // =====================================================

  async agregar_ejercicio_a_rutina({ nombre, rutina, ejercicio, series = 3, reps = '10', peso_objetivo, descanso_seg = 90, notas, fase } = {}) {
    const c = await rutCliente(nombre);
    if (!c) return rutSinCliente(nombre);
    const { fase: f, rutinas } = await rutContexto(c, fase);
    if (!f) return { error: `${c.nombre} no tiene fases.` };
    const r = rutBuscarRutina(rutinas, rutina);
    if (!r) return { error: `No encontré la rutina "${rutina}".`, rutinas_de_esta_fase: rutinas.map(x => x.nombre) };
    const e = await rutBuscarEjercicio(ejercicio);
    if (!e) return { error: `"${ejercicio}" no está en la galería. Solo puedo añadir ejercicios que ya existan; búscalos con buscar_ejercicios.` };

    const ejs = (await entDb.ejerciciosDeRutinas([r.id]))[r.id] || [];
    if (ejs.some(x => x.ejercicio_id === e.id)) {
      return { error: `${e.nombre} ya está en "${r.nombre}". Si quieres cambiarle series o reps, usa editar_ejercicio_de_rutina.` };
    }
    const orden = ejs.length + 1;
    const detalle = `${series}×${reps}${peso_objetivo ? ` · ${peso_objetivo}` : ''} · ${descanso_seg}s de descanso`;
    return rutProponer(
      `Añadir ${e.nombre} a "${r.nombre}" de ${c.nombre}`,
      detalle,
      () => entDb.agregarEjercicio({
        rutina_id: r.id, ejercicio_id: e.id, orden,
        series: Number(series) || 3,
        reps: String(reps || '10'),
        peso_objetivo: peso_objetivo || null,
        descanso_seg: Number(descanso_seg) || 90,
        notas: notas || null,
      }),
    );
  },

  async editar_ejercicio_de_rutina({ nombre, rutina, ejercicio, series, reps, peso_objetivo, descanso_seg, rir, notas, fase } = {}) {
    const c = await rutCliente(nombre);
    if (!c) return rutSinCliente(nombre);
    const { fase: f, rutinas } = await rutContexto(c, fase);
    if (!f) return { error: `${c.nombre} no tiene fases.` };
    const r = rutBuscarRutina(rutinas, rutina);
    if (!r) return { error: `No encontré la rutina "${rutina}".`, rutinas_de_esta_fase: rutinas.map(x => x.nombre) };
    const ejs = (await entDb.ejerciciosDeRutinas([r.id]))[r.id] || [];
    const e = await rutBuscarEjercicio(ejercicio);
    const re = e ? ejs.find(x => x.ejercicio_id === e.id) : null;
    if (!re) return { error: `"${ejercicio}" no está en "${r.nombre}".`, ejercicios_de_la_rutina: ejs.map(x => x.ejercicios?.nombre).filter(Boolean) };

    const row = {};
    const cambios = [];
    if (series != null)        { row.series = Number(series); cambios.push(`series ${re.series} → ${row.series}`); }
    if (reps != null)          { row.reps = String(reps); cambios.push(`reps ${re.reps} → ${row.reps}`); }
    if (peso_objetivo != null) { row.peso_objetivo = String(peso_objetivo); cambios.push(`peso ${re.peso_objetivo || '—'} → ${row.peso_objetivo}`); }
    if (descanso_seg != null)  { row.descanso_seg = Number(descanso_seg); cambios.push(`descanso ${re.descanso_seg}s → ${row.descanso_seg}s`); }
    if (rir != null)           { row.rir = Number(rir); cambios.push(`RIR ${re.rir ?? '—'} → ${row.rir}`); }
    if (notas != null)         { row.notas = String(notas); cambios.push('nota nueva'); }
    if (!cambios.length) return { error: 'No me dijiste qué cambiar.' };

    return rutProponer(
      `Cambiar ${e.nombre} en "${r.nombre}" de ${c.nombre}`,
      cambios.join(' · '),
      () => entDb.actualizarRE(re.id, row),
    );
  },

  async quitar_ejercicio_de_rutina({ nombre, rutina, ejercicio, fase } = {}) {
    const c = await rutCliente(nombre);
    if (!c) return rutSinCliente(nombre);
    const { fase: f, rutinas } = await rutContexto(c, fase);
    if (!f) return { error: `${c.nombre} no tiene fases.` };
    const r = rutBuscarRutina(rutinas, rutina);
    if (!r) return { error: `No encontré la rutina "${rutina}".` };
    const ejs = (await entDb.ejerciciosDeRutinas([r.id]))[r.id] || [];
    const e = await rutBuscarEjercicio(ejercicio);
    const re = e ? ejs.find(x => x.ejercicio_id === e.id) : null;
    if (!re) return { error: `"${ejercicio}" no está en "${r.nombre}".`, ejercicios_de_la_rutina: ejs.map(x => x.ejercicios?.nombre).filter(Boolean) };
    return rutProponer(
      `Quitar ${e.nombre} de "${r.nombre}" de ${c.nombre}`,
      `Estaba en ${re.series}×${re.reps}`,
      () => entDb.quitarRE(re.id),
    );
  },

  async editar_rutina({ nombre, rutina, nuevo_nombre, dia_semana, duracion_min, fase } = {}) {
    const c = await rutCliente(nombre);
    if (!c) return rutSinCliente(nombre);
    const { fase: f, rutinas } = await rutContexto(c, fase);
    if (!f) return { error: `${c.nombre} no tiene fases.` };
    const r = rutBuscarRutina(rutinas, rutina);
    if (!r) return { error: `No encontré la rutina "${rutina}".`, rutinas_de_esta_fase: rutinas.map(x => x.nombre) };

    const row = {};
    const cambios = [];
    if (nuevo_nombre) { row.nombre = String(nuevo_nombre); cambios.push(`nombre "${r.nombre}" → "${row.nombre}"`); }
    if (dia_semana !== undefined) {
      if (dia_semana === null || dia_semana === '') { row.dia_semana = null; cambios.push('deja de tener día fijo'); }
      else {
        const d = rutDia(dia_semana);
        if (!d) return { error: `No entendí el día "${dia_semana}". Usa lunes…domingo o L M X J V S D.` };
        const ocupa = rutinas.find(x => x.dia_semana === d && x.id !== r.id);
        if (ocupa) return { error: `El ${entLabel(ENT_DIAS, d)} ya lo ocupa "${ocupa.nombre}". Cámbiale el día a esa primero, o elige otro.` };
        row.dia_semana = d;
        cambios.push(`día ${r.dia_semana ? entLabel(ENT_DIAS, r.dia_semana) : 'libre'} → ${entLabel(ENT_DIAS, d)}`);
      }
    }
    if (duracion_min != null) { row.duracion_estimada_min = Number(duracion_min); cambios.push(`duración → ${row.duracion_estimada_min} min`); }
    if (!cambios.length) return { error: 'No me dijiste qué cambiar de la rutina.' };

    // Si el día nuevo no está entre los días de la fase, el calendario lo
    // mostraría sin que la fase lo declare. Se avisa, no se bloquea.
    const aviso = row.dia_semana && !(f.dias_semana || []).includes(row.dia_semana)
      ? `Ojo: la fase "${f.nombre}" no tiene el ${entLabel(ENT_DIAS, row.dia_semana)} entre sus días. Quizá también quieras cambiar los días de la fase.`
      : null;

    const res = rutProponer(`Cambiar la rutina "${r.nombre}" de ${c.nombre}`, cambios.join(' · '),
      () => entDb.actualizarRutina(r.id, { ...row, updated_at: new Date().toISOString() }));
    return aviso ? { ...res, aviso } : res;
  },

  async editar_dias_de_fase({ nombre, dias, fase } = {}) {
    const c = await rutCliente(nombre);
    if (!c) return rutSinCliente(nombre);
    const { fase: f } = await rutContexto(c, fase);
    if (!f) return { error: `${c.nombre} no tiene fases.` };
    const lista = Array.isArray(dias) ? dias : String(dias || '').split(/[,\s]+/);
    const codigos = lista.map(rutDia).filter(Boolean);
    if (!codigos.length) return { error: 'No entendí los días. Dímelos como lunes, miércoles, viernes.' };
    const unicos = [...new Set(codigos)];
    const antes = (f.dias_semana || []).map(d => entLabel(ENT_DIAS, d)).join(', ') || 'ninguno';
    return rutProponer(
      `Cambiar los días de la fase "${f.nombre}" de ${c.nombre}`,
      `${antes} → ${unicos.map(d => entLabel(ENT_DIAS, d)).join(', ')}`,
      () => entDb.actualizarFase(f.id, { dias_semana: unicos, updated_at: new Date().toISOString() }),
    );
  },

  async duplicar_rutina({ nombre, rutina, nuevo_nombre, dia_semana, fase } = {}) {
    const c = await rutCliente(nombre);
    if (!c) return rutSinCliente(nombre);
    const { fase: f, rutinas } = await rutContexto(c, fase);
    if (!f) return { error: `${c.nombre} no tiene fases.` };
    const r = rutBuscarRutina(rutinas, rutina);
    if (!r) return { error: `No encontré la rutina "${rutina}".` };
    const d = dia_semana ? rutDia(dia_semana) : null;
    if (dia_semana && !d) return { error: `No entendí el día "${dia_semana}".` };
    return rutProponer(
      `Duplicar "${r.nombre}" de ${c.nombre}`,
      `${nuevo_nombre ? `se llamará "${nuevo_nombre}"` : 'copia con los mismos ejercicios'}${d ? ` · el ${entLabel(ENT_DIAS, d)}` : ''}`,
      async () => {
        const nueva = await entDb.duplicarRutina(r.id);
        if (!nueva) throw new Error('La copia no se creó');
        const row = {};
        if (nuevo_nombre) row.nombre = String(nuevo_nombre);
        if (d) row.dia_semana = d;
        if (Object.keys(row).length) await entDb.actualizarRutina(nueva, row);
      },
    );
  },
};

const RUT_ETIQUETAS = {
  plan_del_cliente: 'Mirando su plan',
  ver_rutina: 'Abriendo la rutina',
  buscar_ejercicios: 'Buscando en la galería',
  cobertura_del_plan: 'Cruzando el plan con la galería',
  pesos_registrados: 'Leyendo lo que ha levantado',
  agregar_ejercicio_a_rutina: 'Preparando un ejercicio nuevo',
  editar_ejercicio_de_rutina: 'Preparando un cambio',
  quitar_ejercicio_de_rutina: 'Preparando una eliminación',
  editar_rutina: 'Preparando un cambio de rutina',
  editar_dias_de_fase: 'Preparando los días de la fase',
  duplicar_rutina: 'Preparando una copia',
};

// =====================================================
// EL PANEL
// =====================================================
window.rutPreguntar = async (textoDirecto) => {
  const input = $('#rut-input');
  const pregunta = (textoDirecto ?? input?.value ?? '').trim();
  if (!_rut.chat) _rut.chat = asisEstadoNuevo();
  if (!pregunta || _rut.chat.trabajando) return;
  if (input) input.value = '';

  const ch = _rut.chat;
  ch.error = null;
  ch.trabajando = true;
  ch.paso = 'Pensando';
  ch.mensajes.push({ role: 'user', content: pregunta });
  ch.visible.push({ rol: 'coach', texto: pregunta });
  ch.visible.push({ rol: 'asistente', texto: '', herramientas: [] });
  rutPintar();

  const turno = ch.visible[ch.visible.length - 1];
  try {
    await asisMotor(ch, {
      perfil: 'rutinas',
      herramientas: RUT_HERRAMIENTAS,
      etiquetas: RUT_ETIQUETAS,
      alRepintar: rutPintar,
    });
  } catch (e) {
    ch.error = e?.message || String(e);
    turno.texto = turno.texto || '';
  }
  ch.trabajando = false;
  ch.paso = '';
  rutPintar();
};

window.rutLimpiar = () => {
  _rut.chat = asisEstadoNuevo();
  _rut.propuestas = [];
  rutPintar();
};

window.rutModo = (aFondo) => {
  if (!_rut.chat) _rut.chat = asisEstadoNuevo();
  _rut.chat.aFondo = !!aFondo;
  rutPintar();
};

window.rutToggle = () => {
  _rut.abierto = !_rut.abierto;
  if (!_rut.chat) _rut.chat = asisEstadoNuevo();
  rutPintar();
  if (_rut.abierto) setTimeout(() => $('#rut-input')?.focus(), 80);
};

window.rutTeclado = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); rutPreguntar(); }
};

function rutPropuestasHTML() {
  if (!_rut.propuestas.length) return '';
  return `
    <div class="rut-propuestas">
      <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
        <div class="font-bold text-sm text-slate-900">
          ✋ ${_rut.propuestas.length} cambio${_rut.propuestas.length === 1 ? '' : 's'} sin aplicar
        </div>
        <div class="flex gap-1">
          <button class="btn btn-secondary btn-sm" onclick="rutDescartar()" ${_rut.aplicando ? 'disabled' : ''}>Descartar</button>
          <button class="btn btn-primary btn-sm" onclick="rutAplicar()" ${_rut.aplicando ? 'disabled' : ''}>
            ${_rut.aplicando ? 'Aplicando…' : 'Aplicar todo'}
          </button>
        </div>
      </div>
      <div class="flex flex-col gap-1">
        ${_rut.propuestas.map(p => `
          <div class="rut-propuesta">
            <div class="min-w-0">
              <div class="text-sm font-medium text-slate-800">${escapeHtml(p.descripcion)}</div>
              ${p.detalle ? `<div class="text-xs text-slate-500">${escapeHtml(p.detalle)}</div>` : ''}
            </div>
            <button class="btn btn-ghost btn-sm flex-shrink-0" onclick="rutQuitarPropuesta(${p.id})" title="Quitar de la lista">✕</button>
          </div>`).join('')}
      </div>
      <div class="text-[11px] text-slate-500 mt-2">
        Nada de esto está guardado todavía. Revísalo y pulsa <strong>Aplicar todo</strong>.
      </div>
    </div>`;
}

function rutHiloHTML() {
  const ch = _rut.chat;
  if (!ch || !ch.visible.length) {
    return `
      <div class="py-4">
        <div class="text-xs text-slate-500 mb-2">
          Pregúntale sobre el plan de este cliente, o pídele cambios. Los cambios te los deja
          <strong>propuestos</strong>: nada se guarda sin que tú lo apruebes.
        </div>
        <div class="flex flex-col gap-1.5">
          ${RUT_EJEMPLOS.map(e => `
            <button class="asis-ejemplo" onclick="rutPreguntar(${JSON.stringify(e).replace(/"/g, '&quot;')})">${escapeHtml(e)}</button>
          `).join('')}
        </div>
      </div>`;
  }
  return ch.visible.map(m => m.rol === 'coach' ? `
    <div class="flex justify-end mb-3">
      <div class="asis-burbuja asis-coach">${asisFormato(m.texto)}</div>
    </div>` : `
    <div class="flex justify-start mb-3">
      <div class="asis-burbuja asis-ia">
        ${(m.herramientas || []).length ? `
          <div class="flex flex-wrap gap-1 mb-2">
            ${[...new Set(m.herramientas)].map(h => `<span class="asis-paso">${escapeHtml(h)}</span>`).join('')}
          </div>` : ''}
        ${m.texto ? asisFormato(m.texto) : '<span class="text-slate-400 text-xs">…</span>'}
      </div>
    </div>`).join('') + (ch.trabajando ? `
    <div class="flex justify-start mb-3">
      <div class="asis-burbuja asis-ia text-slate-500 text-xs">
        <span class="asis-latido"></span> ${escapeHtml(ch.paso || 'Pensando')}…
      </div>
    </div>` : '') + (ch.error ? `
    <div class="card border-l-4 border-red-400 mt-2">
      <div class="font-bold text-slate-800 text-sm mb-1">No pude responder</div>
      <p class="text-xs text-slate-600">${escapeHtml(ch.error)}</p>
    </div>` : '');
}

function rutPintar() {
  const caja = $('#rut-panel');
  if (!caja) return;
  caja.innerHTML = rutPanelHTML();
  const hilo = $('#rut-hilo');
  if (hilo) hilo.scrollTop = hilo.scrollHeight;
}

function rutPanelHTML() {
  const ch = _rut.chat;
  const pendientes = _rut.propuestas.length;
  if (!_rut.abierto) {
    return `
      <button class="rut-abrir" onclick="rutToggle()">
        💬 Preguntarle al agente sobre este plan
        ${pendientes ? `<span class="tag tag-yellow ml-1">${pendientes} sin aplicar</span>` : ''}
      </button>`;
  }
  return `
    <div class="card rut-caja">
      <div class="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div class="font-bold text-slate-900 text-sm">💬 Agente de rutinas</div>
        <div class="flex gap-1">
          <button class="btn btn-ghost btn-sm" onclick="rutLimpiar()">Nueva conversación</button>
          <button class="btn btn-ghost btn-sm" onclick="rutToggle()">Cerrar ✕</button>
        </div>
      </div>
      ${rutPropuestasHTML()}
      <div id="rut-hilo" class="asis-hilo" style="max-height:42vh">${rutHiloHTML()}</div>
      <div class="flex gap-2 items-end mt-3">
        <textarea id="rut-input" rows="2" class="resize-none"
                  placeholder="Ej: agrégale fondos al Push, 3×10 — o: ¿qué pesos ha movido en sentadilla?"
                  onkeydown="rutTeclado(event)" ${ch?.trabajando ? 'disabled' : ''}></textarea>
        <button class="btn btn-primary flex-shrink-0" onclick="rutPreguntar()" ${ch?.trabajando ? 'disabled' : ''}>
          ${ch?.trabajando ? '…' : 'Preguntar'}
        </button>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2 mt-2">
        <div class="asis-modos">
          <button class="graf-rango ${ch?.aFondo ? '' : 'active'}" onclick="rutModo(false)"
                  title="Consultar y cambios sencillos">⚡ Rápido</button>
          <button class="graf-rango ${ch?.aFondo ? 'active' : ''}" onclick="rutModo(true)"
                  title="Para pedirle criterio: qué falta en el plan, cómo adaptar por una lesión">🧠 A fondo</button>
        </div>
        <div class="text-[11px] text-slate-400">${ch ? asisGastoHTML(ch) : ''}</div>
      </div>
    </div>`;
}

// Se engancha en la sección Entrenamiento: entVistaClientes lo pinta después
// del contenido, solo cuando hay un cliente abierto.
window.rutMontarPanel = () => {
  const hueco = $('#rut-panel');
  if (hueco) rutPintar();
};
