// =====================================================
// GALERÍA · FICHAS ARCHIVADAS QUE TUS CLIENTES AÚN TIENEN
// =====================================================
// Archivar una ficha (p. ej. con «Dejar este» en los repetidos) no toca
// rutinas: quien la tenía en su ciclo la sigue viendo, con su nombre y su
// video. Aquí salen esas fichas, quiénes las tienen y la ficha que quedaste
// en su lugar, con «Cambiarlo en sus rutinas»:
//   · En las rutinas de su ciclo de ahora y de los que vienen, la ficha
//     archivada se cambia por la buena: misma línea de la rutina, así que el
//     orden, las series, las repeticiones, los descansos y las notas no se
//     tocan (solo cambia qué ejercicio es).
//   · La ficha archivada queda con `duplicado_de` = la buena. Con eso la app
//     junta su «última vez», su récord, su historial, tus comentarios y los
//     videos pedidos en la buena (api/training.js › fichasAnteriores).
//   · Los ciclos que ya terminaron no se tocan (son su historia) y nada se
//     borra: la ficha archivada sigue guardada.
//   · Cada cambio queda en `cambios_ejercicio` (origen «galeria»).
//
// Carga DESPUÉS de entrenamiento.js y galeria-revision.js.

const _aeu = { lista: null, cargando: null };
if (typeof ENT_ORIGEN_CAMBIO === 'object') ENT_ORIGEN_CAMBIO.galeria = 'desde la Galería (ficha repetida)';

const aeuTandas = (ids, n = 80) => { const t = []; for (let i = 0; i < ids.length; i += n) t.push(ids.slice(i, i + n)); return t; };
const aeuLeer = async (q) => { try { const { data, error } = await q; return error ? null : (data || []); } catch (e) { return null; } };

// Las fichas archivadas que hoy están en el ciclo de algún cliente activo,
// cada una con quiénes la tienen y las fichas que pueden reemplazarla.
async function aeuCargar(force = false) {
  if (_aeu.lista && !force) return _aeu.lista;
  if (_aeu.cargando && !force) return _aeu.cargando;
  _aeu.cargando = (async () => {
    await entDb.ejerciciosEnUso(force);
    const vivos = await entDb.ejercicios();
    const vivosIds = new Set(vivos.map(e => e.id));
    const quien = _ent.quienUsa || new Map();
    const ids = [...quien.keys()].filter(id => id && !vivosIds.has(id));
    if (!ids.length) return (_aeu.lista = []);
    const archivadas = [];
    for (const t of aeuTandas(ids)) archivadas.push(...((await aeuLeer(sb.from('ejercicios').select('*').in('id', t))) || []).filter(e => e.archivado));
    if (!archivadas.length) return (_aeu.lista = []);
    const clis = (await aeuLeer(sb.from('clientes').select('id, nombre'))) || [];
    const nombre = Object.fromEntries(clis.map(c => [c.id, c.nombre || 'Sin nombre']));
    // Su par: la que marcaste como «el mismo» (duplicado_de) y las repetidas
    // por nombre (las mismas de «Repetidos»), primero las que usan clientes
    // y las que tienen video.
    const grupos = typeof grGrupos === 'function' ? grGrupos([...archivadas.map(a => ({ ...a, archivado: false })), ...vivos]) : [];
    const uso = (e) => (_ent.enUso && _ent.enUso.get(e.id)) || 0;
    const conVideo = (e) => (e.video_fuente || 'ninguno') !== 'ninguno';
    _aeu.lista = archivadas.map(a => {
      const g = grupos.find(gr => gr.some(x => x.id === a.id)) || [];
      const opciones = g.filter(x => vivosIds.has(x.id) && x.id !== a.id).map(x => vivos.find(v => v.id === x.id)).filter(Boolean)
        .sort((x, y) => uso(y) - uso(x) || conVideo(y) - conVideo(x) || entNombres(x).grande.localeCompare(entNombres(y).grande));
      // Y las de nombre parecido (mismas palabras en inglés o en español,
      // sin plurales ni guiones): «Pull Up» ↔ «Pull-ups», etc.
      if (opciones.length < 3 && typeof fbTokens === 'function') {
        const ka = [entNombres(a).grande, a.alias, a.nombre].filter(Boolean).map(fbTokens);
        vivos.map(v => ({ v, p: Math.max(...ka.flatMap(k => [entNombres(v).grande, v.alias, v.nombre].filter(Boolean).map(n => fbParecido(k, fbTokens(n))))) }))
          .filter(x => x.p >= 0.6 && !opciones.some(o => o.id === x.v.id))
          .sort((x, y) => y.p - x.p || uso(y.v) - uso(x.v)).slice(0, 3 - opciones.length).forEach(x => opciones.push(x.v));
      }
      const marcada = a.duplicado_de && vivosIds.has(a.duplicado_de) ? vivos.find(v => v.id === a.duplicado_de) : null;
      if (marcada) { const i = opciones.findIndex(o => o.id === marcada.id); if (i >= 0) opciones.splice(i, 1); opciones.unshift(marcada); }
      const clientes = [...(quien.get(a.id) || [])].map(c => nombre[c] || '').filter(Boolean).sort((x, y) => x.localeCompare(y));
      return { a, clientes, opciones };
    }).sort((x, y) => y.clientes.length - x.clientes.length || entNombres(x.a).grande.localeCompare(entNombres(y.a).grande));
    return _aeu.lista;
  })();
  try { return await _aeu.cargando; } finally { _aeu.cargando = null; }
}

// ── El aviso arriba de la Galería ────────────────────────────────────────
function aeuCajaHTML() { return '<div id="aeu-caja" data-aeu-caja></div>'; }

async function aeuPintar(force = false) {
  const caja = document.getElementById('aeu-caja');
  if (!caja) return;
  let lista = [];
  try { lista = await aeuCargar(force); } catch (e) { lista = []; }
  if (!caja.isConnected) return;
  if (!lista.length) { caja.innerHTML = ''; return; }
  const n = lista.length;
  const todos = (_ent.ejercicios || []);
  const prev = (e) => (typeof fbPrevFicha === 'function' ? fbPrevFicha(e) : '');
  const usoDe = (e) => { const k = _ent.enUso && _ent.enUso.get(e.id); return k ? `<span class="tag tag-blue">${k} ${k === 1 ? 'cliente' : 'clientes'} ahora</span>` : '<span class="tag tag-gray">nadie la usa</span>'; };
  const sinV = (e) => ((e.video_fuente || 'ninguno') === 'ninguno' ? '<span class="tag tag-red">sin video</span>' : '');
  const filas = lista.map(({ a, clientes, opciones }) => {
    const n = entNombres(a);
    const cand = (o, i) => { const no = entNombres(o); return `
          <div class="aeu-op" data-aeu-op="${o.id}">
            ${prev(o)}
            <div class="aeu-nn"><b>${escapeHtml(no.grande)}</b>${no.chico ? `<span>${escapeHtml(no.chico)}</span>` : ''}</div>
            <div class="aeu-tg">${usoDe(o)}${sinV(o)}${i === 0 && a.duplicado_de === o.id ? '<span class="tag tag-green">la que dejaste</span>' : ''}</div>
            <button type="button" class="btn btn-primary btn-sm" data-aeu-cambiar="${a.id}" data-aeu-a="${o.id}" onclick="aeuCambiar('${a.id}', '${o.id}')">Pasarles esta</button>
          </div>`; };
    return `
      <div class="aeu-f" data-aeu-ej="${a.id}">
        <div class="aeu-vieja">
          <div class="aeu-cab">La que tienen hoy (archivada)</div>
          ${prev(a)}
          <div class="aeu-nn"><b>${escapeHtml(n.grande)}</b>${n.chico ? `<span>${escapeHtml(n.chico)}</span>` : ''}</div>
          <div class="aeu-tg">${sinV(a)}</div>
          <div class="aeu-q">La tiene${clientes.length === 1 ? '' : 'n'} ${clientes.length} ${clientes.length === 1 ? 'cliente' : 'clientes'}: ${clientes.slice(0, 4).map(escapeHtml).join(', ')}${clientes.length > 4 ? ` y ${clientes.length - 4} más` : ''}</div>
          <button type="button" class="btn btn-ghost btn-sm" data-aeu-desarchivar="${a.id}" onclick="aeuDesarchivar('${a.id}')">Esta es la buena: desarchivarla</button>
        </div>
        <div class="aeu-ops">
          <div class="aeu-cab">${opciones.length ? 'Las de la galería que se parecen' : 'No encontré una parecida en la galería'}</div>
          <div class="aeu-ops-g">${opciones.map(cand).join('')}</div>
          <div class="aeu-otra">
            <input class="aeu-buscar" list="aeu-fichas" placeholder="Otra ficha: búscala por nombre" data-aeu-buscar="${a.id}" oninput="aeuBuscado('${a.id}', this.value)">
            <button type="button" class="btn btn-secondary btn-sm" data-aeu-cambiar-otra="${a.id}" disabled onclick="aeuCambiar('${a.id}', this.dataset.aeuA)">Pasarles esa</button>
          </div>
        </div>
      </div>`;
  }).join('');
  caja.innerHTML = `
    <div class="aeu-aviso" data-aeu-aviso>
      <div class="aeu-t">${n} ficha${n === 1 ? '' : 's'} archivada${n === 1 ? '' : 's'} que tus clientes aún tienen en su ciclo</div>
      <div class="aeu-d">Archivar no cambia sus rutinas: la siguen viendo con ese nombre y ese video. Compara y elige: «Pasarles esta» deja en su ciclo de ahora y en los que vienen la ficha que elijas, con las mismas series, repeticiones, descansos y notas, y su última vez y su historial pasan a la nueva. Si la archivada era la buena, desarchívala. No se borra nada.</div>
      <div class="aeu-lista">${filas}</div>
      <datalist id="aeu-fichas">${todos.map(e => `<option value="${escapeHtml(entNombres(e).grande)}"></option>`).join('')}</datalist>
    </div>`;
}
window.aeuPintar = aeuPintar;

window.aeuBuscado = (id, texto) => {
  const fila = document.querySelector(`[data-aeu-ej="${id}"]`);
  if (!fila) return;
  const btn = fila.querySelector('[data-aeu-cambiar-otra]');
  const t = String(texto || '').trim().toLowerCase();
  const e = (_ent.ejercicios || []).find(x => entNombres(x).grande.toLowerCase() === t);
  if (e && e.id !== id) { btn.dataset.aeuA = e.id; btn.disabled = false; } else { delete btn.dataset.aeuA; btn.disabled = true; }
};

// Los ciclos que se cambian: los de ahora (la misma regla de «Los usan
// ahora») y los que vienen. Los terminados no se tocan.
async function aeuRutinasACambiar(viejaId) {
  const res = [];
  for (let desde = 0; ; desde += 1000) {
    const d = await aeuLeer(sb.from('rutina_ejercicios').select('id, rutina_id, ejercicio_id, orden').eq('ejercicio_id', viejaId).order('id').range(desde, desde + 999));
    if (d === null) return null;
    res.push(...d);
    if (d.length < 1000) break;
  }
  if (!res.length) return [];
  const rutIds = [...new Set(res.map(x => x.rutina_id))];
  const ruts = [];
  for (const t of aeuTandas(rutIds)) ruts.push(...((await aeuLeer(sb.from('rutinas').select('id, nombre, fase_id, cliente_id, archivada').in('id', t))) || []));
  const faseIds = [...new Set(ruts.map(r => r.fase_id).filter(Boolean))];
  const fases = [];
  for (const t of aeuTandas(faseIds)) fases.push(...((await aeuLeer(sb.from('fases').select('id, cliente_id, estado, fecha_inicio, semanas, visible_cliente, orden, created_at').in('id', t))) || []));
  const clis = (await aeuLeer(sb.from('clientes').select('id, estado'))) || [];
  const activos = new Set(clis.filter(c => String(c.estado || 'activo').toLowerCase() === 'activo').map(c => c.id));
  // Todos los ciclos de esos clientes, para saber cuál es el de ahora.
  const cliIds = [...new Set(fases.map(f => f.cliente_id))].filter(c => activos.has(c));
  const suyas = [];
  for (const t of aeuTandas(cliIds)) suyas.push(...((await aeuLeer(sb.from('fases').select('id, cliente_id, estado, fecha_inicio, semanas, visible_cliente, orden, created_at').in('cliente_id', t))) || []));
  const hoy = fmt.hoy();
  const fin = (f) => f.fecha_inicio ? evtSumarDias(String(f.fecha_inicio).slice(0, 10), (Number(f.semanas) || 4) * 7 - 1) : null;
  const vale = new Set();
  cliIds.forEach(c => {
    const lista = suyas.filter(f => f.cliente_id === c && f.estado !== 'archivada');
    let ahora = lista.filter(f => f.estado === 'activa' || f.visible_cliente || (f.fecha_inicio && String(f.fecha_inicio).slice(0, 10) <= hoy && fin(f) >= hoy));
    if (!ahora.length && lista.length) {
      ahora = [[...lista].sort((a, b) => String(b.fecha_inicio || '').localeCompare(String(a.fecha_inicio || ''))
        || (b.orden || 0) - (a.orden || 0) || String(b.created_at || '').localeCompare(String(a.created_at || '')))[0]];
    }
    ahora.forEach(f => vale.add(f.id));
    // Los que vienen (o en preparación, sin fecha).
    lista.filter(f => !f.fecha_inicio || String(f.fecha_inicio).slice(0, 10) > hoy).forEach(f => vale.add(f.id));
  });
  const faseDe = Object.fromEntries(fases.map(f => [f.id, f]));
  const rutDe = Object.fromEntries(ruts.map(r => [r.id, r]));
  return res.filter(x => {
    const r = rutDe[x.rutina_id];
    return r && r.archivada !== true && r.fase_id && vale.has(r.fase_id);
  }).map(x => ({ ...x, rutina: rutDe[x.rutina_id], cliente_id: faseDe[rutDe[x.rutina_id].fase_id].cliente_id }));
}

window.aeuCambiar = async (viejaId, nuevaId) => {
  const item = (_aeu.lista || []).find(x => x.a.id === viejaId);
  const btn = document.querySelector(`[data-aeu-cambiar="${viejaId}"][data-aeu-a="${nuevaId}"]`) || document.querySelector(`[data-aeu-cambiar-otra="${viejaId}"]`);
  const nueva = (_ent.ejercicios || []).find(e => e.id === nuevaId);
  if (!item || !nueva) return toast('Elige la ficha buena');
  const nv = entNombres(item.a).grande, nn = entNombres(nueva).grande;
  const quienes = item.clientes.slice(0, 6).join(', ') + (item.clientes.length > 6 ? ` y ${item.clientes.length - 6} más` : '');
  if (!confirm(`En las rutinas de ${item.clientes.length === 1 ? 'tu cliente' : `tus ${item.clientes.length} clientes`} (${quienes}), «${nv}» se cambia por «${nn}».\n\nMismo orden, mismas series, repeticiones, descansos y notas. Su última vez y su historial pasan a «${nn}».\n\nSe cambia en su ciclo de ahora y en los que vienen; los ciclos terminados no se tocan. No se borra nada: «${nv}» sigue archivada.`)) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Cambiando…'; }
  const textoBtn = btn ? btn.textContent : '';
  const volver = () => { if (btn) { btn.disabled = false; btn.textContent = textoBtn; } };
  // 1) Primero la marca de «es la misma»: así la app ya junta su historial
  //    en la nueva en cuanto la vea en su rutina.
  const ahora = new Date().toISOString();
  const m = await sb.from('ejercicios').update({ duplicado_de: nueva.id, updated_at: ahora }).eq('id', viejaId);
  if (m.error) { volver(); return toastError('No se pudo cambiar: ' + m.error.message); }
  // 2) Las líneas de sus rutinas: solo cambia el ejercicio.
  const filas = await aeuRutinasACambiar(viejaId);
  if (filas === null) { volver(); return toastError('No pude leer sus rutinas. Intenta de nuevo.'); }
  let hechas = 0;
  for (const t of aeuTandas(filas.map(f => f.id), 100)) {
    const r = await sb.from('rutina_ejercicios').update({ ejercicio_id: nueva.id }).in('id', t);
    if (r.error) { volver(); toastError(`Se cambiaron ${hechas} de ${filas.length}. Lo demás no: ${r.error.message}`); break; }
    hechas += t.length;
  }
  // 3) La trazabilidad: qué había, qué quedó, en qué rutina.
  const hechasF = filas.slice(0, hechas);
  if (hechasF.length) {
    const log = hechasF.map(f => ({
      cliente_id: f.cliente_id || null, rutina_id: String(f.rutina_id), rutina_nombre: f.rutina.nombre || null,
      rutina_ejercicio_id: String(f.id), posicion: f.orden ?? null,
      ejercicio_antes: String(viejaId), nombre_antes: nv, ejercicio_despues: String(nueva.id), nombre_despues: nn,
      origen: 'galeria', creado_at: ahora,
    }));
    const { error } = await sb.from('cambios_ejercicio').insert(log);
    if (error && typeof entGuardarLocales === 'function') entGuardarLocales([...entCambiosLocales(), ...log]);
  }
  if (hechas === filas.length) toast(hechas ? `Listo: «${nn}» quedó en ${hechas} ${hechas === 1 ? 'línea' : 'líneas'} de sus rutinas.` : `Listo: «${nv}» ya no estaba en sus ciclos de ahora.`);
  _ent.enUso = null; _ent.quienUsa = null; _aeu.lista = null;
  await aeuPintar(true);
  if (typeof entRepintarGaleria === 'function' && document.getElementById('flt-lista')) entPintarListaGaleria();
};

// «Esta es la buena»: vuelve a la galería tal cual (sus clientes no notan
// nada). La otra ficha sigue ahí: decide en «Repetidos» cuál dejar.
window.aeuDesarchivar = async (id) => {
  const item = (_aeu.lista || []).find(x => x.a.id === id);
  if (!item) return;
  if (!confirm(`«${entNombres(item.a).grande}» vuelve a la galería. Sus clientes no notan nada: ya la tienen.\n\nSi hay otra ficha igual, en «Repetidos» eliges cuál dejar.`)) return;
  const { error } = await sb.from('ejercicios').update({ archivado: false, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return toastError('No se pudo: ' + error.message);
  toast('Listo: volvió a la galería');
  _ent.ejercicios = null; _ent.enUso = null; _ent.quienUsa = null; _aeu.lista = null;
  if (typeof entVistaEjercicios === 'function') entVistaEjercicios();
};
