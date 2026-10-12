// Las actividades del calendario del cliente (CRM entero, datos de
// arnes/asistencia-datos.json): varias el mismo día, quitar UN día con su ✕,
// arrastrarlas a otro día y añadir / quitar en lote entre dos fechas. Lo que
// el cliente ya marcó como hecho no se toca nunca.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/actividades-calendario.mjs
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


const c19 = fixture.fases.find(f => f.nombre === 'Ciclo 19');   // 12 oct, 5 semanas
const evs = (p) => p.evaluate(() => JSON.parse(JSON.stringify(TABLAS_FALSAS.eventos)));
const chips = (p, f) => p.locator(`.ent-celda[data-fecha="${f}"] .ent-chip-evento .ent-chip-txt`).allInnerTexts();
const recargar = async (p) => { await p.evaluate(() => { _ent.eventosCache = null; return entVistaClientes(); }); await p.waitForTimeout(700); };

for (const [tag, ancho, alto] of [['ancho', 1440, 900], ['telefono', 390, 844]]) {
  console.log(`\n${tag} (${ancho}px)`);
  const a = await abrir(ancho, alto);
  const p = a.p;
  await p.evaluate(() => { fmt.hoy = () => '2026-10-12'; return verEntrenamientoCliente('c0'); });
  await p.waitForSelector('[data-cal-lote]', { timeout: 15000 });
  await p.evaluate((id) => entVerFase(id), c19.id);
  await p.waitForTimeout(700);
  // Que se vea octubre
  await p.evaluate(() => { _ent.mes = '2026-10'; return entVistaClientes(); }).catch(() => {});
  await p.waitForTimeout(500);

  // 1. En lote: caminata de lunes a viernes en todo el ciclo → UN evento que se repite.
  await p.locator('[data-cal-lote]').click();
  await p.waitForSelector('#ev-catalogo [data-ev-act]', { timeout: 5000 });
  await p.locator('#ev-catalogo [data-ev-act="caminata"]').click();
  await p.waitForTimeout(150);
  for (const d of ['S', 'D']) await p.locator(`.lote-dia[value="${d}"]`).uncheck();
  await p.fill('#lote-duracion', '30');
  await p.waitForTimeout(150);
  const vista = await p.locator('#lote-vista').innerText();
  ok(`${tag} · en lote dice antes cuántos días (25: L a V, 5 semanas)`, /25 día/.test(vista), vista);
  if (tag === 'ancho') await p.locator('#modal-content').screenshot({ path: path.join(CAPTURAS, 'actividades-lote-ancho.png') }).catch(() => {});
  await p.locator('#lote-ok').click();
  await p.waitForTimeout(800);
  let e = await evs(p);
  const cam = e.find(x => x.titulo === 'Caminata');
  ok(`${tag} · se guarda como una sola caminata que se repite L-V en el ciclo`, e.length === 1 && cam && JSON.stringify(cam.dias_semana) === '["L","M","X","J","V"]' && cam.fase_id === c19.id && cam.semanas == null && cam.duracion_min === 30, JSON.stringify(e));
  ok(`${tag} · y sale en el calendario (lunes 12 y viernes 16, no el sábado 17)`, (await chips(p, '2026-10-12')).some(t => /Caminata/.test(t)) && (await chips(p, '2026-10-16')).some(t => /Caminata/.test(t))
    && !(await chips(p, '2026-10-17')).some(t => /Caminata/.test(t)));

  // 2. Otra actividad el mismo día desde el panel del día: Yoga el 14, y la caminata se queda.
  await p.locator('.ent-celda[data-fecha="2026-10-14"] .ent-celda-num').click();
  await p.waitForSelector('[data-dia-panel]', { timeout: 5000 });
  ok(`${tag} · tocar el día abre lo de ese día con su ✕ y «+ Otra actividad»`, await p.locator('[data-dia-evento]').count() === 1 && await p.locator('[data-dia-agregar]', { hasText: 'Otra actividad' }).count() === 1);
  if (tag === 'ancho') await p.locator('#modal-content').screenshot({ path: path.join(CAPTURAS, 'actividades-dia-ancho.png') }).catch(() => {});
  await p.locator('[data-dia-agregar]').click();
  await p.waitForSelector('#ev-catalogo [data-ev-act]', { timeout: 5000 });
  ok(`${tag} · y el editor abre en «un solo día» con esa fecha`, await p.inputValue('#ev-fecha') === '2026-10-14' && await p.locator('[data-evmodo="fecha"].active').count() === 1);
  await p.locator('#ev-catalogo [data-ev-act="yoga"]').click();
  await p.locator('button:has-text("Guardar")').last().click();
  await p.waitForTimeout(800);
  const d14 = await chips(p, '2026-10-14');
  ok(`${tag} · el 14 tiene caminata Y yoga (no se pisan)`, d14.length === 2 && d14.some(t => /Caminata/.test(t)) && d14.some(t => /Yoga/.test(t)), JSON.stringify(d14));

  // 3. ✕ de la caminata el miércoles 15: solo ese día.
  await p.locator('.ent-celda[data-fecha="2026-10-15"] [data-quitar-evento]').first().click({ force: true });
  await p.waitForTimeout(800);
  e = await evs(p);
  ok(`${tag} · la ✕ quita la caminata solo el 15 (la serie sigue)`, JSON.stringify(e.find(x => x.titulo === 'Caminata').fechas_excluidas) === '["2026-10-15"]'
    && !(await chips(p, '2026-10-15')).some(t => /Caminata/.test(t)) && (await chips(p, '2026-10-16')).some(t => /Caminata/.test(t)), JSON.stringify(e.find(x => x.titulo === 'Caminata')));

  // 4. Arrastrar la caminata del viernes 16 al lunes 19 (que ya tiene la suya: quedan dos).
  await p.locator('.ent-celda[data-fecha="2026-10-19"]').scrollIntoViewIfNeeded();
  await p.locator('.ent-celda[data-fecha="2026-10-16"] .ent-chip-evento').first().dragTo(p.locator('.ent-celda[data-fecha="2026-10-19"]'));
  await p.waitForTimeout(900);
  e = await evs(p);
  ok(`${tag} · arrastrar mueve ese día: sale el 16 y queda el 19 (junto a la del 19)`, e.find(x => x.titulo === 'Caminata').fechas_excluidas.includes('2026-10-16')
    && e.some(x => x.titulo === 'Caminata' && x.fecha === '2026-10-19') && (await chips(p, '2026-10-19')).filter(t => /Caminata/.test(t)).length === 2 && !(await chips(p, '2026-10-16')).some(t => /Caminata/.test(t)), JSON.stringify(e));
  // …y el yoga (de un solo día) cambia de fecha.
  await p.locator('.ent-celda[data-fecha="2026-10-14"] .ent-chip-evento', { hasText: 'Yoga' }).dragTo(p.locator('.ent-celda[data-fecha="2026-10-21"]'));
  await p.waitForTimeout(900);
  e = await evs(p);
  ok(`${tag} · el yoga de un solo día se mueve del 14 al 21`, e.find(x => x.titulo === 'Yoga').fecha === '2026-10-21' && e.filter(x => x.titulo === 'Yoga').length === 1);

  // 5. Lo que marcó como hecho no se quita: caminata del lunes 13 hecha.
  await p.evaluate((id) => { (TABLAS_FALSAS.actividades = TABLAS_FALSAS.actividades || []).push({ id: 'a-h', cliente_id: 'c0', user_id: 'coach-1', fecha: '2026-10-13', tipo: 'caminata', evento_id: id }); }, cam.id);
  await recargar(p);
  ok(`${tag} · lo marcado sale con ✓ y sin ✕`, await p.locator('.ent-celda[data-fecha="2026-10-13"] .ent-chip-hecho').count() === 1 && await p.locator('.ent-celda[data-fecha="2026-10-13"] [data-quitar-evento]').count() === 0);

  // 6. En lote: quitar las caminatas del 13 al 19 (semana de viaje).
  await p.locator('[data-cal-lote]').click();
  await p.waitForSelector('[data-lote="quitar"]');
  await p.locator('[data-lote="quitar"]').click();
  await p.selectOption('#lote-que', 't:Caminata');
  await p.fill('#lote-desde', '2026-10-13'); await p.fill('#lote-hasta', '2026-10-19');
  await p.locator('#lote-desde').dispatchEvent('change');
  await p.waitForTimeout(200);
  const v2 = await p.locator('#lote-vista').innerText();
  // 14 y 19 de la serie + la suelta del 19 (el 15 y el 16 ya no estaban; el 13 está hecho).
  ok(`${tag} · al quitar en lote avisa cuántos y que lo hecho se queda`, /Se quitan 3 día/.test(v2) && /1 que ya marcó/.test(v2), v2);
  await p.locator('#lote-ok').click();
  await p.waitForTimeout(900);
  e = await evs(p);
  const camF = e.find(x => x.id === cam.id);
  ok(`${tag} · quedan quitados 14, 15, 16 y 19; el 13 (hecho) sigue; la suelta del 19 se borró`,
    ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-19'].every(f => camF.fechas_excluidas.includes(f)) && !camF.fechas_excluidas.includes('2026-10-13')
    && !e.some(x => x.titulo === 'Caminata' && x.fecha === '2026-10-19') && (await chips(p, '2026-10-13')).some(t => /Caminata/.test(t))
    && (await chips(p, '2026-10-20')).some(t => /Caminata/.test(t)), JSON.stringify(e));

  // 7. Borrar la serie entera con algo marcado: se quitan los días que faltan, la fila (y lo hecho) se queda.
  await p.evaluate((id) => { _evt.ctx = entCtxEvento(); return evtBorrar(id); }, cam.id);
  await p.waitForTimeout(900);
  e = await evs(p);
  const camB = e.find(x => x.id === cam.id);
  ok(`${tag} · borrar la serie con días hechos no borra la fila: deja solo lo hecho`, camB && (await chips(p, '2026-10-20')).every(t => !/Caminata/.test(t)) && (await chips(p, '2026-10-13')).some(t => /Caminata/.test(t)), JSON.stringify(camB));

  const anchoP = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  ok(`${tag} · sin scroll de lado`, anchoP);
  if (tag === 'ancho') await p.locator('#ent-cal').screenshot({ path: path.join(CAPTURAS, 'actividades-calendario-ancho.png') }).catch(() => {});
  ok(`${tag} · sin errores de JavaScript`, a.errores.length === 0, a.errores.join(' | '));
  await a.ctx.close();
}

await b.close();
servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
