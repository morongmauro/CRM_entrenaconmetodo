// El calendario del cliente muestra todos sus ciclos: la línea «Ciclo X»
// marca cuál es cuál, y lo de otro ciclo se ve (sin poder arrastrarlo).
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/calendario-coach.mjs
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

const c18 = fixture.fases.find(f => f.nombre === 'Ciclo 18');
const c19 = fixture.fases.find(f => f.nombre === 'Ciclo 19');
const SOLO = process.env.SOLO_CAPTURA;
// El Ciclo 19 con su rutina fijada lunes y jueves, para verla en sus días.
fixture.rutinas.find(r => r.fase_id === c19.id).dias_semana = ['L', 'J'];
for (const [tag, ancho, alto] of [['ancho', 1440, 1000], ['telefono', 390, 844]]) {
  console.log(`\n${tag} (${ancho}px)`);
  const { ctx, p, errores } = await abrir(ancho, alto);
  await p.evaluate(() => verEntrenamientoCliente('c0'));
  await p.waitForSelector('[data-cal-actividad]', { timeout: 15000 });
  await p.evaluate((id) => { entVerFase(id); }, c18.id);
  await p.waitForTimeout(500);
  await p.evaluate(() => { _ent.mes = '2026-10'; entVistaClientes(); });
  await p.waitForTimeout(1200);
  await p.locator('#ent-cal').screenshot({ path: path.join(CAPTURAS, `calendario-fases-${SOLO || 'despues'}-${tag}.png`) });
  if (SOLO) { await ctx.close(); continue; }
  const hueco = await p.evaluate(() => {
    const a = document.querySelector('#ent-cal [data-fecha="2026-10-01"] .ent-ciclo-linea').getBoundingClientRect();
    const b = document.querySelector('#ent-cal [data-fecha="2026-10-02"] .ent-ciclo-linea').getBoundingClientRect();
    const c1 = document.querySelector('#ent-cal [data-fecha="2026-10-01"]'), cs = getComputedStyle(c1);
    return { hueco: Math.round(b.left - a.right), pad: cs.paddingLeft, ov: cs.overflow, gap: getComputedStyle(c1.parentElement).columnGap, c: c1.getBoundingClientRect().right, n: document.querySelector('#ent-cal [data-fecha="2026-10-02"]').getBoundingClientRect().left };
  });
  ok(`${tag} · la línea corre seguida de un día al otro`, Math.abs(hueco.hueco) <= 1, JSON.stringify(hueco));
  const lineas = await p.locator('#ent-cal [data-cal-ciclo]').allInnerTexts();
  ok(`${tag} · la línea dice «Ciclo 18» y «Ciclo 19» en octubre`, lineas.some(t => /Ciclo 18/.test(t)) && lineas.some(t => /Ciclo 19/.test(t)), JSON.stringify(lineas));
  const empieza = await p.locator('#ent-cal [data-fecha="2026-10-12"] [data-cal-inicio]').getAttribute('title').catch(() => '');
  ok(`${tag} · el 12 de octubre dice que empieza el Ciclo 19`, /Empieza Ciclo 19/.test(empieza || ''), empieza);
  const otras = await p.locator('#ent-cal .ent-chip-otra').count();
  ok(`${tag} · lo del Ciclo 19 se ve en sus días (${otras} rutinas)`, otras > 0);
  ok(`${tag} · lo del otro ciclo no se arrastra`, await p.locator('#ent-cal .ent-chip-otra[draggable="true"]').count() === 0);
  ok(`${tag} · lo del ciclo abierto sigue igual (se arrastra)`, await p.locator('#ent-cal .ent-chip-rutina[draggable="true"]').count() > 0);
  // Tocar la línea del otro ciclo lo abre, sin cambiar de mes.
  await p.locator('#ent-cal [data-fecha="2026-10-12"] [data-cal-ciclo]').click();
  await p.waitForTimeout(1200);
  ok(`${tag} · tocar «Ciclo 19» lo abre y se queda en octubre`, await p.evaluate((id) => _ent.faseId === id && _ent.mes === '2026-10', c19.id) && /octubre 2026/.test(await p.locator('#ent-cal').innerText()));
  const lineas2 = await p.locator('#ent-cal [data-cal-ciclo]').allInnerTexts();
  ok(`${tag} · desde el Ciclo 19 se ve el 18 en los primeros días`, lineas2.some(t => /Ciclo 18/.test(t)) && await p.locator('#ent-cal [data-fecha="2026-10-05"] .ent-chip-otra').count() > 0);
  ok(`${tag} · la página no se desborda a lo ancho`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  ok(`${tag} · sin errores de JavaScript`, errores.length === 0, errores.join(' | '));
  await ctx.close();
}
await b.close(); servidor.close();
console.log(mal ? `\n${mal} falla(s)` : '\ntodo bien');
process.exit(mal ? 1 : 0);
