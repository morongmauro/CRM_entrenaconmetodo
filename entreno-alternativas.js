// =====================================================
// ALTERNATIVAS · cambiar un ejercicio por otro parecido, sin IA
// =====================================================
// En cada ejercicio del constructor, «⇄ Alternativas» abre los de la galería
// que trabajan lo mismo (el mismo movimiento y los mismos músculos) con otro
// equipo, otro agarre o a un lado, ordenados por parecido. «Sustituir» cambia
// el ejercicio EN SU MISMO RENGLÓN de la rutina: se quedan su lugar, sus
// series, reps, peso, descanso, RIR, tempo, notas y su bloque o circuito. El
// historial del cliente no se toca (va por ejercicio, y el viejo conserva el
// suyo).
//
// Ojo con los datos: en la galería que vino de Trainerize 1 de cada 3 fichas
// de fuerza no tiene patrón, algunas lo tienen mal (un crunch como
// «tracción») y casi todas dicen «intermedio» porque es el nivel por defecto.
// Por eso el parecido NO depende solo del patrón: el movimiento se reconoce
// también por el nombre (inglés y español) y se cruza con los músculos.
// «Más fácil / más difícil» es un estimado (nivel, máquina vs. peso libre,
// a un lado).
//
// Va DESPUÉS de entrenamiento.js (usa _ent, entDb, entNombres, entMiniatura…).

// El movimiento, por el nombre. El orden importa: lo más específico primero
// («curl femoral» antes que «curl», «press francés» antes que «press»).
const ALT_FAMILIAS = [
  ['gemelos', /gemel|pantorrill|\bcalf|soleo/],
  ['curl_femoral', /curl femoral|leg curl|hamstring curl|curl de isquio|nordic|nordico|curl acostado|lying curl|seated curl/],
  ['ext_cuadriceps', /extension de (cuadriceps|piernas?|rodillas?)|leg extension|extension de cuadri/],
  ['abduccion', /abduc/],
  ['aduccion', /aduc|adduct/],
  ['hip_thrust', /hip thrust|empuje de cadera|puente|bridge|glute thrust/],
  ['swing', /swing/],
  ['peso_muerto', /peso muerto|deadlift|\brdl\b|rumano|good ?morning|buenos dias|hinge|bisagra|pull ?through/],
  ['zancada', /zancada|lunge|split squat|bulgar|step ?up|subida al|estocada|cossack|cosaco|curtsy/],
  ['prensa', /prensa|leg press/],
  ['sentadilla', /sentadilla|squat|\bhack\b/],
  ['triceps', /tricep|press frances|skull|kickback|patada|fondos|\bdips?\b|pushdown|push down|press cerrado|close grip (bench|press)|extension de codo/],
  ['posterior', /face pull|pajaro|reverse fl|rear delt|deltoide posterior|apertura invertid|aperturas invertid/],
  ['jalon', /jalon|pull ?down|dominada|pull ?up|chin ?up|pullover/],
  ['remo', /\bremo|\brows?\b/],
  ['elev_lateral', /lateral raise|elevacion(es)? lateral/],
  ['elev_frontal', /front raise|elevacion(es)? frontal/],
  ['press_vertical', /press militar|overhead press|shoulder press|press de hombros?|arnold|landmine press|push press|press sobre la cabeza|press vertical|\bz press|pike/],
  ['aperturas', /apertura|\bfly|flye|cruce de polea|crossover|pec deck|contractor/],
  ['press_horizontal', /press (de )?banca|bench press|chest press|press de pecho|flexion|push ?up|lagartija|press inclinado|press declinado|floor press|press plano|incline press|decline press/],
  ['curl_biceps', /curl|martillo|hammer|predicador|preacher|bicep/],
  ['encogimiento', /encogimiento de (trapecio|hombros)|shrug/],
  ['plancha', /plancha|plank/],
  ['antirrotacion', /pallof|antirrota|rotacion|woodchop|lenador|\bchop|twist|giro ruso|russian/],
  ['crunch', /crunch|abdominal|sit ?up|leg raise|elevacion(es)? de piernas|\bv ?up|hollow|dead ?bug|bicho muerto/],
  ['carry', /farmer|carry|paseo del granjero|maleta|suitcase/],
];
// Lo que se compara entre sí: fuerza con fuerza, movilidad con movilidad.
const ALT_CLASE = {
  fuerza: 'fuerza', hipertrofia: 'fuerza', potencia: 'fuerza', pliometrico: 'fuerza', core: 'fuerza',
  movilidad: 'movilidad', estiramiento_pasivo: 'movilidad', estiramiento_activo: 'movilidad',
  calentamiento: 'movilidad', rehabilitacion: 'movilidad', cardio: 'cardio', agilidad: 'cardio',
};
// Lo que es «con peso» (lo demás: peso corporal, banda, TRX, banco, cajón…).
// Fichas de Trainerize marcadas «fuerza» que en realidad son rodillo, estiramiento o postura.
const ALT_NO_FUERZA = /foam roll|rodillo|stretch|estiramiento|\bpose\b|postura|yoga|mobility|movilidad|release|liberacion/;
const ALT_CARGA = ['barra', 'mancuerna', 'kettlebell', 'polea', 'maquina', 'smith', 'lastre', 'disco', 'balon', 'landmine', 'barra_ez'];
const ALT_FILTROS = [
  ['sin_peso', 'Sin peso', 'carga'], ['con_peso', 'Con peso', 'carga'],
  ['facil', 'Más fácil', 'nivel'], ['dificil', 'Más difícil', 'nivel'],
  ['casa', 'Casa', 'lugar'], ['gym', 'Gimnasio', 'lugar'],
];

const _alt = { reId: null, filtros: {}, q: '', hechos: {}, cargando: null };

const altArr = (v) => (Array.isArray(v) ? v : []);
const altNorm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
function altFamilia(e) {
  const t = ' ' + altNorm(`${e.nombre || ''} ${e.alias || ''}`) + ' ';
  for (const [k, re] of ALT_FAMILIAS) if (re.test(t)) return k;
  return null;
}
const altConCarga = (e) => altArr(e.equipo).some(x => ALT_CARGA.includes(x));
// Dificultad estimada: el nivel manda; la máquina guía el movimiento (más
// fácil), el peso libre y a un lado piden más control (más difícil).
function altDificultad(e) {
  const nivel = { principiante: 0, intermedio: 1, avanzado: 2 }[e.nivel] ?? 1;
  const eq = altArr(e.equipo);
  let d = nivel * 2;
  if (e.unilateral) d += 1;
  if (eq.includes('barra') || eq.includes('kettlebell')) d += 1;
  else if (eq.includes('mancuerna')) d += 0.5;
  if (eq.includes('maquina') || eq.includes('smith') || eq.includes('polea')) d -= 1;
  return d;
}
function altJaccard(a, b) {
  const A = new Set(altArr(a)), B = new Set(altArr(b));
  if (!A.size || !B.size) return 0;
  let n = 0; A.forEach(x => { if (B.has(x)) n++; });
  return n / (A.size + B.size - n);
}
const altEquipoTexto = (e) => altArr(e.equipo).filter(x => x !== 'banco')
  .map(x => (ENT_EQUIPO.find(q => q[0] === x) || [x, x.replace(/_/g, ' ')])[1]).join(' + ');

// Las alternativas de un ejercicio, de la más parecida a la menos.
function altCandidatos(src, lista) {
  const fs = altFamilia(src), clase = ALT_CLASE[src.tipo] || 'fuerza';
  const dSrc = altDificultad(src), eqSrc = altEquipoTexto(src), cargaSrc = altConCarga(src);
  const nombresSrc = new Set([altNorm(src.nombre), altNorm(src.alias)].filter(Boolean));
  const vistos = new Set();
  const out = [];
  for (const c of lista || []) {
    if (!c || c.id === src.id || c.archivado || c.duplicado_de) continue;
    if ((ALT_CLASE[c.tipo] || 'fuerza') !== clase) continue;
    if (clase === 'fuerza' && ALT_NO_FUERZA.test(' ' + altNorm(`${c.nombre || ''} ${c.alias || ''}`) + ' ')) continue;
    // Ni él mismo con otra ficha, ni dos fichas con el mismo nombre.
    const clave = altNorm(entNombres(c).grande);
    if (nombresSrc.has(altNorm(c.nombre)) || nombresSrc.has(altNorm(c.alias)) || vistos.has(clave)) continue;
    // Tren superior con tren superior (la aducción de hombro no es la de cadera).
    if (src.segmento && c.segmento && src.segmento !== c.segmento && src.segmento !== 'full_body' && c.segmento !== 'full_body') continue;
    const fc = altFamilia(c);
    const mismoMov = !!fs && fs === fc;
    // Dos movimientos que se reconocen distintos (remo y jalón, press y
    // aperturas) no son alternativa uno del otro aunque compartan músculos.
    if (fs && fc && fs !== fc) continue;
    const mismoPatron = !!src.patron && src.patron === c.patron;
    const choquePatron = !!src.patron && !!c.patron && src.patron !== c.patron;
    const jac = altJaccard(src.musculos_primarios, c.musculos_primarios);
    const mismoSeg = !!src.segmento && src.segmento === c.segmento;
    const pasa = mismoMov
      || (jac >= 0.5 && mismoSeg && !choquePatron)
      || (mismoPatron && jac >= 0.34 && mismoSeg);
    if (!pasa) continue;
    vistos.add(clave);
    // Primero lo práctico: el mismo tipo de carga (con peso / sin peso), con
    // video y lo que ya usan tus clientes. Los filtros cambian lo demás.
    const puntos = (mismoMov ? 50 : 0) + (mismoPatron ? 12 : 0) + jac * 30
      + altJaccard(src.musculos_secundarios, c.musculos_secundarios) * 5 + (mismoSeg ? 5 : 0)
      + (altConCarga(c) === cargaSrc ? 4 : 0)
      + (c.video_fuente && c.video_fuente !== 'ninguno' ? 3 : 0)
      + (_ent.usados && _ent.usados.has && _ent.usados.has(c.id) ? 4 : 0);
    const porque = [];
    if (mismoMov) porque.push('Mismo movimiento');
    if (jac >= 0.6) porque.push('Mismos músculos'); else if (jac >= 0.34) porque.push('Músculos parecidos');
    const eqC = altEquipoTexto(c);
    if (eqC && eqC !== eqSrc) porque.push('Otro equipo');
    else if (mismoMov) porque.push('Otra variante');
    if (!!c.unilateral !== !!src.unilateral) porque.push(c.unilateral ? 'A un lado' : 'Con los dos lados');
    const d = altDificultad(c);
    out.push({ e: c, puntos, porque, dif: d - dSrc });
  }
  return out.sort((a, b) => b.puntos - a.puntos || entNombres(a.e).grande.localeCompare(entNombres(b.e).grande, 'es'));
}
function altPasaFiltros(x) {
  const f = _alt.filtros, e = x.e;
  if (f.carga === 'sin_peso' && altConCarga(e)) return false;
  if (f.carga === 'con_peso' && !altConCarga(e)) return false;
  if (f.nivel === 'facil' && !(x.dif < 0)) return false;
  if (f.nivel === 'dificil' && !(x.dif > 0)) return false;
  if (f.lugar && !altArr(e.lugar).includes(f.lugar)) return false;
  if (_alt.q) {
    const q = altNorm(_alt.q);
    if (!altNorm(`${e.nombre || ''} ${e.alias || ''}`).includes(q)) return false;
  }
  return true;
}

// Lo que el cliente de esta rutina ya hizo alguna vez (para marcarlo).
async function altCargarHechos(clienteId) {
  if (!clienteId || _alt.hechos[clienteId]) return _alt.hechos[clienteId] || null;
  if (_alt.cargando) return _alt.cargando;
  _alt.cargando = (async () => {
    const ses = await entDb.sesiones(clienteId, { limite: 400 });
    const ids = (ses || []).map(s => s.id);
    const series = ids.length ? await entDb.seriesDeSesiones(ids) : [];
    const veces = new Map();
    (series || []).forEach(s => { if (s.ejercicio_id) veces.set(s.ejercicio_id, (veces.get(s.ejercicio_id) || new Set()).add(s.sesion_id)); });
    _alt.hechos[clienteId] = veces;
    return veces;
  })().finally(() => { _alt.cargando = null; });
  return _alt.cargando;
}

const altRE = () => (_ent.rutina?.ejercicios || []).find(x => x.id === _alt.reId) || null;

function altTarjeta(x, enRutina, hechos) {
  const e = x.e, n = entNombres(e), foto = entMiniatura(e);
  const fig = (!foto && typeof figuraMusculos === 'function')
    ? figuraMusculos({ primarios: e.musculos_primarios || [], secundarios: e.musculos_secundarios || [], mapa: entMapaMusculos(), alto: 54, leyenda: false, cara: 'frente' })
    : '';
  const veces = hechos && hechos.get(e.id) ? hechos.get(e.id).size : 0;
  const nivel = (ENT_NIVELES.find(q => q[0] === e.nivel) || [null, ''])[1];
  const marcas = [
    enRutina.has(e.id) ? '<span class="alt-marca alt-ya">Ya está en la rutina</span>' : '',
    veces ? `<span class="alt-marca alt-hizo">Ya lo hizo${veces > 1 ? ` · ${veces} veces` : ''}</span>` : '',
  ].join('');
  const dif = x.dif < 0 ? '<span class="alt-chip">Más fácil</span>' : x.dif > 0 ? '<span class="alt-chip">Más difícil</span>' : '';
  return `
    <div class="alt-item" data-alt="${e.id}">
      ${foto ? `<img src="${escapeHtml(foto)}" class="alt-foto" alt="" loading="lazy">` : `<div class="alt-fig">${fig}</div>`}
      <div class="alt-txt">
        <div class="alt-nombre">${escapeHtml(n.grande)}</div>
        ${n.chico ? `<div class="alt-chico">${escapeHtml(n.chico)}</div>` : ''}
        <div class="alt-chips">${x.porque.map(p => `<span class="alt-chip alt-por">${escapeHtml(p)}</span>`).join('')}${dif}</div>
        <div class="alt-meta">${escapeHtml([altEquipoTexto(e) || 'Sin equipo', nivel].filter(Boolean).join(' · '))}</div>
        ${marcas ? `<div class="alt-marcas">${marcas}</div>` : ''}
      </div>
      <button type="button" class="btn btn-primary btn-sm alt-sust" onclick="altSustituir('${e.id}')">Sustituir</button>
    </div>`;
}

function altPintarLista() {
  const caja = document.getElementById('alt-lista');
  const re = altRE();
  if (!caja || !re) return;
  const src = re.ejercicios || {};
  const todos = altCandidatos(src, _ent.ejercicios || []);
  const lista = todos.filter(altPasaFiltros);
  const enRutina = new Set((_ent.rutina?.ejercicios || []).map(x => x.ejercicio_id));
  const hechos = _ent.rutina?.cliente_id ? _alt.hechos[_ent.rutina.cliente_id] : null;
  const cuenta = document.getElementById('alt-cuenta');
  if (cuenta) cuenta.textContent = todos.length ? `${lista.length} de ${todos.length}` : '';
  caja.innerHTML = lista.length
    ? lista.slice(0, 40).map(x => altTarjeta(x, enRutina, hechos)).join('')
      + (lista.length > 40 ? `<div class="alt-vacio">Y ${lista.length - 40} más: usa un filtro o busca por nombre.</div>` : '')
    : `<div class="alt-vacio">${todos.length ? 'Con estos filtros no queda ninguna. Quita alguno.' : 'No encontré ejercicios parecidos en la galería.'}</div>`;
}

window.entAlternativas = async (reId) => {
  _alt.reId = reId; _alt.q = '';
  const re = altRE();
  if (!re) return;
  await entDb.ejercicios();
  const src = re.ejercicios || {}, n = entNombres(src);
  const flojo = !altArr(src.musculos_primarios).length || !src.patron;
  openModal(`
    <div class="alt-modal">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="em-eyebrow">Alternativas</div>
          <h3 class="alt-titulo">${escapeHtml(n.grande)}</h3>
          ${n.chico ? `<div class="alt-chico">${escapeHtml(n.chico)}</div>` : ''}
        </div>
        <button class="btn btn-ghost btn-sm" onclick="closeModal()" aria-label="Cerrar">✕</button>
      </div>
      <p class="alt-ayuda">El mismo movimiento y los mismos músculos, con otro equipo o variante. Al sustituir se quedan su lugar, sus series, reps, descanso y RIR, y su bloque o circuito.</p>
      ${document.getElementById('rut-panel') && typeof rutPedirAlternativas === 'function'
        ? `<button type="button" class="alt-ia" data-alt-ia onclick="closeModal();rutPedirAlternativas('${reId}')">✨ Que el asistente elija 3 a 5 y te diga por qué</button>` : ''}
      ${flojo ? `<p class="alt-aviso">A esta ficha le falta ${!altArr(src.musculos_primarios).length ? 'músculos' : 'patrón'}: las alternativas salen mejor si la completas. <button class="alt-link" onclick="closeModal();entEditarEjercicio('${src.id}')">Completarla</button></p>` : ''}
      <div class="alt-filtros">
        ${ALT_FILTROS.map(([k, t, g]) => `<button type="button" class="alt-filtro${_alt.filtros[g] === k ? ' on' : ''}" data-f="${k}" data-g="${g}" onclick="altFiltro('${g}', '${k}')">${t}</button>`).join('')}
        <input id="alt-q" class="alt-q" placeholder="Buscar por nombre" oninput="altBuscar(this.value)">
        <span id="alt-cuenta" class="alt-cuenta"></span>
      </div>
      <div id="alt-lista" class="alt-lista"></div>
    </div>`, { wide: true });
  altPintarLista();
  // «Ya lo hizo» llega detrás: no frena la apertura.
  if (_ent.rutina?.cliente_id && !_alt.hechos[_ent.rutina.cliente_id]) {
    altCargarHechos(_ent.rutina.cliente_id).then(() => { if (document.getElementById('alt-lista')) altPintarLista(); }).catch(() => {});
  }
};

window.altFiltro = (grupo, k) => {
  _alt.filtros[grupo] = _alt.filtros[grupo] === k ? null : k;
  document.querySelectorAll('.alt-filtro').forEach(b => b.classList.toggle('on', _alt.filtros[b.dataset.g] === b.dataset.f));
  altPintarLista();
};
window.altBuscar = (v) => { _alt.q = v; altPintarLista(); };

// En su mismo renglón: solo cambia qué ejercicio es.
window.altSustituir = async (ejercicioId) => {
  const re = altRE();
  const nuevo = (_ent.ejercicios || []).find(x => x.id === ejercicioId);
  if (!re || !nuevo) return;
  const antes = entNombres(re.ejercicios || {}).grande;
  const ok = await entDb.actualizarRE(re.id, { ejercicio_id: nuevo.id });
  if (ok === false) return;
  re.ejercicio_id = nuevo.id;
  re.ejercicios = nuevo;
  if (nuevo.poster_path) await entDb.firmarPosters([nuevo.poster_path]);
  closeModal();
  entRepintarRutina();
  const fila = document.querySelector(`#cons-rutina .ent-fila[data-re="${re.id}"]`);
  if (fila) { fila.classList.add('ent-fila-nueva'); fila.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  if (typeof entRefrescarAsistencia === 'function') entRefrescarAsistencia();
  toast(`${entNombres(nuevo).grande} en lugar de ${antes}`, 3200);
};

// =====================================================
// CAMBIAR SOLO LOS EJERCICIOS · la rutina entera, sin IA
// =====================================================
// Desde el agente de rutinas: la rutina tal como está a la izquierda y, al
// lado de cada ejercicio, 3 parecidos de la galería (el mismo motor de
// «Alternativas»). Tú eliges en cada renglón o lo dejas igual. Se quedan los
// bloques, el orden, las series, reps, peso, descanso, RIR y notas: solo
// cambia qué ejercicio es. Se aplica a esta rutina o se guarda como nueva.

const CX_POR_PAGINA = 3;
const CX_FILTROS = [['casa', 'Casa', 'lugar'], ['gym', 'Gimnasio', 'lugar'], ['sin_peso', 'Sin peso', 'carga'], ['con_peso', 'Con peso', 'carga']];
const _cx = { filas: [], filtros: {}, aplicando: false };

const cxPres = (re) => [
  re.series != null && re.reps ? `${re.series}×${re.reps}` : re.series != null ? `${re.series} series` : re.reps ? `${re.reps} reps` : '',
  re.descanso_seg ? `${re.descanso_seg}s` : '', re.rir != null ? `RIR ${re.rir}` : '',
].filter(Boolean).join(' · ');

function cxPasa(x) {
  const f = _cx.filtros, e = x.e;
  if (f.carga === 'sin_peso' && altConCarga(e)) return false;
  if (f.carga === 'con_peso' && !altConCarga(e)) return false;
  if (f.lugar && !altArr(e.lugar).includes(f.lugar)) return false;
  return true;
}
// Las opciones de un renglón: parecidos que no estén ya en la rutina.
function cxOpciones(fila) {
  const enRutina = new Set((_ent.rutina?.ejercicios || []).map(x => x.ejercicio_id));
  return fila.todas.filter(x => !enRutina.has(x.e.id) && cxPasa(x));
}
const cxElegidoEnOtra = (fila, id) => _cx.filas.some(f => f !== fila && f.elegido === id);

function cxBloqueTexto(b) {
  if (!b) return '';
  const tipo = (ENT_TIPOS_BLOQUE.find(t => t[0] === b.tipo) || [null, ''])[1];
  return [b.nombre || tipo || 'Bloque', b.vueltas ? `${b.vueltas} vueltas` : ''].filter(Boolean).join(' · ');
}

function cxFilaHTML(f, i) {
  const n = entNombres(f.src);
  const ops = cxOpciones(f);
  const total = ops.length;
  const desde = total ? (f.pagina * CX_POR_PAGINA) % total : 0;
  let vista = ops.slice(desde, desde + CX_POR_PAGINA);
  // Lo elegido sigue a la vista aunque se pase de página.
  const el = f.elegido && ops.find(x => x.e.id === f.elegido);
  if (el && !vista.includes(el)) vista = [el, ...vista.slice(0, CX_POR_PAGINA - 1)];
  const op = (x) => {
    const nx = entNombres(x.e), on = f.elegido === x.e.id, usado = !on && cxElegidoEnOtra(f, x.e.id);
    return `
      <button type="button" class="cx-op${on ? ' on' : ''}" data-cx-op="${x.e.id}" aria-pressed="${on}" ${usado ? 'disabled title="Ya lo elegiste en otro ejercicio"' : ''}
              onclick="cxElegir(${i}, '${x.e.id}')">
        <span class="cx-op-nombre">${escapeHtml(nx.grande)}</span>
        ${nx.chico ? `<span class="cx-op-chico">${escapeHtml(nx.chico)}</span>` : ''}
        <span class="cx-op-por">${escapeHtml([...x.porque.slice(0, 2), x.dif < 0 ? 'Más fácil' : x.dif > 0 ? 'Más difícil' : ''].filter(Boolean).join(' · '))}</span>
        <span class="cx-op-eq">${escapeHtml(altEquipoTexto(x.e) || 'Sin equipo')}</span>
      </button>`;
  };
  return `
    <div class="cx-fila${f.elegido ? ' cambia' : ''}" data-cx-fila="${f.reId}">
      <div class="cx-ahora">
        <span class="cx-n">${i + 1}</span>
        <div class="min-w-0">
          <div class="cx-nombre">${escapeHtml(n.grande)}</div>
          ${n.chico ? `<div class="cx-chico">${escapeHtml(n.chico)}</div>` : ''}
          ${cxPres(f.re) ? `<div class="cx-pres">${escapeHtml(cxPres(f.re))}</div>` : ''}
        </div>
      </div>
      <div class="cx-alts">
        <button type="button" class="cx-op cx-igual${f.elegido ? '' : ' on'}" data-cx-igual aria-pressed="${!f.elegido}" onclick="cxElegir(${i}, null)">
          <span class="cx-op-nombre">Dejar igual</span>
        </button>
        ${vista.map(op).join('')}
        ${total > CX_POR_PAGINA ? `<button type="button" class="cx-mas" data-cx-mas onclick="cxMas(${i})">Otras ${Math.min(CX_POR_PAGINA, total - CX_POR_PAGINA)} ›</button>` : ''}
        ${!total ? `<span class="cx-nada">${f.todas.length ? 'Con estos filtros no queda ninguno.' : 'No encontré parecidos en la galería.'}</span>` : ''}
      </div>
    </div>`;
}

function cxPintar() {
  const caja = document.getElementById('cx-lista');
  if (!caja) return;
  const bloques = Object.fromEntries((_ent.rutina?.bloques || []).map(b => [b.id, b]));
  let antes;
  caja.innerHTML = _cx.filas.map((f, i) => {
    const b = f.re.bloque_id || null;
    const cab = b !== antes && b ? `<div class="cx-bloque">${escapeHtml(cxBloqueTexto(bloques[b]))}</div>` : (b !== antes && antes ? '<div class="cx-bloque cx-bloque-fin"></div>' : '');
    antes = b;
    return cab + cxFilaHTML(f, i);
  }).join('');
  const n = _cx.filas.filter(f => f.elegido).length;
  const pie = document.getElementById('cx-pie');
  if (pie) pie.innerHTML = `
    <span class="cx-cuenta" data-cx-cuenta>${n ? `${n} de ${_cx.filas.length} cambian` : 'Elige en cada ejercicio, o déjalo igual'}</span>
    <button class="btn btn-secondary btn-sm" data-cx-nueva onclick="cxAplicar('nueva')" ${!n || _cx.aplicando ? 'disabled' : ''}>Guardar como rutina nueva</button>
    <button class="btn btn-primary btn-sm" data-cx-aplicar onclick="cxAplicar('aqui')" ${!n || _cx.aplicando ? 'disabled' : ''}>${_cx.aplicando ? 'Guardando…' : `Cambiar ${n || ''} en esta rutina`}</button>`;
  document.querySelectorAll('.cx-filtro').forEach(b => b.classList.toggle('on', _cx.filtros[b.dataset.g] === b.dataset.f));
}

window.entCambiarEjercicios = async () => {
  const r = _ent.rutina;
  if (!r || !(r.ejercicios || []).length) return toast('Abre una rutina con ejercicios en el constructor');
  await entDb.ejercicios();
  _cx.filtros = {}; _cx.aplicando = false;
  _cx.filas = r.ejercicios.map(re => ({ reId: re.id, re, src: re.ejercicios || {}, todas: altCandidatos(re.ejercicios || {}, _ent.ejercicios || []), pagina: 0, elegido: null }));
  openModal(`
    <div class="alt-modal cx-modal" data-cambiar-ejercicios>
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="em-eyebrow">Cambiar solo los ejercicios</div>
          <h3 class="alt-titulo">${escapeHtml(r.nombre || 'Rutina')}</h3>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="closeModal()" aria-label="Cerrar">✕</button>
      </div>
      <p class="alt-ayuda">Se quedan los bloques, el orden, las series, reps, descanso y RIR. Al lado de cada ejercicio, parecidos de la galería (mismo movimiento y músculos): elige uno o déjalo igual.</p>
      <div class="alt-filtros">
        ${CX_FILTROS.map(([k, t, g]) => `<button type="button" class="alt-filtro cx-filtro" data-f="${k}" data-g="${g}" onclick="cxFiltro('${g}', '${k}')">${t}</button>`).join('')}
        <span class="cx-sep"></span>
        <button type="button" class="alt-filtro" data-cx-proponer onclick="cxProponerTodo()">Proponer uno para cada uno</button>
        <button type="button" class="alt-filtro" data-cx-limpiar onclick="cxLimpiar()">Dejar todo igual</button>
      </div>
      <div class="cx-cols"><span>Ahora</span><span>Alternativas</span></div>
      <div id="cx-lista" class="cx-lista"></div>
      <div id="cx-pie" class="cx-pie"></div>
    </div>`, { wide: true });
  cxPintar();
};

window.cxElegir = (i, id) => { const f = _cx.filas[i]; if (!f) return; f.elegido = id && f.elegido !== id ? id : null; cxPintar(); };
window.cxMas = (i) => { const f = _cx.filas[i]; if (!f) return; f.pagina++; cxPintar(); };
window.cxFiltro = (g, k) => {
  _cx.filtros[g] = _cx.filtros[g] === k ? null : k;
  // Lo elegido que ya no pasa el filtro se suelta.
  _cx.filas.forEach(f => { f.pagina = 0; if (f.elegido && !cxOpciones(f).some(x => x.e.id === f.elegido)) f.elegido = null; });
  cxPintar();
};
// La más parecida de cada uno (sin repetir la misma en dos lugares).
window.cxProponerTodo = () => {
  const usados = new Set();
  _cx.filas.forEach(f => {
    const x = cxOpciones(f).find(o => !usados.has(o.e.id));
    f.elegido = x ? x.e.id : null; f.pagina = 0;
    if (x) usados.add(x.e.id);
  });
  cxPintar();
};
window.cxLimpiar = () => { _cx.filas.forEach(f => { f.elegido = null; }); cxPintar(); };

window.cxAplicar = async (modo) => {
  const r = _ent.rutina;
  const cambios = _cx.filas.filter(f => f.elegido);
  if (!r || !cambios.length || _cx.aplicando) return;
  _cx.aplicando = true; cxPintar();
  try {
    if (modo === 'nueva') {
      const nueva = await entDb.copiarRutina(r.id, null, `${r.nombre} · variante`);
      if (!nueva) throw new Error('La copia no se creó');
      // La copia trae renglones nuevos: cada cambio va al que ocupa el mismo lugar.
      const porId = await entDb.ejerciciosDeRutinas([r.id, nueva]);
      const enOrden = (l) => (l || []).slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || String(a.ejercicio_id).localeCompare(String(b.ejercicio_id)));
      const orig = enOrden(porId[r.id]), ejs = enOrden(porId[nueva]);
      for (const f of cambios) {
        const re = ejs[orig.findIndex(x => x.id === f.reId)];
        if (re && await entDb.actualizarRE(re.id, { ejercicio_id: f.elegido }) === false) throw new Error('No se guardó');
      }
      closeModal();
      toast(`«${r.nombre} · variante» quedó en tu biblioteca con ${cambios.length} cambio${cambios.length === 1 ? '' : 's'}`, 4000);
      return;
    }
    const nuevos = [];
    for (const f of cambios) {
      if (await entDb.actualizarRE(f.reId, { ejercicio_id: f.elegido }) === false) throw new Error('No se guardó');
      const re = (r.ejercicios || []).find(x => x.id === f.reId);
      const nuevo = (_ent.ejercicios || []).find(x => x.id === f.elegido);
      if (re && nuevo) { re.ejercicio_id = nuevo.id; re.ejercicios = nuevo; nuevos.push(nuevo); }
    }
    const posters = nuevos.map(e => e.poster_path).filter(Boolean);
    if (posters.length) await entDb.firmarPosters(posters);
    closeModal();
    entRepintarRutina();
    cambios.forEach(f => document.querySelector(`#cons-rutina .ent-fila[data-re="${f.reId}"]`)?.classList.add('ent-fila-nueva'));
    if (typeof entRefrescarAsistencia === 'function') entRefrescarAsistencia();
    toast(`${cambios.length} ejercicio${cambios.length === 1 ? '' : 's'} cambiado${cambios.length === 1 ? '' : 's'} · lo demás quedó igual`, 3500);
  } catch (e) {
    toast(e.message || 'No se pudo guardar');
  } finally {
    _cx.aplicando = false;
    if (document.getElementById('cx-lista')) cxPintar();
  }
};
