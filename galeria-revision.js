// =====================================================
// CRM EntrenaConMétodo · GALERÍA · REVISIÓN DE NOMBRES Y REPETIDOS
// =====================================================
// Dos niveles nuevos en la galería de ejercicios:
//
//   «Sin nombre en inglés» → las fichas cuyo nombre grande sale en español
//   (no tienen el inglés, o tienen un apodo: «lateral raise», «RDL»…). Cada
//   una trae el nombre sugerido —el de la librería de Trainerize o, si no
//   está allí, una traducción— para ponerlo con un toque o corregirlo antes.
//   Guardar solo llena el inglés (`alias`); el español queda debajo, como
//   siempre, y el apodo pasa a las palabras de búsqueda. No se borra nada.
//
//   «Repetidos» → las fichas que son el mismo ejercicio, agrupadas una al
//   lado de la otra, con cuántos clientes usan cada una: dejas la que
//   prefieras y archivas las demás (archivar no borra ni toca rutinas).
//
// El diccionario (nombres-ingles.js) se carga la primera vez que se abre la
// galería.
// =====================================================

const _gr = { listo: false, cargando: null };
const GR_CLAVE_NO_REP = 'crm:grNoRepetidos:v1';
const grNorm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();

function grCargarDiccionario() {
  if (_gr.listo) return Promise.resolve(true);
  if (_gr.cargando) return _gr.cargando;
  _gr.cargando = new Promise((ok) => {
    const s = document.createElement('script');
    s.src = '/nombres-ingles.js';
    s.onload = () => { _gr.listo = true; ok(true); };
    s.onerror = () => { _gr.cargando = null; ok(false); };
    document.head.appendChild(s);
  });
  return _gr.cargando;
}

// ¿El nombre grande de la ficha NO es un nombre en inglés de verdad? Sin
// alias (sale el español), o un apodo: en minúscula, con comas o con
// palabras en español.
const GR_PALABRAS_ES = /\b(de|con|en|del|la|el|los|las|y|sin|al|para|sobre|tras|una|un)\b/;
function grEsApodo(a) {
  const t = String(a || '').trim();
  if (!t) return true;
  if (/[,;]/.test(t)) return true;
  if (/[áéíóúñ]/i.test(t)) return true;
  if (t[0] !== t[0].toUpperCase() || !/[A-Z0-9]/.test(t[0])) return true;
  return GR_PALABRAS_ES.test(grNorm(t));
}
function grNecesitaIngles(e) {
  if (!e || e.archivado) return false;
  const alias = String(e.alias || '').trim();
  if (!alias) return !(window.GR_EN && GR_EN[grNorm(e.nombre)]);   // sin alias: el nombre ya es inglés de Trainerize → no
  return grEsApodo(alias);
}

// El inglés sugerido: { en, de: 'trainerize' | 'traduccion', otras: [] } o null.
function grSugerencia(e) {
  if (!_gr.listo || !e) return null;
  const alias = String(e.alias || '').trim();
  const partes = alias ? [alias, ...alias.split(/[,;]/)] : [];
  for (const p of partes) { const en = GR_APODO_EN[grNorm(p)]; if (en) return { en, de: 'trainerize', otras: [] }; }
  for (const p of partes) { const en = GR_EN[grNorm(p)]; if (en) return { en, de: 'trainerize', otras: [] }; }
  const k = grNorm(e.nombre);
  if (GR_EN[k]) return { en: GR_EN[k], de: 'trainerize', otras: [] };
  const lista = GR_ES_EN[k];
  if (lista && lista.length) return { en: lista[0], de: 'trainerize', otras: lista.slice(1) };
  if (GR_PROPIAS[k]) return { en: GR_PROPIAS[k], de: 'traduccion', otras: [] };
  return null;
}
// El inglés con el que se compara para buscar repetidos.
function grIngles(e) {
  const alias = String(e.alias || '').trim();
  if (alias && !grEsApodo(alias)) return alias;
  const s = grSugerencia(e);
  return s ? s.en : '';
}

// ---------- Repetidos: grupos por inglés, por español y por la marca ----------
function grNoRepetidos() { try { return new Set(JSON.parse(localStorage.getItem(GR_CLAVE_NO_REP) || '[]')); } catch (e) { return new Set(); } }
function grClaveGrupo(ids) { return [...ids].sort().join('|'); }
function grGrupos(lista) {
  const vivos = (lista || []).filter(e => !e.archivado);
  const padre = new Map(vivos.map(e => [e.id, e.id]));
  const raiz = (x) => { while (padre.get(x) !== x) { padre.set(x, padre.get(padre.get(x))); x = padre.get(x); } return x; };
  const unir = (a, b) => { if (padre.has(a) && padre.has(b)) padre.set(raiz(a), raiz(b)); };
  const por = new Map();
  const llave = (k, id) => { if (!k) return; if (por.has(k)) unir(por.get(k), id); else por.set(k, id); };
  vivos.forEach(e => {
    const en = grNorm(grIngles(e));
    if (en.length >= 4) llave('en:' + en, e.id);
    const es = grNorm(e.nombre);
    if (es.length >= 6) llave('es:' + es, e.id);
    if (e.duplicado_de) unir(e.id, e.duplicado_de);
  });
  const grupos = new Map();
  vivos.forEach(e => { const r = raiz(e.id); if (!grupos.has(r)) grupos.set(r, []); grupos.get(r).push(e); });
  const fuera = grNoRepetidos();
  const uso = (e) => (_ent.enUso && _ent.enUso.get(e.id)) || 0;
  return [...grupos.values()]
    .filter(g => g.length > 1 && !fuera.has(grClaveGrupo(g.map(e => e.id))))
    .map(g => g.sort((a, b) => uso(b) - uso(a) || ((_ent.usados && _ent.usados.has(b.id)) ? 1 : 0) - ((_ent.usados && _ent.usados.has(a.id)) ? 1 : 0)))
    .sort((a, b) => grNorm(grIngles(a[0]) || a[0].nombre).localeCompare(grNorm(grIngles(b[0]) || b[0].nombre)));
}
function grIdsRepetidos(lista) { return new Set(grGrupos(lista).flat().map(e => e.id)); }

// ---------- Lo que se pinta en la tarjeta ----------
function grHtmlSugerencia(e) {
  if (!grNecesitaIngles(e)) return '';
  const s = grSugerencia(e);
  const valor = s ? s.en : '';
  const opciones = s && s.otras.length ? `<div class="text-[11px] text-slate-500 mt-1">También: ${s.otras.map(o => `<button class="underline" onclick="document.getElementById('gr-en-${e.id}').value=this.textContent">${escapeHtml(o)}</button>`).join(' · ')}</div>` : '';
  return `
    <div class="mt-2 rounded-lg bg-blue-50 border border-blue-200 p-2 text-xs" data-gr-sugerencia="${e.id}">
      <div class="text-blue-900 mb-1">${s ? (s.de === 'trainerize' ? 'Nombre de la librería de Trainerize:' : 'No está en Trainerize · traducción sugerida:') : 'Sin sugerencia: escribe el nombre en inglés.'}</div>
      <div class="flex gap-1">
        <input id="gr-en-${e.id}" class="flex-1 min-w-0 border border-blue-200 rounded-lg px-2 py-1 text-xs bg-white" value="${escapeHtml(valor)}" placeholder="Nombre en inglés">
        <button class="btn btn-primary btn-sm" data-gr-poner onclick="grPonerIngles('${e.id}')">Poner</button>
      </div>
      ${opciones}
    </div>`;
}
function grEtiquetaUso(e) {
  const n = _ent.enUso && _ent.enUso.get(e.id);
  if (n) return `<span class="tag tag-blue">${n} ${n === 1 ? 'cliente' : 'clientes'} ahora</span>`;
  if (_ent.usados && _ent.usados.has(e.id)) return '<span class="tag tag-gray">Usado antes</span>';
  return '<span class="tag tag-gray">Nadie lo usa</span>';
}
function grHtmlRepetidos(lista) {
  const grupos = grGrupos(lista);
  if (!grupos.length) return '<div class="card text-center text-slate-500 py-8">No hay ejercicios repetidos.</div>';
  return `<div class="space-y-4" data-gr-grupos>${grupos.map(g => {
    const ids = g.map(e => e.id);
    const clave = grClaveGrupo(ids);
    return `
      <div class="card p-3" data-gr-grupo="${escapeHtml(clave)}" style="background:#FBFAF6">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div class="text-sm font-bold text-slate-900">${escapeHtml(grIngles(g[0]) || g[0].nombre)} <span class="font-normal text-slate-500">· ${g.length} fichas</span></div>
          <button class="btn btn-ghost btn-sm" onclick="grNoSonRepetidos('${escapeHtml(clave)}')">No son el mismo</button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          ${g.map((e, i) => `
            <div data-gr-ficha="${e.id}">
              ${entTarjetaEjercicio(e)}
              <div class="flex items-center justify-between gap-2 px-1 pt-2">
                <div>${grEtiquetaUso(e)}${i === 0 && ((_ent.enUso && _ent.enUso.get(e.id)) || (_ent.usados && _ent.usados.has(e.id))) ? ' <span class="tag tag-green">Sugerido dejar</span>' : ''}</div>
                <button class="btn btn-secondary btn-sm" data-gr-archivar onclick="grArchivar('${e.id}')" title="Sale de la galería; las rutinas que lo usan no se tocan">Archivar este</button>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  }).join('')}</div>`;
}

// ---------- Acciones ----------
window.grPonerIngles = async (id) => {
  const e = (_ent.ejercicios || []).find(x => x.id === id);
  const en = (document.getElementById(`gr-en-${id}`)?.value || '').trim();
  if (!e) return;
  if (!en) { toast('Escribe el nombre en inglés'); return; }
  const cambios = { alias: en, updated_at: new Date().toISOString() };
  const viejo = String(e.alias || '').trim();
  // El apodo no se pierde: pasa a las palabras de búsqueda.
  if (viejo && viejo !== en && Object.prototype.hasOwnProperty.call(e, 'busqueda')) {
    const b = String(e.busqueda || '');
    if (!grNorm(b).includes(grNorm(viejo))) cambios.busqueda = (b ? b + ', ' : '') + viejo;
  }
  // Respaldo del nombre anterior (si la tabla existe; si no, sigue igual).
  try {
    await sb.from('ejercicios_nombre_respaldo').insert({ ejercicio_id: id, alias: e.alias || null, nombre: e.nombre, busqueda: e.busqueda || null, motivo: 'crm-nombre-ingles', puesto_alias: en, puesto_nombre: e.nombre });
  } catch (err) { /* sin tabla de respaldo: no pasa nada */ }
  const { error } = await sb.from('ejercicios').update(cambios).eq('id', id);
  if (error) { toastError('No se pudo guardar: ' + (error.message || 'error')); return; }
  Object.assign(e, cambios);
  toast(`Listo: ${en}`);
  entRepintarGaleria();
};

window.grPonerTodas = async () => {
  const lista = (_ent.ejercicios || []).filter(grNecesitaIngles);
  const con = lista.map(e => ({ e, s: grSugerencia(e) })).filter(x => x.s && !x.s.otras.length);
  if (!con.length) { toast('No hay sugerencias para poner'); return; }
  const trad = con.filter(x => x.s.de === 'traduccion').length;
  if (!confirm(`Poner el nombre en inglés a ${con.length} ejercicios.\n\n${con.length - trad} salen de la librería de Trainerize y ${trad} son traducción.\nEl español se queda debajo y los apodos pasan a las palabras de búsqueda. No se borra nada.\n\nLos que no tienen sugerencia, o tienen varias, quedan para que los revises.`)) return;
  let ok = 0;
  for (const { e, s } of con) {
    const input = document.getElementById(`gr-en-${e.id}`);
    if (input) input.value = s.en;
    const cambios = { alias: s.en, updated_at: new Date().toISOString() };
    const viejo = String(e.alias || '').trim();
    if (viejo && viejo !== s.en && Object.prototype.hasOwnProperty.call(e, 'busqueda')) {
      const b = String(e.busqueda || '');
      if (!grNorm(b).includes(grNorm(viejo))) cambios.busqueda = (b ? b + ', ' : '') + viejo;
    }
    try { await sb.from('ejercicios_nombre_respaldo').insert({ ejercicio_id: e.id, alias: e.alias || null, nombre: e.nombre, busqueda: e.busqueda || null, motivo: 'crm-nombre-ingles', puesto_alias: s.en, puesto_nombre: e.nombre }); } catch (err) { /* nada */ }
    const { error } = await sb.from('ejercicios').update(cambios).eq('id', e.id);
    if (!error) { Object.assign(e, cambios); ok++; }
  }
  toast(`Listo: ${ok} con su nombre en inglés.`);
  entRepintarGaleria();
};

window.grArchivar = async (id) => {
  const e = (_ent.ejercicios || []).find(x => x.id === id);
  const n = _ent.enUso && _ent.enUso.get(id);
  const aviso = n ? `\n\nOjo: ${n} ${n === 1 ? 'cliente lo tiene' : 'clientes lo tienen'} en su ciclo actual. Sus rutinas no se tocan, pero ya no podrás elegirlo para rutinas nuevas.` : '';
  if (!confirm(`¿Archivar «${e ? entNombres(e).grande : 'este ejercicio'}»?\n\nSale de la galería. No se borra y las rutinas que lo usan no se tocan.${aviso}`)) return;
  const ok = await entDb.archivarEjercicio(id);
  if (!ok) return;
  toast('Archivado');
  entRepintarGaleria();
};

window.grNoSonRepetidos = (clave) => {
  const s = grNoRepetidos(); s.add(clave);
  try { localStorage.setItem(GR_CLAVE_NO_REP, JSON.stringify([...s])); } catch (e) { /* nada */ }
  entRepintarGaleria();
};
