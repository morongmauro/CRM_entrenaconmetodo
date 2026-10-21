// Composición → «Todo el equipo»: quién está al día con su medición, quién
// hace rato no se mide y a quién revisarle la meta según su última medición.
// Y en Clientes, la fila «App» (vista completa / compacta) y su filtro.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/composicion-equipo.mjs
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

const hace = (n) => { const t = new Date(); t.setDate(t.getDate() - n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
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
  const otro = (id, nombre) => ({ ...cliente, id, nombre });
  return {
    clientes: [cliente, otro('c1', 'Beto Ruiz'), otro('c2', 'Caro Díaz'), otro('c3', 'Dani Gómez')], seguimientos, pagos: [], pendientes: [],
    mediciones_corporales: [
      { id: 'm1', user_id: 'coach-1', cliente_id: 'c0', fecha: hace(10), peso: 70, grasa_pct: 22 },
      { id: 'm2', user_id: 'coach-1', cliente_id: 'c1', fecha: hace(90), peso: 80, grasa_pct: 18 },
      { id: 'm3', user_id: 'coach-1', cliente_id: 'c3', fecha: hace(5), peso: 60, grasa_pct: 25 },
    ],
    settings: [{ user_id: 'coach-1', usd_cop_rate: 4000, nombre_coach: 'Mauro' }],
    metas_historial: [
      { id: 'g1', user_id: 'coach-1', cliente_id: 'c0', fecha: hace(30), kcal: 2000, proteina_g: 150, carbos_g: 200, grasas_g: 60, peso_kg: 66, grasa_pct: 22, created_at: hace(30) + 'T10:00:00Z' },
      { id: 'g2', user_id: 'coach-1', cliente_id: 'c1', fecha: hace(100), kcal: 2400, proteina_g: 160, carbos_g: 260, grasas_g: 70, peso_kg: 80, grasa_pct: 18, created_at: hace(100) + 'T10:00:00Z' },
      { id: 'g3', user_id: 'coach-1', cliente_id: 'c3', fecha: hace(60), kcal: 1800, proteina_g: 120, carbos_g: 180, grasas_g: 55, created_at: hace(60) + 'T10:00:00Z' },
    ],
    nutricion_insights: [], ia_uso: [], push_pago_log: [],
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
    // Fotos de progreso de Ana: tres de frente (la más vieja con peso de su
    // medición, la nueva con su kg) y una sola de lado (sin comparador).
    fotos_progreso: [
      { id: 'f1', cliente_id: 'c0', fecha: hace(98), pose: 'frente', ruta: 'c0/f1.jpg', peso_kg: 72.2, nota: null },
      { id: 'f2', cliente_id: 'c0', fecha: hace(50), pose: 'frente', ruta: 'c0/f2.jpg', peso_kg: null, nota: 'misma luz' },
      { id: 'f3', cliente_id: 'c0', fecha: hace(1), pose: 'frente', ruta: 'c0/f3.jpg', peso_kg: 70, nota: null },
      { id: 'f4', cliente_id: 'c0', fecha: hace(1), pose: 'lado', ruta: 'c0/f4.jpg', peso_kg: 70, nota: null },
    ],
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
  await p.evaluate(() => navigate('composicion'));
  await p.waitForSelector('[data-comp-ver-equipo]', { timeout: 15000 });
  await p.locator('[data-comp-ver-equipo]').click();
  await p.waitForSelector('[data-comp-al-dia]', { timeout: 15000 });
  const t = async (sel) => (await p.locator(sel).innerText().catch(() => ''));
  const alDia = await t('[data-comp-al-dia]'), viejos = await t('[data-comp-viejos]'), meta = await t('[data-comp-meta]'), otros = await t('[data-comp-otros]');
  ok(`${tag} · al día: los medidos hace poco (Ana, Dani)`, /Ana Pérez/.test(alDia) && /Dani Gómez/.test(alDia) && !/Beto/.test(alDia), alDia);
  ok(`${tag} · hace rato: Beto (90 días) y Caro (nunca)`, /Beto Ruiz/.test(viejos) && /hace 90 días/.test(viejos) && /Caro Díaz/.test(viejos) && /nunca/.test(viejos), viejos);
  ok(`${tag} · posible cambio de meta: Ana, por el peso (+4 kg desde la meta)`, /Ana Pérez/.test(meta) && /peso \+4 kg/.test(meta) && !/Beto|Dani|Caro/.test(meta), meta);
  ok(`${tag} · la meta sin peso de referencia va aparte, no como cambio de meta`, /Dani Gómez/.test(otros) && /no guarda con qué peso/.test(otros), otros);
  if (tag === 'ancho') await p.screenshot({ path: path.join(CAPTURAS, 'composicion-equipo.png'), fullPage: true });
  await p.locator('[data-comp-meta]').getByRole('button', { name: 'Ana Pérez' }).click();
  await p.waitForTimeout(800);
  ok(`${tag} · tocar el nombre abre su composición`, /Composición · Ana Pérez/.test(await p.locator('#view').innerText()));
  ok(`${tag} · no se cambió nada (solo lee)`, await p.evaluate(() => TABLAS_FALSAS.metas_historial.length === 3 && TABLAS_FALSAS.mediciones_corporales.length === 3));
  // Fotos: comparador lado a lado (antes y ahora), diferencia y «nuevas».
  await p.evaluate(() => compTab('fotos')); await p.waitForSelector('[data-fotos-comparar="frente"]', { timeout: 15000 }); await p.waitForTimeout(400);
  const cmp = await t('[data-fotos-comparar="frente"]');
  ok(`${tag} · fotos: comparador de frente, la más vieja contra la más nueva`, /antes y ahora/.test(cmp) && (await p.locator('[data-fotos-comparar="frente"] img').count()) === 2, cmp);
  ok(`${tag} · fotos: diferencia −2,2 kg y 14 semanas, 3 fotos`, /−2,2 kg/.test(cmp) && /14 semanas/.test(cmp) && /Fotos\s*3/.test(cmp), cmp);
  ok(`${tag} · fotos: de lado (una sola) no tiene comparador`, (await p.locator('[data-fotos-comparar="lado"]').count()) === 0);
  ok(`${tag} · fotos: las dos de ayer salen como nuevas`, /2 nuevas/.test(await t('[data-fotos-nuevas]')) && (await p.locator('[data-foto-nueva]').count()) === 2);
  await p.locator('[data-fotos-comparar="frente"] select').first().selectOption('f2'); await p.waitForTimeout(400);
  ok(`${tag} · fotos: cambiar el lado izquierdo recalcula el tiempo (7 semanas)`, /7 semanas/.test(await t('[data-fotos-comparar="frente"]')));
  if (tag === 'ancho') await p.screenshot({ path: path.join(CAPTURAS, 'composicion-fotos.png'), fullPage: true });
  await p.evaluate(() => navigate('clientes')); await p.waitForTimeout(900);
  ok(`${tag} · Clientes: cada tarjeta tiene su fila «App»`, (await p.locator('[data-vista-cell]').count()) === 4);
  ok(`${tag} · Clientes: el filtro «Vista compacta» está (en 0 sin la app conectada)`, /Vista compacta · 0/.test(await t('[data-filtro-compacta]')));
  ok(`${tag} · sin scroll de lado`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  ok(`${tag} · sin errores de JavaScript`, a.errores.length === 0, a.errores.join(' | '));
  await a.ctx.close();
}

await b.close();
servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
