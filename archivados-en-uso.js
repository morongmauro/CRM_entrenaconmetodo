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

// Dónde está cada ficha, con la MISMA regla de la app: el ciclo que ve hoy
// cada cliente activo (de los enviados —activa y visible— el que empezó más
// reciente; si ninguno empezó, el de mayor orden) y los que vienen (empiezan
// después de hoy). Un ciclo viejo que siga marcado «activa» no cuenta: la app
// ya no se lo muestra. { ejercicioId: [{ cliente, ciclo, rutina, cuando, reId, rutinaId, clienteId, orden, rutinaNombre }] }
async function aeuDonde(ids) {
  const out = Object.fromEntries(ids.map(id => [id, []]));
  if (!ids.length) return out;
  const filas = [];
  for (const t of aeuTandas(ids)) {
    for (let desde = 0; ; desde += 1000) {
      const d = await aeuLeer(sb.from('rutina_ejercicios').select('id, rutina_id, ejercicio_id, orden').in('ejercicio_id', t).order('id').range(desde, desde + 999));
      if (d === null) return null;
      filas.push(...d);
      if (d.length < 1000) break;
    }
  }
  if (!filas.length) return out;
  const ruts = [];
  for (const t of aeuTandas([...new Set(filas.map(x => x.rutina_id))])) ruts.push(...((await aeuLeer(sb.from('rutinas').select('id, nombre, fase_id, archivada').in('id', t))) || []));
  const fasesR = [];
  for (const t of aeuTandas([...new Set(ruts.map(r => r.fase_id).filter(Boolean))])) fasesR.push(...((await aeuLeer(sb.from('fases').select('id, cliente_id').in('id', t))) || []));
  const clis = (await aeuLeer(sb.from('clientes').select('id, nombre, estado'))) || [];
  const activos = new Map(clis.filter(c => String(c.estado || 'activo').toLowerCase() === 'activo').map(c => [c.id, c.nombre || 'Sin nombre']));
  const cliIds = [...new Set(fasesR.map(f => f.cliente_id))].filter(c => activos.has(c));
  const suyas = [];
  for (const t of aeuTandas(cliIds)) suyas.push(...((await aeuLeer(sb.from('fases').select('id, cliente_id, nombre, estado, fecha_inicio, visible_cliente, orden').in('cliente_id', t))) || []));
  const hoy = fmt.hoy();
  const dia = (f) => String(f.fecha_inicio || '').slice(0, 10);
  const cuando = {};   // faseId → 'ahora' | 'viene'
  cliIds.forEach(c => {
    const lista = suyas.filter(f => f.cliente_id === c && f.estado !== 'archivada');
    const enviadas = lista.filter(f => f.estado === 'activa' && f.visible_cliente === true).sort((a, b) => (b.orden || 0) - (a.orden || 0));
    const empezadas = enviadas.filter(f => dia(f) && dia(f) <= hoy).sort((a, b) => dia(b).localeCompare(dia(a)) || (b.orden || 0) - (a.orden || 0));
    const vig = empezadas[0] || enviadas[0] || null;
    if (vig) cuando[vig.id] = 'ahora';
    lista.filter(f => dia(f) > hoy && !(vig && f.id === vig.id)).forEach(f => { cuando[f.id] = 'viene'; });
  });
  const faseDe = Object.fromEntries(suyas.map(f => [f.id, f]));
  const rutDe = Object.fromEntries(ruts.map(r => [r.id, r]));
  filas.forEach(x => {
    const r = rutDe[x.rutina_id];
    const f = r && r.archivada !== true && r.fase_id ? faseDe[r.fase_id] : null;
    if (!f || !cuando[f.id] || !activos.has(f.cliente_id)) return;
    out[x.ejercicio_id].push({ cliente: activos.get(f.cliente_id), clienteId: f.cliente_id, ciclo: f.nombre || 'Ciclo', rutina: r.nombre || 'Rutina', cuando: cuando[f.id], reId: x.id, rutinaId: x.rutina_id, orden: x.orden });
  });
  return out;
}

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
    const donde = (await aeuDonde(archivadas.map(a => a.id))) || {};
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
      const d = donde[a.id] || [];
      const clientes = [...new Set(d.map(x => x.cliente))].sort((x, y) => x.localeCompare(y));
      return { a, clientes, donde: d, opciones };
    }).filter(x => x.donde.length).sort((x, y) => y.clientes.length - x.clientes.length || entNombres(x.a).grande.localeCompare(entNombres(y.a).grande));
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
  const filas = lista.map(({ a, clientes, donde, opciones }) => {
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
          <div class="aeu-q">La tiene${clientes.length === 1 ? '' : 'n'} ${clientes.length} ${clientes.length === 1 ? 'cliente' : 'clientes'}:</div>
          <ul class="aeu-donde" data-aeu-donde>${[...new Map(donde.map(x => [`${x.clienteId}|${x.ciclo}|${x.rutina}`, x])).values()].slice(0, 8).map(x => `<li><b>${escapeHtml(x.cliente)}</b> · ${escapeHtml(x.ciclo)} ${x.cuando === 'ahora' ? '(el de ahora)' : '(el que viene)'} · ${escapeHtml(x.rutina)}</li>`).join('')}</ul>
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

// Lo que se cambia: las líneas de sus rutinas en el ciclo que ve hoy y en
// los que vienen (aeuDonde). Los terminados no se tocan.
async function aeuRutinasACambiar(viejaId) {
  const d = await aeuDonde([viejaId]);
  if (d === null) return null;
  return (d[viejaId] || []).map(x => ({ id: x.reId, rutina_id: x.rutinaId, orden: x.orden, cliente_id: x.clienteId, rutina: { nombre: x.rutina } }));
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
  if (m.error) {
    volver();
    // Sin la columna todavía: no se cambió nada.
    if (/duplicado_de/.test(m.error.message || '')) return toastError('Falta un paso: corre migraciones/fichas-reemplazadas.sql en Supabase y vuelve a tocar «Pasarles esta». No se cambió nada.', 12000);
    return toastError('No se pudo cambiar: ' + m.error.message);
  }
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
