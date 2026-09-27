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

// Los ejemplos cambian según qué pestaña estés mirando. Armar un calendario
// y revisar una rutina son dos trabajos distintos, y ofrecerle "¿qué pesos ha
// movido?" a quien está cuadrando la semana no le ahorra nada.
const RUT_EJEMPLOS_CALENDARIO = [
  'Quítale el martes al Lower',
  'Pon el Upper lunes, miércoles y viernes',
  'Pasa el Push del martes al viernes',
  'Agrégale natación los lunes y miércoles',
  'Deja los días como los venía entrenando',
  'Ponle medición de peso los viernes de la semana 1 y la 4',
  '¿Qué días le quedaron libres?',
];

const RUT_EJEMPLOS_PLAN = [
  '¿Qué ejercicios de empuje NO le he puesto?',
  '¿Qué pesos ha venido moviendo en press banca?',
  'Agrégale fondos en paralelas al Push, 3×10',
  'Pon el Lower el miércoles',
  'Cámbiale las sentadillas por prensa',
  '¿Le falta algún patrón de movimiento en esta fase?',
];

const rutEjemplos = () =>
  (typeof _ent === 'object' && _ent?.subtab === 'calendario')
    ? RUT_EJEMPLOS_CALENDARIO : RUT_EJEMPLOS_PLAN;

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

// Los días de una rutina. `dias_semana` (lista) es lo que manda; el viejo
// `dia_semana` se sigue leyendo para las rutinas que no han pasado por
// `migracion-calendario.sql`.
function rutDiasDe(r) {
  if (Array.isArray(r?.dias_semana) && r.dias_semana.length) return r.dias_semana;
  return r?.dia_semana ? [r.dia_semana] : [];
}
const rutOrdenDias = (a, b) => 'LMXJVSD'.indexOf(a) - 'LMXJVSD'.indexOf(b);
const rutDiasTexto = (r) => rutDiasDe(r).slice().sort(rutOrdenDias)
  .map(d => entLabel(ENT_DIAS, d)).join(', ');

// Uno o varios días, como venga: "martes", "L,X,V", "lunes y miércoles",
// ['L','X']. Devuelve `{ok, dias}` o `{ok:false, error}` nombrando lo que no
// entendió, porque un día mal leído mueve una rutina al día equivocado en
// silencio.
function rutDias(txt) {
  const bruto = Array.isArray(txt)
    ? txt
    : String(txt).split(/[,;/]|\s+y\s+|\s+/i);
  const dias = [];
  const malos = [];
  bruto.map(x => String(x).trim()).filter(Boolean).forEach(x => {
    const d = rutDia(x);
    if (!d) malos.push(x);
    else if (!dias.includes(d)) dias.push(d);
  });
  if (malos.length) {
    return { ok: false, error: `No entendí ${malos.map(m => `"${m}"`).join(', ')}. Usa lunes…domingo o L M X J V S D.` };
  }
  if (!dias.length) return { ok: false, error: 'No me dijiste ningún día.' };
  return { ok: true, dias: dias.sort(rutOrdenDias) };
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
          dias_semana: rutDiasDe(r),
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
      dias_semana: rutDiasDe(r),
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

  async editar_rutina({ nombre, rutina, nuevo_nombre, dia_semana, dias_semana,
                        agregar_dias, quitar_dias, duracion_min, fase } = {}) {
    const c = await rutCliente(nombre);
    if (!c) return rutSinCliente(nombre);
    const { fase: f, rutinas } = await rutContexto(c, fase);
    if (!f) return { error: `${c.nombre} no tiene fases.` };
    const r = rutBuscarRutina(rutinas, rutina);
    if (!r) return { error: `No encontré la rutina "${rutina}".`, rutinas_de_esta_fase: rutinas.map(x => x.nombre) };

    const row = {};
    const cambios = [];
    if (nuevo_nombre) { row.nombre = String(nuevo_nombre); cambios.push(`nombre "${r.nombre}" → "${row.nombre}"`); }

    // `dias_semana` es lo que manda; `dia_semana` se acepta como sinónimo
    // porque es como se llamaba antes y como lo dice mucha gente ("ponla el
    // martes"). Los dos admiten uno o varios días.
    const pedido = dias_semana !== undefined ? dias_semana : dia_semana;
    if (pedido !== undefined) {
      if (pedido === null || pedido === '' || (Array.isArray(pedido) && !pedido.length)) {
        row.dias_semana = [];
        cambios.push('deja de tener días fijos');
      } else {
        const ds = rutDias(pedido);
        if (!ds.ok) return { error: ds.error };
        const choque = ds.dias
          .map(d => ({ d, otra: rutinas.find(x => x.id !== r.id && rutDiasDe(x).includes(d)) }))
          .find(x => x.otra);
        if (choque) {
          return { error: `El ${entLabel(ENT_DIAS, choque.d)} ya lo ocupa "${choque.otra.nombre}". Quítaselo a esa primero, o elige otro día.` };
        }
        row.dias_semana = ds.dias;
        const antes = rutDiasTexto(r) || 'libre';
        cambios.push(`días ${antes} → ${ds.dias.map(d => entLabel(ENT_DIAS, d)).join(', ')}`);
      }
    }
    // Quitar y añadir días SUELTOS, sin repetir la lista entera. Es como se
    // habla de verdad: "quítale el martes", "ponla también el viernes". Con
    // solo `dias_semana` el agente tendría que recalcular la lista completa
    // cada vez, y basta que se equivoque una vez para borrarle un día al
    // cliente sin que nadie lo note.
    if (agregar_dias !== undefined || quitar_dias !== undefined) {
      if (row.dias_semana) {
        return { error: 'No mezcles: o me das la lista completa de días, o me dices cuáles quitar y cuáles añadir.' };
      }
      let dias = rutDiasDe(r).slice();

      if (quitar_dias !== undefined && quitar_dias !== null && quitar_dias !== '') {
        const q = rutDias(quitar_dias);
        if (!q.ok) return { error: q.error };
        const noTiene = q.dias.filter(d => !dias.includes(d));
        if (noTiene.length) {
          return { error: `"${r.nombre}" no está ${noTiene.map(d => 'el ' + entLabel(ENT_DIAS, d)).join(' ni ')}. Está ${rutDiasTexto(r) || 'sin días fijos'}.` };
        }
        dias = dias.filter(d => !q.dias.includes(d));
        cambios.push(`quita ${q.dias.map(d => entLabel(ENT_DIAS, d)).join(', ')}`);
      }

      if (agregar_dias !== undefined && agregar_dias !== null && agregar_dias !== '') {
        const g = rutDias(agregar_dias);
        if (!g.ok) return { error: g.error };
        const choque = g.dias
          .map(d => ({ d, otra: rutinas.find(x => x.id !== r.id && rutDiasDe(x).includes(d)) }))
          .find(x => x.otra);
        if (choque) {
          return { error: `El ${entLabel(ENT_DIAS, choque.d)} ya lo ocupa "${choque.otra.nombre}". Quítaselo a esa primero, o elige otro día.` };
        }
        const yaEsta = g.dias.filter(d => dias.includes(d));
        if (yaEsta.length === g.dias.length) {
          return { error: `"${r.nombre}" ya está ${g.dias.map(d => 'el ' + entLabel(ENT_DIAS, d)).join(' y ')}. No hay nada que cambiar.` };
        }
        dias = [...new Set([...dias, ...g.dias])];
        cambios.push(`añade ${g.dias.map(d => entLabel(ENT_DIAS, d)).join(', ')}`);
      }

      row.dias_semana = dias.sort(rutOrdenDias);
      cambios.push(`queda ${row.dias_semana.map(d => entLabel(ENT_DIAS, d)).join(', ') || 'sin días fijos'}`);
    }

    if (duracion_min != null) { row.duracion_estimada_min = Number(duracion_min); cambios.push(`duración → ${row.duracion_estimada_min} min`); }
    if (!cambios.length) return { error: 'No me dijiste qué cambiar de la rutina.' };

    // Si algún día nuevo no está entre los días de la fase, el calendario lo
    // mostraría sin que la fase lo declare. Se avisa, no se bloquea.
    const fuera = (row.dias_semana || []).filter(d => !(f.dias_semana || []).includes(d));
    const aviso = fuera.length
      ? `Ojo: la fase "${f.nombre}" no tiene ${fuera.map(d => entLabel(ENT_DIAS, d)).join(', ')} entre sus días. Quizá también quieras cambiar los días de la fase.`
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

  async duplicar_rutina({ nombre, rutina, nuevo_nombre, dia_semana, dias_semana, fase } = {}) {
    const c = await rutCliente(nombre);
    if (!c) return rutSinCliente(nombre);
    const { fase: f, rutinas } = await rutContexto(c, fase);
    if (!f) return { error: `${c.nombre} no tiene fases.` };
    const r = rutBuscarRutina(rutinas, rutina);
    if (!r) return { error: `No encontré la rutina "${rutina}".` };
    const pedido = dias_semana !== undefined ? dias_semana : dia_semana;
    const ds = (pedido === undefined || pedido === null || pedido === '') ? null : rutDias(pedido);
    if (ds && !ds.ok) return { error: ds.error };
    const d = ds ? ds.dias : null;
    return rutProponer(
      `Duplicar "${r.nombre}" de ${c.nombre}`,
      `${nuevo_nombre ? `se llamará "${nuevo_nombre}"` : 'copia con los mismos ejercicios'}${d ? ` · ${d.map(x => entLabel(ENT_DIAS, x)).join(', ')}` : ''}`,
      async () => {
        const nueva = await entDb.duplicarRutina(r.id);
        if (!nueva) throw new Error('La copia no se creó');
        const row = {};
        if (nuevo_nombre) row.nombre = String(nuevo_nombre);
        if (d) row.dias_semana = d;
        if (Object.keys(row).length) await entDb.actualizarRutina(nueva, row);
      },
    );
  },

  // ---- Eventos: lo del calendario que no es una rutina ----
  // "agrégale natación lunes y miércoles", "ponle medición de peso el viernes
  // de la semana 1 y la 4", "quítale el fútbol". Son la mitad de las frases
  // que uno le dice al planificar y hasta ahora no tenían dónde caer.
  async ver_eventos({ nombre, fase } = {}) {
    const c = await rutCliente(nombre);
    if (!c) return rutSinCliente(nombre);
    const eventos = await evtDb.lista(c.id);
    if (eventos === null) return { error: 'La tabla de eventos no está instalada todavía (falta correr carga/migracion-eventos.sql).' };
    const fases = await entDb.fases(c.id);
    const porId = Object.fromEntries(fases.map(f => [f.id, f]));
    return {
      cliente: c.nombre,
      eventos: eventos.map(ev => ({
        titulo: ev.titulo,
        tipo: ev.tipo,
        cuando: ev.fecha
          ? `el ${ev.fecha}`
          : `${(ev.dias_semana || []).map(d => entLabel(ENT_DIAS, d)).join(', ')}${ev.semanas?.length ? ` · solo semanas ${ev.semanas.join(', ')}` : ' · todas las semanas'}`,
        fase: porId[ev.fase_id]?.nombre || null,
        hora: ev.hora || null,
        detalle: ev.detalle || null,
        dias_en_que_cae: evtFechasDe(ev, porId[ev.fase_id]).length,
        lo_ve_el_cliente: ev.visible_cliente == null ? 'lo que diga la fase' : (ev.visible_cliente ? 'sí' : 'no'),
      })),
    };
  },

  async agregar_evento({ nombre, titulo, tipo, dias, fecha, semanas, hora, detalle, fase } = {}) {
    const c = await rutCliente(nombre);
    if (!c) return rutSinCliente(nombre);
    if (!titulo) return { error: '¿Qué evento? Necesito un título, por ejemplo "Natación".' };
    const { fase: f } = await rutContexto(c, fase);

    const codigos = dias
      ? [...new Set((Array.isArray(dias) ? dias : String(dias).split(/[,\s]+/)).map(rutDia).filter(Boolean))]
      : [];
    if (!codigos.length && !fecha) {
      return { error: 'Dime cuándo: unos días de la semana ("lunes y miércoles") o una fecha concreta.' };
    }
    // Repetir necesita un rango, y el rango lo pone la fase. Sin fase, lo
    // único honesto es pedir una fecha en vez de crear algo que no se pintaría.
    if (codigos.length && !f) {
      return { error: `${c.nombre} no tiene ninguna fase, y sin fase no hay semanas sobre las que repetir. Créale una fase, o dime una fecha concreta.` };
    }

    const nums = semanas
      ? (Array.isArray(semanas) ? semanas : String(semanas).split(/[,\s]+/)).map(Number).filter(n => n > 0)
      : [];
    const t = ['actividad', 'medidas', 'peso', 'fotos', 'medicion', 'cita', 'nota', 'descanso'].includes(tipo) ? tipo : 'actividad';

    const cuando = codigos.length
      ? `${codigos.map(d => entLabel(ENT_DIAS, d)).join(', ')}${nums.length ? ` · semanas ${nums.join(', ')}` : ' · todas las semanas'} de "${f.nombre}"`
      : `el ${fecha}`;

    return rutProponer(
      `Añadir "${titulo}" al calendario de ${c.nombre}`,
      `${evtLabel(t)} · ${cuando}${hora ? ` · ${hora}` : ''}`,
      async () => {
        const creado = await evtDb.crear({
          cliente_id: c.id,
          fase_id: codigos.length ? f.id : (f?.id || null),
          tipo: t, titulo: String(titulo),
          detalle: detalle ? String(detalle) : null,
          hora: hora || null,
          fecha: codigos.length ? null : String(fecha),
          dias_semana: codigos,
          semanas: nums.length ? nums : null,
          visible_cliente: null,        // hereda de la fase: nada se publica solo
        });
        if (!creado) throw new Error('El evento no se creó');
      },
    );
  },

  async quitar_evento({ nombre, titulo } = {}) {
    const c = await rutCliente(nombre);
    if (!c) return rutSinCliente(nombre);
    const eventos = await evtDb.lista(c.id);
    if (eventos === null) return { error: 'La tabla de eventos no está instalada todavía.' };
    const buscado = normalizeName(String(titulo || ''));
    if (!buscado) return { error: '¿Cuál evento?' };
    const encontrados = eventos.filter(ev => normalizeName(ev.titulo).includes(buscado));
    if (!encontrados.length) {
      return { error: `No encontré ningún evento que se llame "${titulo}".`, eventos_del_cliente: eventos.map(e => e.titulo) };
    }
    // Borrar "el que más se parezca" cuando hay dos candidatos es justo el
    // tipo de decisión que no debe tomar el agente solo.
    if (encontrados.length > 1) {
      return { error: `"${titulo}" coincide con ${encontrados.length} eventos. Dime cuál.`, coinciden: encontrados.map(e => e.titulo) };
    }
    const ev = encontrados[0];
    return rutProponer(
      `Quitar "${ev.titulo}" del calendario de ${c.nombre}`,
      ev.fecha ? `era el ${ev.fecha}` : `era ${(ev.dias_semana || []).map(d => entLabel(ENT_DIAS, d)).join(', ')}`,
      async () => { if (!(await evtDb.borrar(ev.id))) throw new Error('No se pudo borrar'); },
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
  ver_eventos: 'Mirando su calendario',
  agregar_evento: 'Preparando un evento',
  quitar_evento: 'Preparando quitar un evento',
};

// =====================================================
// EL PANEL
// =====================================================
window.rutPreguntar = async (textoDirecto) => {
  const input = $('#rut-input');
  const pregunta = (textoDirecto ?? input?.value ?? '').trim();
  if (!_rut.chat) _rut.chat = asisEstadoNuevo('rutinas');
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
  _rut.chat = asisEstadoNuevo('rutinas');
  _rut.propuestas = [];
  rutPintar();
};

window.rutNivel = (nivel) => {
  if (!NIVELES_IA[nivel]) return;
  if (!_rut.chat) _rut.chat = asisEstadoNuevo('rutinas');
  _rut.chat.nivel = nivel;
  guardarNivelIa('rutinas', nivel);
  rutPintar();
};

window.rutToggle = () => {
  _rut.abierto = !_rut.abierto;
  if (!_rut.chat) _rut.chat = asisEstadoNuevo('rutinas');
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
          ${_ent?.subtab === 'calendario'
            ? 'Cuádrale la semana escribiendo, en vez de arrastrar. Los cambios te los deja'
            : 'Pregúntale sobre el plan de este cliente, o pídele cambios. Los cambios te los deja'}
          <strong>propuestos</strong>: nada se guarda sin que tú lo apruebes.
        </div>
        <div class="flex flex-col gap-1.5">
          ${rutEjemplos().map(e => `
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
        ${_ent?.subtab === 'calendario'
          ? '💬 Cuadrar la semana escribiéndole al agente'
          : '💬 Preguntarle al agente sobre este plan'}
        ${pendientes ? `<span class="tag tag-yellow ml-1">${pendientes} sin aplicar</span>` : ''}
      </button>`;
  }
  return `
    <div class="card rut-caja">
      <div class="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div class="font-bold text-slate-900 text-sm">${_ent?.subtab === 'calendario' ? '💬 Agente del calendario' : '💬 Agente de rutinas'}</div>
        <div class="flex gap-1">
          <button class="btn btn-ghost btn-sm" onclick="abrirGuiaAgente('ent')"
                  title="${(_settings.guia_entrenamiento || '').trim() ? 'Está usando tu guía de entrenamiento. Tócalo para cambiarla.' : 'Dile cómo armas tú las rutinas: criterios, preferencias, tope de ejercicios…'}">
            ${(_settings.guia_entrenamiento || '').trim() ? '⚙️ Tu guía ✓' : '⚙️ Cómo trabaja'}
          </button>
          <button class="btn btn-ghost btn-sm" onclick="rutLimpiar()">Nueva conversación</button>
          <button class="btn btn-ghost btn-sm" onclick="rutToggle()">Cerrar ✕</button>
        </div>
      </div>
      ${rutPropuestasHTML()}
      <div id="rut-hilo" class="asis-hilo" style="max-height:42vh">${rutHiloHTML()}</div>
      <div class="flex gap-2 items-end mt-3">
        <textarea id="rut-input" rows="2" class="resize-none"
                  placeholder="${_ent?.subtab === 'calendario'
                    ? 'Ej: quítale el martes al Lower — o: pon el Upper lunes, miércoles y viernes'
                    : 'Ej: agrégale fondos al Push, 3×10 — o: ¿qué pesos ha movido en sentadilla?'}"
                  onkeydown="rutTeclado(event)" ${ch?.trabajando ? 'disabled' : ''}></textarea>
        <button class="btn btn-primary flex-shrink-0" onclick="rutPreguntar()" ${ch?.trabajando ? 'disabled' : ''}>
          ${ch?.trabajando ? '…' : 'Preguntar'}
        </button>
      </div>
      <div class="mt-3">
        ${selectorNivelHTML('chat', ch?.nivel || nivelIaGuardado('rutinas'), 'rutNivel')}
        <div class="text-[11px] text-slate-400 mt-1.5 text-right">${ch ? asisGastoHTML(ch) : ''}</div>
      </div>
    </div>`;
}

// Se engancha en la sección Entrenamiento: entVistaClientes lo pinta después
// del contenido, solo cuando hay un cliente abierto.
window.rutMontarPanel = () => {
  const hueco = $('#rut-panel');
  if (hueco) rutPintar();
};
