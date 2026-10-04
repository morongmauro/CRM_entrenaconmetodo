// =====================================================
// CRM EntrenaConMétodo · COMUNIDAD
// =====================================================
// Lo que publicas para TODO el equipo y les sale en «Comunidad» de su app
// (visual nueva). Solo tú publicas; ellos reaccionan con un toque (fuego,
// fuerza, aplauso, corazón) y comentan. Sus comentarios los lee todo el
// equipo, pero el aviso solo te llega a ti: aquí, en «Lo nuevo», y con el
// numerito rojo en el menú. Aquí publicas, editas, fijas arriba lo
// importante, respondes, borras el comentario que no te guste y ves el
// alcance: a cuántos les llegó y cómo reaccionaron.
//
// Necesita carga/migracion-comunidad.sql (repo entrenamientoecm). Sin ella
// la sección lo dice y no se rompe nada.
//
// Se auto-registra como bandeja.js. En index.html, después de bandeja.js:
//     <script src="/comunidad.js"></script>
// =====================================================

const COM_REACCIONES = [['fuego', '🔥', 'Fuego'], ['fuerza', '💪', 'Fuerza'], ['aplauso', '👏', 'Aplauso'], ['corazon', '❤️', 'Corazón']];
const COM_CLAVE_VISTO = 'com:vistoEn:v1';
const _com = { publicando: false, editando: null };

// Desde cuándo es «nuevo»: la última vez que abriste Comunidad (la primera
// vez, la última semana).
function comVistoEn() {
  try { const v = localStorage.getItem(COM_CLAVE_VISTO); if (v) return v; } catch (e) {}
  return new Date(Date.now() - 7 * 86400000).toISOString();
}
function comMarcarVisto() {
  try { localStorage.setItem(COM_CLAVE_VISTO, new Date().toISOString()); } catch (e) {}
  comPintarAviso(0);
}

async function comCargar() {
  let { data: posts, error } = await sb.from('comunidad_posts')
    .select('id,texto,imagen_url,enlace_url,fijado,publicado_en,editado_en')
    .is('borrado_en', null).order('fijado', { ascending: false }).order('publicado_en', { ascending: false }).limit(60);
  if (error && /editado_en/.test(error.message || '')) {
    ({ data: posts, error } = await sb.from('comunidad_posts').select('id,texto,imagen_url,enlace_url,fijado,publicado_en')
      .is('borrado_en', null).order('fijado', { ascending: false }).order('publicado_en', { ascending: false }).limit(60));
  }
  if (error) return { error };
  const ids = (posts || []).map(p => p.id);
  let reacciones = [], vistas = [], comentarios = [];
  if (ids.length) {
    reacciones = (await sb.from('comunidad_reacciones').select('post_id,cliente_id,tipo,creado_en').in('post_id', ids)).data || [];
    vistas = (await sb.from('comunidad_vistas').select('post_id,cliente_id').in('post_id', ids)).data || [];
    comentarios = (await sb.from('comunidad_comentarios').select('id,post_id,cliente_id,texto,creado_en,borrado_en').in('post_id', ids).order('creado_en', { ascending: true })).data || [];
    comentarios = comentarios.filter(c => !c.borrado_en);
  }
  const { data: clientes } = await sb.from('clientes').select('id,nombre,estado');
  return { posts: posts || [], reacciones, vistas, comentarios, clientes: clientes || [] };
}

const comFecha = (iso) => {
  const f = iso ? new Date(iso) : null;
  if (!f || isNaN(f)) return 'recién';
  return f.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
};
const comCorto = (txt, n = 60) => { const t = String(txt || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

routes.comunidad = async () => {
  cargando('Leyendo tu comunidad…');
  const d = await comCargar();
  const activos = d.clientes ? d.clientes.filter(c => c.estado === 'activo') : [];
  const nombre = (id) => (d.clientes.find(c => c.id === id) || {}).nombre || 'Alguien';
  // Durante la misma visita (borrar, responder, editar), «lo nuevo» se
  // mantiene: se mide desde la entrada, no desde el último refresco.
  if (!_com.desde || Date.now() - _com.desdeEn > 10 * 60000) _com.desde = comVistoEn();
  _com.desdeEn = Date.now();
  const desde = _com.desde;
  const esNuevo = (iso) => !!iso && iso > desde;

  // Lo nuevo desde tu última visita: comentarios y reacciones, lo último primero.
  const tituloDe = (id) => comCorto((d.posts.find(p => p.id === id) || {}).texto, 48);
  const nuevos = d.error ? [] : [
    ...d.comentarios.filter(c => c.cliente_id && esNuevo(c.creado_en)).map(c => ({ cuando: c.creado_en, html:
      `<div class="flex items-start justify-between gap-3" data-com-nuevo="comentario">
        <div class="text-sm"><strong>${escapeHtml(nombre(c.cliente_id))}</strong> comentó en «${escapeHtml(tituloDe(c.post_id))}»:
          <div class="text-slate-700 mt-0.5" style="white-space:pre-wrap">${escapeHtml(c.texto)}</div></div>
        <button class="btn btn-secondary btn-sm flex-shrink-0" onclick="comBorrarComentario('${c.id}')">Borrar</button>
      </div>` })),
    ...d.reacciones.filter(r => esNuevo(r.creado_en)).map(r => ({ cuando: r.creado_en, html:
      `<div class="text-sm" data-com-nuevo="reaccion"><strong>${escapeHtml(nombre(r.cliente_id))}</strong> reaccionó ${(COM_REACCIONES.find(x => x[0] === r.tipo) || ['', '·'])[1]} a «${escapeHtml(tituloDe(r.post_id))}»</div>` })),
  ].sort((a, b) => (a.cuando < b.cuando ? 1 : -1));

  view.innerHTML = `
    <div class="mb-5">
      <h2 class="text-2xl font-bold text-slate-900">Comunidad</h2>
      <p class="text-sm text-slate-500">Lo que publicas aquí le sale a todo tu equipo en su app. Solo tú publicas; ellos reaccionan y comentan. Los comentarios los lee todo el equipo, pero el aviso solo te llega a ti.</p>
    </div>
    ${d.error ? `<div class="card text-sm text-slate-600">Falta preparar la base: corre <strong>carga/migracion-comunidad.sql</strong> en Supabase (SQL Editor) y vuelve a entrar.</div>` : `
    <div class="em-com-grid">
      <div class="space-y-3" id="com-izq">
        <div class="card" id="com-lo-nuevo">
          <div class="flex items-center justify-between mb-2">
            <h3 class="font-bold text-slate-900">Lo nuevo</h3>
            <span class="text-xs text-slate-500">desde tu última visita</span>
          </div>
          ${nuevos.length ? `<div class="space-y-3">${nuevos.slice(0, 30).map(n => `<div class="pt-3" style="border-top:1px solid #f1f5f9">${n.html}</div>`).join('')}</div>`
            : '<div class="text-sm text-slate-500">Nada nuevo. Cuando alguien comente o reaccione, te aparece aquí.</div>'}
        </div>
        <div class="card" id="com-nuevo">
          <h3 class="font-bold text-slate-900 mb-3">Nueva publicación</h3>
          <textarea id="com-texto" rows="6" class="w-full border border-slate-200 rounded-xl p-3 text-sm" placeholder="Ej.: Esta semana el reto es dormir 7 horas. Lo demás se acomoda."></textarea>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
            <input id="com-imagen" class="border border-slate-200 rounded-xl px-3 py-2 text-sm" placeholder="Imagen (enlace, opcional)">
            <input id="com-enlace" class="border border-slate-200 rounded-xl px-3 py-2 text-sm" placeholder="Enlace para abrir (opcional)">
          </div>
          <label class="flex items-center gap-2 mt-3 text-sm"><input type="checkbox" id="com-fijar"> Fijar arriba</label>
          <div class="flex items-center gap-3 mt-4">
            <button class="btn btn-primary" id="com-publicar" onclick="comPublicar()">Publicar</button>
            <span class="text-xs text-slate-500">Le llega a tus ${activos.length} clientes activos.</span>
          </div>
        </div>
      </div>
      <div class="space-y-3" id="com-lista">
        ${d.posts.length ? d.posts.map(p => {
          const rx = d.reacciones.filter(r => r.post_id === p.id);
          const vistos = new Set(d.vistas.filter(v => v.post_id === p.id).map(v => v.cliente_id));
          const quienes = [...new Set(rx.map(r => r.cliente_id))].map(nombre);
          const coms = d.comentarios.filter(c => c.post_id === p.id);
          const pct = activos.length ? Math.round((vistos.size / activos.length) * 100) : 0;
          const editando = _com.editando === p.id;
          return `
          <div class="card" data-com-post="${p.id}">
            <div class="flex items-start justify-between gap-3">
              <div class="text-xs text-slate-500">${comFecha(p.publicado_en)}${p.editado_en ? ' · editada' : ''}${p.fijado ? ' · <strong class="text-amber-700">Fijado</strong>' : ''}</div>
              <div class="flex gap-2 flex-shrink-0">
                ${editando ? '' : `<button class="btn btn-secondary btn-sm" data-com-editar onclick="comEditar('${p.id}')">Editar</button>`}
                <button class="btn btn-secondary btn-sm" onclick="comFijar('${p.id}', ${!p.fijado})">${p.fijado ? 'Desfijar' : 'Fijar'}</button>
                <button class="btn btn-secondary btn-sm" onclick="comBorrar('${p.id}')">Borrar</button>
              </div>
            </div>
            ${editando ? `
              <textarea id="com-edit-${p.id}" rows="5" class="w-full border border-slate-200 rounded-xl p-3 text-sm mt-2">${escapeHtml(p.texto)}</textarea>
              <div class="flex gap-2 mt-2"><button class="btn btn-primary btn-sm" data-com-guardar onclick="comGuardarEdicion('${p.id}')">Guardar</button>
                <button class="btn btn-secondary btn-sm" onclick="comEditar(null)">Cancelar</button></div>`
              : `<div class="text-sm text-slate-800 mt-2" data-com-texto style="white-space:pre-wrap">${escapeHtml(p.texto)}</div>`}
            ${p.imagen_url ? `<img src="${escapeHtml(p.imagen_url)}" alt="" class="mt-3 rounded-xl max-h-60">` : ''}
            ${p.enlace_url ? `<div class="mt-2 text-xs"><a class="underline" target="_blank" rel="noopener" href="${escapeHtml(p.enlace_url)}">${escapeHtml(p.enlace_url)}</a></div>` : ''}
            <div class="mt-3 pt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" style="border-top:1px solid #f1f5f9">
              <span data-com-alcance><strong>${vistos.size}</strong> de ${activos.length} la vieron (${pct}%)</span>
              ${COM_REACCIONES.map(([t, e]) => `<span>${e} <strong>${rx.filter(r => r.tipo === t).length}</strong></span>`).join('')}
              <span>💬 <strong>${coms.length}</strong></span>
            </div>
            ${quienes.length ? `<div class="text-xs text-slate-500 mt-1">Reaccionaron: ${escapeHtml(quienes.join(', '))}</div>` : ''}
            <div class="mt-3 space-y-2" data-com-comentarios>
              ${coms.map(c => `
                <div class="flex items-start gap-2" data-com-comentario="${c.id}">
                  <div class="flex-1 min-w-0 rounded-xl px-3 py-2 text-sm ${c.cliente_id ? 'bg-slate-50' : 'bg-amber-50'}${c.cliente_id && esNuevo(c.creado_en) ? ' ring-1 ring-amber-300' : ''}">
                    <div class="text-xs font-bold text-slate-700">${c.cliente_id ? escapeHtml(nombre(c.cliente_id)) : 'Tú (coach)'} <span class="font-normal text-slate-400">· ${comFecha(c.creado_en)}</span></div>
                    <div class="text-slate-800" style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(c.texto)}</div>
                  </div>
                  <button class="btn btn-secondary btn-sm flex-shrink-0" title="Borrar el comentario" onclick="comBorrarComentario('${c.id}')">Borrar</button>
                </div>`).join('')}
              <div class="flex gap-2 pt-1">
                <input id="com-resp-${p.id}" data-com-responder class="flex-1 min-w-0 border border-slate-200 rounded-xl px-3 py-2 text-sm" maxlength="600" placeholder="Responder en esta publicación…"
                  onkeydown="if(event.key==='Enter'){event.preventDefault();comResponder('${p.id}')}">
                <button class="btn btn-secondary btn-sm" onclick="comResponder('${p.id}')">Responder</button>
              </div>
            </div>
          </div>`;
        }).join('') : '<div class="card text-sm text-slate-500 text-center py-8">Todavía no has publicado nada.</div>'}
      </div>
    </div>`}
  `;
  if (!d.error) comMarcarVisto();
};

window.comPublicar = async () => {
  if (_com.publicando) return;
  const texto = (document.getElementById('com-texto').value || '').trim();
  if (!texto) { toast('Escribe algo para publicar'); return; }
  _com.publicando = true;
  const fila = {
    texto,
    imagen_url: (document.getElementById('com-imagen').value || '').trim() || null,
    enlace_url: (document.getElementById('com-enlace').value || '').trim() || null,
    fijado: document.getElementById('com-fijar').checked,
  };
  const { error } = await sb.from('comunidad_posts').insert(fila);
  _com.publicando = false;
  if (error) { toastError('No se pudo publicar: ' + (error.message || 'error')); return; }
  toast('Publicado. Ya le sale a tu equipo.');
  routes.comunidad();
};
window.comEditar = (id) => { _com.editando = id; routes.comunidad(); };
window.comGuardarEdicion = async (id) => {
  const el = document.getElementById('com-edit-' + id);
  const texto = ((el && el.value) || '').trim();
  if (!texto) { toast('La publicación no puede quedar vacía'); return; }
  const { error } = await sb.from('comunidad_posts').update({ texto, editado_en: new Date().toISOString() }).eq('id', id);
  if (error) { toastError('No se pudo guardar: ' + (error.message || 'error')); return; }
  _com.editando = null;
  toast('Guardada. Ya se ve así en la app.');
  routes.comunidad();
};
window.comFijar = async (id, fijar) => {
  await sb.from('comunidad_posts').update({ fijado: fijar }).eq('id', id);
  routes.comunidad();
};
window.comBorrar = async (id) => {
  if (!confirm('¿Borrar esta publicación? Deja de verse en la app de todos.')) return;
  await sb.from('comunidad_posts').update({ borrado_en: new Date().toISOString() }).eq('id', id);
  routes.comunidad();
};
// Responder: tu comentario sale como «Mauro · coach» en la app.
window.comResponder = async (postId) => {
  const el = document.getElementById('com-resp-' + postId);
  const texto = ((el && el.value) || '').trim();
  if (!texto) return;
  const { error } = await sb.from('comunidad_comentarios').insert({ post_id: postId, texto });
  if (error) { toastError('No se pudo responder: ' + (error.message || 'error')); return; }
  routes.comunidad();
};
// Borrar un comentario: deja de verse en la app de todos.
window.comBorrarComentario = async (id) => {
  if (!confirm('¿Borrar este comentario? Deja de verse en la app de todos.')) return;
  const { error } = await sb.from('comunidad_comentarios').update({ borrado_en: new Date().toISOString() }).eq('id', id);
  if (error) { toastError('No se pudo borrar: ' + (error.message || 'error')); return; }
  toast('Comentario borrado.');
  routes.comunidad();
};

// El numerito rojo del menú: comentarios y reacciones desde tu última visita.
function comPintarAviso(n) {
  const btn = document.querySelector('#main-nav .nav-item[data-view="comunidad"]');
  if (!btn) return;
  let b = btn.querySelector('.em-com-aviso');
  if (!n) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement('span'); b.className = 'em-com-aviso'; btn.appendChild(b); }
  b.textContent = n > 99 ? '99+' : String(n);
  b.setAttribute('aria-label', `${n} nuevos en Comunidad`);
}
async function comContarNuevos() {
  try {
    const desde = comVistoEn();
    const [c, r] = await Promise.all([
      sb.from('comunidad_comentarios').select('id,cliente_id,borrado_en').gte('creado_en', desde),
      sb.from('comunidad_reacciones').select('post_id').gte('creado_en', desde),
    ]);
    if (c.error && r.error) return;
    const n = (c.data || []).filter(x => x.cliente_id && !x.borrado_en).length + (r.data || []).length;
    // Si estás en Comunidad, ya lo estás viendo.
    const activa = document.querySelector('#main-nav .nav-item[data-view="comunidad"].active');
    comPintarAviso(activa ? 0 : n);
  } catch (e) { /* sin sesión todavía o sin tabla: se reintenta */ }
}
setTimeout(comContarNuevos, 2500);
setInterval(comContarNuevos, 120000);

// =====================================================
// REGISTRO EN EL CRM · como bandeja.js
// =====================================================
(function addComunidadNav() {
  try {
    const anchor = document.querySelector('.nav-item');
    if (!anchor || document.querySelector('.nav-item[data-view="comunidad"]')) return;
    const btn = anchor.cloneNode(true);
    btn.dataset.view = 'comunidad';
    btn.classList.remove('active');
    btn.textContent = 'Comunidad';
    // Después de la Bandeja (o de Inicio, si no está).
    const antes = document.querySelector('.nav-item[data-view="bandeja"]') || document.querySelector('.nav-item[data-view="dashboard"]');
    anchor.parentNode.insertBefore(btn, (antes && antes.nextSibling) || null);
    btn.addEventListener('click', () => navigate('comunidad'));
  } catch (e) { /* si el shell cambia, no rompe nada */ }
})();
