// =====================================================
// EQUIPO · una sola lista de clientes, con vistas
// =====================================================
// Antes había tres listas de clientes, una fila por cliente cada una:
// Cartera (estado y por qué), Listado (ángulos: tiempo, cumplimiento, ciclo,
// pago…) y Enganche (uso de la app). Ahora es una sola sección, «Equipo», con
// las tres como vistas arriba:
//   · Estado         → lo de Cartera
//   · Ángulos        → lo de Listado
//   · Uso de la app  → lo de Enganche
// «Clientes» queda para dar de alta y editar datos.
//
// No se reescribe ninguna de las tres: se usan tal cual (sus filtros, el 1 a
// 1 de Enganche…) y aquí solo se pone la barra de vistas encima. Las rutas
// viejas (cartera, listado, enganche) llevan a Equipo en su vista.
//
// Carga DESPUÉS de listado.js, enganche.js y crm-prueba.js.
// =====================================================

const EQ_VISTAS = [
  ['estado', 'Estado', 'cartera', 'Cómo va cada uno y por qué, y lo que toca.'],
  ['angulos', 'Ángulos', 'listado', 'Ordénalos por el ángulo que quieras: cumplimiento, ciclo, pago, meta, composición…'],
  ['app', 'Uso de la app', 'enganche', 'Quién usa la app, qué usa y quién se está enfriando.'],
];
const _eq = { vista: 'estado', orig: {} };
try { const v = localStorage.getItem('crm:equipoVista'); if (EQ_VISTAS.some(x => x[0] === v)) _eq.vista = v; } catch (e) { /* sin almacenamiento */ }

EQ_VISTAS.forEach(([, , ruta]) => { if (routes[ruta]) _eq.orig[ruta] = routes[ruta]; });

routes.equipo = async () => {
  const v = EQ_VISTAS.find(x => x[0] === _eq.vista) || EQ_VISTAS[0];
  const fn = _eq.orig[v[2]];
  if (fn) await fn();
  eqBarra();
};
// Las rutas viejas: a Equipo, en su vista (los filtros de cada una las llaman).
EQ_VISTAS.forEach(([k, , ruta]) => {
  if (!_eq.orig[ruta]) return;
  routes[ruta] = async () => {
    _eq.vista = k;
    if (_currentView !== 'equipo') {
      _currentView = 'equipo';
      document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === 'equipo'));
    }
    return routes.equipo();
  };
});

window.eqVer = (k) => {
  _eq.vista = k;
  try { localStorage.setItem('crm:equipoVista', k); } catch (e) { /* sin almacenamiento */ }
  if (k === 'app' && typeof _eng !== 'undefined') { _eng.abierto = null; }
  routes.equipo();
};

// La barra de vistas, arriba. Cada vista repinta la pantalla entera cuando
// cambias un filtro: por eso se vuelve a poner cada vez que cambia.
function eqBarra() {
  if (_currentView !== 'equipo' || !view) return;
  const v = EQ_VISTAS.find(x => x[0] === _eq.vista) || EQ_VISTAS[0];
  let b = view.querySelector(':scope > [data-eq-barra]');
  if (!b) {
    b = document.createElement('div');
    b.dataset.eqBarra = '';
    view.prepend(b);
  }
  const html = `<h2 class="text-2xl font-bold text-slate-900">Equipo</h2>
    <p class="text-sm text-slate-500">${v[3]}</p>
    <div class="eq-tabs">${EQ_VISTAS.map(([k, t]) => `<button type="button" class="eq-tab${k === _eq.vista ? ' on' : ''}" data-eq-vista="${k}" onclick="eqVer('${k}')">${t}</button>`).join('')}</div>`;
  if (b.innerHTML !== html) b.innerHTML = html;
  // El título de cada vista vieja sobra (ya dice «Equipo»).
  view.querySelectorAll('h2').forEach(h => { if (/^(Cartera|Listado|Enganche)$/.test(h.textContent.trim())) { h.style.display = 'none'; const p = h.nextElementSibling; if (p && p.tagName === 'P') p.style.display = 'none'; } });
}
(function () {
  const raiz = typeof VIEW_ROOT !== 'undefined' ? VIEW_ROOT : document.getElementById('view');
  if (raiz && 'MutationObserver' in window) {
    new MutationObserver(() => { if (_currentView === 'equipo' && !view.querySelector(':scope > [data-eq-barra]')) eqBarra(); })
      .observe(raiz, { childList: true });
  }
  // El botón del menú (los demás módulos hacen lo mismo: clonan uno).
  try {
    const anchor = document.querySelector('.nav-item');
    if (anchor && !document.querySelector('.nav-item[data-view="equipo"]')) {
      const btn = anchor.cloneNode(true);
      btn.dataset.view = 'equipo';
      btn.classList.remove('active');
      btn.removeAttribute('hidden');
      btn.style.removeProperty('display');
      btn.textContent = 'Equipo';
      anchor.parentNode.appendChild(btn);
      btn.addEventListener('click', () => navigate('equipo'));
    }
  } catch (e) { /* si el menú cambia, no rompe nada */ }
  const s = document.createElement('style');
  s.textContent = `
  [data-eq-barra]{margin-bottom:14px}
  .eq-tabs{display:inline-flex;gap:4px;background:#ECE9E1;border-radius:999px;padding:4px;margin-top:10px;flex-wrap:wrap}
  .eq-tab{border:0;border-radius:999px;padding:8px 16px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;background:transparent;color:#55565B}
  .eq-tab.on{background:#fff;color:#1F1F1F;box-shadow:0 1px 3px rgba(0,0,0,.08)}`;
  document.head.appendChild(s);
})();
