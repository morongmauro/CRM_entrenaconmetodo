// =====================================================
// MESA DE TRABAJO EN 4 COLUMNAS · constructor de rutinas de un cliente
// =====================================================
// Con la mesa puesta, la rutina de un cliente y una pantalla ancha:
//   1. Galería y filtros (como siempre).
//   2. La rutina, con sus previews y tags.
//   3. Historial y notas del cliente, AL LADO de cada ejercicio: lo último
//      que hizo, si sube o está estancado, la sugerencia y lo que te escribió
//      sobre ese ejercicio en la app.
//   4. Alternativas, al lado de cada ejercicio: tarjetas con su video que se
//      deslizan de lado; «Usar» lo cambia en su mismo renglón. No salen las
//      que tienen «No le sirve» para este cliente (se dice cuántas se ocultan).
// Las columnas 3 y 4 se mueven junto con la rutina: cada cuadro queda a la
// altura de su ejercicio. El agente de rutinas pasa arriba, como un cuadro
// de escribir, y su conversación se abre a la derecha.
// En pantallas angostas la mesa sigue en 3 columnas, como antes.
//
// Carga DESPUÉS de entrenamiento.js, entreno-asistencia.js,
// entreno-alternativas.js, no-sirve.js y asistente-rutinas.js.
// =====================================================

const M4_DESDE = 1280;
const M4_MAX_ALT = 10;
const _m4 = { on: false, wrap: null, rutPadre: null, obs: [], notas: {}, cargandoNotas: {}, t: null, sinc: null };

function m4Puede() {
  return !!(typeof _ent !== 'undefined' && _ent.mesa && _ent.rutina && _ent.rutina.cliente_id
    && window.innerWidth >= M4_DESDE && !document.body.classList.contains('modo-movil'));
}

// Se llama al abrir el constructor, al poner o quitar la mesa y al cambiar
// el ancho de la ventana. Enciende, apaga o repinta.
window.m4Revisar = () => {
  const wrap = document.getElementById('cons-wrap');
  const grid = wrap && wrap.querySelector('.ent-mesa-grid');
  if (_m4.on && _m4.wrap !== wrap) m4Apagar();          // el constructor se volvió a pintar
  const quiere = !!(wrap && grid && document.getElementById('asi-panel') && m4Puede());
  if (quiere && !_m4.on) m4Encender(wrap, grid);
  else if (!quiere && _m4.on) m4Apagar();
  else if (quiere) m4Pedir();
};

function m4Encender(wrap, grid) {
  _m4.on = true;
  _m4.wrap = wrap;
  wrap.classList.add('ent-mesa4');
  if (typeof colSoltar === 'function') colSoltar(grid);   // las líneas de ancho se vuelven a poner con 4 columnas

  const asi = document.getElementById('asi-panel');
  if (!document.getElementById('m4-hist')) asi.insertAdjacentHTML('beforeend', '<div id="m4-hist" class="m4-lienzo"></div>');
  if (!document.getElementById('cons-col-alt')) {
    grid.insertAdjacentHTML('beforeend', '<div id="cons-col-alt" class="ent-col" data-m4-alt><div id="m4-alt" class="m4-lienzo"></div></div>');
  }
  // El agente, arriba de las columnas.
  const rut = document.getElementById('rut-panel');
  if (rut && rut.parentElement !== wrap) { _m4.rutPadre = rut.parentElement; wrap.insertBefore(rut, grid); }

  // Las columnas 3 y 4 siguen el desplazamiento de la rutina.
  const colR = document.getElementById('cons-col-rutina');
  const seguir = () => {
    cancelAnimationFrame(_m4.sinc);
    _m4.sinc = requestAnimationFrame(() => {
      [asi, document.getElementById('cons-col-alt')].forEach(c => { if (c) c.scrollTop = colR.scrollTop; });
    });
  };
  colR.addEventListener('scroll', seguir, { passive: true });
  const rueda = (e) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;            // de lado: el carrusel
    const caja = e.target.closest && e.target.closest('.m4-caja');
    if (caja && caja.scrollHeight > caja.clientHeight + 1) {
      const arriba = e.deltaY < 0 && caja.scrollTop > 0;
      const abajo = e.deltaY > 0 && caja.scrollTop + caja.clientHeight < caja.scrollHeight - 1;
      if (arriba || abajo) return;                                   // primero se lee el cuadro entero
    }
    e.preventDefault();
    colR.scrollTop += e.deltaY;
  };
  [asi, document.getElementById('cons-col-alt')].forEach(c => c && c.addEventListener('wheel', rueda, { passive: false }));
  _m4.obs.push(() => colR.removeEventListener('scroll', seguir));
  _m4.obs.push(() => [asi, document.getElementById('cons-col-alt')].forEach(c => c && c.removeEventListener('wheel', rueda)));

  // Repintar cuando cambia la rutina (alto de una fila, un ejercicio nuevo,
  // un «Más: RIR…» abierto) o llega el historial.
  const ro = new ResizeObserver(() => m4Pedir());
  const rutina = document.getElementById('cons-rutina');
  if (rutina) ro.observe(rutina);
  _m4.obs.push(() => ro.disconnect());
  const mo = new MutationObserver(() => m4Pedir());
  if (rutina) mo.observe(rutina, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
  const contenido = document.getElementById('asi-contenido');
  if (contenido) mo.observe(contenido, { childList: true, subtree: true });
  _m4.obs.push(() => mo.disconnect());

  m4CargarNotas(_ent.rutina.cliente_id).then(() => m4Pedir());
  m4Pintar();
}

function m4Apagar() {
  _m4.obs.splice(0).forEach(f => { try { f(); } catch (e) { /* ya no está */ } });
  const wrap = _m4.wrap;
  _m4.on = false;
  _m4.wrap = null;
  if (wrap && wrap.isConnected) {
    wrap.classList.remove('ent-mesa4');
    document.getElementById('cons-col-alt')?.remove();
    document.getElementById('m4-hist')?.remove();
    const rut = document.getElementById('rut-panel');
    const asi = document.getElementById('asi-panel');
    if (rut && asi && rut.parentElement !== asi) asi.prepend(rut);
    const grid = wrap.querySelector('.ent-mesa-grid');
    if (grid && typeof colSoltar === 'function') colSoltar(grid);
    if (asi) asi.scrollTop = 0;
  }
}

const m4Pedir = () => { clearTimeout(_m4.t); _m4.t = setTimeout(m4Pintar, 60); };

// Lo que el cliente escribió sobre cada ejercicio (nota al coach en la app).
async function m4CargarNotas(clienteId) {
  const k = String(clienteId || '');
  if (!k || _m4.notas[k]) return _m4.notas[k];
  if (_m4.cargandoNotas[k]) return _m4.cargandoNotas[k];
  _m4.cargandoNotas[k] = (async () => {
    const porEj = new Map();
    try {
      const { data } = await sb.from('notas_entreno').select('id, ejercicio_id, texto, created_at')
        .eq('cliente_id', clienteId).order('created_at', { ascending: false }).limit(300);
      (data || []).forEach(n => {
        if (!n.ejercicio_id || !n.texto) return;
        const l = porEj.get(String(n.ejercicio_id)) || [];
        if (l.length < 2) l.push(n);
        porEj.set(String(n.ejercicio_id), l);
      });
    } catch (e) { /* sin notas */ }
    _m4.notas[k] = porEj;
    delete _m4.cargandoNotas[k];
    return porEj;
  })();
  return _m4.cargandoNotas[k];
}

function m4NotasHTML(clienteId, ejercicioId) {
  const l = (_m4.notas[String(clienteId)] || new Map()).get(String(ejercicioId)) || [];
  return l.map(n => `
    <div class="m4-nota" data-m4-nota>
      <b>Nota del cliente · ${escapeHtml(typeof asiFechaCorta === 'function' ? asiFechaCorta(String(n.created_at).slice(0, 10)) : String(n.created_at).slice(0, 10))}</b>
      <div>«${escapeHtml(String(n.texto).slice(0, 220))}»</div>
    </div>`).join('');
}

function m4TarjetaAlt(re, x) {
  const e = x.e, n = entNombres(e), foto = entMiniatura(e);
  const video = typeof entTieneVideo === 'function' ? entTieneVideo(e) : !!foto;
  const fig = (!foto && typeof figuraMusculos === 'function')
    ? figuraMusculos({ primarios: e.musculos_primarios || [], secundarios: e.musculos_secundarios || [], mapa: entMapaMusculos(), alto: 54, leyenda: false, cara: 'frente' })
    : '';
  return `
    <div class="m4-alt" data-m4-alt-ej="${escapeHtml(String(e.id))}">
      <button type="button" class="m4-alt-video" ${video ? `onclick="entVerVideoEj('${escapeHtml(String(e.id))}')" title="Ver el video"` : `onclick="entVerFicha('${escapeHtml(String(e.id))}')" title="Ver la ficha"`}>
        ${foto ? `<img src="${escapeHtml(foto)}" alt="" loading="lazy" draggable="false">` : `<span class="m4-alt-fig">${fig}</span>`}
        ${video ? '<span class="m4-alt-play" aria-hidden="true">▶</span>' : ''}
      </button>
      <div class="m4-alt-nombre" title="${escapeHtml(n.grande)}">${escapeHtml(n.grande)}</div>
      <div class="m4-alt-pie">
        <span class="m4-alt-por">${escapeHtml(x.porque[0] || 'Parecido')}</span>
        <button type="button" class="btn btn-primary btn-sm m4-usar" data-m4-usar onclick="m4Usar('${escapeHtml(String(re.id))}', '${escapeHtml(String(e.id))}')">Usar</button>
      </div>
    </div>`;
}

function m4AltHTML(re, enRutina, clienteId) {
  const src = re.ejercicios || {};
  const todas = altCandidatos(src, _ent.ejercicios || []).filter(x => !enRutina.has(x.e.id));
  const noSirve = (x) => !!(window.nsTiene && nsTiene(clienteId, x.e.id));
  const ver = todas.filter(x => !noSirve(x));
  const ocultas = todas.length - ver.length;
  const nombre = entNombres(src).grande;
  return `
    <div class="m4-cab">
      <span class="m4-cab-t" title="En vez de «${escapeHtml(nombre)}»">En vez de «${escapeHtml(nombre)}»</span>
      <button type="button" class="m4-todas" onclick="entAlternativas('${escapeHtml(String(re.id))}')">Ver todas (${ver.length}) ›</button>
    </div>
    ${ver.length
      ? `<div class="m4-carrusel" data-m4-carrusel>${ver.slice(0, M4_MAX_ALT).map(x => m4TarjetaAlt(re, x)).join('')}</div>`
      : `<div class="m4-vacio">Sin parecidos en la galería. <button type="button" class="m4-todas" onclick="entAlternativas('${escapeHtml(String(re.id))}')">Buscar en toda la galería ›</button></div>`}
    ${ocultas ? `<div class="m4-ocultas" data-m4-ocultas>Ocultas ${ocultas} que no le sirven</div>` : ''}`;
}

function m4Pintar() {
  if (!_m4.on) return;
  const colR = document.getElementById('cons-col-rutina');
  const hist = document.getElementById('m4-hist');
  const alt = document.getElementById('m4-alt');
  const rutina = document.getElementById('cons-rutina');
  const r = _ent.rutina;
  if (!colR || !hist || !alt || !rutina || !r) return;
  const base = colR.getBoundingClientRect().top - colR.scrollTop;
  const cid = r.cliente_id;
  const enRutina = new Set(r.ejercicios.map(x => x.ejercicio_id));
  const asi = {};
  document.querySelectorAll('#asi-contenido [data-asi-ej]').forEach(e => { if (!asi[e.dataset.asiEj]) asi[e.dataset.asiEj] = e.innerHTML; });
  const leyendo = !document.querySelector('#asi-contenido [data-asi-ej]');

  // Lo que ya se movió de lado en cada carrusel se conserva al repintar.
  const lado = {};
  alt.querySelectorAll('[data-m4-fila]').forEach(c => { const k = c.querySelector('[data-m4-carrusel]'); if (k) lado[c.dataset.m4Fila] = k.scrollLeft; });

  let h = '', a = '';
  rutina.querySelectorAll('.ent-fila').forEach(f => {
    const re = r.ejercicios.find(x => String(x.id) === String(f.dataset.re));
    if (!re) return;
    const fr = f.getBoundingClientRect();
    const pos = `top:${Math.round(fr.top - base)}px;height:${Math.round(fr.height)}px`;
    const hist1 = asi[re.ejercicio_id] || `<div class="m4-vacio">${leyendo ? 'Leyendo su historial…' : 'Sin registros todavía.'}</div>`;
    h += `<div class="m4-caja" data-m4-fila="${escapeHtml(String(re.id))}" style="${pos}">${hist1}${m4NotasHTML(cid, re.ejercicio_id)}</div>`;
    a += `<div class="m4-caja m4-caja-alt" data-m4-fila="${escapeHtml(String(re.id))}" style="${pos}">${m4AltHTML(re, enRutina, cid)}</div>`;
  });
  const alto = Math.round(rutina.getBoundingClientRect().bottom - base + 24);
  const titulo = (t, s) => `<div class="m4-titulo"><span>${t}</span><span class="m4-titulo-s">${s}</span></div>`;
  hist.style.height = `${alto}px`;
  alt.style.height = `${alto}px`;
  hist.innerHTML = titulo('Historial y notas del cliente', 'junto a cada ejercicio') + h;
  alt.innerHTML = titulo('Alternativas', 'desliza para ver más') + a;
  alt.querySelectorAll('[data-m4-fila]').forEach(c => { const k = c.querySelector('[data-m4-carrusel]'); if (k && lado[c.dataset.m4Fila]) k.scrollLeft = lado[c.dataset.m4Fila]; });
  const asiCol = document.getElementById('asi-panel'), altCol = document.getElementById('cons-col-alt');
  if (asiCol) asiCol.scrollTop = colR.scrollTop;
  if (altCol) altCol.scrollTop = colR.scrollTop;
}

// «Usar»: el mismo «Sustituir» de la ventana de alternativas (mismo renglón,
// mismas series, reps, peso y descanso; pregunta si no le sirve).
window.m4Usar = (reId, ejercicioId) => {
  if (typeof altSustituir !== 'function' || typeof _alt === 'undefined') return;
  _alt.reId = reId;
  return altSustituir(ejercicioId);
};

window.addEventListener('resize', () => { if (document.getElementById('cons-wrap')) m4Revisar(); });
