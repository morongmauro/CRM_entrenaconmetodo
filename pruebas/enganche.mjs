// Enganche (enganche.js): quién usa la app, qué usa y quién se está enfriando.
// Cifras de arriba, filtros, la lista con su siguiente paso y el 1 a 1.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/enganche.mjs
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

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const HOY = iso(new Date());
const mas = (f, n) => { const [y, m, d] = f.split('-').map(Number); const x = new Date(y, m - 1, d); x.setDate(x.getDate() + n); return iso(x); };
const LETRA = (f) => ['L', 'M', 'X', 'J', 'V', 'S', 'D'][(new Date(f + 'T12:00:00').getDay() + 6) % 7];

function tablas() {
  const cli = (id, nombre, inicio, extra = {}) => ({ id, user_id: 'coach-1', nombre, estado: 'activo', fecha_inicio: inicio, telefono: '+57 300 000 0000', created_at: '2026-01-01T00:00:00Z', ...extra });
  const clientes = [
    cli('c0', 'Ana Pérez', mas(HOY, -270), { mealtracker_id: '11111111-1111-1111-1111-111111111111' }),
    cli('c1', 'Carlos Ruiz', mas(HOY, -40)),
    cli('c2', 'Lucía Gómez', mas(HOY, -150)),
    cli('c3', 'Pedro Viejo', mas(HOY, -200), { estado: 'inactivo' }),
  ];
  const fase = (id, c) => ({ id, user_id: 'coach-1', cliente_id: c, nombre: 'Ciclo', semanas: 12, fecha_inicio: mas(HOY, -60), dias_semana: ['L', 'X', 'V'], orden: 1, estado: 'activa', visible_cliente: true });
  const sesiones = [];
  for (let k = 0; k < 56; k++) {
    const f = mas(HOY, -k);
    if (!['L', 'X', 'V'].includes(LETRA(f))) continue;
    sesiones.push({ id: `a${k}`, cliente_id: 'c0', fecha: f, estado: 'completada' });
    // Carlos: entrenaba, pero hace 6 días que nada; dejó 2 sin terminar.
    if (k >= 6) sesiones.push({ id: `b${k}`, cliente_id: 'c1', fecha: f, estado: k === 9 || k === 13 ? 'en_curso' : 'completada' });
  }
  return {
    clientes, fases: [fase('f0', 'c0'), fase('f1', 'c1'), fase('f2', 'c2')], sesiones,
    settings: [{ user_id: 'coach-1', usd_cop_rate: 4000, nombre_coach: 'Mauro', mealtracker_app_url: 'https://mt.prueba', mealtracker_coach_password: 'x' }],
    seguimientos: [], pagos: [], pendientes: [], mediciones_corporales: [], encuesta_app: [], metas_historial: [], ia_uso: [], push_pago_log: [],
    comunidad_posts: [], comunidad_reacciones: [], comunidad_comentarios: [], comunidad_vistas: [],
  };
}
// La app: Ana registra comida casi todos los días y cocina recetas; Lucía
// registra comida y abre recetas, pero no entrena; Carlos no registra comida.
function app(accion) {
  const dias = (n, salto = 0) => Object.fromEntries(Array.from({ length: n }, (_, k) => [mas(HOY, -k - salto), 0.9]));
  if (accion === 'list') return { clients: [
    { user_id: '11111111-1111-1111-1111-111111111111', name: 'Ana Pérez', day_scores: dias(26), recetas_registradas: [{ fecha: mas(HOY, -2), nombre: 'Bowl burrito de pollo' }], menus_creados: 2, favoritos: 4 },
    { user_id: '22222222-2222-2222-2222-222222222222', name: 'Lucía Gómez', day_scores: dias(20), recetas_registradas: [], menus_creados: 5, favoritos: 1 },
    { user_id: '33333333-3333-3333-3333-333333333333', name: 'Carlos Ruiz', day_scores: {}, recetas_registradas: [], menus_creados: 0, favoritos: 0 },
  ] };
  return { ok: true, uso: [
    ...Array.from({ length: 25 }, (_, k) => ({ clave: '11111111-1111-1111-1111-111111111111', user_id: '11111111-1111-1111-1111-111111111111', name: 'Ana Pérez', fecha: mas(HOY, -k), secciones: { dash: 1, comida: 1, ...(k % 3 ? {} : { aprende: 1 }) }, recetas: k === 4 ? ['Huevos con atún'] : [] })),
    ...Array.from({ length: 14 }, (_, k) => ({ clave: 'n:Lucía Gómez', user_id: null, name: 'Lucía Gómez', fecha: mas(HOY, -2 * k), secciones: { comida: 1, recetas: 1, comunidad: 1 }, recetas: ['Wrap de carne y batata'] })),
  ] };
}

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let mal = 0;
const ok = (nombre, c, extra = '') => { if (!c) mal++; console.log(`  ${c ? 'ok ' : 'MAL'}  ${nombre}${c ? '' : '  ' + extra}`); };

async function abrir(ancho, alto) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(e.message));
  await ctx.addInitScript((t) => { window.TABLAS_FALSAS = t; }, tablas());
  await p.route('**/*', (ruta) => {
    const u = ruta.request().url();
    if (u.startsWith(BASE)) return ruta.continue();
    if (u.includes('cdn.tailwindcss.com')) return ruta.fulfill({ contentType: 'text/javascript', body: `(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(tailwind)};document.head.prepend(s);window.tailwind={config:{}};})();` });
    if (u.includes('supabase-js')) return ruta.fulfill({ contentType: 'text/javascript', body: falso });
    if (u.startsWith('https://mt.prueba/api/coach-auth')) return ruta.fulfill({ contentType: 'application/json', body: JSON.stringify({ token: 't', expiresAt: Date.now() + 3600e3 }) });
    if (u.startsWith('https://mt.prueba/api/coach-data')) return ruta.fulfill({ contentType: 'application/json', body: JSON.stringify(app(new URL(u).searchParams.get('action'))) });
    if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return ruta.continue().catch(() => ruta.abort());
    return ruta.fulfill({ status: 200, contentType: 'application/json', body: u.includes('/rest/v1/') ? '[]' : '{}' });
  });
  await p.goto(BASE + '/');
  await p.locator('#app-screen').waitFor({ state: 'visible', timeout: 20000 });
  await p.waitForTimeout(800);
  return { ctx, p, errores };
}

for (const [tag, ancho] of [['ancho', 1440], ['telefono', 390]]) {
  console.log(`\n${tag}`);
  const { ctx, p, errores } = await abrir(ancho, 1100);
  ok(`${tag} · Enganche está en el menú, debajo de Listado`, await p.locator('.nav-item[data-view="enganche"]').count() === 1);
  await p.evaluate(() => navigate('enganche'));
  await p.locator('[data-eng-tabla]').waitFor({ timeout: 15000 });
  const filas = await p.locator('[data-eng-fila]').evaluateAll(els => els.map(e => e.dataset.engFila));
  ok(`${tag} · una fila por cliente activo, el que más necesita atención primero (${filas})`, filas.length === 3 && filas[0] === 'c1' && filas.at(-1) === 'c0', JSON.stringify(filas));
  const paso = async (id) => (await p.locator(`[data-eng-fila="${id}"] [data-eng-paso]`).innerText()).trim();
  ok(`${tag} · Carlos: «Escríbele: 6 días sin abrir»`, /Escríbele: 6 días sin abrir/.test(await paso('c1')), await paso('c1'));
  ok(`${tag} · Lucía: «Pregúntale por el entreno»`, /Pregúntale por el entreno/.test(await paso('c2')), await paso('c2'));
  ok(`${tag} · Ana: «Reconócelo: N semanas seguidas»`, /Reconócelo: \d+ semanas seguidas/.test(await paso('c0')), await paso('c0'));
  const ana = (await p.locator('[data-eng-fila="c0"]').innerText()).replace(/\s+/g, ' ');
  ok(`${tag} · Ana: puntaje alto, recetas abiertas y cocinadas, menús y fluidez`, /Alto/.test(ana) && /1 abierta · 1 cocinada/.test(ana) && /2 menús creados/.test(ana) && /100 %/.test(ana), ana);
  const carlos = (await p.locator('[data-eng-fila="c1"]').innerText()).replace(/\s+/g, ' ');
  ok(`${tag} · Carlos: 2 entrenos sin terminar`, /2 sin terminar/.test(carlos), carlos);
  const kpis = (await p.locator('[data-eng-kpis]').innerText()).replace(/\s+/g, ' ');
  ok(`${tag} · cifras: enfriando, recetas, fluidez y retención (Pedro, inactivo, cuenta como que no siguió)`, /se están enfriando/.test(kpis) && /2 de 3 abrieron o cocinaron recetas/.test(kpis) && /Receta top/.test(kpis) && /tras el mes 1/.test(kpis) && /2 de 3 tras el mes 2/.test(kpis), kpis);
  await p.locator('[data-eng-filtro="frio"]').click();
  ok(`${tag} · filtro «Se están enfriando»: solo Carlos`, JSON.stringify(await p.locator('[data-eng-fila]').evaluateAll(els => els.map(e => e.dataset.engFila))) === '["c1"]');
  await p.locator('[data-eng-filtro="recetas"]').click();
  ok(`${tag} · filtro «Nunca usan recetas»: solo Carlos`, JSON.stringify(await p.locator('[data-eng-fila]').evaluateAll(els => els.map(e => e.dataset.engFila))) === '["c1"]');
  await p.locator('[data-eng-filtro="todos"]').click();
  await p.screenshot({ path: path.join(CAPTURAS, `enganche-${tag}.png`), fullPage: true });
  await p.locator('[data-eng-fila="c2"]').click();
  await p.locator('[data-eng-mapas]').waitFor({ timeout: 5000 });
  const mapa = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-eng-mapa]')].map(m => [m.dataset.engMapa, [...m.querySelectorAll('span[title]')].filter(x => x.style.background && !/239, 235, 227|EFEBE3/i.test(x.style.background)).length])));
  ok(`${tag} · 1 a 1 de Lucía: 28 días por sección (comida, recetas y comunidad cada 2 días; sin entreno)`, mapa.entreno === 0 && mapa.comunidad === 14 && mapa.recetas === 14 && mapa.comida >= 20, JSON.stringify(mapa));
  const ind = (await p.locator('[data-eng-indicadores]').innerText()).replace(/\s+/g, ' ');
  ok(`${tag} · indicadores: retención, enganche, intereses, fluidez y recetas`, /Retención/.test(ind) && /Enganche/.test(ind) && /Intereses/.test(ind) && /Nunca abrió: entreno/.test(ind) && /Wrap de carne y batata/.test(ind) && /5 menús creados/.test(ind), ind);
  ok(`${tag} · botón de WhatsApp con su número`, (await p.locator('[data-eng-siguiente] a[href^="https://wa.me/573000000000"]').count()) === 1);
  await p.evaluate(() => rerenderView()); await p.waitForTimeout(300);
  ok(`${tag} · si el CRM repinta, el 1 a 1 sigue abierto`, await p.locator('[data-eng-mapas]').count() === 1);
  await p.screenshot({ path: path.join(CAPTURAS, `enganche-detalle-${tag}.png`), fullPage: true });
  await p.locator("[data-eng-volver]").click();
  ok(`${tag} · «‹ Enganche» vuelve a la lista`, await p.locator('[data-eng-tabla]').count() === 1);
  if (tag === 'telefono') ok(`${tag} · sin scroll de lado en la página`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  ok(`${tag} · sin errores`, errores.length === 0, errores.join(' | '));
  await ctx.close();
}
await b.close(); servidor.close();
console.log(mal ? `\n${mal} falla(s)` : '\ntodo bien');
process.exit(mal ? 1 : 0);
