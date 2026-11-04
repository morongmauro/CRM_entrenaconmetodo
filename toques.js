// =====================================================
// CRM EntrenaConMétodo · TOQUES DE LA SEMANA
// =====================================================
// Una fila por cliente activo: cuántas veces lo tocaste esta semana y cómo
// (seguimiento, videos, respuestas, WhatsApp), si te escribió y si le
// respondiste, y cómo va (entrenos, app). Para tener el 360 de la semana sin
// enfriar a nadie ni saturar a nadie:
//   · «Le debes respuesta» → te escribió después de tu último toque.
//   · «Frío»               → 15 días o más sin ningún toque tuyo.
//   · «Enfriándose» (8 a 14 días), «Mucho» (4 o más esta semana), «Bien».
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
// tuyo), amarillo (8 a 14 días sin toque, o 4 o más toques esta semana: mejor
// esperar), verde (bien), gris (en pausa).
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
async function tqDatos(forzar = false) {
  if (!forzar && _tq.datos) return _tq.datos;
  const hoy = fmt.hoy(), lunes = tqLunes(hoy), desde = evtSumarDias(hoy, -30);
  const leer = async (q) => { try { const { data, error } = await q; return error ? null : (data || []); } catch (e) { return null; } };
  const [msj, vids, notas, ses, resp, com, toq] = await Promise.all([
    leer(sb.from('seguimiento_mensajes').select('cliente_id, fecha, origen, created_at').gte('fecha', desde)),
    leer(sb.from('videos_tecnica').select('cliente_id, pedido_en, estado, revisado_en').gte('pedido_en', desde)),
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
  const semana = (f) => f >= lunes && f <= hoy;
  const filas = clientes.map(c => {
    const m = de(msj, c.id), v = de(vids, c.id), n = de(notas, c.id), s = de(ses, c.id), r = de(resp, c.id), cm = de(com, c.id), t = de(toq, c.id);
    const seg = m.filter(x => x.origen !== 'videos');
    const wa = t.filter(x => x.tipo === 'le_escribi_wa');
    const meWa = t.filter(x => x.tipo === 'me_escribio');
    const notasSes = s.filter(x => String(x.notas_cliente || '').trim());
    // Lo tuyo (los toques) y lo suyo (te escribió): el día, y el momento
    // exacto cuando lo hay (para saber quién escribió último el mismo día).
    const mom = (f, ts) => (ts ? new Date(ts).toISOString() : `${f}T00:00:00.000Z`);
    const tuyosX = [...m.map(x => [x.fecha, mom(x.fecha, x.created_at)]), ...v.map(x => [x.pedido_en, mom(x.pedido_en)]), ...r.map(x => [tqDia(x.created_at), mom(0, x.created_at)]), ...cm.map(x => [tqDia(x.creado_en), mom(0, x.creado_en)]), ...wa.map(x => [x.fecha, mom(x.fecha, x.created_at)])].filter(x => x[0]);
    const suyosX = [...n.map(x => [x.fecha || tqDia(x.created_at), mom(x.fecha, x.created_at)]), ...notasSes.map(x => [x.fecha, mom(x.fecha)]), ...meWa.map(x => [x.fecha, mom(x.fecha, x.created_at)])].filter(x => x[0]);
    const tuyos = tuyosX.map(x => x[0]).sort(), suyos = suyosX.map(x => x[0]).sort();
    const tuyosT = tuyosX.map(x => x[1]).sort(), suyosT = suyosX.map(x => x[1]).sort();
    const sem = {
      seguimiento: seg.filter(x => semana(x.fecha)).length,
      pidioVideo: v.filter(x => semana(x.pedido_en)).length,
      llegoVideo: v.filter(x => x.estado !== 'pedido' && semana(x.revisado_en || x.pedido_en)).length,
      meEscribio: suyos.filter(semana).length,
      respondio: r.filter(x => semana(tqDia(x.created_at))).length + cm.filter(x => semana(tqDia(x.creado_en))).length,
      wa: wa.filter(x => semana(x.fecha)).length,
      entrenos: s.filter(x => x.estado === 'completada' && semana(x.fecha)).length,
    };
    const toques = sem.seguimiento + sem.pidioVideo + sem.respondio + sem.wa;
    const ultTuyo = tuyos[tuyos.length - 1] || null, ultSuyo = suyos[suyos.length - 1] || null;
    const ultTuyoT = tuyosT[tuyosT.length - 1] || null, ultSuyoT = suyosT[suyosT.length - 1] || null;
    const sinToque = ultTuyo ? tqEntre(ultTuyo, hoy) : null;
    const pausa = typeof ausHoy === 'function' ? ausHoy(c.id, hoy) : null;
    const e = eng ? eng.filas.find(f => f.c.id === c.id) : null;
    let estado;
    if (pausa) estado = 'pausa';
    else if (ultSuyoT && (!ultTuyoT || ultSuyoT > ultTuyoT)) estado = 'debe';
    else if (sinToque === null || sinToque >= TQ_FRIO) estado = 'frio';
    else if (sinToque >= TQ_ENFRIA) estado = 'enfria';
    else if (toques >= 4) estado = 'mucho';
    else estado = 'bien';
    return { c, sem, toques, ultTuyo, ultSuyo, sinToque, estado, app: e ? e.sinActividad : undefined };
  });
  filas.sort((a, b) => TQ_ORDEN[a.estado] - TQ_ORDEN[b.estado] || (b.sinToque ?? 99) - (a.sinToque ?? 99) || String(a.c.nombre).localeCompare(String(b.c.nombre)));
  _tq.datos = { hoy, lunes, filas };
  return _tq.datos;
}

// ── Acciones de cada fila ────────────────────────────────────────────────
window.tqWhatsApp = async (id) => {
  const c = (_tq.datos && _tq.datos.filas.find(f => f.c.id === id) || {}).c || await db.clientes.get(id);
  const tel = String((c && c.telefono) || '').replace(/\D/g, '');
  if (!tel) return toast('No tiene teléfono guardado');
  window.open(`https://wa.me/${tel}`, '_blank', 'noopener');   // queda como «Le escribí» (arriba)
  setTimeout(() => { _tq.datos = null; if (_currentView === 'toques') rerenderView(); }, 700);
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

// ── La vista: una fila por cliente, una columna por toque ────────────────
const tqNum = (n) => (n ? `<b>${n}</b>` : '<span class="tq-cero">—</span>');
function tqCuando(f, hoy) { if (!f) return 'nunca'; const d = tqEntre(f, hoy); return d === 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`; }
const TQ_FILTROS = [['todos', 'Todos'], ['rojo', 'Rojo'], ['amarillo', 'Amarillo'], ['verde', 'Verde'], ['gris', 'En pausa']];

routes.toques = async () => {
  cargando('Juntando los toques de la semana…');
  let D;
  try { D = await tqDatos(true); } catch (e) { D = { filas: [], hoy: fmt.hoy(), lunes: tqLunes(fmt.hoy()) }; console.warn('toques', e); }
  finCargando();
  const color = (f) => TQ_TONO[f.estado][0];
  const lista = _tq.filtro === 'todos' ? D.filas : D.filas.filter(f => color(f) === _tq.filtro);
  const semaforo = (f) => { const [k, t] = TQ_TONO[f.estado]; const [punto, bg, txt] = TQ_COLOR[k]; return `<span class="tq-sem" style="background:${bg};color:${txt}"><i style="background:${punto}"></i>${t}</span>`; };
  const fila = (f) => `<tr data-tq-cliente="${f.c.id}" data-tq-estado="${f.estado}" data-tq-color="${color(f)}">
      <td class="lis-nom">${typeof entAvatar === 'function' ? entAvatar(f.c.nombre) : ''}<div><b>${escapeHtml(f.c.nombre)}</b><div class="tq-sub" data-tq-ultimo>Tu último toque: ${tqCuando(f.ultTuyo, D.hoy)}${f.ultSuyo ? ` · te escribió ${tqCuando(f.ultSuyo, D.hoy)}` : ''}</div></div></td>
      <td>${semaforo(f)}</td>
      <td class="tq-n" data-tq="seguimiento">${tqNum(f.sem.seguimiento)}</td>
      <td class="tq-n" data-tq="pidio">${tqNum(f.sem.pidioVideo)}</td>
      <td class="tq-n" data-tq="llego">${tqNum(f.sem.llegoVideo)}</td>
      <td class="tq-n" data-tq="escribio">${tqNum(f.sem.meEscribio)}</td>
      <td class="tq-n" data-tq="respondio">${tqNum(f.sem.respondio)}</td>
      <td class="tq-n" data-tq="wa">${tqNum(f.sem.wa)}</td>
      <td class="tq-n" data-tq="entrenos">${tqNum(f.sem.entrenos)}</td>
      <td class="tq-n">${f.app === undefined ? '<span class="tq-cero">—</span>' : f.app === null ? 'nunca' : f.app === 0 ? 'hoy' : `${f.app} d`}</td>
      <td><div class="tq-acc">
        <button type="button" class="cp-btn" onclick="cpSeguimiento('${f.c.id}')">Seguimiento</button>
        <button type="button" class="cp-btn s" onclick="tqPedirVideo('${f.c.id}')">Pedir video</button>
        <button type="button" class="cp-btn s" data-tq-wa onclick="tqWhatsApp('${f.c.id}')">WhatsApp</button>
        <button type="button" class="cp-btn s" data-tq-me-escribio onclick="tqMeEscribio('${f.c.id}')">Me escribió</button>
      </div></td></tr>`;
  view.innerHTML = `
    <div class="mb-3"><h2 class="text-2xl font-bold text-slate-900">Toques de la semana</h2>
      <p class="text-sm text-slate-500">Semana del ${fmt.fechaCorta(D.lunes)}. Cuántas veces tocaste a cada cliente y cómo, si te escribió y si le respondiste: para no enfriar a nadie ni saturar a nadie.</p></div>
    ${_tq.sinTabla ? `<div class="card mb-3 text-xs text-amber-900 bg-amber-50 border border-amber-200" data-tq-sin-tabla>Para registrar «Me escribió» y los WhatsApp que abres desde el CRM, corre <code>migraciones/toques-cliente.sql</code> en Supabase. Lo demás ya se ve.</div>` : ''}
    <div class="flex gap-1.5 flex-wrap" style="margin-bottom:10px" data-tq-chips>${TQ_FILTROS.map(([k, t]) => { const n = k === 'todos' ? D.filas.length : D.filas.filter(f => color(f) === k).length; return `<button type="button" class="chip ${_tq.filtro === k ? 'active' : ''}" data-tq-filtro="${k}" onclick="tqFiltro('${k}')">${k !== 'todos' ? `<i class="tq-punto" style="background:${TQ_COLOR[k][0]}"></i>` : ''}${t} · ${n}</button>`; }).join('')}</div>
    <div class="card lis-tabla-caja" data-tq-tabla>

      <table class="lis-tabla tq-tabla"><thead><tr><th class="lis-nom">Cliente</th><th>Semáforo</th><th class="tq-n">Segui-<br>miento</th><th class="tq-n">Video<br>pedido</th><th class="tq-n">Video<br>llegó</th><th class="tq-n">Te<br>escribió</th><th class="tq-n">Le<br>respondiste</th><th class="tq-n">Whats-<br>App</th><th class="tq-n">Entre-<br>nos</th><th class="tq-n">App</th><th></th></tr></thead>
      <tbody>${lista.map(fila).join('')}</tbody></table>
      ${lista.length ? '' : '<p class="text-sm text-slate-500" style="padding:0 16px 16px">Nadie en este filtro.</p>'}
    </div>
    <p class="text-xs text-slate-500 mt-2" data-tq-leyenda><b>Rojo</b>: te escribió y no le has respondido, o lleva 15 días o más sin un toque tuyo. <b>Amarillo</b>: 8 a 14 días sin toque, o 4 o más toques esta semana (mejor esperar). <b>Verde</b>: bien.</p>
    <p class="text-xs text-slate-500 mt-1">Los números son de esta semana (lunes a hoy). Cuenta solo: lo que envías desde Seguimiento, los videos que pides, sus notas en la app y tus respuestas. Abrir su WhatsApp desde el CRM queda como toque. Si te escribe por WhatsApp, toca «Me escribió».</p>`;
};

(function () {
  const s = document.createElement('style');
  s.textContent = `
  .tq-sem{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;border-radius:999px;padding:3px 10px 3px 7px;white-space:nowrap}
  .tq-sem i,.tq-punto{display:inline-block;width:10px;height:10px;border-radius:50%;flex:none}
  .tq-punto{margin-right:6px;vertical-align:-1px}
  td.tq-n{text-align:center;font-size:14px}
  .tq-cero{color:#C2BFB8}
  .tq-sub{font-size:11.5px;color:#7A7A7A;margin-top:2px}
  .tq-acc{display:grid;grid-template-columns:auto auto;gap:5px}
  .tq-acc .cp-btn{padding:6px 10px;font-size:12px;text-align:center}
  .tq-tabla{min-width:980px}
  .tq-tabla td{min-width:0;vertical-align:middle}
  .tq-tabla th{text-transform:none;letter-spacing:0;font-size:11.5px;line-height:1.2;vertical-align:bottom}
  .tq-tabla th.tq-n,.tq-tabla td.tq-n{text-align:center;padding-left:6px;padding-right:6px;width:64px}
  .tq-tabla td.lis-nom{min-width:210px}`;
  document.head.appendChild(s);
})();
