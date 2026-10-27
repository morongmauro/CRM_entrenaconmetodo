// «Lo que ve en sus gráficas»: lo primero en el seguimiento del cliente son
// los números de los aros de su app (semana, entrenamiento, alimentación y
// aprendizaje) y su performance, con las mismas reglas de la app.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/puntos-app.mjs
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
function tablas() {
  const cliente = { id: 'c0', user_id: 'coach-1', nombre: 'Ana Pérez', estado: 'activo', objetivo: 'Ganar músculo', monto: 280000, moneda: 'COP', dia_pago: 5, fecha_inicio: '2026-01-05', created_at: '2026-01-01T00:00:00Z', mealtracker_id: '11111111-2222-3333-4444-555555555555' };
  return {
    clientes: [cliente], seguimientos: [], pagos: [], pendientes: [], mediciones_corporales: [], fotos_progreso: [],
    settings: [{ user_id: 'coach-1', usd_cop_rate: 4000, nombre_coach: 'Mauro', mealtracker_app_url: 'https://mt.prueba', mealtracker_coach_password: 'x' }],
    metas_historial: [], nutricion_insights: [], ia_uso: [], push_pago_log: [],
    fases: [], rutinas: [], rutina_ejercicios: [], rutina_bloques: [], sesiones: [], series_log: [], ejercicios: [],
    eventos: [], evento_registros: [], actividades: [], notas_entreno: [], comentarios_coach: [], videos_tecnica: [], cambios_ejercicio: [],
    rutina_movimientos: [], rutina_extras: [], rutina_dias_quitados: [],
    comunidad_posts: [], comunidad_reacciones: [], comunidad_comentarios: [], comunidad_vistas: [],
  };
}
// Lo que contesta la app (coach-data · puntos). Jueves 29: registró lunes,
// martes y jueves (el miércoles no); 2 de 4 rutinas, 3 que ya tocaban.
export const PUNTOS = {
  ok: true, name: 'Ana Pérez', hoy: '2026-10-29', goals: { kcal: 2000, p: 150, c: 200, g: 60 },
  history: {
    '2026-10-22': { kcal: 2100, p: 140, c: 210, g: 65 }, '2026-10-23': { kcal: 1800, p: 120, c: 180, g: 50 },
    '2026-10-26': { kcal: 2000, p: 150, c: 200, g: 60 }, '2026-10-27': { kcal: 1600, p: 100, c: 150, g: 70 },
    '2026-10-29': { kcal: 900, p: 60, c: 90, g: 30 },
  },
  semana: { desde: '2026-10-26', hasta: '2026-11-01', fuerza: { hechos: 2, planeados: 4, planeados_hoy: 3 }, bono: 4, penal: 0 },
  semanas: [{ desde: '2026-10-05', planeados: 4, hechos: 4 }, { desde: '2026-10-12', planeados: 4, hechos: 3 }, { desde: '2026-10-19', planeados: 4, hechos: 2 }, { desde: '2026-10-26', planeados: 4, hechos: 2 }],
};
export const LECTURAS = [
  { client_name: 'Ana Perez', source: 'hub', section_key: 'programa' },
  { client_name: 'ana pérez', source: 'hub', section_key: 'recorrido' },
  { client_name: 'Ana Pérez', source: 'ga', section_key: 'capitulo-1-antes-de-cambiar-tu-alimentacion-entiende-tu-cuer' },
  { client_name: 'Ana Pérez', source: 'capsula', section_key: 'cap:ent-01-capacidades' },
  { client_name: 'Ana Pérez', source: 'podcast', section_key: 'pod:compra-cafe' },
  { client_name: 'Otra Persona', source: 'capsula', section_key: 'cap:ent-02-crece-musculo' },
];

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let mal = 0;
const ok = (nombre, c, extra = '') => { if (!c) mal++; console.log(`  ${c ? 'ok ' : 'MAL'}  ${nombre}${c ? '' : '  ' + extra}`); };

async function abrir(ancho, alto, { puntos = PUNTOS } = {}) {
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
    if (u.startsWith('https://mt.prueba/api/coach-auth')) return ruta.fulfill({ contentType: 'application/json', body: JSON.stringify({ token: 't', expiresAt: Date.now() + 3600e3 }) });
    if (u.startsWith('https://mt.prueba/api/coach-data') && u.includes('action=puntos')) return puntos ? ruta.fulfill({ contentType: 'application/json', body: JSON.stringify(puntos) }) : ruta.fulfill({ status: 500, body: '{}' });
    if (u.startsWith('https://mt.prueba/api/coach-data')) return ruta.fulfill({ contentType: 'application/json', body: JSON.stringify({ clients: [] }) });
    if (u.includes('/rest/v1/reading_state')) return ruta.fulfill({ contentType: 'application/json', body: JSON.stringify(LECTURAS) });
    if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return ruta.continue().catch(() => ruta.abort());
    return ruta.fulfill({ status: 200, contentType: 'application/json', body: u.includes('/rest/v1/') ? '[]' : '{}' });
  });
  await p.goto(BASE + '/');
  await p.locator('#app-screen').waitFor({ state: 'visible', timeout: 20000 });
  await p.waitForTimeout(800);
  await p.evaluate(() => { try { localStorage.setItem('crm:segModo', 'semana'); } catch (e) {} navigate('seguimiento'); });
  await p.locator('#seg-semana').waitFor({ state: 'attached', timeout: 15000 });
  return { ctx, p, errores };
}

const FOTO = process.env.FOTO || '';
const texto = (p, sel) => p.locator(sel).innerText().catch(() => '');
{
  console.log('\nancho');
  const { ctx, p, errores } = await abrir(1440, 1000);
  await p.locator('[data-pa="global"]').waitFor({ timeout: 15000 });
  await p.waitForTimeout(400);
  if (FOTO) await p.screenshot({ path: path.join(CAPTURAS, `puntos-app-${FOTO}.png`) });
  await p.locator('#seg-puntos').screenshot({ path: path.join(CAPTURAS, `puntos-app-tarjeta${FOTO ? '-' + FOTO : ''}.png`) });
  ok('es lo primero del seguimiento del cliente', await p.evaluate(() => document.querySelector('#seg-semana').firstElementChild.id === 'seg-puntos'));
  ok('Semana: 46% (promedio de entreno 50% y comida 3/7)', /46%/.test(await texto(p, '[data-pa="global"]')), await texto(p, '[data-pa="global"]'));
  const ent = await texto(p, '[data-pa="entreno"]');
  ok('Entrenamiento: 50% · 2 de 4 rutinas · 1 sin hacer', /50%/.test(ent) && /2 de 4 rutinas/.test(ent) && /1 sin hacer/.test(ent), ent);
  const com = await texto(p, '[data-pa="comida"]');
  ok('Alimentación: 43% · 3 de 7 días · 1 sin registrar', /43%/.test(com) && /3 de 7 días/.test(com) && /1 sin registrar/.test(com), com);
  const apr = await texto(p, '[data-pa="aprende"]');
  ok('Aprendizaje: 8% · 5 de 60 piezas, por bloque (sin contar lo de otra persona)', /8%/.test(apr) && /5 de 60 piezas/.test(apr) && /Sobre el programa 2\/4/.test(apr) && /Cápsulas 1\/11/.test(apr), apr);
  const perf = await texto(p, '[data-pa-perf]');
  ok('Performance: fuerza 8 semanas 69%, calorías 94% de su meta, cerca de sus metas 55%', /69%/.test(perf) && /94%/.test(perf) && /55%/.test(perf) && /\+4 por cardio/.test(perf), perf);
  ok('sin errores de JavaScript', errores.length === 0, errores.join(' | '));
  await ctx.close();
}
{
  console.log('\nsin app');
  const { ctx, p, errores } = await abrir(1440, 1000, { puntos: null });
  await p.waitForTimeout(1500);
  ok('si la app no contesta lo dice, sin romper el seguimiento', /No pude leer su app/.test(await texto(p, '#seg-puntos')) && (await p.locator('[data-seg-tareas]').count()) === 1);
  ok('sin errores de JavaScript', errores.length === 0, errores.join(' | '));
  await ctx.close();
}
{
  console.log('\ntelefono');
  const { ctx, p, errores } = await abrir(390, 900);
  await p.evaluate(() => { const li = document.querySelector('[data-seg-li="c0"]'); if (li) li.click(); });
  await p.locator('[data-pa="global"]').waitFor({ timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(400);
  if (await p.locator('#seg-puntos').count()) await p.locator('#seg-puntos').screenshot({ path: path.join(CAPTURAS, `puntos-app-telefono${FOTO ? '-' + FOTO : ''}.png`) });
  ok('teléfono: la tarjeta cabe sin desbordar', await p.evaluate(() => { const c = document.getElementById('seg-puntos'); return !!c && c.scrollWidth <= c.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1; }));
  ok('teléfono: sin errores de JavaScript', errores.length === 0, errores.join(' | '));
  await ctx.close();
}
await b.close(); servidor.close();
console.log(mal ? `\n${mal} falla(s)` : '\ntodo bien');
process.exit(mal ? 1 : 0);
