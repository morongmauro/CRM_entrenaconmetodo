// =====================================================
// MÁS ESPACIO · ocultar el menú y ajustar el ancho de las columnas
// =====================================================
// · El menú de la izquierda se oculta y se vuelve a mostrar con el botón de
//   la cabecera (al lado del logo). Se recuerda en este computador.
// · En las vistas de 2 y 3 columnas (Seguimiento, su semana, la doble
//   pantalla, el constructor y las mesas de trabajo) la línea entre dos
//   columnas se arrastra para agrandar una y achicar la otra. Doble clic en
//   la línea vuelve al ancho de siempre. Cada vista recuerda lo suyo, en
//   proporción, así que sirve igual en otra pantalla.
// Solo en computador: en el teléfono (versión móvil) no aplica.
//
// Carga al final, antes de movil.js.
// =====================================================

const COL_KEY = 'crm:cols';
const MENU_KEY = 'crm:menuOculto';
const COL_MIN = 220;          // ninguna columna más angosta que esto
const COL_DESDE = 1024;       // ancho de ventana desde el que aplica

// Las vistas con columnas ajustables. `min`: ancho mínimo del contenedor.
const COL_VISTAS = [
  { sel: '.seg-mesa-grid', clave: 'seg-mesa' },
  { sel: '[data-seg-grid]', clave: 'seguimiento' },
  { sel: '#seg-semana .es-grid', clave: 'semana', min: 560 },
  { sel: '.split', clave: 'doble' },
  { sel: '.ent-mesa .ent-mesa-grid', clave: 'mesa' },
  { sel: '#cons-wrap:not(.ent-mesa) .ent-mesa-grid', clave: 'constructor' },
];

const colLeer = () => { try { return JSON.parse(localStorage.getItem(COL_KEY) || '{}'); } catch (e) { return {}; } };
const colGuardar = (clave, fr) => { const t = colLeer(); if (fr) t[clave] = fr; else delete t[clave]; try { localStorage.setItem(COL_KEY, JSON.stringify(t)); } catch (e) {} };
const colPuede = () => window.innerWidth >= COL_DESDE && !document.body.classList.contains('modo-movil');

// Las columnas que el navegador está dibujando ahora (en px).
function colActuales(el) {
  return getComputedStyle(el).gridTemplateColumns.split(' ').map(parseFloat).filter(n => n > 0);
}
const colItems = (el) => [...el.children].filter(c => !c.classList.contains('col-tirador') && getComputedStyle(c).display !== 'none');

function colSoltar(el) {
  if (!el._cols) return;
  el._cols.ro.disconnect();
  el.querySelectorAll(':scope > .col-tirador').forEach(t => t.remove());
  el.style.removeProperty('grid-template-columns');
  colItems(el).forEach(c => c.style.removeProperty('grid-column'));
  el.classList.remove('col-ajustable');
  delete el._cols;
}

function colAplicar(el) {
  const st = el._cols;
  const ancho = el.clientWidth;
  const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
  const util = ancho - gap * (st.n - 1);
  // Los anchos de todas menos la última; la última se queda con el resto.
  let px = st.fr.map(f => Math.round(f * util));
  const resto = () => util - px.reduce((a, b) => a + b, 0);
  px = px.map(w => Math.max(COL_MIN, w));
  while (resto() < COL_MIN && px.some(w => w > COL_MIN)) { const i = px.indexOf(Math.max(...px)); px[i] -= 10; }
  el.style.setProperty('grid-template-columns', `${px.map(w => `${w}px`).join(' ')} minmax(0, 1fr)`, 'important');
  colItems(el).forEach(c => c.style.setProperty('grid-column', 'auto', 'important'));
  let x = 0;
  el.querySelectorAll(':scope > .col-tirador').forEach((t, i) => { x += px[i]; t.style.left = `${x + gap * i + gap / 2}px`; });
}

function colEnganchar(el, clave) {
  // Las columnas reales: algunas vistas están armadas en 12 columnas chicas
  // (Seguimiento) y otras tienen más tarjetas que columnas (su semana).
  const plantilla = colActuales(el);
  const items = colItems(el);
  const n = Math.min(plantilla.length, items.length);
  if (n < 2) return;
  const actuales = plantilla.length === n ? plantilla : items.slice(0, n).map(c => c.getBoundingClientRect().width);
  const total = actuales.reduce((a, b) => a + b, 0);
  const guardado = colLeer()[clave];
  const base = actuales.slice(0, -1).map(w => w / total);
  const fr = Array.isArray(guardado) && guardado.length === n - 1 ? guardado : base;
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.classList.add('col-ajustable');
  el._cols = { clave, n, fr: fr.slice(), base, ro: new ResizeObserver(() => el._cols && colAplicar(el)) };
  for (let i = 0; i < n - 1; i++) {
    const t = document.createElement('div');
    t.className = 'col-tirador';
    t.dataset.colTirador = `${clave}:${i}`;
    t.title = 'Arrastra para cambiar el ancho · doble clic: como estaba';
    t.addEventListener('pointerdown', (e) => colArrastrar(e, el, i));
    t.addEventListener('dblclick', () => { el._cols.fr = el._cols.base.slice(); colGuardar(clave, null); colAplicar(el); });
    el.appendChild(t);
  }
  el._cols.ro.observe(el);
  colAplicar(el);
}

function colArrastrar(e, el, i) {
  e.preventDefault();
  const st = el._cols;
  const t = e.currentTarget;
  t.setPointerCapture(e.pointerId);
  t.classList.add('activo');
  document.body.classList.add('col-arrastrando');
  const mover = (ev) => {
    const r = el.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    const util = el.clientWidth - gap * (st.n - 1);
    const antes = st.fr.slice(0, i).reduce((a, b) => a + b, 0) * util + gap * i;
    let w = ev.clientX - r.left - antes - gap / 2;
    const despues = st.fr.slice(i + 1).reduce((a, b) => a + b, 0) * util;
    w = Math.max(COL_MIN, Math.min(w, util - antes + gap * i - despues - COL_MIN));
    st.fr[i] = w / util;
    colAplicar(el);
  };
  const fin = () => {
    t.classList.remove('activo');
    document.body.classList.remove('col-arrastrando');
    t.removeEventListener('pointermove', mover);
    colGuardar(st.clave, st.fr);
  };
  t.addEventListener('pointermove', mover);
  t.addEventListener('pointerup', fin, { once: true });
  t.addEventListener('pointercancel', fin, { once: true });
}

// Revisa la pantalla: engancha lo que apareció y suelta lo que ya no aplica.
function colRevisar() {
  const puede = colPuede();
  document.querySelectorAll('.col-ajustable').forEach(el => {
    const v = COL_VISTAS.find(x => el.matches(x.sel));
    // Si repintaron su contenido, las líneas se fueron con él: se vuelven a poner.
    const sinLineas = el._cols && el.querySelectorAll(':scope > .col-tirador').length !== el._cols.n - 1;
    if (!puede || !v || !el.isConnected || (v.min && el.clientWidth < v.min) || sinLineas) colSoltar(el);
  });
  if (!puede) return;
  COL_VISTAS.forEach(v => document.querySelectorAll(v.sel).forEach(el => {
    if (el._cols || (v.min && el.clientWidth < v.min) || el.offsetParent === null) return;
    colEnganchar(el, v.clave);
  }));
}
let _colPend = null;
const colPedir = () => { clearTimeout(_colPend); _colPend = setTimeout(colRevisar, 120); };
new MutationObserver(colPedir).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
window.addEventListener('resize', colPedir);

// ── El menú de la izquierda ─────────────────────────────────────────────
const MENU_ICONO = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M9.5 4.5v15"/></svg>';
function menuPintar() {
  const oculto = (() => { try { return localStorage.getItem(MENU_KEY) === '1'; } catch (e) { return false; } })();
  document.body.classList.toggle('menu-oculto', oculto);
  const b = document.getElementById('menu-toggle');
  if (b) { b.title = oculto ? 'Mostrar el menú' : 'Ocultar el menú (más espacio)'; b.setAttribute('aria-pressed', oculto ? 'true' : 'false'); }
}
window.menuAlternar = () => {
  const oculto = !document.body.classList.contains('menu-oculto');
  try { localStorage.setItem(MENU_KEY, oculto ? '1' : '0'); } catch (e) {}
  menuPintar();
  colPedir();
};
(() => {
  const marca = document.querySelector('.em-topbar .em-brand');
  if (marca && !document.getElementById('menu-toggle')) {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'menu-toggle';
    b.className = 'em-menu-toggle';
    b.innerHTML = MENU_ICONO;
    b.addEventListener('click', menuAlternar);
    marca.prepend(b);
  }
  menuPintar();
})();
