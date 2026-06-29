// =====================================================
// CRM EntrenaConMétodo · App principal
// =====================================================

const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
const view = $('#view');
const modal = $('#modal');
const modalContent = $('#modal-content');
const modalBox = $('#modal-box');
const toastEl = $('#toast');
const loginScreen = $('#login-screen');
const appScreen = $('#app-screen');
const bootScreen = $('#boot-screen');

let _settings = { usd_cop_rate: 4000, nombre_coach: 'Coach' };
let _clientesCache = null;
let _selectedClienteId = null;
let _segView = 'focus';
let _pagosView = 'table';
let _pagosYear = new Date().getFullYear();
let _pendientesFilter = 'todos';

// =====================================================
// UTILS
// =====================================================
const fmt = {
  hoy: () => new Date().toISOString().slice(0, 10),
  mesActual: () => new Date().toISOString().slice(0, 7),
  fecha: (s) => s ? new Date(s + (String(s).length === 10 ? 'T00:00:00' : '')).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
  fechaCorta: (s) => s ? new Date(s + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) : '—',
  money: (n, m = 'COP') => {
    const v = Number(n || 0);
    if (m === 'USD') return `USD ${v.toFixed(0)}`;
    return `COP ${v.toLocaleString('es-CO')}`;
  },
  moneyCop: (n) => `COP ${Number(n || 0).toLocaleString('es-CO')}`,
  mesEs: (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('es-CO', { month: 'short' }).replace('.', '');
  },
  mesEsLargo: (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  },
  semanaISO: (d = new Date()) => {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  },
  semanaPrev: (s) => {
    const [y, w] = s.split('-W').map(Number);
    if (w > 1) return `${y}-W${String(w - 1).padStart(2, '0')}`;
    return `${y - 1}-W52`;
  },
  labelSemana: (s) => {
    const [y, w] = s.split('-W').map(Number);
    return `S${w} '${String(y).slice(2)}`;
  },
  diasDesde: (s) => {
    if (!s) return null;
    const a = new Date(s + (String(s).length === 10 ? 'T00:00:00' : ''));
    return Math.floor((Date.now() - a) / 86400000);
  },
  diasEntre: (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000),
  mesesDesde: (s) => {
    if (!s) return null;
    const a = new Date(s + 'T00:00:00');
    const now = new Date();
    return (now.getFullYear() - a.getFullYear()) * 12 + (now.getMonth() - a.getMonth());
  },
};

const PALETA = ['from-pink-400 to-pink-600','from-blue-400 to-blue-600','from-teal-400 to-teal-600','from-violet-400 to-violet-600','from-orange-400 to-orange-600','from-emerald-400 to-emerald-600','from-red-400 to-red-600','from-amber-400 to-amber-600','from-cyan-400 to-cyan-600','from-fuchsia-400 to-fuchsia-600'];

const helpers = {
  iniciales: (nombre) => (nombre || '?').trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase(),
  color: (nombre) => {
    const s = nombre || '?';
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % PALETA.length;
    return PALETA[Math.abs(h)];
  },
  avatar: (nombre, size = 10) => `<div class="w-${size} h-${size} rounded-full bg-gradient-to-br ${helpers.color(nombre)} flex items-center justify-center text-white font-bold flex-shrink-0" style="font-size:${size <= 9 ? '0.75rem' : '0.95rem'}">${helpers.iniciales(nombre)}</div>`,
  avatarBig: (nombre) => `<div class="w-14 h-14 rounded-2xl bg-gradient-to-br ${helpers.color(nombre)} flex items-center justify-center text-white font-bold text-xl shadow-sm">${helpers.iniciales(nombre)}</div>`,
  promedioAdh: (s) => {
    if (!s) return null;
    const vals = [s.adherencia_entreno, s.adherencia_alimentacion, s.adherencia_descanso].filter(v => v !== null && v !== undefined);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  },
  pctAsistencia: (s) => {
    if (!s || !s.dias_planeados || s.dias_asistidos === null || s.dias_asistidos === undefined) return null;
    return Math.round((s.dias_asistidos / s.dias_planeados) * 100);
  },
  edadDe: (fechaNac) => {
    if (!fechaNac) return null;
    const n = new Date(fechaNac + 'T00:00:00');
    const hoy = new Date();
    let edad = hoy.getFullYear() - n.getFullYear();
    const m = hoy.getMonth() - n.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < n.getDate())) edad--;
    return edad;
  },
  diasHastaCumple: (fechaNac) => {
    if (!fechaNac) return null;
    const n = new Date(fechaNac + 'T00:00:00');
    const hoy = new Date();
    let prox = new Date(hoy.getFullYear(), n.getMonth(), n.getDate());
    if (prox < hoy) prox = new Date(hoy.getFullYear() + 1, n.getMonth(), n.getDate());
    return Math.floor((prox - hoy) / 86400000);
  },
  diaPagoEnMes: (cliente, mes) => {
    if (!cliente.dia_pago) return null;
    const [y, m] = mes.split('-').map(Number);
    return new Date(y, m - 1, Math.min(cliente.dia_pago, 28)).toISOString().slice(0, 10);
  },
  enRiesgo: (cliente, seguimientos) => {
    if (cliente.estado !== 'activo') return false;
    const segs = (seguimientos || []).filter(s => s.cliente_id === cliente.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    if (!segs.length) return fmt.mesesDesde(cliente.fecha_inicio) >= 1;
    const dias = fmt.diasDesde(segs[0].fecha);
    if (dias > 14) return true;
    if (segs.length >= 3) {
      const a = helpers.promedioAdh(segs[0]);
      const b = helpers.promedioAdh(segs[1]);
      const c = helpers.promedioAdh(segs[2]);
      if (a !== null && b !== null && c !== null && a < b - 0.5 && b < c - 0.5) return true;
    }
    return false;
  },
};

// ===== Gráfica SVG simple =====
// series = [{ label, color, points: number[] }]  · xLabels = string[]
function lineChart(series, xLabels = [], opts = {}) {
  const w = opts.width || 600;
  const h = opts.height || 180;
  const pad = { top: 14, right: 14, bottom: 28, left: 32 };
  const iw = w - pad.left - pad.right;
  const ih = h - pad.top - pad.bottom;
  const yMax = opts.yMax ?? 10;
  const yMin = opts.yMin ?? 0;
  const n = Math.max(...series.map(s => s.points.length), 1);
  const sx = (i) => pad.left + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const sy = (y) => pad.top + ih - ((y - yMin) / (yMax - yMin)) * ih;

  let svg = `<svg viewBox="0 0 ${w} ${h}" class="w-full h-auto" preserveAspectRatio="xMidYMid meet">`;
  // Grid Y
  for (let g = 0; g <= 4; g++) {
    const yv = yMin + (yMax - yMin) * (g / 4);
    const yy = sy(yv);
    svg += `<line x1="${pad.left}" y1="${yy}" x2="${w - pad.right}" y2="${yy}" stroke="#e2e8f0" stroke-width="1"/>`;
    svg += `<text x="${pad.left - 6}" y="${yy + 3}" text-anchor="end" font-size="10" fill="#94a3b8">${yv.toFixed(0)}</text>`;
  }
  // Series
  for (const s of series) {
    const pts = s.points
      .map((y, i) => y === null || y === undefined ? null : `${sx(i)},${sy(y)}`)
      .filter(Boolean).join(' ');
    if (pts) svg += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
    s.points.forEach((y, i) => {
      if (y !== null && y !== undefined) {
        svg += `<circle cx="${sx(i)}" cy="${sy(y)}" r="3" fill="${s.color}"/>`;
      }
    });
  }
  // X labels
  xLabels.forEach((lbl, i) => {
    if (i % Math.max(1, Math.floor(xLabels.length / 8)) === 0 || i === xLabels.length - 1) {
      svg += `<text x="${sx(i)}" y="${h - 10}" text-anchor="middle" font-size="10" fill="#94a3b8">${lbl}</text>`;
    }
  });
  svg += '</svg>';
  return svg;
}

function legendDot(color, label) {
  return `<span class="inline-flex items-center gap-1.5 text-xs text-slate-600 mr-3"><span class="w-2.5 h-2.5 rounded-full" style="background:${color}"></span>${label}</span>`;
}

const PLANTILLAS = {
  alta: `Excelente semana! Cumpliste muy bien con el plan.

✓ Mantengamos el ritmo
✓ Subamos un escalón en [agregar reto]
✓ Foco esta semana: [reforzar lo que funciona]`,
  media: `Semana mixta, hubo logros y cosas por ajustar.

✓ Lo bueno: [logro]
✓ A mejorar: [qué fallo]
✓ Foco esta semana: [un solo objetivo claro]`,
  baja: `Semana retadora. Hablemos qué pasó y ajustemos.

Lo importante es no perder el hilo. Esta semana vamos con algo simple:
✓ Mínimo viable de entreno: [reducir]
✓ Un solo cambio en alimentación: [qué]
✓ Charla rápida [día]`,
};

function generarResumen(cliente, seguimientos, pendientes) {
  const partes = [];
  const segs = (seguimientos || []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));

  // Contacto
  if (segs.length) {
    const dias = fmt.diasDesde(segs[0].fecha);
    if (dias > 14) partes.push(`⚠️ Hace ${dias} días sin registro. Reactivar contacto urgente.`);
    else if (dias > 7) partes.push(`Último seguimiento hace ${dias} días.`);
  } else {
    partes.push(`Primer seguimiento de este cliente.`);
  }

  // Tendencia
  if (segs.length >= 2) {
    const a = helpers.promedioAdh(segs[0]);
    const b = helpers.promedioAdh(segs[1]);
    if (a !== null && b !== null) {
      if (a > b + 0.5) partes.push(`📈 Adherencia subiendo (${b.toFixed(1)}→${a.toFixed(1)}). Reconócelo.`);
      else if (a < b - 0.5) partes.push(`📉 Adherencia bajando (${b.toFixed(1)}→${a.toFixed(1)}). Pregunta qué le frenó.`);
    }
  }

  // Restricciones
  if (cliente.restricciones_lesiones) {
    partes.push(`⚕️ Ojo lesión/restricción: ${cliente.restricciones_lesiones}.`);
  }

  // Pendientes
  const abiertos = (pendientes || []).filter(p => p.cliente_id === cliente.id && p.estado === 'abierto');
  if (abiertos.length) {
    partes.push(`📌 ${abiertos.length} pendiente(s) abierto(s): ${abiertos.slice(0, 2).map(p => p.descripcion).join('; ')}.`);
  }

  // Hito
  const meses = fmt.mesesDesde(cliente.fecha_inicio);
  if (meses === 3 || meses === 6 || meses === 12 || (meses && meses % 12 === 0)) {
    partes.push(`🎉 Cumple ${meses} mes${meses > 1 ? 'es' : ''} contigo.`);
  }

  // Cumpleaños
  const diasCumple = helpers.diasHastaCumple(cliente.fecha_nacimiento);
  if (diasCumple !== null && diasCumple <= 7) {
    partes.push(`🎂 Cumple años en ${diasCumple} día(s).`);
  }

  return partes.length ? partes.join(' ') : 'Sin contexto especial. Saludo y avance normal.';
}

// =====================================================
// TOAST + MODAL
// =====================================================
function toast(msg, ms = 2200) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.add('hidden'), ms);
}
function openModal(html, opts = {}) {
  modalContent.innerHTML = html;
  modalBox.style.maxWidth = opts.wide ? '64rem' : '42rem';
  modal.classList.remove('hidden');
}
function closeModal() { modal.classList.add('hidden'); modalContent.innerHTML = ''; }
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
window.closeModal = closeModal;

function modalShell(title, body, footer = '') {
  return `
    <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
      <h3 class="font-bold text-slate-900">${title}</h3>
      <button class="btn btn-ghost" onclick="closeModal()">✕</button>
    </div>
    <div class="p-6">${body}</div>
    ${footer ? `<div class="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2 sticky bottom-0">${footer}</div>` : ''}
  `;
}

// =====================================================
// AUTH
// =====================================================
async function checkSession() {
  const { data: { session } } = await sb.auth.getSession();
  bootScreen.classList.add('hidden');
  if (session) {
    await loadSettings();
    loginScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    navigate('dashboard');
  } else {
    appScreen.classList.add('hidden');
    loginScreen.classList.remove('hidden');
  }
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#login-email').value.trim();
  const password = $('#login-pass').value;
  const err = $('#login-error');
  err.classList.add('hidden');
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { err.textContent = error.message; err.classList.remove('hidden'); return; }
  checkSession();
});

$('#logout-btn').addEventListener('click', async () => {
  await sb.auth.signOut();
  location.reload();
});

async function loadSettings() {
  const { data } = await sb.from('settings').select('*').maybeSingle();
  if (data) _settings = { usd_cop_rate: Number(data.usd_cop_rate) || 4000, nombre_coach: data.nombre_coach || 'Coach' };
}

// =====================================================
// DATA LAYER
// =====================================================
const db = {
  clientes: {
    async list() {
      if (_clientesCache) return _clientesCache;
      const { data } = await sb.from('clientes').select('*').order('nombre');
      _clientesCache = data || [];
      return _clientesCache;
    },
    async refresh() { _clientesCache = null; return db.clientes.list(); },
    async get(id) { const { data } = await sb.from('clientes').select('*').eq('id', id).single(); return data; },
    async insert(row) { const { data, error } = await sb.from('clientes').insert(row).select().single(); if (error) toast(error.message); _clientesCache = null; return data; },
    async update(id, row) { const { error } = await sb.from('clientes').update(row).eq('id', id); if (error) toast(error.message); _clientesCache = null; },
    async remove(id) { await sb.from('clientes').delete().eq('id', id); _clientesCache = null; },
  },
  pagos: {
    async listAnio(anio) {
      const { data } = await sb.from('pagos').select('*').gte('mes', `${anio}-01`).lte('mes', `${anio}-12`);
      return data || [];
    },
    async listMes(mes) {
      const { data } = await sb.from('pagos').select('*, clientes(nombre, moneda)').eq('mes', mes);
      return data || [];
    },
    async upsert(row) {
      const { data, error } = await sb.from('pagos').upsert(row, { onConflict: 'user_id,cliente_id,mes' }).select().single();
      if (error) toast(error.message);
      return data;
    },
    async update(id, row) { await sb.from('pagos').update(row).eq('id', id); },
    async remove(id) { await sb.from('pagos').delete().eq('id', id); },
  },
  seguimientos: {
    async listCliente(cliente_id) {
      const { data } = await sb.from('seguimientos').select('*').eq('cliente_id', cliente_id).order('semana', { ascending: false });
      return data || [];
    },
    async listSemana(semana) {
      const { data } = await sb.from('seguimientos').select('*, clientes(nombre)').eq('semana', semana);
      return data || [];
    },
    async listAll() {
      const { data } = await sb.from('seguimientos').select('*');
      return data || [];
    },
    async get(id) { const { data } = await sb.from('seguimientos').select('*').eq('id', id).single(); return data; },
    async getByClienteSemana(cliente_id, semana) {
      const { data } = await sb.from('seguimientos').select('*').eq('cliente_id', cliente_id).eq('semana', semana).maybeSingle();
      return data;
    },
    async upsert(row) {
      const { data, error } = await sb.from('seguimientos').upsert(row, { onConflict: 'user_id,cliente_id,semana' }).select().single();
      if (error) toast(error.message);
      return data;
    },
    async remove(id) { await sb.from('seguimientos').delete().eq('id', id); },
  },
  pendientes: {
    async list() { const { data } = await sb.from('pendientes').select('*, clientes(nombre)').order('estado').order('fecha_limite', { nullsFirst: false }); return data || []; },
    async listCliente(cliente_id) { const { data } = await sb.from('pendientes').select('*').eq('cliente_id', cliente_id).order('estado').order('fecha_limite'); return data || []; },
    async listAbiertos() { const { data } = await sb.from('pendientes').select('*, clientes(nombre)').eq('estado', 'abierto').order('fecha_limite'); return data || []; },
    async insert(row) { const { data, error } = await sb.from('pendientes').insert(row).select().single(); if (error) toast(error.message); return data; },
    async update(id, row) { await sb.from('pendientes').update(row).eq('id', id); },
    async toggle(id, estadoActual) {
      const nuevo = estadoActual === 'completado' ? 'abierto' : 'completado';
      await sb.from('pendientes').update({ estado: nuevo, completado_en: nuevo === 'completado' ? fmt.hoy() : null }).eq('id', id);
      return nuevo;
    },
    async hacerGeneral(id) { await sb.from('pendientes').update({ scope: 'general', seguimiento_id: null }).eq('id', id); },
    async remove(id) { await sb.from('pendientes').delete().eq('id', id); },
  },
  settings: {
    async save(s) {
      const { data: { user } } = await sb.auth.getUser();
      const { error } = await sb.from('settings').upsert({ user_id: user.id, ...s, updated_at: new Date().toISOString() });
      if (error) toast(error.message);
      else _settings = { ..._settings, ...s };
    },
  },
};

function copConv(monto, moneda) {
  return moneda === 'USD' ? Number(monto || 0) * _settings.usd_cop_rate : Number(monto || 0);
}

// =====================================================
// ROUTER
// =====================================================
const routes = {};
function navigate(name) {
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  (routes[name] || routes.dashboard)();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
$$('.nav-item').forEach(b => b.addEventListener('click', () => navigate(b.dataset.view)));

// =====================================================
// VIEW: DASHBOARD
// =====================================================
routes.dashboard = async () => {
  view.innerHTML = '<div class="card">Cargando…</div>';
  const hoy = fmt.hoy();
  const mes = fmt.mesActual();
  const semana = fmt.semanaISO();
  const en7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const [clientes, pagosMes, segSemana, pendAbiertos, allSegs] = await Promise.all([
    db.clientes.list(),
    db.pagos.listMes(mes),
    db.seguimientos.listSemana(semana),
    db.pendientes.listAbiertos(),
    db.seguimientos.listAll(),
  ]);

  const activos = clientes.filter(c => c.estado === 'activo');
  const conSeg = new Set(segSemana.map(s => s.cliente_id));
  const faltaSeguimiento = activos.filter(c => !conSeg.has(c.id))
    .map(c => {
      const segCli = allSegs.filter(s => s.cliente_id === c.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
      const dias = segCli.length ? fmt.diasDesde(segCli[0].fecha) : fmt.diasDesde(c.fecha_inicio || c.created_at?.slice(0, 10));
      return { ...c, dias_desde: dias };
    })
    .sort((a, b) => (b.dias_desde || 999) - (a.dias_desde || 999));

  // Cobrado y pendiente del mes
  const pagadosMes = pagosMes.filter(p => p.pagado);
  const cobrado = pagadosMes.reduce((s, p) => s + copConv(p.monto, p.moneda), 0);
  const conPagoMes = new Set(pagosMes.map(p => p.cliente_id));
  const porCobrar = activos.filter(c => !conPagoMes.has(c.id) || pagosMes.find(p => p.cliente_id === c.id && !p.pagado))
    .reduce((s, c) => s + copConv(c.monto, c.moneda), 0);

  // Vencidos: cliente activo cuyo día_pago ya pasó este mes y no tiene pago marcado
  const diaHoy = new Date().getDate();
  const vencidos = activos.filter(c => {
    if (!c.dia_pago || c.dia_pago > diaHoy) return false;
    const p = pagosMes.find(pp => pp.cliente_id === c.id);
    return !p || !p.pagado;
  }).map(c => ({ ...c, dias_vencido: diaHoy - c.dia_pago + (c.dias_gracia || 0) >= 0 ? diaHoy - c.dia_pago : 0 }))
    .filter(c => c.dias_vencido > (c.dias_gracia || 0));

  // Próximos 7 días
  const proximos = activos.filter(c => {
    if (!c.dia_pago) return false;
    const diff = c.dia_pago - diaHoy;
    return diff > 0 && diff <= 7;
  }).map(c => ({ ...c, dias_falta: c.dia_pago - diaHoy }));

  // Clientes en riesgo
  const enRiesgo = clientes.filter(c => helpers.enRiesgo(c, allSegs));

  // Cumpleaños semana
  const cumples = clientes.filter(c => {
    if (!c.fecha_nacimiento) return false;
    const d = helpers.diasHastaCumple(c.fecha_nacimiento);
    return d !== null && d <= 7;
  }).sort((a, b) => helpers.diasHastaCumple(a.fecha_nacimiento) - helpers.diasHastaCumple(b.fecha_nacimiento));

  const total = cobrado + porCobrar;
  const pct = total > 0 ? Math.round((cobrado / total) * 100) : 0;

  view.innerHTML = `
    <div class="mb-6">
      <h2 class="text-2xl font-bold text-slate-900">Hola, ${_settings.nombre_coach} 👋</h2>
      <p class="text-sm text-slate-500">${new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })} · semana ${semana.split('-W')[1]} · 1 USD = COP ${_settings.usd_cop_rate.toLocaleString('es-CO')}</p>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div class="card">
        <div class="flex items-center justify-between mb-2"><span class="text-xs font-semibold text-slate-500 uppercase">Activos</span><span class="text-lg">👥</span></div>
        <div class="text-3xl font-bold">${activos.length}</div>
        <div class="text-xs text-slate-500 mt-1">${clientes.filter(c => c.estado === 'pausa').length} en pausa</div>
      </div>
      <div class="card">
        <div class="flex items-center justify-between mb-2"><span class="text-xs font-semibold text-slate-500 uppercase">Cobrado mes</span><span class="text-lg">💰</span></div>
        <div class="text-2xl font-bold text-emerald-600">${fmt.moneyCop(cobrado)}</div>
        <div class="text-xs text-slate-500 mt-1">${pagadosMes.length} pagos · ${pct}% del mes</div>
      </div>
      <div class="card">
        <div class="flex items-center justify-between mb-2"><span class="text-xs font-semibold text-slate-500 uppercase">Por cobrar</span><span class="text-lg">⏳</span></div>
        <div class="text-2xl font-bold text-amber-600">${fmt.moneyCop(porCobrar)}</div>
        <div class="text-xs text-slate-500 mt-1">${activos.length - pagadosMes.length} pendientes</div>
      </div>
      <div class="card">
        <div class="flex items-center justify-between mb-2"><span class="text-xs font-semibold text-slate-500 uppercase">En riesgo</span><span class="text-lg">⚠️</span></div>
        <div class="text-3xl font-bold text-red-600">${enRiesgo.length}</div>
        <div class="text-xs text-slate-500 mt-1">requieren atención</div>
      </div>
    </div>

    <!-- Bandeja semanal -->
    <div class="card mb-6">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 class="font-bold text-slate-900 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-emerald-500"></span>Bandeja de la semana</h3>
        <div class="text-xs text-slate-500"><strong class="text-slate-900">${activos.length - faltaSeguimiento.length}</strong> hechos · <strong class="text-amber-600">${faltaSeguimiento.length}</strong> faltan</div>
      </div>
      ${faltaSeguimiento.length === 0
        ? '<p class="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-xl">✓ ¡Todo al día! No queda nadie sin seguimiento esta semana.</p>'
        : `<div class="space-y-2">${faltaSeguimiento.slice(0, 8).map(c => `
            <div class="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl cursor-pointer" onclick="abrirNuevoSeguimiento('${c.id}')">
              ${helpers.avatar(c.nombre, 10)}
              <div class="flex-1 min-w-0">
                <div class="font-medium text-sm truncate">${c.nombre}</div>
                <div class="text-xs ${(c.dias_desde || 999) > 14 ? 'text-red-600' : 'text-slate-500'}">${c.dias_desde !== null ? `Último seguimiento hace ${c.dias_desde} días` : 'Sin seguimientos previos'}</div>
              </div>
              <button class="btn btn-primary btn-sm">Registrar</button>
            </div>
          `).join('')}
          ${faltaSeguimiento.length > 8 ? `<p class="text-xs text-slate-500 text-center pt-2">+ ${faltaSeguimiento.length - 8} más en Seguimiento</p>` : ''}
        </div>`}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">

      ${vencidos.length > 0 ? `
        <div class="card">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-slate-900 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-red-500"></span>Pagos vencidos</h3>
            <span class="tag tag-red">${vencidos.length}</span>
          </div>
          <div class="space-y-2">
            ${vencidos.map(c => `
              <div class="flex items-center justify-between p-3 bg-red-50 rounded-xl">
                <div class="flex items-center gap-3 flex-1 min-w-0">
                  ${helpers.avatar(c.nombre, 9)}
                  <div class="min-w-0">
                    <div class="font-medium text-sm truncate">${c.nombre}</div>
                    <div class="text-xs text-red-700">Día ${c.dia_pago} · ${fmt.money(c.monto, c.moneda)}</div>
                  </div>
                </div>
                <button class="btn btn-dark btn-sm" onclick="marcarPagoRapido('${c.id}')">Marcar pagado</button>
              </div>`).join('')}
          </div>
        </div>` : ''}

      ${proximos.length > 0 ? `
        <div class="card">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-slate-900 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-amber-500"></span>Próximos 7 días</h3>
            <span class="tag tag-yellow">${proximos.length}</span>
          </div>
          <div class="space-y-2">
            ${proximos.map(c => `
              <div class="flex items-center justify-between p-3 bg-amber-50 rounded-xl">
                <div class="flex items-center gap-3 flex-1 min-w-0">
                  ${helpers.avatar(c.nombre, 9)}
                  <div class="min-w-0">
                    <div class="font-medium text-sm truncate">${c.nombre}</div>
                    <div class="text-xs text-amber-700">En ${c.dias_falta} día(s) · ${fmt.money(c.monto, c.moneda)}</div>
                  </div>
                </div>
                <button class="btn btn-dark btn-sm" onclick="marcarPagoRapido('${c.id}')">Marcar</button>
              </div>`).join('')}
          </div>
        </div>` : ''}

      ${enRiesgo.length > 0 ? `
        <div class="card">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-slate-900 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-orange-500"></span>Clientes en riesgo</h3>
            <span class="tag tag-orange">${enRiesgo.length}</span>
          </div>
          <div class="space-y-2">
            ${enRiesgo.slice(0, 5).map(c => `
              <div class="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl cursor-pointer" onclick="abrirNuevoSeguimiento('${c.id}')">
                ${helpers.avatar(c.nombre, 9)}
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-sm truncate">${c.nombre}</div>
                  <div class="text-xs text-orange-700">Reactivar contacto</div>
                </div>
                <button class="btn btn-secondary btn-sm">Abrir</button>
              </div>`).join('')}
          </div>
        </div>` : ''}

      ${pendAbiertos.length > 0 ? `
        <div class="card">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-slate-900 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-violet-500"></span>Pendientes urgentes</h3>
            <span class="tag tag-violet">${pendAbiertos.length}</span>
          </div>
          <div class="space-y-2">
            ${pendAbiertos.slice(0, 5).map(p => `
              <div class="flex items-start gap-3 p-3 hover:bg-slate-50 rounded-xl">
                <input type="checkbox" class="mt-1 rounded" onchange="togglePendienteDash('${p.id}', '${p.estado}')">
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-sm">${p.descripcion}</div>
                  <div class="text-xs text-slate-500">${p.clientes?.nombre || ''} · ${p.scope === 'semana' ? '<span class="text-violet-600 font-semibold">Semanal</span>' : '<span class="text-emerald-600 font-semibold">General</span>'} ${p.fecha_limite ? '· vence ' + fmt.fechaCorta(p.fecha_limite) : ''}</div>
                </div>
                <span class="tag ${p.prioridad === 'alta' ? 'tag-red' : p.prioridad === 'baja' ? 'tag-gray' : 'tag-yellow'}">${p.prioridad}</span>
              </div>`).join('')}
          </div>
        </div>` : ''}

      ${cumples.length > 0 ? `
        <div class="card">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-slate-900 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-pink-500"></span>Cumpleaños esta semana</h3>
            <span class="tag tag-violet">${cumples.length}</span>
          </div>
          <div class="space-y-2">
            ${cumples.map(c => {
              const d = helpers.diasHastaCumple(c.fecha_nacimiento);
              return `
              <div class="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl">
                ${helpers.avatar(c.nombre, 9)}
                <div class="flex-1">
                  <div class="font-medium text-sm">${c.nombre}</div>
                  <div class="text-xs text-pink-700">🎂 ${d === 0 ? '¡Hoy!' : d === 1 ? 'Mañana' : `En ${d} días`}</div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>` : ''}

    </div>
  `;
};

window.abrirNuevoSeguimiento = async (clienteId) => {
  await abrirModalSeguimiento(clienteId, fmt.semanaISO());
};

window.togglePendienteDash = async (id, estado) => {
  await db.pendientes.toggle(id, estado);
  navigate('dashboard');
};

window.marcarPagoRapido = async (clienteId) => {
  const cliente = await db.clientes.get(clienteId);
  const mes = fmt.mesActual();
  openModal(modalShell(`Registrar pago · ${cliente.nombre}`, `
    <div class="space-y-3">
      <div class="bg-slate-50 rounded-xl p-3 text-sm">
        Mes: <strong>${fmt.mesEsLargo(mes)}</strong> · Monto sugerido: <strong>${fmt.money(cliente.monto, cliente.moneda)}</strong>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div><label>Monto</label><input id="pg-monto" type="number" step="0.01" value="${cliente.monto || ''}"></div>
        <div><label>Moneda</label>
          <select id="pg-moneda">
            <option value="COP" ${(cliente.moneda || 'COP') === 'COP' ? 'selected' : ''}>COP</option>
            <option value="USD" ${cliente.moneda === 'USD' ? 'selected' : ''}>USD</option>
          </select>
        </div>
        <div><label>Fecha del pago</label><input id="pg-fecha" type="date" value="${fmt.hoy()}"></div>
        <div><label>Método</label><input id="pg-metodo" placeholder="${cliente.metodo_pago_preferido || 'Transferencia, Nequi…'}" value="${cliente.metodo_pago_preferido || ''}"></div>
      </div>
      <div><label>Nota</label><input id="pg-nota" placeholder="(opcional)"></div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="confirmarPagoRapido('${clienteId}', '${mes}')">Guardar pago</button>
  `));
};

window.confirmarPagoRapido = async (clienteId, mes) => {
  await db.pagos.upsert({
    cliente_id: clienteId, mes, pagado: true,
    monto: Number($('#pg-monto').value) || 0,
    moneda: $('#pg-moneda').value,
    fecha_pago: $('#pg-fecha').value || fmt.hoy(),
    metodo: $('#pg-metodo').value || null,
    nota: $('#pg-nota').value || null,
  });
  closeModal();
  toast('Pago registrado');
  navigate('dashboard');
};

// =====================================================
// VIEW: SEGUIMIENTO
// =====================================================
routes.seguimiento = async () => {
  view.innerHTML = '<div class="card">Cargando…</div>';
  const [clientes, allSegs] = await Promise.all([db.clientes.list(), db.seguimientos.listAll()]);
  if (!_selectedClienteId && clientes.length) _selectedClienteId = clientes.find(c => c.estado === 'activo')?.id || clientes[0].id;

  // Calcular última semana por cliente
  const ultPorCliente = {};
  for (const s of allSegs) {
    if (!ultPorCliente[s.cliente_id] || s.fecha > ultPorCliente[s.cliente_id].fecha) ultPorCliente[s.cliente_id] = s;
  }

  view.innerHTML = `
    <div class="flex items-baseline justify-between mb-5 flex-wrap gap-3">
      <div>
        <h2 class="text-2xl font-bold text-slate-900">Seguimiento</h2>
        <p class="text-sm text-slate-500">Bitácora semanal por cliente</p>
      </div>
      <div class="flex items-center gap-3 flex-wrap">
        <div class="bg-slate-200 rounded-xl p-1 flex gap-1">
          <button class="toggle-btn ${_segView === 'focus' ? 'active' : ''}" onclick="switchSegView('focus')">Por cliente</button>
          <button class="toggle-btn ${_segView === 'board' ? 'active' : ''}" onclick="switchSegView('board')">Vista panel</button>
        </div>
        <button class="btn btn-primary" onclick="abrirNuevoSeguimiento(_selectedClienteId)">+ Nueva semana</button>
      </div>
    </div>
    <div id="seg-content"></div>
  `;

  if (_segView === 'focus') renderSegFocus(clientes, allSegs, ultPorCliente);
  else renderSegBoard(clientes, allSegs);
};

window.switchSegView = (which) => { _segView = which; routes.seguimiento(); };

function renderSegFocus(clientes, allSegs, ultPorCliente) {
  const cliente = clientes.find(c => c.id === _selectedClienteId);
  const segs = allSegs.filter(s => s.cliente_id === _selectedClienteId).sort((a, b) => b.semana.localeCompare(a.semana));
  const ordenados = clientes.slice().sort(sortByEstado);

  const sidebar = `
    <aside class="col-span-12 lg:col-span-4 card h-fit">
      <div class="relative mb-3">
        <input id="seg-buscar" class="pl-9" placeholder="Buscar cliente…" oninput="filtrarClientesSidebar(this.value)">
        <span class="absolute left-3 top-2.5 text-slate-400 text-sm">🔍</span>
      </div>
      <div id="seg-list" class="space-y-1 max-h-[600px] overflow-y-auto scrollbar-thin">
        ${ordenados.map(c => clienteSidebarItem(c, ultPorCliente[c.id])).join('')}
      </div>
    </aside>
  `;

  if (!cliente) {
    $('#seg-content').innerHTML = sidebar + '<div class="col-span-12 lg:col-span-8 card text-slate-500">Selecciona un cliente.</div>';
    return;
  }

  // Promedio últimas 4 semanas
  const prom = segs.slice(0, 4).map(helpers.promedioAdh).filter(v => v !== null);
  const promAdh = prom.length ? prom.reduce((a, b) => a + b, 0) / prom.length : null;

  // Tendencia
  let tend = '→';
  let tendColor = 'text-slate-500';
  if (segs.length >= 2) {
    const a = helpers.promedioAdh(segs[0]);
    const b = helpers.promedioAdh(segs[1]);
    if (a !== null && b !== null) {
      if (a > b + 0.3) { tend = '↗'; tendColor = 'text-emerald-600'; }
      else if (a < b - 0.3) { tend = '↘'; tendColor = 'text-red-600'; }
    }
  }

  // Sparkline
  const points = segs.slice(0, 8).reverse().map(helpers.promedioAdh).filter(v => v !== null);
  const sparkPoints = points.length >= 2 ? points.map((v, i) => `${(i / (points.length - 1)) * 100},${24 - v * 2.4}`).join(' ') : '';

  $('#seg-content').innerHTML = `
    <div class="grid grid-cols-12 gap-4">
      ${sidebar}
      <div class="col-span-12 lg:col-span-8 space-y-4">
        ${clienteHeaderCard(cliente, segs, promAdh, tend, tendColor, sparkPoints)}

        <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider px-1 pt-2">Timeline · ${segs.length} semana(s)</h4>
        <div class="space-y-3">
          ${segs.length === 0 ? '<div class="card text-sm text-slate-500 text-center py-8">Sin registros aún. <button class="text-emerald-600 font-semibold" onclick="abrirNuevoSeguimiento(\''+cliente.id+'\')">+ Crear el primero</button></div>' : segs.map(s => seguimientoCard(s)).join('')}
        </div>
      </div>
    </div>
  `;
}

function clienteSidebarItem(c, ult) {
  const dias = ult ? fmt.diasDesde(ult.fecha) : null;
  let dot = 'bg-slate-300';
  let label = 'Sin registros';
  if (ult) {
    if (dias <= 7) { dot = 'bg-emerald-500'; label = `Última: ${fmt.labelSemana(ult.semana)} · hace ${dias}d`; }
    else if (dias <= 14) { dot = 'bg-amber-500'; label = `Última: ${fmt.labelSemana(ult.semana)} · hace ${dias}d`; }
    else { dot = 'bg-red-500'; label = `Sin registro hace ${dias}d`; }
  }
  const active = c.id === _selectedClienteId;
  return `
    <button class="w-full flex items-center gap-3 p-2.5 rounded-xl ${active ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'hover:bg-slate-50'}" onclick="seleccionarCliente('${c.id}')" data-nombre="${c.nombre.toLowerCase()}">
      ${helpers.avatar(c.nombre, 10)}
      <div class="flex-1 text-left min-w-0">
        <div class="font-medium text-sm text-slate-900 truncate">${c.nombre}${c.estado !== 'activo' ? ` <span class="text-xs text-slate-400">(${c.estado})</span>` : ''}</div>
        <div class="text-xs truncate ${dias > 14 ? 'text-red-600' : 'text-slate-500'}">${label}</div>
      </div>
      <span class="w-2 h-2 rounded-full ${dot} flex-shrink-0"></span>
    </button>
  `;
}

window.filtrarClientesSidebar = (q) => {
  const ql = q.toLowerCase().trim();
  $$('#seg-list button').forEach(b => {
    b.style.display = !ql || b.dataset.nombre.includes(ql) ? '' : 'none';
  });
};

window.seleccionarCliente = (id) => { _selectedClienteId = id; routes.seguimiento(); };

function clienteHeaderCard(c, segs, promAdh, tend, tendColor, sparkPoints) {
  const edad = helpers.edadDe(c.fecha_nacimiento);
  const semanas = segs.length;
  const inicio = c.fecha_inicio ? fmt.fecha(c.fecha_inicio) : '—';

  // Últimas 8 semanas (más antiguas a la izquierda)
  const ult8 = segs.slice(0, 8).reverse();
  const labels = ult8.map(s => fmt.labelSemana(s.semana));
  const ptsEnt = ult8.map(s => s.adherencia_entreno ?? null);
  const ptsAli = ult8.map(s => s.adherencia_alimentacion ?? null);
  const ptsDes = ult8.map(s => s.adherencia_descanso ?? null);
  const hayDatos = ult8.length >= 2;

  // Promedios desglosados últimas 4 sem
  const promDim = (campo) => {
    const vals = segs.slice(0, 4).map(s => s[campo]).filter(v => v !== null && v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const pEnt = promDim('adherencia_entreno');
  const pAli = promDim('adherencia_alimentacion');
  const pDes = promDim('adherencia_descanso');

  return `
    <div class="card">
      <div class="flex items-start gap-4 flex-wrap">
        ${helpers.avatarBig(c.nombre)}
        <div class="flex-1 min-w-0">
          <h3 class="text-xl font-bold text-slate-900">${c.nombre}</h3>
          <div class="flex gap-2 mt-1 text-xs text-slate-500 flex-wrap">
            ${edad ? `<span>${edad} años</span><span>·</span>` : ''}
            ${c.ciudad ? `<span>${c.ciudad}</span><span>·</span>` : ''}
            <span>Inició ${inicio} · ${semanas} sem</span>
            <span>·</span>
            <span>${fmt.money(c.monto, c.moneda)}/mes · día ${c.dia_pago || '—'}</span>
          </div>
          ${c.objetivo ? `<p class="text-xs text-slate-600 mt-2 italic">🎯 ${c.objetivo}</p>` : ''}
          ${c.restricciones_lesiones ? `<p class="text-xs text-red-700 mt-1">⚕️ ${c.restricciones_lesiones}</p>` : ''}
          ${(c.tags && c.tags.length) ? `<div class="mt-2">${c.tags.map(t => `<span class="tag-pill">${t}</span>`).join('')}</div>` : ''}
        </div>
        <div class="text-right">
          <div class="text-xs text-slate-500">Adherencia 4 sem</div>
          <div class="text-2xl font-bold ${promAdh === null ? 'text-slate-400' : promAdh >= 7.5 ? 'text-emerald-600' : promAdh >= 5 ? 'text-amber-600' : 'text-red-600'}">${promAdh === null ? '—' : promAdh.toFixed(1)}<span class="text-sm text-slate-400">/10</span></div>
          <div class="text-xs ${tendColor} font-semibold mt-0.5">${tend}</div>
        </div>
      </div>

      ${hayDatos ? `
      <div class="mt-5 pt-5 border-t border-slate-100">
        <div class="flex items-baseline justify-between mb-2 flex-wrap gap-2">
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider">Compliance últimas 8 semanas</h4>
          <div>
            ${legendDot('#10b981', `Entreno · ${pEnt !== null ? pEnt.toFixed(1) : '—'}/10`)}
            ${legendDot('#3b82f6', `Alimentación · ${pAli !== null ? pAli.toFixed(1) : '—'}/10`)}
            ${legendDot('#8b5cf6', `Descanso · ${pDes !== null ? pDes.toFixed(1) : '—'}/10`)}
          </div>
        </div>
        ${lineChart([
          { label: 'Entreno', color: '#10b981', points: ptsEnt },
          { label: 'Alimentación', color: '#3b82f6', points: ptsAli },
          { label: 'Descanso', color: '#8b5cf6', points: ptsDes },
        ], labels, { height: 160 })}
      </div>` : ''}

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-slate-100">
        <div><div class="text-xs text-slate-500 mb-1">Estado</div><div class="font-bold">${c.estado === 'activo' ? '<span class="text-emerald-600">● Activo</span>' : c.estado === 'pausa' ? '<span class="text-orange-600">● Pausa</span>' : '<span class="text-slate-500">● Finalizado</span>'}</div></div>
        <div><div class="text-xs text-slate-500 mb-1">Canal</div><div class="font-bold capitalize">${c.canal_adquisicion || '—'}</div></div>
        <div><div class="text-xs text-slate-500 mb-1">Lugar entreno</div><div class="font-bold capitalize">${c.lugar_entreno || '—'}</div></div>
        <div><div class="text-xs text-slate-500 mb-1">Ficha</div><button class="text-emerald-600 font-semibold text-sm hover:underline" onclick="verCliente('${c.id}')">Abrir</button></div>
      </div>
    </div>
  `;
}

function seguimientoCard(s) {
  const prom = helpers.promedioAdh(s);
  const ring = prom === null ? '' : prom >= 7.5 ? 'ring-good' : prom >= 5 ? 'ring-mid' : 'ring-bad';
  const animos = { excelente: '🤩', bien: '😊', neutro: '😐', bajo: '😕', 'muy bajo': '😔' };
  const animo = animos[s.estado_animo] || '';
  const pctAsis = helpers.pctAsistencia(s);
  return `
    <div class="card card-hover ${ring} cursor-pointer" onclick="editarSeguimiento('${s.id}')">
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <span class="font-bold text-slate-900">${fmt.labelSemana(s.semana)}</span>
            <span class="text-xs text-slate-400">· ${fmt.fecha(s.fecha)}</span>
            ${pctAsis !== null ? `<span class="tag tag-blue">Entreno ${s.dias_asistidos}/${s.dias_planeados} · ${pctAsis}%</span>` : ''}
          </div>
          ${s.avances ? `<p class="text-sm text-slate-700 mb-2 whitespace-pre-line">${escapeHtml(s.avances)}</p>` : '<p class="text-sm text-slate-400 italic">Sin avances escritos</p>'}
          ${s.pendientes_semana ? `<div class="bg-amber-50 rounded-lg px-3 py-2 mt-2"><div class="text-xs font-bold text-amber-800 mb-1">Le pediste:</div><div class="text-xs text-amber-900 whitespace-pre-line">${escapeHtml(s.pendientes_semana)}</div></div>` : ''}
          ${s.notas ? `<p class="text-xs text-slate-500 mt-2 whitespace-pre-line">📝 ${escapeHtml(s.notas)}</p>` : ''}
        </div>
        <div class="flex flex-col items-end gap-1 flex-shrink-0">
          ${prom !== null ? `<span class="tag ${prom >= 7.5 ? 'tag-green' : prom >= 5 ? 'tag-yellow' : 'tag-red'}" style="font-size:0.8rem; padding: 0.25rem 0.55rem; font-weight: 700">${prom.toFixed(1)}/10</span>` : ''}
          ${animo ? `<span class="text-xs text-slate-500">${animo} ${s.estado_animo}</span>` : ''}
        </div>
      </div>
      <div class="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100 text-xs">
        <div class="text-center"><div class="text-slate-400">Entreno</div><div class="font-bold ${(s.adherencia_entreno || 0) >= 7 ? 'text-emerald-600' : (s.adherencia_entreno || 0) >= 4 ? 'text-amber-600' : 'text-red-600'}">${s.adherencia_entreno ?? '—'}/10</div></div>
        <div class="text-center"><div class="text-slate-400">Alimentación</div><div class="font-bold ${(s.adherencia_alimentacion || 0) >= 7 ? 'text-emerald-600' : (s.adherencia_alimentacion || 0) >= 4 ? 'text-amber-600' : 'text-red-600'}">${s.adherencia_alimentacion ?? '—'}/10</div></div>
        <div class="text-center"><div class="text-slate-400">Descanso</div><div class="font-bold ${(s.adherencia_descanso || 0) >= 7 ? 'text-emerald-600' : (s.adherencia_descanso || 0) >= 4 ? 'text-amber-600' : 'text-red-600'}">${s.adherencia_descanso ?? '—'}/10</div></div>
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderSegBoard(clientes, allSegs) {
  const activos = clientes.filter(c => c.estado === 'activo');
  $('#seg-content').innerHTML = `
    <div class="flex gap-4 overflow-x-auto pb-3 scrollbar-thin">
      ${activos.map(c => {
        const segs = allSegs.filter(s => s.cliente_id === c.id).sort((a, b) => b.semana.localeCompare(a.semana));
        return `
          <div class="kanban-col bg-slate-200/40 rounded-2xl p-3 space-y-2 flex-shrink-0">
            <div class="flex items-center gap-2 px-2 py-1">
              ${helpers.avatar(c.nombre, 8)}
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-sm truncate">${c.nombre}</div>
                <div class="text-xs text-slate-500">${segs.length} semana(s)</div>
              </div>
              <button class="text-emerald-600 font-bold text-lg" onclick="abrirNuevoSeguimiento('${c.id}')">+</button>
            </div>
            ${segs.slice(0, 6).map(s => {
              const prom = helpers.promedioAdh(s);
              const ring = prom === null ? '' : prom >= 7.5 ? 'ring-good' : prom >= 5 ? 'ring-mid' : 'ring-bad';
              return `
                <div class="bg-white rounded-xl p-3 ring-1 ring-slate-100 ${ring} cursor-pointer" onclick="editarSeguimiento('${s.id}')">
                  <div class="text-xs text-slate-400 mb-1">${fmt.labelSemana(s.semana)} · ${fmt.fechaCorta(s.fecha)} · ${prom !== null ? prom.toFixed(1) + '/10' : '—'}</div>
                  ${s.avances ? `<div class="text-sm text-slate-700 line-clamp-3">${escapeHtml(s.avances)}</div>` : '<div class="text-xs text-slate-400 italic">Sin avances</div>'}
                  ${s.pendientes_semana ? `<div class="bg-red-50 text-red-800 text-xs rounded px-2 py-1 mt-2 line-clamp-2">⚠ ${escapeHtml(s.pendientes_semana)}</div>` : ''}
                </div>
              `;
            }).join('')}
            ${segs.length === 0 ? '<div class="text-xs text-slate-400 text-center py-4">Sin registros</div>' : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// =====================================================
// MODAL: SEGUIMIENTO con panel contexto
// =====================================================
async function abrirModalSeguimiento(clienteId, semana, segExistente = null) {
  const [cliente, segsCliente, pendsCliente] = await Promise.all([
    db.clientes.get(clienteId),
    db.seguimientos.listCliente(clienteId),
    db.pendientes.listCliente(clienteId),
  ]);

  const semanaPrev = segsCliente.find(s => s.semana < semana);
  let s = segExistente || {};
  if (!segExistente) {
    const existing = await db.seguimientos.getByClienteSemana(clienteId, semana);
    if (existing) s = existing;
  }

  const resumen = generarResumen(cliente, segsCliente.filter(x => x.id !== s.id), pendsCliente);
  const abiertos = pendsCliente.filter(p => p.estado === 'abierto');

  const html = `
    <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
      <div class="flex items-center gap-3">
        ${helpers.avatar(cliente.nombre, 10)}
        <div>
          <h3 class="font-bold text-slate-900">${s.id ? 'Editar' : 'Nueva'} semana · ${cliente.nombre}</h3>
          <p class="text-xs text-slate-500">${fmt.labelSemana(semana)} · ${fmt.fecha(s.fecha || fmt.hoy())}</p>
        </div>
      </div>
      <button class="btn btn-ghost" onclick="closeModal()">✕</button>
    </div>

    <div class="grid grid-cols-12 flex-1 overflow-hidden">

      <!-- FORM -->
      <div class="col-span-12 lg:col-span-7 p-6 overflow-y-auto space-y-4">
        <div class="grid grid-cols-3 gap-3">
          <div><label>Entreno</label><input id="sg-ent" type="number" min="0" max="10" value="${s.adherencia_entreno ?? ''}" placeholder="0-10"></div>
          <div><label>Alimentación</label><input id="sg-ali" type="number" min="0" max="10" value="${s.adherencia_alimentacion ?? ''}" placeholder="0-10"></div>
          <div><label>Descanso</label><input id="sg-des" type="number" min="0" max="10" value="${s.adherencia_descanso ?? ''}" placeholder="0-10"></div>
        </div>

        <div class="bg-slate-50 rounded-xl p-3">
          <label>Asistencia entreno esta semana</label>
          <div class="flex items-center gap-2">
            <input id="sg-dias-as" type="number" min="0" class="w-20" value="${s.dias_asistidos ?? ''}" placeholder="3" onchange="calcPct()">
            <span class="text-sm text-slate-500">de</span>
            <input id="sg-dias-pl" type="number" min="0" class="w-20" value="${s.dias_planeados ?? ''}" placeholder="5" onchange="calcPct()">
            <span class="text-sm text-slate-500">días planeados</span>
            <span id="sg-pct" class="ml-auto font-bold text-emerald-600 text-sm"></span>
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="mb-0">Avances de la semana</label>
            <div class="flex gap-1">
              ${semanaPrev ? '<button type="button" class="btn btn-secondary btn-sm" onclick="copiarSemanaAnterior()" title="Copiar de la semana pasada">↻ Copiar S anterior</button>' : ''}
              <button type="button" class="btn btn-sm" style="background:#d1fae5;color:#065f46" onclick="aplicarPlantilla('alta')">Alta</button>
              <button type="button" class="btn btn-sm" style="background:#fef3c7;color:#92400e" onclick="aplicarPlantilla('media')">Media</button>
              <button type="button" class="btn btn-sm" style="background:#fee2e2;color:#991b1b" onclick="aplicarPlantilla('baja')">Baja</button>
            </div>
          </div>
          <textarea id="sg-avances" rows="5" placeholder="Qué pasó esta semana…">${escapeHtml(s.avances || '')}</textarea>
        </div>

        <div>
          <label>Pendientes que le pediste esta semana</label>
          <textarea id="sg-pend" rows="3" placeholder="Lo que tiene que hacer / entregar…">${escapeHtml(s.pendientes_semana || '')}</textarea>
          <p class="text-xs text-slate-500 mt-1">Si alguno se repite, lo puedes promover a "General" desde la lista de Pendientes.</p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label>Ánimo</label>
            <select id="sg-animo">
              <option value="">—</option>
              ${['excelente','bien','neutro','bajo','muy bajo'].map(o => `<option ${s.estado_animo === o ? 'selected' : ''}>${o}</option>`).join('')}
            </select>
          </div>
          <div>
            <label>Fecha del registro</label>
            <input id="sg-fecha" type="date" value="${s.fecha || fmt.hoy()}">
          </div>
        </div>

        <div>
          <label>Notas</label>
          <textarea id="sg-notas" rows="2" placeholder="Otras observaciones…">${escapeHtml(s.notas || '')}</textarea>
        </div>
      </div>

      <!-- CONTEXTO -->
      <div class="col-span-12 lg:col-span-5 bg-slate-50 p-6 overflow-y-auto border-l border-slate-200">
        <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Contexto · qué hablarle</h4>

        <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4">
          <div class="text-xs font-bold text-emerald-900 mb-1">📌 Para tener en cuenta</div>
          <p class="text-xs text-emerald-800">${resumen}</p>
        </div>

        ${abiertos.length > 0 ? `
        <div class="bg-white rounded-xl p-3 mb-3 ring-1 ring-slate-100">
          <div class="text-xs font-bold text-slate-700 mb-2">Pendientes abiertos (${abiertos.length})</div>
          <div class="space-y-1.5">
            ${abiertos.map(p => `
              <div class="flex items-start gap-2 text-xs">
                <input type="checkbox" class="mt-0.5 rounded" onchange="togglePendienteCtx('${p.id}', '${p.estado}', '${clienteId}', '${semana}')">
                <div class="flex-1">
                  <div class="text-slate-700">${escapeHtml(p.descripcion)}</div>
                  <div class="text-slate-400 text-xs">${p.scope === 'semana' ? '<span class="text-violet-600 font-semibold">Semanal</span>' : '<span class="text-emerald-600 font-semibold">General</span>'} ${p.fecha_limite ? '· vence ' + fmt.fechaCorta(p.fecha_limite) : ''}</div>
                </div>
              </div>`).join('')}
          </div>
        </div>` : '<div class="bg-white rounded-xl p-3 mb-3 ring-1 ring-slate-100 text-xs text-slate-500">Sin pendientes abiertos.</div>'}

        ${cliente.restricciones_lesiones || cliente.patologias ? `
        <div class="bg-red-50 rounded-xl p-3 mb-3 ring-1 ring-red-200">
          <div class="text-xs font-bold text-red-800 mb-1">⚕️ Cuidado físico</div>
          ${cliente.restricciones_lesiones ? `<div class="text-xs text-red-700">Lesiones: ${escapeHtml(cliente.restricciones_lesiones)}</div>` : ''}
          ${cliente.patologias ? `<div class="text-xs text-red-700">Patologías: ${escapeHtml(cliente.patologias)}</div>` : ''}
        </div>` : ''}

        <div class="text-xs font-bold text-slate-700 mb-2">Últimas semanas</div>
        <div class="space-y-2">
          ${segsCliente.filter(x => x.id !== s.id).slice(0, 3).map(s2 => {
            const prom = helpers.promedioAdh(s2);
            const ring = prom === null ? '' : prom >= 7.5 ? 'ring-good' : prom >= 5 ? 'ring-mid' : 'ring-bad';
            return `
              <div class="bg-white rounded-xl p-3 ring-1 ring-slate-100 ${ring}">
                <div class="flex justify-between mb-1">
                  <span class="text-xs font-bold text-slate-700">${fmt.labelSemana(s2.semana)} · ${fmt.fechaCorta(s2.fecha)}</span>
                  ${prom !== null ? `<span class="text-xs font-bold ${prom >= 7.5 ? 'text-emerald-600' : prom >= 5 ? 'text-amber-600' : 'text-red-600'}">${prom.toFixed(1)}/10</span>` : ''}
                </div>
                ${s2.avances ? `<p class="text-xs text-slate-600 line-clamp-3">${escapeHtml(s2.avances)}</p>` : ''}
                ${s2.pendientes_semana ? `<div class="text-xs text-red-700 mt-1 line-clamp-2">⚠ ${escapeHtml(s2.pendientes_semana)}</div>` : ''}
              </div>
            `;
          }).join('')}
          ${segsCliente.filter(x => x.id !== s.id).length === 0 ? '<div class="text-xs text-slate-500">Sin semanas previas.</div>' : ''}
        </div>
      </div>
    </div>

    <div class="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-between gap-2 sticky bottom-0">
      <div>${s.id ? `<button class="btn btn-danger" onclick="eliminarSeguimiento('${s.id}', '${clienteId}')">Eliminar</button>` : ''}</div>
      <div class="flex gap-2">
        <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="guardarSeguimiento('${clienteId}', '${semana}', ${s.id ? `'${s.id}'` : 'null'})">Guardar semana</button>
      </div>
    </div>
  `;

  openModal(html, { wide: true });
  setTimeout(calcPct, 0);
  window._segPrev = semanaPrev;
}

window.calcPct = () => {
  const a = Number($('#sg-dias-as')?.value || 0);
  const p = Number($('#sg-dias-pl')?.value || 0);
  const el = $('#sg-pct');
  if (!el) return;
  el.textContent = p > 0 ? `${Math.round((a / p) * 100)}% adherencia` : '';
};

window.copiarSemanaAnterior = () => {
  const prev = window._segPrev;
  if (!prev) return;
  if ($('#sg-avances').value && !confirm('¿Reemplazar el contenido actual?')) return;
  $('#sg-avances').value = prev.avances || '';
  $('#sg-pend').value = prev.pendientes_semana || '';
  $('#sg-dias-pl').value = prev.dias_planeados ?? '';
  toast('Avances copiados, ajústalos');
};

window.aplicarPlantilla = (nivel) => {
  const txt = PLANTILLAS[nivel];
  if (!txt) return;
  const cur = $('#sg-avances').value;
  if (cur && !confirm('¿Reemplazar el contenido actual?')) return;
  $('#sg-avances').value = txt;
};

window.guardarSeguimiento = async (cliente_id, semana, id) => {
  const row = {
    cliente_id, semana,
    fecha: $('#sg-fecha').value || fmt.hoy(),
    adherencia_entreno: $('#sg-ent').value ? Number($('#sg-ent').value) : null,
    adherencia_alimentacion: $('#sg-ali').value ? Number($('#sg-ali').value) : null,
    adherencia_descanso: $('#sg-des').value ? Number($('#sg-des').value) : null,
    dias_planeados: $('#sg-dias-pl').value ? Number($('#sg-dias-pl').value) : null,
    dias_asistidos: $('#sg-dias-as').value ? Number($('#sg-dias-as').value) : null,
    avances: $('#sg-avances').value || null,
    pendientes_semana: $('#sg-pend').value || null,
    estado_animo: $('#sg-animo').value || null,
    notas: $('#sg-notas').value || null,
    estado: 'hecho',
  };
  await db.seguimientos.upsert(row);
  closeModal();
  toast('Semana guardada');
  navigate('seguimiento');
};

window.editarSeguimiento = async (id) => {
  const s = await db.seguimientos.get(id);
  await abrirModalSeguimiento(s.cliente_id, s.semana, s);
};

window.eliminarSeguimiento = async (id, clienteId) => {
  if (!confirm('¿Eliminar esta semana?')) return;
  await db.seguimientos.remove(id);
  closeModal();
  navigate('seguimiento');
};

window.togglePendienteCtx = async (id, estado, clienteId, semana) => {
  await db.pendientes.toggle(id, estado);
  toast('Pendiente actualizado');
};

// =====================================================
// VIEW: PAGOS
// =====================================================
routes.pagos = async () => {
  view.innerHTML = '<div class="card">Cargando…</div>';
  const [clientes, pagos] = await Promise.all([db.clientes.list(), db.pagos.listAnio(_pagosYear)]);
  const meses = Array.from({ length: 12 }, (_, i) => `${_pagosYear}-${String(i + 1).padStart(2, '0')}`);
  const mesActual = fmt.mesActual();

  // Mapa cliente_id -> { mes -> pago }
  const map = {};
  for (const p of pagos) {
    map[p.cliente_id] ??= {};
    map[p.cliente_id][p.mes] = p;
  }

  // Totales — suman TODOS los pagos con monto > 0 (pagados + pendientes)
  const totalesMes = {};
  let totalAnio = 0;
  for (const mes of meses) {
    let t = 0;
    for (const c of clientes) {
      const p = map[c.id]?.[mes];
      if (p && Number(p.monto) > 0) t += copConv(p.monto, p.moneda);
    }
    totalesMes[mes] = t;
    totalAnio += t;
  }

  const mesActualNum = new Date().getMonth() + 1;
  const cobradoMes = pagos.filter(p => p.mes === mesActual && p.pagado).reduce((s, p) => s + copConv(p.monto, p.moneda), 0);
  const porCobrarMes = clientes.filter(c => c.estado === 'activo').filter(c => {
    const p = map[c.id]?.[mesActual];
    return !p || !p.pagado;
  }).reduce((s, c) => s + copConv(c.monto, c.moneda), 0);

  view.innerHTML = `
    <div class="flex items-baseline justify-between flex-wrap gap-3 mb-5">
      <div>
        <h2 class="text-2xl font-bold text-slate-900">Pagos</h2>
        <p class="text-sm text-slate-500">Estado de cobros</p>
      </div>
      <div class="flex items-center gap-3 flex-wrap">
        <div class="bg-slate-200 rounded-xl p-1 flex gap-1">
          <button class="toggle-btn ${_pagosView === 'table' ? 'active' : ''}" onclick="switchPagView('table')">Tabla anual</button>
          <button class="toggle-btn ${_pagosView === 'cards' ? 'active' : ''}" onclick="switchPagView('cards')">Cards del mes</button>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="generarMesActual()" title="Crea pagos pendientes del mes actual basado en el último monto de cada cliente">📅 Generar mes</button>
        <div class="flex items-center gap-1">
          <button class="btn btn-ghost" onclick="cambiarAnio(-1)">‹</button>
          <span class="font-semibold px-2">${_pagosYear}</span>
          <button class="btn btn-ghost" onclick="cambiarAnio(1)">›</button>
        </div>
      </div>
    </div>

    <div class="bg-gradient-to-br from-slate-900 to-slate-700 text-white rounded-2xl p-6 shadow-md mb-5">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <div class="text-xs uppercase tracking-wide text-slate-300 font-semibold">Cobrado ${fmt.mesEsLargo(mesActual)}</div>
          <div class="text-3xl font-bold mt-1">${fmt.moneyCop(cobradoMes)}</div>
        </div>
        <div>
          <div class="text-xs uppercase tracking-wide text-slate-300 font-semibold">Por cobrar este mes</div>
          <div class="text-3xl font-bold mt-1 text-amber-300">${fmt.moneyCop(porCobrarMes)}</div>
        </div>
        <div>
          <div class="text-xs uppercase tracking-wide text-slate-300 font-semibold">Acumulado año</div>
          <div class="text-3xl font-bold mt-1">${fmt.moneyCop(totalAnio)}</div>
        </div>
      </div>
    </div>

    <div id="pagos-content"></div>
  `;

  if (_pagosView === 'table') renderPagosTabla(clientes, map, meses, totalesMes, totalAnio, mesActualNum);
  else renderPagosCards(clientes, map, mesActual);
};

window.switchPagView = (which) => { _pagosView = which; routes.pagos(); };
window.cambiarAnio = (d) => { _pagosYear += d; routes.pagos(); };

window.generarMesActual = async () => {
  const mesActual = fmt.mesActual();
  if (!confirm(`¿Generar pagos pendientes para ${fmt.mesEsLargo(mesActual)}?\n\nSe creará un pago pendiente por cada cliente activo, usando el monto del último mes que pagó (o el monto de su ficha si no tiene historial).`)) return;

  const clientes = await db.clientes.list();
  const activos = clientes.filter(c => c.estado === 'activo');

  // Último pago > 0 por cliente
  const { data: ultimos } = await sb.from('pagos').select('cliente_id, monto, moneda, mes').gt('monto', 0).order('mes', { ascending: false });
  const ultPorCliente = {};
  for (const p of (ultimos || [])) {
    if (!ultPorCliente[p.cliente_id]) ultPorCliente[p.cliente_id] = p;
  }
  // Ya existentes para este mes
  const { data: existentes } = await sb.from('pagos').select('cliente_id').eq('mes', mesActual);
  const yaTienen = new Set((existentes || []).map(p => p.cliente_id));

  let creados = 0, omitidos = 0;
  for (const c of activos) {
    if (yaTienen.has(c.id)) { omitidos++; continue; }
    const ult = ultPorCliente[c.id];
    const monto = ult?.monto || Number(c.monto) || 0;
    const moneda = ult?.moneda || c.moneda || 'COP';
    if (monto <= 0) { omitidos++; continue; }
    await db.pagos.upsert({ cliente_id: c.id, mes: mesActual, pagado: false, monto, moneda });
    creados++;
  }
  toast(`✓ ${creados} pago(s) creado(s) · ${omitidos} ya tenían`, 3500);
  navigate('pagos');
};

const ORDEN_ESTADO = { activo: 0, pausa: 1, finalizado: 2 };
function sortByEstado(a, b) {
  const d = (ORDEN_ESTADO[a.estado] ?? 99) - (ORDEN_ESTADO[b.estado] ?? 99);
  return d !== 0 ? d : a.nombre.localeCompare(b.nombre, 'es');
}

function renderPagosTabla(clientes, map, meses, totalesMes, totalAnio, mesActualNum) {
  const activos = clientes.filter(c => c.estado !== 'finalizado').sort(sortByEstado);
  $('#pagos-content').innerHTML = `
    <div class="card overflow-hidden p-0">
      <div class="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-wrap gap-2">
        <h3 class="font-semibold text-slate-900">Tabla anual · ${_pagosYear}</h3>
        <div class="flex gap-2 text-xs">
          <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-emerald-100"></span><span class="text-slate-500">Pagado</span></span>
          <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-amber-100"></span><span class="text-slate-500">Pendiente</span></span>
          <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-red-100"></span><span class="text-slate-500">Vencido</span></span>
        </div>
      </div>
      <div class="overflow-x-auto scrollbar-thin">
        <table class="pay-table">
          <thead>
            <tr>
              <th style="position:sticky; left:0; background:#f8fafc; z-index:3; min-width:200px;">Cliente</th>
              <th>Estado</th>
              <th>Día</th>
              ${meses.map(m => `<th>${fmt.mesEs(m)}</th>`).join('')}
              <th>Total año</th>
            </tr>
          </thead>
          <tbody>
            ${activos.length === 0 ? `<tr><td colspan="${meses.length + 4}" class="text-center text-slate-500 py-6">Sin clientes.</td></tr>` :
              activos.map(c => {
                let totalFila = 0;
                const celdas = meses.map((m, i) => {
                  const p = map[c.id]?.[m];
                  const monthNum = i + 1;
                  const monedaCel = (p && p.moneda) || c.moneda || 'COP';
                  const fmtVal = (n) => monedaCel === 'USD' ? `$${Number(n).toFixed(0)}` : Number(n).toLocaleString('es-CO');
                  let cls, val;
                  if (p && p.pagado) {
                    cls = 'pay-paid';
                    val = fmtVal(p.monto);
                    totalFila += copConv(p.monto, p.moneda);
                  } else if (p && Number(p.monto) > 0) {
                    cls = monthNum < mesActualNum ? 'pay-overdue' : 'pay-pending';
                    val = fmtVal(p.monto);
                    totalFila += copConv(p.monto, p.moneda);
                  } else if (monthNum < mesActualNum) {
                    cls = 'pay-overdue';
                    val = '—';
                  } else if (monthNum === mesActualNum) {
                    cls = 'pay-pending';
                    val = Number(c.monto) > 0 ? fmtVal(c.monto) : '—';
                  } else {
                    cls = 'pay-future';
                    val = '—';
                  }
                  return `<td class="pay-cell ${cls}" onclick="abrirPago('${c.id}', '${m}')" title="${fmt.mesEsLargo(m)}">${val}</td>`;
                }).join('');
                return `
                  <tr>
                    <td class="name-cell" style="position:sticky; left:0; background:white; z-index:2;">
                      <a class="text-emerald-700 cursor-pointer hover:underline" onclick="verCliente('${c.id}')">${c.nombre}</a>
                      <div class="text-xs text-slate-400 font-normal">${c.moneda}</div>
                    </td>
                    <td class="px-2"><span class="status-pill ${c.estado === 'activo' ? 'status-active' : c.estado === 'pausa' ? 'status-hold' : 'status-end'}"><span class="w-1.5 h-1.5 rounded-full ${c.estado === 'activo' ? 'bg-emerald-500' : c.estado === 'pausa' ? 'bg-orange-500' : 'bg-slate-500'}"></span>${c.estado}</span></td>
                    <td class="px-2 text-center text-slate-600">${c.dia_pago || '—'}</td>
                    ${celdas}
                    <td class="total-cell">${fmt.moneyCop(totalFila).replace('COP ', '')}</td>
                  </tr>
                `;
              }).join('')}
            <tr class="bg-slate-900 text-white font-bold">
              <td style="position:sticky; left:0; background:#0f172a; z-index:2; padding:0.65rem 0.8rem;" colspan="3">Total mes (COP equivalente)</td>
              ${meses.map(m => `<td class="px-2 py-3 text-right ${totalesMes[m] === 0 ? 'text-slate-500' : ''}">${totalesMes[m] > 0 ? totalesMes[m].toLocaleString('es-CO') : '—'}</td>`).join('')}
              <td class="px-3 py-3 text-right text-emerald-300">${totalAnio.toLocaleString('es-CO')}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="px-5 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
        Click en cualquier celda para registrar o editar el pago. Conversión USD→COP a tasa ${_settings.usd_cop_rate.toLocaleString('es-CO')}.
      </div>
    </div>
  `;
}

function renderPagosCards(clientes, map, mesActual) {
  const activos = clientes.filter(c => c.estado === 'activo');
  const diaHoy = new Date().getDate();

  const cards = activos.map(c => {
    const p = map[c.id]?.[mesActual];
    let cls = 'pay-pending';
    let banner = 'bg-amber-50';
    let labelClass = 'text-amber-700';
    let label = 'Pendiente';
    let estado = 'pending';
    if (p && p.pagado) {
      cls = 'pay-paid'; banner = 'bg-emerald-50'; labelClass = 'text-emerald-700';
      label = '✓ Pagado'; estado = 'paid';
    } else if (c.dia_pago && c.dia_pago < diaHoy) {
      banner = 'bg-red-50'; labelClass = 'text-red-700';
      label = `Vencido hace ${diaHoy - c.dia_pago} días`; estado = 'overdue';
    } else if (c.dia_pago) {
      const dif = c.dia_pago - diaHoy;
      label = dif === 0 ? 'Vence hoy' : `Vence en ${dif} día(s)`;
    }
    return { c, p, banner, labelClass, label, estado };
  });

  $('#pagos-content').innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${cards.map(({ c, p, banner, labelClass, label, estado }) => `
        <div class="card card-hover overflow-hidden p-0">
          <div class="h-1.5 ${estado === 'paid' ? 'bg-emerald-500' : estado === 'overdue' ? 'bg-red-500' : 'bg-amber-500'}"></div>
          <div class="p-5">
            <div class="flex items-center gap-3 mb-4">
              ${helpers.avatar(c.nombre, 12).replace('rounded-full','rounded-2xl')}
              <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-900 truncate cursor-pointer hover:text-emerald-700" onclick="verCliente('${c.id}')">${c.nombre}</div>
                <div class="text-xs text-slate-500">Día ${c.dia_pago || '—'} · ${c.moneda}</div>
              </div>
            </div>
            <div class="${banner} rounded-xl p-3 mb-3">
              <div class="text-xs font-bold ${labelClass} uppercase tracking-wide mb-1">${label}</div>
              <div class="text-2xl font-bold text-slate-900">${fmt.money(p?.monto || c.monto, c.moneda)}</div>
              ${p && p.fecha_pago ? `<div class="text-xs text-slate-500 mt-1">${fmt.fecha(p.fecha_pago)}${p.metodo ? ' · ' + p.metodo : ''}</div>` : ''}
            </div>
            ${estado === 'paid'
              ? `<button class="btn btn-secondary w-full" onclick="abrirPago('${c.id}', '${mesActual}')">Ver / editar</button>`
              : `<button class="btn btn-dark w-full" onclick="abrirPago('${c.id}', '${mesActual}')">Marcar pagado</button>`}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

window.abrirPago = async (cliente_id, mes) => {
  const cliente = await db.clientes.get(cliente_id);
  const { data: p } = await sb.from('pagos').select('*').eq('cliente_id', cliente_id).eq('mes', mes).maybeSingle();

  // Si no hay pago previo y el cliente no tiene monto, sugerir el del último mes
  let montoSug = p?.monto ?? cliente.monto ?? '';
  let monedaSug = p?.moneda || cliente.moneda || 'COP';
  if (!p && !Number(cliente.monto)) {
    const { data: ult } = await sb.from('pagos').select('monto, moneda').eq('cliente_id', cliente_id).gt('monto', 0).order('mes', { ascending: false }).limit(1).maybeSingle();
    if (ult) { montoSug = ult.monto; monedaSug = ult.moneda; }
  }

  openModal(modalShell(`Pago · ${cliente.nombre} · ${fmt.mesEsLargo(mes)}`, `
    <div class="space-y-3">
      <div class="flex items-center gap-3 mb-2">
        <input type="checkbox" id="pg-pagado" ${p?.pagado ? 'checked' : ''} class="w-5 h-5 rounded">
        <label for="pg-pagado" class="mb-0 normal-case font-semibold cursor-pointer">Marcar como pagado</label>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div><label>Monto</label><input id="pg-monto" type="number" step="0.01" value="${montoSug || ''}"></div>
        <div><label>Moneda</label>
          <select id="pg-moneda">
            <option value="COP" ${monedaSug === 'COP' ? 'selected' : ''}>COP</option>
            <option value="USD" ${monedaSug === 'USD' ? 'selected' : ''}>USD</option>
          </select>
        </div>
      </div>
      <p class="text-xs text-slate-500">Si guardas sin marcar pagado, queda como pendiente del mes (amarillo).</p>
      <div><label>Nota</label><input id="pg-nota" value="${escapeHtml(p?.nota || '')}"></div>
    </div>
  `, `
    ${p?.id ? `<button class="btn btn-danger mr-auto" onclick="eliminarPago('${p.id}')">Eliminar</button>` : ''}
    <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="guardarPago('${cliente_id}', '${mes}')">Guardar</button>
  `));
};

window.guardarPago = async (cliente_id, mes) => {
  const pagado = $('#pg-pagado').checked;
  await db.pagos.upsert({
    cliente_id, mes, pagado,
    monto: Number($('#pg-monto').value) || 0,
    moneda: $('#pg-moneda').value,
    fecha_pago: pagado ? fmt.hoy() : null,
    nota: $('#pg-nota').value || null,
  });
  closeModal();
  toast('Guardado');
  navigate('pagos');
};

window.eliminarPago = async (id) => {
  if (!confirm('¿Eliminar este registro?')) return;
  await db.pagos.remove(id);
  closeModal();
  navigate('pagos');
};

// =====================================================
// VIEW: PENDIENTES
// =====================================================
routes.pendientes = async () => {
  view.innerHTML = '<div class="card">Cargando…</div>';
  const lista = await db.pendientes.list();

  let f = lista;
  if (_pendientesFilter === 'general') f = lista.filter(p => p.scope === 'general');
  else if (_pendientesFilter === 'semana') f = lista.filter(p => p.scope === 'semana');
  else if (_pendientesFilter === 'abiertos') f = lista.filter(p => p.estado === 'abierto');
  else if (_pendientesFilter === 'completados') f = lista.filter(p => p.estado === 'completado');

  view.innerHTML = `
    <div class="flex items-baseline justify-between flex-wrap gap-3 mb-5">
      <div>
        <h2 class="text-2xl font-bold text-slate-900">Pendientes</h2>
        <p class="text-sm text-slate-500">Tareas que les pediste a tus clientes</p>
      </div>
      <button class="btn btn-primary" onclick="nuevoPendiente()">+ Nuevo pendiente</button>
    </div>
    <div class="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-thin">
      <button class="chip ${_pendientesFilter === 'todos' ? 'active' : ''}" onclick="filtrarPend('todos')">Todos · ${lista.length}</button>
      <button class="chip ${_pendientesFilter === 'abiertos' ? 'active' : ''}" onclick="filtrarPend('abiertos')">📌 Abiertos · ${lista.filter(p => p.estado === 'abierto').length}</button>
      <button class="chip ${_pendientesFilter === 'general' ? 'active' : ''}" onclick="filtrarPend('general')">🌿 Generales · ${lista.filter(p => p.scope === 'general').length}</button>
      <button class="chip ${_pendientesFilter === 'semana' ? 'active' : ''}" onclick="filtrarPend('semana')">📅 De la semana · ${lista.filter(p => p.scope === 'semana').length}</button>
      <button class="chip ${_pendientesFilter === 'completados' ? 'active' : ''}" onclick="filtrarPend('completados')">✓ Completados · ${lista.filter(p => p.estado === 'completado').length}</button>
    </div>

    <div class="card p-0">
      ${f.length === 0 ? '<div class="text-sm text-slate-500 text-center py-8">No hay pendientes en este filtro.</div>' : `
        <div class="divide-y divide-slate-100">
          ${f.map(p => `
            <div class="flex items-center gap-3 p-4 hover:bg-slate-50">
              <input type="checkbox" ${p.estado === 'completado' ? 'checked' : ''} class="rounded" onchange="togglePendienteFromList('${p.id}', '${p.estado}')">
              ${helpers.avatar(p.clientes?.nombre || '?', 9)}
              <div class="flex-1 min-w-0">
                <div class="font-medium text-sm ${p.estado === 'completado' ? 'line-through text-slate-400' : 'text-slate-900'}">${escapeHtml(p.descripcion)}</div>
                <div class="text-xs text-slate-500 mt-0.5">
                  ${p.clientes?.nombre || ''} ·
                  ${p.scope === 'semana' ? '<span class="text-violet-600 font-semibold">Semanal</span>' : '<span class="text-emerald-600 font-semibold">📌 General</span>'}
                  ${p.fecha_limite ? ' · vence ' + fmt.fechaCorta(p.fecha_limite) : ''}
                  ${p.estado === 'completado' && p.completado_en ? ' · ✓ ' + fmt.fechaCorta(p.completado_en) : ''}
                </div>
              </div>
              <span class="tag ${p.prioridad === 'alta' ? 'tag-red' : p.prioridad === 'baja' ? 'tag-gray' : 'tag-yellow'}">${p.prioridad}</span>
              ${p.scope === 'semana' && p.estado === 'abierto' ? `<button class="btn btn-ghost btn-sm" title="Hacer general" onclick="hacerGeneral('${p.id}')">📌</button>` : ''}
              <button class="btn btn-ghost btn-sm" onclick="editarPendiente('${p.id}')">✎</button>
              <button class="btn btn-ghost btn-sm" onclick="eliminarPendiente('${p.id}')">✕</button>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;
};

window.filtrarPend = (f) => { _pendientesFilter = f; routes.pendientes(); };

window.togglePendienteFromList = async (id, estado) => {
  await db.pendientes.toggle(id, estado);
  navigate('pendientes');
};

window.hacerGeneral = async (id) => {
  await db.pendientes.hacerGeneral(id);
  toast('Promovido a general');
  navigate('pendientes');
};

window.nuevoPendiente = async (clienteId = null) => {
  const clientes = await db.clientes.list();
  const opciones = clientes.map(c => `<option value="${c.id}" ${clienteId === c.id ? 'selected' : ''}>${c.nombre}</option>`).join('');
  openModal(modalShell('Nuevo pendiente', `
    <div class="space-y-3">
      <div><label>Cliente *</label><select id="pn-cliente"><option value="">— elegir —</option>${opciones}</select></div>
      <div><label>Descripción *</label><input id="pn-desc" placeholder="Qué le pediste"></div>
      <div class="grid grid-cols-3 gap-3">
        <div><label>Tipo</label><select id="pn-scope"><option value="general">📌 General</option><option value="semana">📅 Semanal</option></select></div>
        <div><label>Prioridad</label><select id="pn-prio"><option value="baja">Baja</option><option value="media" selected>Media</option><option value="alta">Alta</option></select></div>
        <div><label>Vence</label><input id="pn-fecha" type="date"></div>
      </div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="guardarPendiente()">Guardar</button>
  `));
};

window.guardarPendiente = async () => {
  const cliente_id = $('#pn-cliente').value;
  const descripcion = $('#pn-desc').value.trim();
  if (!cliente_id || !descripcion) { toast('Faltan datos'); return; }
  await db.pendientes.insert({
    cliente_id, descripcion,
    scope: $('#pn-scope').value,
    prioridad: $('#pn-prio').value,
    fecha_limite: $('#pn-fecha').value || null,
    estado: 'abierto',
  });
  closeModal();
  toast('Guardado');
  navigate('pendientes');
};

window.editarPendiente = async (id) => {
  const { data: p } = await sb.from('pendientes').select('*').eq('id', id).single();
  const clientes = await db.clientes.list();
  const opciones = clientes.map(c => `<option value="${c.id}" ${p.cliente_id === c.id ? 'selected' : ''}>${c.nombre}</option>`).join('');
  openModal(modalShell('Editar pendiente', `
    <div class="space-y-3">
      <div><label>Cliente *</label><select id="pn-cliente">${opciones}</select></div>
      <div><label>Descripción *</label><input id="pn-desc" value="${escapeHtml(p.descripcion)}"></div>
      <div class="grid grid-cols-3 gap-3">
        <div><label>Tipo</label><select id="pn-scope"><option value="general" ${p.scope === 'general' ? 'selected' : ''}>📌 General</option><option value="semana" ${p.scope === 'semana' ? 'selected' : ''}>📅 Semanal</option></select></div>
        <div><label>Prioridad</label><select id="pn-prio">${['baja','media','alta'].map(o => `<option ${p.prioridad === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
        <div><label>Vence</label><input id="pn-fecha" type="date" value="${p.fecha_limite || ''}"></div>
      </div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="actualizarPendiente('${id}')">Guardar</button>
  `));
};

window.actualizarPendiente = async (id) => {
  await db.pendientes.update(id, {
    cliente_id: $('#pn-cliente').value,
    descripcion: $('#pn-desc').value.trim(),
    scope: $('#pn-scope').value,
    prioridad: $('#pn-prio').value,
    fecha_limite: $('#pn-fecha').value || null,
  });
  closeModal();
  toast('Actualizado');
  navigate('pendientes');
};

window.eliminarPendiente = async (id) => {
  if (!confirm('¿Eliminar?')) return;
  await db.pendientes.remove(id);
  navigate('pendientes');
};

// =====================================================
// VIEW: CLIENTES
// =====================================================
routes.clientes = async () => {
  view.innerHTML = '<div class="card">Cargando…</div>';
  const [clientes, allSegs] = await Promise.all([db.clientes.list(), db.seguimientos.listAll()]);
  const activos = clientes.filter(c => c.estado === 'activo');
  const pausa = clientes.filter(c => c.estado === 'pausa');
  const fin = clientes.filter(c => c.estado === 'finalizado');

  function calcAdh(c) {
    const segs = allSegs.filter(s => s.cliente_id === c.id).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 4);
    const prom = segs.map(helpers.promedioAdh).filter(v => v !== null);
    return prom.length ? prom.reduce((a, b) => a + b, 0) / prom.length : null;
  }

  view.innerHTML = `
    <div class="flex items-baseline justify-between flex-wrap gap-3 mb-5">
      <div>
        <h2 class="text-2xl font-bold text-slate-900">Clientes</h2>
        <p class="text-sm text-slate-500">${activos.length} activos · ${pausa.length} en pausa · ${fin.length} finalizados</p>
      </div>
      <button class="btn btn-primary" onclick="nuevoCliente()">+ Nuevo cliente</button>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${clientes.map(c => {
        const adh = calcAdh(c);
        return `
          <div class="card card-hover cursor-pointer" onclick="verCliente('${c.id}')">
            <div class="flex items-start gap-3 mb-3">
              ${helpers.avatar(c.nombre, 12).replace('rounded-full','rounded-2xl')}
              <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-900 truncate">${c.nombre}</div>
                <div class="text-xs text-slate-500 truncate">${c.telefono || c.email || '—'}</div>
              </div>
              <span class="status-pill ${c.estado === 'activo' ? 'status-active' : c.estado === 'pausa' ? 'status-hold' : 'status-end'}"><span class="w-1.5 h-1.5 rounded-full ${c.estado === 'activo' ? 'bg-emerald-500' : c.estado === 'pausa' ? 'bg-orange-500' : 'bg-slate-500'}"></span>${c.estado}</span>
            </div>
            <div class="space-y-1.5 text-sm">
              <div class="flex justify-between"><span class="text-slate-500">Mensualidad</span><span class="font-medium">${fmt.money(c.monto, c.moneda)}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Día pago</span><span class="font-medium">${c.dia_pago || '—'}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Adherencia</span><span class="font-medium ${adh === null ? 'text-slate-400' : adh >= 7.5 ? 'text-emerald-600' : adh >= 5 ? 'text-amber-600' : 'text-red-600'}">${adh === null ? '—' : adh.toFixed(1) + '/10'}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Inicio</span><span class="font-medium">${c.fecha_inicio ? fmt.fechaCorta(c.fecha_inicio) : '—'}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Canal</span><span class="font-medium capitalize">${c.canal_adquisicion || '—'}</span></div>
            </div>
            ${(c.tags && c.tags.length) ? `<div class="mt-3 pt-3 border-t border-slate-100">${c.tags.map(t => `<span class="tag-pill">${t}</span>`).join('')}</div>` : ''}
          </div>
        `;
      }).join('')}
      ${clientes.length === 0 ? '<div class="col-span-3 card text-center text-slate-500 py-10">Aún no hay clientes. <button class="text-emerald-600 font-semibold" onclick="nuevoCliente()">+ Crear el primero</button></div>' : ''}
    </div>
  `;
};

function clienteForm(c = {}) {
  return `
    <div class="space-y-4">
      <div>
        <h4 class="text-xs font-bold text-slate-500 uppercase mb-2">Identidad</h4>
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2"><label>Nombre *</label><input id="cl-nombre" value="${escapeHtml(c.nombre || '')}" required></div>
          <div><label>Teléfono</label><input id="cl-tel" value="${escapeHtml(c.telefono || '')}"></div>
          <div><label>Email</label><input id="cl-email" type="email" value="${escapeHtml(c.email || '')}"></div>
          <div><label>Fecha de nacimiento</label><input id="cl-nac" type="date" value="${c.fecha_nacimiento || ''}"></div>
          <div><label>Sexo</label>
            <select id="cl-sexo">
              <option value="">—</option>
              ${['M','F','otro'].map(o => `<option ${c.sexo === o ? 'selected' : ''}>${o}</option>`).join('')}
            </select>
          </div>
          <div><label>Ciudad</label><input id="cl-ciudad" value="${escapeHtml(c.ciudad || '')}"></div>
          <div><label>Zona horaria</label><input id="cl-tz" placeholder="GMT-5" value="${escapeHtml(c.zona_horaria || '')}"></div>
          <div><label>Profesión</label><input id="cl-prof" value="${escapeHtml(c.profesion || '')}"></div>
          <div><label>Horario laboral</label>
            <select id="cl-horario">
              <option value="">—</option>
              ${['mañana','tarde','noche','mixto'].map(o => `<option ${c.horario_laboral === o ? 'selected' : ''}>${o}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <div>
        <h4 class="text-xs font-bold text-slate-500 uppercase mb-2">Coaching</h4>
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2"><label>Objetivo (resumen corto)</label><input id="cl-obj" placeholder="Ej: bajar 5 kg, ganar masa, hábitos…" value="${escapeHtml(c.objetivo || '')}"></div>
          <div class="col-span-2"><label>Meta específica</label><textarea id="cl-meta" rows="2">${escapeHtml(c.meta_especifica || '')}</textarea></div>
          <div><label>Fecha objetivo</label><input id="cl-fobj" type="date" value="${c.fecha_objetivo || ''}"></div>
          <div><label>Lugar de entreno</label>
            <select id="cl-lugar">
              <option value="">—</option>
              ${['casa','gym','aire_libre','mixto'].map(o => `<option ${c.lugar_entreno === o ? 'selected' : ''}>${o.replace('_',' ')}</option>`).join('')}
            </select>
          </div>
          <div class="col-span-2"><label>Restricciones o lesiones</label><textarea id="cl-rest" rows="2" placeholder="Ej: hernia lumbar L4-L5, rodilla derecha…">${escapeHtml(c.restricciones_lesiones || '')}</textarea></div>
          <div class="col-span-2"><label>Patologías</label><input id="cl-pat" value="${escapeHtml(c.patologias || '')}"></div>
          <div><label>Antecedentes deportivos</label><input id="cl-ant" value="${escapeHtml(c.antecedentes_deportivos || '')}"></div>
          <div><label>Preferencias dietéticas</label><input id="cl-diet" placeholder="Vegetariano, sin gluten…" value="${escapeHtml(c.preferencias_dietetica || '')}"></div>
        </div>
      </div>

      <div>
        <h4 class="text-xs font-bold text-slate-500 uppercase mb-2">Comercial</h4>
        <div class="grid grid-cols-2 gap-3">
          <div><label>Monto mensual</label><input id="cl-monto" type="number" step="0.01" value="${c.monto || ''}"></div>
          <div><label>Moneda</label>
            <select id="cl-moneda">
              <option value="COP" ${(c.moneda || 'COP') === 'COP' ? 'selected' : ''}>COP</option>
              <option value="USD" ${c.moneda === 'USD' ? 'selected' : ''}>USD</option>
            </select>
          </div>
          <div><label>Día de pago (1-31)</label><input id="cl-dia" type="number" min="1" max="31" value="${c.dia_pago || ''}"></div>
          <div><label>Fecha inicio</label><input id="cl-inicio" type="date" value="${c.fecha_inicio || fmt.hoy()}"></div>
          <div><label>Estado</label>
            <select id="cl-estado">
              ${['activo','pausa','finalizado'].map(o => `<option value="${o}" ${(c.estado || 'activo') === o ? 'selected' : ''}>${o}</option>`).join('')}
            </select>
          </div>
          <div><label>Canal de adquisición</label>
            <select id="cl-canal">
              <option value="">—</option>
              ${['instagram','referido','web','otro'].map(o => `<option ${c.canal_adquisicion === o ? 'selected' : ''}>${o}</option>`).join('')}
            </select>
          </div>
          <div><label>Método de pago preferido</label><input id="cl-mpago" placeholder="Transferencia, Nequi…" value="${escapeHtml(c.metodo_pago_preferido || '')}"></div>
          <div><label>Días de gracia</label><input id="cl-gracia" type="number" value="${c.dias_gracia ?? 3}"></div>
        </div>
      </div>

      <div>
        <h4 class="text-xs font-bold text-slate-500 uppercase mb-2">Otros</h4>
        <div>
          <label>Tags (separa con comas)</label>
          <input id="cl-tags" placeholder="viajero, principiante, motivado…" value="${(c.tags || []).join(', ')}">
        </div>
        <div class="mt-3">
          <label>Notas generales</label>
          <textarea id="cl-notas" rows="3">${escapeHtml(c.notas || '')}</textarea>
        </div>
      </div>
    </div>
  `;
}

window.nuevoCliente = () => {
  openModal(modalShell('Nuevo cliente', clienteForm(), `
    <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="guardarCliente()">Guardar</button>
  `), { wide: true });
};

window.editarCliente = async (id) => {
  const c = await db.clientes.get(id);
  openModal(modalShell(`Editar · ${c.nombre}`, clienteForm(c), `
    <button class="btn btn-danger mr-auto" onclick="eliminarCliente('${id}')">Eliminar</button>
    <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="guardarCliente('${id}')">Guardar</button>
  `), { wide: true });
};

window.guardarCliente = async (id = null) => {
  const tagsRaw = $('#cl-tags').value;
  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
  const row = {
    nombre: $('#cl-nombre').value.trim(),
    telefono: $('#cl-tel').value.trim() || null,
    email: $('#cl-email').value.trim() || null,
    fecha_nacimiento: $('#cl-nac').value || null,
    sexo: $('#cl-sexo').value || null,
    ciudad: $('#cl-ciudad').value.trim() || null,
    zona_horaria: $('#cl-tz').value.trim() || null,
    profesion: $('#cl-prof').value.trim() || null,
    horario_laboral: $('#cl-horario').value || null,
    objetivo: $('#cl-obj').value.trim() || null,
    meta_especifica: $('#cl-meta').value.trim() || null,
    fecha_objetivo: $('#cl-fobj').value || null,
    lugar_entreno: $('#cl-lugar').value || null,
    restricciones_lesiones: $('#cl-rest').value.trim() || null,
    patologias: $('#cl-pat').value.trim() || null,
    antecedentes_deportivos: $('#cl-ant').value.trim() || null,
    preferencias_dietetica: $('#cl-diet').value.trim() || null,
    monto: Number($('#cl-monto').value) || 0,
    moneda: $('#cl-moneda').value,
    dia_pago: $('#cl-dia').value ? Number($('#cl-dia').value) : null,
    fecha_inicio: $('#cl-inicio').value || null,
    estado: $('#cl-estado').value,
    canal_adquisicion: $('#cl-canal').value || null,
    metodo_pago_preferido: $('#cl-mpago').value.trim() || null,
    dias_gracia: $('#cl-gracia').value ? Number($('#cl-gracia').value) : 3,
    tags,
    notas: $('#cl-notas').value.trim() || null,
  };
  if (!row.nombre) { toast('Falta el nombre'); return; }
  if (id) await db.clientes.update(id, row);
  else await db.clientes.insert(row);
  closeModal();
  toast('Guardado');
  navigate('clientes');
};

window.eliminarCliente = async (id) => {
  if (!confirm('¿Eliminar este cliente y todo su historial?')) return;
  await db.clientes.remove(id);
  closeModal();
  navigate('clientes');
};

window.verCliente = async (id) => {
  const [c, segs, pends, pagos] = await Promise.all([
    db.clientes.get(id),
    db.seguimientos.listCliente(id),
    db.pendientes.listCliente(id),
    sb.from('pagos').select('*').eq('cliente_id', id).order('mes', { ascending: false }),
  ]);
  const adh = segs.slice(0, 4).map(helpers.promedioAdh).filter(v => v !== null);
  const promAdh = adh.length ? adh.reduce((a, b) => a + b, 0) / adh.length : null;
  const edad = helpers.edadDe(c.fecha_nacimiento);

  openModal(modalShell(c.nombre, `
    <div class="space-y-4">
      <div class="flex gap-2 flex-wrap">
        <button class="btn btn-secondary btn-sm" onclick="editarCliente('${c.id}')">✎ Editar</button>
        <button class="btn btn-secondary btn-sm" onclick="abrirNuevoSeguimiento('${c.id}')">+ Nueva semana</button>
        <button class="btn btn-secondary btn-sm" onclick="nuevoPendiente('${c.id}')">+ Pendiente</button>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <div><span class="text-slate-500 text-xs">Estado:</span><br><strong>${c.estado}</strong></div>
        <div><span class="text-slate-500 text-xs">Mensualidad:</span><br><strong>${fmt.money(c.monto, c.moneda)}</strong></div>
        <div><span class="text-slate-500 text-xs">Día pago:</span><br><strong>${c.dia_pago || '—'}</strong></div>
        <div><span class="text-slate-500 text-xs">Adherencia 4 sem:</span><br><strong class="${promAdh === null ? '' : promAdh >= 7.5 ? 'text-emerald-600' : promAdh >= 5 ? 'text-amber-600' : 'text-red-600'}">${promAdh === null ? '—' : promAdh.toFixed(1) + '/10'}</strong></div>
        <div><span class="text-slate-500 text-xs">Inició:</span><br><strong>${c.fecha_inicio ? fmt.fecha(c.fecha_inicio) : '—'}</strong></div>
        <div><span class="text-slate-500 text-xs">Canal:</span><br><strong class="capitalize">${c.canal_adquisicion || '—'}</strong></div>
      </div>

      ${edad || c.ciudad || c.profesion ? `
        <div class="bg-slate-50 rounded-xl p-3 text-sm space-y-1">
          ${edad ? `<div><span class="text-slate-500">Edad:</span> <strong>${edad} años</strong> ${c.sexo ? `(${c.sexo})` : ''}</div>` : ''}
          ${c.ciudad ? `<div><span class="text-slate-500">Ciudad:</span> <strong>${c.ciudad}</strong> ${c.zona_horaria ? `(${c.zona_horaria})` : ''}</div>` : ''}
          ${c.profesion ? `<div><span class="text-slate-500">Profesión:</span> <strong>${c.profesion}</strong> ${c.horario_laboral ? `· ${c.horario_laboral}` : ''}</div>` : ''}
        </div>` : ''}

      ${c.objetivo || c.meta_especifica ? `
        <div class="bg-emerald-50 rounded-xl p-3 text-sm">
          <div class="text-xs font-bold text-emerald-900 mb-1">🎯 Objetivo</div>
          ${c.objetivo ? `<div class="text-emerald-800">${escapeHtml(c.objetivo)}</div>` : ''}
          ${c.meta_especifica ? `<div class="text-emerald-700 text-xs mt-1">${escapeHtml(c.meta_especifica)}${c.fecha_objetivo ? ' · para ' + fmt.fecha(c.fecha_objetivo) : ''}</div>` : ''}
        </div>` : ''}

      ${c.restricciones_lesiones || c.patologias ? `
        <div class="bg-red-50 rounded-xl p-3 text-sm">
          <div class="text-xs font-bold text-red-800 mb-1">⚕️ Cuidado físico</div>
          ${c.restricciones_lesiones ? `<div class="text-red-700">${escapeHtml(c.restricciones_lesiones)}</div>` : ''}
          ${c.patologias ? `<div class="text-red-700 text-xs mt-1">Patologías: ${escapeHtml(c.patologias)}</div>` : ''}
        </div>` : ''}

      ${c.lugar_entreno || c.preferencias_dietetica || c.antecedentes_deportivos ? `
        <div class="text-sm space-y-1">
          ${c.lugar_entreno ? `<div><span class="text-slate-500">Lugar entreno:</span> <strong class="capitalize">${c.lugar_entreno.replace('_',' ')}</strong></div>` : ''}
          ${c.preferencias_dietetica ? `<div><span class="text-slate-500">Dieta:</span> <strong>${escapeHtml(c.preferencias_dietetica)}</strong></div>` : ''}
          ${c.antecedentes_deportivos ? `<div><span class="text-slate-500">Deportes previos:</span> <strong>${escapeHtml(c.antecedentes_deportivos)}</strong></div>` : ''}
        </div>` : ''}

      ${(c.tags && c.tags.length) ? `<div>${c.tags.map(t => `<span class="tag-pill">${t}</span>`).join('')}</div>` : ''}

      <div>
        <h4 class="text-xs font-bold text-slate-500 uppercase mb-2">Pendientes (${pends.filter(p => p.estado === 'abierto').length} abiertos)</h4>
        ${pends.length === 0 ? '<p class="text-xs text-slate-500">Sin pendientes.</p>' : pends.slice(0, 6).map(p => `
          <div class="flex items-center gap-2 py-1 text-sm">
            <input type="checkbox" ${p.estado === 'completado' ? 'checked' : ''} onchange="togglePendienteFicha('${p.id}', '${p.estado}', '${c.id}')">
            <span class="${p.estado === 'completado' ? 'line-through text-slate-400' : ''}">${escapeHtml(p.descripcion)}</span>
            <span class="text-xs ${p.scope === 'general' ? 'text-emerald-600' : 'text-violet-600'} font-semibold">${p.scope === 'general' ? '📌' : '📅'}</span>
          </div>`).join('')}
      </div>

      <div>
        <h4 class="text-xs font-bold text-slate-500 uppercase mb-2">Últimas semanas (${segs.length})</h4>
        ${segs.length === 0 ? '<p class="text-xs text-slate-500">Sin registros.</p>' :
          segs.slice(0, 4).map(s => {
            const p = helpers.promedioAdh(s);
            return `<div class="border-l-2 ${p === null ? 'border-slate-200' : p >= 7.5 ? 'border-emerald-400' : p >= 5 ? 'border-amber-400' : 'border-red-400'} pl-3 py-1 mb-2">
              <div class="text-xs text-slate-500">${fmt.labelSemana(s.semana)} · ${fmt.fechaCorta(s.fecha)} · ${p !== null ? p.toFixed(1) + '/10' : '—'}</div>
              <div class="text-sm">${escapeHtml((s.avances || '').slice(0, 120))}${(s.avances || '').length > 120 ? '…' : ''}</div>
            </div>`;
          }).join('')}
      </div>

      <div>
        <h4 class="text-xs font-bold text-slate-500 uppercase mb-2">Últimos pagos</h4>
        ${(pagos.data || []).length === 0 ? '<p class="text-xs text-slate-500">Sin pagos.</p>' :
          `<table><thead><tr><th>Mes</th><th>Estado</th><th>Monto</th><th>Fecha</th></tr></thead>
          <tbody>${pagos.data.slice(0, 6).map(p => `
            <tr>
              <td>${fmt.mesEsLargo(p.mes)}</td>
              <td><span class="tag ${p.pagado ? 'tag-green' : 'tag-yellow'}">${p.pagado ? 'Pagado' : 'Pendiente'}</span></td>
              <td>${fmt.money(p.monto, p.moneda)}</td>
              <td>${p.fecha_pago ? fmt.fechaCorta(p.fecha_pago) : '—'}</td>
            </tr>`).join('')}</tbody></table>`}
      </div>

      ${c.notas ? `<div class="bg-slate-50 rounded-xl p-3 text-sm whitespace-pre-line"><div class="text-xs font-bold text-slate-500 uppercase mb-1">Notas</div>${escapeHtml(c.notas)}</div>` : ''}
    </div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>`), { wide: true });
};

window.togglePendienteFicha = async (id, estado, clienteId) => {
  await db.pendientes.toggle(id, estado);
  verCliente(clienteId);
};

// =====================================================
// VIEW: MI NEGOCIO
// =====================================================
routes.negocio = async () => {
  view.innerHTML = '<div class="card">Cargando…</div>';
  const [clientes, allSegs, pagosAnio] = await Promise.all([
    db.clientes.list(),
    db.seguimientos.listAll(),
    db.pagos.listAnio(_pagosYear),
  ]);

  const activos = clientes.filter(c => c.estado === 'activo');
  const finalizados = clientes.filter(c => c.estado === 'finalizado');
  const mesActual = fmt.mesActual();
  const mesAnt = (() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  })();

  // Cobrado mes / mes anterior
  const cobradoMesActual = pagosAnio.filter(p => p.mes === mesActual && p.pagado).reduce((s, p) => s + copConv(p.monto, p.moneda), 0);
  const cobradoMesAnterior = pagosAnio.filter(p => p.mes === mesAnt && p.pagado).reduce((s, p) => s + copConv(p.monto, p.moneda), 0);
  const cobradoAnio = pagosAnio.filter(p => p.pagado).reduce((s, p) => s + copConv(p.monto, p.moneda), 0);
  const crecMes = cobradoMesAnterior > 0 ? Math.round(((cobradoMesActual - cobradoMesAnterior) / cobradoMesAnterior) * 100) : 0;

  // Retención: clientes que pagaron en mes anterior y también en mes actual
  const pagaronAnt = new Set(pagosAnio.filter(p => p.mes === mesAnt && p.pagado).map(p => p.cliente_id));
  const pagaronAct = new Set(pagosAnio.filter(p => p.mes === mesActual && p.pagado).map(p => p.cliente_id));
  const retenidos = [...pagaronAnt].filter(id => pagaronAct.has(id)).length;
  const retencion = pagaronAnt.size > 0 ? Math.round((retenidos / pagaronAnt.size) * 100) : null;

  // LTV (de finalizados): suma de pagos por cliente / cantidad
  const ltvPorCliente = {};
  for (const p of pagosAnio.filter(p => p.pagado)) {
    ltvPorCliente[p.cliente_id] = (ltvPorCliente[p.cliente_id] || 0) + copConv(p.monto, p.moneda);
  }
  const ltvVals = finalizados.map(c => ltvPorCliente[c.id] || 0).filter(v => v > 0);
  const ltv = ltvVals.length ? ltvVals.reduce((a, b) => a + b, 0) / ltvVals.length : null;

  // Adherencia global últimas 4 sem
  const adhUltimas = allSegs.filter(s => {
    const dias = fmt.diasDesde(s.fecha);
    return dias <= 28;
  }).map(helpers.promedioAdh).filter(v => v !== null);
  const adhGlobal = adhUltimas.length ? adhUltimas.reduce((a, b) => a + b, 0) / adhUltimas.length : null;

  // Conversión por canal
  const porCanal = {};
  for (const c of clientes) {
    const ch = c.canal_adquisicion || 'sin canal';
    if (!porCanal[ch]) porCanal[ch] = { count: 0, ingreso: 0 };
    porCanal[ch].count++;
    porCanal[ch].ingreso += ltvPorCliente[c.id] || 0;
  }
  const canalesOrdenados = Object.entries(porCanal).sort((a, b) => b[1].ingreso - a[1].ingreso);

  // Plateau: clientes con 4 semanas seguidas con adherencia ±1 punto
  const plateau = activos.filter(c => {
    const segs = allSegs.filter(s => s.cliente_id === c.id).sort((a, b) => b.semana.localeCompare(a.semana)).slice(0, 4);
    if (segs.length < 4) return false;
    const proms = segs.map(helpers.promedioAdh).filter(v => v !== null);
    if (proms.length < 4) return false;
    const min = Math.min(...proms), max = Math.max(...proms);
    return (max - min) < 1.5;
  });

  // Próximos a renovar (próximos 7 días)
  const diaHoy = new Date().getDate();
  const proxRenovar = activos.filter(c => {
    if (!c.dia_pago) return false;
    const diff = c.dia_pago - diaHoy;
    return diff > 0 && diff <= 7;
  });

  // Nuevos este mes
  const nuevosMes = clientes.filter(c => c.fecha_inicio && c.fecha_inicio.slice(0, 7) === mesActual).length;

  view.innerHTML = `
    <div class="mb-5">
      <h2 class="text-2xl font-bold text-slate-900">Mi negocio</h2>
      <p class="text-sm text-slate-500">Indicadores del coaching · ${_pagosYear}</p>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div class="card">
        <div class="text-xs font-semibold text-slate-500 uppercase mb-1">Cobrado este mes</div>
        <div class="text-2xl font-bold text-emerald-600">${fmt.moneyCop(cobradoMesActual)}</div>
        <div class="text-xs mt-1 ${crecMes >= 0 ? 'text-emerald-600' : 'text-red-600'}">${crecMes >= 0 ? '+' : ''}${crecMes}% vs mes ant.</div>
      </div>
      <div class="card">
        <div class="text-xs font-semibold text-slate-500 uppercase mb-1">Acumulado año</div>
        <div class="text-2xl font-bold">${fmt.moneyCop(cobradoAnio)}</div>
        <div class="text-xs text-slate-500 mt-1">${pagosAnio.filter(p => p.pagado).length} pagos</div>
      </div>
      <div class="card">
        <div class="text-xs font-semibold text-slate-500 uppercase mb-1">Retención mensual</div>
        <div class="text-2xl font-bold ${retencion === null ? 'text-slate-400' : retencion >= 80 ? 'text-emerald-600' : retencion >= 60 ? 'text-amber-600' : 'text-red-600'}">${retencion === null ? '—' : retencion + '%'}</div>
        <div class="text-xs text-slate-500 mt-1">${retenidos} de ${pagaronAnt.size} siguen</div>
      </div>
      <div class="card">
        <div class="text-xs font-semibold text-slate-500 uppercase mb-1">Adherencia global</div>
        <div class="text-2xl font-bold ${adhGlobal === null ? 'text-slate-400' : adhGlobal >= 7.5 ? 'text-emerald-600' : adhGlobal >= 5 ? 'text-amber-600' : 'text-red-600'}">${adhGlobal === null ? '—' : adhGlobal.toFixed(1) + '/10'}</div>
        <div class="text-xs text-slate-500 mt-1">${adhUltimas.length} registros</div>
      </div>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div class="card">
        <div class="text-xs font-semibold text-slate-500 uppercase mb-1">Activos</div>
        <div class="text-3xl font-bold">${activos.length}</div>
        <div class="text-xs text-slate-500 mt-1">+${nuevosMes} este mes</div>
      </div>
      <div class="card">
        <div class="text-xs font-semibold text-slate-500 uppercase mb-1">En pausa</div>
        <div class="text-3xl font-bold text-orange-600">${clientes.filter(c => c.estado === 'pausa').length}</div>
      </div>
      <div class="card">
        <div class="text-xs font-semibold text-slate-500 uppercase mb-1">LTV promedio</div>
        <div class="text-2xl font-bold">${ltv === null ? '—' : fmt.moneyCop(ltv)}</div>
        <div class="text-xs text-slate-500 mt-1">de ${ltvVals.length} finalizados</div>
      </div>
      <div class="card">
        <div class="text-xs font-semibold text-slate-500 uppercase mb-1">Renuevan en 7d</div>
        <div class="text-3xl font-bold text-amber-600">${proxRenovar.length}</div>
        <div class="text-xs text-slate-500 mt-1">próximos pagos</div>
      </div>
    </div>

    ${(() => {
      // Compliance global últimas 8 semanas
      const sems = [];
      for (let i = 7; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i * 7);
        sems.push(fmt.semanaISO(d));
      }
      const labelsSem = sems.map(s => fmt.labelSemana(s));
      const promPorSem = (campo) => sems.map(sem => {
        const regs = allSegs.filter(s => s.semana === sem);
        const vals = regs.map(s => s[campo]).filter(v => v !== null && v !== undefined);
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      });
      const pctCumplimiento = sems.map(sem => {
        const con = new Set(allSegs.filter(s => s.semana === sem).map(s => s.cliente_id)).size;
        return activos.length > 0 ? Math.round((con / activos.length) * 100) : 0;
      });
      return `
      <div class="card mb-6">
        <div class="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <h3 class="font-bold text-slate-900">Tendencia de adherencia · 8 semanas</h3>
          <div>
            ${legendDot('#10b981', 'Entreno')}
            ${legendDot('#3b82f6', 'Alimentación')}
            ${legendDot('#8b5cf6', 'Descanso')}
          </div>
        </div>
        ${lineChart([
          { label: 'Entreno', color: '#10b981', points: promPorSem('adherencia_entreno') },
          { label: 'Alimentación', color: '#3b82f6', points: promPorSem('adherencia_alimentacion') },
          { label: 'Descanso', color: '#8b5cf6', points: promPorSem('adherencia_descanso') },
        ], labelsSem, { height: 200 })}
      </div>

      <div class="card mb-6">
        <div class="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <h3 class="font-bold text-slate-900">% de clientes con seguimiento semanal</h3>
          <span class="text-xs text-slate-500">cuántos de tus ${activos.length} activos tuvieron registro cada semana</span>
        </div>
        ${lineChart([
          { label: 'Cumplimiento', color: '#f59e0b', points: pctCumplimiento },
        ], labelsSem, { height: 180, yMax: 100 })}
      </div>
      `;
    })()}

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="card">
        <h3 class="font-bold text-slate-900 mb-4">Conversión por canal</h3>
        ${canalesOrdenados.length === 0 ? '<p class="text-sm text-slate-500">Sin datos.</p>' :
          canalesOrdenados.map(([canal, info]) => {
            const pct = clientes.length > 0 ? Math.round((info.count / clientes.length) * 100) : 0;
            return `
              <div class="mb-3">
                <div class="flex justify-between text-sm mb-1">
                  <span class="font-medium capitalize">${canal}</span>
                  <span class="text-slate-500"><strong>${info.count}</strong> clientes · ${fmt.moneyCop(info.ingreso)}</span>
                </div>
                <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div class="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full" style="width:${pct}%"></div>
                </div>
              </div>
            `;
          }).join('')}
      </div>

      ${plateau.length > 0 ? `
      <div class="card">
        <h3 class="font-bold text-slate-900 mb-4 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-amber-500"></span>Clientes en plateau (4 sem)</h3>
        <div class="space-y-2">
          ${plateau.map(c => `
            <div class="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-xl cursor-pointer" onclick="verCliente('${c.id}')">
              ${helpers.avatar(c.nombre, 9)}
              <div class="flex-1"><div class="font-medium text-sm">${c.nombre}</div></div>
              <button class="btn btn-secondary btn-sm">Ver</button>
            </div>`).join('')}
        </div>
      </div>` : ''}

      ${proxRenovar.length > 0 ? `
      <div class="card">
        <h3 class="font-bold text-slate-900 mb-4 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-emerald-500"></span>Próximos a renovar (7 días)</h3>
        <div class="space-y-2">
          ${proxRenovar.map(c => `
            <div class="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-xl">
              ${helpers.avatar(c.nombre, 9)}
              <div class="flex-1">
                <div class="font-medium text-sm">${c.nombre}</div>
                <div class="text-xs text-slate-500">Día ${c.dia_pago} · ${fmt.money(c.monto, c.moneda)}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>` : ''}
    </div>
  `;
};

// =====================================================
// VIEW: AJUSTES
// =====================================================
routes.ajustes = async () => {
  view.innerHTML = `
    <h2 class="text-2xl font-bold text-slate-900 mb-5">Ajustes</h2>

    <div class="card max-w-xl mb-4">
      <h3 class="font-bold text-slate-900 mb-4">Conversión USD → COP</h3>
      <div>
        <label>Tasa actual</label>
        <div class="flex items-center gap-2">
          <span class="text-sm text-slate-500">1 USD =</span>
          <input id="st-rate" type="number" class="w-40 font-bold" value="${_settings.usd_cop_rate}">
          <span class="text-sm text-slate-500">COP</span>
        </div>
        <p class="text-xs text-slate-500 mt-2">Se usa para sumar pagos en USD a los totales en COP.</p>
      </div>
    </div>

    <div class="card max-w-xl mb-4">
      <h3 class="font-bold text-slate-900 mb-4">Tu cuenta</h3>
      <div>
        <label>Tu nombre (para el saludo)</label>
        <input id="st-nombre" value="${escapeHtml(_settings.nombre_coach)}">
      </div>
    </div>

    <div class="flex gap-2 max-w-xl">
      <button class="btn btn-primary" onclick="guardarAjustes()">Guardar ajustes</button>
      <button class="btn btn-danger ml-auto" id="lo">Cerrar sesión</button>
    </div>
  `;
  $('#lo').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
};

window.guardarAjustes = async () => {
  await db.settings.save({
    usd_cop_rate: Number($('#st-rate').value) || 4000,
    nombre_coach: $('#st-nombre').value.trim() || 'Coach',
  });
  toast('Guardado');
};

// =====================================================
// BOOT
// =====================================================
if (!window.SUPABASE_URL || window.SUPABASE_URL.includes('TU-PROYECTO')) {
  bootScreen.innerHTML = `
    <div class="card max-w-md text-center">
      <h2 class="font-bold text-lg mb-2">⚠️ Falta configuración</h2>
      <p class="text-sm text-slate-600">Edita el archivo <code class="bg-slate-100 px-1.5 py-0.5 rounded">config.js</code> y pon ahí la URL y la "anon key" de tu proyecto Supabase.</p>
    </div>`;
} else {
  checkSession();
}
