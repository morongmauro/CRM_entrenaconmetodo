// =====================================================
// CICLOS · cuándo empieza y termina el de cada cliente
// =====================================================
// En Entrenamiento, la pestaña «Ciclos»: una fila por cliente activo con su
// ciclo vigente (fechas, semana en la que va, días que le quedan), el que
// sigue, y una línea de tiempo con hoy marcado. Arriba, y también en Inicio,
// un aviso cuando hay que estar pendiente:
//   · un ciclo termina en 7 días o menos y no hay uno nuevo armado;
//   · ya terminó y no tiene ciclo nuevo;
//   · el ciclo vigente (o el que arranca en menos de 7 días) no está
//     enviado: el cliente no lo ve en su app.
//
// Solo lee. Carga DESPUÉS de entrenamiento.js (usa _ent, entVerCliente y
// evtSumarDias).
// =====================================================

const CIC_AVISO_DIAS = 7;       // «próximo a vencer»
const CIC_URGENTE_DIAS = 3;     // y ya urgente

const cicDias = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
const cicFin = (f) => evtSumarDias(f.fecha_inicio, (Number(f.semanas) || 4) * 7 - 1);
const cicFecha = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${d} ${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][m - 1]}`;
};
const cicNombre = (f) => String(f?.nombre || 'Ciclo').replace(/\bcycle\b/i, 'Ciclo');

async function cicDatos() {
  const [clis, fasesR] = await Promise.all([
    db.clientes.list(),
    sb.from('fases').select('id, cliente_id, nombre, fecha_inicio, semanas, estado, visible_cliente, orden, created_at'),
  ]);
  const activos = (clis || []).filter(c => String(c.estado || 'activo').toLowerCase() === 'activo');
  const porCli = new Map(activos.map(c => [c.id, []]));
  (fasesR.data || []).forEach(f => { if (porCli.has(f.cliente_id) && f.estado !== 'archivada') porCli.get(f.cliente_id).push(f); });
  return activos.map(c => ({ cliente: c, ...cicEstado(porCli.get(c.id) || [], fmt.hoy()) }));
}

// El estado de un cliente: qué ciclo va, cuál sigue y qué tan urgente es.
// tono: rojo (actuar ya) · ambar (esta semana) · ok · gris (sin datos).
function cicEstado(fases, hoy) {
  const conFecha = fases.filter(f => f.fecha_inicio).map(f => ({ ...f, fin: cicFin(f) }))
    .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio) || (a.orden || 0) - (b.orden || 0));
  if (!fases.length) return { tono: 'gris', orden: 5, texto: 'Sin ciclos todavía' };
  if (!conFecha.length) return { tono: 'gris', orden: 5, texto: 'Sus ciclos no tienen fecha de inicio' };

  const actuales = conFecha.filter(f => f.fecha_inicio <= hoy && f.fin >= hoy);
  const actual = actuales.length ? actuales[actuales.length - 1] : null;
  const siguiente = conFecha.find(f => f.fecha_inicio > hoy && (!actual || f.id !== actual.id)) || null;
  const ultima = [...conFecha].reverse().find(f => f.fin < hoy) || null;
  const base = { actual, siguiente, ultima, fases: conFecha };

  if (actual) {
    const quedan = cicDias(hoy, actual.fin);
    const semana = Math.min(Number(actual.semanas) || 4, Math.floor(cicDias(actual.fecha_inicio, hoy) / 7) + 1);
    const enviado = !!actual.visible_cliente;
    const r = { ...base, quedan, semana };
    const enDias = quedan === 0 ? 'hoy' : quedan === 1 ? 'mañana' : `en ${quedan} días`;
    if (!siguiente && quedan <= CIC_AVISO_DIAS) {
      return { ...r, tono: quedan <= CIC_URGENTE_DIAS ? 'rojo' : 'ambar', orden: quedan <= CIC_URGENTE_DIAS ? 0 : 2,
        texto: `Termina ${enDias} y no hay ciclo siguiente`, accion: 'Arma el siguiente' };
    }
    if (!enviado) {
      return { ...r, tono: 'rojo', orden: 1, texto: 'El ciclo que va no está enviado: no lo ve en su app', accion: 'Envíaselo' };
    }
    if (siguiente && !siguiente.visible_cliente && cicDias(hoy, siguiente.fecha_inicio) <= CIC_AVISO_DIAS) {
      return { ...r, tono: 'ambar', orden: 3, texto: `${cicNombre(siguiente)} arranca el ${cicFecha(siguiente.fecha_inicio)} y no está enviado`, accion: 'Envíaselo' };
    }
    return { ...r, tono: 'ok', orden: 4, texto: siguiente ? `Al día · después sigue ${cicNombre(siguiente)}` : `Al día · termina ${enDias}` };
  }
  if (siguiente) {
    const faltan = cicDias(hoy, siguiente.fecha_inicio);
    const sinEnviar = !siguiente.visible_cliente;
    return { ...base, faltan, tono: faltan <= CIC_AVISO_DIAS && sinEnviar ? 'ambar' : 'gris', orden: faltan <= CIC_AVISO_DIAS && sinEnviar ? 2 : 4,
      texto: `Sin ciclo ahora · ${cicNombre(siguiente)} arranca el ${cicFecha(siguiente.fecha_inicio)}${sinEnviar ? ' (sin enviar)' : ''}`,
      accion: sinEnviar ? 'Envíaselo' : null };
  }
  const hace = ultima ? cicDias(ultima.fin, hoy) : null;
  return { ...base, hace, tono: 'rojo', orden: 0,
    texto: ultima ? `Su ciclo terminó hace ${hace} ${hace === 1 ? 'día' : 'días'} y no tiene uno nuevo` : 'Sin ciclo vigente',
    accion: 'Arma el siguiente' };
}

const CIC_TONO = {
  rojo:  { punto: '#D9442B', fondo: '#FDECE8', tinta: '#A3301B' },
  ambar: { punto: '#E8A317', fondo: '#FDF4DF', tinta: '#8A5A00' },
  ok:    { punto: '#46965A', fondo: '#E9F4EC', tinta: '#2F6B3E' },
  gris:  { punto: '#A0A4AB', fondo: '#F1F2F4', tinta: '#5F6670' },
};

// El aviso de arriba (Entrenamiento e Inicio). Vacío si no hay nada.
window.cicAviso = async (idCaja) => {
  const caja = document.getElementById(idCaja);
  if (!caja) return;
  try {
    const filas = await cicDatos();
    const rojos = filas.filter(f => f.tono === 'rojo'), ambar = filas.filter(f => f.tono === 'ambar');
    if (!rojos.length && !ambar.length) { caja.innerHTML = ''; return; }
    const nombres = [...rojos, ...ambar].slice(0, 3).map(f => escapeHtml(String(f.cliente.nombre).split(' ')[0])).join(', ');
    const resto = rojos.length + ambar.length - 3;
    caja.innerHTML = `
      <button type="button" data-aviso-ciclos onclick="cicIr()" class="w-full text-left rounded-2xl border p-3 mb-4 flex items-center gap-3"
              style="background:${rojos.length ? CIC_TONO.rojo.fondo : CIC_TONO.ambar.fondo};border-color:${rojos.length ? '#F5C7BD' : '#F3DFAE'}">
        <span class="text-xl">🗓️</span>
        <span class="flex-1 min-w-0">
          <span class="block font-bold text-sm" style="color:${rojos.length ? CIC_TONO.rojo.tinta : CIC_TONO.ambar.tinta}">
            ${rojos.length + ambar.length} ${rojos.length + ambar.length === 1 ? 'ciclo necesita' : 'ciclos necesitan'} tu atención
          </span>
          <span class="block text-xs text-slate-600 truncate">${nombres}${resto > 0 ? ` y ${resto} más` : ''} · terminan pronto, ya terminaron o no están enviados</span>
        </span>
        <span class="text-xs font-bold text-slate-700 whitespace-nowrap">Ver ciclos →</span>
      </button>`;
  } catch (e) { caja.innerHTML = ''; }
};

window.cicIr = () => {
  _ent.tab = 'ciclos'; _ent.clienteId = null;
  if (typeof navigate === 'function' && _currentView !== 'entrenamiento') navigate('entrenamiento'); else routes.entrenamiento();
};

// La línea de tiempo de un cliente: 4 semanas atrás y 6 adelante, con hoy.
function cicLinea(f, hoy) {
  const desde = evtSumarDias(hoy, -28), hasta = evtSumarDias(hoy, 42), total = cicDias(desde, hasta);
  const pos = (iso) => Math.max(0, Math.min(100, (cicDias(desde, iso) / total) * 100));
  const tramos = (f.fases || []).filter(x => x.fin >= desde && x.fecha_inicio <= hasta).map(x => {
    const a = pos(x.fecha_inicio), b = pos(evtSumarDias(x.fin, 1));
    const esActual = f.actual && x.id === f.actual.id;
    const color = esActual ? '#5F6670' : x.fecha_inicio > hoy ? '#AEB3BA' : '#D3D6DB';
    return `<div title="${escapeHtml(cicNombre(x))} · ${cicFecha(x.fecha_inicio)} → ${cicFecha(x.fin)}${x.visible_cliente ? '' : ' · sin enviar'}"
      style="position:absolute;top:0;bottom:0;left:${a}%;width:${Math.max(1, b - a)}%;border-radius:6px;
             background:${x.visible_cliente ? color : `repeating-linear-gradient(135deg, ${color} 0 5px, ${color}88 5px 9px)`};
             box-shadow:inset 0 0 0 1px rgba(255,255,255,.9)"></div>`;
  }).join('');
  return `<div class="relative" style="height:12px;border-radius:6px;background:#F1F2F4" data-linea-ciclo>
      ${tramos}
      <div style="position:absolute;top:-4px;bottom:-4px;left:${pos(hoy)}%;width:2px;background:#1D1D1F;border-radius:2px" title="Hoy"></div>
    </div>`;
}

// La pestaña «Ciclos».
window.cicVista = async () => {
  const body = $('#ent-body');
  if (!body) return;
  body.innerHTML = '<div class="card text-sm text-slate-400">Leyendo los ciclos…</div>';
  const hoy = fmt.hoy();
  let filas;
  try { filas = await cicDatos(); } catch (e) { body.innerHTML = '<div class="card text-sm text-slate-500">No pude leer las fases.</div>'; return; }
  filas.sort((a, b) => a.orden - b.orden || (a.quedan ?? 999) - (b.quedan ?? 999) || String(a.cliente.nombre).localeCompare(String(b.cliente.nombre)));
  const cuenta = (t) => filas.filter(f => f.tono === t).length;
  const chip = (t, n, txt) => `<span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold" style="background:${CIC_TONO[t].fondo};color:${CIC_TONO[t].tinta}">
      <i style="width:8px;height:8px;border-radius:99px;background:${CIC_TONO[t].punto}"></i>${n} ${txt}</span>`;

  body.innerHTML = `
    <div class="card mb-3">
      <div class="flex flex-wrap items-center gap-2 justify-between">
        <div>
          <div class="font-bold text-slate-900">Ciclos de tus clientes</div>
          <div class="text-xs text-slate-500">Cuándo empieza y termina el de cada uno. Te aviso cuando le quedan ${CIC_AVISO_DIAS} días o menos y no hay uno nuevo, o cuando no está enviado.</div>
        </div>
        <div class="flex flex-wrap gap-1.5">
          ${chip('rojo', cuenta('rojo'), 'actuar ya')}${chip('ambar', cuenta('ambar'), 'esta semana')}${chip('ok', cuenta('ok'), 'al día')}
        </div>
      </div>
      <div class="flex items-center gap-4 text-[11px] text-slate-500 mt-3">
        <span class="inline-flex items-center gap-1"><i style="width:18px;height:8px;border-radius:4px;background:#5F6670"></i>ciclo que va</span>
        <span class="inline-flex items-center gap-1"><i style="width:18px;height:8px;border-radius:4px;background:#AEB3BA"></i>el que sigue</span>
        <span class="inline-flex items-center gap-1"><i style="width:18px;height:8px;border-radius:4px;background:repeating-linear-gradient(135deg,#AEB3BA 0 5px,#AEB3BA88 5px 9px)"></i>sin enviar</span>
        <span class="inline-flex items-center gap-1"><i style="width:2px;height:12px;background:#1D1D1F"></i>hoy</span>
      </div>
    </div>
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-2" data-lista-ciclos>
      ${filas.map(f => {
        const t = CIC_TONO[f.tono];
        const a = f.actual;
        const pct = a ? Math.round(Math.min(100, Math.max(0, (cicDias(a.fecha_inicio, hoy) + 1) / ((Number(a.semanas) || 4) * 7) * 100))) : null;
        return `
        <button type="button" class="card card-hover text-left w-full" style="padding:14px 16px" data-ciclo-cliente="${f.cliente.id}" data-tono="${f.tono}"
                onclick="_ent.tab='clientes'; entVerCliente('${f.cliente.id}'); routes.entrenamiento()">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="font-bold text-slate-900 truncate">${escapeHtml(f.cliente.nombre)}</div>
              <div class="text-xs text-slate-500 mt-0.5">
                ${a ? `<b class="text-slate-700">${escapeHtml(cicNombre(a))}</b> · ${cicFecha(a.fecha_inicio)} → ${cicFecha(a.fin)} · semana ${f.semana} de ${Number(a.semanas) || 4}`
                    : f.ultima ? `Último: ${escapeHtml(cicNombre(f.ultima))} · terminó el ${cicFecha(f.ultima.fin)}` : 'Sin ciclo vigente'}
              </div>
            </div>
            <div class="text-right flex-shrink-0">
              ${a ? `<div class="text-lg font-extrabold leading-none" style="color:${f.tono === 'ok' ? '#1D1D1F' : t.tinta}">${f.quedan}</div>
                     <div class="text-[10px] text-slate-500">${f.quedan === 1 ? 'día queda' : 'días quedan'}</div>` : ''}
            </div>
          </div>
          ${a ? `<div class="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div class="h-full rounded-full" style="width:${pct}%;background:${t.punto}"></div></div>` : ''}
          <div class="mt-2">${cicLinea(f, hoy)}</div>
          <div class="mt-2 flex items-center justify-between gap-2">
            <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold" style="background:${t.fondo};color:${t.tinta}">
              <i style="width:7px;height:7px;border-radius:99px;background:${t.punto}"></i>${escapeHtml(f.texto)}</span>
            ${f.siguiente ? `<span class="text-[11px] text-slate-500 whitespace-nowrap">Sigue: ${escapeHtml(cicNombre(f.siguiente))} · ${cicFecha(f.siguiente.fecha_inicio)}${f.siguiente.visible_cliente ? ' ✓' : ''}</span>`
              : f.accion ? `<span class="text-[11px] font-bold text-slate-700 whitespace-nowrap">${f.accion} →</span>` : ''}
          </div>
        </button>`;
      }).join('') || '<div class="card text-center text-slate-500 py-8">No hay clientes activos.</div>'}
    </div>`;
};

// Si Inicio ya se pintó antes de que cargara este archivo (pasa al abrir el
// CRM), el aviso se pinta ahora.
if (document.getElementById('cic-aviso-inicio')) cicAviso('cic-aviso-inicio');
