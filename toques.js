// =====================================================
// CRM EntrenaConMétodo · TOQUES DE LA SEMANA
// =====================================================
// Una fila por cliente activo: en qué días de la semana lo tocaste (un día
// con contacto = 1 toque, sin contar doble) y cómo, si ya tiene el
// seguimiento semanal, sus videos, si te escribió y si le respondiste, y
// cómo va (entrenos, app). Arriba, lo que falta en la semana. Para no
// enfriar a nadie ni saturar a nadie:
//   · «Le debes respuesta» → te escribió después de tu último toque.
//   · «Frío»               → 15 días o más sin ningún toque tuyo.
//   · «Enfriándose» (8 a 14 días), «Mucho» (4 días o más con toque en los
//     últimos 7), «Bien».
//   Semáforo: rojo, amarillo, verde y gris (en pausa).
//
// Lo que se lee solo: seguimiento_mensajes (lo que copias o envías desde el
// CRM), videos_tecnica (pedidos y llegados), notas_entreno y las notas al
// terminar una rutina (te escribió en la app), respuestas_coach y
// comentarios_coach (le respondiste). Lo que el CRM no puede ver solo va en
// `toques_cliente` (migraciones/toques-cliente.sql):
//   · abrir su WhatsApp desde cualquier parte del CRM → «Le escribí»;
//   · el botón «Me escribió» cuando te escribe por WhatsApp.
// Más adelante (B): la API de WhatsApp Business lo registraría sola.
//
// Va DESPUÉS de crm-prueba.js (usa cpSeguimiento) y de videos-tecnica.js.
// =====================================================

const _tq = { tel: null, hoyYa: new Set(), sinTabla: false, filtro: 'todos', datos: null };
// Semáforo: rojo (le debes respuesta, o frío: 15 días o más sin un toque
// tuyo), amarillo (8 a 14 días sin toque, o 4 días o más con toque en los
// últimos 7: mejor esperar), verde (bien), gris (en pausa).
const TQ_TONO = {
  debe: ['rojo', 'Le debes respuesta'],
  frio: ['rojo', 'Frío'],
  enfria: ['amarillo', 'Enfriándose'],
  mucho: ['amarillo', 'Mucho'],
  bien: ['verde', 'Bien'],
  pausa: ['gris', 'En pausa'],
};
const TQ_COLOR = { rojo: ['#D9483B', '#FBE3DE', '#B2402B'], amarillo: ['#F2C94C', '#FDF3D6', '#8A6410'], verde: ['#46965A', '#E4F1E7', '#2F7F45'], gris: ['#B9B6AF', '#EEF0F3', '#5A5A5F'] };
const TQ_ORDEN = { debe: 0, frio: 1, enfria: 2, mucho: 3, bien: 4, pausa: 5 };
const TQ_FRIO = 15, TQ_ENFRIA = 8;
const tqLunes = (f) => { const t = new Date(f + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.toISOString().slice(0, 10); };
const tqEntre = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
const tqDia = (v) => String(v || '').slice(0, 10);

// ── Registrar (sin tabla: no falla, solo avisa en la vista) ───────────────
async function tqRegistrar(clienteId, tipo) {
  if (!clienteId || _tq.sinTabla) return false;
  const hoy = fmt.hoy();
  const clave = `${clienteId}:${tipo}:${hoy}`;
  if (tipo === 'le_escribi_wa' && _tq.hoyYa.has(clave)) return true;   // abrirlo dos veces el mismo día cuenta una
  try {
    const { error } = await sb.from('toques_cliente').insert({ cliente_id: clienteId, tipo, fecha: hoy, created_at: new Date().toISOString() });
    if (error) { if (/toques_cliente|relation|schema cache/i.test(error.message || '')) _tq.sinTabla = true; return false; }
    _tq.hoyYa.add(clave); _tq.datos = null;
    return true;
  } catch (e) { return false; }
}

// Abrir WhatsApp desde CUALQUIER parte del CRM (enlaces wa.me y window.open)
// queda como «Le escribí», buscando al cliente por su teléfono.
async function tqTelefonos() {
  if (_tq.tel) return _tq.tel;
  const m = new Map();
  try { (await db.clientes.list()).forEach(c => { const d = String(c.telefono || '').replace(/\D/g, ''); if (d.length >= 7) { m.set(d, c.id); m.set(d.slice(-10), c.id); } }); } catch (e) { /* sin clientes */ }
  _tq.tel = m;
  return m;
}
async function tqDesdeEnlace(url) {
  const r = String(url || '').match(/wa\.me\/(\d{7,})/);
  if (!r) return;
  const tel = await tqTelefonos();
  const id = tel.get(r[1]) || tel.get(r[1].slice(-10));
  if (id) tqRegistrar(id, 'le_escribi_wa');
}
(function () {
  const abrir = window.open;
  window.open = function (u, ...resto) { try { if (/wa\.me\//.test(String(u))) tqDesdeEnlace(u); } catch (e) { /* nada */ } return abrir.call(window, u, ...resto); };
  document.addEventListener('click', (ev) => { const a = ev.target && ev.target.closest && ev.target.closest('a[href*="wa.me/"]'); if (a) tqDesdeEnlace(a.href); }, true);
})();

// ── Datos de la semana ───────────────────────────────────────────────────
// Un TOQUE es un DÍA en que le escribiste o le enviaste algo (seguimiento,
// pedirle video, responder su nota, abrir su WhatsApp desde el CRM). Si el
// mismo día copias el seguimiento y abres su WhatsApp, cuenta 1, no 2.
const TQ_DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
async function tqDatos(forzar = false) {
  if (!forzar && _tq.datos) return _tq.datos;
  const hoy = fmt.hoy(), lunes = tqLunes(hoy), desde = evtSumarDias(hoy, -30), hace7 = evtSumarDias(hoy, -6);
  const leer = async (q) => { try { const { data, error } = await q; return error ? null : (data || []); } catch (e) { return null; } };
  const [msj, vids, notas, ses, resp, com, toq] = await Promise.all([
    leer(sb.from('seguimiento_mensajes').select('cliente_id, fecha, origen, created_at').gte('fecha', desde)),
    leer(sb.from('videos_tecnica').select('cliente_id, ejercicio_id, ejercicio_nombre, pedido_en, estado, revisado_en, created_at').gte('pedido_en', evtSumarDias(hoy, -120))),
    leer(sb.from('notas_entreno').select('cliente_id, fecha, created_at').gte('fecha', desde)),
    leer(sb.from('sesiones').select('cliente_id, fecha, estado, notas_cliente').gte('fecha', desde)),
    leer(sb.from('respuestas_coach').select('cliente_id, created_at').gte('created_at', desde)),
    leer(sb.from('comentarios_coach').select('cliente_id, creado_en').gte('creado_en', desde)),
    leer(sb.from('toques_cliente').select('cliente_id, fecha, tipo, created_at').gte('fecha', desde)),
  ]);
  _tq.sinTabla = toq === null;
  let eng = null;
  try { eng = typeof engDatos === 'function' ? await engDatos() : null; } catch (e) { eng = null; }
  try { if (typeof ausCargar === 'function') await ausCargar(); } catch (e) { /* sin tabla */ }
  const clientes = (await db.clientes.list()).filter(c => String(c.estado || 'activo').toLowerCase() === 'activo');
  const de = (l, id) => (l || []).filter(x => String(x.cliente_id) === String(id));
  const semana = (f) => !!f && f >= lunes && f <= hoy;
  const diasSemana = TQ_DIAS.map((_, k) => evtSumarDias(lunes, k));
  const filas = clientes.map(c => {
    const m = de(msj, c.id), v = de(vids, c.id), n = de(notas, c.id), s = de(ses, c.id), r = de(resp, c.id), cm = de(com, c.id), t = de(toq, c.id);
    const seg = m.filter(x => x.origen !== 'videos' && x.origen !== 'nota');
    const notaM = m.filter(x => x.origen === 'nota');
    const wa = t.filter(x => x.tipo === 'le_escribi_wa');
    const meWa = t.filter(x => x.tipo === 'me_escribio');
    const notasSes = s.filter(x => String(x.notas_cliente || '').trim());
    // Lo tuyo (los toques) y lo suyo (te escribió), con su tipo, el día y el
    // momento exacto cuando lo hay (para saber quién escribió último).
    const mom = (f, ts) => (ts ? new Date(ts).toISOString() : `${f}T00:00:00.000Z`);
    const tuyos = [
      ...seg.map(x => ['seguimiento', x.fecha, mom(x.fecha, x.created_at)]),
      ...v.map(x => ['video', x.pedido_en, mom(x.pedido_en, x.created_at)]),
      ...r.map(x => ['respuesta', tqDia(x.created_at), mom(0, x.created_at)]),
      ...cm.map(x => ['respuesta', tqDia(x.creado_en), mom(0, x.creado_en)]),
      ...notaM.map(x => ['respuesta', x.fecha, mom(x.fecha, x.created_at)]),
      ...wa.map(x => ['whatsapp', x.fecha, mom(x.fecha, x.created_at)]),
    ].filter(x => x[1]);
    const suyos = [
      ...n.map(x => ['app', x.fecha || tqDia(x.created_at), mom(x.fecha, x.created_at)]),
      ...notasSes.map(x => ['app', x.fecha, mom(x.fecha)]),
      ...meWa.map(x => ['whatsapp', x.fecha, mom(x.fecha, x.created_at)]),
    ].filter(x => x[1]);
    const ultDe = (l, i) => l.map(x => x[i]).sort().pop() || null;
    const ultTuyo = ultDe(tuyos, 1), ultSuyo = ultDe(suyos, 1), ultTuyoT = ultDe(tuyos, 2), ultSuyoT = ultDe(suyos, 2);
    const suyoUlt = suyos.slice().sort((a, b) => String(a[2]).localeCompare(String(b[2]))).pop() || null;
    // La semana, día por día: en qué días lo tocaste y en cuáles te escribió.
    const diasTuyos = new Set(tuyos.filter(x => semana(x[1])).map(x => x[1]));
    const diasSuyos = new Set(suyos.filter(x => semana(x[1])).map(x => x[1]));
    const tipos = ['seguimiento', 'video', 'respuesta', 'whatsapp'].filter(k => tuyos.some(x => x[0] === k && semana(x[1])));
    const segSemana = seg.filter(x => semana(x.fecha)).map(x => x.fecha).sort();
    // Videos: el último de cada ejercicio manda (pedido = por llegar,
    // recibido = por revisar, que es tarea tuya).
    const ultV = {};
    v.forEach(x => { const k = x.ejercicio_id || `n:${String(x.ejercicio_nombre || '').toLowerCase()}`; const u = ultV[k]; if (!u || String(x.pedido_en) > String(u.pedido_en) || (x.pedido_en === u.pedido_en && String(x.created_at) > String(u.created_at))) ultV[k] = x; });
    const vig = Object.values(ultV);
    const videos = { pedidosSemana: v.filter(x => semana(x.pedido_en)).length, porLlegar: vig.filter(x => x.estado === 'pedido').length, porRevisar: vig.filter(x => x.estado === 'recibido').length };
    const dias7 = new Set(tuyos.filter(x => x[1] >= hace7 && x[1] <= hoy).map(x => x[1])).size;
    const sinToque = ultTuyo ? tqEntre(ultTuyo, hoy) : null;
    const pausa = typeof ausHoy === 'function' ? ausHoy(c.id, hoy) : null;
    const e = eng ? eng.filas.find(f => f.c.id === c.id) : null;
    const debe = !!(ultSuyoT && (!ultTuyoT || ultSuyoT > ultTuyoT));
    let estado;
    if (pausa) estado = 'pausa';
    else if (debe) estado = 'debe';
    else if (sinToque === null || sinToque >= TQ_FRIO) estado = 'frio';
    else if (sinToque >= TQ_ENFRIA) estado = 'enfria';
    else if (dias7 >= 4) estado = 'mucho';
    else estado = 'bien';
    return {
      c, estado, debe, ultTuyo, ultSuyo, sinToque, tipos, videos,
      semana: diasSemana.map(d => ({ d, tuyo: diasTuyos.has(d), suyo: diasSuyos.has(d), futuro: d > hoy, hoy: d === hoy })),
      diasToque: diasTuyos.size, contacto: diasTuyos.size + diasSuyos.size > 0,
      seguimiento: segSemana[0] || null, suyoPor: suyoUlt ? suyoUlt[0] : null,
      entrenos: s.filter(x => x.estado === 'completada' && semana(x.fecha)).length,
      app: e ? e.sinActividad : undefined,
    };
  });
  filas.sort((a, b) => TQ_ORDEN[a.estado] - TQ_ORDEN[b.estado] || (b.sinToque ?? 99) - (a.sinToque ?? 99) || String(a.c.nombre).localeCompare(String(b.c.nombre)));
  _tq.datos = { hoy, lunes, filas };
  return _tq.datos;
}
window.tqFiltro = (k) => { _tq.filtro = k; rerenderView(); };

// ── Acciones de cada fila ────────────────────────────────────────────────
window.tqWhatsApp = async (id) => {
  const c = (_tq.datos && _tq.datos.filas.find(f => f.c.id === id) || {}).c || await db.clientes.get(id);
  const tel = String((c && c.telefono) || '').replace(/\D/g, '');
  if (!tel) return toast('No tiene teléfono guardado');
  window.open(`https://wa.me/${tel}`, '_blank', 'noopener');   // queda como «Le escribí» (arriba)
  setTimeout(() => { _tq.datos = null; if (_currentView === 'toques') rerenderView(); }, 700);
};
// «Responder»: si te escribió en la app, a la Bandeja (le llega en su app);
// si te escribió por WhatsApp, a su WhatsApp.
window.tqResponder = (id) => {
  const f = _tq.datos && _tq.datos.filas.find(x => x.c.id === id);
  if (f && f.suyoPor === 'app' && routes.bandeja) return navigate('bandeja');
  return tqWhatsApp(id);
};
window.tqMeEscribio = async (id) => {
  if (await tqRegistrar(id, 'me_escribio')) { toast('Listo: te escribió hoy'); rerenderView(); }
  else toast(_tq.sinTabla ? 'Falta correr migraciones/toques-cliente.sql en Supabase' : 'No pude guardarlo');
};
window.tqPedirVideo = async (id) => {
  if (typeof vtPedir !== 'function' || typeof vtDb === 'undefined') return cpSeguimiento(id);
  _vt.clienteId = id; _vt.caja = null;
  _vt.filas = (await vtDb.lista(id)) || [];
  vtPedir();
};
window.tqFiltro = (k) => { _tq.filtro = k; rerenderView(); };

// ── La vista: una fila por cliente ───────────────────────────────────────
function tqCuando(f, hoy) { if (!f) return 'nunca'; const d = tqEntre(f, hoy); return d === 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`; }
const TQ_FILTROS = [['todos', 'Todos'], ['rojo', 'Rojo'], ['amarillo', 'Amarillo'], ['verde', 'Verde'], ['gris', 'En pausa']];
// Lo que falta en la semana (también son filtros).
const TQ_FALTA = {
  sinSeg: (f) => f.estado !== 'pausa' && !f.seguimiento,
  sinContacto: (f) => f.estado !== 'pausa' && !f.contacto,
  revisar: (f) => f.videos.porRevisar > 0,
};
const TQ_TIPO = { seguimiento: 'Seguimiento', video: 'Video', respuesta: 'Respuesta', whatsapp: 'WhatsApp' };

routes.toques = async () => {
  cargando('Juntando los toques de la semana…');
  let D;
  try { D = await tqDatos(true); } catch (e) { D = { filas: [], hoy: fmt.hoy(), lunes: tqLunes(fmt.hoy()) }; console.warn('toques', e); }
  finCargando();
  const color = (f) => TQ_TONO[f.estado][0];
  const lista = TQ_FALTA[_tq.filtro] ? D.filas.filter(TQ_FALTA[_tq.filtro]) : _tq.filtro === 'todos' ? D.filas : D.filas.filter(f => color(f) === _tq.filtro);
  const activos = D.filas.filter(f => f.estado !== 'pausa');
  const conSeg = activos.filter(f => f.seguimiento).length;
  const semaforo = (f) => {
    const [k] = TQ_TONO[f.estado]; const [punto, bg, txt] = TQ_COLOR[k];
    const t = f.estado === 'frio' ? `Frío · ${f.sinToque === null ? 'nunca' : f.sinToque + ' días'}` : f.estado === 'enfria' ? `Enfriándose · ${f.sinToque} días` : f.estado === 'mucho' ? 'Mucho esta semana' : TQ_TONO[f.estado][1];
    return `<span class="tq-sem" style="background:${bg};color:${txt}"><i style="background:${punto}"></i>${t}</span>`;
  };
  // La semana en 7 días: lleno = lo tocaste ese día; anillo = te escribió.
  const tira = (f) => `<div class="tq-tira" data-tq-tira>${f.semana.map((x, k) => `<span class="tq-dia${x.tuyo ? ' t' : ''}${x.suyo ? ' s' : ''}${x.futuro ? ' f' : ''}${x.hoy ? ' h' : ''}" title="${fmt.fechaCorta(x.d)}${x.tuyo ? ' · lo tocaste' : ''}${x.suyo ? ' · te escribió' : ''}">${TQ_DIAS[k]}</span>`).join('')}</div>`;
  const dia = (f) => TQ_DIAS[(new Date(f + 'T12:00:00Z').getUTCDay() + 6) % 7];
  const celdaSeg = (f) => f.estado === 'pausa' ? '<span class="tq-cero">—</span>'
    : f.seguimiento ? `<span class="tq-ok">Hecho</span><div class="tq-sub">${['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][TQ_DIAS.indexOf(dia(f.seguimiento))]}</div>`
    : '<span class="tq-falta">Falta</span>';
  const celdaVid = (f) => {
    const l = [f.videos.porRevisar ? `<b>${f.videos.porRevisar} por revisar</b>` : '', f.videos.porLlegar ? `${f.videos.porLlegar} por llegar` : '', f.videos.pedidosSemana ? `<span class="tq-sub">${f.videos.pedidosSemana} pedido${f.videos.pedidosSemana === 1 ? '' : 's'} esta semana</span>` : ''].filter(Boolean);
    return l.length ? l.join('<br>') : '<span class="tq-cero">—</span>';
  };
  const celdaEscribio = (f) => !f.ultSuyo ? '<span class="tq-cero">—</span>'
    : f.debe ? `<span class="tq-rojo tq-nw">${tqCuando(f.ultSuyo, D.hoy).replace(/^h/, 'H')} · sin responder</span><div class="tq-sub">${f.suyoPor === 'app' ? 'en la app' : 'por WhatsApp'}</div>`
    : `${tqCuando(f.ultSuyo, D.hoy).replace(/^h/, 'H')}<div class="tq-sub">respondido</div>`;
  const app = (f) => f.app === undefined ? '' : `<div class="tq-sub">App: ${f.app === null ? 'nunca' : f.app === 0 ? 'hoy' : f.app === 1 ? 'ayer' : `hace ${f.app} días`}</div>`;
  const fila = (f) => `<tr data-tq-cliente="${f.c.id}" data-tq-estado="${f.estado}" data-tq-color="${color(f)}">
      <td class="lis-nom">${typeof entAvatar === 'function' ? entAvatar(f.c.nombre) : ''}<div><b>${escapeHtml(f.c.nombre)}</b><div class="tq-sub" data-tq-ultimo>Tu último toque: ${tqCuando(f.ultTuyo, D.hoy)}</div></div></td>
      <td>${semaforo(f)}</td>
      <td data-tq="semana">${tira(f)}<div class="tq-sub" data-tq-dias>${f.diasToque ? `<b>${f.diasToque}</b> de 7 días` : 'Sin tocarlo esta semana'}</div>${f.tipos.length ? `<div>${f.tipos.map(k => `<span class="tq-ch">${TQ_TIPO[k]}</span>`).join('')}</div>` : ''}</td>
      <td data-tq="seguimiento">${celdaSeg(f)}</td>
      <td data-tq="videos">${celdaVid(f)}</td>
      <td data-tq="escribio">${celdaEscribio(f)}</td>
      <td data-tq="su-semana"><span class="tq-nw">${f.entrenos} entreno${f.entrenos === 1 ? '' : 's'}</span>${app(f)}</td>
      <td><div class="tq-acc">
        ${f.debe ? `<button type="button" class="cp-btn" data-tq-responder onclick="tqResponder('${f.c.id}')">Responder</button>` : `<button type="button" class="cp-btn" onclick="cpSeguimiento('${f.c.id}')">Seguimiento</button>`}
        <button type="button" class="cp-btn s" onclick="tqPedirVideo('${f.c.id}')">Pedir video</button>
        <button type="button" class="cp-btn s" data-tq-wa onclick="tqWhatsApp('${f.c.id}')">WhatsApp</button>
        <button type="button" class="cp-btn s" data-tq-me-escribio onclick="tqMeEscribio('${f.c.id}')">Me escribió</button>
      </div></td></tr>`;
  const tarjeta = (k, n, titulo, sub) => `<button type="button" class="tq-falta-card${_tq.filtro === k ? ' on' : ''}" data-tq-filtro="${k}" onclick="tqFiltro('${_tq.filtro === k ? 'todos' : k}')"><b>${n}</b><span>${titulo}</span><small>${sub}</small></button>`;
  view.innerHTML = `
    <div class="mb-3"><h2 class="text-2xl font-bold text-slate-900">Toques de la semana</h2>
      <p class="text-sm text-slate-500">Semana del ${fmt.fechaCorta(D.lunes)} al ${fmt.fechaCorta(evtSumarDias(D.lunes, 6))}. Qué hiciste con cada cliente y qué te falta.</p></div>
    ${_tq.sinTabla ? `<div class="card mb-3 text-xs text-amber-900 bg-amber-50 border border-amber-200" data-tq-sin-tabla>Para registrar «Me escribió» y los WhatsApp que abres desde el CRM, corre <code>migraciones/toques-cliente.sql</code> en Supabase. Lo demás ya se ve.</div>` : ''}
    <div class="tq-faltas" data-tq-faltas>
      ${tarjeta('sinSeg', activos.length - conSeg, 'sin seguimiento esta semana', `${conSeg} de ${activos.length} hechos`)}
      ${tarjeta('sinContacto', activos.filter(TQ_FALTA.sinContacto).length, 'sin contacto esta semana', 'ni tú ni él escribieron')}
      ${tarjeta('revisar', D.filas.filter(TQ_FALTA.revisar).length, 'con videos por revisar', 'te llegaron y falta revisarlos')}
    </div>
    <div class="flex gap-1.5 flex-wrap" style="margin-bottom:10px" data-tq-chips>${TQ_FILTROS.map(([k, t]) => { const n = k === 'todos' ? D.filas.length : D.filas.filter(f => color(f) === k).length; return `<button type="button" class="chip ${_tq.filtro === k ? 'active' : ''}" data-tq-filtro="${k}" onclick="tqFiltro('${k}')">${k !== 'todos' ? `<i class="tq-punto" style="background:${TQ_COLOR[k][0]}"></i>` : ''}${t} · ${n}</button>`; }).join('')}</div>
    <div class="card lis-tabla-caja" data-tq-tabla>
      <table class="lis-tabla tq-tabla"><thead><tr><th class="lis-nom">Cliente</th><th>Semáforo</th><th>Tus toques esta semana</th><th>Seguimiento<br>semanal</th><th>Videos</th><th>Te escribió</th><th>Su semana</th><th></th></tr></thead>
      <tbody>${lista.map(fila).join('')}</tbody></table>
      ${lista.length ? '' : '<p class="text-sm text-slate-500" style="padding:0 16px 16px">Nadie en este filtro.</p>'}
    </div>
    <details class="tq-que mt-3" data-tq-leyenda open><summary>Qué cuenta en cada columna</summary>
      <div class="tq-que-g">
        <div><b>Tus toques</b>Un toque es un día en que le escribiste algo: seguimiento, pedirle video, responder su nota o abrir su WhatsApp desde el CRM. Si el mismo día haces dos cosas, cuenta 1. En la semana: <span class="tq-dia t">L</span> lo tocaste ese día, <span class="tq-dia s">L</span> te escribió.</div>
        <div><b>Seguimiento semanal</b>Hecho si esta semana le mandaste el seguimiento (lo copiaste desde el CRM o tocaste «Marcar seguimiento»).</div>
        <div><b>Te escribió</b>Una nota suya en la app, o tocaste «Me escribió» porque te escribió por WhatsApp. En rojo si todavía no le respondes; abrir su WhatsApp o responderle en la app cuenta como respuesta.</div>
        <div><b>Semáforo</b><b class="tq-r">Rojo</b>: le debes respuesta, o 15 días o más sin un toque tuyo. <b class="tq-a">Amarillo</b>: 8 a 14 días sin toque, o 4 días o más con toque en los últimos 7 (mejor esperar). <b class="tq-v">Verde</b>: bien.</div>
      </div>
    </details>`;
};

(function () {
  const s = document.createElement('style');
  s.textContent = `
  .tq-sem{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;border-radius:999px;padding:3px 10px 3px 7px;white-space:nowrap}
  .tq-sem i,.tq-punto{display:inline-block;width:10px;height:10px;border-radius:50%;flex:none}
  .tq-punto{margin-right:6px;vertical-align:-1px}
  .tq-cero{color:#C2BFB8}
  .tq-sub{font-size:11.5px;color:#7A7A7A;margin-top:2px}
  .tq-nw{white-space:nowrap}
  .tq-ok{font-weight:700;color:#2F7F45}
  .tq-falta{font-weight:700;color:#8A6410}
  .tq-rojo{font-weight:700;color:#B2402B}
  .tq-ch{display:inline-block;font-size:10.5px;font-weight:700;background:#F1EFE9;color:#555;border-radius:999px;padding:1px 7px;margin:3px 3px 0 0}
  .tq-tira{display:flex;gap:3px}
  .tq-dia{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;font-size:10px;font-weight:700;color:#9A978F;background:#F1EFE9;box-sizing:border-box}
  .tq-dia.t{background:#1F1F1F;color:#fff}
  .tq-dia.s{box-shadow:inset 0 0 0 2px #3C7BD6;color:#3C7BD6}
  .tq-dia.t.s{box-shadow:inset 0 0 0 2px #3C7BD6;color:#fff}
  .tq-dia.f{background:transparent;color:#CFCCC4}
  .tq-dia.h:not(.t){color:#1F1F1F}
  .tq-faltas{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px}
  .tq-falta-card{display:flex;flex-direction:column;align-items:flex-start;text-align:left;background:#fff;border:1.5px solid transparent;border-radius:14px;padding:10px 14px;cursor:pointer;font-family:inherit;color:#1F1F1F}
  .tq-falta-card b{font-size:22px;line-height:1.1}
  .tq-falta-card span{font-size:13px;font-weight:700}
  .tq-falta-card small{font-size:11.5px;color:#7A7A7A}
  .tq-falta-card.on{border-color:#1F1F1F}
  .tq-acc{display:grid;grid-template-columns:auto auto;gap:5px}
  .tq-acc .cp-btn{padding:6px 10px;font-size:12px;text-align:center}
  .tq-tabla{min-width:1020px}
  .tq-tabla td{min-width:0;vertical-align:middle;font-size:13.5px}
  .tq-tabla th{text-transform:none;letter-spacing:0;font-size:11.5px;line-height:1.2;vertical-align:bottom}
  .tq-tabla td.lis-nom{min-width:180px}
  .tq-tabla th,.tq-tabla td{padding-left:9px;padding-right:9px}
  .tq-tabla .tq-sem{font-size:11.5px}
  .tq-que{background:#fff;border-radius:14px;padding:10px 14px;font-size:12.5px;color:#555}
  .tq-que summary{cursor:pointer;font-weight:700;color:#1F1F1F}
  .tq-que-g{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:8px;line-height:1.45}
  .tq-que-g b{display:block;color:#1F1F1F;margin-bottom:2px}
  .tq-que-g .tq-dia,.tq-que-g b.tq-r,.tq-que-g b.tq-a,.tq-que-g b.tq-v{display:inline-grid;margin:0}
  .tq-que-g b.tq-r{display:inline;color:#B2402B}.tq-que-g b.tq-a{display:inline;color:#8A6410}.tq-que-g b.tq-v{display:inline;color:#2F7F45}
  @media (max-width:760px){.tq-faltas{grid-template-columns:1fr}.tq-que-g{grid-template-columns:1fr}}`;
  document.head.appendChild(s);
})();
