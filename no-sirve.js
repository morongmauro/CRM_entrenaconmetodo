// ─────────────────────────────────────────────────────────────────────────
// «NO LE SIRVE» · tag por cliente y ejercicio
//
// El cliente te dice «ese no: no tengo la máquina» o «me molesta el hombro».
// Aquí lo apuntas una vez, pegado al cliente y al ejercicio (no a la rutina),
// y el CRM se acuerda por ti:
//   · en su rutina: botón «No le sirve» al lado de «Alternativas»; al
//     ponerlo, eliges el motivo y qué hacer (buscar alternativa, quitarlo o
//     solo marcarlo);
//   · en la galería y en «Alternativas» de ese cliente: etiqueta roja y al
//     final de la lista; si igual lo añades, pregunta;
//   · el agente no lo propone;
//   · en su página de Entrenamiento: la lista «No le sirven», con motivo y
//     fecha, y «Quitar tag» cuando ya se arregló (nada se borra: fecha).
// Tabla: ejercicios_no_sirven (migraciones/no-le-sirve.sql). El cliente no
// ve nada de esto en su app.
// ─────────────────────────────────────────────────────────────────────────

const NS_MOTIVOS = [
  ['implemento', 'Sin máquina o implemento', 'No tiene con qué hacerlo donde entrena.'],
  ['dolor', 'Le molesta o duele', 'Molestia o dolor al hacerlo.'],
  ['otro', 'Otro', 'Otro motivo (escríbelo abajo).'],
];
const NS_CORTO = { implemento: 'sin implemento', dolor: 'le duele', otro: 'otro' };
const _ns = { cache: {}, cargando: {}, abierto: null, sinTabla: false };

function nsMotivoTexto(f) {
  const m = NS_CORTO[f.motivo] || f.motivo || '';
  return f.nota ? `${m}: ${f.nota}` : m;
}
function nsFecha(iso) { try { return fmt.fechaCorta(String(iso).slice(0, 10)); } catch (e) { return String(iso || '').slice(0, 10); } }

// Los vigentes de un cliente (una lectura por cliente; se refresca al cambiar).
async function nsCargar(clienteId, forzar = false) {
  const k = String(clienteId || '');
  if (!k) return [];
  if (!forzar && _ns.cache[k]) return _ns.cache[k];
  if (_ns.cargando[k]) return _ns.cargando[k];
  _ns.cargando[k] = (async () => {
    try {
      const { data, error } = await sb.from('ejercicios_no_sirven').select('*').eq('cliente_id', k).is('quitado_en', null).order('creado_en');
      if (error) throw error;
      _ns.cache[k] = data || [];
    } catch (e) {
      if (/does not exist|relation/.test(String(e && e.message || ''))) _ns.sinTabla = true;
      _ns.cache[k] = _ns.cache[k] || [];
    }
    delete _ns.cargando[k];
    return _ns.cache[k];
  })();
  return _ns.cargando[k];
}
const nsLista = (clienteId) => _ns.cache[String(clienteId || '')] || null;
const nsDe = (clienteId, ejercicioId) => (nsLista(clienteId) || []).find(f => String(f.ejercicio_id) === String(ejercicioId)) || null;
window.nsTiene = (clienteId, ejercicioId) => !!nsDe(clienteId, ejercicioId);
const nsClienteActual = () => (_ent && _ent.rutina && _ent.rutina.cliente_id) ? _ent.rutina.cliente_id : (_ent && _ent.clienteId) || null;

// ── Etiqueta (galería, alternativas, listas) ────────────────────────────
window.nsEtiqueta = (ejercicioId, clienteId = null, { chica = false } = {}) => {
  const c = clienteId || nsClienteActual();
  if (!c) return '';
  const f = nsDe(c, ejercicioId);
  if (!f) { if (!nsLista(c)) nsCargar(c).then(() => nsRepintarEtiquetas()); return ''; }
  return `<span class="ns-tag${chica ? ' ns-tag-chica' : ''}" data-ns-tag="${escapeHtml(String(ejercicioId))}" title="No le sirve a este cliente · ${escapeHtml(nsMotivoTexto(f))} · ${nsFecha(f.creado_en)}">No le sirve · ${escapeHtml(NS_CORTO[f.motivo] || f.motivo)}</span>`;
};
// Si la galería se pintó antes de que llegaran los tags, se vuelve a pintar.
let _nsRep = null;
function nsRepintarEtiquetas() {
  clearTimeout(_nsRep);
  _nsRep = setTimeout(() => {
    if (document.getElementById('cons-gal-lista') && typeof entPintarGaleriaCons === 'function') entPintarGaleriaCons();
    if (document.getElementById('alt-lista') && typeof altPintarLista === 'function') altPintarLista();
  }, 60);
}

// ── El botón de cada fila de la rutina del cliente ───────────────────────
window.nsBotonHTML = (re) => {
  const e = re.ejercicios || {};
  return `<button class="btn btn-ghost btn-sm ns-btn" data-ns-btn="${escapeHtml(re.id)}" data-ns-ej="${escapeHtml(String(e.id || re.ejercicio_id || ''))}"
    onclick="nsAbrir('${escapeHtml(re.id)}')" title="No le sirve: apuntar que este ejercicio no va con este cliente (sin implemento, le duele…) para no volver a ponérselo"><span class="ns-ico" aria-hidden="true">&#9888;</span><span class="txt">No le sirve</span></button>`;
};
function nsPintarFilas() {
  const c = nsClienteActual();
  if (!c) return;
  document.querySelectorAll('[data-ns-btn]').forEach(b => {
    const f = nsDe(c, b.dataset.nsEj);
    b.classList.toggle('ns-on', !!f);
    b.title = f ? `No le sirve · ${nsMotivoTexto(f)} · ${nsFecha(f.creado_en)}. Toca para cambiarlo o quitar el tag.` : 'No le sirve: apuntar que este ejercicio no va con este cliente, para no volver a ponérselo';
    const txt = b.querySelector('.txt'); if (txt) txt.textContent = f ? `No le sirve · ${NS_CORTO[f.motivo] || f.motivo}` : 'No le sirve';
  });
}
let _nsT = null;
async function nsRevisarPantalla() {
  const c = nsClienteActual();
  const btns = [...document.querySelectorAll('[data-ns-btn]:not([data-ns-listo])')];
  if (!c || !btns.length) return;
  btns.forEach(b => b.setAttribute('data-ns-listo', '1'));
  if (!nsLista(c)) await nsCargar(c).catch(() => {});
  nsPintarFilas();
}
new MutationObserver(() => { clearTimeout(_nsT); _nsT = setTimeout(nsRevisarPantalla, 120); })
  .observe(document.body, { childList: true, subtree: true });

// ── La ventana: motivo + qué hacer ───────────────────────────────────────
window.nsAbrir = async (reId) => {
  const rut = _ent && _ent.rutina;
  const re = rut && (rut.ejercicios || []).find(x => String(x.id) === String(reId));
  if (!re || !rut.cliente_id) return toast('Abre la rutina de un cliente');
  const e = re.ejercicios || {};
  const ejId = String(e.id || re.ejercicio_id);
  await nsCargar(rut.cliente_id).catch(() => {});
  const ya = nsDe(rut.cliente_id, ejId);
  const nombre = typeof ccNombreCliente === 'function' ? await ccNombreCliente(rut.cliente_id) : '';
  _ns.abierto = { reId, ejId, clienteId: rut.cliente_id, ya, motivo: ya ? ya.motivo : 'implemento' };
  const n = entNombres(e);
  openModal(`
    <div class="ns-modal" data-ns-ventana>
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="cc-eyebrow">No le sirve${nombre ? ` · ${escapeHtml(nombre)}` : ''}</div>
          <h3 class="alt-titulo">${escapeHtml(n.grande)}</h3>
          ${n.chico ? `<div class="alt-chico">${escapeHtml(n.chico)}</div>` : ''}
        </div>
        <button class="btn btn-ghost btn-sm" onclick="closeModal()" aria-label="Cerrar">✕</button>
      </div>
      ${ya ? `<div class="ns-ya" data-ns-ya>Ya tiene el tag desde el ${nsFecha(ya.creado_en)}: <b>${escapeHtml(nsMotivoTexto(ya))}</b>. Puedes cambiar el motivo o quitarlo si ya se arregló.</div>` : ''}
      <div class="ns-motivos" data-ns-motivos>
        ${NS_MOTIVOS.map(([k, t, d]) => `<button type="button" class="ns-motivo${(ya ? ya.motivo : 'implemento') === k ? ' on' : ''}" data-ns-motivo="${k}" onclick="nsMotivo('${k}')"><b>${t}</b><span>${d}</span></button>`).join('')}
      </div>
      <input id="ns-nota" class="mt-2" placeholder="Nota corta (opcional): hombro derecho, no tiene banda…" value="${escapeHtml(ya && ya.nota || '')}" maxlength="120">
      <div class="ns-ayuda">Queda pegado al cliente y al ejercicio: en su galería y en Alternativas saldrá con etiqueta roja y al final, y el agente no se lo propondrá. Él no ve nada de esto.</div>
      <div class="ns-acciones">
        <button class="btn btn-primary" data-ns-guardar="alternativa" onclick="nsGuardar('alternativa')">Guardar y buscar alternativa</button>
        <button class="btn btn-secondary" data-ns-guardar="quitar" onclick="nsGuardar('quitar')">Guardar y quitarlo de la rutina</button>
        <button class="btn btn-ghost" data-ns-guardar="solo" onclick="nsGuardar('solo')">Solo marcarlo</button>
        ${ya ? `<button class="btn btn-ghost ns-quitar" data-ns-quitar onclick="nsQuitarTag('${escapeHtml(ya.id)}')">Quitar el tag (ya le sirve)</button>` : ''}
      </div>
    </div>`);
};
window.nsMotivo = (k) => {
  if (!_ns.abierto) return;
  _ns.abierto.motivo = k;
  document.querySelectorAll('[data-ns-motivo]').forEach(b => b.classList.toggle('on', b.dataset.nsMotivo === k));
};
window.nsGuardar = async (accion) => {
  const a = _ns.abierto;
  if (!a) return;
  const nota = String((document.getElementById('ns-nota') || {}).value || '').trim().slice(0, 120) || null;
  const fila = { cliente_id: String(a.clienteId), ejercicio_id: a.ejId, motivo: a.motivo, nota };
  if (a.ya) {
    const { error } = await sb.from('ejercicios_no_sirven').update({ motivo: a.motivo, nota }).eq('id', a.ya.id);
    if (error) return toast(nsErr(error));
  } else {
    const { error } = await sb.from('ejercicios_no_sirven').insert(fila);
    if (error) return toast(nsErr(error));
  }
  await nsCargar(a.clienteId, true).catch(() => {});
  closeModal();
  nsPintarFilas(); nsRepintarEtiquetas();
  if (typeof nsPintarListaCliente === 'function') nsPintarListaCliente();
  if (accion === 'alternativa' && typeof entAlternativas === 'function') { toast('Marcado. Elige el reemplazo.'); return entAlternativas(a.reId); }
  if (accion === 'quitar' && typeof entQuitarRE === 'function') { toast('Marcado y quitado de la rutina'); return entQuitarRE(a.reId); }
  toast('Marcado: queda apuntado para no volver a ponérselo');
};
window.nsQuitarTag = async (id) => {
  if (!confirm('¿Quitar el tag? El ejercicio vuelve a salir como cualquiera para este cliente (el registro queda guardado con la fecha).')) return;
  const { error } = await sb.from('ejercicios_no_sirven').update({ quitado_en: new Date().toISOString() }).eq('id', id);
  if (error) return toast(nsErr(error));
  const c = (_ns.abierto && _ns.abierto.clienteId) || nsClienteActual();
  if (c) await nsCargar(c, true).catch(() => {});
  if (document.querySelector('[data-ns-ventana]')) closeModal();
  nsPintarFilas(); nsRepintarEtiquetas();
  if (typeof nsPintarListaCliente === 'function') nsPintarListaCliente();
  toast('Tag quitado');
};
const nsErr = (error) => /does not exist|relation/.test(error.message || '') ? 'Falta correr migraciones/no-le-sirve.sql en Supabase' : error.message;

// ── Al añadir igual (galería, Alternativas): pregunta ────────────────────
window.nsConfirmarUso = (ejercicioId, clienteId = null) => {
  const c = clienteId || nsClienteActual();
  const f = c ? nsDe(c, ejercicioId) : null;
  if (!f) return true;
  return confirm(`Este ejercicio tiene el tag «No le sirve» para este cliente (${nsMotivoTexto(f)}, ${nsFecha(f.creado_en)}).\n\n¿Seguro que quieres ponérselo igual?`);
};

// ── La lista en la página de Entrenamiento del cliente ───────────────────
window.nsListaClienteHTML = (clienteId) => `<div data-ns-lista-cliente="${escapeHtml(String(clienteId))}"></div>`;
window.nsPintarListaCliente = async () => {
  const caja = document.querySelector('[data-ns-lista-cliente]');
  if (!caja) return;
  const c = caja.dataset.nsListaCliente;
  const lista = await nsCargar(c).catch(() => []);
  if (!lista.length) { caja.innerHTML = ''; return; }
  const ejs = (_ent && _ent.ejercicios && _ent.ejercicios.length) ? _ent.ejercicios : (typeof entDb !== 'undefined' ? await entDb.ejercicios().catch(() => []) : []);
  const porId = new Map((ejs || []).map(e => [String(e.id), e]));
  // ¿Está hoy en alguna de sus rutinas? (para verlo de un vistazo tras copiar un ciclo)
  const enRutinas = new Map();
  try {
    const rutinas = _ent.rutinasCache || [];
    const ids = rutinas.map(r => r.id);
    const por = ids.length ? await entDb.ejerciciosDeRutinas(ids) : {};
    rutinas.forEach(r => (por[r.id] || []).forEach(re => { const k = String(re.ejercicio_id); if (!enRutinas.has(k)) enRutinas.set(k, []); enRutinas.get(k).push(r.nombre); }));
  } catch (e) {}
  caja.innerHTML = `
    <div class="card mt-4" data-ns-lista>
      <div class="flex items-baseline justify-between mb-1"><h3 class="font-bold text-slate-900">No le sirven</h3><span class="text-xs font-bold" style="color:#B4533F">${lista.length}</span></div>
      <p class="text-xs text-slate-500 mb-2">Ejercicios que apuntaste para no volver a ponerle. Si alguno vuelve a servirle, quítale el tag.</p>
      ${lista.map(f => {
        const e = porId.get(String(f.ejercicio_id));
        const n = e ? entNombres(e) : { grande: f.ejercicio_id, chico: '' };
        const donde = enRutinas.get(String(f.ejercicio_id));
        return `<div class="py-2 text-sm flex items-center gap-2" style="border-top:1px solid #f1f5f9" data-ns-fila="${escapeHtml(f.id)}">
          <div class="min-w-0 flex-1">
            <div class="font-semibold text-slate-900">${escapeHtml(n.grande)}${n.chico ? ` <span class="text-slate-400 font-normal">· ${escapeHtml(n.chico)}</span>` : ''}</div>
            <div class="text-xs text-slate-500">${escapeHtml(nsMotivoTexto(f))} · ${nsFecha(f.creado_en)}${donde && donde.length ? ` · <span style="color:#B4533F;font-weight:700" data-ns-en-rutina>hoy está en ${escapeHtml(donde.join(', '))}</span>` : ''}</div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="nsQuitarTag('${escapeHtml(f.id)}')">Quitar tag</button>
        </div>`;
      }).join('')}
    </div>`;
};
// La página del cliente se pinta sin esperar la lista; se llena al aparecer.
new MutationObserver(() => {
  const caja = document.querySelector('[data-ns-lista-cliente]:not([data-ns-listo])');
  if (!caja) return;
  caja.setAttribute('data-ns-listo', '1');
  nsPintarListaCliente();
}).observe(document.body, { childList: true, subtree: true });
