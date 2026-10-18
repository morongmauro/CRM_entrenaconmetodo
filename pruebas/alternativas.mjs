// Alternativas de un ejercicio en el constructor (sin IA): la ventana abre con
// ejercicios del mismo movimiento y músculos, los filtros funcionan, marca los
// que ya están en la rutina y los que el cliente ya hizo, y «Sustituir» cambia
// el ejercicio en SU MISMO renglón: mismas series, reps, peso, descanso, RIR,
// orden y bloque, sin recargar la página.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/alternativas.mjs
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
let p;
for (const [tag, ancho, alto] of [['ancho', 1600, 900], ['telefono', 390, 844]]) {
  console.log(`\n${tag} (${ancho}px)`);
  const a = await abrir(ancho, alto);
  p = a.p;
  await p.evaluate((id) => entAbrirConstructor(id), push.id);
  await p.waitForSelector('#cons-rutina .ent-fila', { timeout: 15000 });
  await p.waitForTimeout(400);
  await p.evaluate(() => { document.getElementById('cons-col-rutina').dataset.marca = 'sigo'; });
  // El ejercicio de la rutina con más alternativas en la galería de prueba.
  const re = await p.evaluate(() => { const x = _ent.rutina.ejercicios.slice().sort((a, b) => altCandidatos(b.ejercicios, _ent.ejercicios).length - altCandidatos(a.ejercicios, _ent.ejercicios).length)[0];
    return x && { id: x.id, ej: x.ejercicio_id, nombre: entNombres(x.ejercicios).grande }; });
  ok(`${tag} · cada ejercicio tiene su botón «Alternativas»`, await p.locator('#cons-rutina .ent-fila [data-alternativas]').count() === await p.locator('#cons-rutina .ent-fila').count());
  await p.locator(`#cons-rutina .ent-fila[data-re="${re.id}"] [data-alternativas]`).click();
  await p.waitForSelector('#alt-lista .alt-item', { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(600);
  const v = await p.evaluate((ej) => { const ids = [...document.querySelectorAll('#alt-lista .alt-item')].map(x => x.dataset.alt);
    return { n: ids.length, titulo: document.querySelector('.alt-titulo')?.textContent, sinSiMismo: !ids.includes(ej), ancho: document.querySelector('.alt-modal').scrollWidth <= document.querySelector('.alt-modal').clientWidth + 1 }; }, re.ej);
  ok(`${tag} · se abre con alternativas para «${re.nombre}» (${v.n})`, v.n > 0 && v.titulo === re.nombre && v.sinSiMismo, JSON.stringify(v));
  ok(`${tag} · nada se sale de lo ancho`, v.ancho);
  const hizo = await p.locator('#alt-lista .alt-hizo').count();
  const ya = await p.locator('#alt-lista .alt-ya').count();
  ok(`${tag} · marca lo que ya hizo el cliente (${hizo}) y lo que ya está en la rutina (${ya})`, hizo + ya > 0);
  if (tag === 'ancho' || tag === 'telefono') await p.screenshot({ path: path.join(CAPTURAS, `alternativas-${tag}.png`) });
  // Filtros
  await p.locator('.alt-filtro[data-f="sin_peso"]').click(); await p.waitForTimeout(150);
  const sp = await p.evaluate(() => [...document.querySelectorAll('#alt-lista .alt-item')].map(x => (_ent.ejercicios.find(e => e.id === x.dataset.alt) || {}).equipo || []));
  ok(`${tag} · «Sin peso»: ninguna lleva carga (${sp.length})`, sp.length > 0 && sp.every(eq => !eq.some(x => ['barra', 'mancuerna', 'kettlebell', 'polea', 'maquina', 'smith', 'lastre', 'balon'].includes(x))));
  await p.locator('.alt-filtro[data-f="con_peso"]').click(); await p.waitForTimeout(150);
  const cp = await p.evaluate(() => ({ on: [...document.querySelectorAll('.alt-filtro.on')].map(b => b.dataset.f), eq: [...document.querySelectorAll('#alt-lista .alt-item')].map(x => (_ent.ejercicios.find(e => e.id === x.dataset.alt) || {}).equipo || []) }));
  ok(`${tag} · «Con peso» reemplaza a «Sin peso» y todas llevan carga`, cp.on.join() === 'con_peso' && cp.eq.length > 0 && cp.eq.every(eq => eq.some(x => ['barra', 'mancuerna', 'kettlebell', 'polea', 'maquina', 'smith', 'lastre', 'balon'].includes(x))), JSON.stringify(cp.on));
  await p.locator('.alt-filtro[data-f="con_peso"]').click(); await p.waitForTimeout(150);
  // Sustituir: el primero de la lista.
  const antes = await p.evaluate((id) => ({ ...TABLAS_FALSAS.rutina_ejercicios.find(x => x.id === id) }), re.id);
  const nuevo = await p.locator('#alt-lista .alt-item').first().getAttribute('data-alt');
  await p.locator('#alt-lista .alt-item').first().locator('.alt-sust').click();
  await p.waitForTimeout(600);
  const despues = await p.evaluate((id) => ({ ...TABLAS_FALSAS.rutina_ejercicios.find(x => x.id === id) }), re.id);
  const igual = ['series', 'reps', 'peso_objetivo', 'descanso_seg', 'rir', 'tempo', 'notas', 'orden', 'bloque_id', 'rutina_id'].every(k => JSON.stringify(antes[k]) === JSON.stringify(despues[k]));
  ok(`${tag} · «Sustituir» cambia el ejercicio en su mismo renglón`, despues.ejercicio_id === nuevo && despues.id === antes.id, JSON.stringify({ antes: antes.ejercicio_id, despues: despues.ejercicio_id, nuevo }));
  ok(`${tag} · y conserva series, reps, peso, descanso, RIR, tempo, notas, orden y bloque`, igual, JSON.stringify({ antes, despues }).slice(0, 300));
  const pant = await p.evaluate((id) => ({ cerrado: document.getElementById('modal').classList.contains('hidden'), fila: document.querySelector(`#cons-rutina .ent-fila[data-re="${id}"]`)?.innerText || '', nombre: entNombres(_ent.rutina.ejercicios.find(x => x.id === id).ejercicios).grande, sigue: document.getElementById('cons-col-rutina')?.dataset.marca === 'sigo' }), re.id);
  ok(`${tag} · se cierra, la fila muestra el nuevo y no se recarga la página`, pant.cerrado && pant.fila.includes(pant.nombre) && pant.nombre !== re.nombre && pant.sigue, JSON.stringify(pant).slice(0, 200));
  ok(`${tag} · sin errores`, a.errores.length === 0, a.errores.join(' | '));
  await a.ctx.close();
}
await b.close(); servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
