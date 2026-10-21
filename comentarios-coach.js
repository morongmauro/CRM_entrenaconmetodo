// =====================================================
// COMENTARIO DEL COACH · por ejercicio, para el cliente
// =====================================================
// En cada ejercicio de la rutina (constructor y rutinas del cliente) va el
// botón «Comentario del coach». Abre la conversación de ESE ejercicio con ese
// cliente: lo que le escribiste y lo que él te escribió desde la app (sus
// notas al coach), en orden. Ahí mismo le escribes uno nuevo:
//
//   · «Para la próxima vez» (puntual): en la app le sale un circulito azul en
//     el ejercicio hasta que lo lee. Ves si ya lo leyó y cuándo.
//   · «Siempre presente»: queda fijo en la tarjeta del ejercicio, tranquilo,
//     sin circulito ni aviso, ciclo tras ciclo, hasta que lo quites. Hay uno
//     solo por ejercicio: escribir otro reemplaza al anterior.
//
// Va pegado al cliente y al ejercicio (no a la rutina), así que al duplicar
// el ciclo el «Siempre presente» sigue sin copiar nada.
//
// Tabla `comentarios_coach` (migraciones/comentarios-coach.sql). Quitar uno no
// lo borra: le pone la fecha `quitado_en`. Las notas del cliente son las de
// siempre (`notas_entreno`, las de la Bandeja); abrir la conversación las da
// por vistas, como «Listo» en la Bandeja.
//
// Carga DESPUÉS de entrenamiento.js.

const _cc = {
  cache: {},         // `${cliente}|${ejercicio}` → { coach: [], cliente: [] }
  sinTabla: false,
  tipo: 'puntual',   // el que está elegido en la ventana
  abierto: null,     // { cliente_id, ejercicio_id, rutina_id, rutina_ejercicio_id }
};
const ccClave = (c, e) => `${c}|${e}`;

const CC_TIPOS = {
  puntual: { corto: 'Próxima vez', largo: 'Para la próxima vez', ayuda: 'Lo ve con un circulito azul en el ejercicio. Se apaga cuando lo lee.' },
  siempre: { corto: 'Siempre', largo: 'Siempre presente', ayuda: 'Queda fijo en la tarjeta del ejercicio, sin avisos, en todos los ciclos hasta que lo quites. Reemplaza al anterior.' },
};

// Lo de varios ejercicios de un cliente, en dos consultas.
async function ccCargar(clienteId, ejercicioIds) {
  const ids = [...new Set(ejercicioIds.filter(Boolean).map(String))];
  if (!clienteId || !ids.length) return;
  const [cs, ns] = await Promise.all([
    sb.from('comentarios_coach').select('*').eq('cliente_id', String(clienteId)).in('ejercicio_id', ids).is('quitado_en', null).order('creado_en'),
    sb.from('notas_entreno').select('id, ejercicio_id, texto, created_at, leida_en').eq('cliente_id', clienteId).in('ejercicio_id', ids).order('created_at'),
  ]);
  _cc.sinTabla = !!cs.error;
  ids.forEach(id => { _cc.cache[ccClave(clienteId, id)] = { coach: [], cliente: [] }; });
  (cs.data || []).forEach(c => { const x = _cc.cache[ccClave(clienteId, c.ejercicio_id)]; if (x) x.coach.push(c); });
  (ns.data || []).forEach(n => { const x = _cc.cache[ccClave(clienteId, n.ejercicio_id)]; if (x) x.cliente.push(n); });
}

const ccDe = (clienteId, ejercicioId) => _cc.cache[ccClave(clienteId, ejercicioId)] || { coach: [], cliente: [] };
const ccSiempre = (d) => d.coach.filter(c => c.tipo === 'siempre').slice(-1)[0] || null;
const ccSinLeerCliente = (d) => d.cliente.filter(n => !n.leida_en).length;

// ── El botón y la línea «Siempre presente» de cada fila ─────────────────
// Las filas los traen vacíos (data-cc-btn / data-cc-siempre); aquí se llenan
// cuando aparecen en pantalla, con una sola lectura por rutina.
window.ccBotonHTML = (re) => {
  const e = re.ejercicios || {};
  return `<button class="btn btn-ghost btn-sm cc-btn" data-cc-btn="${escapeHtml(re.id)}" data-cc-ej="${escapeHtml(e.id || re.ejercicio_id || '')}"
    onclick="ccAbrir('${escapeHtml(re.id)}')" title="Escríbele al cliente sobre este ejercicio: para la próxima vez o siempre presente">Comentario del coach</button>`;
};
window.ccSiempreHTML = (re) => `<div class="cc-siempre-linea" data-cc-siempre="${escapeHtml(re.id)}"></div>`;

function ccPintarFilas() {
  const rut = _ent && _ent.rutina;
  if (!rut || !rut.cliente_id) return;
  document.querySelectorAll('[data-cc-btn]').forEach(b => {
    const d = ccDe(rut.cliente_id, b.dataset.ccEj);
    const n = ccSinLeerCliente(d);
    b.classList.toggle('cc-nuevo', n > 0);
    b.title = n ? `${n} ${n === 1 ? 'nota nueva' : 'notas nuevas'} del cliente en este ejercicio` : 'Escríbele al cliente sobre este ejercicio: para la próxima vez o siempre presente';
    const lin = document.querySelector(`[data-cc-siempre="${b.dataset.ccBtn}"]`);
    const s = ccSiempre(d);
    if (lin) lin.innerHTML = s ? `<span class="cc-siempre-txt">Siempre presente: ${escapeHtml(s.texto)}</span>` : '';
  });
}

let _ccT = null;
async function ccRevisarPantalla() {
  const rut = _ent && _ent.rutina;
  const btns = [...document.querySelectorAll('[data-cc-btn]:not([data-cc-listo])')];
  if (!rut || !rut.cliente_id || !btns.length) return;
  btns.forEach(b => b.setAttribute('data-cc-listo', '1'));
  const faltan = btns.map(b => b.dataset.ccEj).filter(id => !_cc.cache[ccClave(rut.cliente_id, id)]);
  if (faltan.length) await ccCargar(rut.cliente_id, faltan).catch(() => {});
  ccPintarFilas();
}
new MutationObserver(() => { clearTimeout(_ccT); _ccT = setTimeout(ccRevisarPantalla, 120); })
  .observe(document.body, { childList: true, subtree: true });

// ── La ventana ──────────────────────────────────────────────────────────
window.ccAbrir = async (reId) => {
  const rut = _ent && _ent.rutina;
  const re = rut && (rut.ejercicios || []).find(x => String(x.id) === String(reId));
  if (!re || !rut.cliente_id) return toast('Abre la rutina de un cliente para escribirle');
  const e = re.ejercicios || {};
  _cc.abierto = { cliente_id: rut.cliente_id, ejercicio_id: String(e.id || re.ejercicio_id), rutina_id: rut.id, rutina_ejercicio_id: re.id, e };
  _cc.tipo = 'puntual';
  await ccCargar(rut.cliente_id, [_cc.abierto.ejercicio_id]).catch(() => {});
  ccPintarVentana();
  // Abrir la conversación es haberlas visto (como «Listo» en la Bandeja).
  const nuevas = ccDe(rut.cliente_id, _cc.abierto.ejercicio_id).cliente.filter(n => !n.leida_en);
  if (nuevas.length) {
    const ahora = new Date().toISOString();
    await sb.from('notas_entreno').update({ leida_en: ahora }).in('id', nuevas.map(n => n.id)).then(() => {}, () => {});
    nuevas.forEach(n => { n.leida_en = ahora; });
    ccPintarFilas();
  }
};

async function ccNombreCliente(id) {
  try { const c = (typeof db !== 'undefined' && db.clientes && db.clientes.get) ? await db.clientes.get(id) : null; return c ? c.nombre : ''; } catch (e) { return ''; }
}

const ccFecha = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const hoy = new Date(); const ayer = new Date(Date.now() - 864e5);
  const hora = d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === hoy.toDateString()) return `hoy ${hora}`;
  if (d.toDateString() === ayer.toDateString()) return `ayer ${hora}`;
  return d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
};

async function ccPintarVentana() {
  const a = _cc.abierto;
  if (!a) return;
  const d = ccDe(a.cliente_id, a.ejercicio_id);
  const nombre = await ccNombreCliente(a.cliente_id);
  const primero = nombre ? nombre.split(' ')[0] : 'Cliente';
  const n = entNombres(a.e);
  const foto = typeof entMiniatura === 'function' ? entMiniatura(a.e) : '';
  const hilo = [
    ...d.coach.map(c => ({ de: 'coach', t: c.creado_en, c })),
    ...d.cliente.map(x => ({ de: 'cliente', t: x.created_at, x })),
  ].sort((p, q) => String(p.t).localeCompare(String(q.t)));
  const burbuja = (it) => it.de === 'coach' ? `
      <div class="cc-msg cc-msg-coach" data-cc-comentario="${escapeHtml(it.c.id)}" data-cc-tipo="${it.c.tipo}">
        <div><span class="cc-tag cc-tag-${it.c.tipo}">${CC_TIPOS[it.c.tipo].corto}</span> ${escapeHtml(it.c.texto)}</div>
        <div class="cc-meta">${[ccFecha(it.c.creado_en),
          it.c.tipo === 'puntual' ? (it.c.leido_en ? `<span class="cc-leido">Leído ${ccFecha(it.c.leido_en)}</span>` : 'Sin leer') : 'Fijo en la tarjeta',
          `<button type="button" class="cc-quitar" onclick="ccQuitar('${escapeHtml(it.c.id)}')">Quitar</button>`].filter(Boolean).join(' · ')}</div>
      </div>` : `
      <div class="cc-msg cc-msg-cliente" data-cc-nota="${escapeHtml(it.x.id)}">
        <div>${escapeHtml(it.x.texto)}</div>
        <div class="cc-meta">${escapeHtml(primero)} · ${ccFecha(it.x.created_at)}</div>
      </div>`;
  const cuerpo = `
    <div data-cc-ventana>
      <div class="flex items-center gap-3 mb-4">
        ${foto ? `<img src="${escapeHtml(foto)}" alt="" class="cc-foto">` : '<span class="cc-foto"></span>'}
        <div class="min-w-0">
          <div class="cc-eyebrow">Comentario del coach</div>
          <div class="font-bold text-slate-900 truncate">${escapeHtml(n.grande)}${nombre ? ` · ${escapeHtml(nombre)}` : ''}</div>
        </div>
      </div>
      ${_cc.sinTabla ? `<div class="text-xs text-slate-500 bg-slate-50 rounded-lg p-2 mb-3">Para poder enviarlos corre <code>migraciones/comentarios-coach.sql</code> en Supabase (solo crea una tabla nueva).</div>` : ''}
      <div class="cc-seg" role="radiogroup" aria-label="Tipo de comentario">
        ${Object.entries(CC_TIPOS).map(([k, t]) => `<button type="button" role="radio" aria-checked="${_cc.tipo === k}" data-cc-elegir="${k}" class="${_cc.tipo === k ? 'on' : ''}" onclick="ccElegir('${k}')">${t.largo}</button>`).join('')}
      </div>
      <div class="text-xs text-slate-500 mt-2 mb-2" data-cc-ayuda>${CC_TIPOS[_cc.tipo].ayuda}</div>
      <textarea id="cc-texto" rows="3" class="w-full" placeholder="${_cc.tipo === 'puntual' ? 'Ej.: Hoy baja a 55 kg y acorta un poco el recorrido.' : 'Ej.: Baja la barra controlada (2 s) y codos a 45°.'}"></textarea>
      <div class="flex justify-end gap-2 mt-2">
        <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" data-cc-enviar onclick="ccEnviar()">Enviar al cliente</button>
      </div>
      <div class="sec-title mt-5">Conversación de este ejercicio</div>
      ${hilo.length ? `<div class="cc-hilo">${hilo.map(burbuja).join('')}</div>`
        : `<div class="text-sm text-slate-500">Todavía no hay nada. Lo que le escribas aquí y lo que él te conteste desde la app aparece en esta conversación.</div>`}
    </div>`;
  openModal(modalShell('Comentario del coach', cuerpo));
}

window.ccElegir = (k) => {
  _cc.tipo = k;
  document.querySelectorAll('[data-cc-elegir]').forEach(b => { const on = b.dataset.ccElegir === k; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  const ay = document.querySelector('[data-cc-ayuda]'); if (ay) ay.textContent = CC_TIPOS[k].ayuda;
  const t = document.getElementById('cc-texto');
  if (t) t.placeholder = k === 'puntual' ? 'Ej.: Hoy baja a 55 kg y acorta un poco el recorrido.' : 'Ej.: Baja la barra controlada (2 s) y codos a 45°.';
};

window.ccEnviar = async () => {
  const a = _cc.abierto;
  const t = document.getElementById('cc-texto');
  const texto = String(t && t.value || '').trim().slice(0, 600);
  if (!a || !texto) return toast('Escribe el comentario');
  const ahora = new Date().toISOString();
  // Uno solo «siempre presente» por ejercicio: el anterior se quita (no se borra).
  const previo = _cc.tipo === 'siempre' ? ccSiempre(ccDe(a.cliente_id, a.ejercicio_id)) : null;
  const fila = { cliente_id: String(a.cliente_id), ejercicio_id: a.ejercicio_id, rutina_id: String(a.rutina_id || ''), rutina_ejercicio_id: String(a.rutina_ejercicio_id || ''), tipo: _cc.tipo, texto };
  const { error } = await sb.from('comentarios_coach').insert(fila);
  if (error) { toast(/does not exist|relation/.test(error.message || '') ? 'Falta correr migraciones/comentarios-coach.sql en Supabase' : error.message); return; }
  if (previo) await sb.from('comentarios_coach').update({ quitado_en: ahora }).eq('id', previo.id).then(() => {}, () => {});
  toast(_cc.tipo === 'puntual' ? 'Enviado: le saldrá el circulito en el ejercicio' : 'Listo: queda fijo en su tarjeta del ejercicio');
  await ccCargar(a.cliente_id, [a.ejercicio_id]).catch(() => {});
  ccPintarVentana(); ccPintarFilas();
};

window.ccQuitar = async (id) => {
  const a = _cc.abierto;
  if (!a || !confirm('¿Quitar este comentario? El cliente deja de verlo (queda guardado).')) return;
  const { error } = await sb.from('comentarios_coach').update({ quitado_en: new Date().toISOString() }).eq('id', id);
  if (error) return toast(error.message);
  await ccCargar(a.cliente_id, [a.ejercicio_id]).catch(() => {});
  ccPintarVentana(); ccPintarFilas();
};
