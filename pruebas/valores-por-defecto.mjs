// «No le sirve» por cliente y ejercicio.
// ejercicio de la rutina del cliente, la ventana con «Para la próxima vez» y
// «Siempre presente», la conversación con sus notas, el «Leído», quitar sin
// borrar, y la línea «Siempre presente» en la fila.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/comentarios-coach.mjs
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
const { ctx, p, errores } = await abrir(1500, 900);
{
  const { ctx, p, errores } = await abrir(1600, 900);
  await p.evaluate(() => { _ent.tab = 'clientes'; _ent.clienteId = 'c0'; return navigate('entrenamiento'); });
  await p.waitForTimeout(600);
  await p.evaluate((id) => entAbrirConstructor(id), push.id); await p.waitForSelector('#cons-rutina .ent-fila', { timeout: 15000 }); await p.waitForTimeout(600);
  const ids = await p.evaluate(() => { const ejs = _ent.ejercicios || []; const f = ejs.find(e => e.tipo === 'fuerza'); const c = ejs.find(e => e.tipo === 'cardio'); return { f: f && f.id, c: c && c.id }; });
  await p.evaluate((id) => entAgregarARutina(id), ids.f); await p.waitForTimeout(800);
  const ultimo = await p.evaluate(() => { const l = _ent.rutina.ejercicios; const x = l[l.length - 1]; return { series: x.series, reps: x.reps, descanso: x.descanso_seg }; });
  ok('fuerza desde la galería: 4 series · 6-12 · 50 s', ultimo.series === 4 && ultimo.reps === '6-12' && ultimo.descanso === 50, JSON.stringify(ultimo));
  await p.evaluate((id) => entAgregarARutina(id), ids.c); await p.waitForTimeout(800);
  const u2 = await p.evaluate(() => { const l = _ent.rutina.ejercicios; const x = l[l.length - 1]; return { series: x.series, reps: x.reps, descanso: x.descanso_seg }; });
  ok('cardio (por tiempo) desde la galería: 4 series · 15-30 s · 30 s', u2.series === 4 && u2.reps === '15-30 s' && u2.descanso === 30, JSON.stringify(u2));
  const dos = await p.evaluate(() => _ent.rutina.ejercicios.slice(-2).map(x => x.id));
  await p.evaluate(async ([a, b]) => { await entJuntarEnCircuito(a, { reId: b }); }, dos); await p.waitForTimeout(900);
  const enBloque = await p.evaluate((ids) => _ent.rutina.ejercicios.filter(x => ids.includes(x.id)).map(x => ({ series: x.series, bloque: x.bloque_id })), dos);
  const vueltas = await p.evaluate((id) => (_ent.rutina.bloques.find(b => b.id === id) || {}).vueltas, enBloque[0].bloque);
  ok('al juntarlos en circuito, los dos quedan con 1 serie', enBloque.every(x => x.series === 1 && x.bloque), JSON.stringify(enBloque));
  ok('…y el circuito toma 4 vueltas (las series que tenía el de destino)', vueltas === 4, String(vueltas));
  ok('sin errores de JavaScript', errores.length === 0, errores.join(' | '));
  await ctx.close();
}
await b.close(); servidor.close(); console.log(mal ? `\n${mal} MAL` : '\ntodo bien'); process.exit(mal ? 1 : 0);
