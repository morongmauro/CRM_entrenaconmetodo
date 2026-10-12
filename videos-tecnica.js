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

const VT_SQL = 'carga/migracion-videos-tecnica.sql';
const _vt = { caja: null, clienteId: null, filas: [], falta: false };

const vtDb = {
  async lista(clienteId) {
    const { data, error } = await sb.from('videos_tecnica').select('*').eq('cliente_id', clienteId).order('pedido_en', { ascending: false });
    if (error) return null;
    return data || [];
  },
  async crear(filas) {
    const { error } = await sb.from('videos_tecnica').insert(filas);
    if (error) { toast(/videos_tecnica/.test(error.message || '') ? `Falta correr ${VT_SQL} en Supabase` : error.message); return false; }
    return true;
  },
  async actualizar(id, row) {
    const { error } = await sb.from('videos_tecnica').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast(error.message); return false; }
    return true;
  },
  async borrar(id) {
    const { error } = await sb.from('videos_tecnica').delete().eq('id', id);
    if (error) { toast(error.message); return false; }
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
window.vtPanel = async (caja, clienteId) => {
  _vt.caja = caja; _vt.clienteId = clienteId;
  const el = typeof caja === 'string' ? $(caja) : caja;
  if (!el || !clienteId) return;
  el.innerHTML = '<div class="text-sm text-slate-400">Leyendo los videos…</div>';
  const filas = await vtDb.lista(clienteId);
  _vt.falta = filas === null;
  _vt.filas = filas || [];
  vtPintar();
};

function vtPintar() {
  const el = typeof _vt.caja === 'string' ? $(_vt.caja) : _vt.caja;
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
  const pedidos = por('pedido'), recibidos = por('recibido'), mejorar = por('mejorar'), bien = por('bien');
  const chip = (e, n) => `<span class="text-xs font-bold rounded-full px-2.5 py-1" style="background:${VT_ESTADO[e].fondo};color:${VT_ESTADO[e].color}" data-vt-cuenta="${e}">${VT_ESTADO[e].txt} · ${n}</span>`;
  const veces = (f) => filas.filter(x => vtClave(x) === vtClave(f)).length;
  const fila = (f, botones) => `
    <div class="flex items-start gap-2 py-2 border-b border-slate-100" data-vt-fila="${f.id}" data-vt-estado="${f.estado}">
      <div class="flex-1 min-w-0">
        <div class="text-sm font-semibold text-slate-800">${escapeHtml(f.ejercicio_nombre)}</div>
        <div class="text-xs text-slate-500">Pedido el ${vtCorta(f.pedido_en)} (${vtHace(f.pedido_en)})${f.revisado_en ? ` · revisado el ${vtCorta(f.revisado_en)}` : ''}${veces(f) > 1 ? ` · ${veces(f)}ª vez` : ''}</div>
        ${f.nota ? `<div class="text-xs mt-0.5" style="color:${VT_ESTADO[f.estado].color}">📝 ${escapeHtml(f.nota)}</div>` : ''}
      </div>
      <div class="flex gap-1 flex-wrap justify-end flex-shrink-0">${botones}</div>
    </div>`;
  const btnBien = (f) => `<button class="btn btn-ghost btn-sm" data-vt-bien onclick="vtMarcar('${f.id}', 'bien')" title="Lo revisaste y lo hizo bien">✓ Bien</button>`;
  const btnMejorar = (f) => `<button class="btn btn-ghost btn-sm" data-vt-mejorar onclick="vtMejorar('${f.id}')" title="Hay que corregir algo: anota qué y vuelve a pedirlo">↻ A mejorar</button>`;
  const seccion = (titulo, ayuda, lista, botones, abierta = true) => lista.length ? `
    <details class="mt-3" ${abierta ? 'open' : ''}>
      <summary class="cursor-pointer text-xs font-bold text-slate-500 uppercase tracking-wider">${titulo} (${lista.length})</summary>
      ${ayuda ? `<div class="text-xs text-slate-400 mt-1">${ayuda}</div>` : ''}
      <div>${lista.map(f => fila(f, botones(f))).join('')}</div>
    </details>` : '';

  el.innerHTML = `
    <div data-vt-panel>
      <div class="flex items-center gap-2 flex-wrap">
        ${chip('mejorar', mejorar.length)} ${chip('pedido', pedidos.length)} ${chip('recibido', recibidos.length)} ${chip('bien', bien.length)}
        <span class="flex-1"></span>
        ${pedidos.length || mejorar.length ? `<button class="btn btn-ghost btn-sm" data-vt-copiar onclick="vtCopiarMensaje()" title="Un mensaje para WhatsApp con los que te debe y los que hay que repetir">📋 Copiar mensaje</button>` : ''}
        <button class="btn btn-primary btn-sm" data-vt-pedir onclick="vtPedir()">+ Pedir videos</button>
      </div>
      ${!vigentes.length ? '<p class="text-sm text-slate-500 mt-3">Todavía no le has pedido videos. Toca «+ Pedir videos» y elige de su rutina.</p>' : ''}
      ${seccion('↻ A mejorar · pídelos de nuevo', 'Lo que tiene que corregir. Al volver a pedirlo queda como «por llegar» y la historia se guarda.', mejorar,
        f => `<button class="btn btn-secondary btn-sm" data-vt-repedir onclick="vtRepedir('${f.id}')">Pedir de nuevo</button>${btnBien(f)}`)}
      ${seccion('🕓 Por llegar', 'Se los pediste y no han llegado.', pedidos,
        f => `${btnBien(f)}${btnMejorar(f)}<button class="btn btn-ghost btn-sm" onclick="vtMarcar('${f.id}', 'recibido')" title="Llegó; lo revisas luego">Llegó</button><button class="btn btn-ghost btn-sm" onclick="vtBorrar('${f.id}')" title="Ya no se lo pides">✕</button>`)}
      ${seccion('👀 Por revisar', 'Llegaron y falta que los mires.', recibidos, f => `${btnBien(f)}${btnMejorar(f)}`)}
      ${seccion('✓ Bien', '', bien, f => `<button class="btn btn-ghost btn-sm" onclick="vtRepedir('${f.id}')" title="Pedirlo otra vez (para controlar)">Pedir otra vez</button>`, false)}
    </div>`;
}

window.vtMarcar = async (id, estado, nota) => {
  const row = { estado, revisado_en: estado === 'bien' || estado === 'mejorar' ? vtHoy() : null };
  if (nota !== undefined) row.nota = nota || null;
  if (await vtDb.actualizar(id, row)) {
    Object.assign(_vt.filas.find(f => f.id === id) || {}, row);
    vtPintar();
  }
};

window.vtMejorar = (id) => {
  const f = _vt.filas.find(x => x.id === id);
  if (!f) return;
  openModal(modalShell(`A mejorar · ${escapeHtml(f.ejercicio_nombre)}`, `
    <label>¿Qué tiene que corregir?</label>
    <textarea id="vt-nota" rows="3" placeholder="Rodillas hacia adentro al subir; bajar más controlado">${escapeHtml(f.nota || '')}</textarea>
    <label class="flex items-center gap-2 mt-3 cursor-pointer" style="text-transform:none;letter-spacing:0;font-weight:400">
      <input type="checkbox" id="vt-repedir" style="width:auto"> <span class="text-sm">Pedírselo de nuevo ya</span></label>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" data-vt-guardar-mejorar onclick="vtGuardarMejorar('${id}')">Guardar</button>`));
};
window.vtGuardarMejorar = async (id) => {
  const nota = ($('#vt-nota')?.value || '').trim();
  const otra = $('#vt-repedir')?.checked;
  closeModal();
  await vtMarcar(id, 'mejorar', nota);
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
window.vtPedir = async () => {
  const clienteId = _vt.clienteId;
  const fases = await entDb.fases(clienteId);
  const fase = fases.find(f => f.estado === 'activa' && f.visible_cliente) || fases.find(f => f.estado === 'activa') || fases[fases.length - 1] || null;
  const rutinas = fase ? await entDb.rutinasDeFase(fase.id) : [];
  const porRutina = await entDb.ejerciciosDeRutinas(rutinas.map(r => r.id));
  const ult = vtUltimos(_vt.filas);
  const vistos = new Set();
  const grupos = rutinas.map(r => {
    const ejs = (porRutina[r.id] || []).filter(re => re.ejercicios && !vistos.has(re.ejercicio_id) && vistos.add(re.ejercicio_id))
      .filter(re => !['calentamiento', 'estiramiento_pasivo', 'cardio'].includes(re.ejercicios.tipo));
    return { r, ejs };
  }).filter(g => g.ejs.length);
  const insignia = (k) => { const f = ult[k]; return f ? `<span class="text-[10px] font-bold rounded-full px-1.5 py-0.5" style="background:${VT_ESTADO[f.estado].fondo};color:${VT_ESTADO[f.estado].color}">${VT_ESTADO[f.estado].txt}</span>` : ''; };
  openModal(modalShell('Pedir videos de técnica', `
    <p class="text-sm text-slate-600 mb-3">Marca los ejercicios${fase ? ` de «${escapeHtml(fase.nombre)}»` : ''}. Al lado ves cómo le fue la última vez.</p>
    <div class="max-h-[55vh] overflow-y-auto pr-1">
      ${grupos.length ? grupos.map(g => `
        <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wide mt-2 mb-1">${escapeHtml(g.r.nombre)}</div>
        ${g.ejs.map(re => `
          <label class="flex items-center gap-2 py-1.5 border-b border-slate-100 cursor-pointer" style="margin:0;text-transform:none;letter-spacing:0;font-weight:400">
            <input type="checkbox" class="vt-ej" style="width:auto" value="${re.ejercicio_id}" data-nombre="${escapeHtml(entNombres(re.ejercicios).grande)}" ${ult[re.ejercicio_id]?.estado === 'pedido' ? 'disabled' : ''}>
            <span class="flex-1 min-w-0 text-sm">${escapeHtml(entNombres(re.ejercicios).grande)}</span>${insignia(re.ejercicio_id)}
          </label>`).join('')}`).join('') : '<p class="text-sm text-slate-500">Su ciclo no tiene ejercicios de fuerza todavía.</p>'}
    </div>
    <div class="mt-3"><label>Otro (escribe el nombre)</label><input id="vt-otro" placeholder="Hip thrust con barra"></div>
    <label class="flex items-center gap-2 mt-3 cursor-pointer" style="text-transform:none;letter-spacing:0;font-weight:400">
      <input type="checkbox" id="vt-copiar" checked style="width:auto"> <span class="text-sm">Copiar el mensaje para mandárselo por WhatsApp</span></label>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" data-vt-confirmar onclick="vtConfirmarPedido()">Pedir</button>`), { wide: true });
};

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
  const mejorar = soloEstos ? [] : ult.filter(f => f.estado === 'mejorar');
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
  return texto;
};
