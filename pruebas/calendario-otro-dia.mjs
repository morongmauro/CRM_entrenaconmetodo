// Calendario del CRM: lo entrenado en OTRO día de la semana no se pinta como
// falta (entParesSemana, espejo de asignarSesiones de la app).
//   · el día que tocaba queda tenue, con «→ vie»;
//   · donde la hizo dice de qué día venía («· del mar»);
//   · si ya la tenía hecha esa semana, «· otra vez»;
//   · solo queda en rojo lo que de verdad no hizo.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/calendario-otro-dia.mjs
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


const push = fixture.rutinas.find(r => fixture.fases.find(f => f.id === r.fase_id)?.nombre === 'Ciclo 18' && r.nombre === 'Push Training');
const reIds = fixture.rutina_ejercicios.filter(x => x.rutina_id === push.id).sort((a, b) => a.orden - b.orden);

// ── Pantalla ancha: 4 columnas ──
const a = await abrir(1500, 1000); const p = a.p;
await p.evaluate(() => {
  const T = window.TABLAS_FALSAS; const F = '55fa07ff-b474-4d15-ac16-1788e7fdeb16';
  const R = { up: 'b33bf1a3-7abf-4006-8a1d-4b7e23a3dd97', low: '56e828d3-49dc-4e67-8a67-2c52248255f9', push: '8822d086-6af5-481d-a325-baed2826d270', pull: '91b1d8dc-8b5a-4fb1-b765-b63bbe8fe5b4' };
  const N = { up: 'Upper Body Training', low: 'Lower Body + Core Training', push: 'Push Training', pull: 'Pull Training' };
  T.sesiones = [];
  const s = (rut, fecha) => T.sesiones.push({ id: 'x' + fecha + rut, user_id: 'coach-1', cliente_id: 'c0', rutina_id: R[rut], fase_id: F, fecha, estado: 'completada', finalizada_en: fecha + 'T12:00:00Z', created_at: fecha + 'T12:00:00Z', rutinas: { nombre: N[rut] } });
  // Semana 1 (7–13 sep): todo en su día. Plan: Upper L · Lower M y S · Push X · Pull J.
  s('up', '2026-09-07'); s('low', '2026-09-08'); s('push', '2026-09-09'); s('pull', '2026-09-10'); s('low', '2026-09-12');
  // Semana 2 (14–20 sep): Upper y el Lower del martes en otro día; Pull dos veces; el Lower del sábado sin hacer.
  s('push', '2026-09-16'); s('pull', '2026-09-17'); s('low', '2026-09-18'); s('pull', '2026-09-18'); s('up', '2026-09-20');
});
await p.locator('nav, aside, body').getByText('Entrenamiento', { exact: true }).first().click();
await p.waitForTimeout(1000);
await p.locator('[data-cliente-ent="c0"]').first().click();
await p.waitForTimeout(1500);
await p.evaluate(async () => { _ent.mes = '2026-09'; await entVerFase('55fa07ff-b474-4d15-ac16-1788e7fdeb16'); });
await p.waitForTimeout(2500);
const chips = (f) => p.evaluate((f) => [...document.querySelectorAll('[data-fecha="' + f + '"] .ent-chip-rutina, [data-fecha="' + f + '"] .ent-chip-suelta')].map(c => ({ clases: c.className, txt: c.innerText.replace(/✕/g, '').replace(/\s+/g, ' ').trim(), hechaEl: c.dataset.hechaEl || null, vino: c.dataset.vinoDe || null, repe: c.hasAttribute('data-otra-vez') })), f);
const sem1 = await Promise.all(['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-12'].map(chips));
ok('semana con todo en su día: igual que siempre (hechas, sin notas)', sem1.every(c => c.length === 1 && /ent-chip-hecha/.test(c[0].clases) && !c[0].hechaEl && !c[0].vino && !c[0].repe), JSON.stringify(sem1));
const lun = await chips('2026-09-14'), mar = await chips('2026-09-15'), vie = await chips('2026-09-18'), sab = await chips('2026-09-19'), dom = await chips('2026-09-20');
ok('el lunes (Upper hecho el domingo) no sale en rojo: tenue, con «→ dom»', lun.length === 1 && /ent-chip-paso/.test(lun[0].clases) && !/ent-chip-falto/.test(lun[0].clases) && lun[0].hechaEl === '2026-09-20' && /→ dom/.test(lun[0].txt), JSON.stringify(lun));
ok('el martes (Lower hecho el viernes): «→ vie»', mar.length === 1 && /ent-chip-paso/.test(mar[0].clases) && mar[0].hechaEl === '2026-09-18' && /→ vie/.test(mar[0].txt), JSON.stringify(mar));
ok('el viernes: el Lower dice «· del mar» y el Pull (ya hecho el jueves) «· otra vez»', vie.length === 2
  && vie.some(c => /Lower/.test(c.txt) && c.vino === '2026-09-15' && /· del mar/.test(c.txt) && /ent-chip-hecha/.test(c.clases))
  && vie.some(c => /Pull/.test(c.txt) && c.repe && /· otra vez/.test(c.txt)), JSON.stringify(vie));
ok('el domingo: el Upper dice «· del lun»', dom.length === 1 && dom[0].vino === '2026-09-14' && /· del lun/.test(dom[0].txt), JSON.stringify(dom));
ok('lo que de verdad no hizo (el Lower del sábado) sigue en rojo', sab.length === 1 && /ent-chip-falto/.test(sab[0].clases) && !sab[0].hechaEl, JSON.stringify(sab));
ok('las notas se ven enteras aunque el nombre sea largo', await p.evaluate(() => [...document.querySelectorAll('.ent-chip-a, .ent-chip-del')].every(el => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= el.closest('.ent-chip').getBoundingClientRect().right + 1)));
ok('no cambió ningún dato (solo cómo se pinta)', await p.evaluate(() => window.TABLAS_FALSAS.sesiones.length === 10 && !(window.TABLAS_FALSAS.rutina_movimientos || []).length));
if (process.env.FOTO) {
  await p.evaluate(() => { const a = document.querySelector('[data-fecha="2026-09-07"]').getBoundingClientRect(); window.scrollBy(0, a.top - 120); });
  await p.waitForTimeout(400);
  const caja = await p.evaluate(() => { const a = document.querySelector('[data-fecha="2026-09-07"]').getBoundingClientRect(), b = document.querySelector('[data-fecha="2026-09-20"]').getBoundingClientRect(); return { x: a.left - 6, y: a.top - 6, width: b.right - a.left + 12, height: b.bottom - a.top + 12 }; });
  await p.screenshot({ path: process.env.FOTO, clip: caja });
}
ok('sin errores', a.errores.length === 0, a.errores.join(' | '));
await b.close(); servidor.close();
console.log(mal ? '\n' + mal + ' MAL' : '\nTodo bien');
process.exit(mal ? 1 : 0);
