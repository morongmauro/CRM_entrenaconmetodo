// Bandeja → 💬 Notas: las notas del cliente separadas en «Pendientes» y
// «Listas» (las que ya marcaste Listo), con Deshacer para volverlas atrás.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/notas-listas.mjs
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

const hace = (n) => { const t = new Date(); t.setDate(t.getDate() - n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
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
    eventos: [], evento_registros: [], rutina_movimientos: [],
    actividades_catalogo: [
      { slug: 'cinta', nombre: 'Caminadora', categoria: 'cardio', icono: '🏃', orden: 10, activo: true },
      { slug: 'escaladora', nombre: 'Escaladora', categoria: 'cardio', icono: '🪜', orden: 40, activo: true },
      { slug: 'caminata', nombre: 'Caminata', categoria: 'cardio', icono: '🚶', orden: 70, activo: true },
      { slug: 'running', nombre: 'Running en calle', categoria: 'cardio', icono: '👟', orden: 60, activo: true },
      { slug: 'natacion', nombre: 'Natación', categoria: 'deporte', icono: '🏊', orden: 100, activo: true },
      { slug: 'tenis', nombre: 'Tenis', categoria: 'deporte', icono: '🎾', orden: 110, activo: true },
      { slug: 'yoga', nombre: 'Yoga', categoria: 'movilidad', icono: '🧘', orden: 200, activo: true },
      { slug: 'otro', nombre: 'Otra actividad', categoria: 'otro', icono: '✨', orden: 900, activo: true },
    ],
    comunidad_posts: [], comunidad_reacciones: [], comunidad_comentarios: [], comunidad_vistas: [],
    notas_entreno: [
      { id: 'n1', user_id: 'coach-1', cliente_id: 'c0', fecha: hace(0), texto: 'No tengo esta máquina en mi gym', leida_en: null, created_at: hace(0) + 'T10:00:00Z', ejercicios: { nombre: 'Prensa', alias: 'Leg Press' } },
      { id: 'n2', user_id: 'coach-1', cliente_id: 'c0', fecha: hace(1), texto: 'Me molestó el hombro en el press', leida_en: null, created_at: hace(1) + 'T10:00:00Z', ejercicios: null },
      { id: 'n3', user_id: 'coach-1', cliente_id: 'c0', fecha: hace(4), texto: 'Esta semana viajo, entreno en el hotel', leida_en: hace(3) + 'T12:00:00Z', created_at: hace(4) + 'T10:00:00Z', ejercicios: null },
    ],
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



for (const [tag, ancho, alto] of [['ancho', 1440, 900], ['telefono', 390, 844]]) {
  console.log(`\n${tag} (${ancho}px)`);
  const a = await abrir(ancho, alto);
  const p = a.p;
  await p.evaluate(() => { try { localStorage.removeItem('bdj:vistos:v1'); } catch (e) {} navigate('bandeja'); });
  await p.waitForSelector('text=Necesita tu atención', { timeout: 15000 });
  await p.evaluate(() => bdjFiltro('nota'));
  await p.waitForSelector('[data-notas-pendientes]', { timeout: 10000 });
  const cuenta = () => p.evaluate(() => ({
    pend: [...document.querySelectorAll('[data-notas-pendientes] .text-xs.text-slate-500')].map(x => x.textContent).join('|'),
    nPend: document.querySelectorAll('[data-notas-pendientes] button').length,
    nListas: document.querySelectorAll('[data-notas-listas] [data-nota-deshacer]').length,
    listas: document.querySelector('[data-notas-listas]')?.textContent || '',
    pendTxt: document.querySelector('[data-notas-pendientes]')?.textContent || '',
  }));
  let c = await cuenta();
  ok(`${tag} · pendientes: las que no marcaste (${c.nPend})`, /máquina/.test(c.pendTxt) && /hombro/.test(c.pendTxt) && !/viajo/.test(c.pendTxt), JSON.stringify(c));
  ok(`${tag} · listas: la que ya marcaste, con su fecha`, c.nListas === 1 && /viajo/.test(c.listas) && /listo el/.test(c.listas), JSON.stringify(c));
  ok(`${tag} · el filtro dice cuántas faltan`, /Notas \(2\)/.test(await p.locator('.chip.active').textContent()));
  if (tag === 'ancho') await p.locator('#view').screenshot({ path: path.join(CAPTURAS, 'notas-listas.png') }).catch(() => p.screenshot({ path: path.join(CAPTURAS, 'notas-listas.png'), fullPage: true }));
  else await p.screenshot({ path: path.join(CAPTURAS, 'notas-listas-telefono.png'), fullPage: true });
  await p.locator('[data-notas-pendientes] button', { hasText: 'Listo' }).first().click();
  await p.waitForTimeout(600);
  c = await cuenta();
  ok(`${tag} · «Listo» la pasa a Listas`, c.nListas === 2 && !/máquina/.test(c.pendTxt) && /máquina/.test(c.listas), JSON.stringify(c));
  ok(`${tag} · y queda marcada en la base`, await p.evaluate(() => !!TABLAS_FALSAS.notas_entreno.find(n => n.id === 'n1').leida_en));
  await p.locator('[data-notas-listas] [data-nota-deshacer]').filter({ hasText: 'Deshacer' }).nth(0).click();
  await p.waitForTimeout(800);
  c = await cuenta();
  ok(`${tag} · «Deshacer» la devuelve a Pendientes`, c.nListas === 1 && /máquina/.test(c.pendTxt) && /viajo/.test(c.listas), JSON.stringify(c));
  ok(`${tag} · no se borró ninguna nota`, await p.evaluate(() => TABLAS_FALSAS.notas_entreno.length) === 3);
  await p.evaluate(() => bdjFiltro('todo'));
  ok(`${tag} · en «Todo» sigue como antes`, await p.locator('text=Necesita tu atención').count() === 1 && await p.locator('[data-notas-listas]').count() === 0);
  ok(`${tag} · sin scroll de lado`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  ok(`${tag} · sin errores de JavaScript`, a.errores.length === 0, a.errores.join(' | '));
  await a.ctx.close();
}

await b.close();
servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
