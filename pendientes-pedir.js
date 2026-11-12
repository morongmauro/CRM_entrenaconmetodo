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
// Lo que no hizo no se apaga por tiempo: sigue saliendo (junto con los
// recordatorios que lleguen después) hasta que lo haga o lo marques. Se mira
// hasta medio año atrás, también en ciclos que ya terminaron.
const PP_HISTORIA = 180;
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
    leer(sb.from('fases').select('id, cliente_id, nombre, fecha_inicio, semanas, estado, visible_cliente, orden')),
  ]);
  // Lo que anota la app (app_uso): si ya le salió la ventana de la última
  // semana del ciclo (secciones.aviso_ciclo = id del ciclo).
  let uso = null;
  try {
    if (typeof mtApiGet === 'function' && typeof mtApiBase === 'function' && mtApiBase()) {
      const r = await mtApiGet('/api/coach-data?action=uso');
      uso = r && r.ok && Array.isArray(r.uso) ? r.uso : null;
    }
  } catch (e) { uso = null; }
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
  if (eventos.length) registros = (await leer(sb.from('evento_registros').select('evento_id, cliente_id, fecha, estado').in('evento_id', eventos.map(e => e.id)).gte('fecha', evtSumarDias(hoy, -PP_HISTORIA - 1)))) || [];
  // Todos sus ciclos (no solo el de ahora): lo que quedó sin hacer en el
  // anterior no se pierde al cambiar de ciclo.
  const fasesDe = {};
  ids.forEach(id => { fasesDe[id] = (fases || []).filter(x => String(x.cliente_id) === String(id) && x.estado !== 'archivada'); });
  // Los ejercicios de su ciclo vigente: un video pedido de un ejercicio que
  // ya no está queda «en pausa» (la app no se lo pide; si vuelve, vuelve).
  const cicloEjs = {};
  const faseIds = Object.values(vigente).filter(Boolean).map(f => f.id);
  if (faseIds.length) {
    const ruts = ((await leer(sb.from('rutinas').select('id, fase_id, archivada').in('fase_id', faseIds))) || []).filter(r => r.archivada !== true);
    const res = ruts.length ? ((await leer(sb.from('rutina_ejercicios').select('rutina_id, ejercicio_id').in('rutina_id', ruts.map(r => r.id)))) || null) : [];
    if (res) {
      const clienteDeFase = {};
      Object.entries(vigente).forEach(([cid, f]) => { if (f) clienteDeFase[f.id] = cid; });
      ruts.forEach(r => { const cid = clienteDeFase[r.fase_id]; if (cid && !cicloEjs[cid]) cicloEjs[cid] = new Set(); });
      const faseDe = Object.fromEntries(ruts.map(r => [r.id, r.fase_id]));
      res.forEach(x => { const cid = clienteDeFase[faseDe[x.rutina_id]]; if (cid && x.ejercicio_id) cicloEjs[cid].add(String(x.ejercicio_id)); });
      // Una ficha repetida que cambiaste en sus rutinas (Galería): sus videos
      // pedidos cuentan como de la ficha nueva, no quedan en pausa.
      const viejas = (await leer(sb.from('ejercicios').select('id, duplicado_de').eq('archivado', true).not('duplicado_de', 'is', null))) || [];
      viejas.forEach(v => Object.values(cicloEjs).forEach(st => { if (st.has(String(v.duplicado_de))) st.add(String(v.id)); }));
    }
  }
  _pp.crudo = { pedidos: pedidos || [], fotos: fotos || [], meds: meds || [], vids: vids || [], vigente, fasesDe, eventos, registros, uso, clientes, cicloEjs };
  _pp.cache = new Map();
}

// Los días en que la app le mostró cada recordatorio (como expandirEventos de
// la app: los de fecha fija y los que se repiten en su ciclo vigente).
const PP_DIAS_COD = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
// `fases`: todos sus ciclos; `vigente`: el de ahora. Los que se repiten en un
// ciclo que ya terminó cuentan si ese ciclo se le mandó (no borrador).
function ppOcurrencias(evs, fases, vigente, desde, hasta) {
  const out = [];
  const lista = Array.isArray(fases) ? fases : (fases ? [fases] : []);
  evs.forEach(ev => {
    const fase = ev.fase_id ? (lista.find(f => String(f.id) === String(ev.fase_id)) || null) : vigente;
    const esVigente = !!(fase && vigente && String(fase.id) === String(vigente.id));
    const visibleFase = fase ? (esVigente ? !!fase.visible_cliente : (!!fase.visible_cliente || fase.estado !== 'borrador')) : false;
    const visible = ev.visible_cliente == null ? visibleFase : !!ev.visible_cliente;
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
  const enCiclo = R.cicloEjs ? R.cicloEjs[k] : null;   // null: no se sabe (sin ciclo): nada queda en pausa
  const fuera = (x) => !!(enCiclo && x.ejercicio_id && !enCiclo.has(String(x.ejercicio_id)));
  const sinLlegar = Object.entries(ultV)
    .filter(([kk, x]) => x.estado === 'pedido' && !(manV && manV >= ppDia(x.pedido_en)) && !(manEj[kk] && manEj[kk] >= ppDia(x.pedido_en)))
    .map(([kk, x]) => ({ clave: kk, nombre: x.ejercicio_nombre || 'Video', pedido: ppDia(x.pedido_en), fuera: fuera(x) }))
    .sort((a, b) => a.pedido.localeCompare(b.pedido));
  const porLlegar = sinLlegar.filter(v => !v.fuera);
  const enPausa = sinLlegar.filter(v => v.fuera);
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
    // El resumen de la celda: de esta tanda (desde el pedido más viejo que
    // falta), cuántos entregó y cuál falta.
    const ronda = porLlegar.length ? Object.values(ultV).filter(x => ppDia(x.pedido_en) >= porLlegar[0].pedido).length : 0;
    const entrego = Math.max(0, ronda - porLlegar.length);
    base.resumen = porLlegar.length
      ? { linea: entrego ? `Entregó ${entrego} de ${ronda}` : `Pedí ${ronda}`, sub: `falta ${porLlegar[0].nombre}${porLlegar.length > 1 ? ` y ${porLlegar.length - 1} más` : ''} · ${recordado ? 'se lo recordaste' : 'pedido'} ${cuando(desde)}` }
      : { linea: 'Pedí videos', sub: `${recordado ? 'se lo recordaste' : 'pedido'} ${cuando(desde)}` };
    if (dias >= PP_ESPERA) items.push({ ...base, estado: 'recordar', detalle: `${cuantos ? `${cuantos} · ` : ''}${recordado ? 'se lo recordaste' : 'pedido'} hace ${dias} días y no ha llegado` });
    else items.push({ ...base, estado: 'pedido', detalle: `${cuantos ? `${cuantos} · ` : ''}${recordado ? 'se lo recordaste' : 'pedido'} ${cuando(desde)}` });
  } else {
    const revSemana = ppMax(llegados.map(x => ppDia(x.revisado_en)).filter(f => f >= lunes));
    const manSemana = ppMax([manV, ...entregasEj].filter(f => f && f >= lunes));
    const ciclo = R.vigente[k];
    const inicio = ciclo ? ppDia(ciclo.fecha_inicio) : null;
    const ultAlgo = ppMax([...vids.map(x => ppDia(x.pedido_en)), manV, ...entregasEj]);
    const fin = ppMax([manSemana, revSemana]);
    if (fin) items.push({ tipo: 'video', estado: 'entregado', todos: true, detalle: `Todos enviados · ${diaSem(fin)}. Ya puedes pedir nuevos`, resumen: { linea: 'Todos entregados', sub: `${diaSem(fin)} · ya puedes pedir nuevos` } });
    else if (inicio && (!ultAlgo || ultAlgo < inicio)) items.push({ tipo: 'video', estado: 'toca', detalle: `Ciclo nuevo desde el ${fmt.fechaCorta(inicio)}, sin video`, resumen: { linea: 'No le has pedido', sub: `ciclo nuevo desde el ${fmt.fechaCorta(inicio)}` } });
    else if (!ultAlgo) items.push({ tipo: 'video', estado: 'toca', detalle: 'Nunca ha mandado video', resumen: { linea: 'No le has pedido', sub: 'nunca ha mandado video' } });
    else if (hace(ultAlgo) >= PP_DIAS.video) items.push({ tipo: 'video', estado: 'toca', detalle: `Último video hace ${Math.floor(hace(ultAlgo) / 7)} semanas`, resumen: { linea: 'Sin videos recientes', sub: `el último hace ${Math.floor(hace(ultAlgo) / 7)} semanas` } });
    else if (ultAlgo) items.push({ tipo: 'video', estado: 'aldia', detalle: 'Al día', resumen: { linea: 'Al día', sub: `el último ${cuando(ultAlgo)}` } });
  }
  if (enPausa.length) {
    const it = items.find(x => x.tipo === 'video');
    const nota = `${enPausa.length} en pausa (fuera de su ciclo)`;
    if (it && it.resumen) it.resumen.sub = it.resumen.sub ? `${it.resumen.sub} · ${nota}` : nota;
    else if (!it) items.push({ tipo: 'video', estado: 'aldia', detalle: nota, resumen: { linea: 'En pausa', sub: `${enPausa[0].nombre}${enPausa.length > 1 ? ` y ${enPausa.length - 1} más` : ''} ya no está en su ciclo` } });
  }
  // Fotos, peso y medidas: según sus recordatorios de la app.
  const evsC = R.eventos.filter(e => String(e.cliente_id) === k);
  const ocurr = ppOcurrencias(evsC, (R.fasesDe && R.fasesDe[k]) || [], R.vigente[k], evtSumarDias(hoy, -PP_HISTORIA), hoy);
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
    // Cuenta lo que vino DESPUÉS de la última vez que lo hizo (o lo marcaste):
    // cada recordatorio nuevo sin hacer se junta con los anteriores en UNA
    // sola línea, y no se apaga por tiempo. Sale cuando el más viejo lleva
    // 7 días (antes, su app se lo sigue recordando).
    const iListo = vistas.map(o => !!o.listo).lastIndexOf(true);
    const sinHacer = vistas.slice(iListo + 1).filter(o => !o.listo);
    if (sinHacer.length && hace(sinHacer[0].f) >= PP_ESPERA) {
      const o0 = sinHacer[0], oN = sinHacer[sinHacer.length - 1], n = sinHacer.length;
      const que = tipo === 'fotos' ? 'sin subirlas' : tipo === 'peso' ? 'sin registrarlo' : 'sin registrarlas';
      const y = (l) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} y ${l[l.length - 1]}` : l[0]);
      const cuales = n <= 3 ? ` (${y(sinHacer.map(o => diaSem(o.f)))})` : ` (desde el ${fmt.fechaCorta(o0.f)})`;
      const extra = n > 1 ? ` · <b>${n} recordatorios sin hacer</b>${cuales}` : '';
      // Lo que le pediste (o le recordaste) después del primero sin hacer.
      const ultimo = (filtro) => peds.filter(p => p.tipo === tipo && !p.entregado_en && ppDia(p.pedido_en) >= o0.f && filtro(p))
        .sort((a, b) => String(b.pedido_en).localeCompare(String(a.pedido_en)))[0] || null;
      const ped = ultimo(p => p.detalle !== 'recordatorio'), rec = ultimo(p => p.detalle === 'recordatorio');
      if (ped || rec) {
        const recordado = !!rec && (!ped || ppDia(rec.pedido_en) >= ppDia(ped.pedido_en));
        const desde = ppDia((recordado ? rec : ped).pedido_en);
        const base = `${recordado ? 'Se lo recordaste' : 'Se lo pediste'} ${cuando(desde)}`;
        // Una semana sin llegar desde que se lo pediste (o recordaste): «Recordar».
        if (hace(desde) >= PP_ESPERA) items.push({ tipo, estado: 'recordar', detalle: `${base} y no ha llegado${extra}` });
        else items.push({ tipo, estado: 'pedido', detalle: `${base}${extra}` });
      } else items.push({ tipo, estado: 'toca', detalle: `Su app se lo recordó el ${diaSem(oN.f)}: lleva ${hace(oN.f)} ${hace(oN.f) === 1 ? 'día' : 'días'} ${que}${extra}` });
      return;
    }
    // Lo último que se le recordó, ya hecho esta semana: entregado.
    const ult = vistas.filter(o => o.listo && !o.salto && o.cuando && o.cuando >= lunes).pop();
    if (ult) items.push({ tipo, estado: 'entregado', detalle: `${diaSem(ult.cuando)} · ${ult.porTi ? 'marcado por ti' : 'llegó por la app'}` });
  });
  _pp.cache.set(k, items);
  return items;
}

// ── La columna «Ciclo»: qué semana va, cuánto le falta y el aviso de cambio ──
// El aviso es la ventana que la app le muestra una vez, el primer día que
// abre la app dentro de la última semana del ciclo.
const ppNorm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
// Días que le faltan al ciclo vigente (para ordenar «Ciclo por vencer»).
function ppFaltanCiclo(c) {
  const R = _pp.crudo;
  const f = R && R.vigente ? R.vigente[String(c.id)] || R.vigente[c.id] : null;
  if (!f || !f.fecha_inicio) return null;
  return tqEntre(fmt.hoy(), evtSumarDias(ppDia(f.fecha_inicio), Math.max(1, Number(f.semanas) || 1) * 7 - 1));
}
function ppCiclo(c) {
  const R = _pp.crudo;
  const f = R && R.vigente ? R.vigente[String(c.id)] || R.vigente[c.id] : null;
  if (!f || !f.fecha_inicio) return '<span class="tq-cero">Sin ciclo vigente</span>';
  const hoy = fmt.hoy(), ini = ppDia(f.fecha_inicio), n = Math.max(1, Number(f.semanas) || 1);
  const fin = evtSumarDias(ini, n * 7 - 1), ultima = evtSumarDias(ini, (n - 1) * 7);
  const sem = Math.min(n, Math.floor(tqEntre(ini, hoy) / 7) + 1);
  const faltan = tqEntre(hoy, fin);
  const diaSem = (x) => { const t = new Date(x + 'T12:00:00Z'); return `${TQ_DSEM[t.getUTCDay()]} ${t.getUTCDate()}`; };
  const nombre = f.nombre ? escapeHtml(String(f.nombre)) : 'Ciclo';
  if (faltan < 0) return `<span class="pp-l">${nombre}</span><div class="tq-sub" style="color:#B2402B;font-weight:700">Terminó hace ${-faltan} día${faltan === -1 ? '' : 's'} · sin ciclo nuevo</div>`;
  const resto = faltan === 0 ? 'termina hoy' : `faltan ${faltan} día${faltan === 1 ? '' : 's'}`;
  let aviso = '';
  if (sem === n) {
    // ¿Ya le salió? Por su cuenta de la app (o su nombre) y el id del ciclo.
    const filas = (R.uso || []).filter(u => (c.mealtracker_id && (u.user_id === c.mealtracker_id || u.clave === c.mealtracker_id)) || ppNorm(u.name) === ppNorm(c.nombre));
    const visto = filas.filter(u => u.secciones && u.secciones.aviso_ciclo === String(f.id)).map(u => ppDia(u.fecha)).sort()[0] || null;
    aviso = R.uso == null ? '<div class="tq-sub">Aviso de cambio: sin dato de la app</div>'
      : visto ? `<span class="pp-e" data-tq-aviso="visto" style="background:#E6F2E9;color:#2F7F45;display:inline-block;margin-top:4px">Ya vio el aviso de cambio · ${diaSem(visto)}</span>`
      : `<span class="pp-e" data-tq-aviso="no" style="background:#FCEBDD;color:#B4541D;display:inline-block;margin-top:4px">Aún no ve el aviso de cambio</span>`;
  } else {
    aviso = `<div class="tq-sub" data-tq-aviso="pronto">El aviso de cambio le sale el ${diaSem(ultima)}</div>`;
  }
  return `<span class="pp-l" data-tq-semana-ciclo="${sem}">Sem ${sem} de ${n}</span><div class="tq-sub">${nombre} · ${resto}</div>${aviso}`;
}

const PP_TONO = { aldia: ['#E6F2E9', '#2F7F45', 'Al día'], toca: ['#FCEBDD', '#B4541D', 'Toca pedir'], recordar: ['#FDECEA', '#B4321F', 'Recordar'], pedido: ['#EFEDE7', '#55565B', 'Pedido'], entregado: ['#E6F2E9', '#2F7F45', 'Entregado'] };
function ppCelda(f) {
  if (f.estado === 'pausa') return '<span class="tq-cero">—</span>';
  const items = ppDe(f.c.id);
  if (!items.length) return '<span class="pp-nada">Nada pendiente</span>';
  const id = f.c.id;
  return items.map(x => {
    const [bg, col, t] = PP_TONO[x.estado];
    const b = (txt, oscuro, attr, fn) => `<button type="button" class="pp-b${oscuro ? ' o' : ''}" ${attr} onclick="${fn}">${txt}</button>`;
    // El video, en la fila, solo con su resumen; el detalle (cada video, su
    // vista previa y su estado) se abre con «Ver videos».
    if (x.tipo === 'video' && x.resumen) {
      return `<div class="pp-it pp-it-v" data-pp="video" data-pp-estado="${x.estado}" role="button" tabindex="0" onclick="ppVideos('${id}')"><div class="pp-h"><b>Video</b><span class="pp-e" style="background:${bg};color:${col}">${x.todos ? 'Todos enviados' : t}</span></div><div class="pp-d"><b class="pp-l">${escapeHtml(x.resumen.linea)}</b>${x.resumen.sub ? ` · ${escapeHtml(x.resumen.sub)}` : ''}</div><div class="pp-bs"><button type="button" class="pp-b" data-pp-ver>Ver videos ›</button></div></div>`;
    }
    let btn = '';
    if (x.estado === 'toca') btn = b('Pedir', true, `data-pp-pedir="${x.tipo}"`, `ppPedir('${id}','${x.tipo}')`) + b('Ya lo pedí', false, `data-pp-yapedi="${x.tipo}"`, `ppYaPedi('${id}','${x.tipo}')`);
    else if (x.estado === 'recordar') btn = b('Recordar', true, `data-pp-recordar="${x.tipo}"`, `ppRecordar('${id}','${x.tipo}')`);
    if ((x.estado === 'pedido' || x.estado === 'recordar') && !(x.ejercicios && x.ejercicios.length)) btn += b('Ya lo entregó', false, `data-pp-entrego="${x.tipo}"`, `ppEntrego('${id}','${x.tipo}')`);
    if (x.todos) btn = b('Pedir nuevos', true, 'data-pp-nuevos="video"', `ppPedir('${id}','video')`);
    // Lo que ya entregó (fotos, peso, medidas): ir a verlo en su Composición.
    if (x.estado === 'entregado' && x.tipo !== 'video') btn = b(x.tipo === 'fotos' ? 'Ver fotos ›' : 'Ver registro ›', false, `data-pp-ver-carga="${x.tipo}"`, `ppVerCarga('${id}','${x.tipo}')`);
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
// «Recordar» de fotos, peso y medidas (ya se lo pediste hace una semana).
const PP_MSJ_REC = {
  fotos: (n) => `Hola ${n}, ¿cómo vas? Te recuerdo tus fotos de progreso: cuando puedas, súbelas en la app (frente, perfil y espalda), o me las mandas por acá.`,
  medidas: (n) => `Hola ${n}, ¿cómo vas? Te recuerdo tus medidas: cuando puedas, regístralas en la app, o me las mandas por acá.`,
  peso: (n) => `Hola ${n}, ¿cómo vas? Te recuerdo tu peso: cuando puedas, regístralo en la app, o me lo mandas por acá.`,
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
  if (tipo !== 'video') {
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(PP_MSJ_REC[tipo](nombre))}`, '_blank', 'noopener');
    if (await ppGuardar({ cliente_id: id, tipo, detalle: 'recordatorio', pedido_en: new Date().toISOString() })) { toast('Listo: la semana vuelve a contar desde hoy'); ppRepintar(); }
    return;
  }
  const it = ppDe(id).find(x => x.tipo === tipo);
  const n = it && it.ejercicios ? it.ejercicios.length : 0;
  const ej = it && it.ejercicio ? ` de ${it.ejercicio}` : '';
  const msj = `Hola ${nombre}, ¿cómo vas? Te recuerdo ${n > 1 ? 'los videos' : 'el video'}${ej} que te pedí. Cuando puedas, ${n > 1 ? 'súbelos' : 'súbelo'} en la app (o me ${n > 1 ? 'los' : 'lo'} mandas por acá) y te digo cómo vas.`;
  window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msj)}`, '_blank', 'noopener');
  if (await ppGuardar({ cliente_id: id, tipo, detalle: 'recordatorio', pedido_en: new Date().toISOString() })) await ppRefrescarVideos(id);
};
// ── «Ver videos»: el detalle de los videos de un cliente ─────────────────
// Lo que le pediste (cada video con su vista previa, su estado y marcar o
// desmarcar «Ya lo entregó») y los ejercicios de su ciclo que no le has
// pedido, para marcar y pedirlos.
const PPV_ESTADO = {
  falta: ['#EFEDE7', '#55565B'], tarde: ['#FDECEA', '#B4321F'], entregado: ['#E6F2E9', '#2F7F45'],
  recibido: ['#EAF1FB', '#1E4E8C'], bien: ['#E6F2E9', '#2F7F45'], mejorar: ['#FCEBDD', '#B4541D'], mal: ['#FDECEA', '#B4321F'],
};
window.ppVideos = async (id) => {
  const hoy = fmt.hoy();
  const dias = (f) => tqEntre(ppDia(f), hoy);
  const hace = (f) => { const d = dias(f); return d === 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`; };
  const c = (_tq.datos && (_tq.datos.filas.find(x => String(x.c.id) === String(id)) || {}).c) || await db.clientes.get(id);
  const [vids] = await Promise.all([
    typeof vtDb !== 'undefined' ? vtDb.lista(id) : Promise.resolve([]),
    typeof entDb !== 'undefined' ? entDb.ejercicios().catch(() => []) : null,
  ]);
  const filas = vids || [];
  const clave = (x) => x.ejercicio_id || `n:${String(x.ejercicio_nombre || '').toLowerCase()}`;
  const ult = {};
  filas.forEach(x => { const k = clave(x); const u = ult[k]; if (!u || String(x.pedido_en) > String(u.pedido_en) || (x.pedido_en === u.pedido_en && String(x.created_at) > String(u.created_at))) ult[k] = x; });
  const peds = ((_pp.crudo && _pp.crudo.pedidos) || []).filter(p => String(p.cliente_id) === String(id) && p.tipo === 'video' && String(p.detalle || '').startsWith('ej:'));
  const marcado = (k, pedido) => peds.filter(p => p.detalle === `ej:${k}` && p.entregado_en && ppDia(p.entregado_en) >= ppDia(pedido)).sort((a, b) => String(b.entregado_en).localeCompare(String(a.entregado_en)))[0] || null;
  // Lo que le pediste: lo que falta (de cualquier fecha) y lo de los últimos 60 días.
  const enCicloM = _pp.crudo && _pp.crudo.cicloEjs ? _pp.crudo.cicloEjs[String(id)] : null;
  const fueraM = (x) => !!(enCicloM && x.ejercicio_id && !enCicloM.has(String(x.ejercicio_id)));
  const pedidos = Object.entries(ult).map(([k, x]) => ({ k, x, m: x.estado === 'pedido' ? marcado(k, x.pedido_en) : null, fuera: x.estado === 'pedido' && fueraM(x) }))
    .filter(o => o.x.estado === 'pedido' || o.x.estado === 'recibido' || dias(o.x.pedido_en) <= 60)
    .sort((a, b) => {
      const peso = (o) => (o.x.estado === 'pedido' && !o.m && !o.fuera ? 0 : o.x.estado === 'recibido' ? 1 : o.fuera && !o.m ? 2 : 3);
      return peso(a) - peso(b) || String(b.x.pedido_en).localeCompare(String(a.x.pedido_en));
    });
  const faltan = pedidos.filter(o => o.x.estado === 'pedido' && !o.m && !o.fuera);
  const pausados = pedidos.filter(o => o.x.estado === 'pedido' && !o.m && o.fuera);
  const entregados = pedidos.filter(o => o.m || o.x.estado !== 'pedido');
  const prev = (ejId, nombre) => {
    const h = ejId && typeof entMiniPreviewHTML === 'function' ? entMiniPreviewHTML({ id: ejId }) : '';
    return `<div class="ppv-prev">${h || 'Sin video'}</div>`;
  };
  const chip = (t, k) => `<span class="ppv-e" style="background:${PPV_ESTADO[k][0]};color:${PPV_ESTADO[k][1]}">${t}</span>`;
  const b = (t, osc, attr, fn) => `<button type="button" class="pp-b${osc ? ' o' : ''}" ${attr} onclick="${fn}">${t}</button>`;
  // El pedido anterior de ese ejercicio, si quedó «A mejorar» o «Nada bien»: este es un pedido de nuevo.
  const antesMal = (o) => { const x = o.x; const a = (x.pedido_de && filas.find(y => y.id === x.pedido_de)) || filas.filter(y => y !== x && clave(y) === o.k && String(y.pedido_en) <= String(x.pedido_en)).sort((p, q) => String(q.pedido_en).localeCompare(String(p.pedido_en)) || String(q.created_at).localeCompare(String(p.created_at)))[0]; return a && (a.estado === 'mejorar' || a.estado === 'mal') ? a : null; };
  const filaPedido = (o) => {
    const { k, x, m } = o;
    let est, btn = '';
    // Te equivocaste de ejercicio: se quita ESE pedido (lo de antes de ese ejercicio se queda).
    const quitar = x.id ? b('Me equivoqué', false, `data-ppv-quitar="${escapeHtml(k)}"`, `ppQuitarVideo('${id}','${x.id}','${encodeURIComponent(x.ejercicio_nombre || '')}')`) : '';
    const opciones = b('Entregado y bien', false, `data-ppv-entrego="${escapeHtml(k)}"`, `ppEntrego('${id}','video','${encodeURIComponent(k)}')`)
      + (x.id ? b('Debe mejorar · pedir de nuevo', false, `data-ppv-mejorar="${escapeHtml(k)}"`, `ppMejorar('${id}','${x.id}')`) : '') + quitar;
    if (x.estado === 'pedido' && m) { est = chip(`Entregado y bien · marcado por ti ${hace(m.entregado_en)}`, 'entregado'); btn = b('Desmarcar', false, `data-ppv-desmarcar="${escapeHtml(k)}"`, `ppDesmarcar('${id}','${encodeURIComponent(k)}')`); }
    else if (x.estado === 'pedido' && o.fuera) { est = antesMal(o) ? `<span data-ppv-de-nuevo>${chip('Pedido de nuevo · debe mejorar · en pausa (ya no está en su ciclo)', 'mejorar')}</span>` : chip('En pausa · ya no está en su ciclo (no se le pide)', 'falta'); btn = opciones; }
    else if (x.estado === 'pedido' && antesMal(o)) { est = `<span data-ppv-de-nuevo>${chip(`Pedido de nuevo · debe mejorar · ${hace(x.pedido_en)}`, 'mejorar')}</span>`; btn = opciones; }
    else if (x.estado === 'pedido') { est = chip(`Por llegar · ${hace(x.pedido_en)}`, dias(x.pedido_en) >= PP_ESPERA ? 'tarde' : 'falta'); btn = opciones; }
    else if (x.estado === 'recibido') { est = chip('Llegó por la app · falta revisarlo', 'recibido'); btn = b('Revisar', true, 'data-ppv-revisar', `closeModal();vtAbrir('${id}')`); }
    else {
      const t = (typeof VT_ESTADO !== 'undefined' && VT_ESTADO[x.estado] ? VT_ESTADO[x.estado].txt : x.estado); est = chip(`Revisado · ${t}`, PPV_ESTADO[x.estado] ? x.estado : 'bien');
      // Revisado: si debe mejorar, pedirlo de nuevo desde aquí; y «Deshacer» si lo marcaste por error.
      if (x.id && (x.estado === 'mejorar' || x.estado === 'mal')) btn = b('Pedir de nuevo', true, `data-ppv-otra="${escapeHtml(k)}"`, `ppMejorar('${id}','${x.id}')`);
      if (x.id) btn += b('Deshacer', false, `data-ppv-deshacer="${escapeHtml(k)}"`, `ppDeshacerRevision('${id}','${x.id}')`);
    }
    return `<div class="ppv-f" data-ppv-fila="${escapeHtml(k)}" data-ppv-estado="${x.estado === 'pedido' ? (m ? 'entregado' : o.fuera ? 'pausa' : 'falta') : x.estado}"${o.fuera && !m ? ' style="opacity:.7"' : ''}>${prev(x.ejercicio_id, x.ejercicio_nombre)}
      <div style="flex:1;min-width:0"><div class="ppv-n">${escapeHtml(x.ejercicio_nombre || 'Video')}</div><div class="ppv-s">Pedido el ${fmt.fechaCorta(ppDia(x.pedido_en))} · ${hace(x.pedido_en)}</div>${x.estado === 'pedido' && antesMal(o) && antesMal(o).nota ? `<div class="ppv-s" data-ppv-corregir style="color:#B4541D">Qué corregir: ${escapeHtml(antesMal(o).nota)}</div>` : ''}${est}</div>
      <div class="ppv-b">${btn}</div></div>`;
  };
  // De su ciclo, sin pedir (lo que no está esperando ni por revisar).
  let ciclo = [];
  try {
    if (typeof entDb !== 'undefined') {
      const fases = await entDb.fases(id);
      const fase = typeof entCicloVigente === 'function' ? entCicloVigente(fases) : null;
      const rutinas = fase ? await entDb.rutinasDeFase(fase.id) : [];
      const porRutina = rutinas.length ? await entDb.ejerciciosDeRutinas(rutinas.map(r => r.id)) : {};
      const vistos = new Set();
      rutinas.forEach(r => (porRutina[r.id] || []).forEach(re => {
        if (!re.ejercicios || vistos.has(re.ejercicio_id) || ['calentamiento', 'estiramiento_pasivo', 'cardio'].includes(re.ejercicios.tipo)) return;
        vistos.add(re.ejercicio_id);
        const u = ult[re.ejercicio_id];
        if (u && (u.estado === 'pedido' || u.estado === 'recibido')) return;
        ciclo.push({ id: re.ejercicio_id, nombre: typeof entNombres === 'function' ? entNombres(re.ejercicios).grande : (re.ejercicios.nombre || 'Ejercicio'), u });
      }));
    }
  } catch (e) { ciclo = []; }
  const filaCiclo = (e) => `<label class="ppv-f" data-ppv-ciclo="${e.id}" style="cursor:pointer;text-transform:none;letter-spacing:0;font-weight:400">
      <input type="checkbox" class="ppv-chk" value="${e.id}" data-nombre="${escapeHtml(e.nombre)}" style="width:18px;height:18px;flex:none">${prev(e.id, e.nombre)}
      <div style="flex:1;min-width:0"><div class="ppv-n">${escapeHtml(e.nombre)}</div><div class="ppv-s">${e.u ? `Último video: <b>${escapeHtml(typeof VT_ESTADO !== 'undefined' && VT_ESTADO[e.u.estado] ? VT_ESTADO[e.u.estado].txt : e.u.estado)}</b> · ${hace(e.u.pedido_en)}` : 'Nunca le pediste video'}</div></div></label>`;
  const resumen = pedidos.length ? `${pedidos.length} pedido${pedidos.length === 1 ? '' : 's'} · <b style="color:#2F7F45">${entregados.length} entregado${entregados.length === 1 ? '' : 's'}</b>${faltan.length ? ` · <b style="color:#B4321F">${faltan.length} falta${faltan.length === 1 ? '' : 'n'}</b>` : ' · <b style="color:#2F7F45">todos enviados</b>'}${pausados.length ? ` · ${pausados.length} en pausa (fuera de su ciclo)` : ''}` : 'Todavía no le has pedido videos.';
  openModal(modalShell(`Videos · ${escapeHtml((c && c.nombre) || '')}`, `<div data-pp-videos="${id}">
      <div class="ppv-res">${resumen}</div>
      ${pedidos.length ? `<div class="ppv-t">LO QUE LE PEDISTE</div>${pedidos.map(filaPedido).join('')}` : ''}
      ${ciclo.length ? `<div class="ppv-t">DE SU CICLO, SIN PEDIR</div>${ciclo.map(filaCiclo).join('')}` : ''}
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
     ${faltan.length ? `<button class="btn btn-secondary" data-ppv-recordar onclick="ppRecordar('${id}','video')">Recordar los que faltan</button>` : ''}
     ${ciclo.length ? `<button class="btn btn-primary" data-ppv-pedir onclick="ppPedirMarcados('${id}')">Pedir los marcados</button>` : ''}`), { wide: true });
};
// Lo de la ventana cambió: se repinta la fila y la ventana.
async function ppRefrescarVideos(id) {
  _tq.datos = null; _tq.leido = 0;
  if (_currentView === 'toques' && typeof rerenderView === 'function') await rerenderView();
  if (document.querySelector(`[data-pp-videos="${id}"]`)) await ppVideos(id);
}
// Ir a lo último que cargó: sus fotos o su peso y medidas, en Composición.
window.ppVerCarga = async (id, tipo) => {
  if (typeof compCargar !== 'function' || typeof _comp === 'undefined') return;
  await navigate('composicion');
  _comp.vistaEquipo = false;
  _comp.tab = tipo === 'fotos' ? 'fotos' : 'corporal';
  await compCargar(id);
};
// Debe mejorar: ese video queda «A mejorar» (con lo que debe corregir, que le
// sale en su app) y se le pide de nuevo, enlazado al anterior: su app le dice
// que es otra vez y qué corregir. Se abre su WhatsApp con el mensaje.
window.ppMejorar = async (id, filaId) => {
  if (typeof vtDb === 'undefined') return;
  let v = null;
  try { const { data } = await sb.from('videos_tecnica').select('*').eq('id', filaId); v = (data || [])[0] || null; } catch (e) { v = null; }
  if (!v) { toast('No encontré ese pedido'); return; }
  openModal(modalShell(`Pedir de nuevo · ${escapeHtml(v.ejercicio_nombre || 'video')}`, `<div data-ppm-modal="${filaId}">
    <label class="block text-sm font-semibold text-slate-700 mb-1">Qué debe corregir (le sale en su app)</label>
    <textarea id="ppm-nota" class="input w-full" rows="3" placeholder="Ej.: Rodillas hacia afuera al subir; bajar más controlado">${escapeHtml(v.nota || '')}</textarea>
    <p class="text-xs text-slate-500 mt-2">Queda «Pedido de nuevo · debe mejorar» y en su app le sale que debe grabarlo otra vez, con esto que escribas.</p>
  </div>`, `<button class="btn btn-secondary" onclick="ppVideos('${id}')">Volver</button><button class="btn btn-primary" data-ppm-confirmar onclick="ppMejorarConfirmar('${id}','${filaId}')">Pedir de nuevo</button>`));
};
window.ppMejorarConfirmar = async (id, filaId) => {
  const nota = (document.getElementById('ppm-nota')?.value || '').trim();
  let v = null;
  try { const { data } = await sb.from('videos_tecnica').select('*').eq('id', filaId); v = (data || [])[0] || null; } catch (e) { v = null; }
  if (!v) { toast('No encontré ese pedido'); return; }
  if (!(await vtDb.actualizar(filaId, { estado: v.estado === 'mal' ? 'mal' : 'mejorar', revisado_en: v.revisado_en || fmt.hoy(), nota: nota || null }))) return;
  if (!(await vtDb.crear([{ cliente_id: id, ejercicio_id: v.ejercicio_id || null, ejercicio_nombre: v.ejercicio_nombre || null, estado: 'pedido', pedido_en: fmt.hoy(), pedido_de: v.id }]))) return;
  const c = (_tq.datos && (_tq.datos.filas.find(x => String(x.c.id) === String(id)) || {}).c) || await db.clientes.get(id);
  const nombre = String((c && c.nombre) || '').trim().split(/\s+/)[0] || '';
  const ej = v.ejercicio_nombre || 'ese ejercicio';
  const texto = `Hola${nombre ? ' ' + nombre : ''}, revisé tu video de ${ej}. Hay detalles de técnica por mejorar${nota ? `: ${nota}` : ''}. Cuando puedas, grábalo de nuevo y me lo envías para revisarlo otra vez.`;
  const tel = String((c && c.telefono) || '').replace(/\D/g, '');
  if (tel) window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
  else { try { await navigator.clipboard.writeText(texto); toast('Mensaje copiado: pégalo en WhatsApp'); } catch (e) { /* nada */ } }
  toast(`${ej}: pedido de nuevo · debe mejorar`);
  await ppVideos(id);
  await ppRefrescarVideos(id);
};
// Lo marcaste revisado por error: vuelve a «Por llegar» (sin la revisión ni su toque).
window.ppDeshacerRevision = async (id, filaId) => {
  if (typeof vtDb === 'undefined') return;
  if (!(await vtDb.actualizar(filaId, { estado: 'pedido', revisado_en: null }))) return;
  toast('Deshecho: vuelve a «Por llegar»');
  await ppRefrescarVideos(id);
};
window.ppQuitarVideo = async (id, filaId, nombreEnc) => {
  const nombre = decodeURIComponent(nombreEnc || '') || 'este video';
  if (!confirm(`¿Quitar el pedido de ${nombre}? Es para cuando te equivocaste: deja de pedírsele en su app. Lo que antes le pediste de ese ejercicio se queda.`)) return;
  if (typeof vtDb === 'undefined' || !(await vtDb.borrar(filaId))) return;
  toast(`Quitado: ${nombre}`);
  await ppRefrescarVideos(id);
};
window.ppDesmarcar = async (id, claveEj) => {
  const clave = decodeURIComponent(claveEj);
  const ids = ((_pp.crudo && _pp.crudo.pedidos) || []).filter(p => String(p.cliente_id) === String(id) && p.tipo === 'video' && p.detalle === `ej:${clave}` && p.entregado_en).map(p => p.id);
  if (!ids.length) return;
  try {
    const { error } = await sb.from('pedidos_cliente').update({ entregado_en: null, entregado_por: null }).in('id', ids);
    if (error) { toast('No pude desmarcarlo'); return; }
  } catch (e) { toast('No pude desmarcarlo'); return; }
  toast('Desmarcado: vuelve a «Por llegar»');
  await ppRefrescarVideos(id);
};
window.ppPedirMarcados = async (id) => {
  const marcados = [...document.querySelectorAll('.ppv-chk:checked')].map(i => ({ ejercicio_id: i.value, ejercicio_nombre: i.dataset.nombre }));
  if (!marcados.length) return toast('Marca al menos uno');
  const filas = marcados.map(m => ({ cliente_id: id, ...m, estado: 'pedido', pedido_en: fmt.hoy() }));
  if (typeof vtDb === 'undefined' || !(await vtDb.crear(filas))) return;
  const c = (_tq.datos && (_tq.datos.filas.find(x => String(x.c.id) === String(id)) || {}).c) || await db.clientes.get(id);
  const nombre = String((c && c.nombre) || '').trim().split(/\s+/)[0] || '';
  const texto = [`Hola${nombre ? ' ' + nombre : ''}, ¿cómo vas? Para revisar tu técnica, cuando puedas súbeme en la app (o me mandas por acá) un video de:`, ...marcados.map(m => `• ${m.ejercicio_nombre}`), '', '¡Gracias!'].join('\n');
  const tel = String((c && c.telefono) || '').replace(/\D/g, '');
  if (tel) window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
  else { try { await navigator.clipboard.writeText(texto); toast('Mensaje copiado: pégalo en WhatsApp'); } catch (e) { /* nada */ } }
  if (typeof segRegistrar === 'function') segRegistrar(id, { origen: 'videos', titulo: 'Pedir video', texto });
  toast(`${filas.length} video${filas.length === 1 ? '' : 's'} pedido${filas.length === 1 ? '' : 's'}`);
  await ppRefrescarVideos(id);
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
      await ppRefrescarVideos(id);
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
  .pp-it-v{cursor:pointer}
  .pp-l{color:#1F1F1F;font-weight:700}
  .ppv-res{font-size:13.5px;color:#6B6B6B;margin:-4px 0 10px}
  .ppv-t{font-size:12px;font-weight:800;color:#8A8780;letter-spacing:.02em;margin-top:12px}
  .ppv-f{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #F0EEE8}
  .ppv-f:last-child{border-bottom:0}
  .ppv-prev{width:112px;height:63px;flex:none;border-radius:10px;overflow:hidden;background:#EEEBE4;display:grid;place-items:center;font-size:11px;color:#8A8780}
  .ppv-prev .ent-mini-prev{width:112px;height:63px;border-radius:10px}
  .ppv-prev .ent-mini-prev img{width:100%;height:100%;object-fit:cover}
  .ppv-n{font-size:14.5px;font-weight:700;color:#1F1F1F}
  .ppv-s{font-size:12.5px;color:#6B6B6B;margin-top:2px}
  .ppv-e{display:inline-block;font-size:11.5px;font-weight:700;border-radius:999px;padding:2px 9px;margin-top:5px;white-space:nowrap}
  .ppv-b{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;flex:none}
  .ppv-b .pp-b{padding:6px 12px;font-size:12.5px}
  .pp-ejs{margin-top:4px}
  .pp-ej{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:3px 0;font-size:12px;color:#1F1F1F}
  .pp-ej i{display:block;font-style:normal;font-size:11px;color:#8A8A8A}
  .pp-ej .pp-b{padding:3px 9px;font-size:11px}`;
  document.head.appendChild(s);
})();
