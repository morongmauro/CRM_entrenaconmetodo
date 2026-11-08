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

// Por qué no la ha respondido cada uno (lo cuenta la app en app_uso, de las
// últimas 8 semanas): le salió y tocó «Ahora no», le salió y no respondió,
// sigue en la dirección vieja (ahí no sale), aún no cumple los 15 días desde
// su primer uso o los 5 días de uso. Mismas reglas que api/training (encuesta).
const ENC_DIAS = 15, ENC_MIN_USO = 5;
const encNorm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const encEntre = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(String(a).slice(0, 10) + 'T12:00:00Z')) / 86400000);
function encMotivo(c, filasUso, hoy) {
  const nombres = [c.nombre, ...(c.nombres_alternos || [])].map(encNorm);
  const suyas = (filasUso || []).filter(u => (c.mealtracker_id && (u.user_id === c.mealtracker_id || u.clave === c.mealtracker_id)) || nombres.includes(encNorm(u.name)))
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  if (!suyas.length) return { k: 'nunca', orden: 5, tono: 'gr', txt: 'No ha abierto la app en 8 semanas' };
  const sec = (u) => (u && u.secciones) || {};
  const luego = suyas.filter(u => sec(u).encuesta === 'luego').pop();
  if (luego) return { k: 'luego', orden: 0, tono: 'na', txt: `Le salió y tocó «Ahora no» (${fmt.fechaCorta(String(luego.fecha).slice(0, 10))})` };
  const vista = suyas.filter(u => sec(u).encuesta === 'vista').pop();
  if (vista) return { k: 'vista', orden: 1, tono: 'ro', txt: `Le salió y no respondió (${fmt.fechaCorta(String(vista.fecha).slice(0, 10))})` };
  const dir = suyas.filter(u => sec(u).visual).map(u => sec(u).visual).pop() || null;
  if (dir === 'vieja') return { k: 'vieja', orden: 2, tono: 'gr', txt: 'Sigue en la dirección vieja: ahí no le sale' };
  const desde = encEntre(suyas[0].fecha, hoy);
  const dias = new Set(suyas.map(u => String(u.fecha).slice(0, 10))).size;
  if (desde < ENC_DIAS) return { k: 'dias', orden: 3, tono: 'gr', txt: `No le ha salido: lleva ${desde} de ${ENC_DIAS} días con la app` };
  if (dias < ENC_MIN_USO) return { k: 'uso', orden: 4, tono: 'gr', txt: `Usó la app solo ${dias} día${dias === 1 ? '' : 's'}: le sale con ${ENC_MIN_USO}` };
  return { k: 'toca', orden: 2.5, tono: 'az', txt: dir ? 'Ya le toca: le sale la próxima vez que abra la app' : 'Le toca: le sale al abrir la app (si está en la dirección nueva)' };
}

window.encPintarInicio = async (activos, clientes = []) => {
  const caja = document.getElementById('inicio-encuesta');
  if (!caja) return;
  // Lo que cuenta la app (para el «por qué no la ha respondido»).
  let uso = null;
  try { const r = typeof mtApiGet === 'function' ? await mtApiGet('/api/coach-data?action=uso') : null; uso = r && r.ok && Array.isArray(r.uso) ? r.uso : null; } catch (e) { uso = null; }
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
  caja.innerHTML = encInicioHTML(filas, activos || [], fmt.hoy(), clientes || [], uso);
};

function encInicioHTML(filas, activos, hoy, clientes = [], uso = null) {
  const porId = Object.fromEntries([...clientes, ...activos].map(c => [String(c.id), c]));
  const nombre = (id) => (porId[id] || {}).nombre || 'Cliente';
  const respondieron = new Set(filas.map(f => String(f.cliente_id)));
  const elegibles = activos.filter(c => (encSemana(c, hoy) || 0) >= 2);
  const faltan = elegibles.filter(c => !respondieron.has(String(c.id)));
  const N = encNps(filas.map(f => Number(f.recomienda)));
  const prom = (k) => encProm(filas.map(f => Number(f[k])));
  const resp = elegibles.length ? Math.round(elegibles.filter(c => respondieron.has(String(c.id))).length / elegibles.length * 100) : null;
  // Quién no la ha respondido y por qué (primero los que la vieron y no respondieron).
  const sinResp = activos.filter(c => !respondieron.has(String(c.id)));
  const conMotivo = uso ? sinResp.map(c => ({ c, m: encMotivo(c, uso, hoy) })).sort((a, b) => a.m.orden - b.m.orden || String(a.c.nombre).localeCompare(String(b.c.nombre), 'es')) : [];
  const TONO = { na: ['#FDEFD9', '#9A5B12'], ro: ['#FBE3DE', '#B2402B'], gr: ['#F1EEE8', '#5A5A5F'], az: ['#EAF1FB', '#1E4E8C'] };
  const ignoran = conMotivo.filter(x => x.m.k === 'luego' || x.m.k === 'vista').length;
  const lista = conMotivo.length ? `<div class="enc-motivos" data-enc-motivos>
      <div class="enc-mot-t">Quién no la ha respondido y por qué${ignoran ? ` · <b>${ignoran} la vi${ignoran === 1 ? 'o' : 'eron'} y no respondi${ignoran === 1 ? 'ó' : 'eron'}</b>` : ''}</div>
      ${conMotivo.map(({ c, m }) => `<div class="enc-mot" data-enc-motivo="${m.k}"><b>${escapeHtml(c.nombre)}</b><span style="background:${TONO[m.tono][0]};color:${TONO[m.tono][1]}">${escapeHtml(m.txt)}</span></div>`).join('')}
    </div>` : '';
  const pie = `<div class="enc-pie">${elegibles.length ? `Respondieron ${elegibles.length - faltan.length} de ${elegibles.length} clientes activos desde su segunda semana (${resp}%).` : 'Todavía ningún cliente activo llegó a su segunda semana.'}
    ${!uso && faltan.length ? ` Le falta a: ${faltan.slice(0, 8).map(c => escapeHtml(c.nombre)).join(', ')}${faltan.length > 8 ? ` y ${faltan.length - 8} más` : ''}.` : ''}</div>${lista}`;
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
