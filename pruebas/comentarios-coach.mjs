// Comentario del coach por ejercicio (comentarios-coach.js): el botón en cada
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
await p.evaluate((id) => entAbrirConstructor(id), push.id);
await p.waitForSelector('#cons-rutina .ent-fila', { timeout: 15000 });
await p.waitForTimeout(400);
const [re1, re2] = await p.evaluate(() => _ent.rutina.ejercicios.slice(0, 2).map(x => ({ id: x.id, ej: x.ejercicio_id, cliente: _ent.rutina.cliente_id })));
ok('cada ejercicio de la rutina del cliente trae «Comentario del coach»', await p.locator('#cons-rutina [data-cc-btn]').count() === await p.locator('#cons-rutina .ent-fila').count());
// Una nota del cliente en ese ejercicio, sin ver.
await p.evaluate(({ re1 }) => { (TABLAS_FALSAS.notas_entreno ||= []).push({ id: 'n1', cliente_id: re1.cliente, ejercicio_id: re1.ej, texto: 'Me molesta un poco el hombro derecho al bajar.', created_at: '2026-10-13T12:00:00Z', leida_en: null });
  _cc.cache = {}; document.querySelectorAll('[data-cc-listo]').forEach(b => b.removeAttribute('data-cc-listo')); return ccRevisarPantalla(); }, { re1 });
await p.waitForTimeout(300);
ok('con una nota nueva del cliente, el botón lleva el circulito', await p.locator(`[data-cc-btn="${re1.id}"].cc-nuevo`).count() === 1 && await p.locator('.cc-btn.cc-nuevo').count() === 1);
await p.locator(`[data-cc-btn="${re1.id}"]`).click();
await p.waitForSelector('[data-cc-ventana]');
ok('la ventana trae la conversación con la nota del cliente', /Me molesta un poco el hombro/.test(await p.locator('[data-cc-ventana]').innerText()));
await p.waitForTimeout(200);
ok('abrir la conversación da la nota por vista (como en la Bandeja)', await p.evaluate(() => !!TABLAS_FALSAS.notas_entreno[0].leida_en) && await p.locator('.cc-btn.cc-nuevo').count() === 0);
// Puntual
await p.fill('#cc-texto', 'Hoy baja a 55 kg y acorta un poco el recorrido.');
await p.click('[data-cc-enviar]'); await p.waitForTimeout(300);
let filas = await p.evaluate(() => TABLAS_FALSAS.comentarios_coach || []);
ok('«Para la próxima vez» se guarda como puntual, del cliente y del ejercicio', filas.length === 1 && filas[0].tipo === 'puntual' && filas[0].cliente_id === String(re1.cliente) && filas[0].ejercicio_id === String(re1.ej) && filas[0].rutina_ejercicio_id === String(re1.id), JSON.stringify(filas));
ok('en la conversación sale con su etiqueta y «Sin leer»', /Próxima vez/i.test(await p.locator('[data-cc-tipo="puntual"]').innerText()) && /Sin leer/.test(await p.locator('[data-cc-tipo="puntual"]').innerText()));
// Siempre presente
await p.click('[data-cc-elegir="siempre"]');
ok('al elegir «Siempre presente» explica que queda fijo sin avisos', /fijo en la tarjeta/.test(await p.locator('[data-cc-ayuda]').innerText()));
await p.fill('#cc-texto', 'Baja la barra controlada (2 s) y codos a 45°.');
await p.click('[data-cc-enviar]'); await p.waitForTimeout(300);
ok('la fila muestra «Siempre presente: …» bajo el nombre', /Siempre presente: Baja la barra controlada/.test(await p.locator(`[data-cc-siempre="${re1.id}"]`).innerText()));
await p.fill('#cc-texto', 'Codos a 45° y pausa abajo.');
await p.click('[data-cc-enviar]'); await p.waitForTimeout(300);
filas = await p.evaluate(() => TABLAS_FALSAS.comentarios_coach);
const siempres = filas.filter(f => f.tipo === 'siempre');
ok('un nuevo «Siempre presente» reemplaza al anterior sin borrarlo', siempres.length === 2 && siempres.filter(f => !f.quitado_en).length === 1 && /pausa abajo/.test(siempres.find(f => !f.quitado_en).texto)
  && /pausa abajo/.test(await p.locator(`[data-cc-siempre="${re1.id}"]`).innerText()));
// Leído (lo marca la app): se ve en la conversación
await p.evaluate(() => { TABLAS_FALSAS.comentarios_coach.find(f => f.tipo === 'puntual').leido_en = new Date().toISOString(); });
await p.evaluate((id) => { closeModal(); return ccAbrir(id); }, re1.id); await p.waitForTimeout(200);
ok('cuando el cliente lo lee, dice «Leído» y cuándo', /Leído hoy/.test(await p.locator('[data-cc-tipo="puntual"]').innerText()));
await p.screenshot({ path: path.join(CAPTURAS, 'comentarios-coach.png') });
// Quitar
const idP = filas.find(f => f.tipo === 'puntual').id;
await p.locator(`[data-cc-comentario="${idP}"] .cc-quitar`).click(); await p.waitForTimeout(300);
ok('quitar no borra: le pone la fecha y sale de la conversación', await p.evaluate((id) => TABLAS_FALSAS.comentarios_coach.filter(f => f.id === id).length === 1 && !!TABLAS_FALSAS.comentarios_coach.find(f => f.id === id).quitado_en, idP)
  && await p.locator(`[data-cc-comentario="${idP}"]`).count() === 0);
ok('nada se borró de ninguna tabla', await p.evaluate(() => TABLAS_FALSAS.comentarios_coach.length === 3 && TABLAS_FALSAS.notas_entreno.length === 1));
ok('el otro ejercicio no tiene nada', !(await p.locator(`[data-cc-siempre="${re2.id}"]`).innerText()).trim());
ok('sin errores', errores.length === 0, errores.join(' | '));
await ctx.close();
await b.close(); servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
