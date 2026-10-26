// El CRM en el teléfono: el mismo link, versión móvil sola por el ancho y
// un selector para pasar a la de escritorio (y volver). En el PC no cambia.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/crm-movil.mjs
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/progreso-fuerza.mjs
import { createRequire } from 'module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const require_ = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require_('playwright')); }
catch { console.error('Falta playwright (npm i -D playwright, o NODE_PATH=…)'); process.exit(2); }

const RAIZ = path.join(import.meta.dirname, '..');
const CAPTURAS = path.join(import.meta.dirname, 'capturas');
fs.mkdirSync(CAPTURAS, { recursive: true });
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };
const servidor = http.createServer((req, res) => {
  let f = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (f === '/') f = '/index.html';
  const p = path.join(RAIZ, f);
  if (!p.startsWith(RAIZ) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => servidor.listen(0, r));
const BASE = `http://127.0.0.1:${servidor.address().port}`;
const tailwind = process.env.TAILWIND_CSS && fs.existsSync(process.env.TAILWIND_CSS) ? fs.readFileSync(process.env.TAILWIND_CSS, 'utf8') : '';
const falso = fs.readFileSync(path.join(import.meta.dirname, 'arnes', 'supabase-falso.js'), 'utf8');

// ── Una semana de ejemplo, relativa a hoy ──
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const HOY = iso(new Date());
const mas = (f, n) => { const [y, m, d] = f.split('-').map(Number); const x = new Date(y, m - 1, d); x.setDate(x.getDate() + n); return iso(x); };
const offset = (f) => { const [y, m, d] = f.split('-').map(Number); return (new Date(y, m - 1, d).getDay() + 6) % 7; };
const LUNES = mas(HOY, -offset(HOY));
const L = (k) => mas(LUNES, k);            // esta semana: L(0)=lunes … L(6)=domingo
const P = (k) => mas(LUNES, k - 7);        // semana pasada

function tablas() {
  const cliente = { id: 'c0', user_id: 'coach-1', nombre: 'Ana Pérez', estado: 'activo', objetivo: 'Ganar músculo', monto: 280000, moneda: 'COP', dia_pago: 5, fecha_inicio: '2026-01-05', created_at: '2026-01-01T00:00:00Z' };
  const fase = { id: 'f1', user_id: 'coach-1', cliente_id: 'c0', nombre: 'Ciclo 19', semanas: 5, fecha_inicio: mas(LUNES, -14), dias_semana: ['L', 'X', 'V', 'S'], orden: 1, estado: 'activa', visible_cliente: true };
  const rut = (id, nombre, d, o) => ({ id, user_id: 'coach-1', cliente_id: 'c0', fase_id: 'f1', nombre, dia_orden: o, dias_semana: [d], archivada: false, tipo_sesion: 'fuerza' });
  const rutinas = [rut('r1', 'Push', 'L', 1), rut('r2', 'Lower', 'X', 2), rut('r3', 'Pull', 'V', 3), rut('r4', 'Legs', 'S', 4)];
  const ses = (id, fecha, rutina_id, extra = {}) => ({ id, cliente_id: 'c0', fase_id: 'f1', fecha, rutina_id, estado: 'completada', rpe: 7, rutinas: { nombre: rutinas.find(r => r.id === rutina_id).nombre }, ...extra });
  const sesiones = [
    // semana pasada: 3 de 4
    ses('p1', P(0), 'r1'), ses('p2', P(2), 'r2'), ses('p3', P(4), 'r3'),
    // esta semana: lunes y viernes (el miércoles no)
    ses('s1', L(0), 'r1', { rpe: 8, records: [{ nombre: 'Press banca', peso: 60, unidad: 'kg', reps: 8 }] }),
    ses('s2', L(4), 'r3', { rpe: 7 }),
  ].filter(s => s.fecha <= HOY);
  const ejercicios = [{ id: 'e1', nombre: 'Remo con barra', alias: 'Barbell Row' }, { id: 'e2', nombre: 'Press banca', alias: 'Bench Press' }];
  const serie = (id, sesion_id, ejercicio_id, peso) => ({ id, sesion_id, ejercicio_id, serie_num: 1, reps: 8, peso, unidad: 'kg', completada: true, ejercicios: { nombre: ejercicios.find(e => e.id === ejercicio_id).nombre, alias: ejercicios.find(e => e.id === ejercicio_id).alias } });
  const series_log = [serie('l1', 'p3', 'e1', 50), serie('l2', 's2', 'e1', 55), { ...serie('l5', 's2', 'e1', 55), serie_num: 2 }, serie('l3', 'p1', 'e2', 57.5), serie('l4', 's1', 'e2', 60)].filter(x => sesiones.some(s => s.id === x.sesion_id));
  const eventos = [
    { id: 'ev1', cliente_id: 'c0', fase_id: 'f1', tipo: 'actividad', titulo: 'Caminadora', dias_semana: ['M', 'J'], duracion_min: 25, visible_cliente: true, created_at: '2026-01-01' },
    { id: 'ev2', cliente_id: 'c0', fase_id: 'f1', tipo: 'peso', titulo: 'Peso', fecha: L(3), visible_cliente: true, created_at: '2026-01-01' },
  ];
  const evento_registros = [{ id: 'g1', cliente_id: 'c0', evento_id: 'ev1', fecha: L(1), estado: 'hecho' }].filter(r => r.fecha <= HOY);
  const actividades = [{ id: 'a1', cliente_id: 'c0', fecha: P(6), tipo: 'deporte', titulo: 'Fútbol', duracion_min: 60 }];
  const notas_entreno = [{ id: 'n1', user_id: 'coach-1', cliente_id: 'c0', fecha: L(0), rutina_id: 'r1', ejercicio_id: 'e2', texto: 'No tengo esta máquina en mi gym', leida_en: null, created_at: L(0) + 'T10:00:00Z', ejercicios: { nombre: 'Press banca', alias: 'Bench Press' } }];
  return {
    clientes: [cliente], seguimientos: [], pagos: [], pendientes: [], mediciones_corporales: [], fotos_progreso: [],
    settings: [{ user_id: 'coach-1', usd_cop_rate: 4000, nombre_coach: 'Mauro', mealtracker_app_url: 'https://mt.prueba', mealtracker_coach_password: 'x' }],
    metas_historial: [], nutricion_insights: [], ia_uso: [], push_pago_log: [],
    fases: [fase], rutinas, rutina_ejercicios: [], rutina_bloques: [], sesiones, series_log, ejercicios,
    eventos, evento_registros, actividades, notas_entreno,
    // Lo que se habló y se cambió esta semana
    comentarios_coach: [{ id: 'k1', user_id: 'coach-1', cliente_id: 'c0', ejercicio_id: 'e1', tipo: 'puntual', texto: 'Baja la barra más lento', creado_en: L(0) + 'T15:00:00Z', leido_en: null, quitado_en: null }],
    rutina_ejercicios: [{ id: 're1', rutina_id: 'r3', ejercicio_id: 'e1', reps: '6-8', orden: 1 }],
    videos_tecnica: [{ id: 'v1', cliente_id: 'c0', ejercicio_id: 'e2', ejercicio_nombre: 'Bench Press', estado: 'mejorar', pedido_en: P(0), revisado_en: L(0), nota: 'Baja la barra hasta tocar el pecho.', created_at: P(0) }],
    cambios_ejercicio: [{ id: 'x1', user_id: 'coach-1', cliente_id: 'c0', rutina_id: 'r1', rutina_nombre: 'Push', nombre_antes: 'Chest Press Machine', nombre_despues: 'Bench Press', origen: 'alternativas', creado_at: L(0) + 'T16:00:00Z' }],
    rutina_movimientos: [], rutina_extras: [], rutina_dias_quitados: [],
    comunidad_posts: [], comunidad_reacciones: [], comunidad_comentarios: [], comunidad_vistas: [],
  };
}
// La comida del Mealtracker: lunes a viernes de esta semana menos el miércoles,
// cerca de la meta en calorías y con la proteína corta.
function comida() {
  const rd = {};
  [0, 1, 3, 4].map(L).filter(f => f <= HOY).forEach(f => { rd[f] = { kcal: 2050, p: 100, goal_kcal: 2100, goal_p: 140 }; });
  [0, 1, 2, 3, 4, 5, 6].map(P).forEach(f => { rd[f] = { kcal: 2000, p: 120, goal_kcal: 2100, goal_p: 140 }; });
  return { clients: [{ name: 'Ana Pérez', last_active: HOY, recent_days: rd }] };
}

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let mal = 0;
const ok = (nombre, c, extra = '') => { if (!c) mal++; console.log(`  ${c ? 'ok ' : 'MAL'}  ${nombre}${c ? '' : '  ' + extra}`); };

async function abrir(ancho, alto, conComida = true) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 1, isMobile: ancho < 800, hasTouch: ancho < 800 });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(e.message));
  p.on('dialog', d => d.accept());
  await ctx.addInitScript((t) => { window.TABLAS_FALSAS = t; }, tablas());
  await p.route('**/*', (ruta) => {
    const u = ruta.request().url();
    if (u.startsWith(BASE)) return ruta.continue();
    if (u.includes('cdn.tailwindcss.com')) return ruta.fulfill({ contentType: 'text/javascript', body: `(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(tailwind)};document.head.prepend(s);window.tailwind={config:{}};})();` });
    if (u.includes('supabase-js')) return ruta.fulfill({ contentType: 'text/javascript', body: falso });
    if (u.startsWith('https://mt.prueba/api/coach-auth')) return ruta.fulfill({ contentType: 'application/json', body: JSON.stringify({ token: 't', expiresAt: Date.now() + 3600e3 }) });
    if (u.startsWith('https://mt.prueba/api/coach-data')) return ruta.fulfill({ contentType: 'application/json', body: JSON.stringify(conComida ? comida() : { clients: [] }) });
    if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return ruta.continue().catch(() => ruta.abort());
    return ruta.fulfill({ status: 200, contentType: 'application/json', body: u.includes('/rest/v1/') ? '[]' : '{}' });
  });
  await p.goto(BASE + '/');
  await p.locator('#app-screen').waitFor({ state: 'visible', timeout: 20000 });
  await p.waitForTimeout(800);
  return { ctx, p, errores };
}

// ── Teléfono: sale la versión móvil sola ──
{
  const { ctx, p, errores } = await abrir(390, 844);
  await p.waitForTimeout(800);
  const e1 = await p.evaluate(() => ({
    movil: document.body.classList.contains('modo-movil'), vista: _currentView,
    barra: [...document.querySelectorAll('[data-mv-barra] .mv-tab span')].map(s => s.textContent.trim()),
    lado: getComputedStyle(document.querySelector('.em-side')).display,
  }));
  ok('teléfono: versión móvil sola, abre en Seguimiento', e1.movil && e1.vista === 'seguimiento', JSON.stringify(e1));
  ok('teléfono: barra abajo con Seguimiento, Diálogos, Pagos, Bandeja y Más; sin el menú de arriba', e1.barra[0] === 'Seguimiento' && e1.barra[1] === 'Diálogos' && e1.barra[2] === 'Pagos' && /^Bandeja/.test(e1.barra[3]) && e1.barra[4] === 'Más' && e1.lado === 'none', JSON.stringify(e1));
  await p.locator('#seg-list [data-seg-li="c0"]').waitFor({ timeout: 15000 });
  ok('Seguimiento: primero la lista, sin el cliente al lado', await p.locator('[data-seg-cabecera]').count() === 0 || !(await p.locator('[data-seg-cabecera]').isVisible()));
  await p.locator('#seg-list [data-seg-li="c0"] .seg-li-txt').click();
  await p.locator('[data-seg-cabecera]').waitFor({ state: 'visible', timeout: 15000 });
  await p.locator('#seg-semana [data-es-cumplimiento]').waitFor({ timeout: 15000 });
  ok('tocar un cliente: su seguimiento a pantalla completa, la lista se esconde', !(await p.locator('#seg-list').isVisible()) && await p.locator('[data-seg-volver]').isVisible());
  const ancho = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth, ven: window.innerWidth }));
  ok('nada se sale de la pantalla', ancho.doc <= ancho.ven + 1, JSON.stringify(ancho));
  await p.screenshot({ path: path.join(CAPTURAS, 'movil-seguimiento-cliente.png') });
  await p.locator('[data-seg-volver]').click();
  ok('«‹ Clientes» vuelve a la lista', await p.locator('#seg-list').isVisible() && !(await p.locator('[data-seg-cabecera]').isVisible()));
  await p.locator('[data-mv-tab="pagos"]').click();
  await p.locator('#pagos-content').waitFor({ timeout: 15000 });
  await p.waitForTimeout(500);
  ok('Pagos en el teléfono: las tarjetas del mes, no la tabla anual', await p.evaluate(() => _currentView === 'pagos' && !document.querySelector('#pagos-content table') && document.querySelector('[data-mv-tab="pagos"]').classList.contains('activa')));
  await p.locator('[data-mv-mas]').click();
  const mas = await p.evaluate(() => [...document.querySelectorAll('[data-mv-ir]')].map(b => b.dataset.mvIr));
  ok('«Más»: todas las secciones (no se quita ninguna)', ['dashboard', 'clientes', 'entrenamiento', 'nutricion', 'pagos', 'ajustes'].every(v => mas.includes(v)), JSON.stringify(mas));
  await p.screenshot({ path: path.join(CAPTURAS, 'movil-mas.png') });
  await p.locator('[data-mv-ir="clientes"]').click();
  await p.waitForTimeout(600);
  ok('desde «Más» se va a la sección', await p.evaluate(() => _currentView === 'clientes' && !document.querySelector('[data-mv-hoja]') && document.querySelector('[data-mv-mas]').classList.contains('activa')));
  // Selector: a la de escritorio y de vuelta, y se recuerda
  await p.locator('[data-mv-mas]').click();
  await p.locator('[data-mv-escritorio]').click();
  await p.waitForTimeout(500);
  ok('«Ver versión escritorio»: vuelve el menú de siempre y sale «Versión móvil»', await p.evaluate(() => !document.body.classList.contains('modo-movil') && !document.querySelector('[data-mv-barra]') && !!document.querySelector('[data-mv-pildora]') && localStorage.getItem('crm:modo') === 'escritorio'));
  await p.reload();
  await p.locator('#app-screen').waitFor({ state: 'visible', timeout: 20000 });
  await p.waitForTimeout(800);
  ok('se recuerda la elección al recargar', await p.evaluate(() => !document.body.classList.contains('modo-movil')));
  await p.locator('[data-mv-pildora]').click();
  await p.waitForTimeout(500);
  ok('«Versión móvil» vuelve a la móvil', await p.evaluate(() => document.body.classList.contains('modo-movil') && !!document.querySelector('[data-mv-barra]') && localStorage.getItem('crm:modo') === 'movil'));
  ok('teléfono: sin errores', errores.length === 0, errores.join(' | '));
  await ctx.close();
}
// ── Computador: igual que siempre ──
{
  const { ctx, p, errores } = await abrir(1440, 1000);
  await p.waitForTimeout(800);
  ok('computador: versión escritorio, sin barra ni píldora, abre en Inicio', await p.evaluate(() => !document.body.classList.contains('modo-movil') && !document.querySelector('[data-mv-barra]') && !document.querySelector('[data-mv-pildora]') && _currentView === 'dashboard'));
  await p.evaluate(() => navigate('pagos'));
  await p.locator('#pagos-content table').first().waitFor({ timeout: 15000 });
  ok('computador: Pagos sigue en la tabla anual', true);
  ok('computador: sin errores', errores.length === 0, errores.join(' | '));
  await ctx.close();
}
await b.close(); servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
