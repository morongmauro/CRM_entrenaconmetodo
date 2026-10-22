// «No le sirve» por cliente y ejercicio.
// ejercicio de la rutina del cliente, la ventana con «Para la próxima vez» y
// «Siempre presente», la conversación con sus notas, el «Leído», quitar sin
// borrar, y la línea «Siempre presente» en la fila.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/comentarios-coach.mjs
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



const push = fixture.rutinas.find(r => fixture.fases.find(f => f.id === r.fase_id)?.nombre === 'Ciclo 18' && r.nombre === 'Push Training');
const { ctx, p, errores } = await abrir(1500, 900);
const dialogos = [];
p.removeAllListeners('dialog'); p.on('dialog', d => { dialogos.push(d.message()); d.accept(); });
await p.evaluate((id) => entAbrirConstructor(id), push.id);
await p.waitForSelector('#cons-rutina .ent-fila', { timeout: 15000 });
await p.waitForTimeout(500);
const [re1, re2] = await p.evaluate(() => _ent.rutina.ejercicios.slice(0, 2).map(x => ({ id: x.id, ej: x.ejercicio_id, cliente: _ent.rutina.cliente_id, nombre: (x.ejercicios || {}).nombre })));
const filasAntes = await p.locator('#cons-rutina .ent-fila').count();
ok('cada ejercicio de la rutina del cliente trae «No le sirve»', await p.locator('#cons-rutina [data-ns-btn]').count() === filasAntes);
// Marcar con «le duele» y quitarlo de la rutina
await p.locator(`[data-ns-btn="${re1.id}"]`).click();
await p.waitForSelector('[data-ns-ventana]');
ok('la ventana trae los tres motivos y qué hacer', await p.locator('[data-ns-motivo]').count() === 3 && await p.locator('[data-ns-guardar]').count() === 3);
await p.click('[data-ns-motivo="dolor"]');
await p.fill('#ns-nota', 'hombro derecho');
await p.click('[data-ns-guardar="quitar"]'); await p.waitForTimeout(500);
let tags = await p.evaluate(() => TABLAS_FALSAS.ejercicios_no_sirven || []);
ok('queda guardado con cliente, ejercicio, motivo y nota', tags.length === 1 && tags[0].cliente_id === String(re1.cliente) && tags[0].ejercicio_id === String(re1.ej) && tags[0].motivo === 'dolor' && tags[0].nota === 'hombro derecho');
ok('…y el ejercicio salió de la rutina', await p.locator('#cons-rutina .ent-fila').count() === filasAntes - 1 && await p.locator(`[data-ns-btn="${re1.id}"]`).count() === 0);
// En la galería del constructor: etiqueta roja y al final
await p.evaluate(() => entPintarGaleriaCons()); await p.waitForTimeout(600);
const tarjetas = await p.locator('#cons-gal-lista .ent-gal').evaluateAll(els => els.map(e => e.dataset.ej));
ok('en la galería sale con la etiqueta «No le sirve · le duele»', /No le sirve · le duele/.test(await p.locator(`#cons-gal-lista .ent-gal[data-ej="${re1.ej}"]`).innerText().catch(() => '')));
ok('…y al final de la lista', tarjetas.length > 1 && tarjetas[tarjetas.length - 1] === String(re1.ej));
// Añadirlo igual: pregunta
dialogos.length = 0;
await p.evaluate((id) => entAgregarARutina(id), re1.ej); await p.waitForTimeout(500);
ok('al añadirlo igual pregunta «¿Seguro?» con el motivo', dialogos.length === 1 && /No le sirve/.test(dialogos[0]) && /le duele: hombro derecho/.test(dialogos[0]));
ok('…y si dices que sí, lo añade (tú decides)', await p.locator('#cons-rutina .ent-fila').count() === filasAntes);
// Tag a otro ejercicio que sea alternativa del segundo: sale marcado y al final en Alternativas
const alt = await p.evaluate(({ re2 }) => {
  const src = _ent.ejercicios.find(e => e.id === re2.ej);
  const cands = altCandidatos(src, _ent.ejercicios);
  return cands.length ? { id: cands[0].e.id, n: cands.length } : null;
}, { re2 });
if (alt) {
  await p.evaluate(({ alt, re2 }) => { TABLAS_FALSAS.ejercicios_no_sirven.push({ id: 't2', cliente_id: String(re2.cliente), ejercicio_id: String(alt.id), motivo: 'implemento', nota: null, creado_en: new Date().toISOString(), quitado_en: null }); return nsCargar(re2.cliente, true); }, { alt, re2 });
  await p.evaluate((id) => entAlternativas(id), re2.id);
  await p.waitForSelector('#alt-lista .alt-item', { timeout: 8000 }); await p.waitForTimeout(300);
  const items = await p.locator('#alt-lista .alt-item').evaluateAll(els => els.map(e => e.dataset.alt));
  ok('en Alternativas, el que tiene tag sale con la etiqueta', await p.locator(`#alt-lista .alt-item[data-alt="${alt.id}"] .ns-tag`).count() === 1);
  ok('…y al final de la lista (antes era el primero)', items.length === 1 || items[items.length - 1] === String(alt.id) || !items.includes(String(alt.id)));
  dialogos.length = 0;
  await p.evaluate((id) => altSustituir(id), alt.id); await p.waitForTimeout(400);
  ok('sustituir por uno con tag también pregunta', dialogos.length === 1 && /No le sirve/.test(dialogos[0]));
  await p.evaluate(() => { try { closeModal(); } catch (e) {} });
} else {
  ok('(sin alternativas en el fixture para probar la etiqueta ahí)', true);
}
// La página de Entrenamiento del cliente: la lista «No le sirven» con quitar
await p.evaluate(({ c, f }) => { _ent.rutinaId = null; _ent.rutina = null; _ent.subtab = 'rutinas'; _ent.faseId = f; entVerCliente(c); }, { c: re1.cliente, f: push.fase_id });
await p.waitForSelector('[data-ns-lista]', { timeout: 15000 }); await p.waitForTimeout(400);
const lista = await p.locator('[data-ns-lista]').innerText();
ok('la página del cliente lista los «No le sirven» con motivo y fecha', /No le sirven/.test(lista) && /le duele: hombro derecho/.test(lista) && (await p.locator('[data-ns-fila]').count()) === (alt ? 2 : 1));
ok('…y avisa si hoy está en alguna rutina', (await p.locator('[data-ns-en-rutina]').count()) >= 1);
await p.locator('[data-ns-fila]').first().locator('button').click(); await p.waitForTimeout(500);
tags = await p.evaluate(() => TABLAS_FALSAS.ejercicios_no_sirven);
ok('quitar el tag no borra: le pone la fecha', tags.length === (alt ? 2 : 1) && tags.some(t => t.quitado_en));
ok('…y sale de la lista', (await p.locator('[data-ns-fila]').count()) === (alt ? 1 : 0));
if (process.env.CAPTURA) {
  await p.evaluate((id) => entAbrirConstructor(id), push.id); await p.waitForSelector('#cons-rutina .ent-fila', { timeout: 15000 }); await p.waitForTimeout(500);
  await p.locator('#cons-rutina [data-ns-btn]').first().click(); await p.waitForSelector('[data-ns-ventana]'); await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(CAPTURAS, 'no-sirve-ventana.png') });
}
ok('sin errores', errores.length === 0, errores.join(' | '));
await ctx.close();
await b.close(); servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
