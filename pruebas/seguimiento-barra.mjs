// Seguimiento en dos pantallas: en el computador la lista de clientes va en
// la barra lateral, debajo de «Seguimiento» (con cuándo fue su último
// seguimiento, sus tareas y «Marcar»); la pantalla 1 es el seguimiento del
// cliente a todo el ancho, con sus tareas; la 2, la doble pantalla de siempre.
// En el teléfono, o con la barra escondida, la lista sigue en la página.
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
// La semana que repasa el diálogo: la actual, y los lunes la que acaba de cerrar (esLunesInicial).
const LUNES = offset(HOY) === 0 ? mas(HOY, -7) : mas(HOY, -offset(HOY));
const L = (k) => mas(LUNES, k);            // esta semana: L(0)=lunes … L(6)=domingo
const P = (k) => mas(LUNES, k - 7);        // semana pasada
// Una hora de ese día, pero nunca en el futuro (un lunes de madrugada las 16:00 aún no llegan).
const TS = (f, h) => new Date(Math.min(Date.parse(`${f}T${h}Z`), Date.now() - 60000)).toISOString();

const PENDIENTES = () => [
  { id: 'p1', user_id: 'coach-1', cliente_id: 'c0', para: 'coach', scope: 'general', descripcion: 'Revisar su técnica de sentadilla', fecha_limite: mas(HOY, -1), prioridad: 'media', estado: 'abierto', created_at: '2026-10-01T10:00:00Z' },
  { id: 'p2', user_id: 'coach-1', cliente_id: 'c0', para: 'coach', scope: 'general', descripcion: 'Preguntarle cómo le fue con el viaje', fecha_limite: mas(HOY, 5), prioridad: 'media', estado: 'abierto', created_at: '2026-10-02T10:00:00Z' },
  { id: 'p3', user_id: 'coach-1', cliente_id: 'c0', para: 'cliente', scope: 'general', descripcion: 'Mandar fotos', fecha_limite: null, prioridad: 'media', estado: 'abierto', created_at: '2026-10-02T10:00:00Z' },
  { id: 'p4', user_id: 'coach-1', cliente_id: 'c0', para: 'coach', scope: 'general', descripcion: 'Vieja ya hecha', fecha_limite: '2026-01-01', prioridad: 'media', estado: 'completado', completado_en: '2026-01-02', created_at: '2026-01-01T10:00:00Z' },
];
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
  const notas_entreno = [{ id: 'n1', user_id: 'coach-1', cliente_id: 'c0', fecha: L(0), rutina_id: 'r1', ejercicio_id: 'e2', texto: 'No tengo esta máquina en mi gym', leida_en: null, created_at: TS(L(0), '10:00:00'), ejercicios: { nombre: 'Press banca', alias: 'Bench Press' } }];
  return {
    clientes: [cliente], seguimientos: [], pagos: [], pendientes: PENDIENTES(), mediciones_corporales: [], fotos_progreso: [],
    settings: [{ user_id: 'coach-1', usd_cop_rate: 4000, nombre_coach: 'Mauro', mealtracker_app_url: 'https://mt.prueba', mealtracker_coach_password: 'x' }],
    metas_historial: [], nutricion_insights: [], ia_uso: [], push_pago_log: [],
    fases: [fase], rutinas, rutina_ejercicios: [], rutina_bloques: [], sesiones, series_log, ejercicios,
    eventos, evento_registros, actividades, notas_entreno,
    // Lo que se habló y se cambió esta semana
    comentarios_coach: [{ id: 'k1', user_id: 'coach-1', cliente_id: 'c0', ejercicio_id: 'e1', tipo: 'puntual', texto: 'Baja la barra más lento', creado_en: TS(L(0), '15:00:00'), leido_en: null, quitado_en: null }],
    rutina_ejercicios: [{ id: 're1', rutina_id: 'r3', ejercicio_id: 'e1', reps: '6-8', orden: 1 }],
    videos_tecnica: [{ id: 'v1', cliente_id: 'c0', ejercicio_id: 'e2', ejercicio_nombre: 'Bench Press', estado: 'mejorar', pedido_en: P(0), revisado_en: L(0), nota: 'Baja la barra hasta tocar el pecho.', created_at: P(0) }],
    cambios_ejercicio: [{ id: 'x1', user_id: 'coach-1', cliente_id: 'c0', rutina_id: 'r1', rutina_nombre: 'Push', nombre_antes: 'Chest Press Machine', nombre_despues: 'Bench Press', origen: 'alternativas', creado_at: TS(L(0), '16:00:00') }],
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
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 1 });
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

const FOTO = process.env.FOTO || '';
{
  console.log('\nancho');
  const { ctx, p, errores } = await abrir(1440, 1000);
  await p.evaluate(() => { try { localStorage.setItem('crm:segModo', 'semana'); } catch (e) {} navigate('seguimiento'); });
  await p.locator('#seg-semana').waitFor({ timeout: 15000 });
  await p.waitForTimeout(800);
  if (FOTO) { await p.screenshot({ path: path.join(CAPTURAS, `seg-barra-${FOTO}.png`) }); }
  const enBarra = await p.evaluate(() => !!document.querySelector('#main-nav [data-nav-sub="seguimiento"] #seg-list'));
  ok('la lista de clientes va en la barra lateral, debajo de «Seguimiento»', enBarra && await p.evaluate(() => {
    const sub = document.querySelector('[data-nav-sub="seguimiento"]'); const prev = sub && sub.previousElementSibling;
    return !!prev && prev.dataset.view === 'seguimiento';
  }));
  ok('…con cuándo fue el último seguimiento, la tarea de hoy y «Marcar»', /Sin seguimiento|Hace|Hoy/.test(await p.locator('[data-nav-sub="seguimiento"] [data-seg-li="c0"]').innerText().catch(() => ''))
    && /1 tarea hoy/.test(await p.locator('[data-nav-sub="seguimiento"] [data-seg-li="c0"]').innerText().catch(() => ''))
    && (await p.locator('[data-nav-sub="seguimiento"] [data-seg-li-marcar="c0"]').count()) === 1);
  ok('pantalla 1: el seguimiento del cliente a todo el ancho (sin la columna de la lista)', await p.evaluate(() => !document.querySelector('#seg-content #seg-list')));
  ok('pantalla 1: trae sus tareas («Mis tareas con Ana»), y ya no la lista de todas', (await p.locator('[data-seg-tareas]').count()) === 1 && (await p.locator('[data-tc-global]').count()) === 0);
  // Buscar en la barra.
  await p.locator('[data-nav-sub="seguimiento"] #seg-buscar').fill('zzz');
  ok('el buscador de la barra filtra', await p.locator('[data-nav-sub="seguimiento"] [data-seg-li="c0"]').isHidden());
  await p.locator('[data-nav-sub="seguimiento"] #seg-buscar').fill('');
  // Doble pantalla: Seguimiento a la izquierda y otra sección a la derecha.
  await p.evaluate(() => splitToggle()); await p.waitForTimeout(1500);
  ok('doble pantalla: la lista sigue en la barra y quedan dos pantallas', await p.evaluate(() => !!document.querySelector('[data-nav-sub="seguimiento"] #seg-list') && !document.querySelector('#seg-content #seg-list')));
  await p.screenshot({ path: path.join(CAPTURAS, `seg-barra-doble${FOTO ? '-' + FOTO : ''}.png`) });
  await p.evaluate(() => splitToggle()); await p.waitForTimeout(500);
  // Al salir de Seguimiento, la lista de la barra se esconde.
  await p.evaluate(() => navigate('pagos')); await p.waitForTimeout(600);
  ok('fuera de Seguimiento la lista de la barra no se ve', !(await p.locator('[data-nav-sub="seguimiento"]').isVisible().catch(() => false)));
  ok('sin errores de JavaScript', errores.length === 0, errores.join(' | '));
  await ctx.close();
}
{
  console.log('\ntelefono');
  const { ctx, p, errores } = await abrir(390, 900);
  await p.evaluate(() => { try { localStorage.setItem('crm:segModo', 'semana'); } catch (e) {} navigate('seguimiento'); });
  await p.locator('#seg-list').waitFor({ timeout: 15000 });
  ok('teléfono: la lista sigue en la página, como antes', await p.evaluate(() => !!document.querySelector('#seg-content #seg-list')));
  ok('teléfono: sin errores de JavaScript', errores.length === 0, errores.join(' | '));
  await ctx.close();
}
await b.close(); servidor.close();
console.log(mal ? `\n${mal} falla(s)` : '\ntodo bien');
process.exit(mal ? 1 : 0);
