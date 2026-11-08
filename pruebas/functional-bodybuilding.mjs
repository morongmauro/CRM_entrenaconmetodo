// Galería · videos de Functional Bodybuilding: «los de hoy» (lado a lado:
// el video de hoy y los del canal; «Usar este» o «Dejar el actual»; primero
// los sin video) y «en análisis» (los de mismo nombre se ponen todos con un
// botón; los parecidos, uno a uno). Usa la lista real fb-videos.json.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/functional-bodybuilding.mjs
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
  clientes: [{ id: 'c1', user_id: 'coach-1', nombre: 'Ana Pérez', estado: 'activo', created_at: '2026-01-01T00:00:00Z' }],
  settings: [{ user_id: 'coach-1', usd_cop_rate: 4000, nombre_coach: 'Mauro' }],
  fases: [{ id: 'f1', cliente_id: 'c1', estado: 'activa', fecha_inicio: mas(HOY, -14), semanas: 6, visible_cliente: true, orden: 1 }],
  rutinas: [{ id: 'r1', fase_id: 'f1', cliente_id: 'c1', nombre: 'Full', archivada: false }],
  rutina_ejercicios: [
    { id: 'x1', rutina_id: 'r1', ejercicio_id: 'h1', orden: 1 }, { id: 'x2', rutina_id: 'r1', ejercicio_id: 'h2', orden: 2 },
    { id: 'x6', rutina_id: 'r1', ejercicio_id: 'h6', orden: 3 },
  ],
  ejercicios: [
    ej('h1', 'Pallof press medio arrodillado', 'Half Kneeling Pallof Press', { video_ref: 'M7lc1UVf-VE' }),
    ej('h2', 'Flexión con aplauso', 'Clapping Push Up', { video_fuente: 'ninguno', video_ref: null }),
    ej('h6', 'Sentadilla cosaca goblet', 'Goblet Cossack Squat', { video_ref: 'wrYqfSLWqdE' }),
    ej('h3', 'Sentadilla cosaca', 'Cossack Squat', { video_fuente: 'ninguno', video_ref: null }),
    ej('h4', 'Elevación frontal con mancuerna', 'Dumbbell Front Raise', { video_fuente: 'ninguno', video_ref: null }),
    ej('h5', 'Ejercicio raro', 'Zzqx Weird Thing', { video_fuente: 'ninguno', video_ref: null }),
  ],
  musculos: [], sesiones: [], series_log: [], eventos: [], evento_registros: [], actividades: [], ejercicio_video_estado: [],
  ejercicios_nombre_respaldo: [], cambios_ejercicio: [],
});

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let mal = 0;
const ok = (nombre, c, extra = '') => { if (!c) mal++; console.log(`  ${c ? 'ok ' : 'MAL'}  ${nombre}${c ? '' : '  ' + extra}`); };
const FOTO = process.env.FOTO || '';
for (const [ancho, alto] of [[1440, 1000], [390, 844]]) {
  console.log(`\n${ancho} px`);
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: FOTO ? 2 : 1 });
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
  const hoyBtn = p.locator('[data-niveles-revision] [data-nivel="fb-hoy"]');
  await hoyBtn.waitFor({ timeout: 15000 });
  ok('caja «los de hoy»: 2 (el que ya es del canal no cuenta)', /\b2\b\s*ejercicios/.test(await hoyBtn.innerText()), await hoyBtn.innerText());
  const anaBtn = p.locator('[data-niveles-revision] [data-nivel="fb-analisis"]');
  ok('caja «en análisis»: 2, 1 con el mismo nombre (el raro no sale)', /\b2\b\s*ejercicios/.test(await anaBtn.innerText()) && /1 con el mismo nombre/.test(await anaBtn.innerText()), await anaBtn.innerText());
  await hoyBtn.click();
  await p.locator('[data-fb-lista="hoy"]').waitFor({ timeout: 10000 });
  const filas = await p.locator('[data-fb-ej]').evaluateAll(l => l.map(x => x.dataset.fbEj));
  ok('primero el que no tiene video (Clapping Push Up), luego el Pallof', JSON.stringify(filas) === '["h2","h1"]', JSON.stringify(filas));
  ok('el Pallof: su video de hoy y el del canal lado a lado, «mismo nombre»', (await p.locator('[data-fb-ej="h1"] .fb-actual .fb-prev').count()) === 1 && (await p.locator('[data-fb-ej="h1"] [data-fb-cand="jT4fAKZkfr4"]').count()) === 1 && /mismo nombre/.test(await p.locator('[data-fb-ej="h1"] [data-fb-cand="jT4fAKZkfr4"]').innerText()));
  if (FOTO) { await p.waitForTimeout(1500); await p.locator('#flt-lista').screenshot({ path: path.join(CAPTURAS, `fb-hoy-${ancho}-${FOTO}.png`) }); }
  await p.locator('[data-fb-ej="h2"] [data-fb-usar="vv1aPhOLPrk"]').click();
  await p.waitForTimeout(900);
  let t = await p.evaluate(() => window.TABLAS_FALSAS.ejercicios);
  ok('«Usar este»: Clapping Push Up queda con el video del canal', t.find(e => e.id === 'h2').video_ref === 'vv1aPhOLPrk' && t.find(e => e.id === 'h2').video_fuente === 'youtube');
  await p.locator('[data-fb-dejar="h1"]').click();
  await p.waitForTimeout(900);
  t = await p.evaluate(() => window.TABLAS_FALSAS.ejercicios);
  ok('«Dejar el actual»: el Pallof sigue con su video y sale de la lista', t.find(e => e.id === 'h1').video_ref === 'M7lc1UVf-VE' && (await p.locator('[data-fb-ej]').count()) === 0);
  await p.evaluate(() => entIrNivel('fb-analisis'));
  await p.locator('[data-fb-lista="analisis"]').waitFor({ timeout: 10000 });
  ok('en análisis: Cossack Squat (mismo nombre) y Dumbbell Front Raise (parecido)', (await p.locator('[data-fb-ej="h3"] [data-fb-cand="dhDjKmTX8tU"]').count()) === 1 && (await p.locator('[data-fb-ej="h4"] .fb-cand').count()) >= 1 && (await p.locator('[data-fb-ej="h5"]').count()) === 0);
  if (FOTO) { await p.waitForTimeout(1500); await p.locator('#flt-lista').screenshot({ path: path.join(CAPTURAS, `fb-analisis-${ancho}-${FOTO}.png`) }); }
  await p.locator('[data-fb-todos]').click();
  await p.waitForTimeout(1200);
  t = await p.evaluate(() => window.TABLAS_FALSAS.ejercicios);
  ok('«Poner los de mismo nombre»: Cossack Squat queda con el del canal; el parecido no se toca', t.find(e => e.id === 'h3').video_ref === 'dhDjKmTX8tU' && !t.find(e => e.id === 'h4').video_ref);
  ok('sin errores en la página', !errores.length, errores.join(' | '));
  await ctx.close();
}
await b.close(); servidor.close();
console.log(mal ? `\n${mal} fallo(s)` : '\ntodo bien');
process.exit(mal ? 1 : 0);
