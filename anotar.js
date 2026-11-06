// =====================================================
// ANOTAR · lo que te dice cada cliente, donde corresponde
// =====================================================
// Una cajita para escribir como hablas («me dijo que se va a Cartagena del
// 12 al 20 y que la rodilla sigue molestando»). El CRM lo separa en partes y
// propone el tipo de cada una (lo cambias con un toque); al guardar, cada
// parte queda donde sirve después:
//   · Viaje / ausencia → crea la ausencia (pausa esos días: no cuentan en su
//     adherencia ni en las alertas) y sale en su Seguimiento.
//   · Salud → queda ABIERTO con fecha para revisar: crea la tarea «Revisar…»
//     (sale en Hoy y en Mis tareas) y arriba de su Seguimiento hasta que
//     tocas «Ya está bien».
//   · Pendiente → crea la tarea (Hoy y Mis tareas) con su fecha.
//   · Dato fijo → «Lo que siempre hay que saber», arriba de su Seguimiento.
//   · Solo conversación → su historial.
// Todo queda en su historial (Seguimiento y el historial de Toques) y cuenta
// como toque: «hablamos» (te escribió y le respondiste).
//
// Se abre desde: el botón «+ Anotar» (abajo a la derecha, en todo el CRM),
// «Anotar» en su Seguimiento y la casilla «Te escribió por WhatsApp» de Toques.
// Tabla: notas_cliente (migraciones/notas-cliente.sql).
//
// Carga DESPUÉS de ausencias-crm.js, tareas-coach.js, seguimiento-areas.js y
// toques.js.
// =====================================================

const AN_TIPOS = [
  ['viaje', 'Viaje / ausencia', 'V', '#E3EEFB', '#2F5FA6'],
  ['salud', 'Salud', 'S', '#FBE5E1', '#B2402B'],
  ['pendiente', 'Pendiente', 'P', '#FDEBDD', '#B25E1E'],
  ['fijo', 'Dato fijo', 'F', '#EFEDE7', '#55565B'],
  ['conversacion', 'Solo conversación', 'C', '#E2F1E5', '#2F6B3C'],
];
const AN_T = Object.fromEntries(AN_TIPOS.map(t => [t[0], t]));
const _an = { cliente: null, partes: [], sinTabla: false, notas: {}, timer: null };
const AN_MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const anCorta = (f) => { if (!f) return ''; const [, m, d] = String(f).slice(0, 10).split('-').map(Number); return `${d} ${AN_MESES[m - 1]}`; };
const anSumar = (f, n) => evtSumarDias(f, n);

// ── Separar y proponer el tipo ───────────────────────────────────────────
const AN_RE = {
  viaje: /(viaj|vacacion|me voy|se va |se va a|fuera de la ciudad|no estar[eé]|no va a estar|paseo|puente|congreso|boda en|vuelvo el|regresa el)/i,
  salud: /(duel|dolor|lesi|molest|enferm|gripa|gripe|fiebre|covid|resfr|contractur|esguin|tendin|rodilla|hombro|espalda|lumbar|cadera|tobillo|mu[ñn]eca|codo|cuello|operaci|cirug|m[eé]dico|fisio|embaraz|migra)/i,
  pendiente: /(mandarle|enviarle|pasarle|quedé en|qued[eé] de|le mando|le env[ií]o|recordarle|ajustarle|cambiarle|revisarle|armarle|hacerle|me pidi[oó]|pidi[oó] que|te pide|necesita que)/i,
  fijo: /(no come|no toma|al[eé]rgic|intoleran|vegetarian|vegan|cel[ií]ac|siempre entrena|entrena a las|horario|turno|su gimnasio|gym no tiene|no tiene m[aá]quina|no hay m[aá]quina|en casa entrena|trabaja de noche)/i,
};
function anTipo(t) {
  if (AN_RE.viaje.test(t) || anFechas(t)) return 'viaje';
  if (AN_RE.salud.test(t)) return 'salud';
  if (AN_RE.fijo.test(t)) return 'fijo';
  if (AN_RE.pendiente.test(t)) return 'pendiente';
  return 'conversacion';
}
// «del 12 al 20», «12 al 20 de nov», «hasta el 20»: las fechas del viaje.
function anFechas(t) {
  const mes = (s) => { if (!s) return null; const i = AN_MESES.findIndex(m => String(s).toLowerCase().startsWith(m)); return i >= 0 ? i : null; };
  const hoy = fmt.hoy(), [Y, M, D] = hoy.split('-').map(Number);
  const iso = (d, m) => { let y = Y, mm = m != null ? m : M - 1; if (m == null && d < D - 3) mm += 1; if (mm > 11) { mm -= 12; y += 1; } if (m != null && mm < M - 2) y += 1; return `${y}-${String(mm + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; };
  let r = String(t).match(/\b(?:del?|desde el)\s+(\d{1,2})(?:\s+de\s+([a-záéíóú]+))?\s+(?:al|hasta el)\s+(\d{1,2})(?:\s+de\s+([a-záéíóú]+))?/i);
  if (r) { const m2 = mes(r[4]), m1 = mes(r[2]) ?? m2; const desde = iso(Number(r[1]), m1), hasta = iso(Number(r[3]), m2 ?? m1); return { desde, hasta: hasta < desde ? iso(Number(r[3]), (m1 ?? M - 1) + 1) : hasta }; }
  r = String(t).match(/\bhasta el\s+(\d{1,2})(?:\s+de\s+([a-záéíóú]+))?/i);
  if (r && AN_RE.viaje.test(t)) return { desde: hoy, hasta: iso(Number(r[1]), mes(r[2])) };
  return null;
}
// En partes: por oraciones y por «y que» / «además»; las que quedan del
// mismo tipo seguidas se juntan.
function anSeparar(texto) {
  const t = String(texto || '').trim();
  if (!t) return [];
  const trozos = t.split(/(?<=[.!?;\n])\s+|\s+(?:y que|y adem[aá]s|adem[aá]s,?|tambi[eé]n que)\s+/i).map(x => x.trim().replace(/^[,.;\s]+|[,;\s]+$/g, '')).filter(x => x.length > 2);
  const out = [];
  trozos.forEach(x => {
    const tipo = anTipo(x), prev = out[out.length - 1];
    if (prev && prev.tipo === tipo) prev.texto += '. ' + x;
    else out.push({ texto: x, tipo });
  });
  if (out.length > 3) return [{ texto: t, tipo: anTipo(t) }];
  return out.map(p => anConDatos(p));
}
function anConDatos(p) {
  const hoy = fmt.hoy();
  const f = anFechas(p.texto);
  return { ...p, desde: f ? f.desde : hoy, hasta: f ? f.hasta : hoy, revisar: anSumar(hoy, 7), para: anSumar(hoy, 2) };
}
// Título corto de una parte (lo que se ve en el historial y en la tarea).
const anCorto = (t, n = 80) => { t = String(t || '').replace(/^(me (dijo|cont[oó]|escribi[oó]|coment[oó]) que|dice que|que)\s+/i, '').trim(); t = t.charAt(0).toUpperCase() + t.slice(1); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

// ── La cajita ─────────────────────────────────────────────────────────────
window.anAbrir = async (clienteId = null, { texto = '', tipo = null } = {}) => {
  let clientes = [];
  try { clientes = (await db.clientes.list()).filter(c => String(c.estado || 'activo').toLowerCase() === 'activo'); } catch (e) { /* sin clientes */ }
  const id = clienteId || (typeof _sa !== 'undefined' && _sa.cliente && _currentView === 'seguimiento' ? _sa.cliente.id : null);
  _an.cliente = id ? (clientes.find(c => String(c.id) === String(id)) || await db.clientes.get(id).catch(() => null)) : null;
  _an.clientes = clientes.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
  _an.tipoFijo = tipo;
  _an.partes = [];
  const nom = _an.cliente ? escapeHtml(String(_an.cliente.nombre).split(' ')[0]) : '';
  openModal(modalShell(`Anotar${nom ? ' · ' + nom : ''}`, `
    <div data-an-caja>
      ${_an.cliente ? '' : `<label class="text-xs font-semibold text-slate-500">Cliente</label>
        <select id="an-cliente" class="mt-1 mb-2" style="width:100%" onchange="anElegir(this.value)"><option value="">Elige el cliente…</option>${_an.clientes.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('')}</select>`}
      <textarea id="an-texto" rows="4" style="width:100%" placeholder="Escribe como hablas: «me dijo que se va de viaje del 12 al 20 y que la rodilla sigue molestando»" oninput="anEscribiendo()" onkeydown="if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();anGuardar()}">${escapeHtml(texto)}</textarea>
      <div id="an-partes" data-an-partes></div>
      <label class="an-resp"><input type="checkbox" id="an-respondi" ${tipo === 'conversacion' ? '' : 'checked'}> Ya le respondí</label>
      <p class="text-xs text-slate-500 mt-1">Cuenta como toque. Si todavía no le respondes, queda en rojo en Toques hasta que le escribas. Ctrl + Enter guarda.</p>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" data-an-guardar ${tipo === 'conversacion' ? 'data-tq-wa-ok' : ''} onclick="anGuardar()">Guardar</button>`));
  anPintarPartes(true);
  setTimeout(() => document.getElementById(_an.cliente ? 'an-texto' : 'an-cliente')?.focus(), 60);
};
window.anElegir = async (id) => {
  _an.cliente = _an.clientes.find(c => String(c.id) === String(id)) || null;
};
window.anEscribiendo = () => { clearTimeout(_an.timer); _an.timer = setTimeout(() => anPintarPartes(true), 250); };
function anPintarPartes(recalcular = false) {
  const caja = document.getElementById('an-partes');
  if (!caja) return;
  const texto = document.getElementById('an-texto')?.value || '';
  if (recalcular) {
    const nuevas = anSeparar(texto);
    // Lo que ya cambiaste a mano en una parte (tipo, fechas) se respeta.
    _an.partes = nuevas.map((p, i) => { const v = _an.partes[i]; return v && v.manual ? { ...p, tipo: v.tipo, desde: v.desde, hasta: v.hasta, revisar: v.revisar, para: v.para, manual: true } : p; });
    if (_an.tipoFijo && _an.partes.length === 1 && !_an.partes[0].manual) _an.partes[0].tipo = _an.tipoFijo;
  }
  if (!_an.partes.length) { caja.innerHTML = _an.tipoFijo === 'conversacion' ? '<p class="text-xs text-slate-500 mt-2">Sin texto, queda solo que te escribió hoy por WhatsApp.</p>' : ''; return; }
  caja.innerHTML = `<div class="an-sep">${_an.partes.length > 1 ? `El CRM lo separó en ${_an.partes.length}. ` : ''}Toca para cambiar el tipo:</div>` + _an.partes.map((p, i) => {
    const t = AN_T[p.tipo];
    const extra = p.tipo === 'viaje' ? `<div class="an-ext">Del <input type="date" value="${p.desde}" onchange="anCampo(${i},'desde',this.value)"> al <input type="date" value="${p.hasta}" onchange="anCampo(${i},'hasta',this.value)"><span>La pongo en pausa esos días.</span></div>`
      : p.tipo === 'salud' ? `<div class="an-ext">Revisar el <input type="date" value="${p.revisar}" onchange="anCampo(${i},'revisar',this.value)"><span>Queda abierto y sale en Hoy ese día.</span></div>`
      : p.tipo === 'pendiente' ? `<div class="an-ext">Para el <input type="date" value="${p.para}" onchange="anCampo(${i},'para',this.value)"><span>Va a tus tareas.</span></div>`
      : p.tipo === 'fijo' ? '<div class="an-ext"><span>Queda arriba de su Seguimiento para siempre.</span></div>'
      : '<div class="an-ext"><span>Queda en su historial.</span></div>';
    return `<div class="an-parte" data-an-parte="${i}" data-an-tipo="${p.tipo}"><div class="an-pt"><b style="color:${t[4]}">${t[1]}</b> · ${escapeHtml(anCorto(p.texto, 70))}</div>
      <div class="an-chips">${AN_TIPOS.map(x => `<button type="button" class="an-chip${x[0] === p.tipo ? ' on' : ''}" data-an-chip="${x[0]}" onclick="anCambiar(${i},'${x[0]}')">${x[1]}</button>`).join('')}</div>${extra}</div>`;
  }).join('');
}
window.anCambiar = (i, tipo) => { const p = _an.partes[i]; if (!p) return; p.tipo = tipo; p.manual = true; anPintarPartes(); };
window.anCampo = (i, k, v) => { const p = _an.partes[i]; if (!p) return; p[k] = v; p.manual = true; };

// ── Guardar ───────────────────────────────────────────────────────────────
// Inserta y devuelve el id (o null si no se pudo: la nota igual se guarda).
async function anIns(tabla, fila) {
  try { const { data, error } = await sb.from(tabla).insert(fila).select('id'); if (error) return null; const x = Array.isArray(data) ? data[0] : data; return x && x.id ? x.id : null; } catch (e) { return null; }
}
// Cuenta como «hablamos»: te escribió y le respondiste (en ese orden).
async function anHablamos(clienteId, respondi = true) {
  const hoy = fmt.hoy(), t = Date.now();
  try {
    await sb.from('toques_cliente').insert([
      { cliente_id: clienteId, tipo: 'me_escribio', fecha: hoy, created_at: new Date(t - 1000).toISOString() },
      ...(respondi ? [{ cliente_id: clienteId, tipo: 'le_escribi_wa', fecha: hoy, created_at: new Date(t).toISOString() }] : []),
    ]);
  } catch (e) { /* sin tabla de toques: igual queda la nota */ }
  if (typeof _tq !== 'undefined') _tq.datos = null;
}
window.anGuardar = async () => {
  const c = _an.cliente;
  if (!c) { toast('Elige el cliente'); document.getElementById('an-cliente')?.focus(); return; }
  const texto = (document.getElementById('an-texto')?.value || '').trim();
  if (!texto && _an.tipoFijo !== 'conversacion') { toast('Escribe lo que te dijo'); document.getElementById('an-texto')?.focus(); return; }
  const btn = document.querySelector('[data-an-guardar]'); if (btn) btn.disabled = true;
  const hoy = fmt.hoy(), nombre = String(c.nombre || '').split(' ')[0];
  let fallo = false;
  for (const p of (texto ? _an.partes.length ? _an.partes : anSeparar(texto) : [])) {
    const fila = { cliente_id: c.id, fecha: hoy, texto: p.texto, tipo: p.tipo, estado: p.tipo === 'salud' || p.tipo === 'fijo' ? 'abierto' : 'cerrado' };
    if (p.tipo === 'viaje') {
      if (p.hasta < p.desde) { toast('Revisa las fechas del viaje'); if (btn) btn.disabled = false; return; }
      Object.assign(fila, { desde: p.desde, hasta: p.hasta });
      const r = await anIns('ausencias', { cliente_id: c.id, desde: p.desde, hasta: p.hasta, motivo: /viaj|vacacion|paseo|boda|congreso/i.test(p.texto) ? 'viaje' : 'otro', nota: anCorto(p.texto, 300), origen: 'coach', vista_en: new Date().toISOString() });
      if (r) fila.ausencia_id = r;
    }
    if (p.tipo === 'salud' || p.tipo === 'pendiente') {
      const desc = p.tipo === 'salud' ? `Revisar cómo sigue ${nombre}: ${anCorto(p.texto, 140).replace(/^./, x => x.toLowerCase())}` : anCorto(p.texto, 200);
      const fecha = p.tipo === 'salud' ? p.revisar : p.para;
      if (p.tipo === 'salud') fila.revisar_en = p.revisar;
      const r = await anIns('pendientes', { cliente_id: c.id, para: 'coach', scope: 'general', descripcion: desc, fecha_limite: fecha || null, prioridad: p.tipo === 'salud' ? 'alta' : 'media', estado: 'abierto' });
      if (r) fila.tarea_id = r;
    }
    const { error } = await sb.from('notas_cliente').insert(fila);
    if (error) { fallo = true; if (/notas_cliente|relation|schema cache/i.test(error.message || '')) _an.sinTabla = true; }
  }
  await anHablamos(c.id, !!document.getElementById('an-respondi')?.checked);
  if (btn) btn.disabled = false;
  if (fallo) { toast(_an.sinTabla ? 'Falta correr migraciones/notas-cliente.sql en Supabase (lo demás sí quedó)' : 'No pude guardar la nota'); return; }
  closeModal();
  toast(texto ? `Anotado · ${nombre}` : `Listo: ${nombre} te escribió hoy`);
  delete _an.notas[c.id];
  try { if (typeof ausCargar === 'function') await ausCargar(true); } catch (e) { /* nada */ }
  if (typeof invalidarCache === 'function') invalidarCache('pendientes');
  if (typeof _cpr !== 'undefined') _cpr.datos = null;
  if (['toques', 'hoy', 'seguimiento', 'bandeja'].includes(_currentView)) rerenderView();
};

// ── En su Seguimiento: lo abierto, lo fijo y el historial ────────────────
async function anLeer(clienteId, forzar = false) {
  if (!forzar && _an.notas[clienteId]) return _an.notas[clienteId];
  const { data, error } = await sb.from('notas_cliente').select('*').eq('cliente_id', clienteId).order('created_at', { ascending: false }).limit(60);
  if (error) { _an.sinTabla = /notas_cliente|relation|schema cache/i.test(error.message || ''); return null; }
  _an.notas[clienteId] = data || [];
  return _an.notas[clienteId];
}
window.anCerrar = async (id, clienteId) => {
  const notas = _an.notas[clienteId] || [];
  const n = notas.find(x => x.id === id);
  const { error } = await sb.from('notas_cliente').update({ estado: 'cerrado', cerrado_en: new Date().toISOString() }).eq('id', id);
  if (error) return toast('No pude cerrarlo');
  if (n && n.tarea_id) await sb.from('pendientes').update({ estado: 'completado', completado_en: fmt.hoy() }).eq('id', n.tarea_id).then(() => {}, () => {});
  if (typeof invalidarCache === 'function') invalidarCache('pendientes');
  toast(n && n.tipo === 'fijo' ? 'Quitado de lo que siempre hay que saber' : 'Cerrado');
  delete _an.notas[clienteId];
  const c = typeof _sa !== 'undefined' ? _sa.cliente : null;
  if (c && String(c.id) === String(clienteId)) anPintarSeguimiento(c);
};
function anHTML(c, notas) {
  const hoy = fmt.hoy(), nom = escapeHtml(String(c.nombre || '').split(' ')[0]);
  const ico = (t) => { const x = AN_T[t] || AN_T.conversacion; return `<i class="an-ico" style="background:${x[3]};color:${x[4]}">${x[2]}</i>`; };
  const tag = (t) => { const x = AN_T[t] || AN_T.conversacion; return `<span class="an-tag" style="background:${x[3]};color:${x[4]}">${x[1]}</span>`; };
  const abiertos = notas.filter(n => (n.tipo === 'salud' && n.estado === 'abierto') || (n.tipo === 'viaje' && n.hasta && n.hasta >= hoy));
  const fijos = notas.filter(n => n.tipo === 'fijo' && n.estado === 'abierto');
  const linea = (n) => n.tipo === 'viaje'
    ? `<div class="an-fila">${ico('viaje')}<div><b>${escapeHtml(anCorto(n.texto))}</b><div class="an-sub">${n.desde <= hoy ? 'En pausa hasta el ' + anCorta(n.hasta) : `Del ${anCorta(n.desde)} al ${anCorta(n.hasta)}`}: esos días no cuentan en su adherencia ni en las alertas.</div></div></div>`
    : `<div class="an-fila">${ico('salud')}<div><b>${escapeHtml(anCorto(n.texto))}</b><div class="an-sub">Anotado el ${anCorta(n.fecha)}${n.revisar_en ? ` · revisar el ${anCorta(n.revisar_en)}${n.revisar_en <= hoy ? ' (hoy o ya pasó)' : ''}` : ''}</div></div><button type="button" class="an-btn" data-an-cerrar="${n.id}" onclick="anCerrar('${n.id}','${c.id}')">Ya está bien</button></div>`;
  return `<div class="an-card" data-an-seg>
    <div class="an-h"><b>Lo que te ha dicho ${nom}</b><button type="button" class="btn btn-primary btn-sm" data-an-abrir onclick="anAbrir('${c.id}')">Anotar</button></div>
    ${abiertos.length ? `<div class="an-k">Sigue abierto</div>${abiertos.map(linea).join('')}` : ''}
    ${fijos.length ? `<div class="an-k">Siempre hay que saber</div><div class="an-fijos">${fijos.map(n => `<span class="an-fijo">${escapeHtml(anCorto(n.texto, 90))}<button type="button" title="Ya no aplica" onclick="anCerrar('${n.id}','${c.id}')">×</button></span>`).join('')}</div>` : ''}
    ${notas.length ? `<details class="an-hist"${abiertos.length || fijos.length ? '' : ' open'}><summary>Historial · ${notas.length}</summary>${notas.slice(0, 15).map(n => `<div class="an-hi"><span>${anCorta(n.fecha)}</span>${tag(n.tipo)} «${escapeHtml(anCorto(n.texto, 160))}»${n.estado === 'cerrado' && n.tipo === 'salud' ? ' <em>· cerrado</em>' : ''}</div>`).join('')}</details>`
      : '<div class="an-sub" style="margin-top:6px">Todavía no has anotado nada. Lo que te diga por WhatsApp o en persona (viajes, molestias, lo que quedaste en hacer), anótalo aquí y lo verás en su próximo seguimiento.</div>'}
  </div>`;
}
async function anPintarSeguimiento(c) {
  const caja = document.getElementById('seg-semana');
  if (!caja || !c) return;
  const notas = await anLeer(c.id);
  if (!document.getElementById('seg-semana') || (typeof _sa !== 'undefined' && _sa.cliente && String(_sa.cliente.id) !== String(c.id))) return;
  const div = document.createElement('div');
  div.innerHTML = notas === null
    ? (_an.sinTabla ? `<div class="an-card" data-an-seg><div class="an-h"><b>Lo que te ha dicho</b><button type="button" class="btn btn-primary btn-sm" data-an-abrir onclick="anAbrir('${c.id}')">Anotar</button></div><div class="an-sub">Para guardar lo que anotas, corre <code>migraciones/notas-cliente.sql</code> en Supabase.</div></div>` : '')
    : anHTML(c, notas);
  const nuevo = div.firstElementChild;
  const viejo = caja.querySelector('[data-an-seg]');
  if (!nuevo) { if (viejo) viejo.remove(); return; }
  if (viejo) { viejo.replaceWith(nuevo); return; }
  const ancla = caja.querySelector('[data-aus-seg]') || caja.querySelector('[data-sa-barra]');
  if (ancla) ancla.before(nuevo); else caja.prepend(nuevo);
}
window.anPintarSeguimiento = anPintarSeguimiento;

(function () {
  // En el Seguimiento, después de pintar lo demás.
  if (typeof window.saPintar === 'function') {
    const base = window.saPintar;
    window.saPintar = async (c, S, D) => { const r = await base(c, S, D); anPintarSeguimiento(c); return r; };
  }
  // La casilla «Te escribió por WhatsApp» de Toques abre la cajita.
  window.tqWaCelda = (id) => anAbrir(id, { tipo: 'conversacion' });
  // El botón «+ Anotar», siempre a mano (también en el teléfono).
  const fab = document.createElement('button');
  fab.type = 'button'; fab.className = 'an-fab'; fab.dataset.anFab = '';
  fab.textContent = '+ Anotar';
  fab.addEventListener('click', () => anAbrir());
  const poner = () => { if (document.getElementById('app-screen') && !document.querySelector('[data-an-fab]')) document.body.appendChild(fab); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poner); else poner();
  const s = document.createElement('style');
  s.textContent = `
  .an-fab{position:fixed;right:18px;bottom:22px;z-index:45;border:0;border-radius:999px;padding:12px 18px;font:inherit;font-size:14px;font-weight:800;background:#F2C94C;color:#1F1F1F;box-shadow:0 10px 24px rgba(0,0,0,.18);cursor:pointer}
  #app-screen.hidden ~ .an-fab{display:none}
  .an-resp{display:flex!important;align-items:center;gap:6px;font-size:13px!important;font-weight:600;margin-top:10px;color:#1F1F1F!important;text-transform:none!important;letter-spacing:0!important}
  .an-resp input{width:auto!important}
  .an-sep{font-size:12.5px;color:#6B6B70;margin:10px 0 6px}
  .an-parte{background:#F7F6F2;border-radius:14px;padding:10px 12px;margin-bottom:8px}
  .an-pt{font-size:13.5px;color:#1F1F1F;margin-bottom:6px}
  .an-chips{display:flex;flex-wrap:wrap;gap:4px}
  .an-chip{border:0;border-radius:999px;padding:4px 10px;font:inherit;font-size:12px;font-weight:700;background:#ECE9E1;color:#55565B;cursor:pointer}
  .an-chip.on{background:#1F1F1F;color:#fff}
  .an-ext{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:7px;font-size:12.5px;color:#55565B}
  .an-ext input{font:inherit;font-size:12.5px!important;padding:3px 6px!important;border:1px solid #E4E0D8;border-radius:8px;background:#fff!important;width:auto!important;display:inline-block!important;min-height:0!important;height:30px!important}
  .an-ext span{color:#7A7A7A}
  .an-card{background:#fff;border-radius:20px;padding:14px 16px;box-shadow:0 1px 2px rgba(40,40,30,.04),0 8px 22px rgba(60,60,40,.06);margin-bottom:10px}
  .an-h{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px}
  .an-h b{font-size:16px}
  .an-k{font-size:12px;font-weight:800;color:#8A8A8A;margin:10px 0 4px}
  .an-fila{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid #F1EEE8}
  .an-fila>div{flex:1;min-width:0;font-size:14px}
  .an-ico{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;font-style:normal;font-weight:800;font-size:12px;flex:none}
  .an-sub{font-size:12.5px;color:#7A7A7A;margin-top:2px}
  .an-btn{border:0;border-radius:999px;padding:5px 12px;font:inherit;font-size:12.5px;font-weight:700;background:#F1EFE9;color:#1F1F1F;cursor:pointer;white-space:nowrap}
  .an-fijos{display:flex;flex-wrap:wrap;gap:6px}
  .an-fijo{display:inline-flex;align-items:center;gap:6px;font-size:13px;background:#F7F6F2;border-radius:999px;padding:4px 6px 4px 12px}
  .an-fijo button{border:0;background:#ECE9E1;border-radius:50%;width:20px;height:20px;cursor:pointer;color:#55565B;font-size:13px;line-height:1}
  .an-hist{margin-top:10px;font-size:13px}
  .an-hist summary{cursor:pointer;font-weight:700;color:#1F1F1F}
  .an-hi{padding:5px 0;color:#1F1F1F;line-height:1.45}
  .an-hi span{display:inline-block;width:52px;color:#8A8A8A}
  .an-hi em{color:#8A8A8A;font-style:normal}
  .an-tag{display:inline-block;font-size:11px;font-weight:700;border-radius:999px;padding:1px 7px;margin-right:4px}
  @media (max-width:760px){.an-fab{bottom:calc(84px + env(safe-area-inset-bottom, 0px));right:14px}}`;
  document.head.appendChild(s);
})();
