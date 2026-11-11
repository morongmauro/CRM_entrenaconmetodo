// =====================================================
// MEDICIÓN DE LA PÁGINA DE VENTA · en «Mi negocio»
// =====================================================
// Lo que pasa en la landing (entrenaconmetodo.vercel.app), de forma anónima:
// cuántas personas entran, de dónde llegan, hasta qué sección bajan, cuántas
// tocan «Escríbeme» y qué preguntas abren. La landing escribe cada evento en
// la tabla `landing_eventos` (migraciones/landing-medicion.sql) y aquí solo se
// LEE: no cambia nada de ningún cliente.
//
// Cómo se cuenta:
//   · persona  = un navegador (código al azar guardado en ese teléfono);
//   · visita   = cada vez que abre la página;
//   · embudo   = de las personas que entraron, cuántas vieron cada sección;
//   · «Escríbeme» = personas que tocaron el botón (no sabemos si enviaron el
//     mensaje: eso pasa dentro de Instagram).
//
// Carga DESPUÉS de app.js (usa sb, fmt y escapeHtml).
// =====================================================

const LM_SECCIONES = [
  ['portada', 'Portada (carta 1)'], ['carta2', 'Carta 2 · Come sin adivinar'], ['carta3', 'Carta 3 · Sabes qué toca hoy'],
  ['dolor', '¿Es para ti?'], ['resultados', 'El progreso llega en capas'], ['ciencia', 'Basado en ciencia'],
  ['incluye', 'Todo lo que recibes'], ['app', 'La app'], ['coach', 'Tu coach'], ['precio', 'Precio'],
  ['preguntas', 'Preguntas'], ['cierre', 'Cierre'],
];
const LM_NOMBRE = Object.fromEntries(LM_SECCIONES);
const LM_ORIGEN = { instagram: 'Instagram', directo: 'Directo (enlace pegado o escrito)', whatsapp: 'WhatsApp', google: 'Google', facebook: 'Facebook', tiktok: 'TikTok' };
const _lm = { dias: 30, filas: null, error: null };

const lmSumar = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const x = new Date(y, m - 1, d + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const lmEsc = (s) => (typeof escapeHtml === 'function' ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
const lmHoy = () => (typeof fmt !== 'undefined' && fmt.hoy ? fmt.hoy() : new Date().toISOString().slice(0, 10));
const lmDia = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][m - 1]}`; };

// Trae los eventos desde una fecha (de a 1.000, que es el tope por consulta).
async function lmTraer(desde) {
  const todo = [];
  for (let a = 0; a < 40000; a += 1000) {
    const { data, error } = await sb.from('landing_eventos').select('fecha,visitante,sesion,tipo,detalle,origen,dispositivo').gte('fecha', desde).order('fecha', { ascending: true }).range(a, a + 999);
    if (error) throw error;
    todo.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return todo;
}

// Las cuentas de un periodo (función pura: se puede probar sola).
function lmResumen(filas, desde, hasta) {
  const f = (filas || []).filter(x => x.fecha >= desde && x.fecha <= hasta);
  const personas = new Set(f.map(x => x.visitante));
  const visitas = new Set(f.filter(x => x.tipo === 'visita').map(x => x.sesion || x.visitante + x.fecha));
  const conClic = new Set(f.filter(x => x.tipo === 'clic').map(x => x.visitante));
  const vio = (k) => (k === 'portada' ? personas.size : new Set(f.filter(x => x.tipo === 'seccion' && x.detalle === k).map(x => x.visitante)).size);
  const embudo = LM_SECCIONES.map(([k, nombre]) => ({ k, nombre, n: vio(k) }));
  // Dónde se va más gente: la mayor caída entre dos secciones seguidas.
  let caida = null;
  for (let i = 1; i < embudo.length; i++) {
    const baja = embudo[i - 1].n - embudo[i].n;
    if (embudo[i - 1].n > 0 && baja > 0 && (!caida || baja > caida.baja)) caida = { de: embudo[i - 1].nombre, a: embudo[i].nombre, baja, pct: Math.round(baja / embudo[i - 1].n * 100) };
  }
  const contar = (lista, clave) => { const m = new Map(); lista.forEach(x => { const k = clave(x); if (k) m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const primera = new Map(); f.filter(x => x.tipo === 'visita').forEach(x => { if (!primera.has(x.visitante)) primera.set(x.visitante, x); });
  const origenes = contar([...primera.values()], x => x.origen || 'directo');
  const celular = [...primera.values()].filter(x => x.dispositivo === 'celular').length;
  const clicsEn = contar(f.filter(x => x.tipo === 'clic'), x => x.detalle || 'portada');
  const preguntas = contar(f.filter(x => x.tipo === 'pregunta'), x => x.detalle);
  const dias = []; for (let d = desde; d <= hasta; d = lmSumar(d, 1)) dias.push({ fecha: d, n: new Set(f.filter(x => x.fecha === d).map(x => x.visitante)).size });
  return { personas: personas.size, visitas: visitas.size, clic: conClic.size, tasa: personas.size ? Math.round(conClic.size / personas.size * 100) : null, embudo, caida, origenes, celular, conDispositivo: primera.size, clicsEn, preguntas, dias };
}

function lmEstilos() {
  if (document.getElementById('lm-estilos')) return;
  const s = document.createElement('style'); s.id = 'lm-estilos';
  s.textContent = `
  .lm-cab { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px; margin-bottom:14px; }
  .lm-sub { font-size:13px; color:#6B6B6B; margin-top:2px; }
  .lm-per { display:inline-flex; background:#F1EEE8; border-radius:999px; padding:3px; }
  .lm-per button { border:0; background:none; font:inherit; font-size:13px; font-weight:700; color:#5A5A5F; padding:6px 13px; border-radius:999px; cursor:pointer; }
  .lm-per button[aria-pressed="true"] { background:#1F1F1F; color:#fff; }
  .lm-kpis { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:10px; }
  .lm-kpi { border-radius:16px; padding:14px 16px; background:#F7F5F0; }
  .lm-kpi b { display:block; font-size:30px; font-weight:800; letter-spacing:-.03em; line-height:1.05; color:#1F1F1F; }
  .lm-kpi span { display:block; font-size:13px; color:#5A5A5F; margin-top:3px; line-height:1.3; }
  .lm-kpi.clave { background:#FBEFCF; }
  .lm-dos { display:grid; grid-template-columns:minmax(0, 1fr); gap:18px; margin-top:18px; }
  .lm-t { font-size:14px; font-weight:800; color:#1F1F1F; margin-bottom:8px; }
  .lm-fila { display:grid; grid-template-columns:minmax(0, 11.5em) minmax(0, 1fr) 5.6em; align-items:center; gap:10px; padding:4px 0; font-size:13.5px; color:#3A3A3D; }
  .lm-barra { height:14px; border-radius:7px; background:#F1EEE8; overflow:hidden; } .lm-barra i { display:block; height:100%; border-radius:7px; background:#3C7BD6; }
  .lm-fila.cta .lm-barra i { background:#F2C94C; } .lm-fila .lm-n { text-align:right; white-space:nowrap; font-weight:700; font-variant-numeric:tabular-nums; }
  .lm-aviso { margin-top:10px; padding:10px 12px; border-radius:12px; background:#FDEFD9; color:#8A4B0F; font-size:13.5px; line-height:1.35; }
  .lm-dias { display:flex; align-items:flex-end; gap:2px; height:74px; } .lm-dias i { flex:1; min-width:2px; border-radius:3px 3px 0 0; background:#3C7BD6; opacity:.85; }
  .lm-dias i.cero { background:#E6E2D8; height:2px !important; }
  .lm-eje { display:flex; justify-content:space-between; font-size:12px; color:#8C8A84; margin-top:4px; }
  .lm-lista { display:grid; gap:5px; font-size:13.5px; color:#3A3A3D; } .lm-lista div { display:flex; justify-content:space-between; gap:12px; } .lm-lista b { font-weight:700; font-variant-numeric:tabular-nums; }
  .lm-pie { margin-top:14px; font-size:12.5px; color:#8C8A84; line-height:1.4; }
  @media (min-width:900px) { .lm-kpis { grid-template-columns:repeat(4, minmax(0, 1fr)); } .lm-dos { grid-template-columns:minmax(0, 3fr) minmax(0, 2fr); gap:28px; } }`;
  document.head.appendChild(s);
}

function lmHTML(R, dias) {
  const cab = `<div class="lm-cab"><div><div class="lm-sub">Lo que pasa en entrenaconmetodo.vercel.app · anónimo</div></div>
    <div class="lm-per" role="group" aria-label="Periodo">${[7, 30, 90].map(n => `<button type="button" data-lm-dias="${n}" aria-pressed="${n === dias}">${n} días</button>`).join('')}</div></div>`;
  if (!R.personas) return `${cab}<div class="text-sm text-slate-500" data-lm-vacio>Todavía no hay visitas registradas en estos ${dias} días. La medición empieza a contar cuando la página nueva esté publicada.</div>
    <div class="lm-pie">Para que tus propias visitas no cuenten, abre una vez desde tu teléfono: entrenaconmetodo.vercel.app/?yo=1</div>`;
  const max = Math.max(1, R.personas);
  const embudo = R.embudo.map(e => `<div class="lm-fila" data-lm-seccion="${e.k}"><span>${lmEsc(e.nombre)}</span><span class="lm-barra"><i style="width:${Math.round(e.n / max * 100)}%"></i></span><span class="lm-n">${e.n} · ${Math.round(e.n / max * 100)}%</span></div>`).join('');
  const filaCta = `<div class="lm-fila cta" data-lm-cta><span>Tocaron «Escríbeme»</span><span class="lm-barra"><i style="width:${Math.round(R.clic / max * 100)}%"></i></span><span class="lm-n">${R.clic} · ${Math.round(R.clic / max * 100)}%</span></div>`;
  const caida = R.caida ? `<div class="lm-aviso" data-lm-caida>Donde más gente se va: entre «${lmEsc(R.caida.de)}» y «${lmEsc(R.caida.a)}» se pierden ${R.caida.baja} persona${R.caida.baja === 1 ? '' : 's'} (${R.caida.pct}%).</div>` : '';
  const maxDia = Math.max(1, ...R.dias.map(d => d.n));
  const porDia = `<div class="lm-dias" data-lm-dias-grafica>${R.dias.map(d => `<i class="${d.n ? '' : 'cero'}" style="height:${Math.max(2, Math.round(d.n / maxDia * 74))}px" title="${lmDia(d.fecha)}: ${d.n} persona${d.n === 1 ? '' : 's'}"></i>`).join('')}</div>
    <div class="lm-eje"><span>${lmDia(R.dias[0].fecha)}</span><span>${lmDia(R.dias[R.dias.length - 1].fecha)}</span></div>`;
  const lista = (pares, nombre, vacio) => (pares.length ? `<div class="lm-lista">${pares.slice(0, 6).map(([k, n]) => `<div><span>${lmEsc(nombre(k))}</span><b>${n}</b></div>`).join('')}</div>` : `<div class="lm-sub">${vacio}</div>`);
  const pctCel = R.conDispositivo ? Math.round(R.celular / R.conDispositivo * 100) : null;
  return `${cab}
    <div class="lm-kpis">
      <div class="lm-kpi" data-lm-personas><b>${R.personas}</b><span>personas entraron</span></div>
      <div class="lm-kpi" data-lm-visitas><b>${R.visitas}</b><span>visitas en total</span></div>
      <div class="lm-kpi" data-lm-clic><b>${R.clic}</b><span>tocaron «Escríbeme»</span></div>
      <div class="lm-kpi clave" data-lm-tasa><b>${R.tasa == null ? '—' : R.tasa + '%'}</b><span>de cada 100 personas, ${R.tasa == null ? '—' : R.tasa} tocan «Escríbeme»</span></div>
    </div>
    <div class="lm-dos">
      <div>
        <div class="lm-t">Hasta dónde bajan</div>
        ${embudo}${filaCta}${caida}
      </div>
      <div>
        <div class="lm-t">Personas por día</div>
        ${porDia}
        <div class="lm-t" style="margin-top:16px">De dónde llegan</div>
        ${lista(R.origenes, k => LM_ORIGEN[k] || k, 'Sin datos todavía.')}
        ${pctCel == null ? '' : `<div class="lm-sub" style="margin-top:6px" data-lm-celular>${pctCel}% entra desde el celular.</div>`}
        <div class="lm-t" style="margin-top:16px">En qué parte tocan «Escríbeme»</div>
        ${lista(R.clicsEn, k => LM_NOMBRE[k] || k, 'Nadie lo ha tocado todavía.')}
        <div class="lm-t" style="margin-top:16px">Preguntas que más abren</div>
        ${lista(R.preguntas, k => k, 'Nadie ha abierto preguntas todavía.')}
      </div>
    </div>
    <div class="lm-pie">«Tocaron Escríbeme» cuenta a quien tocó el botón; si envió el mensaje se ve en tu Instagram. Para que tus propias visitas no cuenten, abre una vez desde tu teléfono: entrenaconmetodo.vercel.app/?yo=1</div>`;
}

window.lmResumen = lmResumen;
window.landingPintar = async (cajaId = 'negocio-landing') => {
  const caja = document.getElementById(cajaId);
  if (!caja) return;
  lmEstilos();
  const hoy = lmHoy();
  if (!_lm.filas) {
    try { _lm.filas = await lmTraer(lmSumar(hoy, -89)); _lm.error = null; }
    catch (e) { _lm.error = e; }
  }
  if (!caja.isConnected) return;
  if (_lm.error) {
    caja.innerHTML = '<div class="text-sm text-slate-500" data-lm-sin-tabla>Falta correr <b>migraciones/landing-medicion.sql</b> en el Supabase del CRM (solo crea una tabla nueva). Después, la página de venta empieza a contar sola.</div>';
    _lm.error = null; return;
  }
  caja.innerHTML = lmHTML(lmResumen(_lm.filas, lmSumar(hoy, -(_lm.dias - 1)), hoy), _lm.dias);
  caja.querySelectorAll('[data-lm-dias]').forEach(b => b.addEventListener('click', () => { _lm.dias = Number(b.dataset.lmDias); window.landingPintar(cajaId); }));
};
// Al volver a entrar a «Mi negocio» se vuelve a leer (datos frescos).
window.landingRefrescar = () => { _lm.filas = null; };
