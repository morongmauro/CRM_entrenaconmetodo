// El calendario del cliente en el CRM, como lo ve él: su corte de pago, el
// cardio que registró por su cuenta, el peso que puso al marcar, el inicio
// del ciclo y lo que pone el sistema al cierre (composición y fotos).
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/calendario-como-cliente.mjs
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
    eventos: [], evento_registros: [], rutina_movimientos: [], rutina_extras: [], rutina_dias_quitados: [],
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

const c18 = fixture.fases.find(f => f.nombre === 'Ciclo 18');   // 7 sep, 5 semanas

const { p, ctx, errores } = await abrir(1440, 900);
await p.evaluate((fid) => {
  TABLAS_FALSAS.eventos = [
    { id: 'ev-peso', cliente_id: 'c0', fase_id: fid, tipo: 'peso', titulo: 'Pesarse en ayunas', fecha: '2026-09-10', dias_semana: [], semanas: null, visible_cliente: true },
    { id: 'ev-fotos', cliente_id: 'c0', fase_id: fid, tipo: 'fotos', titulo: 'Registro fotográfico', fecha: '2026-09-28', dias_semana: [], semanas: null, visible_cliente: null, auto: 'cierre_fotos' },
  ];
  TABLAS_FALSAS.evento_registros = [{ id: 'r1', evento_id: 'ev-peso', cliente_id: 'c0', fecha: '2026-09-10', estado: 'hecho', valor: 82.4 }];
  TABLAS_FALSAS.actividades = [{ id: 'a1', cliente_id: 'c0', fecha: '2026-09-09', tipo: 'caminata', titulo: null, duracion_min: 30, evento_id: null }];
}, c18.id);
await p.evaluate(() => { fmt.hoy = () => '2026-09-10'; return verEntrenamientoCliente('c0'); });
await p.waitForSelector('[data-cal-lote]', { timeout: 15000 });
await p.evaluate((id) => entVerFase(id), c18.id);
await p.waitForSelector('.ent-celda[data-fecha="2026-09-09"] [data-actividad-suya]', { timeout: 8000 }).catch(() => {});
const txt = (f) => p.locator(`.ent-celda[data-fecha="${f}"]`).innerText();
ok('su fecha de corte (día 5) sale como en su app', await p.locator('.ent-celda[data-fecha="2026-09-05"] [data-cal-corte]').count() === 1);
ok('el cardio que registró por su cuenta sale con «+»', /\+ Caminata · 30 min/.test(await txt('2026-09-09')), await txt('2026-09-09'));
ok('el peso que puso al marcar sale en el evento', /✓[\s\S]*Pesarse en ayunas · 82,4 kg/.test(await txt('2026-09-10')), await txt('2026-09-10'));
ok('el inicio del ciclo se ve', /Empieza Ciclo 18/.test(await txt('2026-09-07')));
ok('lo del cierre de ciclo dice que lo puso el sistema', /Registro fotográfico ·auto/.test(await txt('2026-09-28')), await txt('2026-09-28'));
ok('la leyenda explica lo nuevo', /por su cuenta/.test(await p.locator('.ent-leyenda').innerText()) && /fecha de corte/.test(await p.locator('.ent-leyenda').innerText()));
await p.locator('.ent-mes').screenshot({ path: path.join(CAPTURAS, 'calendario-como-cliente.png') }).catch(() => {});
// En tiempo real: un cardio nuevo aparece solo, sin recargar.
await p.evaluate(() => { TABLAS_FALSAS.actividades.push({ id: 'a2', cliente_id: 'c0', fecha: '2026-09-11', tipo: 'running', titulo: 'Running en calle', duracion_min: 25, evento_id: null }); _ent.calTick(); });
await p.waitForTimeout(1200);
ok('en tiempo real: lo que registra ahora aparece solo (sin recargar)', /Running en calle · 25 min/.test(await txt('2026-09-11')), await txt('2026-09-11'));
ok('sin errores en la página', errores.length === 0, errores.join(' | '));
await ctx.close();

// Copiar el ciclo no duplica lo que pone el sistema.
{
  const vm = await import('vm');
  const src = fs.readFileSync(path.join(RAIZ, 'entreno-ciclos.js'), 'utf8');
  const i = src.indexOf('function cicloFilasEventos('), j = src.indexOf('\n}\n', i) + 3;
  const c = vm.createContext({ evtSumarDias: (f, d) => { const t = new Date(Date.parse(f + 'T00:00:00Z')); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); } });
  vm.runInContext(src.slice(i, j) + '\nglobalThis.f = cicloFilasEventos;', c);
  const filas = c.f([{ id: 'x', tipo: 'actividad', titulo: 'Caminata', dias_semana: ['L'] }, { id: 'y', tipo: 'fotos', titulo: 'Registro fotográfico', fecha: '2026-09-28', auto: 'cierre_fotos' }],
    { clienteId: 'c0', faseNueva: 'f2', corrimiento: 35, semanas: 5 });
  ok('copiar el ciclo no copia lo del cierre (el nuevo ciclo trae los suyos)', filas.length === 1 && filas[0].titulo === 'Caminata', JSON.stringify(filas));
}

await b.close(); servidor.close();
console.log(mal ? `\n${mal} fallo(s)` : '\ntodo bien');
process.exit(mal ? 1 : 0);
