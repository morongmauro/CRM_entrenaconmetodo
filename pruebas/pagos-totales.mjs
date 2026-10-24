// Pagos: totales del mes en pesos (USD × tasa), también cuando el cobro no trae moneda.
// cliente, la gráfica por ejercicio (peso y reps de la mejor serie de cada
// sesión) y por patrón (Empuje, Tracción, Pierna: % de fuerza frente al
// inicio, semana a semana).
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

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const MES = iso(new Date());
function tablas() {
  const cli = (id, nombre, monto, moneda) => ({ id, user_id: 'coach-1', nombre, estado: 'activo', monto, moneda, dia_pago: 28, fecha_inicio: '2026-01-05', created_at: '2026-01-01T00:00:00Z' });
  return {
    clientes: [cli('a', 'Ana COP', 280000, 'COP'), cli('b', 'Beto USD', 100, 'USD'), cli('c', 'Carla USD', 50, 'USD')],
    pagos: [
      { id: 'p1', user_id: 'coach-1', cliente_id: 'a', mes: MES, monto: 280000, moneda: 'COP', pagado: true },
      // El cobro que genera el mes automático: sin moneda. Beto paga en USD.
      { id: 'p2', user_id: 'coach-1', cliente_id: 'b', mes: MES, monto: 100, moneda: null, pagado: false },
    ],
    seguimientos: [], pendientes: [], mediciones_corporales: [], metas_historial: [], nutricion_insights: [], ia_uso: [], push_pago_log: [],
    settings: [{ user_id: 'coach-1', usd_cop_rate: 4000, nombre_coach: 'Mauro' }],
    comunidad_posts: [], comunidad_reacciones: [], comunidad_comentarios: [], comunidad_vistas: [],
  };
}
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let mal = 0;
const ok = (nombre, c, extra = '') => { if (!c) mal++; console.log(`  ${c ? 'ok ' : 'MAL'}  ${nombre}${c ? '' : '  ' + extra}`); };
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
const errores = [];
p.on('pageerror', e => errores.push(e.message));
await ctx.addInitScript((t) => { window.TABLAS_FALSAS = t; }, tablas());
await p.route('**/*', (ruta) => {
  const u = ruta.request().url();
  if (u.startsWith(BASE)) return ruta.continue();
  if (u.includes('cdn.tailwindcss.com')) return ruta.fulfill({ contentType: 'text/javascript', body: `(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(tailwind)};document.head.prepend(s);window.tailwind={config:{}};})();` });
  if (u.includes('supabase-js')) return ruta.fulfill({ contentType: 'text/javascript', body: falso });
  if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return ruta.continue().catch(() => ruta.abort());
  return ruta.fulfill({ status: 200, contentType: 'application/json', body: u.includes('/rest/v1/') ? '[]' : '{}' });
});
await p.goto(BASE + '/');
await p.locator('#app-screen').waitFor({ state: 'visible', timeout: 20000 });
await p.waitForTimeout(600);
await p.evaluate(() => navigate('pagos'));
await p.locator('[data-pagos-totales]').waitFor({ timeout: 15000 });
await p.locator('[data-pagos-fila="total"]').waitFor({ timeout: 15000 });
const num = (t) => Number(String(t).replace(/[^\d]/g, ''));
const r = await p.evaluate(() => ({
  total: document.querySelector('[data-pagos-total-mes] .text-3xl').textContent,
  cobrado: document.querySelector('[data-pagos-cobrado] .text-3xl').textContent,
  falta: document.querySelector('[data-pagos-falta] .text-3xl').textContent,
  filas: Object.fromEntries([...document.querySelectorAll('[data-pagos-fila]')].map(f => [f.dataset.pagosFila, [...f.querySelectorAll('td')].map(td => td.textContent.trim())])),
}));
const col = new Date().getMonth() + 1; // la columna del mes (después del título)
ok('Ya pagaron: 280.000', num(r.cobrado) === 280000, r.cobrado);
ok('Falta por pagar: Beto 100 USD × 4.000 + Carla 50 USD (sin cobro generado) × 4.000 = 600.000', num(r.falta) === 600000, r.falta);
ok('Total a recibir del mes: 880.000', num(r.total) === 880000, r.total);
ok('tabla, fila «Ya pagaron» del mes: 280.000', num(r.filas.pagado[col]) === 280000, JSON.stringify(r.filas.pagado));
ok('tabla, fila «Falta por pagar» del mes: el cobro en USD sin moneda se convierte (400.000)', num(r.filas.falta[col]) === 400000, JSON.stringify(r.filas.falta));
ok('tabla, fila «Total mes»: 680.000', num(r.filas.total[col]) === 680000, JSON.stringify(r.filas.total));
const fila = await p.evaluate(() => [...document.querySelectorAll('.pay-table tbody tr')].find(tr => tr.textContent.includes('Beto USD'))?.querySelector('.total-cell')?.textContent);
ok('total año de Beto (USD) en pesos: 400.000', num(fila) === 400000, fila);
await p.screenshot({ path: path.join(CAPTURAS, 'pagos-totales.png') });
await p.locator('.pay-table').screenshot({ path: path.join(CAPTURAS, 'pagos-totales-tabla.png') });
ok('sin errores', errores.length === 0, errores.join(' | '));
await b.close(); servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
