// Composición → Fotos → «Subir fotos»: las fotos que el cliente te mandó por
// WhatsApp se suben a SU carpeta (su id delante), con la fecha, la pose de
// cada una y el peso, y quedan en fotos_progreso como si las hubiera subido él.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/fotos-subir-crm.mjs
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
    comunidad_posts: [], comunidad_reacciones: [], comunidad_comentarios: [], comunidad_vistas: [], fotos_progreso: [],
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




const JPG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');
for (const [tag, ancho, alto] of [['ancho', 1440, 900], ['telefono', 390, 844]]) {
  console.log(`\n${tag} (${ancho}px)`);
  const a = await abrir(ancho, alto);
  const p = a.p;
  await p.evaluate(() => {
    window.__subidas = [];
    const orig = sb.storage.from.bind(sb.storage);
    sb.storage.from = (b) => { const o = orig(b); return { ...o, upload: async (ruta, f, op) => { window.__subidas.push({ b, ruta, tipo: op && op.contentType }); return { data: { path: ruta }, error: null }; } }; };
    const gu = sb.auth.getUser; sb.auth.getUser = async () => ({ data: { user: { id: 'coach-1' } } });
  });
  await p.evaluate(() => navigate('composicion')); await p.waitForTimeout(600);
  await p.evaluate(async () => { await compCargar('c0'); compTab('fotos'); }); await p.waitForTimeout(800);
  ok(`${tag} · sin fotos: sale el botón «Subir fotos»`, await p.locator('[data-fotos-subir]').count() === 1);
  ok(`${tag} · ya no dice que no puedes subirlas`, !(await p.locator('#view').innerText()).includes('no puedes subirlas'));
  await p.locator('[data-fotos-subir]').click(); await p.waitForTimeout(300);
  await p.locator('#cfs-archivos').setInputFiles([1, 2, 3].map(n => ({ name: `IMG-WA000${n}.jpg`, mimeType: 'image/jpeg', buffer: JPG })));
  await p.waitForTimeout(300);
  ok(`${tag} · 3 fotos, cada una con su pose (frente, lado, espalda)`, JSON.stringify(await p.locator('[data-fotos-subir-item] select').evaluateAll(s => s.map(x => x.value))) === '["frente","lado","espalda"]');
  await p.locator('[data-fotos-subir-item] select').nth(2).selectOption('otra');
  await p.fill('#cfs-fecha', '2026-10-20'); await p.fill('#cfs-peso', '78,4');
  if (tag === 'ancho') await p.locator('#modal-content').screenshot({ path: path.join(CAPTURAS, 'fotos-subir-crm.png') }).catch(() => {});
  await p.locator('[data-fotos-subir-ok]').click(); await p.waitForTimeout(1200);
  const sub = await p.evaluate(() => window.__subidas);
  const filas = await p.evaluate(() => TABLAS_FALSAS.fotos_progreso);
  ok(`${tag} · se suben al bucket privado, a SU carpeta, con fecha y pose`, sub.length === 3 && sub.every(s => s.b === 'progreso' && s.tipo === 'image/jpeg') && /^c0\/2026-10-20-frente-\w+\.jpg$/.test(sub[0].ruta) && /^c0\/2026-10-20-otra-/.test(sub[2].ruta), JSON.stringify(sub));
  ok(`${tag} · quedan en fotos_progreso como las de la app (coach, cliente, fecha, pose, peso)`, filas.length === 3 && filas.every(f => f.user_id === 'coach-1' && f.cliente_id === 'c0' && f.fecha === '2026-10-20' && Number(f.peso_kg) === 78.4) && filas.map(f => f.pose).join() === 'frente,lado,otra' && filas.every((f, i) => f.ruta === sub[i].ruta), JSON.stringify(filas));
  ok(`${tag} · la ventana se cierra y aparecen en la pestaña`, !(await p.locator('#cfs-archivos').count()) && await p.locator('[data-fotos-cabecera] [data-fotos-subir]').count() === 1);
  if (tag === 'ancho') await p.screenshot({ path: path.join(CAPTURAS, 'fotos-subir-crm-despues.png'), fullPage: false });
  ok(`${tag} · sin errores de JavaScript`, !a.errores.length, a.errores.join(' | '));
  await a.ctx.close();
}
await b.close(); servidor.close();
console.log(mal ? `\n${mal} mal` : '\ntodo bien');
process.exit(mal ? 1 : 0);
