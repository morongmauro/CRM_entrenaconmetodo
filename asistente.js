// =====================================================
// ASISTENTE DEL CRM · pregúntale a tus datos
// =====================================================
// "¿Quiénes han visto la cápsula de proteína?", "¿qué ha comido Amali esta
// semana?", "¿quién me debe plata?", "¿a quién le falta seguimiento?".
//
// CÓMO FUNCIONA (y por qué no se lleva tu base de datos a ningún lado)
// --------------------------------------------------------------------
// El modelo no consulta Supabase. Recibe una lista de HERRAMIENTAS y pide la
// que necesita; ESTE archivo la ejecuta acá, en tu navegador, con la sesión
// que ya tienes abierta, y le devuelve solo ese resultado. O sea:
//
//   pregunta → el modelo decide qué necesita → el navegador lo busca
//            → el modelo responde con eso
//
// Consecuencia práctica: lo que sube (y lo que se paga) es la respuesta a la
// pregunta, no el CRM entero. Una pregunta típica mueve entre 2.000 y 15.000
// tokens de entrada. Las instrucciones y la lista de herramientas se cachean,
// así que a partir de la segunda pregunta esa parte cuesta una décima parte.
//
// Se carga DESPUÉS de app.js: usa su capa db, su caché, su cliente de
// Supabase y sus lectores del Mealtracker y del Centro de Recursos.
// =====================================================

const _asis = {
  mensajes: [],        // la conversación completa, en el formato de la API
  visible: [],         // lo que se pinta: { rol, texto, herramientas[] }
  trabajando: false,
  paso: '',            // qué está haciendo ahora mismo, para el indicador
  error: null,
  gasto: { entrada: 0, salida: 0, cache: 0, vueltas: 0, modelo: null },
  nivel: null,         // rapido | profundo | muy_profundo (se rellena al pintar)
};

// Precios por millón de tokens (USD), para poder decirte cuánto costó la
// conversación en vez de que te enteres a fin de mes.
// Si cambian los precios o cambias de modelo, se ajusta acá.
const ASIS_PRECIOS = {
  'claude-sonnet-5': { entrada: 2,  salida: 10 },
  'claude-opus-5':   { entrada: 5,  salida: 25 },
  'claude-haiku-4-5': { entrada: 1, salida: 5 },
};
const ASIS_PRECIO_POR_DEFECTO = ASIS_PRECIOS['claude-sonnet-5'];

const ASIS_MAX_VUELTAS = 8;   // tope de idas y venidas por pregunta

const ASIS_EJEMPLOS = [
  '¿Quiénes han visto la cápsula de proteína y a quién le falta?',
  '¿Qué ha comido Amali esta semana?',
  '¿Quién no tiene seguimiento hace más de dos semanas?',
  '¿Quién está pendiente de pago este mes?',
  '¿Quién bajó más peso en los últimos 3 meses?',
  '¿Qué clientes activos no han abierto nada del Centro de Recursos?',
];

// =====================================================
// UTILIDADES
// =====================================================

// El coach escribe "amali", no "Amali Restrepo Gómez". Se busca por
// coincidencia exacta, luego por "empieza por", luego por parecido.
async function asisBuscarCliente(nombre) {
  const clientes = await db.clientes.list();
  if (!nombre) return null;
  const n = normalizeName(nombre);
  return clientes.find(c => normalizeName(c.nombre) === n)
    || clientes.find(c => normalizeName(c.nombre).startsWith(n))
    || clientes.find(c => normalizeName(c.nombre).includes(n))
    || clientes.map(c => ({ c, s: similitudNombre(c.nombre, nombre) }))
        .filter(x => x.s >= 70).sort((a, b) => b.s - a.s)[0]?.c
    || null;
}

function asisNoEncontrado(nombre, clientes) {
  return {
    error: `No encontré ningún cliente que se llame "${nombre}".`,
    clientes_disponibles: clientes.map(c => c.nombre),
  };
}

// Redondeo corto: mandar 77.60000000000001 gasta tokens y no aporta nada.
const asisN = (v, d = 1) => (v === null || v === undefined || !isFinite(v))
  ? null : +Number(v).toFixed(d);

// =====================================================
// LAS HERRAMIENTAS · se ejecutan acá, no en el servidor
// =====================================================
const ASIS_HERRAMIENTAS = {

  async listar_clientes({ estado = 'activo' } = {}) {
    const todos = await db.clientes.list();
    const filtrados = estado === 'todos' ? todos : todos.filter(c => c.estado === estado);
    const segs = await db.seguimientos.listAll();
    const ultSeg = {};
    for (const s of segs) {
      if (!ultSeg[s.cliente_id] || s.semana > ultSeg[s.cliente_id].semana) ultSeg[s.cliente_id] = s;
    }
    return {
      total: filtrados.length,
      clientes: filtrados.map(c => ({
        nombre: c.nombre,
        estado: c.estado,
        inicio: c.fecha_inicio || null,
        objetivo: c.objetivo || null,
        dias_de_entreno_por_semana: metaDiasEntreno(c),
        lugar_de_entreno: c.lugar_entreno || null,
        meta_kcal: c.meta_calorias || null,
        meta_proteina_g: c.meta_proteina_g || null,
        ultima_semana_con_seguimiento: ultSeg[c.id]?.semana || null,
        app_de_comidas_vinculada: !!c.mealtracker_id,
        mensualidad: c.monto ? `${c.monto} ${c.moneda || 'COP'}` : null,
      })),
    };
  },

  async ficha_cliente({ nombre }) {
    const c = await asisBuscarCliente(nombre);
    if (!c) return asisNoEncontrado(nombre, await db.clientes.list());
    const [meds, metas] = await Promise.all([
      db.mediciones.listCliente(c.id),
      db.metas.listCliente(c.id),
    ]);
    const ult = (meds || []).filter(m => m.peso != null).slice(-1)[0] || null;
    return {
      nombre: c.nombre,
      estado: c.estado,
      edad: helpers.edadDe(c.fecha_nacimiento),
      sexo: c.sexo || null,
      estatura_cm: c.estatura_cm || null,
      ciudad: c.ciudad || null,
      profesion: c.profesion || null,
      inicio: c.fecha_inicio || null,
      email: c.email || null,
      telefono: c.telefono || null,
      objetivo: c.objetivo || null,
      meta_especifica: c.meta_especifica || null,

      // Entrenamiento. Va explícito y con el número ya hecho: "¿cuántos días
      // entrena?" debe ser una LECTURA, no una deducción a partir de los
      // seguimientos. Cada dato que el asistente tiene que inferir es un dato
      // que puede inferir mal.
      dias_de_entreno_por_semana: metaDiasEntreno(c),
      que_dias_entrena: (c.dias_entreno || []).length ? c.dias_entreno.join(', ') : null,
      lugar_de_entreno: c.lugar_entreno || null,
      antecedentes_deportivos: c.antecedentes_deportivos || null,
      actividades_complementarias: c.actividades_complementarias || null,

      // Salud y limitaciones: lo primero que manda al adaptar una rutina.
      lesion_actual: c.lesion_actual || null,
      estado_de_la_lesion: c.lesion_estado || null,
      restricciones_y_lesiones: c.restricciones_lesiones || null,
      patologias: c.patologias || null,
      suplementos: c.suplementos || null,

      nivel_actividad: c.nivel_actividad || null,
      pal: c.pal_factor || null,
      objetivo_calorico: c.objetivo_calorico || null,
      proteina_g_kg: c.proteina_g_kg || null,
      meta_vigente: c.meta_calorias ? {
        kcal: c.meta_calorias,
        proteina_g: c.meta_proteina_g,
        carbos_g: c.meta_carbos_g,
        grasas_g: c.meta_grasas_g,
        metodo: c.meta_metodo || null,
        calculada_en: c.meta_calculada_en || null,
      } : null,
      metas_registradas: Array.isArray(metas) ? metas.length : null,
      ultima_medicion: ult ? { fecha: ult.fecha, peso_kg: ult.peso, grasa_pct: ult.grasa_pct ?? null } : null,
      mensualidad: c.monto ? `${c.monto} ${c.moneda || 'COP'}` : null,
      dia_de_pago: c.dia_pago || null,
      canal: c.canal_adquisicion || null,
      etiquetas: c.tags || [],
      notas_del_coach: c.notas || null,
      app_de_comidas_vinculada: !!c.mealtracker_id,
    };
  },

  async seguimientos({ nombre, semanas = 8 } = {}) {
    const n = Math.min(Math.max(Number(semanas) || 8, 1), 26);
    const clientes = await db.clientes.list();
    const compacta = (s) => ({
      semana: s.semana,
      fecha: s.fecha,
      entreno: s.fuerza_planeados
        ? `${s.fuerza_ejecutados ?? 0}/${s.fuerza_planeados} sesiones de fuerza`
        : null,
      cardio: s.cardio_planeados ? `${s.cardio_ejecutados ?? 0}/${s.cardio_planeados}` : null,
      score_entreno: s.score_entreno ?? null,
      score_alimentacion: s.score_alim_metas ?? null,
      score_global: s.score_global ?? null,
      dias_que_registro_comida: s.dias_registro_alim ?? null,
      kcal_promedio: s.kcal_promedio ?? null,
      animo: s.estado_animo || null,
      lesion: s.lesion_estado_semana || null,
      avances: s.avances || null,
      pendientes: typeof checklistTextoPlano === 'function'
        ? (checklistTextoPlano(s.pendientes_semana) || null)
        : (s.pendientes_semana || null),
    });

    if (nombre) {
      const c = await asisBuscarCliente(nombre);
      if (!c) return asisNoEncontrado(nombre, clientes);
      const segs = await db.seguimientos.listCliente(c.id);
      return {
        cliente: c.nombre,
        semanas_registradas: segs.length,
        semanas: segs.slice(0, n).map(compacta),
      };
    }

    const activos = clientes.filter(c => c.estado === 'activo');
    const todos = await db.seguimientos.listAll();
    const porCliente = new Map(activos.map(c => [c.id, []]));
    for (const s of todos) if (porCliente.has(s.cliente_id)) porCliente.get(s.cliente_id).push(s);
    return {
      hoy: fmt.hoy(),
      semana_en_curso: fmt.semanaISO(),
      clientes: activos.map(c => {
        const suyos = (porCliente.get(c.id) || []).sort((a, b) => b.semana.localeCompare(a.semana));
        return {
          nombre: c.nombre,
          ultima_semana: suyos[0]?.semana || null,
          ultima_fecha: suyos[0]?.fecha || null,
          total_semanas: suyos.length,
          semanas: suyos.slice(0, n).map(compacta),
        };
      }),
    };
  },

  async mediciones({ nombre }) {
    const c = await asisBuscarCliente(nombre);
    if (!c) return asisNoEncontrado(nombre, await db.clientes.list());
    const meds = await db.mediciones.listCliente(c.id);
    if (!meds.length) return { cliente: c.nombre, mediciones: [], nota: 'Este cliente no tiene mediciones registradas.' };
    const edad = helpers.edadDe(c.fecha_nacimiento);
    const asc = meds.slice().sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
    const primera = asc.find(m => m.peso != null);
    return {
      cliente: c.nombre,
      total: asc.length,
      mediciones: asc.map((m, i) => {
        const prev = asc.slice(0, i).reverse().find(x => x.peso != null);
        const comp = calcComposicionCorporal({
          peso: m.peso, grasa_pct: m.grasa_pct, edad, sexo: c.sexo, altura_cm: c.estatura_cm,
        });
        return {
          fecha: m.fecha,
          peso_kg: m.peso ?? null,
          grasa_pct: m.grasa_pct ?? null,
          cintura_cm: m.cintura ?? null,
          cambio_vs_anterior_kg: prev && m.peso != null ? asisN(m.peso - prev.peso) : null,
          cambio_vs_primera_kg: primera && m.peso != null && m !== primera ? asisN(m.peso - primera.peso) : null,
          masa_magra_kg: comp?.masa_magra_kg ?? null,
          musculo_esqueletico_kg: comp?.masa_muscular_smm_kg ?? null,
          masa_grasa_kg: comp?.masa_grasa_kg ?? null,
          notas: m.notas || null,
        };
      }),
    };
  },

  async pagos({ anio, solo_pendientes = false } = {}) {
    const year = Number(anio) || new Date().getFullYear();
    const [clientes, pagos] = await Promise.all([db.clientes.list(), db.pagos.listAnio(year)]);
    const porId = new Map(clientes.map(c => [c.id, c]));
    const hoy = fmt.hoy();
    const mesActual = fmt.mesActual();
    let filas = pagos.map(p => {
      const c = porId.get(p.cliente_id);
      const vencido = !p.pagado && p.mes < mesActual;
      return {
        cliente: c?.nombre || '(cliente eliminado)',
        mes: p.mes,
        monto: p.monto,
        moneda: p.moneda || c?.moneda || 'COP',
        monto_en_cop: Math.round(copConv(p.monto, p.moneda || c?.moneda)),
        estado: p.pagado ? 'pagado' : vencido ? 'vencido' : 'pendiente',
        fecha_pago: p.fecha_pago || null,
      };
    });
    if (solo_pendientes) filas = filas.filter(f => f.estado !== 'pagado');
    const cobrado = filas.filter(f => f.estado === 'pagado').reduce((a, f) => a + f.monto_en_cop, 0);
    const porCobrar = filas.filter(f => f.estado !== 'pagado').reduce((a, f) => a + f.monto_en_cop, 0);
    return {
      anio: year, hoy,
      tasa_usd_cop: _settings.usd_cop_rate,
      total_cobrado_cop: cobrado,
      total_por_cobrar_cop: porCobrar,
      pagos: filas.sort((a, b) => b.mes.localeCompare(a.mes)),
    };
  },

  async pendientes({ nombre, estado = 'abierto' } = {}) {
    let cliente = null;
    if (nombre) {
      cliente = await asisBuscarCliente(nombre);
      if (!cliente) return asisNoEncontrado(nombre, await db.clientes.list());
    }
    const todos = await db.pendientes.list();
    let filas = estado === 'todos' ? todos : todos.filter(p => p.estado === estado);
    if (cliente) filas = filas.filter(p => p.cliente_id === cliente.id);
    // De la más reciente a la más antigua: "la última tarea de X" tiene que
    // ser el primer elemento de la lista, no algo que haya que rastrear.
    filas = filas.slice().sort((a, b) =>
      String(b.created_at || b.fecha_limite || '').localeCompare(String(a.created_at || a.fecha_limite || '')));
    return {
      hoy: fmt.hoy(),
      cliente: cliente?.nombre || 'todos',
      total: filas.length,
      orden: 'de la más reciente a la más antigua',
      pendientes: filas.map(p => ({
        titulo: p.titulo,
        cliente: p.clientes?.nombre || null,
        estado: p.estado,
        creada: p.created_at ? String(p.created_at).slice(0, 10) : null,
        fecha_limite: p.fecha_limite || null,
        completada_en: p.completado_en || null,
        vencido: !!(p.fecha_limite && p.estado === 'abierto' && p.fecha_limite < fmt.hoy()),
        tipo: p.scope || null,
      })),
    };
  },

  async centro_recursos({ nombre, capsula } = {}) {
    const clientes = await db.clientes.list();

    if (nombre) {
      const c = await asisBuscarCliente(nombre);
      if (!c) return asisNoEncontrado(nombre, clientes);
      const l = await fetchLecturasCentro(c.nombre);
      if (!l) return { error: 'No pude conectarme al Centro de Recursos en este momento.' };
      return {
        cliente: c.nombre,
        vio_el_onboarding: l.onboarding,
        vio_las_preguntas_frecuentes: l.faq,
        capitulos_de_la_guia_leidos: l.guiaCaps,
        capsulas_vistas: l.capsulas.filter(x => x.vista).map(x => x.title),
        capsulas_pendientes: l.capsulas.filter(x => !x.vista).map(x => x.title),
        podcasts_escuchados: l.podcasts.map(p => p.title),
      };
    }

    // Cuadro completo: quién vio qué. Es la vista que responde "quiénes han
    // leído la cápsula X".
    const activos = clientes.filter(c => c.estado === 'activo');
    const filas = await Promise.all(activos.map(async c => ({ c, l: await fetchLecturasCentro(c.nombre) })));
    if (filas.every(f => !f.l)) return { error: 'No pude conectarme al Centro de Recursos en este momento.' };

    const busca = capsula ? normalizeName(capsula) : null;
    const coincide = (cap) => !busca
      || normalizeName(cap.id).includes(busca)
      || normalizeName(cap.title).includes(busca);

    // Con filtro de cápsula la respuesta es corta y directa: dos listas.
    if (busca) {
      const objetivo = (filas.find(f => f.l)?.l.capsulas || []).filter(coincide);
      if (!objetivo.length) {
        return {
          error: `No hay ninguna cápsula que coincida con "${capsula}".`,
          capsulas_publicadas: (filas.find(f => f.l)?.l.capsulas || []).map(x => x.title),
        };
      }
      return {
        capsulas_consultadas: objetivo.map(x => x.title),
        resultado: objetivo.map(obj => ({
          capsula: obj.title,
          la_vieron: filas.filter(f => f.l?.capsulas.some(x => x.id === obj.id && x.vista)).map(f => f.c.nombre),
          no_la_han_visto: filas.filter(f => f.l && !f.l.capsulas.some(x => x.id === obj.id && x.vista)).map(f => f.c.nombre),
          sin_datos_del_centro: filas.filter(f => !f.l).map(f => f.c.nombre),
        })),
      };
    }

    return {
      clientes_activos: activos.length,
      clientes: filas.map(f => f.l ? {
        nombre: f.c.nombre,
        onboarding: f.l.onboarding,
        faq: f.l.faq,
        capitulos_guia: f.l.guiaCaps,
        capsulas_vistas: f.l.capsulas.filter(x => x.vista).map(x => x.title),
        capsulas_vistas_total: f.l.capsVistas,
        capsulas_publicadas_total: f.l.capsTotal,
        podcasts: f.l.podcasts.length,
      } : { nombre: f.c.nombre, sin_datos: true }),
    };
  },

  async alimentacion({ nombre, semana, detalle = true }) {
    const c = await asisBuscarCliente(nombre);
    if (!c) return asisNoEncontrado(nombre, await db.clientes.list());
    const sem = /^\d{4}-W\d{2}$/.test(String(semana || '')) ? semana : fmt.semanaISO();

    // Si la lectura del Mealtracker está bloqueada, hay que decirlo ANTES de
    // mirar los datos: "no registró nada" y "no pude leer" se ven igual desde
    // aquí, y el asistente daría el primero por bueno.
    const bloqueo = typeof mtMotivoSinDatos === 'function' ? mtMotivoSinDatos() : null;
    if (bloqueo) return { cliente: c.nombre, error: bloqueo };

    const d = await getMealtrackerDataMerged(c);
    if (!d) {
      return {
        cliente: c.nombre,
        error: c.mealtracker_id
          ? 'No pude leer la app de comidas de este cliente en este momento.'
          : 'Este cliente no tiene la app de comidas vinculada en el CRM.',
      };
    }

    const resumen = resumenSemanaDeData(d, sem);
    const meta = resumen.goals || {};
    const base = {
      cliente: c.nombre,
      semana: sem,
      rango: resumen.rango,
      dias_que_registro: resumen.dias,
      promedios: resumen.dias ? {
        kcal: resumen.kcal_avg, proteina_g: resumen.prote_avg,
        carbos_g: resumen.carbos_avg, grasas_g: resumen.grasas_avg,
      } : null,
      meta_vigente_esa_semana: meta.kcal ? {
        kcal: meta.kcal, proteina_g: meta.p, carbos_g: meta.c, grasas_g: meta.g,
      } : null,
      nota: resumen.dias === 0 ? 'No registró ningún día esa semana.' : null,
    };
    if (!detalle || !resumen.dias) return base;

    // Día a día con lo que de verdad comió. Es lo caro en tokens, por eso el
    // modelo puede pedirlo sin detalle cuando la pregunta es de números.
    const historial = d.history || {};
    const desglose = d.historyDetail || {};
    base.dias = nutFechasSemana(sem).map(fecha => {
      const tot = historial[fecha];
      const entradas = Array.isArray(desglose[fecha]) ? desglose[fecha] : [];
      if (!diaRegistradoMT(tot, entradas)) return { fecha, registro: 'sin registro' };
      return {
        fecha,
        kcal: asisN(tot?.kcal, 0),
        proteina_g: asisN(tot?.p, 0),
        carbos_g: asisN(tot?.c, 0),
        grasas_g: asisN(tot?.g, 0),
        agua_ml: tot?.water ? asisN(tot.water, 0) : null,
        comidas: entradas.map(e => ({
          momento: e.meal || 'comida',
          hora: e.time || null,
          kcal: asisN(e.kcal, 0),
          alimentos: (e.items || []).map(i =>
            `${i.name || ''}${i.amount ? ` (${i.amount})` : ''}`).filter(s => s.trim()),
          lo_que_escribio: e.rawInput || null,
        })),
      };
    });
    return base;
  },
};

// =====================================================
// EL BUCLE: pregunta → herramientas → respuesta
// =====================================================
async function asisLlamar(mensajes, { perfil = 'general', nivel = 'rapido' } = {}) {
  const r = await fetch('/api/coach-ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: mensajes,
      contexto: { hoy: fmt.hoy(), semana: fmt.semanaISO(), coach: _settings.nombre_coach },
      nivel,
      perfil,
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `El asistente respondió ${r.status}`);
  return data;
}

// Cada herramienta se protege por separado: si una falla (el Centro caído, la
// app del cliente sin responder), el modelo recibe el error de ESA y sigue
// con las demás en vez de que se caiga la pregunta entera.
async function asisEjecutar(bloque, herramientas) {
  const fn = herramientas[bloque.name];
  if (!fn) return { type: 'tool_result', tool_use_id: bloque.id, is_error: true, content: `No existe la herramienta ${bloque.name}` };
  try {
    const salida = await fn(bloque.input || {});
    return { type: 'tool_result', tool_use_id: bloque.id, content: JSON.stringify(salida) };
  } catch (e) {
    return { type: 'tool_result', tool_use_id: bloque.id, is_error: true, content: String(e?.message || e) };
  }
}

// ── El motor, compartido ────────────────────────────────────────────────
// Lo usan el asistente general y el de rutinas. Lo único que cambia entre
// ellos es qué herramientas hay, cómo se llaman en pantalla y qué perfil pide
// al servidor; el bucle de "pregunta → herramientas → respuesta" es el mismo,
// y duplicarlo sería duplicar también cada arreglo que le hagamos.
async function asisMotor(estado, { perfil, herramientas, etiquetas, alRepintar }) {
  const pintar = () => { try { alRepintar(); } catch (e) {} };
  const turno = estado.visible[estado.visible.length - 1];
  // Mientras el agente trabaja, el auto-actualizador del CRM no debe recargar
  // la página: se perdería la respuesta a mitad y se pagaría igual.
  if (typeof marcarTrabajo === 'function') marcarTrabajo(true);
  try {

  for (let vuelta = 0; vuelta < ASIS_MAX_VUELTAS; vuelta++) {
    const resp = await asisLlamar(estado.mensajes, { perfil, nivel: estado.nivel });
    estado.gasto.vueltas++;
    estado.gasto.entrada += resp.usage?.input_tokens || 0;
    estado.gasto.salida += resp.usage?.output_tokens || 0;
    estado.gasto.cache += resp.usage?.cache_read_input_tokens || 0;
    if (resp.model) estado.gasto.modelo = resp.model;

    estado.mensajes.push({ role: 'assistant', content: resp.content });

    const texto = (resp.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (texto) turno.texto = turno.texto ? `${turno.texto}\n\n${texto}` : texto;

    const llamadas = (resp.content || []).filter(b => b.type === 'tool_use');
    if (resp.stop_reason !== 'tool_use' || !llamadas.length) return;

    llamadas.forEach(l => turno.herramientas.push(etiquetas[l.name] || l.name));
    estado.paso = etiquetas[llamadas[0].name] || 'Buscando en tus datos';
    pintar();

    // En paralelo: si pide tres cosas, se buscan las tres a la vez. Y TODOS
    // los resultados van en UN solo mensaje — mandarlos por separado le
    // enseña al modelo a dejar de pedir cosas en paralelo.
    const resultados = await Promise.all(llamadas.map(l => asisEjecutar(l, herramientas)));
    estado.mensajes.push({ role: 'user', content: resultados });
    estado.paso = 'Armando la respuesta';
    pintar();
  }
  if (!turno.texto) turno.texto = 'Me quedé sin vueltas antes de poder responder. Prueba a preguntarlo más concreto.';

  } finally {
    if (typeof marcarTrabajo === 'function') marcarTrabajo(false);
  }
}

// Estado inicial de una conversación, para no repetirlo en cada panel.
function asisEstadoNuevo(donde = 'chat') {
  return {
    mensajes: [], visible: [], trabajando: false, paso: '', error: null,
    nivel: nivelIaGuardado(donde),
    gasto: { entrada: 0, salida: 0, cache: 0, vueltas: 0, modelo: null },
  };
}
window.asisMotor = asisMotor;
window.asisEstadoNuevo = asisEstadoNuevo;
// asisFormato y asisGastoHTML son declaraciones de función en un script
// clásico, así que ya son globales: el panel de rutinas las llama directo.
// Envolverlas en window.asisFormato = (t) => asisFormato(t) sobrescribía la
// global con la envoltura y se llamaba a sí misma hasta reventar la pila.

const ASIS_ETIQUETAS = {
  listar_clientes: 'Revisando tus clientes',
  ficha_cliente: 'Abriendo la ficha',
  seguimientos: 'Leyendo los seguimientos',
  mediciones: 'Mirando las mediciones',
  pagos: 'Revisando los pagos',
  pendientes: 'Mirando tus pendientes',
  centro_recursos: 'Consultando el Centro de Recursos',
  alimentacion: 'Leyendo su registro de comidas',
};

window.asisPreguntar = async (textoDirecto) => {
  const input = $('#asis-input');
  const pregunta = (textoDirecto ?? input?.value ?? '').trim();
  if (!pregunta || _asis.trabajando) return;
  if (input) input.value = '';

  _asis.error = null;
  _asis.trabajando = true;
  _asis.paso = 'Pensando';
  _asis.mensajes.push({ role: 'user', content: pregunta });
  _asis.visible.push({ rol: 'coach', texto: pregunta });
  _asis.visible.push({ rol: 'asistente', texto: '', herramientas: [] });
  asisPintar();

  const turno = _asis.visible[_asis.visible.length - 1];

  try {
    await asisMotor(_asis, {
      perfil: 'general',
      herramientas: ASIS_HERRAMIENTAS,
      etiquetas: ASIS_ETIQUETAS,
      alRepintar: asisPintar,
    });
  } catch (e) {
    _asis.error = e?.message || String(e);
    turno.texto = turno.texto || '';
  }

  _asis.trabajando = false;
  _asis.paso = '';
  asisPintar();
};

window.asisLimpiar = () => {
  const nivel = _asis.nivel;
  Object.assign(_asis, asisEstadoNuevo('chat'), { nivel });
  asisPintar();
};

// El nivel se elige por pregunta y se recuerda entre sesiones. Para "cuántos
// días entrena Fulano", 'rapido' sobra; los niveles altos valen cuando le
// pides criterio.
window.asisNivel = (nivel) => {
  if (!NIVELES_IA[nivel]) return;
  _asis.nivel = nivel;
  guardarNivelIa('chat', nivel);
  asisPintar();
};

window.asisTeclado = (e) => {
  // Enter envía; Shift+Enter hace salto de línea (lo normal en un chat).
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); asisPreguntar(); }
};

// =====================================================
// PINTADO
// =====================================================
// Se repinta solo la conversación, no la vista entera: así no se pierde lo
// que estés escribiendo en la caja mientras el asistente trabaja.
function asisPintar() {
  const caja = $('#asis-hilo');
  if (!caja) return;
  caja.innerHTML = asisHiloHTML();
  caja.scrollTop = caja.scrollHeight;
  const btn = $('#asis-enviar');
  if (btn) {
    btn.disabled = _asis.trabajando;
    btn.textContent = _asis.trabajando ? '…' : 'Preguntar';
  }
  const gasto = $('#asis-gasto');
  if (gasto) gasto.innerHTML = asisGastoHTML();
  const niveles = $('#asis-niveles');
  if (niveles) niveles.innerHTML = selectorNivelHTML('chat', _asis.nivel, 'asisNivel');
}

// Markdown mínimo: negritas, listas y saltos. Nada de innerHTML crudo — el
// texto pasa por escapeHtml antes de tocar ninguna etiqueta.
function asisFormato(texto) {
  const seguro = escapeHtml(String(texto || ''));
  return seguro
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/^[-•]\s+(.*)$/gm, '<div class="flex gap-2"><span class="text-slate-400">•</span><span>$1</span></div>')
    .replace(/^(\d+)\.\s+(.*)$/gm, '<div class="flex gap-2"><span class="text-slate-400">$1.</span><span>$2</span></div>')
    .replace(/\n/g, '<br>');
}

function asisHiloHTML() {
  if (!_asis.visible.length) {
    return `
      <div class="text-center py-8">
        <img src="/icons/logo.svg" alt="" class="em-logo em-logo-lg mx-auto mb-3" width="56" height="56">
        <div class="text-sm text-slate-500 mb-1">Pregúntale a tus datos.</div>
        <div class="text-xs text-slate-400 mb-4">Lee tus clientes, seguimientos, mediciones, pagos, el registro de comidas y el Centro de Recursos.</div>
        <div class="flex flex-col gap-1.5 max-w-md mx-auto">
          ${ASIS_EJEMPLOS.map(e => `
            <button class="asis-ejemplo" onclick="asisPreguntar(${JSON.stringify(e).replace(/"/g, '&quot;')})">${escapeHtml(e)}</button>
          `).join('')}
        </div>
      </div>`;
  }

  return _asis.visible.map(m => m.rol === 'coach' ? `
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
    </div>`).join('') + (_asis.trabajando ? `
    <div class="flex justify-start mb-3">
      <div class="asis-burbuja asis-ia text-slate-500 text-xs">
        <span class="asis-latido"></span> ${escapeHtml(_asis.paso || 'Pensando')}…
      </div>
    </div>` : '') + (_asis.error ? `
    <div class="card border-l-4 border-red-400 mt-2">
      <div class="font-bold text-slate-800 text-sm mb-1">No pude responder</div>
      <p class="text-xs text-slate-600">${escapeHtml(_asis.error)}</p>
    </div>` : '');
}

function asisGastoHTML(estado = _asis) {
  const g = estado.gasto;
  if (!g.vueltas) return '';
  // Lo cacheado (las instrucciones y la lista de herramientas, que se repiten
  // en cada vuelta) se cobra a una décima parte.
  const p = ASIS_PRECIOS[g.modelo] || ASIS_PRECIO_POR_DEFECTO;
  const usd = ((g.entrada - g.cache) * p.entrada + g.cache * (p.entrada / 10) + g.salida * p.salida) / 1e6;
  const cop = Math.round(usd * (Number(_settings.usd_cop_rate) || 4000));
  const nombre = (NIVELES_IA[estado.nivel]?.etiqueta || '').replace(/^\S+\s/, '') || '—';
  return `Esta conversación · ${nombre} · ${g.vueltas} consulta(s) · `
    + `${(g.entrada + g.salida).toLocaleString('es-CO')} tokens`
    + (g.cache ? ` (${g.cache.toLocaleString('es-CO')} reusados de caché)` : '')
    + ` · ≈ ${cop.toLocaleString('es-CO')} COP (USD ${usd.toFixed(4)})`;
}

routes.asistente = async () => {
  if (!NIVELES_IA[_asis.nivel]) _asis.nivel = nivelIaGuardado('chat');
  view.innerHTML = `
    <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <h2 class="text-lg font-bold text-slate-900">💬 Asistente · pregúntale a tus datos</h2>
        <p class="text-xs text-slate-500">Responde con lo que hay en TU CRM: clientes, seguimientos, mediciones, pagos, lo que comen y lo que han visto en el Centro de Recursos.</p>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="asisLimpiar()">Nueva conversación</button>
    </div>

    <div class="card">
      <div id="asis-hilo" class="asis-hilo"></div>
      <div class="flex gap-2 items-end mt-3">
        <textarea id="asis-input" rows="2" placeholder="Escribe tu pregunta… (Enter envía, Shift+Enter salta de línea)"
                  onkeydown="asisTeclado(event)" class="resize-none"></textarea>
        <button id="asis-enviar" class="btn btn-primary flex-shrink-0" onclick="asisPreguntar()">Preguntar</button>
      </div>
      <div class="mt-3">
        <div id="asis-niveles"></div>
        <div id="asis-gasto" class="text-[11px] text-slate-400 mt-1.5 text-right"></div>
      </div>
    </div>

    <div class="text-[11px] text-slate-400 mt-3 leading-relaxed">
      Tus datos no se guardan en ningún lado: el asistente pide solo lo que la pregunta necesita,
      tu navegador lo busca con tu sesión y se manda únicamente ese resultado. Cada conversación
      empieza de cero. Requiere <strong>ANTHROPIC_API_KEY</strong> en las variables de entorno del
      proyecto en Vercel.
    </div>`;
  asisPintar();
  setTimeout(() => $('#asis-input')?.focus(), 60);
};

// Botón en la barra de secciones, clonando uno existente (mismo truco que
// Nutrición, Composición y Entrenamiento: no hay que tocar index.html).
(function addAsistenteNav() {
  try {
    const anchor = document.querySelector('.nav-item');
    if (!anchor || document.querySelector('.nav-item[data-view="asistente"]')) return;
    const btn = anchor.cloneNode(true);
    btn.dataset.view = 'asistente';
    btn.classList.remove('active');
    btn.textContent = '💬 Asistente';
    // Justo después de Inicio: es la puerta de entrada a todo lo demás.
    anchor.parentNode.insertBefore(btn, anchor.nextSibling);
    btn.addEventListener('click', () => navigate('asistente'));
  } catch (e) { /* si el shell cambia, no rompe nada */ }
})();
