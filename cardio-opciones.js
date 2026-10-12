// =====================================================
// CARDIO A ELEGIR · «caminadora trotando o con inclinación o bicicleta»
// =====================================================
// En «Actividad», el coach puede dejar VARIAS opciones y el cliente hace
// UNA, la que prefiera. Con tiempos sugeridos (10, 15, 20, 25 o 30 min) y la
// intensidad («moderada: puedes hablar, pero te cuesta cantar»).
//
// Se guarda en `eventos.opciones` (carga/migracion-cardio-opciones.sql):
//   { lista: ['Caminadora trotando', …], minutos: [10, 15, …], intensidad: 'moderada' }
// Sin la columna, lo mismo se escribe en el detalle, en palabras, para que
// el cliente lo lea igual.

const CO_SQL = 'carga/migracion-cardio-opciones.sql';
const CO_OPCIONES = ['Caminadora trotando', 'Caminadora caminando con inclinación', 'Bicicleta', 'Elíptica', 'Escaladora', 'Caminata al aire libre'];
const CO_MINUTOS = [10, 15, 20, 25, 30, 35, 40, 45];
const CO_INTENSIDAD = [['suave', 'Suave'], ['moderada', 'Moderada'], ['alta', 'Alta']];
const CO_TITULOS = ['Cardio después de entrenar', 'Cardio en ayunas', 'Cardio suave'];
const _co = { lista: [], minutos: [], intensidad: 'moderada', on: false, hay: null };

// ¿Existe la columna? Se pregunta una vez.
async function coInstalado() {
  if (_co.hay !== null) return _co.hay;
  try { const { error } = await sb.from('eventos').select('opciones').limit(1); _co.hay = !error; }
  catch (e) { _co.hay = false; }
  return _co.hay;
}

// «Caminadora trotando o bicicleta · 10, 15 o 20 min · ritmo moderado».
function coTexto(o) {
  if (!o || !(o.lista || []).length) return '';
  const l = o.lista, m = (o.minutos || []).slice().sort((a, b) => a - b);
  const min = m.length ? (m.length === 1 ? `${m[0]} min` : `${m.slice(0, -1).join(', ')} o ${m[m.length - 1]} min`) : '';
  const int = o.intensidad === 'moderada' ? 'ritmo moderado' : o.intensidad ? `intensidad ${o.intensidad}` : '';
  return [`Elige una: ${l.join(' o ')}`, min, int].filter(Boolean).join(' · ');
}

// La sección dentro del editor del evento (solo para «Actividad»).
function coHtml(e) {
  const o = e && e.opciones && (e.opciones.lista || []).length ? e.opciones : null;
  _co.on = !!o;
  _co.lista = o ? [...o.lista] : [];
  _co.minutos = o ? [...(o.minutos || [])] : [];
  _co.intensidad = o ? (o.intensidad || 'moderada') : 'moderada';
  setTimeout(() => { coInstalado().then(coPintar); }, 0);
  return `<div id="ev-cardio-opciones" class="mb-3 rounded-xl p-3 ${(e?.tipo || 'actividad') === 'actividad' ? '' : 'hidden'}" style="background:#f8fafc;border:1px solid #e2e8f0"></div>`;
}

function coPintar() {
  const caja = document.getElementById('ev-cardio-opciones');
  if (!caja) return;
  const chip = (activo, txt, onclick, attrs = '') => `<button type="button" class="chip ${activo ? 'active' : ''}" ${attrs} onclick="${onclick}">${escapeHtml(txt)}</button>`;
  const extra = _co.lista.filter(x => !CO_OPCIONES.includes(x));
  caja.innerHTML = `
    <label class="flex items-start gap-2 cursor-pointer" style="font-weight:600">
      <input type="checkbox" id="co-on" ${_co.on ? 'checked' : ''} onchange="coActivar(this.checked)" style="margin-top:3px;width:auto">
      <span>Varias opciones · el cliente elige una
        <span class="block text-xs font-normal text-slate-500">Por ejemplo «Cardio después de entrenar»: caminadora trotando <b>o</b> caminando con inclinación <b>o</b> bicicleta.</span></span>
    </label>
    ${!_co.on ? '' : `
      ${_co.hay === false ? `<div class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mt-2">Falta correr <code>${CO_SQL}</code>: mientras tanto se guarda en el detalle, en palabras, y el cliente lo lee igual.</div>` : ''}
      <div class="text-[11px] font-semibold text-slate-500 mt-3 mb-1">Título</div>
      <div class="flex flex-wrap gap-1.5">${CO_TITULOS.map(t => chip(($('#ev-titulo')?.value || '') === t, t, `coTitulo(this.textContent)`, 'data-co-titulo')).join('')}</div>
      <div class="text-[11px] font-semibold text-slate-500 mt-3 mb-1">Opciones (marca las que valgan)</div>
      <div class="flex flex-wrap gap-1.5">
        ${[...CO_OPCIONES, ...extra].map(x => chip(_co.lista.includes(x), x, `coOpcion(this.dataset.v)`, `data-co-opcion data-v="${escapeHtml(x)}"`)).join('')}
      </div>
      <div class="flex gap-2 mt-2">
        <input id="co-otra" placeholder="Otra opción (p. ej. Remo)" class="flex-1 min-w-0 text-sm" onkeydown="if (event.key === 'Enter') { event.preventDefault(); coOtra(); }">
        <button type="button" class="btn btn-ghost btn-sm" onclick="coOtra()">+ Añadir</button>
      </div>
      <div class="text-[11px] font-semibold text-slate-500 mt-3 mb-1">Tiempo sugerido (puedes marcar varios)</div>
      <div class="flex flex-wrap gap-1.5">${CO_MINUTOS.map(m => chip(_co.minutos.includes(m), `${m} min`, `coMinuto(${m})`, `data-co-min="${m}"`)).join('')}</div>
      <div class="text-[11px] font-semibold text-slate-500 mt-3 mb-1">Intensidad</div>
      <div class="flex flex-wrap gap-1.5">${CO_INTENSIDAD.map(([v, t]) => chip(_co.intensidad === v, t, `coIntensidad('${v}')`, `data-co-int="${v}"`)).join('')}</div>
      <div class="text-xs text-slate-600 mt-3" data-co-vista>${_co.lista.length ? `El cliente verá: <b>${escapeHtml(coTexto(_co))}</b>` : 'Marca al menos dos opciones.'}</div>`}`;
}

window.coActivar = (on) => {
  _co.on = !!on;
  if (_co.on && !_co.lista.length) { _co.lista = CO_OPCIONES.slice(0, 3); _co.minutos = [10, 15, 20, 25, 30]; }
  if (_co.on && !($('#ev-titulo')?.value || '').trim()) $('#ev-titulo').value = CO_TITULOS[0];
  coPintar();
};
window.coTitulo = (t) => { const i = $('#ev-titulo'); if (i) i.value = String(t).trim(); coPintar(); };
window.coOpcion = (v) => { _co.lista = _co.lista.includes(v) ? _co.lista.filter(x => x !== v) : [..._co.lista, v]; coPintar(); };
window.coOtra = () => {
  const v = ($('#co-otra')?.value || '').trim().slice(0, 60);
  if (v && !_co.lista.includes(v)) _co.lista.push(v);
  coPintar();
};
window.coMinuto = (m) => { _co.minutos = _co.minutos.includes(m) ? _co.minutos.filter(x => x !== m) : [..._co.minutos, m].sort((a, b) => a - b); coPintar(); };
window.coIntensidad = (v) => { _co.intensidad = v; coPintar(); };

// Lo que se suma a la fila al guardar. Sin la columna, va al detalle.
async function coLeer(row) {
  if (!document.getElementById('ev-cardio-opciones') || (row && row.tipo !== 'actividad')) return {};
  const hay = await coInstalado();
  const o = _co.on && _co.lista.length ? { lista: _co.lista.slice(0, 6), minutos: _co.minutos.slice(), intensidad: _co.intensidad || null } : null;
  if (hay) return { opciones: o, ...(o && !row.duracion_min && o.minutos.length ? { duracion_min: o.minutos[Math.floor((o.minutos.length - 1) / 2)] } : {}) };
  if (!o) return {};
  const texto = coTexto(o);
  const det = String(row.detalle || '');
  return { detalle: det.includes('Elige una:') ? det.replace(/Elige una:[^\n]*/, texto) : [texto, det].filter(Boolean).join('\n') };
}

// Para las copias (otro día, otro ciclo): la lista va con el evento si existe.
const coCopia = (ev) => (ev && Object.prototype.hasOwnProperty.call(ev, 'opciones') ? { opciones: ev.opciones ?? null } : {});
