// Inicio · «Encuesta de la app»: NPS, promedios (útil, fácil, agradable),
// cuántos pusieron cada nota, NPS por mes y la respuesta de cada cliente.
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

// ── Una semana de ejemplo, relativa a hoy ──
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const HOY = iso(new Date());
const mas = (f, n) => { const [y, m, d] = f.split('-').map(Number); const x = new Date(y, m - 1, d); x.setDate(x.getDate() + n); return iso(x); };
const offset = (f) => { const [y, m, d] = f.split('-').map(Number); return (new Date(y, m - 1, d).getDay() + 6) % 7; };
const LUNES = mas(HOY, -offset(HOY));
const L = (k) => mas(LUNES, k);            // esta semana: L(0)=lunes … L(6)=domingo
const P = (k) => mas(LUNES, k - 7);        // semana pasada

function tablas() {
  const cliente = { id: 'c0', user_id: 'coach-1', nombre: 'Ana Pérez', estado: 'activo', objetivo: 'Ganar músculo', monto: 280000, moneda: 'COP', dia_pago: 5, fecha_inicio: '2026-01-05', created_at: '2026-01-01T00:00:00Z' };
  const fase = { id: 'f1', user_id: 'coach-1', cliente_id: 'c0', nombre: 'Ciclo 19', semanas: 5, fecha_inicio: mas(LUNES, -14), dias_semana: ['L', 'X', 'V', 'S'], orden: 1, estado: 'activa', visible_cliente: true };
  const rut = (id, nombre, d, o) => ({ id, user_id: 'coach-1', cliente_id: 'c0', fase_id: 'f1', nombre, dia_orden: o, dias_semana: [d], archivada: false, tipo_sesion: 'fuerza' });
  const rutinas = [rut('r1', 'Push', 'L', 1), rut('r2', 'Lower', 'X', 2), rut('r3', 'Pull', 'V', 3), rut('r4', 'Legs', 'S', 4)];
  const ses = (id, fecha, rutina_id, extra = {}) => ({ id, cliente_id: 'c0', fase_id: 'f1', fecha, rutina_id, estado: 'completada', rpe: 7, rutinas: { nombre: rutinas.find(r => r.id === rutina_id).nombre }, ...extra });
  const sesiones = [
    // semana pasada: 3 de 4
    ses('p1', P(0), 'r1'), ses('p2', P(2), 'r2'), ses('p3', P(4), 'r3'),
    // esta semana: lunes y viernes (el miércoles no)
    ses('s1', L(0), 'r1', { rpe: 8, records: [{ nombre: 'Press banca', peso: 60, unidad: 'kg', reps: 8 }] }),
    ses('s2', L(4), 'r3', { rpe: 7 }),
  ].filter(s => s.fecha <= HOY);
  const ejercicios = [{ id: 'e1', nombre: 'Remo con barra', alias: 'Barbell Row' }, { id: 'e2', nombre: 'Press banca', alias: 'Bench Press' }];
  const serie = (id, sesion_id, ejercicio_id, peso) => ({ id, sesion_id, ejercicio_id, serie_num: 1, reps: 8, peso, unidad: 'kg', completada: true, ejercicios: { nombre: ejercicios.find(e => e.id === ejercicio_id).nombre, alias: ejercicios.find(e => e.id === ejercicio_id).alias } });
  const series_log = [serie('l1', 'p3', 'e1', 50), serie('l2', 's2', 'e1', 55), { ...serie('l5', 's2', 'e1', 55), serie_num: 2 }, serie('l3', 'p1', 'e2', 57.5), serie('l4', 's1', 'e2', 60)].filter(x => sesiones.some(s => s.id === x.sesion_id));
  const eventos = [
    { id: 'ev1', cliente_id: 'c0', fase_id: 'f1', tipo: 'actividad', titulo: 'Caminadora', dias_semana: ['M', 'J'], duracion_min: 25, visible_cliente: true, created_at: '2026-01-01' },
    { id: 'ev2', cliente_id: 'c0', fase_id: 'f1', tipo: 'peso', titulo: 'Peso', fecha: L(3), visible_cliente: true, created_at: '2026-01-01' },
  ];
  const evento_registros = [{ id: 'g1', cliente_id: 'c0', evento_id: 'ev1', fecha: L(1), estado: 'hecho' }].filter(r => r.fecha <= HOY);
  const actividades = [{ id: 'a1', cliente_id: 'c0', fecha: P(6), tipo: 'deporte', titulo: 'Fútbol', duracion_min: 60 }];
  const notas_entreno = [{ id: 'n1', user_id: 'coach-1', cliente_id: 'c0', fecha: L(0), rutina_id: 'r1', ejercicio_id: 'e2', texto: 'No tengo esta máquina en mi gym', leida_en: null, created_at: L(0) + 'T10:00:00Z', ejercicios: { nombre: 'Press banca', alias: 'Bench Press' } }];
  return {
    clientes: [cliente], seguimientos: [], pagos: [], pendientes: [], mediciones_corporales: [], fotos_progreso: [],
    settings: [{ user_id: 'coach-1', usd_cop_rate: 4000, nombre_coach: 'Mauro', mealtracker_app_url: 'https://mt.prueba', mealtracker_coach_password: 'x' }],
    metas_historial: [], nutricion_insights: [], ia_uso: [], push_pago_log: [],
    fases: [fase], rutinas, rutina_ejercicios: [], rutina_bloques: [], sesiones, series_log, ejercicios,
    eventos, evento_registros, actividades, notas_entreno,
    // Lo que se habló y se cambió esta semana
    comentarios_coach: [{ id: 'k1', user_id: 'coach-1', cliente_id: 'c0', ejercicio_id: 'e1', tipo: 'puntual', texto: 'Baja la barra más lento', creado_en: L(0) + 'T15:00:00Z', leido_en: null, quitado_en: null }],
    rutina_ejercicios: [{ id: 're1', rutina_id: 'r3', ejercicio_id: 'e1', reps: '6-8', orden: 1 }],
    videos_tecnica: [{ id: 'v1', cliente_id: 'c0', ejercicio_id: 'e2', ejercicio_nombre: 'Bench Press', estado: 'mejorar', pedido_en: P(0), revisado_en: L(0), nota: 'Baja la barra hasta tocar el pecho.', created_at: P(0) }],
    cambios_ejercicio: [{ id: 'x1', user_id: 'coach-1', cliente_id: 'c0', rutina_id: 'r1', rutina_nombre: 'Push', nombre_antes: 'Chest Press Machine', nombre_despues: 'Bench Press', origen: 'alternativas', creado_at: L(0) + 'T16:00:00Z' }],
    rutina_movimientos: [], rutina_extras: [], rutina_dias_quitados: [],
    comunidad_posts: [], comunidad_reacciones: [], comunidad_comentarios: [], comunidad_vistas: [],
  };
}
// La comida del Mealtracker: lunes a viernes de esta semana menos el miércoles,
// cerca de la meta en calorías y con la proteína corta.
function comida() {
  const rd = {};
  [0, 1, 3, 4].map(L).filter(f => f <= HOY).forEach(f => { rd[f] = { kcal: 2050, p: 100, goal_kcal: 2100, goal_p: 140 }; });
  [0, 1, 2, 3, 4, 5, 6].map(P).forEach(f => { rd[f] = { kcal: 2000, p: 120, goal_kcal: 2100, goal_p: 140 }; });
  return { clients: [{ name: 'Ana Pérez', last_active: HOY, recent_days: rd }] };
}

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let mal = 0;
const ok = (nombre, c, extra = '') => { if (!c) mal++; console.log(`  ${c ? 'ok ' : 'MAL'}  ${nombre}${c ? '' : '  ' + extra}`); };

async function abrir(ancho, alto, conComida = true) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 1 });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
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
    if (u.startsWith('https://mt.prueba/api/coach-auth')) return ruta.fulfill({ contentType: 'application/json', body: JSON.stringify({ token: 't', expiresAt: Date.now() + 3600e3 }) });
    if (u.startsWith('https://mt.prueba/api/coach-data')) return ruta.fulfill({ contentType: 'application/json', body: JSON.stringify(conComida ? comida() : { clients: [] }) });
    if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return ruta.continue().catch(() => ruta.abort());
    return ruta.fulfill({ status: 200, contentType: 'application/json', body: u.includes('/rest/v1/') ? '[]' : '{}' });
  });
  await p.goto(BASE + '/');
  await p.locator('#app-screen').waitFor({ state: 'visible', timeout: 20000 });
  await p.waitForTimeout(800);
  return { ctx, p, errores };
}

const OTROS = [
  { id: 'c1', user_id: 'coach-1', nombre: 'Bruno Díaz', estado: 'activo', fecha_inicio: '2026-06-01' },
  { id: 'c2', user_id: 'coach-1', nombre: 'Carla Ruiz', estado: 'activo', fecha_inicio: '2026-07-01' },
  { id: 'c3', user_id: 'coach-1', nombre: 'Diego Mora', estado: 'activo', fecha_inicio: '2026-08-01' },
  { id: 'c4', user_id: 'coach-1', nombre: 'Eva Gil', estado: 'activo', fecha_inicio: new Date().toISOString().slice(0, 10) },
];
const RESP = [
  { id: 'r1', user_id: 'coach-1', cliente_id: 'c0', encuesta: 'app-1', fecha: '2026-09-14', semana: 37, util: 5, facil: 4, agradable: 5, recomienda: 10 },
  { id: 'r2', user_id: 'coach-1', cliente_id: 'c1', encuesta: 'app-1', fecha: '2026-10-06', semana: 19, util: 4, facil: 3, agradable: 4, recomienda: 6, mejoraria: 'Que el chat de comida sea más rápido' },
  { id: 'r3', user_id: 'coach-1', cliente_id: 'c2', encuesta: 'app-1', fecha: '2026-10-13', semana: 15, util: 5, facil: 5, agradable: 4, recomienda: 9 },
];
for (const [tag, ancho] of [['ancho', 1440], ['telefono', 390]]) {
  console.log(`\n${tag}`);
  const { ctx, p, errores } = await abrir(ancho, 1000);
  await p.evaluate(({ otros, resp }) => { TABLAS_FALSAS.clientes.push(...otros); TABLAS_FALSAS.encuesta_app = resp; invalidarCache(); return navigate('dashboard'); }, { otros: OTROS, resp: RESP });
  await p.locator('#inicio-encuesta [data-enc-nps]').waitFor({ timeout: 15000 });
  const r = await p.evaluate(() => {
    const c = document.getElementById('inicio-encuesta');
    return { nps: c.querySelector('[data-enc-nps]').dataset.encNps, txt: c.innerText, hist: c.querySelectorAll('[data-enc-hist] .enc-hb').length, svg: !!c.querySelector('svg polyline, svg circle'), filas: c.querySelectorAll('[data-enc-fila]').length };
  });
  // 10 y 9 promotores, 6 detractor: (2 − 1) / 3 = +33
  ok(`${tag} · NPS +33 con 3 respuestas (2 promotores, 1 detractor)`, r.nps === '33' && /\+33/.test(r.txt) && /3 respuestas/.test(r.txt), r.txt.slice(0, 200));
  ok(`${tag} · promedios: útil 4,7 · fácil 4,0 · agradable 4,3`, /4,7[\s\S]*4,0[\s\S]*4,3/.test(r.txt), r.txt);
  ok(`${tag} · barras de cada nota del 0 al 10 y la gráfica por mes`, r.hist === 11 && r.svg);
  ok(`${tag} · la respuesta de cada cliente (3 filas)`, r.filas === 3 && /Bruno Díaz/.test(await p.locator('[data-enc-tabla]').innerHTML()));
  ok(`${tag} · cuántos faltan: Diego sí (ya pasó su 2ª semana), Eva no (es nueva)`, /Respondieron 3 de 4/.test(r.txt) && /Diego Mora/.test(r.txt) && !/Eva Gil/.test(r.txt), r.txt);
  if (tag === 'ancho') {
    await p.locator('[data-enc-tabla] summary').click();
    await p.locator('[data-inicio-encuesta]').screenshot({ path: path.join(CAPTURAS, 'inicio-encuesta.png') });
  }
  ok(`${tag} · «Qué mejorarían» muestra lo que escribió (con su nota)`, /Qué mejorarían/i.test(r.txt) && /Que el chat de comida sea más rápido/.test(r.txt), r.txt);
  ok(`${tag} · la página no se desborda a lo ancho`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  // Sin la tabla: pide correr el SQL.
  await p.evaluate(() => { delete TABLAS_FALSAS.encuesta_app; return navigate('dashboard'); });
  await p.waitForTimeout(1500);
  const sin = await p.locator('#inicio-encuesta').innerText();
  ok(`${tag} · sin la tabla pide correr migraciones/encuesta-app.sql (o la muestra vacía)`, /encuesta-app\.sql|nadie la ha respondido/.test(sin), sin);
  ok(`${tag} · sin errores de JavaScript`, errores.length === 0, errores.join(' | '));
  await ctx.close();
}
await b.close(); servidor.close();
console.log(mal ? `\n${mal} falla(s)` : '\ntodo bien');
process.exit(mal ? 1 : 0);
