// =====================================================
// VIDEOS DE LA GALERÍA · cambiar el video de un ejercicio en un toque
// =====================================================
// Dos cosas, en una misma ventana:
//
//   1. TRES PROPUESTAS por ejercicio para elegir: videos cortos del ejercicio,
//      ya buscados y medidos (duración, si tienen voz). Se ven ahí mismo y se
//      ponen con «Usar este». Llegan con carga/propuestas-videos.sql.
//   2. PEGAR TU LINK: cualquier link de YouTube (normal, youtu.be, shorts) y,
//      si trae «?t=», también el segundo en que empieza.
//
// Se abre desde el botón «🎬 Video» de cada tarjeta, o con «Revisar videos
// uno a uno», que recorre la lista filtrada con Anterior / Siguiente: así se
// revisa la galería entera sin abrir y cerrar el editor 200 veces.
//
// Carga DESPUÉS de entrenamiento.js: usa sus funciones y su estado (_ent).

const _vid = {
  propuestas: null,     // ejercicio_id → [propuestas], o null si aún no se leyó
  sinTabla: false,      // la tabla aún no existe (falta correr el SQL)
  cola: [],             // ids que se recorren con Anterior / Siguiente
  pos: 0,
  previo: {},           // ejercicio_id → el video que tenía antes de cambiarlo (para deshacer)
  reproduciendo: null,  // ref que se está viendo ahora en la ventana
};

// «?t=90», «&t=1m30s», «?start=90»: el segundo de inicio del link, si lo trae.
function entYoutubeInicio(url) {
  const m = String(url || '').match(/[?&#](?:t|start)=([0-9hms]+)/i);
  if (!m) return null;
  const v = m[1].toLowerCase();
  if (/^\d+$/.test(v)) return Number(v) || null;
  const h = (v.match(/(\d+)h/) || [])[1] || 0, mi = (v.match(/(\d+)m/) || [])[1] || 0, s = (v.match(/(\d+)s/) || [])[1] || 0;
  return (Number(h) * 3600 + Number(mi) * 60 + Number(s)) || null;
}
window.entYoutubeInicio = entYoutubeInicio;

const entDuracion = (seg) => seg ? `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}` : '';

async function entCargarPropuestas(force = false) {
  if (_vid.propuestas && !force) return _vid.propuestas;
  const { data, error } = await sb.from('ejercicio_video_propuestas').select('*').order('orden');
  _vid.sinTabla = !!error;
  const mapa = {};
  (data || []).forEach(p => { (mapa[p.ejercicio_id] || (mapa[p.ejercicio_id] = [])).push(p); });
  _vid.propuestas = mapa;
  return mapa;
}

// Guarda el video de YouTube en el ejercicio. Solo toca las columnas del video.
async function entPonerVideo(id, ref, inicio = null) {
  const e = (_ent.ejercicios || []).find(x => x.id === id);
  if (e) _vid.previo[id] = { video_fuente: e.video_fuente, video_ref: e.video_ref, video_url: e.video_url, video_inicio_seg: e.video_inicio_seg, video_path: e.video_path, poster_path: e.poster_path };
  const row = {
    video_fuente: 'youtube', video_ref: ref,
    video_url: `https://www.youtube.com/watch?v=${ref}${inicio ? `&t=${inicio}s` : ''}`,
    video_inicio_seg: inicio || null, video_path: null, poster_path: null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from('ejercicios').update(row).eq('id', id);
  if (error) { toast(error.message); return false; }
  // Se actualiza en memoria: la galería de atrás se repinta con la miniatura
  // nueva sin volver a leer los 300 ejercicios.
  if (e) Object.assign(e, row);
  return true;
}

// Reproductor en la ventana. youtube-nocookie: sin cookies de YouTube en el CRM.
function entReproductor(ref, inicio) {
  return `<iframe src="https://www.youtube-nocookie.com/embed/${escapeHtml(ref)}?autoplay=1&rel=0${inicio ? `&start=${inicio}` : ''}"
    class="w-full rounded-lg" style="aspect-ratio:16/9;border:0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
}
function entMiniaturaVideo(ref, inicio, etiqueta = '') {
  if (_vid.reproduciendo === ref) return entReproductor(ref, inicio);
  return `
    <button type="button" class="relative block w-full rounded-lg overflow-hidden bg-slate-100" style="aspect-ratio:16/9"
            onclick="entVerVideoAqui('${escapeHtml(ref)}')" title="Ver aquí">
      <img src="${entYoutubeThumb(ref)}" class="w-full h-full object-cover" alt="" loading="lazy">
      <span class="absolute inset-0 flex items-center justify-center">
        <span class="w-11 h-11 rounded-full bg-black/60 text-white flex items-center justify-center text-lg">▶</span>
      </span>
      ${etiqueta ? `<span class="absolute top-1.5 left-1.5 text-[11px] font-bold bg-white/90 rounded-full px-2 py-0.5">${etiqueta}</span>` : ''}
    </button>`;
}

window.entVerVideoAqui = (ref) => { _vid.reproduciendo = ref; entPintarVideoRapido(); };

// ── La ventana ───────────────────────────────────────────────────────────
window.entVideoRapido = async (id, cola = null) => {
  if (cola) { _vid.cola = cola; _vid.pos = Math.max(0, cola.indexOf(id)); }
  else { _vid.cola = [id]; _vid.pos = 0; }
  _vid.reproduciendo = null;
  await Promise.all([entDb.ejercicios(), entCargarPropuestas()]);
  entPintarVideoRapido();
};

// «Revisar videos uno a uno»: la lista tal como la dejan los filtros.
window.entRevisarVideos = async () => {
  const todos = await entDb.ejercicios();
  if (_ent.filtros.uso) await entDb.ejerciciosEnUso();
  const lista = entFiltrar(todos);
  if (!lista.length) return toast('No hay ejercicios con esos filtros');
  entVideoRapido(lista[0].id, lista.map(e => e.id));
};

window.entVideoMover = (paso) => {
  const n = _vid.pos + paso;
  if (n < 0 || n >= _vid.cola.length) return;
  _vid.pos = n; _vid.reproduciendo = null;
  entPintarVideoRapido();
};

function entPintarVideoRapido() {
  const id = _vid.cola[_vid.pos];
  const e = (_ent.ejercicios || []).find(x => x.id === id);
  if (!e) return toast('No encuentro ese ejercicio');
  const n = entNombres(e);
  const actual = e.video_fuente === 'youtube' ? e.video_ref : null;
  const props = ((_vid.propuestas || {})[id] || []).filter(p => p.ref !== actual).slice(0, 3);
  const previo = _vid.previo[id];
  const enCola = _vid.cola.length > 1;
  const nomBusqueda = encodeURIComponent((e.alias || e.nombre || '') + ' exercise');

  const bloqueActual = actual
    ? entMiniaturaVideo(actual, e.video_inicio_seg, 'Ahora')
    : e.video_fuente === 'archivo'
      ? '<div class="rounded-lg bg-slate-100 text-slate-500 text-sm p-4 text-center">Tiene un video <b>subido</b> (archivo). Si eliges uno de YouTube, lo reemplaza.</div>'
      : '<div class="rounded-lg bg-amber-50 text-amber-800 text-sm p-4 text-center">Este ejercicio <b>no tiene video</b>.</div>';

  const tarjetaPropuesta = (p, i) => `
    <div class="border border-slate-200 rounded-xl p-2 flex flex-col gap-1.5" data-propuesta="${escapeHtml(p.ref)}">
      ${entMiniaturaVideo(p.ref, null, `Opción ${i + 1}`)}
      <div class="text-xs font-semibold text-slate-800 leading-snug" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(p.titulo || '')}</div>
      <div class="text-[11px] text-slate-500">${escapeHtml(p.canal || '')}${p.duracion_seg ? ` · ${entDuracion(p.duracion_seg)}` : ''}</div>
      <div class="flex flex-wrap gap-1">
        ${p.habla === false ? '<span class="tag tag-green">Sin voz</span>' : p.habla ? '<span class="tag tag-gray">Con voz</span>' : ''}
        ${p.vertical ? '<span class="tag tag-gray">Vertical</span>' : ''}
      </div>
      <button class="btn btn-primary btn-sm mt-auto" onclick="entUsarPropuesta('${escapeHtml(p.ref)}')">Usar este</button>
    </div>`;

  const propuestasHtml = _vid.sinTabla
    ? `<div class="text-sm text-slate-500 bg-slate-50 rounded-lg p-3">Las propuestas llegan al correr <code>carga/propuestas-videos.sql</code> en Supabase. Mientras tanto puedes pegar tu link abajo.</div>`
    : props.length
      ? `<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">${props.map(tarjetaPropuesta).join('')}</div>`
      : `<div class="text-sm text-slate-500 bg-slate-50 rounded-lg p-3">No encontré propuestas para este ejercicio. Búscalo en YouTube y pega el link abajo.</div>`;

  openModal(modalShell(
    `🎬 ${escapeHtml(n.grande)}${n.chico ? ` <span class="font-normal text-slate-400 text-sm">· ${escapeHtml(n.chico)}</span>` : ''}`,
    `
    <div data-video-rapido="${escapeHtml(id)}">
      <div class="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 mb-5">
        <div>
          <div class="sec-title">Video actual</div>
          ${bloqueActual}
          ${previo ? `<button class="btn btn-ghost btn-sm mt-2" onclick="entDeshacerVideo()">↩ Volver al que tenía antes</button>` : ''}
        </div>
        <div>
          <div class="sec-title">Pega tu link</div>
          <input id="vr-url" placeholder="https://youtu.be/… · youtube.com/shorts/… · watch?v=…"
                 oninput="entVrValidar(this.value)" onkeydown="if(event.key==='Enter')entVrGuardarLink()">
          <div id="vr-estado" class="text-xs mt-1 text-slate-400">Si el link trae «?t=», el video empieza en ese segundo.</div>
          <div class="flex gap-2 items-end mt-2">
            <div class="flex-1"><label>Empezar en el segundo (opcional)</label>
              <input id="vr-inicio" type="number" min="0" placeholder="0"></div>
            <button class="btn btn-primary" onclick="entVrGuardarLink()">Guardar link</button>
          </div>
          <div class="flex flex-wrap gap-3 mt-3 text-xs">
            <a class="underline text-slate-500" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${nomBusqueda}">Buscar en YouTube ↗</a>
            <a class="underline text-slate-500" target="_blank" rel="noopener" href="https://www.youtube.com/@proetejercicioterapeutico5675/search?query=${encodeURIComponent(e.nombre || '')}">Buscar en PROET ↗</a>
          </div>
        </div>
      </div>
      <div class="sec-title">Propuestas para elegir</div>
      ${propuestasHtml}
    </div>`,
    `${enCola ? `
       <button class="btn btn-secondary" onclick="entVideoMover(-1)" ${_vid.pos === 0 ? 'disabled' : ''}>← Anterior</button>
       <span class="text-sm text-slate-500 self-center px-2">${_vid.pos + 1} de ${_vid.cola.length}</span>
       <button class="btn btn-secondary" onclick="entVideoMover(1)" ${_vid.pos >= _vid.cola.length - 1 ? 'disabled' : ''}>Siguiente →</button>` : ''}
     <button class="btn btn-ghost" onclick="entCerrarVideoRapido()">Cerrar</button>`
  ), { wide: true });
}

window.entVrValidar = (url) => {
  const ref = entYoutubeId(url), ini = entYoutubeInicio(url);
  const est = $('#vr-estado');
  if (ini != null && $('#vr-inicio')) $('#vr-inicio').value = ini;
  if (!est) return;
  est.textContent = ref ? `✓ Video reconocido (${ref})${ini ? ` · empieza en el segundo ${ini}` : ''}` : (url ? '✗ No reconozco ese link de YouTube' : 'Si el link trae «?t=», el video empieza en ese segundo.');
  est.className = `text-xs mt-1 ${ref ? 'text-emerald-600' : (url ? 'text-red-500' : 'text-slate-400')}`;
};

async function entTrasCambiar(mensaje) {
  toast(mensaje);
  _vid.reproduciendo = null;
  // En la revisión uno a uno se pasa solo al siguiente: es lo que se hace
  // casi siempre después de elegir.
  if (_vid.cola.length > 1 && _vid.pos < _vid.cola.length - 1) { _vid.pos++; }
  entPintarVideoRapido();
}

window.entUsarPropuesta = async (ref) => {
  const id = _vid.cola[_vid.pos];
  if (await entPonerVideo(id, ref)) entTrasCambiar('✓ Video cambiado');
};

window.entVrGuardarLink = async () => {
  const url = ($('#vr-url') || {}).value || '';
  const ref = entYoutubeId(url);
  if (!ref) { entVrValidar(url || ' '); return toast('Ese link de YouTube no es válido'); }
  const inicio = Number(($('#vr-inicio') || {}).value) || entYoutubeInicio(url) || null;
  const id = _vid.cola[_vid.pos];
  if (await entPonerVideo(id, ref, inicio)) entTrasCambiar('✓ Link guardado');
};

window.entDeshacerVideo = async () => {
  const id = _vid.cola[_vid.pos];
  const antes = _vid.previo[id];
  if (!antes) return;
  const { error } = await sb.from('ejercicios').update({ ...antes, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return toast(error.message);
  const e = (_ent.ejercicios || []).find(x => x.id === id);
  if (e) Object.assign(e, antes);
  delete _vid.previo[id];
  _vid.reproduciendo = null;
  toast('Volvió el video de antes');
  entPintarVideoRapido();
};

// Al cerrar, la galería de atrás se repinta con las miniaturas nuevas.
window.entCerrarVideoRapido = () => {
  closeModal();
  if (typeof entVistaEjercicios === 'function' && _ent.tab === 'ejercicios' && !_ent.rutinaId) entVistaEjercicios();
};
