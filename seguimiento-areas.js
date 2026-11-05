// =====================================================
// SEGUIMIENTO EN 6 ÁREAS · todo el cliente en una sola pantalla
// =====================================================
// El seguimiento de un cliente, en el orden en que se revisa:
//   1. Hoy · esta semana   (cumplimiento, en pocas palabras, comentarios)
//   2. Lo que le pedí      (lo que le dijiste la vez pasada y si lo cumplió,
//                           videos de técnica, su rutina sin video pedido,
//                           lo que le sale en su app)
//   3. Comida              (gráfica de la semana, lo que más repite, recetas
//                           y menús, y qué recomendarle: las lecturas con
//                           reglas fijas de Nutrición, npLecturas)
//   4. Fuerza              (pesos y repeticiones + los estancados)
//   5. Composición         (último peso y grasa, gráfica; medición mensual)
//   6. Meta nutricional    (meta contra lo que come y si quedó desactualizada:
//                           compEvaluarMeta de Composición)
// Arriba, una barra con las 6 áreas en semáforo (verde: al día · amarillo:
// revisar · rojo: hay que actuar), «Revisado x de 6» y «Siguiente cliente».
// Abajo, la caja para escribirle: «Enviar por WhatsApp y guardar» o «Solo
// guardar». Lo que le pides se separa en pedidos (la IA lo propone desde tu
// texto y tú lo confirmas) y en el próximo seguimiento se revisa solo si lo
// cumplió con sus datos.
//
// Tablas: seguimiento_mensajes (ya existe) y seguimiento_pedidos
// (migraciones/seguimiento-pedidos.sql: solo crea; no borra nada). Sin la
// segunda, todo funciona menos los pedidos.
//
// Carga DESPUÉS de seguimiento-semana.js, composicion.js, nutricion-plus.js
// y videos-tecnica.js. esArmazonHTML pone las áreas y esPintar llama
// saPintar con la semana ya calculada.
// =====================================================

const _sa = { cliente: null, S: null, D: null, estados: {}, pedidos: [], sinTablaPed: false, detectado: null, textoDetectado: '', timer: null, obs: null };
const SA_AREAS = [
  ['hoy', 'Hoy'], ['pedi', 'Lo que le pedí'], ['comida', 'Comida'],
  ['fuerza', 'Fuerza'], ['composicion', 'Composición'], ['meta', 'Meta'],
];
const SA_TONO = { verde: ['#E4F1E7', '#2F7F45', 'Al día'], amarillo: ['#FDEFD9', '#9A5B12', 'Revisar'], rojo: ['#FBE3DE', '#B2402B', 'Actuar'], gris: ['#F1EEE8', '#737373', '…'] };
const SA_TIPOS = [['entreno', 'Entreno'], ['video', 'Video'], ['comida', 'Comida'], ['medicion', 'Medición'], ['otro', 'Otro']];
const SA_DIAS_MEDICION = 30;   // la medición se pide cada mes

const saNorm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const saNum = (x, d = 1) => String(Math.round(Number(x) * 10 ** d) / 10 ** d).replace('.', ',');
const saDias = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(String(a).slice(0, 10) + 'T12:00:00Z')) / 86400000);
const saCorta = (f) => (typeof esFechaCorta === 'function' ? esFechaCorta(String(f).slice(0, 10)) : String(f).slice(0, 10));

// La semana ISO (AAAA-Www) de un lunes, para el análisis de Nutrición.
function saSemanaISO(lunes) {
  const d = new Date(lunes + 'T12:00:00Z');
  const jue = new Date(d); jue.setUTCDate(d.getUTCDate() + 3);
  const y = jue.getUTCFullYear();
  const ene4 = new Date(Date.UTC(y, 0, 4));
  const sem = 1 + Math.round(((jue - ene4) / 86400000 - 3 + ((ene4.getUTCDay() + 6) % 7)) / 7);
  return `${y}-W${String(sem).padStart(2, '0')}`;
}

// ── Estilos (una vez) ──────────────────────────────────────────────────
(function () {
  if (document.getElementById('sa-css')) return;
  const s = document.createElement('style');
  s.id = 'sa-css';
  s.textContent = `
  .sa-barra{position:sticky;top:8px;z-index:6;display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#fff;border-radius:18px;padding:10px 12px;box-shadow:0 1px 2px rgba(40,40,30,.05),0 8px 22px rgba(60,60,40,.08);margin:10px 0 4px}
  .sa-barra b{font-size:13.5px;margin-right:2px}
  .sa-chip{border:0;border-radius:999px;padding:7px 12px;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
  .sa-chip.visto{outline:2px solid #1F1F1F;outline-offset:1px}
  .sa-sig{margin-left:auto;border:0;border-radius:999px;padding:8px 14px;background:#1F1F1F;color:#fff;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer}
  .sa-area{scroll-margin-top:80px;margin-top:14px}
  .sa-ah{display:flex;align-items:center;gap:10px;font-size:12.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#6B6B6B;margin:0 2px 8px}
  .sa-n{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:99px;background:#1F1F1F;color:#fff;font-size:12px;letter-spacing:0}
  .sa-est{margin-left:auto;border-radius:999px;padding:4px 10px;font-size:12px;letter-spacing:0;text-transform:none}
  .sa-card{background:#fff;border-radius:20px;padding:16px 18px;box-shadow:0 1px 2px rgba(40,40,30,.04),0 8px 22px rgba(60,60,40,.06)}
  .sa-card+.sa-card{margin-top:12px}
  .sa-k{font-size:12.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#6B6B6B;margin-bottom:8px}
  .sa-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:12px}
  .sa-kpi{background:#F6F4EF;border-radius:14px;padding:10px 12px}.sa-kpi b{display:block;font-size:22px;letter-spacing:-.02em}.sa-kpi span{font-size:12.5px;color:#6B6B6B;line-height:1.3;display:block}
  .sa-diag{margin-top:10px;padding:11px 13px;border-radius:14px;background:#FBF6EC;font-size:14px;line-height:1.45;color:#3A3A3C}
  .sa-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
  .sa-btn{border:0;border-radius:999px;padding:8px 14px;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;background:#1F1F1F;color:#fff}.sa-btn.s{background:#F1EEE8;color:#1F1F1F}.sa-btn.w{background:#25A35A}
  .sa-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #F1EEE8;font-size:14px}.sa-row:last-child{border-bottom:0}
  .sa-pill{border-radius:999px;padding:3px 9px;font-size:12px;font-weight:700;white-space:nowrap}
  .sa-m{color:#6B6B6B;font-size:13px}
  .sa-caja textarea{width:100%;min-height:110px;border:1.5px solid #E2DDD3;border-radius:14px;padding:12px 14px;font:inherit;font-size:15px;line-height:1.5;resize:vertical}
  .sa-ped{display:flex;align-items:center;gap:8px;background:#F7F4EE;border-radius:12px;padding:8px 10px;margin-top:6px;font-size:14px}
  .sa-ped select{width:auto;padding:3px 6px;border-radius:999px;font-size:12.5px;font-weight:700}
  .sa-ped input{flex:1;min-width:0;border:0;background:transparent;font:inherit;font-size:14px;padding:2px}
  .sa-x{border:0;background:none;color:#6B6B6B;font:inherit;font-size:13px;cursor:pointer}
  .sa-graf text{font-family:inherit}
  `;
  document.head.appendChild(s);
})();

// ── El armazón: la barra y las 6 áreas (lo pone esArmazonHTML) ───────────
function saBarraHTML() {
  return `<div class="sa-barra" data-sa-barra>
    <b data-sa-revisado>Revisado 0 de 6</b>
    ${SA_AREAS.map(([k, t]) => `<button type="button" class="sa-chip" data-sa-chip="${k}" onclick="saIr('${k}')" style="background:${SA_TONO.gris[0]};color:${SA_TONO.gris[1]}">${t}</button>`).join('')}
    <button type="button" class="sa-sig" data-sa-siguiente onclick="saSiguiente(false)">Siguiente cliente →</button>
  </div>`;
}
function saAreaHTML(k, n, contenido) {
  const t = SA_AREAS.find(x => x[0] === k)[1];
  return `<section class="sa-area" id="sa-${k}" data-sa-area="${k}">
    <div class="sa-ah"><span class="sa-n">${n}</span>${k === 'hoy' ? 'Hoy · esta semana' : t === 'Meta' ? 'Meta nutricional' : t}<span class="sa-est" data-sa-est="${k}" style="background:${SA_TONO.gris[0]};color:${SA_TONO.gris[1]}">…</span></div>
    ${contenido}
  </section>`;
}
function saCajaHTML(c) {
  const nom = escapeHtml(String(c.nombre || '').split(/\s+/)[0]);
  return `<section class="sa-area" id="sa-caja" data-sa-caja>
    <div class="sa-card sa-caja">
      <div class="sa-k">Escribirle a ${nom} · hoy</div>
      <textarea id="sa-texto" placeholder="Escribe aquí lo que le quieres decir. Lo que le pidas (subir un peso, un video, una medición, algo de la comida) queda guardado para revisarlo en el próximo seguimiento." oninput="saTexto()"></textarea>
      <div data-sa-pedidos></div>
      <div class="sa-btns">
        <button type="button" class="sa-btn w" data-sa-enviar onclick="saEnviar(true)">Enviar por WhatsApp y guardar</button>
        <button type="button" class="sa-btn s" data-sa-guardar onclick="saEnviar(false)">Solo guardar</button>
      </div>
      <div class="sa-m" style="margin-top:8px">WhatsApp se abre con el texto listo para enviar. Queda guardado en su historial al tocar el botón.</div>
    </div>
  </section>`;
}
function saCerrarHTML() {
  return `<div class="sa-card" data-sa-cerrar style="margin-top:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
    <div style="flex:1;min-width:220px"><b style="font-size:16px">Cerrar el seguimiento</b><div class="sa-m">Marca que hoy le hiciste seguimiento y pasa al siguiente de la lista.</div></div>
    <button type="button" class="sa-btn" data-sa-hecho onclick="saSiguiente(true)">Marcar hecho y pasar al siguiente →</button>
  </div>`;
}

// ── Navegar ──────────────────────────────────────────────────────────────
window.saIr = (k) => { const el = document.getElementById(`sa-${k}`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); saMarcarVisto(k); };
function saSiguienteId() {
  const c = _sa.cliente; if (!c) return null;
  const ids = [];
  document.querySelectorAll('[data-seg-li]').forEach(el => { const id = el.dataset.segLi; if (!ids.includes(id)) ids.push(id); });
  const i = ids.indexOf(String(c.id));
  return ids.length ? ids[(i + 1) % ids.length] : null;
}
window.saSiguiente = async (marcar) => {
  const c = _sa.cliente; if (!c) return;
  if (marcar && typeof segMarcar === 'function') await segMarcar(c.id, true);
  const sig = saSiguienteId();
  if (sig && sig !== String(c.id)) { if (typeof seleccionarCliente === 'function') seleccionarCliente(sig); else segIr(sig); window.scrollTo({ top: 0, behavior: 'instant' }); }
  else toast(marcar ? 'Listo. No hay más clientes en la lista.' : 'No hay más clientes en la lista.');
};

// «Revisado»: el área se cuenta cuando estuvo a la vista un momento (o al tocar su chip).
const saClaveVisto = () => `crm:saVisto:${_sa.cliente ? _sa.cliente.id : ''}:${fmt.hoy()}`;
function saVistos() { try { return JSON.parse(localStorage.getItem(saClaveVisto()) || '[]'); } catch (e) { return []; } }
function saMarcarVisto(k) {
  const v = saVistos(); if (v.includes(k)) return;
  v.push(k);
  try { localStorage.setItem(saClaveVisto(), JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ }
  saPintarBarra();
}
function saPintarBarra() {
  const v = saVistos();
  const r = document.querySelector('[data-sa-revisado]');
  if (r) r.textContent = `Revisado ${v.filter(k => SA_AREAS.some(a => a[0] === k)).length} de 6`;
  SA_AREAS.forEach(([k]) => {
    const e = _sa.estados[k] || 'gris';
    const [bg, col, txt] = SA_TONO[e];
    const chip = document.querySelector(`[data-sa-chip="${k}"]`);
    if (chip) { chip.style.background = bg; chip.style.color = col; chip.classList.toggle('visto', v.includes(k)); chip.dataset.saEstado = e; }
    const est = document.querySelector(`[data-sa-est="${k}"]`);
    if (est) { est.style.background = bg; est.style.color = col; est.textContent = txt; }
  });
}
function saEstado(k, e) { _sa.estados[k] = e; saPintarBarra(); }
function saObservar() {
  if (_sa.obs) _sa.obs.disconnect();
  if (!('IntersectionObserver' in window)) return;
  const tiempos = {};
  _sa.obs = new IntersectionObserver((ents) => ents.forEach(en => {
    const k = en.target.dataset.saArea;
    if (en.isIntersecting) tiempos[k] = setTimeout(() => saMarcarVisto(k), 1200);
    else clearTimeout(tiempos[k]);
  }), { threshold: 0.35 });
  document.querySelectorAll('[data-sa-area]').forEach(el => _sa.obs.observe(el));
}

// ── Gráficas (SVG, con su número) ─────────────────────────────────────────
function saBarras(items, { meta = null, color = '#EE8434', alto = 120, fmtV = (v) => String(Math.round(v)) } = {}) {
  const W = 560, H = alto, top = 18, base = H - 22;
  const max = Math.max(meta || 0, ...items.map(i => i.v || 0), 1) * 1.12;
  const bw = W / items.length;
  const y = (v) => base - (v / max) * (base - top);
  return `<svg class="sa-graf" viewBox="0 0 ${W} ${H}" width="100%" role="img" style="display:block;max-width:620px">
    ${meta ? `<line x1="0" x2="${W}" y1="${y(meta)}" y2="${y(meta)}" stroke="#1F1F1F" stroke-dasharray="4 4" stroke-width="1.2"/><text x="${W - 4}" y="${y(meta) - 4}" text-anchor="end" font-size="12" fill="#3A3A3C">meta ${fmtV(meta)}</text>` : ''}
    ${items.map((it, i) => {
      const x = i * bw + bw * 0.2, w = bw * 0.6;
      if (it.v == null) return `<rect x="${x}" y="${base - 3}" width="${w}" height="3" rx="1.5" fill="#E4E0D8"/><text x="${x + w / 2}" y="${H - 6}" text-anchor="middle" font-size="12" fill="#737373">${it.l}</text>`;
      const en = meta ? it.v >= meta * 0.9 && it.v <= meta * 1.1 : true;
      return `<rect x="${x}" y="${y(it.v)}" width="${w}" height="${base - y(it.v)}" rx="5" fill="${en ? color : '#C9C3B8'}"/>
        <text x="${x + w / 2}" y="${y(it.v) - 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#1F1F1F">${fmtV(it.v)}</text>
        <text x="${x + w / 2}" y="${H - 6}" text-anchor="middle" font-size="12" fill="#737373">${it.l}</text>`;
    }).join('')}
  </svg>`;
}
function saLinea(pts, { color = '#EE8434', fmtV = (v) => saNum(v), alto = 110 } = {}) {
  if (pts.length < 2) return '';
  const W = 560, H = alto, pad = 26, top = 20, base = H - 22;
  const vs = pts.map(p => p.v), mn = Math.min(...vs), mx = Math.max(...vs), r = (mx - mn) || 1;
  const x = (i) => pad + (i * (W - 2 * pad)) / (pts.length - 1);
  const y = (v) => base - ((v - mn) / r) * (base - top);
  return `<svg class="sa-graf" viewBox="0 0 ${W} ${H}" width="100%" role="img" style="display:block;max-width:620px">
    <polyline fill="none" stroke="${color}" stroke-width="2.5" points="${pts.map((p, i) => `${x(i)},${y(p.v)}`).join(' ')}"/>
    ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="4" fill="#fff" stroke="${color}" stroke-width="2"/>
      <text x="${x(i)}" y="${y(p.v) - 8}" text-anchor="middle" font-size="12" font-weight="700" fill="#1F1F1F">${fmtV(p.v)}</text>
      <text x="${x(i)}" y="${H - 5}" text-anchor="middle" font-size="12" fill="#737373">${p.l}</text>`).join('')}
  </svg>`;
}

// ── Pintar las áreas con la semana calculada ──────────────────────────────
window.saPintar = async (c, S, D) => {
  _sa.cliente = c; _sa.S = S; _sa.D = D; _sa.estados = {};
  saPintarBarra();
  saObservar();
  saPintarHoy(S);
  saPintarFuerza(S, D);
  // Lo que necesita leer más: en paralelo, cada área se pinta al llegar.
  saPintarPedi(c, S, D);
  saPintarComida(c, S);
  saPintarCuerpo(c, S);
  // Oportunidades de mejora (oportunidades.js), arriba de las áreas.
  if (typeof opPintar === 'function') opPintar(c, S, D);
};

// 1. Hoy
function saPintarHoy(S) {
  const F = S.F || {};
  const notas = (S.notas || []).length;
  const faltaron = (F.faltaron || []).length;
  let e = 'verde';
  if (F.plan && !F.hechas && faltaron >= 2) e = 'rojo';
  else if (faltaron >= 2) e = 'rojo';
  else if (faltaron || notas) e = 'amarillo';
  saEstado('hoy', e);
}

// 4. Fuerza: los estancados (la misma mejor serie en sus últimas 3 sesiones).
function saEstancados(D) {
  const fecha = Object.fromEntries((D.sesiones || []).filter(s => s.estado === 'completada').map(s => [s.id, String(s.fecha).slice(0, 10)]));
  const kg = (s) => (s.unidad === 'lb' ? Number(s.peso) * 0.4536 : Number(s.peso)) || 0;
  const por = {};
  (D.series || []).forEach(x => {
    const f = fecha[x.sesion_id];
    if (!f || x.completada === false || !(Number(x.reps) > 0)) return;
    const e = (por[x.ejercicio_id] ||= { ej: x.ejercicios || null, ses: {} });
    const b = e.ses[f];
    if (!b || kg(x) > kg(b) || (kg(x) === kg(b) && Number(x.reps) > Number(b.reps))) e.ses[f] = x;
  });
  return Object.entries(por).map(([id, e]) => {
    const fs = Object.keys(e.ses).sort().slice(-3);
    if (fs.length < 3) return null;
    const ult = fs.map(f => e.ses[f]);
    const igual = ult.every(s => Math.abs(kg(s) - kg(ult[0])) < 0.01 && Number(s.reps) === Number(ult[0].reps));
    if (!igual || !(kg(ult[0]) > 0)) return null;
    const nombre = typeof entNombres === 'function' ? entNombres(e.ej || {}).grande : ((e.ej && e.ej.nombre) || 'Ejercicio');
    return { id, nombre, serie: ult[2], desde: fs[0] };
  }).filter(Boolean);
}
function saPintarFuerza(S, D) {
  const caja = document.querySelector('[data-sa-fuerza]');
  const sobre = S.sobre || [];
  const sub = sobre.filter(x => x.tipo === 'peso' || x.tipo === 'reps').length;
  const igual = sobre.filter(x => x.tipo === 'igual').length;
  const baja = sobre.filter(x => x.tipo === 'baja').length;
  const est = saEstancados(D);
  _sa.estancados = est;
  if (caja) {
    caja.innerHTML = `<div class="sa-kpis">
        <div class="sa-kpi"><b style="color:#2F7F45">${sub}</b><span>subieron esta semana</span></div>
        <div class="sa-kpi"><b>${igual}</b><span>se mantienen</span></div>
        <div class="sa-kpi"><b style="color:${baja ? '#B4541D' : '#1F1F1F'}">${baja}</b><span>bajaron</span></div>
        <div class="sa-kpi"><b style="color:${est.length ? '#B2402B' : '#1F1F1F'}">${est.length}</b><span>estancados (3 sesiones iguales)</span></div>
      </div>
      ${est.length ? est.map(x => `<div class="sa-row" data-sa-estancado><span style="flex:1"><b>${escapeHtml(x.nombre)}</b> <span class="sa-m">· ${saNum(x.serie.peso)} ${escapeHtml(x.serie.unidad || 'kg')} × ${x.serie.reps} desde el ${saCorta(x.desde)}</span></span>
        <span class="sa-pill" style="background:#FBE3DE;color:#B2402B">Estancado</span>
        <button type="button" class="sa-btn s" onclick="saUsar(${JSON.stringify(`En ${x.nombre} llevas 3 sesiones con ${saNum(x.serie.peso)} ${x.serie.unidad || 'kg'} × ${x.serie.reps}. La próxima vez súbele un poco el peso, aunque bajes un par de repeticiones.`).replace(/"/g, '&quot;')})">Usar en mi mensaje</button></div>`).join('') : ''}`;
  }
  saEstado('fuerza', est.length >= 3 || (baja >= 2 && !sub) ? 'rojo' : est.length || baja ? 'amarillo' : 'verde');
}

// 2. Lo que le pedí: la vez pasada, su rutina sin video pedido.
async function saPintarPedi(c, S, D) {
  const vez = document.querySelector('[data-sa-vez]');
  const sin = document.querySelector('[data-sa-sinvideo]');
  // Pedidos guardados (los 60 días anteriores) y el último mensaje escrito.
  let pedidos = [], ultimoMsj = null;
  try {
    const { data, error } = await sb.from('seguimiento_pedidos').select('*').eq('cliente_id', c.id).gte('fecha', evtSumarDias(fmt.hoy(), -60)).order('fecha', { ascending: false });
    if (error) { _sa.sinTablaPed = /seguimiento_pedidos|relation|schema cache|42P01|PGRST20/i.test(error.message || ''); }
    else pedidos = data || [];
  } catch (e) { pedidos = []; }
  try {
    const { data } = await sb.from('seguimiento_mensajes').select('fecha, texto, origen, titulo').eq('cliente_id', c.id).eq('origen', 'escrito').order('created_at', { ascending: false }).limit(6);
    ultimoMsj = (data || [])[0] || null;
  } catch (e) { ultimoMsj = null; }
  _sa.pedidos = pedidos;
  // Mediciones posteriores y comida reciente, para revisar si cumplió.
  let meds = [];
  try { meds = await db.mediciones.listCliente(c.id); } catch (e) { meds = []; }
  const ctx = { D, meds, comida: S.K || null };
  const conEstado = pedidos.map(p => ({ ...p, rev: saCumplio(p, ctx) }));
  const hoy = fmt.hoy();
  const fechaUlt = conEstado.length ? conEstado[0].fecha : (ultimoMsj ? ultimoMsj.fecha : null);
  const ultimos = conEstado.filter(p => p.fecha === fechaUlt && p.fecha < hoy);
  const repetidos = conEstado.filter(p => p.rev.estado !== 'cumplio').reduce((m, p) => { const k = saNorm(p.texto); m[k] = (m[k] || 0) + 1; return m; }, {});
  if (vez) {
    if (_sa.sinTablaPed) vez.innerHTML = `<div class="sa-card"><div class="sa-k">La vez pasada le dijiste</div><div class="sa-m">Falta un paso: corre una vez <b>migraciones/seguimiento-pedidos.sql</b> en el Supabase del CRM para guardar lo que le pides y revisar si lo cumplió.</div></div>`;
    else if (!ultimos.length && !(ultimoMsj && ultimoMsj.fecha < hoy)) vez.innerHTML = `<div class="sa-card"><div class="sa-k">La vez pasada le dijiste</div><div class="sa-m">Todavía no hay mensajes escritos desde aquí. Lo que le escribas abajo aparece en el próximo seguimiento, con si lo cumplió.</div></div>`;
    else {
      const msj = ultimoMsj && ultimoMsj.fecha === fechaUlt ? ultimoMsj.texto : null;
      const n = ultimos.filter(p => p.rev.estado === 'cumplio').length;
      vez.innerHTML = `<div class="sa-card" data-sa-vezpasada><div class="sa-k">La vez pasada le dijiste · ${saCorta(fechaUlt)}${ultimos.length ? ` · cumplió ${n} de ${ultimos.length}` : ''}</div>
        ${msj ? `<div class="sa-m" style="font-style:italic;line-height:1.45;margin-bottom:6px">«${escapeHtml(msj.length > 280 ? msj.slice(0, 280) + '…' : msj)}»</div>` : ''}
        ${ultimos.map(p => saFilaPedido(p, repetidos)).join('')}
      </div>`;
    }
  }
  // Su rutina sin video pedido: ya no va aquí la lista. El «+ Pedir videos»
  // de Videos de técnica (justo arriba) abre la ventana de pedir, que ya dice
  // de cada ejercicio si nunca se le pidió video.
  if (sin) sin.innerHTML = '';
  // Semáforo: lo de la vez pasada sin cumplir, videos a mejorar sin repedir o que no llegan.
  const vids = typeof vtUltimos === 'function' ? Object.values(vtUltimos(D.videos || [])) : [];
  const viejo = vids.filter(v => v.estado === 'pedido' && saDias(v.pedido_en, hoy) > 10).length;
  const mejorar = vids.filter(v => v.estado === 'mejorar' || v.estado === 'mal').length;
  const noCumplio = ultimos.filter(p => p.rev.estado === 'no').length;
  const insiste = Object.values(repetidos).some(n => n >= 2);
  saEstado('pedi', noCumplio >= 2 || insiste ? 'rojo' : (noCumplio || viejo || mejorar || ultimos.some(p => p.rev.estado === 'pendiente')) ? 'amarillo' : 'verde');
}

function saFilaPedido(p, repetidos) {
  const tono = { cumplio: ['#E4F1E7', '#2F7F45', 'Cumplió'], no: ['#FBE3DE', '#B2402B', 'No lo hizo'], medias: ['#FDEFD9', '#9A5B12', 'A medias'], pendiente: ['#F1EEE8', '#6B6B6B', 'Sin dato aún'] }[p.rev.estado];
  const tipo = (SA_TIPOS.find(t => t[0] === p.tipo) || SA_TIPOS[4])[1];
  const veces = repetidos[saNorm(p.texto)] || 0;
  return `<div class="sa-row" data-sa-pedido="${p.id}"><span style="flex:1;min-width:0"><span class="sa-pill" style="background:#1F1F1F;color:#fff;margin-right:6px">${tipo}</span><b>${escapeHtml(p.texto)}</b>
      <div class="sa-m">${escapeHtml(p.rev.detalle || '')}${veces >= 2 ? ` · <b style="color:#B2402B">van ${veces} seguimientos pidiéndolo: cambia la estrategia</b>` : ''}</div></span>
    <span class="sa-pill" style="background:${tono[0]};color:${tono[1]}">${tono[2]}</span>
    ${p.rev.manual ? `<button type="button" class="sa-x" onclick="saMarcarPedido('${p.id}','cumplio')">Cumplió</button><button type="button" class="sa-x" onclick="saMarcarPedido('${p.id}','no')">No</button>` : ''}</div>`;
}

// ¿Cumplió? Con sus datos cuando se puede; si no, lo marcas tú.
function saCumplio(p, ctx) {
  if (p.estado && p.estado !== 'pendiente') return { estado: p.estado, detalle: 'Lo marcaste tú', manual: true };
  const desde = p.fecha;
  const o = p.objetivo || {};
  if (p.tipo === 'medicion') {
    const m = (ctx.meds || []).filter(x => String(x.fecha) >= desde).pop();
    return m ? { estado: 'cumplio', detalle: `Se midió el ${saCorta(m.fecha)}${m.peso ? ` · ${saNum(m.peso)} kg` : ''}` } : { estado: 'pendiente', detalle: 'No se ha medido desde entonces', manual: true };
  }
  if (p.tipo === 'video') {
    const k = saNorm(o.ejercicio || p.texto);
    const v = (ctx.D.videos || []).filter(x => saNorm(x.ejercicio_nombre).includes(k) || k.includes(saNorm(x.ejercicio_nombre))).sort((a, b) => String(b.pedido_en).localeCompare(String(a.pedido_en)))[0];
    if (v && v.estado !== 'pedido' && String(v.revisado_en || v.pedido_en || '') >= desde) return { estado: 'cumplio', detalle: `Llegó · ${VT_ESTADO && VT_ESTADO[v.estado] ? VT_ESTADO[v.estado].txt.toLowerCase() : v.estado}` };
    return { estado: 'pendiente', detalle: v ? 'Pedido, todavía no llega' : 'No está en sus videos de técnica', manual: true };
  }
  if (p.tipo === 'entreno' && o.ejercicio) {
    const fecha = Object.fromEntries((ctx.D.sesiones || []).filter(s => s.estado === 'completada').map(s => [s.id, String(s.fecha).slice(0, 10)]));
    const k = saNorm(o.ejercicio);
    // Por su nombre en español o en inglés (el de la app).
    const nombres = (x) => [x.ejercicios && x.ejercicios.nombre, x.ejercicios && x.ejercicios.alias].map(saNorm).filter(Boolean);
    const suyas = (ctx.D.series || []).filter(x => fecha[x.sesion_id] && fecha[x.sesion_id] >= desde && nombres(x).some(n => n.includes(k) || k.includes(n)) && Number(x.reps) > 0);
    if (!suyas.length) return { estado: 'pendiente', detalle: 'No ha hecho ese ejercicio desde entonces', manual: true };
    const kg = (s) => (s.unidad === 'lb' ? Number(s.peso) * 0.4536 : Number(s.peso)) || 0;
    const mejor = suyas.reduce((a, b) => (kg(b) > kg(a) ? b : a));
    if (o.peso_kg) return kg(mejor) >= Number(o.peso_kg) - 0.01
      ? { estado: 'cumplio', detalle: `Lo hizo: ${saNum(mejor.peso)} ${mejor.unidad || 'kg'} × ${mejor.reps} el ${saCorta(fecha[mejor.sesion_id])}` }
      : { estado: 'no', detalle: `Siguió con ${saNum(mejor.peso)} ${mejor.unidad || 'kg'} × ${mejor.reps}` };
    return { estado: 'medias', detalle: `Lo hizo ${new Set(suyas.map(s => fecha[s.sesion_id])).size} vez/veces: revisa si subió`, manual: true };
  }
  if (p.tipo === 'comida' && ctx.comida) {
    const dias = (ctx.comida.diasLista || []).filter(d => d.fecha >= desde);
    if (o.foco === 'proteina' && dias.length) {
      const prom = Math.round(dias.reduce((a, d) => a + (d.p || 0), 0) / dias.length);
      const meta = dias[0].goal_p || null;
      return meta && prom >= meta * 0.9 ? { estado: 'cumplio', detalle: `Proteína ${prom} g de ${meta} desde entonces` } : { estado: 'no', detalle: `Proteína ${prom} g${meta ? ` de ${meta}` : ''} desde entonces` };
    }
    if (o.foco === 'registro') {
      const pasaron = Math.max(1, saDias(desde, fmt.hoy()));
      const r = dias.length / pasaron;
      return { estado: r >= 0.7 ? 'cumplio' : r >= 0.4 ? 'medias' : 'no', detalle: `Registró ${dias.length} de ${pasaron} días` };
    }
  }
  return { estado: 'pendiente', detalle: 'Márcalo tú', manual: true };
}
window.saMarcarPedido = async (id, estado) => {
  const { error } = await sb.from('seguimiento_pedidos').update({ estado, revisado_en: new Date().toISOString() }).eq('id', id);
  if (error) return toast(error.message);
  if (_sa.cliente && _sa.S) saPintarPedi(_sa.cliente, _sa.S, _sa.D);
};
window.saContarVid = () => {
  const n = document.querySelectorAll('.sa-vid:checked').length;
  const b = document.querySelector('[data-sa-pedir-videos]');
  if (b) { b.disabled = !n; b.textContent = n ? `Pedir ${n} video${n === 1 ? '' : 's'}` : 'Marca los que quieres pedir'; }
};
window.saPedirVideos = async () => {
  const c = _sa.cliente;
  const marcados = [...document.querySelectorAll('.sa-vid:checked')].map(i => ({ ejercicio_id: i.value, ejercicio_nombre: i.dataset.nombre }));
  if (!c || !marcados.length) return;
  const filas = marcados.map(m => ({ cliente_id: c.id, ...m, estado: 'pedido', pedido_en: fmt.hoy(), pedido_de: null }));
  if (typeof vtDb === 'undefined' || !(await vtDb.crear(filas))) return;
  toast(`${filas.length} video${filas.length === 1 ? '' : 's'} pedido${filas.length === 1 ? '' : 's'}`);
  const lista = marcados.map(m => m.ejercicio_nombre);
  const txt = `Mándame un video de ${lista.length === 1 ? lista[0] : lista.slice(0, -1).join(', ') + ' y ' + lista[lista.length - 1]} la próxima vez que lo${lista.length === 1 ? '' : 's'} hagas: de lado, que se vea todo el movimiento.`;
  saUsar(txt, marcados.map(m => ({ tipo: 'video', texto: `Video de ${m.ejercicio_nombre}`, objetivo: { ejercicio: m.ejercicio_nombre } })));
  if (typeof vtResumen === 'function') { const caja = document.getElementById('seg-vt'); if (caja) vtResumen(caja, c.id); }
  if (_sa.D) { _sa.D.videos = [...(_sa.D.videos || []), ...filas]; saPintarPedi(c, _sa.S, _sa.D); }
};

// 3. Comida: su semana de comida en gráfica, lo que repite y qué recomendarle.
async function saPintarComida(c, S) {
  const caja = document.querySelector('[data-sa-comida]');
  if (!caja) return;
  let d = null;
  try { d = typeof getMealtrackerDataMerged === 'function' ? await getMealtrackerDataMerged(c) : null; } catch (e) { d = null; }
  if (!caja.isConnected || _sa.cliente !== c) return;
  if (!d) { caja.innerHTML = '<div class="sa-card"><div class="sa-m">No pude leer su app (o no está vinculado). Revisa el vínculo en su ficha.</div></div>'; saEstado('comida', 'gris'); return; }
  let peso = null;
  try { const meds = await db.mediciones.listCliente(c.id); const cp = (meds || []).filter(m => m.peso != null); if (cp.length) peso = Number(cp[cp.length - 1].peso); } catch (e) { /* sin peso */ }
  let a = null;
  try { a = analizarNutricionSemana(d, saSemanaISO(S.lunes), c, peso); } catch (e) { a = null; }
  const hist = d.history || {};
  const meta = (a && a.meta && a.meta.kcal) || (d.goals && d.goals.kcal) || null;
  const metaP = (a && a.meta && a.meta.p) || (d.goals && d.goals.p) || null;
  const L = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const dias = S.fechas.map((f, i) => ({ l: L[i], v: hist[f] && Number(hist[f].kcal) > 0 ? Number(hist[f].kcal) : null, p: hist[f] ? Number(hist[f].p) || 0 : null, futuro: f > S.hoy }));
  const reg = dias.filter(x => x.v != null);
  const enMeta = meta ? reg.filter(x => x.v >= meta * 0.9 && x.v <= meta * 1.1).length : null;
  const prot = reg.length ? Math.round(reg.reduce((s, x) => s + x.p, 0) / reg.length) : null;
  const H = a && typeof npLecturas === 'function' ? npLecturas(a) : [];
  const acciones = H.filter(h => h.tono === 'ojo' || h.tono === 'idea').slice(0, 3);
  const bien = H.filter(h => h.tono === 'bien').slice(0, 1);
  const top = ((a && a.top_frecuentes) || []).slice(0, 5);
  const recetas = (a && a.recetas_usadas) || [];
  const desp = (a && a.despensa) || {};
  const conf = (n, s, p) => `${n} ${n === 1 ? s : p}`;
  caja.innerHTML = `<div class="sa-card" data-sa-comida-card>
      <div class="sa-kpis">
        <div class="sa-kpi"><b>${reg.length}/${dias.filter(x => !x.futuro).length || 7}</b><span>días registrados</span></div>
        <div class="sa-kpi"><b>${enMeta != null ? enMeta : '—'}</b><span>días en su meta (±10 %)</span></div>
        <div class="sa-kpi"><b>${prot != null ? `${prot} g` : '—'}</b><span>proteína promedio${metaP ? ` · meta ${metaP}` : ''}</span></div>
        <div class="sa-kpi"><b>${recetas.length}</b><span>recetas que cocinó</span></div>
      </div>
      <div class="sa-k">Calorías día por día${meta ? ` · meta ${Math.round(meta)}` : ''}</div>
      ${saBarras(dias, { meta, color: '#EE8434' })}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-top:12px">
        <div><div class="sa-k">Lo que más repite</div>${top.length ? top.map(t => `<div class="sa-row" style="padding:6px 0">${escapeHtml(t.nombre || t.name || '')}<span class="sa-m" style="margin-left:auto">${t.veces || t.count || ''}${t.veces || t.count ? '×' : ''}</span></div>`).join('') : '<div class="sa-m">Sin desglose esta semana.</div>'}</div>
        <div><div class="sa-k">Recetas y menús</div>${recetas.slice(0, 3).map(r => `<div class="sa-row" style="padding:6px 0">${escapeHtml(r.nombre)}<span class="sa-m" style="margin-left:auto">${r.veces}×</span></div>`).join('')}
          <div class="sa-row" style="padding:6px 0">${conf((desp.menus_creados || []).length, 'menú creado', 'menús creados')} · ${conf((desp.comidas_favoritas || []).length, 'favorita', 'favoritas')}</div></div>
      </div>
      ${acciones.length ? `<div class="sa-k" style="margin-top:12px">Qué recomendarle</div>${acciones.map(h => `<div class="sa-diag" data-sa-lectura><b>${escapeHtml(h.titulo)}.</b> ${escapeHtml(h.detalle)}${h.dato ? ` <span class="sa-m">(${escapeHtml(h.dato)})</span>` : ''}</div>`).join('')}` : ''}
      ${bien.length ? `<div class="sa-m" style="margin-top:10px">No tocar: <b>${escapeHtml(bien[0].titulo)}</b></div>` : ''}
      <div class="sa-btns">
        ${acciones.length ? `<button type="button" class="sa-btn" onclick="saUsarComida()">Usar en mi mensaje</button>` : ''}
        <button type="button" class="sa-btn s" onclick="verNutricionCliente('${c.id}')">Ver día por día</button>
      </div>
    </div>`;
  _sa.comidaAcciones = acciones;
  const pocos = reg.length < 4 && dias.filter(x => !x.futuro).length >= 4;
  saEstado('comida', pocos ? 'rojo' : acciones.some(h => h.tono === 'ojo' || h.tono === 'idea') ? 'amarillo' : 'verde');
}
window.saUsarComida = () => {
  const h = (_sa.comidaAcciones || [])[0];
  if (!h) return;
  saUsar(`${h.titulo}: ${h.detalle}`, [{ tipo: 'comida', texto: h.titulo, objetivo: { foco: /prote/i.test(h.titulo) ? 'proteina' : /registr/i.test(h.titulo) ? 'registro' : 'otro' } }]);
};

// 5 y 6. Composición (medición mensual) y meta nutricional.
async function saPintarCuerpo(c, S) {
  const cajaC = document.querySelector('[data-sa-composicion]'), cajaM = document.querySelector('[data-sa-meta]');
  let meds = [], metas = [];
  try { [meds, metas] = await Promise.all([db.mediciones.listCliente(c.id), db.metas.listCliente(c.id)]); } catch (e) { /* sin datos */ }
  meds = (meds || []).slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  if (!cajaC || !cajaC.isConnected || _sa.cliente !== c) return;
  const hoy = fmt.hoy();
  const conPeso = meds.filter(m => m.peso != null);
  const ult = conPeso[conPeso.length - 1] || null;
  const dias = ult ? saDias(ult.fecha, hoy) : null;
  const conGrasa = meds.filter(m => m.grasa_pct != null);
  const ultG = conGrasa[conGrasa.length - 1] || null;
  const hace3 = evtSumarDias(hoy, -90);
  const ref = conPeso.find(m => String(m.fecha) >= hace3) || null;
  const toca = dias == null || dias > SA_DIAS_MEDICION;
  const pts = conPeso.slice(-6).map(m => ({ v: Number(m.peso), l: saCorta(m.fecha) }));
  const ptsG = conGrasa.slice(-6).map(m => ({ v: Number(m.grasa_pct), l: saCorta(m.fecha) }));
  cajaC.innerHTML = `<div class="sa-card" data-sa-comp-card>
      <div class="sa-kpis">
        <div class="sa-kpi"><b>${ult ? `${saNum(ult.peso)} kg` : '—'}</b><span>${ult ? `último peso · hace ${dias} días` : 'sin mediciones'}</span></div>
        <div class="sa-kpi"><b>${ultG ? `${saNum(ultG.grasa_pct)} %` : '—'}</b><span>${ultG ? `grasa · hace ${saDias(ultG.fecha, hoy)} días` : 'sin % de grasa'}</span></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px">
        ${pts.length >= 2 ? `<div><div class="sa-k">Peso</div>${saLinea(pts, { color: '#EE8434' })}</div>` : ''}
        ${ptsG.length >= 2 ? `<div><div class="sa-k">% de grasa</div>${saLinea(ptsG, { color: '#3C7BD6' })}</div>` : ''}
      </div>
      <div class="sa-diag">${toca ? `<b>Toca medición.</b> ${ult ? `La última fue hace ${dias} días` : 'No tiene ninguna'} y la pides cada mes.` : `Al día: la próxima medición toca en ${SA_DIAS_MEDICION - dias} días.`}${ult && ref && ref !== ult ? ` En los últimos 3 meses: ${Number(ult.peso) - Number(ref.peso) > 0 ? '+' : ''}${saNum(Number(ult.peso) - Number(ref.peso))} kg.` : ''}</div>
      <div class="sa-btns">${toca ? `<button type="button" class="sa-btn" data-sa-pedir-medicion onclick="saPedirMedicion()">Pedirle medición en su app</button>` : ''}<button type="button" class="sa-btn s" onclick="verComposicionCliente('${c.id}')">Ver composición</button></div>
    </div>`;
  saEstado('composicion', dias == null || dias > SA_DIAS_MEDICION ? 'rojo' : dias > SA_DIAS_MEDICION - 5 ? 'amarillo' : 'verde');

  // Meta: la vigente, lo que come (14 días) y si quedó desactualizada.
  if (!cajaM) return;
  const av = typeof compEvaluarMeta === 'function' ? compEvaluarMeta(c, meds, metas || []) : null;
  const vig = (metas || []).find(m => m.kcal) || (c.meta_calorias ? { kcal: c.meta_calorias, proteina_g: c.meta_proteina_g, peso_kg: null } : null);
  const K = S.K || null;
  const prom = K && K.kcalProm ? K.kcalProm : (K && K.diasLista && K.diasLista.length ? Math.round(K.diasLista.reduce((a, d) => a + (d.kcal || 0), 0) / K.diasLista.length) : null);
  const pct = vig && vig.kcal && prom ? Math.round((prom / vig.kcal) * 100) : null;
  const lado = pct == null ? null : pct > 110 ? 'por encima' : pct < 90 ? 'por debajo' : 'en su meta';
  const barra = (lab, v, max, col) => `<div style="margin:6px 0"><div class="sa-m" style="display:flex;justify-content:space-between"><span>${lab}</span><b style="color:#1F1F1F">${v != null ? Math.round(v).toLocaleString('es-CO') : '—'} kcal</b></div><div style="height:12px;border-radius:99px;background:#F1EEE8;overflow:hidden"><div style="height:100%;width:${v ? Math.min(100, (v / max) * 100) : 0}%;background:${col};border-radius:99px"></div></div></div>`;
  const max = Math.max(vig && vig.kcal || 0, prom || 0, 1) * 1.1;
  let texto = '', e = 'verde';
  if (!vig) { texto = '<b>No tiene meta nutricional.</b> Sin meta, su app no tiene contra qué comparar lo que come.'; e = 'rojo'; }
  else if (av && av.nivel === 'revisar') { texto = `<b>Meta desactualizada.</b> ${(av.razones || []).map(r => r.replace(/<\/?strong>/g, '')).join(' ')}`; e = 'amarillo'; }
  else { texto = `<b>La meta sigue cuadrando.</b>${vig.peso_kg ? ` Se calculó con ${saNum(vig.peso_kg)} kg.` : ''}`; }
  if (lado && lado !== 'en su meta') { texto += ` En promedio come ${lado} de su meta (${pct} %).`; if (e === 'verde') e = 'amarillo'; }
  cajaM.innerHTML = `<div class="sa-card" data-sa-meta-card>
      ${barra(`Meta${vig && vig.peso_kg ? ` · calculada con ${saNum(vig.peso_kg)} kg` : ''}`, vig ? vig.kcal : null, max, '#1F1F1F')}
      ${barra(`Lo que come en promedio${K && K.diasLista ? ` (${K.diasLista.length} días registrados, 14 días)` : ''}${pct != null ? ` · ${pct} %` : ''}`, prom, max, '#46965A')}
      <div class="sa-diag">${texto}</div>
      <div class="sa-btns">${av && (av.nivel === 'revisar' || av.nivel === 'sin_meta') ? `<button type="button" class="sa-btn" data-sa-recalcular onclick="saRecalcular()">Recalcular aquí</button>` : ''}<button type="button" class="sa-btn s" onclick="verComposicionCliente('${c.id}')">Historial de metas</button></div>
    </div>`;
  _sa.meds = meds; _sa.av = av;
  saEstado('meta', e);
}
window.saPedirMedicion = async () => {
  const c = _sa.cliente; if (!c) return;
  const mtId = typeof resolverMealtrackerId === 'function' ? await resolverMealtrackerId(c) : null;
  if (!mtId) return toast('Este cliente no está vinculado con su app');
  const r = await fetchRemindersMT(mtId);
  const lista = Array.isArray(r.list) ? r.list.slice() : [];
  const text = 'Toca tu medición del mes: peso, % de grasa y fotos. Cuando la tengas, regístrala en tu app.';
  if (lista.some(x => !x.done_at && x.text === text)) return toast('Ya la tiene pedida en su app');
  lista.push({ id: `med-${Date.now()}`, text, created_at: new Date().toISOString(), done_at: null, done_by: null });
  if (!(await saveRemindersMT(mtId, lista))) return toast('No pude guardarlo en su app');
  toast('Le salió en su app: «Toca tu medición del mes»');
  saUsar('Toca la medición del mes: te la dejé en tu app.', [{ tipo: 'medicion', texto: 'Medición del mes', objetivo: {} }]);
};
window.saRecalcular = () => {
  const c = _sa.cliente; if (!c || typeof compCalculadoraHTML !== 'function') return verComposicionCliente(c.id);
  _comp.cliente = c; _comp.clienteId = c.id;
  const html = compCalculadoraHTML(c, _sa.meds || [], _sa.av).replace(/compFijarMeta\(\)/g, 'saFijarMeta()');
  openModal(modalShell(`Recalcular la meta de ${escapeHtml(c.nombre)}`, html, '<button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>'), { wide: true });
  try { compCalcVivo(); } catch (e) { /* la calculadora se llena al escribir */ }
};
window.saFijarMeta = async () => {
  await compFijarMeta();
  if (typeof closeModal === 'function') closeModal();
  if (_sa.cliente && _sa.S) saPintarCuerpo(_sa.cliente, _sa.S);
};

// ── La caja para escribirle ──────────────────────────────────────────────
// Lo que pidas se detecta en tu texto (IA, al dejar de escribir) y lo
// confirmas o corriges antes de enviar.
window.saUsar = (texto, pedidos = []) => {
  const t = document.getElementById('sa-texto');
  if (!t) return;
  t.value = (t.value.trim() ? t.value.trim() + '\n\n' : '') + texto;
  // Los que vienen de un botón (pedir video, medición…) se quedan aunque se vuelva a detectar.
  _sa.detectado = [...(_sa.detectado || []), ...pedidos.map(p => ({ ...p, manual: true }))];
  _sa.textoDetectado = t.value;
  saPintarPedidos();
  document.getElementById('sa-caja')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
};
window.saTexto = () => {
  clearTimeout(_sa.timer);
  _sa.timer = setTimeout(saDetectar, 1500);
};
async function saDetectar() {
  const t = document.getElementById('sa-texto');
  if (!t) return;
  const texto = t.value.trim();
  if (texto.length < 25 || texto === _sa.textoDetectado) return;
  _sa.textoDetectado = texto;
  const caja = document.querySelector('[data-sa-pedidos]');
  if (caja) caja.innerHTML = '<div class="sa-m" style="margin-top:8px">Buscando lo que le pides…</div>';
  const ejercicios = [...new Set((_sa.D && _sa.D.series || []).map(x => (typeof entNombres === 'function' ? entNombres(x.ejercicios || {}).grande : (x.ejercicios && x.ejercicios.nombre))).filter(Boolean))].slice(0, 60);
  try {
    const r = await fetch('/api/coach-insight', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modo: 'pedidos', texto, ejercicios }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !Array.isArray(j.pedidos)) throw new Error(j.error || 'sin respuesta');
    if (t.value.trim() !== texto) return;   // siguió escribiendo: se vuelve a pedir
    const manuales = (_sa.detectado || []).filter(p => p.manual);
    _sa.detectado = [...j.pedidos.map(p => ({ tipo: SA_TIPOS.some(x => x[0] === p.tipo) ? p.tipo : 'otro', texto: String(p.texto || '').slice(0, 160), objetivo: { ejercicio: p.ejercicio || null, peso_kg: p.peso_kg || null, foco: p.foco || null } })), ...manuales];
  } catch (e) {
    _sa.detectado = _sa.detectado || [];
    if (caja) { saPintarPedidos(); caja.insertAdjacentHTML('afterbegin', '<div class="sa-m" style="margin-top:8px">No pude detectar los pedidos solo: agrégalos con los botones.</div>'); }
    return;
  }
  saPintarPedidos();
}
function saPintarPedidos() {
  const caja = document.querySelector('[data-sa-pedidos]');
  if (!caja) return;
  const ps = _sa.detectado || [];
  caja.innerHTML = `${ps.length ? `<div style="font-weight:700;font-size:14px;margin-top:10px">Lo que le estás pidiendo <span class="sa-m" style="font-weight:500">· corrígelo si hace falta; se revisa en el próximo seguimiento</span></div>` : ''}
    ${ps.map((p, i) => `<div class="sa-ped" data-sa-ped="${i}">
      <select onchange="saPedCambio(${i},'tipo',this.value)">${SA_TIPOS.map(([k, t]) => `<option value="${k}" ${p.tipo === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <input value="${escapeHtml(p.texto)}" onchange="saPedCambio(${i},'texto',this.value)">
      <button type="button" class="sa-x" onclick="saPedQuitar(${i})">quitar</button></div>`).join('')}
    <div class="sa-m" style="margin-top:8px">+ Agregar: ${SA_TIPOS.map(([k, t]) => `<button type="button" class="sa-chip" style="background:#F1EEE8;color:#1F1F1F;padding:4px 10px;font-size:12.5px" onclick="saPedAgregar('${k}')">${t}</button>`).join(' ')}</div>`;
}
window.saPedCambio = (i, campo, v) => { if (_sa.detectado && _sa.detectado[i]) _sa.detectado[i][campo] = v; };
window.saPedQuitar = (i) => { (_sa.detectado || []).splice(i, 1); saPintarPedidos(); };
window.saPedAgregar = (tipo) => { _sa.detectado = [...(_sa.detectado || []), { tipo, texto: '', objetivo: {}, manual: true }]; saPintarPedidos(); const ins = document.querySelectorAll('[data-sa-ped] input'); if (ins.length) ins[ins.length - 1].focus(); };

window.saEnviar = async (whatsapp) => {
  const c = _sa.cliente;
  const t = document.getElementById('sa-texto');
  const texto = t ? t.value.trim() : '';
  if (!c || !texto) return toast('Escribe primero el mensaje');
  if (whatsapp) {
    const tel = String(c.telefono || '').replace(/[^\d]/g, '');
    if (!tel) return toast('Este cliente no tiene teléfono en su ficha');
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
  }
  if (typeof segRegistrar === 'function') await segRegistrar(c.id, { origen: 'escrito', titulo: whatsapp ? 'Mensaje por WhatsApp' : 'Mensaje (solo guardado)', texto });
  const peds = (_sa.detectado || []).filter(p => String(p.texto || '').trim());
  if (peds.length && !_sa.sinTablaPed) {
    const { error } = await sb.from('seguimiento_pedidos').insert(peds.map(p => ({ cliente_id: c.id, fecha: fmt.hoy(), tipo: p.tipo, texto: String(p.texto).trim().slice(0, 160), objetivo: p.objetivo || {}, estado: 'pendiente' })));
    if (error) { _sa.sinTablaPed = true; toast('Mensaje guardado. Para guardar los pedidos falta correr migraciones/seguimiento-pedidos.sql'); }
  }
  toast(peds.length ? `Guardado con ${peds.length} pedido${peds.length === 1 ? '' : 's'} para revisar la próxima vez` : 'Guardado en su historial');
  if (t) t.value = '';
  _sa.detectado = []; _sa.textoDetectado = '';
  saPintarPedidos();
  if (typeof segPintarUltimo === 'function') segPintarUltimo(c);
};
