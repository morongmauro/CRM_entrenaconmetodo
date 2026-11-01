// =====================================================
// AUSENCIAS Y BIENESTAR (lo que el cliente marca en su app, y lo que marcas tú)
// =====================================================
// Tablas: migraciones/ausencias-bienestar.sql.
//
// Ausencias (viaje, enfermedad, lesión, trabajo…): el cliente la marca en su
// app («Voy a estar fuera») o tú aquí («Marcar ausencia», en Seguimiento).
// Esos días no cuentan en su adherencia, puntajes ni alertas. Lo que marca
// el cliente te llega a la Bandeja (y a «Hoy» en el CRM en prueba) para que
// le escribas tú: la app no le contesta nada automático. Quitar una ausencia
// no la borra (queda `anulada_en`).
//
// Bienestar: cada 15 días, sueño, energía y estrés de 1 a 5 (5 es lo mejor
// en los tres). En Seguimiento, con su gráfica; si uno baja dos veces
// seguidas, te avisa.
//
// Solo lee y escribe estas dos tablas. Sin ellas (SQL sin correr), no sale
// nada y el resto del CRM sigue igual.
// =====================================================

const _aus = { lista: [], bien: [], leido: 0, cargando: null, sinTabla: false };
const AUS_MOTIVOS = [['viaje', 'Viaje'], ['enfermedad', 'Enfermedad'], ['lesion', 'Lesión'], ['trabajo', 'Trabajo'], ['otro', 'Otro']];
const ausMotivo = (k) => ((AUS_MOTIVOS.find(m => m[0] === k) || [null, 'Fuera'])[1]).replace(/^Otro$/, 'Fuera');
const AUS_MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const ausCorta = (f) => `${Number(String(f).slice(8, 10))} ${AUS_MESES[Number(String(f).slice(5, 7)) - 1]}`;
const ausRango = (a) => (a.desde === a.hasta ? ausCorta(a.desde) : `${ausCorta(a.desde)} al ${ausCorta(a.hasta)}`);
const AUS_SUMAR = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const AUS_ICONO = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3C7BD6" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 16l20-7-3-2-6 2-6-4-2 1 4 4-5 2-2-1-1 1z"/><path d="M3 21h18"/></svg>';
const BIEN_ICONO = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C98A1B" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

async function ausCargar(forzar = false) {
  if (!forzar && _aus.leido && Date.now() - _aus.leido < 60000) return _aus;
  if (_aus.cargando) return _aus.cargando;
  _aus.cargando = (async () => {
    const hoy = fmt.hoy();
    try {
      const [a, b] = await Promise.all([
        sb.from('ausencias').select('*').is('anulada_en', null).gte('hasta', AUS_SUMAR(hoy, -120)).order('desde'),
        sb.from('bienestar').select('*').gte('fecha', AUS_SUMAR(hoy, -200)).order('fecha'),
      ]);
      _aus.sinTabla = !!(a.error || b.error);
      _aus.lista = a.error ? [] : (a.data || []);
      _aus.bien = b.error ? [] : (b.data || []);
    } catch (e) { _aus.lista = []; _aus.bien = []; _aus.sinTabla = true; }
    _aus.leido = Date.now();
    return _aus;
  })();
  try { return await _aus.cargando; } finally { _aus.cargando = null; }
}
const ausDeCliente = (id) => _aus.lista.filter(a => a.cliente_id === id && !a.anulada_en);
const ausHoy = (id, hoy = fmt.hoy()) => ausDeCliente(id).find(a => a.desde <= hoy && a.hasta >= hoy) || null;
// Los días que estuvo o estará fuera (para no contarlos en su adherencia).
function ausFueraDe(id) {
  const out = new Set();
  ausDeCliente(id).forEach(a => { for (let f = a.desde, i = 0; f <= a.hasta && i < 500; f = AUS_SUMAR(f, 1), i++) out.add(f); });
  return out;
}
// Las que marcó el cliente y aún no ves: te llegan como aviso.
const ausAvisos = () => _aus.lista.filter(a => a.origen === 'cliente' && !a.vista_en && !a.anulada_en);
const bienDeCliente = (id) => _aus.bien.filter(b => b.cliente_id === id).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
const BIEN_DIMS = [['sueno', 'Sueño', '#3C7BD6', 'Duerme peor'], ['energia', 'Energía', '#46965A', 'Con menos energía'], ['estres', 'Estrés', '#EE8434', 'Más estresado']];
// ¿Alguna bajó dos veces seguidas en sus últimos 3 check-ins?
function bienCaida(lista) {
  const ult = lista.slice(-3);
  if (ult.length < 3) return null;
  for (const [k, t, , frase] of BIEN_DIMS) {
    const v = ult.map(x => Number(x[k]));
    if (v.every(Number.isFinite) && v[0] > v[1] && v[1] > v[2]) return { k, t, frase, vals: v, fecha: ult[2].fecha };
  }
  return null;
}

window.ausVista = async (id) => {
  const a = _aus.lista.find(x => x.id === id);
  if (a) a.vista_en = new Date().toISOString();
  try { await sb.from('ausencias').update({ vista_en: new Date().toISOString() }).eq('id', id); } catch (e) { /* queda para la próxima */ }
};

// ── Marcar / editar / quitar una ausencia (desde el CRM) ─────────────────
window.ausMarcar = (clienteId, ausId = null) => {
  const c = (typeof _sa !== 'undefined' && _sa.cliente && _sa.cliente.id === clienteId) ? _sa.cliente
    : (typeof _cpr !== 'undefined' && _cpr.porId[clienteId]) || null;
  const nombre = c ? String(c.nombre || '').split(' ')[0] : 'tu cliente';
  const a = ausId ? _aus.lista.find(x => x.id === ausId) : null;
  const hoy = fmt.hoy();
  openModal(modalShell(`${a ? 'Editar' : 'Marcar'} ausencia de ${escapeHtml(nombre)}`, `
    <div data-aus-modal>
      <p class="text-sm text-slate-600" style="line-height:1.4">Esos días no cuentan en su adherencia, puntajes ni alertas, y le salen en el calendario de su app. Puede ser hacia adelante o algo que ya pasó.</p>
      <div class="flex flex-wrap gap-2 mt-3" data-aus-motivos>${AUS_MOTIVOS.map(([k, t]) => `<button type="button" class="chip ${(a ? a.motivo : 'viaje') === k ? 'active' : ''}" data-aus-motivo="${k}" onclick="document.querySelectorAll('[data-aus-motivo]').forEach(b => b.classList.toggle('active', b === this))">${t}</button>`).join('')}</div>
      <div class="grid grid-cols-2 gap-2 mt-3">
        <label class="text-xs font-semibold text-slate-500">Desde<input type="date" id="aus-desde" value="${a ? a.desde : hoy}" class="mt-1" style="width:100%"></label>
        <label class="text-xs font-semibold text-slate-500">Hasta<input type="date" id="aus-hasta" value="${a ? a.hasta : hoy}" class="mt-1" style="width:100%"></label>
      </div>
      <textarea id="aus-nota" rows="2" class="mt-3" style="width:100%" placeholder="Nota para ti (opcional): «gripe, me escribió por WhatsApp»">${a && a.nota ? escapeHtml(a.nota) : ''}</textarea>
      ${a && a.origen === 'cliente' ? '<p class="text-xs text-slate-500 mt-2">La marcó tu cliente en su app.</p>' : ''}
    </div>`,
    `${a ? `<button class="btn btn-ghost" data-aus-quitar onclick="ausQuitar('${a.id}')">Quitarla</button>` : ''}
     <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" data-aus-guardar onclick="ausGuardar('${clienteId}', ${a ? `'${a.id}'` : 'null'})">Guardar ausencia</button>`));
};
window.ausGuardar = async (clienteId, id) => {
  const desde = document.getElementById('aus-desde')?.value || '', hasta = document.getElementById('aus-hasta')?.value || '';
  const motivo = (document.querySelector('[data-aus-motivo].active') || {}).dataset?.ausMotivo || 'otro';
  const nota = (document.getElementById('aus-nota')?.value || '').trim().slice(0, 400) || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return toast('Revisa las fechas');
  if (hasta < desde) return toast('«Hasta» no puede ser antes de «Desde»');
  const ahora = new Date().toISOString();
  const r = id
    ? await sb.from('ausencias').update({ desde, hasta, motivo, nota, updated_at: ahora }).eq('id', id)
    : await sb.from('ausencias').insert({ cliente_id: clienteId, desde, hasta, motivo, nota, origen: 'coach', vista_en: ahora });
  if (r && r.error) return toast(/relation|does not exist|schema cache/i.test(r.error.message || '') ? 'Falta correr migraciones/ausencias-bienestar.sql en Supabase' : 'No se guardó. Inténtalo de nuevo.');
  closeModal();
  toast(`Guardada: ${ausMotivo(motivo)} · ${ausRango({ desde, hasta })}`);
  await ausDespues();
};
window.ausQuitar = async (id) => {
  if (!confirm('¿Quitar esta ausencia? Esos días vuelven a contar.')) return;
  const r = await sb.from('ausencias').update({ anulada_en: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id);
  if (r && r.error) return toast('No se pudo quitar');
  closeModal();
  toast('Quitada: esos días vuelven a contar');
  await ausDespues();
};
async function ausDespues() {
  await ausCargar(true);
  if (typeof _cpr !== 'undefined') _cpr.datos = null;
  if (typeof _bdj !== 'undefined') _bdj.datos = null;
  if (typeof rerenderView === 'function') rerenderView();
}

// ── En Seguimiento: bienestar y ausencias de este cliente ────────────────
function bienLinea(t, col, vals) {
  const W = 170, H = 46, n = vals.length;
  const x = (i) => (n === 1 ? W / 2 : 8 + i * ((W - 16) / (n - 1))), y = (v) => H - 6 - ((v - 1) / 4) * (H - 14);
  return `<svg width="100%" viewBox="0 0 ${W} ${H}" style="display:block;margin-top:6px;max-width:260px" aria-label="${t}: ${vals.join(', ')}">
    ${n > 1 ? `<polyline fill="none" stroke="${col}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" points="${vals.map((v, i) => `${x(i)},${y(v)}`).join(' ')}"/>` : ''}
    ${vals.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3.6" fill="${i === n - 1 ? col : '#fff'}" stroke="${col}" stroke-width="2"/>`).join('')}</svg>`;
}
function ausSegHTML(c) {
  const hoy = fmt.hoy();
  const lista = bienDeCliente(c.id).slice(-6);
  const caida = bienCaida(lista);
  const ult = lista[lista.length - 1];
  const hace = ult ? Math.round((new Date(hoy + 'T12:00:00') - new Date(String(ult.fecha) + 'T12:00:00')) / 86400000) : null;
  const tend = (k) => { const v = lista.map(x => Number(x[k])); if (v.length < 2) return ['Primer check-in', '#55565B'];
    if (caida && caida.k === k) return ['Bajó 2 veces seguidas', '#B2402B'];
    const d = v[v.length - 1] - v[v.length - 2]; return d > 0 ? ['Subió', '#2F7F45'] : d < 0 ? ['Bajó', '#9A5B12'] : ['Estable', '#55565B']; };
  const auses = ausDeCliente(c.id).filter(a => a.hasta >= AUS_SUMAR(hoy, -30)).sort((a, b) => a.desde.localeCompare(b.desde));
  return `<div class="cp-card" id="sa-bienestar" data-aus-seg style="background:#fff;border-radius:20px;padding:14px 16px;box-shadow:0 1px 2px rgba(40,40,30,.04),0 8px 22px rgba(60,60,40,.06);margin-bottom:10px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:6px">
      <b style="font-size:16px">Bienestar · cada 15 días</b>
      <span style="font-size:12.5px;color:#737373">${lista.length ? `Últimos ${lista.length} check-in${lista.length === 1 ? '' : 's'} · el último ${hace === 0 ? 'hoy' : hace === 1 ? 'ayer' : `hace ${hace} días`}` : 'Todavía no responde su primer check-in (le sale en su app desde su segunda semana)'}</span>
    </div>
    ${lista.length ? `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px" data-bien-graficas>${BIEN_DIMS.map(([k, t, col]) => { const v = lista.map(x => Number(x[k])); const [tt, tc] = tend(k);
      return `<div data-bien="${k}" style="flex:1 1 170px;background:#F7F6F2;border-radius:16px;padding:12px 14px"><div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:14.5px">${t}</b><b style="font-size:20px;color:${col}">${v[v.length - 1]}<span style="font-size:12px;color:#737373"> de 5</span></b></div>
        ${bienLinea(t, col, v)}<div style="font-size:12.5px;color:${tc};font-weight:700;margin-top:4px">${tt}${k === 'estres' ? ' (5 = tranquilo)' : ''}</div></div>`; }).join('')}</div>` : ''}
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px;padding-top:10px;border-top:1px solid #F1EEE8" data-aus-lista>
      <b style="font-size:14px">Ausencias</b>
      ${auses.length ? auses.map(a => `<button type="button" class="chip" data-aus-chip="${a.id}" onclick="ausMarcar('${c.id}','${a.id}')" title="Editar">${ausMotivo(a.motivo)} · ${ausRango(a)}${a.origen === 'cliente' ? ' · desde su app' : ''}</button>`).join('') : '<span class="text-sm text-slate-500">Ninguna marcada</span>'}
      <button type="button" class="btn btn-secondary btn-sm" style="margin-left:auto" data-aus-marcar onclick="ausMarcar('${c.id}')">Marcar ausencia</button>
    </div>
  </div>`;
}
async function ausPintarSeguimiento(c) {
  const caja = document.getElementById('seg-semana');
  if (!caja || !c) return;
  await ausCargar();
  if (_aus.sinTabla) return;
  const viejo = caja.querySelector('[data-aus-seg]');
  const div = document.createElement('div');
  div.innerHTML = ausSegHTML(c);
  const nuevo = div.firstElementChild;
  if (viejo) { viejo.replaceWith(nuevo); return; }
  const ancla = caja.querySelector('[data-sa-barra]');
  if (ancla) ancla.before(nuevo); else caja.prepend(nuevo);
}
if (typeof window.saPintar === 'function') {
  const base = window.saPintar;
  window.saPintar = async (c, S, D) => { const r = await base(c, S, D); ausPintarSeguimiento(c); return r; };
}
