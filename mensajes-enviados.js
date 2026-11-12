// =====================================================
// Mensajes enviados · todo lo que le mandaste a cada cliente, en un lugar.
// =====================================================
// De dónde sale:
//   · respuestas_coach      → lo que le llegó a SU APP desde la Bandeja
//                             («A su app»): se ve si lo vio, y se puede
//                             retirar (deja de salirle) o editar.
//   · seguimiento_mensajes  → todo lo que registra el CRM al escribirle
//                             (seguimiento, mensajes, diálogos, pedir video,
//                             respuestas por WhatsApp o a su app).
//   · capsulas_pedidas      → las cápsulas que le enviaste con su pregunta.
//
// Lo de su app se puede RETIRAR: deja de salirle al abrir la app (el aviso
// que ya le llegó al teléfono no se puede borrar, pero al tocarlo ya no ve
// el mensaje). Lo de WhatsApp el CRM no lo puede borrar: «Abrir su chat» te
// lleva para eliminarlo allá; «Deshacer registro» lo quita de tus toques y
// de su historial. Nada se borra: queda marcado con retirado_en
// (migraciones/mensajes-retirar.sql).
// Carga DESPUÉS de app.js (y de crm-prueba.js, que arma la barra).

const _me = { canal: 'todos', dias: 30, q: '', datos: null };
const ME_SQL = 'migraciones/mensajes-retirar.sql';
const meNorm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

async function meCargar() {
  const desde = new Date(Date.now() - 90 * 86400000).toISOString();
  const leer = async (q) => { try { const { data, error } = await q; return error ? null : (data || []); } catch (e) { return null; } };
  const [clientes, rc, seg, caps] = await Promise.all([
    db.clientes.list().catch(() => []),
    leer(sb.from('respuestas_coach').select('*').gte('created_at', desde)),
    leer(sb.from('seguimiento_mensajes').select('*').gte('fecha', desde.slice(0, 10))),
    leer(sb.from('capsulas_pedidas').select('*').gte('enviada_en', desde)),
  ]);
  const porId = new Map((clientes || []).map(c => [String(c.id), c]));
  const items = [];
  // Su app (Bandeja → «A su app»).
  (rc || []).forEach(r => items.push({ fuente: 'rc', id: r.id, cliente: porId.get(String(r.cliente_id)), cliente_id: r.cliente_id, t: r.created_at, canal: 'app', tipo: r.contexto ? `Respuesta · ${r.contexto}` : 'Respuesta a su nota', texto: r.texto, visto: r.visto_en, retirado: r.retirado_en }));
  // Lo registrado. La respuesta a su app de la Bandeja ya está arriba (no se repite).
  // Se emparejan por cliente y momento (se registran en el mismo segundo), no por texto: así sigue igual aunque la edites.
  const cerca = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) < 180000;
  const parDe = (s) => (rc || []).find(r => String(r.cliente_id) === String(s.cliente_id) && s.created_at && r.created_at && cerca(s.created_at, r.created_at));
  const yaApp = (s) => !!parDe(s);
  const segDe = new Map();
  (seg || []).forEach(s => { if (/en su app/i.test(String(s.titulo || ''))) { const r = parDe(s); if (r) segDe.set(String(r.id), [...(segDe.get(String(r.id)) || []), s.id]); } });
  (seg || []).forEach(s => {
    const titulo = String(s.titulo || '');
    const app = /en su app/i.test(titulo);
    if (app && yaApp(s)) return;
    const canal = app ? 'app' : /solo guardado/i.test(titulo) ? 'guardado' : s.origen === 'manual' ? 'marcado' : 'whatsapp';
    items.push({ fuente: 'seg', id: s.id, cliente: porId.get(String(s.cliente_id)), cliente_id: s.cliente_id, t: s.created_at || `${s.fecha}T12:00:00Z`, canal, tipo: meTipo(s), texto: s.texto, retirado: s.retirado_en, appNota: app });
  });
  (caps || []).forEach(k => items.push({ fuente: 'cap', id: k.id, cliente: porId.get(String(k.cliente_id)), cliente_id: k.cliente_id, t: k.enviada_en, canal: 'whatsapp', tipo: 'Cápsula con pregunta', texto: `«${k.capsula_titulo || k.capsula_id}»${k.pregunta ? ` · Cuando la leas, cuéntame: ${k.pregunta}` : ''}`, retirado: k.retirado_en, extra: k.recordada_en ? `recordada ${meCuando(k.recordada_en)}` : '' }));
  items.sort((a, b) => String(b.t).localeCompare(String(a.t)));
  _me.datos = { items, sinRc: rc === null, segDe };
  return _me.datos;
}
function meTipo(s) {
  const t = String(s.titulo || ''), o = s.origen || '';
  if (o === 'nota') return /WhatsApp/i.test(t) ? 'Respuesta por WhatsApp' : 'Respuesta en su app';
  if (o === 'videos') return t || 'Pedir video';
  if (o === 'manual') return 'Seguimiento marcado hecho';
  if (o === 'seguimiento' || !o) return 'Seguimiento semanal';
  if (o === 'dialogo' || o === 'dialogos') return t ? t.replace(/^Diálogo · /, 'Diálogo · ') : 'Diálogo';
  return t || 'Mensaje';
}
function meCuando(ts) {
  if (!ts) return '';
  const d = new Date(ts); if (isNaN(d)) return String(ts).slice(0, 10);
  const hoy = fmt.hoy();
  const hh = d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (local === hoy) return `hoy ${hh}`;
  if (typeof evtSumarDias === 'function' && local === evtSumarDias(hoy, -1)) return `ayer ${hh}`;
  return `${fmt.fechaCorta(local)} ${hh}`;
}
const ME_CANAL = { app: ['Su app', '#E3EDFB', '#2F5FA6'], whatsapp: ['WhatsApp', '#E2F2E6', '#2F7F45'], guardado: ['Solo guardado', '#F1EFE9', '#555'], marcado: ['Marcado a mano', '#F1EFE9', '#555'] };

routes.mensajes = async () => {
  cargando('Juntando los mensajes que enviaste…');
  const D = await meCargar().catch(() => ({ items: [] }));
  finCargando();
  const lim = Date.now() - _me.dias * 86400000, q = meNorm(_me.q);
  const lista = D.items.filter(x => (_me.canal === 'todos' || x.canal === _me.canal) && Date.parse(x.t) >= lim && (!q || meNorm(x.cliente && x.cliente.nombre).includes(q) || meNorm(x.texto).includes(q)));
  const chip = (k, t, on) => `<button type="button" class="me-f${on ? ' on' : ''}" ${k}>${t}</button>`;
  const et = (txt, bg, col) => `<span class="me-e" style="background:${bg};color:${col}">${txt}</span>`;
  const fila = (x) => {
    const [cn, cbg, ccol] = ME_CANAL[x.canal];
    let estado = '', acc = '';
    const b = (t, osc, attr, fn) => `<button type="button" class="pp-b${osc ? ' o' : ''}" ${attr} onclick="${fn}">${t}</button>`;
    if (x.retirado) estado = et(x.canal === 'app' ? `Retirado ${meCuando(x.retirado)}` : `Registro deshecho ${meCuando(x.retirado)}`, '#FBE3E1', '#B3392F');
    else if (x.canal === 'app') {
      estado = x.fuente === 'rc' ? (x.visto ? et(`Lo vio ${meCuando(x.visto)}`, '#E3EDFB', '#2F5FA6') : et('Aún no lo ve', '#F1EFE9', '#555')) : et('En su app', '#E3EDFB', '#2F5FA6');
      acc = b('Retirar de su app', true, `data-me-retirar="${x.id}"`, `meRetirar('${x.fuente}','${x.id}')`) + (x.fuente === 'rc' ? b('Editar', false, `data-me-editar="${x.id}"`, `meEditar('${x.id}')`) : '');
    } else {
      estado = et(x.canal === 'whatsapp' ? 'Enviado por WhatsApp' : cn, '#F1EFE9', '#555');
      const tel = String((x.cliente && x.cliente.telefono) || '').replace(/\D/g, '');
      acc = (tel && x.canal === 'whatsapp' ? `<a class="pp-b" data-me-chat href="https://wa.me/${tel}" target="_blank" rel="noopener">Abrir su chat</a>` : '') + b('Deshacer registro', false, `data-me-deshacer="${x.id}"`, `meDeshacer('${x.fuente}','${x.id}')`);
    }
    return `<div class="me-row${x.retirado ? ' ret' : ''}" data-me-fila="${x.id}" data-me-canal="${x.canal}">
      <div><div class="me-t">${escapeHtml(meCuando(x.t))}</div><div class="me-s">${escapeHtml(x.tipo)}</div></div>
      <div><b>${escapeHtml((x.cliente && x.cliente.nombre) || 'Cliente')}</b><br>${et(cn, cbg, ccol)}</div>
      <div class="me-txt">${x.retirado ? `<del>${escapeHtml(x.texto || '')}</del>` : escapeHtml(x.texto || '')}${x.extra ? `<div class="me-s">${escapeHtml(x.extra)}</div>` : ''}</div>
      <div>${estado}</div>
      <div class="me-acc">${acc}</div>
    </div>`;
  };
  view.innerHTML = `
    <button type="button" class="me-volver" data-me-volver onclick="navigate('bandeja')">‹ Volver a Bandeja</button>
    <div class="mb-3"><h2 class="text-2xl font-bold text-slate-900">Historial de mensajes enviados</h2>
      <p class="text-sm text-slate-500">Todo lo que le mandaste a cada cliente. Lo de su app se puede retirar; lo de WhatsApp se borra en WhatsApp.</p></div>
    <div class="me-caja" data-me>
      <div class="me-fils">
        ${chip(`data-me-canal-f="todos" onclick="meFiltro('canal','todos')"`, 'Todos', _me.canal === 'todos')}
        ${chip(`data-me-canal-f="app" onclick="meFiltro('canal','app')"`, 'Su app', _me.canal === 'app')}
        ${chip(`data-me-canal-f="whatsapp" onclick="meFiltro('canal','whatsapp')"`, 'WhatsApp', _me.canal === 'whatsapp')}
        <span class="me-sep"></span>
        ${[7, 30, 90].map(d => chip(`data-me-dias="${d}" onclick="meFiltro('dias',${d})"`, `${d} días`, _me.dias === d)).join('')}
        <input class="me-q" data-me-q placeholder="Buscar cliente o texto…" value="${escapeHtml(_me.q)}" oninput="meBuscar(this.value)">
      </div>
      <div class="me-row me-h"><div>Cuándo</div><div>Cliente · canal</div><div>Mensaje</div><div>Estado</div><div></div></div>
      ${lista.length ? lista.slice(0, 300).map(fila).join('') : '<div class="me-vacio">No hay mensajes en este filtro.</div>'}
      ${lista.length > 300 ? `<div class="me-s" style="padding:10px 0">Se muestran los 300 más recientes de ${lista.length}.</div>` : ''}
      <div class="me-nota"><b>Retirar de su app:</b> deja de salirle al abrir la app. Si ya le llegó el aviso al teléfono, ese aviso no se puede borrar, pero al tocarlo ya no ve el mensaje.<br><b>WhatsApp:</b> el CRM no puede borrar lo que enviaste allá: «Abrir su chat» te lleva para que lo elimines con «Eliminar para todos» (WhatsApp lo permite por un tiempo limitado). «Deshacer registro» lo quita de tus toques y de su historial.</div>
    </div>`;
};
window.meFiltro = (k, v) => { _me[k] = v; rerenderView(); };
let _meT = null;
window.meBuscar = (v) => { _me.q = v; clearTimeout(_meT); _meT = setTimeout(async () => { await rerenderView(); const i = document.querySelector('[data-me-q]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 350); };

const meTabla = { rc: 'respuestas_coach', seg: 'seguimiento_mensajes', cap: 'capsulas_pedidas' };
async function meMarcar(fuente, id) {
  try {
    const { error } = await sb.from(meTabla[fuente]).update({ retirado_en: new Date().toISOString() }).eq('id', id);
    if (error) { toast(/retirado_en|column|schema cache/i.test(error.message || '') ? `Falta correr ${ME_SQL} en Supabase` : 'No pude guardarlo'); return false; }
    return true;
  } catch (e) { toast('No pude guardarlo'); return false; }
}
function meRefrescar() { if (typeof _tq !== 'undefined') { _tq.datos = null; _tq.leido = 0; } rerenderView(); }

window.meRetirar = async (fuente, id) => {
  const x = (_me.datos && _me.datos.items.find(i => i.fuente === fuente && String(i.id) === String(id))) || null;
  if (!x) return;
  if (!confirm(`¿Retirar este mensaje de la app de ${(x.cliente && x.cliente.nombre) || 'tu cliente'}? Deja de salirle al abrir la app.`)) return;
  // Lo de la prueba de CRM (respuesta «resp-» en sus notas): se quita de sus notas de la app.
  if (fuente === 'seg' && x.appNota && typeof resolverMealtrackerId === 'function' && typeof fetchRemindersMT === 'function') {
    const mtId = await resolverMealtrackerId(x.cliente).catch(() => null);
    if (mtId) {
      const r = await fetchRemindersMT(mtId).catch(() => ({ list: [] }));
      const lista = Array.isArray(r.list) ? r.list : [];
      const quedan = lista.filter(n => !(/^resp-/.test(String(n.id || '')) && String(n.text || '').trim() === String(x.texto || '').trim()));
      if (quedan.length !== lista.length && !(await saveRemindersMT(mtId, quedan))) { toast('No pude quitarlo de su app'); return; }
    }
  }
  if (!(await meMarcar(fuente, id))) return;
  // Su registro (el que cuenta como toque) también queda retirado.
  if (fuente === 'rc') for (const sid of (_me.datos.segDe && _me.datos.segDe.get(String(id))) || []) await meMarcar('seg', sid);
  toast('Retirado de su app');
  meRefrescar();
};
window.meDeshacer = async (fuente, id) => {
  if (!confirm('¿Deshacer el registro de este envío? Deja de contar como toque y sale tachado en el historial. (En WhatsApp sigue enviado: bórralo allá si hace falta.)')) return;
  if (!(await meMarcar(fuente, id))) return;
  toast('Registro deshecho');
  meRefrescar();
};
window.meEditar = async (id) => {
  const x = _me.datos && _me.datos.items.find(i => i.fuente === 'rc' && String(i.id) === String(id));
  if (!x) return;
  openModal(modalShell(`Editar mensaje · ${escapeHtml((x.cliente && x.cliente.nombre) || '')}`, `<div data-me-editar-modal>
    <p class="text-xs text-slate-500 mb-2">Le sale corregido en su app la próxima vez que la abra.</p>
    <textarea id="me-texto" class="input w-full" rows="4">${escapeHtml(x.texto || '')}</textarea>
  </div>`, `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" data-me-guardar onclick="meGuardarEdicion('${id}')">Guardar</button>`));
};
window.meGuardarEdicion = async (id) => {
  const t = (document.getElementById('me-texto')?.value || '').trim();
  if (!t) return toast('Escribe el mensaje');
  try {
    const { error } = await sb.from('respuestas_coach').update({ texto: t }).eq('id', id);
    if (error) { toast('No pude guardarlo'); return; }
  } catch (e) { toast('No pude guardarlo'); return; }
  closeModal();
  toast('Mensaje corregido');
  rerenderView();
};

// Se entra desde Bandeja → «Historial de mensajes enviados».
(function () {
  const s = document.createElement('style');
  s.textContent = `
  .me-volver{border:0;background:#F1EFE9;border-radius:999px;padding:6px 14px;font:inherit;font-size:13px;font-weight:700;margin-bottom:12px;cursor:pointer}
  .me-caja{background:#fff;border-radius:18px;padding:16px 18px;border:1px solid #EFEDE7}
  .me-fils{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
  .me-f{border:0;border-radius:999px;padding:6px 12px;background:#F1EFE9;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
  .me-f.on{background:#1F1F1F;color:#fff}
  .me-sep{width:1px;height:20px;background:#E6E3DB;margin:0 4px}
  .me-q{flex:1;min-width:180px;border:1px solid #E6E3DB;border-radius:999px;padding:6px 14px;font:inherit;font-size:13px}
  .me-row{display:grid;grid-template-columns:140px 160px minmax(0,1fr) 170px 210px;gap:14px;align-items:center;padding:11px 0;border-bottom:1px solid #F3F1EB;font-size:13.5px}
  .me-row.me-h{font-size:12px;font-weight:800;color:#8A8780;padding-top:4px}
  .me-row.ret{opacity:.75}
  .me-t{font-weight:700;color:#1F1F1F}
  .me-s{font-size:12px;color:#8A8780;margin-top:2px}
  .me-txt{line-height:1.38;color:#1F1F1F;white-space:pre-line;max-height:7.5em;overflow:hidden}
  .me-txt del{color:#9A978F}
  .me-e{display:inline-block;font-size:11.5px;font-weight:700;border-radius:999px;padding:2px 9px;margin-top:2px;white-space:nowrap}
  .me-acc{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
  .me-acc .pp-b{text-decoration:none;display:inline-flex;align-items:center}
  .me-vacio{padding:24px 0;color:#8A8780;text-align:center}
  .me-nota{margin-top:14px;font-size:13px;color:#6B6B6B;line-height:1.5;background:#FAF8F3;border-radius:12px;padding:12px 14px}
  @media (max-width: 900px){ .me-row{grid-template-columns:1fr 1fr} .me-row.me-h{display:none} .me-txt,.me-acc{grid-column:1 / -1} .me-acc{justify-content:flex-start} }`;
  document.head.appendChild(s);
})();
