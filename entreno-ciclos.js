// =====================================================
// DUPLICAR UN CICLO · con tus días, y lo del cliente como PREGUNTA
// =====================================================
// Para armar el ciclo siguiente sin empezar de cero: se copian todas las
// rutinas con sus ejercicios, y cada rutina conserva los días que TÚ le
// pusiste. Esos días se pueden cambiar ahí mismo antes de crear la copia.
//
// Lo que el cliente hizo distinto en su app (mover una rutina de día,
// entrenarla otro día, hacer un día de más) NO se copia solo. Se analiza y
// sale como pregunta, sin marcar:
//   «Movió Push del lunes al martes 3 veces en 4 semanas → ¿pasarlo al martes?»
// Si lo hizo casi siempre, se dice que es recomendable; si fue una vez, que
// fue algo puntual. Tú decides. Así no hay que deshacer nada después.
//
// El ciclo nuevo queda en BORRADOR y sin enviar: el cliente no lo ve hasta
// que le das «Enviar al cliente».
//
// Carga DESPUÉS de entrenamiento.js y eventos.js (usa _ent, entDb, entDiasDe,
// ENT_DIAS y evtSumarDias).

const CICLO_DIAS = 'LMXJVSD';
const CICLO_NOMBRE_DIA = { L: 'lunes', M: 'martes', X: 'miércoles', J: 'jueves', V: 'viernes', S: 'sábado', D: 'domingo' };
const cicloDia = (fecha) => {
  const [y, m, d] = String(fecha).slice(0, 10).split('-').map(Number);
  return CICLO_DIAS[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7];
};
// Lunes de la semana de una fecha (para agrupar por semana).
const cicloLunes = (fecha) => {
  const [y, m, d] = String(fecha).slice(0, 10).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
};
const cicloOrden = (dias) => [...new Set(dias)].sort((a, b) => CICLO_DIAS.indexOf(a) - CICLO_DIAS.indexOf(b));

// ── El análisis ─────────────────────────────────────────────────────────
// rutinas: [{id, nombre, dias}] · movimientos: [{rutina_id, desde, hasta, origen}]
// sesiones: [{rutina_id, fecha, estado}] · actividades: [{fecha, titulo, tipo}]
// semanas: cuántas semanas del ciclo ya pasaron (para decir «3 de 4»).
function cicloAnalizar({ rutinas, movimientos = [], sesiones = [], actividades = [], semanas = 1 }) {
  const porId = Object.fromEntries(rutinas.map(r => [r.id, r]));
  const sug = {};
  const sumar = (tipo, rutinaId, de, a, fecha) => {
    const k = `${tipo}|${rutinaId}|${de}|${a}`;
    const s = sug[k] || (sug[k] = { clave: k, tipo, rutina_id: rutinaId, de, a, fechas: [] });
    s.fechas.push(fecha);
  };

  // 1. Lo que movió a propósito en su calendario.
  const explicadas = new Set();
  movimientos.filter(m => (m.origen || 'cliente') === 'cliente' && porId[m.rutina_id]).forEach(m => {
    const de = cicloDia(m.desde), a = cicloDia(m.hasta);
    if (de === a) return;
    sumar('mover', m.rutina_id, de, a, m.hasta);
    explicadas.add(`${m.rutina_id}|${String(m.hasta).slice(0, 10)}`);
  });

  // 2. Lo que entrenó en un día que no era el suyo (sin haberlo movido).
  const hechas = sesiones.filter(s => s.estado !== 'saltada' && porId[s.rutina_id]);
  hechas.forEach(s => {
    const r = porId[s.rutina_id];
    const d = cicloDia(s.fecha);
    if (!r.dias.length || r.dias.includes(d) || explicadas.has(`${s.rutina_id}|${String(s.fecha).slice(0, 10)}`)) return;
    // ¿Esa semana también la hizo en su día? Entonces fue un día DE MÁS.
    const semana = cicloLunes(s.fecha);
    const tambien = hechas.some(o => o !== s && o.rutina_id === s.rutina_id && cicloLunes(o.fecha) === semana && r.dias.includes(cicloDia(o.fecha)));
    if (tambien) { sumar('agregar', s.rutina_id, null, d, s.fecha); return; }
    // Si no, la corrió: desde el día suyo más cercano ANTES de ese.
    const i = CICLO_DIAS.indexOf(d);
    const de = r.dias.slice().sort((x, y) => ((i - CICLO_DIAS.indexOf(x) + 7) % 7) - ((i - CICLO_DIAS.indexOf(y) + 7) % 7))[0];
    sumar('mover', s.rutina_id, de, d, s.fecha);
  });

  // 3. Días en que registra actividad por su cuenta (fútbol, caminata…) y
  //    no tiene rutina. Solo para tenerlo en cuenta: no cambia nada.
  const conRutina = new Set(rutinas.flatMap(r => r.dias));
  const actPorDia = {};
  actividades.forEach(a => {
    const d = cicloDia(a.fecha);
    if (conRutina.has(d)) return;
    const x = actPorDia[d] || (actPorDia[d] = { semanas: new Set(), que: new Set() });
    x.semanas.add(cicloLunes(a.fecha));
    x.que.add(a.titulo || a.tipo || 'actividad');
  });

  const lista = Object.values(sug).map(s => {
    const veces = new Set(s.fechas.map(f => String(f).slice(0, 10))).size;
    const fuerza = veces >= 2 && veces * 2 >= semanas ? 'recomendado' : veces >= 2 ? 'repetido' : 'puntual';
    return { ...s, veces, fuerza, rutina: porId[s.rutina_id].nombre };
  });
  Object.entries(actPorDia).forEach(([d, x]) => {
    if (x.semanas.size >= 2) lista.push({ clave: `nota|${d}`, tipo: 'nota', a: d, veces: x.semanas.size, fuerza: 'nota', que: [...x.que] });
  });
  const peso = { recomendado: 0, repetido: 1, puntual: 2, nota: 3 };
  return lista.sort((a, b) => peso[a.fuerza] - peso[b.fuerza] || b.veces - a.veces);
}

// Aplica UNA sugerencia a los días de las rutinas. Devuelve los días nuevos
// y lo que había antes en las rutinas que tocó (para poder deshacerla).
function cicloAplicar(dias, s) {
  const nuevo = Object.fromEntries(Object.entries(dias).map(([k, v]) => [k, [...v]]));
  const antes = {};
  const guardar = (id) => { if (!(id in antes)) antes[id] = [...dias[id]]; };
  if (s.tipo === 'mover') {
    guardar(s.rutina_id);
    // Si el día al que va ya lo tiene otra rutina, se intercambian (como al
    // arrastrar en el calendario): nunca quedan dos rutinas el mismo día.
    const otra = Object.keys(nuevo).find(id => id !== s.rutina_id && nuevo[id].includes(s.a));
    if (otra) { guardar(otra); nuevo[otra] = cicloOrden(nuevo[otra].filter(d => d !== s.a).concat(nuevo[s.rutina_id].includes(s.de) ? [s.de] : [])); }
    nuevo[s.rutina_id] = cicloOrden(nuevo[s.rutina_id].filter(d => d !== s.de).concat([s.a]));
  } else if (s.tipo === 'agregar') {
    guardar(s.rutina_id);
    nuevo[s.rutina_id] = cicloOrden(nuevo[s.rutina_id].concat([s.a]));
  }
  return { dias: nuevo, antes };
}

// «Ciclo 2» → «Ciclo 3»; «Fase 1 · Fuerza» → «Fase 2 · Fuerza».
function cicloSiguienteNombre(nombre) {
  const n = String(nombre || '');
  const m = n.match(/\b(ciclo|fase|cycle|bloque)\s*(\d+)/i);
  return m ? n.replace(m[0], `${m[1]} ${Number(m[2]) + 1}`) : `${n} · copia`;
}

function cicloTexto(s) {
  const dia = (d) => CICLO_NOMBRE_DIA[d] || d;
  const veces = `${s.veces} ${s.veces === 1 ? 'vez' : 'veces'}`;
  if (s.tipo === 'mover') return {
    que: `Entrenó «${escapeHtml(s.rutina)}» el ${dia(s.a)} en vez del ${dia(s.de)} (${veces}).`,
    accion: `Pasar «${escapeHtml(s.rutina)}» al ${dia(s.a)}`,
  };
  if (s.tipo === 'agregar') return {
    que: `Hizo «${escapeHtml(s.rutina)}» también el ${dia(s.a)}, además de su día (${veces}).`,
    accion: `Añadir el ${dia(s.a)} a «${escapeHtml(s.rutina)}»`,
  };
  return { que: `Registra actividad por su cuenta los ${dia(s.a)} (${s.veces} semanas: ${escapeHtml(s.que.slice(0, 3).join(', '))}). Tenlo en cuenta al repartir los días.` };
}

const CICLO_ETIQUETA = {
  recomendado: '<span class="tag tag-green">Lo hizo casi siempre · recomendable</span>',
  repetido: '<span class="tag tag-yellow">Se repitió</span>',
  puntual: '<span class="tag tag-gray">Fue puntual</span>',
  nota: '<span class="tag tag-blue">Para tener en cuenta</span>',
};

// ── La ventana ──────────────────────────────────────────────────────────
const _dc = { fase: null, rutinas: [], dias: {}, sugerencias: [], aplicadas: {} };

async function cicloLeer(consulta) {
  try { const { data, error } = await consulta; return error ? [] : (data || []); } catch (e) { return []; }
}

window.entDuplicarCiclo = async (faseId) => {
  const fases = await entDb.fases(_ent.clienteId);
  const f = fases.find(x => x.id === faseId);
  if (!f) return;
  const rutinas = await entDb.rutinasDeFase(faseId);
  const fin = f.fecha_inicio && f.semanas ? evtSumarDias(f.fecha_inicio, f.semanas * 7 - 1) : null;
  const hoy = fmt.hoy();
  const [movimientos, sesiones, actividades] = await Promise.all([
    cicloLeer(sb.from('rutina_movimientos').select('rutina_id,desde,hasta,origen').eq('fase_id', faseId)),
    cicloLeer(sb.from('sesiones').select('rutina_id,fecha,estado').eq('fase_id', faseId)),
    f.fecha_inicio && f.cliente_id
      ? cicloLeer(sb.from('actividades').select('fecha,titulo,tipo').eq('cliente_id', f.cliente_id).gte('fecha', f.fecha_inicio).lte('fecha', fin || hoy))
      : Promise.resolve([]),
  ]);
  // Semanas que ya pasaron del ciclo: «3 de 4» se mide contra lo vivido.
  let semanas = f.semanas || 1;
  if (f.fecha_inicio) {
    const hasta = fin && fin < hoy ? fin : hoy;
    const dias = Math.round((Date.parse(hasta) - Date.parse(f.fecha_inicio)) / 86400000) + 1;
    semanas = Math.max(1, Math.min(f.semanas || 99, Math.ceil(dias / 7)));
  }

  _dc.fase = f;
  _dc.rutinas = rutinas.map(r => ({ id: r.id, nombre: r.nombre, dia_orden: r.dia_orden, dias: entDiasDe(r) }));
  _dc.dias = Object.fromEntries(_dc.rutinas.map(r => [r.id, [...r.dias]]));
  _dc.sugerencias = cicloAnalizar({ rutinas: _dc.rutinas, movimientos, sesiones, actividades, semanas });
  _dc.aplicadas = {};
  _dc.semanas = semanas;

  openModal(modalShell(`Duplicar «${escapeHtml(f.nombre)}»`, `
    <div data-duplicar-ciclo>
      <p class="text-sm text-slate-600 mb-3">Se copian todas las rutinas con sus ejercicios, para que ajustes lo que quieras.
        El ciclo nuevo queda en <b>borrador</b>: tu cliente no lo ve hasta que lo envíes.</p>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div><label>Nombre</label><input id="dc-nombre" value="${escapeHtml(cicloSiguienteNombre(f.nombre))}"></div>
        <div><label>Empieza</label><input id="dc-inicio" type="date" value="${fin ? evtSumarDias(fin, 1) : ''}"></div>
        <div><label>Semanas</label><input id="dc-semanas" type="number" min="1" max="52" value="${f.semanas || 4}"></div>
      </div>
      <div class="sec-title">Los días de cada rutina</div>
      <p class="text-xs text-slate-500 mb-2">Vienen como los armaste tú en este ciclo. Cámbialos aquí si quieres.</p>
      <div id="dc-dias"></div>
      <div class="sec-title mt-4">Lo que hizo tu cliente en este ciclo</div>
      <div id="dc-sugerencias"></div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="entDcGuardar()">Duplicar ciclo</button>`), { wide: true });
  entDcPintar();
};

function entDcPintar() {
  const cajaD = $('#dc-dias'), cajaS = $('#dc-sugerencias');
  if (!cajaD || !cajaS) return;
  cajaD.innerHTML = _dc.rutinas.length ? _dc.rutinas.map(r => `
    <div class="flex items-center gap-2 flex-wrap py-1.5 border-b border-slate-100" data-dc-rutina="${r.id}">
      <div class="min-w-0 flex-1 text-sm"><span class="text-slate-400">Día ${r.dia_orden}</span>
        <span class="font-semibold text-slate-800 ml-1">${escapeHtml(r.nombre)}</span></div>
      <div class="flex gap-1">
        ${ENT_DIAS.map(([d, lab]) => {
          const on = (_dc.dias[r.id] || []).includes(d);
          return `<button type="button" class="chip ${on ? 'active' : ''}" data-dia="${d}" aria-pressed="${on}"
                   onclick="entDcDia('${r.id}','${d}')">${lab}</button>`;
        }).join('')}
      </div>
    </div>`).join('') : '<p class="text-xs text-slate-400">Este ciclo no tiene rutinas.</p>';

  const s = _dc.sugerencias;
  cajaS.innerHTML = !s.length
    ? `<div class="text-sm text-slate-500 bg-slate-50 rounded-lg p-3">Siguió los días tal cual los armaste: no hay nada que ajustar.</div>`
    : `<p class="text-xs text-slate-500 mb-2">Nada de esto se copia solo. Marca lo que quieras aplicar y se refleja arriba.</p>` + s.map((x, i) => {
        const t = cicloTexto(x);
        return `
        <div class="flex gap-3 items-start border border-slate-200 rounded-xl p-3 mb-2" data-sugerencia="${escapeHtml(x.clave)}">
          ${x.tipo === 'nota' ? '<span class="text-lg leading-none">💡</span>' : `
            <input type="checkbox" class="mt-1" id="dc-s-${i}" ${_dc.aplicadas[x.clave] ? 'checked' : ''} onchange="entDcSugerencia(${i}, this.checked)" style="width:auto">`}
          <label for="dc-s-${i}" class="min-w-0 flex-1 cursor-pointer" style="margin:0">
            <div class="text-sm text-slate-800">${t.que}</div>
            ${t.accion ? `<div class="text-sm font-semibold text-slate-900 mt-0.5">¿${t.accion}?</div>` : ''}
            <div class="mt-1">${CICLO_ETIQUETA[x.fuerza]}</div>
          </label>
        </div>`;
      }).join('');
}

window.entDcDia = (rutinaId, d) => {
  const act = _dc.dias[rutinaId] || [];
  _dc.dias[rutinaId] = act.includes(d) ? act.filter(x => x !== d) : cicloOrden(act.concat([d]));
  entDcPintar();
};

window.entDcSugerencia = (i, si) => {
  const s = _dc.sugerencias[i];
  if (!s || s.tipo === 'nota') return;
  if (si) {
    const r = cicloAplicar(_dc.dias, s);
    _dc.dias = r.dias;
    _dc.aplicadas[s.clave] = r.antes;
  } else if (_dc.aplicadas[s.clave]) {
    Object.assign(_dc.dias, _dc.aplicadas[s.clave]);
    delete _dc.aplicadas[s.clave];
  }
  entDcPintar();
};

window.entDcGuardar = async () => {
  const f = _dc.fase;
  const nombre = ($('#dc-nombre')?.value || '').trim();
  if (!nombre) return toast('El ciclo necesita un nombre');
  const semanas = Number($('#dc-semanas')?.value) || f.semanas || 4;
  const sinDias = _dc.rutinas.filter(r => !(_dc.dias[r.id] || []).length);
  if (sinDias.length && !confirm(`${sinDias.map(r => `«${r.nombre}»`).join(', ')} ${sinDias.length === 1 ? 'queda' : 'quedan'} sin día. ¿Duplicar igual?`)) return;

  const nueva = await entDb.copiarFase(f.id, f.cliente_id, $('#dc-inicio')?.value || null, nombre);
  if (!nueva) return;
  // Los días se escriben aquí, rutina por rutina: son los de esta ventana
  // (los tuyos, más lo que hayas aceptado del cliente), no los que traiga
  // la copia.
  const copiadas = await entDb.rutinasDeFase(nueva);
  const deOrigen = Object.fromEntries(copiadas.map(r => [r.origen_rutina_id, r.id]));
  for (const r of _dc.rutinas) {
    const id = deOrigen[r.id];
    if (id) await entDb.actualizarRutina(id, { dias_semana: _dc.dias[r.id] || [] });
  }
  await entDb.actualizarFase(nueva, {
    semanas, dias_semana: cicloOrden(Object.values(_dc.dias).flat()),
    estado: 'borrador', updated_at: new Date().toISOString(),
  });
  const n = Object.keys(_dc.aplicadas).length;
  closeModal();
  toast(`✓ «${nombre}» creado en borrador${n ? ` · ${n} ajuste${n === 1 ? '' : 's'} del cliente aplicado${n === 1 ? '' : 's'}` : ''}`);
  entVistaClientes();
};
