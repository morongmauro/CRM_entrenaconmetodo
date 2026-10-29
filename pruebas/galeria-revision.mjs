// Galería · nombres en inglés y repetidos: los que salen en español traen su
// nombre sugerido; los repetidos salen agrupados, uno al lado del otro, con
// cuántos clientes usan cada uno.
//
//   NODE_PATH=/ruta/node_modules node pruebas/galeria-revision.mjs
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

const ej = (id, nombre, alias, extra = {}) => ({ id, user_id: 'coach-1', nombre, alias, busqueda: null, tipo: 'fuerza', segmento: 'tren_superior', video_fuente: 'youtube', video_ref: 'v' + id, archivado: false, musculos_primarios: [], musculos_secundarios: [], ...extra });
const tablas = () => ({
  clientes: [{ id: 'c1', user_id: 'coach-1', nombre: 'Ana Pérez', estado: 'activo', created_at: '2026-01-01T00:00:00Z' }],
  settings: [{ user_id: 'coach-1', usd_cop_rate: 4000, nombre_coach: 'Mauro' }],
  fases: [{ id: 'f1', cliente_id: 'c1', estado: 'activa', fecha_inicio: '2026-10-01', semanas: 8, visible_cliente: true }],
  rutinas: [{ id: 'r1', fase_id: 'f1', cliente_id: 'c1', nombre: 'Push', archivada: false }],
  rutina_ejercicios: [{ id: 'x1', rutina_id: 'r1', ejercicio_id: 'e2' }, { id: 'x2', rutina_id: 'r1', ejercicio_id: 'e5' }],
  ejercicios: [
    ej('e1', 'Curl martillo con cuerda en polea', null),
    ej('e2', 'Elevación lateral con mancuernas', 'Dumbbell Lateral Raise'),
    ej('e3', 'Elevaciones laterales', 'lateral raise'),
    ej('e4', 'Elevación de talones con barra', null),
    ej('e5', 'Elevación lateral en máquina', 'Machine Lateral Raise'),
    ej('e6', 'Elevaciones laterales en máquina', null),
    ej('e7', 'Pájaros con mancuernas', 'elevaciones posteriores, rear delt fly'),
    ej('e8', 'Press de banca con barra', 'Barbell Bench Press'),
  ],
  musculos: [], sesiones: [], series_log: [], eventos: [], evento_registros: [], actividades: [], ejercicio_video_estado: [],
  ejercicios_nombre_respaldo: [],
});

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let mal = 0;
const ok = (nombre, c, extra = '') => { if (!c) mal++; console.log(`  ${c ? 'ok ' : 'MAL'}  ${nombre}${c ? '' : '  ' + extra}`); };
const FOTO = process.env.FOTO || '';
for (const [ancho, alto] of [[1440, 900], [390, 844]]) {
  console.log(`\n${ancho} px`);
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(e.message));
  p.on('dialog', d => d.accept());
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
  await p.locator('[data-niveles-revision] [data-nivel="repetidos"]').waitFor({ timeout: 15000 });
  const cajas = await p.locator('[data-niveles-revision]').innerText();
  ok('resumen: 5 sin nombre en inglés y 2 grupos de repetidos', /5\s*ejercicios/.test(cajas) && /2\s*grupos/.test(cajas), cajas.replace(/\n/g, ' | '));
  await p.locator('[data-nivel="ingles"]').click(); await p.waitForTimeout(700);
  const sug = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-gr-sugerencia]')].map(d => [d.getAttribute('data-gr-sugerencia'), d.querySelector('input').value])));
  ok('curl martillo → Cable Rope Hammer Curl (Trainerize)', sug.e1 === 'Cable Rope Hammer Curl', JSON.stringify(sug));
  ok('apodo «lateral raise» → Dumbbell Lateral Raise', sug.e3 === 'Dumbbell Lateral Raise', JSON.stringify(sug));
  ok('sin Trainerize → traducción (Barbell Calf Raise)', sug.e4 === 'Barbell Calf Raise', JSON.stringify(sug));
  ok('apodo con coma → Dumbbell Rear Delt Fly', sug.e7 === 'Dumbbell Rear Delt Fly', JSON.stringify(sug));
  ok('los que ya están en inglés no salen', !('e2' in sug) && !('e8' in sug) && !('e5' in sug), JSON.stringify(Object.keys(sug)));
  if (FOTO) await p.screenshot({ path: path.join(CAPTURAS, `galeria-ingles-${ancho}-${FOTO}.png`), fullPage: true });
  await p.locator('[data-gr-sugerencia="e1"] [data-gr-poner]').click(); await p.waitForTimeout(600);
  const e1 = await p.evaluate(() => window.TABLAS_FALSAS.ejercicios.find(e => e.id === 'e1'));
  ok('«Poner»: el inglés queda en el nombre grande y el español no se toca', e1.alias === 'Cable Rope Hammer Curl' && e1.nombre === 'Curl martillo con cuerda en polea');
  await p.locator('[data-gr-todas]').click(); await p.waitForTimeout(1200);
  const t = await p.evaluate(() => window.TABLAS_FALSAS.ejercicios);
  const e3 = t.find(e => e.id === 'e3');
  ok('«Poner las sugeridas»: el apodo pasa a las palabras de búsqueda', e3.alias === 'Dumbbell Lateral Raise' && /lateral raise/.test(e3.busqueda || ''), JSON.stringify(e3));
  ok('nada se borró', t.length === 8 && t.every(e => e.nombre));
  ok('se guarda respaldo del nombre anterior', (await p.evaluate(() => window.TABLAS_FALSAS.ejercicios_nombre_respaldo.length)) >= 4);
  await p.locator('[data-nivel="repetidos"]').click(); await p.waitForTimeout(800);
  const grupos = await p.evaluate(() => [...document.querySelectorAll('[data-gr-grupo]')].map(g => [...g.querySelectorAll('[data-gr-ficha]')].map(f => f.getAttribute('data-gr-ficha'))));
  ok('repetidos agrupados: elevación lateral (e2, e3) y en máquina (e5, e6)', grupos.length === 2 && grupos.some(g => g.join() === 'e2,e3') && grupos.some(g => g.join() === 'e5,e6'), JSON.stringify(grupos));
  ok('el que usan los clientes va primero y dice «Sugerido dejar»', /Sugerido dejar/.test(await p.locator('[data-gr-ficha="e2"]').innerText()) && /1 cliente ahora/.test(await p.locator('[data-gr-ficha="e2"]').innerText()));
  if (FOTO) await p.screenshot({ path: path.join(CAPTURAS, `galeria-repetidos-${ancho}-${FOTO}.png`), fullPage: true });
  await p.locator('[data-gr-ficha="e3"] [data-gr-archivar]').click(); await p.waitForTimeout(900);
  ok('archivar: sale del grupo (no se borra)', (await p.evaluate(() => window.TABLAS_FALSAS.ejercicios.find(e => e.id === 'e3').archivado)) === true && (await p.locator('[data-gr-grupo]').count()) === 1);
  ok('sin errores de JavaScript', !errores.length, errores.join(' | '));
  ok('sin barra horizontal', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await ctx.close();
}
await b.close(); servidor.close();
console.log(mal ? `\n${mal} fallo(s)` : '\ntodo bien');
process.exit(mal ? 1 : 0);
