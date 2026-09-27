// =====================================================
// EVENTOS DEL CALENDARIO · lo que NO es una rutina
// =====================================================
// "Los lunes y miércoles hace natación." "El 15 toca medición de peso."
// "Esa semana está de viaje." Media planificación de un cliente son cosas
// así, y ninguna es una rutina.
//
// Meterlas como rutinas falsas parecía el atajo, pero ensucia el historial:
// una rutina que nadie ejecuta cuenta como rutina NO hecha, y la adherencia
// del cliente sale mal por una natación que sí hizo. Por eso tienen su propia
// tabla (`eventos`, ver entrenamientoecm/carga/migracion-eventos.sql).
//
// Dos formas de caer en el calendario:
//   · fecha        → una sola vez, ese día
//   · dias_semana  → se repite esos días mientras dure la fase
//
// La expansión a días concretos está DUPLICADA a propósito: aquí en JS y en
// SQL (`evento_fechas`). El CRM pinta el calendario sin ir al servidor por
// cada evento, y la app del cliente lee la función. Las dos tienen que dar
// los mismos días — hay una prueba que las compara.
//
// Va DESPUÉS de entrenamiento.js: usa su catálogo de días (ENT_DIAS) y sus
// helpers de app.js (sb, toast, escapeHtml, openModal). El calendario lo
// llama al pintar, que siempre es después de que cargue todo.
// =====================================================

const EVT_TIPOS = [
  ['actividad', '🏊 Actividad',  '#0e7490'],   // natación, fútbol, caminata
  // Lo que el cliente REGISTRA: le sale en su calendario con su botón
  // («Registrar peso», «Ya me medí», «Ya envié mis fotos») y te llega un
  // aviso al teléfono y a la Bandeja cuando lo marca.
  ['medidas',   '📏 Medición corporal',   '#7c3aed'],
  ['peso',      '⚖️ Peso',                '#6d28d9'],
  ['fotos',     '📸 Registro fotográfico', '#9333ea'],
  ['medicion',  '⚖️ Medición (general)',  '#7c3aed'],   // el tipo de antes; se sigue leyendo
  ['cita',      '📅 Cita',       '#b45309'],   // consulta, control médico
  ['nota',      '📌 Nota',       '#475569'],   // recordatorio sin acción
  ['descanso',  '😴 Descanso',   '#65a30d'],   // día libre a propósito
];

const evtLabel = (t) => (EVT_TIPOS.find(x => x[0] === t) || EVT_TIPOS[0])[1];
const evtColor = (e) => e.color || (EVT_TIPOS.find(x => x[0] === e.tipo) || EVT_TIPOS[0])[2];

// Las utilidades de fecha (evtISO, evtDia, evtSumarDias, evtCodigoDe) viven
// en entrenamiento.js, no aquí: el calendario mensual las necesita aunque
// este archivo no se haya subido, y tenerlas de este lado hacía que un solo
// archivo que faltara se llevara por delante toda la sección.

// En qué días concretos cae un evento. Espejo de `evento_fechas` en SQL.
function evtFechasDe(ev, fase) {
  if (ev.fecha) return [String(ev.fecha).slice(0, 10)];
  const dias = ev.dias_semana || [];
  if (!dias.length || !fase?.fecha_inicio || !fase?.semanas) return [];

  const fechas = [];
  for (let semana = 1; semana <= fase.semanas; semana++) {
    if (ev.semanas && ev.semanas.length && !ev.semanas.includes(semana)) continue;
    for (const codigo of dias) {
      const off = EVT_CODIGO_DIA.indexOf(codigo);
      if (off < 0) continue;
      fechas.push(evtSumarDias(fase.fecha_inicio, (semana - 1) * 7 + off));
    }
  }
  return fechas.sort();
}

// { 'YYYY-MM-DD': [evento, …] } para todos los eventos de un cliente.
function evtPorFecha(eventos, fasesPorId) {
  const mapa = {};
  (eventos || []).forEach(ev => {
    evtFechasDe(ev, fasesPorId[ev.fase_id]).forEach(f => { (mapa[f] ||= []).push(ev); });
  });
  return mapa;
}

// =====================================================
// CAPA DE DATOS
// =====================================================
const evtDb = {
  // Si la migración de eventos no está corrida, esto devuelve null en vez de
  // romper el calendario: quien llama pinta las rutinas igual y avisa aparte.
  async lista(clienteId) {
    const { data, error } = await sb.from('eventos').select('*')
      .eq('cliente_id', clienteId).order('created_at');
    if (error) return null;
    return data || [];
  },
  async registros(clienteId, desde = null) {
    let q = sb.from('evento_registros').select('*').eq('cliente_id', clienteId);
    if (desde) q = q.gte('fecha', desde);
    const { data, error } = await q;
    if (error) return [];
    return data || [];
  },
  async crear(row) {
    const { data, error } = await sb.from('eventos').insert(row).select().single();
    if (error) { toast(error.message); return null; }
    return data;
  },
  async actualizar(id, row) {
    const { error } = await sb.from('eventos').update(row).eq('id', id);
    if (error) { toast(error.message); return false; }
    return true;
  },
  async borrar(id) {
    const { error } = await sb.from('eventos').delete().eq('id', id);
    if (error) { toast(error.message); return false; }
    return true;
  },
};

// =====================================================
// EDITOR
// =====================================================
// El modal no puede guardar su contexto en el DOM: al repintar el panel de
// "se repite / un solo día" se perdería a media edición.
const _evt = { ctx: null, modo: 'repite' };

// `ctx` trae { clienteId, fase, alGuardar }. La fase importa: sin ella un
// evento no puede repetirse (no hay rango donde repetir), y el formulario lo
// dice en vez de dejar guardar algo que nunca se pintaría.
window.evtEditar = (ev, ctx) => {
  const e = ev || {};
  const esNuevo = !e.id;
  const fase = ctx.fase;
  const repite = !e.fecha && (e.dias_semana || []).length > 0;
  const modo = esNuevo ? (fase ? 'repite' : 'fecha') : (repite ? 'repite' : 'fecha');

  openModal(modalShell(esNuevo ? 'Nuevo evento' : 'Editar evento', `
    <div class="grid md:grid-cols-2 gap-3 mb-3">
      <div><label>Qué es</label>
        <select id="ev-tipo">
          ${EVT_TIPOS.map(([id, lab]) => `<option value="${id}" ${(e.tipo || 'actividad') === id ? 'selected' : ''}>${lab}</option>`).join('')}
        </select></div>
      <div><label>Título *</label>
        <input id="ev-titulo" value="${escapeHtml(e.titulo || '')}" placeholder="Natación"></div>
    </div>

    <div class="sec-title">Cuándo</div>
    <div class="flex gap-2 mb-3">
      <button type="button" class="chip ${modo === 'repite' ? 'active' : ''}" data-evmodo="repite"
              onclick="evtModo('repite')" ${fase ? '' : 'disabled title="Para repetir hace falta una fase: es la que pone la fecha de inicio y cuántas semanas dura"'}>
        🔁 Se repite</button>
      <button type="button" class="chip ${modo === 'fecha' ? 'active' : ''}" data-evmodo="fecha"
              onclick="evtModo('fecha')">📅 Un solo día</button>
    </div>

    <div id="ev-panel-repite" class="${modo === 'repite' ? '' : 'hidden'}">
      <label>Qué días</label>
      <div class="flex flex-wrap gap-1 mt-1 mb-3">
        ${ENT_DIAS.map(([id, lab]) => `
          <label class="tag-pill cursor-pointer" style="${(e.dias_semana || []).includes(id) ? 'background:#d1fae5;color:#065f46' : ''}">
            <input type="checkbox" class="ev-dia" value="${id}" ${(e.dias_semana || []).includes(id) ? 'checked' : ''}
                   onchange="this.parentNode.style.cssText = this.checked ? 'background:#d1fae5;color:#065f46' : ''"
                   style="margin-right:3px;vertical-align:middle">${lab}
          </label>`).join('')}
      </div>
      ${fase ? `
        <label>En qué semanas de “${escapeHtml(fase.nombre)}”</label>
        <div class="flex flex-wrap gap-1 mt-1">
          ${Array.from({ length: fase.semanas || 0 }, (_, i) => i + 1).map(n => `
            <label class="tag-pill cursor-pointer" style="${(e.semanas || []).includes(n) ? 'background:#dbeafe;color:#1e40af' : ''}">
              <input type="checkbox" class="ev-semana" value="${n}" ${(e.semanas || []).includes(n) ? 'checked' : ''}
                     onchange="this.parentNode.style.cssText = this.checked ? 'background:#dbeafe;color:#1e40af' : ''"
                     style="margin-right:3px;vertical-align:middle">${n}
            </label>`).join('')}
        </div>
        <p class="text-xs text-slate-400 mt-1">Sin marcar ninguna = todas las semanas.</p>` : ''}
    </div>

    <div id="ev-panel-fecha" class="${modo === 'fecha' ? '' : 'hidden'}">
      <label>Día</label>
      <input id="ev-fecha" type="date" value="${e.fecha ? String(e.fecha).slice(0, 10) : ''}">
    </div>

    <div class="grid grid-cols-2 gap-3 mt-3 mb-3">
      <div><label>Hora (opcional)</label>
        <input id="ev-hora" type="time" value="${e.hora ? String(e.hora).slice(0, 5) : ''}"></div>
      <div><label>Duración (min)</label>
        <input id="ev-duracion" type="number" min="0" value="${e.duracion_min ?? ''}"></div>
    </div>

    <div class="mb-3"><label>Detalle (lo lee el cliente)</label>
      <textarea id="ev-detalle" rows="2" placeholder="45 min de estilo libre, suave">${escapeHtml(e.detalle || '')}</textarea></div>

    <div><label>¿Lo ve el cliente?</label>
      <select id="ev-visible">
        <option value="" ${e.visible_cliente == null ? 'selected' : ''}>Como la fase (recomendado)</option>
        <option value="si" ${e.visible_cliente === true ? 'selected' : ''}>Sí, siempre</option>
        <option value="no" ${e.visible_cliente === false ? 'selected' : ''}>No, solo yo</option>
      </select>
      <p class="text-xs text-slate-400 mt-1">
        ${fase
          ? 'Con “como la fase”, aparece en su app el día que envíes la fase — ni antes.'
          : 'Este evento no está en ninguna fase, así que “como la fase” lo deja oculto. Ponlo en “Sí” para que lo vea.'}
      </p></div>
  `, `
    ${e.id ? `<button class="btn btn-danger btn-sm" onclick="evtBorrar('${e.id}')">Borrar</button>` : ''}
    <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="evtGuardar(${e.id ? `'${e.id}'` : 'null'})">Guardar</button>
  `));

  _evt.ctx = ctx;
  _evt.modo = modo;
};

window.evtModo = (m) => {
  _evt.modo = m;
  $$('[data-evmodo]').forEach(b => b.classList.toggle('active', b.dataset.evmodo === m));
  $('#ev-panel-repite')?.classList.toggle('hidden', m !== 'repite');
  $('#ev-panel-fecha')?.classList.toggle('hidden', m !== 'fecha');
};

window.evtGuardar = async (id) => {
  const ctx = _evt.ctx || {};
  const titulo = $('#ev-titulo')?.value.trim();
  if (!titulo) return toast('Ponle un título');

  const marcados = (clase) => $$(`.${clase}:checked`).map(i => i.value);
  const repite = _evt.modo === 'repite';
  const dias = repite ? marcados('ev-dia') : [];
  const fecha = repite ? null : ($('#ev-fecha')?.value || null);

  // La base tiene el mismo CHECK, pero un error de Postgres aquí sería
  // «violates check constraint eventos_cuando_ck», que no le dice nada a
  // nadie. Mejor atajarlo con la frase que explica qué falta.
  if (repite && !dias.length) return toast('Marca al menos un día de la semana');
  if (repite && !ctx.fase) return toast('Para repetir hace falta una fase');
  if (!repite && !fecha) return toast('Elige el día');

  const vis = $('#ev-visible')?.value;
  const row = {
    cliente_id: ctx.clienteId,
    fase_id: repite ? ctx.fase.id : (ctx.fase?.id || null),
    tipo: $('#ev-tipo')?.value || 'actividad',
    titulo,
    detalle: $('#ev-detalle')?.value.trim() || null,
    hora: $('#ev-hora')?.value || null,
    duracion_min: $('#ev-duracion')?.value ? Number($('#ev-duracion').value) : null,
    fecha,
    dias_semana: dias,
    semanas: repite && marcados('ev-semana').length ? marcados('ev-semana').map(Number) : null,
    visible_cliente: vis === 'si' ? true : vis === 'no' ? false : null,
  };

  const ok = id ? await evtDb.actualizar(id, row) : !!(await evtDb.crear(row));
  if (!ok) return;
  closeModal();
  toast(id ? 'Evento actualizado' : 'Evento creado');
  ctx.alGuardar?.();
};

window.evtBorrar = async (id) => {
  if (!confirm('¿Borrar este evento del calendario?')) return;
  const ctx = _evt.ctx || {};
  if (!(await evtDb.borrar(id))) return;
  closeModal();
  toast('Evento borrado');
  ctx.alGuardar?.();
};

window.evtNuevo = (ctx, prefill = {}) => evtEditar(prefill, ctx);
