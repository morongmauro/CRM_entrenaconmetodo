// =====================================================
// BLOQUES COMPLEMENTARIOS · varias rutinas el mismo día
// =====================================================
// Un recovery, una movilidad diaria, algo especial («Elbow Recovery»): una
// rutina APARTE que va el mismo día que la fuerza, sin tener que ver con
// ella. Se marca en «Datos de la rutina» y se le eligen sus días.
//
// La fuerza manda: el bloque nunca le quita el día a la rutina de fuerza (ni
// la fuerza al bloque). En el calendario sale debajo, más chico; en la app
// del cliente, debajo de «Hoy te toca», en Tu semana y en el Calendario.
//
// La marca es `rutinas.complementaria` (carga/migracion-bloques-complementarios.sql).
// Sin la columna, ninguna rutina lo es y todo sigue como antes.
// Espejo en la app: complementariasDe (api/_entreno.js).

const BQ_SQL = 'carga/migracion-bloques-complementarios.sql';

function entEsBloque(r) { return r?.complementaria === true; }

// ¿Ya existe la columna? Las rutinas se leen con select('*'): si la trae,
// está instalada.
const bqInstalado = (rutinas) => (rutinas || []).some(r => r && Object.prototype.hasOwnProperty.call(r, 'complementaria'));

// Los bloques que caen en una fecha, en el orden del coach.
function bqDelDia(fase, rutinas, fecha) {
  if (!fase?.fecha_inicio || !fecha || fecha < fase.fecha_inicio) return [];
  const fin = typeof entFechaFin === 'function' ? entFechaFin(fase) : null;
  if (fin && fecha > fin) return [];
  const codigo = evtCodigoDe(fecha);
  return (rutinas || []).filter(r => entEsBloque(r) && entDiasDe(r).includes(codigo))
    .sort((a, b) => (a.dia_orden || 0) - (b.dia_orden || 0));
}

// Las píldoras de una casilla del mes: debajo de la fuerza, más chicas.
function bqChipsCelda(fecha, { fase, rutinas, sesionesPorFecha, hoy }) {
  return bqDelDia(fase, rutinas, fecha).map(b => {
    const ses = sesionesPorFecha ? (sesionesPorFecha[fecha] || []).find(x => x.rutina_id === b.id) : null;
    const hecho = ses && ses.estado === 'completada';
    return `
      <div class="ent-chip ent-chip-bloque" data-bloque="${b.id}"
           onclick="event.stopPropagation(); entAbrirRutinaDesdeCalendario('${b.id}')"
           title="${escapeHtml(b.nombre)} · bloque complementario (va con la fuerza de ese día)${hecho ? ' · lo marcó como hecho' : ''}">
        <span class="ent-chip-bloque-ic">${hecho ? '✓' : '+'}</span><span class="ent-chip-txt">${escapeHtml(b.nombre)}</span>
      </div>`;
  }).join('');
}

// La parte de bloques del panel de un día: lo que va ADEMÁS de la fuerza.
// Un solo botón: «+ Añadir otro bloque a este día» → elegir la rutina y si va
// solo ese día de la semana o todos los días.
function bqPanel(fecha) {
  const fase = _ent.faseCache, rutinas = _ent.rutinasCache || [];
  if (!fase) return '';
  const codigo = evtCodigoDe(fecha);
  const plural = (typeof ENT_DIA_PLURAL !== 'undefined' && ENT_DIA_PLURAL[codigo]) || codigo;
  const caja = (cuerpo) => `
    <div data-dia-bloques class="rounded-xl p-3 mb-3" style="background:#f8fafc;border:1px dashed #cbd5e1">
      <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Además de la fuerza · otros bloques</div>
      ${cuerpo}
    </div>`;
  if (!bqInstalado(rutinas)) {
    return caja(`<div class="text-xs text-slate-600">Para poner <b>varios bloques el mismo día</b> (la fuerza y, debajo, un recovery o una movilidad) falta correr una vez <code>${BQ_SQL}</code> en Supabase.</div>`);
  }
  const deHoy = bqDelDia(fase, rutinas, fecha);
  const fuerzaHoy = _ent.rutinaDe ? _ent.rutinaDe(fecha) : null;
  // Primero lo que suele ir aparte: los bloques y las rutinas sin día; al
  // final las de fuerza (pasarlas a bloque pide confirmación).
  const peso = (r) => (entEsBloque(r) ? 0 : entDiasDe(r).length ? 2 : 1);
  const elegibles = rutinas.filter(r => !deHoy.some(b => b.id === r.id) && (!fuerzaHoy || r.id !== fuerzaHoy.id))
    .sort((a, b) => peso(a) - peso(b) || (a.dia_orden || 0) - (b.dia_orden || 0));
  return caja(`
      ${deHoy.length ? deHoy.map(b => `
        <div class="flex items-center gap-2 mb-1" data-dia-bloque="${b.id}">
          <div class="flex-1 min-w-0">
            <div class="text-sm font-semibold text-slate-800 truncate">+ ${escapeHtml(b.nombre)}</div>
            <div class="text-[11px] text-slate-500">${entDiasDe(b).length === 7 ? 'todos los días' : escapeHtml(entDiasTexto(b))}</div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="closeModal(); entAbrirRutinaDesdeCalendario('${b.id}')">Abrir</button>
          <button class="btn btn-ghost btn-sm text-red-600" data-bq-quitar="${b.id}" onclick="bqQuitarDia('${b.id}', '${codigo}')">✕ Quitar de los ${plural}</button>
        </div>`).join('') : `<div class="text-sm text-slate-500 mb-1">${fuerzaHoy ? 'Este día solo tiene su fuerza.' : 'Todavía no tiene otros bloques.'}</div>`}
      ${elegibles.length ? `
        <button class="btn btn-secondary btn-sm mt-1" data-bq-abrir onclick="document.getElementById('bq-form').style.display=''; this.style.display='none'">+ Añadir otro bloque a este día</button>
        <div id="bq-form" class="rounded-lg bg-white p-2 mt-1" style="display:none">
          <div class="text-xs text-slate-500 mb-1">¿Qué rutina? (un recovery, una movilidad, algo especial)</div>
          <select id="dia-bloque" class="w-full text-sm mb-2">
            ${elegibles.map(x => `<option value="${x.id}">${escapeHtml(x.nombre)}${entEsBloque(x) ? ' · bloque' : entDiasDe(x).length ? ` · fuerza ${escapeHtml(entDiasTexto(x))}` : ''}</option>`).join('')}
          </select>
          <div class="flex gap-2 flex-wrap">
            <button class="btn btn-primary btn-sm" data-bq-poner onclick="bqAnadir($('#dia-bloque').value, '${codigo}', false)">Todos los ${plural}</button>
            <button class="btn btn-secondary btn-sm" data-bq-poner-todos onclick="bqAnadir($('#dia-bloque').value, '${codigo}', true)">Todos los días</button>
          </div>
        </div>` : ''}
      <div class="text-[11px] text-slate-500 mt-2">No le quitan el día a la fuerza: el cliente ve primero su rutina de fuerza y el bloque debajo.</div>`);
}

const bqRepintar = () => { if ($('#modal-content [data-dia-panel]')) closeModal(); entVistaClientes(); };

// Añadir una rutina como bloque aparte: ese día de la semana o todos. Si
// era una rutina de fuerza con días, se avisa: pasa a ser bloque en todos.
window.bqAnadir = async (rutinaId, codigo, todos = false) => {
  const r = (_ent.rutinasCache || []).find(x => x.id === rutinaId);
  if (!r) return;
  if (!entEsBloque(r) && entDiasDe(r).length
      && !confirm(`${r.nombre} hoy es rutina de FUERZA los ${entDiasTexto(r)}. ¿Pasarla a bloque aparte? Esos días dejará de ser la fuerza del día y saldrá debajo.`)) return;
  const ds = todos ? ENT_DIAS.map(([d]) => d) : entOrdenDias([...(entEsBloque(r) ? entDiasDe(r) : []), codigo]);
  await entDb.actualizarRutina(r.id, { complementaria: true, dias_semana: ds, dia_semana: null });
  r.complementaria = true; r.dias_semana = ds; r.dia_semana = null;
  toast(`${r.nombre}: bloque aparte ${todos ? 'todos los días' : `los ${ENT_DIA_PLURAL[codigo] || codigo}`}`);
  bqRepintar();
};
window.bqPonerDia = (rutinaId, codigo) => bqAnadir(rutinaId, codigo, false);

window.bqQuitarDia = async (rutinaId, codigo) => {
  const r = (_ent.rutinasCache || []).find(x => x.id === rutinaId);
  if (!r || !entEsBloque(r)) return;
  const ds = entDiasDe(r).filter(d => d !== codigo);
  await entDb.actualizarRutina(r.id, { dias_semana: ds, dia_semana: null });
  r.dias_semana = ds; r.dia_semana = null;
  toast(`${r.nombre}: ya no va los ${ENT_DIA_PLURAL[codigo] || codigo}`);
  bqRepintar();
};

// ── En «Datos de la rutina» ────────────────────────────────────────────
// Solo para las rutinas de un cliente (las de biblioteca no tienen días).
function bqEditorHtml(r) {
  if (!r || !r.fase_id) return '';
  if (!Object.prototype.hasOwnProperty.call(r, 'complementaria')) {
    return `<div class="mb-3 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
      Para poner esta rutina como <b>bloque complementario</b> (un recovery que va el mismo día que la fuerza) falta correr <code>${BQ_SQL}</code>.</div>`;
  }
  const on = entEsBloque(r);
  const dias = on ? entDiasDe(r) : [];
  return `
    <div class="mb-3 rounded-xl p-3" style="background:#f8fafc;border:1px solid #e2e8f0" data-bq-editor>
      <label class="flex items-start gap-2 cursor-pointer" style="font-weight:600">
        <input type="checkbox" id="rt2-bloque" ${on ? 'checked' : ''} onchange="document.getElementById('rt2-bloque-dias').style.display = this.checked ? '' : 'none'" style="margin-top:3px">
        <span>Bloque complementario
          <span class="block text-xs font-normal text-slate-500">Un recovery, una movilidad o algo especial que va el MISMO día que la fuerza, sin quitarle el día. El cliente ve primero su fuerza y esto debajo.</span></span>
      </label>
      <div id="rt2-bloque-dias" class="mt-2" style="${on ? '' : 'display:none'}">
        <div class="text-xs text-slate-500 mb-1">¿Qué días? (ninguno = sin día fijo, lo ve en «También en tu ciclo»)</div>
        <div class="flex flex-wrap gap-1">
          ${ENT_DIAS.map(([d, lab]) => `
            <label class="chip" style="cursor:pointer"><input type="checkbox" class="rt2-bloque-dia" value="${d}" ${dias.includes(d) ? 'checked' : ''}> ${escapeHtml(lab)}</label>`).join('')}
          <button type="button" class="btn btn-ghost btn-sm" onclick="document.querySelectorAll('.rt2-bloque-dia').forEach(i => { i.checked = true; })">Todos</button>
        </div>
      </div>
    </div>`;
}

// Lo que se guarda: la marca y, si es bloque, sus días. Al dejar de ser
// bloque se queda sin día (no se apila sobre la fuerza): lo pones en el
// calendario como cualquier rutina.
function bqLeerEditor(r) {
  const caja = document.getElementById('rt2-bloque');
  if (!caja || !r) return {};
  const on = !!caja.checked;
  if (on) return { complementaria: true, dias_semana: [...document.querySelectorAll('.rt2-bloque-dia:checked')].map(i => i.value), dia_semana: null };
  if (entEsBloque(r)) return { complementaria: false, dias_semana: [], dia_semana: null };
  return {};
}
