// =====================================================
// CRM EntrenaConMétodo · COMUNIDAD
// =====================================================
// Lo que publicas para TODO el equipo y les sale en «Comunidad» de su app
// (visual nueva). Solo tú escribes; ellos reaccionan con un toque (fuego,
// fuerza, aplauso, corazón). Aquí publicas, fijas arriba lo importante,
// borras, y ves el alcance: a cuántos les llegó y cómo reaccionaron.
//
// Necesita carga/migracion-comunidad.sql (repo entrenamientoecm). Sin ella
// la sección lo dice y no se rompe nada.
//
// Se auto-registra como bandeja.js. En index.html, después de bandeja.js:
//     <script src="/comunidad.js"></script>
// =====================================================

const COM_REACCIONES = [['fuego', '🔥', 'Fuego'], ['fuerza', '💪', 'Fuerza'], ['aplauso', '👏', 'Aplauso'], ['corazon', '❤️', 'Corazón']];
const _com = { publicando: false };

async function comCargar() {
  const { data: posts, error } = await sb.from('comunidad_posts')
    .select('id,texto,imagen_url,enlace_url,fijado,publicado_en')
    .is('borrado_en', null).order('fijado', { ascending: false }).order('publicado_en', { ascending: false }).limit(60);
  if (error) return { error };
  const ids = (posts || []).map(p => p.id);
  let reacciones = [], vistas = [];
  if (ids.length) {
    reacciones = (await sb.from('comunidad_reacciones').select('post_id,cliente_id,tipo').in('post_id', ids)).data || [];
    vistas = (await sb.from('comunidad_vistas').select('post_id,cliente_id').in('post_id', ids)).data || [];
  }
  const { data: clientes } = await sb.from('clientes').select('id,nombre,estado');
  return { posts: posts || [], reacciones, vistas, clientes: clientes || [] };
}

routes.comunidad = async () => {
  cargando('Leyendo tu comunidad…');
  const d = await comCargar();
  const activos = d.clientes ? d.clientes.filter(c => c.estado === 'activo') : [];
  const nombre = (id) => (d.clientes.find(c => c.id === id) || {}).nombre || 'Alguien';
  const fecha = (iso) => new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

  view.innerHTML = `
    <div class="mb-5">
      <h2 class="text-2xl font-bold text-slate-900">Comunidad</h2>
      <p class="text-sm text-slate-500">Lo que publicas aquí le sale a todo tu equipo en su app. Solo tú escribes; ellos reaccionan.</p>
    </div>
    ${d.error ? `<div class="card text-sm text-slate-600">Falta preparar la base: corre <strong>carga/migracion-comunidad.sql</strong> en Supabase (SQL Editor) y vuelve a entrar.</div>` : `
    <div class="em-com-grid">
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
      <div class="space-y-3" id="com-lista">
        ${d.posts.length ? d.posts.map(p => {
          const rx = d.reacciones.filter(r => r.post_id === p.id);
          const vistos = new Set(d.vistas.filter(v => v.post_id === p.id).map(v => v.cliente_id));
          const quienes = [...new Set(rx.map(r => r.cliente_id))].map(nombre);
          const pct = activos.length ? Math.round((vistos.size / activos.length) * 100) : 0;
          return `
          <div class="card" data-com-post="${p.id}">
            <div class="flex items-start justify-between gap-3">
              <div class="text-xs text-slate-500">${fecha(p.publicado_en)}${p.fijado ? ' · <strong class="text-amber-700">Fijado</strong>' : ''}</div>
              <div class="flex gap-2 flex-shrink-0">
                <button class="btn btn-secondary btn-sm" onclick="comFijar('${p.id}', ${!p.fijado})">${p.fijado ? 'Desfijar' : 'Fijar'}</button>
                <button class="btn btn-secondary btn-sm" onclick="comBorrar('${p.id}')">Borrar</button>
              </div>
            </div>
            <div class="text-sm text-slate-800 mt-2" style="white-space:pre-wrap">${escapeHtml(p.texto)}</div>
            ${p.imagen_url ? `<img src="${escapeHtml(p.imagen_url)}" alt="" class="mt-3 rounded-xl max-h-60">` : ''}
            ${p.enlace_url ? `<div class="mt-2 text-xs"><a class="underline" target="_blank" rel="noopener" href="${escapeHtml(p.enlace_url)}">${escapeHtml(p.enlace_url)}</a></div>` : ''}
            <div class="mt-3 pt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" style="border-top:1px solid #f1f5f9">
              <span data-com-alcance><strong>${vistos.size}</strong> de ${activos.length} la vieron (${pct}%)</span>
              ${COM_REACCIONES.map(([t, e]) => `<span>${e} <strong>${rx.filter(r => r.tipo === t).length}</strong></span>`).join('')}
            </div>
            ${quienes.length ? `<div class="text-xs text-slate-500 mt-1">Reaccionaron: ${escapeHtml(quienes.join(', '))}</div>` : ''}
          </div>`;
        }).join('') : '<div class="card text-sm text-slate-500 text-center py-8">Todavía no has publicado nada.</div>'}
      </div>
    </div>`}
  `;
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
window.comFijar = async (id, fijar) => {
  await sb.from('comunidad_posts').update({ fijado: fijar }).eq('id', id);
  routes.comunidad();
};
window.comBorrar = async (id) => {
  if (!confirm('¿Borrar esta publicación? Deja de verse en la app de todos.')) return;
  await sb.from('comunidad_posts').update({ borrado_en: new Date().toISOString() }).eq('id', id);
  routes.comunidad();
};

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
