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

async function vrPintar() {
  const caja = document.getElementById('seg-videos-rotos');
  if (!caja || typeof entYtCargar !== 'function' || typeof entDb === 'undefined') return;
  let malos = [];
  try {
    await Promise.all([entDb.ejercicios(), entYtCargar(true)]);
    malos = (_ent.ejercicios || []).filter(e => !e.archivado && entYtProblema(e));
  } catch (e) { malos = []; }
  if (!caja.isConnected) return;
  if (!malos.length) { caja.innerHTML = ''; return; }
  const n = malos.length;
  const nombres = malos.slice(0, 3).map(e => escapeHtml(e.alias || e.nombre)).join(', ') + (n > 3 ? ` y ${n - 3} más` : '');
  caja.innerHTML = `
    <div class="vr-aviso" data-vr-aviso>
      <div class="vr-txt">
        <div class="vr-t">${n} video${n === 1 ? '' : 's'} de YouTube no se ve${n === 1 ? '' : 'n'} en la app</div>
        <div class="vr-d">${nombres}. Tus clientes ven «Video no disponible» en esos ejercicios.</div>
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
