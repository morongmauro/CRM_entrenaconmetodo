// =====================================================
// VIDEOS DE YOUTUBE ROTOS · el aviso en Seguimiento
// =====================================================
// La app revisa sola, una vez por semana, cada video de YouTube de la galería
// (api/_videos.js del mealtracker) y lo anota en ejercicio_video_estado, la
// misma tabla del botón «Revisar YouTube». Si alguno no se ve en la app, aquí
// sale arriba de Seguimiento con el botón para arreglarlos uno a uno. Sin
// videos con problema, no sale nada.
//
// Carga DESPUÉS de entrenamiento.js y entreno-youtube.js.

function vrCajaHTML() {
  return '<div id="seg-videos-rotos" data-videos-rotos></div>';
}

// ¿Quién lo usa ahora? Los clientes activos que tienen ese ejercicio en una
// rutina de su ciclo vigente. { idEjercicio: ['Ana Pérez', …] } (2 min).
const _vr = { uso: null, t: 0 };
async function vrEnUso(ids) {
  if (_vr.uso && Date.now() - _vr.t < 120000 && ids.every(id => id in _vr.uso)) return _vr.uso;
  const out = Object.fromEntries(ids.map(id => [id, []]));
  try {
    const leer = async (q) => { const { data, error } = await q; return error ? [] : (data || []); };
    const clientes = (await db.clientes.list()).filter(c => String(c.estado || 'activo').toLowerCase() === 'activo');
    const fases = await leer(sb.from('fases').select('id, cliente_id, fecha_inicio, estado, visible_cliente, orden').in('cliente_id', clientes.map(c => c.id)));
    const vig = {};
    clientes.forEach(c => { const f = typeof entCicloVigente === 'function' ? entCicloVigente(fases.filter(x => String(x.cliente_id) === String(c.id))) : null; if (f) vig[f.id] = c; });
    const faseIds = Object.keys(vig);
    const ruts = faseIds.length ? (await leer(sb.from('rutinas').select('id, fase_id, archivada').in('fase_id', faseIds))).filter(r => r.archivada !== true) : [];
    const res = ruts.length && ids.length ? await leer(sb.from('rutina_ejercicios').select('rutina_id, ejercicio_id').in('rutina_id', ruts.map(r => r.id)).in('ejercicio_id', ids)) : [];
    const faseDe = Object.fromEntries(ruts.map(r => [r.id, r.fase_id]));
    res.forEach(x => { const c = vig[faseDe[x.rutina_id]]; if (c && out[x.ejercicio_id] && !out[x.ejercicio_id].includes(c.nombre)) out[x.ejercicio_id].push(c.nombre); });
  } catch (e) { /* sin datos: «no se sabe» */ }
  _vr.uso = { ...(_vr.uso || {}), ...out }; _vr.t = Date.now();
  return _vr.uso;
}
window.vrUsoDe = (id) => (_vr.uso ? _vr.uso[id] : undefined);
const vrQuien = (l) => (!l ? '' : l.length ? `Lo usa${l.length === 1 ? '' : 'n'} ahora: ${l.slice(0, 3).map(escapeHtml).join(', ')}${l.length > 3 ? ` y ${l.length - 3} más` : ''}` : 'Ningún cliente lo usa ahora');

async function vrPintar() {
  const caja = document.getElementById('seg-videos-rotos');
  if (!caja || typeof entYtCargar !== 'function' || typeof entDb === 'undefined') return;
  let malos = [], uso = {};
  try {
    await Promise.all([entDb.ejercicios(), entYtCargar(true)]);
    malos = (_ent.ejercicios || []).filter(e => !e.archivado && entYtProblema(e));
    if (malos.length) uso = await vrEnUso(malos.map(e => e.id));
  } catch (e) { malos = []; }
  if (!caja.isConnected) return;
  if (!malos.length) { caja.innerHTML = ''; return; }
  const n = malos.length;
  // Primero los que usan clientes ahora (los que urgen), con más clientes arriba.
  const orden = malos.slice().sort((a, b) => ((uso[b.id] || []).length - (uso[a.id] || []).length) || String(a.alias || a.nombre).localeCompare(String(b.alias || b.nombre)));
  const enUso = orden.filter(e => (uso[e.id] || []).length).length;
  const filas = orden.slice(0, 8).map(e => { const l = uso[e.id] || []; return `<div class="vr-f" data-vr-ej="${e.id}" data-vr-uso="${l.length}"><b>${escapeHtml(e.alias || e.nombre)}</b><span class="${l.length ? 'vr-usa' : 'vr-nadie'}">${vrQuien(l)}</span></div>`; }).join('');
  caja.innerHTML = `
    <div class="vr-aviso" data-vr-aviso>
      <div class="vr-txt">
        <div class="vr-t">${n} video${n === 1 ? '' : 's'} de YouTube no se ve${n === 1 ? '' : 'n'} en la app${` · <span class="${enUso ? 'vr-usa' : 'vr-nadie'}" data-vr-en-uso="${enUso}">${enUso ? `${enUso} en uso por clientes ahora` : 'ningún cliente los usa ahora'}</span>`}</div>
        <div class="vr-d">Tus clientes ven «Video no disponible» en esos ejercicios.</div>
        <div class="vr-lista">${filas}${n > 8 ? `<div class="vr-f"><span class="vr-nadie">y ${n - 8} más</span></div>` : ''}</div>
      </div>
      <button type="button" class="btn btn-primary btn-sm" data-vr-revisar onclick="vrRevisar()">Revisarlos</button>
    </div>`;
}
window.vrPintar = vrPintar;

// A la galería, filtrada a los que tienen problema, abriendo el primero.
window.vrRevisar = async () => {
  _ent.tab = 'ejercicios';
  _ent.filtros.video = 'yt';
  await navigate('entrenamiento');
  if (typeof entRevisarVideos === 'function') entRevisarVideos();
};
