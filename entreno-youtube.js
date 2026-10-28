// =====================================================
// VIDEOS DE YOUTUBE QUE NO SE REPRODUCEN FUERA DE YOUTUBE
// =====================================================
// Algunos videos los bloquea YouTube cuando se ven dentro de otra página (la
// app del cliente, este CRM): «Video no disponible», por derechos de autor
// (p. ej. LatinAutor - UMPG), por país, porque el dueño no deja insertarlo o
// porque lo borraron. En la app al cliente le sale ese mismo aviso.
//
// La única forma fiable de saberlo es intentarlo en un navegador y desde el
// país del cliente (los bloqueos por país no se ven desde un servidor de
// afuera). Por eso la revisión corre AQUÍ, en el navegador del coach: abre
// cada video con el reproductor de YouTube (el mismo youtube-nocookie que usa
// la app), sin sonido y escondido, y anota si arranca o si YouTube contesta
// con un error.
//
// Lo anotado va a la tabla `ejercicio_video_estado`
// (migraciones/videos-youtube-estado.sql); si aún no existe, queda en este
// navegador y se sube sola cuando exista. Con eso salen:
//   · la etiqueta «Problema en YouTube» en la galería y en «Revisar videos
//     uno a uno», con el motivo;
//   · el filtro «Con problemas en YouTube».
//
// Carga DESPUÉS de entrenamiento.js y entreno-videos.js.

const YT_CLAVE = 'crm:ytEstado';
const YT_CODIGOS_MAL = [100, 101, 150, 152, 153];
const _yt = {
  estado: null,        // video_ref → { estado: 'ok'|'problema', codigo, ejercicio_id, revisado_en }
  sinTabla: false,
  corriendo: false,
  parar: false,
  hechos: 0, total: 0, malos: [],
  sinRespuesta: 0,
  api: null,           // promesa de la API de YouTube cargada
  enCurso: new Set(),  // refs revisándose ahora (para no repetir)
};

const ytLocales = () => { try { return JSON.parse(localStorage.getItem(YT_CLAVE) || '{}'); } catch (e) { return {}; } };
const ytGuardarLocales = (m) => { try { localStorage.setItem(YT_CLAVE, JSON.stringify(m)); } catch (e) { /* lleno */ } };

async function entYtCargar(force = false) {
  if (_yt.estado && !force) return _yt.estado;
  const mapa = {};
  const { data, error } = await sb.from('ejercicio_video_estado').select('*');
  _yt.sinTabla = !!error;
  (data || []).forEach(f => { mapa[f.video_ref] = f; });
  // Lo del navegador manda si es más nuevo (y se sube si la tabla ya existe).
  const loc = ytLocales();
  const subir = [];
  Object.values(loc).forEach(f => {
    const n = mapa[f.video_ref];
    if (!n || String(f.revisado_en) > String(n.revisado_en)) { mapa[f.video_ref] = f; subir.push(f); }
  });
  _yt.estado = mapa;
  if (!_yt.sinTabla && subir.length) ytSubir(subir);
  return mapa;
}
window.entYtCargar = entYtCargar;

async function ytSubir(filas) {
  const { error } = await sb.from('ejercicio_video_estado').upsert(filas, { onConflict: 'user_id,video_ref' });
  if (!error) {
    const loc = ytLocales();
    filas.forEach(f => { if (loc[f.video_ref] && loc[f.video_ref].revisado_en === f.revisado_en) delete loc[f.video_ref]; });
    ytGuardarLocales(loc);
  } else _yt.sinTabla = true;
}

function ytAnotar(ref, estado, codigo, ejercicioId) {
  const f = { video_ref: ref, estado, codigo: codigo ?? null, ejercicio_id: ejercicioId || null, revisado_en: new Date().toISOString() };
  (_yt.estado || (_yt.estado = {}))[ref] = f;
  const loc = ytLocales(); loc[ref] = f; ytGuardarLocales(loc);
  ytSubir([f]);
  return f;
}

// ¿Este ejercicio tiene un video de YouTube que no se reproduce?
window.entYtProblema = (e) => !!e && e.video_fuente === 'youtube' && !!e.video_ref
  && !!_yt.estado && !!_yt.estado[e.video_ref] && _yt.estado[e.video_ref].estado === 'problema';
window.entYtEstadoRef = (ref) => (_yt.estado && _yt.estado[ref]) || null;

function entYtMotivo(codigo) {
  if (codigo === 100) return 'el video ya no existe o es privado';
  // Los de la revisión automática semanal (api/_videos.js de la app).
  if (codigo === 400 || codigo === 404) return 'el video ya no existe';
  if (codigo === 401 || codigo === 403) return 'el video es privado o el dueño no deja verlo fuera de YouTube';
  if (codigo === 101 || codigo === 150) return 'YouTube no deja verlo fuera de YouTube (derechos de autor, país o el dueño no lo permite)';
  if (codigo === 152 || codigo === 153) return 'YouTube no deja verlo dentro de otra página';
  return 'YouTube no lo reproduce';
}
window.entYtMotivo = entYtMotivo;

// La etiqueta (galería, revisión uno a uno, propuestas).
window.entYtEtiqueta = (ref, corta = false) => {
  const f = ref && _yt.estado && _yt.estado[ref];
  if (!f || f.estado !== 'problema') return '';
  return `<span class="tag tag-yellow" data-yt-problema="${escapeHtml(ref)}" title="${escapeHtml(entYtMotivo(f.codigo))}. En la app tampoco se ve.">${corta ? 'No se reproduce' : 'Problema en YouTube'}</span>`;
};

// ── El reproductor escondido ─────────────────────────────────────────────
function ytApi() {
  if (_yt.api) return _yt.api;
  _yt.api = new Promise((ok, mal) => {
    if (window.YT && window.YT.Player) return ok(window.YT);
    const previo = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (previo) try { previo(); } catch (e) {} ok(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { _yt.api = null; mal(new Error('No pude cargar el reproductor de YouTube')); };
    document.head.appendChild(s);
  });
  return _yt.api;
}

function ytCaja() {
  let c = document.getElementById('yt-revisor');
  if (!c) {
    c = document.createElement('div');
    c.id = 'yt-revisor';
    // YouTube no reproduce en cuadros de menos de 200×200: tamaño real,
    // pero transparente y sin recibir toques.
    c.style.cssText = 'position:fixed;right:0;bottom:0;width:240px;height:240px;opacity:0.01;pointer-events:none;overflow:hidden;z-index:-1';
    document.body.appendChild(c);
  }
  return c;
}

// Un video: 'ok' si arranca, 'problema' si YouTube contesta con error, null si
// no contestó a tiempo (red lenta: se puede volver a intentar).
async function ytProbar(ref, espera = 15000) {
  const YT = await ytApi();
  return new Promise((listo) => {
    const div = document.createElement('div');
    ytCaja().appendChild(div);
    let player = null, fin = false;
    const terminar = (r) => {
      if (fin) return; fin = true;
      clearTimeout(t);
      try { player && player.destroy(); } catch (e) {}
      div.remove();
      const caja = document.getElementById('yt-revisor');
      if (caja && !caja.children.length) caja.innerHTML = '';
      listo(r);
    };
    const t = setTimeout(() => terminar(null), espera);
    try {
      player = new YT.Player(div, {
        videoId: ref, width: 220, height: 220, host: 'https://www.youtube-nocookie.com',
        playerVars: { autoplay: 1, mute: 1, controls: 0, playsinline: 1, rel: 0 },
        events: {
          onReady: (ev) => { try { ev.target.mute(); ev.target.playVideo(); } catch (e) {} },
          onStateChange: (ev) => { if (ev.data === 1) terminar({ estado: 'ok' }); },
          onError: (ev) => terminar(YT_CODIGOS_MAL.includes(ev.data) ? { estado: 'problema', codigo: ev.data } : null),
        },
      });
    } catch (e) { terminar(null); }
  });
}

// Revisa un video y lo anota. Devuelve lo anotado (o null si no contestó).
window.entYtRevisarUno = async (ref, ejercicioId = null) => {
  if (!ref || _yt.enCurso.has(ref)) return null;
  _yt.enCurso.add(ref);
  try {
    await entYtCargar();
    const r = await ytProbar(ref);
    return r ? ytAnotar(ref, r.estado, r.codigo, ejercicioId) : null;
  } catch (e) { return null; } finally { _yt.enCurso.delete(ref); }
};

// ── La revisión de toda la galería ───────────────────────────────────────
// `soloSinRevisar`: salta los que ya se revisaron (más rápido la 2ª vez).
window.entYtRevisarGaleria = async (soloSinRevisar = false) => {
  if (_yt.corriendo) return entYtPintar();
  const todos = await entDb.ejercicios();
  await entYtCargar();
  const porRef = new Map();
  todos.filter(e => !e.archivado && e.video_fuente === 'youtube' && e.video_ref).forEach(e => { if (!porRef.has(e.video_ref)) porRef.set(e.video_ref, e.id); });
  let cola = [...porRef.entries()];
  if (soloSinRevisar) cola = cola.filter(([ref]) => !_yt.estado[ref]);
  Object.assign(_yt, { corriendo: true, parar: false, hechos: 0, total: cola.length, malos: [], sinRespuesta: 0 });
  entYtPintar();
  try { await ytApi(); } catch (e) { _yt.corriendo = false; toast(e.message); return entYtPintar(); }
  // Tres a la vez: rápido sin saturar el navegador.
  const trabajador = async () => {
    while (cola.length && !_yt.parar) {
      const [ref, id] = cola.shift();
      const f = await entYtRevisarUno(ref, id);
      _yt.hechos++;
      if (!f) _yt.sinRespuesta++;
      else if (f.estado === 'problema') _yt.malos.push(id);
      entYtPintar();
    }
  };
  await Promise.all([trabajador(), trabajador(), trabajador()]);
  _yt.corriendo = false;
  entYtPintar();
  if (typeof entRepintarGaleria === 'function' && _ent.tab === 'ejercicios') entRepintarGaleria();
};

window.entYtDetener = () => { _yt.parar = true; };

// «Revisarlos uno a uno»: la galería filtrada a los que tienen problema.
window.entYtVerMalos = async () => {
  closeModal();
  _ent.filtros.video = 'yt';
  if (typeof entVistaEjercicios === 'function' && _ent.tab === 'ejercicios') await entVistaEjercicios();
  entRevisarVideos();
};

// La ventana (se abre desde la galería: «Revisar YouTube»).
window.entYtAbrir = async () => {
  await Promise.all([entDb.ejercicios(), entYtCargar()]);
  entYtPintar(true);
};

function entYtPintar(abrir = false) {
  const caja = document.querySelector('[data-yt-ventana]');
  if (!caja && !abrir) return;
  const todos = (_ent.ejercicios || []).filter(e => !e.archivado && e.video_fuente === 'youtube' && e.video_ref);
  const malos = todos.filter(e => entYtProblema(e));
  const revisados = todos.filter(e => _yt.estado && _yt.estado[e.video_ref]).length;
  const pct = _yt.total ? Math.round(_yt.hechos / _yt.total * 100) : 0;
  const cuerpo = `
    <div data-yt-ventana>
      <p class="text-sm text-slate-600 mb-3">Abro cada video de YouTube de la galería como lo abre la app del cliente (sin sonido y escondido)
        y anoto los que YouTube no deja ver fuera de YouTube: «Video no disponible» por derechos de autor, por país, porque el dueño no lo permite o porque lo borraron.
        <b>Esos tampoco se ven en la app.</b></p>
      ${_yt.sinTabla ? `<div class="text-xs text-slate-500 bg-slate-50 rounded-lg p-2 mb-3">Lo revisado queda en este navegador hasta que corras <code>migraciones/videos-youtube-estado.sql</code> en Supabase; después se sube solo.</div>` : ''}
      <div class="grid grid-cols-3 gap-2 mb-3 text-center">
        <div class="card p-2"><div class="text-xl font-bold">${todos.length}</div><div class="text-[11px] text-slate-500">videos de YouTube</div></div>
        <div class="card p-2"><div class="text-xl font-bold">${revisados}</div><div class="text-[11px] text-slate-500">revisados</div></div>
        <div class="card p-2"><div class="text-xl font-bold" style="color:#EE8434" data-yt-malos>${malos.length}</div><div class="text-[11px] text-slate-500">con problema</div></div>
      </div>
      ${_yt.corriendo || _yt.total ? `
        <div class="mb-1 text-xs text-slate-500" data-yt-avance>${_yt.corriendo ? 'Revisando' : 'Listo'}: ${_yt.hechos} de ${_yt.total}${_yt.sinRespuesta ? ` · ${_yt.sinRespuesta} sin respuesta (red lenta: se pueden volver a intentar)` : ''}</div>
        <div style="height:6px;border-radius:99px;background:rgba(60,123,214,.12);overflow:hidden" class="mb-3"><div style="height:100%;width:${pct}%;background:#3C7BD6;border-radius:99px;transition:width .3s"></div></div>` : ''}
      ${malos.length ? `
        <div class="sec-title">Con problema</div>
        <div class="flex flex-col gap-1 mb-2" style="max-height:240px;overflow:auto">
          ${malos.map(e => `<button type="button" class="text-left text-sm rounded-lg px-2 py-1.5 hover:bg-slate-50" onclick="closeModal(); entVideoRapido('${e.id}', ${escapeHtml(JSON.stringify(malos.map(x => x.id)))})">
            <b>${escapeHtml(entNombres(e).grande)}</b> <span class="text-slate-400 text-xs">· ${escapeHtml(entYtMotivo(_yt.estado[e.video_ref].codigo))}</span></button>`).join('')}
        </div>` : ''}
    </div>`;
  const pie = _yt.corriendo
    ? `<button class="btn btn-ghost" onclick="entYtDetener()">Detener</button>`
    : `${malos.length ? `<button class="btn btn-primary" onclick="entYtVerMalos()">Revisarlos uno a uno</button>` : ''}
       ${revisados && revisados < todos.length ? `<button class="btn btn-secondary" onclick="entYtRevisarGaleria(true)">Revisar los que faltan</button>` : ''}
       <button class="btn ${malos.length ? 'btn-secondary' : 'btn-primary'}" onclick="entYtRevisarGaleria()">${revisados ? 'Revisar todo otra vez' : 'Revisar todos'}</button>
       <button class="btn btn-ghost" onclick="closeModal()">Cerrar</button>`;
  if (caja && !abrir) {
    caja.outerHTML = cuerpo.trim();
    const p = document.querySelector('[data-yt-pie]');
    if (p) p.innerHTML = pie;
    return;
  }
  openModal(modalShell('Videos de YouTube que no se reproducen', cuerpo, `<div data-yt-pie class="flex flex-wrap gap-2 justify-end w-full">${pie}</div>`));
}

// Al poner un video nuevo, se revisa solo: si YouTube no lo deja ver, la
// ventana lo dice en el momento.
if (typeof entPonerVideo === 'function') {
  const ponerAntes = entPonerVideo;
  // eslint-disable-next-line no-global-assign
  entPonerVideo = async (id, ref, inicio) => {
    const r = await ponerAntes(id, ref, inicio);
    if (r && ref) entYtRevisarUno(ref, id).then(f => {
      if (f && document.querySelector(`[data-video-rapido="${id}"]`) && typeof entPintarVideoRapido === 'function') entPintarVideoRapido();
    });
    return r;
  };
}
