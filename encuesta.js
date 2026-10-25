// =====================================================
// ENCUESTA DE LA APP · en Inicio
// =====================================================
// Lo que respondió cada cliente en su app (una sola vez, desde su segunda
// semana): qué tan útil, qué tan fácil y qué tan agradable se ve (1 a 5), y
// si la recomendaría (0 a 10), y lo que mejoraría (opcional). De ahí sale el NPS: % que pone 9-10
// (promotores) menos % que pone 0-6 (detractores).
// Tabla: migraciones/encuesta-app.sql (la escribe la app, api/training).
// =====================================================

const ENC_COL = { pro: '#46965A', pas: '#F2C94C', det: '#E2553B' };

function encSemana(c, hoy) {
  const d = String(c.fecha_inicio || c.created_at || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > hoy) return null;
  return Math.floor((Date.parse(hoy) - Date.parse(d)) / 86400000 / 7) + 1;
}

// NPS de una lista de notas 0-10.
function encNps(notas) {
  const v = notas.filter(x => Number.isFinite(x));
  if (!v.length) return null;
  const pro = v.filter(x => x >= 9).length, det = v.filter(x => x <= 6).length;
  return { n: v.length, pro, pas: v.length - pro - det, det, nps: Math.round((pro - det) / v.length * 100) };
}
const encProm = (v) => { const x = v.filter(Number.isFinite); return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null; };
const encNum = (v, d = 1) => (v == null ? '—' : Number(v).toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d }));
const encTipo = (x) => (x >= 9 ? 'pro' : x <= 6 ? 'det' : 'pas');

window.encPintarInicio = async (activos, clientes = []) => {
  const caja = document.getElementById('inicio-encuesta');
  if (!caja) return;
  let filas;
  try {
    const { data, error } = await sb.from('encuesta_app').select('*').order('fecha', { ascending: true });
    if (error) throw error;
    filas = data || [];
  } catch (e) {
    if (!caja.isConnected) return;
    caja.innerHTML = '<div class="text-sm text-slate-500" data-enc-sin-tabla>Falta correr <b>migraciones/encuesta-app.sql</b> en el Supabase del CRM (solo crea una tabla nueva). Mientras tanto la app no muestra la encuesta.</div>';
    return;
  }
  if (!caja.isConnected) return;
  caja.innerHTML = encInicioHTML(filas, activos || [], fmt.hoy(), clientes || []);
};

function encInicioHTML(filas, activos, hoy, clientes = []) {
  const porId = Object.fromEntries([...clientes, ...activos].map(c => [String(c.id), c]));
  const nombre = (id) => (porId[id] || {}).nombre || 'Cliente';
  const respondieron = new Set(filas.map(f => String(f.cliente_id)));
  const elegibles = activos.filter(c => (encSemana(c, hoy) || 0) >= 2);
  const faltan = elegibles.filter(c => !respondieron.has(String(c.id)));
  const N = encNps(filas.map(f => Number(f.recomienda)));
  const prom = (k) => encProm(filas.map(f => Number(f[k])));
  const resp = elegibles.length ? Math.round(elegibles.filter(c => respondieron.has(String(c.id))).length / elegibles.length * 100) : null;
  const pie = `<div class="enc-pie">${elegibles.length ? `Respondieron ${elegibles.length - faltan.length} de ${elegibles.length} clientes activos desde su segunda semana (${resp}%).` : 'Todavía ningún cliente activo llegó a su segunda semana.'}
    ${faltan.length ? ` Le falta a: ${faltan.slice(0, 8).map(c => escapeHtml(c.nombre)).join(', ')}${faltan.length > 8 ? ` y ${faltan.length - 8} más` : ''} (le sale al abrir la app).` : ''}</div>`;
  if (!N) return `<div class="text-sm text-slate-500" data-enc-vacia>Todavía nadie la ha respondido. A cada cliente le sale una sola vez al abrir la app, desde su segunda semana.</div>${pie}`;

  const pct = (x) => Math.round(x / N.n * 100);
  // Por mes: el NPS de quienes respondieron ese mes.
  const meses = [...new Set(filas.map(f => String(f.fecha).slice(0, 7)))].sort();
  const npsMes = meses.map(m => encNps(filas.filter(f => String(f.fecha).slice(0, 7) === m).map(f => Number(f.recomienda))));
  const etq = meses.map(m => (fmt.mesEsLargo ? fmt.mesEsLargo(m) : m).split(' ')[0]);
  const grafica = typeof lineChart === 'function'
    ? lineChart([{ label: 'NPS', color: '#3C7BD6', points: npsMes.map(x => x ? x.nps : null) }], etq, { escalaFija: true, yMin: -100, yMax: 100, decimales: 0, height: 190, sinArea: false })
    : '';
  // Cuántos pusieron cada nota del 0 al 10.
  const cuenta = Array.from({ length: 11 }, (_, i) => filas.filter(f => Number(f.recomienda) === i).length);
  const maxC = Math.max(1, ...cuenta);
  const barras = `<div class="enc-hist" data-enc-hist>${cuenta.map((c, i) => `
      <div class="enc-hb"><span class="enc-hv">${c || ''}</span><i style="height:${Math.round(c / maxC * 64)}px;background:${ENC_COL[encTipo(i)]}"></i><span class="enc-hl">${i}</span></div>`).join('')}</div>`;
  const tile = (lab, v) => `<div class="enc-tile"><b>${encNum(v)}</b><span>de 5</span><small>${lab}</small></div>`;
  const fila = (f) => {
    const t = encTipo(Number(f.recomienda));
    return `<tr data-enc-fila="${escapeHtml(String(f.cliente_id))}">
      <td><b>${escapeHtml(nombre(String(f.cliente_id)))}</b></td>
      <td>${escapeHtml(fmt.fechaCorta ? fmt.fechaCorta(String(f.fecha).slice(0, 10)) : String(f.fecha))}${f.semana ? ` · sem ${f.semana}` : ''}</td>
      <td>${f.util ?? '—'}</td><td>${f.facil ?? '—'}</td><td>${f.agradable ?? '—'}</td>
      <td><span class="enc-p enc-p-${t}">${f.recomienda}</span></td>
      <td class="enc-cat">${t === 'pro' ? 'Promotor' : t === 'det' ? 'Detractor' : 'Pasivo'}</td>
      <td class="enc-mej">${f.mejoraria ? escapeHtml(f.mejoraria) : '<span class="text-slate-400">—</span>'}</td></tr>`;
  };
  return `
    <div class="enc-top">
      <div class="enc-nps" data-enc-nps="${N.nps}">
        <div class="enc-k">NPS de la app</div>
        <div class="enc-big">${N.nps > 0 ? '+' : ''}${N.nps}<small>${N.n} respuesta${N.n === 1 ? '' : 's'}</small></div>
        <div class="enc-bar"><span style="width:${pct(N.pro)}%;background:${ENC_COL.pro}"></span><span style="width:${pct(N.pas)}%;background:${ENC_COL.pas}"></span><span style="width:${pct(N.det)}%;background:${ENC_COL.det}"></span></div>
        <div class="enc-ley"><span><i style="background:${ENC_COL.pro}"></i>Promotores ${pct(N.pro)}% (9-10)</span><span><i style="background:${ENC_COL.pas}"></i>Pasivos ${pct(N.pas)}% (7-8)</span><span><i style="background:${ENC_COL.det}"></i>Detractores ${pct(N.det)}% (0-6)</span></div>
      </div>
      <div class="enc-tiles">${tile('Útil', prom('util'))}${tile('Fácil de usar', prom('facil'))}${tile('Agradable de ver', prom('agradable'))}</div>
    </div>
    <div class="enc-dos">
      <div><div class="enc-k">¿La recomendarías? · cuántos pusieron cada nota</div>${barras}</div>
      <div><div class="enc-k">NPS por mes</div>${grafica}</div>
    </div>
    ${filas.some(f => f.mejoraria) ? `<div class="enc-mejoras" data-enc-mejoras><div class="enc-k">Qué mejorarían</div>${filas.filter(f => f.mejoraria).slice().reverse().slice(0, 6).map(f => `
      <div class="enc-mej-i"><b>${escapeHtml(nombre(String(f.cliente_id)))}</b> <span class="enc-p enc-p-${encTipo(Number(f.recomienda))}">${f.recomienda}</span><p>«${escapeHtml(f.mejoraria)}»</p></div>`).join('')}</div>` : ''}
    <details class="enc-det" data-enc-tabla>
      <summary>Ver la respuesta de cada cliente (${filas.length})</summary>
      <div class="overflow-x-auto"><table class="enc-tabla"><thead><tr><th>Cliente</th><th>Fecha</th><th>Útil</th><th>Fácil</th><th>Agradable</th><th>Recomienda</th><th></th><th>Qué mejoraría</th></tr></thead>
      <tbody>${filas.slice().reverse().map(fila).join('')}</tbody></table></div>
    </details>
    ${pie}`;
}
window.encInicioHTML = encInicioHTML;
