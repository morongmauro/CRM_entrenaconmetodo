// La foto del preview de cada ejercicio (CRM entero): la que ve el cliente,
// nunca la de otro video ni un cuadro automático de un video que trae varios
// ejercicios; y la revisión de muchas a la vez desde la galería.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/revisar-fotos.mjs
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



for (const [tag, ancho, alto] of [['ancho', 1440, 900], ['telefono', 390, 844]]) {
  console.log(`\n${tag} (${ancho}px)`);
  const a = await abrir(ancho, alto);
  const p = a.p;
  // Tres casos de prueba sobre ejercicios con video:
  //  · A: tiene guardada una imagen elegida para OTRO video (el de antes)
  //  · B: su video empieza en el segundo 95 (trae varios ejercicios)
  //  · C: normal
  const ids = await p.evaluate(() => {
    const ej = TABLAS_FALSAS.ejercicios.filter(e => e.video_fuente === 'youtube' && e.video_ref).slice(0, 3);
    ej[0].poster_url = 'https://i.ytimg.com/vi/VIEJOvideo1/mq3.jpg';
    ej[1].video_inicio_seg = 95; ej[1].poster_url = null;
    ej[2].poster_url = null; ej[2].video_inicio_seg = null;
    return ej.map(e => e.id);
  });
  await p.evaluate(() => { _ent.ejercicios = null; });
  const mini = await p.evaluate(async (ids) => { await entDb.ejercicios(true); return ids.map(id => entMiniatura(_ent.ejercicios.find(e => e.id === id))); }, ids);
  const refs = await p.evaluate((ids) => ids.map(id => _ent.ejercicios.find(e => e.id === id).video_ref), ids);
  ok(`${tag} · A: nunca la foto de otro video (usa la de su video)`, mini[0] === `https://i.ytimg.com/vi/${refs[0]}/mq2.jpg`, mini[0]);
  ok(`${tag} · B: video que empieza a mitad y sin foto elegida → sin foto (no una equivocada)`, mini[1] === null, String(mini[1]));
  ok(`${tag} · C: la del medio de su video, igual que en la app`, mini[2] === `https://i.ytimg.com/vi/${refs[2]}/mq2.jpg`, mini[2]);

  // La revisión, desde la galería.
  await p.evaluate(() => navigate('entrenamiento')); await p.waitForTimeout(500); await p.evaluate(() => entTab('ejercicios'));
  await p.waitForSelector('[data-revisar-fotos-btn]', { timeout: 15000 });
  await p.locator('[data-revisar-fotos-btn]').click();
  await p.waitForSelector('[data-revisar-fotos]', { timeout: 8000 });
  await p.locator('[data-fotos-filtro="dudosas"]').click();
  await p.waitForTimeout(300);
  const dud = await p.locator('[data-foto-ej]').evaluateAll(n => n.map(x => x.dataset.fotoEj));
  ok(`${tag} · «Dudosas» trae justo A y B, con el motivo escrito`, dud.length === 2 && dud.includes(ids[0]) && dud.includes(ids[1])
    && await p.locator(`[data-foto-ej="${ids[1]}"] [data-foto-duda]`, { hasText: 'segundo 95' }).count() === 1, JSON.stringify(dud));
  ok(`${tag} · B no se puede dar por buena sin elegir cuál es`, await p.locator(`[data-foto-ej="${ids[1]}"] [data-foto-ok]`).isDisabled());
  if (tag === 'ancho') await p.locator('#modal-content').screenshot({ path: path.join(CAPTURAS, 'revisar-fotos-ancho.png') }).catch(() => {});
  // Elegir el ¾ para B: se guarda con el id de SU video.
  await p.locator(`[data-foto-ej="${ids[1]}"] [data-foto-cuadro="mq3"]`).click();
  await p.waitForTimeout(500);
  let fila = await p.evaluate((id) => TABLAS_FALSAS.ejercicios.find(e => e.id === id).poster_url, ids[1]);
  ok(`${tag} · tocar un cuadro lo guarda para su video y la tarjeta queda ✓`, fila === `https://i.ytimg.com/vi/${refs[1]}/mq3.jpg`
    && await p.locator(`[data-foto-ej="${ids[1]}"][data-foto-revisada]`).count() === 1, fila);
  // ✓ Está bien en A.
  await p.locator(`[data-foto-ej="${ids[0]}"] [data-foto-ok]`).click();
  await p.waitForTimeout(500);
  fila = await p.evaluate((id) => TABLAS_FALSAS.ejercicios.find(e => e.id === id).poster_url, ids[0]);
  ok(`${tag} · «✓ Está bien» guarda la que se ve (la del medio de su video)`, fila === `https://i.ytimg.com/vi/${refs[0]}/mq2.jpg`, fila);
  // Página entera: las que usan tus clientes.
  await p.locator('[data-fotos-filtro="sin"]').click();
  await p.waitForTimeout(300);
  const antes = await p.locator('[data-foto-ej]:not([data-foto-revisada])').count();
  await p.locator('[data-fotos-todas-ok]').click();
  await p.waitForTimeout(1500);
  const despues = await p.locator('[data-foto-ej]:not([data-foto-revisada])').count();
  ok(`${tag} · «Todas las de esta página están bien» las marca (${antes} → ${despues})`, antes > 0 && despues === 0, `${antes} → ${despues}`);

  // Cambiar el video de C: su foto vuelve a «sin revisar».
  await p.evaluate(async (id) => { await entFotoGuardar(_ent.ejercicios.find(e => e.id === id), 'mq1'); }, ids[2]);
  await p.evaluate((id) => entPonerVideo(id, 'NUEVOvideo1'), ids[2]);
  await p.waitForTimeout(400);
  const c = await p.evaluate((id) => { const e = _ent.ejercicios.find(x => x.id === id); return { pu: TABLAS_FALSAS.ejercicios.find(x => x.id === id).poster_url, mini: entMiniatura(e), rev: entFotoRevisada(e) }; }, ids[2]);
  ok(`${tag} · al cambiarle el video se borra la foto elegida y vuelve a pedir revisión`, c.pu == null && c.mini === 'https://i.ytimg.com/vi/NUEVOvideo1/mq2.jpg' && !c.rev, JSON.stringify(c));

  const anchoP = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  ok(`${tag} · sin scroll de lado`, anchoP);
  ok(`${tag} · sin errores de JavaScript`, a.errores.length === 0, a.errores.join(' | '));
  await a.ctx.close();
}

await b.close();
servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
