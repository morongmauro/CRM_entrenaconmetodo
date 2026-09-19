// =====================================================
// CRM EntrenaConMétodo · MÓDULO CENTRO DE APRENDIZAJE
// =====================================================
// Qué contenido del Centro de Recursos ha visto CADA CLIENTE, y quién ha
// visto CADA CONTENIDO. Las dos direcciones de la misma pregunta.
//
// Hasta ahora esto solo existía cliente por cliente, dentro de su ficha:
// para saber quién no ha abierto las cápsulas había que entrar a doce
// fichas y acordarse. Aquí está de una vez, y desde los dos lados:
//
//   Por cliente   — una fila por persona: onboarding, guía, cápsulas y
//                   podcast, con su porcentaje y su última señal de vida.
//                   Se despliega y muestra pieza por pieza qué vio y qué
//                   le falta, con un botón para copiar lo que le falta y
//                   pegárselo por chat.
//   Por contenido — una fila por pieza publicada: cuántos la vieron, y
//                   quiénes NO. Es la vista para decidir qué recordar esta
//                   semana: si el 80% no abrió una cápsula, el problema es
//                   la cápsula, no el cliente.
//   Matriz        — la cuadrícula completa, clientes × contenido. Para
//                   verlo todo de un golpe y para exportarlo.
//
// ─── DE DÓNDE SALEN LOS DATOS ───────────────────────────────────────
// De la vista `reading_state` del Supabase del Centro de Recursos, que es
// lo que ya lee app.js (`cargarLecturasCentro` / `fetchLecturasCentro`).
// Aquí NO se consulta nada nuevo: se reusa la misma carga, que se pide una
// sola vez por sesión y queda en cache. El botón ↻ la vacía.
//
// Los catálogos (qué hay publicado) viven en app.js, junto a la carga:
// CENTRO_HUB_SECCIONES, CENTRO_GUIA, CENTRO_CAPSULAS y CENTRO_PODCASTS.
// Si publicas algo nuevo en el otro repo, se añade allí.
//
// ─── CÓMO SE INSTALA ────────────────────────────────────────────────
// Igual que Entrenamiento y Composición: se auto-registra en el router y
// clona su propio botón en la barra. En index.html, DESPUÉS de app.js:
//     <script src="/centro-aprendizaje.js"></script>
//
// ─── LO QUE ESTE MÓDULO NO PUEDE SABER ──────────────────────────────
// El centro registra la lectura con el NOMBRE que el cliente escribió al
// entrar. Si escribió "Juan" y en el CRM está como "Juan Sebastián
// Mariño", aquí aparece como si no hubiera abierto nada. Por eso la
// pestaña "Por cliente" avisa cuando hay lecturas cuyo nombre no cuadra
// con ningún cliente: casi siempre es eso, no un cliente inactivo.
// =====================================================

const _ap = {
  tab: 'clientes',      // clientes | contenido | matriz
  q: '',                // búsqueda por nombre
  soloActivos: true,
  abierto: null,        // id del cliente desplegado
  bloque: 'todo',       // todo | hub | guia | capsula | podcast (filtro de contenido)
  cargando: false,
  datos: null,          // [{ cliente, lec }]
  huerfanos: [],        // nombres del centro que no cuadran con ningún cliente
};

// Los cuatro bloques de contenido, con su catálogo y sus llaves.
function apBloques() {
  return [
    { k: 'hub',     label: 'Onboarding', icono: '🚀',
      catalogo: (typeof CENTRO_HUB_SECCIONES !== 'undefined' ? CENTRO_HUB_SECCIONES : [])
        .map(([id, title]) => ({ id, title, cat: 'Onboarding' })),
      lee: (lec) => (lec.hub || []).map(id => ({ id, vista: true })) },
    { k: 'guia',    label: 'Guía de alimentación', icono: '📖',
      catalogo: typeof CENTRO_GUIA !== 'undefined' ? CENTRO_GUIA : [],
      lee: (lec) => lec.guiaDetalle || [] },
    { k: 'capsula', label: 'Cápsulas', icono: '🖼️',
      catalogo: typeof CENTRO_CAPSULAS !== 'undefined' ? CENTRO_CAPSULAS : [],
      lee: (lec) => lec.capsulas || [] },
    { k: 'podcast', label: 'Podcast', icono: '🎧',
      catalogo: typeof CENTRO_PODCASTS !== 'undefined' ? CENTRO_PODCASTS : [],
      lee: (lec) => lec.podcastDetalle || [] },
  ];
}

// Qué vio un cliente de un bloque: {vistas, total, pct, ids}
function apAvanceBloque(lec, b) {
  const leido = b.lee(lec);
  const ids = new Set(leido.filter(x => x.vista !== false).map(x => x.id));
  const total = b.catalogo.length;
  const vistas = b.catalogo.filter(c => ids.has(c.id)).length;
  return { vistas, total, pct: total ? Math.round((vistas / total) * 100) : 0, ids };
}

// El avance global de un cliente: todas las piezas publicadas sobre el total.
function apAvanceTotal(lec) {
  const bs = apBloques();
  let v = 0, t = 0;
  for (const b of bs) { const a = apAvanceBloque(lec, b); v += a.vistas; t += a.total; }
  return { vistas: v, total: t, pct: t ? Math.round((v / t) * 100) : 0 };
}

// ── Carga ──────────────────────────────────────────────────────────────
// Una sola petición al centro (la de app.js, cacheada) y el cruce con los
// clientes del CRM. `fetchLecturasCentro` no vuelve a pedir nada: filtra
// sobre las filas que ya están en memoria.
async function apCargar() {
  _ap.cargando = true;
  try {
    const todos = await db.clientes.list();
    const filas = await cargarLecturasCentro();
    if (!filas) { _ap.datos = null; return; }
    const datos = [];
    for (const c of todos) {
      const lec = await fetchLecturasCentro(c.nombre);
      if (lec) datos.push({ cliente: c, lec });
    }
    _ap.datos = datos;

    // Nombres que el centro registró y que no cuadran con ningún cliente:
    // casi siempre es alguien que escribió su nombre distinto al entrar.
    const conocidos = new Set(todos.map(c => normalizeName(c.nombre)));
    const vistos = new Map();
    for (const f of filas) {
      const n = normalizeName(f.client_name);
      if (!n || conocidos.has(n)) continue;
      vistos.set(n, (vistos.get(n) || 0) + 1);
    }
    _ap.huerfanos = [...vistos.entries()]
      .map(([nombre, piezas]) => ({ nombre, piezas }))
      .sort((a, b) => b.piezas - a.piezas);
  } finally {
    _ap.cargando = false;
  }
}

// Los clientes que se están mirando, ya filtrados.
function apFiltrados() {
  const q = normalizeName(_ap.q);
  return (_ap.datos || [])
    .filter(d => !_ap.soloActivos || d.cliente.estado === 'activo')
    .filter(d => !q || normalizeName(d.cliente.nombre).includes(q))
    .sort((a, b) => apAvanceTotal(a.lec).pct - apAvanceTotal(b.lec).pct
                 || a.cliente.nombre.localeCompare(b.cliente.nombre));
}

// ── Piezas de interfaz ─────────────────────────────────────────────────
function apBarra(pct, vistas, total) {
  const color = pct >= 100 ? '#0E8060' : pct >= 50 ? '#d97706' : pct > 0 ? '#94a3b8' : '#e2e8f0';
  return `<div class="flex items-center gap-2">
    <div class="flex-1 h-1.5 rounded-full overflow-hidden bg-slate-100" style="min-width:50px">
      <div style="width:${Math.min(100, pct)}%;height:100%;background:${color};border-radius:999px"></div>
    </div>
    <span class="text-[11px] font-semibold whitespace-nowrap ${pct >= 100 ? 'text-emerald-700' : pct > 0 ? 'text-slate-600' : 'text-slate-400'}">${vistas}/${total}</span>
  </div>`;
}

function apPunto(vista) {
  return `<span class="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${vista ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-300'}">${vista ? '✓' : '○'}</span>`;
}

// ── Pestaña: POR CLIENTE ───────────────────────────────────────────────
function apVistaClientes() {
  const lista = apFiltrados();
  if (!lista.length) {
    return `<div class="card text-sm text-slate-500">Ningún cliente coincide con el filtro.</div>`;
  }
  const bs = apBloques();

  const filas = lista.map(({ cliente, lec }) => {
    const tot = apAvanceTotal(lec);
    const abierto = _ap.abierto === cliente.id;
    const avances = bs.map(b => ({ b, a: apAvanceBloque(lec, b) }));

    const detalle = !abierto ? '' : `
      <tr><td colspan="7" class="p-0">
        <div class="bg-slate-50 p-3">
          ${avances.map(({ b, a }) => {
            const pend = b.catalogo.filter(c => !a.ids.has(c.id));
            return `
            <div class="mb-3">
              <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                ${b.icono} ${escapeHtml(b.label)} · ${a.vistas} de ${a.total}
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                ${b.catalogo.map(c => `
                  <div class="flex items-center gap-2 text-xs py-0.5">
                    ${apPunto(a.ids.has(c.id))}
                    <span class="flex-1 min-w-0 truncate ${a.ids.has(c.id) ? 'text-slate-700' : 'text-slate-400'}" title="${escapeHtml(c.title)}">${escapeHtml(c.title)}</span>
                  </div>`).join('')}
              </div>
              ${pend.length ? `
                <div class="text-[11px] text-slate-500 mt-1.5">
                  Le faltan <strong>${pend.length}</strong>.
                  <button type="button" class="tag ml-1" style="background:#e0f2fe;color:#075985"
                    onclick="apCopiarPendientes('${cliente.id}','${b.k}')">copiar para el chat</button>
                </div>`
              : `<div class="text-[11px] text-emerald-700 mt-1.5">Lo vio todo ✓</div>`}
            </div>`;
          }).join('')}
          <div class="flex flex-wrap gap-2 pt-1">
            <button class="btn btn-secondary btn-sm" onclick="verCliente('${cliente.id}')">Abrir su ficha</button>
            <button class="btn btn-secondary btn-sm" onclick="apCopiarPendientes('${cliente.id}','todo')">Copiar TODO lo que le falta</button>
          </div>
        </div>
      </td></tr>`;

    return `
      <tr class="cursor-pointer hover:bg-slate-50" onclick="apAbrir('${cliente.id}')">
        <td class="py-2">
          <div class="font-semibold text-slate-800">${escapeHtml(cliente.nombre)}</div>
          <div class="text-[11px] text-slate-400">
            ${cliente.estado === 'activo' ? 'Activo' : cliente.estado === 'pausa' ? 'En pausa' : 'Finalizado'}
            ${lec.ultima ? ` · última señal ${fmt.fechaCorta(lec.ultima)}` : lec.piezas ? '' : ' · nunca abrió el centro'}
          </div>
        </td>
        ${avances.map(({ a }) => `<td class="py-2 px-1" style="min-width:90px">${apBarra(a.pct, a.vistas, a.total)}</td>`).join('')}
        <td class="py-2 text-right whitespace-nowrap">
          <span class="font-bold ${tot.pct >= 70 ? 'text-emerald-600' : tot.pct >= 30 ? 'text-amber-600' : 'text-slate-400'}">${tot.pct}%</span>
          <div class="text-[11px] text-slate-400">${tot.vistas}/${tot.total}</div>
        </td>
        <td class="py-2 text-right text-slate-300 text-xs">${_ap.abierto === cliente.id ? '▲' : '▼'}</td>
      </tr>
      ${detalle}`;
  }).join('');

  return `
    <div class="card">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-[11px] text-slate-400 uppercase tracking-wide">
              <th class="text-left font-semibold py-1">Cliente</th>
              ${bs.map(b => `<th class="text-left font-semibold py-1 px-1">${b.icono} ${escapeHtml(b.label)}</th>`).join('')}
              <th class="text-right font-semibold py-1">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
      <div class="text-[11px] text-slate-400 mt-2">
        Toca una fila para ver pieza por pieza. Ordenado por quien menos ha visto: arriba está a quien hay que empujar.
      </div>
    </div>`;
}

// ── Pestaña: POR CONTENIDO ─────────────────────────────────────────────
// La misma pregunta al revés: de cada pieza publicada, quién la vio y
// quién no. Es lo que sirve para decidir qué recordar esta semana.
function apVistaContenido() {
  const lista = apFiltrados();
  if (!lista.length) return `<div class="card text-sm text-slate-500">Ningún cliente coincide con el filtro.</div>`;
  const total = lista.length;
  const bs = apBloques().filter(b => _ap.bloque === 'todo' || _ap.bloque === b.k);

  const bloques = bs.map(b => {
    const avances = lista.map(d => ({ nombre: d.cliente.nombre, ids: apAvanceBloque(d.lec, b).ids }));
    const piezas = b.catalogo.map(c => {
      const vieron = avances.filter(a => a.ids.has(c.id)).map(a => a.nombre);
      const faltan = avances.filter(a => !a.ids.has(c.id)).map(a => a.nombre);
      return { ...c, vieron, faltan, pct: total ? Math.round((vieron.length / total) * 100) : 0 };
    }).sort((a, b2) => a.pct - b2.pct);

    const cats = [];
    piezas.forEach(p => {
      const g = cats.find(x => x.cat === p.cat);
      if (g) g.items.push(p); else cats.push({ cat: p.cat, items: [p] });
    });

    return `
      <div class="card mb-3">
        <div class="font-bold text-slate-900 text-sm">${b.icono} ${escapeHtml(b.label)}</div>
        <div class="text-xs text-slate-500 mb-3 mt-0.5">
          ${b.catalogo.length} piezas publicadas · sobre ${total} ${total === 1 ? 'cliente' : 'clientes'} del filtro. Lo menos visto va primero.
        </div>
        ${cats.map(g => `
          ${cats.length > 1 ? `<div class="text-[10px] text-slate-400 uppercase tracking-wide mt-2 mb-1">${escapeHtml(g.cat)}</div>` : ''}
          ${g.items.map(p => `
            <div class="py-1.5" style="border-bottom:1px solid #f1f5f9">
              <div class="flex items-baseline justify-between gap-2">
                <span class="text-sm text-slate-800 truncate" title="${escapeHtml(p.title)}">${escapeHtml(p.title)}</span>
                <span class="text-sm font-bold whitespace-nowrap ${p.pct >= 70 ? 'text-emerald-600' : p.pct >= 30 ? 'text-amber-600' : 'text-slate-400'}">${p.vieron.length}/${total}</span>
              </div>
              <div class="h-1.5 rounded-full mt-1 overflow-hidden bg-slate-100">
                <div style="width:${p.pct}%;height:100%;background:${p.pct >= 70 ? '#0E8060' : p.pct >= 30 ? '#d97706' : '#94a3b8'};border-radius:999px"></div>
              </div>
              ${p.faltan.length ? `
                <div class="text-[11px] text-slate-400 mt-0.5">
                  No la ${p.faltan.length === 1 ? 'ha visto' : 'han visto'}: <span class="text-slate-500">${escapeHtml(p.faltan.slice(0, 8).join(', '))}${p.faltan.length > 8 ? ` y ${p.faltan.length - 8} más` : ''}</span>
                </div>`
              : `<div class="text-[11px] text-emerald-700 mt-0.5">La vieron todos ✓</div>`}
            </div>`).join('')}
        `).join('')}
      </div>`;
  }).join('');

  return bloques;
}

// ── Pestaña: MATRIZ ────────────────────────────────────────────────────
// Todo de un golpe. Con muchos clientes y 60 piezas no cabe en pantalla,
// así que va con scroll horizontal y la primera columna fija.
function apVistaMatriz() {
  const lista = apFiltrados();
  if (!lista.length) return `<div class="card text-sm text-slate-500">Ningún cliente coincide con el filtro.</div>`;
  const bs = apBloques().filter(b => _ap.bloque === 'todo' || _ap.bloque === b.k);
  const piezas = bs.flatMap(b => b.catalogo.map(c => ({ ...c, bloque: b })));

  return `
    <div class="card">
      <div class="overflow-x-auto">
        <table class="text-xs" style="border-collapse:separate;border-spacing:0">
          <thead>
            <tr>
              <th class="text-left font-semibold text-slate-500 py-1 pr-3 sticky left-0 bg-white" style="z-index:2">Cliente</th>
              ${piezas.map(p => `
                <th class="font-normal text-slate-400 px-0.5" style="height:130px;white-space:nowrap">
                  <div style="transform:rotate(-60deg);transform-origin:left bottom;width:18px">
                    <span title="${escapeHtml(p.bloque.label + ' · ' + p.title)}">${escapeHtml(p.title.length > 26 ? p.title.slice(0, 26) + '…' : p.title)}</span>
                  </div>
                </th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${lista.map(({ cliente, lec }) => {
              const ids = new Set();
              bs.forEach(b => apAvanceBloque(lec, b).ids.forEach(i => ids.add(i)));
              return `
              <tr>
                <td class="py-1 pr-3 sticky left-0 bg-white whitespace-nowrap font-medium text-slate-700" style="z-index:1">${escapeHtml(cliente.nombre)}</td>
                ${piezas.map(p => `<td class="text-center px-0.5">${apPunto(ids.has(p.id))}</td>`).join('')}
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="flex items-center justify-between gap-2 mt-2">
        <div class="text-[11px] text-slate-400">${piezas.length} piezas × ${lista.length} clientes. Se desliza a los lados.</div>
        <button class="btn btn-secondary btn-sm" onclick="apExportarCSV()">⬇ Exportar CSV</button>
      </div>
    </div>`;
}

// ── La vista ───────────────────────────────────────────────────────────
routes.aprendizaje = async () => {
  if (!_ap.datos && !_ap.cargando) {
    view.innerHTML = `<div class="card">Consultando el Centro de Recursos…</div>`;
    await apCargar();
  }

  const cabecera = `
    <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <h2 class="text-lg font-bold text-slate-900">📚 Centro de aprendizaje</h2>
        <p class="text-xs text-slate-500">Qué contenido del Centro de Recursos ha visto cada cliente. Se registra solo cuando abren cada pieza.</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <input type="search" class="text-sm !w-auto" placeholder="Buscar cliente…" value="${escapeHtml(_ap.q)}"
               oninput="apBuscar(this.value)">
        <label class="flex items-center gap-1.5 text-xs text-slate-600 whitespace-nowrap">
          <input type="checkbox" ${_ap.soloActivos ? 'checked' : ''} onchange="apSoloActivos(this.checked)"> Solo activos
        </label>
        <button class="btn btn-secondary btn-sm" onclick="apRefrescar()" title="Volver a consultar el centro">🔄 Actualizar</button>
      </div>
    </div>`;

  if (_ap.datos === null) {
    view.innerHTML = `${cabecera}
      <div class="card border-l-4 border-amber-400">
        <div class="font-bold text-slate-800 mb-1">No pude consultar el Centro de Recursos</div>
        <p class="text-sm text-slate-600">Puede ser algo temporal de la conexión. Vuelve a intentarlo en un momento.</p>
        <button class="btn btn-primary btn-sm mt-2" onclick="apRefrescar()">Reintentar</button>
      </div>`;
    return;
  }

  const lista = apFiltrados();
  const conAlgo = lista.filter(d => apAvanceTotal(d.lec).vistas > 0).length;
  const sinNada = lista.filter(d => apAvanceTotal(d.lec).vistas === 0);
  const promedio = lista.length
    ? Math.round(lista.reduce((s, d) => s + apAvanceTotal(d.lec).pct, 0) / lista.length) : 0;
  const totalPiezas = lista.length ? apAvanceTotal(lista[0].lec).total : 0;

  const kpis = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
      <div class="card !p-3">
        <div class="text-[11px] text-slate-400">Clientes en el filtro</div>
        <div class="text-xl font-bold text-slate-900">${lista.length}</div>
      </div>
      <div class="card !p-3">
        <div class="text-[11px] text-slate-400">Han abierto algo</div>
        <div class="text-xl font-bold ${conAlgo === lista.length ? 'text-emerald-600' : 'text-slate-900'}">${conAlgo}<span class="text-sm text-slate-400 font-normal">/${lista.length}</span></div>
      </div>
      <div class="card !p-3">
        <div class="text-[11px] text-slate-400">Avance promedio</div>
        <div class="text-xl font-bold text-slate-900">${promedio}<span class="text-sm text-slate-400 font-normal">%</span></div>
        <div class="text-[10px] text-slate-400">sobre ${totalPiezas} piezas publicadas</div>
      </div>
      <div class="card !p-3">
        <div class="text-[11px] text-slate-400">Sin abrir nada</div>
        <div class="text-xl font-bold ${sinNada.length ? 'text-amber-600' : 'text-emerald-600'}">${sinNada.length}</div>
        ${sinNada.length ? `<div class="text-[10px] text-slate-400 truncate" title="${escapeHtml(sinNada.map(d => d.cliente.nombre).join(', '))}">${escapeHtml(sinNada.slice(0, 3).map(d => d.cliente.nombre).join(', '))}${sinNada.length > 3 ? '…' : ''}</div>` : ''}
      </div>
    </div>`;

  // Aviso de nombres que no cuadran. Es la causa número uno de "aparece en
  // cero y yo sé que sí lo vio".
  const aviso = _ap.huerfanos.length ? `
    <div class="card border-l-4 border-amber-400 mb-3">
      <div class="font-bold text-slate-800 text-sm mb-1">⚠️ Hay lecturas a nombre de alguien que no está en el CRM</div>
      <p class="text-xs text-slate-600">
        El centro guarda la lectura con el nombre que la persona escribió al entrar. Estos no cuadran con ningún cliente,
        así que su avance no se le está sumando a nadie:
        <strong>${escapeHtml(_ap.huerfanos.slice(0, 8).map(h => `${h.nombre} (${h.piezas})`).join(' · '))}</strong>${_ap.huerfanos.length > 8 ? ` y ${_ap.huerfanos.length - 8} más` : ''}.
      </p>
      <p class="text-[11px] text-slate-400 mt-1">Se arregla pidiéndole que entre al centro escribiendo su nombre igual que como está en el CRM.</p>
    </div>` : '';

  const tabs = [
    ['clientes', '👤 Por cliente'],
    ['contenido', '🎬 Por contenido'],
    ['matriz', '▦ Matriz'],
  ].map(([k, l]) => `<button class="px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${_ap.tab === k ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}" onclick="apTab('${k}')">${l}</button>`).join('');

  const filtroBloque = _ap.tab === 'clientes' ? '' : `
    <div class="flex flex-wrap items-center gap-1.5 mb-3">
      <span class="text-[11px] text-slate-400 uppercase tracking-wide">Bloque</span>
      ${[['todo', 'Todo'], ...apBloques().map(b => [b.k, `${b.icono} ${b.label}`])].map(([k, l]) =>
        `<button class="tag" style="${_ap.bloque === k ? 'background:#0E8060;color:#fff' : 'background:#f1f5f9;color:#475569'}" onclick="apBloque('${k}')">${escapeHtml(l)}</button>`).join('')}
    </div>`;

  view.innerHTML = `${cabecera}${kpis}${aviso}
    <div class="bg-slate-100 rounded-xl p-1 flex gap-1 mb-4 overflow-x-auto">${tabs}</div>
    ${filtroBloque}
    ${_ap.tab === 'clientes' ? apVistaClientes()
      : _ap.tab === 'contenido' ? apVistaContenido()
      : apVistaMatriz()}`;
};

// ── Acciones ───────────────────────────────────────────────────────────
window.apTab = (t) => { _ap.tab = t; routes.aprendizaje(); };
window.apBloque = (b) => { _ap.bloque = b; routes.aprendizaje(); };
window.apAbrir = (id) => { _ap.abierto = _ap.abierto === id ? null : id; routes.aprendizaje(); };
window.apSoloActivos = (v) => { _ap.soloActivos = v; routes.aprendizaje(); };

// La búsqueda no repinta en cada tecla (perdería el foco del input): repinta
// con un respiro y devuelve el cursor a su sitio.
let _apTimer = null;
window.apBuscar = (v) => {
  _ap.q = v;
  clearTimeout(_apTimer);
  _apTimer = setTimeout(async () => {
    await routes.aprendizaje();
    const inp = $('#view input[type="search"]');
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }, 250);
};

window.apRefrescar = async () => {
  _centroLecturas = null;   // vacía la cache de app.js
  _ap.datos = null;
  await routes.aprendizaje();
};

// Lo que le falta, en texto plano y listo para pegar por WhatsApp.
window.apCopiarPendientes = async (clienteId, bloqueK) => {
  const d = (_ap.datos || []).find(x => x.cliente.id === clienteId);
  if (!d) return;
  const bs = apBloques().filter(b => bloqueK === 'todo' || b.k === bloqueK);
  const partes = [];
  for (const b of bs) {
    const a = apAvanceBloque(d.lec, b);
    const pend = b.catalogo.filter(c => !a.ids.has(c.id));
    if (pend.length) partes.push(`${b.icono} ${b.label}:\n` + pend.map(c => `• ${c.title}`).join('\n'));
  }
  const texto = partes.length
    ? `Te falta por ver en el Centro de Recursos:\n\n${partes.join('\n\n')}`
    : 'Ya vio todo el material publicado 🎉';
  try {
    await navigator.clipboard.writeText(texto);
    toast('📋 Copiado');
  } catch (e) {
    // Sin permiso de portapapeles (Safari en http, por ejemplo): se muestra
    // para copiar a mano en vez de dejar al coach sin nada.
    openModal(`<div class="p-5">
      <h3 class="font-bold text-slate-900 mb-2">Lo que le falta a ${escapeHtml(d.cliente.nombre)}</h3>
      <textarea class="w-full text-sm" rows="12" readonly>${escapeHtml(texto)}</textarea>
    </div>`);
  }
};

// Exporta la matriz tal cual se ve: una fila por cliente, una columna por
// pieza. Se abre en Excel o en Sheets sin tocar nada.
window.apExportarCSV = () => {
  const lista = apFiltrados();
  const bs = apBloques().filter(b => _ap.bloque === 'todo' || _ap.bloque === b.k);
  const piezas = bs.flatMap(b => b.catalogo.map(c => ({ ...c, bloque: b.label })));
  const esc = (s) => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
  const filas = [
    ['Cliente', 'Estado', 'Avance %', ...piezas.map(p => `${p.bloque} · ${p.title}`)].map(esc).join(','),
    ...lista.map(({ cliente, lec }) => {
      const ids = new Set();
      bs.forEach(b => apAvanceBloque(lec, b).ids.forEach(i => ids.add(i)));
      return [cliente.nombre, cliente.estado, apAvanceTotal(lec).pct,
        ...piezas.map(p => (ids.has(p.id) ? 'visto' : ''))].map(esc).join(',');
    }),
  ].join('\n');
  // BOM para que Excel no se coma las tildes.
  const blob = new Blob(['﻿' + filas], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `centro-aprendizaje-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('⬇ CSV descargado');
};

// Atajo desde la ficha del cliente: abre el módulo con esa persona ya
// desplegada.
window.verAprendizajeCliente = async (clienteId) => {
  _ap.abierto = clienteId;
  _ap.tab = 'clientes';
  _ap.soloActivos = false;   // que no desaparezca si está en pausa
  closeModal();
  navigate('aprendizaje');
};

// =====================================================
// REGISTRO EN EL CRM
// =====================================================
(function addAprendizajeNav() {
  try {
    const anchor = document.querySelector('.nav-item');
    if (!anchor || document.querySelector('.nav-item[data-view="aprendizaje"]')) return;
    const btn = anchor.cloneNode(true);
    btn.dataset.view = 'aprendizaje';
    btn.classList.remove('active');
    btn.textContent = '📚 Aprendizaje';
    // Después de Nutrición y Composición: las tres son "cómo va el cliente".
    const composicion = document.querySelector('.nav-item[data-view="composicion"]');
    const nutricion = document.querySelector('.nav-item[data-view="nutricion"]');
    const negocio = document.querySelector('.nav-item[data-view="negocio"]');
    const ref = (composicion && composicion.nextSibling)
      || (nutricion && nutricion.nextSibling) || negocio || null;
    anchor.parentNode.insertBefore(btn, ref);
    btn.addEventListener('click', () => navigate('aprendizaje'));
  } catch (e) { /* si el shell cambia, no rompe nada */ }
})();
