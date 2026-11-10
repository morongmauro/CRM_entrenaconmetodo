// Un ciclo nuevo se envía solo en cuanto tiene rutinas (sin «Enviar al cliente»).
// Los de antes de la fecha de corte, los vacíos y los retirados a mano no se tocan.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/ciclo-auto-envio.mjs
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

const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const NUEVO = new Date().toISOString(), VIEJO = '2026-01-01T00:00:00Z';
const fase = (id, nombre, empiezaEn, orden, estado, enviada, creado, extra = {}) => ({ id, cliente_id: 'c0', user_id: 'coach-1', nombre, semanas: 4, estado,
  visible_cliente: enviada, publicada_en: enviada ? VIEJO : null, fecha_inicio: iso(empiezaEn), orden, created_at: creado, ...extra });
function tablas() {
  const clientes = [{ id: 'c0', user_id: 'coach-1', nombre: 'Ana Pérez', estado: 'activo', monto: 1, moneda: 'COP', dia_pago: 5, created_at: VIEJO }];
  const fases = [
    fase('f1', 'Ciclo 1', -20, 1, 'activa', true, VIEJO),                                   // el de hoy, enviado
    fase('f2', 'Ciclo 2', 8, 2, 'borrador', false, NUEVO),                                  // nuevo, con rutinas, arranca en 8 días
    fase('f3', 'Ciclo vacío', 30, 3, 'borrador', false, NUEVO),                             // nuevo, sin rutinas
    fase('f4', 'Borrador viejo', -5, 4, 'borrador', false, VIEJO),                          // de antes: no se toca
    fase('f5', 'Retirado', 40, 5, 'activa', false, NUEVO, { publicada_en: NUEVO }),         // lo retiré a mano
  ];
  const rut = (id, f) => ({ id, cliente_id: 'c0', fase_id: f, user_id: 'coach-1', nombre: 'Rutina ' + id, dia_orden: 1, dias_semana: ['L'], archivada: false });
  const rutinas = [rut('r1', 'f1'), rut('r2', 'f2'), rut('r4', 'f4'), rut('r5', 'f5')];
  return { clientes, fases, rutinas, seguimientos: [], pagos: [], pendientes: [], mediciones_corporales: [], settings: [{ user_id: 'coach-1', usd_cop_rate: 4000, nombre_coach: 'Mauro' }],
    metas_historial: [], nutricion_insights: [], ia_uso: [], push_pago_log: [], rutina_ejercicios: [], sesiones: [], series_log: [], ejercicios: [],
    comunidad_posts: [], comunidad_reacciones: [], comunidad_comentarios: [], comunidad_vistas: [], ejercicios_no_sirven: [], comentarios_coach: [] };
}
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let mal = 0;
const ok = (nombre, c, extra = '') => { if (!c) mal++; console.log(`  ${c ? 'ok ' : 'MAL'}  ${nombre}${c ? '' : '  ' + extra}`); };

async function abrir() {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
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
    if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return ruta.continue().catch(() => ruta.abort());
    return ruta.fulfill({ status: 200, contentType: 'application/json', body: u.includes('/rest/v1/') ? '[]' : '{}' });
  });
  await p.goto(BASE + '/');
  await p.locator('#app-screen').waitFor({ state: 'visible', timeout: 20000 });
  await p.waitForTimeout(800);
  // Entrenamiento del cliente c0
  await p.evaluate(() => { _ent.tab = 'clientes'; _ent.clienteId = 'c0'; _ent.faseId = null; return navigate('entrenamiento'); });
  await p.waitForSelector('[data-tab-ent="fases"], select[onchange^="entVerFase"]', { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(800);
  return { ctx, p, errores };
}
const fila = (p) => p.evaluate(() => Object.fromEntries(window.TABLAS_FALSAS.fases.map(f => [f.id, [f.estado, f.visible_cliente === true].join(':')])));

{
  const { ctx, p, errores } = await abrir();
  let e = await fila(p);
  ok('el ciclo nuevo con rutinas quedó enviado solo (y pasó de borrador a activa)', e.f2 === 'activa:true', JSON.stringify(e));
  ok('el de hoy sigue igual: el nuevo arranca después y no lo reemplaza', e.f1 === 'activa:true', JSON.stringify(e));
  ok('el nuevo SIN rutinas no se envía todavía', e.f3 === 'borrador:false', JSON.stringify(e));
  ok('un borrador de antes de la fecha de corte no se toca', e.f4 === 'borrador:false', JSON.stringify(e));
  ok('el que retiré a mano no se vuelve a enviar', e.f5 === 'activa:false', JSON.stringify(e));
  await p.evaluate(() => entSubtab && entSubtab('fases')).catch(() => {});
  await p.waitForTimeout(700);
  const t = await p.evaluate(() => document.querySelector('#view').innerText.replace(/\s+/g, ' '));
  ok('el vacío dice «se envía solo al añadir una rutina» y no tiene botón de enviar', await p.locator('[data-ciclo-auto]').count() === 1, t.slice(0, 300));
  const botones = await p.evaluate(() => [...document.querySelectorAll('button')].filter(b => /Enviar al cliente/.test(b.innerText)).length);
  ok('«Enviar al cliente» solo queda en los que no se envían solos (el viejo y el retirado)', botones === 2, String(botones));
  await p.screenshot({ path: path.join(CAPTURAS, 'ciclo-auto-envio.png'), fullPage: true });
  // Le añado una rutina al vacío: al volver a cargar, se envía solo.
  await p.evaluate(() => { window.TABLAS_FALSAS.rutinas.push({ id: 'r3', cliente_id: 'c0', fase_id: 'f3', user_id: 'coach-1', nombre: 'Rutina nueva', dia_orden: 1, dias_semana: ['L'], archivada: false }); return entVistaClientes(); });
  await p.waitForTimeout(900);
  e = await fila(p);
  ok('al añadirle una rutina al vacío, queda enviado solo', e.f3 === 'activa:true', JSON.stringify(e));
  ok('sin errores de JavaScript', errores.length === 0, errores.join(' | '));
  await ctx.close();
}
await b.close(); servidor.close();
console.log(mal ? `\n${mal} fallo(s)` : '\ntodo bien');
process.exit(mal ? 1 : 0);
