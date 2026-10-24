// =====================================================
// CRM EntrenaConMétodo · SECCIÓN ENTRENAMIENTO
// =====================================================
// Aquí armas las rutinas que después ve el cliente en el módulo de
// entrenamiento. Tres pestañas:
//
//   Ejercicios — la galería/biblioteca. Buscas, filtras y editas fichas.
//   Rutinas    — el constructor: eliges ejercicios de la galería y los
//                metes a la rutina con sus series, reps y descansos.
//   Clientes   — las fases de cada cliente (bloques de X semanas), y el
//                copiar/importar de rutinas entre clientes y entre fases.
//
// ─── CÓMO SE INSTALA ────────────────────────────────────────────────
// Este archivo NO modifica app.js. Se auto-registra: añade su ruta al
// router y clona su propio botón en la barra de navegación, igual que ya
// hace la sección de Nutrición al final de app.js.
//
// Único cambio necesario en index.html — una línea, DESPUÉS de app.js:
//     <script src="/app.js"></script>
//     <script src="/entrenamiento.js"></script>     ← agregar esta
//
// Requiere que el schema.sql del módulo de entrenamiento ya esté corrido
// en este mismo Supabase.
// =====================================================

// ---------- Estado de la sección ----------
const _ent = {
  tab: 'clientes',
  // Galería
  ejercicios: null,
  musculos: null,          // se lee de la tabla `musculos`: una sola fuente
                           // de verdad con el SVG del cuerpo y con la app.
  filtros: { q: '', tipo: '', segmento: '', patron: '', musculo: '', equipo: '', video: '', uso: '' },
  // Constructor
  rutinaId: null,
  rutina: null,
  bloqueDestino: '',       // a qué bloque entran los ejercicios nuevos ('' = sueltos)
  posters: {},             // poster_path → URL firmada (las firmas caducan, se recachean)
  // Clientes
  clienteId: null,
  fases: null,
  subtab: 'calendario',    // calendario | rutinas  (dentro de un cliente)
  faseId: null,            // qué fase se está mirando
  rutinaAbierta: null,     // qué rutina está desplegada en la lista
  // Calendario mensual
  mes: null,               // 'YYYY-MM' que se mira; null = lo decide la fase
  arrastrando: null,       // id de la rutina que va en el aire ahora mismo
  arrastrandoRE: null,     // id del ejercicio que va en el aire en el editor
  // Cachés de la última pintada. El arrastre y el editor de eventos ocurren
  // fuera del render y necesitan saber sobre qué están operando.
  faseCache: null,
  rutinasCache: null,
  eventosCache: null,
};

// ---------- Taxonomía ----------
// Espejo de src/taxonomia.js del repo del módulo. Está duplicado porque el
// CRM es un script plano y no puede importar módulos ES de otro repo. Si
// agregas una categoría, agrégala en AMBOS lados.
const ENT_PATRONES = [
  ['push', 'Empuje'], ['pull', 'Tracción'], ['rodilla', 'Dom. rodilla'],
  ['cadera', 'Dom. cadera'], ['core', 'Core'], ['carry', 'Transporte'],
  ['locomocion', 'Locomoción'],
];
const ENT_SEGMENTOS = [
  ['tren_superior', 'Tren superior'], ['tren_inferior', 'Tren inferior'],
  ['core', 'Core'], ['full_body', 'Cuerpo completo'],
];
const ENT_TIPOS = [
  ['fuerza', 'Fuerza'], ['hipertrofia', 'Hipertrofia'], ['potencia', 'Potencia'],
  ['pliometrico', 'Pliométrico'], ['agilidad', 'Agilidad'], ['movilidad', 'Movilidad'],
  ['estiramiento_pasivo', 'Estiram. pasivo'], ['estiramiento_activo', 'Estiram. activo'],
  ['cardio', 'Cardio'], ['core', 'Core'], ['rehabilitacion', 'Rehabilitación'],
  ['calentamiento', 'Calentamiento'],
];
const ENT_EQUIPO = [
  ['peso_corporal', 'Peso corporal'], ['barra', 'Barra'], ['mancuerna', 'Mancuernas'],
  ['kettlebell', 'Kettlebell'], ['polea', 'Polea'], ['maquina', 'Máquina'],
  ['smith', 'Máquina Smith'],
  ['banda', 'Banda'], ['trx', 'TRX / anillas'], ['balon', 'Balón medicinal'], ['lastre', 'Lastre / chaleco'],
  ['banco', 'Banco'], ['caja', 'Cajón'], ['cuerda', 'Cuerda'],
];
const ENT_LUGARES = [['gym', 'Gimnasio'], ['casa', 'Casa'], ['aire_libre', 'Aire libre']];
const ENT_NIVELES = [['principiante', 'Principiante'], ['intermedio', 'Intermedio'], ['avanzado', 'Avanzado']];
// Tipos de bloque. Un bloque agrupa ejercicios que se hacen juntos; los que
// no están en ninguno van sueltos, con su descanso propio entre series.
const ENT_TIPOS_BLOQUE = [
  ['superserie', 'Superserie'], ['circuito', 'Circuito'],
  ['emom', 'EMOM'], ['amrap', 'AMRAP'],
];
// Cómo se explica cada uno, para no tener que acordarse.
const ENT_AYUDA_BLOQUE = {
  superserie: 'Dos o más ejercicios seguidos sin descanso entre ellos; se descansa al terminar la ronda.',
  circuito:   'Se recorren todas las estaciones y se repite el recorrido tantas vueltas como digas.',
  emom:       'Cada minuto arranca una serie; lo que sobra del minuto es el descanso.',
  amrap:      'Tantas vueltas como se puedan en el tiempo fijado.',
};
// Mismo código que clientes.dias_entreno — no cambiar, cruza con datos vivos.
const ENT_DIAS = [['L','Lun'],['M','Mar'],['X','Mié'],['J','Jue'],['V','Vie'],['S','Sáb'],['D','Dom']];

const entLabel = (lista, id) => (lista.find(x => x[0] === id) || [null, id || '—'])[1];
const entOpciones = (lista, sel, vacio = '—') =>
  `<option value="">${vacio}</option>` +
  lista.map(([id, lab]) => `<option value="${id}" ${sel === id ? 'selected' : ''}>${lab}</option>`).join('');

// ---------- Video ----------
// Dos caminos por ejercicio: link de YouTube (costo cero, el recomendado) o
// archivo subido al bucket `ejercicios` de Storage.

// Acepta las formas en que YouTube reparte un link: youtu.be/ID,
// /watch?v=ID, /embed/ID y /shorts/ID.
function entYoutubeId(url) {
  const s = String(url || '').trim();
  if (!s) return null;
  const patrones = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([A-Za-z0-9_-]{11})/,
    /(?:youtu\.be\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patrones) { const m = s.match(p); if (m) return m[1]; }
  // Si pegó el ID pelado
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  return null;
}

// Miniatura de YouTube sin costo ni request extra a la API.
const entYoutubeThumb = (ref) => ref ? `https://i.ytimg.com/vi/${ref}/mqdefault.jpg` : null;

// ─── La imagen del preview: una de las 4 que da YouTube ─────────────────
// YouTube no deja sacar un cuadro de cualquier segundo: por video da la
// portada y 3 cuadros automáticos (más o menos al 25 %, 50 % y 75 %). El
// coach elige una y queda en `poster_url`, con el id de SU video. Si después
// le cambias el video, esa elección ya no vale (el mismo cuadro de otro video
// es otra imagen): vuelve a la automática hasta que la revises.
// (La app aplica la misma regla en entrenoDatos.js › miniatura.)
const ENT_CUADROS_YT = [['mqdefault', 'Portada'], ['mq1', '¼ del video'], ['mq2', 'Mitad'], ['mq3', '¾ del video']];
const entCuadroYt = (url) => (/^https:\/\/i\.ytimg\.com\/vi\/[^/]+\/(mqdefault|mq[123])\.jpg$/.exec(url || '') || [])[1] || null;
const entUrlCuadro = (ref, cuadro) => ref && cuadro ? `https://i.ytimg.com/vi/${ref}/${cuadro}.jpg` : null;

// La imagen automática: la PORTADA del video (la que ve el cliente en la app).
// Los cuadros ¼, mitad y ¾ los saca YouTube al subir el video y no los
// actualiza: si el canal lo recortó después, muestran otro ejercicio.
const ENT_CUADRO_AUTO = 'mqdefault';
const entIdYtimg = (url) => (/^https:\/\/i\.ytimg\.com\/vi\/([^/]+)\//.exec(url || '') || [])[1] || null;

// Por qué la foto de un ejercicio puede no ser la suya (o null si no hay
// motivo para dudar). Lo usa la revisión de fotos.
function entFotoDudosa(e) {
  if (!e) return null;
  const otro = entIdYtimg(e.poster_url);
  if (otro && otro !== (e.video_fuente === 'youtube' ? e.video_ref : null)) return 'La foto guardada era de otro video';
  if (e.video_fuente === 'youtube' && Number(e.video_inicio_seg) > 0 && !entCuadroYt(e.poster_url))
    return `El video trae más cosas: tu ejercicio empieza en el segundo ${e.video_inicio_seg}`;
  return null;
}

// Lo que se ve de preview en la galería, la rutina y la ficha. Nunca una foto
// de otro video; si el video empieza a mitad (trae varios ejercicios) y nadie
// eligió la imagen, ninguna: un cuadro automático sería de otro ejercicio.
function entMiniatura(e) {
  if (!e) return null;
  const yt = e.video_fuente === 'youtube' && e.video_ref ? e.video_ref : null;
  const idPoster = entIdYtimg(e.poster_url);
  const deOtro = !!idPoster && idPoster !== yt;
  const cuadro = deOtro ? null : entCuadroYt(e.poster_url);
  if (e.poster_url && !deOtro && !cuadro) return e.poster_url;
  if (yt) {
    if (cuadro) return entUrlCuadro(yt, cuadro);
    if (Number(e.video_inicio_seg) > 0) return null;
    return entUrlCuadro(yt, ENT_CUADRO_AUTO);
  }
  return e.poster_path ? _ent.posters[e.poster_path] : null;
}

// Las 4 imágenes para elegir. `accion` es la función que recibe el cuadro.
function entHtmlCuadros(ref, elegido, accion) {
  if (!ref) return '';
  return `
    <div class="grid grid-cols-4 gap-2" data-cuadros>
      ${ENT_CUADROS_YT.map(([k, lab]) => `
        <button type="button" data-cuadro="${k}" ${elegido === k ? 'data-elegido' : ''} onclick="${accion}('${k}')"
                class="block rounded-lg overflow-hidden bg-slate-100 text-left"
                style="border:2px solid ${elegido === k ? '#1D1D1F' : 'transparent'}" title="Usar esta imagen de preview">
          <img src="${entUrlCuadro(ref, k)}" class="w-full object-cover" style="aspect-ratio:16/9" alt="" loading="lazy">
          <span class="block text-[11px] text-center py-0.5 ${elegido === k ? 'font-bold text-slate-900' : 'text-slate-500'}">${lab}${elegido === k ? ' ✓' : ''}</span>
        </button>`).join('')}
    </div>
    <div class="text-[11px] text-slate-400 mt-1">${elegido
      ? 'Esta es la que se ve en la galería, en la rutina y en la app del cliente. Tócala otra vez para volver a la automática.'
      : 'Sin elegir: se usa la automática (en la app nueva, la de la mitad). YouTube solo da estas 4.'}</div>`;
}

// URL firmada para un video subido a Storage. El bucket es privado, así que
// el material no queda indexable; la firma dura una hora.
async function entVideoFirmado(path) {
  if (!path) return null;
  try {
    const { data, error } = await sb.storage.from('ejercicios').createSignedUrl(path, 3600);
    if (error) return null;
    return data?.signedUrl || null;
  } catch (e) { return null; }
}

// ---------- Capa de datos ----------
const entDb = {
  async musculos() {
    if (_ent.musculos) return _ent.musculos;
    const { data } = await sb.from('musculos').select('*').order('orden');
    _ent.musculos = data || [];
    return _ent.musculos;
  },
  async ejercicios(force = false) {
    if (_ent.ejercicios && !force) return _ent.ejercicios;
    const { data, error } = await sb.from('ejercicios').select('*')
      .eq('archivado', false).order('nombre');
    if (error) { toast(error.message); return []; }
    // En orden por el nombre que se ve grande (el inglés de Trainerize).
    _ent.ejercicios = (data || []).sort((a, b) => entNombres(a).grande.localeCompare(entNombres(b).grande, 'es', { sensitivity: 'base' }));
    return _ent.ejercicios;
  },
  async guardarEjercicio(row, id) {
    const enviar = (r) => (id ? sb.from('ejercicios').update(r).eq('id', id) : sb.from('ejercicios').insert(r));
    let { error } = await enviar(row);
    // Sin la migración de videos protegidos todavía: se guarda igual, sin la marca.
    if (error && 'video_elegido_at' in row && /video_elegido_at/.test(error.message || '')) {
      const { video_elegido_at, ...sinMarca } = row;
      ({ error } = await enviar(sinMarca));
    }
    if (error) { toast(error.message); return false; }
    _ent.ejercicios = null;
    return true;
  },
  async archivarEjercicio(id) {
    const { error } = await sb.from('ejercicios').update({ archivado: true }).eq('id', id);
    if (error) { toast(error.message); return false; }
    _ent.ejercicios = null;
    return true;
  },

  // Rutinas. `plantillas()` son las de biblioteca (sin cliente ni fase).
  async plantillas() {
    const { data } = await sb.from('rutinas').select('*')
      .is('cliente_id', null).is('fase_id', null).eq('archivada', false)
      .order('nombre');
    return data || [];
  },
  async rutina(id) {
    const { data: r } = await sb.from('rutinas').select('*').eq('id', id).single();
    if (!r) return null;
    const { data: bloques } = await sb.from('rutina_bloques').select('*')
      .eq('rutina_id', id).order('orden');
    const { data: ejs } = await sb.from('rutina_ejercicios')
      .select('*, ejercicios(*)').eq('rutina_id', id).order('orden');
    return { ...r, bloques: bloques || [], ejercicios: ejs || [] };
  },
  async crearRutina(row) {
    const { data, error } = await sb.from('rutinas').insert(row).select().single();
    if (error) { toast(error.message); return null; }
    return data;
  },
  async actualizarRutina(id, row) {
    const { error } = await sb.from('rutinas').update(row).eq('id', id);
    if (error) toast(error.message);
  },
  async borrarRutina(id) {
    const { error } = await sb.from('rutinas').delete().eq('id', id);
    if (error) toast(error.message);
  },
  // Devuelve la fila creada: el constructor la mete en su lista sin volver a
  // leer la rutina entera.
  async agregarEjercicio(row) {
    const { data, error } = await sb.from('rutina_ejercicios').insert(row).select().single();
    if (error) { toast(error.message); return null; }
    return data || { ...row, id: null };
  },
  // `meta.origen`: cómo se hizo el cambio (agente, alternativas…). Si cambia
  // QUÉ ejercicio es, queda registrado (trazabilidad, ver entRegistrarCambio).
  async actualizarRE(id, row, meta = {}) {
    let antes = null;
    if (row && row.ejercicio_id) {
      antes = (_ent.rutina?.ejercicios || []).find(x => x.id === id);
      antes = antes ? { ejercicio_id: antes.ejercicio_id, rutina_id: antes.rutina_id || _ent.rutina.id, orden: antes.orden, ejercicios: antes.ejercicios } : null;
      if (!antes) {
        const { data } = await sb.from('rutina_ejercicios').select('ejercicio_id, rutina_id, orden').eq('id', id).maybeSingle();
        antes = data || null;
      }
    }
    const { error } = await sb.from('rutina_ejercicios').update(row).eq('id', id);
    if (error) toast(error.message);
    if (!error && antes && antes.ejercicio_id !== row.ejercicio_id) {
      entRegistrarCambio({ reId: id, antes, despues: row.ejercicio_id, origen: meta.origen || 'manual' }).catch(() => {});
    }
    return !error;
  },
  async cambiosDeRutina(rutinaId) {
    const { data, error } = await sb.from('cambios_ejercicio').select('*').eq('rutina_id', rutinaId).order('creado_at', { ascending: false }).limit(200);
    return error ? null : (data || []);
  },
  async quitarRE(id) {
    const { error } = await sb.from('rutina_ejercicios').delete().eq('id', id);
    if (error) toast(error.message);
    return !error;
  },

  // Bloques (superseries, circuitos, EMOM, AMRAP)
  async crearBloque(row) {
    const { data, error } = await sb.from('rutina_bloques').insert(row).select().single();
    if (error) { toast(error.message); return null; }
    return data;
  },
  async actualizarBloque(id, row) {
    const { error } = await sb.from('rutina_bloques').update(row).eq('id', id);
    if (error) toast(error.message);
  },
  // Borrar el bloque NO borra sus ejercicios: la FK es `on delete set null`,
  // así que quedan sueltos en la rutina. Deshacer un circuito no debe
  // costarte volver a elegir los ejercicios.
  async borrarBloque(id) {
    const { error } = await sb.from('rutina_bloques').delete().eq('id', id);
    if (error) toast(error.message);
  },

  // Miniaturas de los videos subidos. Se firman TODAS de un viaje: una
  // galería de 80 ejercicios haría 80 peticiones si se firmara una por una.
  async firmarPosters(paths) {
    const faltan = paths.filter(p => p && !_ent.posters[p]);
    if (faltan.length === 0) return _ent.posters;
    try {
      const { data, error } = await sb.storage.from('ejercicios').createSignedUrls(faltan, 3600);
      if (error || !Array.isArray(data)) return _ent.posters;
      data.forEach(d => { if (d && d.path && d.signedUrl) _ent.posters[d.path] = d.signedUrl; });
    } catch (e) { /* sin miniatura se cae al ícono, no se rompe la galería */ }
    return _ent.posters;
  },

  // Qué ejercicios están usando tus clientes AHORA → Map(id → nº de
  // clientes). Sirve para priorizar videos (filtro «Los que usan mis clientes»).
  //
  // «Ahora» es el CICLO VIGENTE de cada cliente activo: la fase cuyas fechas
  // incluyen hoy, la que está activa o publicada, y si no hay ninguna así, la
  // más reciente. Antes solo contaba las fases en estado «activa», y como
  // casi todas las importadas de Trainerize siguen en borrador, el filtro
  // salía con unos 39 ejercicios cuando tus clientes usan cerca de 200.
  async ejerciciosEnUso(force = false) {
    if (_ent.enUso && !force) return _ent.enUso;
    const enUso = new Map();
    const { data: clis } = await sb.from('clientes').select('id, estado');
    const activos = new Set((clis || []).filter(c => String(c.estado || 'activo').toLowerCase() === 'activo').map(c => c.id));
    const { data: fases } = await sb.from('fases')
      .select('id, cliente_id, estado, fecha_inicio, semanas, visible_cliente, orden, created_at');
    const hoy = fmt.hoy();
    const porCli = new Map();
    (fases || []).filter(f => activos.has(f.cliente_id) && f.estado !== 'archivada')
      .forEach(f => { if (!porCli.has(f.cliente_id)) porCli.set(f.cliente_id, []); porCli.get(f.cliente_id).push(f); });
    const faseCli = new Map();
    porCli.forEach((lista, cli) => {
      const fin = (f) => f.fecha_inicio ? evtSumarDias(f.fecha_inicio, (Number(f.semanas) || 4) * 7 - 1) : null;
      let vigentes = lista.filter(f => f.estado === 'activa' || f.visible_cliente
        || (f.fecha_inicio && f.fecha_inicio <= hoy && fin(f) >= hoy));
      if (!vigentes.length) {
        vigentes = [[...lista].sort((a, b) => String(b.fecha_inicio || '').localeCompare(String(a.fecha_inicio || ''))
          || (b.orden || 0) - (a.orden || 0) || String(b.created_at || '').localeCompare(String(a.created_at || '')))[0]];
      }
      vigentes.forEach(f => faseCli.set(f.id, cli));
    });
    // Por tandas: cientos de ids en una sola URL revientan el largo máximo.
    const tandas = (ids, n = 80) => { const t = []; for (let i = 0; i < ids.length; i += n) t.push(ids.slice(i, i + n)); return t; };
    const rutCli = new Map();
    for (const ids of tandas([...faseCli.keys()])) {
      const { data: ruts } = await sb.from('rutinas').select('id, fase_id, archivada').in('fase_id', ids);
      (ruts || []).filter(r => !r.archivada).forEach(r => rutCli.set(r.id, faseCli.get(r.fase_id)));
    }
    const quien = new Map();
    for (const ids of tandas([...rutCli.keys()])) {
      for (let desde = 0; ; desde += 1000) {
        const { data: res } = await sb.from('rutina_ejercicios').select('rutina_id, ejercicio_id')
          .in('rutina_id', ids).order('id').range(desde, desde + 999);
        (res || []).forEach(re => {
          if (!quien.has(re.ejercicio_id)) quien.set(re.ejercicio_id, new Set());
          quien.get(re.ejercicio_id).add(rutCli.get(re.rutina_id));
        });
        if (!res || res.length < 1000) break;
      }
    }
    quien.forEach((set, id) => enUso.set(id, set.size));
    _ent.enUso = enUso;
    _ent.quienUsa = quien;   // ejercicio → clientes que lo tienen hoy (reporte «Sin video por cliente»)
    return enUso;
  },

  // Qué ejercicios han usado tus clientes ALGUNA VEZ → Set de ids: los de
  // cualquier rutina de cualquier ciclo (también los terminados, archivados y
  // de clientes que ya no están) y los que tienen series registradas. Es el
  // segundo nivel del filtro, detrás de «Ahora».
  async ejerciciosUsados(force = false) {
    if (_ent.usados && !force) return _ent.usados;
    const usados = new Set();
    const paginas = async (consulta, cada) => {
      for (let desde = 0; ; desde += 1000) {
        const { data } = await consulta().range(desde, desde + 999);
        (data || []).forEach(cada);
        if (!data || data.length < 1000) break;
      }
    };
    const fasesCli = new Set();
    await paginas(() => sb.from('fases').select('id, cliente_id').order('id'), f => { if (f.cliente_id) fasesCli.add(f.id); });
    const rutCli = new Set();
    await paginas(() => sb.from('rutinas').select('id, fase_id, cliente_id').order('id'),
      r => { if (r.cliente_id || fasesCli.has(r.fase_id)) rutCli.add(r.id); });
    await paginas(() => sb.from('rutina_ejercicios').select('rutina_id, ejercicio_id').order('id'),
      re => { if (rutCli.has(re.rutina_id)) usados.add(re.ejercicio_id); });
    await paginas(() => sb.from('series_log').select('ejercicio_id').order('id'),
      sl => { if (sl.ejercicio_id) usados.add(sl.ejercicio_id); });
    _ent.usados = usados;
    return usados;
  },

  // Los dos niveles juntos (el filtro y sus contadores necesitan ambos).
  async niveles(force = false) {
    await Promise.all([this.ejerciciosEnUso(force), this.ejerciciosUsados(force)]);
  },

  // Fases
  async fases(clienteId) {
    const q = sb.from('fases').select('*').order('orden');
    const { data } = clienteId ? await q.eq('cliente_id', clienteId) : await q.is('cliente_id', null);
    return clienteId ? entCerrarCiclosPasados(data || []) : (data || []);
  },
  async crearFase(row) {
    const { data, error } = await sb.from('fases').insert(row).select().single();
    if (error) { toast(error.message); return null; }
    return data;
  },
  async actualizarFase(id, row) {
    const { error } = await sb.from('fases').update(row).eq('id', id);
    if (error) toast(error.message);
  },
  async borrarFase(id) {
    const { error } = await sb.from('fases').delete().eq('id', id);
    if (error) toast(error.message);
  },
  // Enviar la fase al cliente (o retirarla). Va por RPC a publicar_fase():
  // así el cambio de `visible_cliente`, la fecha de publicación y el paso de
  // borrador a activa ocurren en UNA transacción del servidor, y no puede
  // quedar a medias. Devuelve cuántas rutinas ve el cliente después.
  async publicarFase(id, visible) {
    const { data, error } = await sb.rpc('publicar_fase', { p_fase_id: id, p_visible: visible });
    if (error) { toastError('No se pudo ' + (visible ? 'enviar' : 'retirar') + ': ' + error.message); return null; }
    return data;
  },
  async rutinasDeFase(faseId) {
    const { data } = await sb.from('rutinas').select('*')
      .eq('fase_id', faseId).eq('archivada', false).order('dia_orden');
    return data || [];
  },

  // Copiar / importar — las funciones SQL del schema. Van por RPC para que
  // el clonado de bloques y ejercicios pase en UNA transacción del servidor
  // y no a medias desde el navegador.
  async copiarRutina(rutinaId, faseDestino, nombreNuevo) {
    const { data, error } = await sb.rpc('copiar_rutina', {
      p_rutina_id: rutinaId,
      p_destino_fase_id: faseDestino || null,
      p_nombre_nuevo: nombreNuevo || null,
    });
    if (error) { toast(error.message); return null; }
    return data;
  },
  async copiarFase(faseId, clienteDestino, fechaInicio, nombreNuevo) {
    const { data, error } = await sb.rpc('copiar_fase', {
      p_fase_id: faseId,
      p_cliente_destino: clienteDestino || null,
      p_fecha_inicio: fechaInicio || null,
      p_nombre_nuevo: nombreNuevo || null,
    });
    if (error) { toast(error.message); return null; }
    return data;
  },
  async duplicarRutina(rutinaId) {
    const { data, error } = await sb.rpc('duplicar_rutina', { p_rutina_id: rutinaId });
    if (error) { toast(error.message); return null; }
    return data;
  },

  // ---- Los ejercicios de TODAS las rutinas de una fase, de un viaje ----
  // Pedirlos rutina por rutina son N peticiones encadenadas; con 5 rutinas la
  // vista tarda medio segundo largo en armarse. Devuelve { rutinaId: [re, …] }.
  async ejerciciosDeRutinas(rutinaIds) {
    if (!rutinaIds || !rutinaIds.length) return {};
    const { data, error } = await sb.from('rutina_ejercicios')
      .select('*, ejercicios(id, nombre, alias, patron, segmento, tipo, equipo, descripcion, musculos_primarios, musculos_secundarios, unilateral)')
      .in('rutina_id', rutinaIds).order('orden');
    if (error) { toast(error.message); return {}; }
    const porRutina = {};
    rutinaIds.forEach(id => { porRutina[id] = []; });
    (data || []).forEach(re => { (porRutina[re.rutina_id] ||= []).push(re); });
    return porRutina;
  },

  // ---- Historial de entreno: lo que el cliente marcó en su app ----
  // Vive en `sesiones` + `series_log` (esquema del módulo de entrenamiento).
  // El peso se guarda por SERIE, no por ejercicio: "60×10, 60×10, 57.5×8" es
  // el dato real, y promediarlo antes de tiempo borra justo la progresión.
  async sesiones(clienteId, { desde = null, limite = 60 } = {}) {
    let q = sb.from('sesiones')
      .select('id, fecha, semana_iso, semana_num, estado, rpe, notas_cliente, duracion_seg, rutina_id, rutinas(nombre)')
      .eq('cliente_id', clienteId)
      .order('fecha', { ascending: false })
      .limit(limite);
    if (desde) q = q.gte('fecha', desde);
    const { data, error } = await q;
    // Si el esquema de entrenamiento no está corrido todavía, no se rompe la
    // vista: se devuelve null y quien llama decide qué decir.
    if (error) return null;
    return data || [];
  },

  // Por TANDAS y por PÁGINAS. Supabase corta cada respuesta en 1.000 filas
  // sin avisar: un cliente constante (60 sesiones × 20 series) ya pasa de eso,
  // y las lecturas se calculaban con la mitad de su historial. Y una lista de
  // cientos de ids en la URL (la Bandeja lee a todos los clientes) revienta el
  // largo máximo de la petición: se parte en tandas de 80.
  async seriesDeSesiones(sesionIds) {
    if (!sesionIds || !sesionIds.length) return [];
    const TANDA = 80, PAGINA = 1000;
    const out = [];
    for (let i = 0; i < sesionIds.length; i += TANDA) {
      const ids = sesionIds.slice(i, i + TANDA);
      for (let desde = 0; ; desde += PAGINA) {
        const { data, error } = await sb.from('series_log')
          .select('id, sesion_id, ejercicio_id, serie_num, reps, peso, unidad, lado, rir, completada, notas, ejercicios(nombre, alias)')
          .in('sesion_id', ids)
          .order('sesion_id').order('serie_num').order('id')
          .range(desde, desde + PAGINA - 1);
        if (error) return out;
        out.push(...(data || []));
        if (!data || data.length < PAGINA) break;
      }
    }
    return out;
  },

  // Las dos funciones del servidor: la última vez que lo hizo, y su récord.
  async ultimasSeries(clienteId, ejercicioId) {
    const { data, error } = await sb.rpc('ultimas_series', {
      p_cliente_id: clienteId, p_ejercicio_id: ejercicioId,
    });
    if (error) return null;
    return data || [];
  },
  async recordEjercicio(clienteId, ejercicioId) {
    const { data, error } = await sb.rpc('record_ejercicio', {
      p_cliente_id: clienteId, p_ejercicio_id: ejercicioId,
    });
    if (error) return null;
    return (data && data[0]) || null;
  },
};

// =====================================================
// VISTA PRINCIPAL
// =====================================================
// Al refrescar la página se vuelve al mismo sitio de Entrenamiento: la
// pestaña, el cliente y su ciclo, el mes del calendario y la rutina que
// estaba abierta en el constructor. Solo en esta pestaña del navegador.
const ENT_RECORDAR = ['tab', 'clienteId', 'subtab', 'faseId', 'rutinaId', 'rutinaAbierta', 'mes', 'mesa', 'volver'];
function entGuardarEstado() {
  try { sessionStorage.setItem('crm:ent', JSON.stringify(Object.fromEntries(ENT_RECORDAR.map(k => [k, _ent[k] ?? null])))); } catch (e) {}
}
(function entRestaurarEstado() {
  try {
    const e = JSON.parse(sessionStorage.getItem('crm:ent') || 'null');
    if (e) ENT_RECORDAR.forEach(k => { if (e[k] != null) _ent[k] = e[k]; });
  } catch (err) {}
})();
window.addEventListener('pagehide', entGuardarEstado);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') entGuardarEstado(); });

routes.entrenamiento = async () => {
  cargando('Cargando entrenamiento…');
  await entDb.musculos();

  // Todo empieza por el cliente: ahí están su calendario, sus rutinas y sus
  // ciclos. Lo demás son herramientas: qué ciclos vencen, las plantillas y
  // la galería para corregir ejercicios.
  const tabs = [
    ['clientes', 'Clientes'],
    ['ciclos', 'Ciclos por vencer'],
    ['rutinas', 'Plantillas de rutinas'],
    ['ejercicios', 'Galería de ejercicios'],
  ];
  // Editando la rutina de un cliente, la pestaña que se ve es la del cliente.
  const pestana = _ent.rutinaId && _ent.volver && _ent.volver.tab === 'clientes' ? 'clientes' : _ent.tab;

  view.innerHTML = `
    <div class="mb-4">
      <h2 class="text-2xl font-bold text-slate-900">Entrenamiento</h2>
      <p class="text-sm text-slate-500">Crear y ajustar: calendario, rutinas, ciclos, plantillas y galería. El seguimiento de la semana está en Seguimiento.</p>
    </div>
    <!-- Aviso de ciclos por vencer (ciclos-vencen.js); vacío si no hay nada. -->
    ${_ent.tab !== 'ciclos' ? '<div id="cic-aviso"></div>' : ''}
    <div class="em-seg mb-5">
      ${tabs.map(([id, lab]) => `
        <button class="chip ${pestana === id ? 'active' : ''}" data-ent-tab="${id}" onclick="entTab('${id}')">${lab}</button>
      `).join('')}
    </div>
    <div id="ent-body"></div>
  `;

  if (typeof cicAviso === 'function' && _ent.tab !== 'ciclos') cicAviso('cic-aviso');
  if (_ent.tab === 'ejercicios') await entVistaEjercicios();
  else if (_ent.tab === 'rutinas') await entVistaRutinas();
  else if (_ent.tab === 'ciclos' && typeof cicVista === 'function') await cicVista();
  else await entVistaClientes();
};

window.entTab = (t) => {
  // Salir de una rutina abierta al cambiar de pestaña (si no, «Clientes»
  // volvería a abrir el constructor).
  if (_ent.rutinaId) { _ent.rutinaId = null; _ent.rutina = null; _ent.volver = null; }
  _ent.tab = t;
  routes.entrenamiento();
};

// =====================================================
// PESTAÑA 1 · GALERÍA DE EJERCICIOS
// =====================================================
// El filtrado corre en memoria, no en la base: una biblioteca de ejercicios
// son cientos de filas, no millones, y así los filtros responden al instante
// mientras escribes en vez de pegarle a Supabase en cada tecla.

function entFiltrar(lista) {
  return entOrdenarPorUso(entFiltrarSinOrden(lista));
}

// Los filtros de tipo, segmento, patrón, músculo y equipo admiten VARIAS
// opciones a la vez (kettlebell + mancuerna, tren superior + inferior): pasa
// el ejercicio que cumpla cualquiera de las marcadas. Un texto suelto (como
// se guardaban antes) cuenta como una sola opción.
const entSel = (v) => Array.isArray(v) ? v : (v ? [v] : []);

function entFiltrarSinOrden(lista) {
  const f = _ent.filtros;
  const q = normalizeName(f.q || '');
  const tipos = entSel(f.tipo), segs = entSel(f.segmento), pats = entSel(f.patron);
  const equipos = entSel(f.equipo), musculos = entSel(f.musculo);
  return lista.filter(e => {
    if (tipos.length && !tipos.includes(e.tipo)) return false;
    if (segs.length && !segs.includes(e.segmento)) return false;
    if (pats.length && !pats.includes(e.patron)) return false;
    if (equipos.length && !(e.equipo || []).some(x => equipos.includes(x))) return false;
    // Todo ejercicio debe llevar video: este filtro saca los que faltan.
    const tieneVideo = (e.video_fuente || 'ninguno') !== 'ninguno';
    if (f.video === 'sin' && tieneVideo) return false;
    if (f.video === 'con' && !tieneVideo) return false;
    // YouTube no lo deja ver fuera de YouTube (entreno-youtube.js).
    if (f.video === 'yt' && !(window.entYtProblema && entYtProblema(e))) return false;
    // Niveles de uso (se ignoran mientras no se hayan cargado):
    //   «clientes» → en el ciclo actual de algún cliente activo;
    //   «antes»    → lo usaron alguna vez, pero hoy nadie lo tiene.
    if (f.uso === 'clientes' && _ent.enUso && !_ent.enUso.has(e.id)) return false;
    if (f.uso === 'antes' && _ent.usados && _ent.enUso
      && (!_ent.usados.has(e.id) || _ent.enUso.has(e.id))) return false;
    //   «analisis» → toda la galería MENOS lo que usan hoy (los usados antes
    //   y los que nunca se han usado): lo que está en revisión de videos.
    if (f.uso === 'analisis' && _ent.enUso && _ent.enUso.has(e.id)) return false;
    //   «duplicados» → fichas marcadas como copia de otra (nombres-en-analisis.sql),
    //   para decidir una a una. Las que usan hoy nunca salen aquí.
    if (f.uso === 'duplicados' && !entEsDuplicado(e)) return false;
    if (musculos.length) {
      const ms = [...(e.musculos_primarios || []), ...(e.musculos_secundarios || [])];
      if (!ms.some(m => musculos.includes(m))) return false;
    }
    if (q) {
      const heno = normalizeName(`${e.nombre} ${e.alias || ''} ${e.busqueda || ''} ${e.descripcion || ''}`);
      if (!heno.includes(q)) return false;
    }
    return true;
  });
}

// Con «Los que usan mis clientes», primero los que usan más clientes: son los
// videos que más gente ve.
function entOrdenarPorUso(lista) {
  if (_ent.filtros.uso !== 'clientes' || !_ent.enUso) return lista;
  return [...lista].sort((a, b) => (_ent.enUso.get(b.id) || 0) - (_ent.enUso.get(a.id) || 0));
}

function entChipMusculos(e) {
  const nombres = (m) => (m || []).map(s => {
    const found = (_ent.musculos || []).find(x => x.slug === s);
    return found ? found.corto : s;
  });
  const prim = nombres(e.musculos_primarios);
  const sec = nombres(e.musculos_secundarios);
  return [
    ...prim.map(n => `<span class="tag tag-green">${escapeHtml(n)}</span>`),
    ...sec.map(n => `<span class="tag tag-gray">${escapeHtml(n)}</span>`),
  ].join(' ');
}

function entIconoVideo(e) {
  if (e.video_fuente === 'youtube') return '<span class="tag tag-red">▶ YouTube</span>' + (window.entYtEtiqueta ? ' ' + entYtEtiqueta(e.video_ref) : '');
  if (e.video_fuente === 'archivo') return '<span class="tag tag-blue">⬆ Subido</span>';
  return '<span class="tag tag-gray">sin video</span>';
}

// Los dos nombres del ejercicio, iguales en TODAS las fichas: `alias` es el
// nombre exacto de Trainerize (inglés) y `nombre` su traducción. Manda el
// inglés, grande y en negro; el español va chico y en gris debajo. Las
// palabras de búsqueda de Trainerize viven aparte, en `busqueda`.
// Sin alias, o si dice lo mismo, solo el que haya.
function entNombres(e) {
  const es = (e && e.nombre) || 'Ejercicio';
  const en = String((e && e.alias) || '').trim();
  if (!en || normalizeName(en) === normalizeName(es)) return { grande: es, chico: '' };
  return { grande: en, chico: es };
}
// ¿La tabla ya tiene la columna `busqueda`? (carga/nombres-ingles-espanol.sql)
// Sin ella, el formulario no la muestra ni la manda: guardar no falla.
function entTieneBusqueda() {
  const una = (_ent.ejercicios || [])[0];
  return !!una && Object.prototype.hasOwnProperty.call(una, 'busqueda');
}
function entNombreChico(e, clase = 'text-[11px] text-slate-400') {
  const c = entNombres(e).chico;
  return c ? `<div class="${clase} truncate">${escapeHtml(c)}</div>` : '';
}

function entTarjetaEjercicio(e, opts = {}) {
  // El preview sale del video que TENGA el ejercicio: la miniatura de
  // YouTube, o el fotograma capturado al subir el archivo. `poster_url` gana
  // si algún día quieres poner una imagen a mano.
  const thumb = entMiniatura(e);
  return `
    <div class="card card-hover p-3">
      <div class="flex gap-3">
        <div class="w-24 h-16 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
          ${thumb ? `<img src="${escapeHtml(thumb)}" class="w-full h-full object-cover" loading="lazy" alt="">`
                  : '<span class="text-2xl">🏋️</span>'}
        </div>
        <div class="min-w-0 flex-1">
          <div class="font-bold text-slate-900 text-sm truncate">${escapeHtml(entNombres(e).grande)}</div>
          ${entNombreChico(e)}
          ${_ent.enUso && _ent.enUso.get(e.id) ? `<span class="tag tag-blue" title="Clientes con este ejercicio en su ciclo actual">👥 ${_ent.enUso.get(e.id)} ${_ent.enUso.get(e.id) === 1 ? 'cliente' : 'clientes'} ahora</span>`
            : _ent.usados && _ent.usados.has(e.id) ? '<span class="tag tag-gray" title="Lo usó algún cliente en un ciclo anterior; hoy nadie lo tiene">🕘 Usado antes</span>' : ''}
          <div class="text-xs text-slate-500 mb-1">
            ${entLabel(ENT_TIPOS, e.tipo)} · ${entLabel(ENT_SEGMENTOS, e.segmento)}
          </div>
          <div class="flex flex-wrap gap-1">${entChipMusculos(e)}</div>
        </div>
      </div>
      ${opts.agregar ? '' : entHtmlDuplicado(e)}
      <div class="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
        <div>${entIconoVideo(e)}</div>
        <div class="flex gap-1">
          <button class="btn btn-ghost btn-sm" onclick="entVerFicha('${e.id}')" title="Ver la ficha como la recibe el cliente">👁 Ficha</button>
          ${opts.agregar ? '' : `<button class="btn btn-ghost btn-sm" onclick="entVideoRapido('${e.id}')" title="Cambiar el video: propuestas o tu link">🎬 Video</button>`}
          ${opts.agregar
            ? `<button class="btn btn-primary btn-sm" onclick="entAgregarARutina('${e.id}')">+ Añadir</button>`
            : `<button class="btn btn-ghost btn-sm" onclick="entEditarEjercicio('${e.id}')">Editar</button>`}
        </div>
      </div>
    </div>
  `;
}

function entBarraFiltros(prefijo = 'flt') {
  const f = _ent.filtros;
  const musOpts = (_ent.musculos || []).map(m => [m.slug, m.corto]);
  return `
    <div class="card mb-4">
      <input id="${prefijo}-q" placeholder="Buscar por nombre…" value="${escapeHtml(f.q)}"
             class="w-full mb-2" oninput="entSetFiltro('q', this.value)">
      <div class="${prefijo === 'cons' ? 'grid grid-cols-2 sm:grid-cols-3' : 'grid grid-cols-2 md:grid-cols-6'} gap-2">
        ${entMulti('tipo', ENT_TIPOS, 'Todo tipo')}
        ${entMulti('segmento', ENT_SEGMENTOS, 'Todo segmento')}
        ${entMulti('patron', ENT_PATRONES, 'Todo patrón')}
        ${entMulti('musculo', musOpts, 'Todo músculo')}
        ${entMulti('equipo', ENT_EQUIPO, 'Todo equipo')}
        <select data-sel="video" onchange="entSetFiltro('video', this.value)">${entOpciones([['sin', 'Sin video'], ['con', 'Con video'], ['yt', 'Con problemas en YouTube']], f.video || '', 'Con y sin video')}</select>
      </div>
      <div class="mt-2">
        <select data-sel="uso" onchange="entSetFiltro('uso', this.value)" title="1º lo que usan hoy, 2º lo que usaron antes, 3º toda la galería">${entUsoOpciones()}</select>
      </div>
      <div id="${prefijo}-niveles">${entNivelesResumen(prefijo === 'cons')}</div>
      <div class="mt-2 flex items-center justify-between">
        <span id="${prefijo}-count" class="text-xs text-slate-500"></span>
        <button class="btn btn-ghost btn-sm" onclick="entLimpiarFiltros()">Limpiar filtros</button>
      </div>
    </div>
  `;
}

// El repintado conserva el foco y el cursor del buscador: sin esto, escribir
// "press" repinta en cada letra y el cursor se va al inicio en la segunda.
// ---------- Niveles de uso: ahora → antes → toda la galería ----------
// Cuántos hay en cada nivel y cuántos de esos siguen sin video, para saber
// exactamente cuánto falta (y empezar por lo que tus clientes ven hoy).
function entNivelesCuenta() {
  const todos = (_ent.ejercicios || []).filter(e => !e.archivado);
  const sinVideo = (e) => (e.video_fuente || 'ninguno') === 'ninguno';
  const de = (lista) => ({ n: lista.length, sin: lista.filter(sinVideo).length });
  const ahora = _ent.enUso ? todos.filter(e => _ent.enUso.has(e.id)) : null;
  const antes = _ent.enUso && _ent.usados ? todos.filter(e => _ent.usados.has(e.id) && !_ent.enUso.has(e.id)) : null;
  const analisis = _ent.enUso ? todos.filter(e => !_ent.enUso.has(e.id)) : null;
  const duplicados = todos.filter(entEsDuplicado);
  return { clientes: ahora && de(ahora), antes: antes && de(antes), analisis: analisis && de(analisis), duplicados: duplicados.length ? { n: duplicados.length, sin: 0 } : null, '': de(todos) };
}

// ---------- Duplicados ----------
// Una ficha en análisis que es el mismo ejercicio que otra (casi siempre una
// que usan hoy tus clientes). La marca la pone carga/nombres-en-analisis.sql
// en `duplicado_de`; aquí se decide: archivarla o «no es duplicado».
function entEsDuplicado(e) {
  return !!(e && e.duplicado_de) && !(_ent.enUso && _ent.enUso.has(e.id));
}
function entHtmlDuplicado(e) {
  if (!entEsDuplicado(e)) return '';
  const o = (_ent.ejercicios || []).find(x => x.id === e.duplicado_de);
  const n = o ? entNombres(o) : null;
  const usan = o && _ent.enUso && _ent.enUso.get(o.id);
  return `
    <div class="mt-2 rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs" data-duplicado="${e.id}">
      <div class="text-amber-900"><b>🔁 Duplicado de</b> ${n ? `<b>${escapeHtml(n.grande)}</b>${n.chico ? ` · ${escapeHtml(n.chico)}` : ''}` : 'una ficha archivada'}${usan ? ` <span class="tag tag-blue">👥 la usan hoy</span>` : ''}</div>
      <div class="flex gap-1 mt-1.5">
        <button class="btn btn-secondary btn-sm" data-dup-archivar onclick="entDupArchivar('${e.id}')" title="Sale de la galería; las rutinas viejas que lo usan no se tocan">Archivar este</button>
        <button class="btn btn-ghost btn-sm" data-dup-no onclick="entDupNoEs('${e.id}')">No es duplicado</button>
      </div>
    </div>`;
}
window.entDupArchivar = async (id) => {
  if (!confirm('¿Archivar este duplicado? Sale de la galería, pero las rutinas que ya lo usan no se tocan.')) return;
  const ok = await entDb.archivarEjercicio(id);
  if (!ok) return;
  toast('Duplicado archivado');
  entVistaEjercicios();
};
window.entDupNoEs = async (id) => {
  const { error } = await sb.from('ejercicios').update({ duplicado_de: null, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return toast(error.message);
  const e = (_ent.ejercicios || []).find(x => x.id === id);
  if (e) e.duplicado_de = null;
  toast('Listo: no es duplicado');
  entVistaEjercicios();
};

function entNivelEtiqueta(nivel, texto) {
  const c = entNivelesCuenta()[nivel];
  return c ? `${texto} (${c.n})` : texto;
}

function entNivelesOpciones() {
  return [
    ['clientes', entNivelEtiqueta('clientes', '👥 1 · Los usan ahora')],
    ['antes', entNivelEtiqueta('antes', '🕘 2 · Los usaron antes (hoy no)')],
    ['analisis', entNivelEtiqueta('analisis', '🔬 En análisis (todo menos lo de hoy)')],
    ...(entNivelesCuenta().duplicados ? [['duplicados', entNivelEtiqueta('duplicados', '🔁 Duplicados (para decidir)')]] : []),
  ];
}

function entUsoOpciones() {
  return entOpciones(entNivelesOpciones(), _ent.filtros.uso || '', entNivelEtiqueta('', '📚 3 · Toda la galería'));
}

// `compacto`: la versión de la columna angosta del constructor.
function entNivelesResumen(compacto = false) {
  const c = entNivelesCuenta();
  if (!c.clientes) return '';
  const f = _ent.filtros;
  const caja = (nivel, icono, titulo, x) => {
    const marcado = (f.uso || '') === nivel && f.video === 'sin';
    if (compacto) return `
      <button type="button" data-nivel="${nivel}" onclick="entIrNivel('${nivel}')"
              class="text-left rounded-lg border px-2 py-1.5 min-w-0 ${marcado ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}"
              title="${titulo}: ver los que faltan">
        <div class="text-[10.5px] text-slate-500 truncate">${icono} ${titulo.replace(/^\d · /, '')}</div>
        <div class="text-xs leading-tight"><b class="text-slate-900">${x.n}</b> · <b class="${x.sin ? 'text-red-600' : 'text-green-600'}">${x.sin ? `${x.sin} sin video` : 'con video'}</b></div>
      </button>`;
    return `
      <button type="button" data-nivel="${nivel}" onclick="entIrNivel('${nivel}')"
              class="text-left rounded-lg border px-3 py-2 ${marcado ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}"
              title="Ver los que faltan de este nivel">
        <div class="text-[11px] text-slate-500">${icono} ${titulo}</div>
        <div class="text-sm"><b class="text-slate-900">${x.n}</b> ejercicios · <b class="${x.sin ? 'text-red-600' : 'text-green-600'}">${x.sin ? `${x.sin} sin video` : 'todos con video'}</b></div>
      </button>`;
  };
  // Duplicados: no cuenta videos, cuenta los que faltan por decidir.
  const cajaDup = (x) => {
    const marcado = (f.uso || '') === 'duplicados';
    return `
      <button type="button" data-nivel="duplicados" onclick="entIrNivel('duplicados')"
              class="text-left rounded-lg border ${compacto ? 'px-2 py-1.5 min-w-0' : 'px-3 py-2'} ${marcado ? 'border-amber-400 bg-amber-50' : 'border-amber-200 hover:bg-amber-50'}"
              title="Fichas repetidas: archívalas o márcalas como «no es duplicado»">
        <div class="${compacto ? 'text-[10.5px] truncate' : 'text-[11px]'} text-slate-500">🔁 Duplicados</div>
        <div class="${compacto ? 'text-xs leading-tight' : 'text-sm'}"><b class="text-slate-900">${x.n}</b> · <b class="text-amber-700">para decidir</b></div>
      </button>`;
  };
  return `
    <div class="mt-2 grid ${compacto ? 'grid-cols-2' : `grid-cols-1 md:grid-cols-2 xl:grid-cols-${c.duplicados ? 5 : 4}`} gap-2" data-niveles>
      ${caja('clientes', '👥', '1 · Los usan ahora', c.clientes)}
      ${c.antes ? caja('antes', '🕘', '2 · Los usaron antes', c.antes) : ''}
      ${c.analisis ? caja('analisis', '🔬', 'En análisis', c.analisis) : ''}
      ${c.duplicados ? cajaDup(c.duplicados) : ''}
      ${caja('', '📚', '3 · Toda la galería', c[''])}
    </div>`;
}

// ---------- Reporte: ejercicios sin video, por cliente ----------
// Con el ciclo vigente de cada cliente activo (el mismo que «Los usan ahora»):
// cuántos clientes ven hoy algún ejercicio sin video, cuáles son, y por cuál
// empezar (el que más clientes tienen). Tocar un ejercicio abre su ficha para
// ponerle el video. Solo lee: no cambia nada.
window.entReporteSinVideo = async () => {
  openModal(modalShell('Ejercicios sin video, por cliente', '<div class="text-sm text-slate-500" data-reporte-cargando>Revisando el ciclo de cada cliente…</div>'), { wide: true });
  await entDb.ejerciciosEnUso(true);
  const ejercicios = _ent.ejercicios || await entDb.ejercicios();
  const { data: clis } = await sb.from('clientes').select('id, nombre, estado');
  const nombreCli = Object.fromEntries((clis || []).map(c => [c.id, c.nombre || 'Sin nombre']));
  const activos = (clis || []).filter(c => String(c.estado || 'activo').toLowerCase() === 'activo');
  const porId = Object.fromEntries((ejercicios || []).map(e => [e.id, e]));
  const sinVideo = (e) => !!e && (e.video_fuente || 'ninguno') === 'ninguno';
  const porCliente = new Map();
  const faltan = [];
  (_ent.quienUsa || new Map()).forEach((clientes, ejId) => {
    const e = porId[ejId];
    if (!sinVideo(e)) return;
    faltan.push({ e, clientes: [...clientes] });
    clientes.forEach(c => { if (!porCliente.has(c)) porCliente.set(c, []); porCliente.get(c).push(e); });
  });
  faltan.sort((a, b) => b.clientes.length - a.clientes.length || entNombres(a.e).grande.localeCompare(entNombres(b.e).grande));
  const filasCli = [...porCliente.entries()].sort((a, b) => b[1].length - a[1].length || String(nombreCli[a[0]]).localeCompare(String(nombreCli[b[0]])));
  const chip = (e) => `<button type="button" class="tag tag-gray" style="cursor:pointer" data-ej-sin-video="${e.id}" onclick="closeModal(); entEditarEjercicio('${e.id}')" title="Abrir la ficha para ponerle el video">${escapeHtml(entNombres(e).grande)}</button>`;
  const cuerpo = !faltan.length
    ? `<div class="rounded-xl bg-green-50 text-green-800 p-4 text-sm" data-reporte-ok>Todos los ejercicios que tus clientes tienen hoy tienen video.</div>`
    : `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5" data-reporte-resumen>
      <div class="rounded-xl bg-slate-50 p-4"><div class="text-xs text-slate-500">Clientes con algún ejercicio sin video</div><div class="text-2xl font-bold text-slate-900"><span data-reporte-clientes>${porCliente.size}</span> <span class="text-base text-slate-500 font-semibold">de ${activos.length} activos</span></div></div>
      <div class="rounded-xl bg-slate-50 p-4"><div class="text-xs text-slate-500">Ejercicios distintos sin video</div><div class="text-2xl font-bold text-red-600" data-reporte-ejercicios>${faltan.length}</div></div>
      <div class="rounded-xl bg-slate-50 p-4"><div class="text-xs text-slate-500">Empieza por</div><div class="text-sm font-semibold text-slate-900 mt-1">${escapeHtml(entNombres(faltan[0].e).grande)}</div><div class="text-xs text-slate-500">lo tienen ${faltan[0].clientes.length} ${faltan[0].clientes.length === 1 ? 'cliente' : 'clientes'}</div></div>
    </div>
    <h4 class="font-bold text-slate-900 mb-2">Por ejercicio · primero los que más clientes tienen</h4>
    <div class="divide-y divide-slate-100 mb-6" data-reporte-por-ejercicio>
      ${faltan.map(x => `
        <div class="py-2 flex items-start gap-3">
          <div class="w-10 shrink-0 text-right font-bold text-slate-900">${x.clientes.length}</div>
          <div class="min-w-0">
            ${chip(x.e)}
            <div class="text-xs text-slate-500 mt-1">${x.clientes.map(c => escapeHtml(nombreCli[c] || '')).sort().join(' · ')}</div>
          </div>
        </div>`).join('')}
    </div>
    <h4 class="font-bold text-slate-900 mb-2">Por cliente</h4>
    <div class="divide-y divide-slate-100" data-reporte-por-cliente>
      ${filasCli.map(([c, lista]) => `
        <div class="py-2">
          <div class="text-sm"><b class="text-slate-900">${escapeHtml(nombreCli[c] || '')}</b> · <span class="text-red-600 font-semibold">${lista.length} sin video</span></div>
          <div class="flex flex-wrap gap-1 mt-1">${lista.map(chip).join('')}</div>
        </div>`).join('')}
    </div>`;
  openModal(modalShell('Ejercicios sin video, por cliente', `
    <p class="text-sm text-slate-600 mb-4">Lo que cada cliente activo tiene en su ciclo de hoy y todavía no tiene video. Toca un ejercicio para abrir su ficha y ponerle el video.</p>
    ${cuerpo}`), { wide: true });
};

// ---------- Reporte: ejercicios que el cliente ve sin «última vez» ----------
// Por cada cliente activo, los ejercicios de su ciclo de hoy que no tienen
// NINGUNA serie suya guardada, y por qué:
//   · «de Trainerize» — la app ya le enseña lo último que hizo allá (la foto
//     del export), así que no le sale vacío;
//   · «en otro ejercicio» — tiene historial, pero en otra ficha con el mismo
//     nombre (un duplicado o la que se cambió): ahí se perdió de vista;
//   · «primera vez» — nunca lo ha hecho, ni aquí ni en lo que se trajo.
// Solo lee: no cambia nada.
const entNormNombre = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

window.entReporteSinHistorial = async () => {
  const titulo = 'Ejercicios sin historial, por cliente';
  openModal(modalShell(titulo, '<div class="text-sm text-slate-500" data-reporte-cargando>Revisando el historial de cada cliente…</div>'), { wide: true });
  await entDb.ejerciciosEnUso(true);
  const ejercicios = _ent.ejercicios || await entDb.ejercicios();
  const porId = Object.fromEntries((ejercicios || []).map(e => [e.id, e]));
  const { data: clis } = await sb.from('clientes').select('id, nombre, estado');
  const nombreCli = Object.fromEntries((clis || []).map(c => [c.id, c.nombre || 'Sin nombre']));

  // Lo que cada cliente tiene hoy (ejercicio → clientes, al revés).
  const hoyDe = new Map();
  (_ent.quienUsa || new Map()).forEach((clientes, ejId) => clientes.forEach(c => {
    if (!hoyDe.has(c)) hoyDe.set(c, new Set());
    hoyDe.get(c).add(ejId);
  }));
  const ids = [...hoyDe.keys()];
  const tandas = (l, n) => { const t = []; for (let i = 0; i < l.length; i += n) t.push(l.slice(i, i + n)); return t; };
  const todo = async (consulta) => {
    const out = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await consulta().range(desde, desde + 999);
      if (error) throw error;
      out.push(...(data || []));
      if (!data || data.length < 1000) return out;
    }
  };

  // Sus sesiones y, de ellas, qué ejercicios tienen series marcadas.
  const clienteDeSesion = {};
  for (const t of tandas(ids, 40)) {
    (await todo(() => sb.from('sesiones').select('id, cliente_id').in('cliente_id', t).order('id')))
      .forEach(x => { clienteDeSesion[x.id] = x.cliente_id; });
  }
  const conHistorial = new Map();   // cliente → Set(ejercicio)
  for (const t of tandas(Object.keys(clienteDeSesion), 150)) {
    (await todo(() => sb.from('series_log').select('sesion_id, ejercicio_id').in('sesion_id', t).eq('completada', true).order('id')))
      .forEach(x => {
        const c = clienteDeSesion[x.sesion_id];
        if (!conHistorial.has(c)) conHistorial.set(c, new Set());
        conHistorial.get(c).add(x.ejercicio_id);
      });
  }

  // Lo último de Trainerize de cada uno, por nombre (si la tabla existe).
  const deTrainerize = new Map();   // cliente → Set(nombre normalizado)
  try {
    for (const t of tandas(ids, 40)) {
      const { data, error } = await sb.from('trainerize_resumen').select('cliente_id, datos').in('cliente_id', t);
      if (error) break;
      (data || []).forEach(f => ((f.datos && f.datos.rutinas) || []).forEach(r => (r.ejercicios || []).forEach(e => {
        if (e.tiempo || !e.fecha || !Array.isArray(e.hist) || !e.hist.length || /⚠/.test(e.ultimo || '')) return;
        if (!deTrainerize.has(f.cliente_id)) deTrainerize.set(f.cliente_id, new Set());
        deTrainerize.get(f.cliente_id).add(entNormNombre(e.alias));
      })));
    }
  } catch (e) { /* sin la foto de Trainerize el reporte sale igual */ }

  const nombresDe = (e) => [e && e.alias, e && e.nombre].map(entNormNombre).filter(Boolean);
  const filas = [];
  const cuenta = { trainerize: 0, otro: 0, nada: 0 };
  hoyDe.forEach((ejs, c) => {
    const tiene = conHistorial.get(c) || new Set();
    const tz = deTrainerize.get(c) || new Set();
    const items = [];
    ejs.forEach(ejId => {
      if (tiene.has(ejId)) return;
      const e = porId[ejId] || { id: ejId, nombre: 'Ejercicio' };
      const mios = nombresDe(e);
      let estado = 'nada', otro = null;
      if (mios.some(n => tz.has(n))) estado = 'trainerize';
      else {
        const gemelo = [...tiene].map(id => porId[id]).find(o => o && o.id !== ejId && nombresDe(o).some(n => mios.includes(n)));
        if (gemelo) { estado = 'otro'; otro = gemelo; }
      }
      cuenta[estado]++;
      items.push({ e, estado, otro });
    });
    if (items.length) filas.push({ c, items });
  });
  const orden = { otro: 0, nada: 1, trainerize: 2 };
  filas.forEach(f => f.items.sort((a, b) => orden[a.estado] - orden[b.estado] || entNombres(a.e).grande.localeCompare(entNombres(b.e).grande)));
  filas.sort((a, b) => b.items.filter(x => x.estado !== 'trainerize').length - a.items.filter(x => x.estado !== 'trainerize').length
    || String(nombreCli[a.c]).localeCompare(String(nombreCli[b.c])));

  const TONO = {
    otro: ['bg-amber-50 text-amber-900', 'en otro ejercicio'],
    nada: ['bg-slate-100 text-slate-700', 'primera vez'],
    trainerize: ['bg-green-50 text-green-800', 'ya ve lo de Trainerize'],
  };
  const item = (x) => `
    <div class="flex flex-wrap items-center gap-2 py-1" data-sin-historial="${x.estado}">
      <button type="button" class="tag tag-gray" style="cursor:pointer" onclick="closeModal(); entEditarEjercicio('${x.e.id}')" title="Abrir la ficha">${escapeHtml(entNombres(x.e).grande)}</button>
      <span class="text-xs rounded-full px-2 py-0.5 ${TONO[x.estado][0]}">${TONO[x.estado][1]}</span>
      ${x.otro ? `<span class="text-xs text-slate-500">su historial está en <b>${escapeHtml(entNombres(x.otro).grande)}</b></span>` : ''}
    </div>`;
  const total = cuenta.trainerize + cuenta.otro + cuenta.nada;
  const cuerpo = !total
    ? `<div class="rounded-xl bg-green-50 text-green-800 p-4 text-sm" data-reporte-ok>Todos los ejercicios que tus clientes tienen hoy ya tienen su «última vez».</div>`
    : `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5" data-reporte-resumen>
      <div class="rounded-xl bg-amber-50 p-4"><div class="text-xs text-amber-900">En otro ejercicio (duplicado o cambiado)</div><div class="text-2xl font-bold text-amber-900" data-cuenta-otro>${cuenta.otro}</div><div class="text-xs text-amber-900/80">Tiene historial, pero en otra ficha: se puede juntar.</div></div>
      <div class="rounded-xl bg-slate-50 p-4"><div class="text-xs text-slate-500">Primera vez</div><div class="text-2xl font-bold text-slate-900" data-cuenta-nada>${cuenta.nada}</div><div class="text-xs text-slate-500">Nunca lo ha registrado: es normal que salga vacío.</div></div>
      <div class="rounded-xl bg-green-50 p-4"><div class="text-xs text-green-800">Ya ve lo último de Trainerize</div><div class="text-2xl font-bold text-green-800" data-cuenta-trainerize>${cuenta.trainerize}</div><div class="text-xs text-green-800/80">No le sale vacío: la app le muestra eso.</div></div>
    </div>
    <div class="divide-y divide-slate-100" data-reporte-por-cliente>
      ${filas.map(f => `
        <div class="py-3">
          <div class="text-sm mb-1"><b class="text-slate-900">${escapeHtml(nombreCli[f.c] || '')}</b>
            <span class="text-slate-500">· ${f.items.length} sin historial en la app</span></div>
          ${f.items.map(item).join('')}
        </div>`).join('')}
    </div>`;
  openModal(modalShell(titulo, `
    <p class="text-sm text-slate-600 mb-4">Los ejercicios del ciclo de hoy de cada cliente activo que no tienen ninguna serie suya guardada, y por qué. Solo lee: no cambia nada.</p>
    ${cuerpo}`), { wide: true });
};

// Un clic en un nivel: ese nivel + «Sin video», lo que falta por buscar.
window.entIrNivel = (nivel) => {
  _ent.filtros.uso = nivel;
  // En duplicados se ven todos, tengan o no video: lo que falta es decidir.
  _ent.filtros.video = nivel === 'duplicados' ? '' : 'sin';
  document.querySelectorAll('select[data-sel="uso"]').forEach(s => { s.value = nivel; });
  document.querySelectorAll('select[data-sel="video"]').forEach(s => { s.value = _ent.filtros.video; });
  entRepintarGaleria();
};

// ---------- Filtro de varias opciones (casillas en un desplegable) ----------
function entMulti(k, opciones, vacio) {
  _ent.multis = _ent.multis || {};
  _ent.multis[k] = { opciones, vacio };
  const sel = entSel(_ent.filtros[k]);
  return `
    <details class="ent-multi" data-multi="${k}">
      <summary class="${sel.length ? 'ent-multi-on' : ''}">${entMultiTexto(k)}</summary>
      <div class="ent-multi-panel">
        ${opciones.map(([v, l]) => `
          <label class="ent-multi-op"><input type="checkbox" value="${escapeHtml(v)}" ${sel.includes(v) ? 'checked' : ''}
                 onchange="entMarcarFiltro('${k}', this.value, this.checked)"><span>${escapeHtml(l)}</span></label>`).join('')}
        <button type="button" class="ent-multi-limpiar" onclick="entLimpiarMulti('${k}')">Quitar selección</button>
      </div>
    </details>`;
}

function entMultiTexto(k) {
  const { opciones, vacio } = _ent.multis[k];
  const sel = entSel(_ent.filtros[k]);
  if (!sel.length) return escapeHtml(vacio);
  const nombre = (v) => (opciones.find(o => o[0] === v) || [v, v])[1];
  return `<span class="truncate">${escapeHtml(nombre(sel[0]))}</span>${sel.length > 1 ? `<b class="ent-multi-n">+${sel.length - 1}</b>` : ''}`;
}

function entPintarMulti(k) {
  const sel = entSel(_ent.filtros[k]);
  document.querySelectorAll(`[data-multi="${k}"]`).forEach(d => {
    const s = d.querySelector('summary');
    s.innerHTML = entMultiTexto(k);
    s.classList.toggle('ent-multi-on', sel.length > 0);
    d.querySelectorAll('input[type=checkbox]').forEach(c => { c.checked = sel.includes(c.value); });
  });
}

window.entMarcarFiltro = (k, v, on) => {
  const sel = entSel(_ent.filtros[k]).filter(x => x !== v);
  if (on) sel.push(v);
  _ent.filtros[k] = sel;
  entPintarMulti(k);
  entRepintarGaleria();
};

window.entLimpiarMulti = (k) => {
  _ent.filtros[k] = [];
  entPintarMulti(k);
  entRepintarGaleria();
};

// Un clic fuera cierra el desplegable abierto (y abrir uno cierra el otro).
document.addEventListener('click', (ev) => {
  document.querySelectorAll('details.ent-multi[open]').forEach(d => { if (!d.contains(ev.target)) d.open = false; });
});

// Cambiar un filtro repinta SOLO la lista de ejercicios: la barra, la
// búsqueda (con el cursor donde estaba) y la rutina no se tocan.
function entRepintarGaleria() {
  if (_ent.tab === 'rutinas' && _ent.rutinaId) {
    return document.getElementById('cons-gal-lista') ? entPintarGaleriaCons() : entPintarConstructor();
  }
  return document.getElementById('flt-lista') ? entPintarListaGaleria() : entVistaEjercicios();
}

window.entSetFiltro = (k, v) => {
  _ent.filtros[k] = v;
  clearTimeout(_ent.tFiltro);
  // Al escribir se espera un instante: no se repinta por cada letra.
  if (k === 'q') { _ent.tFiltro = setTimeout(entRepintarGaleria, 150); return; }
  entRepintarGaleria();
};

window.entLimpiarFiltros = () => {
  _ent.filtros = { q: '', tipo: [], segmento: [], patron: [], musculo: [], equipo: [], video: '', uso: '' };
  const barra = document.getElementById('cons-filtros');
  if (_ent.tab === 'rutinas' && _ent.rutinaId && barra) { barra.innerHTML = entBarraFiltros('cons'); entPintarGaleriaCons(); }
  else entVistaEjercicios();
};

async function entVistaEjercicios() {
  const body = $('#ent-body');
  if (!body) return;
  const todos = await entDb.ejercicios();
  // Lo ya revisado en YouTube: etiqueta y filtro «Con problemas en YouTube».
  if (window.entYtCargar) await entYtCargar().catch(() => {});
  // Los niveles de uso siempre: sus contadores dicen cuántos videos faltan.
  await entDb.niveles();

  body.innerHTML = `
    <div class="flex flex-wrap justify-between items-center gap-2 mb-3">
      <div class="text-sm text-slate-600">${todos.length} ejercicio${todos.length === 1 ? '' : 's'} en la galería</div>
      <div class="flex flex-wrap gap-2">
        <button class="btn btn-secondary btn-sm" onclick="entRevisarFotos()" data-revisar-fotos-btn title="Ver de golpe la foto que ve tu cliente en cada ejercicio y corregir la que no corresponda">🖼 Revisar fotos</button>
        <button class="btn btn-secondary btn-sm" onclick="entReporteSinVideo()" data-reporte-sin-video title="Qué clientes tienen hoy ejercicios sin video, y cuáles son">👥 Sin video por cliente</button>
        <button class="btn btn-secondary btn-sm" onclick="entReporteSinHistorial()" data-reporte-sin-historial title="Qué ejercicios de hoy le salen al cliente sin «última vez», y por qué">📈 Sin historial por cliente</button>
        <button class="btn btn-secondary btn-sm" onclick="entRevisarVideos()" title="Recorre los ejercicios filtrados, uno a uno, con sus propuestas de video">🎬 Revisar videos uno a uno</button>
        <button class="btn btn-secondary btn-sm" onclick="entYtAbrir()" data-revisar-youtube title="Encuentra los videos que YouTube no deja ver fuera de YouTube (tampoco se ven en la app)">Revisar YouTube</button>
        <button class="btn btn-primary btn-sm" onclick="entEditarEjercicio()">+ Nuevo ejercicio</button>
      </div>
    </div>
    ${entBarraFiltros('flt')}
    <div id="flt-lista"></div>
  `;
  await entPintarListaGaleria();
}

// Solo la lista (y su contador): es lo que cambia al filtrar o buscar.
async function entPintarListaGaleria() {
  const seq = _ent.seqGal = (_ent.seqGal || 0) + 1;
  const todos = await entDb.ejercicios();
  const lista = entFiltrar(todos);
  // Firmar solo las miniaturas que se van a ver, no toda la biblioteca.
  await entDb.firmarPosters(lista.map(e => e.poster_path).filter(Boolean));
  const caja = $('#flt-lista');
  if (!caja || seq !== _ent.seqGal) return;
  caja.innerHTML = lista.length === 0 ? `
      <div class="card text-center text-slate-500 py-8">
        ${todos.length === 0
          ? 'La galería está vacía. Crea tu primer ejercicio para empezar a armar rutinas.'
          : 'Ningún ejercicio coincide con esos filtros.'}
      </div>
    ` : `
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        ${lista.map(e => entTarjetaEjercicio(e)).join('')}
      </div>
    `;
  const c = $('#flt-count');
  if (c) c.textContent = `${lista.length} de ${todos.length}`;
  const n = $('#flt-niveles');
  if (n) n.innerHTML = entNivelesResumen();
}

// ---------- Ficha del ejercicio (solo lectura) ----------
// Lo que el cliente va a ver, con la misma disposición: descripción a la
// izquierda y el dibujo del cuerpo al lado. Sirve para revisar la galería sin
// abrir el editor y sin tener que imaginarse cómo queda en el teléfono.
window.entVerFicha = async (id) => {
  const e = (await entDb.ejercicios()).find(x => x.id === id);
  if (!e) return toast('No encuentro ese ejercicio');
  await entDb.musculos();   // llena _ent.musculos para los nombres del dibujo

  const thumb = entMiniatura(e);
  const claves = e.claves_tecnicas || [];
  const figura = typeof figuraMusculos === 'function'
    ? figuraMusculos({
        primarios: e.musculos_primarios || [],
        secundarios: e.musculos_secundarios || [],
        mapa: entMapaMusculos(), alto: 190,
      })
    : '';

  openModal(modalShell(escapeHtml(entNombres(e).grande), `
    ${entNombreChico(e, 'text-sm text-slate-400 -mt-2 mb-2')}
    <div class="text-xs text-slate-500 mb-4">
      ${entLabel(ENT_TIPOS, e.tipo)} · ${entLabel(ENT_SEGMENTOS, e.segmento)} ·
      ${entLabel(ENT_PATRONES, e.patron)} · ${entLabel(ENT_NIVELES, e.nivel)}
    </div>

    ${thumb ? `<img src="${escapeHtml(thumb)}" class="rounded-xl w-full max-w-sm mb-4" alt="">` : ''}

    <div class="grid md:grid-cols-[1fr_auto] gap-5">
      <div>
        <div class="sec-title">Cómo se hace</div>
        ${e.descripcion
          ? `<p class="text-sm text-slate-700 whitespace-pre-line">${escapeHtml(e.descripcion)}</p>`
          : `<p class="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
               ⚠ Este ejercicio no tiene descripción. El cliente lo verá sin instrucciones.
               <button class="btn btn-ghost btn-sm ml-1" onclick="closeModal(); entEditarEjercicio('${e.id}')">Escribirla</button>
             </p>`}

        ${claves.length ? `
          <div class="sec-title mt-4">Claves técnicas</div>
          <ul class="text-sm text-slate-700 list-disc pl-5 space-y-1">
            ${claves.map(c => `<li>${escapeHtml(c)}</li>`).join('')}
          </ul>` : ''}
      </div>

      <div class="md:w-56 md:border-l md:pl-5 border-slate-100">
        ${figura || '<p class="text-xs text-slate-400">Sin músculos asignados.</p>'}
      </div>
    </div>

    ${e.notas_coach ? `
      <div class="sec-title mt-5">Notas de coach <span class="tag tag-gray">no se envía al cliente</span></div>
      <p class="text-sm text-slate-600 whitespace-pre-line">${escapeHtml(e.notas_coach)}</p>` : ''}
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
      <button class="btn btn-primary" onclick="closeModal(); entEditarEjercicio('${e.id}')">Editar</button>`),
    { wide: true });
};

// ---------- Editor de ejercicio (crear / editar) ----------
// Sin id = ficha nueva.
window.entEditarEjercicio = async (id) => {
  const musculos = await entDb.musculos();
  const e = id ? (await entDb.ejercicios()).find(x => x.id === id) || {} : {};

  // Los músculos se agrupan por zona del cuerpo: una lista plana de 30
  // casillas es inservible para elegir rápido.
  const porGrupo = {};
  musculos.forEach(m => { (porGrupo[m.grupo] = porGrupo[m.grupo] || []).push(m); });

  const casillas = (campo, seleccionados) => Object.entries(porGrupo).map(([grupo, ms]) => `
    <div class="mb-2">
      <div class="text-[0.65rem] font-bold uppercase text-slate-400 mb-1">${escapeHtml(grupo)}</div>
      <div class="flex flex-wrap gap-1">
        ${ms.map(m => `
          <label class="tag-pill cursor-pointer ${(seleccionados || []).includes(m.slug) ? 'ring-2 ring-offset-1' : ''}"
                 style="${(seleccionados || []).includes(m.slug) ? 'background:#d1fae5;color:#065f46' : ''}">
            <input type="checkbox" class="ej-${campo}" value="${m.slug}"
                   ${(seleccionados || []).includes(m.slug) ? 'checked' : ''}
                   onchange="this.parentNode.style.cssText = this.checked ? 'background:#d1fae5;color:#065f46' : ''; entRefrescarFigura()"
                   style="margin-right:3px;vertical-align:middle">
            ${escapeHtml(m.corto)}
          </label>`).join('')}
      </div>
    </div>
  `).join('');

  const multiChips = (lista, campo, seleccionados) => lista.map(([id2, lab]) => `
    <label class="tag-pill cursor-pointer" style="${(seleccionados || []).includes(id2) ? 'background:#dbeafe;color:#1e40af' : ''}">
      <input type="checkbox" class="ej-${campo}" value="${id2}"
             ${(seleccionados || []).includes(id2) ? 'checked' : ''}
             onchange="this.parentNode.style.cssText = this.checked ? 'background:#dbeafe;color:#1e40af' : ''"
             style="margin-right:3px;vertical-align:middle">
      ${lab}
    </label>`).join('');

  openModal(modalShell(
    id ? 'Editar ejercicio' : 'Nuevo ejercicio',
    `
    <div class="grid md:grid-cols-2 gap-3 mb-4">
      <div><label>Nombre en inglés (original) · se ve grande</label><input id="ej-alias" value="${escapeHtml(e.alias || '')}" placeholder="Barbell Bench Press"></div>
      <div><label>Nombre en español * · se ve debajo</label><input id="ej-nombre" value="${escapeHtml(e.nombre || '')}" placeholder="Press banca con barra"></div>
      ${entTieneBusqueda() ? `<div class="md:col-span-2"><label>Otras palabras para buscarlo</label><input id="ej-busqueda" value="${escapeHtml(e.busqueda || '')}" placeholder="RDL, bench, pecho plano"></div>` : ''}
    </div>

    <div class="sec-title">Clasificación · son los filtros de la galería</div>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
      <div><label>Tipo</label><select id="ej-tipo">${entOpciones(ENT_TIPOS, e.tipo || 'fuerza', '—')}</select></div>
      <div><label>Segmento</label><select id="ej-segmento">${entOpciones(ENT_SEGMENTOS, e.segmento, '—')}</select></div>
      <div><label>Patrón</label><select id="ej-patron">${entOpciones(ENT_PATRONES, e.patron, '—')}</select></div>
      <div><label>Nivel</label><select id="ej-nivel">${entOpciones(ENT_NIVELES, e.nivel || 'intermedio', '—')}</select></div>
    </div>

    <div class="sec-title">Músculos que trabaja</div>
    <p class="text-xs text-slate-500 mb-2">Los <b>primarios</b> se pintan fuerte en el dibujo del cuerpo que ve el cliente; los secundarios, suave.</p>
    <div class="grid md:grid-cols-[1fr_auto] gap-4 mb-4">
      <div>
        <details class="mb-2" open>
          <summary class="text-xs font-bold text-slate-600 cursor-pointer mb-1">Primarios</summary>
          ${casillas('prim', e.musculos_primarios)}
        </details>
        <details>
          <summary class="text-xs font-bold text-slate-600 cursor-pointer mb-1">Secundarios</summary>
          ${casillas('sec', e.musculos_secundarios)}
        </details>
      </div>
      <!-- El mismo dibujo que verá el cliente, aquí al lado. Marcar músculos
           a ciegas era fácil de equivocar: el error se veía recién en la app. -->
      <div id="ej-figura" class="md:w-52 md:border-l md:pl-4 border-slate-100"></div>
    </div>

    <div class="sec-title">Equipo y lugar</div>
    <div class="flex flex-wrap gap-1 mb-2">${multiChips(ENT_EQUIPO, 'equipo', e.equipo)}</div>
    <div class="flex flex-wrap gap-1 mb-4">${multiChips(ENT_LUGARES, 'lugar', e.lugar)}</div>

    <div class="sec-title">Video</div>
    <div class="mb-4">
      <div class="flex gap-2 mb-2">
        ${[['youtube', '▶ Link de YouTube'], ['archivo', '⬆ Subir archivo'], ['ninguno', 'Sin video']]
          .map(([id2, lab]) => `
            <button type="button" class="chip ${(e.video_fuente || 'ninguno') === id2 ? 'active' : ''}"
                    data-vf="${id2}" onclick="entVideoFuente('${id2}')">${lab}</button>`).join('')}
      </div>
      <div id="ej-video-panel"></div>
      <a class="text-xs underline text-slate-500 mt-1 inline-block" target="_blank" rel="noopener"
         href="https://www.youtube.com/@proetejercicioterapeutico5675/search?query=${encodeURIComponent(e.nombre || '')}">
        Buscar este ejercicio en PROET Ejercicio Terapéutico ↗</a>
    </div>

    <div class="sec-title">Lo que ve el cliente</div>
    <div class="mb-2"><label>Descripción / cómo se hace</label>
      <textarea id="ej-descripcion" rows="3" placeholder="Acuéstate en el banco, pies firmes…">${escapeHtml(e.descripcion || '')}</textarea></div>
    <div class="mb-4"><label>Claves técnicas (una por línea)</label>
      <textarea id="ej-claves" rows="3" placeholder="Escápulas retraídas&#10;Codos a 45°">${escapeHtml((e.claves_tecnicas || []).join('\n'))}</textarea></div>

    <div class="sec-title">Solo para ti</div>
    <div><label>Notas de coach</label>
      <textarea id="ej-notas" rows="2" placeholder="Cuándo progresarlo, cuándo evitarlo…">${escapeHtml(e.notas_coach || '')}</textarea>
      <p class="text-xs text-slate-400 mt-1">Nunca se envía a la app del cliente.</p></div>
    `,
    `${id ? `<button class="btn btn-danger btn-sm" onclick="entArchivarEjercicio('${id}')">Archivar</button>` : ''}
     <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="entGuardarEjercicio(${id ? `'${id}'` : 'null'})">Guardar</button>`
  ), { wide: true });

  // Estado del video vive fuera del DOM: al cambiar de pestaña se repinta el
  // panel y se perderían los valores si se leyeran de los inputs.
  entRefrescarFigura();

  _ent._video = {
    fuente: e.video_fuente || 'ninguno',
    url: e.video_url || '',
    ref: e.video_ref || '',
    path: e.video_path || '',
    poster: e.poster_path || '',
    inicio: e.video_inicio_seg || '',
    // Solo si la imagen guardada es de ESTE video.
    cuadro: entIdYtimg(e.poster_url) === e.video_ref ? entCuadroYt(e.poster_url) : null,
    posterPropio: e.poster_url && !entCuadroYt(e.poster_url) && (!entIdYtimg(e.poster_url) || entIdYtimg(e.poster_url) === e.video_ref) ? e.poster_url : null,
  };
  entPintarPanelVideo();
};

// Mapa slug -> nombre corto para los tooltips de la figura. Sale del mismo
// catálogo `musculos` que llena las casillas, así que no se desincroniza.
function entMapaMusculos() {
  return Object.fromEntries((_ent.musculos || []).map(m => [m.slug, m.corto]));
}

window.entRefrescarFigura = () => {
  const caja = $('#ej-figura');
  if (!caja || typeof figuraMusculos !== 'function') return;
  const marcados = (clase) => $$(`.${clase}:checked`).map(i => i.value);
  const prim = marcados('ej-prim'), sec = marcados('ej-sec');
  caja.innerHTML = (prim.length || sec.length)
    ? figuraMusculos({ primarios: prim, secundarios: sec, mapa: entMapaMusculos(), alto: 170 })
    : '<p class="text-xs text-slate-400 text-center py-8">Marca un músculo y aquí verás el dibujo que recibe el cliente.</p>';
};

window.entVideoFuente = (f) => {
  _ent._video.fuente = f;
  $$('[data-vf]').forEach(b => b.classList.toggle('active', b.dataset.vf === f));
  entPintarPanelVideo();
};

function entPintarPanelVideo() {
  const panel = $('#ej-video-panel');
  if (!panel) return;
  const v = _ent._video;

  if (v.fuente === 'youtube') {
    const ref = v.ref || entYoutubeId(v.url);
    // Buscar el ejercicio en YouTube sin teclear el nombre otra vez. Con una
    // galería de 290 fichas, escribir cada búsqueda es el trabajo que de
    // verdad cansa — y el nombre ya lo tenemos aquí al lado.
    const nom = ($('#ej-nombre')?.value || '').trim();
    const busq = encodeURIComponent(nom ? nom + ' ejercicio técnica' : 'ejercicio técnica');
    panel.innerHTML = `
      ${nom ? `<a href="https://www.youtube.com/results?search_query=${busq}"
           target="_blank" rel="noopener noreferrer"
           class="btn btn-secondary btn-sm" style="margin-bottom:0.5rem">
           🔎 Buscar “${escapeHtml(nom)}” en YouTube</a>` : ''}
      <label>Pega el link de YouTube</label>
      <input id="ej-video-url" value="${escapeHtml(v.url)}"
             placeholder="https://youtu.be/… o https://www.youtube.com/watch?v=…"
             oninput="entValidarYoutube(this.value)">
      <div id="ej-yt-estado" class="text-xs mt-1 ${ref ? 'text-emerald-600' : 'text-slate-400'}">
        ${ref ? `✓ Video reconocido (${escapeHtml(ref)})` : 'Pega el link y se valida solo.'}
      </div>
      <div class="mt-2"><label>Empezar en el segundo (opcional)</label>
        <input id="ej-video-inicio" type="number" min="0" value="${escapeHtml(String(v.inicio || ''))}" placeholder="0"></div>
      <div class="mt-3"><label>Imagen del preview</label>
        <div id="ej-cuadros">${ref ? entHtmlCuadros(ref, v.cuadro, 'entElegirCuadro') : '<div class="text-[11px] text-slate-400">Pega el link y aquí eliges la imagen.</div>'}</div></div>
    `;
  } else if (v.fuente === 'archivo') {
    panel.innerHTML = `
      <label>Sube el video (mp4)</label>
      <input id="ej-video-file" type="file" accept="video/mp4,video/quicktime,video/webm" onchange="entSubirVideo(this)">
      <div id="ej-up-estado" class="text-xs mt-1 ${v.path ? 'text-emerald-600' : 'text-slate-400'}">
        ${v.path ? `✓ Archivo guardado: ${escapeHtml(v.path)}` : 'Demos cortas, no clases completas: el egress de Storage se paga.'}
      </div>
      <div id="ej-up-preview" class="mt-2"></div>
    `;
    // Previsualizar lo subido: la única forma de cachar que se subió el
    // video equivocado antes de que lo vea un cliente. El bucket es privado,
    // así que hace falta una URL firmada.
    if (v.path) {
      entVideoFirmado(v.path).then(url => {
        const prev = $('#ej-up-preview');
        if (!prev) return;
        prev.innerHTML = url
          ? `<video src="${escapeHtml(url)}" controls preload="metadata" class="rounded-lg w-64 max-w-full"></video>`
          : '<span class="text-xs text-slate-400">No pude generar la vista previa.</span>';
      });
    }
  } else {
    panel.innerHTML = '<p class="text-xs text-slate-400">La ficha se mostrará sin reproductor.</p>';
  }
}

// Solo se repinta la fila de imágenes: repintar el panel entero borraría el
// segundo de inicio que estés escribiendo.
window.entElegirCuadro = (k) => {
  const v = _ent._video;
  v.cuadro = v.cuadro === k ? null : k;
  const caja = $('#ej-cuadros');
  if (caja) caja.innerHTML = entHtmlCuadros(v.ref || entYoutubeId(v.url), v.cuadro, 'entElegirCuadro');
};

window.entValidarYoutube = (url) => {
  const v = _ent._video;
  v.url = url;
  const antes = v.ref;
  v.ref = entYoutubeId(url) || '';
  // Otro video: la imagen elegida era del anterior.
  if (v.ref !== antes) { v.cuadro = null; v.posterPropio = null; }
  const cuadros = $('#ej-cuadros');
  if (cuadros) cuadros.innerHTML = v.ref ? entHtmlCuadros(v.ref, v.cuadro, 'entElegirCuadro') : '<div class="text-[11px] text-slate-400">Pega el link y aquí eliges la imagen.</div>';
  const ini = typeof entYoutubeInicio === 'function' ? entYoutubeInicio(url) : null;
  if (ini != null && $('#ej-video-inicio')) $('#ej-video-inicio').value = ini;
  const est = $('#ej-yt-estado');
  if (!est) return;
  est.textContent = v.ref ? `✓ Video reconocido (${v.ref})` : (url ? '✗ No reconozco ese link de YouTube' : 'Pega el link y se valida solo.');
  est.className = `text-xs mt-1 ${v.ref ? 'text-emerald-600' : (url ? 'text-red-500' : 'text-slate-400')}`;
};

window.entSubirVideo = async (input) => {
  const file = input.files && input.files[0];
  if (!file) return;
  const est = $('#ej-up-estado');
  // 60 MB: un tope explícito evita que una subida enorme falle a la mitad
  // sin explicación y se coma el egress.
  const MAX = 60 * 1024 * 1024;
  if (file.size > MAX) {
    if (est) { est.textContent = `✗ El archivo pesa ${(file.size / 1048576).toFixed(1)} MB. Máximo 60 MB.`; est.className = 'text-xs mt-1 text-red-500'; }
    input.value = '';
    return;
  }
  if (est) { est.textContent = 'Subiendo…'; est.className = 'text-xs mt-1 text-slate-500'; }
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from('ejercicios').upload(path, file, {
    cacheControl: '31536000', upsert: false,
  });
  if (error) {
    if (est) {
      est.textContent = /bucket/i.test(error.message)
        ? '✗ Falta crear el bucket `ejercicios` en Supabase → Storage.'
        : `✗ ${error.message}`;
      est.className = 'text-xs mt-1 text-red-500';
    }
    return;
  }
  _ent._video.path = path;
  if (est) { est.textContent = '✓ Video subido. Generando miniatura…'; est.className = 'text-xs mt-1 text-slate-500'; }

  // Miniatura: un fotograma del propio video. Sin esto, los ejercicios con
  // video subido salen con un ícono genérico en la galería y los de YouTube
  // con su imagen — se ve desparejo y cuesta encontrarlos de un vistazo.
  const poster = await entCapturarFotograma(file);
  if (poster) {
    const pPath = path.replace(/\.[^.]+$/, '') + '-poster.jpg';
    const { error: pErr } = await sb.storage.from('ejercicios').upload(pPath, poster, {
      cacheControl: '31536000', upsert: true, contentType: 'image/jpeg',
    });
    if (!pErr) _ent._video.poster = pPath;
  }
  if (est) { est.textContent = `✓ Archivo guardado: ${path}`; est.className = 'text-xs mt-1 text-emerald-600'; }
  entPintarPanelVideo();
};

// Saca un fotograma del segundo 1 (o de la mitad si el clip es más corto) y
// lo devuelve como JPEG. Todo en el navegador: el video no se sube dos veces.
function entCapturarFotograma(file) {
  return new Promise((resolve) => {
    let url;
    const limpiar = () => { try { URL.revokeObjectURL(url); } catch (e) {} };
    try {
      url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'metadata'; v.src = url;
      // Si el navegador no puede decodificar el formato, no vale la pena
      // colgar la subida esperando: sin miniatura se cae al ícono.
      const fallar = () => { limpiar(); resolve(null); };
      const reloj = setTimeout(fallar, 8000);
      v.onerror = fallar;
      v.onloadeddata = () => {
        v.currentTime = Math.min(1, (v.duration || 2) / 2);
      };
      v.onseeked = () => {
        clearTimeout(reloj);
        try {
          const ancho = 480;
          const alto = Math.round(ancho * (v.videoHeight / v.videoWidth || 0.5625));
          const c = document.createElement('canvas');
          c.width = ancho; c.height = alto;
          c.getContext('2d').drawImage(v, 0, 0, ancho, alto);
          c.toBlob((b) => { limpiar(); resolve(b); }, 'image/jpeg', 0.72);
        } catch (e) { fallar(); }
      };
    } catch (e) { limpiar(); resolve(null); }
  });
}

window.entGuardarEjercicio = async (id) => {
  const val = (sel) => { const el = $(sel); return el ? el.value.trim() : ''; };
  const marcados = (clase) => $$(`.${clase}:checked`).map(i => i.value);

  const nombre = val('#ej-nombre');
  if (!nombre) { toast('El ejercicio necesita un nombre'); return; }

  const v = _ent._video;
  // Se guarda SOLO lo que corresponde a la fuente elegida: si cambiaste de
  // archivo a YouTube, el path viejo no debe quedar colgando en la fila.
  const row = {
    nombre,
    alias: val('#ej-alias') || null,
    ...(entTieneBusqueda() ? { busqueda: val('#ej-busqueda') || null } : {}),
    descripcion: val('#ej-descripcion') || null,
    claves_tecnicas: val('#ej-claves').split('\n').map(s => s.trim()).filter(Boolean),
    notas_coach: val('#ej-notas') || null,
    tipo: val('#ej-tipo') || null,
    segmento: val('#ej-segmento') || null,
    patron: val('#ej-patron') || null,
    nivel: val('#ej-nivel') || null,
    musculos_primarios: marcados('ej-prim'),
    musculos_secundarios: marcados('ej-sec'),
    equipo: marcados('ej-equipo'),
    lugar: marcados('ej-lugar'),
    video_fuente: v.fuente,
    video_url: v.fuente === 'youtube' ? (v.url || null) : null,
    video_ref: v.fuente === 'youtube' ? (v.ref || null) : null,
    video_path: v.fuente === 'archivo' ? (v.path || null) : null,
    poster_path: v.fuente === 'archivo' ? (v.poster || null) : null,
    video_inicio_seg: v.fuente === 'youtube' ? (Number(val('#ej-video-inicio')) || null) : null,
    // La imagen del preview elegida (YouTube) o la que ya tuviera puesta a mano.
    poster_url: v.fuente === 'youtube' && v.cuadro ? entUrlCuadro(v.ref, v.cuadro) : (v.posterPropio || null),
    updated_at: new Date().toISOString(),
  };

  // Si el video cambió (o es un ejercicio nuevo con video), queda marcado como
  // ELEGIDO por el coach: ningún SQL de carga lo vuelve a pisar
  // (ver entrenamientoecm/carga/migracion-videos-protegidos.sql).
  const antes = id ? (_ent.ejercicios || []).find(x => x.id === id) : null;
  const campos = ['video_fuente', 'video_ref', 'video_url', 'video_inicio_seg', 'video_path', 'poster_path'];
  const cambioVideo = antes ? campos.some(k => (antes[k] ?? null) !== (row[k] ?? null)) : (id ? true : row.video_fuente !== 'ninguno');
  if (cambioVideo) row.video_elegido_at = new Date().toISOString();

  if (v.fuente === 'youtube' && !v.ref) { toast('El link de YouTube no es válido'); return; }
  if (v.fuente === 'archivo' && !v.path) { toast('Falta subir el archivo de video'); return; }

  const ok = await entDb.guardarEjercicio(row, id);
  if (!ok) return;
  closeModal();
  toast(id ? '✓ Ejercicio actualizado' : '✓ Ejercicio creado');
  // Desde el constructor se vuelve al constructor (sin recargarlo), no a la galería.
  if (_ent.tab === 'rutinas' && _ent.rutinaId && $('#cons-rutina')) { entPintarGaleriaCons(); entRefrescarRutina(); }
  else if (_ent.tab === 'rutinas' && _ent.rutinaId) entPintarConstructor();
  else entVistaEjercicios();
};

window.entArchivarEjercicio = async (id) => {
  // Archivar, no borrar: las rutinas viejas que lo usan siguen enteras.
  if (!confirm('¿Archivar este ejercicio? Sale de la galería, pero las rutinas que ya lo usan no se tocan.')) return;
  const ok = await entDb.archivarEjercicio(id);
  if (!ok) return;
  closeModal();
  toast('Ejercicio archivado');
  entVistaEjercicios();
};

// =====================================================
// PESTAÑA 2 · RUTINAS (biblioteca + constructor)
// =====================================================

// Unir o separar plantillas de la biblioteca (lo nuevo queda como plantilla).
window.entMezclaPlantillas = async () => {
  const plantillas = await entDb.plantillas();
  openModal(modalShell('Unir o separar plantillas', '<div id="mz-modal"></div>',
    '<button class="btn btn-secondary" onclick="closeModal(); routes.entrenamiento()">Cerrar</button>'), { wide: true });
  if (typeof mzAbrir === 'function') mzAbrir({ caja: '#mz-modal', fuentes: plantillas, faseId: null, clienteId: null });
};

async function entVistaRutinas() {
  if (_ent.rutinaId) return entPintarConstructor();

  const body = $('#ent-body');
  if (!body) return;
  const plantillas = await entDb.plantillas();

  body.innerHTML = `
    <div class="flex justify-between items-center mb-3">
      <div>
        <div class="text-sm font-bold text-slate-700">Biblioteca de rutinas</div>
        <div class="text-xs text-slate-500">Plantillas reutilizables. Se copian a la fase de un cliente sin perder el original.</div>
      </div>
      <div class="flex gap-1 flex-wrap">
        ${plantillas.length > 1 ? '<button class="btn btn-secondary btn-sm" data-mezcla-plantillas onclick="entMezclaPlantillas()">🔀 Unir o separar</button>' : ''}
        <button class="btn btn-primary btn-sm" onclick="entNuevaRutina()">+ Nueva rutina</button>
      </div>
    </div>
    ${plantillas.length === 0 ? `
      <div class="card text-center text-slate-500 py-8">
        Todavía no hay plantillas. Crea una y ármala con ejercicios de la galería.
      </div>
    ` : `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        ${plantillas.map(r => `
          <div class="card card-hover">
            <div class="flex justify-between items-start gap-2">
              <div class="min-w-0">
                <div class="font-bold text-slate-900">${escapeHtml(r.nombre)}</div>
                <div class="text-xs text-slate-500">${escapeHtml(r.descripcion || 'Sin descripción')}</div>
              </div>
              <span class="tag tag-violet flex-shrink-0">${entLabel([['fuerza','Fuerza'],['cardio','Cardio'],['movilidad','Movilidad'],['mixta','Mixta'],['descanso_activo','Descanso activo']], r.tipo_sesion)}</span>
            </div>
            <div class="flex gap-1 mt-3 pt-3 border-t border-slate-100">
              <button class="btn btn-dark btn-sm" onclick="entAbrirConstructor('${r.id}')">Construir</button>
              <button class="btn btn-ghost btn-sm" onclick="entDuplicarPlantilla('${r.id}')">Duplicar</button>
              <button class="btn btn-ghost btn-sm" onclick="entBorrarRutina('${r.id}', true)">Borrar</button>
            </div>
          </div>`).join('')}
      </div>
    `}
  `;
}

window.entNuevaRutina = async (faseId, clienteId) => {
  openModal(modalShell('Nueva rutina', `
    <div class="mb-3"><label>Nombre *</label><input id="rt-nombre" placeholder="Día A · Empuje"></div>
    <div class="mb-3"><label>Descripción (la lee el cliente)</label>
      <textarea id="rt-desc" rows="2" placeholder="Sesión de empuje. Calienta 5 min antes."></textarea></div>
    <div class="grid grid-cols-2 gap-3 mb-3">
      <div><label>Tipo de sesión</label>
        <select id="rt-tipo">${entOpciones([['fuerza','Fuerza'],['cardio','Cardio'],['movilidad','Movilidad'],['mixta','Mixta'],['descanso_activo','Descanso activo']], 'fuerza', '—')}</select></div>
      <div><label>Duración estimada (min)</label><input id="rt-dur" type="number" min="0" placeholder="60"></div>
    </div>
    <div><label>Notas de coach (solo tú)</label><textarea id="rt-notas" rows="2"></textarea></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="entCrearRutina(${faseId ? `'${faseId}'` : 'null'}, ${clienteId ? `'${clienteId}'` : 'null'})">Crear y construir</button>`));
};

window.entCrearRutina = async (faseId, clienteId) => {
  const nombre = $('#rt-nombre')?.value.trim();
  if (!nombre) { toast('La rutina necesita un nombre'); return; }
  let dia_orden = 1;
  if (faseId) {
    const hermanas = await entDb.rutinasDeFase(faseId);
    dia_orden = hermanas.length + 1;
  }
  const r = await entDb.crearRutina({
    nombre,
    descripcion: $('#rt-desc')?.value.trim() || null,
    tipo_sesion: $('#rt-tipo')?.value || 'fuerza',
    duracion_estimada_min: Number($('#rt-dur')?.value) || null,
    notas_coach: $('#rt-notas')?.value.trim() || null,
    fase_id: faseId || null,
    cliente_id: clienteId || null,
    dia_orden,
  });
  if (!r) return;
  closeModal();
  entAbrirConstructor(r.id);
};

window.entAbrirConstructor = async (id) => {
  // Desde un cliente, «Volver» regresa a ese cliente (a la misma subpestaña).
  if (!_ent.rutinaId) _ent.volver = _ent.tab === 'clientes' && _ent.clienteId ? { tab: 'clientes', subtab: _ent.subtab } : null;
  _ent.rutinaId = id;
  _ent.tab = 'rutinas';
  // Desde otra sección (la ficha del cliente, el inicio): se entra a
  // Entrenamiento de verdad, para que el menú y el refresco sepan dónde estás.
  if (typeof _currentView !== 'undefined' && _currentView !== 'entrenamiento') return navigate('entrenamiento');
  await routes.entrenamiento();
};

// MESA DE TRABAJO: el constructor a pantalla completa, sin el menú ni la
// cabecera del CRM, con la galería, la rutina y el historial del cliente en
// columnas que se desplazan cada una por su lado. Se queda puesta (también
// al recargar) hasta que la quites.
window.entMesa = (on = !_ent.mesa) => {
  _ent.mesa = !!on;
  $('#cons-wrap')?.classList.toggle('ent-mesa', _ent.mesa);
  document.body.classList.toggle('ent-mesa-on', _ent.mesa);
  const cab = $('#cons-cab');
  if (cab && _ent.rutina) cab.innerHTML = entCabConstructorHTML(_ent.rutina);
};
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && _ent.mesa && $('#cons-wrap') && $('#modal')?.classList.contains('hidden')) entMesa(false);
});

window.entCerrarConstructor = () => {
  document.body.classList.remove('ent-mesa-on');
  _ent.rutinaId = null;
  _ent.rutina = null;
  _ent.bloqueDestino = '';
  if (_ent.volver) { _ent.tab = _ent.volver.tab; if (_ent.volver.subtab) _ent.subtab = _ent.volver.subtab; _ent.volver = null; }
  routes.entrenamiento();
};

// ---------- El constructor ----------
// Tres columnas, cada una con su propio scroll: la galería (de a 2 por fila,
// con los mismos filtros de la pestaña 1), la rutina y la asistencia. Se
// arrastra un ejercicio de la galería a la rutina (o "+ Añadir" lo mete al
// final). En móvil se apilan, galería abajo.
//
// La página se pinta ENTERA una sola vez, al abrir la rutina. Después cada
// cosa repinta solo lo suyo: filtrar o buscar → la lista de la galería;
// añadir, mover, quitar o arrastrar → la rutina (al instante, y se guarda
// detrás). Así no salta ni se pierde el scroll de ninguna columna.
async function entPintarConstructor() {
  const body = $('#ent-body');
  if (!body) return;
  body.innerHTML = '<div class="card">Cargando rutina…</div>';

  const r = await entDb.rutina(_ent.rutinaId);
  if (!r) { toast('No encontré esa rutina'); return entCerrarConstructor(); }
  _ent.rutina = r;
  await entDb.ejercicios();
  await entCargarCambios(r.id);

  // Contexto: si la rutina vive en la fase de un cliente, decirlo — el
  // riesgo real es editar la rutina equivocada creyendo que es la plantilla.
  let contexto = 'Plantilla de biblioteca';
  if (r.fase_id) {
    const { data: f } = await sb.from('fases').select('nombre, cliente_id').eq('id', r.fase_id).single();
    if (f) {
      const cli = (await db.clientes.list()).find(c => c.id === f.cliente_id);
      contexto = `${cli ? escapeHtml(cli.nombre) : 'Cliente'} · ${escapeHtml(f.nombre)}`;
    }
  }
  _ent.consContexto = contexto;
  await entDb.firmarPosters(r.ejercicios.map(x => x.ejercicios?.poster_path).filter(Boolean));

  body.innerHTML = `
    <div id="cons-wrap" class="${_ent.mesa ? 'ent-mesa' : ''}">
    <div id="cons-cab">${entCabConstructorHTML(r)}</div>

    <div class="ent-mesa-grid ${r.cliente_id ? '' : 'ent-mesa-sin-asi'} grid lg:grid-cols-2 ${r.cliente_id ? 'xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px]' : ''} gap-4 items-start">
      <div class="order-2 lg:order-1 ent-col" id="cons-col-gal">
        <div class="text-sm font-bold text-slate-700 mb-2">Galería · arrástralo a la rutina o toca “+ Añadir”</div>
        <div id="cons-destino">${entDestinoHTML(r)}</div>
        <div id="cons-filtros">${entBarraFiltros('cons')}</div>
        <div id="cons-gal-lista" class="grid grid-cols-2 gap-2 max-h-[70vh] overflow-y-auto pr-1 lg:max-h-none lg:overflow-visible lg:pr-0"></div>
      </div>

      <div class="order-1 lg:order-2 ent-col" id="cons-col-rutina">
        <div class="text-sm font-bold text-slate-700 mb-2">La rutina</div>
        <div id="cons-rutina">${entRenderRutina(r)}</div>
      </div>

      ${r.cliente_id ? `
        <!-- Asistencia: su historial al lado (entreno-asistencia.js), con el
             agente de rutinas arriba (asistente-rutinas.js), que ya sabe qué
             rutina está abierta. -->
        <div id="asi-panel" class="order-3 lg:col-span-2 xl:col-span-1 ent-col-xl">
          <div id="rut-panel" class="mb-3"></div>
          <div id="asi-contenido"><div class="card text-xs text-slate-400">Leyendo su historial…</div></div>
        </div>` : ''}
    </div>
    </div>
  `;
  await entPintarGaleriaCons();
  entLeerTiempoReal(r);
  if (r.cliente_id && typeof rutMontarPanel === 'function') rutMontarPanel();
  if (r.cliente_id && typeof asiMontarConstructor === 'function') asiMontarConstructor(r);
  // Los números de los niveles (ahora / antes) se cargan detrás: no frenan
  // la apertura de la rutina.
  entDb.niveles().then(() => {
    if (!$('#cons-gal-lista')) return;
    document.querySelectorAll('#cons-filtros select[data-sel="uso"]').forEach(x => { x.innerHTML = entUsoOpciones(); });
    entPintarGaleriaCons();
  }).catch(() => {});
}

// =====================================================
// CUÁNTO DURA · estimado mientras la armas
// =====================================================
// Para decidir si quitas o dejas un ejercicio hace falta saber cuánto pesa en
// el reloj. Se cuenta como pasa en el gimnasio, no como en el papel:
//   · cada serie: las reps × el tempo (sin tempo, ~3,5 s por rep: controlado)
//     + ~20 s de prepararse (acomodar el peso, agarrar la barra, respirar);
//     «30s» / «1 min» cuenta ese tiempo; AMRAP ~40 s; «c/lado» ×2;
//   · el descanso entre series (el que pusiste; sin nada, 90 s);
//   · ~75 s de cambio entre un ejercicio y el siguiente (ir a la máquina,
//     cargar discos);
//   · un circuito: cada vuelta recorre todos sus ejercicios (con su descanso
//     entre ejercicios, o ~15 s de cambio) y descansa entre vueltas.
// Si tu cliente ya la hizo, al lado sale lo que tardó de verdad (la mediana).
const ENT_T = { seg_rep: 3.5, prep_serie: 20, descanso: 90, cambio: 75, cambio_circuito: 15, amrap: 40 };

function entSegPorRep(tempo) {
  const t = String(tempo || '').trim();
  if (!t) return ENT_T.seg_rep;
  const partes = t.split(/[-–/:]/).map(x => (/x/i.test(x) ? 1 : Number(x))).filter(n => Number.isFinite(n));
  const suma = partes.reduce((a, n) => a + n, 0);
  return suma > 0 && suma < 20 ? suma : ENT_T.seg_rep;
}

// Segundos de trabajo de UNA serie.
function entSegTrabajo(re) {
  const reps = String(re.reps ?? '').toLowerCase().trim();
  const lados = /c\/?\s*l|lado|pierna|brazo/.test(reps) ? 2 : 1;
  // «2-3 min» → 2,5 min; «30-45 s» → 37 s.
  const prom = (m) => (m[2] ? (Number(m[1].replace(',', '.')) + Number(m[2].replace(',', '.'))) / 2 : Number(m[1].replace(',', '.')));
  const min = reps.match(/(\d+(?:[.,]\d+)?)(?:\s*[-–a]\s*(\d+(?:[.,]\d+)?))?\s*min/);
  if (min) return Math.round(prom(min) * 60) * lados;
  const seg = reps.match(/(\d+)(?:\s*[-–a]\s*(\d+))?\s*(?:s\b|seg|sec|")/);
  if (seg) return Math.round(prom(seg)) * lados;
  if (/amrap|fallo|max/.test(reps)) return ENT_T.amrap;
  const nums = (reps.match(/\d+/g) || []).map(Number).slice(0, 2);
  const n = nums.length ? nums.reduce((a, x) => a + x, 0) / nums.length : 10;
  return Math.max(10, Math.min(120, Math.round(n * entSegPorRep(re.tempo) * lados)));
}

// { total, porRE: { id: seg }, porBloque: { id: seg } } en segundos.
function entEstimarTiempo(r) {
  const porRE = {}, porBloque = {};
  const bloques = Object.fromEntries((r?.bloques || []).map(b => [b.id, b]));
  const tramos = [];
  (r?.ejercicios || []).forEach(re => {
    const ult = tramos[tramos.length - 1];
    const b = re.bloque_id && bloques[re.bloque_id] ? re.bloque_id : null;
    if (b && ult && ult.b === b) ult.items.push(re);
    else tramos.push({ b, items: [re] });
  });
  let total = 0;
  tramos.forEach((t, k) => {
    const cambio = k === 0 ? 0 : ENT_T.cambio;
    if (!t.b) {
      t.items.forEach((re, i) => {
        const series = Math.max(1, Number(re.series) || 1);
        const desc = re.descanso_seg ?? ENT_T.descanso;
        const seg = series * (entSegTrabajo(re) + ENT_T.prep_serie) + (series - 1) * desc + ((k === 0 && i === 0) ? 0 : ENT_T.cambio);
        porRE[re.id] = seg;
        total += seg;
      });
      return;
    }
    const b = bloques[t.b];
    const vueltas = Math.max(1, Number(b.vueltas) || Math.max(...t.items.map(x => Number(x.series) || 1)));
    const entre = b.descanso_entre_seg ?? ENT_T.cambio_circuito;
    const porVuelta = t.items.reduce((a, re) => a + entSegTrabajo(re) + 10, 0) + (t.items.length - 1) * entre;
    const seg = vueltas * porVuelta + (vueltas - 1) * (b.descanso_seg ?? 60) + cambio;
    // Lo de cada ejercicio dentro del circuito: su parte de cada vuelta.
    t.items.forEach(re => { porRE[re.id] = Math.round(vueltas * (entSegTrabajo(re) + 10 + entre)); });
    porBloque[t.b] = (porBloque[t.b] || 0) + seg;
    total += seg;
  });
  return { total, porRE, porBloque };
}

const entMin = (seg) => (seg < 60 ? `${Math.max(1, Math.round(seg))} s` : `${Math.round(seg / 60)} min`);

function entTiempoCabHTML(r) {
  const { total } = entEstimarTiempo(r);
  if (!total) return '';
  const real = _ent.tiempoReal && _ent.tiempoReal.rutinaId === r.id ? _ent.tiempoReal : null;
  const plan = r.duracion_estimada_min;
  return `
    <div class="ent-tiempo" data-tiempo-total title="Series × (reps al tempo + preparación) + descansos + cambios entre ejercicios">
      <span class="ent-tiempo-num">⏱ ≈ ${Math.round(total / 60)} min</span>
      <span class="ent-tiempo-rango">entre ${Math.round(total * 0.9 / 60)} y ${Math.round(total * 1.15 / 60)} min</span>
      ${real ? `<span class="ent-tiempo-real" title="Lo que tardó de verdad (mediana de ${real.n} sesión${real.n === 1 ? '' : 'es'} terminadas)">· real: ~${real.min} min (${real.n} vez${real.n === 1 ? '' : 'es'})</span>` : ''}
      ${plan ? `<span class="ent-tiempo-rango">· pusiste ${plan} min</span>` : ''}
    </div>`;
}

// Repinta solo los tiempos (al cambiar series, reps o descansos no hace falta
// repintar la rutina entera).
function entPintarTiempos() {
  const r = _ent.rutina;
  if (!r) return;
  const t = entEstimarTiempo(r);
  document.querySelectorAll('[data-tiempo-re]').forEach(el => { const s2 = t.porRE[el.dataset.tiempoRe]; el.textContent = s2 ? `≈ ${entMin(s2)}` : ''; });
  document.querySelectorAll('[data-tiempo-bloque]').forEach(el => { const s2 = t.porBloque[el.dataset.tiempoBloque]; el.textContent = s2 ? ` · ≈ ${entMin(s2)}` : ''; });
  const cab = document.querySelector('[data-tiempo-total]');
  if (cab) cab.outerHTML = entTiempoCabHTML(r);
}

// Lo que tardó de verdad: las sesiones terminadas de esta rutina (y de la que
// se copió), sin las que se cerraron solas.
async function entLeerTiempoReal(r) {
  try {
    const ids = [r.id, r.origen_rutina_id].filter(Boolean);
    let { data, error } = await sb.from('sesiones').select('duracion_seg, cerrada_auto').in('rutina_id', ids).eq('estado', 'completada');
    if (error) ({ data } = await sb.from('sesiones').select('duracion_seg').in('rutina_id', ids).eq('estado', 'completada'));
    const mins = (data || []).filter(x => !x.cerrada_auto && x.duracion_seg >= 600 && x.duracion_seg <= 3 * 3600)
      .map(x => x.duracion_seg / 60).sort((a, b) => a - b);
    if (!mins.length) return;
    const m = mins.length % 2 ? mins[(mins.length - 1) / 2] : (mins[mins.length / 2 - 1] + mins[mins.length / 2]) / 2;
    _ent.tiempoReal = { rutinaId: r.id, min: Math.round(m), n: mins.length };
    if (_ent.rutina?.id === r.id) entPintarTiempos();
  } catch (e) { /* sin sesiones, sin real */ }
}

function entCabConstructorHTML(r) {
  // Los que llegarían al cliente sin una sola línea de cómo se hacen. De la
  // galería importada de Trainerize son la mayoría, así que decir cuántos hay
  // y cuáles evita ir fila por fila buscando el triángulo amarillo.
  const sinTexto = r.ejercicios
    .filter(re => !String(re.ejercicios?.descripcion || '').trim())
    .map(re => entNombres(re.ejercicios || {}).grande);
  return `
    <div class="card mb-4">
      <div class="flex justify-between items-start gap-3 flex-wrap">
        <div class="min-w-0">
          <button class="btn btn-ghost btn-sm mb-1" data-volver onclick="entCerrarConstructor()">← ${_ent.volver && _ent.volver.tab === 'clientes' ? 'Volver al cliente' : 'Volver'}</button>
          <div class="font-bold text-lg text-slate-900">${escapeHtml(r.nombre)}</div>
          <div class="text-xs text-slate-500">${_ent.consContexto || ''} · ${r.ejercicios.length} ejercicio${r.ejercicios.length === 1 ? '' : 's'}</div>
          ${entTiempoCabHTML(r)}
          ${sinTexto.length ? `
            <div class="text-xs text-amber-700 mt-1">
              ⚠ ${sinTexto.length} sin descripción: el cliente los verá sin instrucciones
              (${sinTexto.slice(0, 3).map(n => escapeHtml(n)).join(', ')}${sinTexto.length > 3 ? '…' : ''})
            </div>` : ''}
        </div>
        <div class="flex gap-1 flex-wrap">
          <button class="btn ${_ent.mesa ? 'btn-primary' : 'btn-secondary'} btn-sm" data-mesa onclick="entMesa()" title="Toda la pantalla para armarla: galería, rutina y su historial lado a lado (Esc para salir)">${_ent.mesa ? '✕ Salir de la mesa' : '⛶ Mesa de trabajo'}</button>
          <button class="btn btn-ghost btn-sm" onclick="entNuevoBloque()">+ Bloque</button>
          <button class="btn btn-ghost btn-sm" onclick="entEditarDatosRutina()">Editar datos</button>
          <button class="btn btn-ghost btn-sm" onclick="entCopiarRutinaA('${r.id}')">Copiar a…</button>
        </div>
      </div>
    </div>`;
}

function entDestinoHTML(r) {
  if (!r.bloques.length) return '';
  return `
    <div class="card mb-2 flex items-center gap-2 flex-wrap" style="padding:0.7rem 0.9rem">
      <span class="text-xs font-bold text-slate-600">Lo que añada va a:</span>
      <select onchange="entDestino(this.value)" style="width:auto;min-width:150px">
        <option value="" ${_ent.bloqueDestino === '' ? 'selected' : ''}>Sueltos (sin bloque)</option>
        ${r.bloques.map(b => `<option value="${b.id}" ${_ent.bloqueDestino === b.id ? 'selected' : ''}>${escapeHtml(b.nombre || entLabel(ENT_TIPOS_BLOQUE, b.tipo))}</option>`).join('')}
      </select>
    </div>`;
}

// La lista de la galería del constructor (lo único que cambia al filtrar).
async function entPintarGaleriaCons() {
  const seq = _ent.seqGal = (_ent.seqGal || 0) + 1;
  const todos = await entDb.ejercicios();
  const galeria = entFiltrar(todos);
  // Los «No le sirve» de este cliente, al final (con su etiqueta roja).
  const cidNs = _ent.rutina && _ent.rutina.cliente_id;
  if (cidNs && window.nsTiene) galeria.sort((x, y) => (nsTiene(cidNs, x.id) ? 1 : 0) - (nsTiene(cidNs, y.id) ? 1 : 0));
  await entDb.firmarPosters(galeria.map(e => e.poster_path).filter(Boolean));
  const caja = $('#cons-gal-lista');
  if (!caja || seq !== _ent.seqGal) return;
  caja.innerHTML = galeria.length === 0
    ? '<div class="card col-span-2 text-center text-slate-500 py-6 text-sm">Ningún ejercicio con esos filtros.</div>'
    : galeria.map(e => entTarjetaCons(e)).join('');
  const c = $('#cons-count');
  if (c) c.textContent = `${galeria.length} de ${todos.length}`;
  const n = $('#cons-niveles');
  if (n) n.innerHTML = entNivelesResumen(true);
}

// ── Ver el video al tocar la vista previa ──────────────────────────────
// En el constructor, para elegir con criterio: el video del ejercicio en una
// ventana, con sus músculos y, desde la galería, «+ Añadir a la rutina».
const entTieneVideo = (e) => (e?.video_fuente === 'youtube' && !!e.video_ref) || (e?.video_fuente === 'archivo' && !!e.video_path);

// Preview chico de un ejercicio (alternativas del agente y «Cambiar solo los
// ejercicios»): la miniatura con ▶, y al tocarla el video corre AHÍ MISMO.
// Abrir la ventana del video taparía la elección que el coach está haciendo.
function entMiniPreviewHTML(e) {
  if (!e) return '';
  // El ejercicio que viene pegado a la rutina no trae los campos del video.
  e = (_ent.ejercicios || []).find(x => x.id === e.id) || e;
  const foto = entMiniatura(e), video = entTieneVideo(e);
  if (!foto && !video) return '';
  return `<span class="ent-mini-prev${video ? ' ent-foto-video' : ''}" data-mini-prev="${e.id}"${video
    ? ` role="button" tabindex="0" title="Ver el video" onclick="event.stopPropagation(); entMiniPreviewPlay(this, '${e.id}')"` : ''}>
    ${foto ? `<img src="${escapeHtml(foto)}" alt="" loading="lazy" draggable="false">` : ''}${video ? '<span class="ent-play" aria-hidden="true">▶</span>' : ''}</span>`;
}
window.entMiniPreviewPlay = async (el, id) => {
  const e = (_ent.ejercicios || []).find(x => x.id === id)
    || (_ent.rutina?.ejercicios || []).map(x => x.ejercicios).find(x => x && x.id === id);
  if (!e || !entTieneVideo(e)) return;
  el.onclick = (ev) => ev.stopPropagation();
  el.classList.add('reproduciendo');
  if (e.video_fuente === 'youtube') {
    const ini = Number(e.video_inicio_seg) > 0 ? `&start=${Number(e.video_inicio_seg)}` : '';
    el.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(e.video_ref)}?autoplay=1&mute=1&rel=0&playsinline=1${ini}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
  } else {
    const url = await entVideoFirmado(e.video_path);
    el.innerHTML = url ? `<video src="${escapeHtml(url)}" autoplay muted loop playsinline controls></video>` : '<span class="ent-mini-nada">Sin video</span>';
  }
};

window.entVerVideoEj = async (id, { anadir = false } = {}) => {
  const e = (await entDb.ejercicios()).find(x => x.id === id)
    || (_ent.rutina?.ejercicios || []).map(x => x.ejercicios).find(x => x && x.id === id);
  if (!e) return toast('No encuentro ese ejercicio');
  if (!entTieneVideo(e)) return entVerFicha(id);
  await entDb.musculos();
  const n = entNombres(e);
  const prim = (e.musculos_primarios || []).map(m => ((_ent.musculos || []).find(x => x.slug === m) || {}).nombre || m);
  const yaEsta = (_ent.rutina?.ejercicios || []).some(x => x.ejercicio_id === id);
  const reproductor = e.video_fuente === 'youtube'
    ? entReproductor(e.video_ref, e.video_inicio_seg)
    : '<div id="ent-vv-archivo" class="w-full rounded-lg bg-slate-100 text-slate-400 text-sm flex items-center justify-center" style="aspect-ratio:16/9">Cargando video…</div>';
  openModal(modalShell(escapeHtml(n.grande), `
    <div data-video-ej="${e.id}">
      ${n.chico ? `<div class="text-sm text-slate-400 -mt-2 mb-3">${escapeHtml(n.chico)}</div>` : ''}
      ${reproductor}
      <div class="text-xs text-slate-500 mt-3">${entLabel(ENT_TIPOS, e.tipo)} · ${entLabel(ENT_PATRONES, e.patron)} · ${(e.equipo || []).map(x => escapeHtml(x)).join(', ') || 'sin equipo'}</div>
      ${prim.length ? `<div class="text-xs text-emerald-700 mt-1">${escapeHtml(prim.join(' · '))}</div>` : ''}
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal(); entVerFicha('${e.id}')">Ver ficha</button>
     ${anadir && _ent.rutinaId ? (yaEsta
        ? '<span class="text-xs text-slate-500 self-center">Ya está en la rutina</span>'
        : `<button class="btn btn-primary" data-vv-anadir onclick="closeModal(); entAgregarARutina('${e.id}')">+ Añadir a la rutina</button>`) : ''}`),
    { wide: true });
  if (e.video_fuente === 'archivo') {
    const url = await entVideoFirmado(e.video_path);
    const caja = $('#ent-vv-archivo');
    if (caja) caja.outerHTML = url
      ? `<video src="${escapeHtml(url)}" controls autoplay playsinline class="w-full rounded-lg" style="aspect-ratio:16/9;background:#000"></video>`
      : '<div class="text-sm text-slate-500">No pude cargar el video.</div>';
  }
};

// Tarjeta compacta (2 por fila) y arrastrable hacia la rutina.
function entTarjetaCons(e) {
  const thumb = entMiniatura(e);
  const n = _ent.enUso && _ent.enUso.get(e.id);
  const usoTag = n
    ? `<span class="tag tag-blue ent-gal-uso" title="Clientes con este ejercicio en su ciclo actual">👥 ${n}</span>`
    : (_ent.usados && _ent.usados.has(e.id) ? '<span class="tag tag-gray ent-gal-uso" title="Lo usó algún cliente en un ciclo anterior">🕘</span>' : '');
  const prim = (e.musculos_primarios || []).map(m => ((_ent.musculos || []).find(x => x.slug === m) || {}).corto || m);
  return `
    <div class="card card-hover p-2 ent-gal" draggable="true" data-ej="${e.id}"
         ondragstart="entEjDragStart(event)" ondragend="entEjDragEnd(event)" title="Arrástralo a la rutina">
      <div class="ent-gal-foto ent-foto-video" data-ver-video="${e.id}" onclick="entVerVideoEj('${e.id}', { anadir: true })"
           title="${entTieneVideo(e) ? 'Ver el video' : 'Sin video: ver la ficha'}">
        ${thumb ? `<img src="${escapeHtml(thumb)}" loading="lazy" alt="" draggable="false">` : '<span class="text-2xl">🏋️</span>'}
        ${entTieneVideo(e) ? '<span class="ent-play" aria-hidden="true">▶</span>' : ''}
        ${usoTag}
      </div>
      <div class="font-bold text-slate-900 text-[13px] leading-tight ent-2lineas mt-1.5">${escapeHtml(entNombres(e).grande)}</div>
      ${entNombreChico(e)}
      ${window.nsEtiqueta ? nsEtiqueta(e.id, null, { chica: true }) : ''}
      <div class="text-[11px] text-slate-500 truncate">${entLabel(ENT_TIPOS, e.tipo)} · ${entLabel(ENT_SEGMENTOS, e.segmento)}</div>
      ${prim.length ? `<div class="text-[11px] text-emerald-700 truncate">${escapeHtml(prim.join(' · '))}</div>` : ''}
      <div class="flex items-center justify-between gap-1 mt-1.5">
        <div class="min-w-0 whitespace-nowrap">${entIconoVideo(e)}</div>
        <div class="flex gap-1 flex-shrink-0">
          <button class="btn btn-ghost btn-sm" onclick="entVerFicha('${e.id}')" title="Ver la ficha">👁</button>
          <button class="btn btn-ghost btn-sm" data-editar-ej onclick="entEditarEjercicio('${e.id}')" title="Editar el ejercicio (nombre, video, músculos, descripción) sin salir de la rutina">✎</button>
          <button class="btn btn-primary btn-sm" onclick="entAgregarARutina('${e.id}')">+ Añadir</button>
        </div>
      </div>
    </div>`;
}

// Repinta la rutina desde `_ent.rutina` (sin ir a la base). Conserva el
// scroll y los «Más: RIR, tempo, notas» que estuvieran abiertos.
function entRepintarRutina() {
  const r = _ent.rutina;
  const caja = $('#cons-rutina');
  if (!r || !caja) return;
  const abiertos = new Set([...caja.querySelectorAll('.ent-fila details[open]')].map(d => d.closest('.ent-fila')?.dataset.re));
  const col = $('#cons-col-rutina');
  const top = col ? col.scrollTop : 0;
  caja.innerHTML = entRenderRutina(r);
  abiertos.forEach(id => { const d = caja.querySelector(`.ent-fila[data-re="${id}"] details`); if (d) d.open = true; });
  if (col) col.scrollTop = top;
  const cab = $('#cons-cab');
  if (cab) cab.innerHTML = entCabConstructorHTML(r);
  const dest = $('#cons-destino');
  if (dest) dest.innerHTML = entDestinoHTML(r);
}

// Vuelve a leer la rutina de la base y la repinta (sin «Cargando…»).
async function entRefrescarRutina(op = {}) {
  if (!_ent.rutinaId) return;
  if (!$('#cons-rutina')) return entPintarConstructor();
  const r = await entDb.rutina(_ent.rutinaId);
  if (!r) return;
  _ent.rutina = r;
  await entDb.firmarPosters(r.ejercicios.map(x => x.ejercicios?.poster_path).filter(Boolean));
  entRepintarRutina();
  if (op.asistencia) entRefrescarAsistencia();
}

function entRefrescarAsistencia() {
  const caja = $('#asi-panel');
  if (!caja || !_ent.rutina || typeof asiMontarConstructor !== 'function') return;
  const top = caja.scrollTop;
  Promise.resolve(asiMontarConstructor(_ent.rutina)).then(() => { caja.scrollTop = top; });
}

// ---------- Render agrupado de la rutina ----------
// Se recorre en el orden real (`orden`) y se envuelven los tramos SEGUIDOS
// que comparten bloque. Es como se lee un entreno en papel: A1-A2 juntos,
// luego B1-B2. Un ejercicio que se sale de su bloque al moverlo simplemente
// deja de estar en ese tramo — sin estados imposibles ni reordenar dos
// listas a la vez.
// Hueco entre tramos: soltar ahí deja el ejercicio SUELTO en esa posición.
// Es la forma de sacar un ejercicio de un circuito arrastrándolo (si todo
// está en bloques, no hay una fila suelta sobre la que soltarlo). Solo se ve
// mientras se arrastra.
function entHueco(pos, fijo = false) {
  return `<div class="ent-hueco ${fijo ? 'ent-hueco-fijo' : ''}" data-pos="${pos}"
       ondragover="entHuecoDragOver(event)" ondragleave="entHuecoDragLeave(event)" ondrop="entHuecoDrop(event)">
    ${fijo ? 'Rutina vacía. Arrastra aquí ejercicios de la galería, o toca “+ Añadir”.' : 'Suéltalo aquí · queda como ejercicio individual'}</div>`;
}

function entRenderRutina(r) {
  if (r.ejercicios.length === 0 && r.bloques.length === 0) return entHueco(0, true);
  const porId = Object.fromEntries(r.bloques.map(b => [b.id, b]));

  // Partir en tramos por bloque_id consecutivo
  const tramos = [];
  r.ejercicios.forEach((re, i) => {
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && ultimo.bloqueId === (re.bloque_id || null)) ultimo.items.push({ re, i });
    else tramos.push({ bloqueId: re.bloque_id || null, items: [{ re, i }] });
  });

  const total = r.ejercicios.length;
  let html = (total ? entHueco(0) : entHueco(0, true)) + tramos.map(t => {
    const filas = t.items.map(({ re, i }) => entFilaRutina(re, i, total, r.bloques)).join('');
    const fin = t.items[t.items.length - 1].i + 1;
    if (!t.bloqueId || !porId[t.bloqueId]) return `<div class="flex flex-col gap-2">${filas}</div>${entHueco(fin)}`;
    return entEnvolverBloque(porId[t.bloqueId], filas, t.items.length) + entHueco(fin);
  }).join('');

  // Bloques todavía sin ejercicios: si no se pintaran, crearías un circuito
  // y desaparecería hasta meterle algo.
  html += entHistorialCambiosHTML(r);
  const usados = new Set(r.ejercicios.map(e => e.bloque_id).filter(Boolean));
  r.bloques.filter(b => !usados.has(b.id)).forEach(b => {
    html += entEnvolverBloque(b, `<div class="text-xs text-slate-400 py-3 text-center ent-bloque-vacio">
      Bloque vacío — arrastra aquí un ejercicio, o elígelo arriba como destino.</div>`, 0) + '<div class="h-2"></div>';
  });
  return html;
}

function entEnvolverBloque(b, dentro, cuantos) {
  const etq = entLabel(ENT_TIPOS_BLOQUE, b.tipo);
  const partes = [];
  if (b.vueltas) partes.push(`${b.vueltas} vuelta${b.vueltas === 1 ? '' : 's'}`);
  if (b.descanso_entre_seg != null) partes.push(`${b.descanso_entre_seg}s entre ejercicios`);
  if (b.descanso_seg != null) partes.push(`${b.descanso_seg}s entre vueltas`);
  return `
    <div class="rounded-xl ent-bloque" data-bloque="${b.id}"
         ondragover="entBloqueDragOver(event)" ondragleave="entBloqueDragLeave(event)"
         ondrop="entBloqueDrop(event)"
         style="border:1.5px solid #cbd5e1;background:#f8fafc;padding:0.6rem">
      <div class="flex justify-between items-start gap-2 mb-2">
        <div class="min-w-0 flex gap-2">
          ${cuantos ? `<div class="ent-agarre" draggable="true" data-bloque-agarre title="Arrastra para mover el circuito entero"
               ondragstart="entBloqueDragStart(event)" ondragend="entBloqueDragEnd(event)">⠿</div>` : ''}
          <div class="min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="tag tag-violet">${escapeHtml(etq)}</span>
            <span class="font-bold text-sm text-slate-800">${escapeHtml(b.nombre || '')}</span>
          </div>
          <div class="text-xs text-slate-500 mt-0.5">
            ${partes.length ? escapeHtml(partes.join(' · ')) : 'Sin tiempos configurados'}
            ${cuantos ? ` · ${cuantos} ejercicio${cuantos === 1 ? '' : 's'}` : ''}<span class="ent-tiempo-re" data-tiempo-bloque="${b.id}">${cuantos && _ent.rutina ? (s2 => s2 ? ` · ≈ ${entMin(s2)}` : '')(entEstimarTiempo(_ent.rutina).porBloque[b.id]) : ''}</span>
          </div>
          </div>
        </div>
        <div class="flex gap-0.5 flex-shrink-0">
          ${cuantos ? `<button class="btn btn-ghost btn-sm" data-bloque-al-final onclick="entBloqueAlFinal('${b.id}')" title="Mandar el circuito al final de la rutina">⤓</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="entEditarBloque('${b.id}')">Editar</button>
          <button class="btn btn-ghost btn-sm" onclick="entBorrarBloque('${b.id}')">✕</button>
        </div>
      </div>
      <div class="flex flex-col gap-2">${dentro}</div>
    </div>
  `;
}

function entFilaRutina(re, i, total, bloques) {
  const e = re.ejercicios || {};
  // Un ejercicio sin descripción llega al cliente sin ninguna instrucción de
  // cómo hacerlo. Se avisa AQUÍ, al meterlo en la rutina, porque es el único
  // momento en que alguien lo está mirando con la intención de mandárselo.
  const sinTexto = !String(e.descripcion || '').trim();
  // La foto del video manda (es como uno reconoce el ejercicio de un vistazo);
  // el dibujo de músculos queda para los que todavía no tienen video.
  const foto = entMiniatura(e);
  const mini = (!foto && typeof figuraMusculos === 'function')
    ? figuraMusculos({
        primarios: e.musculos_primarios || [], secundarios: e.musculos_secundarios || [],
        mapa: entMapaMusculos(), alto: 54, leyenda: false, cara: 'frente',
      })
    : '';
  return `
    <div class="card p-3 ent-fila" draggable="true" data-re="${re.id}" data-bloque="${re.bloque_id || ''}"
         ondragstart="entReDragStart(event)" ondragend="entReDragEnd(event)"
         ondragover="entReDragOver(event)" ondrop="entReDrop(event)">
      <div class="flex justify-between items-start gap-2 mb-2">
        <div class="flex gap-2 min-w-0">
          <div class="ent-agarre" title="Arrastra para cambiar el orden">⠿</div>
          ${foto ? `<img src="${escapeHtml(foto)}" class="ent-fila-foto" alt="" loading="lazy" draggable="false" data-ver-video="${e.id}"
                         onclick="entVerVideoEj('${e.id}')" title="${entTieneVideo(e) ? 'Ver el video' : 'Ver la ficha'}">` : ''}
          ${mini ? (entTieneVideo(e)
            ? `<div class="ent-fila-fig ent-foto-video" data-ver-video="${e.id}" onclick="entVerVideoEj('${e.id}')" title="Ver el video">${mini}</div>`
            : `<div class="ent-fila-fig">${mini}</div>`) : ''}
          <div class="min-w-0">
            <div class="font-bold text-sm text-slate-900">${i + 1}. ${escapeHtml(entNombres(e).grande)}</div>
            ${entNombreChico(e)}
            <div class="text-xs text-slate-500">${entLabel(ENT_TIPOS, e.tipo)} · ${entChipMusculos(e)}
              <span class="ent-tiempo-re" data-tiempo-re="${re.id}" title="Lo que pesa en el reloj (series, descansos y el cambio al siguiente)">${_ent.rutina ? (s2 => s2 ? `≈ ${entMin(s2)}` : '')(entEstimarTiempo(_ent.rutina).porRE[re.id]) : ''}</span></div>
            ${window.ccSiempreHTML ? ccSiempreHTML(re) : ''}
            ${sinTexto ? `
              <button class="ent-aviso" onclick="entEditarEjercicio('${e.id}')"
                      title="El cliente lo verá sin ninguna instrucción de cómo hacerlo">
                ⚠ Sin descripción · escribirla
              </button>` : ''}
          </div>
        </div>
        <div class="flex gap-0.5 flex-shrink-0">
          ${window.ccBotonHTML && _ent.rutina && _ent.rutina.cliente_id ? ccBotonHTML(re) : ''}
          ${window.nsBotonHTML && _ent.rutina && _ent.rutina.cliente_id ? nsBotonHTML(re) : ''}
          <button class="btn btn-ghost btn-sm ent-alt-btn" data-alternativas onclick="entAlternativas('${re.id}')" title="Alternativas: otro ejercicio parecido en su lugar">⇄<span class="txt"> Alternativas</span></button>
          <button class="btn btn-ghost btn-sm" onclick="entVerFicha('${e.id}')" title="Ver la ficha completa">👁</button>
          <button class="btn btn-ghost btn-sm" ${i === 0 ? 'disabled' : ''} onclick="entMoverRE('${re.id}', -1)">↑</button>
          <button class="btn btn-ghost btn-sm" ${i === total - 1 ? 'disabled' : ''} onclick="entMoverRE('${re.id}', 1)">↓</button>
          <button class="btn btn-ghost btn-sm" data-al-final onclick="entAlFinal('${re.id}')" title="${re.bloque_id ? 'Mandarlo al final de su circuito' : 'Mandarlo al final de la rutina'}">⤓</button>
          <button class="btn btn-ghost btn-sm" onclick="entQuitarRE('${re.id}')">✕</button>
        </div>
      </div>
      ${entCambioDeFila(re)}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div><label class="text-[0.65rem]">Series</label>
          <input type="number" min="1" value="${re.series ?? 3}" onchange="entGuardarRE('${re.id}', 'series', this.value)"></div>
        <div><label class="text-[0.65rem]">Reps</label>
          <input value="${escapeHtml(re.reps || '')}" placeholder="8-10 / AMRAP / 30s"
                 onchange="entGuardarRE('${re.id}', 'reps', this.value)"></div>
        <div><label class="text-[0.65rem]">Peso</label>
          <input value="${escapeHtml(re.peso_objetivo || '')}" placeholder="60 kg / 70%"
                 onchange="entGuardarRE('${re.id}', 'peso_objetivo', this.value)"></div>
        <div><label class="text-[0.65rem]">Descanso (s)</label>
          <input type="number" min="0" value="${re.descanso_seg ?? 90}" onchange="entGuardarRE('${re.id}', 'descanso_seg', this.value)"></div>
      </div>
      <details class="mt-2">
        <summary class="text-xs text-slate-500 cursor-pointer">Más: RIR, tempo, notas</summary>
        <div class="grid grid-cols-2 gap-2 mt-2">
          <div><label class="text-[0.65rem]">RIR</label>
            <input type="number" min="0" max="5" value="${re.rir ?? ''}" onchange="entGuardarRE('${re.id}', 'rir', this.value)"></div>
          <div><label class="text-[0.65rem]">Tempo</label>
            <input value="${escapeHtml(re.tempo || '')}" placeholder="3-1-1-0" onchange="entGuardarRE('${re.id}', 'tempo', this.value)"></div>
        </div>
        <div class="mt-2"><label class="text-[0.65rem]">Nota para el cliente</label>
          <input value="${escapeHtml(re.notas || '')}" onchange="entGuardarRE('${re.id}', 'notas', this.value)"></div>
        ${(bloques && bloques.length) ? `
          <div class="mt-2"><label class="text-[0.65rem]">Bloque</label>
            <select onchange="entMoverABloque('${re.id}', this.value)">
              <option value="" ${!re.bloque_id ? 'selected' : ''}>Suelto</option>
              ${bloques.map(b => `<option value="${b.id}" ${re.bloque_id === b.id ? 'selected' : ''}>${escapeHtml(b.nombre || entLabel(ENT_TIPOS_BLOQUE, b.tipo))}</option>`).join('')}
            </select></div>` : ''}
      </details>
    </div>
  `;
}

// Lo que trae un ejercicio recién puesto, para que el coach solo retoque:
//   · fuerza y afines → 4 series · 6-12 reps · 50 s de descanso
//   · los que van por tiempo (cardio, movilidad, estiramientos, calenta-
//     miento, agilidad) → 4 series · 15-30 s · 30 s de descanso
//   · dentro de un circuito, 1 serie (las vueltas las pone el circuito).
const ENT_POR_TIEMPO = ['cardio', 'movilidad', 'estiramiento_pasivo', 'estiramiento_activo', 'calentamiento', 'agilidad'];
function entValoresPorDefecto(ejercicio, enBloque) {
  const porTiempo = ENT_POR_TIEMPO.includes(String(ejercicio?.tipo || ''));
  return {
    series: enBloque ? 1 : 4,
    reps: porTiempo ? '15-30 s' : '6-12',
    descanso_seg: porTiempo ? 30 : 50,
  };
}

// `donde` = { pos, bloque } cuando llega arrastrado: entra en esa posición y
// en ese bloque (o suelto). Sin `donde`, al final y al bloque elegido arriba.
window.entAgregarARutina = async (ejercicioId, donde = null) => {
  if (!_ent.rutinaId || !_ent.rutina) { toast('Abre una rutina primero'); return; }
  // Con el tag «No le sirve» de este cliente: pregunta antes (tú decides).
  if (window.nsConfirmarUso && _ent.rutina.cliente_id && !nsConfirmarUso(ejercicioId, _ent.rutina.cliente_id)) return;
  const lista = _ent.rutina.ejercicios.slice();
  const pos = donde && donde.pos != null ? Math.max(0, Math.min(donde.pos, lista.length)) : lista.length;
  const bloque = donde ? (donde.bloque || null) : (_ent.bloqueDestino || null);
  const ej = (_ent.ejercicios || []).find(x => x.id === ejercicioId) || null;
  const nuevo = await entDb.agregarEjercicio({
    rutina_id: _ent.rutinaId, ejercicio_id: ejercicioId, orden: pos + 1,
    bloque_id: bloque,
    ...entValoresPorDefecto(ej, !!bloque),
  });
  if (!nuevo) return;
  if (!nuevo.id) return entRefrescarRutina({ asistencia: true });
  nuevo.ejercicios = nuevo.ejercicios || (_ent.ejercicios || []).find(x => x.id === ejercicioId) || {};
  if (nuevo.ejercicios.poster_path) await entDb.firmarPosters([nuevo.ejercicios.poster_path]);
  lista.splice(pos, 0, nuevo);
  await entGuardarOrden(lista);
  const fila = document.querySelector(`#cons-rutina .ent-fila[data-re="${nuevo.id}"]`);
  if (fila) { fila.classList.add('ent-fila-nueva'); fila.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  entRefrescarAsistencia();
};

// Los campos numéricos vacíos deben guardar NULL, no 0: "sin RIR definido" y
// "RIR 0" (al fallo) son cosas distintas.
window.entGuardarRE = async (id, campo, valor) => {
  const numericos = ['series', 'descanso_seg', 'rir'];
  const v = numericos.includes(campo)
    ? (String(valor).trim() === '' ? null : Number(valor))
    : (String(valor).trim() === '' ? null : valor);
  await entDb.actualizarRE(id, { [campo]: v });
  const idx = (_ent.rutina?.ejercicios || []).findIndex(x => x.id === id);
  if (idx >= 0) _ent.rutina.ejercicios[idx][campo] = v;
  entPintarTiempos();
};

window.entQuitarRE = async (id) => {
  if (!_ent.rutina) return;
  const deBloque = _ent.rutina.ejercicios.find(x => x.id === id)?.bloque_id || null;
  _ent.rutina.ejercicios = _ent.rutina.ejercicios.filter(x => x.id !== id);
  entRepintarRutina();
  const ok = await entDb.quitarRE(id);
  if (ok === false) return entRefrescarRutina();
  if (deBloque) await entDeshacerSiSobra(deBloque);
  entRefrescarAsistencia();
};

// ---------- Arrastrar ejercicios dentro de la rutina ----------
// Las flechas ↑↓ siguen ahí (en el móvil arrastrar es incómodo y son más
// precisas), pero mover el 8º ejercicio al 2º puesto son seis clics. Con el
// arrastre es uno.
//
// Soltar sobre otro ejercicio lo INSERTA en esa posición, no los intercambia:
// intercambiar deja la lista con dos ejercicios cambiados de sitio, que casi
// nunca es lo que se quiere al reordenar un entreno.
//
// Y hereda el bloque de donde cae. Arrastrar un ejercicio dentro de un
// circuito y que se quede suelto sería el error silencioso de siempre: se ve
// dentro del recuadro pero el cliente lo ejecuta aparte.
// Mientras se arrastra (una fila o una tarjeta de la galería) aparecen los
// huecos para dejarlo suelto. Se marca en el siguiente tic: tocar el DOM en
// pleno dragstart hace que algunos navegadores cancelen el arrastre.
function entMarcarArrastre(on) {
  setTimeout(() => { const c = $('#cons-rutina'); if (c) c.classList.toggle('ent-arrastrando', on); }, 0);
}
function entLimpiarMarcas() {
  document.querySelectorAll('.ent-fila-antes, .ent-fila-despues, .ent-fila-juntar')
    .forEach(f => f.classList.remove('ent-fila-antes', 'ent-fila-despues', 'ent-fila-juntar'));
  document.querySelectorAll('.ent-bloque-destino, .ent-hueco-on')
    .forEach(f => f.classList.remove('ent-bloque-destino', 'ent-hueco-on'));
}
const entArrastra = () => _ent.arrastrandoRE || _ent.arrastrandoEj || _ent.arrastrandoBloque;
const entEfecto = () => (_ent.arrastrandoEj ? 'copy' : 'move');
// Dónde cae sobre una fila: el tercio de arriba = antes, el de abajo =
// después, y EL MEDIO = juntarlo con ese ejercicio en un circuito. Un
// circuito entero arrastrado solo va antes o después.
function entZona(e, fila) {
  const caja = fila.getBoundingClientRect();
  const rel = (e.clientY - caja.top) / (caja.height || 1);
  const mismoBloque = _ent.arrastrandoRE && fila.dataset.bloque
    && (_ent.rutina?.ejercicios || []).find(x => x.id === _ent.arrastrandoRE)?.bloque_id === fila.dataset.bloque;
  if (!_ent.arrastrandoBloque && !mismoBloque && rel >= 0.3 && rel <= 0.7) return 'juntar';
  return rel < 0.5 ? 'antes' : 'despues';
}

window.entReDragStart = (e) => {
  const fila = e.currentTarget;
  _ent.arrastrandoRE = fila.dataset.re;
  _ent.arrastrandoEj = null;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', fila.dataset.re);   // Firefox lo exige
  fila.classList.add('ent-fila-arrastre');
  entMarcarArrastre(true);
};

window.entReDragEnd = (e) => {
  e.currentTarget.classList.remove('ent-fila-arrastre');
  entLimpiarMarcas();
  entMarcarArrastre(false);
  _ent.arrastrandoRE = null;
};

// Arrastrar desde la galería: lo mismo que mover una fila, pero lo que cae es
// un ejercicio NUEVO en esa posición (y en el bloque donde cae).
window.entEjDragStart = (e) => {
  const tarjeta = e.currentTarget;
  _ent.arrastrandoEj = tarjeta.dataset.ej;
  _ent.arrastrandoRE = null;
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData('text/plain', tarjeta.dataset.ej);
  tarjeta.classList.add('ent-fila-arrastre');
  entMarcarArrastre(true);
};

window.entEjDragEnd = (e) => {
  e.currentTarget.classList.remove('ent-fila-arrastre');
  entLimpiarMarcas();
  entMarcarArrastre(false);
  _ent.arrastrandoEj = null;
};

window.entReDragOver = (e) => {
  if (!entArrastra()) return;
  const fila = e.currentTarget;
  if (_ent.arrastrandoRE && fila.dataset.re === _ent.arrastrandoRE) return;
  if (_ent.arrastrandoBloque && fila.dataset.bloque === _ent.arrastrandoBloque) return;
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = entEfecto();
  // Arriba "antes", abajo "después", en medio "juntar en circuito". Sin la
  // marca no se sabe dónde va a caer hasta que ya cayó.
  const zona = entZona(e, fila);
  entLimpiarMarcas();
  fila.classList.add(zona === 'antes' ? 'ent-fila-antes' : zona === 'despues' ? 'ent-fila-despues' : 'ent-fila-juntar');
};

window.entReDrop = async (e) => {
  const id = _ent.arrastrandoRE;
  const ej = _ent.arrastrandoEj;
  const bl = _ent.arrastrandoBloque;
  const fila = e.currentTarget;
  const destinoId = fila.dataset.re;
  const zona = entZona(e, fila);
  _ent.arrastrandoRE = null;
  _ent.arrastrandoEj = null;
  _ent.arrastrandoBloque = null;
  entLimpiarMarcas();
  if (bl && destinoId) {
    e.preventDefault();
    e.stopPropagation();
    if (fila.dataset.bloque === bl) return;
    return entMoverBloqueJunto(bl, destinoId, zona === 'antes');
  }
  if ((ej || id) && destinoId && zona === 'juntar' && id !== destinoId) {
    e.preventDefault();
    e.stopPropagation();
    return entJuntarEnCircuito(destinoId, { reId: id, ejId: ej });
  }
  if (ej && destinoId) {
    e.preventDefault();
    e.stopPropagation();
    const antes = zona === 'antes';
    let pos = (_ent.rutina?.ejercicios || []).findIndex(x => x.id === destinoId);
    if (pos < 0) return;
    if (!antes) pos++;
    return entAgregarARutina(ej, { pos, bloque: fila.dataset.bloque || null });
  }
  if (!id || !destinoId || id === destinoId) return;
  e.preventDefault();
  e.stopPropagation();
  await entReordenarRE(id, destinoId, zona === 'antes', fila.dataset.bloque || null);
};

// Soltar en un hueco: queda SUELTO en esa posición (fuera de cualquier
// circuito). Si viene de la galería, entra ahí como ejercicio individual.
window.entHuecoDragOver = (e) => {
  if (!entArrastra()) return;
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = entEfecto();
  entLimpiarMarcas();
  e.currentTarget.classList.add('ent-hueco-on');
};
window.entHuecoDragLeave = (e) => {
  if (e.currentTarget.contains(e.relatedTarget)) return;
  e.currentTarget.classList.remove('ent-hueco-on');
};
window.entHuecoDrop = async (e) => {
  const pos = Number(e.currentTarget.dataset.pos) || 0;
  const id = _ent.arrastrandoRE;
  const ej = _ent.arrastrandoEj;
  const bl = _ent.arrastrandoBloque;
  _ent.arrastrandoRE = null;
  _ent.arrastrandoEj = null;
  _ent.arrastrandoBloque = null;
  entLimpiarMarcas();
  if (!id && !ej && !bl) return;
  e.preventDefault();
  e.stopPropagation();
  if (bl) {
    const lista = _ent.rutina?.ejercicios || [];
    const sig = lista.slice(pos).find(x => x.bloque_id !== bl);
    if (sig) return entMoverBloqueJunto(bl, sig.id, true);
    const ult = [...lista].reverse().find(x => x.bloque_id !== bl);
    return ult ? entMoverBloqueJunto(bl, ult.id, false) : null;
  }
  if (ej) return entAgregarARutina(ej, { pos, bloque: null });
  const lista = _ent.rutina?.ejercicios || [];
  const sig = lista.slice(pos).find(x => x.id !== id);
  if (sig) return entReordenarRE(id, sig.id, true, null);
  const ult = [...lista].reverse().find(x => x.id !== id);
  if (ult) return entReordenarRE(id, ult.id, false, null);
  return entGuardarOrden(lista.slice(), { [id]: null });
};

// Saca el ejercicio de la lista, lo vuelve a meter donde toca y renumera
// TODO. Renumerar entero (y no solo los de en medio) es lo que mantiene
// `orden` sin huecos ni empates después de mil movimientos.
async function entReordenarRE(id, destinoId, antes, bloqueDestino) {
  const lista = (_ent.rutina?.ejercicios || []).slice();
  const desde = lista.findIndex(x => x.id === id);
  if (desde < 0) return;

  const [movido] = lista.splice(desde, 1);
  const deBloque = movido.bloque_id || null;
  let hasta = lista.findIndex(x => x.id === destinoId);
  if (hasta < 0) return;
  if (!antes) hasta++;
  lista.splice(hasta, 0, movido);

  await entGuardarOrden(lista, { [id]: bloqueDestino || null });
  // Lo sacaste de su circuito: si quedó con uno solo, el circuito se deshace.
  if (deBloque && deBloque !== (bloqueDestino || null)) await entDeshacerSiSobra(deBloque);
}

// Deja la rutina con la lista en ESTE orden: se ve al instante y se guarda
// detrás. Solo se escriben las filas cuyo `orden` (o bloque) cambió de
// verdad: mover el último al penúltimo puesto son dos escrituras, no quince.
// Si alguna escritura falla, se vuelve a leer la rutina de la base para no
// dejar en pantalla algo que no quedó guardado.
async function entGuardarOrden(lista, bloques = {}) {
  const escrituras = [];
  lista.forEach((re, i) => {
    const parche = {};
    if (re.orden !== i + 1) parche.orden = i + 1;
    if (re.id in bloques && (re.bloque_id || null) !== bloques[re.id]) {
      parche.bloque_id = bloques[re.id];
      // Al entrar a un circuito, 1 serie: las vueltas las pone el circuito.
      if (bloques[re.id] && Number(re.series) !== 1) parche.series = 1;
    }
    if (Object.keys(parche).length) {
      Object.assign(re, parche);
      escrituras.push(entDb.actualizarRE(re.id, parche));
    }
  });
  if (_ent.rutina) _ent.rutina.ejercicios = lista;
  entRepintarRutina();
  const res = await Promise.all(escrituras);
  if (res.some(x => x === false)) { toast('No se pudo guardar el cambio; vuelvo a cargar la rutina'); await entRefrescarRutina(); }
}
// fin entGuardarOrden

// Soltar en el hueco de un bloque (no sobre una fila concreta) mete el
// ejercicio AL FINAL de ese bloque. Es la única forma de meter algo a un
// circuito vacío arrastrando: sin filas dentro, no hay sobre qué soltar.
window.entBloqueDragOver = (e) => {
  if (!entArrastra()) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = entEfecto();
  // Si el cursor está sobre una fila, esa fila ya está pintando su línea de
  // inserción; resaltar además el bloque entero son dos señales a la vez.
  const sobreFila = e.target.closest?.('.ent-fila');
  e.currentTarget.classList.toggle('ent-bloque-destino', !sobreFila);
};
window.entBloqueDragLeave = (e) => {
  // `dragleave` también salta al pasar sobre los hijos; solo cuenta salir del
  // recuadro de verdad.
  if (e.currentTarget.contains(e.relatedTarget)) return;
  e.currentTarget.classList.remove('ent-bloque-destino');
};
window.entBloqueDrop = async (e) => {
  const caja = e.currentTarget;
  caja.classList.remove('ent-bloque-destino');
  const id = _ent.arrastrandoRE;
  const ej = _ent.arrastrandoEj;
  const bl = _ent.arrastrandoBloque;
  const bloqueId = caja.dataset.bloque;
  _ent.arrastrandoRE = null;
  _ent.arrastrandoEj = null;
  _ent.arrastrandoBloque = null;
  entLimpiarMarcas();
  if (bl) {
    // Un circuito soltado sobre otro: va antes o después de él, según la mitad.
    e.preventDefault();
    e.stopPropagation();
    if (bl === bloqueId) return;
    const dentro = (_ent.rutina?.ejercicios || []).filter(x => x.bloque_id === bloqueId);
    if (!dentro.length) return;
    const r = caja.getBoundingClientRect();
    const antes = (e.clientY - r.top) < r.height / 2;
    return entMoverBloqueJunto(bl, antes ? dentro[0].id : dentro[dentro.length - 1].id, antes);
  }
  if (ej) {
    // Al final de ese bloque (o al final de la rutina si está vacío).
    e.preventDefault();
    e.stopPropagation();
    const lista = _ent.rutina?.ejercicios || [];
    let ultimo = -1;
    lista.forEach((x, i) => { if (x.bloque_id === bloqueId) ultimo = i; });
    return entAgregarARutina(ej, { pos: ultimo >= 0 ? ultimo + 1 : lista.length, bloque: bloqueId });
  }
  // Cuando la fila resuelve el drop llama a stopPropagation(), así que este
  // manejador ni se ejecuta. Si llega aquí es que cayó en el hueco. La única
  // excepción es soltar un ejercicio sobre sí mismo, y entonces `id` ya es
  // null porque la fila lo limpió.
  if (!id) return;
  e.preventDefault();
  e.stopPropagation();

  const lista = (_ent.rutina?.ejercicios || []);
  const dentro = lista.filter(x => x.id !== id && x.bloque_id === bloqueId);
  if (dentro.length) {
    await entReordenarRE(id, dentro[dentro.length - 1].id, false, bloqueId);
  } else {
    // Bloque vacío: basta con marcarle el bloque, el orden no cambia.
    await entGuardarOrden(lista.slice(), { [id]: bloqueId });
  }
};

// Reordenar intercambiando el campo `orden` con el vecino. Con listas de 5-15
// ejercicios esto es más simple y más robusto que arrastrar y soltar en móvil.
window.entMoverRE = async (id, delta) => {
  const lista = _ent.rutina?.ejercicios || [];
  const i = lista.findIndex(x => x.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= lista.length) return;
  const nueva = lista.slice();
  [nueva[i], nueva[j]] = [nueva[j], nueva[i]];
  await entGuardarOrden(nueva);
};

// ---------- Circuitos por arrastre ----------
// Soltar un ejercicio EN MEDIO de otro los junta: si el de abajo ya estaba en
// un circuito, entra ahí; si estaba suelto, se crea una superserie con los
// dos (las vueltas = las series del de destino, para que el cliente haga
// A→B→A→B…). Sacarlo arrastrando (o con la ✕) deshace el circuito si queda
// con uno solo.
async function entJuntarEnCircuito(destinoId, { reId = null, ejId = null } = {}) {
  const r = _ent.rutina;
  if (!r) return;
  const dest = r.ejercicios.find(x => x.id === destinoId);
  if (!dest) return;
  const origen = reId ? r.ejercicios.find(x => x.id === reId) : null;
  let bloqueId = dest.bloque_id || null;
  let nuevo = null;
  if (!bloqueId) {
    nuevo = await entDb.crearBloque({
      rutina_id: _ent.rutinaId, tipo: 'superserie', nombre: null, orden: (r.bloques?.length || 0) + 1,
      vueltas: Math.max(1, Number(dest.series) || 3), descanso_seg: dest.descanso_seg ?? 90, descanso_entre_seg: null,
    });
    if (!nuevo) return;
    (r.bloques ||= []).push(nuevo);
    bloqueId = nuevo.id;
  }
  // Va justo después del último del circuito (o del de destino).
  const ultimoDe = (lista) => { let k = -1; lista.forEach((x, i) => { if (x.bloque_id === bloqueId || x.id === destinoId) k = i; }); return k; };
  if (ejId) {
    await entGuardarOrden(r.ejercicios.slice(), { [destinoId]: bloqueId });
    await entAgregarARutina(ejId, { pos: ultimoDe(r.ejercicios) + 1, bloque: bloqueId });
  } else if (origen) {
    const deBloque = origen.bloque_id || null;
    const lista = r.ejercicios.filter(x => x.id !== reId);
    lista.splice(ultimoDe(lista) + 1, 0, origen);
    await entGuardarOrden(lista, { [reId]: bloqueId, [destinoId]: bloqueId });
    if (deBloque && deBloque !== bloqueId) await entDeshacerSiSobra(deBloque);
  }
  toast(nuevo ? 'Superserie creada: ajusta vueltas y descansos en «Editar»' : 'Añadido al circuito');
}

// Si a un circuito le queda un ejercicio (o ninguno) después de sacarle
// otro, ya no es circuito: se deshace y lo que queda vuelve a estar suelto.
async function entDeshacerSiSobra(bloqueId) {
  const r = _ent.rutina;
  if (!r || !bloqueId) return;
  const quedan = r.ejercicios.filter(x => x.bloque_id === bloqueId);
  if (quedan.length > 1) return;
  await entDb.borrarBloque(bloqueId);
  quedan.forEach(x => { x.bloque_id = null; });
  r.bloques = (r.bloques || []).filter(b => b.id !== bloqueId);
  if (_ent.bloqueDestino === bloqueId) _ent.bloqueDestino = '';
  entRepintarRutina();
  toast('El circuito quedó con un solo ejercicio: se deshizo');
}

// Mover un circuito ENTERO junto a un ejercicio (antes o después). Si ese
// ejercicio está en otro circuito, va antes o después de ese circuito
// completo: nunca en medio.
async function entMoverBloqueJunto(bloqueId, refId, antes) {
  const lista = (_ent.rutina?.ejercicios || []).slice();
  const mueve = lista.filter(x => x.bloque_id === bloqueId);
  if (!mueve.length) return;
  const resto = lista.filter(x => x.bloque_id !== bloqueId);
  const ref = resto.find(x => x.id === refId);
  if (!ref) return;
  let k;
  if (ref.bloque_id) {
    const idx = resto.map((x, i) => (x.bloque_id === ref.bloque_id ? i : -1)).filter(i => i >= 0);
    k = antes ? idx[0] : idx[idx.length - 1] + 1;
  } else {
    k = resto.indexOf(ref) + (antes ? 0 : 1);
  }
  resto.splice(k, 0, ...mueve);
  await entGuardarOrden(resto);
}

window.entBloqueDragStart = (e) => {
  const caja = e.currentTarget.closest('[data-bloque]');
  _ent.arrastrandoBloque = caja?.dataset.bloque || null;
  _ent.arrastrandoRE = null;
  _ent.arrastrandoEj = null;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', _ent.arrastrandoBloque || '');
  e.stopPropagation();
  caja?.classList.add('ent-fila-arrastre');
  entMarcarArrastre(true);
};
window.entBloqueDragEnd = (e) => {
  e.currentTarget.closest('[data-bloque]')?.classList.remove('ent-fila-arrastre');
  entLimpiarMarcas();
  entMarcarArrastre(false);
  _ent.arrastrandoBloque = null;
};

// ⤓ Al final: para ordenar rápido, mandando abajo uno por uno en el orden
// que quieres. Dentro de un circuito, al final de ese circuito.
window.entAlFinal = async (id) => {
  const lista = (_ent.rutina?.ejercicios || []).slice();
  const i = lista.findIndex(x => x.id === id);
  if (i < 0) return;
  const [re] = lista.splice(i, 1);
  if (re.bloque_id) {
    let k = -1;
    lista.forEach((x, j) => { if (x.bloque_id === re.bloque_id) k = j; });
    lista.splice(k + 1, 0, re);
  } else lista.push(re);
  await entGuardarOrden(lista);
};
window.entBloqueAlFinal = async (bloqueId) => {
  const lista = _ent.rutina?.ejercicios || [];
  await entGuardarOrden([...lista.filter(x => x.bloque_id !== bloqueId), ...lista.filter(x => x.bloque_id === bloqueId)]);
};

window.entDestino = (id) => { _ent.bloqueDestino = id || ''; };

// ---------- Bloques: crear, editar, borrar ----------
function entFormularioBloque(b = {}) {
  const tipo = b.tipo || 'circuito';
  return `
    <div class="mb-3"><label>Tipo</label>
      <select id="bl-tipo" onchange="entAyudaBloque(this.value)">
        ${ENT_TIPOS_BLOQUE.map(([id, lab]) => `<option value="${id}" ${tipo === id ? 'selected' : ''}>${lab}</option>`).join('')}
      </select>
      <p id="bl-ayuda" class="text-xs text-slate-500 mt-1">${escapeHtml(ENT_AYUDA_BLOQUE[tipo] || '')}</p>
    </div>
    <div class="mb-3"><label>Nombre</label>
      <input id="bl-nombre" value="${escapeHtml(b.nombre || '')}" placeholder="A · Circuito final"></div>

    <div class="sec-title">Tiempos</div>
    <p class="text-xs text-slate-500 mb-2">
      En un circuito hay dos descansos distintos, y confundirlos arruina la sesión:
      el corto entre una estación y la siguiente, y el largo al cerrar la vuelta.
    </p>
    <div class="grid grid-cols-3 gap-2 mb-3">
      <div><label>Vueltas</label>
        <input id="bl-vueltas" type="number" min="1" value="${b.vueltas || ''}" placeholder="3"></div>
      <div><label>Entre ejercicios (s)</label>
        <input id="bl-dentro" type="number" min="0" value="${b.descanso_entre_seg ?? ''}" placeholder="0"></div>
      <div><label>Entre vueltas (s)</label>
        <input id="bl-vuelta" type="number" min="0" value="${b.descanso_seg ?? ''}" placeholder="120"></div>
    </div>
    <div><label>Nota</label><input id="bl-notas" value="${escapeHtml(b.notas || '')}" placeholder="Sin descanso entre estaciones"></div>
  `;
}

window.entAyudaBloque = (tipo) => {
  const el = $('#bl-ayuda');
  if (el) el.textContent = ENT_AYUDA_BLOQUE[tipo] || '';
};

window.entNuevoBloque = () => {
  openModal(modalShell('Nuevo bloque', entFormularioBloque(),
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="entGuardarBloque(null)">Crear bloque</button>`));
};

window.entEditarBloque = (id) => {
  const b = (_ent.rutina?.bloques || []).find(x => x.id === id);
  if (!b) return;
  openModal(modalShell('Editar bloque', entFormularioBloque(b),
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="entGuardarBloque('${id}')">Guardar</button>`));
};

window.entGuardarBloque = async (id) => {
  // Los tiempos vacíos guardan NULL, no 0: "sin descanso configurado" y
  // "0 segundos de descanso" son instrucciones distintas para el cliente.
  const num = (sel) => { const v = $(sel)?.value; return String(v ?? '').trim() === '' ? null : Number(v); };
  const row = {
    tipo: $('#bl-tipo')?.value || 'circuito',
    nombre: $('#bl-nombre')?.value.trim() || null,
    vueltas: num('#bl-vueltas'),
    descanso_entre_seg: num('#bl-dentro'),
    descanso_seg: num('#bl-vuelta'),
    notas: $('#bl-notas')?.value.trim() || null,
  };
  if (id) {
    await entDb.actualizarBloque(id, row);
  } else {
    const orden = (_ent.rutina?.bloques?.length || 0) + 1;
    const b = await entDb.crearBloque({ ...row, rutina_id: _ent.rutinaId, orden });
    if (!b) return;
    // Recién creado se vuelve el destino: crear un circuito es siempre el
    // paso previo a llenarlo, y obligarte a elegirlo después sobra.
    _ent.bloqueDestino = b.id;
  }
  closeModal();
  toast(id ? '✓ Bloque actualizado' : '✓ Bloque creado — lo que añadas entra aquí');
  entRefrescarRutina();
};

window.entBorrarBloque = async (id) => {
  if (!confirm('¿Deshacer este bloque? Sus ejercicios quedan sueltos en la rutina, no se borran.')) return;
  await entDb.borrarBloque(id);
  if (_ent.bloqueDestino === id) _ent.bloqueDestino = '';
  toast('Bloque deshecho');
  entRefrescarRutina();
};

window.entMoverABloque = async (reId, bloqueId) => {
  await entGuardarOrden((_ent.rutina?.ejercicios || []).slice(), { [reId]: bloqueId || null });
};

window.entEditarDatosRutina = () => {
  const r = _ent.rutina;
  if (!r) return;
  openModal(modalShell('Datos de la rutina', `
    <div class="mb-3"><label>Nombre</label><input id="rt2-nombre" value="${escapeHtml(r.nombre)}"></div>
    <div class="mb-3"><label>Descripción (la lee el cliente)</label>
      <textarea id="rt2-desc" rows="2">${escapeHtml(r.descripcion || '')}</textarea></div>
    <div class="grid grid-cols-2 gap-3 mb-3">
      <div><label>Tipo de sesión</label>
        <select id="rt2-tipo">${entOpciones([['fuerza','Fuerza'],['cardio','Cardio'],['movilidad','Movilidad'],['mixta','Mixta'],['descanso_activo','Descanso activo']], r.tipo_sesion, '—')}</select></div>
      <div><label>Duración (min)</label><input id="rt2-dur" type="number" value="${r.duracion_estimada_min || ''}"></div>
    </div>
    ${typeof bqEditorHtml === 'function' ? bqEditorHtml(r) : ''}
    <div><label>Notas de coach</label><textarea id="rt2-notas" rows="2">${escapeHtml(r.notas_coach || '')}</textarea></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="entGuardarDatosRutina()">Guardar</button>`));
};

window.entGuardarDatosRutina = async () => {
  const nombre = $('#rt2-nombre')?.value.trim();
  if (!nombre) { toast('La rutina necesita un nombre'); return; }
  await entDb.actualizarRutina(_ent.rutinaId, {
    nombre,
    descripcion: $('#rt2-desc')?.value.trim() || null,
    tipo_sesion: $('#rt2-tipo')?.value || null,
    duracion_estimada_min: Number($('#rt2-dur')?.value) || null,
    notas_coach: $('#rt2-notas')?.value.trim() || null,
    ...(typeof bqLeerEditor === 'function' ? bqLeerEditor(_ent.rutina) : {}),
    updated_at: new Date().toISOString(),
  });
  closeModal();
  toast('✓ Guardado');
  entRefrescarRutina();
};

window.entDuplicarPlantilla = async (id) => {
  const nueva = await entDb.duplicarRutina(id);
  if (!nueva) return;
  toast('✓ Rutina duplicada');
  entVistaRutinas();
};

window.entBorrarRutina = async (id, esPlantilla) => {
  if (!confirm('¿Borrar esta rutina? Se borra con sus ejercicios. Las copias que ya hiciste a clientes no se tocan.')) return;
  await entDb.borrarRutina(id);
  toast('Rutina borrada');
  if (_ent.rutinaId === id) { _ent.rutinaId = null; _ent.rutina = null; }
  routes.entrenamiento();
};

// =====================================================
// PESTAÑA 3 · CLIENTES (fases y asignación)
// =====================================================
// Una fase es "este bloque dura X semanas y se entrena estos días". De ahí
// sale el calendario que verá el cliente: fecha_inicio + semanas + días.

// ── El inicio de Entrenamiento: cómo va cada cliente con su ciclo ──────
// Para cada cliente con ciclo vigente (ciclos-vencen.js): qué ciclo va y en
// qué semana, si es el último armado o ya hay otro después, si está enviado
// y si lo está usando (cuándo abrió por última vez una rutina de ese ciclo),
// cuántos días lleva y cuántos le faltan, su cumplimiento (entrenos hechos
// frente a los que tocaban hasta hoy según su plan semanal) y sus rutinas.
async function entResumenCiclos(estado) {
  const actuales = Object.values(estado).filter(e => e.actual).map(e => e.actual);
  const ids = actuales.map(f => f.id);
  if (!ids.length) return {};
  const [rRut, rSes] = await Promise.all([
    sb.from('rutinas').select('*').in('fase_id', ids),
    sb.from('sesiones').select('fase_id, fecha, estado, created_at').in('fase_id', ids),
  ]);
  const hoy = fmt.hoy();
  const out = {};
  actuales.forEach(f => {
    const rutinas = (rRut.data || []).filter(r => r.fase_id === f.id && !r.archivada)
      .sort((a, b) => (a.dia_orden || 0) - (b.dia_orden || 0));
    const ses = (rSes.data || []).filter(x => x.fase_id === f.id);
    const fin = cicFin(f);
    const hasta = hoy < fin ? hoy : fin;
    // Lo que tocaba hasta hoy: los días de su plan semanal desde el inicio.
    const porDia = {};
    rutinas.filter(r => !r.complementaria).forEach(r => (r.dias_semana || []).forEach(d => { porDia[d] = (porDia[d] || 0) + 1; }));
    let planeadas = 0;
    for (let d = f.fecha_inicio; d <= hasta; d = evtSumarDias(d, 1)) planeadas += porDia[evtCodigoDe(d)] ? 1 : 0;
    const hechas = new Set(ses.filter(x => x.estado === 'completada' && x.fecha <= hoy).map(x => x.fecha)).size;
    // La última vez que abrió una rutina de este ciclo (la fecha de la sesión:
    // las importadas de Trainerize traen la hora de la importación).
    const ultimo = ses.map(x => String(x.fecha || '')).filter(x => x && x <= hoy).sort().pop() || null;
    out[f.cliente_id] = {
      fase: f, rutinas, planeadas, hechas,
      pct: planeadas ? Math.min(100, Math.round((hechas / planeadas) * 100)) : null,
      lleva: cicDias(f.fecha_inicio, hoy) + 1, quedan: cicDias(hoy, fin),
      abrio: ultimo ? cicDias(ultimo.slice(0, 10), hoy) : null,
    };
  });
  return out;
}

// Las iniciales en un círculo de color (el mismo color siempre para el mismo nombre).
function entAvatar(nombre) {
  const ini = String(nombre || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase();
  const tonos = ['#3C7BD6', '#46965A', '#EE8434', '#5F6670', '#8B6FD6', '#2F9C95', '#C9672B'];
  let h = 0; for (const ch of String(nombre || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `<span style="flex:none;display:grid;place-items:center;border-radius:999px;color:#fff;font-weight:800;width:40px;height:40px;font-size:14px;background:${tonos[h % tonos.length]}">${escapeHtml(ini)}</span>`;
}
// Los colores de cada módulo, los mismos de la app del cliente
// (Reconocimiento.jsx · COLOR_MODULO). Adherencia y cuerpo van en el azul de
// la marca. Así un aro o una línea dicen de qué son con solo verlos.
const EM_COLOR = { entreno: '#5F6670', comida: '#46965A', aprende: '#EE8434', adherencia: '#3C7BD6', cuerpo: '#3C7BD6', global: '#1F1F1F', meta: '#C9C7C0' };
window.EM_COLOR = EM_COLOR;
// El aro de cumplimiento, como los de la app: grueso, del color del módulo,
// con el punto blanco al final y el número al centro. Cómo va lo dice el %.
function entAro(pct, titulo = '', t = 54, color = EM_COLOR.entreno) {
  const g = t >= 80 ? 11 : t >= 60 ? 9 : 6, r = (t - g) / 2, c = 2 * Math.PI * r;
  const v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const ang = (v / 100) * 2 * Math.PI, px = t / 2 + r * Math.cos(ang), py = t / 2 + r * Math.sin(ang);
  return `<span style="flex:none;position:relative;display:block;width:${t}px;height:${t}px" data-aro-cumplimiento="${pct ?? ''}" title="${escapeHtml(titulo)}">
    <svg width="${t}" height="${t}" style="transform:rotate(-90deg)"><circle cx="${t / 2}" cy="${t / 2}" r="${r}" stroke="#EFEDE8" stroke-width="${g}" fill="none"/>
    ${v > 0 ? `<circle cx="${t / 2}" cy="${t / 2}" r="${r}" stroke="${color}" stroke-width="${g}" fill="none" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - v / 100)).toFixed(1)}"/>
    <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${Math.max(1.6, g * 0.3).toFixed(1)}" fill="#fff" style="filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.25))"/>` : ''}</svg>
    <span style="position:absolute;inset:0;display:grid;place-items:center;font-weight:800;font-size:${t >= 80 ? 22 : t >= 60 ? 17 : 12}px;letter-spacing:-.03em;color:#1F1F1F">${pct == null ? '—' : pct + '%'}</span></span>`;
}

function entTarjetaCiclo(r, e) {
  if (!r) return '';
  const f = r.fase, sig = e && e.siguiente;
  const chip = (txt, tono = 'gris') => {
    const c = { ok: ['#E9F4EC', '#2F6B3E'], rojo: ['#FDECE8', '#A3301B'], ambar: ['#FDF4DF', '#8A5A00'], gris: ['#F1F2F4', '#5F6670'], azul: ['#EAF1FB', '#2F68C0'] }[tono];
    return `<span class="text-[11px] font-semibold rounded-full px-2 py-0.5 whitespace-nowrap" style="background:${c[0]};color:${c[1]}">${txt}</span>`;
  };
  const semanas = Number(f.semanas) || 0;
  const semana = Math.min(semanas || 99, Math.floor((r.lleva - 1) / 7) + 1);
  const total = r.lleva + r.quedan;
  const avance = total ? Math.round((r.lleva / total) * 100) : 0;
  return `
    <div class="mt-3 pt-3" style="border-top:1px solid #F0EEE9" data-resumen-ciclo>
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-sm font-bold text-slate-900 truncate">${escapeHtml(f.nombre || 'Ciclo')}</div>
          <div class="text-xs text-slate-500">Semana ${semana}${semanas ? ` de ${semanas}` : ''}</div>
        </div>
        <div class="text-right flex-none" data-cumplimiento title="${r.hechas} entrenos hechos de ${r.planeadas} que tocaban hasta hoy">
          <div class="text-xs font-bold text-slate-800">${r.planeadas ? `${r.hechas} de ${r.planeadas} entrenos` : 'Sin entrenos aún'}</div>
          <div class="text-[11px] text-slate-500 mt-0.5">cumplimiento ${r.pct == null ? '—' : r.pct + ' %'}</div>
        </div>
      </div>
      <div class="flex flex-wrap gap-1 mt-2">
        ${chip('Vigente', 'ok')}
        ${sig ? chip(`Después: ${escapeHtml(sig.nombre || 'otro ciclo')}${sig.visible_cliente ? '' : ' (sin enviar)'}`, sig.visible_cliente ? 'azul' : 'ambar') : chip('Último armado', 'gris')}
        ${f.visible_cliente ? chip('Enviado', 'ok') : chip('Sin enviar', 'rojo')}
        ${f.visible_cliente ? (r.abrio == null ? chip('No ha abierto sus rutinas', 'ambar') : chip(r.abrio === 0 ? 'Entró hoy' : `Entró hace ${r.abrio} ${r.abrio === 1 ? 'día' : 'días'}`, r.abrio > 7 ? 'ambar' : 'gris')) : ''}
      </div>
      <div class="mt-2.5">
        <div class="flex justify-between text-[11px] text-slate-500"><span>Lleva ${r.lleva} ${r.lleva === 1 ? 'día' : 'días'}</span><span>${r.quedan === 0 ? 'Termina hoy' : `Faltan ${r.quedan} ${r.quedan === 1 ? 'día' : 'días'}`}</span></div>
        <div class="h-1.5 rounded-full mt-1" style="background:#EEECE7"><div class="h-1.5 rounded-full" style="width:${avance}%;background:#1D1D1F"></div></div>
      </div>
      ${r.rutinas.length ? `<div class="flex flex-wrap gap-1 mt-2.5" data-rutinas-ciclo>${r.rutinas.map(x => `<span class="text-[11px] font-semibold rounded-lg px-2 py-1" style="background:#F6F5F2;color:#1D1D1F">${escapeHtml(x.nombre)}${(x.dias_semana || []).length ? ` <span style="color:#8E8E93;font-weight:500">${x.dias_semana.join(' ')}</span>` : ''}</span>`).join('')}</div>` : ''}
    </div>`;
}

// Inicio del CRM: cómo va el equipo con su entrenamiento (todos los ciclos
// vigentes), y los que más se están quedando para escribirles.
window.inicioEquipo = async (idCaja) => {
  const caja = document.getElementById(idCaja);
  if (!caja) return;
  try {
    const filas = typeof cicDatos === 'function' ? await cicDatos() : [];
    const estado = Object.fromEntries(filas.map(f => [f.cliente.id, f]));
    const res = await entResumenCiclos(estado);
    const lista = filas.map(f => ({ c: f.cliente, r: res[f.cliente.id] })).filter(x => x.r && x.r.planeadas > 0);
    if (!lista.length) { caja.innerHTML = 'Sin ciclos vigentes con entrenos planeados todavía.'; return; }
    const hechas = lista.reduce((a, x) => a + x.r.hechas, 0), planeadas = lista.reduce((a, x) => a + x.r.planeadas, 0);
    const pct = Math.min(100, Math.round((hechas / planeadas) * 100));
    const bajos = lista.filter(x => x.r.pct < 80).sort((a, b) => a.r.pct - b.r.pct).slice(0, 3);
    caja.innerHTML = `
      <div class="flex items-center gap-4" data-equipo-entreno>
        ${entAro(pct, 'Entrenos hechos de los que tocaban hasta hoy, de todos tus clientes', 96)}
        <div><div class="font-bold text-slate-900" style="font-size:15px">Entrenamiento</div>
          <div class="text-[13px] text-slate-500">${hechas} de ${planeadas} entrenos hechos en sus ciclos</div></div>
      </div>
      ${bajos.length ? `<div class="text-[12px] font-bold text-slate-400 uppercase tracking-wider mt-4 mb-1">Para escribirles</div>
        ${bajos.map(x => `<div class="flex items-center gap-3 py-2 cursor-pointer" style="border-top:1px solid #F1EFEA" data-equipo-bajo
            onclick="_ent.tab='clientes';_ent.clienteId='${x.c.id}';navigate('entrenamiento')">
          ${entAvatar(x.c.nombre)}<div class="flex-1 min-w-0"><div class="font-semibold text-slate-900 truncate text-sm">${escapeHtml(x.c.nombre)}</div>
          <div class="text-xs text-slate-500">${x.r.hechas} de ${x.r.planeadas} entrenos · ${escapeHtml(x.r.fase.nombre || 'su ciclo')}</div></div>
          ${entAro(x.r.pct, '', 44)}</div>`).join('')}` : '<div class="text-[13px] text-slate-500 mt-3">Todos van al 80 % o más.</div>'}`;
  } catch (e) { caja.innerHTML = ''; }
};

async function entVistaClientes() {
  const body = $('#ent-body');
  if (!body) return;
  // Solo ACTIVOS. A un cliente en pausa no se le está armando entrenamiento;
  // aparecía en la lista y había que esquivarlo. Está en Clientes, en su
  // subsección. Si vienes de su ficha, ese sí se abre.
  const clientes = (await db.clientes.list()).filter(c => c.estado === 'activo'
    || (_ent.clienteId && c.id === _ent.clienteId));

  if (!_ent.clienteId) {
    // El estado del ciclo de cada uno (ciclos-vencen.js): lo urgente primero.
    let estado = {};
    try { if (typeof cicDatos === 'function') estado = Object.fromEntries((await cicDatos()).map(f => [f.cliente.id, f])); } catch (e) {}
    let resumen = {};
    try { resumen = await entResumenCiclos(estado); } catch (e) { resumen = {}; }
    const peso = (c) => (estado[c.id] ? estado[c.id].orden : 9);
    const lista = clientes.slice().sort((a, b) => peso(a) - peso(b) || String(a.nombre).localeCompare(String(b.nombre)));
    body.innerHTML = `
      <div class="text-sm text-slate-600 mb-3">Cómo va cada cliente con su ciclo. Toca uno para armar su calendario, sus rutinas y sus ciclos. Arriba, los que necesitan algo.</div>
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        ${lista.map(c => {
          const e = estado[c.id];
          const t = e && typeof CIC_TONO !== 'undefined' ? CIC_TONO[e.tono] : null;
          return `
          <div class="card card-hover cursor-pointer" data-cliente-ent="${c.id}" onclick="entVerCliente('${c.id}')">
            <div class="flex items-center gap-3">
              ${entAvatar(c.nombre)}
              <div class="min-w-0 flex-1">
                <div class="font-bold text-slate-900 truncate" style="font-size:15.5px">${escapeHtml(c.nombre)}</div>
                <div class="text-xs text-slate-500 truncate">
                  ${c.objetivo ? escapeHtml(c.objetivo) : 'Sin objetivo definido'}
                  ${(c.dias_entreno || []).length ? ` · ${c.dias_entreno.join(' ')}` : ''}
                </div>
              </div>
              ${resumen[c.id] ? entAro(resumen[c.id].pct, `${resumen[c.id].hechas} de ${resumen[c.id].planeadas} entrenos hechos de los que tocaban hasta hoy`) : ''}
            </div>
            ${e && t ? `<div class="text-xs font-semibold mt-1.5 flex items-center gap-1.5" style="color:${t.tinta}" data-ciclo-tono="${e.tono}">
              <span style="width:8px;height:8px;border-radius:99px;background:${t.punto};flex:none"></span>${escapeHtml(e.texto)}</div>` : ''}
            ${entTarjetaCiclo(resumen[c.id], e)}
          </div>`;
        }).join('')}
      </div>
      ${clientes.length === 0 ? '<div class="card text-center text-slate-500 py-8">No hay clientes activos.</div>' : ''}
      <div id="ent-vt-general" class="mt-4"></div>
    `;
    // Todo lo pendiente de videos de técnica, de todos (videos-tecnica.js).
    if (typeof vtListaGeneral === 'function') vtListaGeneral('#ent-vt-general');
    return;
  }

  const cliente = clientes.find(c => c.id === _ent.clienteId) || await db.clientes.get(_ent.clienteId);
  const fases = await entDb.fases(_ent.clienteId);

  // Las rutinas de cada fase se traen en paralelo: en serie, un cliente con
  // 5 fases hace 5 viajes encadenados y la pestaña se siente lenta.
  const rutinasPorFase = {};
  await Promise.all(fases.map(async f => { rutinasPorFase[f.id] = await entDb.rutinasDeFase(f.id); }));

  // Qué fase se está mirando: la que eligió el coach, o la activa, o la última.
  if (!fases.some(f => f.id === _ent.faseId)) {
    _ent.faseId = (entCicloVigente(fases) || fases.find(f => f.estado === 'activa') || fases[fases.length - 1])?.id || null;
  }
  _ent.fasesCliente = fases;
  const fase = fases.find(f => f.id === _ent.faseId) || null;
  const rutinas = fase ? (rutinasPorFase[fase.id] || []) : [];

  // El calendario opera fuera del render: al arrastrar una rutina o abrir un
  // evento hay que saber sobre qué fase y qué rutinas, y a esas alturas el
  // render ya terminó.
  _ent.fases = fases;
  _ent.faseCache = fase;
  _ent.rutinasCache = rutinas;

  // Los ejercicios de todas las rutinas de la fase, de un solo viaje: son los
  // que se despliegan al abrir cada rutina, y contarlos en la tarjeta.
  // Y la etiqueta de video de técnica de cada ejercicio (videos-tecnica.js).
  const [ejerciciosPorRutina, vtUlt] = await Promise.all([
    entDb.ejerciciosDeRutinas(rutinas.map(r => r.id)),
    typeof vtEtiquetasCliente === 'function' ? vtEtiquetasCliente(_ent.clienteId).catch(() => ({})) : Promise.resolve({}),
  ]);
  _ent.vtUlt = vtUlt || {};

  // ¿Cada rutina quedó igual que en el ciclo anterior o cambió? Solo se pide
  // al mirar la lista de rutinas, que es donde va la etiqueta.
  _ent.cicloComp = {};
  const idxFase = fase ? fases.indexOf(fase) : -1;
  const faseAnt = idxFase > 0 ? fases[idxFase - 1] : null;
  if (_ent.subtab === 'rutinas' && faseAnt && rutinas.length) {
    const rutAnt = rutinasPorFase[faseAnt.id] || [];
    const ejsAnt = rutAnt.length ? await entDb.ejerciciosDeRutinas(rutAnt.map(r => r.id)) : {};
    _ent.cicloComp = entCompararCiclo(rutinas, ejerciciosPorRutina, rutAnt, ejsAnt);
  }

  const cabecera = `
    <div class="flex justify-between items-start mb-4 gap-2 flex-wrap">
      <div>
        <button class="btn btn-ghost btn-sm mb-1" onclick="entVerCliente(null)">← Todos los clientes</button>
        <div class="font-bold text-lg text-slate-900">${escapeHtml(cliente?.nombre || 'Cliente')}</div>
        <div class="text-xs text-slate-500">
          ${(cliente?.dias_entreno || []).length ? `Su ficha dice que entrena: ${cliente.dias_entreno.join(' · ')}` : 'Sin días de entreno definidos en su ficha'}
        </div>
      </div>
      <div class="flex gap-1 flex-wrap">
        <button class="btn btn-secondary btn-sm" data-traer-btn onclick="entImportarFase()" title="Una rutina de fuerza o el ciclo completo, con su calendario">⇄ Traer de otro cliente</button>
        <button class="btn btn-primary btn-sm" onclick="entNuevaFase()">+ Nueva fase</button>
      </div>
    </div>
    ${typeof esFranjaHTML === 'function' ? esFranjaHTML(cliente, 'entreno') : ''}`;

  // Su ciclo: si vence pronto, ya venció o no está enviado, se dice aquí
  // arriba con el botón para resolverlo (ciclos-vencen.js).
  let avisoCiclo = '';
  try {
    if (typeof cicEstado === 'function' && typeof CIC_TONO !== 'undefined') {
      const e = cicEstado(fases.filter(f => f.estado !== 'archivada'), fmt.hoy());
      if (e.tono === 'rojo' || e.tono === 'ambar') {
        const t = CIC_TONO[e.tono];
        const base = e.actual || e.ultima;
        const boton = e.accion === 'Envíaselo' && (e.siguiente && !e.siguiente.visible_cliente ? e.siguiente : e.actual)
          ? `<button class="btn btn-primary btn-sm" onclick="entEnviarFase('${(e.siguiente && !e.siguiente.visible_cliente ? e.siguiente : e.actual).id}')">📤 Envíaselo</button>`
          : e.accion === 'Arma el siguiente' && base ? `<button class="btn btn-primary btn-sm" onclick="entDuplicarCiclo('${base.id}')">⧉ Arma el siguiente</button>` : '';
        avisoCiclo = `<div class="rounded-2xl border p-3 mb-3 flex items-center gap-3 flex-wrap" data-aviso-ciclo-cliente style="background:${t.fondo};border-color:${t.punto}55">
          <span style="width:10px;height:10px;border-radius:99px;background:${t.punto};flex:none"></span>
          <span class="flex-1 min-w-0 text-sm font-semibold" style="color:${t.tinta}">${escapeHtml(e.texto)}</span>${boton}</div>`;
      }
    }
  } catch (err) { avisoCiclo = ''; }

  if (fases.length === 0) {
    body.innerHTML = cabecera + `
      <div class="card text-center text-slate-500 py-8">
        Este cliente no tiene fases todavía. Crea una, o importa una fase que ya
        armaste para otro cliente.
      </div>`;
    return;
  }

  // Selector de fase: solo si hay más de una. Con una sola, un desplegable de
  // un elemento es ruido.
  const selectorFase = fases.length > 1 ? `
    <div class="flex items-center gap-2 mb-3 flex-wrap">
      <label class="!mb-0 !normal-case !text-xs">Fase</label>
      <select class="!w-auto min-w-[220px] text-sm" onchange="entVerFase(this.value)">
        ${fases.map(f => `<option value="${f.id}" ${f.id === _ent.faseId ? 'selected' : ''}>
          ${escapeHtml(f.nombre)}${entEtiquetaCiclo(f, fases) ? ' · ' + entEtiquetaCiclo(f, fases) : ''}
        </option>`).join('')}
      </select>
    </div>` : '';

  const subtabs = [
    ['calendario', '📅 Calendario'],
    ['rutinas', `📋 Rutinas${rutinas.length ? ` (${rutinas.length})` : ''}`],
    ['sesiones', '✅ Lo que entrenó'],
    ['lecturas', '🔎 Lecturas'],
    ['fases', '🗂️ Ciclos'],
    ['mezcla', '🔀 Unir y separar'],
    ['videos', '🎥 Videos de técnica'],
  ];

  body.innerHTML = cabecera + (window.nsListaClienteHTML ? nsListaClienteHTML(_ent.clienteId) : '') + avisoCiclo + selectorFase + `
    <div class="bg-slate-100 rounded-xl p-1 flex gap-1 mb-4 overflow-x-auto">
      ${subtabs.map(([id, lab]) => `
        <button class="px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${_ent.subtab === id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}"
                onclick="entSubtab('${id}')">${lab}</button>`).join('')}
    </div>
    ${_ent.subtab === 'calendario' ? entCalendarioHTML(cliente, fase, rutinas, ejerciciosPorRutina)
      : _ent.subtab === 'rutinas'  ? entListaRutinasHTML(fase, rutinas, ejerciciosPorRutina)
      : _ent.subtab === 'sesiones' ? `${typeof vtPanel === 'function' ? '<details class="card mb-3" open data-ses-videos><summary class="cursor-pointer text-xs font-bold text-slate-500 uppercase tracking-wider">🎥 Videos de técnica · pedidos, por revisar y a mejorar</summary><div class="mt-3" id="ent-ses-vt"></div></details>' : ''}<div id="ent-sesiones" class="card text-sm text-slate-400">Leyendo lo que registró…</div>`
      : _ent.subtab === 'lecturas' ? '<div id="ent-lecturas" class="card text-sm text-slate-400">Calculando…</div>'
      : _ent.subtab === 'mezcla' ? '<div id="ent-mezcla"></div>'
      : _ent.subtab === 'videos' ? '<div id="ent-videos-tec" class="card"></div>'
      : fases.map(f => entTarjetaFase(f, rutinasPorFase[f.id] || [])).join('')}

    <!-- El agente de rutinas se monta aquí si asistente-rutinas.js está
         cargado. Si no lo está, este hueco se queda vacío y no pasa nada. -->
    <div id="rut-panel" class="mt-4"></div>
  `;

  if (typeof rutMontarPanel === 'function') rutMontarPanel();
  if (_ent.subtab === 'calendario') entPintarCalendario(cliente, fase, rutinas, ejerciciosPorRutina);
  if (_ent.subtab === 'sesiones') { entPintarSesiones(cliente); if (typeof vtPanel === 'function') vtPanel('#ent-ses-vt', cliente?.id); }
  if (_ent.subtab === 'lecturas') entPintarLecturas(cliente);
  if (_ent.subtab === 'videos' && typeof vtPanel === 'function') vtPanel('#ent-videos-tec', cliente?.id);
  if (_ent.subtab === 'mezcla' && typeof mzAbrir === 'function') mzAbrir({ caja: '#ent-mezcla', fuentes: rutinas, faseId: fase?.id || null, clienteId: cliente?.id || null });
}

// ═══════════════════════════════════════════════════════════════════════
// LO QUE ENTRENÓ  ·  lo que el cliente marcó en su app
// ═══════════════════════════════════════════════════════════════════════
// La app del cliente ya guardaba las sesiones, el esfuerzo percibido y las
// notas ("me molestó el hombro"), pero no había ninguna pantalla del CRM
// donde verlo: el dato se registraba y moría ahí. Pedirle al cliente que
// marque su percepción sin tener dónde leerla es pedirle trabajo a cambio
// de nada.
async function entPintarSesiones(cliente) {
  const caja = $('#ent-sesiones');
  if (!caja) return;
  const ses = await entDb.sesiones(cliente.id, { limite: 40 });

  if (ses === null) {
    caja.outerHTML = `<div class="card text-sm text-slate-500">
      Todavía no puedo leer las sesiones. Corre <code>schema.sql</code> del módulo de entrenamiento en el Supabase del CRM.
    </div>`;
    return;
  }
  if (!ses.length) {
    caja.outerHTML = `<div class="card text-center text-slate-500 py-8">
      <div class="font-bold text-slate-700 mb-1">Todavía no ha marcado ningún entreno</div>
      <div class="text-sm">Cuando abra una rutina en su app y marque series, aparece aquí.</div>
    </div>`;
    return;
  }

  const mins = (s) => (s ? Math.round(s / 60) : null);
  // El RPE se lee de un vistazo por color: 1-6 cómodo, 7-8 el rango donde se
  // entrena, 9-10 al límite. Tres seguidos en 9-10 es una bandera roja.
  const colorRpe = (r) => r == null ? 'bg-slate-100 text-slate-400'
    : r >= 9 ? 'bg-red-100 text-red-700'
    : r >= 7 ? 'bg-emerald-100 text-emerald-700'
    : 'bg-amber-100 text-amber-700';

  const completadas = ses.filter(s => s.estado === 'completada');
  const conRpe = completadas.filter(s => s.rpe != null);
  const rpeProm = conRpe.length
    ? Math.round(conRpe.reduce((a, s) => a + s.rpe, 0) / conRpe.length * 10) / 10 : null;
  // Desglose de tiempos por sesión (entreno-tiempos.js).
  const tiempos = typeof entTiemposCargar === 'function' ? await entTiemposCargar(ses).catch(() => ({})) : {};

  caja.outerHTML = `
    <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
      <div class="card"><div class="text-[10px] uppercase text-slate-400 font-bold">Entrenos marcados</div>
        <div class="text-2xl font-bold text-slate-800">${completadas.length}</div>
        <div class="text-[11px] text-slate-500">últimas ${ses.length} sesiones abiertas</div></div>
      <div class="card"><div class="text-[10px] uppercase text-slate-400 font-bold">Esfuerzo promedio</div>
        <div class="text-2xl font-bold ${rpeProm == null ? 'text-slate-400' : rpeProm >= 8.5 ? 'text-red-600' : 'text-slate-800'}">${rpeProm ?? '—'}</div>
        <div class="text-[11px] text-slate-500">${conRpe.length ? `sobre ${conRpe.length} con percepción` : 'todavía sin percepción'}</div></div>
      <div class="card"><div class="text-[10px] uppercase text-slate-400 font-bold">Sin terminar</div>
        <div class="text-2xl font-bold ${ses.length - completadas.length > 0 ? 'text-amber-600' : 'text-slate-800'}">${ses.length - completadas.length}</div>
        <div class="text-[11px] text-slate-500">abrió y no cerró</div></div>
    </div>

    <div class="space-y-2">
      ${ses.map(s => `
        <div class="card ${s.estado !== 'completada' ? 'border-l-4 border-amber-300' : ''}">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-bold text-slate-800 text-sm">${escapeHtml(s.rutinas?.nombre || 'Sesión')}</span>
            <span class="text-xs text-slate-400">${fmt.fechaCorta(s.fecha)}</span>
            ${s.estado === 'completada'
              ? '<span class="tag tag-green">✓ terminada</span>'
              : s.estado === 'saltada' ? '<span class="tag">saltada</span>'
              : '<span class="tag tag-yellow">abrió y no cerró</span>'}
            <span class="ml-auto flex items-center gap-2">
              ${mins(s.duracion_seg) ? `<span class="text-xs text-slate-500">${mins(s.duracion_seg)} min</span>` : ''}
              <span class="text-xs font-bold px-2 py-0.5 rounded-full ${colorRpe(s.rpe)}" title="Esfuerzo percibido del 1 al 10">
                ${s.rpe != null ? `RPE ${s.rpe}` : 'sin RPE'}
              </span>
              ${s.estado !== 'saltada' && typeof fzQuitarSesion === 'function' ? `
              <span class="flex items-center gap-1" data-ses-corregir="${s.id}" title="Si se equivocó al marcar: moverlo a otro día o quitarlo">
                <input id="ses-mover-a-${s.id}" type="date" class="!w-auto text-xs" value="${s.fecha}">
                <button class="btn btn-ghost btn-sm" data-ses-mover onclick="fzMoverSesion('${s.id}', '${s.fecha}')">Mover</button>
                <button class="btn btn-ghost btn-sm text-red-600" data-ses-quitar onclick="fzQuitarSesion('${s.id}', '${s.fecha}')">✕ Quitar</button>
              </span>` : ''}
            </span>
          </div>
          ${s.notas_cliente ? `<div class="mt-2 text-xs bg-slate-50 rounded-lg px-3 py-2 text-slate-700">💬 ${escapeHtml(s.notas_cliente)}</div>` : ''}
          ${tiempos[s.id] ? entTiempoSesionHTML(tiempos[s.id], s.id) : ''}
        </div>`).join('')}
    </div>
    <div class="text-[11px] text-slate-400 mt-3">
      RPE = qué tan duro se sintió, del 1 al 10, según el cliente. Verde 7-8 es el rango de trabajo; rojo 9-10, al límite. Tres rojos seguidos suelen pedir bajar la carga.
      <br>Si se equivocó al marcar: «Mover» lo pasa a otro día con todo lo que marcó; «Quitar» borra ese entreno con sus series. Solo ese entreno.
    </div>`;
}

window.entSubtab = (t) => { _ent.subtab = t; entVistaClientes(); };
window.entVerFase = (id) => {
  _ent.faseId = id; _ent.rutinaAbierta = null;
  _ent.mes = null;            // el mes de la fase anterior no vale para esta
  entVistaClientes();
};
window.entToggleRutina = (id) => {
  _ent.rutinaAbierta = _ent.rutinaAbierta === id ? null : id;
  entVistaClientes();
};

// =====================================================
// CALENDARIO DE LA FASE
// =====================================================
// Reparte las rutinas sobre los días de la semana. Dos reglas, en este orden:
//   1. La rutina que declara sus días manda: va a todos ellos.
//   2. Las que no declaran nada se reparten, por `dia_orden`, sobre los días
//      que la fase declaró (dias_semana), saltándose los ya ocupados.
// Así el coach ve la semana real aunque no haya fijado día por día.
//
// Una rutina puede caer en VARIOS días, y eso no es un adorno: Andrea tiene
// dos rutinas repartidas en cuatro días (A-B-A-B), igual que Amauri y Diana.
// Con un solo `dia_semana` por rutina esa semana no se podía ni guardar.
function entRepartirRutinas(fase, todas) {
  // Los bloques complementarios (un recovery) no se reparten: van aparte,
  // debajo de la fuerza (entreno-bloques.js).
  const rutinas = (todas || []).filter(x => typeof entEsBloque !== 'function' || !entEsBloque(x));
  const porDia = {};
  ENT_DIAS.forEach(([d]) => { porDia[d] = null; });

  // Por `dia_orden` para que, si dos rutinas se pelean el mismo día, gane
  // siempre la misma y el calendario no baile entre recargas.
  const porOrden = rutinas.slice().sort((a, b) => (a.dia_orden || 0) - (b.dia_orden || 0));
  const fijadas = porOrden.filter(r => entDiasDe(r).length);
  const libres = porOrden.filter(r => !entDiasDe(r).length);

  fijadas.forEach(r => {
    entDiasDe(r).forEach(d => { if (porDia[d] === null) porDia[d] = { r, fijada: true }; });
  });

  const diasFase = (fase?.dias_semana || []).filter(d => porDia[d] === null);
  libres.forEach((r, i) => {
    const d = diasFase[i];
    if (d) porDia[d] = { r, fijada: false };
  });

  // Rutinas que no cupieron: más rutinas que días declarados en la fase.
  const colocadas = new Set(Object.values(porDia).filter(Boolean).map(x => x.r.id));
  const sinDia = rutinas.filter(r => !colocadas.has(r.id));
  return { porDia, sinDia };
}

// Los días de una rutina. `dias_semana` (lista) es lo que manda; el viejo
// `dia_semana` (un día suelto) se sigue leyendo para las rutinas que aún no
// han pasado por `migracion-calendario.sql`. En cuanto la corras, todas
// tienen lista y esta segunda rama deja de usarse sola.
function entDiasDe(r) {
  if (Array.isArray(r?.dias_semana) && r.dias_semana.length) return r.dias_semana;
  return r?.dia_semana ? [r.dia_semana] : [];
}
// Para pintarla: "L M X" en orden de semana, nunca alfabético.
const entDiasTexto = (r) => entDiasDe(r)
  .slice().sort((a, b) => 'LMXJVSD'.indexOf(a) - 'LMXJVSD'.indexOf(b))
  .map(d => entLabel(ENT_DIAS, d)).join(' · ');

// ---------- Fechas, en local ----------
// `toISOString()` trabaja en UTC: en Colombia (UTC-5) una fecha construida a
// medianoche local sale bien por los pelos, pero basta un viaje al otro lado
// del meridiano para que el calendario se corra un día entero. Estas dos
// funciones nunca tocan UTC.
function evtISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function evtDia(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
function evtSumarDias(iso, n) {
  const d = evtDia(iso);
  d.setDate(d.getDate() + n);
  return evtISO(d);
}
// Lunes = 0 … domingo = 6. getDay() da domingo = 0, que descuadra la semana
// española en todos los cálculos si se usa tal cual.
const evtOffsetDia = (iso) => (evtDia(iso).getDay() + 6) % 7;
const EVT_CODIGO_DIA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const evtCodigoDe = (iso) => EVT_CODIGO_DIA[evtOffsetDia(iso)];

// En qué semana de la fase estamos hoy (1..semanas), o null si no arrancó.
function entSemanaActual(fase) {
  if (!fase?.fecha_inicio || !fase?.semanas) return null;
  const ini = new Date(fase.fecha_inicio + 'T00:00:00');
  const hoy = new Date(fmt.hoy() + 'T00:00:00');
  const dias = Math.floor((hoy - ini) / 86400000);
  if (dias < 0) return null;
  const semana = Math.floor(dias / 7) + 1;
  return semana > fase.semanas ? null : semana;
}

// ---------- El mes ----------
// Antes esto era una tira de 7 casillas: la semana tipo, siempre la misma.
// Servía para ver "los lunes hace Push", pero no para lo que de verdad se
// pregunta al planificar — en qué fecha empieza, cuándo se acaba, en qué
// semana vamos, y qué días el cliente entrenó de verdad y cuáles se saltó.
// Eso solo se ve en un mes.
//
// Se pinta en dos tiempos: el armazón sale de una (para que el clic en la
// pestaña responda al instante) y las sesiones y los eventos entran cuando
// llegan de la red.
function entCalendarioHTML(cliente, fase, rutinas, ejerciciosPorRutina) {
  if (!fase) return '<div class="card text-center text-slate-500 py-8">Elige una fase.</div>';
  return `<div id="ent-cal">${entCalendarioArmazon(cliente, fase, rutinas, ejerciciosPorRutina, null, null, null)}</div>`;
}

// Mes que se está mirando, 'YYYY-MM'. Arranca en el de la fecha de inicio de
// la fase, no en el de hoy: al abrir una fase que empieza el mes que viene lo
// que quieres ver es esa fase, no un mes vacío.
function entMesVisible(fase) {
  if (_ent.mes) return _ent.mes;
  const hoy = fmt.hoy().slice(0, 7);
  if (!fase?.fecha_inicio) return hoy;
  const ini = String(fase.fecha_inicio).slice(0, 7);
  const fin = (entFechaFin(fase) || '').slice(0, 7);
  // Si hoy cae dentro de la fase, manda hoy; si no, el arranque.
  return (fin && hoy >= ini && hoy <= fin) ? hoy : ini;
}

window.entMes = (delta) => {
  const [y, m] = entMesVisible(_ent.faseCache).split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  _ent.mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  entVistaClientes();
};
window.entMesHoy = () => { _ent.mes = fmt.hoy().slice(0, 7); entVistaClientes(); };

const ENT_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                   'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Qué rutina toca cada fecha. Sale del reparto por día de la semana, que es
// como se planifica ("los lunes, Push"), aplicado a todos los días del mes
// que caen dentro de la fase.
function entRutinaPorFecha(fase, rutinas) {
  const { porDia, sinDia } = entRepartirRutinas(fase, rutinas);
  return { porDia, sinDia };
}

function entCalendarioArmazon(cliente, fase, rutinas, ejerciciosPorRutina, sesionesPorFecha, eventosPorFecha, faltaTabla, rutinaDe = null) {
  const { porDia, sinDia } = entRutinaPorFecha(fase, rutinas);
  const semanaHoy = entSemanaActual(fase);
  const finFase = entFechaFin(fase);
  const hoy = fmt.hoy();
  const mes = entMesVisible(fase);
  const [anio, mesNum] = mes.split('-').map(Number);

  // La rejilla arranca el lunes de la semana del día 1 y termina el domingo
  // de la del último: así el mes siempre son filas completas de 7.
  const primero = `${mes}-01`;
  const arranque = evtSumarDias(primero, -evtOffsetDia(primero));
  const ultimo = evtISO(new Date(anio, mesNum, 0));
  const cierre = evtSumarDias(ultimo, 6 - evtOffsetDia(ultimo));

  // Su fecha de corte, igual que se la muestra su app: el día de pago de su
  // ficha (si el mes es más corto, el último día). Solo clientes activos.
  const cortes = new Set();
  const diaPago = Number(cliente?.dia_pago);
  if (String(cliente?.estado || 'activo').toLowerCase() === 'activo' && diaPago >= 1 && diaPago <= 31) {
    for (let k = -1; k <= 1; k++) {
      const t = new Date(anio, mesNum - 1 + k, 1);
      const ultimoDia = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
      cortes.add(evtISO(new Date(t.getFullYear(), t.getMonth(), Math.min(diaPago, ultimoDia))));
    }
  }
  const celdas = [];
  for (let f = arranque; f <= cierre; f = evtSumarDias(f, 1)) {
    celdas.push(entCeldaDia(f, { fase, finFase, hoy, mesNum, porDia, ejerciciosPorRutina,
                                 sesionesPorFecha, eventosPorFecha, rutinaDe, corte: cortes.has(f) }));
  }

  const cabecera = `
    <div class="card mb-3">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="font-bold text-slate-900">${escapeHtml(fase.nombre)}</div>
          <div class="text-xs text-slate-500 mt-0.5">
            ${fase.semanas || '?'} semana${fase.semanas === 1 ? '' : 's'}
            ${fase.fecha_inicio
              ? ` · ${fmt.fechaCorta(fase.fecha_inicio)}${finFase ? ` → ${fmt.fechaCorta(finFase)}` : ''}`
              : ' · <strong class="text-amber-700">sin fecha de inicio</strong>'}
            ${semanaHoy ? ` · <strong class="text-emerald-700">vas en la semana ${semanaHoy} de ${fase.semanas}</strong>` : ''}
          </div>
          ${fase.objetivo ? `<div class="text-xs text-slate-600 mt-1">🎯 ${escapeHtml(fase.objetivo)}</div>` : ''}
        </div>
        <div class="flex gap-1 flex-wrap min-w-0">
          <button class="btn btn-ghost btn-sm" onclick="entNuevaActividad()" data-cal-actividad title="Caminadora, caminata, natación, tenis… del mismo catálogo que usa tu cliente">+ Cardio o deporte</button>
          <button class="btn btn-ghost btn-sm" onclick="entActividadesLote()" data-cal-lote title="Añadir, quitar o mover fuerza, cardio y deportes entre dos fechas, por días de la semana">☰ En lote</button>
          <button class="btn btn-ghost btn-sm" onclick="entNuevoEvento()">+ Evento</button>
          <button class="btn btn-ghost btn-sm" onclick="entDuplicarCiclo('${fase.id}')" data-cal-copiar title="Crea el ciclo siguiente con estas rutinas, sus días, y el cardio y deportes que se repiten">⧉ Copiar este ciclo al siguiente</button>
          <button class="btn btn-secondary btn-sm" onclick="entEditarFase('${fase.id}')">Editar fase</button>
        </div>
      </div>
      ${semanaHoy ? `
        <div class="mt-2">
          <div class="ent-progreso"><div class="ent-progreso-relleno" style="width:${Math.round(semanaHoy / fase.semanas * 100)}%"></div></div>
        </div>` : ''}
      ${!fase.fecha_inicio ? `
        <p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mt-2">
          Sin fecha de inicio el calendario no sabe en qué días cae la fase.
          <button class="btn btn-ghost btn-sm" onclick="entEditarFase('${fase.id}')">Ponerla</button>
        </p>` : ''}
    </div>`;

  const navegacion = `
    <div class="flex items-center justify-between gap-2 mb-2">
      <div class="flex items-center gap-1">
        <button class="btn btn-ghost btn-sm" onclick="entMes(-1)" title="Mes anterior">←</button>
        <div class="font-bold text-slate-800 text-sm min-w-[9rem] text-center">
          ${ENT_MESES[mesNum - 1]} ${anio}
        </div>
        <button class="btn btn-ghost btn-sm" onclick="entMes(1)" title="Mes siguiente">→</button>
      </div>
      <button class="btn btn-ghost btn-sm ${mes === hoy.slice(0, 7) ? 'opacity-40' : ''}" onclick="entMesHoy()">Hoy</button>
    </div>`;

  return cabecera + navegacion + `
    <div class="ent-mes-scroll">
      <div class="ent-mes-cabecera">
        ${ENT_DIAS.map(([, lab]) => `<div>${lab}</div>`).join('')}
      </div>
      <div class="ent-mes" ondragover="entCalDragOver(event)" ondrop="entCalDrop(event)">${celdas.join('')}</div>
    </div>
    ${entCalendarioPie(fase, sinDia, rutinas, faltaTabla)}`;
}

// Una casilla del mes.
function entCeldaDia(f, ctx) {
  const { fase, finFase, hoy, mesNum, porDia, ejerciciosPorRutina,
          sesionesPorFecha, eventosPorFecha, rutinaDe, corte = false } = ctx;
  const dia = Number(f.slice(8, 10));
  const deOtroMes = Number(f.slice(5, 7)) !== mesNum;
  const dentroFase = !!fase.fecha_inicio && f >= fase.fecha_inicio && (!finFase || f <= finFase);
  const esHoy = f === hoy;
  const codigo = evtCodigoDe(f);
  let slot = dentroFase ? porDia[codigo] : null;
  // Con los cambios de un solo día ya leídos, manda lo de ESA fecha.
  let quien = null;
  if (dentroFase && rutinaDe) {
    const r = rutinaDe(f);
    quien = rutinaDe.quien(f);
    slot = r ? { r, fijada: slot && slot.r.id === r.id ? slot.fijada : true } : null;
  }

  const clases = ['ent-celda'];
  if (deOtroMes) clases.push('ent-celda-fuera');
  if (!dentroFase) clases.push('ent-celda-off');
  if (esHoy) clases.push('ent-celda-hoy');

  // Semana 1..N dentro de la fase — es como se habla de la planificación.
  let semana = null;
  if (dentroFase) {
    const off = Math.floor((evtDia(f) - evtDia(fase.fecha_inicio)) / 86400000);
    semana = Math.floor(off / 7) + 1;
  }

  const trozos = [];
  // Lo que el cliente también ve ese día: inicio y fin del ciclo.
  if (dentroFase && f === fase.fecha_inicio) trozos.push('<div class="ent-chip ent-chip-marca" data-cal-inicio title="Empieza el ciclo">⚑ Empieza el ciclo</div>');
  if (dentroFase && finFase && f === finFase) trozos.push('<div class="ent-chip ent-chip-marca" data-cal-fin title="Último día del ciclo">⚑ Último día del ciclo</div>');

  if (slot) {
    const r = slot.r;
    const n = (ejerciciosPorRutina[r.id] || []).length;
    // Lo que el cliente marcó ese día, si ya llegó de la red.
    const ses = sesionesPorFecha ? (sesionesPorFecha[f] || []).find(x => x.rutina_id === r.id) : null;
    // Como en la app: negra = hecha, gris = por hacer, borde rojo = le
    // tocaba y no la hizo. El ✓ del día va junto al número.
    const estado = ses ? (ses.estado === 'completada' ? 'hecha' : ses.estado === 'saltada' ? 'falto' : '')
      : dentroFase && f < hoy ? 'falto' : 'porhacer';
    const marca = ses && ses.estado === 'completada' ? '' : entMarcaSesion(ses, f, hoy, dentroFase).replace(/<span class="ent-marca ent-marca-vacia"[^>]*>·<\/span>/, '');
    trozos.push(`
      <div class="ent-chip ent-chip-rutina ${estado ? 'ent-chip-' + estado : ''} ${slot.fijada ? '' : 'ent-chip-sugerida'} ${quien ? 'ent-chip-un-dia' : ''}"
           draggable="true" data-rutina="${r.id}" data-dia="${codigo}" ${quien ? `data-cambio="${quien}"` : ''}
           ondragstart="entCalDragStart(event)" ondragend="entCalDragEnd(event)"
           onclick="event.stopPropagation(); entAbrirRutinaDesdeCalendario('${r.id}')"
           title="${escapeHtml(r.nombre)} · ${n} ejercicio${n === 1 ? '' : 's'}${slot.fijada ? '' : ' · día sugerido, no fijado'}${quien === 'coach' ? ' · solo este día (lo cambiaste tú)' : quien === 'cliente' ? ' · la movió o añadió tu cliente' : ''}&#10;Arrástrala a otro día para moverla">
        ${marca}<span class="ent-chip-txt">${quien === 'cliente' ? '<span class="ent-chip-quien" title="La movió o añadió tu cliente">↔</span> ' : ''}${escapeHtml(r.nombre)}</span>
        <button type="button" class="ent-chip-quitar" data-quitar-rutina="${r.id}" title="Quitar (este día o todos los ${ENT_DIA_PLURAL[codigo] || codigo})"
                onclick="event.stopPropagation(); typeof fzQuitarRutina === 'function' ? fzQuitarRutina('${r.id}', '${f}') : entQuitarRutinaDia('${r.id}', '${codigo}')">✕</button>
      </div>`);
  }

  // Los bloques complementarios de ese día, debajo de la fuerza.
  const bloques = dentroFase && typeof bqDelDia === 'function' ? bqDelDia(fase, _ent.rutinasCache || [], f) : [];
  if (bloques.length) trozos.push(bqChipsCelda(f, { fase, rutinas: _ent.rutinasCache || [], sesionesPorFecha, hoy }));

  const evs = eventosPorFecha ? (eventosPorFecha[f] || []) : [];
  // Un día puede tener varias actividades: cada una es su propio chip, se
  // arrastra a otro día y se quita con su ✕ (solo ESE día si se repite).
  evs.forEach(ev => {
    const hecho = _ent.eventosHechos && _ent.eventosHechos.has(`${ev.id}:${f}`);
    trozos.push(`
      <div class="ent-chip ent-chip-evento" style="--evc:${evtColor(ev)}" draggable="true" data-evento="${ev.id}"
           ondragstart="entEvDragStart(event)" ondragend="entCalDragEnd(event)"
           onclick="event.stopPropagation(); entDiaPanel('${f}')"
           title="${escapeHtml(evtLabel(ev.tipo))}${ev.detalle ? ' · ' + escapeHtml(ev.detalle) : ''}&#10;Arrástrala a otro día para moverla">
        <span class="ent-chip-txt">${hecho ? '<span class="ent-chip-hecho" title="Lo marcó como hecho">✓</span> ' : ''}${ev.hora ? `${String(ev.hora).slice(0, 5)} ` : ''}${escapeHtml(ev.titulo)}${(() => { const v = (_ent.registrosValor || {})[`${ev.id}:${f}`]; return v != null ? ` · <b>${String(v).replace('.', ',')} kg</b>` : ''; })()}${ev.auto ? ' <span class="ent-chip-auto" title="Lo puso el sistema: primer día de la última semana del ciclo">·auto</span>' : ''}</span>
        ${hecho ? '' : `<button type="button" class="ent-chip-quitar" data-quitar-evento="${ev.id}" title="Quitar de este día"
                onclick="event.stopPropagation(); entQuitarEventoDia('${ev.id}', '${f}')">✕</button>`}
      </div>`);
  });

  // El cardio y los deportes que registró por su cuenta (sin que se los
  // pusieras): salen igual que en su calendario.
  ((_ent.actividadesSuyas || {})[f] || []).forEach(a => trozos.push(`
      <div class="ent-chip ent-chip-suya" data-actividad-suya="${a.id || ''}" title="La registró él por su cuenta">
        <span class="ent-chip-txt">+ ${escapeHtml(a.titulo || (((typeof _evtCatalogo !== 'undefined' && _evtCatalogo) || (typeof EVT_CATALOGO_MINIMO !== 'undefined' ? EVT_CATALOGO_MINIMO : [])).find(c => c.slug === a.tipo)?.nombre || a.tipo) || 'Actividad')}${a.duracion_min ? ` · ${a.duracion_min} min` : ''}</span>
      </div>`));
  // Su fecha de corte (lo mismo que ve en su app).
  if (corte) trozos.push('<div class="ent-chip ent-chip-pago" data-cal-corte title="Fecha de corte de su mensualidad">$ Corte de su mensualidad</div>');

  // Una sesión sin rutina asignada (el cliente entrenó por su cuenta) no
  // tendría dónde pintarse y se perdería. Se muestra igual.
  if (sesionesPorFecha) {
    (sesionesPorFecha[f] || []).filter(x => (!x.rutina_id || !slot || x.rutina_id !== slot.r.id) && !bloques.some(b => b.id === x.rutina_id))
      .forEach(x => trozos.push(`
        <div class="ent-chip ent-chip-suelta ${x.estado === 'completada' ? 'ent-chip-hecha' : ''}" title="Sesión registrada sin rutina del plan">
          ${x.estado === 'completada' ? '' : entMarcaSesion(x, f, hoy, true)}<span class="ent-chip-txt">${escapeHtml(x.rutinas?.nombre || 'Entrenó')}</span>
        </div>`));
  }

  return `
    <div class="${clases.join(' ')}" data-fecha="${f}"
         ondragover="entCalDragOver(event)" ondrop="entCalDrop(event)"
         onclick="entDiaPanel('${f}')"
         title="Clic para ver y añadir lo de este día">
      <div class="ent-celda-cab">
        <span class="ent-celda-izq"><span class="ent-celda-num">${dia}</span>${sesionesPorFecha && (sesionesPorFecha[f] || []).some(x => x.estado === 'completada') ? '<span class="ent-celda-ok ent-marca-ok" data-cal-entreno title="Entrenó ese día"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1F1F1F" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>' : ''}</span>
        ${semana && codigo === 'L' ? `<span class="ent-celda-sem">S${semana}</span>` : ''}
      </div>
      <div class="ent-celda-cuerpo">${trozos.join('')}</div>
    </div>`;
}

// El estado de la sesión, en un solo carácter. Es lo que responde "¿entrenó
// o no?" sin abrir nada.
function entMarcaSesion(ses, fecha, hoy, dentroFase) {
  if (ses) {
    if (ses.estado === 'completada') return '<span class="ent-marca ent-marca-ok" title="Lo marcó como hecho">✓</span>';
    if (ses.estado === 'saltada') return '<span class="ent-marca ent-marca-no" title="La saltó">✕</span>';
    return '<span class="ent-marca ent-marca-curso" title="La empezó y no la cerró">◐</span>';
  }
  // Un día pasado con rutina y sin sesión es la ausencia que importa: no la
  // marcó. Un día futuro simplemente no ha llegado.
  if (dentroFase && fecha < hoy) return '<span class="ent-marca ent-marca-vacia" title="No registró nada ese día">·</span>';
  return '';
}

function entCalendarioPie(fase, sinDia, rutinas, faltaTabla) {
  return `
    ${faltaTabla ? `
      <div class="card mt-3 border-l-4 border-amber-400">
        <div class="font-bold text-sm text-slate-800 mb-1">Los eventos todavía no están instalados</div>
        <p class="text-xs text-slate-600">
          Para poner natación, mediciones o citas en el calendario falta correr
          <code>carga/migracion-eventos.sql</code> en el SQL Editor de Supabase.
          El resto del calendario funciona igual.
        </p>
      </div>` : ''}
    ${rutinas.some(x => typeof entEsBloque === 'function' && entEsBloque(x)) ? `
      <div class="card mt-3" data-cal-bloques>
        <div class="font-bold text-sm text-slate-800 mb-1">Bloques complementarios</div>
        <p class="text-xs text-slate-600 mb-2">Van el mismo día que la fuerza, debajo de ella. Sus días se cambian en el panel de cada día o en «Datos de la rutina».</p>
        <div class="flex flex-wrap gap-1">
          ${rutinas.filter(x => entEsBloque(x)).map(r => `
            <div class="chip" onclick="entAbrirRutinaDesdeCalendario('${r.id}')" style="cursor:pointer">+ ${escapeHtml(r.nombre)} · ${entDiasDe(r).length ? escapeHtml(entDiasTexto(r)) : 'sin día fijo'}</div>`).join('')}
        </div>
      </div>` : ''}
    ${sinDia.length ? `
      <div class="card mt-3 border-l-4 border-amber-400">
        <div class="font-bold text-sm text-slate-800 mb-1">⚠️ ${sinDia.length} rutina(s) sin día en la semana</div>
        <p class="text-xs text-slate-600 mb-2">
          La fase declara ${(fase.dias_semana || []).length || 0} día(s) de entreno y hay ${rutinas.filter(x => typeof entEsBloque !== 'function' || !entEsBloque(x)).length} rutinas de fuerza.
          Arrastra una rutina a un día libre, añade días a la fase, o fíjale el día a cada rutina.
        </p>
        <div class="flex flex-wrap gap-1">
          ${sinDia.map(r => `
            <div class="chip" draggable="true" data-rutina="${r.id}" data-dia=""
                 ondragstart="entCalDragStart(event)" ondragend="entCalDragEnd(event)"
                 onclick="entAbrirRutinaDesdeCalendario('${r.id}')"
                 style="cursor:grab">${escapeHtml(r.nombre)}</div>
            ${typeof bqInstalado === 'function' && bqInstalado(rutinas) ? `<button class="btn btn-ghost btn-sm" data-sindia-bloque="${r.id}" title="Va todos los días debajo de la fuerza, sin quitarle el día"
                onclick="bqAnadir('${r.id}', 'L', true)">+ Ponerla como bloque diario</button>` : ''}`).join('')}
        </div>
      </div>` : ''}
    <div class="ent-leyenda">
      <span><span class="ent-marca ent-marca-ok">✓</span> lo hizo</span>
      <span><span class="ent-marca ent-marca-no">✕</span> la saltó</span>
      <span><span class="ent-marca ent-marca-curso">◐</span> la empezó</span>
      <span><span class="ent-marca ent-marca-vacia">·</span> no registró nada</span>
      <span><span class="ent-chip-quien">↔</span> lo movió o añadió él</span>
      <span><span style="color:#2F7F45;font-weight:800">+</span> cardio o deporte por su cuenta</span>
      <span><span style="color:#B8901C;font-weight:800">$</span> su fecha de corte</span>
      <span class="ent-leyenda-nota">
        Toca un día para poner, mover o quitar su fuerza y su cardio: <b>solo ese día</b> o <b>todos los lunes</b> (o el día que sea) del ciclo.
        Al arrastrar o tocar la ✕ también te pregunta. Para muchos días a la vez, «☰ En lote».
        Las de borde de color cambiaron solo ese día; con ↔ las movió o añadió tu cliente. Las <b>sugeridas</b> (borde punteado)
        no tienen día fijo: salen del reparto por orden sobre los días de la fase, y
        arrastrarlas las fija.
      </span>
    </div>`;
}

// ---------- Arrastrar rutinas entre días ----------
// Soltar una rutina en otro día le FIJA ese día. No mueve una fecha concreta:
// la planificación se piensa por día de la semana ("los lunes, Push"), y una
// fase de 8 semanas son 8 lunes, no uno.
//
// Como una rutina puede estar en varios días, arrastrar mueve SOLO el día del
// que la sacaste y le deja los otros. Sacar el lunes de una rutina que va
// lunes y miércoles y soltarlo en viernes la deja en miércoles y viernes.
window.entCalDragStart = (e) => {
  const chip = e.currentTarget;
  _ent.arrastrando = chip.dataset.rutina;
  // De qué día se sacó: es lo único que distingue mover el lunes de mover el
  // miércoles cuando la misma rutina está en los dos.
  const f = chip.closest('.ent-celda')?.dataset.fecha;
  _ent.arrastrandoDesde = f ? evtCodigoDe(f) : null;
  _ent.arrastrandoFecha = f || null;
  e.dataTransfer.effectAllowed = 'move';
  // Firefox no inicia el arrastre si no se escribe algo en el dataTransfer.
  e.dataTransfer.setData('text/plain', chip.dataset.rutina);
  chip.classList.add('ent-chip-arrastre');
  document.querySelector('.ent-mes')?.classList.add('ent-mes-arrastrando');
};

window.entCalDragEnd = (e) => {
  e.currentTarget.classList.remove('ent-chip-arrastre');
  document.querySelector('.ent-mes')?.classList.remove('ent-mes-arrastrando');
  document.querySelectorAll('.ent-celda-destino').forEach(c => c.classList.remove('ent-celda-destino'));
  _ent.arrastrando = null;
  _ent.arrastrandoDesde = null;
  _ent.arrastrandoFecha = null;
  _ent.arrastrandoEv = null;
};

window.entCalDragOver = (e) => {
  if (!_ent.arrastrando && !_ent.arrastrandoEv) return;
  const celda = e.target.closest('.ent-celda');
  if (!celda || celda.classList.contains('ent-celda-off')) return;
  e.preventDefault();                       // sin esto el navegador no deja soltar
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.ent-celda-destino').forEach(c => c.classList.remove('ent-celda-destino'));
  celda.classList.add('ent-celda-destino');
};

window.entCalDrop = async (e) => {
  if (_ent.arrastrandoEv) return entEvDrop(e);
  const id = _ent.arrastrando;
  const celda = e.target.closest('.ent-celda');
  if (!id || !celda || celda.classList.contains('ent-celda-off')) return;
  e.preventDefault();
  e.stopPropagation();                      // que no dispare el "+ evento" de la celda

  const destino = evtCodigoDe(celda.dataset.fecha);
  const desde = _ent.arrastrandoDesde;
  const desdeFecha = _ent.arrastrandoFecha;
  const rutinas = _ent.rutinasCache || [];
  const r = rutinas.find(x => x.id === id);
  _ent.arrastrando = null;
  _ent.arrastrandoDesde = null;
  _ent.arrastrandoFecha = null;
  // ¿Solo ese día o todos los lunes? (entreno-dias.js)
  if (r && typeof fzSoltarRutina === 'function') return fzSoltarRutina(r.id, desdeFecha, desde, celda.dataset.fecha);
  if (!r || desde === destino) return entVistaClientes();

  // Quita el día del que se sacó y añade el nuevo. Los demás días de esa
  // rutina no se tocan.
  const mover = (dias, quita, pon) => {
    const s = new Set(dias);
    if (quita) s.delete(quita);
    s.add(pon);
    return [...s].sort((a, b) => 'LMXJVSD'.indexOf(a) - 'LMXJVSD'.indexOf(b));
  };

  // Si el día ya lo ocupa otra rutina, se intercambian. Dejar dos rutinas el
  // mismo día las apilaría y una quedaría invisible.
  const ocupa = rutinas.find(x => x.id !== id && (typeof entEsBloque !== 'function' || !entEsBloque(x)) && entDiasDe(x).includes(destino));
  await entDb.actualizarRutina(id, { dias_semana: mover(entDiasDe(r), desde, destino) });
  if (ocupa && desde) {
    await entDb.actualizarRutina(ocupa.id, { dias_semana: mover(entDiasDe(ocupa), destino, desde) });
  } else if (ocupa) {
    // Venía de "sugerida" (sin día propio): la otra rutina solo pierde el día.
    await entDb.actualizarRutina(ocupa.id, {
      dias_semana: entDiasDe(ocupa).filter(d => d !== destino),
    });
  }

  toast(ocupa
    ? `${r.nombre} ↔ ${ocupa.nombre}`
    : `${r.nombre} → ${entLabel(ENT_DIAS, destino)}`);
  entVistaClientes();
};

// ---------- Eventos en el calendario ----------
window.entNuevoEvento = (fecha = null) => {
  if (!_ent.clienteId) return;
  evtEditar(fecha ? { fecha } : {}, entCtxEvento());
};

// Cardio o deporte: el editor de eventos ya abierto en «Actividad», con el
// catálogo del cliente para elegir con un toque.
window.entNuevaActividad = (fecha = null) => {
  if (!_ent.clienteId) return;
  evtEditar(fecha ? { tipo: 'actividad', fecha } : { tipo: 'actividad' }, entCtxEvento());
};

window.entEditarEvento = (id) => {
  const ev = (_ent.eventosCache || []).find(x => x.id === id);
  if (!ev) return;
  evtEditar(ev, entCtxEvento());
};

function entCtxEvento() {
  return {
    clienteId: _ent.clienteId,
    fase: _ent.faseCache,
    fases: _ent.fases || (_ent.faseCache ? [_ent.faseCache] : []),
    eventos: _ent.eventosCache || [],
    alGuardar: () => { _ent.eventosCache = null; entVistaClientes(); },
  };
}

// ---------- Poner y quitar rutinas de fuerza desde el calendario ----------
// Igual que el arrastre: por DÍA DE LA SEMANA. «Push los lunes» es todos los
// lunes del ciclo; así se piensa el plan y así lo lee la app del cliente.
const ENT_DIA_PLURAL = { L: 'lunes', M: 'martes', X: 'miércoles', J: 'jueves', V: 'viernes', S: 'sábados', D: 'domingos' };
const entOrdenDias = (ds) => [...new Set(ds)].sort((a, b) => 'LMXJVSD'.indexOf(a) - 'LMXJVSD'.indexOf(b));

window.entQuitarRutinaDia = async (rutinaId, codigo) => {
  const rutinas = _ent.rutinasCache || [], fase = _ent.faseCache;
  const r = rutinas.find(x => x.id === rutinaId);
  if (!r || !fase) return;
  if (!confirm(`¿Quitar ${r.nombre} de todos los ${ENT_DIA_PLURAL[codigo] || codigo} del ciclo?`)) return;
  if (entDiasDe(r).includes(codigo)) {
    await entDb.actualizarRutina(r.id, { dias_semana: entDiasDe(r).filter(d => d !== codigo), dia_semana: null });
  }
  // Que ese día quede libre de verdad: si ninguna rutina lo tiene, sale de los
  // días de la fase (si no, otra rutina sin día se acomodaría ahí sola).
  if (!rutinas.some(x => x.id !== r.id && (typeof entEsBloque !== 'function' || !entEsBloque(x)) && entDiasDe(x).includes(codigo)) && (fase.dias_semana || []).includes(codigo)) {
    await entDb.actualizarFase(fase.id, { dias_semana: (fase.dias_semana || []).filter(d => d !== codigo) });
  }
  toast(`${r.nombre}: ya no va los ${ENT_DIA_PLURAL[codigo] || codigo}`);
  if ($('#modal-content [data-dia-panel]')) closeModal();
  entVistaClientes();
};

window.entPonerRutinaDia = async (rutinaId, codigo) => {
  const rutinas = _ent.rutinasCache || [], fase = _ent.faseCache;
  const r = rutinas.find(x => x.id === rutinaId);
  if (!r || !fase) return;
  // Una rutina por día: la que estaba ahí deja ese día (sus otros días siguen).
  const ocupan = rutinas.filter(x => x.id !== r.id && (typeof entEsBloque !== 'function' || !entEsBloque(x)) && entDiasDe(x).includes(codigo));
  for (const o of ocupan) await entDb.actualizarRutina(o.id, { dias_semana: entDiasDe(o).filter(d => d !== codigo), dia_semana: null });
  await entDb.actualizarRutina(r.id, { dias_semana: entOrdenDias([...entDiasDe(r), codigo]), dia_semana: null });
  if (!(fase.dias_semana || []).includes(codigo)) await entDb.actualizarFase(fase.id, { dias_semana: entOrdenDias([...(fase.dias_semana || []), codigo]) });
  toast(`${r.nombre} → todos los ${ENT_DIA_PLURAL[codigo] || codigo}` + (ocupan.length ? ` (en lugar de ${ocupan.map(o => o.nombre).join(', ')})` : ''));
  if ($('#modal-content [data-dia-panel]')) closeModal();
  entVistaClientes();
};

window.entActividadesLote = () => {
  if (!_ent.clienteId) return;
  evtLote(entCtxEvento());
};

// ---------- Arrastrar una actividad a otro día ----------
// Mueve ESE día: si se repite, sale de ese día y queda suelta en el nuevo.
window.entEvDragStart = (e) => {
  const chip = e.currentTarget;
  _ent.arrastrandoEv = { id: chip.dataset.evento, desde: chip.closest('.ent-celda')?.dataset.fecha };
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', chip.dataset.evento);
  chip.classList.add('ent-chip-arrastre');
  document.querySelector('.ent-mes')?.classList.add('ent-mes-arrastrando');
  e.stopPropagation();
};

async function entEvDrop(e) {
  const a = _ent.arrastrandoEv;
  const celda = e.target.closest('.ent-celda');
  _ent.arrastrandoEv = null;
  if (!a || !celda || celda.classList.contains('ent-celda-off')) return;
  e.preventDefault();
  e.stopPropagation();
  const ev = (_ent.eventosCache || []).find(x => x.id === a.id);
  const hasta = celda.dataset.fecha;
  if (!ev || !a.desde || a.desde === hasta) return;
  if (typeof fzSoltarEvento === 'function') return fzSoltarEvento(ev, a.desde, hasta);
  const r = await evtMoverUnDia(ev, a.desde, hasta, _ent.faseCache);
  if (r === 'hecho') return toast('Ese día ya lo marcó como hecho: no se mueve');
  if (r !== 'ok') return;
  toast(`${ev.titulo} → ${fmt.fechaCorta(hasta)}`);
  _ent.eventosCache = null;
  entVistaClientes();
}

window.entQuitarEventoDia = async (id, fecha) => {
  const ev = (_ent.eventosCache || []).find(x => x.id === id);
  if (!ev) return;
  if (typeof fzQuitarEvento === 'function') return fzQuitarEvento(ev, fecha);
  const r = await evtQuitarUnDia(ev, fecha);
  if (r === 'hecho') return toast('Ese día ya lo marcó como hecho: queda en su historial');
  if (r !== 'ok') return;
  toast(`${ev.titulo}: quitado el ${fmt.fechaCorta(fecha)}`);
  _ent.eventosCache = null;
  if ($('#modal-content [data-dia-panel]')) closeModal();
  entVistaClientes();
};

// ---------- Lo de un día ----------
// Todo lo que cae ese día, cada cosa con su ✕, y desde aquí se añade OTRA
// (tocar una actividad ya puesta abría su edición y era fácil cambiarla por
// otra en vez de sumar).
window.entDiaPanel = (fecha) => {
  if (!_ent.clienteId) return;
  const evs = (_ent.eventosPorFecha || {})[fecha] || [];
  const celda = document.querySelector(`.ent-celda[data-fecha="${fecha}"]`);
  const enFase = !!celda && !celda.classList.contains('ent-celda-off');
  const codigo = evtCodigoDe(fecha);
  const rutinas = _ent.rutinasCache || [];
  const rutinaId = celda?.querySelector('.ent-chip-rutina')?.dataset.rutina || null;
  const rutinaObj = rutinas.find(x => x.id === rutinaId) || null;
  const plural = ENT_DIA_PLURAL[codigo] || codigo;
  const fuerza = !enFase ? '' : `
    <div data-dia-fuerza class="rounded-xl p-3 mb-3" style="background:#f1f5f9">
      <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Fuerza · todos los ${plural} del ciclo</div>
      ${rutinaObj ? `
        <div class="flex items-center gap-2 mb-2">
          <div class="flex-1 min-w-0 text-sm font-bold text-slate-800 truncate">${escapeHtml(rutinaObj.nombre)}</div>
          <button class="btn btn-ghost btn-sm" onclick="closeModal(); entAbrirRutinaDesdeCalendario('${rutinaObj.id}')">Abrir</button>
          <button class="btn btn-ghost btn-sm text-red-600" data-dia-quitar-rutina onclick="entQuitarRutinaDia('${rutinaObj.id}', '${codigo}')">✕ Quitar</button>
        </div>` : '<div class="text-sm text-slate-500 mb-2">Este día no tiene rutina de fuerza.</div>'}
      ${rutinas.filter(x => x.id !== rutinaId && (typeof entEsBloque !== 'function' || !entEsBloque(x))).length ? `
        <div class="flex gap-2 items-center">
          <select id="dia-rutina" class="flex-1 min-w-0 text-sm">
            ${rutinas.filter(x => x.id !== rutinaId && (typeof entEsBloque !== 'function' || !entEsBloque(x))).map(x => `<option value="${x.id}">${escapeHtml(x.nombre)}${entDiasDe(x).length ? ` · ${escapeHtml(entDiasTexto(x))}` : ''}</option>`).join('')}
          </select>
          <button class="btn btn-secondary btn-sm" data-dia-poner-rutina onclick="entPonerRutinaDia($('#dia-rutina').value, '${codigo}')">${rutinaObj ? 'Cambiar por esta' : 'Poner'}</button>
        </div>` : (rutinas.length ? '' : '<div class="text-xs text-slate-500">Esta fase todavía no tiene rutinas: créalas en «Rutinas».</div>')}
    </div>`;
  const filas = evs.map(ev => {
    const hecho = _ent.eventosHechos && _ent.eventosHechos.has(`${ev.id}:${fecha}`);
    const repite = !ev.fecha && (ev.dias_semana || []).length;
    return `
      <div class="flex items-center gap-2 py-2 border-b border-slate-100" data-dia-evento="${ev.id}">
        <span style="width:8px;height:8px;border-radius:99px;background:${evtColor(ev)};flex:none"></span>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-semibold text-slate-800">${ev.hora ? `${String(ev.hora).slice(0, 5)} · ` : ''}${escapeHtml(ev.titulo)}${hecho ? ' <span class="text-emerald-700">✓ hecho</span>' : ''}</div>
          <div class="text-xs text-slate-500">${escapeHtml(evtLabel(ev.tipo))}${ev.duracion_min ? ` · ${ev.duracion_min} min` : ''}${repite ? ` · se repite ${(ev.dias_semana || []).join(' ')}` : ' · solo este día'}</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="closeModal(); entEditarEvento('${ev.id}')">Editar</button>
        ${hecho ? '' : `<button class="btn btn-ghost btn-sm text-red-600" data-dia-quitar="${ev.id}" onclick="entQuitarEventoDia('${ev.id}', '${fecha}')">✕ Quitar ${repite ? 'este día' : ''}</button>`}
      </div>`;
  }).join('');
  openModal(modalShell(`${fmt.fechaCorta(fecha)}`, `
    <div data-dia-panel="${fecha}">
      ${typeof fzPanelFuerza === 'function' ? fzPanelFuerza(fecha) : fuerza}
      ${typeof bqPanel === 'function' ? bqPanel(fecha) : ''}
      <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Cardio, deportes y eventos · solo este día</div>
      ${filas || '<p class="text-sm text-slate-500 py-2">No tiene cardio, deportes ni eventos.</p>'}
      <div class="flex gap-2 flex-wrap mt-3">
        <button class="btn btn-primary btn-sm" data-dia-agregar onclick="closeModal(); entNuevaActividad('${fecha}')">+ ${evs.length ? 'Otra actividad' : 'Cardio o deporte'} este día</button>
        <button class="btn btn-ghost btn-sm" onclick="closeModal(); entNuevoEvento('${fecha}')">+ Evento este día</button>
      </div>
    </div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>`));
};

// ---------- La segunda pasada: sesiones y eventos ----------
// El armazón ya está en pantalla; esto rellena lo que hubo que ir a buscar.
async function entPintarCalendario(cliente, fase, rutinas, ejerciciosPorRutina) {
  const caja = $('#ent-cal');
  if (!caja || !fase) return;

  const desde = fase.fecha_inicio || null;
  const [sesiones, eventos, registros, hechasAct] = await Promise.all([
    entDb.sesiones(cliente.id, { desde, limite: 400 }),
    evtDb.lista(cliente.id),
    evtDb.registros(cliente.id, desde),
    // Todo el cardio y los deportes que registró: lo que marcó con «Ya lo
    // hice» (ligado a un evento tuyo) y lo que añadió por su cuenta. Así el
    // calendario dice lo mismo que el suyo.
    (async () => {
      const leer = async (campos) => {
        let q = sb.from('actividades').select(campos).eq('cliente_id', cliente.id);
        if (desde) q = q.gte('fecha', desde);
        const { data, error } = await q;
        if (error) throw error;
        return data || [];
      };
      try { return await leer('id, evento_id, fecha, tipo, titulo, duracion_min'); }
      catch (e) { try { return await leer('id, fecha, tipo, titulo, duracion_min'); } catch (e2) { return []; } }
    })(),
  ]);

  _ent.eventosCache = eventos || [];
  // Lo que ya marcó de lo que le pusiste: «evento:fecha».
  _ent.eventosHechos = new Set([
    ...(registros || []).filter(r => r.estado === 'hecho').map(r => `${r.evento_id}:${String(r.fecha).slice(0, 10)}`),
    ...(hechasAct || []).filter(a => a.evento_id).map(a => `${a.evento_id}:${String(a.fecha).slice(0, 10)}`),
  ]);

  // Lo que registró al marcar (el peso que puso) y lo que hizo por su cuenta.
  _ent.registrosValor = Object.fromEntries((registros || []).filter(r => r.estado === 'hecho' && r.valor != null)
    .map(r => [`${r.evento_id}:${String(r.fecha).slice(0, 10)}`, r.valor]));
  _ent.actividadesSuyas = {};
  (hechasAct || []).filter(a => !a.evento_id).forEach(a => { (_ent.actividadesSuyas[String(a.fecha).slice(0, 10)] ||= []).push(a); });

  const sesionesPorFecha = {};
  (sesiones || []).forEach(s => { (sesionesPorFecha[String(s.fecha).slice(0, 10)] ||= []).push(s); });

  // Los eventos que se repiten necesitan la fase para saber dónde caen. Se
  // indexan TODAS las fases del cliente, no solo la abierta: un evento de
  // otra fase que cae en este mes tiene que verse igual.
  const fasesPorId = Object.fromEntries((_ent.fases || [fase]).map(f => [f.id, f]));
  const eventosPorFecha = evtPorFecha(_ent.eventosCache, fasesPorId);
  _ent.eventosPorFecha = eventosPorFecha;
  _ent.sesionesPorFecha = sesionesPorFecha;
  // Lo que cambió UN día (el coach o el cliente): mover, poner, quitar.
  // Es lo mismo que ve la app (entreno-dias.js).
  const rutinaDe = typeof fzPreparar === 'function' ? await fzPreparar(fase, rutinas) : null;

  // Si `entVistaClientes` se repintó mientras esperábamos (otro cliente, otra
  // fase), esto ya no es la pantalla vigente y escribir aquí la pisaría.
  if (!$('#ent-cal') || _ent.clienteId !== cliente.id) return;
  caja.innerHTML = entCalendarioArmazon(cliente, fase, rutinas, ejerciciosPorRutina,
                                        sesionesPorFecha, eventosPorFecha, eventos === null, rutinaDe);
  entCalVivo(cliente, fase, rutinas, ejerciciosPorRutina);
}

// En tiempo real: mientras miras el calendario de un cliente, se vuelve a
// leer cada minuto (y al volver a la pestaña) lo que él marcó, movió o
// registró. No se repinta si tienes un panel abierto o estás arrastrando.
function entCalVivo(cliente, fase, rutinas, ejerciciosPorRutina) {
  clearInterval(_ent.calTimer);
  const tick = () => {
    if (!$('#ent-cal') || _ent.clienteId !== cliente.id || _ent.faseCache?.id !== fase.id) { clearInterval(_ent.calTimer); return; }
    if (document.visibilityState !== 'visible' || _ent.arrastrando || !document.getElementById('modal')?.classList.contains('hidden')) return;
    entPintarCalendario(cliente, fase, rutinas, ejerciciosPorRutina).catch(() => {});
  };
  _ent.calTimer = setInterval(tick, 60000);
  if (!_ent.calVisibilidad) {
    _ent.calVisibilidad = true;
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && typeof _ent.calTick === 'function') _ent.calTick(); });
  }
  _ent.calTick = tick;
}

window.entAbrirRutinaDesdeCalendario = (rutinaId) => {
  _ent.subtab = 'rutinas';
  _ent.rutinaAbierta = rutinaId;
  entVistaClientes();
};

// =====================================================
// LISTA DE RUTINAS · se despliegan con sus ejercicios
// =====================================================
// Antes, para ver qué tenía la rutina "Push" había que entrar al constructor,
// que es una pantalla de EDICIÓN completa. Aquí se ve de un clic, en modo
// lectura, y el constructor queda a un botón de distancia.
function entListaRutinasHTML(fase, rutinas, ejerciciosPorRutina) {
  if (!fase) return '<div class="card text-center text-slate-500 py-8">Elige una fase.</div>';
  if (!rutinas.length) {
    return `
      <div class="card text-center text-slate-500 py-8">
        <div class="mb-3">Esta fase no tiene rutinas todavía.</div>
        <div class="flex gap-2 justify-center flex-wrap">
          <button class="btn btn-primary btn-sm" onclick="entNuevaRutina('${fase.id}', '${_ent.clienteId}')">+ Rutina nueva</button>
          <button class="btn btn-secondary btn-sm" onclick="entAsignarPlantilla('${fase.id}')">↓ Traer de la biblioteca</button>
        </div>
      </div>`;
  }

  return (rutinas.length > 1 ? `<div class="flex justify-end mb-2"><button class="btn btn-ghost btn-sm" data-ir-mezcla onclick="entSubtab('mezcla')" title="Push + Pull → Upper, Upper + Lower → Full Body, o al revés">🔀 Unir o separar rutinas</button></div>` : '') + rutinas.map(r => {
    const ejs = ejerciciosPorRutina[r.id] || [];
    const abierta = _ent.rutinaAbierta === r.id;
    const series = ejs.reduce((a, e) => a + (e.series || 0), 0);
    return `
      <div class="card mb-2">
        <div class="flex items-center justify-between gap-2 flex-wrap cursor-pointer" onclick="entToggleRutina('${r.id}')">
          <div class="min-w-0 flex items-center gap-2">
            <span class="ent-flecha ${abierta ? 'ent-flecha-abierta' : ''}">▶</span>
            <div class="min-w-0">
              <div class="font-bold text-slate-900">${escapeHtml(r.nombre)}${typeof entEsBloque === 'function' && entEsBloque(r) ? ' <span class="tag" data-tag-bloque title="Va el mismo día que la fuerza, debajo de ella">Bloque complementario</span>' : ''}${entEtiquetaCicloHTML((_ent.cicloComp || {})[r.id])}</div>
              <div class="text-xs text-slate-500">
                Día ${r.dia_orden}${entDiasTexto(r) ? ` · ${entDiasTexto(r)}` : ''}
                · ${ejs.length} ejercicio${ejs.length === 1 ? '' : 's'}
                ${series ? ` · ${series} series` : ''}
                ${r.duracion_estimada_min ? ` · ${r.duracion_estimada_min} min` : ''}
              </div>
            </div>
          </div>
          <div class="flex gap-1 flex-shrink-0" onclick="event.stopPropagation()">
            <button class="btn btn-secondary btn-sm" onclick="entAbrirConstructor('${r.id}')">Construir</button>
            <button class="btn btn-ghost btn-sm" onclick="entCopiarRutinaA('${r.id}')" title="Copiar a otro cliente o fase">⇄</button>
            <button class="btn btn-ghost btn-sm" onclick="entBorrarRutina('${r.id}')">✕</button>
          </div>
        </div>
        ${abierta && (_ent.cicloComp || {})[r.id]?.cambios.length ? `<div class="mt-3 text-xs rounded-xl p-2.5" data-cambios-ciclo style="background:#FEF5EE;color:#7A3E14">
          <div class="font-bold mb-1">Cambios respecto al ciclo anterior</div>
          ${_ent.cicloComp[r.id].cambios.map(t => `<div>${escapeHtml(t)}</div>`).join('')}</div>` : ''}
        ${abierta ? `<div class="mt-3 pt-3 border-t border-slate-100">${entResumenEjerciciosHTML(ejs, r)}</div>` : ''}
      </div>`;
  }).join('') + `
    <div class="flex gap-2 flex-wrap mt-3">
      <button class="btn btn-dark btn-sm" onclick="entNuevaRutina('${fase.id}', '${_ent.clienteId}')">+ Rutina nueva</button>
      <button class="btn btn-secondary btn-sm" onclick="entAsignarPlantilla('${fase.id}')">↓ Traer de la biblioteca</button>
    </div>`;
}

// Cada rutina contra su versión del ciclo anterior. La pareja es la rutina de
// la que se copió (`origen_rutina_id`, al duplicar el ciclo); si no, la del
// mismo nombre; si no, la del mismo día. Se compara lo que ve el cliente:
// qué ejercicios, en qué orden, series, reps, peso y descanso.
// Devuelve { rutinaId: { igual, cambios: [texto, …] } }; sin pareja, nada.
function entCompararCiclo(rutinas, ejs, rutAnt, ejsAnt) {
  const norm = (t) => String(t || '').trim().toLowerCase();
  const nombreEj = (re) => entNombres(re.ejercicios || {}).grande || 'Ejercicio';
  const usadas = new Set();
  const pareja = (r) => {
    const libre = (x) => !usadas.has(x.id);
    return rutAnt.find(x => libre(x) && r.origen_rutina_id && x.id === r.origen_rutina_id)
      || rutAnt.find(x => libre(x) && norm(x.nombre) === norm(r.nombre))
      || rutAnt.find(x => libre(x) && x.dia_orden != null && x.dia_orden === r.dia_orden);
  };
  const out = {};
  rutinas.forEach(r => {
    const a = pareja(r);
    if (!a) return;
    usadas.add(a.id);
    const ahora = ejs[r.id] || [], antes = ejsAnt[a.id] || [];
    const cambios = [];
    const idsAntes = antes.map(re => re.ejercicio_id), idsAhora = ahora.map(re => re.ejercicio_id);
    ahora.filter(re => !idsAntes.includes(re.ejercicio_id)).forEach(re => cambios.push(`+ ${nombreEj(re)}`));
    antes.filter(re => !idsAhora.includes(re.ejercicio_id)).forEach(re => cambios.push(`− ${nombreEj(re)}`));
    const comunes = idsAhora.filter(id => idsAntes.includes(id));
    const ordenAntes = idsAntes.filter(id => idsAhora.includes(id));
    if (comunes.join() !== ordenAntes.join()) cambios.push('Orden de los ejercicios');
    ahora.forEach(re => {
      const v = antes.find(x => x.ejercicio_id === re.ejercicio_id);
      if (!v) return;
      const dif = [];
      if ((v.series ?? null) !== (re.series ?? null)) dif.push(`${v.series ?? '—'}→${re.series ?? '—'} series`);
      if (norm(v.reps) !== norm(re.reps)) dif.push(`reps ${v.reps || '—'}→${re.reps || '—'}`);
      if (norm(v.peso_objetivo) !== norm(re.peso_objetivo)) dif.push(`peso ${v.peso_objetivo || '—'}→${re.peso_objetivo || '—'}`);
      if ((v.descanso_seg ?? null) !== (re.descanso_seg ?? null)) dif.push(`descanso ${v.descanso_seg ?? '—'}→${re.descanso_seg ?? '—'}s`);
      if (dif.length) cambios.push(`${nombreEj(re)}: ${dif.join(', ')}`);
    });
    out[r.id] = { igual: !cambios.length, cambios };
  });
  return out;
}

function entEtiquetaCicloHTML(c) {
  if (!c) return '';
  if (c.igual) return ' <span class="tag" data-tag-ciclo="igual" style="background:#E6F2E9;color:#2F6B3E" title="Mismos ejercicios, orden, series, reps, peso y descanso que en el ciclo anterior">Igual al ciclo anterior</span>';
  return ` <span class="tag" data-tag-ciclo="cambios" style="background:#FDEBDC;color:#B5561A" title="${escapeHtml(c.cambios.join('\n'))}">Con cambios respecto al ciclo anterior</span>`;
}

// Los ejercicios en modo lectura: la prescripción tal como la verá el cliente.
function entResumenEjerciciosHTML(ejs, rutina) {
  if (!ejs.length) {
    return `<div class="text-xs text-slate-400">Rutina vacía.
      <button class="btn btn-ghost btn-sm" onclick="entAbrirConstructor('${rutina.id}')">Añadir ejercicios →</button></div>`;
  }
  return `
    <div class="overflow-x-auto">
      <table class="ent-tabla-ejs">
        <thead><tr>
          <th>#</th><th>Ejercicio</th><th>Series</th><th>Reps</th><th>Peso</th><th>Desc.</th><th>Patrón</th><th title="Video de técnica pedido al cliente">Video</th>
        </tr></thead>
        <tbody>
          ${ejs.map((re, i) => {
            const e = re.ejercicios || {};
            return `
              <tr>
                <td class="text-slate-400">${i + 1}</td>
                <td class="font-medium text-slate-800">${escapeHtml(entNombres(e).grande)}
                  ${entNombreChico(e)}
                  ${re.notas ? `<div class="text-[11px] text-slate-500">${escapeHtml(re.notas)}</div>` : ''}</td>
                <td>${re.series ?? '—'}</td>
                <td>${escapeHtml(re.reps || '—')}</td>
                <td>${escapeHtml(re.peso_objetivo || '—')}</td>
                <td>${re.descanso_seg != null ? `${re.descanso_seg}s` : '—'}</td>
                <td><span class="tag tag-gray">${escapeHtml(entLabel(ENT_PATRONES, e.patron))}</span></td>
                <td>${typeof vtEtiquetaHTML === 'function' && _ent.clienteId && !['calentamiento', 'estiramiento_pasivo', 'cardio'].includes(e.tipo)
                  ? vtEtiquetaHTML((_ent.vtUlt || {})[e.id], { ejercicioId: e.id, nombre: entNombres(e).grande, clienteId: _ent.clienteId }) : ''}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

window.entVerCliente = (id) => {
  _ent.clienteId = id;
  _ent.mes = null;
  _ent.eventosCache = null;
  entVistaClientes();
};

// OJO con `toISOString()` aquí: convierte a UTC, y en un navegador al este de
// Greenwich la medianoche local del día correcto sale como el día ANTERIOR.
// `evtSumarDias` (eventos.js) trabaja siempre en local.
// ── El ciclo en curso lo decide la FECHA ────────────────────────────────
// Entre los ciclos que ya empezaron, el de inicio más reciente (empate: el
// de mayor orden). La app usa la misma regla, así que no hace falta marcar
// nada a mano cuando arranca el siguiente.
function entCicloVigente(fases, hoy = fmt.hoy()) {
  const dia = (f) => String(f.fecha_inicio || '').slice(0, 10);
  const lista = (fases || []).filter(f => f.estado !== 'archivada' && f.estado !== 'borrador' && dia(f) && dia(f) <= hoy)
    .sort((a, b) => dia(b).localeCompare(dia(a)) || (b.orden || 0) - (a.orden || 0));
  return lista.find(f => f.estado === 'activa' && f.visible_cliente) || lista[0] || null;
}
// Qué es cada ciclo respecto a hoy: en curso, el que viene, o terminado.
function entEtiquetaCiclo(f, fases, hoy = fmt.hoy()) {
  const v = entCicloVigente(fases, hoy);
  if (v && v.id === f.id) return 'en curso';
  const dia = String(f.fecha_inicio || '').slice(0, 10);
  if (dia && dia > hoy) return `empieza el ${fmt.fecha ? fmt.fecha(dia) : dia}`;
  if (dia && f.estado !== 'borrador') return 'terminado';
  return '';
}
// Cuando el ciclo nuevo (enviado) ya arrancó, el anterior que seguía en
// «activa» pasa solo a «finalizada». Solo cambia ese estado: no se borra ni
// se toca nada más, y el historial de sesiones queda igual.
async function entCerrarCiclosPasados(fases) {
  try {
    const hoy = fmt.hoy();
    const v = entCicloVigente(fases, hoy);
    if (!v || v.estado !== 'activa' || !v.visible_cliente) return fases;
    const viejos = fases.filter(f => f.id !== v.id && f.estado === 'activa'
      && String(f.fecha_inicio || '').slice(0, 10) < String(v.fecha_inicio).slice(0, 10));
    for (const f of viejos) {
      const { error } = await sb.from('fases').update({ estado: 'finalizada', updated_at: new Date().toISOString() }).eq('id', f.id);
      if (!error) f.estado = 'finalizada';
    }
  } catch (e) { /* si falla, se queda como estaba */ }
  return fases;
}

function entFechaFin(f) {
  if (!f.fecha_inicio || !f.semanas) return null;
  return evtSumarDias(f.fecha_inicio, f.semanas * 7 - 1);
}

function entTarjetaFase(f, rutinas) {
  const fin = entFechaFin(f);
  const estadoTag = { activa: 'tag-green', borrador: 'tag-yellow', finalizada: 'tag-gray', archivada: 'tag-gray' }[f.estado] || 'tag-gray';
  // ¿El cliente la está viendo en su app? Es la pregunta que de verdad
  // importa antes de tocar nada, así que va en grande junto al nombre y no
  // escondida en el formulario de edición. `visible_cliente` es la columna
  // de migracion-visibilidad.sql; si todavía no la corriste, esto se
  // comporta como "no enviada" en vez de romperse.
  const enviada = f.visible_cliente === true;
  const chipEnvio = enviada
    ? `<span class="tag tag-green" title="${f.publicada_en ? 'Enviada el ' + String(f.publicada_en).slice(0, 10) : 'Enviada'}">📲 la ve el cliente</span>`
    : '<span class="tag" style="background:#f1f5f9;color:#64748b" title="Solo tú la ves. Está cargada y la puedes editar, pero no aparece en la app del cliente.">🔒 solo tú</span>';
  return `
    <div class="card mb-3">
      <div class="flex justify-between items-start gap-2 flex-wrap mb-2">
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-bold text-slate-900">${escapeHtml(f.nombre)}</span>
            <span class="tag ${estadoTag}">${escapeHtml(f.estado)}</span>
            ${(() => { const e = entEtiquetaCiclo(f, _ent.fasesCliente || [f]); return e ? `<span class="tag" data-ciclo-etiqueta style="${e === 'en curso' ? 'background:#E3EEFB;color:#1F4E8C' : 'background:#f1f5f9;color:#64748b'}">${escapeHtml(e)}</span>` : ''; })()}
            ${chipEnvio}
          </div>
          <div class="text-xs text-slate-500 mt-0.5">
            ${f.semanas || '?'} semana${f.semanas === 1 ? '' : 's'}
            ${f.fecha_inicio ? ` · ${f.fecha_inicio}${fin ? ` → ${fin}` : ''}` : ' · sin fecha de inicio'}
            ${(f.dias_semana || []).length ? ` · ${f.dias_semana.join(' ')}` : ''}
          </div>
          ${f.objetivo ? `<div class="text-xs text-slate-600 mt-1">${escapeHtml(f.objetivo)}</div>` : ''}
        </div>
        <div class="flex gap-1 flex-wrap max-w-full">
          ${enviada
            ? `<button class="btn btn-secondary btn-sm" onclick="entRetirarFase('${f.id}')" title="Deja de mostrársela en su app. No se borra nada.">↩ Retirar</button>`
            : `<button class="btn btn-primary btn-sm" onclick="entEnviarFase('${f.id}')" ${rutinas.length ? '' : 'disabled title="Añade al menos una rutina antes de enviarla"'}>📤 Enviar al cliente</button>`}
          <button class="btn btn-ghost btn-sm" onclick="entEditarFase('${f.id}')">Editar</button>
          ${f.cliente_id ? `<button class="btn btn-secondary btn-sm" onclick="entDuplicarCiclo('${f.id}')" title="Crea el ciclo siguiente con las mismas rutinas y tus días; lo que movió el cliente te lo pregunta">⧉ Duplicar ciclo</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="entCopiarFaseA('${f.id}')">Copiar a…</button>
          <button class="btn btn-ghost btn-sm" onclick="entBorrarFase('${f.id}')">Borrar</button>
        </div>
      </div>

      <div class="pt-2 border-t border-slate-100">
        ${rutinas.length === 0
          ? '<div class="text-xs text-slate-400 mb-2">Sin rutinas en esta fase.</div>'
          : `<div class="flex flex-col gap-1 mb-2">
              ${rutinas.map(r => `
                <div class="flex items-center justify-between gap-2 py-1">
                  <div class="min-w-0 text-sm">
                    <span class="text-slate-400">Día ${r.dia_orden}</span>
                    <span class="font-semibold text-slate-800 ml-1">${escapeHtml(r.nombre)}</span>
                    ${entDiasTexto(r) ? `<span class="tag tag-blue ml-1">${entDiasTexto(r)}</span>` : ''}
                  </div>
                  <div class="flex gap-1 flex-shrink-0">
                    <button class="btn btn-ghost btn-sm" onclick="entAbrirConstructor('${r.id}')">Construir</button>
                    <button class="btn btn-ghost btn-sm" onclick="entBorrarRutina('${r.id}')">✕</button>
                  </div>
                </div>`).join('')}
            </div>`}
        <div class="flex gap-1 flex-wrap">
          <button class="btn btn-dark btn-sm" onclick="entNuevaRutina('${f.id}', '${_ent.clienteId}')">+ Rutina nueva</button>
          <button class="btn btn-secondary btn-sm" onclick="entAsignarPlantilla('${f.id}')">↓ Traer de la biblioteca</button>
        </div>
      </div>
    </div>
  `;
}

// ---------- Crear / editar fase ----------
function entFormularioFase(f = {}, cliente = null) {
  const dias = f.dias_semana || cliente?.dias_entreno || [];
  return `
    <div class="mb-3"><label>Nombre *</label>
      <input id="fa-nombre" value="${escapeHtml(f.nombre || '')}" placeholder="Fase 1 · Adaptación anatómica"></div>
    <div class="mb-3"><label>Objetivo del bloque</label>
      <input id="fa-objetivo" value="${escapeHtml(f.objetivo || '')}" placeholder="Aprender los patrones y tolerar volumen"></div>
    <div class="grid grid-cols-2 gap-3 mb-3">
      <div><label>Duración (semanas) *</label>
        <input id="fa-semanas" type="number" min="1" max="52" value="${f.semanas || 4}"></div>
      <div><label>Fecha de inicio</label>
        <input id="fa-inicio" type="date" value="${f.fecha_inicio || ''}"></div>
    </div>
    <div class="mb-3">
      <label>Días de entreno</label>
      <div class="flex flex-wrap gap-1 mt-1">
        ${ENT_DIAS.map(([id, lab]) => `
          <label class="tag-pill cursor-pointer" style="${dias.includes(id) ? 'background:#d1fae5;color:#065f46' : ''}">
            <input type="checkbox" class="fa-dia" value="${id}" ${dias.includes(id) ? 'checked' : ''}
                   onchange="this.parentNode.style.cssText = this.checked ? 'background:#d1fae5;color:#065f46' : ''"
                   style="margin-right:3px;vertical-align:middle">${lab}
          </label>`).join('')}
      </div>
      ${cliente && !f.id && (cliente.dias_entreno || []).length
        ? '<p class="text-xs text-slate-400 mt-1">Pre-marcados según la ficha del cliente.</p>' : ''}
    </div>
    <div class="mb-3"><label>Estado</label>
      <select id="fa-estado">${entOpciones([['borrador','Borrador'],['activa','Activa'],['finalizada','Finalizada'],['archivada','Archivada']], f.estado || 'borrador', '—')}</select></div>
    <p class="text-xs text-slate-400 -mt-2 mb-3">El ciclo en curso lo decide la fecha de inicio: cuando arranca el siguiente (ya enviado), este pasa solo a «finalizada».</p>
    <div><label>Notas de coach</label><textarea id="fa-notas" rows="2">${escapeHtml(f.notas_coach || '')}</textarea></div>
  `;
}

window.entNuevaFase = async () => {
  const cliente = (await db.clientes.list()).find(c => c.id === _ent.clienteId);
  openModal(modalShell('Nueva fase', entFormularioFase({}, cliente),
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="entGuardarFase(null)">Crear fase</button>`));
};

window.entEditarFase = async (id) => {
  const fases = await entDb.fases(_ent.clienteId);
  const f = fases.find(x => x.id === id);
  if (!f) return;
  openModal(modalShell('Editar fase', entFormularioFase(f),
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="entGuardarFase('${id}')">Guardar</button>`));
};

window.entGuardarFase = async (id) => {
  const nombre = $('#fa-nombre')?.value.trim();
  if (!nombre) { toast('La fase necesita un nombre'); return; }
  const semanas = Number($('#fa-semanas')?.value);
  if (!semanas || semanas < 1) { toast('La duración debe ser de al menos 1 semana'); return; }

  const row = {
    nombre,
    objetivo: $('#fa-objetivo')?.value.trim() || null,
    semanas,
    fecha_inicio: $('#fa-inicio')?.value || null,
    dias_semana: $$('.fa-dia:checked').map(i => i.value),
    estado: $('#fa-estado')?.value || 'borrador',
    notas_coach: $('#fa-notas')?.value.trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (id) {
    await entDb.actualizarFase(id, row);
  } else {
    const fases = await entDb.fases(_ent.clienteId);
    await entDb.crearFase({ ...row, cliente_id: _ent.clienteId, orden: fases.length + 1 });
  }
  closeModal();
  toast(id ? '✓ Fase actualizada' : '✓ Fase creada');
  entVistaClientes();
};

// ── Enviar al cliente ───────────────────────────────────────────────────
// Es la única acción de esta pantalla que el cliente NOTA, así que se
// confirma diciendo exactamente qué va a ver y desde cuándo. Antes de esto
// no había forma de tener una rutina cargada y a la vez oculta: o existía y
// se veía, o no existía.
window.entEnviarFase = async (id) => {
  const fases = await entDb.fases(_ent.clienteId);
  const f = fases.find(x => x.id === id);
  if (!f) return;
  const rutinas = await entDb.rutinasDeFase(id);
  if (!rutinas.length) { toast('Esa fase no tiene rutinas todavía.'); return; }
  const dias = rutinas.map(r => `· Día ${r.dia_orden}: ${r.nombre}`).join('\n');
  const ok = confirm(
    `Enviar «${f.nombre}» al cliente.\n\n`
    + `A partir de ahora verá en su app:\n${dias}\n\n`
    + `${f.fecha_inicio ? `Arranca el ${f.fecha_inicio} y dura ${f.semanas || '?'} semanas.\n\n` : ''}`
    + `Lo que NO se envía: tus notas de coach, ni las de cada ejercicio.\n`
    + `Puedes retirarla cuando quieras sin borrar nada.`);
  if (!ok) return;
  const n = await entDb.publicarFase(id, true);
  if (n == null) return;
  // Un solo aviso al teléfono por envío (aunque traiga cuatro rutinas). Si
  // no tiene push, o apagó «Ciclo o rutina nueva» en su app, lo ve al entrar.
  const aviso = await entAvisarCicloNuevo(_ent.clienteId, f, n);
  toast(`📤 Enviada · el cliente ya ve ${n} ${n === 1 ? 'rutina' : 'rutinas'}${aviso === true ? ' · aviso al teléfono enviado' : aviso === 'apagado' ? ' · tiene ese aviso apagado' : aviso === false ? ' · sin push activo' : ''}`);
  entVistaClientes();
};

async function entAvisarCicloNuevo(clienteId, fase, n) {
  try {
    if (typeof mtApiPost !== 'function' || typeof mtApiBase !== 'function' || !mtApiBase()) return null;
    const c = await db.clientes.get(clienteId);
    if (!c || !c.nombre) return null;
    const r = await mtApiPost('/api/push-send', {
      name: c.nombre, tipo: 'ciclo', title: 'Tu ciclo nuevo ya está listo',
      body: `${fase.nombre} · ${n} ${n === 1 ? 'rutina' : 'rutinas'}. Toca para verlo.`, url: '/?ir=entreno',
    });
    if (!r) return null;
    if (r.ok) return true;
    return r.apagado ? 'apagado' : false;
  } catch (e) { return null; }
}

window.entRetirarFase = async (id) => {
  if (!confirm('Retirar esta fase de la app del cliente.\n\nDeja de verla, pero no se borra: ni la rutina, ni lo que ya entrenó. Puedes volver a enviarla cuando quieras.')) return;
  const n = await entDb.publicarFase(id, false);
  if (n == null) return;
  toast('↩ Retirada · el cliente ya no la ve');
  entVistaClientes();
};

window.entBorrarFase = async (id) => {
  if (!confirm('¿Borrar esta fase? Se borran también sus rutinas. El historial de sesiones ya entrenadas se conserva.')) return;
  await entDb.borrarFase(id);
  toast('Fase borrada');
  entVistaClientes();
};

// =====================================================
// COPIAR / IMPORTAR
// =====================================================
// Todo pasa por las funciones SQL (copiar_fase / copiar_rutina): el clonado
// ocurre entero en el servidor, así una copia nunca queda a medias.

async function entSelectClientes(excluir) {
  const clientes = (await db.clientes.list()).filter(c => c.id !== excluir && c.estado === 'activo');
  return clientes.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
}

// Traer una plantilla de la biblioteca a una fase (la copia, no la mueve).
window.entAsignarPlantilla = async (faseId) => {
  const plantillas = await entDb.plantillas();
  if (plantillas.length === 0) {
    toast('No tienes plantillas en la biblioteca todavía');
    return;
  }
  openModal(modalShell('Traer rutina de la biblioteca', `
    <p class="text-sm text-slate-600 mb-3">
      Se crea una <b>copia</b> dentro de esta fase. La plantilla original no se toca,
      y editar la copia no afecta a otros clientes.
    </p>
    <label>Rutina</label>
    <select id="cp-plantilla">
      ${plantillas.map(r => `<option value="${r.id}">${escapeHtml(r.nombre)}</option>`).join('')}
    </select>
    <div class="mt-3"><label>Nombre en esta fase (opcional)</label>
      <input id="cp-nombre" placeholder="Se deja igual si lo dejas vacío"></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="entConfirmarAsignar('${faseId}')">Copiar a la fase</button>`));
};

window.entConfirmarAsignar = async (faseId) => {
  const rutinaId = $('#cp-plantilla')?.value;
  const nombre = $('#cp-nombre')?.value.trim() || null;
  if (!rutinaId) return;
  const nueva = await entDb.copiarRutina(rutinaId, faseId, nombre);
  if (!nueva) return;
  // La copia entra al final de la fase.
  const hermanas = await entDb.rutinasDeFase(faseId);
  await entDb.actualizarRutina(nueva, { dia_orden: hermanas.length });
  closeModal();
  toast('✓ Rutina copiada a la fase');
  entVistaClientes();
};

// Copiar una rutina a otra fase — de este cliente o de cualquier otro.
window.entCopiarRutinaA = async (rutinaId) => {
  const clientes = (await db.clientes.list()).filter(c => c.estado === 'activo');
  openModal(modalShell('Copiar rutina a…', `
    <p class="text-sm text-slate-600 mb-3">Se crea una copia independiente. El original no se modifica.</p>
    <div class="mb-3"><label>Destino</label>
      <select id="cr-cliente" onchange="entCargarFasesDestino(this.value)">
        <option value="">— Biblioteca de plantillas —</option>
        ${clientes.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('')}
      </select></div>
    <div id="cr-fases-wrap" class="mb-3 hidden"><label>Fase</label>
      <select id="cr-fase"></select></div>
    <div><label>Nombre nuevo (opcional)</label><input id="cr-nombre" placeholder="Se deja igual si lo dejas vacío"></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="entConfirmarCopiarRutina('${rutinaId}')">Copiar</button>`));
};

window.entCargarFasesDestino = async (clienteId) => {
  const wrap = $('#cr-fases-wrap');
  const sel = $('#cr-fase');
  if (!wrap || !sel) return;
  if (!clienteId) { wrap.classList.add('hidden'); sel.innerHTML = ''; return; }
  const fases = await entDb.fases(clienteId);
  if (fases.length === 0) {
    wrap.classList.remove('hidden');
    sel.innerHTML = '<option value="">— ese cliente no tiene fases —</option>';
    return;
  }
  wrap.classList.remove('hidden');
  sel.innerHTML = fases.map(f => `<option value="${f.id}">${escapeHtml(f.nombre)}</option>`).join('');
};

window.entConfirmarCopiarRutina = async (rutinaId) => {
  const clienteId = $('#cr-cliente')?.value;
  const faseId = clienteId ? $('#cr-fase')?.value : null;
  if (clienteId && !faseId) { toast('Ese cliente no tiene fases. Créale una primero.'); return; }
  const nueva = await entDb.copiarRutina(rutinaId, faseId || null, $('#cr-nombre')?.value.trim() || null);
  if (!nueva) return;
  closeModal();
  toast(faseId ? '✓ Rutina copiada al cliente' : '✓ Rutina guardada en la biblioteca');
  routes.entrenamiento();
};

// Copiar una fase COMPLETA a otro cliente: rutinas con sus días, y el
// cardio, deportes y eventos del calendario (entreno-ciclos.js, cicloCopiarAOtro).
window.entCopiarFaseA = async (faseId) => {
  openModal(modalShell('Copiar ciclo completo a…', `
    <p class="text-sm text-slate-600 mb-3">
      Se copia el ciclo como se ve en el calendario: las rutinas de fuerza con sus días,
      y el cardio y los deportes con los suyos. Queda en <b>borrador</b> para que lo revises.
    </p>
    <div class="mb-3"><label>Cliente destino</label>
      <select id="cf-cliente">
        <option value="">— Guardar como plantilla de fase —</option>
        ${await entSelectClientes(null)}
      </select></div>
    <div class="grid grid-cols-2 gap-3">
      <div><label>Fecha de inicio</label><input id="cf-inicio" type="date"></div>
      <div><label>Nombre nuevo (opcional)</label><input id="cf-nombre" placeholder="Igual que la original"></div>
    </div>
    <div id="cp-previa"></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="entConfirmarCopiarFase('${faseId}')">Copiar ciclo</button>`), { wide: true });
  cicloPrevia(faseId);
};

window.entConfirmarCopiarFase = async (faseId) => {
  const aviso = await cicloCopiarAOtro(
    faseId,
    $('#cf-cliente')?.value || null,
    $('#cf-inicio')?.value || null,
    $('#cf-nombre')?.value.trim() || null,
  );
  if (!aviso) return;
  closeModal();
  toast(aviso);
  entVistaClientes();
};

// TRAER DE OTRO CLIENTE hacia este: el ciclo completo (con su calendario) o
// una sola rutina de fuerza a uno de sus ciclos. Es como se piensa al armar
// el proceso de alguien: «a Bruno le sirve el Push de Ana».
const _imp = { modo: 'ciclo' };
window.entImportarFase = async (modo = 'ciclo') => {
  const clientes = (await db.clientes.list()).filter(c => c.id !== _ent.clienteId);
  const mios = await entDb.fases(_ent.clienteId);
  _imp.modo = modo;
  openModal(modalShell('Traer de otro cliente', `
    <div data-traer>
      <div class="flex gap-2 mb-3 flex-wrap">
        <button type="button" class="chip ${modo === 'ciclo' ? 'active' : ''}" data-if-modo="ciclo" onclick="entImpModo('ciclo')">🗓️ El ciclo completo</button>
        <button type="button" class="chip ${modo === 'rutina' ? 'active' : ''}" data-if-modo="rutina" onclick="entImpModo('rutina')">🏋️ Una rutina de fuerza</button>
      </div>
      <div class="mb-3"><label>Traer de</label>
        <select id="if-cliente" onchange="entCargarFasesOrigen(this.value)">
          <option value="">— Plantillas de fase —</option>
          ${clientes.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('')}
        </select></div>
      <div class="mb-3"><label>Ciclo</label><select id="if-fase" onchange="entImpFase(this.value)"><option value="">Elige primero el origen</option></select></div>

      <div id="if-modo-rutina" class="${modo === 'rutina' ? '' : 'hidden'}">
        <div class="mb-3"><label>Qué rutina</label><select id="if-rutina"></select></div>
        <div class="mb-3"><label>A qué ciclo de este cliente</label>
          <select id="if-destino">
            ${mios.length ? mios.map(f => `<option value="${f.id}" ${f.id === _ent.faseId ? 'selected' : ''}>${escapeHtml(f.nombre)}${entEtiquetaCiclo(f, mios) ? ' · ' + entEtiquetaCiclo(f, mios) : ''}</option>`).join('') : '<option value="">— este cliente no tiene ciclos: crea uno primero —</option>'}
          </select></div>
        <label class="flex gap-2 items-start cursor-pointer" style="text-transform:none;letter-spacing:0;font-weight:400">
          <input type="checkbox" id="if-dias" checked style="width:auto" class="mt-0.5">
          <span class="text-sm text-slate-700">Con sus días de la semana (los que estén libres en el ciclo de destino). Si no, queda sin día y la pones tú en el calendario.</span>
        </label>
      </div>

      <div id="if-modo-ciclo" class="${modo === 'ciclo' ? '' : 'hidden'}">
        <p class="text-sm text-slate-600 mb-3">Trae el ciclo como se ve en su calendario: las rutinas de fuerza con sus días,
          y el cardio y los deportes con los suyos. Queda en <b>borrador</b> para que lo revises.</p>
        <div class="grid grid-cols-2 gap-3">
          <div><label>Fecha de inicio</label><input id="if-inicio" type="date"></div>
          <div><label>Nombre nuevo (opcional)</label><input id="if-nombre" placeholder="Igual que la original"></div>
        </div>
        <div id="cp-previa"></div>
      </div>
    </div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" id="if-ok" onclick="entConfirmarImportar()">Traer</button>`), { wide: true });
  entCargarFasesOrigen('');
};

window.entImpModo = (m) => {
  _imp.modo = m;
  $$('[data-if-modo]').forEach(b => b.classList.toggle('active', b.dataset.ifModo === m));
  $('#if-modo-rutina')?.classList.toggle('hidden', m !== 'rutina');
  $('#if-modo-ciclo')?.classList.toggle('hidden', m !== 'ciclo');
};

window.entCargarFasesOrigen = async (clienteId) => {
  const sel = $('#if-fase');
  if (!sel) return;
  const fases = await entDb.fases(clienteId || null);
  // La que está en curso primero: casi siempre es la que se quiere traer.
  const vig = entCicloVigente(fases);
  const orden = fases.slice().sort((a, b) => (b.id === vig?.id) - (a.id === vig?.id) || (b.estado === 'activa') - (a.estado === 'activa') || (b.orden || 0) - (a.orden || 0));
  sel.innerHTML = orden.length
    ? orden.map(f => `<option value="${f.id}">${escapeHtml(f.nombre)} · ${f.semanas || '?'} sem${entEtiquetaCiclo(f, fases) ? ' · ' + entEtiquetaCiclo(f, fases) : ''}</option>`).join('')
    : '<option value="">— no hay ciclos ahí —</option>';
  entImpFase(sel.value || null);
};

window.entImpFase = async (faseId) => {
  if (typeof cicloPrevia === 'function') await cicloPrevia(faseId);
  const sel = $('#if-rutina');
  if (!sel) return;
  const rutinas = faseId ? await entDb.rutinasDeFase(faseId) : [];
  sel.innerHTML = rutinas.length
    ? rutinas.map(r => `<option value="${r.id}">${escapeHtml(r.nombre)}${entDiasDe(r).length ? ` · ${escapeHtml(entDiasTexto(r))}` : ''}</option>`).join('')
    : '<option value="">— ese ciclo no tiene rutinas —</option>';
};

window.entConfirmarImportar = async () => {
  const faseId = $('#if-fase')?.value;
  if (!faseId) { toast('Elige un ciclo de dónde traer'); return; }
  if (_imp.modo === 'rutina') return entImportarRutina(faseId);
  const aviso = await cicloCopiarAOtro(
    faseId, _ent.clienteId,
    $('#if-inicio')?.value || null,
    $('#if-nombre')?.value.trim() || null,
  );
  if (!aviso) return;
  closeModal();
  toast(aviso);
  entVistaClientes();
};

// Una rutina de otro cliente a un ciclo de este. Con sus días, pero solo los
// que estén libres: nunca dos rutinas el mismo día.
async function entImportarRutina(faseOrigen) {
  const rutinaId = $('#if-rutina')?.value, destino = $('#if-destino')?.value;
  if (!rutinaId) return toast('Elige la rutina');
  if (!destino) return toast('Este cliente no tiene ciclos: crea uno primero');
  const origen = (await entDb.rutinasDeFase(faseOrigen)).find(r => r.id === rutinaId);
  const hermanas = await entDb.rutinasDeFase(destino);
  const nueva = await entDb.copiarRutina(rutinaId, destino, null);
  if (!nueva) return;
  // Un bloque complementario (un recovery) va con sus días aunque haya fuerza
  // ese día: no compite con ella ni cuenta como día de entreno de la fase.
  const bloque = typeof entEsBloque === 'function' && entEsBloque(origen);
  const ocupados = bloque ? new Set() : new Set(hermanas.filter(x => !(typeof entEsBloque === 'function' && entEsBloque(x))).flatMap(entDiasDe));
  const quiere = $('#if-dias')?.checked ? entDiasDe(origen || {}) : [];
  const dias = quiere.filter(d => !ocupados.has(d));
  await entDb.actualizarRutina(nueva, { dias_semana: dias, dia_semana: null, dia_orden: hermanas.length + 1 });
  if (dias.length && !bloque) {
    const f = (await entDb.fases(_ent.clienteId)).find(x => x.id === destino);
    const ds = [...new Set([...(f?.dias_semana || []), ...dias])].sort((a, b) => 'LMXJVSD'.indexOf(a) - 'LMXJVSD'.indexOf(b));
    if (f && ds.length !== (f.dias_semana || []).length) await entDb.actualizarFase(destino, { dias_semana: ds });
  }
  const chocan = quiere.filter(d => ocupados.has(d));
  closeModal();
  toast(`✓ «${origen?.nombre || 'Rutina'}» traída` + (dias.length ? ` · ${dias.map(d => ENT_DIA_PLURAL[d]).join(', ')}` : ' · sin día (ponla en el calendario)')
    + (chocan.length ? ` · ${chocan.map(d => ENT_DIA_PLURAL[d]).join(', ')} ya tenía${chocan.length === 1 ? '' : 'n'} rutina` : ''));
  _ent.faseId = destino;
  entVistaClientes();
}

// =====================================================
// REGISTRO EN EL CRM
// =====================================================
// Mismo truco que la sección de Nutrición al final de app.js: se clona un
// botón existente en vez de depender del HTML del shell, así este archivo no
// obliga a editar index.html más allá de cargarlo.
(function addEntrenamientoNav() {
  try {
    const anchor = document.querySelector('.nav-item');
    if (!anchor || document.querySelector('.nav-item[data-view="entrenamiento"]')) return;
    const btn = anchor.cloneNode(true);
    btn.dataset.view = 'entrenamiento';
    btn.classList.remove('active');
    btn.textContent = '🏋️ Entrenamiento';
    // Justo después de Nutrición: las dos secciones de contenido quedan juntas.
    const nutricion = document.querySelector('.nav-item[data-view="nutricion"]');
    const negocio = document.querySelector('.nav-item[data-view="negocio"]');
    anchor.parentNode.insertBefore(btn, (nutricion && nutricion.nextSibling) || negocio || null);
    btn.addEventListener('click', () => navigate('entrenamiento'));
  } catch (e) { /* si el shell cambia, no rompe nada */ }
})();

// Atajo desde la ficha de un cliente: abre la sección parada en ese cliente.
window.verEntrenamientoCliente = (clienteId) => {
  _ent.tab = 'clientes';
  _ent.clienteId = clienteId;
  _ent.rutinaId = null;
  closeModal();
  navigate('entrenamiento');
};

// ═══════════════════════════════════════════════════════════════════════
// LECTURAS DE ENTRENAMIENTO  ·  sin agente, sin tokens
// ═══════════════════════════════════════════════════════════════════════
// Lo mismo que en Nutrición: lo que uno le pregunta al agente cada semana son
// las mismas preguntas, y esas no necesitan un modelo — necesitan que alguien
// las haya calculado. Todo esto sale de `sesiones` y `series_log`, que ya
// estaban ahí guardando lo que el cliente marca en su app.
//
// LA PREGUNTA QUE MÁS IMPORTA: ¿qué ejercicio lleva semanas sin moverse?
// Un cliente puede entrenar los cuatro días, marcar todo, sentirse bien, y
// llevar dos meses levantando lo mismo en press banca. Eso no aparece en
// ninguna gráfica de adherencia — y es exactamente lo que un coach necesita
// ver para intervenir.

const ENT_ESTANCADO_DIAS = 28;     // sin subir peso en 4 semanas = mirarlo
const ENT_ESTANCADO_MIN_SES = 3;   // con menos de 3 registros no es un patrón

// La MEJOR MARCA de cada sesión, por ejercicio.
//
// Antes se miraba solo el peso más alto, y eso daba por estancado a quien
// progresaba por repeticiones: 60×8 → 60×10 → 60×12 es la progresión de
// manual (doble progresión) y salía como "60 kg desde hace un mes". Ahora cada
// serie se resume en su 1RM estimado (Epley: kg × (1 + reps/30)), que sube
// tanto si carga más como si hace más reps con lo mismo.
//
// Todo en kg: una serie en libras se convierte para comparar. Lo que se
// ENSEÑA es la serie tal cual la marcó ("60 kg × 12", "50 lb × 10").
//
// Se usa la mejor serie de la sesión, no el promedio: si hizo 60×10 y luego
// 50×12 como back-off, lo que dice si progresó es la mejor.
const ENT_LB_KG = 0.45359237;
function entE1rm(pesoKg, reps) {
  const r = Number(reps);
  return pesoKg * (1 + (Number.isFinite(r) && r > 0 ? Math.min(r, 20) : 1) / 30);
}
function entSeriesPorEjercicio(sesiones, series) {
  const fechaDe = {};
  for (const s of sesiones) fechaDe[s.id] = s.fecha;
  const porEj = new Map();
  for (const l of series) {
    if (l.completada === false) continue;
    const peso = Number(l.peso);
    if (!Number.isFinite(peso) || peso <= 0) continue;
    const fecha = fechaDe[l.sesion_id];
    if (!fecha) continue;
    const unidad = l.unidad === 'lb' ? 'lb' : 'kg';
    const kg = unidad === 'lb' ? peso * ENT_LB_KG : peso;
    const reps = Number(l.reps) || null;
    const e1 = entE1rm(kg, reps);
    const id = l.ejercicio_id;
    const e = porEj.get(id) || { id, nombre: l.ejercicios ? entNombres(l.ejercicios).grande : 'ejercicio', unidad, sesiones: new Map() };
    const prev = e.sesiones.get(fecha);
    if (!prev || e1 > prev.e1) {
      e.sesiones.set(fecha, { fecha, peso, reps, unidad, kg, e1 });
    }
    porEj.set(id, e);
  }
  // Ordenado de la más vieja a la más nueva: la progresión se lee así.
  for (const e of porEj.values()) {
    e.puntos = [...e.sesiones.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  }
  return [...porEj.values()];
}

function entLecturasDatos(sesiones, series) {
  const hoy = fmt.hoy();
  const dias = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
  const ejercicios = entSeriesPorEjercicio(sesiones, series);

  const estancados = [];
  const progresando = [];
  const nuevos = [];
  const marca = (x) => `${x.peso} ${x.unidad}${x.reps ? ` × ${x.reps}` : ''}`;
  for (const e of ejercicios) {
    const p = e.puntos;
    if (p.length < ENT_ESTANCADO_MIN_SES) { nuevos.push({ ...e, veces: p.length }); continue; }
    const maximo = Math.max(...p.map(x => x.e1));
    // Cuándo alcanzó esa mejor marca por PRIMERA vez: desde ahí no la supera.
    // (±0.5% de margen: 60×8 y 60×8 otro día son la misma marca.)
    const primeraVezEnMax = p.find(x => x.e1 >= maximo * 0.995);
    const diasEnMax = dias(primeraVezEnMax.fecha, hoy);
    const sesionesDesde = p.filter(x => x.fecha >= primeraVezEnMax.fecha).length;
    const primero = p[0], ultimo = p[p.length - 1];

    if (diasEnMax >= ENT_ESTANCADO_DIAS && sesionesDesde >= ENT_ESTANCADO_MIN_SES) {
      estancados.push({ ...e, maximo, marca: marca(primeraVezEnMax), diasEnMax, sesionesDesde, desde: primeraVezEnMax.fecha });
    } else if (ultimo.e1 > primero.e1 * 1.005) {
      progresando.push({ ...e, de: marca(primero), a: marca(ultimo),
        subidaPct: Math.round((ultimo.e1 / primero.e1 - 1) * 100), veces: p.length });
    }
  }
  estancados.sort((a, b) => b.diasEnMax - a.diasEnMax);
  progresando.sort((a, b) => b.subidaPct - a.subidaPct);

  const completadas = sesiones.filter(s => s.estado === 'completada');
  const sinTerminar = sesiones.filter(s => s.estado && s.estado !== 'completada');
  const conRpe = completadas.filter(s => s.rpe != null);
  const rpeProm = conRpe.length ? Math.round((conRpe.reduce((s, x) => s + x.rpe, 0) / conRpe.length) * 10) / 10 : null;
  // Tres seguidas al límite no es esfuerzo, es una fatiga que hay que mirar.
  const ultimas = [...completadas].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 3);
  const tresAlLimite = ultimas.length === 3 && ultimas.every(s => s.rpe != null && s.rpe >= 9);
  const ultimaFecha = completadas.length ? completadas.map(s => s.fecha).sort().pop() : null;

  // Intensidad (RPE 1-10 que marca al terminar): promedio y acumulado (la
  // suma) de esta semana, este mes y las últimas 8 semanas. Lo mismo que ve
  // el cliente en su Dash.
  const lunesDe = (f) => { const t = new Date(f + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.toISOString().slice(0, 10); };
  const resumen = (lista) => {
    const n = lista.length, suma = lista.reduce((a, x) => a + Number(x.rpe), 0);
    return { n, suma, prom: n ? Math.round((suma / n) * 10) / 10 : null };
  };
  const conRpeOk = conRpe.filter(x => Number(x.rpe) >= 1 && Number(x.rpe) <= 10);
  const lunesHoy = lunesDe(hoy);
  const semanasRpe = Array.from({ length: 8 }, (_, i) => {
    const t = new Date(lunesHoy + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() - 7 * (7 - i));
    const desde = t.toISOString().slice(0, 10);
    return { desde, ...resumen(conRpeOk.filter(x => lunesDe(x.fecha) === desde)) };
  });
  const intensidad = {
    semana: resumen(conRpeOk.filter(x => x.fecha >= lunesHoy)),
    mes: resumen(conRpeOk.filter(x => String(x.fecha).slice(0, 7) === hoy.slice(0, 7))),
    semanas: semanasRpe,
  };

  return {
    ejercicios, estancados, progresando, nuevos, intensidad,
    completadas: completadas.length,
    sinTerminar: sinTerminar.length,
    rpeProm, tresAlLimite,
    diasSinEntrenar: ultimaFecha ? dias(ultimaFecha, hoy) : null,
    notas: sesiones.filter(s => s.notas_cliente && String(s.notas_cliente).trim())
      .sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5),
  };
}

// La tarjeta de intensidad: semana y mes (promedio y acumulado) y las
// últimas 8 semanas en barras.
function entIntensidadHTML(it) {
  if (!it) return '';
  const caja = (t, r) => `
    <div class="rounded-xl bg-slate-50 p-3">
      <div class="text-xs text-slate-500">${t}</div>
      <div class="text-2xl font-bold text-slate-900 leading-tight">${r.prom != null ? String(r.prom).replace('.', ',') : '—'}<span class="text-xs font-semibold text-slate-400">${r.prom != null ? ' /10 promedio' : ''}</span></div>
      <div class="text-[11px] text-slate-500">${r.n ? `Acumulado ${r.suma} · ${r.n} entreno${r.n === 1 ? '' : 's'}` : 'Sin entrenos con intensidad'}</div>
    </div>`;
  const barras = it.semanas.map(w => `
    <div class="flex flex-col items-center gap-1 flex-1 min-w-0" title="Semana del ${fmt.fechaCorta(w.desde)}: ${w.prom != null ? `${w.prom}/10 · acumulado ${w.suma}` : 'sin entrenos'}">
      <div class="text-[10px] font-semibold text-slate-500">${w.prom != null ? String(w.prom).replace('.', ',') : ''}</div>
      <div class="w-full rounded-md" style="height:${w.prom != null ? Math.max(4, Math.round(w.prom * 6)) : 2}px;background:${w.prom == null ? '#e2e8f0' : w.prom >= 9 ? '#C75A4A' : '#3C7BD6'}"></div>
      <div class="text-[10px] text-slate-400 truncate">${fmt.fechaCorta(w.desde)}</div>
    </div>`).join('');
  return `
    <div class="card mb-4" data-intensidad-crm>
      <div class="font-bold text-slate-900 text-sm">⚡ Intensidad que reporta</div>
      <div class="text-xs text-slate-500 mt-0.5 mb-3">Qué tan duro se sintió cada entreno (1 a 10, lo marca al terminar). Promedio y acumulado.</div>
      <div class="grid grid-cols-2 gap-2">${caja('Esta semana', it.semana)}${caja('Este mes', it.mes)}</div>
      <div class="text-xs text-slate-500 mt-4 mb-1">Promedio por semana · últimas 8</div>
      <div class="flex items-end gap-1.5" style="height:90px">${barras}</div>
    </div>`;
}

// ─── La pantalla ────────────────────────────────────────────────────────
async function entPintarLecturas(cliente) {
  const caja = $('#ent-lecturas');
  if (!caja) return;

  const ses = await entDb.sesiones(cliente.id, { limite: 60 });
  if (ses === null) {
    caja.innerHTML = `<div class="card text-sm text-slate-500">
      Todavía no puedo leer las sesiones. Corre <code>schema.sql</code> del módulo de entrenamiento en el Supabase del CRM.</div>`;
    return;
  }
  if (!ses.length) {
    caja.innerHTML = `<div class="card text-center text-slate-500 py-8">
      <div class="font-bold text-slate-700 mb-1">Todavía no ha marcado ningún entreno</div>
      <div class="text-sm">Cuando abra una rutina en su app y marque series, esto se llena solo.</div></div>`;
    return;
  }

  const series = await entDb.seriesDeSesiones(ses.map(s => s.id));
  const d = entLecturasDatos(ses, series);
  // Tiempos reales (entreno-tiempos.js): cuánto dura, cuánto descansa.
  const tiempos = typeof entTiemposCargar === 'function'
    ? entTiemposResumen(await entTiemposCargar(ses).catch(() => ({}))) : null;

  const H = [];
  const push = (tono, titulo, detalle, dato) => H.push({ tono, titulo, detalle, dato });

  if (d.diasSinEntrenar != null && d.diasSinEntrenar >= 10) {
    push('ojo', `Lleva ${d.diasSinEntrenar} días sin marcar un entreno`,
      'Puede que esté entrenando y no lo registre, o puede que no esté entrenando. Vale preguntar antes de asumir.', `${d.diasSinEntrenar} días`);
  } else if (d.completadas >= 8) {
    push('bien', `${d.completadas} entrenos registrados`,
      'Constancia sostenida. Es la variable que más pesa en el resultado y la que más cuesta.', `${d.completadas}`);
  }

  if (d.tresAlLimite) {
    push('ojo', 'Tres sesiones seguidas al límite',
      'Esfuerzo percibido de 9 o más en las últimas tres. Sostenido, eso deja de ser intensidad y pasa a ser fatiga acumulada.', 'RPE 9+ ×3');
  } else if (d.rpeProm != null && d.rpeProm >= 7 && d.rpeProm <= 8.5) {
    push('bien', 'El esfuerzo está en su punto', `Promedio de ${d.rpeProm}/10. Es el rango donde se entrena de verdad sin quemarse.`, `RPE ${d.rpeProm}`);
  } else if (d.rpeProm != null && d.rpeProm < 6) {
    push('idea', 'Podría apretar más', `Esfuerzo promedio de ${d.rpeProm}/10. Si además lleva semanas con los mismos pesos, ahí está la explicación.`, `RPE ${d.rpeProm}`);
  }

  if (d.sinTerminar >= 3) {
    push('ojo', `${d.sinTerminar} sesiones que abrió y no terminó`,
      'Puede ser falta de tiempo, una rutina demasiado larga, o que algo le está molestando. Las tres se arreglan distinto.', `${d.sinTerminar}`);
  }

  if (d.estancados.length) {
    const e = d.estancados[0];
    push('idea', `${e.nombre} lleva ${e.diasEnMax} días sin superar su mejor marca`,
      `${e.marca} desde ${fmt.fecha(e.desde)}, en ${e.sesionesDesde} sesiones: ni más peso ni más reps. ${d.estancados.length > 1 ? `Y no es el único: hay ${d.estancados.length} así.` : ''}`,
      e.marca);
  }
  if (d.progresando.length) {
    const p = d.progresando[0];
    push('bien', `Subió en ${p.nombre}`, `De ${p.de} a ${p.a} en ${p.veces} sesiones. Eso se le dice.`, `+${p.subidaPct}%`);
  }

  if (tiempos) entTiemposLecturas(tiempos).forEach(([tono, titulo, detalle, dato]) => push(tono, titulo, detalle, dato));

  const T = {
    bien: { icono: '✅', clase: 'border-emerald-300 bg-emerald-50', tinta: 'text-emerald-900' },
    ojo:  { icono: '⚠️', clase: 'border-amber-300 bg-amber-50',   tinta: 'text-amber-900' },
    idea: { icono: '💡', clase: 'border-blue-300 bg-blue-50',     tinta: 'text-blue-900' },
  };
  const tabla = (titulo, nota, filas) => filas.length ? `
    <div class="card">
      <div class="font-bold text-slate-900 text-sm">${titulo}</div>
      <div class="text-xs text-slate-500 mb-2 mt-0.5">${nota}</div>
      ${filas.join('')}
    </div>` : '';

  caja.innerHTML = `
    <div class="card mb-4">
      <h3 class="font-bold text-slate-900">🔎 Lecturas de su entrenamiento</h3>
      <p class="text-xs text-slate-500 mt-1 max-w-2xl">
        Calculado aquí con lo que el cliente ya marcó en su app — sin consultar al modelo y sin costo.
        Sobre sus últimas ${ses.length} sesiones.
      </p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-4">
        ${H.map(h => {
          const t = T[h.tono];
          return `<div class="rounded-xl border ${t.clase} p-3">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="font-bold text-sm ${t.tinta}">${t.icono} ${escapeHtml(h.titulo)}</div>
                <p class="text-xs text-slate-600 mt-1 leading-relaxed">${escapeHtml(h.detalle)}</p>
              </div>
              <span class="text-xs font-bold ${t.tinta} whitespace-nowrap flex-shrink-0">${escapeHtml(h.dato)}</span>
            </div></div>`;
        }).join('') || '<div class="text-sm text-slate-500">Todavía no hay suficiente historial para sacar lecturas.</div>'}
      </div>
    </div>

    ${entIntensidadHTML(d.intensidad)}
    ${tiempos ? entTiemposHTML(tiempos) : ''}

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
      ${tabla('🟰 Llevan tiempo sin superar su mejor marca',
        `Ni más peso ni más reps en ${ENT_ESTANCADO_DIAS} días o más, con al menos ${ENT_ESTANCADO_MIN_SES} sesiones de por medio. No siempre hay que cambiarlos — pero hay que saberlo.`,
        d.estancados.slice(0, 8).map(e => `
          <div class="flex items-center justify-between gap-2 py-1.5" style="border-bottom:1px solid #f1f5f9">
            <div class="min-w-0">
              <div class="text-sm font-semibold text-slate-800 truncate">${escapeHtml(e.nombre)}</div>
              <div class="text-[11px] text-slate-400">${e.sesionesDesde} sesiones desde ${fmt.fecha(e.desde)}</div>
            </div>
            <div class="text-right flex-shrink-0">
              <div class="text-sm font-bold text-amber-700">${escapeHtml(e.marca)}</div>
              <div class="text-[11px] text-slate-400">${e.diasEnMax} días</div>
            </div>
          </div>`))}

      ${tabla('📈 Sí se movieron', 'Comparando la primera vez que lo hizo con la última, dentro de este historial.',
        d.progresando.slice(0, 8).map(p => `
          <div class="flex items-center justify-between gap-2 py-1.5" style="border-bottom:1px solid #f1f5f9">
            <div class="min-w-0">
              <div class="text-sm font-semibold text-slate-800 truncate">${escapeHtml(p.nombre)}</div>
              <div class="text-[11px] text-slate-400">${escapeHtml(p.de)} → ${escapeHtml(p.a)} · ${p.veces} sesiones</div>
            </div>
            <div class="text-sm font-bold text-emerald-700 flex-shrink-0">+${p.subidaPct}%</div>
          </div>`))}

      ${tabla('🗣️ Lo que escribió al terminar', 'Sus notas de las últimas sesiones. Aquí es donde avisa de una molestia antes de que sea lesión.',
        d.notas.map(n => `
          <div class="py-1.5" style="border-bottom:1px solid #f1f5f9">
            <div class="text-[11px] text-slate-400">${fmt.fecha(n.fecha)}${n.rutinas?.nombre ? ` · ${escapeHtml(n.rutinas.nombre)}` : ''}${n.rpe != null ? ` · esfuerzo ${n.rpe}/10` : ''}</div>
            <div class="text-sm text-slate-700">${escapeHtml(n.notas_cliente)}</div>
          </div>`))}
    </div>`;
}


// =====================================================
// TRAZABILIDAD · qué ejercicio había y cuál quedó
// =====================================================
// Cada vez que en una rutina un ejercicio se cambia por otro (con el agente,
// «Alternativas», «Cambiar solo los ejercicios» o a mano) queda guardado:
// cuál había, cuál quedó, en qué posición, cuándo y cómo. Va a la tabla
// `cambios_ejercicio` (migraciones/cambios-ejercicio.sql); si la tabla aún no
// existe, se guarda en este navegador y se sube sola cuando exista.
const ENT_ORIGEN_CAMBIO = {
  agente: 'con el agente', 'agente-variante': 'variante del agente', alternativas: 'con Alternativas',
  'solo-ejercicios': 'con «Cambiar solo los ejercicios»', manual: 'a mano',
};
const ENT_CLAVE_CAMBIOS = 'crm:cambiosEjercicioPendientes';
const entCambiosLocales = () => { try { return JSON.parse(localStorage.getItem(ENT_CLAVE_CAMBIOS) || '[]'); } catch (e) { return []; } };
const entGuardarLocales = (l) => { try { localStorage.setItem(ENT_CLAVE_CAMBIOS, JSON.stringify(l.slice(-500))); } catch (e) { /* lleno */ } };

async function entRegistrarCambio({ reId, antes, despues, origen }) {
  const cat = _ent.ejercicios || [];
  const ejAntes = antes.ejercicios || cat.find(x => x.id === antes.ejercicio_id) || {};
  const ejDespues = cat.find(x => x.id === despues) || {};
  const rut = _ent.rutina && _ent.rutina.id === antes.rutina_id ? _ent.rutina : null;
  const fila = {
    cliente_id: rut ? (rut.cliente_id || null) : null,
    rutina_id: String(antes.rutina_id || ''), rutina_nombre: rut ? rut.nombre : null,
    rutina_ejercicio_id: String(reId), posicion: antes.orden ?? null,
    ejercicio_antes: String(antes.ejercicio_id), nombre_antes: entNombres(ejAntes).grande || null,
    ejercicio_despues: String(despues), nombre_despues: entNombres(ejDespues).grande || null,
    origen, creado_at: new Date().toISOString(),
  };
  // Antes del primer await: así la fila ya lo muestra al repintar.
  if (rut) {
    if (_ent.cambiosRutina !== rut.id) _ent.cambios = [];
    _ent.cambios.unshift(fila); _ent.cambiosRutina = rut.id;
  }
  const { error } = await sb.from('cambios_ejercicio').insert(fila);
  if (error) entGuardarLocales([...entCambiosLocales(), fila]);
  else entSubirPendientes();
}
// Lo que quedó en el navegador sin subir (la tabla no existía): se sube.
async function entSubirPendientes() {
  const l = entCambiosLocales();
  if (!l.length) return;
  const { error } = await sb.from('cambios_ejercicio').insert(l);
  if (!error) entGuardarLocales([]);
}
async function entCargarCambios(rutinaId) {
  await entSubirPendientes().catch(() => {});
  const nube = await entDb.cambiosDeRutina(rutinaId).catch(() => null);
  const locales = entCambiosLocales().filter(c => c.rutina_id === String(rutinaId));
  _ent.cambios = [...locales, ...(nube || [])].sort((a, b) => String(b.creado_at).localeCompare(String(a.creado_at)));
  _ent.cambiosRutina = rutinaId;
}
const entFechaCambio = (iso) => { try { return new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };

// En la fila: el último cambio de ese renglón («Antes: …»).
function entCambioDeFila(re) {
  if (!_ent.rutina || _ent.cambiosRutina !== _ent.rutina.id) return '';
  const c = (_ent.cambios || []).find(x => x.rutina_ejercicio_id === String(re.id));
  if (!c) return '';
  return `<div class="ent-cambio" data-cambio-re="${re.id}" title="${escapeHtml(`${entFechaCambio(c.creado_at)} · ${ENT_ORIGEN_CAMBIO[c.origen] || c.origen}`)}">⇄ Antes: <b>${escapeHtml(c.nombre_antes || 'otro ejercicio')}</b> · ${escapeHtml(ENT_ORIGEN_CAMBIO[c.origen] || c.origen)}</div>`;
}
// Al final de la rutina: todos los cambios, del más nuevo al más viejo.
function entHistorialCambiosHTML(r) {
  if (_ent.cambiosRutina !== r.id) return '';
  const l = _ent.cambios || [];
  if (!l.length) return '';
  return `
    <details class="ent-historial-cambios" data-historial-cambios>
      <summary>Cambios de ejercicios en esta rutina (${l.length})</summary>
      <ol>
        ${l.map(c => `<li><span class="ent-hc-fecha">${escapeHtml(entFechaCambio(c.creado_at))}</span>
          <span><s>${escapeHtml(c.nombre_antes || '—')}</s> → <b>${escapeHtml(c.nombre_despues || '—')}</b></span>
          <span class="ent-hc-origen">${c.posicion ? `posición ${c.posicion} · ` : ''}${escapeHtml(ENT_ORIGEN_CAMBIO[c.origen] || c.origen || '')}</span></li>`).join('')}
      </ol>
    </details>`;
}
