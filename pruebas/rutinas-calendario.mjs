// Las rutinas de fuerza desde el calendario del cliente (CRM entero): tocar
// un día para poner, cambiar o quitar su rutina, y la ✕ de la rutina en la
// casilla. Todo por día de la semana: vale para todos esos días del ciclo.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/rutinas-calendario.mjs
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



const c18 = fixture.fases.find(f => f.nombre === 'Ciclo 18');   // 7 sep, 5 semanas
const dias = (p, nombre) => p.evaluate((n) => {
  const r = TABLAS_FALSAS.rutinas.find(x => x.nombre === n && x.fase_id === _ent.faseCache.id);
  return JSON.stringify(r.dias_semana);
}, nombre);
const diasFase = (p) => p.evaluate(() => JSON.stringify(TABLAS_FALSAS.fases.find(f => f.id === _ent.faseCache.id).dias_semana));
const chip = (p, f) => p.locator(`.ent-celda[data-fecha="${f}"] .ent-chip-rutina .ent-chip-txt`).allInnerTexts();

for (const [tag, ancho, alto] of [['ancho', 1440, 900], ['telefono', 390, 844]]) {
  console.log(`\n${tag} (${ancho}px)`);
  const a = await abrir(ancho, alto);
  const p = a.p;
  await p.evaluate(() => { fmt.hoy = () => '2026-09-10'; return verEntrenamientoCliente('c0'); });
  await p.waitForSelector('[data-cal-lote]', { timeout: 15000 });
  await p.evaluate((id) => entVerFase(id), c18.id);
  await p.waitForTimeout(800);

  // 1. Martes 8: tiene Lower. El panel lo dice y deja cambiarla.
  await p.locator('.ent-celda[data-fecha="2026-09-08"] .ent-celda-num').click();
  await p.waitForSelector('[data-dia-fuerza]', { timeout: 5000 });
  ok(`${tag} · tocar el martes muestra su rutina (Lower) con «Quitar» y para cambiarla`, /Lower Body/.test(await p.locator('[data-dia-fuerza]').innerText())
    && await p.locator('[data-dia-quitar-rutina]').count() === 1 && await p.locator('#dia-rutina option').count() === 3);
  if (tag === 'ancho') await p.locator('#modal-content').screenshot({ path: path.join(CAPTURAS, 'rutinas-calendario-dia-ancho.png') }).catch(() => {});
  // 2. Cambiar por Push: Push pasa a martes y miércoles; Lower se queda con el sábado.
  await p.selectOption('#dia-rutina', { label: /Push/.test('') ? '' : (await p.locator('#dia-rutina option', { hasText: 'Push' }).innerText()) });
  await p.locator('[data-dia-poner-rutina]').click();
  await p.waitForTimeout(900);
  ok(`${tag} · «Cambiar por esta» deja Push los martes y Lower solo los sábados`, await dias(p, 'Push Training') === '["M","X"]' && await dias(p, 'Lower Body + Core Training') === '["S"]'
    && (await chip(p, '2026-09-15')).some(t => /Push/.test(t)), `${await dias(p, 'Push Training')} ${await dias(p, 'Lower Body + Core Training')}`);
  // 3. La ✕ de la rutina en la casilla del miércoles 9: Push deja los miércoles y el día sale de la fase.
  await p.locator('.ent-celda[data-fecha="2026-09-09"] [data-quitar-rutina]').click({ force: true });
  await p.waitForTimeout(900);
  ok(`${tag} · la ✕ de la rutina la quita de todos los miércoles (y el miércoles queda libre)`, await dias(p, 'Push Training') === '["M"]' && !JSON.parse(await diasFase(p)).includes('X')
    && (await chip(p, '2026-09-16')).length === 0, `${await dias(p, 'Push Training')} ${await diasFase(p)}`);
  // 4. Viernes 11 (libre): poner Pull. Pull pasa a jueves y viernes, y el viernes entra en los días de la fase.
  await p.locator('.ent-celda[data-fecha="2026-09-11"] .ent-celda-num').click();
  await p.waitForSelector('[data-dia-fuerza]', { timeout: 5000 });
  ok(`${tag} · un día libre dice que no tiene rutina y ofrece «Poner»`, /no tiene rutina/.test(await p.locator('[data-dia-fuerza]').innerText()) && /Poner/.test(await p.locator('[data-dia-poner-rutina]').innerText()));
  await p.selectOption('#dia-rutina', { label: await p.locator('#dia-rutina option', { hasText: 'Pull' }).innerText() });
  await p.locator('[data-dia-poner-rutina]').click();
  await p.waitForTimeout(900);
  ok(`${tag} · «Poner» deja Pull jueves y viernes, y el viernes cuenta como día de la fase`, await dias(p, 'Pull Training') === '["J","V"]' && JSON.parse(await diasFase(p)).includes('V')
    && (await chip(p, '2026-09-18')).some(t => /Pull/.test(t)), `${await dias(p, 'Pull Training')} ${await diasFase(p)}`);

  const anchoP = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  ok(`${tag} · sin scroll de lado`, anchoP);
  ok(`${tag} · sin errores de JavaScript`, a.errores.length === 0, a.errores.join(' | '));
  await a.ctx.close();
}

await b.close();
servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
