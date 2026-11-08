// =====================================================
// CRM EntrenaConMétodo · GALERÍA · COMPLETAR FICHAS CON IA
// =====================================================
// Nivel «Ficha incompleta» en la galería: los ejercicios a los que les falta
// el patrón, los músculos, «Cómo hacerlo bien» (claves_tecnicas) o los
// «Errores comunes» (errores_tecnicos). Arriba, cuántas fichas están
// completas y el botón «Completar con IA»:
//
//   1. La IA propone, por tandas de 6, SOLO lo que le falta a cada uno
//      (perfil «ficha» de /api/coach-ask). Los músculos y el patrón salen de
//      las listas del CRM, así la figura de la ficha los pinta bien.
//   2. El coach revisa en una tabla: corrige, desmarca lo que no quiera y
//      toca «Guardar».
//   3. Guardar SOLO llena lo que seguía vacío: nunca pisa lo que el coach
//      ya escribió ni borra nada.
//
// Va DESPUÉS de entrenamiento.js (usa _ent, entDb, ENT_PATRONES,
// entTieneErrores, entNombres y entPintarListaGaleria).
// =====================================================

const _fi = { filas: [], parar: false, corriendo: false };
const FI_TANDA = 6;

// Qué le falta a la ficha de un ejercicio.
// El patrón solo en fuerza y potencia; los músculos, salvo en cardio y
// calentamiento; las articulaciones, en movilidad y estiramientos.
function fiFalta(e) {
  const f = [];
  const fam = entFamilia(e.tipo || 'fuerza');
  if (!e.patron && entLlevaPatron(e.tipo)) f.push('patron');
  if (!(e.musculos_primarios || []).length && fam !== 'resistencia' && e.tipo !== 'calentamiento') f.push('musculos');
  if (fam === 'movilidad' && entTieneCol('articulaciones') && !(e.articulaciones || []).length) f.push('articulaciones');
  if (!(e.claves_tecnicas || []).filter(x => String(x || '').trim()).length) f.push('claves');
  if (entTieneErrores() && !(e.errores_tecnicos || []).filter(x => String(x || '').trim()).length) f.push('errores');
  return f;
}
window.fiIncompleta = (e) => !e.archivado && fiFalta(e).length > 0;

const FI_NOMBRE = { patron: 'patrón', musculos: 'músculos', articulaciones: 'articulaciones', claves: 'cómo hacerlo bien', errores: 'errores comunes' };

// Arriba de la lista, con el nivel «Ficha incompleta».
window.fiHtmlCabecera = (todos) => {
  const vivos = todos.filter(e => !e.archivado);
  const inc = vivos.filter(fiIncompleta);
  const por = { patron: 0, musculos: 0, articulaciones: 0, claves: 0, errores: 0 };
  inc.forEach(e => fiFalta(e).forEach(k => { por[k]++; }));
  const faltan = Object.entries(por).filter(([, n]) => n).map(([k, n]) => `${FI_NOMBRE[k]} a ${n}`).join(' · ');
  return `<div class="card mb-3" data-fi-cabecera>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="font-bold text-slate-900">Fichas completas: ${vivos.length - inc.length} de ${vivos.length}</div>
        <div class="text-xs text-slate-500 mt-0.5">${inc.length ? `Les falta ${faltan}.` : 'Todas las fichas están completas.'}</div>
      </div>
      ${inc.length ? `<button class="btn btn-primary btn-sm" data-fi-completar onclick="fiCompletar()">Completar con IA</button>` : ''}
    </div>
    ${!entTieneErrores() ? `<div class="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2 mt-3">Para guardar «Errores comunes», corre <code>migraciones/ejercicios-errores.sql</code> en Supabase.</div>` : ''}
  </div>`;
};

// Orden: primero lo que usan hoy tus clientes, después lo que usaron antes,
// después el resto de la galería.
function fiPendientes() {
  const todos = (_ent.ejercicios || []).filter(fiIncompleta);
  const peso = (e) => (_ent.enUso && _ent.enUso.has(e.id) ? 0 : _ent.usados && _ent.usados.has(e.id) ? 1 : 2);
  return todos.sort((a, b) => peso(a) - peso(b) || String(a.nombre).localeCompare(String(b.nombre)));
}

async function fiPedirTanda(lista) {
  const musculos = (_ent.musculos || []).map(m => [m.slug, m.corto || m.nombre || m.slug]);
  const cuerpo = {
    patrones: ENT_PATRONES,
    musculos,
    articulaciones: ENT_ARTICULACIONES.map(([k]) => k),
    cualidades: ENT_CUALIDADES.map(([k]) => k),
    ejercicios: lista.map(e => ({
      id: e.id, nombre: e.nombre, nombre_en: e.alias || undefined, tipo: e.tipo || undefined, familia: entFamilia(e.tipo || 'fuerza'),
      segmento: e.segmento || undefined, equipo: e.equipo || undefined,
      patron: e.patron || undefined, primarios: (e.musculos_primarios || []).length ? e.musculos_primarios : undefined,
      secundarios: (e.musculos_secundarios || []).length ? e.musculos_secundarios : undefined,
      claves: (e.claves_tecnicas || []).length ? e.claves_tecnicas : undefined,
      // «También mejora»: se pide de paso si está vacío (no cuenta como incompleta).
      falta: [...fiFalta(e), ...(entTieneCol('cualidades') && !(e.cualidades || []).length ? ['tambien'] : [])],
    })),
  };
  const r = await fetch('/api/coach-ask', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ perfil: 'ficha', nivel: 'rapido', messages: [{ role: 'user', content: JSON.stringify(cuerpo) }] }) });
  const d = await r.json().catch(() => ({}));
  // Ocupado o límite de pedidos: se espera más antes de reintentar.
  if (!r.ok) { const err = new Error(d.error || 'sin respuesta'); err.status = r.status; throw err; }
  const texto = (d.content || []).filter(x => x.type === 'text').map(x => x.text).join('');
  try { return JSON.parse((texto.match(/\{[\s\S]*\}/) || ['{}'])[0]); } catch (e) { return {}; }
}

// Una tanda que falla (la respuesta llegó cortada, el servicio estaba
// ocupado, se pasó el límite de pedidos) dejaba sin sugerencia a sus 6
// ejercicios. Ahora los que no llegaron se piden otra vez solos, de a 2, hasta
// 2 veces más, con una pausa entre intento e intento.
const fiEspera = (ms) => new Promise(ok => setTimeout(ok, ms));
const fiSinNada = (e, res) => !Object.keys(fiLimpiar(e, (res && res[e.id]) || {})).length;
async function fiPedirConReintento(lista) {
  let res = {}, pausa = 0;
  try { res = await fiPedirTanda(lista); } catch (e) { res = {}; pausa = e.status === 429 || e.status === 529 ? 8000 : 2000; }
  for (let intento = 0; intento < 2 && !_fi.parar; intento++) {
    const faltan = lista.filter(e => fiSinNada(e, res));
    if (!faltan.length) break;
    await fiEspera(pausa || 1500);
    pausa = 0;
    for (let k = 0; k < faltan.length && !_fi.parar; k += 2) {
      try { Object.assign(res, await fiPedirTanda(faltan.slice(k, k + 2))); }
      catch (e) { pausa = e.status === 429 || e.status === 529 ? 8000 : 2000; }
    }
  }
  return res;
}

// Lo que propone la IA, limpio y solo con valores válidos.
function fiLimpiar(e, p) {
  const falta = fiFalta(e);
  const pats = new Set(ENT_PATRONES.map(x => x[0]));
  const mus = new Set((_ent.musculos || []).map(m => m.slug));
  const lista = (l, n) => (Array.isArray(l) ? l : []).map(x => String(x).trim().replace(/\.$/, '')).filter(Boolean).slice(0, n);
  const o = {};
  if (falta.includes('patron') && pats.has(p.patron)) o.patron = p.patron;
  if (falta.includes('musculos')) {
    const prim = [...new Set(lista(p.primarios, 3).filter(s => mus.has(s)))];
    const sec = [...new Set(lista(p.secundarios, 3).filter(s => mus.has(s) && !prim.includes(s)))];
    if (prim.length) { o.musculos_primarios = prim; o.musculos_secundarios = (e.musculos_secundarios || []).length ? e.musculos_secundarios : sec; }
  }
  if (falta.includes('articulaciones')) { const ok = new Set(ENT_ARTICULACIONES.map(([k]) => k)); const a = [...new Set(lista(p.articulaciones, 4).filter(x => ok.has(x)))]; if (a.length) o.articulaciones = a; }
  // «También mejora»: hasta 2, nunca la misma familia que ya es.
  if (entTieneCol('cualidades') && !(e.cualidades || []).length) { const ok = new Set(ENT_CUALIDADES.map(([k]) => k)); const fam = entFamilia(e.tipo || 'fuerza'); const t = [...new Set(lista(p.tambien, 2).filter(x => ok.has(x) && x !== fam))]; if (t.length) o.cualidades = t; }
  if (falta.includes('claves')) { const c = lista(p.claves, 3); if (c.length) o.claves_tecnicas = c; }
  if (falta.includes('errores')) { const c = lista(p.errores, 3); if (c.length) o.errores_tecnicos = c; }
  return o;
}

const fiNombreMusculo = (s) => { const m = (_ent.musculos || []).find(x => x.slug === s); return m ? (m.corto || m.nombre || s) : s; };

function fiHtmlFila(f, i) {
  const e = f.e, o = f.propuesta;
  const n = entNombres(e);
  const partes = [];
  if ('patron' in o) partes.push(`<label class="block text-xs text-slate-500 mt-2" style="text-transform:none;letter-spacing:0">Patrón
      <select data-fi-patron="${i}" class="mt-1">${ENT_PATRONES.map(([v, t]) => `<option value="${v}" ${v === o.patron ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}</select></label>`);
  if ('musculos_primarios' in o) partes.push(`<div class="text-xs text-slate-500 mt-2">Músculos
      <div class="flex flex-wrap gap-1 mt-1">${o.musculos_primarios.map(s => `<span class="tag tag-blue">${escapeHtml(fiNombreMusculo(s))}</span>`).join('')}${(o.musculos_secundarios || []).map(s => `<span class="tag tag-gray">${escapeHtml(fiNombreMusculo(s))}</span>`).join('')}</div></div>`);
  const nomArt = (k) => (ENT_ARTICULACIONES.find(x => x[0] === k) || [k, k])[1], nomCual = (k) => (ENT_CUALIDADES.find(x => x[0] === k) || [k, k])[1];
  if ('articulaciones' in o) partes.push(`<div class="text-xs text-slate-500 mt-2">Articulaciones que mueve
      <div class="flex flex-wrap gap-1 mt-1">${o.articulaciones.map(a => `<span class="tag tag-blue">${escapeHtml(nomArt(a))}</span>`).join('')}</div></div>`);
  if ('cualidades' in o) partes.push(`<div class="text-xs text-slate-500 mt-2">También mejora
      <div class="flex flex-wrap gap-1 mt-1">${o.cualidades.map(a => `<span class="tag tag-green">${escapeHtml(nomCual(a))}</span>`).join('')}</div></div>`);
  if ('claves_tecnicas' in o) partes.push(`<label class="block text-xs text-slate-500 mt-2" style="text-transform:none;letter-spacing:0">Cómo hacerlo bien
      <textarea data-fi-claves="${i}" rows="3" class="mt-1 w-full text-sm">${escapeHtml(o.claves_tecnicas.join('\n'))}</textarea></label>`);
  if ('errores_tecnicos' in o) partes.push(`<label class="block text-xs text-slate-500 mt-2" style="text-transform:none;letter-spacing:0">Errores comunes
      <textarea data-fi-errores="${i}" rows="3" class="mt-1 w-full text-sm">${escapeHtml(o.errores_tecnicos.join('\n'))}</textarea></label>`);
  return `<div class="py-3" style="border-bottom:1px solid #f1f5f9" data-fi-fila="${i}">
    <label class="flex items-start gap-3 cursor-pointer" style="text-transform:none;letter-spacing:0">
      <input type="checkbox" data-fi-marca="${i}" ${partes.length ? 'checked' : 'disabled'} class="mt-1">
      <div class="min-w-0 flex-1">
        <div class="font-bold text-slate-900 text-sm">${escapeHtml(n.grande)}${n.chico ? ` <span class="font-normal text-slate-400">· ${escapeHtml(n.chico)}</span>` : ''}</div>
        ${partes.length ? '' : '<div class="text-xs text-slate-500 mt-1">No llegó sugerencia para este. Abajo: «Reintentar los que faltan».</div>'}
      </div>
    </label>
    <div class="pl-7">${partes.join('')}</div>
  </div>`;
}

function fiPintar(estado) {
  const caja = document.getElementById('fi-filas');
  if (caja) caja.innerHTML = _fi.filas.map(fiHtmlFila).join('') || '<div class="text-sm text-slate-500 py-3">Pensando la primera tanda…</div>';
  const est = document.getElementById('fi-estado');
  if (est) est.textContent = estado;
  const g = document.querySelector('[data-fi-guardar]');
  if (g) g.textContent = `Guardar (${_fi.filas.filter(f => Object.keys(f.propuesta).length).length})`;
}

window.fiCompletar = async () => {
  if (_fi.corriendo) return;
  await entDb.musculos();
  const pend = fiPendientes();
  if (!pend.length) return toast('Todas las fichas están completas');
  _fi.filas = []; _fi.parar = false; _fi.corriendo = true;
  openModal(modalShell('Completar fichas con IA', `
    <p class="text-sm text-slate-600">La IA propone solo lo que le falta a cada ficha. Revisa, corrige lo que quieras y desmarca lo que no. <b>Guardar solo llena lo vacío:</b> no cambia nada de lo que ya escribiste.</p>
    <div class="text-xs text-slate-500 mt-2" id="fi-estado"></div>
    <div id="fi-filas" class="mt-2"></div>`,
    `<button class="btn btn-secondary" data-fi-parar onclick="fiParar()">Detener</button>
     <button class="btn btn-primary" data-fi-guardar onclick="fiGuardar()">Guardar (0)</button>`));
  fiPintar(`Pensando… 0 de ${pend.length}`);
  for (let k = 0; k < pend.length && !_fi.parar; k += FI_TANDA) {
    const tanda = pend.slice(k, k + FI_TANDA);
    let res = {};
    try { res = await fiPedirConReintento(tanda); } catch (e) { res = {}; }
    if (!document.getElementById('fi-filas')) { _fi.corriendo = false; return; }   // cerró la ventana
    tanda.forEach(e => _fi.filas.push({ e, propuesta: fiLimpiar(e, res[e.id] || {}) }));
    fiPintar(`Pensando… ${Math.min(k + FI_TANDA, pend.length)} de ${pend.length}`);
  }
  _fi.corriendo = false;
  fiFin(pend.length);
};
// Al terminar: cuántas llegaron y, si faltan, «Reintentar los que faltan».
function fiFin(total) {
  const con = _fi.filas.filter(f => Object.keys(f.propuesta).length).length;
  const faltan = _fi.filas.length - con;
  fiPintar(_fi.parar ? `Detenido: ${con} de ${total} con sugerencia.` : `Listo: ${con} sugerencias para revisar${faltan ? ` · ${faltan} sin sugerencia` : ''}.`);
  const p = document.querySelector('[data-fi-parar]');
  if (faltan && !_fi.parar) {
    if (p) { p.disabled = false; p.removeAttribute('data-fi-parar'); p.setAttribute('data-fi-reintentar', ''); p.textContent = `Reintentar los que faltan (${faltan})`; p.onclick = () => fiReintentar(); }
  } else if (p) p.remove();
}
window.fiReintentar = async () => {
  if (_fi.corriendo) return;
  const b = document.querySelector('[data-fi-reintentar]');
  if (b) { b.disabled = true; b.textContent = 'Pidiendo otra vez…'; }
  _fi.corriendo = true; _fi.parar = false;
  const idx = _fi.filas.map((f, i) => (Object.keys(f.propuesta).length ? -1 : i)).filter(i => i >= 0);
  for (let k = 0; k < idx.length; k += 3) {
    const grupo = idx.slice(k, k + 3);
    const res = await fiPedirConReintento(grupo.map(i => _fi.filas[i].e)).catch(() => ({}));
    if (!document.getElementById('fi-filas')) { _fi.corriendo = false; return; }
    grupo.forEach(i => { const f = _fi.filas[i]; const pr = fiLimpiar(f.e, res[f.e.id] || {}); if (Object.keys(pr).length) f.propuesta = pr; });
    fiPintar(`Pidiendo otra vez… ${Math.min(k + 3, idx.length)} de ${idx.length}`);
  }
  _fi.corriendo = false;
  const btn = document.querySelector('[data-fi-reintentar]');
  if (btn) btn.setAttribute('data-fi-parar', '');
  fiFin(_fi.filas.length);
};
window.fiParar = () => { _fi.parar = true; const p = document.querySelector('[data-fi-parar]'); if (p) { p.disabled = true; p.textContent = 'Deteniendo…'; } };

window.fiGuardar = async () => {
  const lineas = (t) => String(t || '').split('\n').map(x => x.trim().replace(/\.$/, '')).filter(Boolean);
  const marcadas = _fi.filas.map((f, i) => ({ f, i })).filter(({ i }) => { const c = document.querySelector(`[data-fi-marca="${i}"]`); return c && c.checked; });
  if (!marcadas.length) return toast('No hay nada marcado para guardar');
  const g = document.querySelector('[data-fi-guardar]'); if (g) { g.disabled = true; g.textContent = 'Guardando…'; }
  let ok = 0, mal = 0;
  for (const { f, i } of marcadas) {
    // Se vuelve a mirar la ficha actual: solo se llena lo que SIGUE vacío.
    const e = (_ent.ejercicios || []).find(x => x.id === f.e.id) || f.e;
    const falta = fiFalta(e), o = {};
    const pat = document.querySelector(`[data-fi-patron="${i}"]`);
    if (falta.includes('patron') && pat && pat.value) o.patron = pat.value;
    if (falta.includes('musculos') && f.propuesta.musculos_primarios) { o.musculos_primarios = f.propuesta.musculos_primarios; if (!(e.musculos_secundarios || []).length) o.musculos_secundarios = f.propuesta.musculos_secundarios || []; }
    const cl = document.querySelector(`[data-fi-claves="${i}"]`);
    if (falta.includes('claves') && cl && lineas(cl.value).length) o.claves_tecnicas = lineas(cl.value).slice(0, 5);
    const er = document.querySelector(`[data-fi-errores="${i}"]`);
    if (falta.includes('errores') && er && lineas(er.value).length) o.errores_tecnicos = lineas(er.value).slice(0, 5);
    if (falta.includes('articulaciones') && f.propuesta.articulaciones) o.articulaciones = f.propuesta.articulaciones;
    if (f.propuesta.cualidades && !(e.cualidades || []).length) o.cualidades = f.propuesta.cualidades;
    if (!Object.keys(o).length) continue;
    const { error } = await sb.from('ejercicios').update(o).eq('id', e.id);
    if (error) { mal++; continue; }
    Object.assign(e, o); ok++;
  }
  closeModal();
  toast(mal ? `Guardé ${ok} fichas; ${mal} no se pudieron guardar` : `Guardé ${ok} ${ok === 1 ? 'ficha' : 'fichas'}`);
  if (typeof entPintarListaGaleria === 'function') entPintarListaGaleria();
};
