// =====================================================
// CREAR EJERCICIO NUEVO · video de YouTube + ficha con IA, validada por ti
// =====================================================
// Desde la Galería («+ Crear ejercicio nuevo») y desde el constructor de
// rutinas (en la galería de al lado). Es el mismo flujo en los dos:
//   1. Escribes el nombre (y el tipo).
//   2. «Buscar video»: la IA busca en YouTube videos que lo muestren
//      (api/coach-ask, perfil «video»). Eliges uno, o pegas tu propio link.
//   3. «Llenar la ficha con IA»: nombres, patrón, músculos, claves y errores
//      (el mismo pedido que «Completar fichas con IA», fichas-ia.js).
//   4. Revisas y corriges todo. Nada se guarda hasta que tocas «Crear
//      ejercicio». Desde el constructor, además queda añadido a la rutina.
// Carga DESPUÉS de entrenamiento.js y fichas-ia.js.
// =====================================================

const _en = { desde: null, videos: [], elegido: null, ficha: null, nombres: null, buscando: false };

window.enAbrir = (desde = 'galeria', nombreInicial = '') => {
  _en.desde = desde; _en.videos = []; _en.elegido = null; _en.ficha = null; _en.nombres = null;
  const tipos = (typeof ENT_TIPOS !== 'undefined' ? ENT_TIPOS : [['fuerza', 'Fuerza']]);
  openModal(modalShell('Crear ejercicio nuevo', `
    <div data-ejercicio-nuevo>
      <div class="en-paso"><span class="en-n">1</span><b>El ejercicio</b></div>
      <div class="grid md:grid-cols-[1fr_200px] gap-3">
        <div><label>Nombre (como lo buscas)</label><input id="en-nombre" placeholder="Pallof press con banda" onkeydown="if(event.key==='Enter'){event.preventDefault();enBuscar()}"></div>
        <div><label>Tipo</label><select id="en-tipo">${tipos.map(([k, t]) => `<option value="${k}">${escapeHtml(t)}</option>`).join('')}</select></div>
      </div>

      <div class="en-paso mt-4"><span class="en-n">2</span><b>Su video</b>
        <button type="button" class="btn btn-primary btn-sm ml-auto" data-en-buscar onclick="enBuscar()">Buscar video con IA</button></div>
      <div data-en-videos class="text-sm text-slate-500">Escribe el nombre y toca «Buscar video con IA». También puedes pegar tu propio link.</div>
      <div class="flex gap-2 mt-2 items-end flex-wrap">
        <div class="flex-1 min-w-[220px]"><label>O pega el link de YouTube</label><input id="en-link" placeholder="https://youtu.be/…" oninput="enLinkPegado(this.value)"></div>
        <a class="btn btn-ghost btn-sm" data-en-yt target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=" onclick="this.href='https://www.youtube.com/results?search_query='+encodeURIComponent(document.getElementById('en-nombre').value||'')">Buscar en YouTube ↗</a>
      </div>

      <div class="en-paso mt-4"><span class="en-n">3</span><b>La ficha</b>
        <button type="button" class="btn btn-primary btn-sm ml-auto" data-en-ficha onclick="enLlenarFicha()">Llenar la ficha con IA</button></div>
      <div data-en-ficha-caja class="text-sm text-slate-500">La IA propone los nombres, el patrón, los músculos, cómo hacerlo bien y los errores. Tú lo revisas antes de crear.</div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" data-en-crear onclick="enCrear()" disabled>Crear ejercicio${desde === 'rutina' ? ' y añadirlo' : ''}</button>`), { wide: true });
  // Desde una búsqueda del constructor: el nombre ya viene escrito.
  if (nombreInicial) { const i = document.getElementById('en-nombre'); if (i) i.value = String(nombreInicial).trim(); }
  setTimeout(() => document.getElementById(nombreInicial ? 'en-link' : 'en-nombre')?.focus(), 50);
};

const enNombre = () => (document.getElementById('en-nombre')?.value || '').trim();
const enMini = (ref) => `https://i.ytimg.com/vi/${ref}/mqdefault.jpg`;

function enPintarVideos(msg = '') {
  const caja = document.querySelector('[data-en-videos]');
  if (!caja) return;
  if (!_en.videos.length) { caja.innerHTML = msg || 'No encontré videos. Pega tu propio link o busca en YouTube.'; return; }
  caja.innerHTML = `${msg ? `<div class="text-xs text-slate-500 mb-2">${msg}</div>` : ''}
    <div class="en-videos">${_en.videos.map((v, i) => `
      <label class="en-video${_en.elegido === i ? ' on' : ''}" data-en-video="${i}">
        <input type="radio" name="en-video" ${_en.elegido === i ? 'checked' : ''} onchange="enElegir(${i})">
        ${_en.elegido === i
          ? `<iframe src="https://www.youtube-nocookie.com/embed/${v.ref}?rel=0" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe>`
          : `<img src="${enMini(v.ref)}" alt="" loading="lazy">`}
        <div class="en-vt"><b>${escapeHtml(v.titulo || 'Video')}</b><span>${escapeHtml(v.canal || '')}</span>${v.por_que ? `<small>${escapeHtml(v.por_que)}</small>` : ''}</div>
      </label>`).join('')}</div>`;
}

window.enElegir = (i) => { _en.elegido = i; enPintarVideos(); enRevisarBoton(); };
window.enLinkPegado = (url) => {
  const ref = typeof entYoutubeId === 'function' ? entYoutubeId(url) : null;
  if (!ref) return;
  const i = _en.videos.findIndex(v => v.ref === ref);
  if (i >= 0) return enElegir(i);
  _en.videos.unshift({ ref, url: `https://www.youtube.com/watch?v=${ref}`, titulo: 'Tu link', canal: '' });
  enElegir(0);
};

window.enBuscar = async () => {
  const nombre = enNombre();
  if (!nombre) { toast('Escribe el nombre del ejercicio'); return; }
  if (_en.buscando) return;
  _en.buscando = true;
  const b = document.querySelector('[data-en-buscar]');
  if (b) { b.disabled = true; b.textContent = 'Buscando…'; }
  enPintarVideos('Buscando en YouTube… (puede tardar unos segundos)');
  try {
    const tipo = document.getElementById('en-tipo')?.value || '';
    const r = await fetch('/api/coach-ask', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ perfil: 'video', nivel: 'rapido', messages: [{ role: 'user', content: JSON.stringify({ ejercicio: nombre, tipo }) }] }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'sin respuesta');
    const texto = (d.content || []).filter(x => x.type === 'text').map(x => x.text).join('');
    let j = {};
    try { j = JSON.parse((texto.match(/\{[\s\S]*\}/) || ['{}'])[0]); } catch (e) { j = {}; }
    _en.nombres = { es: j.nombre_es || null, en: j.nombre_en || null };
    const vistos = new Set(_en.videos.map(v => v.ref));
    (Array.isArray(j.videos) ? j.videos : []).forEach(v => {
      const ref = typeof entYoutubeId === 'function' ? entYoutubeId(v && v.url) : null;
      if (ref && !vistos.has(ref)) { vistos.add(ref); _en.videos.push({ ref, url: `https://www.youtube.com/watch?v=${ref}`, titulo: v.titulo, canal: v.canal, por_que: v.por_que }); }
    });
    if (_en.elegido == null && _en.videos.length) _en.elegido = 0;
    enPintarVideos(_en.videos.length ? 'Elige el que mejor lo muestre. Puedes verlo aquí mismo.' : '');
  } catch (e) {
    enPintarVideos(`No pude buscar con IA (${escapeHtml(e.message || 'error')}). Pega tu propio link o toca «Buscar en YouTube».`);
  } finally {
    _en.buscando = false;
    if (b) { b.disabled = false; b.textContent = 'Buscar otra vez'; }
    enRevisarBoton();
  }
};

window.enLlenarFicha = async () => {
  const nombre = enNombre();
  if (!nombre) { toast('Escribe el nombre del ejercicio'); return; }
  const b = document.querySelector('[data-en-ficha]');
  const caja = document.querySelector('[data-en-ficha-caja]');
  if (b) { b.disabled = true; b.textContent = 'Llenando…'; }
  if (caja) caja.innerHTML = 'La IA está llenando la ficha…';
  try {
    if (typeof entDb !== 'undefined' && !(_ent.musculos || []).length && entDb.musculos) await entDb.musculos();
    const tipo = document.getElementById('en-tipo')?.value || 'fuerza';
    const e = { id: 'nuevo', nombre: (_en.nombres && _en.nombres.es) || nombre, alias: (_en.nombres && _en.nombres.en) || undefined, tipo };
    const res = await fiPedirConReintento([e]);
    const p = (res && (res.nuevo || (res.ejercicios || []).find(x => String(x.id) === 'nuevo') || res[0])) || res || {};
    _en.ficha = { ...fiLimpiar(e, p), nombre: e.nombre, alias: e.alias || '', tipo };
  } catch (err) {
    _en.ficha = { nombre: (_en.nombres && _en.nombres.es) || nombre, alias: (_en.nombres && _en.nombres.en) || '', tipo: document.getElementById('en-tipo')?.value || 'fuerza' };
    toast('No pude llenarla con IA: llénala tú');
  }
  if (b) { b.disabled = false; b.textContent = 'Volver a llenar con IA'; }
  enPintarFicha();
  enRevisarBoton();
};

function enPintarFicha() {
  const caja = document.querySelector('[data-en-ficha-caja]');
  if (!caja || !_en.ficha) return;
  const f = _en.ficha;
  const pats = typeof ENT_PATRONES !== 'undefined' ? ENT_PATRONES : [];
  const mus = (_ent.musculos || []).map(m => [m.slug, m.corto || m.nombre || m.slug]);
  const chips = (sel, cls) => `<div class="en-chips">${mus.map(([k, t]) => `<label class="en-chip"><input type="checkbox" class="${cls}" value="${k}" ${sel.includes(k) ? 'checked' : ''}> ${escapeHtml(t)}</label>`).join('')}</div>`;
  const conErrores = typeof entTieneErrores === 'function' ? entTieneErrores() : true;
  caja.innerHTML = `
    <div class="grid md:grid-cols-2 gap-3 text-slate-800">
      <div><label>Nombre en español</label><input id="en-f-nombre" value="${escapeHtml(f.nombre || '')}"></div>
      <div><label>Nombre en inglés (el grande en la app)</label><input id="en-f-alias" value="${escapeHtml(f.alias || '')}"></div>
      <div><label>Patrón</label><select id="en-f-patron"><option value="">—</option>${pats.map(([k, t]) => `<option value="${k}" ${f.patron === k ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}</select></div>
      <div></div>
      <div class="md:col-span-2"><label>Músculos que más trabajan</label>${chips(f.musculos_primarios || [], 'en-prim')}</div>
      <div class="md:col-span-2"><label>Músculos que ayudan</label>${chips(f.musculos_secundarios || [], 'en-sec')}</div>
      <div><label>Cómo hacerlo bien (una por línea)</label><textarea id="en-f-claves" rows="4">${escapeHtml((f.claves_tecnicas || []).join('\n'))}</textarea></div>
      ${conErrores ? `<div><label>Errores comunes (uno por línea)</label><textarea id="en-f-errores" rows="4">${escapeHtml((f.errores_tecnicos || []).join('\n'))}</textarea></div>` : ''}
    </div>
    <p class="text-xs text-slate-500 mt-2">Revisa y corrige lo que quieras. Nada se guarda hasta que tocas «Crear ejercicio».</p>`;
}

function enRevisarBoton() {
  const b = document.querySelector('[data-en-crear]');
  if (b) b.disabled = !(_en.ficha && enNombre());
}

window.enCrear = async () => {
  if (!_en.ficha) return toast('Primero llena la ficha');
  const val = (id) => (document.getElementById(id)?.value || '').trim();
  const lineas = (id) => val(id).split('\n').map(x => x.trim().replace(/\.$/, '')).filter(Boolean);
  const marcados = (cls) => [...document.querySelectorAll(`.${cls}:checked`)].map(i => i.value);
  const nombre = val('en-f-nombre') || enNombre();
  if (!nombre) return toast('Falta el nombre');
  const prim = marcados('en-prim');
  const v = _en.elegido != null ? _en.videos[_en.elegido] : null;
  const ahora = new Date().toISOString();
  const row = {
    nombre,
    alias: val('en-f-alias') || null,
    archivado: false,
    tipo: _en.ficha.tipo || document.getElementById('en-tipo')?.value || 'fuerza',
    patron: val('en-f-patron') || null,
    musculos_primarios: prim,
    musculos_secundarios: marcados('en-sec').filter(x => !prim.includes(x)),
    claves_tecnicas: lineas('en-f-claves').slice(0, 5),
    ...(document.getElementById('en-f-errores') ? { errores_tecnicos: lineas('en-f-errores').slice(0, 5) } : {}),
    ...(entTieneCol('articulaciones') && _en.ficha.articulaciones ? { articulaciones: _en.ficha.articulaciones } : {}),
    ...(entTieneCol('cualidades') && _en.ficha.cualidades ? { cualidades: _en.ficha.cualidades } : {}),
    video_fuente: v ? 'youtube' : 'ninguno',
    video_url: v ? v.url : null,
    video_ref: v ? v.ref : null,
    ...(v ? { video_elegido_at: ahora } : {}),
    updated_at: ahora,
  };
  const btn = document.querySelector('[data-en-crear]');
  if (btn) { btn.disabled = true; btn.textContent = 'Creando…'; }
  let { data, error } = await sb.from('ejercicios').insert(row).select('id').single();
  // Sin la migración de videos protegidos: se guarda igual, sin la marca.
  if (error && /video_elegido_at/.test(error.message || '')) { const { video_elegido_at, ...sin } = row; ({ data, error } = await sb.from('ejercicios').insert(sin).select('id').single()); }
  if (error || !data) { toast(error ? error.message : 'No pude crearlo'); if (btn) { btn.disabled = false; btn.textContent = 'Crear ejercicio'; } return; }
  closeModal();
  toast(`«${row.alias || nombre}» creado`);
  await entDb.ejercicios(true);
  if (_en.desde === 'rutina' && _ent.rutinaId) {
    await entAgregarARutina(data.id);
    if (document.getElementById('cons-gal-lista')) await entPintarGaleriaCons();
  } else if (document.getElementById('flt-lista')) await entPintarListaGaleria();
};

(function () {
  if (document.getElementById('en-css')) return;
  const s = document.createElement('style');
  s.id = 'en-css';
  s.textContent = `
  .en-paso{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:14.5px;color:#1F1F1F}
  .en-n{width:22px;height:22px;border-radius:99px;background:#1F1F1F;color:#fff;font-size:12px;font-weight:800;display:grid;place-items:center;flex:none}
  .en-videos{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
  .en-video{display:flex;flex-direction:column;gap:6px;border:1.5px solid #E7E3DA;border-radius:14px;padding:8px;cursor:pointer;background:#fff;text-transform:none;letter-spacing:0;font-weight:400}
  .en-video.on{border-color:#3C7BD6;box-shadow:0 0 0 3px rgba(60,123,214,.12)}
  .en-video input{display:none}
  .en-video img,.en-video iframe{width:100%;aspect-ratio:16/9;border:0;border-radius:10px;object-fit:cover;background:#ECE9E1}
  .en-vt{display:flex;flex-direction:column;gap:1px;font-size:12.5px;color:#55565B}
  .en-vt b{font-size:13px;color:#1F1F1F;line-height:1.25}
  .en-vt small{color:#2F7F45}
  .en-chips{display:flex;flex-wrap:wrap;gap:6px}
  .en-chip{display:inline-flex;align-items:center;gap:4px;border:1px solid #E7E3DA;border-radius:999px;padding:3px 9px;font-size:12.5px;text-transform:none;letter-spacing:0;font-weight:500;cursor:pointer;margin:0}
  .en-chip input{width:auto}`;
  document.head.appendChild(s);
})();
