// Galería · selección definitiva de videos (en uso hoy / ya elegidos / por decidir).
// Base: functional-bodybuilding.mjs. Galería · videos de Functional Bodybuilding: «los de hoy» (lado a lado:
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
    ej('e1', 'Remo con mancuerna', 'Dumbbell Row', { video_elegido_at: '2026-11-10T10:00:00Z' }),
    ej('e2', 'Plancha lateral', 'Side Plank', { video_elegido_at: '2026-11-11T10:00:00Z' }),
    ej('d1', 'Puente de glúteo', 'Glute Bridge', { video_ref: 'abc123' }),
  ],
  musculos: [], sesiones: [], series_log: [], eventos: [], evento_registros: [], actividades: [], ejercicio_video_estado: [],
  ejercicios_nombre_respaldo: [], cambios_ejercicio: [],
});


const b = await chromium.launch();
let mal = 0;
const ok = (nombre, c, extra = '') => { if (!c) mal++; console.log(`  ${c ? 'ok ' : 'MAL'}  ${nombre}${c ? '' : '  ' + extra}`); };
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
const p = await ctx.newPage(); const errores = []; p.on('pageerror', e => errores.push(e.message)); p.on('dialog', d => d.accept());
await ctx.addInitScript((t) => { window.TABLAS_FALSAS = t; }, tablas());
await p.route('**/*', (ruta) => { const u = ruta.request().url(); if (u.startsWith(BASE)) return ruta.continue();
  if (u.includes('supabase-js')) return ruta.fulfill({ contentType: 'text/javascript', body: falso });
  if (u.includes('fonts.g')) return ruta.continue().catch(() => ruta.abort());
  return ruta.fulfill({ status: 200, contentType: 'application/json', body: u.includes('/rest/v1/') ? '[]' : '{}' }); });
await p.goto(BASE + '/'); await p.locator('#app-screen').waitFor({ state: 'visible', timeout: 20000 }); await p.waitForTimeout(600);
await p.evaluate(() => navigate('entrenamiento')); await p.waitForTimeout(800); await p.evaluate(() => { if (window.entTab) entTab('ejercicios'); });
const sel = p.locator('[data-seleccion]').first(); await sel.waitFor({ timeout: 15000 });
const t0 = (await sel.innerText()).replace(/\s+/g, ' ');
ok('3 grupos: 3 en uso hoy, 2 ya elegidos, 4 por decidir (6 de 9 no; 5 de 9 listos)', /1 · En uso hoy 3 listos/.test(t0) && /2 · Ya elegiste el video 2 listos/.test(t0) && /3 · Te falta decidir 4/.test(t0) && /5 de 9 listos/.test(t0), t0);
await p.waitForTimeout(500); await sel.screenshot({ path: path.join(CAPTURAS, 'seleccion-videos.png') });
await p.locator('[data-sel-revisar]').first().click(); await p.waitForTimeout(1200);
const modal = p.locator('[data-video-rapido]'); await modal.waitFor({ timeout: 10000 });
const ids = await p.evaluate(() => _vid.cola);
ok('«Revisar uno a uno» recorre solo los 4 que faltan, primero los que tienen video', JSON.stringify(ids) === '["d1","h3","h4","h5"]', JSON.stringify(ids));
await p.screenshot({ path: path.join(CAPTURAS, 'seleccion-uno-a-uno.png') });
await p.locator('[data-vr-bien]').click(); await p.waitForTimeout(800);
let t = await p.evaluate(() => window.TABLAS_FALSAS.ejercicios);
ok('«Este está bien»: queda marcado como elegido y pasa al siguiente', !!t.find(e => e.id === 'd1').video_elegido_at && (await p.evaluate(() => _vid.cola[_vid.pos])) === 'h3');
await p.locator('[data-vr-archivar]').click(); await p.waitForTimeout(800);
t = await p.evaluate(() => window.TABLAS_FALSAS.ejercicios);
ok('«No lo necesito»: archivado y pasa al siguiente', t.find(e => e.id === 'h3').archivado === true && (await p.evaluate(() => _vid.cola[_vid.pos])) === 'h4');
await p.evaluate(() => closeModal()); await p.waitForTimeout(300); await p.evaluate(() => entRepintarGaleria()); await p.waitForTimeout(1200);
const t1 = (await p.locator('[data-seleccion]').first().innerText()).replace(/\s+/g, ' ');
ok('después: 3 ya elegidos y 2 por decidir', /2 · Ya elegiste el video 3/.test(t1) && /3 · Te falta decidir 2/.test(t1), t1);
ok('sin errores', !errores.length, errores.join(' | '));
await b.close(); servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien'); process.exit(mal ? 1 : 0);
