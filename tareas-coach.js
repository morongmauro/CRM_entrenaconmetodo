// =====================================================
// MIS TAREAS POR CLIENTE · lo que el coach se anota para cada uno
// =====================================================
// «Revisarle la técnica de la sentadilla el jueves», «preguntarle cómo le
// fue con el viaje». Va arriba en su Seguimiento (tarjeta «Mis tareas con…»)
// y en la lista de Seguimiento: quien tiene una tarea vencida o para hoy
// sale en «Te toca» con el aviso, para que no se olvide.
//
// Usa la tabla de siempre, `pendientes`, con para = 'coach': son las mismas
// que se ven en la ficha (Pendientes, con la gorra) y en Actividades. La
// fecha es opcional; sin fecha, la tarea queda en la lista hasta que la
// marques. Marcarla no la borra: queda como completada.
//
// Carga DESPUÉS de seguimiento-semana.js (usa _es, _seg, segPintarLista).
// =====================================================

const _tc = { cliente: null };

const tcHoy = () => fmt.hoy();
const tcFecha = (f) => {
  if (!f) return '';
  const [y, m, d] = String(f).slice(0, 10).split('-').map(Number);
  return `${d} ${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][m - 1]}`;
};
// Cuándo vence, en palabras y con su tono.
function tcCuando(f) {
  if (!f) return { txt: 'Sin fecha', cls: '' };
  const hoy = tcHoy();
  if (f < hoy) return { txt: `Vencida · ${tcFecha(f)}`, cls: 'tc-vencida' };
  if (f === hoy) return { txt: 'Hoy', cls: 'tc-hoy' };
  if (f === evtSumarDias(hoy, 1)) return { txt: 'Mañana', cls: '' };
  return { txt: tcFecha(f), cls: '' };
}

// La tarjeta (el armazón de Seguimiento la pone; esto la llena).
window.tcTarjetaHTML = (c) => `
  <div class="es-card" data-seg-tareas>
    <div class="es-k">Mis tareas con ${escapeHtml(String(c.nombre || '').split(' ')[0])}</div>
    <div id="seg-tareas"><div class="es-vacio">Leyendo…</div></div>
  </div>`;

window.tcPintar = async (c) => {
  const caja = document.getElementById('seg-tareas');
  if (!caja || !c?.id) return;
  _tc.cliente = c;
  const { data, error } = await sb.from('pendientes').select('*').eq('cliente_id', c.id).eq('para', 'coach').order('created_at', { ascending: true });
  if (!caja.isConnected || _tc.cliente !== c) return;
  if (error) { caja.innerHTML = `<div class="es-vacio">No pude leer tus tareas (${escapeHtml(error.message || 'error')}).</div>`; return; }
  const filas = data || [];
  // Primero las que vencen antes; las sin fecha, al final.
  const abiertas = filas.filter(t => t.estado !== 'completado')
    .sort((a, b) => String(a.fecha_limite || '9999').localeCompare(String(b.fecha_limite || '9999')) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
  // Las que marcaste en la última semana, por si fue sin querer.
  const hace7 = evtSumarDias(tcHoy(), -7);
  const hechas = filas.filter(t => t.estado === 'completado' && (t.completado_en || '') >= hace7).slice(-3);
  const fila = (t, hecha = false) => {
    const q = hecha ? { txt: `Hecha · ${tcFecha(t.completado_en)}`, cls: '' } : tcCuando(t.fecha_limite);
    return `
      <label class="tc-fila${hecha ? ' tc-hecha' : ''}" data-tc-tarea="${t.id}">
        <input type="checkbox" ${hecha ? 'checked' : ''} onchange="tcMarcar('${t.id}', ${hecha ? 'false' : 'true'})">
        <span class="tc-txt">${escapeHtml(t.descripcion)}</span>
        <span class="tc-cuando ${q.cls}" data-tc-cuando>${q.txt}</span>
      </label>`;
  };
  caja.innerHTML = `
    ${abiertas.length ? abiertas.map(t => fila(t)).join('') : '<div class="es-vacio" style="margin-bottom:6px">No tienes tareas pendientes con este cliente.</div>'}
    ${hechas.map(t => fila(t, true)).join('')}
    <form class="tc-nueva" onsubmit="event.preventDefault(); tcAgregar()">
      <input id="tc-texto" placeholder="Nueva tarea · ej.: revisar su técnica de sentadilla" maxlength="300" autocomplete="off">
      <input id="tc-fecha" type="date" title="Para cuándo (opcional)">
      <button type="submit" class="btn btn-primary btn-sm" data-tc-agregar>Agregar</button>
    </form>`;
};

async function tcRefrescar() {
  if (typeof invalidarCache === 'function') invalidarCache('pendientes');
  if (typeof _seg !== 'undefined') _seg.ult = null;
  if (_tc.cliente) await tcPintar(_tc.cliente);
  if (typeof segPintarLista === 'function') segPintarLista();
}

window.tcAgregar = async () => {
  const c = _tc.cliente;
  const texto = ($('#tc-texto')?.value || '').trim();
  if (!c || !texto) { $('#tc-texto')?.focus(); return; }
  const fecha = $('#tc-fecha')?.value || null;
  const { error } = await sb.from('pendientes').insert({
    cliente_id: c.id, para: 'coach', scope: 'general', descripcion: texto, fecha_limite: fecha, prioridad: 'media', estado: 'abierto',
  });
  if (error) { toast('No se pudo guardar: ' + error.message); return; }
  await tcRefrescar();
  $('#tc-texto')?.focus();
};

window.tcMarcar = async (id, hecha) => {
  const { error } = await sb.from('pendientes').update({ estado: hecha ? 'completado' : 'abierto', completado_en: hecha ? tcHoy() : null }).eq('id', id);
  if (error) { toast('No se pudo cambiar: ' + error.message); return; }
  await tcRefrescar();
};

// Para la lista de Seguimiento: cuántas tiene abiertas cada cliente y
// cuántas vencen hoy o ya vencieron.
window.tcResumen = async () => {
  const { data, error } = await sb.from('pendientes').select('cliente_id, fecha_limite').eq('para', 'coach').eq('estado', 'abierto').limit(3000);
  if (error) return {};
  const hoy = tcHoy(), out = {};
  (data || []).forEach(t => {
    if (!t.cliente_id) return;
    const x = out[t.cliente_id] || (out[t.cliente_id] = { abiertas: 0, vencen: 0 });
    x.abiertas++;
    if (t.fecha_limite && t.fecha_limite <= hoy) x.vencen++;
  });
  return out;
};
