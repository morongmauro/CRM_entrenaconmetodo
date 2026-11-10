// Mesa de trabajo en 4 columnas (entreno-mesa4.js): galería, rutina, historial y
// notas del cliente al lado de cada ejercicio, y alternativas con video al lado
// de cada ejercicio (sin las que «No le sirven»). En pantalla angosta, 3 columnas.
// El agente de rutinas: un cuadro de escribir, arriba del plan del cliente.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/mesa-4-columnas.mjs
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
let a = await abrir(1920, 1080);
let p = a.p;
// Una nota del cliente y un «No le sirve» para Ana (c0).
const incl = reIds[5], press = reIds[4];
const candPress = await p.evaluate(async ({ ej }) => { const todos = await entDb.ejercicios(); const src = todos.find(e => e.id === ej); return altCandidatos(src, todos).map(x => x.e.id); }, { ej: press.ejercicio_id });
await p.evaluate(({ incl, otro }) => {
  const T = window.TABLAS_FALSAS;
  T.notas_entreno = [{ id: 'n1', cliente_id: 'c0', ejercicio_id: incl, texto: 'Sentí el hombro derecho en la última serie.', created_at: '2026-10-07T10:00:00Z', fecha: '2026-10-07' }];
  T.ejercicios_no_sirven = [
    { id: 'ns1', cliente_id: 'c0', ejercicio_id: incl, motivo: 'implemento', nota: 'no hay Smith donde entrena', creado_en: '2026-10-12T10:00:00Z', quitado_en: null },
    { id: 'ns2', cliente_id: 'c0', ejercicio_id: otro, motivo: 'dolor', nota: null, creado_en: '2026-10-12T10:00:00Z', quitado_en: null },
  ];
}, { incl: incl.ejercicio_id, otro: candPress[0] });
await p.evaluate((id) => entAbrirConstructor(id), push.id);
await p.waitForSelector('#cons-rutina .ent-fila', { timeout: 15000 });
await p.waitForTimeout(900);
ok('sin la mesa: las 3 columnas de siempre (sin columna de alternativas)', await p.locator('#cons-col-alt').count() === 0 && !(await p.locator('#cons-wrap').evaluate(e => e.classList.contains('ent-mesa4'))));
await p.locator('[data-mesa]').click();
await p.waitForSelector('#m4-alt [data-m4-fila]', { timeout: 8000 }).catch(() => {});
await p.waitForTimeout(1500);
const cols = await p.evaluate(() => [...document.querySelector('.ent-mesa-grid').children].filter(c => !c.classList.contains('col-tirador') && getComputedStyle(c).display !== 'none').map(c => { const r = c.getBoundingClientRect(); return [c.id, Math.round(r.left), Math.round(r.width)]; }));
ok('con la mesa: 4 columnas lado a lado (galería, rutina, historial, alternativas)', cols.length === 4 && cols.map(c => c[0]).join() === 'cons-col-gal,cons-col-rutina,asi-panel,cons-col-alt' && cols.every((c, i) => !i || c[1] > cols[i - 1][1]), JSON.stringify(cols));
ok('el menú del CRM no se ve (la mesa ocupa toda la pantalla)', await p.evaluate(() => { const m = document.querySelector('.em-sidebar, aside, nav'); const w = document.getElementById('cons-wrap').getBoundingClientRect(); return w.left <= 20 && w.width >= window.innerWidth - 40; }));
// Alineado: cada cuadro a la altura de su ejercicio.
const alin = await p.evaluate(() => [...document.querySelectorAll('#cons-rutina .ent-fila')].slice(0, 6).map(f => {
  const h = document.querySelector(`#m4-hist [data-m4-fila="${f.dataset.re}"]`), al = document.querySelector(`#m4-alt [data-m4-fila="${f.dataset.re}"]`);
  return h && al ? [Math.round(f.getBoundingClientRect().top), Math.round(h.getBoundingClientRect().top), Math.round(al.getBoundingClientRect().top)] : null;
}));
ok('historial y alternativas a la altura de cada ejercicio', alin.every(x => x && Math.abs(x[0] - x[1]) <= 2 && Math.abs(x[0] - x[2]) <= 2), JSON.stringify(alin));
await p.evaluate(() => { document.getElementById('cons-col-rutina').scrollTop = 900; });
await p.waitForTimeout(400);
const alin2 = await p.evaluate(() => { const f = [...document.querySelectorAll('#cons-rutina .ent-fila')].find(x => { const r = x.getBoundingClientRect(); return r.top > 200 && r.top < 700; });
  const h = document.querySelector(`#m4-hist [data-m4-fila="${f.dataset.re}"]`), al = document.querySelector(`#m4-alt [data-m4-fila="${f.dataset.re}"]`);
  return [Math.round(f.getBoundingClientRect().top), Math.round(h.getBoundingClientRect().top), Math.round(al.getBoundingClientRect().top)]; });
ok('al bajar la rutina, las otras dos columnas bajan con ella', Math.abs(alin2[0] - alin2[1]) <= 2 && Math.abs(alin2[0] - alin2[2]) <= 2, JSON.stringify(alin2));
await p.evaluate(() => { document.getElementById('cons-col-rutina').scrollTop = 0; });
await p.waitForTimeout(300);
const hist = await p.locator(`#m4-hist [data-m4-fila="${incl.id}"]`).innerText();
ok('historial: lo último que hizo y la sugerencia, junto al ejercicio', /Último:/.test(hist), hist.slice(0, 200));
ok('historial: la nota que dejó el cliente en la app sobre ese ejercicio', /Nota del cliente/.test(hist) && /hombro derecho/.test(hist), hist.slice(0, 300));
const nAlt = await p.locator(`#m4-alt [data-m4-fila="${press.id}"] .m4-alt`).count();
ok('alternativas: tarjetas con video y «Usar» que se deslizan de lado', nAlt >= 2 && await p.locator(`#m4-alt [data-m4-fila="${press.id}"] [data-m4-carrusel]`).evaluate(e => e.scrollWidth > e.clientWidth && getComputedStyle(e).overflowX === 'auto'), String(nAlt));
const ocultas = await p.locator(`#m4-alt [data-m4-fila="${press.id}"] [data-m4-ocultas]`).innerText().catch(() => '');
ok('alternativas: no sale la que «No le sirve» y se dice cuántas se ocultan', /Ocultas 1/.test(ocultas) && await p.locator(`#m4-alt [data-m4-fila="${press.id}"] [data-m4-alt-ej="${candPress[0]}"]`).count() === 0, ocultas);
const tag = await p.locator(`#cons-rutina .ent-fila[data-re="${incl.id}"] [data-ns-fila-tag]`).innerText().catch(() => '');
ok('en la rutina: el ejercicio descartado dice por qué y cuándo, con «Cambiarlo»', /No le sirve · sin implemento: no hay Smith donde entrena/.test(tag) && /Cambiarlo/.test(tag), tag);
ok('el agente: arriba de las columnas, como un cuadro de escribir', await p.evaluate(() => { const r = document.getElementById('rut-panel'); const g = document.querySelector('.ent-mesa-grid'); return !!r && r.parentElement.id === 'cons-wrap' && r.getBoundingClientRect().bottom <= g.getBoundingClientRect().top + 1 && !!r.querySelector('.rut-escribir'); }));
await p.screenshot({ path: path.join(CAPTURAS, 'mesa-4-columnas.png') });
// «Usar» cambia el ejercicio en su mismo renglón.
const orden0 = await p.evaluate(() => _ent.rutina.ejercicios.map(x => x.id).join());
const usarEj = await p.locator(`#m4-alt [data-m4-fila="${press.id}"] .m4-alt`).first().getAttribute('data-m4-alt-ej');
await p.locator(`#m4-alt [data-m4-fila="${press.id}"] [data-m4-usar]`).first().click();
await p.waitForTimeout(1500);
const desp = await p.evaluate((reId) => { const re = _ent.rutina.ejercicios.find(x => x.id === reId); return { ej: re.ejercicio_id, orden: _ent.rutina.ejercicios.map(x => x.id).join() }; }, press.id);
ok('«Usar» cambia el ejercicio en su mismo renglón (mismo orden)', desp.ej === usarEj && desp.orden === orden0, JSON.stringify(desp));
await p.waitForTimeout(500);
const alin3 = await p.evaluate((reId) => { const f = document.querySelector(`#cons-rutina .ent-fila[data-re="${reId}"]`); const al = document.querySelector(`#m4-alt [data-m4-fila="${reId}"]`); return [Math.round(f.getBoundingClientRect().top), Math.round(al.getBoundingClientRect().top), (al.innerText.match(/En vez de «([^»]+)»/) || [])[1]]; }, press.id);
ok('después de «Usar», la columna se acomoda y propone para el nuevo', Math.abs(alin3[0] - alin3[1]) <= 2 && !!alin3[2], JSON.stringify(alin3));
// Salir de la mesa: vuelve a 3 columnas.
await p.keyboard.press('Escape'); await p.waitForTimeout(600);
ok('al salir de la mesa vuelve como estaba (sin la cuarta columna; el agente en su sitio)', await p.locator('#cons-col-alt').count() === 0 && await p.evaluate(() => document.getElementById('rut-panel')?.parentElement?.id === 'asi-panel'));
ok('sin errores (ancho)', a.errores.length === 0, a.errores.join(' | '));
await a.ctx.close();

// ── Pantalla angosta (1200): la mesa en 3 columnas, como antes ──
a = await abrir(1200, 900);
p = a.p;
await p.evaluate((id) => entAbrirConstructor(id), push.id);
await p.waitForSelector('#cons-rutina .ent-fila', { timeout: 15000 });
await p.locator('[data-mesa]').click(); await p.waitForTimeout(900);
ok('pantalla de 1200: la mesa sigue en 3 columnas', await p.locator('#cons-col-alt').count() === 0);
ok('sin errores (angosta)', a.errores.length === 0, a.errores.join(' | '));
await a.ctx.close();

// ── El agente en el plan del cliente: arriba, como un cuadro de escribir ──
a = await abrir(1600, 1000);
p = a.p;
await p.locator('nav, aside, body').getByText('Entrenamiento', { exact: true }).first().click();
await p.waitForTimeout(1000);
await p.locator('[data-cliente-ent="c0"]').first().click();
await p.waitForSelector('[data-rut-abrir]', { timeout: 10000 }).catch(() => {});
await p.waitForTimeout(800);
const ag = await p.evaluate(() => { const b = document.querySelector('[data-rut-abrir]'); const tabs = [...document.querySelectorAll('button')].find(x => /Calendario/.test(x.textContent)); return b ? { arriba: b.getBoundingClientRect().top < window.innerHeight, antesDeTabs: !tabs || b.getBoundingClientRect().top < tabs.getBoundingClientRect().top, texto: b.innerText } : null; });
ok('plan del cliente: el agente se ve arriba sin bajar, antes de las pestañas', !!ag && ag.arriba && ag.antesDeTabs, JSON.stringify(ag));
ok('y se ve como un cuadro de escribir («Escríbele al agente…» + «Escribir»)', !!ag && /Escríbele al agente/.test(ag.texto) && /Escribir/.test(ag.texto));
await p.screenshot({ path: path.join(CAPTURAS, 'agente-arriba.png') });
await p.locator('[data-rut-abrir]').click(); await p.waitForTimeout(400);
ok('un toque y ya se está escribiendo (cursor en el cuadro)', await p.evaluate(() => document.activeElement && document.activeElement.id === 'rut-input'));
ok('sin errores (plan)', a.errores.length === 0, a.errores.join(' | '));

await b.close(); servidor.close();
console.log(mal ? `\n${mal} MAL` : '\nTodo bien');
process.exit(mal ? 1 : 0);
