// Si la lista de clientes falla al cargar (red del celular), el CRM no se queda
// con «0 clientes»: lo dice, deja reintentar y a la siguiente lectura aparecen.
//
//   TAILWIND_CSS=/ruta/tailwind.css node pruebas/clientes-fallo.mjs
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

const cli = (id, nombre) => ({ id, user_id: 'coach-1', nombre, estado: 'activo', fecha_inicio: '2026-06-01', telefono: '+57 300 000 0000', created_at: '2026-01-01T00:00:00Z' });
const tablas = () => ({
  clientes: [cli('c0', 'Ana Pérez'), cli('c1', 'Carlos Ruiz'), cli('c2', 'Lucía Gómez')],
  fases: [], sesiones: [], rutinas: [], notas_entreno: [],
  settings: [{ user_id: 'coach-1', usd_cop_rate: 4000, nombre_coach: 'Mauro' }],
  seguimientos: [], seguimiento_mensajes: [], seguimiento_pedidos: [], pagos: [], pendientes: [], mediciones_corporales: [],
  encuesta_app: [], metas_historial: [], ia_uso: [], push_pago_log: [],
  comunidad_posts: [], comunidad_reacciones: [], comunidad_comentarios: [], comunidad_vistas: [],
});

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let mal = 0;
const ok = (nombre, c, extra = '') => { if (!c) mal++; console.log(`  ${c ? 'ok ' : 'MAL'}  ${nombre}${c ? '' : '  ' + extra}`); };

async function abrir(fallas) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(e.message));
  await ctx.addInitScript(([t, f]) => { window.TABLAS_FALSAS = t; window.FALLAR_TABLA = { clientes: f }; }, [tablas(), fallas]);
  await p.route('**/*', (ruta) => {
    const u = ruta.request().url();
    if (u.startsWith(BASE)) return ruta.continue();
    if (u.includes('cdn.tailwindcss.com')) return ruta.fulfill({ contentType: 'text/javascript', body: `(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(tailwind)};document.head.appendChild(s);})();` });
    if (u.includes('supabase-js')) return ruta.fulfill({ contentType: 'text/javascript', body: falso });
    if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return ruta.continue().catch(() => ruta.abort());
    return ruta.fulfill({ status: 200, contentType: 'application/json', body: u.includes('/rest/v1/') ? '[]' : '{}' });
  });
  await p.goto(BASE + '/');
  await p.locator('#app-screen').waitFor({ state: 'visible', timeout: 20000 });
  await p.waitForTimeout(1200);
  return { ctx, p, errores };
}
const todos = async (p) => (await p.locator('[data-cp-filtro="todos"]').innerText().catch(() => '')).replace(/\s+/g, ' ');

// Un fallo pasajero (una sola lectura): se reintenta solo y los clientes salen.
{
  const { ctx, p, errores } = await abrir(1);
  await p.evaluate(() => navigate('equipo'));
  await p.locator('[data-cp-tabla]').waitFor({ timeout: 15000 });
  ok('un fallo pasajero: se reintenta solo y salen los 3 clientes', /Todos · 3/.test(await todos(p)), await todos(p));
  ok('sin errores', errores.length === 0, errores.join(' | '));
  await ctx.close();
}
// La red sigue caída mientras carga: lo dice (no «Nadie en este filtro») y deja reintentar.
{
  const { ctx, p, errores } = await abrir(50);
  await p.evaluate(() => navigate('equipo'));
  await p.locator('[data-cp-tabla]').waitFor({ timeout: 15000 });
  ok('sin red: dice «No pude cargar tus clientes», no «Nadie en este filtro»', await p.locator('[data-cp-fallo]').count() === 1 && !/Nadie en este filtro/.test(await p.locator('[data-cp-tabla]').innerText()), await p.locator('[data-cp-tabla]').innerText());
  await p.screenshot({ path: path.join(CAPTURAS, 'clientes-fallo.png') });
  // Vuelve la red: sin recargar la página, al cambiar de sección y volver ya están.
  await p.evaluate(() => { window.FALLAR_TABLA = {}; });
  await p.evaluate(() => navigate('hoy')); await p.waitForTimeout(900);
  await p.evaluate(() => navigate('equipo'));
  await p.locator('[data-cp-tabla]').waitFor({ timeout: 15000 }); await p.waitForTimeout(600);
  ok('vuelve la red: al volver a Equipo salen los 3 (antes quedaba en 0 hasta recargar)', /Todos · 3/.test(await todos(p)), await todos(p));
  await p.screenshot({ path: path.join(CAPTURAS, 'clientes-fallo-despues.png') });
  ok('sin errores', errores.length === 0, errores.join(' | '));
  await ctx.close();
}
// El botón «Volver a intentar».
{
  const { ctx, p } = await abrir(50);
  await p.evaluate(() => navigate('equipo'));
  await p.locator('[data-cp-fallo]').waitFor({ timeout: 15000 });
  await p.evaluate(() => { window.FALLAR_TABLA = {}; });
  await p.locator('[data-cp-fallo] button').click();
  await p.waitForFunction(() => /Todos · 3/.test((document.querySelector('[data-cp-filtro="todos"]') || {}).innerText || ''), null, { timeout: 15000 }).catch(() => {});
  ok('«Volver a intentar» trae los clientes', /Todos · 3/.test(await todos(p)), await todos(p));
  await ctx.close();
}
await b.close(); servidor.close();
console.log(mal ? `\n${mal} fallo(s)` : '\ntodo bien');
process.exit(mal ? 1 : 0);
