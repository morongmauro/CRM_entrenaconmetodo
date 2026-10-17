// Tiempos reales del entreno (entreno-tiempos.js): con la hora de cada serie
// marcada, «Lo que entrenó» muestra cuánto duró la rutina, cuánto tardó en
// cada ejercicio y cuánto descansó frente a la pauta; Lecturas lo suma como
// indicador. Las marcadas de golpe y las importadas no cuentan.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/tiempos.mjs
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




// Una rutina con dos ejercicios: A (10 reps ≈ 35 s, descanso 90 s) y B (12
// reps ≈ 42 s, descanso 60 s), 3 series cada uno.
function entrenos() {
  const ej = fixture.ejercicios.slice(0, 2);
  const re = [
    { id: 'reA', rutina_id: 'rt', ejercicio_id: ej[0].id, orden: 1, series: 3, reps: '10', descanso_seg: 90, ejercicios: ej[0] },
    { id: 'reB', rutina_id: 'rt', ejercicio_id: ej[1].id, orden: 2, series: 3, reps: '12', descanso_seg: 60, ejercicios: ej[1] },
  ];
  const nom = (e) => ({ nombre: e.nombre, alias: e.alias });
  const ses = [], sl = [];
  // [id, fecha, segundos de cada toque desde las 18:00, terminar, solo created_at]
  const plan = [
    ['st1', '2026-10-15', [0, 150, 300, 420, 520, 620], 660, false],
    ['st2', '2026-10-13', [0, 240, 480, 600, 800, 1000], 1050, false],
    ['st3', '2026-10-10', [0, 240, 480, 600, 800, 1000], 1050, true],
    ['st4', '2026-10-08', [0, 1, 2, 3, 4, 5], 30, false],
  ];
  plan.forEach(([id, fecha, toques, fin, viejo]) => {
    const t0 = Date.parse(fecha + 'T18:00:00Z');
    ses.push({ id, user_id: 'coach-1', cliente_id: 'c0', rutina_id: 'rt', fecha, estado: 'completada', rpe: 8, origen: 'cliente',
      finalizada_en: new Date(t0 + fin * 1000).toISOString(), duracion_seg: fin, rutinas: { nombre: 'Tiempos' } });
    toques.forEach((s, i) => {
      const r = re[i < 3 ? 0 : 1], hora = new Date(t0 + s * 1000).toISOString();
      sl.push({ id: `${id}-${i}`, sesion_id: id, rutina_ejercicio_id: r.id, ejercicio_id: r.ejercicio_id, serie_num: (i % 3) + 1, reps: 10, peso: 50, unidad: 'kg',
        completada: true, ejercicios: nom(r.ejercicios), ...(viejo ? { created_at: hora } : { marcada_en: hora, created_at: '2026-10-16T09:00:00Z' }) });
    });
  });
  return { re, ses, sl };
}

for (const [tag, ancho, alto] of [['ancho', 1440, 900], ['telefono', 390, 844]]) {
  console.log(`\n${tag} (${ancho}px)`);
  const a = await abrir(ancho, alto);
  const p = a.p;
  await p.evaluate((d) => {
    TABLAS_FALSAS.rutina_ejercicios.push(...d.re);
    TABLAS_FALSAS.sesiones.push(...d.ses);
    TABLAS_FALSAS.series_log.push(...d.sl);
    _ent.tab = 'clientes'; _ent.clienteId = 'c0'; _ent.subtab = 'sesiones';
    return navigate('entrenamiento');
  }, entrenos());
  await p.waitForSelector('[data-ses-tiempos="st1"]', { timeout: 15000 }).catch(() => {});
  const st1 = p.locator('[data-ses-tiempos="st1"]');
  ok(`${tag} · «Lo que entrenó»: la sesión dice cuánto duró de verdad`, /12 min reales/.test(await st1.locator('summary').innerText().catch(() => '')), await st1.locator('summary').innerText().catch(() => 'no está'));
  await st1.locator('summary').click();
  const filas = await st1.locator('tbody tr').allInnerTexts();
  ok(`${tag} · tiempo de cada ejercicio (suman la rutina)`, filas.length === 2 && /5:35/.test(filas[0]) && /5:20/.test(filas[1]), JSON.stringify(filas));
  ok(`${tag} · descanso real frente a la pauta, por ejercicio`, /1:55\s*\/\s*1:30/.test(filas[0]) && /0:58\s*\/\s*1:00/.test(filas[1]), JSON.stringify(filas));
  ok(`${tag} · trabajo, descansos y lo que tardó en «Terminar»`, /Trabajo ~4 min · descansos y cambios ~7 min · 0:40 hasta «Terminar»/.test(await st1.innerText()), await st1.innerText());
  ok(`${tag} · sin la hora del teléfono usa la de llegada`, /18 min reales/.test(await p.locator('[data-ses-tiempos="st3"] summary').innerText().catch(() => '')));
  ok(`${tag} · las marcadas de golpe se avisan`, /marcó casi todo de golpe/.test(await p.locator('[data-ses-tiempos="st4"] summary').innerText().catch(() => '')));
  const importadas = await p.evaluate(() => TABLAS_FALSAS.sesiones.filter(s => s.origen === 'importada').map(s => s.id));
  ok(`${tag} · las importadas de Trainerize no muestran tiempos`, (await p.evaluate((ids) => ids.filter(id => document.querySelector(`[data-ses-tiempos="${id}"]`)).length, importadas)) === 0);
  if (tag === 'ancho') await p.locator('#ent-sesiones, [data-ses-tiempos="st1"]').last().evaluate(el => el.closest('.card').scrollIntoView());
  if (tag === 'ancho') await st1.locator('xpath=..').screenshot({ path: path.join(CAPTURAS, 'tiempos-sesion.png') }).catch(() => {});

  // Lecturas: el indicador.
  await p.evaluate(() => { _ent.subtab = 'lecturas'; return navigate('entrenamiento'); });
  await p.waitForSelector('[data-tiempos-crm]', { timeout: 15000 }).catch(() => {});
  const card = await p.locator('[data-tiempos-crm]').innerText().catch(() => '');
  ok(`${tag} · Lecturas: tarjeta «Tiempos reales» con total, descanso y por ejercicio`, /Rutina total/.test(card) && /Descanso entre series/.test(card) && /Por ejercicio/.test(card) && /1 no cuentan/.test(card), card.slice(0, 300));
  ok(`${tag} · Lecturas: avisa que descansa más de lo pautado`, /Descansa más de lo pautado/.test(await p.locator('#ent-lecturas').innerText()));
  if (tag === 'ancho') await p.locator('[data-tiempos-crm]').screenshot({ path: path.join(CAPTURAS, 'tiempos-lecturas.png') }).catch(() => {});
  ok(`${tag} · sin errores en la página`, a.errores.length === 0, a.errores.join(' | '));
  await a.ctx.close();
}
await b.close(); servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
