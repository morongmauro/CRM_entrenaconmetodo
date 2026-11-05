// Seguimiento en 6 áreas (seguimiento-areas.js): la barra con semáforos, el
// orden de las áreas, «La vez pasada le dijiste» con si cumplió, su rutina sin
// video pedido, la comida con gráfica y recomendaciones, los estancados, la
// medición mensual, la meta desactualizada, la caja para escribirle y
// «Siguiente cliente».
//
//   TAILWIND_CSS=estilos-tailwind.css node pruebas/seguimiento-areas.mjs
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
// «Hoy» es siempre un sábado (el último que pasó): la semana de ejemplo
// tiene entrenos hasta el viernes, y un martes todavía no existen. La prueba
// fija el reloj del navegador en ese día (abrir).
const HOY = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 1) % 7)); return iso(d); })();
const mas = (f, n) => { const [y, m, d] = f.split('-').map(Number); const x = new Date(y, m - 1, d); x.setDate(x.getDate() + n); return iso(x); };
const offset = (f) => { const [y, m, d] = f.split('-').map(Number); return (new Date(y, m - 1, d).getDay() + 6) % 7; };
const LUNES = mas(HOY, -offset(HOY));
const L = (k) => mas(LUNES, k);            // esta semana: L(0)=lunes … L(6)=domingo
const P = (k) => mas(LUNES, k - 7);        // semana pasada


function tablas() {
  const cliente = { id: 'c0', user_id: 'coach-1', nombre: 'Ana Pérez', estado: 'activo', objetivo: 'Ganar músculo', telefono: '+57 300 111 2233', mealtracker_id: 'u-ana', sexo: 'F', fecha_nacimiento: '1994-01-01', estatura_cm: 165, monto: 280000, moneda: 'COP', dia_pago: 5, fecha_inicio: '2026-01-05', created_at: '2026-01-01T00:00:00Z' };
  const bruno = { id: 'c1', user_id: 'coach-1', nombre: 'Bruno Díaz', estado: 'activo', telefono: '+57 300 999 0000', fecha_inicio: '2026-03-01', created_at: '2026-01-01T00:00:00Z' };
  const fase = { id: 'f1', user_id: 'coach-1', cliente_id: 'c0', nombre: 'Ciclo 19', semanas: 8, fecha_inicio: mas(LUNES, -21), dias_semana: ['L', 'X', 'V', 'S'], orden: 1, estado: 'activa', visible_cliente: true };
  const rut = (id, nombre, d, o) => ({ id, user_id: 'coach-1', cliente_id: 'c0', fase_id: 'f1', nombre, dia_orden: o, dias_semana: [d], archivada: false, tipo_sesion: 'fuerza' });
  const rutinas = [rut('r1', 'Push', 'L', 1), rut('r2', 'Lower', 'X', 2), rut('r3', 'Pull', 'V', 3), rut('r4', 'Legs', 'S', 4)];
  const ses = (id, fecha, rutina_id) => ({ id, cliente_id: 'c0', fase_id: 'f1', fecha, rutina_id, estado: 'completada', rpe: 7, rutinas: { nombre: rutinas.find(r => r.id === rutina_id).nombre } });
  const sesiones = [ses('o1', mas(LUNES, -14), 'r1'), ses('p1', P(0), 'r1'), ses('p3', P(4), 'r3'), ses('s1', L(0), 'r1'), ses('s2', L(4), 'r3')].filter(s => s.fecha <= HOY);
  const ejercicios = [
    { id: 'e1', nombre: 'Remo con barra', alias: 'Barbell Row', tipo: 'fuerza' }, { id: 'e2', nombre: 'Press banca', alias: 'Bench Press', tipo: 'fuerza' },
    { id: 'e3', nombre: 'Elevación lateral', alias: 'Dumbbell Lateral Raise', tipo: 'fuerza' }, { id: 'e4', nombre: 'Sentadilla con barra', alias: 'Barbell Back Squat', tipo: 'fuerza' },
  ];
  const ej = (id) => { const e = ejercicios.find(x => x.id === id); return { nombre: e.nombre, alias: e.alias }; };
  let k = 0;
  const serie = (sesion_id, ejercicio_id, peso, reps = 8) => ({ id: `l${++k}`, sesion_id, ejercicio_id, serie_num: 1, reps, peso, unidad: 'kg', completada: true, ejercicios: ej(ejercicio_id) });
  const series_log = [
    serie('p3', 'e1', 50), serie('s2', 'e1', 55), serie('p1', 'e2', 57.5), serie('s1', 'e2', 60),
    // Elevación lateral: 12,5 × 10 en sus últimas 3 sesiones → estancado
    serie('o1', 'e3', 12.5, 10), serie('p1', 'e3', 12.5, 10), serie('s1', 'e3', 12.5, 10),
  ].filter(x => sesiones.some(s => s.id === x.sesion_id));
  return {
    clientes: [cliente, bruno], seguimientos: [], pagos: [], pendientes: [], fotos_progreso: [],
    // Última medición hace 40 días (toca la del mes) y la meta calculada con 88 kg (hoy pesa 84).
    mediciones_corporales: [
      { id: 'm1', cliente_id: 'c0', fecha: mas(HOY, -100), peso: 88, grasa_pct: 24 },
      { id: 'm2', cliente_id: 'c0', fecha: mas(HOY, -70), peso: 86, grasa_pct: 23 },
      { id: 'm3', cliente_id: 'c0', fecha: mas(HOY, -40), peso: 84, grasa_pct: 21.5 },
    ],
    metas_historial: [{ id: 'mh1', user_id: 'coach-1', cliente_id: 'c0', fecha: mas(HOY, -100), kcal: 2100, proteina_g: 140, carbos_g: 220, grasas_g: 65, peso_kg: 88, grasa_pct: 24, origen: 'calculo', created_at: mas(HOY, -100) + 'T10:00:00Z' }],
    settings: [{ user_id: 'coach-1', usd_cop_rate: 4000, nombre_coach: 'Mauro', mealtracker_app_url: 'https://mt.prueba', mealtracker_coach_password: 'x' }],
    nutricion_insights: [], ia_uso: [], push_pago_log: [],
    fases: [fase], rutinas, rutina_bloques: [], sesiones, series_log, ejercicios,
    eventos: [], evento_registros: [], actividades: [],
    notas_entreno: [{ id: 'n1', user_id: 'coach-1', cliente_id: 'c0', fecha: L(0), rutina_id: 'r1', ejercicio_id: 'e2', texto: 'No tengo esta máquina en mi gym', leida_en: null, created_at: L(0) + 'T10:00:00Z', ejercicios: { nombre: 'Press banca', alias: 'Bench Press' } }],
    comentarios_coach: [],
    rutina_ejercicios: [{ id: 're1', rutina_id: 'r3', ejercicio_id: 'e1', reps: '6-8', orden: 1 }, { id: 're2', rutina_id: 'r1', ejercicio_id: 'e3', reps: '10-12', orden: 2 }, { id: 're3', rutina_id: 'r2', ejercicio_id: 'e4', reps: '6-8', orden: 1 }],
    videos_tecnica: [{ id: 'v1', cliente_id: 'c0', ejercicio_id: 'e2', ejercicio_nombre: 'Bench Press', estado: 'bien', pedido_en: P(0), revisado_en: L(0), created_at: P(0) }, { id: 'v2', cliente_id: 'c0', ejercicio_id: 'e1', ejercicio_nombre: 'Barbell Row', estado: 'bien', pedido_en: P(0), revisado_en: L(0), created_at: P(0) }],
    cambios_ejercicio: [], rutina_movimientos: [], rutina_extras: [], rutina_dias_quitados: [],
    comunidad_posts: [], comunidad_reacciones: [], comunidad_comentarios: [], comunidad_vistas: [],
    // La vez pasada le pediste subir el remo a 55 kg (lo hizo) y su medición (no la ha hecho).
    seguimiento_mensajes: [{ id: 'sm1', user_id: 'coach-1', cliente_id: 'c0', fecha: P(1), origen: 'escrito', titulo: 'Mensaje por WhatsApp', texto: 'Ana, esta semana sube el remo a 55 kg y mándame tu medición del mes.', created_at: P(1) + 'T12:00:00Z' }],
    seguimiento_pedidos: [
      { id: 'sp1', user_id: 'coach-1', cliente_id: 'c0', fecha: P(1), tipo: 'entreno', texto: 'Subir el remo a 55 kg', objetivo: { ejercicio: 'Remo con barra', peso_kg: 55 }, estado: 'pendiente', created_at: P(1) + 'T12:00:00Z' },
      { id: 'sp2', user_id: 'coach-1', cliente_id: 'c0', fecha: P(1), tipo: 'medicion', texto: 'Mandar la medición del mes', objetivo: {}, estado: 'pendiente', created_at: P(1) + 'T12:00:00Z' },
    ],
  };
}
// La app: comida de esta semana (4 días, proteína corta) y una receta cocinada.
function app(accion) {
  const rd = {}, hist = {}, det = {};
  [0, 1, 3, 4].map(L).filter(f => f <= HOY).forEach(f => {
    rd[f] = { kcal: 2050, p: 100, goal_kcal: 2100, goal_p: 140 };
    hist[f] = { kcal: 2050, p: 100, c: 230, g: 70 };
    det[f] = [
      { id: f + 'a', meal: 'desayuno', time: '07:30', kcal: 450, p: 18, c: 50, g: 18, rawInput: 'arepa con huevo y café', items: [{ name: 'Arepa', kcal: 200, p: 4, c: 40, g: 3 }, { name: 'Huevo', kcal: 150, p: 12, c: 1, g: 10 }, { name: 'Café con leche', kcal: 100, p: 2, c: 9, g: 5 }] },
      { id: f + 'b', meal: 'almuerzo', time: '13:00', kcal: 900, p: 50, c: 100, g: 30, rawInput: f === L(0) ? 'receta: Bowl burrito de pollo' : 'pollo con arroz', items: [{ name: 'Pechuga de pollo', kcal: 300, p: 45, c: 0, g: 6 }, { name: 'Arroz blanco', kcal: 400, p: 5, c: 90, g: 1 }] },
      { id: f + 'c', meal: 'cena', time: '20:00', kcal: 700, p: 32, c: 80, g: 22, rawInput: 'pasta', items: [{ name: 'Pasta', kcal: 500, p: 15, c: 80, g: 5 }] },
    ];
  });
  if (accion === 'detail') return { client: { user_id: 'u-ana', name: 'Ana Pérez', data: { history: hist, historyDetail: det, goals: { kcal: 2100, p: 140, c: 220, g: 65 }, favorites: [] } } };
  return { clients: [{ user_id: 'u-ana', name: 'Ana Pérez', last_active: HOY, recent_days: rd }] };
}

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let mal = 0;
const ok = (nombre, c, extra = '') => { if (!c) mal++; console.log(`  ${c ? 'ok ' : 'MAL'}  ${nombre}${c ? '' : '  ' + extra}`); };

async function abrir(ancho, alto) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 1 });
  await ctx.clock.install({ time: new Date(`${HOY}T12:00:00`) }); await ctx.clock.resume();
  const p = await ctx.newPage();
  const errores = [];
  const abiertos = [];
  p.on('pageerror', e => errores.push(e.message));
  p.on('dialog', d => d.accept());
  await ctx.addInitScript((t) => { window.TABLAS_FALSAS = t; window.open = (u) => { (window.__abiertos ||= []).push(u); return null; }; }, tablas());
  await p.route('**/*', async (ruta) => {
    const u = ruta.request().url();
    if (u.startsWith(BASE + '/api/coach-insight')) return ruta.fulfill({ contentType: 'application/json', body: JSON.stringify({ pedidos: [
      { tipo: 'entreno', texto: 'Subir elevación lateral a 15 kg', ejercicio: 'Elevación lateral', peso_kg: 15, foco: null },
      { tipo: 'comida', texto: 'Sumar un huevo en el desayuno', ejercicio: null, peso_kg: null, foco: 'proteina' },
    ] }) });
    if (u.startsWith(BASE)) return ruta.continue();
    if (u.includes('cdn.tailwindcss.com')) return ruta.fulfill({ contentType: 'text/javascript', body: `(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(tailwind)};document.head.prepend(s);window.tailwind={config:{}};})();` });
    if (u.includes('supabase-js')) return ruta.fulfill({ contentType: 'text/javascript', body: falso });
    if (u.startsWith('https://mt.prueba/api/coach-auth')) return ruta.fulfill({ contentType: 'application/json', body: JSON.stringify({ token: 't', expiresAt: Date.now() + 3600e3 }) });
    if (u.startsWith('https://mt.prueba/api/coach-data')) {
      const a = new URL(u).searchParams.get('action');
      if (a === 'reminders') return ruta.fulfill({ contentType: 'application/json', body: JSON.stringify(ruta.request().method() === 'PATCH' ? { ok: true } : { reminders: [] }) });
      return ruta.fulfill({ contentType: 'application/json', body: JSON.stringify(app(a)) });
    }
    if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return ruta.continue().catch(() => ruta.abort());
    return ruta.fulfill({ status: 200, contentType: 'application/json', body: u.includes('/rest/v1/') ? '[]' : '{}' });
  });
  await p.goto(BASE + '/');
  await p.locator('#app-screen').waitFor({ state: 'visible', timeout: 20000 });
  await p.waitForTimeout(800);
  return { ctx, p, errores };
}

for (const [tag, ancho, alto] of [['ancho', 1440, 1000], ['telefono', 390, 844]]) {
  console.log(`\n${tag}`);
  const { ctx, p, errores } = await abrir(ancho, alto);
  await p.evaluate(() => segIr('c0'));
  await p.locator('[data-sa-barra]').waitFor({ timeout: 15000 });
  await p.locator(`[data-es-sem="${LUNES}"]`).click().catch(() => {});
  await p.locator('[data-sa-comp-card]').waitFor({ timeout: 15000 });
  await p.locator('[data-sa-comida-card]').waitFor({ timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(1200);
  const areas = await p.locator('[data-sa-area]').evaluateAll(els => els.map(e => e.dataset.saArea));
  ok(`${tag} · las 6 áreas en orden (${areas})`, JSON.stringify(areas) === '["hoy","pedi","comida","fuerza","composicion","meta"]');
  const est = await p.locator('[data-sa-chip]').evaluateAll(els => Object.fromEntries(els.map(e => [e.dataset.saChip, e.dataset.saEstado])));
  ok(`${tag} · semáforos: hoy amarillo (faltó el miércoles), composición rojo (40 días), meta amarillo (desactualizada), fuerza amarillo (1 estancado), comida amarillo`, est.hoy === 'amarillo' && est.composicion === 'rojo' && est.meta === 'amarillo' && est.fuerza === 'amarillo' && est.comida === 'amarillo', JSON.stringify(est));
  const vez = (await p.locator('[data-sa-vezpasada]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  ok(`${tag} · «La vez pasada le dijiste»: su mensaje, el remo cumplido y la medición sin dato`, /cumplió 1 de 2/i.test(vez) && /sube el remo a 55 kg/.test(vez) && /Subir el remo a 55 kg.*Cumplió/.test(vez) && /Mandar la medición del mes.*Sin dato aún/.test(vez), vez);
  const sin = (await p.locator('[data-sa-sinvideo-lista]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  ok(`${tag} · su rutina sin video pedido: sentadilla y elevación lateral (remo y banca ya tienen)`, /Barbell Back Squat/.test(sin) && /Dumbbell Lateral Raise/.test(sin) && !/Barbell Row/.test(sin), sin);
  const comida = (await p.locator('[data-sa-comida-card]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  ok(`${tag} · comida: días, proteína, receta cocinada, gráfica y qué recomendarle`, /días registrados/.test(comida) && /100 g/.test(comida) && /recetas que cocinó/.test(comida) && /Qué recomendarle/i.test(comida) && await p.locator('[data-sa-comida-card] svg rect').count() >= 7, comida.slice(0, 400));
  const fuerza = (await p.locator('[data-sa-fuerza]').innerText()).replace(/\s+/g, ' ');
  ok(`${tag} · fuerza: subieron, estancado (elevación lateral 12,5 × 10) y pesos y repeticiones dentro del área`, /estancados/.test(fuerza) && /Lateral Raise/.test(fuerza) && /12,5 kg × 10/.test(fuerza) && await p.locator('#sa-fuerza [data-es-sobrecarga]').count() === 1, fuerza);
  const comp = (await p.locator('[data-sa-comp-card]').innerText()).replace(/\s+/g, ' ');
  ok(`${tag} · composición: último peso hace 40 días, «Toca medición» y gráfica`, /84 kg/.test(comp) && /hace 40 días/.test(comp) && /Toca medición/.test(comp) && await p.locator('[data-sa-comp-card] polyline').count() === 2, comp);
  const meta = (await p.locator('[data-sa-meta-card]').innerText()).replace(/\s+/g, ' ');
  ok(`${tag} · meta: desactualizada (88 → 84 kg) con «Recalcular aquí»`, /Meta desactualizada/.test(meta) && /88/.test(meta) && await p.locator('[data-sa-recalcular]').count() === 1, meta);
  // Oportunidades de mejora: 4 categorías en orden y, dentro, Actuar primero.
  await p.locator('[data-op-item]').first().waitFor({ timeout: 10000 }).catch(() => {});
  const cats = await p.locator('[data-op-cat]').evaluateAll(els => els.map(e => e.dataset.opCat));
  ok(`${tag} · oportunidades: 4 categorías en orden (${cats})`, JSON.stringify(cats) === '["entreno","actividad","comida","cuerpo"]');
  const opE = (await p.locator('[data-op-cat="entreno"]').innerText()).replace(/\s+/g, ' ');
  ok(`${tag} · oportunidades · entreno: faltó al entreno y estancado en elevación lateral con el peso siguiente`, /Faltó a 1 entreno/.test(opE) && /Estancado en/.test(opE) && /13,5 kg/.test(opE), opE);
  const opC = (await p.locator('[data-op-cat="comida"]').innerText()).replace(/\s+/g, ' ');
  ok(`${tag} · oportunidades · comida: le faltan 40 g de proteína, con equivalencia en comida real`, /No llega a su meta/.test(opC) && /−40 g/.test(opC) && /pechuga de pollo/.test(opC), opC);
  const opP = (await p.locator('[data-op-cat="cuerpo"]').innerText()).replace(/\s+/g, ' ');
  ok(`${tag} · oportunidades · composición: falta pesarse (hace 40 días), en Actuar`, /Falta registrar el peso/.test(opP) && /hace 40 días/.test(opP) && await p.locator('[data-op-cat="cuerpo"] [data-op-nivel="actuar"]').count() >= 1, opP);
  const niveles = await p.locator('[data-op-cat="comida"] [data-op-nivel]').evaluateAll(els => els.map(e => e.dataset.opNivel));
  ok(`${tag} · oportunidades: dentro de cada categoría, Actuar antes que Revisar`, niveles.join() === niveles.slice().sort().join(), niveles.join());
  if (tag === 'ancho') await p.locator('[data-op-mejora]').screenshot({ path: path.join(CAPTURAS, 'oportunidades.png') }).catch(() => {});
  await p.locator('[data-op-cat="comida"] [data-op-usar]').first().click(); await p.waitForTimeout(400);
  ok(`${tag} · «Usar en mi mensaje» pasa la recomendación a la caja`, /te faltan 40 g de proteína/.test(await p.locator('#sa-texto').inputValue()), await p.locator('#sa-texto').inputValue());
  await p.evaluate(() => { const t = document.getElementById('sa-texto'); t.value = ''; _sa.detectado = []; _sa.textoDetectado = ''; saPintarPedidos(); });
  // Pedir 1 video de lo que no tiene: queda pedido y el mensaje va a la caja.
  await p.locator('.sa-vid').first().check();
  await p.locator('[data-sa-pedir-videos]').click();
  await p.waitForTimeout(600);
  const caja = await p.locator('#sa-texto').inputValue();
  const vids = await p.evaluate(async () => (await sb.from('videos_tecnica').select('*').eq('cliente_id', 'c0')).data.length);
  ok(`${tag} · pedir video: se guarda como pedido y el mensaje queda en la caja`, vids === 3 && /Mándame un video de/.test(caja), `${vids} · ${caja}`);
  // Escribirle: detecta lo que le pides y guarda mensaje + pedidos.
  await p.locator('#sa-texto').fill('Ana, vas muy bien con el remo. Sube la elevación lateral a 15 kg y en el desayuno súmale un huevo más.');
  await p.waitForFunction(() => [...document.querySelectorAll('[data-sa-ped] input')].some(i => i.value === 'Subir elevación lateral a 15 kg'), null, { timeout: 8000 }).catch(() => {});
  const peds = await p.locator('[data-sa-ped] input').evaluateAll(els => els.map(e => e.value));
  ok(`${tag} · detecta lo que le pides para confirmar (y conserva el video que pediste con el botón)`, peds.includes('Subir elevación lateral a 15 kg') && peds.includes('Sumar un huevo en el desayuno') && peds.some(x => /^Video de/.test(x)), JSON.stringify(peds));
  await p.locator('[data-sa-enviar]').click();
  await p.waitForTimeout(800);
  const g = await p.evaluate(async () => ({
    msj: (await sb.from('seguimiento_mensajes').select('*').eq('cliente_id', 'c0')).data.filter(m => m.origen === 'escrito').length,
    peds: (await sb.from('seguimiento_pedidos').select('*').eq('cliente_id', 'c0')).data.length,
    wa: (window.__abiertos || []).join(' '),
  }));
  ok(`${tag} · «Enviar por WhatsApp y guardar»: abre WhatsApp con su número y guarda mensaje y pedidos`, g.msj === 2 && g.peds === 5 && /wa\.me\/573001112233\?text=Ana/.test(g.wa), JSON.stringify(g));
  await p.locator('[data-sa-chip="meta"]').click();
  await p.waitForTimeout(1600);
  const rev = await p.locator('[data-sa-revisado]').innerText();
  ok(`${tag} · «Revisado x de 6» cuenta lo que ya miraste (${rev})`, /Revisado [1-6] de 6/.test(rev) && /[1-6]/.test(rev) && await p.locator('[data-sa-chip="meta"].visto').count() === 1, rev);
  if (tag === 'telefono') ok(`${tag} · sin scroll de lado`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), await p.evaluate(() => document.documentElement.scrollWidth + ' ' + [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right >= document.documentElement.scrollWidth - 2).slice(0, 8).map(e => `${e.tagName}.${e.className}`.slice(0, 60) + ' ' + Math.round(e.getBoundingClientRect().right)).join(' | ')));
  await p.screenshot({ path: path.join(CAPTURAS, `seguimiento-areas-${tag}.png`), fullPage: true });
  await p.locator('[data-sa-hecho]').click();
  await p.waitForTimeout(1500);
  ok(`${tag} · «Marcar hecho y pasar al siguiente» abre a Bruno`, await p.evaluate(() => _selectedClienteId) === 'c1');
  ok(`${tag} · sin errores`, errores.length === 0, errores.join(' | '));
  await ctx.close();
}
await b.close(); servidor.close();
console.log(mal ? `\n${mal} falla(s)` : '\ntodo bien');
process.exit(mal ? 1 : 0);
