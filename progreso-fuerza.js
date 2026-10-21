// =====================================================
// PROGRESO DE FUERZA · sobrecarga progresiva por ejercicio y por patrón
// =====================================================
// Sale en Seguimiento (por cliente) y en la ficha del cliente (pestaña
// Entrenamiento). Todo con lo que el cliente ya marcó en su app (y lo
// importado de Trainerize): sin modelo y sin costo.
//
// · Por ejercicio: la mejor serie de cada sesión. La línea es el peso y las
//   barras son las reps de esa serie: se ve si sube por carga, por reps o
//   por las dos. En los de peso corporal manda las reps.
// · Por patrón (Empuje, Tracción, Pierna): cuánto subió su fuerza, semana a
//   semana, comparando cada ejercicio con su primera vez (1RM estimado con
//   Epley, que sube tanto con más peso como con más reps) y promediando.
//
// Carga DESPUÉS de entrenamiento.js (usa entDb, entNombres, entE1rm y
// ENT_LB_KG).
// =====================================================

const PF_PATRON = {
  push: 'empuje', pull: 'traccion', rodilla: 'pierna', cadera: 'pierna',
};
const PF_GRUPOS = [
  { id: 'empuje', nombre: 'Empuje', color: '#3C7BD6', tinta: 'rgba(60,123,214,.12)' },
  { id: 'traccion', nombre: 'Tracción', color: '#EE8434', tinta: 'rgba(238,132,52,.12)' },
  { id: 'pierna', nombre: 'Pierna', color: '#46965A', tinta: 'rgba(70,150,90,.12)' },
];
const _pf = { datos: new Map(), vista: 'ejercicio', patron: 'todos', ej: null };
const PF_MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const pfFecha = (iso) => { const [, m, d] = String(iso).slice(0, 10).split('-').map(Number); return `${d} ${PF_MESES[m - 1]}`; };
const pfNum = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
const pfLunes = (iso) => {
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

// ── Los datos ───────────────────────────────────────────────────────────
async function pfCargar(clienteId) {
  const ses = await entDb.sesiones(clienteId, { limite: 400 });
  if (ses === null) return null;
  const hechas = (ses || []).filter(s => s.estado === 'completada');
  const series = hechas.length ? await entDb.seriesDeSesiones(hechas.map(s => s.id)) : [];
  // El patrón de cada ejercicio (sin join: se pide aparte).
  const ids = [...new Set(series.map(l => l.ejercicio_id).filter(Boolean))];
  const ejs = new Map();
  for (let i = 0; i < ids.length; i += 80) {
    const { data } = await sb.from('ejercicios').select('id, nombre, alias, patron, tipo').in('id', ids.slice(i, i + 80));
    (data || []).forEach(e => ejs.set(e.id, e));
  }
  return pfCalcular(hechas, series, ejs);
}

function pfCalcular(sesiones, series, ejs) {
  const fechaDe = new Map(sesiones.map(s => [s.id, s.fecha]));
  const porEj = new Map();
  for (const l of series) {
    if (l.completada === false) continue;
    const fecha = fechaDe.get(l.sesion_id);
    const reps = Number(l.reps) || 0;
    if (!fecha || !reps) continue;
    const peso = Number(l.peso) || 0;
    const unidad = l.unidad === 'lb' ? 'lb' : 'kg';
    const kg = unidad === 'lb' ? peso * ENT_LB_KG : peso;
    const ej = ejs.get(l.ejercicio_id) || l.ejercicios || {};
    const e = porEj.get(l.ejercicio_id) || {
      id: l.ejercicio_id, nombre: entNombres(ej).grande || 'Ejercicio', patron: ej.patron || null,
      grupo: PF_PATRON[ej.patron] || null, dias: new Map(),
    };
    // La mejor serie del día: con peso, la de mayor 1RM estimado; sin peso,
    // la de más reps.
    const valor = kg > 0 ? entE1rm(kg, reps) : reps;
    const prev = e.dias.get(fecha);
    if (!prev || (kg > 0 && !prev.kg) || valor > prev.valor) e.dias.set(fecha, { fecha, peso, unidad, kg, reps, valor, conPeso: kg > 0 });
    porEj.set(l.ejercicio_id, e);
  }
  const ejercicios = [...porEj.values()].map(e => {
    const puntos = [...e.dias.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
    // Si alguna vez lo hizo con peso, se comparan solo esas (no se mezcla
    // con peso corporal).
    const conPeso = puntos.some(p => p.conPeso);
    const pts = conPeso ? puntos.filter(p => p.conPeso) : puntos;
    const a = pts[0], z = pts[pts.length - 1];
    return {
      id: e.id, nombre: e.nombre, patron: e.patron, grupo: e.grupo, conPeso, puntos: pts,
      cambio: a && z && a.valor ? Math.round((z.valor / a.valor - 1) * 100) : 0,
      dPeso: conPeso && a && z ? z.kg - a.kg : 0, dReps: a && z ? z.reps - a.reps : 0,
    };
  }).filter(e => e.puntos.length).sort((a, b) => b.puntos.length - a.puntos.length || a.nombre.localeCompare(b.nombre));

  // Por patrón: semana a semana, el % frente a la primera vez de cada
  // ejercicio (su mejor marca de esa semana), promediado entre los ejercicios
  // del patrón que hizo esa semana.
  const patrones = PF_GRUPOS.map(g => {
    const delGrupo = ejercicios.filter(e => e.grupo === g.id && e.puntos.length >= 2);
    const semanas = new Map();
    for (const e of delGrupo) {
      const base = e.puntos[0].valor;
      const porSem = new Map();
      for (const p of e.puntos) {
        const s = pfLunes(p.fecha);
        porSem.set(s, Math.max(porSem.get(s) || 0, p.valor));
      }
      for (const [s, v] of porSem) {
        const x = semanas.get(s) || [];
        x.push((v / base - 1) * 100);
        semanas.set(s, x);
      }
    }
    const serie = [...semanas.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([semana, v]) => ({ semana, pct: v.reduce((s, x) => s + x, 0) / v.length, n: v.length }));
    const ultimo = serie.length ? serie[serie.length - 1].pct : null;
    return { ...g, ejercicios: delGrupo, serie, ultimo };
  });
  return { ejercicios, patrones, sesiones: sesiones.length };
}

// ── Las gráficas (SVG, sin librerías) ───────────────────────────────────
// Por ejercicio: línea del peso (o de las reps si es de peso corporal) y
// barras de las reps de la mejor serie de cada sesión.
function pfGraficaEjercicio(e, color) {
  const pts = e.puntos.slice(-16);
  const W = 640, H = 230, izq = 38, der = 12, arr = 26, abj = 34;
  const ancho = W - izq - der, alto = H - arr - abj;
  const paso = pts.length > 1 ? ancho / (pts.length - 1) : 0;
  const x = (i) => izq + (pts.length > 1 ? i * paso : ancho / 2);
  const ys = pts.map(p => (e.conPeso ? p.peso : p.reps));
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi === lo) { lo = Math.max(0, lo - 5); hi = hi + 5; }
  const marg = (hi - lo) * 0.18; lo = Math.max(0, lo - marg); hi += marg;
  const y = (v) => arr + alto - ((v - lo) / (hi - lo)) * alto;
  const maxReps = Math.max(...pts.map(p => p.reps), 1);
  const anchoBarra = Math.max(8, Math.min(26, (pts.length > 1 ? paso : ancho) * 0.42));
  const barras = e.conPeso ? pts.map((p, i) => {
    const h = Math.max(4, (p.reps / maxReps) * alto * 0.42);
    return `<rect x="${x(i) - anchoBarra / 2}" y="${arr + alto - h}" width="${anchoBarra}" height="${h}" rx="5" fill="${color}" opacity=".16"/>
      <text x="${x(i)}" y="${arr + alto - 5}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${color}">${p.reps}</text>`;
  }).join('') : '';
  const linea = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(ys[i]).toFixed(1)}`).join(' ');
  const area = `${linea} L${x(pts.length - 1).toFixed(1)} ${arr + alto} L${x(0).toFixed(1)} ${arr + alto} Z`;
  const guias = [0, 0.5, 1].map(f => { const v = lo + (hi - lo) * f; return `<line x1="${izq}" x2="${W - der}" y1="${y(v)}" y2="${y(v)}" stroke="#EEF0F3"/><text x="${izq - 6}" y="${y(v) + 3.5}" text-anchor="end" font-size="10" fill="#9AA0A8">${pfNum(v)}</text>`; }).join('');
  const puntos = pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(ys[i])}" r="4.5" fill="#fff" stroke="${color}" stroke-width="2.5"/>
    <text x="${x(i)}" y="${y(ys[i]) - 10}" text-anchor="middle" font-size="11" font-weight="800" fill="#1F1F1F">${e.conPeso ? pfNum(p.peso) : p.reps}</text>`).join('');
  const cada = Math.ceil(pts.length / 8);
  const fechas = pts.map((p, i) => (i % cada === 0 || i === pts.length - 1) ? `<text x="${x(i)}" y="${H - 12}" text-anchor="middle" font-size="10" fill="#8E8E93">${pfFecha(p.fecha)}</text>` : '').join('');
  const id = 'pfg' + String(e.id).replace(/[^a-z0-9]/gi, '').slice(0, 10);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Progreso de ${escapeHtml(e.nombre)}" data-pf-grafica-ejercicio style="display:block;max-width:820px">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".20"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    ${guias}${barras}<path d="${area}" fill="url(#${id})"/><path d="${linea}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${puntos}${fechas}
  </svg>`;
}

// Por patrón: el % de cambio semana a semana, con la raya del 0 (su inicio).
function pfGraficaPatron(g) {
  const s = g.serie.slice(-12);
  const W = 300, H = 120, izq = 6, der = 6, arr = 14, abj = 18;
  if (s.length < 2) return `<div class="text-xs text-slate-400 py-6 text-center">Aún pocas semanas para ver la curva.</div>`;
  const ancho = W - izq - der, alto = H - arr - abj;
  let lo = Math.min(0, ...s.map(p => p.pct)), hi = Math.max(0, ...s.map(p => p.pct));
  if (hi - lo < 4) { hi += 2; lo -= 2; }
  const x = (i) => izq + i * (ancho / (s.length - 1));
  const y = (v) => arr + alto - ((v - lo) / (hi - lo)) * alto;
  const linea = s.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.pct).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" data-pf-grafica-patron="${g.id}" style="display:block;max-width:460px">
    <line x1="${izq}" x2="${W - der}" y1="${y(0)}" y2="${y(0)}" stroke="#D9DCE1" stroke-dasharray="3 4"/>
    <path d="${linea} L${x(s.length - 1)} ${y(lo)} L${x(0)} ${y(lo)} Z" fill="${g.tinta}"/>
    <path d="${linea}" fill="none" stroke="${g.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    ${s.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.pct)}" r="${i === s.length - 1 ? 4.5 : 2.6}" fill="${i === s.length - 1 ? '#fff' : g.color}" stroke="${g.color}" stroke-width="2"/>`).join('')}
    <text x="${izq}" y="${H - 4}" font-size="9.5" fill="#9AA0A8">${pfFecha(s[0].semana)}</text>
    <text x="${W - der}" y="${H - 4}" text-anchor="end" font-size="9.5" fill="#9AA0A8">${pfFecha(s[s.length - 1].semana)}</text>
  </svg>`;
}

// ── El panel ────────────────────────────────────────────────────────────
function pfSigno(n, suf = '') { return `${n > 0 ? '+' : n < 0 ? '−' : ''}${pfNum(Math.abs(n))}${suf}`; }
function pfColor(grupo) { return (PF_GRUPOS.find(g => g.id === grupo) || { color: '#1F1F1F' }).color; }

function pfHTML(d, clave) {
  const chip = (on, txt, fn, extra = '') => `<button type="button" class="pf-chip${on ? ' is-on' : ''}" onclick="${fn}" ${extra}>${txt}</button>`;
  const cab = `<div class="pf-tabs" role="tablist">
      ${chip(_pf.vista === 'ejercicio', 'Por ejercicio', `pfVista('${clave}','ejercicio')`, 'data-pf-tab="ejercicio"')}
      ${chip(_pf.vista === 'patron', 'Por patrón', `pfVista('${clave}','patron')`, 'data-pf-tab="patron"')}
    </div>`;
  if (!d.ejercicios.length) return cab + `<div class="text-sm text-slate-500 py-6 text-center">Todavía no hay series marcadas con reps. Cuando entrene con la app, esto se llena solo.</div>`;

  if (_pf.vista === 'patron') {
    return cab + `<div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3" data-pf-patrones>
      ${d.patrones.map(g => `
        <div class="pf-patron" data-pf-patron="${g.id}">
          <div class="flex items-baseline justify-between gap-2">
            <div class="text-sm font-bold" style="color:${g.color}">${g.nombre}</div>
            <div class="text-xs text-slate-400">${g.ejercicios.length} ejercicio${g.ejercicios.length === 1 ? '' : 's'}</div>
          </div>
          <div class="pf-grande" style="color:${g.ultimo == null ? '#9AA0A8' : g.ultimo >= 0 ? '#1F1F1F' : '#C75A4A'}">${g.ultimo == null ? '—' : pfSigno(Math.round(g.ultimo), ' %')}</div>
          <div class="text-[11px] text-slate-500 -mt-1 mb-1">${g.ultimo == null ? 'Sin ejercicios repetidos todavía' : 'de fuerza frente a su inicio (peso y reps)'}</div>
          ${pfGraficaPatron(g)}
          ${g.ejercicios.length ? `<div class="mt-2 space-y-1">${g.ejercicios.slice().sort((a, b) => b.cambio - a.cambio).slice(0, 5).map(e => `
            <button type="button" class="pf-fila" onclick="pfAbrirEjercicio('${clave}','${e.id}')">
              <span class="truncate">${escapeHtml(e.nombre)}</span>
              <b style="color:${e.cambio >= 0 ? '#2F7D45' : '#C75A4A'}">${pfSigno(e.cambio, ' %')}</b>
            </button>`).join('')}</div>` : ''}
        </div>`).join('')}
      </div>
      <p class="text-[11px] text-slate-400 mt-3">Cada ejercicio se compara con su primera vez: la mejor serie de cada semana, en 1RM estimado (sube con más peso o con más reps). Pierna = dominante de rodilla + de cadera.</p>`;
  }

  const lista = d.ejercicios.filter(e => _pf.patron === 'todos' || (_pf.patron === 'otros' ? !e.grupo : e.grupo === _pf.patron));
  if (!lista.some(e => e.id === _pf.ej)) _pf.ej = (lista.find(e => e.puntos.length >= 2) || lista[0] || {}).id || null;
  const e = lista.find(x => x.id === _pf.ej);
  const color = e ? pfColor(e.grupo) : '#1F1F1F';
  const filtros = [['todos', 'Todos'], ...PF_GRUPOS.map(g => [g.id, g.nombre]), ['otros', 'Otros']]
    .filter(([id]) => id === 'todos' || d.ejercicios.some(x => (id === 'otros' ? !x.grupo : x.grupo === id)));
  const a = e && e.puntos[0], z = e && e.puntos[e.puntos.length - 1];
  const unidad = z ? z.unidad : 'kg';
  return cab + `
    <div class="flex flex-wrap items-center gap-2 mt-3" data-pf-filtros>
      ${filtros.map(([id, t]) => chip(_pf.patron === id, t, `pfPatron('${clave}','${id}')`, `data-pf-filtro="${id}"`)).join('')}
    </div>
    <select class="mt-3 w-full md:w-auto" data-pf-ejercicio onchange="pfAbrirEjercicio('${clave}', this.value)">
      ${lista.map(x => `<option value="${x.id}" ${x.id === _pf.ej ? 'selected' : ''}>${escapeHtml(x.nombre)} · ${x.puntos.length} sesión${x.puntos.length === 1 ? '' : 'es'}</option>`).join('')}
    </select>
    ${e ? `
      <div class="grid grid-cols-3 gap-2 mt-3" data-pf-resumen>
        <div class="pf-dato"><div class="pf-dato-t">Peso (mejor serie)</div><div class="pf-dato-v">${e.conPeso ? `${pfNum(a.peso)} → ${pfNum(z.peso)} <span>${unidad}</span>` : '<span>peso corporal</span>'}</div></div>
        <div class="pf-dato"><div class="pf-dato-t">Reps (mejor serie)</div><div class="pf-dato-v">${a.reps} → ${z.reps} <span>${pfSigno(e.dReps)}</span></div></div>
        <div class="pf-dato"><div class="pf-dato-t">Fuerza estimada</div><div class="pf-dato-v" style="color:${e.cambio >= 0 ? '#2F7D45' : '#C75A4A'}">${pfSigno(e.cambio, ' %')}</div></div>
      </div>
      <div class="mt-3">${e.puntos.length >= 2 ? pfGraficaEjercicio(e, color) : '<div class="text-xs text-slate-400 py-6 text-center">Una sola sesión: con la próxima ya se ve la curva.</div>'}</div>
      <div class="flex items-center gap-4 text-[11px] text-slate-500 mt-1">
        <span><i class="pf-ley" style="background:${color}"></i>${e.conPeso ? `Peso de la mejor serie (${unidad})` : 'Reps de la mejor serie'}</span>
        ${e.conPeso ? `<span><i class="pf-ley" style="background:${color};opacity:.25"></i>Reps de esa serie</span>` : ''}
      </div>` : ''}`;
}

const PF_CSS = `
.pf-tabs{display:inline-flex;gap:2px;padding:3px;border-radius:999px;background:rgba(118,118,128,.12)}
.pf-chip{border:0;border-radius:999px;padding:6px 13px;font:inherit;font-size:13px;font-weight:600;color:#6E6E73;background:transparent;cursor:pointer}
.pf-chip.is-on{background:#fff;color:#1F1F1F;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.08)}
[data-pf-filtros] .pf-chip{background:rgba(118,118,128,.10)}
[data-pf-filtros] .pf-chip.is-on{background:#1F1F1F;color:#fff}
.pf-patron{border-radius:18px;background:#fff;padding:14px;box-shadow:0 1px 2px rgba(20,20,30,.04),0 6px 18px rgba(20,30,60,.07)}
.pf-grande{font-size:30px;font-weight:800;letter-spacing:-.03em;line-height:1.1;margin-top:4px}
.pf-fila{display:flex;justify-content:space-between;gap:8px;width:100%;border:0;background:transparent;font:inherit;font-size:12.5px;color:#3A3A3C;padding:3px 0;cursor:pointer;text-align:left}
.pf-fila:hover{color:#1F1F1F}
.pf-dato{border-radius:14px;background:#F6F7F9;padding:10px 12px}
.pf-dato-t{font-size:11px;color:#8E8E93;font-weight:600}
.pf-dato-v{font-size:17px;font-weight:800;color:#1F1F1F;letter-spacing:-.01em}
.pf-dato-v span{font-size:12px;font-weight:700;color:#8E8E93}
[data-pf-patrones]{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
[data-pf-resumen]{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.pf-ley{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
`;

// Pinta el panel en `selector` para ese cliente.
async function pfPanel(selector, clienteId) {
  const caja = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (!caja) return;
  if (!document.getElementById('pf-css')) { const st = document.createElement('style'); st.id = 'pf-css'; st.textContent = PF_CSS; document.head.appendChild(st); }
  const clave = 'pf' + Math.random().toString(36).slice(2, 8);
  caja.dataset.pfClave = clave;
  caja.dataset.pfCliente = clienteId;
  caja.innerHTML = '<div class="text-sm text-slate-400">Calculando…</div>';
  let d = null;
  try { d = await pfCargar(clienteId); } catch (e) { d = null; }
  if (caja.dataset.pfClave !== clave) return;
  if (!d) { caja.innerHTML = '<div class="text-sm text-slate-500">No pude leer sus entrenos todavía.</div>'; return; }
  _pf.datos.set(clave, d);
  caja.innerHTML = pfHTML(d, clave);
}
function pfRepintar(clave) {
  const caja = document.querySelector(`[data-pf-clave="${clave}"]`);
  const d = _pf.datos.get(clave);
  if (caja && d) caja.innerHTML = pfHTML(d, clave);
}
window.pfVista = (clave, v) => { _pf.vista = v; pfRepintar(clave); };
window.pfPatron = (clave, p) => { _pf.patron = p; _pf.ej = null; pfRepintar(clave); };
window.pfAbrirEjercicio = (clave, id) => {
  const d = _pf.datos.get(clave);
  const e = d && d.ejercicios.find(x => x.id === id);
  _pf.vista = 'ejercicio'; _pf.ej = id;
  if (e && _pf.patron !== 'todos' && (_pf.patron === 'otros' ? e.grupo : e.grupo !== _pf.patron)) _pf.patron = 'todos';
  pfRepintar(clave);
};
window.pfPanel = pfPanel;
