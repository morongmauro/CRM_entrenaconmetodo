// Agente de rutinas: «crear rutina» y «crear ciclo». Se prueban las
// herramientas directo (sin IA): validan contra la galería y lo que no le
// sirve al cliente, proponen sin guardar y, al aplicar, crean todo en orden.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/agente-crear.mjs
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
const fixture = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'arnes', 'asistencia-datos.json'), 'utf8'));

function tablas() {
  // Algunos con video de YouTube, para ver su foto en la rutina.
  fixture.ejercicios.forEach((e, k) => { if (k % 2 === 0) { e.video_fuente = 'youtube'; e.video_ref = 'dQw4w9WgXcQ'; } });
  const ej = new Map(fixture.ejercicios.map(e => [e.id, e]));
  // El Supabase falso no resuelve los joins: se dejan puestos en la fila.
  const re = fixture.rutina_ejercicios.map(x => ({ ...x, ejercicios: ej.get(x.ejercicio_id) }));
  const sl = fixture.series_log.map(x => ({ ...x, ejercicios: ej.get(x.ejercicio_id) && { nombre: ej.get(x.ejercicio_id).nombre, alias: ej.get(x.ejercicio_id).alias } }));
  const cliente = {
    id: 'c0', user_id: 'coach-1', nombre: 'Ana Pérez', estado: 'activo', dias_entreno: ['L', 'X'], dias_entreno_cantidad: 2,
    objetivo: 'Ganar músculo', lugar_entreno: 'gym', monto: 280000, moneda: 'COP', dia_pago: 5, fecha_inicio: '2026-01-05', created_at: '2026-01-01T00:00:00Z',
  };
  // Lo que anotaste a mano en esas semanas (para ponerlo al lado de Trainerize).
  const seguimientos = ['2026-W37', '2026-W38', '2026-W39', '2026-W40'].map((semana, k) => ({
    id: 's' + k, user_id: 'coach-1', cliente_id: 'c0', semana, fecha: '2026-09-1' + k, fuerza_planeados: 5, fuerza_ejecutados: [4, 3, 5, 4][k], estado: 'hecho',
  }));
  return {
    clientes: [cliente], seguimientos, pagos: [], pendientes: [], mediciones_corporales: [],
    settings: [{ user_id: 'coach-1', usd_cop_rate: 4000, nombre_coach: 'Mauro' }],
    metas_historial: [], nutricion_insights: [], ia_uso: [], push_pago_log: [],
    fases: fixture.fases, rutinas: fixture.rutinas, rutina_ejercicios: re, rutina_bloques: fixture.rutina_bloques,
    sesiones: fixture.sesiones, series_log: sl, ejercicios: fixture.ejercicios, trainerize_resumen: fixture.trainerize_resumen,
    comunidad_posts: [], comunidad_reacciones: [], comunidad_comentarios: [], comunidad_vistas: [],
  };
}

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let mal = 0;
const ok = (nombre, c, extra = '') => { if (!c) mal++; console.log(`  ${c ? 'ok ' : 'MAL'}  ${nombre}${c ? '' : '  ' + extra}`); };

async function abrir(ancho, alto) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 1 });
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
    if (u.includes('img.youtube.com') || u.includes('i.ytimg.com')) return ruta.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#5F6670"/></svg>' });
    if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return ruta.continue().catch(() => ruta.abort());
    return ruta.fulfill({ status: 200, contentType: 'application/json', body: u.includes('/rest/v1/') ? '[]' : '{}' });
  });
  await p.goto(BASE + '/');
  await p.locator('#app-screen').waitFor({ state: 'visible', timeout: 20000 });
  await p.waitForTimeout(800);
  return { ctx, p, errores };
}


const a = await abrir(1600, 1000);
const p = a.p;
await p.locator('nav, aside, body').getByText('Entrenamiento', { exact: true }).first().click();
await p.waitForTimeout(1000);
await p.locator('[data-cliente-ent="c0"]').first().click();
await p.waitForSelector('[data-rut-abrir]', { timeout: 10000 });
await p.waitForTimeout(600);
const nombres = await p.evaluate(async () => { const t = await entDb.ejercicios(); const n = (x) => t.find(e => e.nombre === x || entNombres(e).grande === x); return t.filter(e => !e.archivado).slice(0, 40).map(e => e.nombre); });
const [e1, e2, e3, e4] = nombres;

// 1) Un ejercicio que no existe: no propone nada.
let r = await p.evaluate(async ({ e1 }) => RUT_HERRAMIENTAS.crear_rutina({ nombre: 'Ana', nombre_rutina: 'Prueba', dias_semana: 'lunes', partes: [{ titulo: 'Fuerza', ejercicios: [{ ejercicio: e1 }, { ejercicio: 'Sentadilla voladora inventada' }] }] }), { e1 });
ok('si un ejercicio no está en la galería, no propone nada y dice cuál', !!r.error && /Sentadilla voladora inventada/.test(r.error) && await p.evaluate(() => _rut.propuestas.length) === 0, JSON.stringify(r));

// 2) Uno que «No le sirve» a Ana: se frena.
const idE2 = await p.evaluate(async (n) => (await entDb.ejercicios()).find(e => e.nombre === n).id, e2);
await p.evaluate(async (id) => { window.TABLAS_FALSAS.ejercicios_no_sirven = [{ id: 'ns1', cliente_id: 'c0', ejercicio_id: id, motivo: 'dolor', nota: null, creado_en: '2026-10-12T10:00:00Z', quitado_en: null }]; await nsCargar('c0', true); }, idE2);
r = await p.evaluate(async ({ e1, e2 }) => RUT_HERRAMIENTAS.crear_rutina({ nombre: 'Ana', nombre_rutina: 'Prueba', partes: [{ ejercicios: [{ ejercicio: e1 }, { ejercicio: e2 }] }] }), { e1, e2 });
ok('si un ejercicio «No le sirve» al cliente, se frena y lo nombra', !!r.error && r.error.includes(e2) && /no le sirven/i.test(r.error), JSON.stringify(r));

// 3) Días que no entiende.
r = await p.evaluate(async ({ e1 }) => RUT_HERRAMIENTAS.crear_rutina({ nombre: 'Ana', nombre_rutina: 'Prueba', dias_semana: 'lunes, juernes', partes: [{ ejercicios: [{ ejercicio: e1 }] }] }), { e1 });
ok('un día mal escrito no se adivina: lo pregunta', !!r.error && /juernes/.test(r.error), JSON.stringify(r));

// 4) Rutina completa: calentamiento + fuerza (superserie). Propone sin guardar.
const antes = await p.evaluate(() => window.TABLAS_FALSAS.rutinas.length);
r = await p.evaluate(async ({ e1, e3, e4 }) => RUT_HERRAMIENTAS.crear_rutina({ nombre: 'Ana', nombre_rutina: 'Upper nuevo', dias_semana: 'lunes y jueves',
  partes: [{ titulo: 'Calentamiento', ejercicios: [{ ejercicio: e1, series: 1, reps: '10' }] },
           { titulo: 'Fuerza', bloque: { tipo: 'superserie', vueltas: 3, descanso_seg: 90 }, ejercicios: [{ ejercicio: e3, series: 3, reps: '8-12' }, { ejercicio: e4, series: 3, reps: '10', peso_objetivo: '20 kg' }] }] }), { e1, e3, e4 });
const tarjeta = await p.evaluate(() => _rut.propuestas.map(x => [x.descripcion, x.detalle]));
ok('propone la rutina completa (sin guardarla) y la tarjeta la muestra parte por parte', /PROPUESTO/.test(r.estado || '') && tarjeta.length === 1
  && /Crear la rutina "Upper nuevo" para Ana Pérez/.test(tarjeta[0][0]) && /Lun, Jue/.test(tarjeta[0][0]) && /Calentamiento:/.test(tarjeta[0][1]) && /Fuerza \(superserie, 3 vueltas\):/.test(tarjeta[0][1])
  && await p.evaluate(() => window.TABLAS_FALSAS.rutinas.length) === antes, JSON.stringify({ r, tarjeta }));
await p.evaluate(() => { _rut.abierto = true; rutPintar(); });
await p.waitForTimeout(300);
await p.locator('#rut-panel').screenshot({ path: path.join(CAPTURAS, 'agente-crear-rutina.png') });
ok('el panel dice cuánto cuesta más o menos crear una rutina', /Rápido.*COP.*Profundo.*COP.*US\$0,30/.test(await p.locator('[data-rut-estimado]').innerText()));
await p.evaluate(() => rutAplicar());
await p.waitForTimeout(1500);
const creada = await p.evaluate(({ e1, e3, e4 }) => {
  const T = window.TABLAS_FALSAS; const r = T.rutinas.find(x => x.nombre === 'Upper nuevo'); if (!r) return null;
  const ej = (id) => T.ejercicios.find(e => e.id === id)?.nombre;
  const res = T.rutina_ejercicios.filter(x => x.rutina_id === r.id).sort((a, b) => a.orden - b.orden);
  const bl = T.rutina_bloques.filter(x => x.rutina_id === r.id);
  return { dias: r.dias_semana, cliente: r.cliente_id, ejs: res.map(x => [ej(x.ejercicio_id), x.series, x.reps, !!x.bloque_id]), bloques: bl.map(b => [b.tipo, b.vueltas, b.nombre]) };
}, { e1, e3, e4 });
ok('al aplicar: la rutina queda creada para Ana, lunes y jueves', !!creada && creada.cliente === 'c0' && JSON.stringify(creada.dias) === '["L","J"]', JSON.stringify(creada));
ok('con sus ejercicios en orden, series y reps, y la superserie', !!creada && creada.ejs.length === 3 && creada.ejs[0][0] === e1 && creada.ejs[0][3] === false && creada.ejs[1][0] === e3 && creada.ejs[1][2] === '8-12' && creada.ejs[2][3] === true
  && creada.bloques.length === 1 && creada.bloques[0][0] === 'superserie' && creada.bloques[0][1] === 3, JSON.stringify(creada));

// 5) Ciclo nuevo y una rutina dentro de él, en la misma conversación.
r = await p.evaluate(() => RUT_HERRAMIENTAS.crear_ciclo({ nombre: 'Ana', nombre_ciclo: 'Ciclo 20', semanas: 5, dias_semana: 'lunes, miércoles, viernes' }));
const r2 = await p.evaluate(({ e3 }) => RUT_HERRAMIENTAS.crear_rutina({ nombre: 'Ana', fase: 'Ciclo 20', nombre_rutina: 'Full body A', dias_semana: 'lunes', partes: [{ ejercicios: [{ ejercicio: e3, series: 4, reps: '6-8' }] }] }), { e3 });
ok('crear_ciclo propone el ciclo (5 semanas, empieza al acabar el actual) y se le puede poner una rutina antes de aplicar', /PROPUESTO/.test(r.estado || '') && /PROPUESTO/.test(r2.estado || '')
  && await p.evaluate(() => _rut.propuestas.length) === 2 && /5 semanas · empieza el \d{4}-\d{2}-\d{2}/.test(await p.evaluate(() => _rut.propuestas[0].detalle)), JSON.stringify({ r, r2 }));
await p.evaluate(() => rutAplicar());
await p.waitForTimeout(1500);
const ciclo = await p.evaluate(() => { const T = window.TABLAS_FALSAS; const f = T.fases.find(x => x.nombre === 'Ciclo 20' && x.cliente_id === 'c0'); if (!f) return null;
  const rs = T.rutinas.filter(x => x.fase_id === f.id); return { semanas: f.semanas, dias: f.dias_semana, inicio: f.fecha_inicio, rutinas: rs.map(x => x.nombre), ejs: T.rutina_ejercicios.filter(x => rs.some(r => r.id === x.rutina_id)).length }; });
ok('al aplicar: el ciclo existe con sus días y la rutina quedó dentro', !!ciclo && ciclo.semanas === 5 && JSON.stringify(ciclo.dias) === '["L","X","V"]' && ciclo.rutinas.join() === 'Full body A' && ciclo.ejs === 1, JSON.stringify(ciclo));
r = await p.evaluate(() => RUT_HERRAMIENTAS.crear_ciclo({ nombre: 'Ana', nombre_ciclo: 'Ciclo 20' }));
ok('no deja crear dos ciclos con el mismo nombre', !!r.error && /ya tiene un ciclo/.test(r.error), JSON.stringify(r));
ok('sin errores', a.errores.length === 0, a.errores.join(' | '));
await b.close(); servidor.close();
console.log(mal ? `\n${mal} MAL` : '\nTodo bien');
process.exit(mal ? 1 : 0);
