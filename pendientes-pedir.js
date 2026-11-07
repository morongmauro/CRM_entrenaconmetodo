// =====================================================
// PENDIENTES POR PEDIR · la columna de Toques
// =====================================================
// Lo que le toca pedirle a cada cliente y en qué va cada cosa:
//   · Fotos de progreso → cada 30 días (desde las últimas que subió).
//   · Medidas           → cada 30 días (desde su última medición).
//   · Peso              → según su recordatorio de peso de esta semana.
//   · Video de técnica  → si empezó un ciclo nuevo y no ha mandado video
//                         desde entonces, o si lleva 6 semanas sin video.
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

const PP_DIAS = { fotos: 30, medidas: 30, video: 42 };
const PP_NOMBRE = { video: 'Video', fotos: 'Fotos', peso: 'Peso', medidas: 'Medidas' };
const _pp = { crudo: null, sinTabla: false, cache: new Map() };
const ppDia = (v) => String(v || '').slice(0, 10);
const ppMax = (l) => l.filter(Boolean).sort().pop() || null;
const PP_LETRA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

// Lo que se lee (junto con lo de Toques, cada vez que se arma la vista).
async function ppCargar(clientes, vids) {
  const hoy = fmt.hoy(), desde = evtSumarDias(hoy, -400);
  const ids = clientes.map(c => c.id);
  const leer = async (q) => { try { const { data, error } = await q; return error ? null : (data || []); } catch (e) { return null; } };
  const [pedidos, fotos, meds, fases] = await Promise.all([
    leer(sb.from('pedidos_cliente').select('id, cliente_id, tipo, detalle, pedido_en, entregado_en, entregado_por').gte('pedido_en', desde)),
    leer(sb.from('fotos_progreso').select('cliente_id, fecha').gte('fecha', desde)),
    leer(sb.from('mediciones_corporales').select('cliente_id, fecha, peso').gte('fecha', desde)),
    leer(sb.from('fases').select('id, cliente_id, fecha_inicio, estado, visible_cliente, orden')),
  ]);
  _pp.sinTabla = pedidos === null;
  // El ciclo vigente de cada uno, y sus recordatorios de peso de esta semana.
  const vigente = {};
  ids.forEach(id => {
    const f = (fases || []).filter(x => String(x.cliente_id) === String(id));
    vigente[id] = typeof entCicloVigente === 'function' ? entCicloVigente(f, hoy) : null;
  });
  const faseIds = Object.values(vigente).filter(Boolean).map(f => f.id);
  let eventos = [], registros = [];
  if (faseIds.length) {
    eventos = (await leer(sb.from('eventos').select('id, cliente_id, fase_id, tipo, fecha, dias_semana').in('fase_id', faseIds))) || [];
    eventos = eventos.filter(e => e.tipo === 'peso');
    if (eventos.length) registros = (await leer(sb.from('evento_registros').select('evento_id, cliente_id, fecha, estado').in('evento_id', eventos.map(e => e.id)).gte('fecha', evtSumarDias(hoy, -7)))) || [];
  }
  _pp.crudo = { pedidos: pedidos || [], fotos: fotos || [], meds: meds || [], vids: vids || [], vigente, eventos, registros };
  _pp.cache = new Map();
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
  // Fotos y medidas: la última entrega (por la app o marcada por ti).
  const porPlazo = (tipo, autos, nunca, ultTexto) => {
    const auto = ppMax(autos), man = ppMax(manual(tipo)), ult = ppMax([auto, man]);
    const ab = abierto(tipo, null);
    if (ab && (!ult || ppDia(ab.pedido_en) >= ult)) return { tipo, estado: 'pedido', detalle: `Pedido ${cuando(ppDia(ab.pedido_en))}` };
    if (ult && ult >= lunes) return { tipo, estado: 'entregado', detalle: `${diaSem(ult)} · ${ult === auto ? 'llegó por la app' : 'marcado por ti'}` };
    if (!ult) return { tipo, estado: 'toca', detalle: nunca };
    if (hace(ult) >= PP_DIAS[tipo]) return { tipo, estado: 'toca', detalle: ultTexto(hace(ult)) };
    return null;
  };
  const items = [];
  // Video
  const vids = de(R.vids);
  const ultV = {};
  vids.forEach(x => { const kk = x.ejercicio_id || `n:${String(x.ejercicio_nombre || '').toLowerCase()}`; const u = ultV[kk]; if (!u || String(x.pedido_en) > String(u.pedido_en)) ultV[kk] = x; });
  const manV = ppMax(manual('video'));
  const porLlegar = Object.values(ultV).filter(x => x.estado === 'pedido' && !(manV && manV >= ppDia(x.pedido_en))).sort((a, b) => String(b.pedido_en).localeCompare(String(a.pedido_en)));
  const abV = abierto('video', null);
  const llegados = vids.filter(x => x.estado !== 'pedido');
  const ultLlegado = ppMax([...llegados.map(x => ppDia(x.revisado_en) || ppDia(x.pedido_en)), manV]);
  if (porLlegar.length) items.push({ tipo: 'video', estado: 'pedido', video: true, detalle: `${escapeHtml(porLlegar[0].ejercicio_nombre || 'Video')} · ${cuando(ppDia(porLlegar[0].pedido_en))}${porLlegar.length > 1 ? ` · y ${porLlegar.length - 1} más` : ''}` });
  else if (abV && (!ultLlegado || ppDia(abV.pedido_en) >= ultLlegado)) items.push({ tipo: 'video', estado: 'pedido', detalle: `Pedido ${cuando(ppDia(abV.pedido_en))}` });
  else {
    const revSemana = ppMax(llegados.map(x => ppDia(x.revisado_en)).filter(f => f >= lunes));
    const ciclo = R.vigente[k];
    const inicio = ciclo ? ppDia(ciclo.fecha_inicio) : null;
    const ultAlgo = ppMax([...vids.map(x => ppDia(x.pedido_en)), manV]);
    if (manV && manV >= lunes) items.push({ tipo: 'video', estado: 'entregado', detalle: `${diaSem(manV)} · marcado por ti` });
    else if (revSemana) items.push({ tipo: 'video', estado: 'entregado', detalle: `${diaSem(revSemana)} · llegó por la app` });
    else if (inicio && (!ultAlgo || ultAlgo < inicio)) items.push({ tipo: 'video', estado: 'toca', detalle: `Ciclo nuevo desde el ${fmt.fechaCorta(inicio)}, sin video` });
    else if (!ultAlgo) items.push({ tipo: 'video', estado: 'toca', detalle: 'Nunca ha mandado video' });
    else if (hace(ultAlgo) >= PP_DIAS.video) items.push({ tipo: 'video', estado: 'toca', detalle: `Último video hace ${Math.floor(hace(ultAlgo) / 7)} semanas` });
  }
  // Fotos
  const fotos = porPlazo('fotos', de(R.fotos).map(x => ppDia(x.fecha)), 'Nunca ha subido fotos', (d) => `Últimas fotos hace ${d} días`);
  if (fotos) items.push(fotos);
  // Peso: el recordatorio de esta semana (hasta hoy).
  const evs = R.eventos.filter(e => String(e.cliente_id) === k);
  if (evs.length) {
    const ocurr = [];
    evs.forEach(e => {
      if (e.fecha) { const f = ppDia(e.fecha); if (f >= lunes && f <= hoy) ocurr.push([e.id, f]); }
      (e.dias_semana || []).forEach(l => { const i = PP_LETRA.indexOf(l); const f = i >= 0 ? evtSumarDias(lunes, i) : null; if (f && f <= hoy) ocurr.push([e.id, f]); });
    });
    if (ocurr.length) {
      ocurr.sort((a, b) => a[1].localeCompare(b[1]));
      const pesos = de(R.meds).filter(m => m.peso != null).map(m => ppDia(m.fecha));
      const hecho = ([id, f]) => R.registros.some(r => r.evento_id === id && ppDia(r.fecha) === f && r.estado === 'hecho') || pesos.some(p => p >= f && p <= hoy);
      const man = manual('peso').filter(f => f >= lunes);
      const falta = ocurr.filter(o => !hecho(o) && !man.some(m => m >= o[1])).pop();
      if (falta) {
        const ab = abierto('peso', falta[1]);
        items.push(ab ? { tipo: 'peso', estado: 'pedido', detalle: `Pedido ${cuando(ppDia(ab.pedido_en))} · el de ${diaSem(falta[1])}` }
          : { tipo: 'peso', estado: 'toca', detalle: `El de ${diaSem(falta[1])} · sin registrar` });
      } else {
        const ult = ocurr[ocurr.length - 1][1];
        const manOk = man.some(m => m >= ult) && !hecho(ocurr[ocurr.length - 1]);
        items.push({ tipo: 'peso', estado: 'entregado', detalle: `El de ${diaSem(ult)} · ${manOk ? 'marcado por ti' : 'llegó por la app'}` });
      }
    }
  }
  // Medidas
  const medidas = porPlazo('medidas', de(R.meds).map(x => ppDia(x.fecha)), 'Nunca se ha medido', (d) => `Última medición hace ${d} días`);
  if (medidas) items.push(medidas);
  _pp.cache.set(k, items);
  return items;
}

const PP_TONO = { toca: ['#FCEBDD', '#B4541D', 'Toca pedir'], pedido: ['#EFEDE7', '#55565B', 'Pedido'], entregado: ['#E6F2E9', '#2F7F45', 'Entregado'] };
function ppCelda(f) {
  if (f.estado === 'pausa') return '<span class="tq-cero">—</span>';
  const items = ppDe(f.c.id);
  if (!items.length) return '<span class="pp-nada">Nada pendiente</span>';
  const id = f.c.id;
  return items.map(x => {
    const [bg, col, t] = PP_TONO[x.estado];
    const btn = x.estado === 'toca'
      ? `<button type="button" class="pp-b o" data-pp-pedir="${x.tipo}" onclick="ppPedir('${id}','${x.tipo}')">Pedir</button><button type="button" class="pp-b" data-pp-yapedi="${x.tipo}" onclick="ppYaPedi('${id}','${x.tipo}')">Ya lo pedí</button>`
      : x.estado === 'pedido' ? `<button type="button" class="pp-b" data-pp-entrego="${x.tipo}" onclick="ppEntrego('${id}','${x.tipo}')">Ya lo entregó</button>` : '';
    return `<div class="pp-it" data-pp="${x.tipo}" data-pp-estado="${x.estado}"><div class="pp-h"><b>${PP_NOMBRE[x.tipo]}</b><span class="pp-e" style="background:${bg};color:${col}">${t}</span></div><div class="pp-d">${x.detalle}</div>${btn ? `<div class="pp-bs">${btn}</div>` : ''}</div>`;
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
window.ppEntrego = async (id, tipo) => {
  const ahora = new Date().toISOString();
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
  .pp-nada{font-size:12.5px;font-weight:700;color:#2F7F45}`;
  document.head.appendChild(s);
})();
