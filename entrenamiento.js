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
  tab: 'ejercicios',
  // Galería
  ejercicios: null,
  musculos: null,          // se lee de la tabla `musculos`: una sola fuente
                           // de verdad con el SVG del cuerpo y con la app.
  filtros: { q: '', tipo: '', segmento: '', patron: '', musculo: '', equipo: '' },
  // Constructor
  rutinaId: null,
  rutina: null,
  bloqueDestino: '',       // a qué bloque entran los ejercicios nuevos ('' = sueltos)
  posters: {},             // poster_path → URL firmada (las firmas caducan, se recachean)
  // Clientes
  clienteId: null,
  fases: null,
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
  ['banda', 'Banda'], ['trx', 'TRX / anillas'], ['balon', 'Balón medicinal'],
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
    _ent.ejercicios = data || [];
    return _ent.ejercicios;
  },
  async guardarEjercicio(row, id) {
    const q = id ? sb.from('ejercicios').update(row).eq('id', id)
                 : sb.from('ejercicios').insert(row);
    const { error } = await q;
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
  async agregarEjercicio(row) {
    const { error } = await sb.from('rutina_ejercicios').insert(row);
    if (error) toast(error.message);
  },
  async actualizarRE(id, row) {
    const { error } = await sb.from('rutina_ejercicios').update(row).eq('id', id);
    if (error) toast(error.message);
  },
  async quitarRE(id) {
    const { error } = await sb.from('rutina_ejercicios').delete().eq('id', id);
    if (error) toast(error.message);
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

  // Fases
  async fases(clienteId) {
    const q = sb.from('fases').select('*').order('orden');
    const { data } = clienteId ? await q.eq('cliente_id', clienteId) : await q.is('cliente_id', null);
    return data || [];
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
};

// =====================================================
// VISTA PRINCIPAL
// =====================================================
routes.entrenamiento = async () => {
  view.innerHTML = '<div class="card">Cargando entrenamiento…</div>';
  await entDb.musculos();

  const tabs = [
    ['ejercicios', '🏋️ Ejercicios'],
    ['rutinas', '📋 Rutinas'],
    ['clientes', '👥 Clientes'],
  ];

  view.innerHTML = `
    <div class="mb-4">
      <h2 class="text-xl font-bold text-slate-900">Entrenamiento</h2>
      <p class="text-sm text-slate-500">Arma la galería de ejercicios, construye rutinas y asígnalas por fases.</p>
    </div>
    <div class="flex gap-2 mb-5 overflow-x-auto pb-1">
      ${tabs.map(([id, lab]) => `
        <button class="chip ${_ent.tab === id ? 'active' : ''}" onclick="entTab('${id}')">${lab}</button>
      `).join('')}
    </div>
    <div id="ent-body"></div>
  `;

  if (_ent.tab === 'ejercicios') await entVistaEjercicios();
  else if (_ent.tab === 'rutinas') await entVistaRutinas();
  else await entVistaClientes();
};

window.entTab = (t) => { _ent.tab = t; routes.entrenamiento(); };

// =====================================================
// PESTAÑA 1 · GALERÍA DE EJERCICIOS
// =====================================================
// El filtrado corre en memoria, no en la base: una biblioteca de ejercicios
// son cientos de filas, no millones, y así los filtros responden al instante
// mientras escribes en vez de pegarle a Supabase en cada tecla.

function entFiltrar(lista) {
  const f = _ent.filtros;
  const q = normalizeName(f.q || '');
  return lista.filter(e => {
    if (f.tipo && e.tipo !== f.tipo) return false;
    if (f.segmento && e.segmento !== f.segmento) return false;
    if (f.patron && e.patron !== f.patron) return false;
    if (f.equipo && !(e.equipo || []).includes(f.equipo)) return false;
    if (f.musculo) {
      const ms = [...(e.musculos_primarios || []), ...(e.musculos_secundarios || [])];
      if (!ms.includes(f.musculo)) return false;
    }
    if (q) {
      const heno = normalizeName(`${e.nombre} ${e.alias || ''} ${e.descripcion || ''}`);
      if (!heno.includes(q)) return false;
    }
    return true;
  });
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
  if (e.video_fuente === 'youtube') return '<span class="tag tag-red">▶ YouTube</span>';
  if (e.video_fuente === 'archivo') return '<span class="tag tag-blue">⬆ Subido</span>';
  return '<span class="tag tag-gray">sin video</span>';
}

function entTarjetaEjercicio(e, opts = {}) {
  // El preview sale del video que TENGA el ejercicio: la miniatura de
  // YouTube, o el fotograma capturado al subir el archivo. `poster_url` gana
  // si algún día quieres poner una imagen a mano.
  const thumb = e.poster_url
    || (e.video_fuente === 'youtube' ? entYoutubeThumb(e.video_ref) : null)
    || (e.poster_path ? _ent.posters[e.poster_path] : null);
  return `
    <div class="card card-hover p-3">
      <div class="flex gap-3">
        <div class="w-24 h-16 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
          ${thumb ? `<img src="${escapeHtml(thumb)}" class="w-full h-full object-cover" loading="lazy" alt="">`
                  : '<span class="text-2xl">🏋️</span>'}
        </div>
        <div class="min-w-0 flex-1">
          <div class="font-bold text-slate-900 text-sm truncate">${escapeHtml(e.nombre)}</div>
          <div class="text-xs text-slate-500 mb-1">
            ${entLabel(ENT_TIPOS, e.tipo)} · ${entLabel(ENT_SEGMENTOS, e.segmento)}
          </div>
          <div class="flex flex-wrap gap-1">${entChipMusculos(e)}</div>
        </div>
      </div>
      <div class="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
        <div>${entIconoVideo(e)}</div>
        <div class="flex gap-1">
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
      <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
        <select onchange="entSetFiltro('tipo', this.value)">${entOpciones(ENT_TIPOS, f.tipo, 'Todo tipo')}</select>
        <select onchange="entSetFiltro('segmento', this.value)">${entOpciones(ENT_SEGMENTOS, f.segmento, 'Todo segmento')}</select>
        <select onchange="entSetFiltro('patron', this.value)">${entOpciones(ENT_PATRONES, f.patron, 'Todo patrón')}</select>
        <select onchange="entSetFiltro('musculo', this.value)">${entOpciones(musOpts, f.musculo, 'Todo músculo')}</select>
        <select onchange="entSetFiltro('equipo', this.value)">${entOpciones(ENT_EQUIPO, f.equipo, 'Todo equipo')}</select>
      </div>
      <div class="mt-2 flex items-center justify-between">
        <span id="${prefijo}-count" class="text-xs text-slate-500"></span>
        <button class="btn btn-ghost btn-sm" onclick="entLimpiarFiltros()">Limpiar filtros</button>
      </div>
    </div>
  `;
}

// El repintado conserva el foco y el cursor del buscador: sin esto, escribir
// "press" repinta en cada letra y el cursor se va al inicio en la segunda.
window.entSetFiltro = (k, v) => {
  _ent.filtros[k] = v;
  const activo = document.activeElement;
  const eraBusqueda = activo && activo.id && activo.id.endsWith('-q');
  const pos = eraBusqueda ? activo.selectionStart : null;
  const idGuardado = eraBusqueda ? activo.id : null;
  const repintar = _ent.tab === 'rutinas' && _ent.rutinaId ? entPintarConstructor : entVistaEjercicios;
  Promise.resolve(repintar()).then(() => {
    if (!idGuardado) return;
    const nuevo = document.getElementById(idGuardado);
    if (nuevo) { nuevo.focus(); try { nuevo.setSelectionRange(pos, pos); } catch (err) {} }
  });
};

window.entLimpiarFiltros = () => {
  _ent.filtros = { q: '', tipo: '', segmento: '', patron: '', musculo: '', equipo: '' };
  if (_ent.tab === 'rutinas' && _ent.rutinaId) entPintarConstructor(); else entVistaEjercicios();
};

async function entVistaEjercicios() {
  const body = $('#ent-body');
  if (!body) return;
  const todos = await entDb.ejercicios();
  const lista = entFiltrar(todos);
  // Firmar solo las miniaturas que se van a ver, no toda la biblioteca.
  await entDb.firmarPosters(lista.map(e => e.poster_path).filter(Boolean));

  body.innerHTML = `
    <div class="flex justify-between items-center mb-3">
      <div class="text-sm text-slate-600">${todos.length} ejercicio${todos.length === 1 ? '' : 's'} en la galería</div>
      <button class="btn btn-primary btn-sm" onclick="entEditarEjercicio()">+ Nuevo ejercicio</button>
    </div>
    ${entBarraFiltros('flt')}
    ${lista.length === 0 ? `
      <div class="card text-center text-slate-500 py-8">
        ${todos.length === 0
          ? 'La galería está vacía. Crea tu primer ejercicio para empezar a armar rutinas.'
          : 'Ningún ejercicio coincide con esos filtros.'}
      </div>
    ` : `
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        ${lista.map(e => entTarjetaEjercicio(e)).join('')}
      </div>
    `}
  `;
  const c = $('#flt-count');
  if (c) c.textContent = `${lista.length} de ${todos.length}`;
}

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
                   onchange="this.parentNode.style.cssText = this.checked ? 'background:#d1fae5;color:#065f46' : ''"
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
      <div><label>Nombre *</label><input id="ej-nombre" value="${escapeHtml(e.nombre || '')}" placeholder="Press banca con barra"></div>
      <div><label>Otro nombre (para buscarlo)</label><input id="ej-alias" value="${escapeHtml(e.alias || '')}" placeholder="RDL, peso muerto rumano"></div>
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
    <details class="mb-2" open>
      <summary class="text-xs font-bold text-slate-600 cursor-pointer mb-1">Primarios</summary>
      ${casillas('prim', e.musculos_primarios)}
    </details>
    <details class="mb-4">
      <summary class="text-xs font-bold text-slate-600 cursor-pointer mb-1">Secundarios</summary>
      ${casillas('sec', e.musculos_secundarios)}
    </details>

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
  _ent._video = {
    fuente: e.video_fuente || 'ninguno',
    url: e.video_url || '',
    ref: e.video_ref || '',
    path: e.video_path || '',
    poster: e.poster_path || '',
    inicio: e.video_inicio_seg || '',
  };
  entPintarPanelVideo();
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
    panel.innerHTML = `
      <label>Pega el link de YouTube</label>
      <input id="ej-video-url" value="${escapeHtml(v.url)}"
             placeholder="https://youtu.be/… o https://www.youtube.com/watch?v=…"
             oninput="entValidarYoutube(this.value)">
      <div id="ej-yt-estado" class="text-xs mt-1 ${ref ? 'text-emerald-600' : 'text-slate-400'}">
        ${ref ? `✓ Video reconocido (${escapeHtml(ref)})` : 'Pega el link y se valida solo.'}
      </div>
      <div class="mt-2"><label>Empezar en el segundo (opcional)</label>
        <input id="ej-video-inicio" type="number" min="0" value="${escapeHtml(String(v.inicio || ''))}" placeholder="0"></div>
      ${ref ? `<img src="${entYoutubeThumb(ref)}" class="mt-2 rounded-lg w-48" alt="">` : ''}
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

window.entValidarYoutube = (url) => {
  const v = _ent._video;
  v.url = url;
  v.ref = entYoutubeId(url) || '';
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
    updated_at: new Date().toISOString(),
  };

  if (v.fuente === 'youtube' && !v.ref) { toast('El link de YouTube no es válido'); return; }
  if (v.fuente === 'archivo' && !v.path) { toast('Falta subir el archivo de video'); return; }

  const ok = await entDb.guardarEjercicio(row, id);
  if (!ok) return;
  closeModal();
  toast(id ? '✓ Ejercicio actualizado' : '✓ Ejercicio creado');
  // Desde el constructor se vuelve al constructor, no a la galería.
  if (_ent.tab === 'rutinas' && _ent.rutinaId) entPintarConstructor(); else entVistaEjercicios();
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
      <button class="btn btn-primary btn-sm" onclick="entNuevaRutina()">+ Nueva rutina</button>
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
  _ent.tab = 'rutinas';
  entAbrirConstructor(r.id);
};

window.entAbrirConstructor = async (id) => {
  _ent.rutinaId = id;
  _ent.tab = 'rutinas';
  await routes.entrenamiento();
};

window.entCerrarConstructor = () => {
  _ent.rutinaId = null;
  _ent.rutina = null;
  _ent.bloqueDestino = '';
  routes.entrenamiento();
};

// ---------- El constructor ----------
// Dos columnas: la galería a la izquierda (con los mismos filtros de la
// pestaña 1) y la rutina a la derecha. Un clic en "+ Añadir" la mete al
// final. En móvil se apilan, galería abajo.
async function entPintarConstructor() {
  const body = $('#ent-body');
  if (!body) return;
  body.innerHTML = '<div class="card">Cargando rutina…</div>';

  const r = await entDb.rutina(_ent.rutinaId);
  if (!r) { toast('No encontré esa rutina'); return entCerrarConstructor(); }
  _ent.rutina = r;

  const todos = await entDb.ejercicios();
  const galeria = entFiltrar(todos);

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

  body.innerHTML = `
    <div class="card mb-4">
      <div class="flex justify-between items-start gap-3 flex-wrap">
        <div class="min-w-0">
          <button class="btn btn-ghost btn-sm mb-1" onclick="entCerrarConstructor()">← Volver</button>
          <div class="font-bold text-lg text-slate-900">${escapeHtml(r.nombre)}</div>
          <div class="text-xs text-slate-500">${contexto} · ${r.ejercicios.length} ejercicio${r.ejercicios.length === 1 ? '' : 's'}</div>
        </div>
        <div class="flex gap-1 flex-wrap">
          <button class="btn btn-ghost btn-sm" onclick="entNuevoBloque()">+ Bloque</button>
          <button class="btn btn-ghost btn-sm" onclick="entEditarDatosRutina()">Editar datos</button>
          <button class="btn btn-ghost btn-sm" onclick="entCopiarRutinaA('${r.id}')">Copiar a…</button>
        </div>
      </div>
    </div>

    <div class="grid lg:grid-cols-2 gap-4">
      <div class="order-2 lg:order-1">
        <div class="text-sm font-bold text-slate-700 mb-2">Galería · toca “Añadir” para meterlo a la rutina</div>
        ${r.bloques.length ? `
          <div class="card mb-2 flex items-center gap-2 flex-wrap" style="padding:0.7rem 0.9rem">
            <span class="text-xs font-bold text-slate-600">Lo que añada va a:</span>
            <select onchange="entDestino(this.value)" style="width:auto;min-width:150px">
              <option value="" ${_ent.bloqueDestino === '' ? 'selected' : ''}>Sueltos (sin bloque)</option>
              ${r.bloques.map(b => `<option value="${b.id}" ${_ent.bloqueDestino === b.id ? 'selected' : ''}>${escapeHtml(b.nombre || entLabel(ENT_TIPOS_BLOQUE, b.tipo))}</option>`).join('')}
            </select>
          </div>` : ''}
        ${entBarraFiltros('cons')}
        <div class="grid grid-cols-1 gap-2 max-h-[70vh] overflow-y-auto pr-1">
          ${galeria.length === 0
            ? '<div class="card text-center text-slate-500 py-6 text-sm">Ningún ejercicio con esos filtros.</div>'
            : galeria.map(e => entTarjetaEjercicio(e, { agregar: true })).join('')}
        </div>
      </div>

      <div class="order-1 lg:order-2">
        <div class="text-sm font-bold text-slate-700 mb-2">La rutina</div>
        ${entRenderRutina(r)}
      </div>
    </div>
  `;
  const c = $('#cons-count');
  if (c) c.textContent = `${galeria.length} de ${todos.length}`;
}

// ---------- Render agrupado de la rutina ----------
// Se recorre en el orden real (`orden`) y se envuelven los tramos SEGUIDOS
// que comparten bloque. Es como se lee un entreno en papel: A1-A2 juntos,
// luego B1-B2. Un ejercicio que se sale de su bloque al moverlo simplemente
// deja de estar en ese tramo — sin estados imposibles ni reordenar dos
// listas a la vez.
function entRenderRutina(r) {
  if (r.ejercicios.length === 0 && r.bloques.length === 0) {
    return `<div class="card text-center text-slate-500 py-8 text-sm">
      Rutina vacía. Elige ejercicios de la galería.
    </div>`;
  }
  const porId = Object.fromEntries(r.bloques.map(b => [b.id, b]));

  // Partir en tramos por bloque_id consecutivo
  const tramos = [];
  r.ejercicios.forEach((re, i) => {
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && ultimo.bloqueId === (re.bloque_id || null)) ultimo.items.push({ re, i });
    else tramos.push({ bloqueId: re.bloque_id || null, items: [{ re, i }] });
  });

  const total = r.ejercicios.length;
  let html = tramos.map(t => {
    const filas = t.items.map(({ re, i }) => entFilaRutina(re, i, total, r.bloques)).join('');
    if (!t.bloqueId || !porId[t.bloqueId]) return `<div class="flex flex-col gap-2">${filas}</div>`;
    return entEnvolverBloque(porId[t.bloqueId], filas, t.items.length);
  }).join('');

  // Bloques todavía sin ejercicios: si no se pintaran, crearías un circuito
  // y desaparecería hasta meterle algo.
  const usados = new Set(r.ejercicios.map(e => e.bloque_id).filter(Boolean));
  r.bloques.filter(b => !usados.has(b.id)).forEach(b => {
    html += entEnvolverBloque(b, `<div class="text-xs text-slate-400 py-2 text-center">
      Bloque vacío — elígelo arriba como destino y añade ejercicios.</div>`, 0);
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
    <div class="rounded-xl mb-2" style="border:1.5px solid #cbd5e1;background:#f8fafc;padding:0.6rem">
      <div class="flex justify-between items-start gap-2 mb-2">
        <div class="min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="tag tag-violet">${escapeHtml(etq)}</span>
            <span class="font-bold text-sm text-slate-800">${escapeHtml(b.nombre || '')}</span>
          </div>
          <div class="text-xs text-slate-500 mt-0.5">
            ${partes.length ? escapeHtml(partes.join(' · ')) : 'Sin tiempos configurados'}
            ${cuantos ? ` · ${cuantos} ejercicio${cuantos === 1 ? '' : 's'}` : ''}
          </div>
        </div>
        <div class="flex gap-0.5 flex-shrink-0">
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
  return `
    <div class="card p-3">
      <div class="flex justify-between items-start gap-2 mb-2">
        <div class="min-w-0">
          <div class="font-bold text-sm text-slate-900">${i + 1}. ${escapeHtml(e.nombre || 'Ejercicio')}</div>
          <div class="text-xs text-slate-500">${entLabel(ENT_TIPOS, e.tipo)} · ${entChipMusculos(e)}</div>
        </div>
        <div class="flex gap-0.5 flex-shrink-0">
          <button class="btn btn-ghost btn-sm" ${i === 0 ? 'disabled' : ''} onclick="entMoverRE('${re.id}', -1)">↑</button>
          <button class="btn btn-ghost btn-sm" ${i === total - 1 ? 'disabled' : ''} onclick="entMoverRE('${re.id}', 1)">↓</button>
          <button class="btn btn-ghost btn-sm" onclick="entQuitarRE('${re.id}')">✕</button>
        </div>
      </div>
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

window.entAgregarARutina = async (ejercicioId) => {
  if (!_ent.rutinaId) { toast('Abre una rutina primero'); return; }
  const orden = (_ent.rutina?.ejercicios?.length || 0) + 1;
  await entDb.agregarEjercicio({
    rutina_id: _ent.rutinaId, ejercicio_id: ejercicioId, orden,
    bloque_id: _ent.bloqueDestino || null,
    series: 3, reps: '10', descanso_seg: 90,
  });
  await entPintarConstructor();
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
};

window.entQuitarRE = async (id) => {
  await entDb.quitarRE(id);
  await entPintarConstructor();
};

// Reordenar intercambiando el campo `orden` con el vecino. Con listas de 5-15
// ejercicios esto es más simple y más robusto que arrastrar y soltar en móvil.
window.entMoverRE = async (id, delta) => {
  const lista = _ent.rutina?.ejercicios || [];
  const i = lista.findIndex(x => x.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= lista.length) return;
  await Promise.all([
    entDb.actualizarRE(lista[i].id, { orden: j + 1 }),
    entDb.actualizarRE(lista[j].id, { orden: i + 1 }),
  ]);
  await entPintarConstructor();
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
  entPintarConstructor();
};

window.entBorrarBloque = async (id) => {
  if (!confirm('¿Deshacer este bloque? Sus ejercicios quedan sueltos en la rutina, no se borran.')) return;
  await entDb.borrarBloque(id);
  if (_ent.bloqueDestino === id) _ent.bloqueDestino = '';
  toast('Bloque deshecho');
  entPintarConstructor();
};

window.entMoverABloque = async (reId, bloqueId) => {
  await entDb.actualizarRE(reId, { bloque_id: bloqueId || null });
  await entPintarConstructor();
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
    updated_at: new Date().toISOString(),
  });
  closeModal();
  toast('✓ Guardado');
  entPintarConstructor();
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

async function entVistaClientes() {
  const body = $('#ent-body');
  if (!body) return;
  const clientes = (await db.clientes.list()).filter(c => c.estado !== 'finalizado');

  if (!_ent.clienteId) {
    body.innerHTML = `
      <div class="text-sm text-slate-600 mb-3">Elige un cliente para ver y armar sus fases de entrenamiento.</div>
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        ${clientes.map(c => `
          <div class="card card-hover cursor-pointer" onclick="entVerCliente('${c.id}')">
            <div class="font-bold text-slate-900">${escapeHtml(c.nombre)}</div>
            <div class="text-xs text-slate-500">
              ${c.objetivo ? escapeHtml(c.objetivo) : 'Sin objetivo definido'}
              ${(c.dias_entreno || []).length ? ` · ${c.dias_entreno.join(' ')}` : ''}
            </div>
          </div>`).join('')}
      </div>
      ${clientes.length === 0 ? '<div class="card text-center text-slate-500 py-8">No hay clientes activos.</div>' : ''}
    `;
    return;
  }

  const cliente = clientes.find(c => c.id === _ent.clienteId) || await db.clientes.get(_ent.clienteId);
  const fases = await entDb.fases(_ent.clienteId);

  // Las rutinas de cada fase se traen en paralelo: en serie, un cliente con
  // 5 fases hace 5 viajes encadenados y la pestaña se siente lenta.
  const rutinasPorFase = {};
  await Promise.all(fases.map(async f => { rutinasPorFase[f.id] = await entDb.rutinasDeFase(f.id); }));

  body.innerHTML = `
    <div class="flex justify-between items-start mb-4 gap-2 flex-wrap">
      <div>
        <button class="btn btn-ghost btn-sm mb-1" onclick="entVerCliente(null)">← Todos los clientes</button>
        <div class="font-bold text-lg text-slate-900">${escapeHtml(cliente?.nombre || 'Cliente')}</div>
        <div class="text-xs text-slate-500">
          ${(cliente?.dias_entreno || []).length ? `Entrena: ${cliente.dias_entreno.join(' · ')}` : 'Sin días de entreno definidos en su ficha'}
        </div>
      </div>
      <div class="flex gap-1 flex-wrap">
        <button class="btn btn-secondary btn-sm" onclick="entImportarFase()">⇄ Importar fase de otro cliente</button>
        <button class="btn btn-primary btn-sm" onclick="entNuevaFase()">+ Nueva fase</button>
      </div>
    </div>

    ${fases.length === 0 ? `
      <div class="card text-center text-slate-500 py-8">
        Este cliente no tiene fases todavía. Crea una, o importa una fase que ya
        armaste para otro cliente.
      </div>
    ` : fases.map(f => entTarjetaFase(f, rutinasPorFase[f.id] || [])).join('')}
  `;
}

window.entVerCliente = (id) => { _ent.clienteId = id; entVistaClientes(); };

function entFechaFin(f) {
  if (!f.fecha_inicio || !f.semanas) return null;
  const [y, m, d] = f.fecha_inicio.split('-').map(Number);
  const fin = new Date(y, m - 1, d);
  fin.setDate(fin.getDate() + f.semanas * 7 - 1);
  return fin.toISOString().slice(0, 10);
}

function entTarjetaFase(f, rutinas) {
  const fin = entFechaFin(f);
  const estadoTag = { activa: 'tag-green', borrador: 'tag-yellow', finalizada: 'tag-gray', archivada: 'tag-gray' }[f.estado] || 'tag-gray';
  return `
    <div class="card mb-3">
      <div class="flex justify-between items-start gap-2 flex-wrap mb-2">
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-bold text-slate-900">${escapeHtml(f.nombre)}</span>
            <span class="tag ${estadoTag}">${escapeHtml(f.estado)}</span>
          </div>
          <div class="text-xs text-slate-500 mt-0.5">
            ${f.semanas || '?'} semana${f.semanas === 1 ? '' : 's'}
            ${f.fecha_inicio ? ` · ${f.fecha_inicio}${fin ? ` → ${fin}` : ''}` : ' · sin fecha de inicio'}
            ${(f.dias_semana || []).length ? ` · ${f.dias_semana.join(' ')}` : ''}
          </div>
          ${f.objetivo ? `<div class="text-xs text-slate-600 mt-1">${escapeHtml(f.objetivo)}</div>` : ''}
        </div>
        <div class="flex gap-1 flex-wrap flex-shrink-0">
          <button class="btn btn-ghost btn-sm" onclick="entEditarFase('${f.id}')">Editar</button>
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
                    ${r.dia_semana ? `<span class="tag tag-blue ml-1">${entLabel(ENT_DIAS, r.dia_semana)}</span>` : ''}
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
  const clientes = (await db.clientes.list()).filter(c => c.id !== excluir && c.estado !== 'finalizado');
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
  const clientes = (await db.clientes.list()).filter(c => c.estado !== 'finalizado');
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

// Copiar una fase COMPLETA (con todas sus rutinas) a otro cliente.
window.entCopiarFaseA = async (faseId) => {
  openModal(modalShell('Copiar fase completa a…', `
    <p class="text-sm text-slate-600 mb-3">
      Se copian la fase y <b>todas sus rutinas</b>. No se copia el historial:
      las sesiones ya entrenadas siguen siendo del cliente original.
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
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="entConfirmarCopiarFase('${faseId}')">Copiar fase</button>`));
};

window.entConfirmarCopiarFase = async (faseId) => {
  const nueva = await entDb.copiarFase(
    faseId,
    $('#cf-cliente')?.value || null,
    $('#cf-inicio')?.value || null,
    $('#cf-nombre')?.value.trim() || null,
  );
  if (!nueva) return;
  closeModal();
  toast('✓ Fase copiada');
  entVistaClientes();
};

// Importar hacia ESTE cliente: el mismo copiar_fase, pero mirado al revés —
// eliges de quién traerla en vez de a quién mandarla. Es como se piensa al
// armar el proceso de alguien nuevo.
window.entImportarFase = async () => {
  const clientes = (await db.clientes.list()).filter(c => c.id !== _ent.clienteId);
  openModal(modalShell('Importar fase de otro cliente', `
    <p class="text-sm text-slate-600 mb-3">Trae una fase con todas sus rutinas hacia este cliente.</p>
    <div class="mb-3"><label>Traer de</label>
      <select id="if-cliente" onchange="entCargarFasesOrigen(this.value)">
        <option value="">— Plantillas de fase —</option>
        ${clientes.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('')}
      </select></div>
    <div class="mb-3"><label>Fase</label><select id="if-fase"><option value="">Elige primero el origen</option></select></div>
    <div class="grid grid-cols-2 gap-3">
      <div><label>Fecha de inicio</label><input id="if-inicio" type="date"></div>
      <div><label>Nombre nuevo (opcional)</label><input id="if-nombre" placeholder="Igual que la original"></div>
    </div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="entConfirmarImportar()">Importar</button>`));
  entCargarFasesOrigen('');
};

window.entCargarFasesOrigen = async (clienteId) => {
  const sel = $('#if-fase');
  if (!sel) return;
  const fases = await entDb.fases(clienteId || null);
  sel.innerHTML = fases.length
    ? fases.map(f => `<option value="${f.id}">${escapeHtml(f.nombre)} · ${f.semanas || '?'} sem</option>`).join('')
    : '<option value="">— no hay fases ahí —</option>';
};

window.entConfirmarImportar = async () => {
  const faseId = $('#if-fase')?.value;
  if (!faseId) { toast('Elige una fase para importar'); return; }
  const nueva = await entDb.copiarFase(
    faseId, _ent.clienteId,
    $('#if-inicio')?.value || null,
    $('#if-nombre')?.value.trim() || null,
  );
  if (!nueva) return;
  closeModal();
  toast('✓ Fase importada');
  entVistaClientes();
};

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
