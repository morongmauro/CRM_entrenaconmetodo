// Reporte «Sin video por cliente» (Entrenamiento → Galería): cuántos clientes
// tienen hoy ejercicios sin video, cuáles, y abrir la ficha para ponerlo.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/reporte-sin-video.mjs
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
  await p.evaluate(() => navigate('entrenamiento')); await p.waitForTimeout(500); await p.evaluate(() => entTab('ejercicios'));
  await p.waitForSelector('[data-reporte-sin-video]', { timeout: 15000 });
  // Uno que usan hoy tiene video, pero YouTube no lo deja ver en la app.
  const rotoId = await p.evaluate(async () => {
    const ej = Object.fromEntries(TABLAS_FALSAS.ejercicios.map(e => [e.id, e]));
    const id = [...(_ent.quienUsa || new Map()).keys()].find(x => ej[x] && ej[x].video_fuente === 'youtube');
    if (!id) return null;
    ej[id].video_ref = 'rotoRef1234';
    (_ent.ejercicios || []).forEach(e => { if (e.id === id) e.video_ref = 'rotoRef1234'; });
    TABLAS_FALSAS.ejercicio_video_estado = [{ id: 'v1', user_id: 'coach-1', video_ref: 'rotoRef1234', ejercicio_id: id, estado: 'problema', codigo: 401, revisado_en: '2026-10-27T10:00:00Z' }];
    if (window.entYtCargar) await entYtCargar(true);
    return id;
  });
  await p.locator('[data-reporte-sin-video]').click();
  await p.waitForSelector('[data-reporte-resumen], [data-reporte-ok]', { timeout: 10000 });
  const r = await p.evaluate(() => {
    const ej = Object.fromEntries(TABLAS_FALSAS.ejercicios.map(e => [e.id, e]));
    const ids = [...document.querySelectorAll('[data-reporte-por-ejercicio] [data-ej-sin-video]')].map(x => x.dataset.ejSinVideo);
    return {
      clientes: Number(document.querySelector('[data-reporte-clientes]')?.textContent || 0),
      ejercicios: Number(document.querySelector('[data-reporte-ejercicios]')?.textContent || 0),
      ids, todosSinVideo: ids.every(id => (ej[id].video_fuente || 'ninguno') === 'ninguno' || ej[id].video_ref === 'rotoRef1234'),
      enUsoConVideo: [...(_ent.quienUsa || new Map()).keys()].filter(id => ej[id] && ej[id].video_fuente === 'youtube').length,
      sinVideoEnUso: [...(_ent.quienUsa || new Map()).keys()].filter(id => ej[id] && ((ej[id].video_fuente || 'ninguno') === 'ninguno' || ej[id].video_ref === 'rotoRef1234')).length,
    };
  });
  ok(`${tag} · dice cuántos clientes tienen ejercicios sin video (${r.clientes})`, r.clientes >= 1, JSON.stringify(r));
  ok(`${tag} · también el que tiene video pero no se ve en la app, marcado aparte`, !!rotoId && r.ids.includes(rotoId)
    && (await p.locator(`[data-reporte-por-ejercicio] [data-ej-sin-video="${rotoId}"][data-video-roto]`).count()) === 1
    && /no se ve en la app/.test(await p.locator('[data-reporte-rotos]').innerText().catch(() => '')), JSON.stringify({ rotoId, ids: r.ids }));
  ok(`${tag} · lista justo los que usan hoy y no tienen video (${r.ejercicios})`, r.ejercicios === r.sinVideoEnUso && r.ids.length === r.ejercicios && r.todosSinVideo, JSON.stringify(r));
  ok(`${tag} · los que ya tienen video no salen`, r.enUsoConVideo > 0 && r.todosSinVideo, JSON.stringify(r));
  ok(`${tag} · y por cliente, con sus ejercicios`, await p.locator('[data-reporte-por-cliente] [data-ej-sin-video]').count() >= r.ejercicios);
  if (tag === 'ancho') await p.locator('#modal-content').screenshot({ path: path.join(CAPTURAS, 'reporte-sin-video.png') }).catch(() => {});
  await p.locator('[data-reporte-por-ejercicio] [data-ej-sin-video]').first().click();
  await p.waitForTimeout(500);
  ok(`${tag} · tocar un ejercicio abre su ficha para ponerle el video`, await p.locator('#modal-content', { hasText: 'Editar ejercicio' }).count() === 1);
  ok(`${tag} · no cambió nada (solo lee)`, await p.evaluate(() => TABLAS_FALSAS.ejercicios.filter(e => e.video_fuente === 'youtube').length) === await p.evaluate(() => TABLAS_FALSAS.ejercicios.filter((e, k) => k % 2 === 0).length));
  const anchoP = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  ok(`${tag} · sin scroll de lado`, anchoP);
  ok(`${tag} · sin errores de JavaScript`, a.errores.length === 0, a.errores.join(' | '));
  await a.ctx.close();
}

await b.close();
servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
