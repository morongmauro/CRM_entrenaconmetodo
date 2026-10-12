// =====================================================
// UNIR Y SEPARAR RUTINAS · la mesa de mezcla
// =====================================================
// «Push y Pull juntas como Upper.» «Upper y Lower como Full Body.» «Esta
// Full Body partida en Upper / Lower, o en Push / Pull / Legs.»
//
// UNIR: eliges dos o más rutinas y sale UNA nueva con todos sus ejercicios
// (una tras otra o intercaladas, sin repetidos si quieres). Los circuitos
// viajan enteros.
// SEPARAR: eliges una rutina y una forma de partirla; cada ejercicio cae en
// la parte que le toca según su patrón y sus músculos (se puede cambiar uno
// por uno) y el calentamiento y la movilidad van en todas.
//
// Las rutinas de origen NO se tocan: lo nuevo entra al mismo ciclo, SIN DÍA,
// para que lo ajustes en el constructor y luego lo pongas en el calendario.
// Al lado de cada resultado sale cuánto dura (el mismo estimado del
// constructor), para decidir qué quitar.
//
// Carga DESPUÉS de entrenamiento.js (usa entDb, entEstimarTiempo, entNombres…).
// =====================================================

const _mz = { modo: 'unir', fuentes: [], datos: {}, elegidas: [], intercalar: true, sinRepetidos: true, partir: 'ul', destino: {}, caja: null, faseId: null, clienteId: null };

// ── Clasificar un ejercicio ─────────────────────────────────────────────
const MZ_SUPERIOR_EMPUJE = ['pectoral_mayor', 'pectoral', 'deltoide_anterior', 'deltoide_lateral', 'triceps'];
const MZ_SUPERIOR_TIRON = ['dorsal_ancho', 'trapecio_medio', 'trapecio_superior', 'trapecio', 'romboides', 'biceps', 'deltoide_posterior', 'braquial', 'antebrazo'];
const MZ_INFERIOR = ['cuadriceps', 'gluteo_mayor', 'gluteo_medio', 'gluteos', 'isquiotibiales', 'aductores', 'abductores', 'gemelos', 'soleo', 'tibial'];
const MZ_CORE = ['recto_abdominal', 'oblicuos', 'transverso', 'erectores', 'core', 'abdomen'];

// → 'prep' (calentamiento, movilidad, cardio: van en todas) | 'push' | 'pull' | 'legs' | 'core' | 'otro'
function mzClase(e = {}) {
  if (['calentamiento', 'movilidad', 'estiramiento_pasivo', 'estiramiento_activo', 'cardio'].includes(e.tipo)) return 'prep';
  if (e.patron === 'push') return e.segmento === 'tren_inferior' ? 'legs' : 'push';
  if (e.patron === 'pull') return 'pull';
  if (e.patron === 'rodilla' || e.patron === 'cadera') return 'legs';
  if (e.patron === 'core') return 'core';
  if (e.segmento === 'tren_inferior') return 'legs';
  if (e.segmento === 'core' || e.tipo === 'core') return 'core';
  const m = e.musculos_primarios || [];
  const cuenta = (lista) => m.filter(x => lista.includes(x)).length;
  const puntos = { push: cuenta(MZ_SUPERIOR_EMPUJE), pull: cuenta(MZ_SUPERIOR_TIRON), legs: cuenta(MZ_INFERIOR), core: cuenta(MZ_CORE) };
  const mejor = Object.entries(puntos).sort((a, b) => b[1] - a[1])[0];
  if (mejor && mejor[1] > 0) return mejor[0];
  if (e.segmento === 'tren_superior') return 'push';
  return 'otro';
}

// Las formas de partir: cada clase a qué parte va (índice) o 'todas'.
const MZ_PARTIR = {
  ul: { titulo: 'Upper / Lower', partes: ['Upper Body', 'Lower Body'], de: { push: 0, pull: 0, legs: 1, core: 1, prep: 'todas', otro: 0 } },
  ppl: { titulo: 'Push / Pull / Legs', partes: ['Push', 'Pull', 'Legs'], de: { push: 0, pull: 1, legs: 2, core: 2, prep: 'todas', otro: 0 } },
  pp: { titulo: 'Push / Pull (con piernas)', partes: ['Push + Cuádriceps', 'Pull + Femoral'], de: { push: 0, pull: 1, legs: 0, core: 1, prep: 'todas', otro: 0 } },
  dos: { titulo: 'En 2, a mano', partes: ['Parte A', 'Parte B'], de: null },
  tres: { titulo: 'En 3, a mano', partes: ['Parte A', 'Parte B', 'Parte C'], de: null },
};

// Nombre sugerido al unir.
function mzNombreUnion(nombres) {
  const n = nombres.map(x => String(x || '').toLowerCase());
  const tiene = (re) => n.some(x => re.test(x));
  if (tiene(/upper|superior/) && tiene(/lower|inferior|pierna|leg/)) return 'Full Body';
  if (tiene(/push|empuje/) && tiene(/pull|tir[oó]n|tracci/) && tiene(/leg|pierna|lower/)) return 'Full Body';
  if (tiene(/push|empuje/) && tiene(/pull|tir[oó]n|tracci/)) return 'Upper Body';
  return nombres.map(x => String(x || '').replace(/\s*(training|workout|entrenamiento)\s*$/i, '')).join(' + ');
}

// Los tramos de una rutina: un ejercicio suelto, o un circuito entero.
function mzTramos(r) {
  const out = [];
  (r.ejercicios || []).forEach(re => {
    const ult = out[out.length - 1];
    if (re.bloque_id && ult && ult.bloqueId === re.bloque_id) ult.items.push(re);
    else out.push({ bloqueId: re.bloque_id || null, bloque: re.bloque_id ? (r.bloques || []).find(b => b.id === re.bloque_id) || null : null, items: [re] });
  });
  return out;
}

// ── Armar el resultado ─────────────────────────────────────────────────
function mzUnion() {
  const rs = _mz.elegidas.map(id => _mz.datos[id]).filter(Boolean);
  const listas = rs.map(mzTramos);
  let tramos = [];
  if (_mz.intercalar) {
    // El calentamiento de todas primero; luego se alterna un tramo de cada una.
    const prep = listas.map(l => l.filter(t => !t.bloqueId && t.items.every(re => mzClase(re.ejercicios) === 'prep')));
    const resto = listas.map((l, i) => l.filter(t => !prep[i].includes(t)));
    prep.forEach(p => tramos.push(...p));
    const largo = Math.max(0, ...resto.map(l => l.length));
    for (let k = 0; k < largo; k++) resto.forEach(l => { if (l[k]) tramos.push(l[k]); });
  } else listas.forEach(l => tramos.push(...l));
  if (_mz.sinRepetidos) {
    const vistos = new Set();
    tramos = tramos.map(t => ({ ...t, items: t.items.filter(re => { if (vistos.has(re.ejercicio_id)) return false; vistos.add(re.ejercicio_id); return true; }) }))
      .filter(t => t.items.length);
  }
  return tramos;
}

// Separar: { partes: [nombre], tramos: [[tramo]] }.
function mzSeparacion() {
  const r = _mz.datos[_mz.elegidas[0]];
  const def = MZ_PARTIR[_mz.partir];
  const partes = def.partes.map((n, i) => ($(`#mz-parte-${i}`)?.value || '').trim() || n);
  const tramos = partes.map(() => []);
  if (!r) return { partes, tramos };
  mzTramos(r).forEach(t => {
    const d = mzDestinoDe(t.items[0]);
    if (d === 'todas') tramos.forEach(l => l.push(t));
    else if (tramos[d]) tramos[d].push(t);
  });
  return { partes, tramos };
}

function mzDestinoDe(re) {
  if (re.id in _mz.destino) return _mz.destino[re.id];
  // Un circuito va entero: donde vaya el primero de él.
  if (re.bloque_id) {
    const r0 = _mz.datos[_mz.elegidas[0]];
    const primero = (r0?.ejercicios || []).find(x => x.bloque_id === re.bloque_id);
    if (primero && primero.id !== re.id) return mzDestinoDe(primero);
  }
  const def = MZ_PARTIR[_mz.partir];
  if (!def.de) {
    // A mano: se reparten en orden, y el calentamiento en todas.
    if (mzClase(re.ejercicios) === 'prep') return 'todas';
    const r = _mz.datos[_mz.elegidas[0]];
    const sueltos = (r?.ejercicios || []).filter(x => mzClase(x.ejercicios) !== 'prep');
    const k = Math.max(0, sueltos.findIndex(x => x.id === re.id));
    return Math.floor(k * def.partes.length / Math.max(1, sueltos.length));
  }
  return def.de[mzClase(re.ejercicios)] ?? 0;
}

const mzMinutos = (tramos) => {
  const ejercicios = [], bloques = [];
  tramos.forEach(t => { t.items.forEach(re => ejercicios.push(re)); if (t.bloque) bloques.push(t.bloque); });
  return Math.round(entEstimarTiempo({ ejercicios, bloques }).total / 60);
};

// ── Pintar ─────────────────────────────────────────────────────────────
// `fuentes`: las rutinas que se pueden usar (las del ciclo del cliente, o las
// plantillas). `faseId`/`clienteId`: dónde se crea lo nuevo.
window.mzAbrir = async ({ caja, fuentes, faseId = null, clienteId = null }) => {
  Object.assign(_mz, { caja, fuentes: fuentes || [], faseId, clienteId, elegidas: [], destino: {}, datos: {}, nombreTocado: false });
  const el = typeof caja === 'string' ? $(caja) : caja;
  if (!el) return;
  el.innerHTML = '<div class="card text-sm text-slate-400">Leyendo las rutinas…</div>';
  const llenas = await Promise.all(_mz.fuentes.map(r => entDb.rutina(r.id)));
  llenas.filter(Boolean).forEach(r => { _mz.datos[r.id] = r; });
  mzPintar();
};

function mzPintar() {
  const el = typeof _mz.caja === 'string' ? $(_mz.caja) : _mz.caja;
  if (!el) return;
  const fuentes = _mz.fuentes.filter(r => _mz.datos[r.id]);
  const chip = (on, attr, txt, fn) => `<button type="button" class="chip ${on ? 'active' : ''}" ${attr} onclick="${fn}">${txt}</button>`;
  const lista = fuentes.map(r => {
    const d = _mz.datos[r.id];
    const on = _mz.elegidas.includes(r.id);
    return `<label class="flex items-center gap-2 py-1.5 border-b border-slate-100 cursor-pointer" style="margin:0;text-transform:none;letter-spacing:0;font-weight:400">
      <input type="${_mz.modo === 'unir' ? 'checkbox' : 'radio'}" name="mz-r" style="width:auto" data-mz-rutina="${r.id}" ${on ? 'checked' : ''} onchange="mzElegir('${r.id}', this.checked)">
      <span class="flex-1 min-w-0 text-sm"><b>${escapeHtml(r.nombre)}</b>
        <span class="text-xs text-slate-500"> · ${d.ejercicios.length} ejercicio${d.ejercicios.length === 1 ? '' : 's'} · ≈ ${Math.round(entEstimarTiempo(d).total / 60)} min${entDiasDe(r).length ? ` · ${escapeHtml(entDiasTexto(r))}` : ''}</span></span>
    </label>`;
  }).join('');

  el.innerHTML = `
    <div class="card" data-mezcla>
      <div class="flex gap-2 mb-3 flex-wrap">
        ${chip(_mz.modo === 'unir', 'data-mz-modo="unir"', '🔗 Unir rutinas', "mzModo('unir')")}
        ${chip(_mz.modo === 'separar', 'data-mz-modo="separar"', '✂️ Separar una rutina', "mzModo('separar')")}
      </div>
      <p class="text-xs text-slate-500 mb-3">${_mz.modo === 'unir'
        ? 'Elige dos o más: sale una rutina nueva con todo, para que la ajustes. Las originales no se tocan.'
        : 'Elige una y cómo partirla: salen rutinas nuevas, una por parte. La original no se toca.'}</p>
      <div class="grid lg:grid-cols-2 gap-4">
        <div>
          <div class="sec-title">${_mz.modo === 'unir' ? 'Qué rutinas unir' : 'Qué rutina separar'}</div>
          ${lista || '<p class="text-sm text-slate-500">No hay rutinas aquí todavía.</p>'}
        </div>
        <div id="mz-resultado"></div>
      </div>
    </div>`;
  mzPintarResultado();
}

function mzFilaEj(re, extra = '') {
  const e = re.ejercicios || {};
  return `<div class="flex items-center gap-2 py-1 text-sm border-b border-slate-50" data-mz-ej="${re.id}">
    <span class="flex-1 min-w-0 truncate">${escapeHtml(entNombres(e).grande)}${re.bloque_id ? ' <span class="tag tag-violet" style="font-size:.6rem">circuito</span>' : ''}</span>
    <span class="text-xs text-slate-400 whitespace-nowrap">${re.series ?? ''}×${escapeHtml(re.reps || '')}</span>${extra}</div>`;
}

function mzPintarResultado() {
  const caja = $('#mz-resultado');
  if (!caja) return;
  if (_mz.modo === 'unir') {
    if (_mz.elegidas.length < 2) { caja.innerHTML = '<div class="text-sm text-slate-500 bg-slate-50 rounded-lg p-3">Marca al menos dos rutinas.</div>'; return; }
    const tramos = mzUnion();
    const nombres = _mz.elegidas.map(id => _mz.datos[id]?.nombre);
    const n = tramos.reduce((a, t) => a + t.items.length, 0);
    caja.innerHTML = `
      <div class="sec-title">La rutina unida</div>
      <div class="mb-2"><label>Nombre</label><input id="mz-nombre" oninput="_mz.nombreTocado = true" value="${escapeHtml(_mz.nombreTocado ? ($('#mz-nombre')?.value || '') : mzNombreUnion(nombres))}"></div>
      <div class="flex gap-2 flex-wrap mb-2">
        <button type="button" class="chip ${_mz.intercalar ? 'active' : ''}" data-mz-orden="intercalar" onclick="mzOpcion('intercalar', true)">Intercaladas (A, B, A, B…)</button>
        <button type="button" class="chip ${!_mz.intercalar ? 'active' : ''}" data-mz-orden="seguidas" onclick="mzOpcion('intercalar', false)">Una tras otra</button>
      </div>
      <label class="flex items-center gap-2 mb-2 cursor-pointer" style="text-transform:none;letter-spacing:0;font-weight:400">
        <input type="checkbox" style="width:auto" ${_mz.sinRepetidos ? 'checked' : ''} onchange="mzOpcion('sinRepetidos', this.checked)" data-mz-sin-repetidos>
        <span class="text-sm">Sin ejercicios repetidos</span></label>
      <div class="text-sm font-bold text-slate-800 mb-1" data-mz-total>${n} ejercicios · ⏱ ≈ ${mzMinutos(tramos)} min</div>
      <div class="max-h-80 overflow-y-auto mb-3">${tramos.flatMap(t => t.items).map(re => mzFilaEj(re)).join('')}</div>
      <button class="btn btn-primary" data-mz-crear onclick="mzCrearUnion()">🔗 Crear la rutina unida</button>`;
    return;
  }
  const r = _mz.datos[_mz.elegidas[0]];
  if (!r) { caja.innerHTML = '<div class="text-sm text-slate-500 bg-slate-50 rounded-lg p-3">Elige la rutina que quieres separar.</div>'; return; }
  const def = MZ_PARTIR[_mz.partir];
  const { partes, tramos } = mzSeparacion();
  const opciones = (re) => {
    const d = mzDestinoDe(re);
    return `<select class="!w-auto text-xs" data-mz-destino="${re.id}" onchange="mzDestino('${re.id}', this.value)">
      ${partes.map((p, i) => `<option value="${i}" ${d === i ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}
      <option value="todas" ${d === 'todas' ? 'selected' : ''}>En todas</option></select>`;
  };
  caja.innerHTML = `
    <div class="sec-title">Cómo partirla</div>
    <div class="flex gap-1.5 flex-wrap mb-2">
      ${Object.entries(MZ_PARTIR).map(([k, v]) => `<button type="button" class="chip ${_mz.partir === k ? 'active' : ''}" data-mz-partir="${k}" onclick="mzPartir('${k}')">${v.titulo}</button>`).join('')}
    </div>
    <div class="grid gap-2 mb-2" style="grid-template-columns:repeat(${def.partes.length}, minmax(0,1fr))">
      ${partes.map((p, i) => `<div><input id="mz-parte-${i}" value="${escapeHtml(p)}" class="text-sm" oninput="mzPintarTotales()">
        <div class="text-xs text-slate-500 mt-1" data-mz-parte-total="${i}">${tramos[i].reduce((a, t) => a + t.items.length, 0)} ejercicios · ≈ ${mzMinutos(tramos[i])} min</div></div>`).join('')}
    </div>
    <p class="text-xs text-slate-500 mb-1">Cada ejercicio va donde dice su patrón y sus músculos; cámbialo si no. Los circuitos van enteros.</p>
    <div class="max-h-80 overflow-y-auto mb-3">${r.ejercicios.map(re => mzFilaEj(re, opciones(re))).join('')}</div>
    <button class="btn btn-primary" data-mz-crear onclick="mzCrearSeparacion()">✂️ Crear ${def.partes.length} rutinas</button>`;
}

window.mzPintarTotales = () => {
  const { tramos } = mzSeparacion();
  tramos.forEach((l, i) => { const el = document.querySelector(`[data-mz-parte-total="${i}"]`); if (el) el.textContent = `${l.reduce((a, t) => a + t.items.length, 0)} ejercicios · ≈ ${mzMinutos(l)} min`; });
};

window.mzModo = (m) => { _mz.modo = m; _mz.elegidas = []; _mz.destino = {}; mzPintar(); };
window.mzElegir = (id, si) => {
  if (_mz.modo === 'separar') { _mz.elegidas = si ? [id] : []; _mz.destino = {}; }
  else _mz.elegidas = si ? [..._mz.elegidas.filter(x => x !== id), id] : _mz.elegidas.filter(x => x !== id);
  mzPintarResultado();
};
window.mzOpcion = (k, v) => { _mz[k] = v; mzPintarResultado(); };
window.mzPartir = (k) => {
  _mz.partir = k; _mz.destino = {};
  // Los nombres de las partes son los de esta forma de partir, no los de antes.
  const c = $('#mz-resultado'); if (c) c.innerHTML = '';
  mzPintarResultado();
};
window.mzDestino = (reId, v) => {
  // Un circuito se mueve entero: todos sus ejercicios al mismo destino.
  const r = _mz.datos[_mz.elegidas[0]];
  const re = r?.ejercicios.find(x => x.id === reId);
  const val = v === 'todas' ? 'todas' : Number(v);
  (re?.bloque_id ? r.ejercicios.filter(x => x.bloque_id === re.bloque_id) : [re]).filter(Boolean).forEach(x => { _mz.destino[x.id] = val; });
  mzPintarResultado();
};

// ── Crear ──────────────────────────────────────────────────────────────
const MZ_CAMPOS_RE = ['ejercicio_id', 'series', 'reps', 'peso_objetivo', 'rir', 'tempo', 'descanso_seg', 'notas', 'notas_coach'];

async function mzCrearRutina(nombre, tramos, base) {
  const hermanas = _mz.faseId ? await entDb.rutinasDeFase(_mz.faseId) : [];
  const r = await entDb.crearRutina({
    nombre, fase_id: _mz.faseId, cliente_id: _mz.clienteId, tipo_sesion: base?.tipo_sesion || 'fuerza',
    descripcion: null, notas_coach: base?.notas_coach || null, dia_orden: hermanas.length + 1, dias_semana: [],
  });
  if (!r) return null;
  const filas = [];
  let orden = 0, nb = 0;
  for (const t of tramos) {
    let bloqueId = null;
    if (t.bloque) {
      const b = t.bloque;
      const nuevo = await entDb.crearBloque({ rutina_id: r.id, nombre: b.nombre ?? null, tipo: b.tipo, vueltas: b.vueltas ?? null,
        descanso_seg: b.descanso_seg ?? null, descanso_entre_seg: b.descanso_entre_seg ?? null, notas: b.notas ?? null, orden: ++nb });
      bloqueId = nuevo?.id || null;
    }
    t.items.forEach(re => filas.push({ ...Object.fromEntries(MZ_CAMPOS_RE.map(k => [k, re[k] ?? null])), rutina_id: r.id, bloque_id: bloqueId, orden: ++orden }));
  }
  if (filas.length) {
    const { error } = await sb.from('rutina_ejercicios').insert(filas);
    if (error) { toast('La rutina quedó creada, pero no pude copiar los ejercicios: ' + error.message); return r; }
  }
  return r;
}

window.mzCrearUnion = async () => {
  const tramos = mzUnion();
  const nombre = ($('#mz-nombre')?.value || '').trim();
  if (!nombre) return toast('Ponle nombre');
  if (!tramos.length) return toast('No hay ejercicios que unir');
  const btn = $('[data-mz-crear]'); if (btn) btn.disabled = true;
  const r = await mzCrearRutina(nombre, tramos, _mz.datos[_mz.elegidas[0]]);
  if (btn) btn.disabled = false;
  if (!r) return;
  toast(`✓ «${nombre}» creada sin día · ábrela para ajustarla`);
  mzDespues(r.id);
};

window.mzCrearSeparacion = async () => {
  const { partes, tramos } = mzSeparacion();
  const base = _mz.datos[_mz.elegidas[0]];
  const btn = $('[data-mz-crear]'); if (btn) btn.disabled = true;
  const creadas = [];
  for (let i = 0; i < partes.length; i++) {
    if (!tramos[i].length) continue;
    const r = await mzCrearRutina(partes[i], tramos[i], base);
    if (r) creadas.push(r);
  }
  if (btn) btn.disabled = false;
  if (!creadas.length) return toast('Ninguna parte quedó con ejercicios');
  toast(`✓ ${creadas.map(r => `«${r.nombre}»`).join(', ')} creadas sin día · ajústalas y ponlas en el calendario`);
  mzDespues(creadas[0].id);
};

// Después de crear: vuelve a leer y ofrece abrir la nueva.
async function mzDespues(rutinaId) {
  if (typeof _mz.alCrear === 'function') return _mz.alCrear(rutinaId);
  if (_mz.faseId) _mz.fuentes = await entDb.rutinasDeFase(_mz.faseId);
  else if (!_mz.clienteId) _mz.fuentes = await entDb.plantillas();
  await mzAbrir({ caja: _mz.caja, fuentes: _mz.fuentes, faseId: _mz.faseId, clienteId: _mz.clienteId });
  const el = typeof _mz.caja === 'string' ? $(_mz.caja) : _mz.caja;
  el?.insertAdjacentHTML('afterbegin', `<div class="card mb-3 flex items-center gap-2 flex-wrap" data-mz-hecho style="background:#E9F4EC">
    <span class="flex-1 text-sm font-semibold" style="color:#2F6B3E">Listo. Está en «Rutinas», sin día.</span>
    <button class="btn btn-primary btn-sm" onclick="entAbrirConstructor('${rutinaId}')">Abrirla y ajustarla</button></div>`);
}
