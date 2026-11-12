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

const _tq = { tel: null, hoyYa: new Set(), sinTabla: false, filtro: 'todos', datos: null, atras: 0, orden: 'alfa', inicio: null, semCargadas: 0, buscar: '' };
// Buscar por nombre: filtra las filas de la tabla al escribir (sin recargar, sin perder el foco).
const tqNorm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
window.tqBuscar = (texto) => {
  _tq.buscar = String(texto || '');
  const q = tqNorm(_tq.buscar), filas = document.querySelectorAll('[data-tq-tabla] tr[data-tq-nombre]');
  let n = 0; filas.forEach(tr => { const si = !q || tr.dataset.tqNombre.includes(q); tr.style.display = si ? '' : 'none'; if (si) n++; });
  const aviso = document.querySelector('[data-tq-sin-coincidencia]'); if (aviso) aviso.hidden = !(q && filas.length && !n);
  const x = document.querySelector('[data-tq-buscar-borrar]'); if (x) x.hidden = !q;
};
try { const o = localStorage.getItem('crm:tqOrden'); if (o) _tq.orden = o; } catch (e) { /* sin almacenamiento */ }
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
// Lo que cuenta como «Seguimiento» (lo demás escrito desde el CRM es «Mensaje»).
const TQ_SEG_ORIGEN = new Set(['seguimiento', 'manual', 'esta-semana', null, undefined]);
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
// Lo leído de Supabase, una vez (2 min). Alcanza para 6 semanas de historial
// (y para saber si alguien estaba frío al cierre de una semana pasada).
async function tqCrudo(forzar = false) {
  // Las semanas que hacen falta: 6 (el historial de cada cliente) o, si estás
  // mirando una semana vieja, hasta esa y las 2 de antes (sus «Últimas 3»).
  const semanas = Math.max(6, (_tq.atras || 0) + 3);
  if (!forzar && _tq.crudo && _tq.datos && _tq.semCargadas >= semanas && Date.now() - (_tq.leido || 0) < 120000) return _tq.crudo;
  const hoy = fmt.hoy(), lunes = tqLunes(hoy), desde = evtSumarDias(lunes, -7 * semanas);
  _tq.semCargadas = semanas;
  const leer = async (q) => { try { const { data, error } = await q; return error ? null : (data || []); } catch (e) { return null; } };
  const [msj, vids, notas, ses, resp, com, toq, nhf, anot] = await Promise.all([
    leer(sb.from('seguimiento_mensajes').select('cliente_id, fecha, origen, created_at').gte('fecha', desde)),
    leer(sb.from('videos_tecnica').select('cliente_id, ejercicio_id, ejercicio_nombre, pedido_en, estado, revisado_en, created_at').gte('pedido_en', evtSumarDias(hoy, -160))),
    leer(sb.from('notas_entreno').select('id, cliente_id, fecha, created_at, leida_en').gte('fecha', desde)),
    leer(sb.from('sesiones').select('id, cliente_id, fecha, estado, notas_cliente').gte('fecha', desde)),
    leer(sb.from('respuestas_coach').select('cliente_id, created_at').gte('created_at', desde)),
    leer(sb.from('comentarios_coach').select('cliente_id, creado_en').gte('creado_en', desde)),
    leer(sb.from('toques_cliente').select('cliente_id, fecha, tipo, created_at').gte('fecha', desde)),
    leer(sb.from('toques_semana').select('cliente_id, lunes, motivo').gte('lunes', desde)),
    leer(sb.from('notas_cliente').select('cliente_id, fecha, texto, tipo').gte('fecha', desde)),
  ]);
  // Desde cuándo hay historial (una vez): el primer seguimiento o toque guardado.
  if (!_tq.inicio) {
    const primero = async (tabla) => { try { const { data } = await sb.from(tabla).select('fecha').order('fecha', { ascending: true }).limit(1); return data && data[0] ? tqDia(data[0].fecha) : null; } catch (e) { return null; } };
    const [a, b] = await Promise.all([primero('seguimiento_mensajes'), primero('toques_cliente')]);
    _tq.inicio = [a, b].filter(Boolean).sort()[0] || evtSumarDias(lunes, -42);
  }
  _tq.sinTabla = toq === null;
  _tq.sinTablaSemana = nhf === null;
  let eng = null;
  try { eng = typeof engDatos === 'function' ? await engDatos() : null; } catch (e) { eng = null; }
  try { if (typeof ausCargar === 'function') await ausCargar(); } catch (e) { /* sin tabla */ }
  const clientes = (await db.clientes.list()).filter(c => String(c.estado || 'activo').toLowerCase() === 'activo');
  // Pendientes por pedir (pendientes-pedir.js): fotos, medidas, peso y videos.
  try { if (typeof ppCargar === 'function') await ppCargar(clientes, vids); } catch (e) { console.warn('pendientes', e); }
  // Las cápsulas que le pediste leer (capsulas-toques.js).
  try { if (typeof capCargar === 'function') await capCargar(clientes); } catch (e) { console.warn('cápsulas', e); }
  // Lo que le has dicho por tema y lo marcado en «Qué tocar» (que-tocar.js).
  try { if (typeof qtCargar === 'function') await qtCargar(null, forzar); } catch (e) { console.warn('qué tocar', e); }
  // Videos que marcaste «Entregado y bien» (pendientes-pedir.js): cuenta como
  // toque, porque al recibirlo le diste la retro.
  const peds = (typeof _pp !== 'undefined' && _pp.crudo && _pp.crudo.pedidos) || [];
  const vEnt = peds.filter(p => p.tipo === 'video' && p.entregado_en && p.entregado_por === 'coach');
  // Fotos, peso o medidas pedidos («Pedir», «Ya lo pedí», «Recordar»): hubo
  // contacto ese día. No cuenta lo que marcaste entregado sin haberlo pedido.
  const yaPedi = peds.filter(p => p.tipo !== 'video' && p.pedido_en && !(p.entregado_en && p.entregado_en === p.pedido_en));
  const cps = (typeof _capt !== 'undefined' && _capt.pedidos) || [];
  _tq.crudo = { msj, vids, notas, ses, resp, com, toq, nhf, anot, eng, clientes, vEnt, yaPedi, cps };
  _tq.leido = Date.now();
  return _tq.crudo;
}
// La tabla tal como quedó al cierre del día `ref`: hoy, o el domingo de una
// semana pasada (solo cuenta lo que pasó hasta ese día).
function tqCalcular(R, ref) {
  const hoyReal = fmt.hoy(), hoy = ref, lunes = tqLunes(ref), hace7 = evtSumarDias(hoy, -6);
  const actual = lunes === tqLunes(hoyReal);
  const { eng, clientes } = R;
  const noHaceFalta = new Set((R.nhf || []).filter(x => x.lunes === lunes).map(x => String(x.cliente_id)));
  const hasta = (l, fn) => (l || []).filter(x => { const f = fn(x); return !!f && f <= hoy; });
  const msj = hasta(R.msj, x => x.fecha), notas = hasta(R.notas, x => x.fecha || tqDia(x.created_at)), ses = hasta(R.ses, x => x.fecha);
  const resp = hasta(R.resp, x => tqDia(x.created_at)), com = hasta(R.com, x => tqDia(x.creado_en)), toq = hasta(R.toq, x => x.fecha);
  const vEnt = hasta(R.vEnt, x => tqDia(x.entregado_en)), yaPedi = hasta(R.yaPedi, x => tqDia(x.pedido_en));
  // Cápsulas: enviarla, recordarla y su respuesta (cada momento, hasta ese día).
  const cps = (R.cps || []).flatMap(x => [x.enviada_en, x.recordada_en, x.respondio_en].filter(t => t && tqDia(t) <= hoy).map(t => ({ cliente_id: x.cliente_id, t })));
  // Los videos como estaban ese día: lo revisado después seguía pendiente.
  const vids = hasta(R.vids, x => x.pedido_en).map(x => (x.revisado_en && tqDia(x.revisado_en) > hoy ? { ...x, estado: 'pedido', revisado_en: null } : x));
  const de = (l, id) => (l || []).filter(x => String(x.cliente_id) === String(id));
  const semana = (f) => !!f && f >= lunes && f <= hoy;
  const diasSemana = TQ_DIAS.map((_, k) => evtSumarDias(lunes, k));
  let vistosBdj = new Set();
  try { vistosBdj = new Set(JSON.parse(localStorage.getItem('bdj:vistos:v1') || '[]')); } catch (e) { /* sin almacenamiento */ }
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
      ...seg.map(x => [TQ_SEG_ORIGEN.has(x.origen) ? 'seguimiento' : 'mensaje', x.fecha, mom(x.fecha, x.created_at)]),
      ...v.map(x => ['video', x.pedido_en, mom(x.pedido_en, x.created_at)]),
      // Retro de video: lo revisaste (bien / a mejorar) o lo marcaste «Entregado y bien».
      ...v.filter(x => x.revisado_en).map(x => ['retro', tqDia(x.revisado_en), mom(tqDia(x.revisado_en))]),
      ...de(vEnt, c.id).map(x => ['retro', tqDia(x.entregado_en), mom(0, x.entregado_en)]),
      ...de(yaPedi, c.id).map(x => ['pedido', tqDia(x.pedido_en), mom(0, x.pedido_en)]),
      ...de(cps, c.id).map(x => ['capsula', tqDia(x.t), mom(0, x.t)]),
      ...r.map(x => ['respuesta', tqDia(x.created_at), mom(0, x.created_at)]),
      ...cm.map(x => ['respuesta', tqDia(x.creado_en), mom(0, x.creado_en)]),
      ...notaM.map(x => ['respuesta', x.fecha, mom(x.fecha, x.created_at)]),
      ...wa.map(x => ['whatsapp', x.fecha, mom(x.fecha, x.created_at)]),
      // Lo que marcaste en «Qué tocar» («Ya lo dije yo», «Usar texto»).
      ...(typeof qtDe === 'function' ? hasta(qtDe(c.id).marcas, x => x.fecha) : []).map(x => ['dicho', x.fecha, mom(x.fecha, x.created_at)]),
    ].filter(x => x[1]);
    // Lo que ya marcaste «Listo» en la Bandeja (la nota leída en la base, o
    // marcada en este navegador) ya no se te debe: no cuenta para «Le debes
    // respuesta» (sí sigue contando como que te escribió).
    const listo = (x, id) => !!(x.leida_en || vistosBdj.has(id));
    const suyos = [
      ...n.map(x => ['app', x.fecha || tqDia(x.created_at), mom(x.fecha, x.created_at), listo(x, `nota:${x.id}`)]),
      ...notasSes.map(x => ['app', x.fecha, mom(x.fecha), listo(x, `cierre:${x.id}`)]),
      ...meWa.map(x => ['whatsapp', x.fecha, mom(x.fecha, x.created_at), false]),
    ].filter(x => x[1]);
    const suyosPend = suyos.filter(x => !x[3]);
    const ultDe = (l, i) => l.map(x => x[i]).sort().pop() || null;
    const ultTuyo = ultDe(tuyos, 1), ultSuyo = ultDe(suyos, 1), ultTuyoT = ultDe(tuyos, 2), ultSuyoT = ultDe(suyos, 2);
    const suyoUlt = suyos.slice().sort((a, b) => String(a[2]).localeCompare(String(b[2]))).pop() || null;
    // Por canal: lo de la app (la Bandeja) y lo de WhatsApp (lo que registras tú).
    const canal = (k) => { const l = suyos.filter(x => x[0] === k); const f = ultDe(l, 1); const tp = ultDe(suyosPend.filter(x => x[0] === k), 2); return f ? { f, sinResponder: !!tp && (!ultTuyoT || tp > ultTuyoT) } : null; };
    const escApp = canal('app'), escWa = canal('whatsapp');
    // La semana, día por día: en qué días lo tocaste y en cuáles te escribió.
    const diasTuyos = new Set(tuyos.filter(x => semana(x[1])).map(x => x[1]));
    const diasSuyos = new Set(suyos.filter(x => semana(x[1])).map(x => x[1]));
    // Los tipos de toque de la semana y cuántas veces cada uno (lo repetido
    // en el mismo momento cuenta una vez).
    const tipos = Object.keys(TQ_TIPO).map(k => [k, new Set(tuyos.filter(x => x[0] === k && semana(x[1])).map(x => x[2])).size]).filter(x => x[1]);
    const segSemana = seg.filter(x => semana(x.fecha)).map(x => x.fecha).sort();
    // Videos: el último de cada ejercicio manda (pedido = por llegar,
    // recibido = por revisar, que es tarea tuya).
    const ultV = {};
    v.forEach(x => { const k = x.ejercicio_id || `n:${String(x.ejercicio_nombre || '').toLowerCase()}`; const u = ultV[k]; if (!u || String(x.pedido_en) > String(u.pedido_en) || (x.pedido_en === u.pedido_en && String(x.created_at) > String(u.created_at))) ultV[k] = x; });
    const vig = Object.values(ultV);
    const videos = { pedidosSemana: v.filter(x => semana(x.pedido_en)).length, revisadosSemana: v.filter(x => x.revisado_en && semana(tqDia(x.revisado_en))).length, porLlegar: vig.filter(x => x.estado === 'pedido').length, porRevisar: vig.filter(x => x.estado === 'recibido').length };
    const dias7 = new Set(tuyos.filter(x => x[1] >= hace7 && x[1] <= hoy).map(x => x[1])).size;
    const sinToque = ultTuyo ? tqEntre(ultTuyo, hoy) : null;
    const pausa = typeof ausHoy === 'function' ? ausHoy(c.id, hoy) : null;
    const e = eng ? eng.filas.find(f => f.c.id === c.id) : null;
    const ultPendT = ultDe(suyosPend, 2);
    const debe = !!(ultPendT && (!ultTuyoT || ultPendT > ultTuyoT));
    let estado;
    if (pausa) estado = 'pausa';
    else if (debe) estado = 'debe';
    else if (sinToque === null || sinToque >= TQ_FRIO) estado = 'frio';
    else if (sinToque >= TQ_ENFRIA) estado = 'enfria';
    else if (dias7 >= 4) estado = 'mucho';
    else estado = 'bien';
    return {
      c, estado, debe, ultTuyo, ultSuyo, sinToque, tipos, videos,
      semana: diasSemana.map(d => ({ d, tuyo: diasTuyos.has(d), suyo: diasSuyos.has(d), futuro: d > hoyReal, hoy: d === hoyReal })),
      diasToque: diasTuyos.size, contacto: diasTuyos.size + diasSuyos.size > 0,
      seguimiento: segSemana[0] || null, suyoPor: suyoUlt ? suyoUlt[0] : null,
      escApp, escWa,
      noHaceFalta: noHaceFalta.has(String(c.id)),
      entrenos: s.filter(x => x.estado === 'completada' && semana(x.fecha)).length,
      app: e && actual ? e.sinActividad : undefined,
    };
  });
  // Siempre en orden alfabético (para ver por estado están los filtros de arriba).
  filas.sort((a, b) => String(a.c.nombre).localeCompare(String(b.c.nombre), 'es', { sensitivity: 'base' }));
  return { hoy, lunes, filas, actual };
}
async function tqDatos(forzar = false) {
  if (!forzar && _tq.datos && Date.now() - (_tq.leido || 0) < 120000) return _tq.datos;
  _tq.datos = tqCalcular(await tqCrudo(true), fmt.hoy());
  return _tq.datos;
}
window.tqFiltro = (k) => { _tq.filtro = k; rerenderView(); };
// El contacto se gestiona aquí. En las demás pantallas (Equipo, Seguimiento)
// queda solo «Último toque: hace N días», que trae esto mismo y lleva a Toques.
window.tqUltimo = async (id) => {
  try { const D = await tqDatos(); const f = D.filas.find(x => String(x.c.id) === String(id)); return f ? f.ultTuyo : undefined; } catch (e) { return undefined; }
};
window.tqUltimoHTML = (fecha, { prefijo = 'Último toque: ' } = {}) => `<a class="tq-ult-link" data-tq-ultimo-link href="#" onclick="event.preventDefault();event.stopPropagation();navigate('toques')" title="Ver en Toques">${prefijo}${tqCuando(fecha, fmt.hoy())}</a>`;

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
// «Marcar hecho»: el seguimiento de esta semana, hecho a mano (le escribiste
// directo o lo viste en persona). Es la misma marca de su Seguimiento.
// «No hace falta»: ya lo tocaste y no está frío, esta semana no le hace falta
// el seguimiento. No cuenta en «sin seguimiento»; la semana siguiente vuelve.
window.tqNoHaceFalta = async (id, si = true) => {
  const lunes = tqLunes(fmt.hoy());
  try {
    const { error } = si
      ? await sb.from('toques_semana').insert({ cliente_id: id, lunes, motivo: 'no_hace_falta' })
      : await sb.from('toques_semana').delete().eq('cliente_id', id).eq('lunes', lunes);
    if (error && !/duplicate|unique/i.test(error.message || '')) throw error;
  } catch (e) {
    toast(/toques_semana|relation|schema cache/i.test((e && e.message) || '') ? 'Falta correr migraciones/toques-semana.sql en Supabase' : 'No pude guardarlo');
    return;
  }
  toast(si ? 'Listo: esta semana no; la próxima sí' : 'Vuelve a «Falta»');
  _tq.datos = null;
  if (_currentView === 'toques') rerenderView();
};
window.tqSegHecho = async (id) => {
  if (typeof segMarcar !== 'function') return;
  await segMarcar(id, true);
  _tq.datos = null;
  if (_currentView === 'toques') rerenderView();
};
// La casilla «Te escribió por WhatsApp»: registrarlo con un toque.
window.tqWaCelda = (id) => {
  const f = _tq.datos && _tq.datos.filas.find(x => x.c.id === id);
  const nom = f ? escapeHtml(String(f.c.nombre).split(' ')[0]) : 'tu cliente';
  openModal(modalShell(`Te escribió por WhatsApp · ${nom}`, `
    <p class="text-sm text-slate-600">Queda como que hoy te escribió por WhatsApp: cuenta en Toques y, si no le has respondido, sale en rojo hasta que le escribas.</p>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" data-tq-wa-ok onclick="closeModal();tqMeEscribio('${id}')">Registrar</button>`));
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

// ── La vista: una fila por cliente ───────────────────────────────────────
function tqCuando(f, hoy) { if (!f) return 'nunca'; const d = tqEntre(f, hoy); return d === 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`; }
const TQ_FILTROS = [['todos', 'Todos'], ['rojo', 'Rojo'], ['amarillo', 'Amarillo'], ['verde', 'Verde'], ['gris', 'En pausa']];
// Lo que falta en la semana (también son filtros).
const TQ_FALTA = {
  sinSeg: (f) => f.estado !== 'pausa' && !f.seguimiento && !f.noHaceFalta,
  sinContacto: (f) => f.estado !== 'pausa' && !f.contacto,
  revisar: (f) => f.videos.porRevisar > 0,
  pendientes: (f) => f.estado !== 'pausa' && typeof ppDe === 'function' && ppDe(f.c.id).some(x => x.estado === 'toca' || x.estado === 'recordar' || x.estado === 'pedido'),
  // Filtros rápidos: a quién le toca pedir (o recordar) video, y a quién le falta el seguimiento.
  pedirVideo: (f) => f.estado !== 'pausa' && typeof ppDe === 'function' && ppDe(f.c.id).some(x => x.tipo === 'video' && (x.estado === 'toca' || x.estado === 'recordar')),
};
const TQ_TIPO = { seguimiento: 'Seguimiento', mensaje: 'Mensaje', respuesta: 'Respuesta', whatsapp: 'WhatsApp', video: 'Pedir video', retro: 'Retro de video', pedido: 'Pedir fotos o medidas', capsula: 'Cápsula', dicho: 'Qué tocar' };

// Semana corta: «3–9 nov» o «27 oct–2 nov».
const TQ_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function tqRango(lunes) {
  const a = new Date(lunes + 'T12:00:00Z'), b = new Date(evtSumarDias(lunes, 6) + 'T12:00:00Z');
  return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}–${b.getUTCDate()} ${TQ_MES[b.getUTCMonth()]}` : `${a.getUTCDate()} ${TQ_MES[a.getUTCMonth()]}–${b.getUTCDate()} ${TQ_MES[b.getUTCMonth()]}`;
}
const tqEt = (cl, t) => `<span class="tq-et ${cl}">${t}</span>`;
// Las etiquetas de una semana: seguimiento, videos y si se te pasó.
function tqEtiquetas(f, actual) {
  if (f.estado === 'pausa') return tqEt('gr', 'En pausa');
  const l = [];
  if (f.seguimiento) l.push(tqEt('az', 'Seguimiento'));
  else if (f.noHaceFalta) l.push(tqEt('am', 'Esta semana no'));
  else if (actual) l.push(tqEt('ro', 'Falta seguimiento'));
  else l.push(tqEt('ro', f.diasToque ? 'Sin seguimiento' : 'Sin toque'));
  const v = f.videos;
  if (v.pedidosSemana) l.push(tqEt('na', `Pedí ${v.pedidosSemana} video${v.pedidosSemana === 1 ? '' : 's'}`));
  if (v.porLlegar) l.push(tqEt('na', `${v.porLlegar} por llegar`));
  if (actual && v.porRevisar) l.push(tqEt('ve', `${v.porRevisar} por revisar`));
  if (v.revisadosSemana) l.push(tqEt('gr', `Revisé ${v.revisadosSemana}`));
  return l.join('');
}
window.tqSemana = (k) => { _tq.atras = Math.max(0, Math.min(tqMaxAtras(), Number(k) || 0)); rerenderView(); };
window.tqOrden = (o) => { _tq.orden = o; try { localStorage.setItem('crm:tqOrden', o); } catch (e) { /* nada */ } rerenderView(); };
// Hasta cuántas semanas atrás hay historial (como mucho 2 años).
function tqMaxAtras() {
  const ini = _tq.inicio || evtSumarDias(tqLunes(fmt.hoy()), -42);
  return Math.max(1, Math.min(104, Math.round(tqEntre(tqLunes(ini), tqLunes(fmt.hoy())) / 7)));
}
// Los estados del toque (filtros) y las formas de ordenar.
const TQ_ESTADOS = [['debe', 'Le debes respuesta'], ['frio', 'Frío'], ['enfria', 'Enfriándose'], ['mucho', 'Mucho esta semana'], ['bien', 'Bien'], ['pausa', 'En pausa']];
const TQ_ORDENES = [['alfa', 'Alfabético'], ['ciclo', 'Ciclo por vencer'], ['app', 'Más días sin abrir la app'], ['frio', 'Más días sin toque'], ['mas', 'Más toques en la semana'], ['menos', 'Menos toques en la semana']];
function tqOrdenar(lista) {
  const alfa = (a, b) => String(a.c.nombre).localeCompare(String(b.c.nombre), 'es', { sensitivity: 'base' });
  const NUNCA = 99999;
  const val = {
    ciclo: (f) => { const d = typeof ppFaltanCiclo === 'function' ? ppFaltanCiclo(f.c) : null; return d == null ? NUNCA : d; },
    app: (f) => (f.app === undefined ? -1 : f.app === null ? NUNCA : f.app),
    frio: (f) => (f.sinToque == null ? NUNCA : f.sinToque),
    mas: (f) => f.diasToque || 0,
    menos: (f) => f.diasToque || 0,
  }[_tq.orden];
  if (!val) return lista.slice().sort(alfa);
  const sube = _tq.orden === 'ciclo' || _tq.orden === 'menos';
  return lista.slice().sort((a, b) => (sube ? val(a) - val(b) : val(b) - val(a)) || alfa(a, b));
}

// El historial de un cliente: 6 semanas, día por día.
const TQ_DSEM = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
window.tqHistorial = async (id) => {
  const R = _tq.crudo || await tqCrudo(true);
  const c = (R.clientes || []).find(x => String(x.id) === String(id));
  if (!c) return;
  const de = (l) => (l || []).filter(x => String(x.cliente_id) === String(id));
  const ev = [];   // [fecha, texto, tuyo]
  const corto = (t, n = 90) => { t = String(t || '').trim().replace(/\s+/g, ' '); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  de(R.msj).forEach(x => {
    if (x.origen === 'videos') return;
    ev.push([x.fecha, x.origen === 'nota' ? 'Atendiste su mensaje en la Bandeja' : x.origen === 'manual' ? 'Seguimiento semanal marcado hecho' : 'Seguimiento semanal enviado', true]);
  });
  const vs = de(R.vids), pedidos = {};
  vs.forEach(x => { (pedidos[x.pedido_en] = pedidos[x.pedido_en] || []).push(x.ejercicio_nombre || 'ejercicio'); });
  Object.entries(pedidos).forEach(([f, l]) => ev.push([f, `Pediste video${l.length === 1 ? '' : 's'}: ${l.join(', ')}`, true]));
  const EST = { bien: 'bien', mejorar: 'a mejorar', mal: 'nada bien' };
  vs.filter(x => x.revisado_en && EST[x.estado]).forEach(x => ev.push([tqDia(x.revisado_en), `Revisaste su video de ${x.ejercicio_nombre || 'ejercicio'} y le diste retro: ${EST[x.estado]}`, true]));
  de(R.vEnt).forEach(x => { const k = String(x.detalle || '').replace(/^ej:/, ''); const n = (vs.find(v => (v.ejercicio_id && String(v.ejercicio_id) === k) || String(v.ejercicio_nombre || '').toLowerCase() === k.replace(/^n:/, '')) || {}).ejercicio_nombre; ev.push([tqDia(x.entregado_en), `Entregó video${n ? ` de ${escapeHtml(n)}` : ''} y le diste retro`, true]); });
  de(R.resp).forEach(x => ev.push([tqDia(x.created_at), 'Le respondiste en la app', true]));
  de(R.com).forEach(x => ev.push([tqDia(x.creado_en), 'Le comentaste en la app', true]));
  de(R.toq).forEach(x => ev.push([x.fecha, x.tipo === 'me_escribio' ? 'Te escribió por WhatsApp' : 'Abriste su WhatsApp', x.tipo !== 'me_escribio']));
  de(R.notas).forEach(x => ev.push([x.fecha || tqDia(x.created_at), 'Te escribió en la app', false]));
  const AN_NOM = { viaje: 'viaje', salud: 'salud', pendiente: 'pendiente', fijo: 'dato fijo', conversacion: 'conversación' };
  // Lo anotado sale, pero no suma «día con toque» (igual que en la tabla).
  de(R.anot).forEach(x => ev.push([x.fecha, `Anotaste (${AN_NOM[x.tipo] || 'nota'}): «${escapeHtml(corto(x.texto))}»`, null]));
  const PED_NOM = { fotos: 'fotos', peso: 'su peso', medidas: 'medidas' };
  de(R.yaPedi).forEach(x => ev.push([tqDia(x.pedido_en), `${x.detalle === 'recordatorio' ? 'Le recordaste' : 'Le pediste'} ${PED_NOM[x.tipo] || x.tipo}`, true]));
  de(R.cps).forEach(x => {
    const t = escapeHtml(x.capsula_titulo || x.capsula_id);
    ev.push([tqDia(x.enviada_en), `Le enviaste la cápsula «${t}»`, true]);
    if (x.recordada_en) ev.push([tqDia(x.recordada_en), `Le recordaste la cápsula «${t}»`, true]);
    if (x.respondio_en) ev.push([tqDia(x.respondio_en), `Te respondió sobre «${t}»${x.respuesta ? `: «${escapeHtml(corto(x.respuesta))}»` : ''}`, true]);
  });
  de(R.ses).filter(x => String(x.notas_cliente || '').trim()).forEach(x => ev.push([x.fecha, `Te dejó una nota al terminar: «${escapeHtml(corto(x.notas_cliente))}»`, false]));
  const QT_V = { felicita: 'Lo felicitaste', pide: 'Le pediste', corrige: 'Le corregiste' };
  if (typeof qtDe === 'function') qtDe(id).marcas.forEach(x => ev.push([String(x.fecha).slice(0, 10), `${QT_V[x.accion] || 'Le dijiste'} (${x.modo === 'texto' ? 'con el texto sugerido' : 'con tus palabras'}): «${escapeHtml(corto(x.texto))}»`, true]));
  const hoy = fmt.hoy(), lunes = tqLunes(hoy);
  const visto = new Set();
  const semanas = [0, 1, 2, 3, 4, 5].map(k => {
    const l = evtSumarDias(lunes, -7 * k), d = evtSumarDias(l, 6);
    const lista = ev.filter(x => x[0] && x[0] >= l && x[0] <= d && x[0] <= hoy).sort((a, b) => a[0].localeCompare(b[0]))
      .filter(x => { const kk = x[0] + x[1]; if (visto.has(kk)) return false; visto.add(kk); return true; });
    const dias = new Set(lista.filter(x => x[2]).map(x => x[0])).size;
    const entrenos = de(R.ses).filter(x => x.estado === 'completada' && x.fecha >= l && x.fecha <= d).length;
    const nhf = (R.nhf || []).some(x => String(x.cliente_id) === String(id) && x.lunes === l);
    const pausa = typeof ausHoy === 'function' ? ausHoy(id, k ? d : hoy) : null;
    const etq = pausa ? tqEt('gr', 'En pausa') : nhf ? tqEt('am', 'Esta semana no') : (!dias && k ? tqEt('ro', 'Sin toque') : '');
    return `<div class="tq-hi-sem${k ? '' : ' act'}" data-tq-hist-sem="${l}">
      <div class="tq-hi-h">${k ? '' : 'Esta semana · '}${tqRango(l)} · ${dias} día${dias === 1 ? '' : 's'} con toque${entrenos ? ` · ${entrenos} entreno${entrenos === 1 ? '' : 's'}` : ''} ${etq}</div>
      ${lista.length ? lista.map(x => { const t = new Date(x[0] + 'T12:00:00Z'); return `<div class="tq-hi-ev${x[2] === null ? ' neutro' : x[2] ? '' : ' suyo'}"><span>${TQ_DSEM[t.getUTCDay()]} ${t.getUTCDate()}</span>${x[1]}</div>`; }).join('') : '<div class="tq-hi-ev"><span></span><i>Nada registrado</i></div>'}
    </div>`;
  }).join('');
  const temas = typeof qtTablaHTML === 'function' && typeof qtDe === 'function' ? `<div data-tq-hist-temas style="border:1px solid #EFEDE7;border-radius:12px;padding:10px 12px;margin-bottom:14px"><div style="font-size:13px;font-weight:800;color:#1F1F1F">Lo que le has dicho, por tema</div>${qtTablaHTML(qtResumen(qtEventos(qtDe(id)), hoy), { titulo: false })}</div>` : '';
  openModal(modalShell(`Historial · ${escapeHtml(c.nombre)}`, `<div data-tq-historial><p class="text-sm text-slate-500" style="margin:0 0 12px">Seis semanas, de la más reciente a la más antigua. En negro lo que hiciste tú; en azul lo que hizo o te escribió; en gris lo que anotaste (no suma toque).</p>${temas}${semanas}</div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>`));
};

routes.toques = async () => {
  cargando('Juntando los toques de la semana…');
  let D, sems = [];
  try {
    const R = await tqCrudo(true), hoyR = fmt.hoy(), lunesR = tqLunes(hoyR);
    _tq.datos = tqCalcular(R, hoyR);
    // La semana elegida y las 2 de antes (cada una como quedó al cerrar).
    const at = Math.min(_tq.atras, tqMaxAtras());
    sems = [at + 2, at + 1, at].map(k => (k ? tqCalcular(R, evtSumarDias(lunesR, -7 * k + 6)) : _tq.datos));
    D = sems[2];
  } catch (e) { D = { filas: [], hoy: fmt.hoy(), lunes: tqLunes(fmt.hoy()), actual: true }; console.warn('toques', e); }
  finCargando();
  const deSemana = (D.actual ? 'esta semana' : 'esa semana');
  const porCliente = sems.map(S => new Map(S.filas.map(f => [String(f.c.id), f])));
  const color = (f) => TQ_TONO[f.estado][0];
  const filtro = _tq.filtro || 'todos';
  const lista = tqOrdenar(TQ_FALTA[filtro] ? D.filas.filter(TQ_FALTA[filtro]) : filtro.startsWith('est:') ? D.filas.filter(f => f.estado === filtro.slice(4)) : filtro === 'todos' ? D.filas : D.filas.filter(f => color(f) === filtro));
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
    : f.noHaceFalta ? `<span class="tq-nhf">Esta semana no</span>${D.actual ? `<div class="tq-sub">la próxima sí · <a href="#" class="tq-ult-link" data-tq-nhf-deshacer onclick="event.preventDefault();tqNoHaceFalta('${f.c.id}', false)">deshacer</a></div>` : ''}`
    : !D.actual ? `<span class="tq-rojo">No se hizo</span>`
    : `<span class="tq-falta">Falta</span><div class="tq-seg-btns"><button type="button" class="tq-hecho" data-tq-seg-hecho onclick="tqSegHecho('${f.c.id}')">Marcar hecho</button><button type="button" class="tq-hecho tq-hecho-s" data-tq-nhf onclick="tqNoHaceFalta('${f.c.id}', true)" title="Ya lo tocaste y no está frío: esta semana no le hace falta seguimiento. La próxima vuelve.">Esta semana no</button></div>`;
  const celdaVid = (f) => {
    const l = [f.videos.porRevisar ? `<b>${f.videos.porRevisar} por revisar</b>` : '', f.videos.porLlegar ? `${f.videos.porLlegar} por llegar` : '', f.videos.pedidosSemana ? `<span class="tq-sub">${f.videos.pedidosSemana} pedido${f.videos.pedidosSemana === 1 ? '' : 's'} ${deSemana}</span>` : ''].filter(Boolean);
    return l.length ? l.join('<br>') : '<span class="tq-cero">—</span>';
  };
  const celdaCanal = (x, wa) => !x ? '<span class="tq-cero">—</span>'
    : x.sinResponder ? `<span class="tq-rojo tq-nw">${tqCuando(x.f, D.hoy).replace(/^h/, 'H')} · sin responder</span>`
    : `${tqCuando(x.f, D.hoy).replace(/^h/, 'H')}<div class="tq-sub">respondido</div>`;
  const app = (f) => f.app === undefined ? '' : `<div class="tq-sub">App: ${f.app === null ? 'nunca' : f.app === 0 ? 'hoy' : f.app === 1 ? 'ayer' : `hace ${f.app} días`}</div>`;
  // Las últimas 3 semanas de este cliente, con etiquetas cortas.
  const histCel = (f) => `<div class="tq-hs">${porCliente.map((M, k) => {
    const x = M.get(String(f.c.id)), S = sems[k];
    if (!x) return `<div class="tq-hw${S.actual ? ' act' : ''}"><div class="tq-hw-t"><span>${S.actual ? 'Esta semana' : tqRango(S.lunes)}</span></div><span class="tq-cero">—</span></div>`;
    return `<div class="tq-hw${S.actual ? ' act' : ''}${k === 2 && !S.actual ? ' sel' : ''}" data-tq-hist-semana="${S.lunes}"><div class="tq-hw-t"><span>${S.actual ? 'Esta semana' : tqRango(S.lunes)}</span><b>${x.diasToque} día${x.diasToque === 1 ? '' : 's'}</b></div>${x.tipos.length ? `<div class="tq-hw-n" data-tq-hw-tipos>${x.tipos.length} tipo${x.tipos.length === 1 ? '' : 's'}: ${x.tipos.map(([k]) => TQ_TIPO[k].toLowerCase()).join(', ')}</div>` : ''}${tqEtiquetas(x, S.actual)}</div>`;
  }).join('')}</div>`;
  const fila = (f) => `<tr data-tq-cliente="${f.c.id}" data-tq-estado="${f.estado}" data-tq-color="${color(f)}" data-tq-nombre="${escapeHtml(tqNorm(f.c.nombre))}">
      <td class="lis-nom tq-nom-cel" onclick="tqHistorial('${f.c.id}')" title="Ver su historial de 6 semanas">${typeof entAvatar === 'function' ? entAvatar(f.c.nombre) : ''}<div><b>${escapeHtml(f.c.nombre)}</b><div class="tq-sub" data-tq-ultimo>Tu último toque: ${tqCuando(f.ultTuyo, D.hoy)}</div></div></td>
      <td>${semaforo(f)}</td>
      <td data-tq="dicho">${D.actual && typeof qtCeldaToques === 'function' ? qtCeldaToques(f) : '<span class="tq-cero">—</span>'}</td>
      <td data-tq="historial" class="tq-hist-cel" onclick="tqHistorial('${f.c.id}')" title="Toca para ver su historial de 6 semanas">${histCel(f)}</td>
      <td data-tq="semana">${tira(f)}<div class="tq-sub" data-tq-dias>${f.diasToque ? `<b>${f.diasToque}</b> de 7 días · <b data-tq-ntipos>${f.tipos.length}</b> tipo${f.tipos.length === 1 ? '' : 's'}` : `Sin tocarlo ${deSemana}`}</div>${f.tipos.length ? `<div data-tq-tipos>${f.tipos.map(([k, n]) => `<span class="tq-ch" data-tq-tipo="${k}">${TQ_TIPO[k]}${n > 1 ? ` <b>×${n}</b>` : ''}</span>`).join('')}</div>` : ''}</td>
      <td data-tq="seguimiento">${celdaSeg(f)}</td>
      <td data-tq="ciclo" style="min-width:150px">${D.actual && typeof ppCiclo === 'function' ? ppCiclo(f.c) : '<span class="tq-cero">—</span>'}</td>
      <td data-tq="pendientes">${D.actual && typeof ppCelda === 'function' ? ppCelda(f) : '<span class="tq-cero">—</span>'}</td>
      <td data-tq="capsulas">${D.actual && typeof capCelda === 'function' ? capCelda(f) : '<span class="tq-cero">—</span>'}</td>
      <td data-tq="videos" class="tq-vid-cel" onclick="vtAbrir('${f.c.id}')" title="Toca para revisar sus videos">${celdaVid(f)}<div class="tq-sub tq-wa-mas">revisar</div></td>
      <td data-tq="escribio-app">${celdaCanal(f.escApp)}</td>
      ${D.actual ? `<td data-tq="escribio-wa" class="tq-wa-cel" onclick="tqWaCelda('${f.c.id}')" title="Toca para registrar que te escribió por WhatsApp">${celdaCanal(f.escWa, true)}<div class="tq-sub tq-wa-mas">+ registrar</div></td>` : `<td data-tq="escribio-wa">${celdaCanal(f.escWa, true)}</td>`}
      <td data-tq="su-semana"><span class="tq-nw">${f.entrenos} entreno${f.entrenos === 1 ? '' : 's'}</span>${app(f)}</td>
      <td><div class="tq-acc">
        ${f.debe ? `<button type="button" class="cp-btn" data-tq-responder onclick="tqResponder('${f.c.id}')">Responder</button>` : `<a class="cp-btn" data-tq-seg-pestana href="?seg=${encodeURIComponent(f.c.id)}" target="_blank" rel="noopener" title="Abre su seguimiento en otra pestaña">Seguimiento</a>`}
        <button type="button" class="cp-btn s" onclick="tqPedirVideo('${f.c.id}')">Pedir video</button>
        <button type="button" class="cp-btn s" data-tq-wa onclick="tqWhatsApp('${f.c.id}')">WhatsApp</button>
      </div></td></tr>`;
  const tarjeta = (k, n, titulo, sub) => `<button type="button" class="tq-falta-card${_tq.filtro === k ? ' on' : ''}" data-tq-filtro="${k}" onclick="tqFiltro('${_tq.filtro === k ? 'todos' : k}')"><b>${n}</b><span>${titulo}</span><small>${sub}</small></button>`;
  view.innerHTML = `
    <div class="mb-3"><h2 class="text-2xl font-bold text-slate-900">Toques de la semana</h2>
      <p class="text-sm text-slate-500">Semana del ${fmt.fechaCorta(D.lunes)} al ${fmt.fechaCorta(evtSumarDias(D.lunes, 6))}. ${D.actual ? 'Qué hiciste con cada cliente y qué te falta.' : 'Así quedó esa semana: lo que hiciste con cada cliente y lo que faltó.'}</p>
      <div class="tq-semfila" data-tq-semanas>
        <div class="tq-semsel">${[[0, 'Esta semana'], [1, 'Semana pasada']].map(([k, t]) => `<button type="button" class="tq-semsel-b${_tq.atras === k ? ' on' : ''}" data-tq-semana="${k}" onclick="tqSemana(${k})">${t}</button>`).join('')}</div>
        <div class="tq-semnav">
          <button type="button" class="tq-semsel-b" data-tq-sem-ant onclick="tqSemana(${_tq.atras + 1})" ${_tq.atras >= tqMaxAtras() ? 'disabled' : ''} title="Semana anterior">‹</button>
          <select data-tq-sem-sel onchange="tqSemana(this.value)" title="Ir a una semana">${Array.from({ length: tqMaxAtras() + 1 }, (_, k) => { const l = evtSumarDias(tqLunes(fmt.hoy()), -7 * k); return `<option value="${k}" ${k === _tq.atras ? 'selected' : ''}>${tqRango(l)}${k === 0 ? ' · esta semana' : k === 1 ? ' · la pasada' : ''}</option>`; }).join('')}</select>
          <button type="button" class="tq-semsel-b" data-tq-sem-sig onclick="tqSemana(${_tq.atras - 1})" ${_tq.atras <= 0 ? 'disabled' : ''} title="Semana siguiente">›</button>
        </div>
        <span class="tq-sub">Historial desde el ${fmt.fechaCorta(tqLunes(_tq.inicio || fmt.hoy()))} · ${tqMaxAtras() + 1} semanas</span>
      </div></div>
    ${_tq.sinTabla ? `<div class="card mb-3 text-xs text-amber-900 bg-amber-50 border border-amber-200" data-tq-sin-tabla>Para registrar «Me escribió» y los WhatsApp que abres desde el CRM, corre <code>migraciones/toques-cliente.sql</code> en Supabase. Lo demás ya se ve.</div>` : ''}
    <div class="tq-faltas${D.actual ? ' cuatro' : ''}" data-tq-faltas>
      ${tarjeta('sinSeg', activos.filter(TQ_FALTA.sinSeg).length, `sin seguimiento ${deSemana}`, `${conSeg} de ${activos.length} hechos${activos.some(f => f.noHaceFalta && !f.seguimiento) ? ` · ${activos.filter(f => f.noHaceFalta && !f.seguimiento).length} ${D.actual ? 'esta semana no' : 'saltados'}` : ''}`)}
      ${tarjeta('sinContacto', activos.filter(TQ_FALTA.sinContacto).length, `sin contacto ${deSemana}`, 'ni tú ni él escribieron')}
      ${tarjeta('revisar', D.filas.filter(TQ_FALTA.revisar).length, 'con videos por revisar', 'te llegaron y falta revisarlos')}
      ${D.actual && typeof ppDe === 'function' ? (() => { const its = activos.flatMap(f => ppDe(f.c.id)); const rec = its.filter(x => x.estado === 'recordar').length; return tarjeta('pendientes', its.filter(x => x.estado === 'toca' || x.estado === 'recordar').length, 'pendientes por pedir', `${its.filter(x => x.estado === 'pedido' || x.estado === 'recordar').length} pedidos sin llegar${rec ? ` · ${rec} por recordar` : ''}`); })() : ''}
    </div>
    <div class="tq-buscar" data-tq-buscar-caja><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input type="search" data-tq-buscar placeholder="Buscar cliente por nombre" aria-label="Buscar cliente por nombre" value="${escapeHtml(_tq.buscar)}" oninput="tqBuscar(this.value)" autocomplete="off"><button type="button" data-tq-buscar-borrar aria-label="Borrar búsqueda" ${_tq.buscar ? '' : 'hidden'} onclick="const i=this.previousElementSibling; i.value=''; tqBuscar(''); i.focus()">×</button></div>
    <div class="tq-filtros" data-tq-chips>
      <div class="tq-chips">${[['todos', 'Todos'], ...TQ_ESTADOS.map(([k, t]) => [`est:${k}`, t])].map(([k, t]) => { const est = k.startsWith('est:') ? k.slice(4) : null; const n = est ? D.filas.filter(f => f.estado === est).length : D.filas.length; return `<button type="button" class="chip ${filtro === k ? 'active' : ''}" data-tq-filtro="${k}" onclick="tqFiltro('${k}')">${est ? `<i class="tq-punto" style="background:${TQ_COLOR[TQ_TONO[est][0]][0]}"></i>` : ''}${t} · ${n}</button>`; }).join('')}</div>
      <div class="tq-chips" data-tq-rapidos>${[['sinSeg', D.actual ? 'Falta seguimiento' : 'Sin seguimiento'], ...(typeof ppDe === 'function' ? [['pedirVideo', 'Por pedir video']] : [])].map(([k, t]) => `<button type="button" class="chip ${filtro === k ? 'active' : ''}" data-tq-rapido="${k}" onclick="tqFiltro('${filtro === k ? 'todos' : k}')">${t} · ${D.filas.filter(TQ_FALTA[k]).length}</button>`).join('')}</div>
      <label class="tq-orden">Ordenar <select data-tq-orden onchange="tqOrden(this.value)">${TQ_ORDENES.map(([k, t]) => `<option value="${k}" ${_tq.orden === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    </div>
    <div class="card lis-tabla-caja" data-tq-tabla>
      <table class="lis-tabla tq-tabla"><thead><tr><th class="lis-nom">Cliente</th><th>Semáforo</th><th>Lo que le has dicho</th><th>Últimas 3 semanas</th><th>Tus toques ${deSemana}</th><th>Seguimiento<br>semanal</th><th>Ciclo</th><th>Pendientes<br>por pedir</th><th>Cápsulas</th><th>Videos</th><th>Te escribió<br>en la app</th><th>Te escribió<br>por WhatsApp</th><th>Su semana</th><th></th></tr></thead>
      <tbody>${lista.map(fila).join('')}</tbody></table>
      ${lista.length ? '' : '<p class="text-sm text-slate-500" style="padding:0 16px 16px">Nadie en este filtro.</p>'}
      <p class="text-sm text-slate-500" style="padding:0 16px 16px" data-tq-sin-coincidencia hidden>Nadie con ese nombre en este filtro.</p>
    </div>
    <details class="tq-que mt-3" data-tq-leyenda open><summary>Qué cuenta en cada columna</summary>
      <div class="tq-que-g">
        <div><b>Tus toques</b>Un toque es un día en que le escribiste algo: seguimiento, pedirle video, responder su nota (o marcarla «Listo» en la Bandeja) o abrir su WhatsApp desde el CRM. Si el mismo día haces dos cosas, cuenta 1. En la semana: <span class="tq-dia t">L</span> lo tocaste ese día, <span class="tq-dia s">L</span> te escribió.</div>
        <div><b>Seguimiento semanal</b>Hecho si esta semana le mandaste el seguimiento (lo copiaste desde el CRM) o tocaste «Marcar hecho». «Esta semana no»: ya lo tocaste y no está frío; esta semana no cuenta como pendiente y la próxima sí. El botón «Seguimiento» lo abre en otra pestaña.</div>
        <div><b>Te escribió</b>En la app: sus notas (las de la Bandeja). Por WhatsApp: lo que registras tú tocando esa casilla. En rojo si todavía no le respondes; abrir su WhatsApp o responderle en la app cuenta como respuesta.</div>
        <div><b>Últimas 3 semanas</b>Un recuadro por semana (el azul es esta) con los días que lo tocaste y lo que pasó: <span class="tq-et az">Seguimiento</span> <span class="tq-et na">Pedí N videos</span> <span class="tq-et na">N por llegar</span> <span class="tq-et gr">Revisé N</span> <span class="tq-et am">Esta semana no</span> <span class="tq-et ro">Sin toque</span>. Toca el nombre o los recuadros para ver su historial de 6 semanas, día por día. Arriba eliges qué semana ver en la tabla.</div>
        <div><b>Ciclo</b>La semana del ciclo en que va y los días que le faltan. En la última semana, si ya le salió en la app el aviso de que pronto cambia de ciclo (la ventana que ve una sola vez, el primer día que abre la app esa semana); antes, el día en que le va a salir.</div>
        <div><b>Pendientes por pedir</b>Fotos, peso y medidas: solo cuando su app ya le mostró el recordatorio y lleva 1 semana o más sin hacerlo. Video: si empezó ciclo nuevo o lleva 6 semanas sin mandar; y si se lo pediste hace una semana y no llega, <span class="tq-et ro">Recordar</span> abre su WhatsApp con el recordatorio. <span class="tq-et na">Toca pedir</span>: «Pedir» abre su WhatsApp con el mensaje (el video, con el ejercicio que elijas) y «Ya lo pedí» lo marca si se lo pediste por otro lado. <span class="tq-et gr">Pedido</span>: esperando; si te lo mandó por WhatsApp, «Ya lo entregó». <span class="tq-et ve">Entregado</span>: se marca solo cuando llega por la app.</div>
        <div><b>Videos</b>Toca la casilla para revisarlos: «Bien», «A mejorar», «Llegó», «Quitar» o pedir más. El cuadro de arriba «con videos por revisar» deja solo a los que tienen algo por revisar.</div>
        <div><b>Semáforo</b><b class="tq-r">Rojo</b>: le debes respuesta, o 15 días o más sin un toque tuyo. <b class="tq-a">Amarillo</b>: 8 a 14 días sin toque, o 4 días o más con toque en los últimos 7 (mejor esperar). <b class="tq-v">Verde</b>: bien.</div>
      </div>
    </details>`;
  if (_tq.buscar) tqBuscar(_tq.buscar);
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
  .tq-ult-link{color:inherit;text-decoration:underline;text-decoration-color:#C9C5BB;text-underline-offset:3px;cursor:pointer}
  .tq-ult-link:hover{text-decoration-color:currentColor}
  .es-ult-t .tq-ult-link{color:#1F1F1F;font-weight:750}
  .es-ult-tarde .tq-ult-link{color:#B5611A}
  .tq-ok{font-weight:700;color:#2F7F45}
  .tq-seg-btns{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px}
  .tq-nhf{font-weight:700;color:#737373}
  .tq-hecho-s{background:transparent!important;box-shadow:inset 0 0 0 1.5px #E4E0D8}
  .tq-hecho{margin-top:0;border:0;border-radius:999px;padding:4px 10px;font:inherit;font-size:11.5px;font-weight:700;cursor:pointer;background:#F1EFE9;color:#1F1F1F;white-space:nowrap}
  .tq-acc a.cp-btn{text-decoration:none;display:inline-block}
  .tq-falta{font-weight:700;color:#8A6410}
  .tq-rojo{font-weight:700;color:#B2402B}
  .tq-hw-n{font-size:10.5px;color:#8A8780;line-height:1.3;margin:-1px 0 3px}
  .tq-ch b{font-weight:800;color:#1F1F1F}
  .tq-ch{display:inline-block;font-size:10.5px;font-weight:700;background:#F1EFE9;color:#555;border-radius:999px;padding:1px 7px;margin:3px 3px 0 0}
  .tq-tira{display:flex;gap:3px}
  .tq-dia{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;font-size:10px;font-weight:700;color:#9A978F;background:#F1EFE9;box-sizing:border-box}
  .tq-dia.t{background:#1F1F1F;color:#fff}
  .tq-dia.s{box-shadow:inset 0 0 0 2px #3C7BD6;color:#3C7BD6}
  .tq-dia.t.s{box-shadow:inset 0 0 0 2px #3C7BD6;color:#fff}
  .tq-dia.f{background:transparent;color:#CFCCC4}
  .tq-dia.h:not(.t){color:#1F1F1F}
  .tq-faltas{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:8px}
  .tq-faltas.cuatro{grid-template-columns:repeat(4,minmax(0,1fr))}
  .tq-falta-card{display:flex;flex-wrap:wrap;align-items:baseline;column-gap:6px;row-gap:0;text-align:left;background:#fff;border:1.5px solid transparent;border-radius:12px;padding:6px 12px;cursor:pointer;font-family:inherit;color:#1F1F1F}
  .tq-falta-card b{font-size:17px;line-height:1.2}
  .tq-falta-card span{font-size:12.5px;font-weight:700}
  .tq-falta-card small{flex-basis:100%;font-size:11px;color:#7A7A7A;line-height:1.25}
  .tq-semfila{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px}
  .tq-semfila .tq-semsel{margin-top:0}
  .tq-semnav{display:inline-flex;align-items:center;gap:2px;background:#fff;border-radius:999px;padding:3px;box-shadow:0 1px 2px rgba(0,0,0,.05)}
  .tq-semnav .tq-semsel-b{padding:5px 11px}
  .tq-semnav .tq-semsel-b:disabled{opacity:.35;cursor:default}
  .tq-semnav select{border:0;background:transparent;font:inherit;font-size:13.5px;font-weight:700;color:#1F1F1F;padding:4px 6px;width:auto;cursor:pointer}
  .tq-buscar{position:relative;display:flex;align-items:center;max-width:420px;margin:2px 0 10px}
  .tq-buscar svg{position:absolute;left:13px;width:18px;height:18px;color:#8C8A84;pointer-events:none}
  .tq-buscar input{width:100%;height:42px;padding:0 38px 0 40px;border:1px solid #E2DED5;border-radius:999px;background:#fff;font:inherit;font-size:15px;color:#1F1F1F;outline:none}
  .tq-buscar input:focus{border-color:#1F1F1F;box-shadow:0 0 0 3px rgba(31,31,31,.08)} .tq-buscar input::-webkit-search-cancel-button{display:none}
  .tq-buscar button{position:absolute;right:8px;width:28px;height:28px;border:0;border-radius:99px;background:#F1EEE8;color:#5A5A5F;font-size:18px;line-height:1;cursor:pointer}
  .tq-filtros{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px}
  .tq-chips{display:flex;gap:5px;flex-wrap:wrap}
  .tq-orden{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:800;color:#8A8780;text-transform:none;letter-spacing:0;margin:0}
  .tq-orden select{width:auto;font:inherit;font-size:13px;font-weight:700;color:#1F1F1F;border-radius:999px;padding:6px 12px;border:1px solid #E4E0D8;background:#fff}
  .tq-falta-card.on{border-color:#1F1F1F}
  .tq-acc{display:grid;grid-template-columns:auto;gap:4px}
  .tq-wa-cel,.tq-vid-cel{cursor:pointer}
  .tq-wa-cel:hover,.tq-vid-cel:hover{background:#F7F5F0}
  .tq-wa-mas{color:#3C7BD6;font-weight:700;opacity:0}
  .tq-wa-cel:hover .tq-wa-mas,.tq-vid-cel:hover .tq-wa-mas{opacity:1}
  .tq-acc .cp-btn{padding:5px 10px;font-size:12px;text-align:center}
  .tq-tabla{min-width:1376px}
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
  .tq-semsel{display:inline-flex;gap:4px;background:#ECE9E1;border-radius:999px;padding:3px;margin-top:8px;flex-wrap:wrap}
  .tq-semsel-b{border:0;border-radius:999px;padding:6px 13px;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;background:transparent;color:#55565B}
  .tq-semsel-b.on{background:#fff;color:#1F1F1F;box-shadow:0 1px 3px rgba(0,0,0,.08)}
  .tq-hist-cel,.tq-nom-cel{cursor:pointer}
  .tq-hist-cel:hover{background:#F7F5F0}
  .tq-hs{display:flex;gap:4px}
  .tq-hw{width:108px;border-radius:10px;padding:5px 6px;background:#FAF9F6;border:1px solid #EEEAE1;box-sizing:border-box}
  .tq-hw.act{border-color:#3C7BD6}
  .tq-hw.sel{border-color:#1F1F1F}
  .tq-hw-t{display:flex;justify-content:space-between;gap:4px;font-size:10px;color:#8A8A8A;font-weight:700;margin-bottom:3px;white-space:nowrap}
  .tq-hw-t b{color:#1F1F1F}
  .tq-et{display:inline-block;font-size:10.5px;font-weight:700;border-radius:999px;padding:1px 6px;margin:0 2px 3px 0;line-height:1.35}
  .tq-et.az{background:#E3EEFB;color:#2F5FA6}.tq-et.na{background:#FDEBDD;color:#B25E1E}.tq-et.ve{background:#E2F1E5;color:#2F6B3C}
  .tq-et.gr{background:#EFEDE7;color:#55565B}.tq-et.ro{background:#FBE5E1;color:#B2402B}.tq-et.am{background:#F6EFD2;color:#7A6216}
  .tq-hi-sem{border-left:3px solid #E7E3DA;padding:2px 0 12px 12px;margin-left:2px}
  .tq-hi-sem.act{border-color:#3C7BD6}
  .tq-hi-h{font-size:13px;font-weight:800;color:#1F1F1F;margin-bottom:4px}
  .tq-hi-ev{font-size:13px;color:#1F1F1F;line-height:1.55}
  .tq-hi-ev.suyo{color:#2F5FA6}
  .tq-hi-ev.neutro{color:#8A8780}
  .tq-hi-ev span{display:inline-block;width:56px;color:#8A8A8A}
  .tq-hi-ev i{color:#9A978F}
  @media (max-width:760px){.tq-faltas,.tq-faltas.cuatro{grid-template-columns:1fr}.tq-que-g{grid-template-columns:1fr}}`;
  document.head.appendChild(s);
})();
