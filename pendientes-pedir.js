// =====================================================
// PENDIENTES POR PEDIR · la columna de Toques
// =====================================================
// Lo que le toca pedirle a cada cliente y en qué va cada cosa:
//   · Fotos, peso y medidas → SOLO cuando su app ya le mostró el
//     recordatorio (el que le pusiste en su calendario) y lleva 1 semana o
//     más sin hacerlo. Mientras está dentro de esa semana, la app se lo sigue
//     recordando y aquí no sale nada.
//   · Video de técnica → si empezó un ciclo nuevo y no ha mandado video
//                        desde entonces, o si lleva 6 semanas sin video.
// Cada una pasa por tres estados:
//   Toca pedir → («Pedir» o «Ya lo pedí») → Pedido → Entregado.
// «Entregado» se marca solo cuando llega por la app (sus fotos, su medición,
// su peso, el video revisado); si te lo mandó por WhatsApp, lo marcas tú con
// «Ya lo entregó». Lo pedido y lo marcado a mano queda en pedidos_cliente
// (migraciones/pedidos-cliente.sql). Sin la tabla, la columna igual calcula
// lo que toca pedir; solo no guarda «Ya lo pedí» ni «Ya lo entregó».
//
// Carga DESPUÉS de toques.js.
// =====================================================

const PP_DIAS = { video: 42 };
const PP_ESPERA = 7;        // días que se le da al recordatorio antes de pedírselo tú
const PP_VENTANA = 21;      // hasta cuántos días atrás se miran los recordatorios (los mismos que la app)
// El tipo del recordatorio del calendario → el pendiente.
const PP_DE_EVENTO = { fotos: 'fotos', peso: 'peso', medidas: 'medidas', medicion: 'medidas' };
const PP_NOMBRE = { video: 'Video', fotos: 'Fotos', peso: 'Peso', medidas: 'Medidas' };
const _pp = { crudo: null, sinTabla: false, cache: new Map() };
const ppDia = (v) => String(v || '').slice(0, 10);
const ppMax = (l) => l.filter(Boolean).sort().pop() || null;

// Lo que se lee (junto con lo de Toques, cada vez que se arma la vista).
async function ppCargar(clientes, vids) {
  const hoy = fmt.hoy(), desde = evtSumarDias(hoy, -400);
  const ids = clientes.map(c => c.id);
  const leer = async (q) => { try { const { data, error } = await q; return error ? null : (data || []); } catch (e) { return null; } };
  const [pedidos, fotos, meds, fases] = await Promise.all([
    leer(sb.from('pedidos_cliente').select('id, cliente_id, tipo, detalle, pedido_en, entregado_en, entregado_por').gte('pedido_en', desde)),
    leer(sb.from('fotos_progreso').select('cliente_id, fecha').gte('fecha', desde)),
    leer(sb.from('mediciones_corporales').select('cliente_id, fecha, peso').gte('fecha', desde)),
    leer(sb.from('fases').select('id, cliente_id, fecha_inicio, semanas, estado, visible_cliente, orden')),
  ]);
  _pp.sinTabla = pedidos === null;
  // El ciclo vigente de cada uno, y sus recordatorios de peso de esta semana.
  const vigente = {};
  ids.forEach(id => {
    const f = (fases || []).filter(x => String(x.cliente_id) === String(id));
    vigente[id] = typeof entCicloVigente === 'function' ? entCicloVigente(f, hoy) : null;
  });
  // Sus recordatorios de fotos, peso y medidas (los del calendario, que la
  // app le muestra) y lo que marcó de cada uno.
  const tipos = Object.keys(PP_DE_EVENTO);
  let eventos = (await leer(sb.from('eventos').select('id, cliente_id, fase_id, tipo, fecha, dias_semana, semanas, visible_cliente, fechas_excluidas').in('tipo', tipos)))
    || (await leer(sb.from('eventos').select('id, cliente_id, fase_id, tipo, fecha, dias_semana, semanas, visible_cliente').in('tipo', tipos))) || [];
  eventos = eventos.filter(e => ids.some(id => String(id) === String(e.cliente_id)));
  let registros = [];
  if (eventos.length) registros = (await leer(sb.from('evento_registros').select('evento_id, cliente_id, fecha, estado').in('evento_id', eventos.map(e => e.id)).gte('fecha', evtSumarDias(hoy, -PP_VENTANA - 1)))) || [];
  _pp.crudo = { pedidos: pedidos || [], fotos: fotos || [], meds: meds || [], vids: vids || [], vigente, eventos, registros };
  _pp.cache = new Map();
}

// Los días en que la app le mostró cada recordatorio (como expandirEventos de
// la app: los de fecha fija y los que se repiten en su ciclo vigente).
const PP_DIAS_COD = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
function ppOcurrencias(evs, fase, desde, hasta) {
  const out = [];
  evs.forEach(ev => {
    const visible = ev.visible_cliente == null ? !!(fase && fase.visible_cliente) : !!ev.visible_cliente;
    if (!visible) return;
    if (ev.fecha) { const f = ppDia(ev.fecha); if (f >= desde && f <= hasta) out.push({ ev, f }); return; }
    if (!fase || !fase.fecha_inicio || !fase.semanas || ev.fase_id !== fase.id) return;
    const quitados = new Set((ev.fechas_excluidas || []).map(ppDia));
    for (let sem = 1; sem <= fase.semanas; sem++) {
      if (Array.isArray(ev.semanas) && ev.semanas.length && !ev.semanas.includes(sem)) continue;
      (ev.dias_semana || []).forEach(c => {
        const off = PP_DIAS_COD.indexOf(c);
        if (off < 0) return;
        const f = evtSumarDias(ppDia(fase.fecha_inicio), (sem - 1) * 7 + off);
        if (f >= desde && f <= hasta && !quitados.has(f)) out.push({ ev, f });
      });
    }
  });
  return out.sort((a, b) => a.f.localeCompare(b.f));
}

// Los pendientes de un cliente: [{ tipo, estado: 'toca'|'pedido'|'entregado', detalle, video }]
function ppDe(clienteId) {
  if (!_pp.crudo) return [];
  const k = String(clienteId);
  if (_pp.cache.has(k)) return _pp.cache.get(k);
  const R = _pp.crudo, hoy = fmt.hoy(), lunes = tqLunes(hoy);
  const de = (l) => l.filter(x => String(x.cliente_id) === k);
  const peds = de(R.pedidos);
  const hace = (f) => tqEntre(f, hoy);
  const cuando = (f) => { const d = hace(f); return d === 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`; };
  const diaSem = (f) => { const t = new Date(f + 'T12:00:00Z'); return `${TQ_DSEM[t.getUTCDay()]} ${t.getUTCDate()}`; };
  const manual = (tipo) => peds.filter(p => p.tipo === tipo && p.entregado_en).map(p => ppDia(p.entregado_en));
  const abierto = (tipo, despuesDe) => peds.filter(p => p.tipo === tipo && !p.entregado_en && (!despuesDe || ppDia(p.pedido_en) >= despuesDe))
    .sort((a, b) => String(b.pedido_en).localeCompare(String(a.pedido_en)))[0] || null;
  const items = [];
  // Video: cada ejercicio pedido va por su lado («Ya lo entregó» es por
  // ejercicio). Cuando ya no queda ninguno por llegar: «Todos enviados».
  const vids = de(R.vids);
  const claveV = (x) => x.ejercicio_id || `n:${String(x.ejercicio_nombre || '').toLowerCase()}`;
  const ultV = {};
  vids.forEach(x => { const kk = claveV(x); const u = ultV[kk]; if (!u || String(x.pedido_en) > String(u.pedido_en)) ultV[kk] = x; });
  const pedsV = peds.filter(p => p.tipo === 'video');
  const esEj = (p) => String(p.detalle || '').startsWith('ej:');
  const manV = ppMax(pedsV.filter(p => p.entregado_en && !esEj(p) && p.detalle !== 'recordatorio').map(p => ppDia(p.entregado_en)));
  const manEj = {};
  pedsV.filter(p => p.entregado_en && esEj(p)).forEach(p => { const kk = String(p.detalle).slice(3); const f = ppDia(p.entregado_en); if (!manEj[kk] || f > manEj[kk]) manEj[kk] = f; });
  const porLlegar = Object.entries(ultV)
    .filter(([kk, x]) => x.estado === 'pedido' && !(manV && manV >= ppDia(x.pedido_en)) && !(manEj[kk] && manEj[kk] >= ppDia(x.pedido_en)))
    .map(([kk, x]) => ({ clave: kk, nombre: x.ejercicio_nombre || 'Video', pedido: ppDia(x.pedido_en) }))
    .sort((a, b) => a.pedido.localeCompare(b.pedido));
  const abiertoV = (filtro) => pedsV.filter(p => !p.entregado_en && filtro(p)).sort((a, b) => String(b.pedido_en).localeCompare(String(a.pedido_en)))[0] || null;
  const abV = abiertoV(p => p.detalle !== 'recordatorio' && !esEj(p));         // «Ya lo pedí» sin ejercicio
  const recV = abiertoV(p => p.detalle === 'recordatorio');                    // tu último «Recordar»
  const llegados = vids.filter(x => x.estado !== 'pedido');
  const entregasEj = Object.values(manEj);
  const ultLlegado = ppMax([...llegados.map(x => ppDia(x.revisado_en) || ppDia(x.pedido_en)), manV, ...entregasEj]);
  const abVVale = abV && (!ultLlegado || ppDia(abV.pedido_en) >= ultLlegado);
  if (porLlegar.length || abVVale) {
    // Pedido y sin llegar. Si ya pasó una semana desde que se lo pediste (o
    // desde tu último recordatorio), sale «Recordar».
    const ultPedido = ppMax([porLlegar.length ? porLlegar[porLlegar.length - 1].pedido : null, abVVale ? ppDia(abV.pedido_en) : null]);
    const recordado = recV && ppDia(recV.pedido_en) >= (ultPedido || '');
    const desde = recordado ? ppDia(recV.pedido_en) : ultPedido;
    const dias = hace(desde);
    const nombres = porLlegar.map(v => v.nombre);
    const base = { tipo: 'video', video: true, ejercicios: porLlegar.map(v => ({ ...v, dias: hace(v.pedido) })), ejercicio: nombres.join(', ') };
    const cuantos = porLlegar.length > 1 ? `${porLlegar.length} videos` : '';
    if (dias >= PP_ESPERA) items.push({ ...base, estado: 'recordar', detalle: `${cuantos ? `${cuantos} · ` : ''}${recordado ? 'se lo recordaste' : 'pedido'} hace ${dias} días y no ha llegado` });
    else items.push({ ...base, estado: 'pedido', detalle: `${cuantos ? `${cuantos} · ` : ''}${recordado ? 'se lo recordaste' : 'pedido'} ${cuando(desde)}` });
  } else {
    const revSemana = ppMax(llegados.map(x => ppDia(x.revisado_en)).filter(f => f >= lunes));
    const manSemana = ppMax([manV, ...entregasEj].filter(f => f && f >= lunes));
    const ciclo = R.vigente[k];
    const inicio = ciclo ? ppDia(ciclo.fecha_inicio) : null;
    const ultAlgo = ppMax([...vids.map(x => ppDia(x.pedido_en)), manV, ...entregasEj]);
    const fin = ppMax([manSemana, revSemana]);
    if (fin) items.push({ tipo: 'video', estado: 'entregado', todos: true, detalle: `Todos enviados · ${diaSem(fin)}. Ya puedes pedir nuevos` });
    else if (inicio && (!ultAlgo || ultAlgo < inicio)) items.push({ tipo: 'video', estado: 'toca', detalle: `Ciclo nuevo desde el ${fmt.fechaCorta(inicio)}, sin video` });
    else if (!ultAlgo) items.push({ tipo: 'video', estado: 'toca', detalle: 'Nunca ha mandado video' });
    else if (hace(ultAlgo) >= PP_DIAS.video) items.push({ tipo: 'video', estado: 'toca', detalle: `Último video hace ${Math.floor(hace(ultAlgo) / 7)} semanas` });
  }
  // Fotos, peso y medidas: según sus recordatorios de la app.
  const evsC = R.eventos.filter(e => String(e.cliente_id) === k);
  const ocurr = ppOcurrencias(evsC, R.vigente[k], evtSumarDias(hoy, -PP_VENTANA), hoy);
  const entregas = {   // lo que llegó por la app (fecha), por tipo
    fotos: de(R.fotos).map(x => ppDia(x.fecha)),
    medidas: de(R.meds).map(x => ppDia(x.fecha)),
    peso: de(R.meds).filter(x => x.peso != null).map(x => ppDia(x.fecha)),
  };
  ['fotos', 'peso', 'medidas'].forEach(tipo => {
    const lista = ocurr.filter(o => PP_DE_EVENTO[o.ev.tipo] === tipo);
    if (!lista.length) return;
    const man = manual(tipo);
    // Cómo quedó cada vez que se le mostró: lo marcó en la app, llegó el dato
    // (desde 3 días antes, como en la app), lo marcaste tú, o dijo que no puede.
    const estadoDe = (o) => {
      const reg = R.registros.find(r => r.evento_id === o.ev.id && ppDia(r.fecha) === o.f);
      if (reg && reg.estado === 'saltado') return { listo: true, salto: true };
      const auto = ppMax([reg && reg.estado === 'hecho' ? o.f : null, ...entregas[tipo].filter(f => f >= evtSumarDias(o.f, -3) && f <= hoy)].filter(Boolean));
      const mano = ppMax(man.filter(f => f >= o.f));
      if (auto || mano) return { listo: true, cuando: ppMax([auto, mano]), porTi: !auto };
      return { listo: false };
    };
    const vistas = lista.map(o => ({ ...o, ...estadoDe(o) }));
    const vencidas = vistas.filter(o => !o.listo && hace(o.f) >= PP_ESPERA);
    if (vencidas.length) {
      const o = vencidas[0];
      const ab = abierto(tipo, o.f);
      const n = vencidas.length;
      const que = tipo === 'fotos' ? 'sin subirlas' : tipo === 'peso' ? 'sin registrarlo' : 'sin registrarlas';
      if (ab) items.push({ tipo, estado: 'pedido', detalle: `Pedido ${cuando(ppDia(ab.pedido_en))} · recordatorio del ${diaSem(o.f)}` });
      else items.push({ tipo, estado: 'toca', detalle: `Su app se lo recordó el ${diaSem(o.f)}: lleva ${hace(o.f)} días ${que}${n > 1 ? ` · ${n} recordatorios sin hacer` : ''}` });
      return;
    }
    // Lo último que se le recordó, ya hecho esta semana: entregado.
    const ult = vistas.filter(o => o.listo && !o.salto && o.cuando && o.cuando >= lunes).pop();
    if (ult) items.push({ tipo, estado: 'entregado', detalle: `${diaSem(ult.cuando)} · ${ult.porTi ? 'marcado por ti' : 'llegó por la app'}` });
  });
  _pp.cache.set(k, items);
  return items;
}

const PP_TONO = { toca: ['#FCEBDD', '#B4541D', 'Toca pedir'], recordar: ['#FDECEA', '#B4321F', 'Recordar'], pedido: ['#EFEDE7', '#55565B', 'Pedido'], entregado: ['#E6F2E9', '#2F7F45', 'Entregado'] };
function ppCelda(f) {
  if (f.estado === 'pausa') return '<span class="tq-cero">—</span>';
  const items = ppDe(f.c.id);
  if (!items.length) return '<span class="pp-nada">Nada pendiente</span>';
  const id = f.c.id;
  return items.map(x => {
    const [bg, col, t] = PP_TONO[x.estado];
    const b = (txt, oscuro, attr, fn) => `<button type="button" class="pp-b${oscuro ? ' o' : ''}" ${attr} onclick="${fn}">${txt}</button>`;
    let btn = '';
    if (x.estado === 'toca') btn = b('Pedir', true, `data-pp-pedir="${x.tipo}"`, `ppPedir('${id}','${x.tipo}')`) + b('Ya lo pedí', false, `data-pp-yapedi="${x.tipo}"`, `ppYaPedi('${id}','${x.tipo}')`);
    else if (x.estado === 'recordar') btn = b('Recordar', true, `data-pp-recordar="${x.tipo}"`, `ppRecordar('${id}','${x.tipo}')`);
    if ((x.estado === 'pedido' || x.estado === 'recordar') && !(x.ejercicios && x.ejercicios.length)) btn += b('Ya lo entregó', false, `data-pp-entrego="${x.tipo}"`, `ppEntrego('${id}','${x.tipo}')`);
    if (x.todos) btn = b('Pedir nuevos', true, 'data-pp-nuevos="video"', `ppPedir('${id}','video')`);
    // Los videos pedidos, uno por ejercicio, cada uno con su «Ya lo entregó».
    const ejs = (x.ejercicios || []).map(v => `<div class="pp-ej" data-pp-ej="${escapeHtml(v.clave)}"><span>${escapeHtml(v.nombre)}<i>pedido ${v.dias === 0 ? 'hoy' : v.dias === 1 ? 'ayer' : `hace ${v.dias} días`}</i></span>${b('Ya lo entregó', false, `data-pp-entrego-ej="${escapeHtml(v.clave)}"`, `ppEntrego('${id}','video','${encodeURIComponent(v.clave)}')`)}</div>`).join('');
    return `<div class="pp-it" data-pp="${x.tipo}" data-pp-estado="${x.estado}"><div class="pp-h"><b>${PP_NOMBRE[x.tipo]}</b><span class="pp-e" style="background:${bg};color:${col}">${x.todos ? 'Todos enviados' : t}</span></div><div class="pp-d">${x.detalle}</div>${ejs ? `<div class="pp-ejs">${ejs}</div>` : ''}${btn ? `<div class="pp-bs">${btn}</div>` : ''}</div>`;
  }).join('');
}

// ── Acciones ─────────────────────────────────────────────────────────────
const PP_MSJ = {
  fotos: (n) => `Hola ${n}, ¿cómo vas? Cuando puedas, súbeme tus fotos de progreso en la app (frente, perfil y espalda), o me las mandas por acá. Así comparamos cómo vas.`,
  medidas: (n) => `Hola ${n}, ¿cómo vas? Toca medirnos: cuando puedas, registra tus medidas en la app, o me las mandas por acá.`,
  peso: (n) => `Hola ${n}, ¿cómo vas? Cuando puedas, registra tu peso de esta semana en la app, o me lo mandas por acá.`,
};
function ppAvisoTabla() { toast('Falta correr migraciones/pedidos-cliente.sql en Supabase'); }
function ppRepintar() { _tq.datos = null; _tq.leido = 0; if (_currentView === 'toques') rerenderView(); }
async function ppGuardar(fila) {
  try {
    const { error } = await sb.from('pedidos_cliente').insert(fila);
    if (error) { if (/pedidos_cliente|relation|schema cache/i.test(error.message || '')) { _pp.sinTabla = true; ppAvisoTabla(); } else toast('No pude guardarlo'); return false; }
    return true;
  } catch (e) { toast('No pude guardarlo'); return false; }
}
window.ppYaPedi = async (id, tipo) => {
  if (await ppGuardar({ cliente_id: id, tipo, pedido_en: new Date().toISOString() })) { toast(`Listo: ${PP_NOMBRE[tipo].toLowerCase()} quedó como pedido`); ppRepintar(); }
};
window.ppPedir = async (id, tipo) => {
  // El video se pide como siempre (eligiendo el ejercicio): queda como pedido solo.
  if (tipo === 'video') return tqPedirVideo(id);
  const f = _tq.datos && _tq.datos.filas.find(x => String(x.c.id) === String(id));
  const c = (f && f.c) || await db.clientes.get(id);
  const tel = String((c && c.telefono) || '').replace(/\D/g, '');
  if (!tel) return toast('No tiene teléfono guardado. Si se lo pediste por otro lado, toca «Ya lo pedí».');
  const nombre = String((c && c.nombre) || '').trim().split(/\s+/)[0] || '';
  window.open(`https://wa.me/${tel}?text=${encodeURIComponent(PP_MSJ[tipo](nombre))}`, '_blank', 'noopener');
  if (await ppGuardar({ cliente_id: id, tipo, pedido_en: new Date().toISOString() })) ppRepintar();
};
// «Recordar» (un pedido de hace una semana o más que no ha llegado): abre su
// WhatsApp con el recordatorio y la semana vuelve a contar desde hoy.
window.ppRecordar = async (id, tipo) => {
  const f = _tq.datos && _tq.datos.filas.find(x => String(x.c.id) === String(id));
  const c = (f && f.c) || await db.clientes.get(id);
  const tel = String((c && c.telefono) || '').replace(/\D/g, '');
  if (!tel) return toast('No tiene teléfono guardado');
  const nombre = String((c && c.nombre) || '').trim().split(/\s+/)[0] || '';
  const it = ppDe(id).find(x => x.tipo === tipo);
  const n = it && it.ejercicios ? it.ejercicios.length : 0;
  const ej = it && it.ejercicio ? ` de ${it.ejercicio}` : '';
  const msj = `Hola ${nombre}, ¿cómo vas? Te recuerdo ${n > 1 ? 'los videos' : 'el video'}${ej} que te pedí. Cuando puedas, ${n > 1 ? 'súbelos' : 'súbelo'} en la app (o me ${n > 1 ? 'los' : 'lo'} mandas por acá) y te digo cómo vas.`;
  window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msj)}`, '_blank', 'noopener');
  if (await ppGuardar({ cliente_id: id, tipo, detalle: 'recordatorio', pedido_en: new Date().toISOString() })) ppRepintar();
};
window.ppEntrego = async (id, tipo, claveEj = null) => {
  const ahora = new Date().toISOString();
  // Un video en particular (por ejercicio): queda entregado solo ese.
  if (claveEj) {
    const clave = decodeURIComponent(claveEj);
    const it = ppDe(id).find(x => x.tipo === 'video');
    const v = it && (it.ejercicios || []).find(e => e.clave === clave);
    if (await ppGuardar({ cliente_id: id, tipo: 'video', detalle: `ej:${clave}`, pedido_en: v ? `${v.pedido}T12:00:00Z` : ahora, entregado_en: ahora, entregado_por: 'coach' })) {
      const quedan = it ? (it.ejercicios || []).filter(e => e.clave !== clave).length : 0;
      toast(quedan ? `Listo: ${v ? v.nombre : 'ese video'} entregado · quedan ${quedan}` : 'Listo: todos los videos enviados');
      ppRepintar();
    }
    return;
  }
  const ab = _pp.crudo && _pp.crudo.pedidos.filter(p => String(p.cliente_id) === String(id) && p.tipo === tipo && !p.entregado_en)
    .sort((a, b) => String(b.pedido_en).localeCompare(String(a.pedido_en)))[0];
  try {
    const { error } = ab
      ? await sb.from('pedidos_cliente').update({ entregado_en: ahora, entregado_por: 'coach' }).eq('id', ab.id)
      : await sb.from('pedidos_cliente').insert({ cliente_id: id, tipo, pedido_en: ahora, entregado_en: ahora, entregado_por: 'coach' });
    if (error) { if (/pedidos_cliente|relation|schema cache/i.test(error.message || '')) { _pp.sinTabla = true; ppAvisoTabla(); } else toast('No pude guardarlo'); return; }
  } catch (e) { toast('No pude guardarlo'); return; }
  toast(`Listo: ${PP_NOMBRE[tipo].toLowerCase()} entregado`);
  ppRepintar();
};

(function () {
  const s = document.createElement('style');
  s.textContent = `
  .tq-tabla td[data-tq="pendientes"]{min-width:200px;vertical-align:top}
  .pp-it{padding:5px 0;border-bottom:1px dashed #ECE9E2}
  .pp-it:last-child{border-bottom:0}
  .pp-h{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  .pp-h b{font-size:12.5px;color:#1F1F1F}
  .pp-e{font-size:11px;font-weight:700;border-radius:999px;padding:1px 7px;white-space:nowrap}
  .pp-d{font-size:11.5px;color:#6B6B6B;margin-top:2px;line-height:1.35}
  .pp-bs{display:flex;gap:5px;margin-top:5px;flex-wrap:wrap}
  .pp-b{border:0;border-radius:999px;padding:4px 10px;font:inherit;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;background:#F1EFE9;color:#1F1F1F}
  .pp-b.o{background:#1F1F1F;color:#fff}
  .pp-nada{font-size:12.5px;font-weight:700;color:#2F7F45}
  .pp-ejs{margin-top:4px}
  .pp-ej{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:3px 0;font-size:12px;color:#1F1F1F}
  .pp-ej i{display:block;font-style:normal;font-size:11px;color:#8A8A8A}
  .pp-ej .pp-b{padding:3px 9px;font-size:11px}`;
  document.head.appendChild(s);
})();
