// =====================================================
// VIDEOS DE TÉCNICA · qué le pediste a cada cliente y cómo le fue
// =====================================================
// «Mándame video de la sentadilla.» Aquí queda apuntado cada pedido y, al
// revisarlo, si lo hizo bien o qué tiene que mejorar. Así sabes de un vistazo:
//   · qué videos te deben todavía (por llegar),
//   · cuáles llegaron y falta revisar,
//   · cuáles hay que volver a pedir (a mejorar, con la nota de qué corregir),
//   · y cuáles ya están bien.
//
// Sale en Entrenamiento → el cliente → «🎥 Videos de técnica» y en
// Seguimiento (por cliente). Solo lo ve el coach.
//
// Tabla `videos_tecnica` (entrenamientoecm/carga/migracion-videos-tecnica.sql).
// Sin ella, el panel lo dice y no rompe nada.
//
// Carga DESPUÉS de entrenamiento.js (usa entDb y entNombres).
// =====================================================

const VT_SQL = 'carga/migracion-videos-tecnica-2.sql';
const _vt = { caja: null, clienteId: null, filas: [], falta: false, porCliente: {} };

const vtDb = {
  async lista(clienteId) {
    const { data, error } = await sb.from('videos_tecnica').select('*').eq('cliente_id', clienteId).order('pedido_en', { ascending: false });
    if (error) return null;
    return data || [];
  },
  // Cualquier cambio deja vieja la caché de etiquetas (vtEtiquetasCliente).
  async crear(filas) {
    const { error } = await sb.from('videos_tecnica').insert(filas);
    if (error) { toast(/videos_tecnica/.test(error.message || '') ? `Falta correr ${VT_SQL} en Supabase` : error.message); return false; }
    _vt.porCliente = {};
    return true;
  },
  async actualizar(id, row) {
    const { error } = await sb.from('videos_tecnica').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast(error.message); return false; }
    _vt.porCliente = {};
    return true;
  },
  async borrar(id) {
    const { error } = await sb.from('videos_tecnica').delete().eq('id', id);
    if (error) { toast(error.message); return false; }
    _vt.porCliente = {};
    return true;
  },
};

const vtHoy = () => fmt.hoy();
const vtDias = (f) => Math.max(0, Math.round((Date.parse(vtHoy() + 'T12:00:00Z') - Date.parse(String(f).slice(0, 10) + 'T12:00:00Z')) / 86400000));
const vtHace = (f) => { const d = vtDias(f); return d === 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`; };
const vtCorta = (f) => (fmt.fechaCorta ? fmt.fechaCorta(String(f).slice(0, 10)) : String(f).slice(0, 10));
const VT_ESTADO = {
  pedido:   { txt: 'Por llegar',  color: '#8A5A00', fondo: '#FDF4DF' },
  recibido: { txt: 'Por revisar', color: '#1E4E8C', fondo: '#EAF1FB' },
  mejorar:  { txt: 'A mejorar',   color: '#A3301B', fondo: '#FDECE8' },
  mal:      { txt: 'Nada bien',   color: '#7A1F1F', fondo: '#F6D9D9' },
  bien:     { txt: 'Bien',        color: '#2F6B3E', fondo: '#E9F4EC' },
};

// El último estado de cada ejercicio (por id o, si no tiene, por nombre).
const vtClave = (f) => f.ejercicio_id || `n:${String(f.ejercicio_nombre || '').toLowerCase()}`;
function vtUltimos(filas) {
  const ult = {};
  filas.forEach(f => { const k = vtClave(f); if (!ult[k] || String(f.pedido_en) > String(ult[k].pedido_en) || (f.pedido_en === ult[k].pedido_en && String(f.created_at) > String(ult[k].created_at))) ult[k] = f; });
  return ult;
}

// ── El panel ───────────────────────────────────────────────────────────
// ── La ventana de un cliente (desde Toques y el Seguimiento) ─────────────
// Los videos se revisan aquí: «Bien», «A mejorar», «Llegó», «Quitar» y pedir.
// Si una acción abre otra ventana (la nota de «A mejorar», pedir), al terminar
// vuelve a esta.
function vtModalShell() {
  const nom = _vt.nombre ? ` · ${escapeHtml(_vt.nombre)}` : '';
  openModal(modalShell(`Videos de técnica${nom}`, '<div id="vt-modal" data-vt-modal></div>',
    '<button class="btn btn-secondary" data-vt-cerrar onclick="vtCerrar()">Cerrar</button>'));
}
window.vtAbrir = async (clienteId) => {
  let c = null;
  try { c = await db.clientes.get(clienteId); } catch (e) { c = null; }
  _vt.nombre = c ? String(c.nombre || '').split(' ')[0] : '';
  _vt.enModal = true;
  vtModalShell();
  await vtPanel('#vt-modal', clienteId, { modal: true });
};
window.vtCerrar = () => {
  _vt.enModal = false;
  closeModal();
  if (typeof _tq !== 'undefined') _tq.datos = null;
  if (_currentView === 'toques') rerenderView();
  const res = document.getElementById('seg-vt');
  if (res && _vt.clienteId && typeof vtResumen === 'function') vtResumen(res, _vt.clienteId);
};

// En el Seguimiento: solo el resumen y los botones (se revisan en la ventana).
window.vtResumen = async (caja, clienteId) => {
  const el = typeof caja === 'string' ? $(caja) : caja;
  if (!el || !clienteId) return;
  const filas = await vtDb.lista(clienteId);
  if (!el.isConnected) return;
  if (filas === null) { el.innerHTML = `<div class="text-sm text-slate-600">Para llevar la cuenta de los videos de técnica falta correr <code>${VT_SQL}</code> en Supabase.</div>`; return; }
  const vig = Object.values(vtUltimos(filas));
  const n = (e) => vig.filter(f => f.estado === e).length;
  const partes = [[n('recibido'), 'por revisar', 'recibido'], [n('pedido'), 'por llegar', 'pedido'], [n('mejorar') + n('mal'), 'a mejorar', 'mejorar'], [n('bien'), 'bien', 'bien']].filter(x => x[0]);
  el.innerHTML = `<div class="flex items-center gap-2 flex-wrap" data-vt-resumen>
      <span class="text-sm" style="flex:1;min-width:200px">${partes.length ? partes.map(([k, t, e]) => `<span class="text-xs font-bold rounded-full px-2.5 py-1 mr-1" style="background:${VT_ESTADO[e].fondo};color:${VT_ESTADO[e].color}" data-vt-res="${e}">${k} ${t}</span>`).join('') : '<span class="text-slate-500">Todavía no le has pedido videos.</span>'}</span>
      ${vig.length ? `<button type="button" class="btn btn-secondary btn-sm" data-vt-revisar onclick="vtAbrir('${clienteId}')">Revisar</button>` : ''}
      <button type="button" class="btn btn-primary btn-sm" data-vt-pedir-res onclick="tqPedirVideo('${clienteId}')">+ Pedir videos</button>
    </div>`;
};

window.vtPanel = async (caja, clienteId, { modal = false } = {}) => {
  if (!modal && caja !== '#vt-modal') _vt.enModal = false;
  _vt.caja = caja; _vt.clienteId = clienteId;
  let el = typeof caja === 'string' ? $(caja) : caja;
  if ((!el || !el.isConnected) && _vt.enModal) { vtModalShell(); _vt.caja = '#vt-modal'; el = $('#vt-modal'); }
  if (!el || !clienteId) return;
  el.innerHTML = '<div class="text-sm text-slate-400">Leyendo los videos…</div>';
  const filas = await vtDb.lista(clienteId);
  _vt.falta = filas === null;
  _vt.filas = filas || [];
  vtPintar();
};

function vtPintar() {
  let el = typeof _vt.caja === 'string' ? $(_vt.caja) : _vt.caja;
  // Otra ventana (la nota, pedir) tapó la de videos: se vuelve a abrir.
  if ((!el || !el.isConnected) && _vt.enModal) { vtModalShell(); _vt.caja = '#vt-modal'; el = $('#vt-modal'); }
  if (!el) return;
  if (_vt.falta) {
    el.innerHTML = `<div class="text-sm text-slate-600" data-vt-falta>Para llevar la cuenta de los videos de técnica falta correr
      <code>${VT_SQL}</code> en Supabase (SQL Editor → Run). Es una tabla nueva: no toca nada de lo que hay.</div>`;
    return;
  }
  const filas = _vt.filas;
  const ult = vtUltimos(filas);
  const vigentes = Object.values(ult);
  const por = (e) => vigentes.filter(f => f.estado === e).sort((a, b) => String(a.pedido_en).localeCompare(String(b.pedido_en)));
  const pedidos = por('pedido'), recibidos = por('recibido'), mejorar = por('mejorar'), mal = por('mal'), bien = por('bien');
  const chip = (e, n) => `<span class="text-xs font-bold rounded-full px-2.5 py-1" style="background:${VT_ESTADO[e].fondo};color:${VT_ESTADO[e].color}" data-vt-cuenta="${e}">${VT_ESTADO[e].txt} · ${n}</span>`;
  const veces = (f) => filas.filter(x => vtClave(x) === vtClave(f)).length;
  const fila = (f, botones) => `
    <div class="flex items-start gap-2 py-2 border-b border-slate-100" data-vt-fila="${f.id}" data-vt-estado="${f.estado}">
      <div class="flex-1 min-w-0">
        <div class="text-sm font-semibold text-slate-800">${escapeHtml(f.ejercicio_nombre)}</div>
        <div class="text-xs text-slate-500">Pedido el ${vtCorta(f.pedido_en)} (${vtHace(f.pedido_en)})${f.revisado_en ? ` · revisado el ${vtCorta(f.revisado_en)}` : ''}${veces(f) > 1 ? ` · ${veces(f)}ª vez` : ''}</div>
        ${f.nota ? `<div class="text-xs mt-0.5" style="color:${VT_ESTADO[f.estado].color}">📝 ${escapeHtml(f.nota)}</div>` : ''}
      </div>
      <div class="flex gap-1 flex-wrap justify-end flex-shrink-0" style="max-width:58%">${botones}</div>
    </div>`;
  const btnBien = (f) => `<button class="btn btn-ghost btn-sm" data-vt-bien onclick="vtMarcar('${f.id}', 'bien')" title="Lo revisaste y lo hizo bien">✓ Bien</button>`;
  const btnMejorar = (f) => `<button class="btn btn-ghost btn-sm" data-vt-mejorar onclick="vtMejorar('${f.id}')" title="Hay que corregir algo: anota qué y vuelve a pedirlo">↻ A mejorar</button>`
    + `<button class="btn btn-ghost btn-sm text-red-700" data-vt-mal onclick="vtMejorar('${f.id}', 'mal')" title="Lo hizo mal: anota qué y vuelve a pedirlo">✗ Nada bien</button>`;
  const seccion = (titulo, ayuda, lista, botones, abierta = true) => lista.length ? `
    <details class="mt-3" ${abierta ? 'open' : ''}>
      <summary class="cursor-pointer text-xs font-bold text-slate-500 uppercase tracking-wider">${titulo} (${lista.length})</summary>
      ${ayuda ? `<div class="text-xs text-slate-400 mt-1">${ayuda}</div>` : ''}
      <div>${lista.map(f => fila(f, botones(f))).join('')}</div>
    </details>` : '';

  el.innerHTML = `
    <div data-vt-panel>
      <div class="flex items-center gap-2 flex-wrap">
        ${chip('mal', mal.length)} ${chip('mejorar', mejorar.length)} ${chip('pedido', pedidos.length)} ${chip('recibido', recibidos.length)} ${chip('bien', bien.length)}
        <span class="flex-1"></span>
        ${pedidos.length || mejorar.length || mal.length ? `<button class="btn btn-ghost btn-sm" data-vt-copiar onclick="vtCopiarMensaje()" title="Un mensaje para WhatsApp con los que te debe y los que hay que repetir">📋 Copiar mensaje</button>` : ''}
        <button class="btn btn-primary btn-sm" data-vt-pedir onclick="vtPedir()">+ Pedir videos</button>
      </div>
      ${!vigentes.length ? '<p class="text-sm text-slate-500 mt-3">Todavía no le has pedido videos. Toca «+ Pedir videos» y elige de su rutina.</p>' : ''}
      ${seccion('✗ Nada bien · pídelos de nuevo', 'Lo hizo mal: la nota dice qué. Al volver a pedirlo queda como «por llegar» y la historia se guarda.', mal,
        f => `<button class="btn btn-secondary btn-sm" data-vt-repedir onclick="vtRepedir('${f.id}')">Pedir de nuevo</button>${btnBien(f)}`)}
      ${seccion('↻ A mejorar · pídelos de nuevo', 'Lo que tiene que corregir. Al volver a pedirlo queda como «por llegar» y la historia se guarda.', mejorar,
        f => `<button class="btn btn-secondary btn-sm" data-vt-repedir onclick="vtRepedir('${f.id}')">Pedir de nuevo</button>${btnBien(f)}`)}
      ${seccion('🕓 Por llegar', 'Se los pediste y no han llegado.', pedidos,
        f => `${btnBien(f)}${btnMejorar(f)}<button class="btn btn-ghost btn-sm" onclick="vtMarcar('${f.id}', 'recibido')" title="Llegó; lo revisas luego">Llegó</button><button class="btn btn-ghost btn-sm" onclick="vtBorrar('${f.id}')" title="Ya no se lo pides">✕</button>`)}
      ${seccion('👀 Por revisar', 'Llegaron y falta que los mires.', recibidos, f => `${btnBien(f)}${btnMejorar(f)}`)}
      ${seccion('✓ Bien', '', bien, f => `<button class="btn btn-ghost btn-sm" onclick="vtRepedir('${f.id}')" title="Pedirlo otra vez (para controlar)">Pedir otra vez</button>`, false)}
    </div>`;
}

window.vtMarcar = async (id, estado, nota) => {
  const row = { estado, revisado_en: estado === 'bien' || estado === 'mejorar' || estado === 'mal' ? vtHoy() : null };
  if (nota !== undefined) row.nota = nota || null;
  if (await vtDb.actualizar(id, row)) {
    Object.assign(_vt.filas.find(f => f.id === id) || {}, row);
    vtPintar();
  }
};

window.vtMejorar = (id, estado = 'mejorar') => {
  const f = _vt.filas.find(x => x.id === id);
  if (!f) return;
  openModal(modalShell(`${estado === 'mal' ? 'Nada bien' : 'A mejorar'} · ${escapeHtml(f.ejercicio_nombre)}`, `
    <label>${estado === 'mal' ? '¿Qué hizo mal?' : '¿Qué tiene que corregir?'}</label>
    <textarea id="vt-nota" rows="3" placeholder="Rodillas hacia adentro al subir; bajar más controlado">${escapeHtml(f.nota || '')}</textarea>
    <label class="flex items-center gap-2 mt-3 cursor-pointer" style="text-transform:none;letter-spacing:0;font-weight:400">
      <input type="checkbox" id="vt-repedir" style="width:auto"> <span class="text-sm">Pedírselo de nuevo ya</span></label>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" data-vt-guardar-mejorar onclick="vtGuardarMejorar('${id}', '${estado}')">Guardar</button>`));
};
window.vtGuardarMejorar = async (id, estado = 'mejorar') => {
  const nota = ($('#vt-nota')?.value || '').trim();
  const otra = $('#vt-repedir')?.checked;
  closeModal();
  await vtMarcar(id, estado, nota);
  if (otra) await vtRepedir(id);
};

window.vtRepedir = async (id) => {
  const f = _vt.filas.find(x => x.id === id);
  if (!f) return;
  const nueva = { cliente_id: f.cliente_id, ejercicio_id: f.ejercicio_id, ejercicio_nombre: f.ejercicio_nombre, estado: 'pedido', pedido_en: vtHoy(), pedido_de: f.id };
  if (await vtDb.crear([nueva])) { toast(`${f.ejercicio_nombre}: pedido de nuevo`); vtPanel(_vt.caja, _vt.clienteId); }
};

window.vtBorrar = async (id) => {
  if (!confirm('¿Quitar este pedido? (ya no se lo pides)')) return;
  if (await vtDb.borrar(id)) { _vt.filas = _vt.filas.filter(f => f.id !== id); vtPintar(); }
};

// ── Pedir: de su rutina, con lo que ya sabes de cada ejercicio ──────────
// En cada ejercicio, para decidir qué pedir: su video (se ve ahí mismo),
// cuántos ciclos lleva haciéndolo (o si es nuevo) y si ya le pediste video
// antes, con el último estado (por llegar, por revisar, bien, a mejorar…).
window.vtPedir = async () => {
  const clienteId = _vt.clienteId;
  const fases = await entDb.fases(clienteId);
  const fase = fases.find(f => f.estado === 'activa' && f.visible_cliente) || fases.find(f => f.estado === 'activa') || fases[fases.length - 1] || null;
  // Los ciclos anteriores a este, del más reciente al más viejo.
  const cuando = (f) => `${String(f.fecha_inicio || '').slice(0, 10)}|${String(Number(f.orden) || 0).padStart(6, '0')}`;
  const antes = fase ? fases.filter(f => f.id !== fase.id && cuando(f) < cuando(fase) && (f.estado !== 'borrador' || f.visible_cliente)).sort((x, y) => cuando(y).localeCompare(cuando(x))) : [];
  const [rutinas, rutAntes] = await Promise.all([
    fase ? entDb.rutinasDeFase(fase.id) : [],
    Promise.all(antes.map(f => entDb.rutinasDeFase(f.id).catch(() => []))),
    entDb.ejercicios().catch(() => []),
  ]);
  const idsAntes = rutAntes.flat().map(r => r.id);
  const [porRutina, porRutAntes] = await Promise.all([
    entDb.ejerciciosDeRutinas(rutinas.map(r => r.id)),
    idsAntes.length ? entDb.ejerciciosDeRutinas(idsAntes) : {},
  ]);
  // En qué ciclos anteriores estuvo cada ejercicio (índice 0 = el ciclo pasado).
  const enCiclo = antes.map((f, k) => new Set(rutAntes[k].flatMap(r => (porRutAntes[r.id] || []).map(re => re.ejercicio_id))));
  const historia = (id) => {
    let seguidos = 0; while (seguidos < enCiclo.length && enCiclo[seguidos].has(id)) seguidos++;
    const ultimo = enCiclo.findIndex(s => s.has(id));
    if (ultimo < 0) return `<span class="vt-h vt-nuevo" data-vt-ciclos="nuevo">Nuevo en este ciclo</span>`;
    if (seguidos > 0) return `<span class="vt-h" data-vt-ciclos="${seguidos + 1}">Lleva ${seguidos + 1} ciclos seguidos</span>`;
    return `<span class="vt-h" data-vt-ciclos="vuelve">Vuelve: lo hizo en ${escapeHtml(antes[ultimo].nombre)}</span>`;
  };
  // Lo que ya le pediste de ese ejercicio.
  const pedidosDe = (k) => _vt.filas.filter(f => vtClave(f) === k).sort((x, y) => String(y.pedido_en).localeCompare(String(x.pedido_en)) || String(y.created_at).localeCompare(String(x.created_at)));
  const videos = (k) => {
    const l = pedidosDe(k);
    if (!l.length) return '<span class="vt-h vt-gris" data-vt-pedidos="0">Nunca le pediste video</span>';
    const u = l[0], e = VT_ESTADO[u.estado] || VT_ESTADO.pedido;
    const cuando = u.estado === 'pedido' ? `se lo pediste ${vtHace(u.pedido_en)}` : `${l.length === 1 ? 'pedido 1 vez' : `pedido ${l.length} veces`} · el último ${vtCorta(u.pedido_en)}`;
    return `<span class="vt-est" style="background:${e.fondo};color:${e.color}" data-vt-ultimo="${u.estado}">${e.txt}</span><span class="vt-h vt-gris" data-vt-pedidos="${l.length}">${cuando}</span>${u.nota && ['mejorar', 'mal'].includes(u.estado) ? `<span class="vt-h vt-nota">Qué corregir: ${escapeHtml(u.nota)}</span>` : ''}`;
  };
  const ult = vtUltimos(_vt.filas);
  const vistos = new Set();
  const grupos = rutinas.map(r => {
    const ejs = (porRutina[r.id] || []).filter(re => re.ejercicios && !vistos.has(re.ejercicio_id) && vistos.add(re.ejercicio_id))
      .filter(re => !['calentamiento', 'estiramiento_pasivo', 'cardio'].includes(re.ejercicios.tipo));
    return { r, ejs };
  }).filter(g => g.ejs.length);
  const prev = (e) => (typeof entMiniPreviewHTML === 'function' ? entMiniPreviewHTML(e) : '') || '<span class="ent-mini-prev vt-sin-video">Sin video</span>';
  openModal(modalShell('Pedir videos de técnica', `
    <p class="text-sm text-slate-600 mb-3">Marca los ejercicios${fase ? ` de «${escapeHtml(fase.nombre)}»` : ''}. En cada uno ves su video, cuántos ciclos lleva haciéndolo y si ya le pediste video antes.</p>
    <div class="max-h-[58vh] overflow-y-auto pr-1">
      ${grupos.length ? grupos.map(g => `
        <div class="vt-grupo">${escapeHtml(g.r.nombre)}</div>
        ${g.ejs.map(re => { const n = entNombres(re.ejercicios).grande, porLlegar = ult[re.ejercicio_id]?.estado === 'pedido'; return `
          <div class="vt-fila-pedir${porLlegar ? ' vt-por-llegar' : ''}" data-vt-ej-fila="${re.ejercicio_id}">
            <input type="checkbox" class="vt-ej" id="vt-ej-${re.ejercicio_id}" style="width:auto;flex:none" value="${re.ejercicio_id}" data-nombre="${escapeHtml(n)}" ${porLlegar ? 'disabled' : ''}>
            <div class="vt-izq" data-vt-recorte>
              ${prev(re.ejercicios)}
              <span class="vt-nombre" onclick="vtMarcarEj('${re.ejercicio_id}')">${escapeHtml(n)}</span>
            </div>
            <div class="vt-der" onclick="vtMarcarEj('${re.ejercicio_id}')">
              <span class="vt-lineas">${historia(re.ejercicio_id)}</span>
              <span class="vt-lineas">${videos(re.ejercicio_id)}</span>
            </div>
          </div>`; }).join('')}`).join('') : '<p class="text-sm text-slate-500">Su ciclo no tiene ejercicios de fuerza todavía.</p>'}
    </div>
    <div class="mt-3"><label style="text-transform:none;letter-spacing:0">Otro (escribe el nombre)</label><input id="vt-otro" placeholder="Hip thrust con barra"></div>
    <label class="flex items-center gap-2 mt-3 cursor-pointer" style="text-transform:none;letter-spacing:0;font-weight:400">
      <input type="checkbox" id="vt-copiar" checked style="width:auto"> <span class="text-sm">Copiar el mensaje para mandárselo por WhatsApp</span></label>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" data-vt-confirmar onclick="vtConfirmarPedido()">Pedir</button>`), { wide: true });
};

// Tocar el nombre o los datos marca la casilla (si no está «Por llegar»).
window.vtMarcarEj = (id) => { const c = document.getElementById(`vt-ej-${id}`); if (c && !c.disabled) c.checked = !c.checked; };

(function () {
  const s = document.createElement('style');
  s.textContent = `
  .vt-grupo{font-size:13px;font-weight:700;color:#55565B;margin:12px 0 4px}
  .vt-fila-pedir{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid #F1EEE8}
  .vt-izq{display:flex;align-items:center;gap:12px;flex:0 0 46%;min-width:0;background:#fff;padding:4px 6px 4px 0}
  .vt-izq .ent-mini-prev{width:112px}
  .vt-izq .ent-mini-prev.reproduciendo{width:220px}
  .vt-nombre{font-size:14px;font-weight:650;color:#1F1F1F;line-height:1.3;cursor:pointer;min-width:0}
  .vt-sin-video{display:grid;place-items:center;font-size:11px;color:#9A9AA0}
  .vt-der{flex:1;min-width:0;cursor:pointer;border-left:1px solid #EFEBE3;padding-left:14px;align-self:stretch;display:flex;flex-direction:column;justify-content:center}
  .vt-por-llegar .vt-der,.vt-por-llegar .vt-nombre{cursor:default}
  .vt-lineas{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin:2px 0}
  .vt-h{font-size:12px;color:#1F1F1F}
  .vt-h.vt-gris{color:#7A7A7A}
  .vt-h.vt-nota{color:#A3301B;flex-basis:100%}
  .vt-h.vt-nuevo{background:#EAF1FB;color:#2F6CC4;font-weight:700;border-radius:999px;padding:1px 8px}
  .vt-est{font-size:11px;font-weight:700;border-radius:999px;padding:1px 8px}
  @media (max-width: 640px){ .vt-izq{flex-basis:52%;gap:8px} .vt-izq .ent-mini-prev{width:76px} .vt-nombre{font-size:13px} .vt-der{padding-left:10px} }`;
  document.head.appendChild(s);
})();

window.vtConfirmarPedido = async () => {
  const marcados = $$('.vt-ej:checked').map(i => ({ ejercicio_id: i.value, ejercicio_nombre: i.dataset.nombre }));
  const otro = ($('#vt-otro')?.value || '').trim();
  if (otro) marcados.push({ ejercicio_id: null, ejercicio_nombre: otro });
  if (!marcados.length) return toast('Marca al menos uno');
  const copiar = $('#vt-copiar')?.checked;
  const ult = vtUltimos(_vt.filas);
  const filas = marcados.map(m => {
    const antes = ult[m.ejercicio_id || `n:${m.ejercicio_nombre.toLowerCase()}`];
    return { cliente_id: _vt.clienteId, ...m, estado: 'pedido', pedido_en: vtHoy(), pedido_de: antes ? antes.id : null };
  });
  if (!(await vtDb.crear(filas))) return;
  closeModal();
  toast(`${filas.length} video${filas.length === 1 ? '' : 's'} pedido${filas.length === 1 ? '' : 's'}`);
  await vtPanel(_vt.caja, _vt.clienteId);
  if (copiar) await vtCopiarMensaje(filas.map(f => f.ejercicio_nombre));
};

// El mensaje: lo que te debe, y lo que hay que repetir con lo que corregir.
window.vtCopiarMensaje = async (soloEstos = null) => {
  const ult = Object.values(vtUltimos(_vt.filas));
  const pedidos = soloEstos || ult.filter(f => f.estado === 'pedido').map(f => f.ejercicio_nombre);
  const mejorar = soloEstos ? [] : ult.filter(f => f.estado === 'mejorar' || f.estado === 'mal');
  let nombre = '';
  try { const c = await db.clientes.get(_vt.clienteId); nombre = String(c?.nombre || '').split(' ')[0]; } catch (e) {}
  const lineas = [`Hola${nombre ? ' ' + nombre : ''}! Para revisar tu técnica, cuando puedas envíame un video de:`];
  pedidos.forEach(n => lineas.push(`• ${n}`));
  if (mejorar.length) {
    lineas.push('', 'Y de nuevo estos, fijándote en:');
    mejorar.forEach(f => lineas.push(`• ${f.ejercicio_nombre}${f.nota ? ` — ${f.nota}` : ''}`));
  }
  lineas.push('', '¡Gracias!');
  const texto = lineas.join('\n');
  try { await navigator.clipboard.writeText(texto); toast('Mensaje copiado: pégalo en WhatsApp'); }
  catch (e) { openModal(modalShell('Copia el mensaje', `<textarea rows="10" style="width:100%">${escapeHtml(texto)}</textarea>`, '<button class="btn btn-primary" onclick="closeModal()">Listo</button>')); }
  if (_vt.clienteId && typeof segRegistrar === 'function') segRegistrar(_vt.clienteId, { origen: 'videos', titulo: 'Pedir video', texto });
  return texto;
};


// ═══════════════════════════════════════════════════════════════════════
// LA ETIQUETA EN CADA EJERCICIO · y la lista general de todos los clientes
// ═══════════════════════════════════════════════════════════════════════
// En Entrenamiento → el cliente → Rutinas, cada ejercicio lleva su etiqueta
// (por llegar, por revisar, a mejorar, nada bien, bien) o un «🎥» para
// pedirlo ahí mismo. Al tocarla se cambia el estado sin salir de la rutina.
// Y en la lista de clientes de Entrenamiento, todo lo que está pendiente de
// todos: quién te debe qué video y desde cuándo.

// Lo último de cada ejercicio de ESE cliente (se lee una vez por cliente).
window.vtEtiquetasCliente = async (clienteId, force = false) => {
  if (!clienteId) return {};
  if (_vt.porCliente[clienteId] && !force) return _vt.porCliente[clienteId];
  const filas = await vtDb.lista(clienteId);
  if (filas === null) return (_vt.porCliente[clienteId] = {});
  const ult = vtUltimos(filas);
  // Si es un pedido repetido, se recuerda cómo quedó el anterior (y su nota).
  const porId = Object.fromEntries(filas.map(f => [f.id, f]));
  Object.values(ult).forEach(f => { const a = f.pedido_de && porId[f.pedido_de]; if (a && (a.estado === 'mal' || a.estado === 'mejorar')) f.previa = a; });
  return (_vt.porCliente[clienteId] = ult);
};
const vtOlvidar = (clienteId) => { delete _vt.porCliente[clienteId]; };

window.vtEtiquetaHTML = (f, { ejercicioId, nombre, clienteId }) => {
  if (!clienteId) return '';
  const abre = `onclick="event.stopPropagation(); vtEtiquetaMenu('${clienteId}', '${ejercicioId || ''}', ${JSON.stringify(String(nombre || '')).replace(/"/g, '&quot;')})"`;
  if (!f) return `<button type="button" class="btn btn-ghost btn-sm" data-vt-etiqueta="ninguno" ${abre} title="Pedirle video de este ejercicio">🎥</button>`;
  const e = VT_ESTADO[f.estado] || VT_ESTADO.pedido;
  const previa = f.previa ? ` · de nuevo, antes ${VT_ESTADO[f.previa.estado].txt.toLowerCase()}${f.previa.nota ? ': ' + escapeHtml(f.previa.nota) : ''}` : '';
  return `<button type="button" class="text-[11px] font-bold rounded-full px-2 py-0.5 whitespace-nowrap" data-vt-etiqueta="${f.estado}" ${abre}
    style="background:${e.fondo};color:${e.color}" title="Video de técnica: ${e.txt} · pedido ${vtHace(f.pedido_en)}${f.nota ? ' · ' + escapeHtml(f.nota) : ''}${previa}">🎥 ${e.txt}${f.previa ? ' ↻' : ''}</button>`;
};

// El menú de la etiqueta: lo que le pasó a ese ejercicio y los botones.
window.vtEtiquetaMenu = async (clienteId, ejercicioId, nombre) => {
  const filas = (await vtDb.lista(clienteId)) || [];
  const k = ejercicioId || `n:${String(nombre).toLowerCase()}`;
  const historia = filas.filter(f => vtClave(f) === k).sort((a, b) => String(b.pedido_en).localeCompare(String(a.pedido_en)) || String(b.created_at).localeCompare(String(a.created_at)));
  const ult = historia[0] || null;
  const E = (e) => VT_ESTADO[e];
  const lista = historia.length ? historia.slice(0, 6).map(f => `
    <div class="flex items-center gap-2 py-1.5 border-b border-slate-100 text-sm">
      <span class="text-[11px] font-bold rounded-full px-2 py-0.5" style="background:${E(f.estado).fondo};color:${E(f.estado).color}">${E(f.estado).txt}</span>
      <span class="text-xs text-slate-500">pedido el ${vtCorta(f.pedido_en)}${f.revisado_en ? ` · revisado el ${vtCorta(f.revisado_en)}` : ''}</span>
      ${f.nota ? `<span class="text-xs text-slate-700 flex-1 min-w-0 truncate" title="${escapeHtml(f.nota)}">📝 ${escapeHtml(f.nota)}</span>` : ''}
    </div>`).join('') : '<p class="text-sm text-slate-500">Nunca le has pedido video de este ejercicio.</p>';
  const puedeRevisar = ult && (ult.estado === 'pedido' || ult.estado === 'recibido');
  openModal(modalShell(`🎥 ${escapeHtml(nombre)}`, `
    <div data-vt-menu>
      ${lista}
      <div class="flex flex-wrap gap-1.5 mt-4">
        ${!ult || ult.estado !== 'pedido' ? `<button class="btn btn-primary btn-sm" data-vt-menu-pedir onclick="vtEtiquetaAccion('pedir')">+ Pedir video</button>` : ''}
        ${ult && ult.estado === 'pedido' ? `<button class="btn btn-secondary btn-sm" onclick="vtEtiquetaAccion('recibido')">Llegó</button>` : ''}
        ${puedeRevisar || (ult && (ult.estado === 'mejorar' || ult.estado === 'mal')) ? `<button class="btn btn-secondary btn-sm" data-vt-menu-bien onclick="vtEtiquetaAccion('bien')">✓ Bien</button>` : ''}
        ${puedeRevisar ? `<button class="btn btn-ghost btn-sm" data-vt-menu-mejorar onclick="vtEtiquetaAccion('mejorar')">↻ A mejorar</button>
          <button class="btn btn-ghost btn-sm text-red-700" data-vt-menu-mal onclick="vtEtiquetaAccion('mal')">✗ Nada bien</button>` : ''}
        ${ult && ult.estado === 'pedido' ? `<button class="btn btn-ghost btn-sm" onclick="vtEtiquetaAccion('quitar')" title="Ya no se lo pides">✕ Quitar pedido</button>` : ''}
      </div>
      <div id="vt-menu-nota" class="hidden mt-3">
        <label id="vt-menu-nota-lab">¿Qué tiene que corregir?</label>
        <textarea id="vt-nota" rows="3" placeholder="Rodillas hacia adentro al subir; bajar más controlado"></textarea>
        <label class="flex items-center gap-2 mt-2 cursor-pointer" style="text-transform:none;letter-spacing:0;font-weight:400">
          <input type="checkbox" id="vt-repedir" checked style="width:auto"> <span class="text-sm">Pedírselo de nuevo ya</span></label>
        <button class="btn btn-primary btn-sm mt-2" data-vt-menu-guardar onclick="vtEtiquetaGuardarNota()">Guardar</button>
      </div>
    </div>`, `<button class="btn btn-ghost" onclick="closeModal()">Cerrar</button>`));
  _vt.menu = { clienteId, ejercicioId: ejercicioId || null, nombre, ult };
};

async function vtEtiquetaTermina(clienteId, mensaje) {
  vtOlvidar(clienteId);
  closeModal();
  if (mensaje) toast(mensaje);
  // La rutina de atrás se repinta con la etiqueta nueva.
  if (typeof entVistaClientes === 'function' && typeof _ent !== 'undefined' && _ent.clienteId === clienteId) entVistaClientes();
  if (_vt.caja && _vt.clienteId === clienteId) vtPanel(_vt.caja, clienteId);
}

window.vtEtiquetaAccion = async (accion) => {
  const m = _vt.menu; if (!m) return;
  const { clienteId, ejercicioId, nombre, ult } = m;
  if (accion === 'pedir') {
    const fila = { cliente_id: clienteId, ejercicio_id: ejercicioId, ejercicio_nombre: nombre, estado: 'pedido', pedido_en: vtHoy(), pedido_de: ult ? ult.id : null };
    if (await vtDb.crear([fila])) vtEtiquetaTermina(clienteId, `${nombre}: video pedido`);
    return;
  }
  if (!ult) return;
  if (accion === 'quitar') { if (await vtDb.borrar(ult.id)) vtEtiquetaTermina(clienteId, 'Pedido quitado'); return; }
  if (accion === 'mejorar' || accion === 'mal') {
    const caja = $('#vt-menu-nota'); if (caja) caja.classList.remove('hidden');
    const lab = $('#vt-menu-nota-lab'); if (lab) lab.textContent = accion === 'mal' ? '¿Qué hizo mal?' : '¿Qué tiene que corregir?';
    m.estadoNota = accion;
    return;
  }
  const row = { estado: accion, revisado_en: accion === 'bien' ? vtHoy() : null };
  if (await vtDb.actualizar(ult.id, row)) vtEtiquetaTermina(clienteId, `${nombre}: ${VT_ESTADO[accion].txt.toLowerCase()}`);
};

window.vtEtiquetaGuardarNota = async () => {
  const m = _vt.menu; if (!m || !m.ult) return;
  const estado = m.estadoNota || 'mejorar';
  const nota = ($('#vt-nota')?.value || '').trim();
  const otra = $('#vt-repedir')?.checked;
  if (!(await vtDb.actualizar(m.ult.id, { estado, nota: nota || null, revisado_en: vtHoy() }))) return;
  if (otra) await vtDb.crear([{ cliente_id: m.clienteId, ejercicio_id: m.ejercicioId, ejercicio_nombre: m.nombre, estado: 'pedido', pedido_en: vtHoy(), pedido_de: m.ult.id }]);
  vtEtiquetaTermina(m.clienteId, `${m.nombre}: ${VT_ESTADO[estado].txt.toLowerCase()}${otra ? ' · pedido de nuevo' : ''}`);
};

// La lista general: todo lo pendiente de todos los clientes, con quién y
// desde cuándo. Lo más viejo primero dentro de cada estado.
window.vtListaGeneral = async (caja) => {
  const el = typeof caja === 'string' ? $(caja) : caja;
  if (!el) return;
  const { data, error } = await sb.from('videos_tecnica').select('*, clientes(nombre)').order('pedido_en', { ascending: false });
  if (error) { el.innerHTML = ''; return; }
  const filas = data || [];
  let clientes = [];
  try { clientes = await db.clientes.list(); } catch (e) { clientes = []; }
  const nombres = Object.fromEntries(clientes.map(c => [c.id, c.nombre]));
  // Lo último por (cliente, ejercicio).
  const ult = {};
  filas.forEach(f => { const k = f.cliente_id + '|' + vtClave(f); if (!ult[k] || String(f.pedido_en) > String(ult[k].pedido_en) || (f.pedido_en === ult[k].pedido_en && String(f.created_at) > String(ult[k].created_at))) ult[k] = f; });
  const porId = Object.fromEntries(filas.map(f => [f.id, f]));
  const vig = Object.values(ult).filter(f => f.estado !== 'bien');
  vig.forEach(f => { const a = f.pedido_de && porId[f.pedido_de]; if (a && (a.estado === 'mal' || a.estado === 'mejorar')) f.previa = a; });
  const nombreDe = (f) => (f.clientes && f.clientes.nombre) || nombres[f.cliente_id] || 'Cliente';
  const orden = { mal: 0, mejorar: 1, recibido: 2, pedido: 3 };
  vig.sort((a, b) => (orden[a.estado] ?? 9) - (orden[b.estado] ?? 9) || String(a.pedido_en).localeCompare(String(b.pedido_en)) || nombreDe(a).localeCompare(nombreDe(b)));
  const cuenta = (e) => vig.filter(f => f.estado === e).length;
  const chip = (e) => cuenta(e) ? `<span class="text-xs font-bold rounded-full px-2.5 py-1" style="background:${VT_ESTADO[e].fondo};color:${VT_ESTADO[e].color}" data-vtg-cuenta="${e}">${VT_ESTADO[e].txt} · ${cuenta(e)}</span>` : '';
  el.innerHTML = `
    <div class="card" data-vt-general>
      <div class="flex items-center gap-2 flex-wrap mb-2">
        <div class="font-bold text-slate-900">Videos de técnica pendientes</div>
        ${chip('mal')} ${chip('mejorar')} ${chip('recibido')} ${chip('pedido')}
      </div>
      ${vig.length ? `<div class="divide-y divide-slate-100">${vig.map(f => `
        <div class="flex items-center gap-2 py-1.5 cursor-pointer" data-vtg-fila="${f.id}" onclick="verEntrenamientoCliente('${f.cliente_id}'); _ent.subtab = 'videos';">
          <span class="text-[11px] font-bold rounded-full px-2 py-0.5 whitespace-nowrap" style="background:${VT_ESTADO[f.estado].fondo};color:${VT_ESTADO[f.estado].color}">${VT_ESTADO[f.estado].txt}</span>
          <span class="text-sm font-semibold text-slate-800 whitespace-nowrap">${escapeHtml(nombreDe(f))}</span>
          <span class="text-sm text-slate-700 flex-1 min-w-0 truncate">${escapeHtml(f.ejercicio_nombre)}${f.nota ? ` <span class="text-xs text-slate-500">· ${escapeHtml(f.nota)}</span>` : ''}${f.previa ? ` <span class="text-xs" style="color:${VT_ESTADO[f.previa.estado].color}">· de nuevo, antes ${VT_ESTADO[f.previa.estado].txt.toLowerCase()}${f.previa.nota ? ': ' + escapeHtml(f.previa.nota) : ''}</span>` : ''}</span>
          <span class="text-xs text-slate-400 whitespace-nowrap">${f.estado === 'pedido' ? 'pedido ' : ''}${vtHace(f.estado === 'pedido' ? f.pedido_en : (f.revisado_en || f.pedido_en))}</span>
        </div>`).join('')}</div>`
      : '<p class="text-sm text-slate-500">Nada pendiente: ningún video por llegar, por revisar ni por repetir.</p>'}
    </div>`;
};
