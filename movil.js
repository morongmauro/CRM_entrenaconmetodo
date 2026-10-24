// =====================================================
// CRM EN EL TELÉFONO · el mismo link, versión móvil o escritorio
// =====================================================
// Se elige sola por el ancho de la pantalla (teléfono → móvil) y se puede
// cambiar a mano: en el teléfono, «Más» → «Ver versión escritorio»; en una
// pantalla angosta con la de escritorio, la píldora «Versión móvil». La
// elección se recuerda en ese aparato. En el computador no cambia nada.
//
// La versión móvil es la misma app con otra forma: abajo una barra con lo
// del día a día (Seguimiento, Pagos, Bandeja) y «Más» con todas las demás
// secciones; no se quita ninguna. Seguimiento muestra la lista o el cliente,
// uno a la vez (app.js), y Pagos abre en las tarjetas del mes.
//
// Carga AL FINAL (después de iconos-linea.js: usa los íconos del menú).
// =====================================================

const MV_KEY = 'crm:modo';
const MV_ANCHO = 760;
const MV_TABS = ['seguimiento', 'pagos', 'bandeja'];
const MV_ICONO_MAS = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>';

function mvElegido() { try { return localStorage.getItem(MV_KEY); } catch (e) { return null; } }
function mvDebeSerMovil() {
  const e = mvElegido();
  return e ? e === 'movil' : window.matchMedia(`(max-width: ${MV_ANCHO}px)`).matches;
}

function mvAplicar() {
  const antes = enMovil();
  const movil = mvDebeSerMovil();
  document.body.classList.toggle('modo-movil', movil);
  mvPintarBarra();
  mvPintarPildora();
  if (antes !== movil && typeof _currentView !== 'undefined' && _currentView && typeof rerenderView === 'function') rerenderView();
}

window.mvModo = (modo) => {
  try { localStorage.setItem(MV_KEY, modo); } catch (e) { /* sin almacenamiento: vale para esta visita */ }
  mvCerrarMas();
  mvAplicar();
  window.scrollTo({ top: 0, behavior: 'instant' });
};

// ── La barra de abajo ───────────────────────────────────────────────────
const mvItem = (vista) => document.querySelector(`.em-nav .nav-item[data-view="${vista}"]`);
function mvPintarBarra() {
  let bar = document.querySelector('[data-mv-barra]');
  if (!enMovil()) { if (bar) bar.remove(); return; }
  if (!bar) {
    bar = document.createElement('nav');
    bar.className = 'mv-barra';
    bar.dataset.mvBarra = '';
    bar.setAttribute('aria-label', 'Secciones');
    document.body.appendChild(bar);
  }
  const actual = typeof _currentView !== 'undefined' ? _currentView : '';
  bar.innerHTML = MV_TABS.filter(mvItem).map(v => {
    const it = mvItem(v);
    return `<button type="button" class="mv-tab${v === actual ? ' activa' : ''}" data-mv-tab="${v}" onclick="navigate('${v}')">${it.querySelector('svg')?.outerHTML || ''}<span>${escapeHtml(it.textContent.trim())}</span></button>`;
  }).join('') + `<button type="button" class="mv-tab${MV_TABS.includes(actual) ? '' : ' activa'}" data-mv-mas onclick="mvAbrirMas()">${MV_ICONO_MAS}<span>Más</span></button>`;
}

// ── «Más»: todas las secciones ──────────────────────────────────────────
window.mvAbrirMas = () => {
  mvCerrarMas();
  const actual = typeof _currentView !== 'undefined' ? _currentView : '';
  const items = [...document.querySelectorAll('.em-nav .nav-item')].filter(b => b.dataset.view);
  const fondo = document.createElement('div');
  fondo.className = 'mv-hoja-fondo';
  fondo.dataset.mvHoja = '';
  fondo.addEventListener('click', (e) => { if (e.target === fondo) mvCerrarMas(); });
  fondo.innerHTML = `
    <div class="mv-hoja" role="dialog" aria-label="Todas las secciones">
      <div class="mv-hoja-asa"></div>
      <div class="mv-hoja-t">Todas las secciones</div>
      <div class="mv-hoja-lista">
        ${items.map(b => `<button type="button" class="mv-hoja-it${b.dataset.view === actual ? ' activa' : ''}" data-mv-ir="${b.dataset.view}" onclick="mvCerrarMas(); navigate('${b.dataset.view}')">${b.querySelector('svg')?.outerHTML || ''}<span>${escapeHtml(b.textContent.trim())}</span></button>`).join('')}
      </div>
      <button type="button" class="mv-hoja-modo" data-mv-escritorio onclick="mvModo('escritorio')">Ver versión escritorio</button>
      <button type="button" class="mv-hoja-salir" onclick="mvCerrarMas(); document.getElementById('logout-btn')?.click()">Salir</button>
    </div>`;
  document.body.appendChild(fondo);
};
window.mvCerrarMas = () => document.querySelectorAll('[data-mv-hoja]').forEach(x => x.remove());

// ── En pantalla angosta con la de escritorio: volver a la móvil ─────────
function mvPintarPildora() {
  let p = document.querySelector('[data-mv-pildora]');
  const ver = !enMovil() && window.matchMedia('(max-width: 1023px)').matches;
  if (!ver) { if (p) p.remove(); return; }
  if (!p) {
    p = document.createElement('button');
    p.type = 'button';
    p.className = 'mv-pildora';
    p.dataset.mvPildora = '';
    p.textContent = 'Versión móvil';
    p.onclick = () => mvModo('movil');
    document.body.appendChild(p);
  }
}

// La barra sigue a la sección: se repinta al navegar (también trae el
// número de la Bandeja al día).
const _mvNavegar = window.navigate;
window.navigate = (nombre) => {
  mvCerrarMas();
  const r = _mvNavegar(nombre);
  mvPintarBarra();
  return r;
};

window.matchMedia(`(max-width: ${MV_ANCHO}px)`).addEventListener('change', () => { if (!mvElegido()) mvAplicar(); });
window.matchMedia('(max-width: 1023px)').addEventListener('change', mvPintarPildora);
mvAplicar();
// Los íconos y el número de la Bandeja llegan un momento después.
setTimeout(mvPintarBarra, 1500);
