// Duplicados en la galería: la caja «🔁 Duplicados», la tarjeta dice de qué
// ejercicio es copia, «No es duplicado» quita la marca y «Archivar este» la
// archiva. Los que usan hoy tus clientes nunca salen como duplicados.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/duplicados.mjs
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
  // Tres fichas: A y B en análisis marcadas como copia de U (que usan hoy);
  // U también trae una marca (vieja) para ver que una de hoy nunca sale.
  await p.evaluate(() => { fmt.hoy = () => '2026-09-10'; navigate('entrenamiento'); });
  await p.waitForTimeout(500);
  await p.evaluate(() => entDb.niveles(true));
  const ids = await p.evaluate(() => {
    const usado = TABLAS_FALSAS.ejercicios.find(e => _ent.enUso.has(e.id));
    const libres = TABLAS_FALSAS.ejercicios.filter(e => !_ent.enUso.has(e.id));
    const [A, B] = libres;
    A.duplicado_de = usado.id; B.duplicado_de = usado.id; usado.duplicado_de = A.id;
    return { A: A.id, B: B.id, U: usado.id, uNombre: usado.alias || usado.nombre, nUso: _ent.enUso.size };
  });
  await p.evaluate(() => { _ent.ejercicios = null; return entTab('ejercicios'); });
  await p.waitForSelector('[data-nivel="duplicados"]', { timeout: 15000 });
  const enUsoCargado = await p.evaluate((u) => !!(_ent.enUso && _ent.enUso.has(u)), ids.U);
  ok(`${tag} · la caja «🔁 Duplicados» sale con 2 para decidir`, /2\s*·\s*para decidir/.test(await p.locator('[data-nivel="duplicados"]').innerText()), await p.locator('[data-nivel="duplicados"]').innerText());
  ok(`${tag} · la ficha que usan hoy no cuenta como duplicado`, enUsoCargado);
  ok(`${tag} · el filtro de uso también la ofrece`, await p.locator('select[data-sel="uso"] option[value="duplicados"]').count() > 0);
  await p.locator('[data-nivel="duplicados"]').click();
  await p.waitForTimeout(400);
  const tarjetas = await p.locator('[data-duplicado]').evaluateAll(n => n.map(x => x.dataset.duplicado));
  ok(`${tag} · al tocarla se ven justo los 2, cada uno diciendo de cuál es copia`, tarjetas.length === 2 && tarjetas.includes(ids.A) && tarjetas.includes(ids.B)
    && (await p.locator(`[data-duplicado="${ids.A}"]`).innerText()).includes(ids.uNombre), JSON.stringify(tarjetas));
  ok(`${tag} · y avisa que la original la usan hoy`, /la usan hoy/.test(await p.locator(`[data-duplicado="${ids.A}"]`).innerText()));
  if (tag === 'ancho') await p.locator('#flt-lista').screenshot({ path: path.join(CAPTURAS, 'duplicados.png') }).catch(() => {});
  await p.locator(`[data-duplicado="${ids.A}"] [data-dup-no]`).click();
  await p.waitForTimeout(600);
  let fila = await p.evaluate((id) => TABLAS_FALSAS.ejercicios.find(e => e.id === id), ids.A);
  ok(`${tag} · «No es duplicado» quita la marca en la base y lo saca de la lista`, fila.duplicado_de === null && fila.archivado !== true
    && /1\s*·\s*para decidir/.test(await p.locator('[data-nivel="duplicados"]').innerText()));
  await p.locator(`[data-duplicado="${ids.B}"] [data-dup-archivar]`).click();
  await p.waitForTimeout(800);
  fila = await p.evaluate((id) => TABLAS_FALSAS.ejercicios.find(e => e.id === id), ids.B);
  ok(`${tag} · «Archivar este» lo archiva (no lo borra) y la caja desaparece`, fila && fila.archivado === true && await p.locator('[data-nivel="duplicados"]').count() === 0);
  const u = await p.evaluate((id) => TABLAS_FALSAS.ejercicios.find(e => e.id === id), ids.U);
  ok(`${tag} · la ficha que usan hoy sigue igual`, u && u.archivado !== true);
  ok(`${tag} · sin errores en la página`, a.errores.length === 0, a.errores.join(' | '));
  await a.ctx.close();
}
await b.close(); servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
