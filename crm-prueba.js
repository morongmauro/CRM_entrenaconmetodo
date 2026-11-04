// =====================================================
// CRM NUEVO · la gestión por excepción (antes «en prueba»)
// =====================================================
// Desde el 4 de noviembre es el CRM de siempre: está prendido para todos, sin
// botón para volver al anterior, y el CRM abre en «Hoy». Lo que trae:
//   · «Hoy»: una sola cola. Arriba quién hay que INTERVENIR, con el motivo en
//     una línea y la acción a un toque; plegado, a quién OBSERVAR; y cuántos
//     van NORMAL (no hace falta nada hoy). Aparte, lo que vale la pena
//     reconocer (récords, semana cumplida). Junta lo de la Bandeja por
//     cliente: «Atendido» marca de una vez todo lo suyo.
//   · «Cartera»: una fila por cliente con su estado y motivo, el entreno de
//     las últimas 6 semanas, la comida, los días sin actividad, el último
//     contacto, la próxima acción, el ciclo y el pago.
//   · Seguimiento sin el modo Diálogo, sin «Revisado x de 6» y con 3 mensajes
//     sugeridos; arriba, por qué ese cliente está en la cola.
//   · Las notas al terminar una rutina se responden: a su app (le sale como
//     mensaje de su coach) o por WhatsApp; queda en su historial.
//
// Los estados se miden contra la propia línea de cada cliente (su promedio
// de semanas anteriores), no contra un número fijo igual para todos. Solo lee
// y, cuando tocas una acción, hace lo mismo que harías a mano (recordatorio
// en su app, nota leída, mensaje guardado).
//
// Carga DESPUÉS de bandeja.js, enganche.js, composicion.js, seguimiento-semana.js
// y seguimiento-areas.js.
// =====================================================

const CP_CLAVE = 'crm:prueba';
const _cpr = { datos: null, leido: 0, filtro: 'todos', cargando: null, porId: {} };
// Siempre prendido (el coach lo eligió como su CRM).
const cpActivo = () => true;
const cpNorm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const CP_DOLOR = /(dol|duele|molest|lesi|pincha|tiron|tirón|hinch|me lastim|esguin|contractur)/i;
const CP_TONO = { intervenir: ['#FBE3DE', '#B2402B', 'Intervenir'], observar: ['#FDEFD9', '#9A5B12', 'Observar'], pausa: ['#E3EDFA', '#2F6CC4', 'En pausa'], normal: ['#E4F1E7', '#2F7F45', 'Normal'] };

// ── Encender / apagar ────────────────────────────────────────────────────
function cpAplicar() {
  const on = cpActivo();
  document.body.classList.toggle('crm-prueba', on);
  const nav = document.getElementById('main-nav');
  if (nav) {
    [['toques', 'Toques'], ['hoy', 'Hoy'], ['cartera', 'Cartera']].forEach(([v, t]) => {
      let b = nav.querySelector(`.nav-item[data-view="${v}"]`);
      if (on && !b) {
        b = document.createElement('button');
        b.className = 'nav-item'; b.dataset.view = v; b.textContent = t;
        b.addEventListener('click', () => navigate(v));
        nav.insertBefore(b, nav.firstChild);
      } else if (!on && b) b.remove();
    });
  }
  // (Ya no hay botón para volver al CRM anterior.)
  const btn = document.getElementById('cp-boton'); if (btn) btn.remove();
}
window.cpCambiar = (on) => {
  try { localStorage.setItem(CP_CLAVE, on ? '1' : '0'); } catch (e) { /* sin almacenamiento */ }
  cpAplicar();
  navigate(on ? 'hoy' : 'dashboard');
};

(function () {
  const s = document.createElement('style');
  s.textContent = `
  .cp-boton{margin-left:auto;margin-right:10px;border:0;border-radius:999px;padding:8px 14px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;background:#1F1F1F;color:#fff}
  .cp-boton[data-on="1"]{background:#F1EEE8;color:#1F1F1F}
  body.crm-prueba [data-seg-modo], body.crm-prueba [data-sa-revisado] { display:none !important; }
  body.crm-prueba [data-es-mensajes] .es-msg:nth-child(n+4) { display:none; }
  .cp-banda{background:#1F1F1F;color:#fff;border-radius:16px;padding:10px 14px;font-size:13.5px;margin-bottom:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .cp-banda button{margin-left:auto;border:0;border-radius:999px;padding:6px 12px;background:#fff;color:#1F1F1F;font:inherit;font-weight:700;font-size:12.5px;cursor:pointer}
  .cp-card{background:#fff;border-radius:20px;padding:14px 16px;box-shadow:0 1px 2px rgba(40,40,30,.04),0 8px 22px rgba(60,60,40,.06);margin-bottom:10px}
  .cp-fila{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap}
  .cp-mot{font-size:14px;color:#3A3A3C;line-height:1.4;margin-top:3px}
  .cp-mot b{color:#1F1F1F}
  .cp-acc{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}
  .cp-btn{border:0;border-radius:999px;padding:7px 13px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;background:#1F1F1F;color:#fff;white-space:nowrap}
  .cp-btn.s{background:#F1EEE8;color:#1F1F1F}
  .cp-pill{border-radius:999px;padding:3px 9px;font-size:12px;font-weight:700;white-space:nowrap}
  .cp-h{font-size:12.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#6B6B6B;margin:18px 2px 8px}
  .cp-normal{display:flex;flex-wrap:wrap;gap:6px}
  .cp-normal span{background:#F1EEE8;border-radius:999px;padding:5px 11px;font-size:13px;font-weight:600;cursor:pointer}
  .cp-sem{display:flex;gap:2px;align-items:flex-end;height:26px}
  .cp-sem span{width:9px;border-radius:2px}
  .cp-senal{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-top:8px}
  .cp-senal .cp-mot{flex:1 1 260px;margin-top:0}
  .cp-senal .cp-acc{flex-wrap:nowrap}
  .cp-rec{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px}
  .cp-rec .cp-mot{flex:1 1 220px;margin-top:0}
  /* ── Look nuevo (solo en prueba): fondo blanco con degradados de marca, menú en contraste ── */
  html:has(body.crm-prueba), body.crm-prueba {
    background:
      radial-gradient(55% 520px at 0% 0%, rgba(60,123,214,.26), rgba(60,123,214,0) 100%),
      radial-gradient(45% 460px at 100% 0%, rgba(70,150,90,.20), rgba(70,150,90,0) 100%),
      radial-gradient(45% 520px at 100% 85%, rgba(238,132,52,.17), rgba(238,132,52,0) 100%),
      radial-gradient(45% 480px at 0% 75%, rgba(242,201,76,.22), rgba(242,201,76,0) 100%),
      #FCFCFD !important;
    background-attachment: fixed !important;
  }
  body.crm-prueba #app-screen > header, body.crm-prueba header.glass { background: rgba(252,252,253,.6) !important; -webkit-backdrop-filter: blur(18px) saturate(1.4); backdrop-filter: blur(18px) saturate(1.4); border-bottom: 1px solid rgba(255,255,255,.7) !important; }
  body.crm-prueba .card, body.crm-prueba .cp-card, body.crm-prueba .es-card, body.crm-prueba #view .bg-white.rounded-2xl, body.crm-prueba #view .bg-white.rounded-xl {
    background: #FFFFFF !important;
    box-shadow: 0 1px 2px rgba(30,40,60,.05), 0 10px 28px rgba(30,40,60,.08) !important;
  }
  @media (min-width:1024px) {
    body.crm-prueba .em-side { background: #1F2328 !important; border-radius: 22px !important; box-shadow: 0 14px 34px rgba(20,25,35,.22) !important; padding: 10px 8px !important; max-height: calc(100vh - 6.2rem); overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.2) transparent; }
    body.crm-prueba .em-nav .nav-item { color: rgba(255,255,255,.78) !important; }
    body.crm-prueba .em-nav .nav-item .em-ico { opacity: .85; }
    body.crm-prueba .em-nav .nav-item:hover { background: rgba(255,255,255,.08) !important; color: #fff !important; }
    body.crm-prueba .em-nav .nav-item.active { background: #fff !important; color: #1F2328 !important; box-shadow: none !important; }
    body.crm-prueba .em-nav .em-nav-grupo { color: rgba(255,255,255,.45) !important; }
    body.crm-prueba .em-nav .em-nav-fin { border-color: rgba(255,255,255,.12) !important; }
    /* La lista de clientes de Seguimiento, dentro del menú oscuro */
    body.crm-prueba .em-side [data-nav-sub] { color: rgba(255,255,255,.85); }
    body.crm-prueba .em-side [data-nav-sub] input { background: rgba(255,255,255,.08) !important; color: #fff !important; border-color: transparent !important; }
    body.crm-prueba .em-side [data-nav-sub] input::placeholder { color: rgba(255,255,255,.45) !important; }
    body.crm-prueba .em-side [data-nav-sub] .text-slate-900, body.crm-prueba .em-side [data-nav-sub] .text-slate-800, body.crm-prueba .em-side [data-nav-sub] b, body.crm-prueba .em-side [data-nav-sub] strong { color: #fff !important; }
    body.crm-prueba .em-side [data-nav-sub] .text-slate-500, body.crm-prueba .em-side [data-nav-sub] .text-slate-400, body.crm-prueba .em-side [data-nav-sub] .text-slate-600 { color: rgba(255,255,255,.55) !important; }
    body.crm-prueba .em-side .seg-li { background: transparent !important; box-shadow: none !important; }
    body.crm-prueba .em-side .seg-li:hover { background: rgba(255,255,255,.07) !important; }
    body.crm-prueba .em-side .seg-li.activo { background: rgba(255,255,255,.14) !important; }
    body.crm-prueba .em-side .seg-li-txt b { color: #fff !important; }
    body.crm-prueba .em-side .seg-li-txt span { color: rgba(255,255,255,.6) !important; }
    body.crm-prueba .em-side .seg-li-txt .seg-li-tarde { color: #F5A66B !important; }
    body.crm-prueba .em-side .seg-li-grp { color: rgba(255,255,255,.45) !important; }
    body.crm-prueba .em-side .seg-li-ck { background: rgba(255,255,255,.1) !important; color: rgba(255,255,255,.8) !important; border-color: transparent !important; }
    body.crm-prueba #menu-toggle, body.crm-prueba .em-menu-toggle { background: #1F2328 !important; color: #fff !important; border-radius: 12px !important; }
  }
  @media (max-width:700px){
    body.crm-prueba .cp-boton{display:none}
    .cp-boton{font-size:12px;padding:6px 10px;margin-right:6px}
    .cp-btn{padding:7px 11px;font-size:12.5px}
  }
  `;
  document.head.appendChild(s);
})();

// ── Los datos de todos, en una pasada ─────────────────────────────────────
async function cpDatos(forzar = false) {
  if (!forzar && _cpr.datos && Date.now() - _cpr.leido < 60000) return _cpr.datos;
  if (_cpr.cargando) return _cpr.cargando;
  _cpr.cargando = (async () => {
    const hoy = fmt.hoy();
    const leer = async (q) => { try { const { data, error } = await q; return error ? [] : (data || []); } catch (e) { return []; } };
    const [bdj, eng, metas, pedidos, mensajes, todasFases] = await Promise.all([
      typeof bdjCargar === 'function' ? bdjCargar(forzar).catch(() => null) : null,
      typeof engDatos === 'function' ? engDatos().catch(() => null) : null,
      leer(sb.from('metas_historial').select('*').order('fecha', { ascending: false })),
      leer(sb.from('seguimiento_pedidos').select('*').gte('fecha', evtSumarDias(hoy, -90))),
      leer(sb.from('seguimiento_mensajes').select('cliente_id, fecha, origen').gte('fecha', evtSumarDias(hoy, -120))),
      leer(sb.from('fases').select('id, cliente_id, nombre, fecha_inicio, semanas, dias_semana, estado, visible_cliente')),
    ]);
    const clientes = (await db.clientes.list()).filter(c => String(c.estado || 'activo').toLowerCase() === 'activo');
    // Ausencias y bienestar (ausencias-crm.js).
    try { if (typeof ausCargar === 'function') await ausCargar(forzar); } catch (e) { /* sin tabla */ }
    let meds = [];
    try { meds = (await sb.from('mediciones_corporales').select('*').order('fecha', { ascending: true })).data || []; } catch (e) { meds = []; }
    let pagos = null;
    try { if (typeof cargarAvisosApp === 'function') { if (_avisosApp === null && !_avisosAppError) await cargarAvisosApp(clientes); pagos = _avisosApp; } } catch (e) { pagos = null; }
    // Las sesiones de 7 semanas (para medir cada semana contra las suyas).
    const sesiones = [];
    for (let i = 0; ; i += 1000) {
      const r = await leer(sb.from('sesiones').select('id, cliente_id, fecha, estado').gte('fecha', evtSumarDias(hoy, -50)).order('fecha').order('id').range(i, i + 999));
      sesiones.push(...r);
      if (r.length < 1000) break;
    }
    clientes.forEach(c => { _cpr.porId[c.id] = c; });
    const vistos = typeof bdjVistos === 'function' ? bdjVistos() : new Set();
    const descartes = cpDescartes();
    const filas = clientes.map(c => cpEstado({
      c, hoy, vistos, descartes,
      bdj: bdj ? [...bdj.atencion, ...bdj.felicitar].filter(a => a.cliente_id === c.id) : [],
      eng: eng ? eng.filas.find(f => f.c.id === c.id) || null : null,
      fases: todasFases.filter(f => f.cliente_id === c.id && f.estado !== 'archivada' && f.visible_cliente !== false),
      sesiones: sesiones.filter(s => s.cliente_id === c.id),
      metas: metas.filter(m => m.cliente_id === c.id),
      meds: meds.filter(m => m.cliente_id === c.id),
      pedidos: pedidos.filter(p => p.cliente_id === c.id),
      ultimoMsj: mensajes.filter(m => m.cliente_id === c.id).map(m => m.fecha).sort().pop() || null,
      pago: pagos ? pagos[c.nombre] : undefined,
      pausa: typeof ausHoy === 'function' ? ausHoy(c.id, hoy) : null,
      fuera: typeof ausFueraDe === 'function' ? ausFueraDe(c.id) : new Set(),
    }));
    const orden = { intervenir: 0, observar: 1, pausa: 2, normal: 3 };
    filas.sort((a, b) => orden[a.estado] - orden[b.estado] || b.senales.length - a.senales.length || String(a.c.nombre).localeCompare(String(b.c.nombre)));
    _cpr.datos = { hoy, filas, conApp: !!(eng && eng.conApp) };
    _cpr.leido = Date.now();
    return _cpr.datos;
  })();
  try { return await _cpr.cargando; } finally { _cpr.cargando = null; }
}

// Lo que marcaste «No hace falta» (una señal, por 7 días).
function cpDescartes() { try { return JSON.parse(localStorage.getItem('crm:cpDescartes') || '{}'); } catch (e) { return {}; } }
function cpGuardarDescarte(clave) {
  const d = cpDescartes(); d[clave] = evtSumarDias(fmt.hoy(), 7);
  try { localStorage.setItem('crm:cpDescartes', JSON.stringify(d)); } catch (e) { /* sin almacenamiento */ }
}
window.cpDescartar = (clave) => { cpGuardarDescarte(clave); _cpr.datos = null; rerenderView(); };

// El entreno semana a semana: hechos contra lo de su ciclo.
// Los días que estuvo fuera (viaje, enfermedad…) no se planean.
function cpSemanas(fases, sesiones, hoy, n = 6, fuera = new Set()) {
  const lunes = evtSumarDias(hoy, -((new Date(hoy + 'T12:00:00').getDay() + 6) % 7));
  const out = [];
  for (let k = n; k >= 1; k--) {
    const a = evtSumarDias(lunes, -7 * k), b = evtSumarDias(a, 6);
    const plan = typeof engPlaneados === 'function' ? engPlaneados(fases, a, b, fuera) : 0;
    const hechos = sesiones.filter(s => s.estado === 'completada' && s.fecha >= a && s.fecha <= b).length;
    out.push({ desde: a, plan, hechos, pct: plan ? Math.min(100, Math.round((hechos / plan) * 100)) : null });
  }
  return out;
}

// ── El estado de un cliente: señal → interpretación → acción ─────────────
function cpEstado({ c, hoy, vistos, descartes, bdj, eng, fases, sesiones, metas, meds, pedidos, ultimoMsj, pago, pausa = null, fuera = new Set() }) {
  const S = [];   // { nivel, clave, texto, accion: { t, fn } }
  const add = (nivel, clave, texto, accion = null) => { clave = String(clave).replace(/[^\w:.-]/g, '_').slice(0, 80); if (descartes[`${c.id}:${clave}`] && descartes[`${c.id}:${clave}`] >= hoy) return; S.push({ nivel, clave, texto, accion }); };
  const id = c.id;
  // 0. Te avisó que va a estar fuera (desde su app): va aparte, en «Te avisaron».
  const avisos = bdj.filter(a => /^aus:/.test(a.id) && !vistos.has(a.id));
  // 1. Notas sin responder (una molestia es lo primero).
  bdj.filter(a => a.tipo === 'nota' && !/^aus:/.test(a.id) && !vistos.has(a.id)).forEach(a => {
    const dolor = CP_DOLOR.test(a.detalle || '');
    add(dolor ? 'intervenir' : 'observar', a.id, `${dolor ? '<b>Reportó una molestia</b>' : '<b>Te dejó una nota</b>'}: «${escapeHtml(String(a.detalle || '').slice(0, 120))}»`,
      { t: 'Responder', fn: `cpResponder('${id}','${a.id}')` });
  });
  // 2. Adherencia contra su propia línea: las 2 últimas semanas contra las 4 anteriores.
  const sem = cpSemanas(fases, sesiones, hoy, 6, fuera).filter(w => w.plan > 0);
  if (sem.length >= 3) {
    const ult = sem.slice(-2), base = sem.slice(0, -2);
    const prom = Math.round(base.reduce((s, w) => s + w.pct, 0) / base.length);
    const baja = (w) => w.pct < Math.min(75, prom - 25);
    if (ult.length === 2 && ult.every(baja)) add('intervenir', 'adh2', `<b>2 semanas bajando</b>: ${ult.map(w => `${w.hechos} de ${w.plan}`).join(' y ')} (antes ${prom} %)`, { t: 'Escribirle', fn: `cpSeguimiento('${id}')` });
    else if (baja(ult[ult.length - 1])) add('observar', 'adh1', `<b>Semana floja</b>: ${ult[ult.length - 1].hechos} de ${ult[ult.length - 1].plan} (su promedio ${prom} %). Si es la primera, no hace falta nada.`);
  }
  // 3. Desconexión: días sin ninguna actividad en la app.
  const sin = eng ? eng.sinActividad : null;
  if (eng && (sin == null || sin >= 5)) add('intervenir', 'frio', sin == null ? '<b>No usa la app</b> todavía' : `<b>${sin} días sin actividad</b> en la app`, { t: 'Escribirle', fn: `cpSeguimiento('${id}')` });
  else if (sin != null && sin >= 3) add('observar', 'frio3', `${sin} días sin actividad en la app`);
  // 4. Lo que ya detecta la Bandeja: fatiga, sin comida, proteína, estancados, entreno saltado.
  const noVisto = (a) => !vistos.has(a.id);
  bdj.filter(a => /^rpe:/.test(a.id) && noVisto(a)).forEach(a => add('intervenir', a.id, `<b>${escapeHtml(a.titulo)}</b>: posible fatiga, valora una descarga`, { t: 'Ver entreno', fn: `cpSeguimiento('${id}')` }));
  bdj.filter(a => /^sincomida:/.test(a.id) && noVisto(a)).forEach(a => add('observar', a.id, escapeHtml(a.titulo)));
  bdj.filter(a => /^prot:/.test(a.id) && noVisto(a)).forEach(a => add('observar', a.id, escapeHtml(a.titulo)));
  const estanc = bdj.filter(a => /^estanc:/.test(a.id) && noVisto(a));
  if (estanc.length >= 2) add('observar', 'estanc', `<b>${estanc.length} ejercicios sin superar su marca</b> (${estanc.slice(0, 2).map(a => escapeHtml(a.titulo.split(':')[0])).join(', ')})`, { t: 'Ver fuerza', fn: `cpSeguimiento('${id}','fuerza')` });
  bdj.filter(a => /^salto:/.test(a.id) && noVisto(a)).forEach(a => add('observar', a.id, `${escapeHtml(a.titulo)}${a.detalle ? `: «${escapeHtml(String(a.detalle).slice(0, 80))}»` : ''}`));
  // 5. Pedidos que no cumple: el mismo, 2 veces.
  const porTexto = {};
  pedidos.filter(p => p.estado !== 'cumplio').forEach(p => { const k = cpNorm(p.texto); (porTexto[k] ||= []).push(p); });
  Object.values(porTexto).filter(l => new Set(l.map(p => p.fecha)).size >= 2).forEach(l => add('intervenir', `ped:${cpNorm(l[0].texto)}`, `<b>Le pediste «${escapeHtml(l[0].texto)}» ${l.length} veces</b>: cambia la estrategia, no repitas el pedido`, { t: 'Ver lo que le pedí', fn: `cpSeguimiento('${id}','pedi')` }));
  // 6. Su ciclo termina: hay que armar el siguiente.
  const fin = (f) => evtSumarDias(f.fecha_inicio, (Number(f.semanas) || 0) * 7 - 1);
  const vig = fases.filter(f => f.fecha_inicio && f.semanas && f.fecha_inicio <= hoy && fin(f) >= hoy).sort((a, b) => fin(b).localeCompare(fin(a)))[0];
  const siguiente = vig && fases.some(f => f.fecha_inicio > hoy);
  const queda = vig ? Math.round((new Date(fin(vig) + 'T12:00:00') - new Date(hoy + 'T12:00:00')) / 86400000) : null;
  if (vig && queda <= 7 && !siguiente) add('intervenir', `ciclo:${vig.id}`, `<b>Su ciclo termina ${queda <= 0 ? 'hoy' : `en ${queda} día${queda === 1 ? '' : 's'}`}</b> y no tiene el siguiente`, { t: 'Armar ciclo', fn: `cpCiclo('${id}')` });
  // 7. Medición mensual y meta.
  const conPeso = meds.filter(m => m.peso != null);
  const ultMed = conPeso[conPeso.length - 1] || null;
  const diasMed = ultMed ? Math.round((new Date(hoy + 'T12:00:00') - new Date(String(ultMed.fecha).slice(0, 10) + 'T12:00:00')) / 86400000) : null;
  if (diasMed == null || diasMed > 30) add('observar', 'medicion', diasMed == null ? 'Nunca se ha medido' : `Toca medición (la última hace ${diasMed} días)`, { t: 'Pedir medición', fn: `cpPedirMedicion('${id}')` });
  const av = typeof compEvaluarMeta === 'function' ? compEvaluarMeta(c, meds, metas) : null;
  if (av && (av.nivel === 'revisar' || av.nivel === 'sin_meta')) add('observar', 'meta', av.nivel === 'sin_meta' ? 'No tiene meta nutricional' : '<b>Meta desactualizada</b> con su última medición', { t: 'Recalcular', fn: `cpSeguimiento('${id}','meta')` });
  // 8. Las primeras 2 semanas son las que más pesan.
  if (c.fecha_inicio) { const d = Math.round((new Date(hoy + 'T12:00:00') - new Date(c.fecha_inicio + 'T12:00:00')) / 86400000); if (d >= 0 && d < 14) add('observar', 'inicio', `Semana ${Math.floor(d / 7) + 1} en el programa: un check-in corto ahora vale más que después`, { t: 'Escribirle', fn: `cpSeguimiento('${id}')` }); }
  // 9. Pago vencido.
  if (pago && pago.due) add('observar', 'pago', `Pago vencido${pago.meses_deuda > 1 ? ` (${pago.meses_deuda} meses)` : ''}`, { t: 'Ir a Pagos', fn: `navigate('pagos')` });
  // 10. Bienestar: una de las tres bajó dos veces seguidas.
  bdj.filter(a => a.tipo === 'bienestar' && !vistos.has(a.id)).forEach(a => add('observar', a.id, `<b>${escapeHtml(a.titulo.split(':')[0])}</b>:${escapeHtml(a.titulo.split(':').slice(1).join(':'))} en sus últimos check-ins de bienestar`, { t: 'Ver bienestar', fn: `cpSeguimiento('${id}','bienestar')` }));
  // En pausa (está fuera hoy): solo cuenta lo que te escribió (una molestia sigue siendo urgente).
  if (pausa) for (let i = S.length - 1; i >= 0; i--) if (!/^(nota|cierre):/.test(S[i].clave)) S.splice(i, 1);
  // Para reconocer (no es alerta): récords y semana cumplida.
  const reconocer = bdj.filter(a => (a.tipo === 'record' || /^semana:/.test(a.id)) && noVisto(a)).map(a => ({ id: a.id, texto: `${escapeHtml(a.titulo)}${a.detalle ? ` · ${escapeHtml(a.detalle)}` : ''}` }));
  const estado = S.some(s => s.nivel === 'intervenir') ? 'intervenir' : pausa ? 'pausa' : S.some(s => s.nivel === 'observar') ? 'observar' : 'normal';
  S.sort((a, b) => (a.nivel === 'intervenir' ? 0 : 1) - (b.nivel === 'intervenir' ? 0 : 1));
  const pend = pedidos.filter(p => p.estado === 'pendiente').sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  const proxima = S.find(s => s.accion) ? `${S.find(s => s.accion).accion.t}` : pend ? `Revisar: ${pend.texto}` : 'Nada hoy';
  return {
    c, estado, senales: S, reconocer, proxima: pausa && !S.length ? `En pausa hasta el ${typeof ausCorta === 'function' ? ausCorta(pausa.hasta) : pausa.hasta}` : proxima, semanas: cpSemanas(fases, sesiones, hoy, 6, fuera),
    pausa, avisos,
    eng, ultimoMsj, diasMed, ciclo: vig ? { nombre: vig.nombre || 'Ciclo', queda } : null, pago,
    bdjIds: bdj.filter(noVisto).map(a => a.id),
  };
}

// ── Acciones ─────────────────────────────────────────────────────────────
window.cpSeguimiento = (id, area = null) => {
  segIr(id);
  if (area) { let n = 0; const t = setInterval(() => { const el = document.getElementById(`sa-${area}`); if (el || ++n > 40) { clearInterval(t); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, 250); }
};
window.cpCiclo = (id) => { if (typeof verEntrenamientoCliente === 'function') verEntrenamientoCliente(id); else { navigate('entrenamiento'); } };
window.cpAtendido = (id) => {
  const f = (_cpr.datos && _cpr.datos.filas.find(x => x.c.id === id)) || null;
  if (!f) return;
  f.bdjIds.forEach(x => bdjMarcarVisto(x));
  if (typeof bdjPintarContador === 'function') bdjPintarContador();
  _cpr.datos = null; rerenderView();
};
window.cpPedirMedicion = async (id, enLote = false) => {
  const c = _cpr.porId[id];
  if (!c) return false;
  const mtId = typeof resolverMealtrackerId === 'function' ? await resolverMealtrackerId(c) : null;
  if (!mtId) { if (!enLote) toast(`${c.nombre} no está vinculado con su app`); return false; }
  const r = await fetchRemindersMT(mtId);
  const lista = Array.isArray(r.list) ? r.list.slice() : [];
  const text = 'Toca tu medición del mes: peso, % de grasa y fotos. Cuando la tengas, regístrala en tu app.';
  if (lista.some(x => !x.done_at && x.text === text)) { if (!enLote) toast('Ya la tiene pedida en su app'); return true; }
  lista.push({ id: `med-${Date.now()}`, text, created_at: new Date().toISOString(), done_at: null, done_by: null });
  if (!(await saveRemindersMT(mtId, lista))) { if (!enLote) toast('No pude guardarlo en su app'); return false; }
  cpGuardarDescarte(`${id}:medicion`);
  if (!enLote) { toast(`A ${c.nombre.split(' ')[0]} le salió en su app: «Toca tu medición del mes»`); _cpr.datos = null; rerenderView(); }
  return true;
};
window.cpPedirMedicionTodos = async () => {
  const ids = (_cpr.datos ? _cpr.datos.filas : []).filter(f => f.senales.some(s => s.clave === 'medicion')).map(f => f.c.id);
  if (!ids.length || !confirm(`Pedir la medición del mes en su app a ${ids.length} cliente${ids.length === 1 ? '' : 's'}?`)) return;
  let ok = 0;
  for (const id of ids) if (await cpPedirMedicion(id, true)) ok++;
  toast(`Pedida en su app a ${ok} de ${ids.length}`);
  _cpr.datos = null; rerenderView();
};

// Responder una nota: en su app (mensaje de su coach) o por WhatsApp.
window.cpResponder = (id, notaClave) => {
  const f = _cpr.datos && _cpr.datos.filas.find(x => x.c.id === id);
  const bd = typeof _bdj !== 'undefined' && _bdj.datos ? [..._bdj.datos.atencion] : [];
  const a = bd.find(x => x.id === notaClave);
  if (!f || !a) return;
  if (a.responder && typeof ccAbrirDesdeNota === 'function') return ccAbrirDesdeNota(a.responder);   // nota de un ejercicio: en ese ejercicio
  // Nota de sesión: la misma respuesta de la Bandeja (tarjeta en su app + aviso).
  if (!a.aus_id && typeof bdjResponder === 'function') return bdjResponder(notaClave, () => { _cpr.datos = null; rerenderView(); });
  openModal(modalShell(`${a.aus_id ? 'Escribirle' : 'Responderle'} a ${escapeHtml(f.c.nombre.split(' ')[0])}`, `
    <div class="text-sm text-slate-600 mb-2">${a.aus_id ? `${escapeHtml(a.titulo)} · ${escapeHtml(a.detalle || '')}` : `${escapeHtml(a.titulo)}: <em>«${escapeHtml(a.detalle || '')}»</em>`}</div>
    <textarea id="cp-resp" rows="4" placeholder="Tu respuesta" style="width:100%"></textarea>
    <p class="text-xs text-slate-500 mt-2">«A su app» le sale como mensaje de su coach en el inicio de la app. WhatsApp, para lo que necesita conversación.</p>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-secondary" data-cp-resp-wa onclick="cpEnviarRespuesta('${id}','${notaClave}', true)">Por WhatsApp</button>
     <button class="btn btn-primary" data-cp-resp-app onclick="cpEnviarRespuesta('${id}','${notaClave}', false)">A su app</button>`));
  setTimeout(() => document.getElementById('cp-resp')?.focus(), 50);
};
window.cpEnviarRespuesta = async (id, notaClave, wa) => {
  const f = _cpr.datos && _cpr.datos.filas.find(x => x.c.id === id);
  const a = (_bdj.datos ? _bdj.datos.atencion : []).find(x => x.id === notaClave);
  const txt = (document.getElementById('cp-resp')?.value || '').trim();
  if (!f || !a || !txt) return toast('Escribe la respuesta');
  const rutina = String(a.titulo || '').replace(/^Al terminar\s+/, '').replace(/\s+te dijo$/, '');
  const texto = /^Al terminar/.test(a.titulo || '') ? `Sobre tu ${rutina}: ${txt}` : txt;
  if (wa) {
    const tel = String(f.c.telefono || '').replace(/[^\d]/g, '');
    if (!tel) return toast('No tiene teléfono en su ficha');
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
  } else {
    const mtId = typeof resolverMealtrackerId === 'function' ? await resolverMealtrackerId(f.c) : null;
    if (!mtId) return toast('No está vinculado con su app: respóndele por WhatsApp');
    const r = await fetchRemindersMT(mtId);
    const lista = Array.isArray(r.list) ? r.list.slice() : [];
    lista.push({ id: `resp-${Date.now()}`, text: texto, created_at: new Date().toISOString(), done_at: null, done_by: null });
    if (!(await saveRemindersMT(mtId, lista))) return toast('No pude mandarlo a su app');
  }
  if (typeof segRegistrar === 'function') await segRegistrar(id, { origen: 'nota', titulo: wa ? 'Respuesta por WhatsApp' : 'Respuesta en su app', texto });
  bdjMarcarVisto(notaClave);
  if (a.aus_id && typeof ausVista === 'function') await ausVista(a.aus_id);
  if (a.nota_id) { try { await sb.from('notas_entreno').update({ leida_en: new Date().toISOString() }).eq('id', a.nota_id); } catch (e) { /* queda en este navegador */ } }
  closeModal();
  toast(wa ? 'Abierto en WhatsApp y guardado' : 'Le llegó a su app y quedó guardado');
  _cpr.datos = null; rerenderView();
};

// Un aviso de ausencia: visto (sin escribirle).
window.cpAvisoVisto = async (clave, ausId) => {
  bdjMarcarVisto(clave);
  if (ausId && typeof ausVista === 'function') await ausVista(ausId);
  if (typeof bdjPintarContador === 'function') bdjPintarContador();
  _cpr.datos = null; rerenderView();
};
// Editar una ausencia desde Hoy: el mismo formulario de Seguimiento.
window.cpAusEditar = (clienteId, ausId) => { if (typeof ausMarcar === 'function') ausMarcar(clienteId, ausId); };

// ── Hoy ─────────────────────────────────────────────────────────────────
function cpTarjeta(f, conAcciones = true) {
  const [bg, col, t] = CP_TONO[f.estado];
  return `<div class="cp-card" data-cp-cliente="${f.c.id}" data-cp-estado="${f.estado}">
    <div class="cp-fila">
      <div style="display:flex;gap:10px;align-items:center;min-width:0;cursor:pointer" onclick="cpSeguimiento('${f.c.id}')">${typeof entAvatar === 'function' ? entAvatar(f.c.nombre) : ''}
        <div><b style="font-size:15.5px">${escapeHtml(f.c.nombre)}</b> <span class="cp-pill" style="background:${bg};color:${col}">${t}</span></div></div>
      ${conAcciones ? `<div class="cp-acc">
        ${f.bdjIds.length ? `<button type="button" class="cp-btn s" data-cp-atendido onclick="cpAtendido('${f.c.id}')" title="Marca como atendido todo lo suyo de la Bandeja">Atendido</button>` : ''}
        <button type="button" class="cp-btn s" onclick="cpSeguimiento('${f.c.id}')">Abrir</button></div>` : ''}
    </div>
    ${f.senales.map(s => `<div class="cp-senal" data-cp-senal="${s.clave}">
      <span class="cp-mot">${s.nivel === 'intervenir' ? '<span style="color:#B2402B;font-weight:800">●</span> ' : '<span style="color:#C98A1B;font-weight:800">●</span> '}${s.texto}</span>
      <span class="cp-acc">${s.accion ? `<button type="button" class="cp-btn" onclick="${s.accion.fn}">${s.accion.t}</button>` : ''}
      <button type="button" class="cp-btn s" title="Se esconde 7 días" onclick="cpDescartar('${f.c.id}:${s.clave}')">No hace falta</button></span>
    </div>`).join('')}
  </div>`;
}
// (La franja «Estás probando el CRM nuevo… Volver al de siempre» ya no va.)
function cpBanda() { return ''; }
routes.hoy = async () => {
  cargando('Revisando a todos tus clientes…');
  let D;
  try { D = await cpDatos(); } catch (e) { D = { filas: [] }; console.warn('hoy', e); }
  finCargando();
  const I = D.filas.filter(f => f.estado === 'intervenir'), O = D.filas.filter(f => f.estado === 'observar'), N = D.filas.filter(f => f.estado === 'normal');
  const PA = D.filas.filter(f => f.estado === 'pausa');
  const AV = D.filas.flatMap(f => (f.avisos || []).map(a => ({ f, a })));
  const rec = D.filas.filter(f => f.reconocer.length);
  const med = D.filas.filter(f => f.senales.some(s => s.clave === 'medicion')).length;
  view.innerHTML = `${cpBanda()}
    <div class="mb-3"><h2 class="text-2xl font-bold text-slate-900">Hoy</h2>
      <p class="text-sm text-slate-500" data-cp-resumen><b>${I.length}</b> para intervenir · <b>${O.length}</b> para observar · <b>${N.length}</b> van bien${PA.length ? ` · <b>${PA.length}</b> en pausa` : ''} (no hace falta nada hoy)</p></div>
    ${AV.length ? `<div class="cp-h">Te avisaron · ${AV.length}</div><div data-cp-avisos>${AV.map(({ f, a }) => `<div class="cp-card cp-rec" data-cp-aviso="${f.c.id}">
      <span style="flex:none;width:38px;height:38px;border-radius:12px;background:rgba(60,123,214,.12);display:grid;place-items:center">${typeof AUS_ICONO === 'string' ? AUS_ICONO : ''}</span>
      <span style="flex:1 1 240px"><b style="font-size:15.5px">${escapeHtml(f.c.nombre)}</b> <span class="cp-mot" style="display:inline">${escapeHtml(a.titulo)}</span><div class="cp-mot">${escapeHtml(a.detalle || '')}</div></span>
      <span class="cp-acc"><button type="button" class="cp-btn" onclick="cpResponder('${f.c.id}','${a.id}')">Escribirle</button><button type="button" class="cp-btn s" onclick="cpAvisoVisto('${a.id}','${a.aus_id || ''}')">Visto</button></span></div>`).join('')}</div>` : ''}
    <div class="cp-h">Intervenir · ${I.length}</div>
    <div data-cp-intervenir>${I.length ? I.map(f => cpTarjeta(f)).join('') : '<div class="cp-card text-sm text-slate-500">Nadie necesita que intervengas hoy.</div>'}</div>
    ${rec.length ? `<div class="cp-h">Para reconocer · ${rec.length}</div><div data-cp-reconocer>${rec.map(f => `<div class="cp-card cp-rec"><b style="min-width:140px">${escapeHtml(f.c.nombre)}</b><span class="cp-mot">${f.reconocer.map(r => r.texto).join(' · ')}</span><button type="button" class="cp-btn" onclick="cpSeguimiento('${f.c.id}')">Escribirle</button></div>`).join('')}</div>` : ''}
    ${PA.length ? `<div class="cp-h">En pausa · ${PA.length}</div><div data-cp-pausa>${PA.map(f => `<div class="cp-card cp-rec" data-cp-cliente="${f.c.id}" data-cp-estado="pausa">
      <span style="flex:none;width:38px;height:38px;border-radius:12px;background:rgba(60,123,214,.12);display:grid;place-items:center">${typeof AUS_ICONO === 'string' ? AUS_ICONO : ''}</span>
      <span style="flex:1 1 240px"><b style="font-size:15.5px;cursor:pointer" onclick="cpSeguimiento('${f.c.id}')">${escapeHtml(f.c.nombre)}</b> <span class="cp-pill" style="background:#E3EDFA;color:#2F6CC4">${typeof ausMotivo === 'function' ? ausMotivo(f.pausa.motivo) : 'Fuera'}</span>
        <div class="cp-mot">${typeof ausRango === 'function' ? ausRango(f.pausa) : ''} · ${f.pausa.origen === 'cliente' ? 'la marcó en su app' : 'la marcaste tú'}. Esos días no cuentan en su adherencia, puntajes ni alertas.${f.pausa.nota ? ` «${escapeHtml(f.pausa.nota)}»` : ''}</div>
        ${f.senales.map(s2 => `<div class="cp-mot" style="margin-top:4px"><span style="color:#C98A1B;font-weight:800">●</span> ${s2.texto}</div>`).join('')}</span>
      <span class="cp-acc"><button type="button" class="cp-btn s" onclick="cpAusEditar('${f.c.id}','${f.pausa.id}')">Editar</button></span></div>`).join('')}</div>` : ''}
    <details class="cp-card" style="margin-top:14px" data-cp-observar ${I.length ? '' : 'open'}><summary style="cursor:pointer;font-weight:800">Observar · ${O.length} <span class="text-sm text-slate-500" style="font-weight:500">· señales tempranas; casi siempre basta con mirar</span></summary>
      <div style="margin-top:10px">${O.map(f => cpTarjeta(f)).join('') || '<div class="text-sm text-slate-500">Nadie.</div>'}</div>
      ${med > 1 ? `<button type="button" class="cp-btn" style="margin-top:6px" onclick="cpPedirMedicionTodos()">Pedir la medición del mes a los ${med} que les toca</button>` : ''}</details>
    <div class="cp-h">Van bien · ${N.length}</div>
    <div class="cp-normal" data-cp-normal>${N.map(f => `<span onclick="cpSeguimiento('${f.c.id}')">${escapeHtml(f.c.nombre)}</span>`).join('') || '<span style="cursor:default">Nadie en este grupo todavía</span>'}</div>
    <p class="text-xs text-slate-500" style="margin-top:14px">Cada estado se mide contra la propia línea del cliente (sus semanas anteriores). «No hace falta» esconde esa señal 7 días. «Atendido» marca de una vez lo suyo en la Bandeja.</p>`;
};

// ── Cartera ──────────────────────────────────────────────────────────────
const CP_FILTROS = [
  ['todos', 'Todos', () => true], ['intervenir', 'Intervenir', f => f.estado === 'intervenir'], ['observar', 'Observar', f => f.estado === 'observar'],
  ['normal', 'Van bien', f => f.estado === 'normal'], ['pausa', 'En pausa', f => f.estado === 'pausa'], ['ciclo', 'Termina ciclo', f => f.ciclo && f.ciclo.queda <= 7], ['medicion', 'Toca medición', f => f.diasMed == null || f.diasMed > 30],
];
function cpBarras(sem) {
  return `<div class="cp-sem" title="Entreno, últimas 6 semanas">${sem.map(w => w.pct == null ? '<span style="height:4px;background:#E4E0D8"></span>' : `<span title="${w.hechos} de ${w.plan}" style="height:${6 + (w.pct / 100) * 20}px;background:${w.pct >= 75 ? '#3C7BD6' : w.pct >= 50 ? '#C9A227' : '#C2412D'}"></span>`).join('')}</div>`;
}
routes.cartera = async () => {
  cargando('Armando tu cartera…');
  let D;
  try { D = await cpDatos(); } catch (e) { D = { filas: [] }; }
  finCargando();
  const filtro = CP_FILTROS.find(x => x[0] === _cpr.filtro) || CP_FILTROS[0];
  const filas = D.filas.filter(filtro[2]);
  const hace = (f) => { if (!f) return 'nunca'; const d = Math.round((new Date(fmt.hoy() + 'T12:00:00') - new Date(f + 'T12:00:00')) / 86400000); return d === 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`; };
  view.innerHTML = `${cpBanda()}
    <div class="mb-3"><h2 class="text-2xl font-bold text-slate-900">Cartera</h2><p class="text-sm text-slate-500">Todos tus clientes en una tabla: su estado, por qué, y lo que toca.</p></div>
    <div class="card lis-tabla-caja" data-cp-tabla style="padding-top:14px">
      <div class="flex gap-1.5 flex-wrap" style="padding:0 16px 10px">${CP_FILTROS.map(([k, t, fn]) => `<button type="button" class="chip ${_cpr.filtro === k ? 'active' : ''}" data-cp-filtro="${k}" onclick="cpFiltro('${k}')">${t} · ${D.filas.filter(fn).length}</button>`).join('')}</div>
      <table class="lis-tabla"><thead><tr><th class="lis-nom">Cliente</th><th>Estado y por qué</th><th>Entreno (6 sem)</th><th>Comida (28 días)</th><th>Sin actividad</th><th>Último contacto</th><th>Próxima acción</th><th>Ciclo</th><th>Pago</th></tr></thead>
      <tbody>${filas.map(f => { const [bg, col, t] = CP_TONO[f.estado]; return `<tr data-cp-fila="${f.c.id}" onclick="cpSeguimiento('${f.c.id}')" style="cursor:pointer">
        <td class="lis-nom">${typeof entAvatar === 'function' ? entAvatar(f.c.nombre) : ''}<b>${escapeHtml(f.c.nombre)}</b></td>
        <td style="min-width:240px;max-width:320px"><span class="cp-pill" style="background:${bg};color:${col}">${t}</span><div style="font-size:12.5px;color:#55565B;margin-top:4px;line-height:1.35">${f.pausa && typeof ausRango === 'function' ? `${ausMotivo(f.pausa.motivo)} · ${ausRango(f.pausa)}${f.senales.length ? ' · ' : ''}` : ''}${f.senales.slice(0, 2).map(s => s.texto.replace(/<[^>]+>/g, '')).join(' · ') || (f.pausa ? '' : 'Todo en orden')}</div></td>
        <td>${cpBarras(f.semanas)}</td>
        <td>${f.eng ? `${f.eng.comida28} días` : '—'}</td>
        <td>${f.eng ? (f.eng.sinActividad == null ? 'nunca' : f.eng.sinActividad === 0 ? 'hoy' : `${f.eng.sinActividad} días`) : '—'}</td>
        <td>${hace(f.ultimoMsj)}</td>
        <td><span style="font-weight:600;font-size:13px">${escapeHtml(f.proxima)}</span></td>
        <td>${f.ciclo ? `${escapeHtml(f.ciclo.nombre)}<div style="font-size:12px;color:#737373">${f.ciclo.queda} días</div>` : '—'}</td>
        <td>${f.pago === undefined ? '—' : f.pago && f.pago.due ? '<span style="color:#B2402B;font-weight:700">Vencido</span>' : 'Al día'}</td></tr>`; }).join('')}</tbody></table>
      ${filas.length ? '' : '<p class="text-sm text-slate-500" style="padding:0 16px 16px">Nadie en este filtro.</p>'}
    </div>`;
};
window.cpFiltro = (k) => { _cpr.filtro = k; routes.cartera(); };

// En Seguimiento (prendido): por qué está en la cola, arriba de todo.
async function cpMotivoSeguimiento() {
  if (!cpActivo()) return;
  const caja = document.getElementById('seg-semana');
  const c = typeof _sa !== 'undefined' ? _sa.cliente : null;
  if (!caja || !c || caja.querySelector('[data-cp-motivo]')) return;
  const D = _cpr.datos || null;
  const f = D && D.filas.find(x => x.c.id === c.id);
  if (!f) return;
  const [bg, col, t] = CP_TONO[f.estado];
  const div = document.createElement('div');
  div.className = 'cp-card'; div.dataset.cpMotivo = '1';
  div.innerHTML = `<b>Por qué está en tu cola</b> <span class="cp-pill" style="background:${bg};color:${col}">${t}</span>
    <div class="cp-mot">${f.senales.length ? f.senales.map(s => s.texto).join('<br>') : 'Va bien: no hace falta nada extra hoy.'}</div>`;
  caja.insertBefore(div, caja.querySelector('[data-aus-seg]') || caja.querySelector('[data-sa-barra]') || caja.firstChild);
}
if (typeof window.saPintar === 'function') {
  const base = window.saPintar;
  window.saPintar = async (c, S, D) => { const r = await base(c, S, D); cpMotivoSeguimiento(); return r; };
}

// Arranque: aplicar al entrar y cuando el menú se rearme.
document.addEventListener('DOMContentLoaded', cpAplicar);
setTimeout(cpAplicar, 0);
