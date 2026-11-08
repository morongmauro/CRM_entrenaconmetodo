// Galería · fichas archivadas que tus clientes aún tienen: el aviso, la ficha
// que se propone en su lugar y «Cambiarlo en sus rutinas» (solo cambia el
// ejercicio de la línea, en el ciclo de ahora y en los que vienen; los ciclos
// terminados y las rutinas de biblioteca no se tocan; la vieja queda con
// duplicado_de = la nueva; queda la trazabilidad en cambios_ejercicio).
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/archivados-en-uso.mjs
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
const falso = fs.readFileSync(path.join(import.meta.dirname, 'arnes', 'supabase-falso.js'), 'utf8');

const iso = (d) => d.toISOString().slice(0, 10);
const HOY = iso(new Date());
const mas = (f, n) => { const x = new Date(f + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return iso(x); };
const ej = (id, nombre, alias, extra = {}) => ({ id, user_id: 'coach-1', nombre, alias, busqueda: null, tipo: 'fuerza', segmento: 'tren_superior', video_fuente: 'youtube', video_ref: 'v' + id, archivado: false, musculos_primarios: [], musculos_secundarios: [], ...extra });
const tablas = () => ({
  clientes: [
    { id: 'c1', user_id: 'coach-1', nombre: 'Ana Pérez', estado: 'activo', created_at: '2026-01-01T00:00:00Z' },
    { id: 'c2', user_id: 'coach-1', nombre: 'Luis Gil', estado: 'activo', created_at: '2026-01-01T00:00:00Z' },
  ],
  settings: [{ user_id: 'coach-1', usd_cop_rate: 4000, nombre_coach: 'Mauro' }],
  fases: [
    { id: 'f0', cliente_id: 'c1', estado: 'finalizada', fecha_inicio: mas(HOY, -90), semanas: 6, visible_cliente: false, orden: 1 },
    { id: 'f1', cliente_id: 'c1', nombre: 'Ciclo 2', estado: 'activa', fecha_inicio: mas(HOY, -14), semanas: 6, visible_cliente: true, orden: 2 },
    { id: 'f2', cliente_id: 'c1', estado: 'borrador', fecha_inicio: mas(HOY, 30), semanas: 6, visible_cliente: false, orden: 3 },
    { id: 'f3', cliente_id: 'c2', nombre: 'Ciclo 4', estado: 'activa', fecha_inicio: mas(HOY, -7), semanas: 6, visible_cliente: true, orden: 2 },
    // Luis: su ciclo anterior sigue marcado «activa» y visible, pero la app ya no se lo muestra.
    { id: 'f4', cliente_id: 'c2', nombre: 'Ciclo 3', estado: 'activa', fecha_inicio: mas(HOY, -60), semanas: 6, visible_cliente: true, orden: 1 },
  ],
  rutinas: [
    { id: 'r0', fase_id: 'f0', cliente_id: 'c1', nombre: 'Push viejo', archivada: false },
    { id: 'r1', fase_id: 'f1', cliente_id: 'c1', nombre: 'Push', archivada: false },
    { id: 'r2', fase_id: 'f2', cliente_id: 'c1', nombre: 'Push próximo', archivada: false },
    { id: 'r3', fase_id: 'f3', cliente_id: 'c2', nombre: 'Hombro', archivada: false },
    { id: 'r4', fase_id: 'f4', cliente_id: 'c2', nombre: 'Hombro viejo', archivada: false },
    { id: 'rb', fase_id: null, cliente_id: null, nombre: 'Plantilla', archivada: false },
  ],
  rutina_ejercicios: [
    { id: 'x0', rutina_id: 'r0', ejercicio_id: 'a1', orden: 1, series: 3, reps: '12', descanso_seg: 60, notas: 'viejo' },
    { id: 'x1', rutina_id: 'r1', ejercicio_id: 'a1', orden: 2, series: 4, reps: '10', descanso_seg: 90, notas: 'Codos suaves' },
    { id: 'x2', rutina_id: 'r2', ejercicio_id: 'a1', orden: 1, series: 3, reps: '15', descanso_seg: 60 },
    { id: 'x3', rutina_id: 'r3', ejercicio_id: 'a1', orden: 3, series: 2, reps: '12', descanso_seg: 45 },
    { id: 'x4', rutina_id: 'r3', ejercicio_id: 'e2', orden: 1, series: 3, reps: '8' },
    { id: 'x5', rutina_id: 'r4', ejercicio_id: 'a1', orden: 1, series: 3, reps: '10' },
    { id: 'x6', rutina_id: 'r4', ejercicio_id: 'e2', orden: 2, series: 3, reps: '8' },
    { id: 'xb', rutina_id: 'rb', ejercicio_id: 'a1', orden: 1, series: 3, reps: '10' },
  ],
  ejercicios: [
    ej('a1', 'Elevación frontal sentado', 'Seated Dumbbell Front Raise', { archivado: true, video_ref: 'malo' }),
    ej('e1', 'Elevación frontal sentado', 'Dumbbell Seated Front Raise'),
    ej('e2', 'Press militar', 'Overhead Press'),
  ],
  musculos: [], sesiones: [], series_log: [], eventos: [], evento_registros: [], actividades: [], ejercicio_video_estado: [],
  ejercicios_nombre_respaldo: [], cambios_ejercicio: [],
});

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let mal = 0;
const ok = (nombre, c, extra = '') => { if (!c) mal++; console.log(`  ${c ? 'ok ' : 'MAL'}  ${nombre}${c ? '' : '  ' + extra}`); };
const FOTO = process.env.FOTO || '';
for (const [ancho, alto] of [[1440, 900], [390, 844]]) {
  console.log(`\n${ancho} px`);
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: FOTO ? 2 : 1 });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(e.message));
  let dialogo = '';
  p.on('dialog', d => { dialogo = d.message(); d.accept(); });
  await ctx.addInitScript((t) => { window.TABLAS_FALSAS = t; }, tablas());
  await p.route('**/*', (ruta) => {
    const u = ruta.request().url();
    if (u.startsWith(BASE)) return ruta.continue();
    if (u.includes('supabase-js')) return ruta.fulfill({ contentType: 'text/javascript', body: falso });
    if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return ruta.continue().catch(() => ruta.abort());
    return ruta.fulfill({ status: 200, contentType: 'application/json', body: u.includes('/rest/v1/') ? '[]' : '{}' });
  });
  await p.goto(BASE + '/');
  await p.locator('#app-screen').waitFor({ state: 'visible', timeout: 20000 });
  await p.waitForTimeout(600);
  await p.evaluate(() => navigate('entrenamiento'));
  await p.waitForTimeout(800);
  await p.evaluate(() => { if (window.entTab) entTab('ejercicios'); });
  const aviso = p.locator('[data-aeu-aviso]');
  await aviso.waitFor({ timeout: 15000 });
  const txt = (await aviso.innerText()).replace(/\s+/g, ' ');
  ok('el aviso sale con la ficha archivada y sus 2 clientes', /1 ficha archivada/.test(txt) && /Seated Dumbbell Front Raise/.test(txt) && /2 clientes/.test(txt) && /Ana Pérez/.test(txt) && /Luis Gil/.test(txt), txt);
  ok('lado a lado: la archivada con su preview y la que quedó (Dumbbell Seated Front Raise) con la suya', (await p.locator('[data-aeu-ej="a1"] .aeu-vieja .fb-prev').count()) === 1 && (await p.locator('[data-aeu-op="e1"] .fb-prev').count()) === 1);
  ok('no propone una que no se parece (Overhead Press)', (await p.locator('[data-aeu-op="e2"]').count()) === 0);
  const donde = (await p.locator('[data-aeu-ej="a1"] [data-aeu-donde]').innerText()).replace(/\s+/g, ' ');
  ok('dice dónde: cliente, ciclo (el de ahora / el que viene) y rutina; no el ciclo viejo', /Ana Pérez · Ciclo 2 \(el de ahora\) · Push/.test(donde) && /el que viene\) · Push próximo/.test(donde) && /Luis Gil · Ciclo 4 \(el de ahora\) · Hombro/.test(donde) && !/Hombro viejo/.test(donde), donde);
  // «N clientes ahora» de una tarjeta: quién, ciclo, rutina y qué ciclo es.
  await p.locator('[data-quien-usa="e2"]').first().click();
  await p.locator('[data-quien-lista]').waitFor({ timeout: 8000 });
  const quien = (await p.locator('[data-quien-lista]').innerText()).replace(/\s+/g, ' ');
  ok('«1 cliente ahora» se toca: Luis · Ciclo 4 · Hombro «el que ve hoy» y Ciclo 3 · Hombro viejo «ciclo viejo marcado activa»', /Luis Gil · Ciclo 4 · Hombro el que ve hoy/.test(quien) && /Luis Gil · Ciclo 3 · Hombro viejo ciclo viejo marcado activa/.test(quien), quien);
  if (FOTO) await p.locator('#modal-root, .modal').first().screenshot({ path: path.join(CAPTURAS, `quien-usa-${ancho}-${FOTO}.png`) }).catch(() => {});
  await p.evaluate(() => closeModal());
  await p.waitForTimeout(300);
  if (FOTO) await aviso.screenshot({ path: path.join(CAPTURAS, `archivados-en-uso-${ancho}-${FOTO}.png`) });
  await p.locator('[data-aeu-cambiar="a1"][data-aeu-a="e1"]').click();
  await p.waitForFunction(() => !document.querySelector('[data-aeu-aviso]'), null, { timeout: 15000 }).catch(() => {});
  ok('el confirm dice a quién, que no se borra nada y que los terminados no se tocan', /2 clientes/.test(dialogo) && /no se tocan/.test(dialogo) && /No se borra nada/.test(dialogo), dialogo);
  const t = await p.evaluate(() => window.TABLAS_FALSAS);
  const re = Object.fromEntries(t.rutina_ejercicios.map(x => [x.id, x]));
  ok('su ciclo de ahora y el que viene: quedó la ficha buena', re.x1.ejercicio_id === 'e1' && re.x2.ejercicio_id === 'e1' && re.x3.ejercicio_id === 'e1', JSON.stringify(re));
  ok('mismas series, reps, descansos, orden y notas', re.x1.series === 4 && re.x1.reps === '10' && re.x1.descanso_seg === 90 && re.x1.orden === 2 && re.x1.notas === 'Codos suaves');
  ok('el ciclo terminado, el viejo que sigue marcado «activa» y la plantilla no se tocan', re.x0.ejercicio_id === 'a1' && re.x5.ejercicio_id === 'a1' && re.xb.ejercicio_id === 'a1');
  ok('los otros ejercicios no se tocan', re.x4.ejercicio_id === 'e2');
  const a1 = t.ejercicios.find(e => e.id === 'a1');
  ok('la vieja sigue archivada (no se borra) y queda apuntando a la buena', a1 && a1.archivado === true && a1.duplicado_de === 'e1' && t.ejercicios.length === 3);
  ok('queda la trazabilidad (3 líneas, origen galería)', t.cambios_ejercicio.length === 3 && t.cambios_ejercicio.every(c => c.origen === 'galeria' && c.ejercicio_antes === 'a1' && c.ejercicio_despues === 'e1'), JSON.stringify(t.cambios_ejercicio));
  ok('el aviso se va', (await p.locator('[data-aeu-aviso]').count()) === 0);
  ok('sin errores en la página', !errores.length, errores.join(' | '));
  await ctx.close();
}
await b.close(); servidor.close();
console.log(mal ? `\n${mal} fallo(s)` : '\ntodo bien');
process.exit(mal ? 1 : 0);
