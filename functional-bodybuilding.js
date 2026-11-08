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

// ¿Entra en la revisión? `cual`: 'hoy' (los usan ahora) o 'analisis'.
function fbPendiente(e, cual) {
  if (!e || e.archivado || !_fb.lista) return false;
  const hoy = !!(_ent.enUso && _ent.enUso.has(e.id));
  if ((cual === 'hoy') !== hoy) return false;
  if (fbEsDelCanal(e) || fbDejados().has(e.id)) return false;
  return fbCandidatos(e, 1).length > 0;
}
window.fbPendiente = fbPendiente;
function fbCuenta(lista) {
  if (!_fb.lista || !_fb.lista.length) return null;
  const hoy = lista.filter(e => fbPendiente(e, 'hoy')).length;
  const analisis = lista.filter(e => fbPendiente(e, 'analisis'));
  const exactos = analisis.filter(e => fbExacto(e)).length;
  return { hoy, analisis: analisis.length, exactos };
}
window.fbCuenta = fbCuenta;
const fbExacto = (e) => { const c = fbCandidatos(e, 1)[0]; return c && c.p === 1 ? c : null; };

// ── Previews (sirven también para fichas archivadas) ─────────────────────
function fbPrevYt(ref, titulo = '') {
  return `<span class="fb-prev" role="button" tabindex="0" title="Ver el video" onclick="event.stopPropagation(); fbPlay(this, '${escapeHtml(ref)}')"><img src="https://i.ytimg.com/vi/${encodeURIComponent(ref)}/mqdefault.jpg" alt="${escapeHtml(titulo)}" loading="lazy" onerror="this.remove()"><span class="fb-play">▶</span></span>`;
}
window.fbPlay = (el, ref) => {
  el.onclick = (ev) => ev.stopPropagation();
  el.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(ref)}?autoplay=1&mute=1&rel=0&playsinline=1&loop=1&playlist=${encodeURIComponent(ref)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
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
  el.onclick = (ev) => ev.stopPropagation();
  const url = typeof entVideoFirmado === 'function' ? await entVideoFirmado(path) : null;
  el.innerHTML = url ? `<video src="${escapeHtml(url)}" autoplay muted loop playsinline controls></video>` : '<span class="fb-nada">No se pudo abrir</span>';
};
window.fbPrevYt = fbPrevYt;

// ── La lista de cada revisión ────────────────────────────────────────────
function fbUso(e) {
  const n = _ent.enUso && _ent.enUso.get(e.id);
  return n ? `<span class="tag tag-blue">${n} ${n === 1 ? 'cliente' : 'clientes'} ahora</span>` : '';
}
function fbFila(e, cual) {
  const n = entNombres(e);
  const cands = fbCandidatos(e, 3);
  return `
    <div class="fb-fila" data-fb-ej="${e.id}">
      <div class="fb-actual">
        <div class="fb-cab">Su video ahora</div>
        ${fbPrevFicha(e)}
        <div class="fb-n"><b>${escapeHtml(n.grande)}</b>${n.chico ? `<span>${escapeHtml(n.chico)}</span>` : ''}</div>
        <div class="fb-tags">${fbUso(e)}${(e.video_fuente || 'ninguno') === 'ninguno' ? '<span class="tag tag-red">sin video</span>' : ''}</div>
        ${(e.video_fuente || 'ninguno') !== 'ninguno' ? `<button type="button" class="btn btn-ghost btn-sm" data-fb-dejar="${e.id}" onclick="fbDejarActual('${e.id}')">Dejar el actual</button>` : ''}
      </div>
      <div class="fb-cands">
        <div class="fb-cab">En Functional Bodybuilding</div>
        <div class="fb-cands-g">
          ${cands.map(c => `
            <div class="fb-cand" data-fb-cand="${escapeHtml(c.id)}">
              ${fbPrevYt(c.id, c.t)}
              <div class="fb-t">${escapeHtml(c.t)}</div>
              <div class="fb-tags">${c.p === 1 ? '<span class="tag tag-green">mismo nombre</span>' : '<span class="tag tag-gray">parecido</span>'}</div>
              <button type="button" class="btn btn-primary btn-sm" data-fb-usar="${escapeHtml(c.id)}" onclick="fbUsar('${e.id}', '${escapeHtml(c.id)}')">Usar este</button>
            </div>`).join('')}
        </div>
      </div>
    </div>`;
}
function fbHtml(lista, cual) {
  if (!_fb.lista) return '<div class="card text-center text-slate-500 py-8">Cargando los videos del canal…</div>';
  const pend = lista.filter(e => fbPendiente(e, cual));
  if (!pend.length) return `<div class="card text-center text-slate-500 py-8" data-fb-vacio>${cual === 'hoy' ? 'Todos los de hoy ya tienen su video de Functional Bodybuilding, o elegiste dejar el actual.' : 'No quedan ejercicios en análisis con video en Functional Bodybuilding.'}</div>`;
  // Primero los que no tienen video, luego los que más clientes tienen.
  const uso = (e) => (_ent.enUso && _ent.enUso.get(e.id)) || 0;
  pend.sort((a, b) => (((a.video_fuente || 'ninguno') === 'ninguno') ? 0 : 1) - (((b.video_fuente || 'ninguno') === 'ninguno') ? 0 : 1) || uso(b) - uso(a) || entNombres(a).grande.localeCompare(entNombres(b).grande));
  const exactos = cual === 'analisis' ? pend.filter(e => fbExacto(e) && !e.video_elegido_at) : [];
  const cab = cual === 'hoy'
    ? `<div class="fb-intro" data-fb-cabecera>Los que tus clientes tienen hoy y cuyo video no es de Functional Bodybuilding, pero el canal tiene el ejercicio. Mira los dos y elige: «Usar este» o «Dejar el actual». Primero los que no tienen video.</div>`
    : `<div class="fb-intro" data-fb-cabecera><span>Los que no usa nadie hoy. ${exactos.length ? `<b>${exactos.length}</b> ${exactos.length === 1 ? 'tiene' : 'tienen'} en el canal un video con el mismo nombre: se ponen todos con el botón. Los parecidos, elígelos uno a uno.` : 'Ninguno coincide exacto: elígelos uno a uno.'}</span>${exactos.length ? `<button type="button" class="btn btn-primary btn-sm" data-fb-todos onclick="fbPonerExactos()">${exactos.length === 1 ? 'Poner el que tiene el mismo nombre' : `Poner los ${exactos.length} con el mismo nombre`}</button>` : ''}</div>`;
  return `${cab}<div class="fb-lista" data-fb-lista="${cual}">${pend.map(e => fbFila(e, cual)).join('')}</div>`;
}
window.fbHtml = fbHtml;

// ── Acciones ─────────────────────────────────────────────────────────────
window.fbUsar = async (id, ref) => {
  if (typeof entPonerVideo !== 'function') return;
  if (await entPonerVideo(id, ref)) { toast('Listo: video de Functional Bodybuilding puesto'); entRepintarGaleria(); }
};
window.fbDejarActual = (id) => { fbDejar(id); toast('Listo: se queda el video que tenía'); entRepintarGaleria(); };
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
  .fb-fila{display:grid;grid-template-columns:minmax(220px,280px) 1fr;gap:16px;background:#fff;border-radius:16px;padding:14px;box-shadow:0 1px 2px rgba(0,0,0,.04),0 6px 18px rgba(40,40,30,.05)}
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
  @media (max-width:720px){.fb-fila{grid-template-columns:1fr}.fb-actual{border-right:0;padding-right:0;border-bottom:1px solid #F3F1EB;padding-bottom:12px}}
  `;
  document.head.appendChild(s);
})();
