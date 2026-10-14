// =====================================================
// FUERZA DE UN SOLO DÍA · y mover / poner / quitar en grupo
// =====================================================
// El plan se arma por día de la semana («Push los lunes»), y eso sigue igual.
// Esto añade lo de UNA fecha, sin tocar las otras semanas:
//   · mover este lunes al miércoles     → rutina_movimientos (origen 'coach')
//   · poner Lower este sábado libre     → rutina_extras      (origen 'coach')
//   · quitar la fuerza de este viernes  → rutina_dias_quitados
// Son las mismas tablas que lee la app del cliente (api/_entreno.js,
// rutinaPorFecha), así que el calendario del CRM y el de la app dicen lo
// mismo, también lo que movió o añadió el cliente.
//
// Al arrastrar o quitar algo que se repite, se pregunta: ¿solo este día o
// todos los lunes del ciclo? Lo mismo vale para el cardio y los deportes.
//
// Lo que el cliente ya entrenó no se mueve ni se quita: es su registro.
//
// Carga DESPUÉS de entrenamiento.js y eventos.js (usa _ent, entDb, entDiasDe,
// evtSumarDias, evtCodigoDe, evtFechasDe, evtDb…).
// =====================================================

// ── La regla: qué rutina cae cada fecha ─────────────────────────────────
// ESPEJO de rutinaPorFecha en mealtracker/api/_entreno.js (hay una prueba que
// compara las dos). `porDia`: { L: rutina|null, … } (el plan semanal).
function entRutinaPorFechaDia(fase, porDia, movimientos = [], extras = [], quitados = []) {
  const fin = fase?.fecha_inicio && fase?.semanas ? evtSumarDias(fase.fecha_inicio, fase.semanas * 7 - 1) : null;
  const base = (fecha) => {
    if (!fase?.fecha_inicio || fecha < fase.fecha_inicio || (fin && fecha > fin)) return null;
    return porDia[evtCodigoDe(fecha)] || null;
  };
  const mapa = {}, delCoach = {};
  const ver = (f) => (f in mapa ? mapa[f] : base(f));
  [
    ...(movimientos || []).map(mv => ({ t: String(mv.created_at || ''), mv })),
    ...(quitados || []).map(q => ({ t: String(q.created_at || ''), q })),
  ].sort((a, b) => a.t.localeCompare(b.t))
    .forEach(({ mv, q }) => {
      if (q) {
        const f = String(q.fecha || '').slice(0, 10);
        if (f) { mapa[f] = null; delCoach[f] = true; }
        return;
      }
      const desde = String(mv.desde).slice(0, 10), hasta = String(mv.hasta).slice(0, 10);
      const r = ver(desde);
      if (!r || r.id !== mv.rutina_id || desde === hasta) return;
      const otra = ver(hasta);
      mapa[hasta] = r;
      mapa[desde] = otra;
      delCoach[hasta] = delCoach[desde] = mv.origen === 'coach';
    });
  const extra = {}, extraCoach = {};
  (extras || []).forEach(x => { if (x && x.rutina && x.fecha) { extra[x.fecha] = x.rutina; extraCoach[x.fecha] = x.origen === 'coach'; } });
  const fn = (fecha) => ver(fecha) || extra[fecha] || null;
  fn.movida = (fecha) => fecha in mapa && !delCoach[fecha] && (mapa[fecha]?.id || null) !== (base(fecha)?.id || null);
  fn.extra = (fecha) => !ver(fecha) && !!extra[fecha];
  fn.extraDelCliente = (fecha) => fn.extra(fecha) && !extraCoach[fecha];
  // Solo para el CRM: ¿ese día es distinto del plan semanal, y por quién?
  fn.base = base;
  fn.cambio = (fecha) => (fn(fecha)?.id || null) !== (base(fecha)?.id || null);
  fn.quien = (fecha) => {
    if (!fn.cambio(fecha)) return null;
    if (fn.extra(fecha)) return extraCoach[fecha] ? 'coach' : 'cliente';
    return delCoach[fecha] ? 'coach' : 'cliente';
  };
  fn.quitado = (fecha) => fecha in mapa && mapa[fecha] === null && !!delCoach[fecha] && !extra[fecha];
  return fn;
}

// El plan semanal como { L: rutina|null }, a partir del reparto del CRM.
const fzPorDia = (fase, rutinas) => {
  const { porDia } = entRepartirRutinas(fase, rutinas);
  return Object.fromEntries(Object.entries(porDia).map(([d, s]) => [d, s ? s.r : null]));
};

const FZ_SQL = 'carga/migracion-fuerza-por-dia.sql';

// ── Datos ───────────────────────────────────────────────────────────────
const fzDb = {
  // Lo que cambió UN día en esta fase (coach y cliente). Cada tabla puede no
  // existir todavía: entonces no hay cambios de ese tipo.
  async cambios(faseId) {
    const leer = async (q) => { try { const { data, error } = await q; return error ? null : (data || []); } catch (e) { return null; } };
    let [movimientos, extras, quitados] = await Promise.all([
      leer(sb.from('rutina_movimientos').select('id,rutina_id,desde,hasta,origen,created_at').eq('fase_id', faseId)),
      leer(sb.from('rutina_extras').select('id,rutina_id,fecha,origen').eq('fase_id', faseId)),
      leer(sb.from('rutina_dias_quitados').select('id,fecha,rutina_id,created_at').eq('fase_id', faseId)),
    ]);
    // Sin la columna `origen` (migración sin correr): todas del cliente.
    if (extras === null) extras = (await leer(sb.from('rutina_extras').select('id,rutina_id,fecha').eq('fase_id', faseId))) || [];
    return { movimientos: movimientos || [], extras, quitados: quitados || [], sinTablaQuitados: quitados === null };
  },
  async mover(fase, rutinaId, desde, hasta) {
    const { error } = await sb.from('rutina_movimientos').insert({ cliente_id: fase.cliente_id, fase_id: fase.id, rutina_id: rutinaId, desde, hasta, origen: 'coach' });
    if (error) { toast('No pude moverla: ' + error.message); return false; }
    return true;
  },
  async ponerExtra(fase, rutinaId, fecha) {
    await sb.from('rutina_extras').delete().eq('cliente_id', fase.cliente_id).eq('fecha', fecha);
    const { error } = await sb.from('rutina_extras').insert({ cliente_id: fase.cliente_id, fase_id: fase.id, rutina_id: rutinaId, fecha, origen: 'coach' });
    if (error) { toast(/origen|rutina_extras/.test(error.message || '') ? `Para poner fuerza un solo día falta correr ${FZ_SQL} en Supabase` : error.message); return false; }
    return true;
  },
  async quitarExtra(fase, fecha) {
    const { error } = await sb.from('rutina_extras').delete().eq('cliente_id', fase.cliente_id).eq('fecha', fecha);
    if (error) { toast(error.message); return false; }
    return true;
  },
  async quitarDia(fase, rutinaId, fecha) {
    await sb.from('rutina_dias_quitados').delete().eq('cliente_id', fase.cliente_id).eq('fecha', fecha);
    const { error } = await sb.from('rutina_dias_quitados').insert({ cliente_id: fase.cliente_id, fase_id: fase.id, rutina_id: rutinaId || null, fecha });
    if (error) { toast(/rutina_dias_quitados/.test(error.message || '') ? `Para quitar la fuerza de un solo día falta correr ${FZ_SQL} en Supabase` : error.message); return false; }
    return true;
  },
  async devolverDia(fase, fecha) {
    const { error } = await sb.from('rutina_dias_quitados').delete().eq('cliente_id', fase.cliente_id).eq('fecha', fecha);
    if (error) { toast(error.message); return false; }
    return true;
  },
};

// ── Estado del calendario abierto ──────────────────────────────────────
// entPintarCalendario lo llama con lo que leyó; así arrastrar y el panel del
// día saben qué hay cada fecha sin volver a leer.
window.fzPreparar = async (fase, rutinas) => {
  if (!fase) { _ent.rutinaDe = null; return null; }
  const c = await fzDb.cambios(fase.id);
  const porId = Object.fromEntries((rutinas || []).map(r => [r.id, r]));
  const extras = (c.extras || []).filter(x => porId[x.rutina_id]).map(x => ({ fecha: String(x.fecha).slice(0, 10), rutina: porId[x.rutina_id], origen: x.origen || 'cliente' }));
  _ent.cambiosDia = c;
  _ent.rutinaDe = entRutinaPorFechaDia(fase, fzPorDia(fase, rutinas), c.movimientos, extras, c.quitados);
  return _ent.rutinaDe;
};

const fzCorta = (f) => (fmt.fechaCorta ? fmt.fechaCorta(f) : f);
const fzPlural = (codigo) => (typeof ENT_DIA_PLURAL !== 'undefined' && ENT_DIA_PLURAL[codigo]) || codigo;
const fzFin = (fase) => (fase?.fecha_inicio && fase?.semanas ? evtSumarDias(fase.fecha_inicio, fase.semanas * 7 - 1) : null);
const fzEnFase = (fase, f) => !!fase?.fecha_inicio && f >= fase.fecha_inicio && (!fzFin(fase) || f <= fzFin(fase));
// ¿Ese día ya entrenó (o está entrenando)? Eso no se mueve ni se quita.
const fzEntreno = (f) => ((_ent.sesionesPorFecha || {})[f] || []).some(s => s.estado === 'completada' || s.estado === 'en_curso');

function fzRepintar() {
  if ($('#modal-content [data-dia-panel]') || $('#modal-content [data-fz-alcance]')) closeModal();
  entVistaClientes();
}

// ── ¿Solo este día o todos los lunes? ──────────────────────────────────
const _fz = { alc: null };
window.fzAlcance = ({ titulo, texto = '', solo, todos }) => {
  _fz.alc = { solo: solo.hacer, todos: todos ? todos.hacer : null };
  openModal(modalShell(titulo, `
    <div data-fz-alcance>
      ${texto ? `<p class="text-sm text-slate-600 mb-3">${texto}</p>` : ''}
      <div class="grid gap-2">
        <button type="button" class="btn btn-primary" data-fz-solo onclick="fzAlcanceElegir('solo')" style="justify-content:flex-start;text-align:left">
          <span><b>Solo este día</b><br><span class="text-xs" style="opacity:.85">${solo.txt}</span></span></button>
        ${todos ? `
        <button type="button" class="btn btn-secondary" data-fz-todos onclick="fzAlcanceElegir('todos')" style="justify-content:flex-start;text-align:left">
          <span><b>${todos.titulo}</b><br><span class="text-xs text-slate-500">${todos.txt}</span></span></button>` : ''}
      </div>
    </div>`, `<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>`));
};
window.fzAlcanceElegir = async (cual) => {
  const f = _fz.alc && _fz.alc[cual];
  _fz.alc = null;
  closeModal();
  if (f) await f();
};

// ── Fuerza: las acciones de UN día ─────────────────────────────────────
// Devuelven true si cambiaron algo (para el lote) y avisan si no se pudo.
async function fzMoverUnDia(rutina, desde, hasta, { silencio = false } = {}) {
  const fase = _ent.faseCache, rd = _ent.rutinaDe;
  if (!fase || !rd || desde === hasta) return false;
  if (!fzEnFase(fase, hasta)) { if (!silencio) toast('Ese día está fuera del ciclo'); return false; }
  if (fzEntreno(desde) || fzEntreno(hasta)) { if (!silencio) toast('Ese día ya lo entrenó: queda en su registro'); return false; }
  const ahi = rd(hasta);
  if (rd.extra(desde)) {
    // Una puesta solo ese día se pasa al otro (si está libre).
    if (ahi) { if (!silencio) toast(`El ${fzCorta(hasta)} ya tiene ${ahi.nombre}: quítala primero`); return false; }
    return (await fzDb.quitarExtra(fase, desde)) && (await fzDb.ponerExtra(fase, rutina.id, hasta));
  }
  // Si en el destino había una puesta solo ese día, deja de valer.
  if (ahi && rd.extra(hasta)) await fzDb.quitarExtra(fase, hasta);
  return fzDb.mover(fase, rutina.id, desde, hasta);
}

async function fzQuitarUnDia(fecha, { silencio = false } = {}) {
  const fase = _ent.faseCache, rd = _ent.rutinaDe;
  if (!fase || !rd || !rd(fecha)) return false;
  if (fzEntreno(fecha)) { if (!silencio) toast('Ese día ya lo entrenó: queda en su registro'); return false; }
  if (rd.extra(fecha)) return fzDb.quitarExtra(fase, fecha);
  return fzDb.quitarDia(fase, rd(fecha).id, fecha);
}

async function fzPonerUnDia(rutina, fecha, { silencio = false } = {}) {
  const fase = _ent.faseCache, rd = _ent.rutinaDe;
  if (!fase || !rd) return false;
  if (!fzEnFase(fase, fecha)) { if (!silencio) toast('Ese día está fuera del ciclo'); return false; }
  if (fzEntreno(fecha)) { if (!silencio) toast('Ese día ya lo entrenó: queda en su registro'); return false; }
  const ahi = rd(fecha);
  if (ahi && ahi.id === rutina.id) return false;
  // Si había una del plan, ese día deja de tenerla; la nueva va puesta.
  if (ahi && !rd.extra(fecha) && !(await fzDb.quitarDia(fase, ahi.id, fecha))) return false;
  return fzDb.ponerExtra(fase, rutina.id, fecha);
}

// Volver ese día a lo del plan semanal (deshace un quitado o una puesta).
window.fzDevolverDia = async (fecha) => {
  const fase = _ent.faseCache, rd = _ent.rutinaDe;
  if (!fase || !rd) return;
  if (fzEntreno(fecha)) return toast('Ese día ya lo entrenó: queda en su registro');
  if (rd.extra(fecha)) await fzDb.quitarExtra(fase, fecha);
  if ((_ent.cambiosDia?.quitados || []).some(q => String(q.fecha).slice(0, 10) === fecha)) await fzDb.devolverDia(fase, fecha);
  toast(`${fzCorta(fecha)}: como en el plan`);
  fzRepintar();
};

// ── Fuerza: las de TODA la semana (plan semanal) ────────────────────────
// Sin preguntar ni repintar: las usan el arrastre, el panel y el lote.
async function fzSemanalQuitar(r, codigo) {
  const rutinas = _ent.rutinasCache || [], fase = _ent.faseCache;
  if (entDiasDe(r).includes(codigo)) {
    await entDb.actualizarRutina(r.id, { dias_semana: entDiasDe(r).filter(d => d !== codigo), dia_semana: null });
    r.dias_semana = entDiasDe(r).filter(d => d !== codigo); r.dia_semana = null;
  }
  // Que ese día quede libre de verdad: si ninguna rutina lo tiene, sale de los
  // días de la fase (si no, otra rutina sin día se acomodaría ahí sola).
  if (fase && !rutinas.some(x => x.id !== r.id && (typeof entEsBloque !== 'function' || !entEsBloque(x)) && entDiasDe(x).includes(codigo)) && (fase.dias_semana || []).includes(codigo)) {
    fase.dias_semana = (fase.dias_semana || []).filter(d => d !== codigo);
    await entDb.actualizarFase(fase.id, { dias_semana: fase.dias_semana });
  }
}

async function fzSemanalPoner(r, codigo) {
  const rutinas = _ent.rutinasCache || [], fase = _ent.faseCache;
  // Una rutina por día: la que estaba ahí deja ese día (sus otros días siguen).
  const ocupan = rutinas.filter(x => x.id !== r.id && (typeof entEsBloque !== 'function' || !entEsBloque(x)) && entDiasDe(x).includes(codigo));
  for (const o of ocupan) {
    const ds = entDiasDe(o).filter(d => d !== codigo);
    await entDb.actualizarRutina(o.id, { dias_semana: ds, dia_semana: null });
    o.dias_semana = ds; o.dia_semana = null;
  }
  const ds = entOrdenDias([...entDiasDe(r), codigo]);
  await entDb.actualizarRutina(r.id, { dias_semana: ds, dia_semana: null });
  r.dias_semana = ds; r.dia_semana = null;
  if (fase && !(fase.dias_semana || []).includes(codigo)) {
    fase.dias_semana = entOrdenDias([...(fase.dias_semana || []), codigo]);
    await entDb.actualizarFase(fase.id, { dias_semana: fase.dias_semana });
  }
  return ocupan;
}

// Mover el lunes de una rutina al miércoles, en todo el ciclo. Si el
// miércoles lo tenía otra, se intercambian (nunca dos apiladas).
async function fzSemanalMover(r, desde, destino) {
  const rutinas = _ent.rutinasCache || [];
  const mover = (dias, quita, pon) => {
    const s = new Set(dias);
    if (quita) s.delete(quita);
    s.add(pon);
    return entOrdenDias([...s]);
  };
  const ocupa = rutinas.find(x => x.id !== r.id && (typeof entEsBloque !== 'function' || !entEsBloque(x)) && entDiasDe(x).includes(destino));
  const nuevos = mover(entDiasDe(r), desde, destino);
  await entDb.actualizarRutina(r.id, { dias_semana: nuevos });
  if (ocupa && desde) {
    await entDb.actualizarRutina(ocupa.id, { dias_semana: mover(entDiasDe(ocupa), destino, desde) });
  } else if (ocupa) {
    // Venía de "sugerida" (sin día propio): la otra rutina solo pierde el día.
    await entDb.actualizarRutina(ocupa.id, { dias_semana: entDiasDe(ocupa).filter(d => d !== destino) });
  }
  return ocupa || null;
}

// ── Desde el calendario ────────────────────────────────────────────────
// Soltar una rutina en otro día.
window.fzSoltarRutina = (rutinaId, desdeFecha, desdeCodigo, hastaFecha) => {
  const r = (_ent.rutinasCache || []).find(x => x.id === rutinaId);
  const rd = _ent.rutinaDe;
  if (!r) return entVistaClientes();
  const destino = evtCodigoDe(hastaFecha);
  const semanal = async () => {
    const otra = await fzSemanalMover(r, desdeCodigo, destino);
    toast(otra ? `${r.nombre} ↔ ${otra.nombre} (todo el ciclo)` : `${r.nombre} → todos los ${fzPlural(destino)}`);
    fzRepintar();
  };
  // Desde la lista de «sin día» no hay fecha: es el plan semanal.
  if (!desdeFecha) return semanal();
  if (desdeFecha === hastaFecha) return entVistaClientes();
  const delPlan = rd && !rd.cambio(desdeFecha) && entDiasDe(r).includes(desdeCodigo);
  fzAlcance({
    titulo: `Mover ${escapeHtml(r.nombre)}`,
    solo: {
      txt: `${fzCorta(desdeFecha)} → ${fzCorta(hastaFecha)}. Las otras semanas siguen igual.`,
      hacer: async () => {
        if (await fzMoverUnDia(r, desdeFecha, hastaFecha)) { toast(`${r.nombre}: ${fzCorta(desdeFecha)} → ${fzCorta(hastaFecha)}`); fzRepintar(); }
        else entVistaClientes();
      },
    },
    todos: delPlan && desdeCodigo !== destino ? {
      titulo: `Todos los ${fzPlural(desdeCodigo)} → ${fzPlural(destino)}`,
      txt: 'Cambia el plan de todo el ciclo.',
      hacer: semanal,
    } : null,
  });
};

// La ✕ de una rutina en el calendario.
window.fzQuitarRutina = (rutinaId, fecha) => {
  const r = (_ent.rutinasCache || []).find(x => x.id === rutinaId);
  const rd = _ent.rutinaDe;
  if (!r) return;
  const codigo = evtCodigoDe(fecha);
  const delPlan = !rd || (!rd.cambio(fecha) && entDiasDe(r).includes(codigo));
  fzAlcance({
    titulo: `Quitar ${escapeHtml(r.nombre)}`,
    solo: {
      txt: `Solo el ${fzCorta(fecha)}. Las otras semanas siguen igual.`,
      hacer: async () => { if (await fzQuitarUnDia(fecha)) { toast(`${r.nombre}: quitada el ${fzCorta(fecha)}`); fzRepintar(); } },
    },
    todos: delPlan ? {
      titulo: `Todos los ${fzPlural(codigo)} del ciclo`,
      txt: 'Cambia el plan de todo el ciclo.',
      hacer: async () => { await fzSemanalQuitar(r, codigo); toast(`${r.nombre}: ya no va los ${fzPlural(codigo)}`); fzRepintar(); },
    } : null,
  });
};

// Desde el panel del día.
window.fzPanelPonerSolo = async (fecha) => {
  const r = (_ent.rutinasCache || []).find(x => x.id === $('#dia-rutina-solo')?.value);
  if (!r) return;
  if (await fzPonerUnDia(r, fecha)) { toast(`${r.nombre} el ${fzCorta(fecha)}`); fzRepintar(); }
};
window.fzPanelMoverSolo = async (fecha) => {
  const rd = _ent.rutinaDe, r = rd && rd(fecha);
  const hasta = $('#dia-mover-a')?.value;
  if (!r) return;
  if (!hasta) return toast('Elige a qué día');
  if (await fzMoverUnDia(r, fecha, hasta)) { toast(`${r.nombre}: ${fzCorta(fecha)} → ${fzCorta(hasta)}`); fzRepintar(); }
};
window.fzPanelQuitarSolo = async (fecha) => {
  const rd = _ent.rutinaDe, r = rd && rd(fecha);
  if (r && await fzQuitarUnDia(fecha)) { toast(`${r.nombre}: quitada el ${fzCorta(fecha)}`); fzRepintar(); }
};

// La parte de fuerza del panel del día: «solo este día» y «todos los lunes».
window.fzPanelFuerza = (fecha) => {
  const fase = _ent.faseCache, rd = _ent.rutinaDe;
  const rutinas = _ent.rutinasCache || [];
  if (!fase || !fzEnFase(fase, fecha)) return '';
  const codigo = evtCodigoDe(fecha), plural = fzPlural(codigo);
  const r = rd ? rd(fecha) : null;
  const delPlan = rd ? rd.base(fecha) : null;
  const quien = rd ? rd.quien(fecha) : null;
  const entreno = fzEntreno(fecha);
  const opciones = (excluir) => rutinas.filter(x => x.id !== excluir && (typeof entEsBloque !== 'function' || !entEsBloque(x))).map(x => `<option value="${x.id}">${escapeHtml(x.nombre)}${entDiasDe(x).length ? ` · ${escapeHtml(entDiasTexto(x))}` : ''}</option>`).join('');
  const nota = quien === 'cliente' ? (rd.extra(fecha) ? 'La añadió tu cliente desde su app.' : 'Tu cliente la movió a este día desde su app.')
    : quien === 'coach' ? (r ? `Cambiado solo este día (el plan dice ${delPlan ? escapeHtml(delPlan.nombre) : 'descanso'}).` : `Quitada solo este día (el plan dice ${escapeHtml(delPlan?.nombre || '—')}).`)
    : '';
  const deshacer = quien === 'coach' && (rd.extra(fecha) || rd.quitado(fecha) || (!r && delPlan));
  return `
    <div data-dia-fuerza class="rounded-xl p-3 mb-3" style="background:#f1f5f9">
      <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Fuerza</div>
      ${r ? `
        <div class="flex items-center gap-2 mb-1">
          <div class="flex-1 min-w-0 text-sm font-bold text-slate-800 truncate">${escapeHtml(r.nombre)}</div>
          <button class="btn btn-ghost btn-sm" onclick="closeModal(); entAbrirRutinaDesdeCalendario('${r.id}')">Abrir</button>
        </div>` : '<div class="text-sm text-slate-500 mb-1">Este día no tiene rutina de fuerza.</div>'}
      ${nota ? `<div class="text-xs text-slate-500 mb-2">${nota}${deshacer ? ` <button class="btn btn-ghost btn-sm" data-fz-devolver onclick="fzDevolverDia('${fecha}')">↺ Volver al plan</button>` : ''}</div>` : ''}
      ${entreno ? `<div class="text-xs text-emerald-700 mb-1">Ese día ya entrenó: queda en su registro y no se cambia.</div>${fzPanelSesiones(fecha)}` : `
      <div class="rounded-lg bg-white p-2 mb-2" data-fz-solo-dia>
        <div class="text-[11px] font-semibold text-slate-500 mb-1.5">Solo el ${fzCorta(fecha)}</div>
        ${r ? `
          <div class="flex gap-2 items-center flex-wrap mb-1.5">
            <input id="dia-mover-a" type="date" class="!w-auto text-sm" min="${fase.fecha_inicio}" ${fzFin(fase) ? `max="${fzFin(fase)}"` : ''}>
            <button class="btn btn-secondary btn-sm" data-fz-mover-solo onclick="fzPanelMoverSolo('${fecha}')">Mover a ese día</button>
            <button class="btn btn-ghost btn-sm text-red-600" data-fz-quitar-solo onclick="fzPanelQuitarSolo('${fecha}')">✕ Quitar solo este día</button>
          </div>` : ''}
        ${rutinas.filter(x => !r || x.id !== r.id).length ? `
          <div class="flex gap-2 items-center">
            <select id="dia-rutina-solo" class="flex-1 min-w-0 text-sm">${opciones(r?.id)}</select>
            <button class="btn btn-secondary btn-sm" data-fz-poner-solo onclick="fzPanelPonerSolo('${fecha}')">${r ? 'Cambiar solo este día' : 'Poner solo este día'}</button>
          </div>` : ''}
      </div>`}
      <div class="rounded-lg bg-white p-2" data-fz-semana>
        <div class="text-[11px] font-semibold text-slate-500 mb-1.5">Todos los ${plural} del ciclo</div>
        ${delPlan ? `
          <div class="flex items-center gap-2 mb-1.5">
            <div class="flex-1 min-w-0 text-sm text-slate-700 truncate">Plan: <b>${escapeHtml(delPlan.nombre)}</b></div>
            <button class="btn btn-ghost btn-sm text-red-600" data-dia-quitar-rutina onclick="entQuitarRutinaDia('${delPlan.id}', '${codigo}')">✕ Quitar</button>
          </div>` : '<div class="text-xs text-slate-500 mb-1.5">Los ' + plural + ' no tienen rutina en el plan.</div>'}
        ${rutinas.filter(x => !delPlan || x.id !== delPlan.id).length ? `
          <div class="flex gap-2 items-center">
            <select id="dia-rutina" class="flex-1 min-w-0 text-sm">${opciones(delPlan?.id)}</select>
            <button class="btn btn-secondary btn-sm" data-dia-poner-rutina onclick="entPonerRutinaDia($('#dia-rutina').value, '${codigo}')">${delPlan ? 'Cambiar por esta' : 'Poner'}</button>
          </div>` : (rutinas.length ? '' : '<div class="text-xs text-slate-500">Esta fase todavía no tiene rutinas: créalas en «Rutinas».</div>')}
      </div>
    </div>`;
};

// ── Corregir lo que el cliente marcó ──────────────────────────────────────
// Un cliente marca una rutina como hecha sin haberla hecho, o la marca el
// día equivocado, y te pide arreglarlo. Aquí se quita ESA sesión (con las
// series que marcó: eran datos falsos) o se mueve a otro día. Solo esa
// sesión; nada más se toca. En su app vuelve a salir como pendiente (o en
// el día nuevo) y los aros se recalculan solos.
const fzSemanaISO = (fecha) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const y = d.getUTCFullYear();
  const ene1 = new Date(Date.UTC(y, 0, 1));
  const w = Math.ceil(((d - ene1) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
};
const fzEstadoSesion = (s) => (s.estado === 'completada' ? '✓ marcada como hecha' : s.estado === 'saltada' ? 'saltada' : '◐ abierta sin cerrar');
window.fzPanelSesiones = (fecha) => {
  const ses = ((_ent.sesionesPorFecha || {})[fecha] || []).filter(s => s.estado !== 'saltada');
  if (!ses.length) return '';
  const fase = _ent.faseCache;
  const rutinas = _ent.rutinasCache || [];
  const nombre = (s) => s.rutinas?.nombre || rutinas.find(r => r.id === s.rutina_id)?.nombre || 'Entreno';
  return `
    <div class="rounded-lg bg-white p-2 mb-2" data-fz-sesiones>
      <div class="text-[11px] font-semibold text-slate-500 mb-1.5">Si se equivocó al marcar</div>
      ${ses.map(s => `
        <div class="flex gap-2 items-center flex-wrap py-1.5 border-t border-slate-100 first:border-t-0" data-fz-sesion="${s.id}">
          <div class="flex-1 min-w-0 text-sm text-slate-700 truncate"><b>${escapeHtml(nombre(s))}</b> · ${fzEstadoSesion(s)}</div>
          <input id="ses-mover-a-${s.id}" type="date" class="!w-auto text-sm" value="${fecha}" ${fase?.fecha_inicio ? `min="${fase.fecha_inicio}"` : ''}>
          <button class="btn btn-secondary btn-sm" data-fz-mover-sesion onclick="fzMoverSesion('${s.id}', '${fecha}')">Mover a ese día</button>
          <button class="btn btn-ghost btn-sm text-red-600" data-fz-quitar-sesion onclick="fzQuitarSesion('${s.id}', '${fecha}')">✕ Quitar este entreno</button>
        </div>`).join('')}
      <div class="text-[11px] text-slate-500 mt-1.5">Quitar borra ese entreno con las series que marcó. Mover lo pasa a otro día con todo lo que marcó. Solo ese entreno; lo demás no se toca.</div>
    </div>`;
};
async function fzSesionDe(id, fecha) {
  const local = ((_ent.sesionesPorFecha || {})[fecha] || []).find(s => s.id === id);
  if (local) return local;
  const { data } = await sb.from('sesiones').select('id, fecha, estado, rutina_id, fase_id, rutinas(nombre)').eq('id', id).limit(1);
  return data && data[0] ? data[0] : null;
}
function fzSesionCambiada() {
  // Repintar lo que esté a la vista: el calendario (sin esperar el minuto)
  // y la pestaña «Lo que entrenó».
  if (typeof closeModal === 'function') closeModal();
  if (typeof _ent.calTick === 'function') _ent.calTick();
  if (_ent.subtab === 'sesiones' && typeof entVistaClientes === 'function') entVistaClientes();
}
window.fzQuitarSesion = async (id, fecha) => {
  const s = await fzSesionDe(id, fecha);
  if (!s) { toast('No encontré ese entreno.'); return; }
  const nombre = s.rutinas?.nombre || (_ent.rutinasCache || []).find(r => r.id === s.rutina_id)?.nombre || 'ese entreno';
  if (!confirm(`¿Quitar «${nombre}» del ${fzCorta(s.fecha || fecha)}?\n\nSe borra ese entreno con las series, el peso y el esfuerzo que marcó ese día. Solo ese entreno. No se puede deshacer.`)) return;
  const r1 = await sb.from('series_log').delete().eq('sesion_id', id);
  if (r1.error) { toast('No pude quitarlo: ' + r1.error.message); return; }
  const r2 = await sb.from('sesiones').delete().eq('id', id);
  if (r2.error) { toast('No pude quitarlo: ' + r2.error.message); return; }
  const f = s.fecha || fecha;
  if (_ent.sesionesPorFecha && _ent.sesionesPorFecha[f]) _ent.sesionesPorFecha[f] = _ent.sesionesPorFecha[f].filter(x => x.id !== id);
  toast(`Entreno quitado. En su app vuelve a salir como pendiente.`);
  fzSesionCambiada();
};
window.fzMoverSesion = async (id, fecha, destinoDado = null) => {
  const s = await fzSesionDe(id, fecha);
  if (!s) { toast('No encontré ese entreno.'); return; }
  const destino = destinoDado || document.getElementById(`ses-mover-a-${id}`)?.value;
  if (!destino || !/^\d{4}-\d{2}-\d{2}$/.test(destino)) { toast('Elige el día al que lo mueves.'); return; }
  const origen = s.fecha || fecha;
  if (destino === origen) { toast('Es el mismo día.'); return; }
  if (destino > fmt.hoy()) { toast('No se puede mover a un día que no ha llegado.'); return; }
  // Una sola sesión por rutina y día (así está la base): si ese día ya tiene
  // una de la misma rutina, se avisa en vez de fallar a medias.
  const enDestino = ((_ent.sesionesPorFecha || {})[destino] || []).some(x => x.rutina_id && x.rutina_id === s.rutina_id);
  if (enDestino) { toast(`Ese día ya tiene un entreno de esa rutina.`); return; }
  const fase = (_ent.fases || []).find(f => f.id === s.fase_id) || _ent.faseCache;
  const cambios = { fecha: destino, semana_iso: fzSemanaISO(destino) };
  if (fase?.fecha_inicio) {
    const dias = Math.floor((Date.parse(`${destino}T12:00:00Z`) - Date.parse(`${fase.fecha_inicio}T12:00:00Z`)) / 86400000);
    if (dias >= 0) cambios.semana_num = Math.floor(dias / 7) + 1;
  }
  const { error } = await sb.from('sesiones').update(cambios).eq('id', id);
  if (error) { toast('No pude moverlo: ' + (error.code === '23505' ? 'ese día ya tiene un entreno de esa rutina.' : error.message)); return; }
  if (_ent.sesionesPorFecha) {
    _ent.sesionesPorFecha[origen] = (_ent.sesionesPorFecha[origen] || []).filter(x => x.id !== id);
    (_ent.sesionesPorFecha[destino] ||= []).push({ ...s, ...cambios });
  }
  toast(`Entreno movido al ${fzCorta(destino)}.`);
  fzSesionCambiada();
};

// ── Cardio y deportes: todos los lunes de una serie ─────────────────────
// Lo que el cliente ya marcó no se toca: si ese día de la semana tiene
// marcas, se cambian solo las fechas que faltan (de hoy en adelante).
async function fzEventoSemanalMover(ev, desde, destino) {
  const fase = (_ent.fases || []).find(f => f.id === ev.fase_id) || _ent.faseCache;
  const marcadosDia = evtMarcados(ev).filter(f => evtCodigoDe(f) === desde);
  if (!marcadosDia.length) {
    const ds = entOrdenDias((ev.dias_semana || []).filter(d => d !== desde).concat([destino]));
    // Los días quitados de ese lunes se corren con él.
    const delta = 'LMXJVSD'.indexOf(destino) - 'LMXJVSD'.indexOf(desde);
    const fuera = (ev.fechas_excluidas || []).map(f => String(f).slice(0, 10)).map(f => (evtCodigoDe(f) === desde ? evtSumarDias(f, delta) : f));
    const fila = { dias_semana: ds };
    if ((ev.fechas_excluidas || []).length) fila.fechas_excluidas = [...new Set(fuera)].sort();
    return evtDb.actualizar(ev.id, fila);
  }
  const hoy = fmt.hoy();
  const delta = 'LMXJVSD'.indexOf(destino) - 'LMXJVSD'.indexOf(desde);
  for (const f of evtFechasDe(ev, fase).filter(x => evtCodigoDe(x) === desde && x >= hoy && !evtHecho(ev, x))) {
    if ((await evtMoverUnDia(ev, f, evtSumarDias(f, delta), fase)) === 'error') return false;
  }
  return true;
}

async function fzEventoSemanalQuitar(ev, codigo) {
  const marcadosDia = evtMarcados(ev).filter(f => evtCodigoDe(f) === codigo);
  if (!marcadosDia.length) {
    const ds = (ev.dias_semana || []).filter(d => d !== codigo);
    if (!ds.length && !evtMarcados(ev).length) return evtDb.borrar(ev.id);
    if (ds.length) return evtDb.actualizar(ev.id, { dias_semana: ds });
  }
  const fase = (_ent.fases || []).find(f => f.id === ev.fase_id) || _ent.faseCache;
  const hoy = fmt.hoy();
  const quedan = evtFechasDe(ev, fase).filter(x => evtCodigoDe(x) === codigo && x >= hoy && !evtHecho(ev, x));
  return quedan.length ? evtDb.quitarDias(ev, quedan) : true;
}

window.fzSoltarEvento = (ev, desde, hasta) => {
  const fase = _ent.faseCache;
  const solo = async () => {
    const r = await evtMoverUnDia(ev, desde, hasta, fase);
    if (r === 'hecho') return toast('Ese día ya lo marcó como hecho: no se mueve');
    if (r !== 'ok') return;
    toast(`${ev.titulo} → ${fzCorta(hasta)}`);
    _ent.eventosCache = null;
    fzRepintar();
  };
  const de = evtCodigoDe(desde), a = evtCodigoDe(hasta);
  if (!evtRepite(ev) || !(ev.dias_semana || []).includes(de) || de === a) return solo();
  fzAlcance({
    titulo: `Mover ${escapeHtml(ev.titulo)}`,
    solo: { txt: `${fzCorta(desde)} → ${fzCorta(hasta)}. Los otros ${fzPlural(de)} siguen igual.`, hacer: solo },
    todos: {
      titulo: `Todos los ${fzPlural(de)} → ${fzPlural(a)}`,
      txt: 'En toda la serie. Lo que ya marcó como hecho se queda donde está.',
      hacer: async () => {
        if (!(await fzEventoSemanalMover(ev, de, a))) return;
        toast(`${ev.titulo}: los ${fzPlural(de)} pasan a los ${fzPlural(a)}`);
        _ent.eventosCache = null;
        fzRepintar();
      },
    },
  });
};

window.fzQuitarEvento = (ev, fecha) => {
  const solo = async () => {
    const r = await evtQuitarUnDia(ev, fecha);
    if (r === 'hecho') return toast('Ese día ya lo marcó como hecho: queda en su historial');
    if (r !== 'ok') return;
    toast(`${ev.titulo}: quitado el ${fzCorta(fecha)}`);
    _ent.eventosCache = null;
    fzRepintar();
  };
  const codigo = evtCodigoDe(fecha);
  if (!evtRepite(ev) || !(ev.dias_semana || []).includes(codigo)) return solo();
  fzAlcance({
    titulo: `Quitar ${escapeHtml(ev.titulo)}`,
    solo: { txt: `Solo el ${fzCorta(fecha)}.`, hacer: solo },
    todos: {
      titulo: `Todos los ${fzPlural(codigo)}`,
      txt: 'En toda la serie. Lo que ya marcó como hecho se queda en su historial.',
      hacer: async () => {
        if (!(await fzEventoSemanalQuitar(ev, codigo))) return;
        toast(`${ev.titulo}: ya no va los ${fzPlural(codigo)}`);
        _ent.eventosCache = null;
        fzRepintar();
      },
    },
  });
};

// ── En lote: fuerza ────────────────────────────────────────────────────
// p: { accion: 'agregar'|'quitar'|'mover', rutinaId ('' = cualquiera al
// quitar o mover), desde, hasta, dias (códigos), de, a (al mover) }.
// Si el rango cubre el ciclo entero, se cambia el plan semanal (queda limpio
// y «Copiar este ciclo» lo lleva igual); si no, fecha por fecha.
window.fzLotePlan = (p) => {
  const fase = _ent.faseCache, rd = _ent.rutinaDe;
  const rutinas = _ent.rutinasCache || [];
  if (!fase || !fase.fecha_inicio || !rd) return { pasos: [], texto: 'Este ciclo no tiene fecha de inicio: ponla en «Editar fase».' };
  const fin = fzFin(fase);
  const todo = p.desde <= fase.fecha_inicio && (!fin || p.hasta >= fin);
  const r = rutinas.find(x => x.id === p.rutinaId) || null;
  const dias = p.accion === 'mover' ? [p.de] : p.dias;
  const fechas = evtRango(p.desde > fase.fecha_inicio ? p.desde : fase.fecha_inicio, fin && p.hasta > fin ? fin : p.hasta, dias);
  const pasos = [];
  let entrenados = 0;
  const nombre = (x) => escapeHtml(x?.nombre || '');

  if (p.accion === 'agregar') {
    if (!r) return { pasos, texto: 'Elige la rutina de fuerza.' };
    if (todo) {
      dias.forEach(d => pasos.push({ tipo: 'semanal-poner', r, codigo: d }));
      return { pasos, texto: pasos.length ? `<b>${nombre(r)}</b> pasa a ir <b>todos los ${dias.map(fzPlural).join(', ')}</b> del ciclo (el plan). Si esos días tenían otra rutina, la cambia.` : 'Elige los días.' };
    }
    fechas.forEach(f => { if (fzEntreno(f)) entrenados++; else if (rd(f)?.id !== r.id) pasos.push({ tipo: 'poner', r, fecha: f }); });
    const cambia = pasos.filter(x => rd(x.fecha)).length;
    return { pasos, texto: pasos.length ? `Se pone <b>${nombre(r)}</b> en <b>${pasos.length} día(s)</b>, solo esas fechas${cambia ? ` (${cambia} tenían otra rutina: se cambia)` : ''}.${entrenados ? ` ${entrenados} ya entrenado(s) no se tocan.` : ''}` : 'No hay días que cambiar con esos filtros.' };
  }

  const coincide = (f) => { const x = rd(f); return x && (!r || x.id === r.id); };
  if (p.accion === 'quitar') {
    if (todo) {
      dias.forEach(d => { const x = fzPorDia(fase, rutinas)[d]; if (x && (!r || x.id === r.id)) pasos.push({ tipo: 'semanal-quitar', r: x, codigo: d }); });
      if (pasos.length) return { pasos, texto: `Se quita ${pasos.map(x => `<b>${nombre(x.r)}</b> de los ${fzPlural(x.codigo)}`).join(', ')} en todo el ciclo (el plan).` };
    }
    fechas.forEach(f => { if (!coincide(f)) return; if (fzEntreno(f)) entrenados++; else pasos.push({ tipo: 'quitar', fecha: f, r: rd(f) }); });
    return { pasos, texto: pasos.length ? `Se quita la fuerza de <b>${pasos.length} día(s)</b>, solo esas fechas.${entrenados ? ` ${entrenados} ya entrenado(s) se quedan.` : ''}` : 'No hay fuerza que quitar con esos filtros.' + (entrenados ? ` (${entrenados} ya entrenado(s) se quedan.)` : '') };
  }

  // Mover: de un día de la semana a otro, dentro de cada semana.
  if (!p.de || !p.a || p.de === p.a) return { pasos, texto: 'Elige de qué día a qué día.' };
  const delta = 'LMXJVSD'.indexOf(p.a) - 'LMXJVSD'.indexOf(p.de);
  if (todo) {
    const x = fzPorDia(fase, rutinas)[p.de];
    if (x && (!r || x.id === r.id) && entDiasDe(x).includes(p.de)) {
      pasos.push({ tipo: 'semanal-mover', r: x, de: p.de, a: p.a });
      return { pasos, texto: `<b>${nombre(x)}</b> pasa de los ${fzPlural(p.de)} a los <b>${fzPlural(p.a)}</b> en todo el ciclo (el plan)${fzPorDia(fase, rutinas)[p.a] ? `; ${nombre(fzPorDia(fase, rutinas)[p.a])} se intercambia` : ''}.` };
    }
  }
  fechas.forEach(f => {
    if (!coincide(f)) return;
    const h = evtSumarDias(f, delta);
    if (!fzEnFase(fase, h)) return;
    if (fzEntreno(f) || fzEntreno(h)) entrenados++; else pasos.push({ tipo: 'mover', r: rd(f), fecha: f, hasta: h });
  });
  return { pasos, texto: pasos.length ? `Se mueven <b>${pasos.length} día(s)</b> de ${fzPlural(p.de)} a ${fzPlural(p.a)}, solo esas semanas.${entrenados ? ` ${entrenados} ya entrenado(s) no se tocan.` : ''}` : 'No hay fuerza que mover con esos filtros.' };
};

window.fzLoteHacer = async (p) => {
  const { pasos } = fzLotePlan(p);
  let n = 0;
  for (const x of pasos) {
    let ok = false;
    if (x.tipo === 'semanal-poner') { await fzSemanalPoner(x.r, x.codigo); ok = true; }
    else if (x.tipo === 'semanal-quitar') { await fzSemanalQuitar(x.r, x.codigo); ok = true; }
    else if (x.tipo === 'semanal-mover') { await fzSemanalMover(x.r, x.de, x.a); ok = true; }
    else if (x.tipo === 'poner') ok = await fzPonerUnDia(x.r, x.fecha, { silencio: true });
    else if (x.tipo === 'quitar') ok = await fzQuitarUnDia(x.fecha, { silencio: true });
    else if (x.tipo === 'mover') ok = await fzMoverUnDia(x.r, x.fecha, x.hasta, { silencio: true });
    if (ok) {
      n++;
      // Lo de un día cambia lo que hay los siguientes: se vuelve a leer.
      if (!x.tipo.startsWith('semanal')) await fzPreparar(_ent.faseCache, _ent.rutinasCache);
    } else if (!x.tipo.startsWith('semanal')) break;
  }
  return n;
};

// ── En lote: mover cardio y deportes de un día de la semana a otro ─────
window.fzLotePlanEventos = (p, eventos) => {
  const fasesPorId = Object.fromEntries((_ent.fases || [_ent.faseCache]).filter(Boolean).map(f => [f.id, f]));
  const fase = _ent.faseCache;
  const fin = fzFin(fase);
  const todo = fase?.fecha_inicio && p.desde <= fase.fecha_inicio && (!fin || p.hasta >= fin);
  const delta = 'LMXJVSD'.indexOf(p.a) - 'LMXJVSD'.indexOf(p.de);
  const enRango = new Set(evtRango(p.desde, p.hasta, [p.de]));
  const pasos = [];
  let marcados = 0;
  if (!p.de || !p.a || p.de === p.a) return { pasos, texto: 'Elige de qué día a qué día.' };
  eventos.forEach(ev => {
    const suyas = evtFechasDe(ev, fasesPorId[ev.fase_id]).filter(f => enRango.has(f));
    if (!suyas.length) return;
    if (todo && evtRepite(ev) && ev.fase_id === fase?.id && (ev.dias_semana || []).includes(p.de)) {
      pasos.push({ tipo: 'serie', ev, n: suyas.length });
      return;
    }
    suyas.forEach(f => { if (evtHecho(ev, f)) marcados++; else pasos.push({ tipo: 'dia', ev, fecha: f, hasta: evtSumarDias(f, delta) }); });
  });
  const total = pasos.reduce((a, x) => a + (x.n || 1), 0);
  return { pasos, texto: total ? `Se mueven <b>${total} día(s)</b> de ${fzPlural(p.de)} a ${fzPlural(p.a)} (${[...new Set(pasos.map(x => escapeHtml(x.ev.titulo)))].join(', ')}).${marcados ? ` ${marcados} ya marcado(s) como hechos se quedan.` : ''}` : 'No hay nada que mover con esos filtros.' };
};

window.fzLoteHacerEventos = async (p, eventos) => {
  const { pasos } = fzLotePlanEventos(p, eventos);
  let n = 0;
  for (const x of pasos) {
    if (x.tipo === 'serie') { if (await fzEventoSemanalMover(x.ev, p.de, p.a)) n += x.n; continue; }
    const r = await evtMoverUnDia(x.ev, x.fecha, x.hasta, _ent.faseCache);
    if (r === 'ok') n++;
    else if (r === 'error') break;
  }
  return n;
};
