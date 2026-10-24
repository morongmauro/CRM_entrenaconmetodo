// Seguimiento · «Lo que le sale en su app»: los recordatorios que su app
// reportó, si los tiene a la vista, si los toca o los ignora, y los que ya no le salen.
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

const dHace = (n) => new Date(Date.now() - n * 86400000).toISOString();
const ymdHoy = fmtYmd(new Date());
function fmtYmd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
const RESP = { ok: true, recordatorios: [
  { rec_id: `hoy-rutina@${ymdHoy}`, tipo: 'hoy', texto: 'Entrenar: Push', primera_vez: dHace(0), ultima_vez: dHace(0), ultimo_dia: ymdHoy, dias_lista: 1, dias_pantalla: 1, toques: 0, hecho_en: null },
  { rec_id: `hoy-comida@${ymdHoy}`, tipo: 'hoy', texto: 'Comida registrada · 1.850 kcal', primera_vez: dHace(0), ultima_vez: dHace(0), ultimo_dia: ymdHoy, dias_lista: 1, dias_pantalla: 1, toques: 0, hecho_en: dHace(0) },
  { rec_id: 'medida', tipo: 'app', texto: 'Registra tu peso y composición de este mes', primera_vez: dHace(6), ultima_vez: dHace(0), ultimo_dia: ymdHoy, dias_lista: 5, dias_pantalla: 4, toques: 0, hecho_en: null },
  { rec_id: 'c-1', tipo: 'coach', texto: 'Mándame el video de sentadilla', primera_vez: dHace(3), ultima_vez: dHace(0), ultimo_dia: ymdHoy, dias_lista: 3, dias_pantalla: 0, toques: 0, hecho_en: null },
  { rec_id: 'cap:12', tipo: 'app', texto: 'Lee una cápsula: «Proteína»', primera_vez: dHace(2), ultima_vez: dHace(0), ultimo_dia: ymdHoy, dias_lista: 2, dias_pantalla: 2, toques: 2, hecho_en: null },
  { rec_id: 'programa', tipo: 'app', texto: 'Lee «Sobre el programa»', primera_vez: dHace(10), ultima_vez: dHace(4), ultimo_dia: fmtYmd(new Date(Date.now() - 4 * 86400000)), dias_lista: 3, dias_pantalla: 3, toques: 1, hecho_en: null },
] };
for (const [tag, ancho] of [['ancho', 1440], ['telefono', 390]]) {
  console.log(`\n${tag}`);
  const { ctx, p, errores } = await abrir(ancho, 1000);
  await p.evaluate((resp) => {
    window.mtConfigured = () => true;
    window.resolverMealtrackerId = async () => '11111111-2222-3333-4444-555555555555';
    window.mtApiGet = async (path) => (path.includes('action=recordatorios') ? resp : null);
    segIr('c0');
  }, RESP);
  await p.locator('#seg-rec [data-rec]').first().waitFor({ timeout: 15000 });
  const r = await p.evaluate(() => {
    const c = document.getElementById('seg-rec');
    return {
      hoy: [...c.querySelectorAll('[data-rec-hoy]')].map(x => x.innerText),
      pend: [...c.querySelectorAll('[data-rec]')].map(x => ({ id: x.dataset.rec, t: x.innerText.replace(/\s+/g, ' ') })),
      ya: [...c.querySelectorAll('[data-rec-ya]')].map(x => x.innerText),
      txt: c.innerText,
    };
  });
  ok(`${tag} · lo de hoy: la rutina pendiente y la comida hecha`, r.hoy.length === 2 && r.hoy.some(t => /Hecho · Comida/.test(t)) && r.hoy.some(t => /^Entrenar: Push/.test(t)), JSON.stringify(r.hoy));
  const pend = Object.fromEntries(r.pend.map(x => [x.id, x.t]));
  ok(`${tag} · la medida del mes: a la vista 4 días y sin tocarla → «Lo está ignorando»`, /Lo está ignorando · 5 días/.test(pend.medida || '') && /a la vista 4 días/.test(pend.medida || ''), pend.medida);
  ok(`${tag} · el recordatorio tuyo escondido en «Ver todo» lo dice`, /Tuyo/.test(pend['c-1'] || '') && /Solo en «Ver todo»/.test(pend['c-1'] || ''), pend['c-1']);
  ok(`${tag} · la cápsula que abrió dice «Lo abrió · 2 veces»`, /Lo abrió · 2 veces/.test(pend['cap:12'] || ''), pend['cap:12']);
  ok(`${tag} · lo que ya no le sale va aparte`, r.ya.length === 1 && /Sobre el programa/.test(r.ya[0]) && /lo abrió/.test(r.ya[0]) && !pend.programa, JSON.stringify(r.ya));
  ok(`${tag} · dice cuándo abrió su inicio`, /Abrió su inicio por última vez/.test(r.txt));
  if (tag === 'ancho') await p.locator('[data-seg-recordatorios]').screenshot({ path: path.join(CAPTURAS, 'seguimiento-recordatorios.png') });
  // Sin la tabla, lo dice (sin romperse).
  await p.evaluate(() => { window.mtApiGet = async () => ({ ok: false, sinTabla: true, recordatorios: [] }); return esPintarRecordatorios(_es.cliente); });
  ok(`${tag} · sin la tabla pide correr el SQL`, /recordatorios-app\.sql/.test(await p.locator('#seg-rec').innerText()));
  ok(`${tag} · sin errores de JavaScript`, errores.length === 0, errores.join(' | '));
  await ctx.close();
}
await b.close(); servidor.close();
console.log(mal ? `\n${mal} falla(s)` : '\ntodo bien');
process.exit(mal ? 1 : 0);
