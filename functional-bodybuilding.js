// =====================================================
// GALERÍA · VIDEOS DE FUNCTIONAL BODYBUILDING
// =====================================================
// El canal youtube.com/@FunctionalBodybuilding tiene un clip corto (10-20 s)
// por ejercicio, con el nombre en inglés. La lista está en fb-videos.json
// (se lee una vez; se puede volver a sacar del canal cuando suban más).
//
// Dos revisiones en la Galería:
//   · «Functional Bodybuilding · los de hoy»: los que tus clientes tienen hoy
//     y cuyo video NO es de ese canal, pero el canal sí tiene el ejercicio.
//     Lado a lado: el video de hoy y los del canal. Tú eliges: «Usar este» o
//     «Dejar el actual» (el de hoy puede ser mejor). Primero los sin video.
//   · «Functional Bodybuilding · en análisis»: los que no usa nadie hoy. Los
//     que coinciden EXACTO (mismo nombre en inglés) se ponen todos con un
//     botón; los parecidos se eligen uno a uno. Los videos que elegiste tú a
//     mano (video_elegido_at) no se tocan en el botón de todos.
//
// Carga DESPUÉS de entrenamiento.js, entreno-videos.js y galeria-revision.js.

const _fb = { lista: null, ids: null, cargando: null, idx: null };
const FB_CLAVE_DEJAR = 'crm:fbDejarActual';

async function fbCargar() {
  if (_fb.lista) return _fb.lista;
  if (_fb.cargando) return _fb.cargando;
  _fb.cargando = fetch('/fb-videos.json?v=20261108').then(r => r.json()).then(d => {
    _fb.lista = (d.videos || []).map(([id, t]) => ({ id, t, k: fbTokens(t) }));
    _fb.ids = new Set(_fb.lista.map(v => v.id));
    // Índice por palabra, para no comparar contra los 4.800 cada vez.
    _fb.idx = new Map();
    _fb.lista.forEach(v => v.k.forEach(w => { if (!_fb.idx.has(w)) _fb.idx.set(w, []); _fb.idx.get(w).push(v); }));
    return _fb.lista;
  }).catch(() => { _fb.lista = []; _fb.ids = new Set(); _fb.idx = new Map(); return _fb.lista; });
  return _fb.cargando;
}
window.fbCargar = fbCargar;

// Nombre → palabras comparables: minúsculas, sin plurales, abreviaturas
// completas (db → dumbbell) y «push-up» = «push up» = «pushup».
const FB_SIN = { db: 'dumbbell', dbs: 'dumbbell', kb: 'kettlebell', kbs: 'kettlebell', bb: 'barbell', pushup: 'push up', pullup: 'pull up', situp: 'sit up', chinup: 'chin up', stepup: 'step up', rdl: 'romanian deadlift', ohp: 'overhead press', dumbell: 'dumbbell', superband: 'band', miniband: 'mini band' };
const FB_VACIAS = new Set(['with', 'and', 'the', 'a', 'an', 'of', 'on', 'in', 'into', 'for', 'from', 'at', 'to']);
function fbTokens(t) {
  const base = String(t || '').toLowerCase().replace(/['’]s\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const out = [];
  base.split(' ').forEach(w => {
    if (!w) return;
    const s = FB_SIN[w] || w;
    s.split(' ').forEach(x => {
      let y = x;
      if (y.length > 3 && y.endsWith('es') && /(ch|sh|ss|x)es$/.test(y)) y = y.slice(0, -2);
      else if (y.length > 3 && y.endsWith('s') && !y.endsWith('ss')) y = y.slice(0, -1);
      if (!FB_VACIAS.has(y)) out.push(y);
    });
  });
  return out;
}
const fbFrase = (k) => k.join(' ');
// Qué tanto se parecen dos nombres: 1 = el mismo (mismas palabras, en el
// orden que sea); si no, las palabras en común sobre las de los dos.
function fbParecido(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let comun = 0; A.forEach(w => { if (B.has(w)) comun++; });
  if (comun === A.size && comun === B.size) return 1;
  return comun / (A.size + B.size - comun);
}
// Los del canal para un ejercicio, los más parecidos primero.
function fbCandidatos(e, max = 3) {
  if (!_fb.lista) return [];
  const nombres = [...new Set([typeof grIngles === 'function' ? grIngles(e) : '', e.alias, e.nombre].filter(Boolean))];
  const vistos = new Map();
  nombres.forEach(n => {
    const k = fbTokens(n);
    if (!k.length) return;
    const pool = new Set();
    k.forEach(w => (_fb.idx.get(w) || []).forEach(v => pool.add(v)));
    pool.forEach(v => {
      const p = fbParecido(k, v.k);
      if (p >= 0.5 && (!vistos.has(v.id) || vistos.get(v.id).p < p)) vistos.set(v.id, { ...v, p });
    });
  });
  // El mismo nombre repetido en el canal: uno solo.
  const porFrase = new Map();
  [...vistos.values()].sort((x, y) => y.p - x.p || x.t.length - y.t.length).forEach(v => { const f = fbFrase(v.k); if (!porFrase.has(f)) porFrase.set(f, v); });
  return [...porFrase.values()].slice(0, max);
}
const fbEsDelCanal = (e) => !!(e && e.video_fuente === 'youtube' && e.video_ref && _fb.ids && _fb.ids.has(e.video_ref));
const fbDejados = () => { try { return new Set(JSON.parse(localStorage.getItem(FB_CLAVE_DEJAR) || '[]')); } catch (x) { return new Set(); } };
function fbDejar(id) { try { const s = fbDejados(); s.add(id); localStorage.setItem(FB_CLAVE_DEJAR, JSON.stringify([...s])); } catch (x) { /* sin almacenamiento */ } }

// ¿Ya lo revisaste? 'fb' = quedó con el video del canal; 'actual' = te
// quedaste con el que tenía (o elegiste otro a mano); null = falta revisarlo.
function fbRevisado(e) {
  if (!e) return null;
  if (fbEsDelCanal(e)) return 'fb';
  if (fbDejados().has(e.id) || e.video_elegido_at) return 'actual';
  return null;
}
window.fbRevisado = fbRevisado;
// ¿Es de esta revisión (revisado o no)? `cual`: 'hoy' (los usan ahora) o 'analisis'.
function fbEnGrupo(e, cual) {
  if (!e || e.archivado || !_fb.lista) return false;
  const hoy = !!(_ent.enUso && _ent.enUso.has(e.id));
  if ((cual === 'hoy') !== hoy) return false;
  return fbEsDelCanal(e) ? !!fbRevisado(e) && fbCandidatos(e, 1).length > 0 : fbCandidatos(e, 1).length > 0;
}
window.fbEnGrupo = fbEnGrupo;
// Lo que falta revisar.
function fbPendiente(e, cual) {
  return fbEnGrupo(e, cual) && !fbRevisado(e);
}
window.fbPendiente = fbPendiente;
function fbCuenta(lista) {
  if (!_fb.lista || !_fb.lista.length) return null;
  const hoy = lista.filter(e => fbPendiente(e, 'hoy')).length;
  const analisis = lista.filter(e => fbPendiente(e, 'analisis'));
  const exactos = analisis.filter(e => fbExacto(e)).length;
  const revHoy = lista.filter(e => fbEnGrupo(e, 'hoy') && fbRevisado(e)).length;
  const revAnalisis = lista.filter(e => fbEnGrupo(e, 'analisis') && fbRevisado(e)).length;
  return { hoy, analisis: analisis.length, exactos, revHoy, revAnalisis };
}
window.fbCuenta = fbCuenta;
const fbExacto = (e) => { const c = fbCandidatos(e, 1)[0]; return c && c.p === 1 ? c : null; };

// ── Previews (sirven también para fichas archivadas) ─────────────────────
function fbPrevYt(ref, titulo = '') {
  return `<span class="fb-prev" role="button" tabindex="0" title="Ver el video" onclick="event.stopPropagation(); fbPlay(this, '${escapeHtml(ref)}')"><img src="https://i.ytimg.com/vi/${encodeURIComponent(ref)}/mqdefault.jpg" alt="${escapeHtml(titulo)}" loading="lazy" onerror="this.remove()"><span class="fb-play">▶</span></span>`;
}
// Al tocar la vista previa, el video se abre en grande encima (videoGrande).
window.fbPlay = (el, ref) => {
  const t = el.querySelector('img')?.getAttribute('alt') || '';
  if (typeof videoGrande === 'function') return videoGrande({ yt: ref, titulo: t });
  el.onclick = (ev) => ev.stopPropagation();
  el.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(ref)}?autoplay=1&mute=1&rel=0&playsinline=1" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
};
// El video que tiene hoy una ficha (de YouTube o subido), o «Sin video».
function fbPrevFicha(e) {
  if (e && e.video_fuente === 'youtube' && e.video_ref) return fbPrevYt(e.video_ref, e.alias || e.nombre);
  if (e && e.video_fuente === 'archivo' && e.video_path) {
    const foto = typeof entMiniatura === 'function' ? entMiniatura(e) : '';
    return `<span class="fb-prev" role="button" tabindex="0" title="Ver el video" onclick="event.stopPropagation(); fbPlayArchivo(this, '${escapeHtml(e.video_path)}')">${foto ? `<img src="${escapeHtml(foto)}" alt="" loading="lazy">` : ''}<span class="fb-play">▶</span></span>`;
  }
  return '<span class="fb-prev fb-nada">Sin video</span>';
}
window.fbPrevFicha = fbPrevFicha;
window.fbPlayArchivo = async (el, path) => {
  if (typeof videoGrande === 'function') return videoGrande({ path });
  el.onclick = (ev) => ev.stopPropagation();
  const url = typeof entVideoFirmado === 'function' ? await entVideoFirmado(path) : null;
  el.innerHTML = url ? `<video src="${escapeHtml(url)}" autoplay muted loop playsinline controls></video>` : '<span class="fb-nada">No se pudo abrir</span>';
};
window.fbPrevYt = fbPrevYt;

// ── La lista de cada revisión ────────────────────────────────────────────
function fbUso(e) {
  const n = _ent.enUso && _ent.enUso.get(e.id);
  return n ? (window.entEtiquetaQuienUsa ? entEtiquetaQuienUsa(e.id) : `<span class="tag tag-blue">${n} ${n === 1 ? 'cliente' : 'clientes'} ahora</span>`) : '';
}
function fbFila(e, cual) {
  const n = entNombres(e);
  const cands = fbCandidatos(e, 3);
  return `
    <div class="fb-fila${fbRevisado(e) ? ' fb-rev' : ''}" data-fb-ej="${e.id}">
      <div class="fb-actual">
        ${fbRevisado(e) ? `<div class="fb-hecho" data-fb-hecho="${fbRevisado(e)}">✓ Revisado · ${fbRevisado(e) === 'fb' ? 'quedó con el de Functional Bodybuilding' : fbDejados().has(e.id) ? 'te quedaste con su video' : 'con el video que elegiste'}</div>` : ''}
        <div class="fb-cab">Su video ahora</div>
        ${fbPrevFicha(e)}
        <div class="fb-n"><b>${escapeHtml(n.grande)}</b>${n.chico ? `<span>${escapeHtml(n.chico)}</span>` : ''}</div>
        <div class="fb-tags">${fbUso(e)}${(e.video_fuente || 'ninguno') === 'ninguno' ? '<span class="tag tag-red">sin video</span>' : ''}</div>
        ${(e.video_fuente || 'ninguno') !== 'ninguno' && !fbRevisado(e) ? `<button type="button" class="btn btn-ghost btn-sm" data-fb-dejar="${e.id}" onclick="fbDejarActual('${e.id}')">Dejar el actual</button>` : ''}
      </div>
      <div class="fb-cands">
        <div class="fb-cab">En Functional Bodybuilding</div>
        <div class="fb-cands-g">
          ${cands.map(c => `
            <div class="fb-cand" data-fb-cand="${escapeHtml(c.id)}">
              ${fbPrevYt(c.id, c.t)}
              <div class="fb-t">${escapeHtml(c.t)}</div>
              <div class="fb-tags">${c.p === 1 ? '<span class="tag tag-green">mismo nombre</span>' : '<span class="tag tag-gray">parecido</span>'}</div>
              ${e.video_ref === c.id ? '<span class="tag tag-green" data-fb-puesto>Es el que tiene</span>' : `<button type="button" class="btn btn-primary btn-sm" data-fb-usar="${escapeHtml(c.id)}" onclick="fbUsar('${e.id}', '${escapeHtml(c.id)}')">Usar este</button>`}
            </div>`).join('')}
        </div>
      </div>
      ${fbOtras(e)}
    </div>`;
}
// Ni el actual ni el de Functional Bodybuilding: los canales de siempre
// (PROET en español, Central Athlete ATX en inglés; lista en canales-videos.json),
// las propuestas cargadas y, si no está en ninguno, el más cercano en YouTube
// (/api/yt-buscar). Lo que pongas aquí queda como «elegido por ti».
const _cv = { canales: null, cargando: null, yt: {} };
const CV_VACIAS = new Set(['de', 'con', 'en', 'la', 'el', 'los', 'las', 'y', 'a', 'al', 'del', 'para', 'sobre', 'un', 'una', 'por', 'o']);
function cvTokens(t, idioma) {
  if (idioma === 'en') return fbTokens(t);
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
    .filter(w => w && !CV_VACIAS.has(w)).map(w => (w.length > 4 && w.endsWith('es') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));
}
function cvCargar() {
  if (_cv.canales) return Promise.resolve(_cv.canales);
  if (_cv.cargando) return _cv.cargando;
  _cv.cargando = fetch('/canales-videos.json?v=20261115').then(r => r.json()).then(d => {
    _cv.canales = (d.canales || []).map(c => {
      const lista = c.videos.map(([id, t]) => ({ id, t, k: cvTokens(t, c.idioma) }));
      const idx = new Map(); lista.forEach(v => v.k.forEach(w => { if (!idx.has(w)) idx.set(w, []); idx.get(w).push(v); }));
      return { ...c, lista, idx };
    });
    return _cv.canales;
  }).catch(() => { _cv.canales = []; return _cv.canales; });
  return _cv.cargando;
}
window.cvCargar = cvCargar;
// Lo más parecido de un canal: en PROET por el nombre en español, en Central por el inglés.
function cvCandidatos(c, e, max = 2) {
  const nombres = c.idioma === 'es' ? [e.nombre] : [...new Set([typeof grIngles === 'function' ? grIngles(e) : '', e.alias].filter(Boolean))];
  const vistos = new Map();
  nombres.filter(Boolean).forEach(n => {
    const k = cvTokens(n, c.idioma); if (!k.length) return;
    const pool = new Set(); k.forEach(w => (c.idx.get(w) || []).forEach(v => pool.add(v)));
    pool.forEach(v => { const p = fbParecido(k, v.k); if (p >= 0.5 && (!vistos.has(v.id) || vistos.get(v.id).p < p)) vistos.set(v.id, { ...v, p }); });
  });
  return [...vistos.values()].filter(v => v.id !== e.video_ref).sort((x, y) => y.p - x.p || x.t.length - y.t.length).slice(0, max);
}
function cvTarjeta(e, id, titulo, etiqueta, extra = '') {
  return `<div class="fb-cand" data-fb-otra="${escapeHtml(id)}">
            ${fbPrevYt(id, titulo)}
            <div class="fb-t">${escapeHtml(titulo)}</div>
            <div class="fb-tags"><span class="tag tag-gray">${escapeHtml(etiqueta)}</span>${extra}</div>
            ${e.video_ref === id ? '<span class="tag tag-green">Es el que tiene</span>' : `<button type="button" class="btn btn-primary btn-sm" onclick="fbUsar('${e.id}', '${escapeHtml(id)}')">Usar este</button>`}
          </div>`;
}
// El más cercano en YouTube (solo cuando no está en los canales).
function cvYoutube(e) {
  const r = _cv.yt[e.id];
  if (r === undefined) {
    _cv.yt[e.id] = null;
    const q = (typeof grIngles === 'function' && grIngles(e)) || e.alias || e.nombre || '';
    fetch('/api/yt-buscar?q=' + encodeURIComponent(q)).then(x => x.json()).then(j => { _cv.yt[e.id] = (j.videos || []).filter(v => v.id !== e.video_ref).slice(0, 2); })
      .catch(() => { _cv.yt[e.id] = []; })
      .then(() => { const caja = document.querySelector(`[data-cv-yt="${e.id}"]`); if (caja) caja.innerHTML = cvYoutubeHtml(e); });
  }
  return `<div data-cv-yt="${e.id}">${cvYoutubeHtml(e)}</div>`;
}
function cvYoutubeHtml(e) {
  const r = _cv.yt[e.id];
  if (!r) return '<div class="fb-buscando">Buscando el más cercano en YouTube…</div>';
  if (!r.length) return '<div class="fb-buscando">YouTube no dio resultados: búscalo con los enlaces de abajo.</div>';
  return `<div class="fb-sub">No está en tus canales · lo más cercano en YouTube</div><div class="fb-otras-g">${r.map(v => cvTarjeta(e, v.id, v.titulo, v.canal || 'YouTube', v.seg ? `<span class="tag tag-gray">${Math.floor(v.seg / 60)}:${String(v.seg % 60).padStart(2, '0')}</span>` : '')).join('')}</div>`;
}
function fbOtras(e) {
  if (!_cv.canales && !_cv.cargando) cvCargar().then(() => entRepintarGaleria());
  const deCanales = (_cv.canales || []).flatMap(c => cvCandidatos(c, e, 2).map(v => ({ ...v, canal: c.nombre })));
  const props = ((typeof _vid !== 'undefined' && _vid.propuestas) || {})[e.id] || [];
  const usados = new Set(deCanales.map(v => v.id));
  const otras = props.filter(p => p.ref && p.ref !== e.video_ref && !usados.has(p.ref) && !(_fb.ids && _fb.ids.has(p.ref))).slice(0, 2);
  const q = encodeURIComponent((e.alias || e.nombre || '') + ' exercise');
  const cuerpo = !_cv.canales ? '<div class="fb-buscando">Buscando en tus canales…</div>'
    : deCanales.length || otras.length
      ? `<div class="fb-otras-g">${deCanales.map(v => cvTarjeta(e, v.id, v.t, v.canal, v.p === 1 ? '<span class="tag tag-green">mismo nombre</span>' : '')).join('')}${otras.map(p => cvTarjeta(e, p.ref, p.titulo || '', p.canal || 'YouTube')).join('')}</div>`
      : cvYoutube(e);
  return `
      <div class="fb-otras" data-fb-otras="${e.id}">
        <div class="fb-cab">Otras opciones</div>
        ${cuerpo}
        <div class="fb-buscar">
          <a target="_blank" rel="noopener" href="https://www.youtube.com/@proetejercicioterapeutico5675/search?query=${encodeURIComponent(e.nombre || '')}">PROET ↗</a>
          <a target="_blank" rel="noopener" href="https://www.youtube.com/@CentralAthleteatx/search?query=${encodeURIComponent(e.alias || e.nombre || '')}">Central Athlete ↗</a>
          <a target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${q}">YouTube ↗</a>
        </div>
        <div class="fb-pegar">
          <input id="fb-link-${e.id}" placeholder="Pega un link de YouTube" onkeydown="if(event.key==='Enter')fbPegarLink('${e.id}')">
          <button type="button" class="btn btn-secondary btn-sm" data-fb-pegar="${e.id}" onclick="fbPegarLink('${e.id}')">Usar link</button>
        </div>
      </div>`;
}
window.fbPegarLink = async (id) => {
  const inp = document.getElementById('fb-link-' + id), url = inp ? inp.value.trim() : '';
  const ref = typeof entYoutubeId === 'function' ? entYoutubeId(url) : null;
  if (!ref) { toast('Ese link de YouTube no es válido'); if (inp) inp.focus(); return; }
  const ini = typeof entYoutubeInicio === 'function' ? entYoutubeInicio(url) : null;
  if (typeof entPonerVideo === 'function' && await entPonerVideo(id, ref, ini)) { toast('Listo: video puesto'); entRepintarGaleria(); }
};
// Las decisiones viejas de «Dejar el actual» vivían solo en este navegador:
// se pasan a la base una vez, para verlas en cualquier computador.
async function fbSubirDejados() {
  if (_fb.subidos) return; _fb.subidos = true;
  const ids = [...fbDejados()].filter(id => { const e = (_ent.ejercicios || []).find(x => x.id === id); return e && !e.video_elegido_at; });
  for (const id of ids) {
    const ahora = new Date().toISOString();
    try { const { error } = await sb.from('ejercicios').update({ video_elegido_at: ahora }).eq('id', id); if (error) return; const e = (_ent.ejercicios || []).find(x => x.id === id); if (e) e.video_elegido_at = ahora; } catch (x) { return; }
  }
}
window.fbVer = (cual, vista) => { _fb.vista = _fb.vista || {}; _fb.vista[cual] = vista; entRepintarGaleria(); };
function fbHtml(lista, cual) {
  if (!_fb.lista) return '<div class="card text-center text-slate-500 py-8">Cargando los videos del canal…</div>';
  fbSubirDejados();
  if (typeof entCargarPropuestas === 'function' && typeof _vid !== 'undefined' && !_vid.propuestas && !_fb.pidiendoProps) {
    _fb.pidiendoProps = true; entCargarPropuestas().then(() => entRepintarGaleria()).catch(() => {});
  }
  const rev = lista.filter(e => fbEnGrupo(e, cual) && fbRevisado(e));
  const vista = (_fb.vista && _fb.vista[cual]) || 'pend';
  const pestanas = `<div class="fb-pest" data-fb-pest>
    <button type="button" class="${vista === 'pend' ? 'on' : ''}" data-fb-ver="pend" onclick="fbVer('${cual}', 'pend')">Por revisar <b>${lista.filter(e => fbPendiente(e, cual)).length}</b></button>
    <button type="button" class="${vista === 'rev' ? 'on' : ''}" data-fb-ver="rev" onclick="fbVer('${cual}', 'rev')">Ya revisados <b>${rev.length}</b></button></div>`;
  if (vista === 'rev') {
    const orden = rev.sort((a, b) => String(b.video_elegido_at || '').localeCompare(String(a.video_elegido_at || '')) || entNombres(a).grande.localeCompare(entNombres(b).grande));
    return `${pestanas}<div class="fb-intro">Lo que ya revisaste: con el video de Functional Bodybuilding o con el que tenía. Si cambias de opinión, toca «Usar este» en otro.</div>`
      + (orden.length ? `<div class="fb-lista" data-fb-lista="${cual}-rev">${orden.map(e => fbFila(e, cual)).join('')}</div>` : '<div class="card text-center text-slate-500 py-8">Aún no has revisado ninguno.</div>');
  }
  const pend = lista.filter(e => fbPendiente(e, cual));
  if (!pend.length) return pestanas + `<div class="card text-center text-slate-500 py-8" data-fb-vacio>${cual === 'hoy' ? 'Todos los de hoy ya tienen su video de Functional Bodybuilding, o elegiste dejar el actual.' : 'No quedan ejercicios en análisis con video en Functional Bodybuilding.'}</div>`;
  // Primero los que no tienen video, luego los que más clientes tienen.
  const uso = (e) => (_ent.enUso && _ent.enUso.get(e.id)) || 0;
  pend.sort((a, b) => (((a.video_fuente || 'ninguno') === 'ninguno') ? 0 : 1) - (((b.video_fuente || 'ninguno') === 'ninguno') ? 0 : 1) || uso(b) - uso(a) || entNombres(a).grande.localeCompare(entNombres(b).grande));
  const exactos = cual === 'analisis' ? pend.filter(e => fbExacto(e) && !e.video_elegido_at) : [];
  const cab = cual === 'hoy'
    ? `<div class="fb-intro" data-fb-cabecera>Los que tus clientes tienen hoy y cuyo video no es de Functional Bodybuilding, pero el canal tiene el ejercicio. Mira los dos y elige: «Usar este» o «Dejar el actual». Primero los que no tienen video.</div>`
    : `<div class="fb-intro" data-fb-cabecera><span>Los que no usa nadie hoy. ${exactos.length ? `<b>${exactos.length}</b> ${exactos.length === 1 ? 'tiene' : 'tienen'} en el canal un video con el mismo nombre: se ponen todos con el botón. Los parecidos, elígelos uno a uno.` : 'Ninguno coincide exacto: elígelos uno a uno.'}</span>${exactos.length ? `<button type="button" class="btn btn-primary btn-sm" data-fb-todos onclick="fbPonerExactos()">${exactos.length === 1 ? 'Poner el que tiene el mismo nombre' : `Poner los ${exactos.length} con el mismo nombre`}</button>` : ''}</div>`;
  return `${pestanas}${cab}<div class="fb-lista" data-fb-lista="${cual}">${pend.map(e => fbFila(e, cual)).join('')}</div>`;
}
window.fbHtml = fbHtml;

// ── Acciones ─────────────────────────────────────────────────────────────
window.fbUsar = async (id, ref) => {
  if (typeof entPonerVideo !== 'function') return;
  if (await entPonerVideo(id, ref)) { toast('Listo: video de Functional Bodybuilding puesto'); entRepintarGaleria(); }
};
window.fbDejarActual = async (id) => {
  fbDejar(id);
  const ahora = new Date().toISOString();
  try { const { error } = await sb.from('ejercicios').update({ video_elegido_at: ahora, updated_at: ahora }).eq('id', id); if (!error) { const e = (_ent.ejercicios || []).find(x => x.id === id); if (e) e.video_elegido_at = ahora; } } catch (x) { /* queda en este navegador */ }
  toast('Listo: se queda el video que tenía'); entRepintarGaleria();
};
window.fbPonerExactos = async () => {
  const lista = (_ent.ejercicios || []).filter(e => fbPendiente(e, 'analisis') && !e.video_elegido_at).map(e => [e, fbExacto(e)]).filter(([, c]) => c);
  if (!lista.length) return;
  if (!confirm(`Poner a ${lista.length} ejercicios en análisis el video de Functional Bodybuilding con su mismo nombre.\n\nNinguno lo usa un cliente hoy. Los videos que elegiste tú a mano no se tocan.`)) return;
  const btn = document.querySelector('[data-fb-todos]');
  let ok = 0;
  for (const [e, c] of lista) {
    if (btn) btn.textContent = `Poniendo ${ok + 1} de ${lista.length}…`;
    if (await entPonerVideo(e.id, c.id)) ok++;
  }
  toast(`Listo: ${ok} videos puestos`);
  entRepintarGaleria();
};

(function () {
  const s = document.createElement('style');
  s.textContent = `
  .fb-intro{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;font-size:13.5px;color:#55565B;margin:0 0 12px;line-height:1.45}
  .fb-lista{display:flex;flex-direction:column;gap:12px}
  .fb-fila{display:grid;grid-template-columns:minmax(220px,280px) minmax(0,1fr) minmax(220px,300px);gap:16px;background:#fff;border-radius:16px;padding:14px;box-shadow:0 1px 2px rgba(0,0,0,.04),0 6px 18px rgba(40,40,30,.05)}
  .fb-cab{font-size:11.5px;font-weight:700;color:#8A877F;margin-bottom:6px}
  .fb-actual{display:flex;flex-direction:column;gap:6px;align-items:flex-start;border-right:1px solid #F3F1EB;padding-right:16px}
  .fb-cands-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
  .fb-cand{display:flex;flex-direction:column;gap:6px;align-items:flex-start}
  .fb-prev{position:relative;display:block;width:100%;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#EFEDE7;cursor:pointer}
  .fb-prev img{width:100%;height:100%;object-fit:cover;display:block}
  .fb-prev iframe,.fb-prev video{width:100%;height:100%;border:0;display:block;background:#000}
  .fb-play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:38px;height:38px;border-radius:50%;background:rgba(31,31,31,.72);color:#fff;display:grid;place-items:center;font-size:14px}
  .fb-nada{display:grid;place-items:center;color:#8A877F;font-size:13px;cursor:default}
  .fb-n{font-size:14px;color:#1F1F1F;line-height:1.3}.fb-n b{font-weight:700;display:block}.fb-n span{font-size:12.5px;color:#6B6B70}
  .fb-t{font-size:13.5px;font-weight:650;color:#1F1F1F;line-height:1.3}
  .fb-tags{display:flex;gap:4px;flex-wrap:wrap}
  .fb-otras{display:flex;flex-direction:column;gap:8px;border-left:1px solid #F3F1EB;padding-left:16px;min-width:0}
  .fb-otras-g{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .fb-buscando{font-size:12.5px;color:#8A877F;background:#F7F6F2;border-radius:10px;padding:10px}
  .fb-sub{font-size:11.5px;font-weight:700;color:#B5561A}
  .fb-buscar{display:flex;flex-wrap:wrap;gap:10px;font-size:12.5px}.fb-buscar a{color:#55565B;text-decoration:underline}
  .fb-pegar{display:flex;gap:6px}.fb-pegar input{flex:1;min-width:0;border:1px solid #E2E0D9;border-radius:10px;padding:6px 10px;font-size:13px}
  @media (max-width:1180px){.fb-fila{grid-template-columns:minmax(200px,260px) minmax(0,1fr)}.fb-otras{grid-column:1/-1;border-left:0;padding-left:0;border-top:1px solid #F3F1EB;padding-top:12px}.fb-otras-g{grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}}
  .fb-pest{display:inline-flex;gap:4px;background:#EFEDE7;border-radius:12px;padding:3px;margin:0 0 12px}
  .fb-pest button{border:0;background:transparent;border-radius:9px;padding:7px 14px;font:inherit;font-size:13.5px;font-weight:650;color:#6B6B70;cursor:pointer}
  .fb-pest button.on{background:#fff;color:#1F1F1F;box-shadow:0 1px 2px rgba(0,0,0,.08)}
  .fb-pest b{font-weight:800;margin-left:4px}
  .fb-rev{background:#FBFDFB;box-shadow:0 0 0 1.5px #CFE6D5}
  .fb-hecho{font-size:12.5px;font-weight:750;color:#2F7F45;background:#E6F2E9;border-radius:99px;padding:4px 10px}
  @media (max-width:720px){.fb-fila{grid-template-columns:1fr}.fb-actual{border-right:0;padding-right:0;border-bottom:1px solid #F3F1EB;padding-bottom:12px}}
  `;
  document.head.appendChild(s);
})();
