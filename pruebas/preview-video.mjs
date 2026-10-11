// Elegir la imagen del preview de un video de YouTube (portada, ¼, mitad, ¾)
// en el editor del ejercicio y en la ventana 🎬 Video, en el CRM entero.
// Usa los mismos datos que pruebas/asistencia.mjs.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/preview-video.mjs
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
  // Un ejercicio con video de YouTube para elegirle la imagen.
  fixture.ejercicios[0] = { ...fixture.ejercicios[0], video_fuente: 'youtube', video_ref: 'dQw4w9WgXcQ', video_url: 'https://youtu.be/dQw4w9WgXcQ', poster_url: null };
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
    if (u.includes('i.ytimg.com')) return ruta.continue().catch(() => ruta.abort());
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

const EJ = fixture.ejercicios[0];
const leer = (p) => p.evaluate((id) => window.TABLAS_FALSAS.ejercicios.find(e => e.id === id).poster_url, EJ.id);

for (const [tag, ancho, alto] of [['ancho', 1440, 1000], ['telefono', 390, 844]]) {
  console.log(`\n${tag} (${ancho}px)`);
  const { ctx, p, errores } = await abrir(ancho, alto);

  // 1. Editor del ejercicio: 4 imágenes, se elige la de ¾ y se guarda.
  await p.evaluate(async () => { await entDb.ejercicios(true); });
  await p.evaluate((id) => entEditarEjercicio(id), EJ.id);
  await p.waitForSelector('#ej-cuadros [data-cuadro]', { timeout: 8000 }).catch(() => {});
  ok(`${tag} · editor: salen las 4 imágenes de YouTube`, await p.locator('#ej-cuadros [data-cuadro]').count() === 4);
  ok(`${tag} · editor: sin elegir, ninguna marcada`, await p.locator('#ej-cuadros [data-elegido]').count() === 0);
  await p.fill('#ej-video-inicio', '7');
  await p.locator('#ej-cuadros [data-cuadro="mq3"]').click();
  ok(`${tag} · editor: al tocar ¾ queda marcada`, await p.locator('#ej-cuadros [data-cuadro="mq3"][data-elegido]').count() === 1);
  ok(`${tag} · editor: elegir la imagen no borra el segundo de inicio`, await p.inputValue('#ej-video-inicio') === '7');
  await p.locator('#ej-cuadros').scrollIntoViewIfNeeded();
  await p.locator('#ej-video-panel').screenshot({ path: path.join(CAPTURAS, `preview-video-editor-${tag}.png`) }).catch(() => {});
  await p.evaluate((id) => entGuardarEjercicio(id), EJ.id);
  await p.waitForTimeout(700);
  ok(`${tag} · editor: se guarda la de ¾ (mq3)`, (await leer(p)) === 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mq3.jpg', await leer(p));

  // 2. La galería usa la elegida.
  const src = await p.evaluate(async (id) => entMiniatura((await entDb.ejercicios()).find(e => e.id === id)), EJ.id);
  ok(`${tag} · galería: el preview es la imagen elegida`, /\/mq3\.jpg$/.test(src || ''), src);
  ok(`${tag} · si cambias el video se usa el mismo cuadro del nuevo`, await p.evaluate(() =>
    entMiniatura({ video_fuente: 'youtube', video_ref: 'NUEVO123456', poster_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mq3.jpg' })) === 'https://i.ytimg.com/vi/NUEVO123456/mq3.jpg');

  // 3. Ventana 🎬 Video: se elige ahí mismo y se guarda al tocar.
  await p.evaluate((id) => entVideoRapido(id), EJ.id);
  await p.waitForSelector('#vr-cuadros [data-cuadro]', { timeout: 8000 }).catch(() => {});
  ok(`${tag} · 🎬 Video: muestra la elegida marcada`, await p.locator('#vr-cuadros [data-cuadro="mq3"][data-elegido]').count() === 1);
  await p.locator('#vr-cuadros [data-cuadro="mqdefault"]').click();
  await p.waitForTimeout(400);
  ok(`${tag} · 🎬 Video: tocar «Portada» la guarda`, (await leer(p)) === 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg', await leer(p));
  await p.locator('[data-video-rapido]').screenshot({ path: path.join(CAPTURAS, `preview-video-rapido-${tag}.png`) }).catch(() => {});
  await p.locator('#vr-cuadros [data-cuadro="mqdefault"]').click();
  await p.waitForTimeout(400);
  ok(`${tag} · 🎬 Video: tocarla otra vez vuelve a la automática`, (await leer(p)) === null, await leer(p));
  if (tag === 'telefono') ok(`${tag} · sin scroll de lado`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

  ok(`${tag} · sin errores de JavaScript`, errores.length === 0, errores.join(' | '));
  await ctx.close();
}

await b.close();
servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
