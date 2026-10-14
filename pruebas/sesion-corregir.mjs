// Corregir lo que el cliente marcó: quitar un entreno marcado por error o
// moverlo a otro día, desde el panel del día del calendario y desde la
// pestaña «Lo que entrenó». Solo esa sesión; nada más se toca.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/sesion-corregir.mjs
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
    eventos: [], evento_registros: [], rutina_movimientos: [], rutina_extras: [], rutina_dias_quitados: [],
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

const c18 = fixture.fases.find(f => f.nombre === 'Ciclo 18');   // 7 sep, 5 semanas
const { p, ctx, errores } = await abrir(1440, 900);
await p.evaluate(() => { fmt.hoy = () => '2026-09-20'; return verEntrenamientoCliente('c0'); });
await p.waitForSelector('[data-cal-lote]', { timeout: 15000 });
await p.evaluate((id) => entVerFase(id), c18.id);
await p.waitForSelector('.ent-celda[data-fecha="2026-09-15"] .ent-marca-ok', { timeout: 8000 });
const sesiones = () => p.evaluate(() => TABLAS_FALSAS.sesiones.map(s => ({ id: s.id, fecha: s.fecha, semana_iso: s.semana_iso, semana_num: s.semana_num, rutina_id: s.rutina_id })));
const series = (id) => p.evaluate((id) => TABLAS_FALSAS.series_log.filter(l => l.sesion_id === id).length, id);
const antes = await sesiones();
const s15 = antes.find(s => s.fecha === '2026-09-15');
const seriesAntes = await series(s15.id);

// ── Quitar, desde el panel del día ──
await p.locator('.ent-celda[data-fecha="2026-09-15"]').click();
await p.waitForSelector('[data-fz-sesiones]', { timeout: 5000 });
const panel = p.locator('[data-dia-fuerza]');
ok('el día entrenado sigue diciendo «ya entrenó» y no ofrece cambiar el plan solo ese día', /ya entrenó/.test(await panel.innerText()) && await p.locator('[data-fz-solo-dia]').count() === 0);
ok('…y ofrece corregir la sesión: mover a otro día o quitarla', await p.locator(`[data-fz-sesion="${s15.id}"] [data-fz-mover-sesion]`).count() === 1
  && await p.locator(`[data-fz-sesion="${s15.id}"] [data-fz-quitar-sesion]`).count() === 1 && seriesAntes > 0, `series ${seriesAntes}`);
await p.locator('[data-dia-fuerza]').screenshot({ path: path.join(CAPTURAS, 'sesion-corregir-panel.png') }).catch(() => {});
await p.locator(`[data-fz-sesion="${s15.id}"] [data-fz-quitar-sesion]`).click();
await p.waitForTimeout(900);
const despues = await sesiones();
ok('quitar: borra SOLO esa sesión', despues.length === antes.length - 1 && !despues.some(s => s.id === s15.id), `${antes.length} → ${despues.length}`);
ok('quitar: se van sus series (eran datos falsos) y las de las demás sesiones quedan', await series(s15.id) === 0
  && await p.evaluate(() => TABLAS_FALSAS.series_log.length) > 0);
ok('quitar: el panel se cierra y el día queda sin la marca ✓', document_oculto(await p.locator('#modal').getAttribute('class')) && await p.locator('.ent-celda[data-fecha="2026-09-15"] .ent-marca-ok').count() === 0);

// ── Mover, desde el panel del día ──
const s12 = antes.find(s => s.fecha === '2026-09-12');
await p.locator('.ent-celda[data-fecha="2026-09-12"]').click();
await p.waitForSelector(`[data-fz-sesion="${s12.id}"]`, { timeout: 5000 });
await p.locator(`#ses-mover-a-${s12.id}`).fill('2026-09-13');
await p.locator(`[data-fz-sesion="${s12.id}"] [data-fz-mover-sesion]`).click();
await p.waitForTimeout(900);
const movida = (await sesiones()).find(s => s.id === s12.id);
ok('mover: la sesión cambia de día con su semana recalculada', movida && movida.fecha === '2026-09-13' && movida.semana_iso === '2026-W37' && movida.semana_num === 1, JSON.stringify(movida));
ok('mover: la marca ✓ aparece en el día nuevo y se va del viejo', await p.locator('.ent-celda[data-fecha="2026-09-13"] .ent-marca-ok').count() === 1
  && await p.locator('.ent-celda[data-fecha="2026-09-12"] .ent-marca-ok').count() === 0);
ok('mover: las series siguen con la sesión', await series(s12.id) > 0);

// ── Choque: ya hay una sesión de esa rutina ese día ──
const s08 = antes.find(s => s.fecha === '2026-09-08');      // misma rutina que la del 19
await p.locator('.ent-celda[data-fecha="2026-09-08"]').click();
await p.waitForSelector(`[data-fz-sesion="${s08.id}"]`, { timeout: 5000 });
await p.locator(`#ses-mover-a-${s08.id}`).fill('2026-09-19');
await p.locator(`[data-fz-sesion="${s08.id}"] [data-fz-mover-sesion]`).click();
await p.waitForTimeout(500);
ok('mover a un día que ya tiene esa rutina: avisa y no toca nada', (await sesiones()).find(s => s.id === s08.id).fecha === '2026-09-08');
await p.locator(`#ses-mover-a-${s08.id}`).fill('2026-09-25');
await p.locator(`[data-fz-sesion="${s08.id}"] [data-fz-mover-sesion]`).click();
await p.waitForTimeout(500);
ok('mover a un día que no ha llegado: avisa y no toca nada', (await sesiones()).find(s => s.id === s08.id).fecha === '2026-09-08');
await p.evaluate(() => closeModal());

// ── La pestaña «Lo que entrenó» también corrige ──
await p.evaluate(() => entSubtab('sesiones'));
await p.waitForSelector('[data-ses-corregir]', { timeout: 8000 });
const s10 = antes.find(s => s.fecha === '2026-09-10');
ok('«Lo que entrenó»: cada sesión trae Mover y Quitar', await p.locator('[data-ses-corregir]').count() >= 10
  && await p.locator(`[data-ses-corregir="${s10.id}"] [data-ses-quitar]`).count() === 1);
await p.locator(`[data-ses-corregir="${s10.id}"]`).screenshot({ path: path.join(CAPTURAS, 'sesion-corregir-lista.png') }).catch(() => {});
await p.locator(`[data-ses-corregir="${s10.id}"] [data-ses-quitar]`).click();
await p.waitForTimeout(900);
ok('«Lo que entrenó»: quitar borra esa sesión y la lista se repinta sin ella', !(await sesiones()).some(s => s.id === s10.id) && await p.locator(`[data-ses-corregir="${s10.id}"]`).count() === 0);

ok('sin errores de JavaScript', errores.length === 0, errores.join(' | '));
function document_oculto(clases) { return /hidden/.test(clases || ''); }
await ctx.close();
await b.close();
servidor.close();
console.log(mal ? `\n${mal} fallo(s)` : '\ntodo bien');
process.exit(mal ? 1 : 0);
