// Progreso de fuerza (progreso-fuerza.js): en Seguimiento y en la ficha del
// cliente, la gráfica por ejercicio (peso y reps de la mejor serie de cada
// sesión) y por patrón (Empuje, Tracción, Pierna: % de fuerza frente al
// inicio, semana a semana).
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/progreso-fuerza.mjs
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
    if (u.includes('img.youtube.com') || u.includes('i.ytimg.com')) return ruta.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#5F6670"/></svg>' });
    if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return ruta.continue().catch(() => ruta.abort());
    return ruta.fulfill({ status: 200, contentType: 'application/json', body: u.includes('/rest/v1/') ? '[]' : '{}' });
  });
  await p.goto(BASE + '/');
  await p.locator('#app-screen').waitFor({ state: 'visible', timeout: 20000 });
  await p.waitForTimeout(800);
  return { ctx, p, errores };
}



const { ctx, p, errores } = await abrir(1440, 900);
await p.evaluate(() => navigate('seguimiento'));
// En Seguimiento las gráficas van plegadas bajo «Más de…»: se abren.
await p.locator('[data-seg-progreso]').waitFor({ timeout: 20000 });
await p.evaluate(() => { document.querySelector('[data-seg-progreso]').open = true; });
await p.locator('#seg-pf [data-pf-tab]').first().waitFor({ timeout: 20000 });
await p.waitForTimeout(400);
const r1 = await p.evaluate(() => {
  const c = document.querySelector('#seg-pf');
  const sel = c.querySelector('[data-pf-ejercicio]');
  const svg = c.querySelector('[data-pf-grafica-ejercicio]');
  return { opciones: sel ? sel.options.length : 0, svg: !!svg, puntos: svg ? svg.querySelectorAll('circle').length : 0, barras: svg ? svg.querySelectorAll('rect').length : 0,
    resumen: c.querySelector('[data-pf-resumen]')?.innerText || '', filtros: [...c.querySelectorAll('[data-pf-filtro]')].map(b => b.dataset.pfFiltro) };
});
ok('Seguimiento: el panel de progreso con la lista de ejercicios', r1.opciones >= 5, JSON.stringify(r1));
ok('por ejercicio: gráfica con un punto por sesión (peso) y barras de reps', r1.svg && r1.puntos >= 2 && r1.barras >= 2, JSON.stringify(r1));
ok('por ejercicio: peso, reps y fuerza estimada de la primera a la última', /→/.test(r1.resumen) && /Reps/.test(r1.resumen) && /%/.test(r1.resumen), r1.resumen);
ok('filtros por patrón (Empuje, Tracción…)', r1.filtros.includes('empuje') && r1.filtros.includes('traccion'), JSON.stringify(r1.filtros));
await p.locator('[data-seg-progreso]').screenshot({ path: path.join(CAPTURAS, 'progreso-ejercicio.png') });
// El dato de la gráfica es el de la base: mejor serie de cada sesión del primer ejercicio elegido.
const r2 = await p.evaluate(() => {
  const c = document.querySelector('#seg-pf'), id = c.querySelector('[data-pf-ejercicio]').value;
  const ses = TABLAS_FALSAS.sesiones.filter(s => s.estado === 'completada' && s.cliente_id === 'c0');
  const fechas = new Set(TABLAS_FALSAS.series_log.filter(l => l.ejercicio_id === id && l.completada !== false && Number(l.reps) > 0 && ses.some(s => s.id === l.sesion_id)).map(l => ses.find(s => s.id === l.sesion_id).fecha));
  const svg = c.querySelector('[data-pf-grafica-ejercicio]');
  return { esperadas: Math.min(16, fechas.size), dibujadas: svg ? svg.querySelectorAll('circle').length : 0 };
});
ok('…un punto por cada día que lo hizo (de la base de datos)', r2.esperadas === r2.dibujadas, JSON.stringify(r2));
await p.locator('#seg-pf [data-pf-filtro="traccion"]').click(); await p.waitForTimeout(200);
const r3 = await p.evaluate(() => {
  const id = document.querySelector('#seg-pf [data-pf-ejercicio]').value;
  return TABLAS_FALSAS.ejercicios.find(e => e.id === id)?.patron;
});
ok('filtro Tracción: solo ejercicios de tracción', r3 === 'pull', r3);
await p.locator('#seg-pf [data-pf-tab="patron"]').click(); await p.waitForTimeout(200);
const r4 = await p.evaluate(() => [...document.querySelectorAll('#seg-pf [data-pf-patron]')].map(x => ({ id: x.dataset.pfPatron, grande: x.querySelector('.pf-grande').innerText, curva: !!x.querySelector('[data-pf-grafica-patron] path') })));
ok('por patrón: Empuje, Tracción y Pierna, con su % y su curva', r4.length === 3 && r4.map(x => x.id).join() === 'empuje,traccion,pierna' && r4[0].curva && /%/.test(r4[0].grande), JSON.stringify(r4));
await p.locator('[data-seg-progreso]').screenshot({ path: path.join(CAPTURAS, 'progreso-patron.png') });
await p.locator('#seg-pf [data-pf-patron="empuje"] .pf-fila').first().click(); await p.waitForTimeout(200);
ok('tocar un ejercicio del patrón abre su gráfica', await p.locator('#seg-pf [data-pf-grafica-ejercicio]').count() === 1);

// La ficha del cliente, pestaña Entrenamiento.
await p.evaluate(() => verCliente('c0'));
await p.locator('[data-ficha-tab="entreno"]').waitFor({ timeout: 15000 });
await p.locator('[data-ficha-tab="entreno"]').click();
await p.locator('#ficha-pf [data-pf-tab]').first().waitFor({ timeout: 15000 });
await p.waitForTimeout(300);
const r5 = await p.evaluate(() => { const s = document.querySelector('#ficha-pf').closest('[data-ficha-sec]'); return { sec: s && s.dataset.fichaSec, visible: s && s.offsetParent !== null, svg: !!document.querySelector('#ficha-pf svg') }; });
ok('ficha: «Progreso de fuerza» en la pestaña Entrenamiento, con su gráfica', r5.sec === 'entreno' && r5.visible && r5.svg, JSON.stringify(r5));
await p.screenshot({ path: path.join(CAPTURAS, 'progreso-ficha.png'), fullPage: false });
ok('sin errores', errores.length === 0, errores.join(' | '));
await ctx.close();
await b.close(); servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
