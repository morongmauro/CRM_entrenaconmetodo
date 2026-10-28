// Videos de YouTube rotos: la app los revisa sola una vez por semana y, si
// alguno no se ve, Seguimiento lo avisa arriba con el botón para arreglarlos.
//
//   NODE_PATH=/ruta/node_modules node pruebas/videos-rotos-seguimiento.mjs
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

function tablas(estados) {
  const cliente = { id: 'c0', user_id: 'coach-1', nombre: 'Ana Pérez', estado: 'activo', objetivo: 'Ganar músculo', monto: 280000, moneda: 'COP', dia_pago: 5, fecha_inicio: '2026-01-05', created_at: '2026-01-01T00:00:00Z' };
  const ej = (id, nombre, alias, ref, extra = {}) => ({ id, user_id: 'coach-1', nombre, alias, video_fuente: 'youtube', video_ref: ref, archivado: false, ...extra });
  return {
    clientes: [cliente], seguimientos: [], pagos: [], pendientes: [], mediciones_corporales: [], fotos_progreso: [],
    settings: [{ user_id: 'coach-1', usd_cop_rate: 4000, nombre_coach: 'Mauro' }],
    metas_historial: [], nutricion_insights: [], ia_uso: [], push_pago_log: [],
    fases: [], rutinas: [], rutina_ejercicios: [], rutina_bloques: [], sesiones: [], series_log: [], eventos: [], evento_registros: [], actividades: [], notas_entreno: [],
    comentarios_coach: [], videos_tecnica: [], cambios_ejercicio: [], rutina_movimientos: [], rutina_extras: [], rutina_dias_quitados: [],
    comunidad_posts: [], comunidad_reacciones: [], comunidad_comentarios: [], comunidad_vistas: [], musculos: [],
    ejercicios: [ej('e1', 'Press banca', 'Bench Press', 'aaa111'), ej('e2', 'Remo con barra', 'Barbell Row', 'bbb222'), ej('e3', 'Sentadilla', 'Back Squat', 'ccc333'), ej('e4', 'Curl', 'Biceps Curl', 'ddd444')],
    ejercicio_video_estado: estados,
  };
}
const ROTOS = [
  { id: 'v1', user_id: 'coach-1', video_ref: 'aaa111', ejercicio_id: 'e1', estado: 'problema', codigo: 400, revisado_en: '2026-10-27T10:00:00Z' },
  { id: 'v2', user_id: 'coach-1', video_ref: 'bbb222', ejercicio_id: 'e2', estado: 'problema', codigo: 150, revisado_en: '2026-10-20T10:00:00Z' },
  { id: 'v3', user_id: 'coach-1', video_ref: 'ccc333', ejercicio_id: 'e3', estado: 'ok', codigo: null, revisado_en: '2026-10-27T10:00:00Z' },
];

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let mal = 0;
const ok = (nombre, c, extra = '') => { if (!c) mal++; console.log(`  ${c ? 'ok ' : 'MAL'}  ${nombre}${c ? '' : '  ' + extra}`); };
async function abrir(ancho, alto, estados) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(e.message));
  await ctx.addInitScript((t) => { window.TABLAS_FALSAS = t; }, tablas(estados));
  await p.route('**/*', (ruta) => {
    const u = ruta.request().url();
    if (u.startsWith(BASE)) return ruta.continue();
    if (u.includes('supabase-js')) return ruta.fulfill({ contentType: 'text/javascript', body: falso });
    if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return ruta.continue().catch(() => ruta.abort());
    return ruta.fulfill({ status: 200, contentType: 'application/json', body: u.includes('/rest/v1/') ? '[]' : '{}' });
  });
  await p.goto(BASE + '/');
  await p.locator('#app-screen').waitFor({ state: 'visible', timeout: 20000 });
  await p.waitForTimeout(800);
  await p.evaluate(() => { try { localStorage.setItem('crm:segModo', 'semana'); } catch (e) {} navigate('seguimiento'); });
  await p.locator('#seg-videos-rotos').waitFor({ state: 'attached', timeout: 15000 });
  await p.waitForTimeout(1500);
  return { ctx, p, errores };
}
const FOTO = process.env.FOTO || '';
{
  console.log('\ncon videos rotos');
  const { ctx, p, errores } = await abrir(1440, 900, ROTOS);
  if (FOTO) await p.screenshot({ path: path.join(CAPTURAS, `videos-rotos-${FOTO}.png`) });
  const t = await p.locator('[data-vr-aviso]').innerText().catch(() => '');
  ok('Seguimiento avisa arriba cuántos no se ven en la app', /2 videos de YouTube no se ven en la app/.test(t), t);
  ok('…con los ejercicios (los que encontró la revisión semanal y el botón)', /Bench Press/.test(t) && /Barbell Row/.test(t) && !/Back Squat/.test(t), t);
  ok('va antes del seguimiento del cliente', await p.evaluate(() => { const a = document.getElementById('seg-videos-rotos'), c = document.getElementById('seg-content'); return !!a && !!c && !!(a.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING); }));
  await p.locator('[data-vr-revisar]').click();
  await p.waitForTimeout(2000);
  ok('«Revisarlos» lleva a la galería, filtrada a los que tienen problema', await p.evaluate(() => _currentView === 'entrenamiento' && _ent.tab === 'ejercicios' && _ent.filtros.video === 'yt'));
  ok('sin errores de JavaScript', errores.length === 0, errores.join(' | '));
  await ctx.close();
}
{
  console.log('\nsin videos rotos');
  const { ctx, p, errores } = await abrir(1440, 900, ROTOS.filter(f => f.estado === 'ok'));
  ok('no sale ningún aviso', (await p.locator('[data-vr-aviso]').count()) === 0);
  ok('sin errores de JavaScript', errores.length === 0, errores.join(' | '));
  await ctx.close();
}
{
  console.log('\nteléfono');
  const { ctx, p, errores } = await abrir(390, 900, ROTOS);
  if (FOTO) await p.screenshot({ path: path.join(CAPTURAS, `videos-rotos-telefono-${FOTO}.png`) });
  ok('teléfono: el aviso cabe sin desbordar', await p.evaluate(() => { const a = document.querySelector('[data-vr-aviso]'); return !!a && a.getBoundingClientRect().right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1; }));
  ok('teléfono: sin errores de JavaScript', errores.length === 0, errores.join(' | '));
  await ctx.close();
}
await b.close(); servidor.close();
console.log(mal ? `\n${mal} falla(s)` : '\ntodo bien');
process.exit(mal ? 1 : 0);
