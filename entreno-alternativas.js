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
