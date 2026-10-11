// La asistencia al armar rutinas y «Trainerize al lado de lo tuyo», en el
// CRM entero con datos reales de un cliente (anonimizado) sacados de la carga
// de Trainerize del 10 oct: arnes/asistencia-datos.json.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/asistencia.mjs
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
    if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return ruta.continue().catch(() => ruta.abort());
    return ruta.fulfill({ status: 200, contentType: 'application/json', body: u.includes('/rest/v1/') ? '[]' : '{}' });
  });
  await p.goto(BASE + '/');
  await p.locator('#app-screen').waitFor({ state: 'visible', timeout: 20000 });
  await p.waitForTimeout(1000);
  return { ctx, p, errores };
}

const rutNueva = fixture.rutinas.find(r => fixture.fases.find(f => f.id === r.fase_id)?.nombre === 'Ciclo 19');
const rutVieja = fixture.rutinas.find(r => fixture.fases.find(f => f.id === r.fase_id)?.nombre === 'Ciclo 18' && r.nombre === 'Push Training');

for (const [tag, ancho, alto] of [['ancho', 1440, 1000], ['telefono', 390, 844]]) {
  console.log(`\n${tag} (${ancho}px)`);
  const { ctx, p, errores } = await abrir(ancho, alto);

  // 1. El constructor de una rutina del ciclo nuevo.
  await p.evaluate((id) => entAbrirConstructor(id), rutNueva.id);
  await p.waitForFunction(() => document.querySelector('#asi-panel [data-asi-ej]'), null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(400);
  const nFilas = await p.locator('#asi-panel [data-asi-ej]').count();
  ok(`${tag} · constructor: una fila de asistencia por ejercicio de la rutina (${nFilas})`, nFilas === 6);
  const txt = await p.locator('#asi-panel').innerText().catch(() => '');
  ok(`${tag} · constructor: trae el último registro con peso`, /Último: .*@ .*kg/.test(txt), txt.slice(0, 300));
  ok(`${tag} · constructor: Trainerize al lado (18/25)`, txt.includes('18/25'), txt.slice(0, 300));
  ok(`${tag} · constructor: lo anotado en el CRM al lado (16/20)`, txt.includes('16/20'), txt.slice(0, 400));
  ok(`${tag} · constructor: hay sugerencias con tono`, await p.locator('#asi-panel [data-asi-ej] .rounded-lg.border').count() === 6);
  if (tag === 'ancho') {
    const caja = await p.locator('#asi-panel').boundingBox();
    const rutina = await p.locator('#ent-body .order-1').first().boundingBox();
    ok(`${tag} · constructor: la asistencia va AL LADO de la rutina`, caja && rutina && caja.x > rutina.x + rutina.width - 5 && Math.abs(caja.y - rutina.y) < 60,
      JSON.stringify({ caja, rutina }));
  }
  if (tag === 'telefono') ok(`${tag} · constructor: sin scroll de lado`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await p.screenshot({ path: path.join(CAPTURAS, `asistencia-nueva-${tag}.png`), fullPage: tag === 'ancho' });

  // 2. «+ Añadir» desde la asistencia mete el ejercicio en la rutina.
  const antes = await p.evaluate(() => _ent.rutina.ejercicios.length);
  const add = p.locator('#asi-panel button:has-text("+ Añadir")').first();
  if (await add.count()) {
    await p.evaluate(() => document.querySelectorAll('#asi-panel details').forEach(d => d.open = true));
    await add.click();
    await p.waitForTimeout(900);
    ok(`${tag} · «+ Añadir» desde la asistencia lo mete en la rutina`, await p.evaluate(() => _ent.rutina.ejercicios.length) === antes + 1);
  } else ok(`${tag} · hay algo para proponer con «+ Añadir»`, false);

  // 3. Una rutina del ciclo actual: ahí sí hay «lo salta» y tendencias.
  await p.evaluate((id) => entAbrirConstructor(id), rutVieja.id);
  await p.waitForFunction(() => document.querySelector('#asi-panel [data-asi-ej]'), null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(400);
  await p.evaluate(() => document.querySelectorAll('#asi-panel details').forEach(d => d.open = true));
  await p.screenshot({ path: path.join(CAPTURAS, `asistencia-actual-${tag}.png`), fullPage: tag === 'ancho' });

  // 4. La ficha: Trainerize al lado, y pasar sus días a la ficha.
  await p.evaluate(() => window.verCliente('c0'));
  await p.waitForFunction(() => document.querySelector('#tz-compara-ficha [data-tz-compara]'), null, { timeout: 8000 }).catch(() => {});
  const ficha = await p.locator('#tz-compara-ficha').innerText().catch(() => '');
  ok(`${tag} · ficha: Trainerize al lado de lo tuyo`, /trainerize al lado/i.test(ficha) && /tu ficha/i.test(ficha), ficha.slice(0, 200));
  await p.locator('#tz-compara-ficha [data-tz-compara]').screenshot({ path: path.join(CAPTURAS, `trainerize-ficha-${tag}.png`) }).catch(() => {});
  await p.locator('#tz-compara-ficha [data-usar-dias-tz]').click();
  await p.waitForTimeout(500);
  const dias = await p.evaluate(() => window.TABLAS_FALSAS.clientes.find(c => c.id === 'c0').dias_entreno.join(''));
  ok(`${tag} · ficha: «Usar los de Trainerize» pone sus días (LMXJS)`, dias === 'LMXJS', dias);

  // 5. El filtro de la galería: el ciclo vigente aunque esté en borrador.
  const enUso = await p.evaluate(async () => (await entDb.ejerciciosEnUso(true)).size);
  const esperado = new Set(fixture.rutina_ejercicios.filter(x => fixture.rutinas.find(r => r.id === x.rutina_id)?.fase_id === rutVieja.fase_id).map(x => x.ejercicio_id)).size;
  ok(`${tag} · galería «usan mis clientes»: cuenta el ciclo vigente en borrador (${enUso} de ${esperado})`, enUso === esperado);

  ok(`${tag} · sin errores de JavaScript`, errores.length === 0, errores.join(' | '));
  await ctx.close();
}

await b.close();
servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
