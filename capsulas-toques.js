// =====================================================
// Toques → «Cápsulas»: la cápsula que le pides leer a cada cliente.
// =====================================================
// El ciclo por cliente: Sugerida → Enviada (con una pregunta) → Leída →
// Respondió. Si pasan 3 días sin abrirla, toca «Recordar».
//
//   · Enviar y Recordar abren su WhatsApp con el enlace directo a ESA
//     cápsula (el centro de recursos la abre ya desplegada) y la pregunta.
//   · «Leída» se marca sola: el centro de recursos registra lo que abre cada
//     cliente (la misma lectura que usa Enganche y el Centro de aprendizaje).
//   · «Me respondió» lo marcas tú, con lo que te dijo si quieres.
// Enviar, recordar y su respuesta suman como toque del tipo «Cápsula».
//
// Guarda en capsulas_pedidas (migraciones/capsulas-pedidas.sql). Sin esa
// tabla, la columna avisa y no se rompe nada.
// Carga DESPUÉS de toques.js (y de app.js, que trae el catálogo).

const CAP_URL = 'https://centrorecursosentrenametodo.vercel.app';
const CAP_SQL = 'migraciones/capsulas-pedidas.sql';
const CAP_RECORDAR = 3;   // días sin abrirla para sugerir «Recordar»
// Una pregunta por cápsula: responderla obliga a pensar lo que leyó.
const CAP_PREGUNTA = {
  'ent-01-capacidades': '¿cuál de las cinco capacidades sientes que más te falta trabajar?',
  'ent-02-crece-musculo': '¿qué te sorprendió de cómo crece el músculo?',
  'ent-03-lenguaje-rutina': '¿hay algo de tu rutina que todavía no te quede claro?',
  'ent-04-subir-peso': 'con lo que leíste, ¿en qué ejercicio crees que ya te toca subir el peso?',
  'ent-05-orden-sesion': '¿qué cambiarías en cómo haces tu sesión después de leerla?',
  'ent-06-entiende-rutina': '¿qué parte de tu rutina entiendes mejor ahora?',
  'nut-07-cada-macro': '¿qué alimento con proteína te queda más fácil sumar en tu día?',
  'nut-08-grasa-y-musculo': '¿qué es lo más importante que te llevas para tu objetivo?',
  'nut-09-comer-sin-pesar': '¿qué idea de la cápsula vas a usar esta semana?',
  'bie-10-dormir-mejor': '¿qué hábito de sueño vas a probar esta semana?',
  'bie-11-muevete-fuera': '¿cómo vas a sumar movimiento fuera del gimnasio esta semana?',
};
const _capt = { pedidos: [], lecturas: null, sinTabla: false, nombres: new Map() };
const capDia = (v) => String(v || '').slice(0, 10);
const capCatalogo = () => (typeof CENTRO_CAPSULAS !== 'undefined' ? CENTRO_CAPSULAS : []);
const capTitulo = (id) => (capCatalogo().find(x => x.id === id) || {}).title || id;
const capNorm = (s) => (typeof normalizeName === 'function' ? normalizeName(s) : String(s || '').toLowerCase().trim());

// Lo que se lee (junto con lo de Toques, cada vez que se arma la vista).
async function capCargar(clientes) {
  const desde = evtSumarDias(fmt.hoy(), -180);
  try {
    const { data, error } = await sb.from('capsulas_pedidas').select('*').gte('enviada_en', desde);
    if (error) { _capt.sinTabla = /capsulas_pedidas|relation|schema cache|42P01|PGRST20/i.test(String(error.message || error.code || '')); _capt.pedidos = []; }
    else { _capt.sinTabla = false; _capt.pedidos = (data || []).filter(x => !x.retirado_en); }
  } catch (e) { _capt.pedidos = []; }
  try { _capt.lecturas = typeof cargarLecturasCentro === 'function' ? await cargarLecturasCentro() : null; } catch (e) { _capt.lecturas = null; }
  _capt.nombres = new Map((clientes || []).map(c => [String(c.id), [c.nombre, ...(c.nombres_alternos || [])].map(capNorm).filter(Boolean)]));
}
// Las cápsulas que abrió (id → fecha 'YYYY-MM-DD' o '' si el centro no da fecha).
function capLeidas(clienteId) {
  const out = new Map();
  if (!_capt.lecturas) return out;
  const nombres = _capt.nombres.get(String(clienteId)) || [];
  _capt.lecturas.forEach(f => {
    if (f.source !== 'capsula' || !nombres.includes(capNorm(f.client_name))) return;
    const id = String(f.section_key || '').replace(/^cap:/, '');
    const fecha = (typeof centroFechaFila === 'function' && centroFechaFila(f)) || '';
    if (!out.has(id) || fecha > out.get(id)) out.set(id, fecha);
  });
  return out;
}
// En qué va con las cápsulas: la última que le enviaste, o la que sugiero.
function capDe(clienteId) {
  const hoy = fmt.hoy(), leidas = capLeidas(clienteId);
  const suyos = _capt.pedidos.filter(p => String(p.cliente_id) === String(clienteId)).sort((a, b) => String(b.enviada_en).localeCompare(String(a.enviada_en)));
  const ult = suyos[0] || null;
  const total = capCatalogo().length, nLeidas = capCatalogo().filter(x => leidas.has(x.id)).length;
  const enviadas = new Set(suyos.map(p => p.capsula_id));
  const sugerida = capCatalogo().find(x => !leidas.has(x.id) && !enviadas.has(x.id)) || capCatalogo().find(x => !leidas.has(x.id)) || null;
  const base = { total, nLeidas, sugerida, leidas };
  if (!ult || ult.respondio_en) {
    return { ...base, estado: ult ? 'respondio' : (sugerida ? 'sugerida' : 'todas'), p: ult };
  }
  const leida = leidas.has(ult.capsula_id);
  const desde = capDia(ult.recordada_en || ult.enviada_en);
  const dias = tqEntre(desde, hoy);
  return { ...base, p: ult, leidaEn: leida ? leidas.get(ult.capsula_id) : null, dias, estado: leida ? 'leida' : dias >= CAP_RECORDAR ? 'recordar' : 'enviada' };
}
const capCuando = (f) => { if (!f) return ''; const d = tqEntre(capDia(f), fmt.hoy()); return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`; };
const CAP_TONO = { sugerida: ['#F1EFE9', '#555'], enviada: ['#FCF1CC', '#8A6400'], recordar: ['#FBE3E1', '#B3392F'], leida: ['#E3EDFB', '#2F5FA6'], respondio: ['#E2F2E6', '#2F7F45'], todas: ['#E2F2E6', '#2F7F45'] };

function capCelda(f) {
  if (f.estado === 'pausa') return '<span class="tq-cero">—</span>';
  if (_capt.sinTabla) return `<span class="tq-sub">Falta correr ${CAP_SQL}</span>`;
  const x = capDe(f.c.id), id = f.c.id;
  const et = (t) => { const [bg, col] = CAP_TONO[x.estado]; return `<span class="pp-e" style="background:${bg};color:${col}">${t}</span>`; };
  const b = (txt, oscuro, attr, fn) => `<button type="button" class="pp-b${oscuro ? ' o' : ''}" ${attr} onclick="${fn}">${txt}</button>`;
  const enviar = (txt) => b(txt, true, 'data-cp-enviar', `capEnviar('${id}')`);
  const resp = b('Me respondió', false, 'data-cp-respondio', `capRespondio('${id}')`);
  let h = '';
  if (x.estado === 'todas') h = `<div class="pp-h">${et('Leyó todas')}</div>`;
  else if (x.estado === 'sugerida') h = `<div class="pp-h"><b>${escapeHtml(x.sugerida.title)}</b></div><div class="pp-h">${et('Sugerida')}</div><div class="pp-d">Aún no la abre</div><div class="pp-bs">${enviar('Enviar con pregunta')}</div>`;
  else {
    const p = x.p, titulo = escapeHtml(p.capsula_titulo || capTitulo(p.capsula_id));
    if (x.estado === 'respondio') h = `<div class="pp-h"><b>${titulo}</b></div><div class="pp-h">${et(`Respondió · ${capCuando(p.respondio_en)}`)}</div>${p.respuesta ? `<div class="pp-d">«${escapeHtml(p.respuesta)}»</div>` : ''}${x.sugerida ? `<div class="pp-bs">${enviar('Enviar otra')}</div>` : ''}`;
    else if (x.estado === 'leida') h = `<div class="pp-h"><b>${titulo}</b></div><div class="pp-h">${et(x.leidaEn ? `Leída ${capCuando(x.leidaEn)}` : 'Leída')}</div><div class="pp-d">Esperando su respuesta</div><div class="pp-bs">${resp}</div>`;
    else if (x.estado === 'recordar') h = `<div class="pp-h"><b>${titulo}</b></div><div class="pp-h">${et(`${p.recordada_en ? 'Recordada' : 'Enviada'} ${capCuando(p.recordada_en || p.enviada_en)} · sin abrir`)}</div><div class="pp-bs">${b('Recordar', true, 'data-cp-recordar', `capRecordar('${id}')`)}${resp}</div>`;
    else h = `<div class="pp-h"><b>${titulo}</b></div><div class="pp-h">${et(`${p.recordada_en ? 'Recordada' : 'Enviada'} ${capCuando(p.recordada_en || p.enviada_en)} · sin abrir`)}</div><div class="pp-bs">${resp}</div>`;
  }
  const lec = _capt.lecturas ? `<div class="tq-sub" data-cp-total>Leídas: ${x.nLeidas} de ${x.total}</div>` : '<div class="tq-sub">No pude leer el centro</div>';
  return `<div class="cp-cel" data-cp="${id}" data-cp-estado="${x.estado}">${h}${lec}</div>`;
}

// ── Acciones ─────────────────────────────────────────────────────────────
const capCliente = async (id) => (_tq.datos && (_tq.datos.filas.find(x => String(x.c.id) === String(id)) || {}).c) || await db.clientes.get(id);
const capNombre = (c) => String((c && c.nombre) || '').trim().split(/\s+/)[0] || '';
// El enlace abre ESA cápsula, ya desplegada, y entra con su nombre (así la
// lectura queda registrada a su nombre).
const capEnlace = (c, capId) => `${CAP_URL}/?mt_name=${encodeURIComponent((c && c.nombre) || '')}&mt_go=capsulas&mt_id=${encodeURIComponent(capId)}`;
function capAbrirWa(c, texto) {
  const tel = String((c && c.telefono) || '').replace(/\D/g, '');
  if (tel) { window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener'); return true; }
  try { navigator.clipboard.writeText(texto); toast('No tiene teléfono: mensaje copiado'); } catch (e) { /* nada */ }
  return false;
}
function capMensaje(c, capId, pregunta) {
  return `Hola ${capNombre(c)}, ¿cómo vas? Te dejo una cápsula corta que te va a servir: «${capTitulo(capId)}».\n${capEnlace(c, capId)}\n\nCuando la leas, cuéntame: ${pregunta}`;
}
function capRepintar() { _tq.datos = null; _tq.leido = 0; if (_currentView === 'toques') rerenderView(); }

window.capEnviar = async (id) => {
  const c = await capCliente(id);
  const x = capDe(id);
  const opciones = capCatalogo().map(k => `<option value="${k.id}"${x.sugerida && x.sugerida.id === k.id ? ' selected' : ''}>${escapeHtml(k.title)}${x.leidas.has(k.id) ? ' · ya la leyó' : ''}</option>`).join('');
  const ini = (x.sugerida || capCatalogo()[0] || {}).id;
  openModal(modalShell(`Enviar cápsula · ${escapeHtml(c.nombre)}`, `<div data-cp-modal="${id}">
    <label class="block text-sm font-semibold text-slate-700 mb-1">Cápsula</label>
    <select id="cp-cap" class="input w-full" onchange="capCambiar('${id}')">${opciones}</select>
    <label class="block text-sm font-semibold text-slate-700 mt-4 mb-1">Pregunta para que te responda</label>
    <input id="cp-preg" class="input w-full" value="${escapeHtml(CAP_PREGUNTA[ini] || '¿qué te llevas de la cápsula?')}" oninput="capArmar('${id}')">
    <label class="block text-sm font-semibold text-slate-700 mt-4 mb-1">Mensaje</label>
    <p class="text-xs text-slate-500 mb-1">Funciona mejor si al inicio dices por qué se la mandas, con algo real de su semana: «Vi que esta semana la proteína quedó corta…».</p>
    <textarea id="cp-msj" class="input w-full" rows="7">${escapeHtml(capMensaje(c, ini, CAP_PREGUNTA[ini] || ''))}</textarea>
  </div>`, `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" data-cp-confirmar onclick="capConfirmar('${id}')">Enviar por WhatsApp</button>`));
};
window.capCambiar = async (id) => {
  const cap = document.getElementById('cp-cap').value;
  document.getElementById('cp-preg').value = CAP_PREGUNTA[cap] || '¿qué te llevas de la cápsula?';
  await capArmar(id);
};
window.capArmar = async (id) => {
  const c = await capCliente(id);
  const cap = document.getElementById('cp-cap').value, preg = document.getElementById('cp-preg').value.trim();
  document.getElementById('cp-msj').value = capMensaje(c, cap, preg);
};
window.capConfirmar = async (id) => {
  const c = await capCliente(id);
  const cap = document.getElementById('cp-cap').value, preg = document.getElementById('cp-preg').value.trim();
  const texto = document.getElementById('cp-msj').value.trim();
  if (!texto) return toast('Escribe el mensaje');
  try {
    const { error } = await sb.from('capsulas_pedidas').insert({ cliente_id: id, capsula_id: cap, capsula_titulo: capTitulo(cap), pregunta: preg, enviada_en: new Date().toISOString() });
    if (error) { if (/capsulas_pedidas|relation|schema cache/i.test(error.message || '')) { _capt.sinTabla = true; toast(`Falta correr ${CAP_SQL} en Supabase`); } else toast('No pude guardarlo'); return; }
  } catch (e) { toast('No pude guardarlo'); return; }
  capAbrirWa(c, texto);
  closeModal();
  toast(`Enviada: ${capTitulo(cap)}`);
  capRepintar();
};
window.capRecordar = async (id) => {
  const x = capDe(id), p = x.p;
  if (!p) return;
  const c = await capCliente(id);
  const texto = `Hola ${capNombre(c)}, ¿alcanzaste a ver la cápsula «${p.capsula_titulo || capTitulo(p.capsula_id)}»? Son un par de minutos:\n${capEnlace(c, p.capsula_id)}\n\nCuando la leas, cuéntame: ${p.pregunta || '¿qué te llevas de la cápsula?'}`;
  try {
    const { error } = await sb.from('capsulas_pedidas').update({ recordada_en: new Date().toISOString() }).eq('id', p.id);
    if (error) { toast('No pude guardarlo'); return; }
  } catch (e) { toast('No pude guardarlo'); return; }
  capAbrirWa(c, texto);
  toast('Recordatorio enviado');
  capRepintar();
};
window.capRespondio = async (id) => {
  const x = capDe(id), p = x.p;
  if (!p) return;
  const c = await capCliente(id);
  openModal(modalShell(`Te respondió · ${escapeHtml(c.nombre)}`, `<div data-cp-resp-modal="${id}">
    <p class="text-sm text-slate-600 mb-2"><b>${escapeHtml(p.capsula_titulo || capTitulo(p.capsula_id))}</b>${p.pregunta ? ` · ${escapeHtml(p.pregunta)}` : ''}</p>
    <label class="block text-sm font-semibold text-slate-700 mb-1">Lo que te dijo (opcional)</label>
    <textarea id="cp-respuesta" class="input w-full" rows="3" placeholder="Ej.: Voy a sumar huevo al desayuno"></textarea>
  </div>`, `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" data-cp-guardar-resp onclick="capGuardarResp('${id}','${p.id}')">Guardar</button>`));
};
window.capGuardarResp = async (id, filaId) => {
  const r = (document.getElementById('cp-respuesta').value || '').trim();
  try {
    const { error } = await sb.from('capsulas_pedidas').update({ respondio_en: new Date().toISOString(), respuesta: r || null }).eq('id', filaId);
    if (error) { toast('No pude guardarlo'); return; }
  } catch (e) { toast('No pude guardarlo'); return; }
  closeModal();
  toast('Listo: respondió');
  capRepintar();
};

(function () {
  const s = document.createElement('style');
  s.textContent = `
  .tq-tabla td[data-tq="capsulas"]{min-width:190px;vertical-align:top}
  .cp-cel .pp-h{margin-bottom:3px}
  .cp-cel .tq-sub{margin-top:5px}`;
  document.head.appendChild(s);
})();
