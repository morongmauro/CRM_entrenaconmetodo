// ===== Utilidades =====
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const view = $('#view');
const modal = $('#modal');
const modalContent = $('#modal-content');
const toastEl = $('#toast');

const fmt = {
  fecha: (s) => s ? new Date(s + (s.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
  money: (n, m = 'USD') => `${m} ${Number(n || 0).toFixed(2)}`,
  hoy: () => new Date().toISOString().slice(0, 10),
  mesActual: () => new Date().toISOString().slice(0, 7),
  semanaISO: (d = new Date()) => {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  },
  diasEntre: (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000),
};

const api = {
  async get(url) { const r = await fetch(url); return r.json(); },
  async post(url, body) { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.json(); },
  async put(url, body) { const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.json(); },
  async del(url) { const r = await fetch(url, { method: 'DELETE' }); return r.json(); },
};

function toast(msg, ms = 2200) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.add('hidden'), ms);
}

function openModal(html) {
  modalContent.innerHTML = html;
  modal.classList.remove('hidden');
}
function closeModal() {
  modal.classList.add('hidden');
  modalContent.innerHTML = '';
}
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

function modalShell(title, bodyHTML, footerHTML = '') {
  return `
    <div class="p-5 border-b flex items-center justify-between">
      <h3 class="text-lg font-semibold">${title}</h3>
      <button class="btn btn-ghost" onclick="closeModal()">✕</button>
    </div>
    <div class="p-5">${bodyHTML}</div>
    ${footerHTML ? `<div class="p-4 border-t bg-slate-50 flex justify-end gap-2">${footerHTML}</div>` : ''}
  `;
}

window.closeModal = closeModal;

// ===== Router =====
const routes = {};
function navigate(name) {
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  (routes[name] || routes.dashboard)();
}
$$('.nav-btn').forEach(b => b.addEventListener('click', () => navigate(b.dataset.view)));

// ===== Dashboard =====
routes.dashboard = async () => {
  view.innerHTML = '<div class="card">Cargando…</div>';
  const d = await api.get('/api/dashboard');
  const cobrado = d.pagos_mes.cobrado || 0;
  const pendiente = d.pagos_mes.pendiente || 0;
  const total = cobrado + pendiente;
  const pct = total > 0 ? Math.round((cobrado / total) * 100) : 0;

  view.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
      <div class="card">
        <div class="text-xs text-slate-500">Clientes activos</div>
        <div class="text-3xl font-bold mt-1">${d.clientes_activos}</div>
      </div>
      <div class="card">
        <div class="text-xs text-slate-500">Cobrado este mes</div>
        <div class="text-2xl font-bold mt-1 text-emerald-600">${fmt.money(cobrado)}</div>
        <div class="text-xs text-slate-400 mt-1">${d.pagos_mes.num_pagados} pagos</div>
      </div>
      <div class="card">
        <div class="text-xs text-slate-500">Pendiente de cobro</div>
        <div class="text-2xl font-bold mt-1 text-amber-600">${fmt.money(pendiente)}</div>
        <div class="text-xs text-slate-400 mt-1">${d.pagos_mes.num_pendientes} pagos</div>
      </div>
      <div class="card">
        <div class="text-xs text-slate-500">Avance del mes</div>
        <div class="text-2xl font-bold mt-1">${pct}%</div>
        <div class="w-full bg-slate-200 rounded-full h-2 mt-2 overflow-hidden">
          <div class="bg-emerald-500 h-full" style="width:${pct}%"></div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="card">
        <h3 class="font-semibold mb-3 flex items-center gap-2">
          <span class="tag tag-red">!</span> Pagos vencidos
        </h3>
        ${d.vencidos.length === 0 ? '<p class="text-sm text-slate-500">Sin vencidos. 🎉</p>' : `
          <ul class="divide-y">
            ${d.vencidos.map(p => `
              <li class="py-2 flex justify-between items-center">
                <div>
                  <div class="font-medium">${p.cliente_nombre}</div>
                  <div class="text-xs text-slate-500">Esperado: ${fmt.fecha(p.fecha_esperada)} · hace ${Math.abs(fmt.diasEntre(p.fecha_esperada, fmt.hoy()))} días</div>
                </div>
                <div class="text-right">
                  <div class="font-semibold">${fmt.money(p.monto, p.moneda)}</div>
                  <button class="text-xs text-emerald-600 hover:underline" onclick="marcarPago(${p.id})">Marcar pagado</button>
                </div>
              </li>
            `).join('')}
          </ul>
        `}
      </div>

      <div class="card">
        <h3 class="font-semibold mb-3 flex items-center gap-2">
          <span class="tag tag-yellow">⏰</span> Próximos 7 días
        </h3>
        ${d.proximos_pagos.length === 0 ? '<p class="text-sm text-slate-500">Sin pagos próximos.</p>' : `
          <ul class="divide-y">
            ${d.proximos_pagos.map(p => `
              <li class="py-2 flex justify-between items-center">
                <div>
                  <div class="font-medium">${p.cliente_nombre}</div>
                  <div class="text-xs text-slate-500">${fmt.fecha(p.fecha_esperada)} · en ${fmt.diasEntre(fmt.hoy(), p.fecha_esperada)} días</div>
                </div>
                <div class="text-right">
                  <div class="font-semibold">${fmt.money(p.monto, p.moneda)}</div>
                  <button class="text-xs text-emerald-600 hover:underline" onclick="marcarPago(${p.id})">Marcar pagado</button>
                </div>
              </li>
            `).join('')}
          </ul>
        `}
      </div>

      <div class="card">
        <h3 class="font-semibold mb-3 flex items-center gap-2">
          <span class="tag tag-blue">📋</span> Pendientes abiertos
        </h3>
        ${d.pendientes_abiertos.length === 0 ? '<p class="text-sm text-slate-500">Sin pendientes abiertos.</p>' : `
          <ul class="divide-y">
            ${d.pendientes_abiertos.map(pe => `
              <li class="py-2 flex justify-between items-center gap-3">
                <div class="flex-1">
                  <div class="font-medium text-sm">${pe.descripcion}</div>
                  <div class="text-xs text-slate-500">${pe.cliente_nombre} · ${pe.fecha_limite ? 'Vence ' + fmt.fecha(pe.fecha_limite) : 'sin fecha'}</div>
                </div>
                <span class="tag ${pe.prioridad === 'alta' ? 'tag-red' : pe.prioridad === 'baja' ? 'tag-gray' : 'tag-yellow'}">${pe.prioridad}</span>
              </li>
            `).join('')}
          </ul>
        `}
      </div>

      <div class="card">
        <h3 class="font-semibold mb-3 flex items-center gap-2">
          <span class="tag tag-purple">🎯</span> Sesiones próximas
        </h3>
        ${d.sesiones_proximas.length === 0 ? '<p class="text-sm text-slate-500">Sin sesiones agendadas.</p>' : `
          <ul class="divide-y">
            ${d.sesiones_proximas.map(s => `
              <li class="py-2 flex justify-between items-center">
                <div>
                  <div class="font-medium">${s.cliente_nombre}</div>
                  <div class="text-xs text-slate-500">${fmt.fecha(s.fecha)}${s.hora ? ' · ' + s.hora : ''} · ${s.tema || 'sin tema'}</div>
                </div>
              </li>
            `).join('')}
          </ul>
        `}
      </div>
    </div>
  `;
};

window.marcarPago = async (id) => {
  await api.post(`/api/pagos/${id}/marcar-pagado`, { fecha_pago: fmt.hoy() });
  toast('Pago registrado');
  navigate('dashboard');
};

// ===== CLIENTES =====
routes.clientes = async () => {
  view.innerHTML = '<div class="card">Cargando…</div>';
  const clientes = await api.get('/api/clientes');
  view.innerHTML = `
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-xl font-bold">Clientes</h2>
      <button class="btn btn-primary" onclick="nuevoCliente()">+ Nuevo cliente</button>
    </div>
    <div class="card">
      <table>
        <thead>
          <tr>
            <th>Nombre</th><th>Plan</th><th>Monto</th><th>Día pago</th><th>Próximo pago</th><th>Pendientes</th><th>Estado</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${clientes.length === 0 ? '<tr><td colspan="8" class="text-center text-slate-500 py-6">Aún no hay clientes. Crea el primero.</td></tr>' : clientes.map(c => `
            <tr>
              <td><a class="font-medium text-emerald-700 hover:underline cursor-pointer" onclick="verCliente(${c.id})">${c.nombre}</a><div class="text-xs text-slate-500">${c.email || ''}</div></td>
              <td>${c.plan || '—'}</td>
              <td>${fmt.money(c.monto, c.moneda)}</td>
              <td>${c.dia_pago || '—'}</td>
              <td>${c.proximo_pago ? fmt.fecha(c.proximo_pago) : '—'}</td>
              <td>${c.pendientes_abiertos > 0 ? `<span class="tag tag-yellow">${c.pendientes_abiertos}</span>` : '—'}</td>
              <td><span class="tag ${c.estado === 'activo' ? 'tag-green' : 'tag-gray'}">${c.estado}</span></td>
              <td class="text-right">
                <button class="btn btn-ghost" onclick="editarCliente(${c.id})">Editar</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
};

function clienteForm(c = {}) {
  return `
    <div class="grid grid-cols-2 gap-3">
      <div class="col-span-2"><label>Nombre *</label><input id="f-nombre" value="${c.nombre || ''}" required></div>
      <div><label>Email</label><input id="f-email" type="email" value="${c.email || ''}"></div>
      <div><label>Teléfono</label><input id="f-telefono" value="${c.telefono || ''}"></div>
      <div><label>Plan</label><input id="f-plan" placeholder="Ej: Mensual Premium" value="${c.plan || ''}"></div>
      <div><label>Estado</label>
        <select id="f-estado">
          <option value="activo" ${c.estado === 'activo' ? 'selected' : ''}>Activo</option>
          <option value="pausa" ${c.estado === 'pausa' ? 'selected' : ''}>En pausa</option>
          <option value="finalizado" ${c.estado === 'finalizado' ? 'selected' : ''}>Finalizado</option>
        </select>
      </div>
      <div><label>Monto mensual</label><input id="f-monto" type="number" step="0.01" value="${c.monto || ''}"></div>
      <div><label>Moneda</label>
        <select id="f-moneda">
          ${['USD', 'COP', 'MXN', 'ARS', 'CLP', 'EUR', 'PEN'].map(m => `<option ${(c.moneda || 'USD') === m ? 'selected' : ''}>${m}</option>`).join('')}
        </select>
      </div>
      <div><label>Día de pago (1-31)</label><input id="f-dia" type="number" min="1" max="31" value="${c.dia_pago || ''}"></div>
      <div><label>Fecha inicio</label><input id="f-inicio" type="date" value="${c.fecha_inicio || fmt.hoy()}"></div>
      <div class="col-span-2"><label>Objetivo del cliente</label><textarea id="f-objetivo" rows="2">${c.objetivo || ''}</textarea></div>
      <div class="col-span-2"><label>Notas generales</label><textarea id="f-notas" rows="2">${c.notas || ''}</textarea></div>
    </div>
  `;
}

window.nuevoCliente = () => {
  openModal(modalShell('Nuevo cliente', clienteForm(),
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="guardarCliente()">Guardar</button>`));
};

window.editarCliente = async (id) => {
  const c = await api.get(`/api/clientes/${id}`);
  openModal(modalShell('Editar cliente', clienteForm(c),
    `<button class="btn btn-danger mr-auto" onclick="eliminarCliente(${id})">Eliminar</button>
     <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="guardarCliente(${id})">Guardar</button>`));
};

window.guardarCliente = async (id = null) => {
  const data = {
    nombre: $('#f-nombre').value.trim(),
    email: $('#f-email').value.trim(),
    telefono: $('#f-telefono').value.trim(),
    plan: $('#f-plan').value.trim(),
    monto: $('#f-monto').value,
    moneda: $('#f-moneda').value,
    dia_pago: $('#f-dia').value,
    fecha_inicio: $('#f-inicio').value,
    objetivo: $('#f-objetivo').value.trim(),
    estado: $('#f-estado').value,
    notas: $('#f-notas').value.trim(),
  };
  if (!data.nombre) { toast('Falta el nombre'); return; }
  if (id) await api.put(`/api/clientes/${id}`, data);
  else await api.post('/api/clientes', data);
  closeModal();
  toast('Guardado');
  navigate('clientes');
};

window.eliminarCliente = async (id) => {
  if (!confirm('¿Eliminar este cliente y todo su historial?')) return;
  await api.del(`/api/clientes/${id}`);
  closeModal();
  toast('Eliminado');
  navigate('clientes');
};

window.verCliente = async (id) => {
  const c = await api.get(`/api/clientes/${id}`);
  openModal(modalShell(c.nombre, `
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div><span class="text-slate-500">Plan:</span> ${c.plan || '—'}</div>
        <div><span class="text-slate-500">Monto:</span> ${fmt.money(c.monto, c.moneda)}</div>
        <div><span class="text-slate-500">Día pago:</span> ${c.dia_pago || '—'}</div>
        <div><span class="text-slate-500">Inicio:</span> ${fmt.fecha(c.fecha_inicio)}</div>
        <div class="col-span-2"><span class="text-slate-500">Objetivo:</span> ${c.objetivo || '—'}</div>
      </div>

      <div>
        <div class="flex justify-between items-center mb-1">
          <h4 class="font-semibold">Pendientes</h4>
          <button class="text-xs text-emerald-600 hover:underline" onclick="nuevoPendiente(${c.id})">+ Agregar</button>
        </div>
        ${c.pendientes.length === 0 ? '<p class="text-xs text-slate-500">Sin pendientes.</p>' :
          c.pendientes.map(pe => `
            <div class="flex items-center gap-2 py-1 text-sm">
              <input type="checkbox" ${pe.estado === 'completado' ? 'checked' : ''} onchange="togglePendiente(${pe.id}, ${c.id})">
              <span class="${pe.estado === 'completado' ? 'line-through text-slate-400' : ''}">${pe.descripcion}</span>
              ${pe.fecha_limite ? `<span class="text-xs text-slate-400">(${fmt.fecha(pe.fecha_limite)})</span>` : ''}
              <span class="tag ${pe.prioridad === 'alta' ? 'tag-red' : pe.prioridad === 'baja' ? 'tag-gray' : 'tag-yellow'}">${pe.prioridad}</span>
            </div>
          `).join('')}
      </div>

      <div>
        <div class="flex justify-between items-center mb-1">
          <h4 class="font-semibold">Seguimiento semanal</h4>
          <button class="text-xs text-emerald-600 hover:underline" onclick="nuevoSeguimiento(${c.id})">+ Agregar</button>
        </div>
        ${c.seguimientos.length === 0 ? '<p class="text-xs text-slate-500">Sin registros.</p>' :
          c.seguimientos.slice(0, 5).map(s => `
            <div class="border-l-2 border-emerald-400 pl-3 py-1 mb-2">
              <div class="text-xs text-slate-500">${s.semana} · ${fmt.fecha(s.fecha)} · adherencia ${s.adherencia ?? '—'}/10</div>
              <div class="text-sm">${s.avances || '—'}</div>
              ${s.notas ? `<div class="text-xs text-slate-500 mt-1">${s.notas}</div>` : ''}
            </div>
          `).join('')}
      </div>

      <div>
        <div class="flex justify-between items-center mb-1">
          <h4 class="font-semibold">Pagos</h4>
          <button class="text-xs text-emerald-600 hover:underline" onclick="nuevoPago(${c.id})">+ Agregar</button>
        </div>
        ${c.pagos.length === 0 ? '<p class="text-xs text-slate-500">Sin pagos.</p>' :
          `<table><thead><tr><th>Esperado</th><th>Pagado</th><th>Monto</th><th>Estado</th></tr></thead><tbody>
          ${c.pagos.slice(0, 6).map(p => `
            <tr>
              <td>${fmt.fecha(p.fecha_esperada)}</td>
              <td>${p.fecha_pago ? fmt.fecha(p.fecha_pago) : '—'}</td>
              <td>${fmt.money(p.monto, p.moneda)}</td>
              <td><span class="tag ${p.estado === 'pagado' ? 'tag-green' : 'tag-yellow'}">${p.estado}</span></td>
            </tr>
          `).join('')}</tbody></table>`}
      </div>

      <div>
        <div class="flex justify-between items-center mb-1">
          <h4 class="font-semibold">Métricas de progreso</h4>
          <button class="text-xs text-emerald-600 hover:underline" onclick="nuevaMetrica(${c.id})">+ Agregar</button>
        </div>
        ${c.metricas.length === 0 ? '<p class="text-xs text-slate-500">Sin métricas.</p>' :
          `<table><thead><tr><th>Fecha</th><th>Peso</th><th>Grasa%</th><th>Cintura</th><th>Cadera</th></tr></thead><tbody>
          ${c.metricas.slice(0, 6).map(m => `
            <tr>
              <td>${fmt.fecha(m.fecha)}</td>
              <td>${m.peso ?? '—'}</td>
              <td>${m.grasa ?? '—'}</td>
              <td>${m.cintura ?? '—'}</td>
              <td>${m.cadera ?? '—'}</td>
            </tr>
          `).join('')}</tbody></table>`}
      </div>
    </div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
      <button class="btn btn-primary" onclick="editarCliente(${c.id})">Editar cliente</button>`));
};

// ===== PAGOS =====
routes.pagos = async () => {
  view.innerHTML = '<div class="card">Cargando…</div>';
  const mes = window._mesPagos || fmt.mesActual();
  const [pagos, clientes] = await Promise.all([
    api.get(`/api/pagos?mes=${mes}`),
    api.get('/api/clientes'),
  ]);

  // construir vista "por nombre" con quien pago y quien falta
  const pagosPorCliente = {};
  pagos.forEach(p => {
    if (!pagosPorCliente[p.cliente_id]) pagosPorCliente[p.cliente_id] = [];
    pagosPorCliente[p.cliente_id].push(p);
  });
  const clientesActivos = clientes.filter(c => c.estado === 'activo');
  const sinPago = clientesActivos.filter(c => !pagosPorCliente[c.id]);

  const cobrado = pagos.filter(p => p.estado === 'pagado').reduce((s, p) => s + p.monto, 0);
  const pendiente = pagos.filter(p => p.estado === 'pendiente').reduce((s, p) => s + p.monto, 0);

  view.innerHTML = `
    <div class="flex justify-between items-center mb-4 flex-wrap gap-2">
      <div class="flex items-center gap-3">
        <h2 class="text-xl font-bold">Pagos</h2>
        <input id="mes-input" type="month" value="${mes}" class="!w-auto" />
      </div>
      <div class="flex gap-2">
        <button class="btn btn-secondary" onclick="generarMes()">Generar pagos del mes</button>
        <button class="btn btn-primary" onclick="nuevoPago()">+ Nuevo pago</button>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
      <div class="card"><div class="text-xs text-slate-500">Cobrado</div><div class="text-2xl font-bold text-emerald-600">${fmt.money(cobrado)}</div></div>
      <div class="card"><div class="text-xs text-slate-500">Pendiente</div><div class="text-2xl font-bold text-amber-600">${fmt.money(pendiente)}</div></div>
      <div class="card"><div class="text-xs text-slate-500">Sin registro este mes</div><div class="text-2xl font-bold text-slate-600">${sinPago.length} cliente(s)</div></div>
    </div>

    <div class="card mb-4">
      <h3 class="font-semibold mb-2">Pagos del mes (${mes})</h3>
      <table>
        <thead><tr><th>Cliente</th><th>Esperado</th><th>Pagado</th><th>Monto</th><th>Método</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${pagos.length === 0 ? '<tr><td colspan="7" class="text-center text-slate-500 py-4">Sin pagos registrados.</td></tr>' : pagos.map(p => `
            <tr>
              <td class="font-medium">${p.cliente_nombre}</td>
              <td>${fmt.fecha(p.fecha_esperada)}</td>
              <td>${p.fecha_pago ? fmt.fecha(p.fecha_pago) : '—'}</td>
              <td>${fmt.money(p.monto, p.moneda)}</td>
              <td>${p.metodo || '—'}</td>
              <td><span class="tag ${p.estado === 'pagado' ? 'tag-green' : 'tag-yellow'}">${p.estado}</span></td>
              <td class="text-right">
                ${p.estado === 'pendiente' ? `<button class="btn btn-ghost" onclick="marcarPagoMes(${p.id})">Marcar pagado</button>` : ''}
                <button class="btn btn-ghost" onclick="editarPago(${p.id})">Editar</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    ${sinPago.length > 0 ? `
      <div class="card">
        <h3 class="font-semibold mb-2 text-amber-700">Clientes activos sin pago registrado este mes</h3>
        <ul class="divide-y">
          ${sinPago.map(c => `
            <li class="py-2 flex justify-between items-center">
              <div>
                <div class="font-medium">${c.nombre}</div>
                <div class="text-xs text-slate-500">${c.plan || '—'} · ${fmt.money(c.monto, c.moneda)}</div>
              </div>
              <button class="btn btn-secondary" onclick="nuevoPago(${c.id})">+ Registrar pago</button>
            </li>
          `).join('')}
        </ul>
      </div>` : ''}
  `;
  $('#mes-input').addEventListener('change', (e) => {
    window._mesPagos = e.target.value;
    navigate('pagos');
  });
};

window.generarMes = async () => {
  const mes = window._mesPagos || fmt.mesActual();
  const r = await api.post('/api/pagos/generar-mes', { mes });
  toast(`${r.creados} pago(s) generado(s)`);
  navigate('pagos');
};

async function pagoForm(p = {}, clienteIdFijo = null) {
  const clientes = await api.get('/api/clientes');
  const opciones = clientes.map(c => `<option value="${c.id}" ${(p.cliente_id || clienteIdFijo) == c.id ? 'selected' : ''}>${c.nombre}</option>`).join('');
  return `
    <div class="grid grid-cols-2 gap-3">
      <div class="col-span-2"><label>Cliente *</label>
        <select id="f-cliente" ${clienteIdFijo ? 'disabled' : ''}>
          <option value="">— elegir —</option>${opciones}
        </select>
      </div>
      <div><label>Fecha esperada *</label><input id="f-fespera" type="date" value="${p.fecha_esperada || fmt.hoy()}"></div>
      <div><label>Fecha de pago</label><input id="f-fpago" type="date" value="${p.fecha_pago || ''}"></div>
      <div><label>Monto *</label><input id="f-monto" type="number" step="0.01" value="${p.monto || ''}"></div>
      <div><label>Moneda</label>
        <select id="f-moneda">${['USD','COP','MXN','ARS','CLP','EUR','PEN'].map(m => `<option ${(p.moneda || 'USD') === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
      </div>
      <div><label>Método</label><input id="f-metodo" placeholder="Transferencia, PayPal..." value="${p.metodo || ''}"></div>
      <div><label>Estado</label>
        <select id="f-estado">
          <option value="pendiente" ${p.estado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
          <option value="pagado" ${p.estado === 'pagado' ? 'selected' : ''}>Pagado</option>
        </select>
      </div>
      <div class="col-span-2"><label>Nota</label><textarea id="f-nota" rows="2">${p.nota || ''}</textarea></div>
    </div>
  `;
}

window.nuevoPago = async (clienteId = null) => {
  const html = await pagoForm({}, clienteId);
  openModal(modalShell('Nuevo pago', html,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="guardarPago(null, ${clienteId})">Guardar</button>`));
};

window.editarPago = async (id) => {
  const pagos = await api.get('/api/pagos');
  const p = pagos.find(x => x.id === id) || await api.get(`/api/pagos?id=${id}`);
  const html = await pagoForm(p);
  openModal(modalShell('Editar pago', html,
    `<button class="btn btn-danger mr-auto" onclick="eliminarPago(${id})">Eliminar</button>
     <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="guardarPago(${id})">Guardar</button>`));
};

window.guardarPago = async (id, clienteIdFijo = null) => {
  const data = {
    cliente_id: clienteIdFijo || $('#f-cliente').value,
    fecha_esperada: $('#f-fespera').value,
    fecha_pago: $('#f-fpago').value,
    monto: $('#f-monto').value,
    moneda: $('#f-moneda').value,
    metodo: $('#f-metodo').value,
    estado: $('#f-estado').value,
    nota: $('#f-nota').value,
  };
  if (!data.cliente_id || !data.fecha_esperada || !data.monto) { toast('Faltan datos'); return; }
  if (id) await api.put(`/api/pagos/${id}`, data);
  else await api.post('/api/pagos', data);
  closeModal();
  toast('Guardado');
  navigate('pagos');
};

window.eliminarPago = async (id) => {
  if (!confirm('¿Eliminar este pago?')) return;
  await api.del(`/api/pagos/${id}`);
  closeModal();
  navigate('pagos');
};

window.marcarPagoMes = async (id) => {
  await api.post(`/api/pagos/${id}/marcar-pagado`, { fecha_pago: fmt.hoy() });
  toast('Pago registrado');
  navigate('pagos');
};

// ===== SEGUIMIENTO =====
routes.seguimiento = async () => {
  view.innerHTML = '<div class="card">Cargando…</div>';
  const semana = window._semana || fmt.semanaISO();
  const [registros, clientes] = await Promise.all([
    api.get(`/api/seguimientos/semana/${semana}`),
    api.get('/api/clientes'),
  ]);
  const conRegistro = new Set(registros.map(r => r.cliente_id));
  const pendientes = clientes.filter(c => c.estado === 'activo' && !conRegistro.has(c.id));

  view.innerHTML = `
    <div class="flex justify-between items-center mb-4 flex-wrap gap-2">
      <div class="flex items-center gap-3">
        <h2 class="text-xl font-bold">Seguimiento semanal</h2>
        <input id="semana-input" type="week" value="${semana}" class="!w-auto"/>
      </div>
      <button class="btn btn-primary" onclick="nuevoSeguimiento()">+ Nuevo registro</button>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
      <div class="card"><div class="text-xs text-slate-500">Clientes activos</div><div class="text-2xl font-bold">${clientes.filter(c => c.estado === 'activo').length}</div></div>
      <div class="card"><div class="text-xs text-slate-500">Con seguimiento</div><div class="text-2xl font-bold text-emerald-600">${registros.length}</div></div>
      <div class="card"><div class="text-xs text-slate-500">Pendientes esta semana</div><div class="text-2xl font-bold text-amber-600">${pendientes.length}</div></div>
    </div>

    <div class="card mb-4">
      <h3 class="font-semibold mb-2">Registros de la semana</h3>
      ${registros.length === 0 ? '<p class="text-sm text-slate-500">Sin registros esta semana.</p>' : `
        <div class="space-y-3">
          ${registros.map(r => `
            <div class="border-l-4 border-emerald-400 pl-3 py-2 bg-slate-50 rounded-r">
              <div class="flex justify-between items-start">
                <div>
                  <div class="font-semibold">${r.cliente_nombre}</div>
                  <div class="text-xs text-slate-500">${fmt.fecha(r.fecha)} · adherencia ${r.adherencia ?? '—'}/10 · ánimo: ${r.estado_animo || '—'}</div>
                </div>
                <button class="btn btn-ghost text-xs" onclick="editarSeguimiento(${r.id})">Editar</button>
              </div>
              <div class="text-sm mt-2"><strong>Avances:</strong> ${r.avances || '—'}</div>
              ${r.notas ? `<div class="text-sm mt-1 text-slate-600">${r.notas}</div>` : ''}
            </div>
          `).join('')}
        </div>
      `}
    </div>

    ${pendientes.length > 0 ? `
      <div class="card">
        <h3 class="font-semibold mb-2 text-amber-700">Clientes sin seguimiento esta semana</h3>
        <ul class="divide-y">
          ${pendientes.map(c => `
            <li class="py-2 flex justify-between items-center">
              <div class="font-medium">${c.nombre}</div>
              <button class="btn btn-secondary" onclick="nuevoSeguimiento(${c.id})">+ Registrar</button>
            </li>
          `).join('')}
        </ul>
      </div>` : ''}
  `;
  $('#semana-input').addEventListener('change', (e) => {
    window._semana = e.target.value;
    navigate('seguimiento');
  });
};

async function seguimientoForm(s = {}, clienteIdFijo = null) {
  const clientes = await api.get('/api/clientes');
  const opciones = clientes.map(c => `<option value="${c.id}" ${(s.cliente_id || clienteIdFijo) == c.id ? 'selected' : ''}>${c.nombre}</option>`).join('');
  return `
    <div class="grid grid-cols-2 gap-3">
      <div class="col-span-2"><label>Cliente *</label>
        <select id="f-cliente" ${clienteIdFijo ? 'disabled' : ''}>
          <option value="">— elegir —</option>${opciones}
        </select>
      </div>
      <div><label>Semana ISO *</label><input id="f-semana" value="${s.semana || fmt.semanaISO()}" placeholder="YYYY-Www"></div>
      <div><label>Fecha</label><input id="f-fecha" type="date" value="${s.fecha || fmt.hoy()}"></div>
      <div><label>Estado de ánimo</label>
        <select id="f-animo">
          ${['','excelente','bien','neutro','bajo','muy bajo'].map(o => `<option ${(s.estado_animo || '') === o ? 'selected' : ''}>${o}</option>`).join('')}
        </select>
      </div>
      <div><label>Adherencia (0-10)</label><input id="f-adh" type="number" min="0" max="10" value="${s.adherencia ?? ''}"></div>
      <div class="col-span-2"><label>Avances de la semana</label><textarea id="f-avances" rows="3">${s.avances || ''}</textarea></div>
      <div class="col-span-2"><label>Notas / lo que pasó</label><textarea id="f-notas" rows="3">${s.notas || ''}</textarea></div>
    </div>
  `;
}

window.nuevoSeguimiento = async (clienteId = null) => {
  const html = await seguimientoForm({}, clienteId);
  openModal(modalShell('Nuevo seguimiento', html,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="guardarSeguimiento(null, ${clienteId})">Guardar</button>`));
};

window.editarSeguimiento = async (id) => {
  const semana = window._semana || fmt.semanaISO();
  const registros = await api.get(`/api/seguimientos/semana/${semana}`);
  const s = registros.find(r => r.id === id);
  const html = await seguimientoForm(s);
  openModal(modalShell('Editar seguimiento', html,
    `<button class="btn btn-danger mr-auto" onclick="eliminarSeguimiento(${id})">Eliminar</button>
     <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="guardarSeguimiento(${id})">Guardar</button>`));
};

window.guardarSeguimiento = async (id, clienteIdFijo = null) => {
  const data = {
    cliente_id: clienteIdFijo || $('#f-cliente').value,
    semana: $('#f-semana').value,
    fecha: $('#f-fecha').value,
    estado_animo: $('#f-animo').value,
    adherencia: $('#f-adh').value,
    avances: $('#f-avances').value,
    notas: $('#f-notas').value,
  };
  if (!data.cliente_id || !data.semana) { toast('Faltan datos'); return; }
  if (id) await api.put(`/api/seguimientos/${id}`, data);
  else await api.post('/api/seguimientos', data);
  closeModal();
  toast('Guardado');
  navigate('seguimiento');
};

window.eliminarSeguimiento = async (id) => {
  if (!confirm('¿Eliminar este registro?')) return;
  await api.del(`/api/seguimientos/${id}`);
  closeModal();
  navigate('seguimiento');
};

// ===== PENDIENTES =====
routes.pendientes = async () => {
  view.innerHTML = '<div class="card">Cargando…</div>';
  const lista = await api.get('/api/pendientes');
  const abiertos = lista.filter(p => p.estado === 'abierto');
  const completados = lista.filter(p => p.estado === 'completado');

  view.innerHTML = `
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-xl font-bold">Pendientes</h2>
      <button class="btn btn-primary" onclick="nuevoPendiente()">+ Nuevo pendiente</button>
    </div>

    <div class="card mb-4">
      <h3 class="font-semibold mb-2">Abiertos (${abiertos.length})</h3>
      ${abiertos.length === 0 ? '<p class="text-sm text-slate-500">No hay pendientes abiertos.</p>' : `
        <ul class="divide-y">
          ${abiertos.map(p => `
            <li class="py-2 flex items-center gap-3">
              <input type="checkbox" onchange="togglePendiente(${p.id})">
              <div class="flex-1">
                <div class="font-medium text-sm">${p.descripcion}</div>
                <div class="text-xs text-slate-500">${p.cliente_nombre} · ${p.fecha_limite ? 'Vence ' + fmt.fecha(p.fecha_limite) : 'sin fecha límite'}</div>
              </div>
              <span class="tag ${p.prioridad === 'alta' ? 'tag-red' : p.prioridad === 'baja' ? 'tag-gray' : 'tag-yellow'}">${p.prioridad}</span>
              <button class="btn btn-ghost text-xs" onclick="eliminarPendiente(${p.id})">✕</button>
            </li>
          `).join('')}
        </ul>`}
    </div>

    ${completados.length > 0 ? `
      <div class="card">
        <h3 class="font-semibold mb-2 text-slate-500">Completados (${completados.length})</h3>
        <ul class="divide-y">
          ${completados.slice(0, 20).map(p => `
            <li class="py-2 flex items-center gap-3">
              <input type="checkbox" checked onchange="togglePendiente(${p.id})">
              <div class="flex-1">
                <div class="text-sm line-through text-slate-400">${p.descripcion}</div>
                <div class="text-xs text-slate-400">${p.cliente_nombre} · completado ${fmt.fecha(p.completado_en)}</div>
              </div>
            </li>
          `).join('')}
        </ul>
      </div>` : ''}
  `;
};

async function pendienteForm(clienteIdFijo = null) {
  const clientes = await api.get('/api/clientes');
  const opciones = clientes.map(c => `<option value="${c.id}" ${clienteIdFijo == c.id ? 'selected' : ''}>${c.nombre}</option>`).join('');
  return `
    <div class="grid grid-cols-2 gap-3">
      <div class="col-span-2"><label>Cliente *</label>
        <select id="f-cliente" ${clienteIdFijo ? 'disabled' : ''}>
          <option value="">— elegir —</option>${opciones}
        </select>
      </div>
      <div class="col-span-2"><label>Descripción *</label><input id="f-desc" placeholder="Qué le pediste"></div>
      <div><label>Fecha límite</label><input id="f-fecha" type="date"></div>
      <div><label>Prioridad</label>
        <select id="f-prio">
          <option value="baja">Baja</option>
          <option value="media" selected>Media</option>
          <option value="alta">Alta</option>
        </select>
      </div>
    </div>
  `;
}

window.nuevoPendiente = async (clienteId = null) => {
  const html = await pendienteForm(clienteId);
  openModal(modalShell('Nuevo pendiente', html,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="guardarPendiente(${clienteId})">Guardar</button>`));
};

window.guardarPendiente = async (clienteIdFijo = null) => {
  const data = {
    cliente_id: clienteIdFijo || $('#f-cliente').value,
    descripcion: $('#f-desc').value.trim(),
    fecha_limite: $('#f-fecha').value,
    prioridad: $('#f-prio').value,
  };
  if (!data.cliente_id || !data.descripcion) { toast('Faltan datos'); return; }
  await api.post('/api/pendientes', data);
  closeModal();
  toast('Guardado');
  navigate('pendientes');
};

window.togglePendiente = async (id, refrescarClienteId = null) => {
  await api.post(`/api/pendientes/${id}/toggle`, {});
  if (refrescarClienteId) verCliente(refrescarClienteId);
  else navigate('pendientes');
};

window.eliminarPendiente = async (id) => {
  if (!confirm('¿Eliminar?')) return;
  await api.del(`/api/pendientes/${id}`);
  navigate('pendientes');
};

// ===== SESIONES =====
routes.sesiones = async () => {
  view.innerHTML = '<div class="card">Cargando…</div>';
  const desde = fmt.hoy();
  const hasta = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const sesiones = await api.get(`/api/sesiones?desde=${desde}&hasta=${hasta}`);
  view.innerHTML = `
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-xl font-bold">Sesiones agendadas</h2>
      <button class="btn btn-primary" onclick="nuevaSesion()">+ Nueva sesión</button>
    </div>
    <div class="card">
      ${sesiones.length === 0 ? '<p class="text-sm text-slate-500">Sin sesiones próximas.</p>' : `
        <table>
          <thead><tr><th>Fecha</th><th>Hora</th><th>Cliente</th><th>Tema</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            ${sesiones.map(s => `
              <tr>
                <td>${fmt.fecha(s.fecha)}</td>
                <td>${s.hora || '—'}</td>
                <td class="font-medium">${s.cliente_nombre}</td>
                <td>${s.tema || '—'}</td>
                <td><span class="tag ${s.estado === 'realizada' ? 'tag-green' : s.estado === 'cancelada' ? 'tag-red' : 'tag-blue'}">${s.estado}</span></td>
                <td class="text-right"><button class="btn btn-ghost" onclick="editarSesion(${s.id})">Editar</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>`}
    </div>
  `;
};

async function sesionForm(s = {}) {
  const clientes = await api.get('/api/clientes');
  const opciones = clientes.map(c => `<option value="${c.id}" ${s.cliente_id == c.id ? 'selected' : ''}>${c.nombre}</option>`).join('');
  return `
    <div class="grid grid-cols-2 gap-3">
      <div class="col-span-2"><label>Cliente *</label>
        <select id="f-cliente"><option value="">— elegir —</option>${opciones}</select>
      </div>
      <div><label>Fecha *</label><input id="f-fecha" type="date" value="${s.fecha || fmt.hoy()}"></div>
      <div><label>Hora</label><input id="f-hora" type="time" value="${s.hora || ''}"></div>
      <div><label>Duración (min)</label><input id="f-dur" type="number" value="${s.duracion_min || 60}"></div>
      <div><label>Estado</label>
        <select id="f-estado">
          <option value="agendada" ${s.estado === 'agendada' ? 'selected' : ''}>Agendada</option>
          <option value="realizada" ${s.estado === 'realizada' ? 'selected' : ''}>Realizada</option>
          <option value="cancelada" ${s.estado === 'cancelada' ? 'selected' : ''}>Cancelada</option>
        </select>
      </div>
      <div class="col-span-2"><label>Tema / objetivo</label><input id="f-tema" value="${s.tema || ''}"></div>
      <div class="col-span-2"><label>Notas</label><textarea id="f-notas" rows="2">${s.notas || ''}</textarea></div>
    </div>
  `;
}

window.nuevaSesion = async () => {
  const html = await sesionForm();
  openModal(modalShell('Nueva sesión', html,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="guardarSesion()">Guardar</button>`));
};

window.editarSesion = async (id) => {
  const desde = '2000-01-01', hasta = '2999-12-31';
  const sesiones = await api.get(`/api/sesiones?desde=${desde}&hasta=${hasta}`);
  const s = sesiones.find(x => x.id === id);
  const html = await sesionForm(s);
  openModal(modalShell('Editar sesión', html,
    `<button class="btn btn-danger mr-auto" onclick="eliminarSesion(${id})">Eliminar</button>
     <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="guardarSesion(${id})">Guardar</button>`));
};

window.guardarSesion = async (id = null) => {
  const data = {
    cliente_id: $('#f-cliente').value,
    fecha: $('#f-fecha').value,
    hora: $('#f-hora').value,
    duracion_min: $('#f-dur').value,
    tema: $('#f-tema').value,
    estado: $('#f-estado').value,
    notas: $('#f-notas').value,
  };
  if (!data.cliente_id || !data.fecha) { toast('Faltan datos'); return; }
  if (id) await api.put(`/api/sesiones/${id}`, data);
  else await api.post('/api/sesiones', data);
  closeModal();
  toast('Guardado');
  navigate('sesiones');
};

window.eliminarSesion = async (id) => {
  if (!confirm('¿Eliminar esta sesión?')) return;
  await api.del(`/api/sesiones/${id}`);
  closeModal();
  navigate('sesiones');
};

// ===== METRICAS =====
window.nuevaMetrica = async (clienteId) => {
  openModal(modalShell('Nueva medición', `
    <div class="grid grid-cols-2 gap-3">
      <div><label>Fecha</label><input id="m-fecha" type="date" value="${fmt.hoy()}"></div>
      <div><label>Peso (kg)</label><input id="m-peso" type="number" step="0.1"></div>
      <div><label>% Grasa</label><input id="m-grasa" type="number" step="0.1"></div>
      <div><label>Cintura (cm)</label><input id="m-cintura" type="number" step="0.1"></div>
      <div><label>Cadera (cm)</label><input id="m-cadera" type="number" step="0.1"></div>
      <div><label>Pecho (cm)</label><input id="m-pecho" type="number" step="0.1"></div>
      <div><label>Brazo (cm)</label><input id="m-brazo" type="number" step="0.1"></div>
      <div><label>Pierna (cm)</label><input id="m-pierna" type="number" step="0.1"></div>
      <div class="col-span-2"><label>Notas</label><textarea id="m-notas" rows="2"></textarea></div>
    </div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="guardarMetrica(${clienteId})">Guardar</button>`));
};

window.guardarMetrica = async (clienteId) => {
  await api.post('/api/metricas', {
    cliente_id: clienteId,
    fecha: $('#m-fecha').value,
    peso: $('#m-peso').value,
    grasa: $('#m-grasa').value,
    cintura: $('#m-cintura').value,
    cadera: $('#m-cadera').value,
    pecho: $('#m-pecho').value,
    brazo: $('#m-brazo').value,
    pierna: $('#m-pierna').value,
    notas: $('#m-notas').value,
  });
  closeModal();
  toast('Medición guardada');
  verCliente(clienteId);
};

// ===== Boot =====
navigate('dashboard');
