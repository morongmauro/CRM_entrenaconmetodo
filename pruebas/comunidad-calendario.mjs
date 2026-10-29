// Calendario de publicaciones de la Comunidad: cargar los sugeridos, subir y
// bajar (la fecha se queda en su lugar), editar y publicar.
//
//   NODE_PATH=/ruta/node_modules node pruebas/comunidad-calendario.mjs
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
const tablas = {
  clientes: [{ id: 'c0', user_id: 'coach-1', nombre: 'Ana Pérez', estado: 'activo', created_at: '2026-01-01T00:00:00Z' }],
  settings: [{ user_id: 'coach-1', usd_cop_rate: 4000, nombre_coach: 'Mauro' }],
  comunidad_posts: [], comunidad_reacciones: [], comunidad_comentarios: [], comunidad_vistas: [], comunidad_bienvenida: [],
  comunidad_borradores: [],
};

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
  await ctx.addInitScript((t) => { window.TABLAS_FALSAS = t; }, tablas);
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
  await p.evaluate(() => navigate('comunidad'));
  await p.locator('[data-ccal-cargar]').waitFor({ timeout: 15000 });
  ok('vacío: ofrece cargar los 11 sugeridos', /11 mensajes/.test(await p.locator('[data-ccal-cargar]').innerText()));
  await p.locator('[data-ccal-cargar]').click();
  await p.locator('[data-ccal-fila]').first().waitFor({ timeout: 10000 });
  const fechas = () => p.locator('[data-ccal-fecha]').allInnerTexts();
  const titulos = () => p.locator('[data-ccal-titulo]').allInnerTexts();
  const f0 = await fechas(), t0 = await titulos();
  ok('11 en orden, el primero el viernes 30 de octubre', f0.length === 11 && /30/.test(f0[0]) && /oct/i.test(f0[0]), f0.slice(0, 2).join(' | '));
  await p.locator('[data-ccal-fila]').nth(0).locator('[data-ccal-bajar]').click(); await p.waitForTimeout(500);
  const f1 = await fechas(), t1 = await titulos();
  ok('bajar el primero: cambian los mensajes, las fechas se quedan', f1.join() === f0.join() && t1[0] === t0[1] && t1[1] === t0[0], t1.slice(0, 2).join(' | '));
  await p.locator('[data-ccal-fila]').nth(1).locator('[data-ccal-subir]').click(); await p.waitForTimeout(500);
  ok('subirlo de nuevo: vuelve al orden original', (await titulos()).join() === t0.join());
  ok('el primero no sube y el último no baja', await p.locator('[data-ccal-fila]').first().locator('[data-ccal-subir]').isDisabled() && await p.locator('[data-ccal-fila]').last().locator('[data-ccal-bajar]').isDisabled());
  if (FOTO) await p.screenshot({ path: path.join(CAPTURAS, `comunidad-calendario-${ancho}-${FOTO}.png`), fullPage: true });
  await p.locator('[data-ccal-fila]').nth(0).getByRole('button', { name: 'Ver y editar' }).click();
  const area = p.locator('[data-ccal-fila]').nth(0).locator('textarea');
  ok('editar muestra el mensaje completo con su fuente al final', /Fuente: Shukla/.test(await area.inputValue()));
  await area.fill('Mensaje editado.\n\nCon otra línea.');
  await p.getByRole('button', { name: 'Guardar', exact: true }).click(); await p.waitForTimeout(500);
  ok('guardar la edición', (await titulos())[0] === 'Mensaje editado.');
  await p.locator('[data-ccal-fila]').nth(0).locator('[data-ccal-publicar]').click();
  await p.locator('[data-com-post]').first().waitFor({ timeout: 10000 });
  await p.waitForTimeout(600);
  ok('publicar lo manda a la Comunidad', /Mensaje editado/.test(await p.locator('[data-com-post]').first().innerText()));
  ok('…y sale de la lista de pendientes (quedan 10)', (await p.locator('[data-ccal-fila]').count()) === 10);
  const tb = await p.evaluate(() => window.TABLAS_FALSAS.comunidad_borradores.filter(f => f.publicado_en).map(f => !!f.post_id));
  ok('el borrador queda marcado como publicado, con su publicación', tb.length === 1 && tb[0] === true);
  ok('sin errores de JavaScript', !errores.length, errores.join(' | '));
  ok('sin barra horizontal', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  if (FOTO) await p.screenshot({ path: path.join(CAPTURAS, `comunidad-calendario-${ancho}-${FOTO}-publicado.png`), fullPage: false });
  await ctx.close();
  tablas.comunidad_borradores = []; tablas.comunidad_posts = [];
}
await b.close(); servidor.close();
console.log(mal ? `\n${mal} fallo(s)` : '\ntodo bien');
process.exit(mal ? 1 : 0);
