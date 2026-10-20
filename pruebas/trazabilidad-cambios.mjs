// Trazabilidad de cambios de ejercicio en el constructor: cada vez que en una
// rutina un ejercicio se cambia por otro (con el agente, Alternativas,
// «Cambiar solo los ejercicios» o a mano) queda guardado cuál había, cuál
// quedó, cuándo y cómo; se ve en el renglón («Antes: …») y en la lista de
// cambios de la rutina. Si la tabla aún no existe, se guarda en el navegador
// y se sube sola después.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/trazabilidad-cambios.mjs
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
const { ctx, p, errores } = await abrir(1600, 900);
await p.evaluate((id) => entAbrirConstructor(id), push.id);
await p.waitForSelector('#cons-rutina .ent-fila', { timeout: 15000 });
ok('rutina sin cambios: no muestra «Antes» ni lista', await p.locator('[data-cambio-re], [data-historial-cambios]').count() === 0);

// 1) Con el agente (misma llamada que usa)
const [re1, re2] = await p.evaluate(() => _ent.rutina.ejercicios.slice(0, 2).map(x => ({ id: x.id, antes: x.ejercicio_id, nombre: entNombres(x.ejercicios).grande })));
const nuevo = await p.evaluate((ids) => _ent.ejercicios.find(e => !ids.includes(e.id)).id, await p.evaluate(() => _ent.rutina.ejercicios.map(x => x.ejercicio_id)));
await p.evaluate(async ({ id, nuevo }) => { await entDb.actualizarRE(id, { ejercicio_id: nuevo }, { origen: 'agente' }); await entPintarConstructor(); }, { id: re1.id, nuevo });
await p.waitForTimeout(300);
const r1 = await p.evaluate((id) => ({ log: TABLAS_FALSAS.cambios_ejercicio || [], fila: document.querySelector(`[data-cambio-re="${id}"]`)?.innerText || '', hist: document.querySelector('[data-historial-cambios] summary')?.innerText || '' }), re1.id);
const c = r1.log[0] || {};
const nombreNuevo = await p.evaluate((id) => entNombres(_ent.ejercicios.find(e => e.id === id)).grande, nuevo);
ok('con el agente: queda guardado cuál había y cuál quedó', r1.log.length === 1 && c.ejercicio_antes === re1.antes && c.ejercicio_despues === nuevo && c.nombre_antes === re1.nombre && c.nombre_despues === nombreNuevo && c.origen === 'agente' && c.rutina_id === push.id && c.rutina_ejercicio_id === re1.id, JSON.stringify(c));
ok('el renglón muestra «Antes: …» y cómo', r1.fila.includes('Antes:') && r1.fila.includes(re1.nombre) && r1.fila.includes('con el agente'), r1.fila);
ok('la rutina lista los cambios (1)', r1.hist.includes('(1)'), r1.hist);

// 2) Sin agente: Alternativas, y un cambio que no es de ejercicio no cuenta
await p.evaluate(async (id) => { await entDb.actualizarRE(id, { orden: 1 }); await entDb.actualizarRE(id, { series: 4 }); }, re2.id);
ok('cambiar orden o series no se registra como cambio de ejercicio', await p.evaluate(() => TABLAS_FALSAS.cambios_ejercicio.length) === 1);
const otro = await p.evaluate((ids) => _ent.ejercicios.filter(e => !ids.includes(e.id))[1].id, await p.evaluate(() => _ent.rutina.ejercicios.map(x => x.ejercicio_id)));
await p.evaluate(async ({ id, otro }) => { await entDb.actualizarRE(id, { ejercicio_id: otro }); await entPintarConstructor(); }, { id: re2.id, otro });
await p.waitForTimeout(300);
const r2 = await p.evaluate((id) => ({ log: TABLAS_FALSAS.cambios_ejercicio, fila: document.querySelector(`[data-cambio-re="${id}"]`)?.innerText || '', items: document.querySelectorAll('[data-historial-cambios] li').length }), re2.id);
ok('sin agente (a mano) también queda guardado', r2.log.length === 2 && r2.log.some(x => x.origen === 'manual' && x.ejercicio_antes === re2.antes && x.ejercicio_despues === otro) && r2.fila.includes('a mano') && r2.items === 2, JSON.stringify(r2).slice(0, 300));
const orig = await p.evaluate(() => [
  /origen: 'alternativas'/.test(altSustituir.toString()),
  /origen: 'solo-ejercicios'/.test(cxAplicar.toString()),
]);
ok('Alternativas y «Cambiar solo los ejercicios» dicen su origen', orig.every(Boolean), JSON.stringify(orig));
await p.screenshot({ path: path.join(CAPTURAS, 'trazabilidad-cambios.png') });

// 3) La tabla aún no existe: queda en el navegador y se sube después
await p.evaluate(() => {
  const de = sb.from.bind(sb);
  window._sinTabla = true;
  sb.from = (t) => { const q = de(t); if (t !== 'cambios_ejercicio' || !window._sinTabla) return q; const fallar = { data: null, error: { message: 'relation does not exist', code: '42P01' } }; q.insert = () => ({ then: (ok) => Promise.resolve(fallar).then(ok) }); q.select = () => { const r = { eq: () => r, order: () => r, limit: () => r, then: (ok) => Promise.resolve(fallar).then(ok) }; return r; }; return q; };
});
const re3 = await p.evaluate(() => ({ id: _ent.rutina.ejercicios[2].id }));
const tercero = await p.evaluate((ids) => _ent.ejercicios.filter(e => !ids.includes(e.id))[2].id, await p.evaluate(() => _ent.rutina.ejercicios.map(x => x.ejercicio_id)));
await p.evaluate(async ({ id, t }) => { await entDb.actualizarRE(id, { ejercicio_id: t }, { origen: 'alternativas' }); }, { id: re3.id, t: tercero });
await p.waitForTimeout(300);
await p.evaluate(() => entPintarConstructor()); await p.waitForTimeout(300);
const r3 = await p.evaluate((id) => ({ local: JSON.parse(localStorage.getItem('crm:cambiosEjercicioPendientes') || '[]').length, fila: !!document.querySelector(`[data-cambio-re="${id}"]`), nube: TABLAS_FALSAS.cambios_ejercicio.length }), re3.id);
ok('sin tabla: no se pierde (queda en el navegador y se ve igual)', r3.local === 1 && r3.fila && r3.nube === 2, JSON.stringify(r3));
await p.evaluate(() => { window._sinTabla = false; }); await p.evaluate(() => entPintarConstructor()); await p.waitForTimeout(300);
const r4 = await p.evaluate(() => ({ local: JSON.parse(localStorage.getItem('crm:cambiosEjercicioPendientes') || '[]').length, nube: TABLAS_FALSAS.cambios_ejercicio.length, items: document.querySelectorAll('[data-historial-cambios] li').length }));
ok('cuando la tabla existe, se sube sola y no se duplica', r4.local === 0 && r4.nube === 3 && r4.items === 3, JSON.stringify(r4));
ok('sin errores', errores.length === 0, errores.join(' | '));
await ctx.close();
await b.close(); servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
