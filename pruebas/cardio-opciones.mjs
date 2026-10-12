// Cardio a elegir en el CRM: «Cardio después de entrenar» con varias opciones
// (caminadora trotando o con inclinación o bicicleta), tiempos sugeridos e
// intensidad. Con la columna se guarda como lista; sin ella, en el detalle.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/cardio-opciones.mjs
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

const c18 = fixture.fases.find(f => f.nombre === 'Ciclo 18');

for (const [tag, conColumna] of [['con la columna', true], ['sin la columna', false]]) {
  console.log(`\n${tag}`);
  // Un evento cualquiera con (o sin) la columna, para que el Supabase falso la conozca.
  fixture.__eventos = [{ id: 'ev-0', cliente_id: 'c0', fase_id: c18.id, tipo: 'peso', titulo: 'Pesarse', fecha: '2026-09-08', dias_semana: [], semanas: null, visible_cliente: true, ...(conColumna ? { opciones: null } : {}) }];
  const { p, ctx, errores } = await abrir(1440, 900);
  await p.evaluate((ev) => { TABLAS_FALSAS.eventos = ev; }, fixture.__eventos);
  if (!conColumna) await p.evaluate(() => { _co.hay = false; });
  await p.evaluate(() => { fmt.hoy = () => '2026-09-10'; return verEntrenamientoCliente('c0'); });
  await p.waitForSelector('[data-cal-lote]', { timeout: 15000 });
  await p.evaluate((id) => entVerFase(id), c18.id);
  await p.waitForTimeout(800);
  await p.evaluate(() => entNuevaActividad());
  await p.waitForSelector('#ev-cardio-opciones #co-on', { timeout: 5000 });
  await p.locator('#co-on').check();
  await p.waitForSelector('[data-co-opcion]', { timeout: 3000 });
  ok(`${tag} · al encender «Varias opciones» trae caminadora trotando, con inclinación y bicicleta, 10 a 30 min y moderada`,
    await p.inputValue('#ev-titulo') === 'Cardio después de entrenar'
    && (await p.locator('[data-co-opcion].active').allInnerTexts()).join('|') === 'Caminadora trotando|Caminadora caminando con inclinación|Bicicleta'
    && (await p.locator('[data-co-min].active').count()) === 5 && (await p.locator('[data-co-int="moderada"].active').count()) === 1,
    (await p.locator('[data-co-opcion].active').allInnerTexts()).join('|'));
  ok(`${tag} · dice cómo lo va a ver el cliente`, /Elige una: Caminadora trotando o Caminadora caminando con inclinación o Bicicleta · 10, 15, 20, 25 o 30 min · ritmo moderado/.test(await p.locator('[data-co-vista]').innerText()), await p.locator('[data-co-vista]').innerText());
  if (conColumna) await p.locator('#modal-content').screenshot({ path: path.join(CAPTURAS, 'cardio-opciones-editor.png') }).catch(() => {});
  // Quitar la escaladora no está; añadir «Remo» y quitar 30 min.
  await p.fill('#co-otra', 'Remo'); await p.locator('#co-otra').press('Enter');
  await p.locator('[data-co-min="30"]').click();
  // Todos los días de la semana.
  for (const c of await p.locator('.ev-dia').all()) await c.check();
  await p.evaluate(() => evtGuardar(null));
  await p.waitForTimeout(900);
  const ev = await p.evaluate(() => TABLAS_FALSAS.eventos.find(x => x.titulo === 'Cardio después de entrenar'));
  if (conColumna) ok(`${tag} · se guarda la lista, los tiempos y la intensidad`, ev && JSON.stringify(ev.opciones) === JSON.stringify({ lista: ['Caminadora trotando', 'Caminadora caminando con inclinación', 'Bicicleta', 'Remo'], minutos: [10, 15, 20, 25], intensidad: 'moderada' }) && ev.duracion_min === 15, JSON.stringify(ev));
  else ok(`${tag} · sin la columna va al detalle, en palabras`, ev && !('opciones' in ev) && /^Elige una: Caminadora trotando o Caminadora caminando con inclinación o Bicicleta o Remo · 10, 15, 20 o 25 min · ritmo moderado/.test(ev.detalle || ''), JSON.stringify(ev));
  // Al editarlo, vuelve con lo que tenía.
  if (conColumna) {
    await p.evaluate((id) => { _ent.eventosCache = TABLAS_FALSAS.eventos; return entEditarEvento(id); }, ev.id);
    await p.waitForSelector('[data-co-opcion]', { timeout: 5000 });
    ok(`${tag} · al editarlo vuelve con sus 4 opciones y sus tiempos`, (await p.locator('[data-co-opcion].active').count()) === 4 && (await p.locator('[data-co-min].active').count()) === 4);
    // Apagarlo: queda como una actividad normal.
    await p.locator('#co-on').uncheck();
    await p.evaluate((id) => evtGuardar(id), ev.id);
    await p.waitForTimeout(700);
    ok(`${tag} · al apagarlo queda como actividad normal (sin opciones)`, (await p.evaluate((id) => TABLAS_FALSAS.eventos.find(x => x.id === id).opciones, ev.id)) === null);
  }
  ok(`${tag} · sin errores en la página`, errores.length === 0, errores.join(' | '));
  await ctx.close();
}

await b.close(); servidor.close();
console.log(mal ? `\n${mal} fallo(s)` : '\ntodo bien');
process.exit(mal ? 1 : 0);
