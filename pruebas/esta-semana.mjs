// Progreso de fuerza (progreso-fuerza.js): en Seguimiento y en la ficha del
// cliente, la gráfica por ejercicio (peso y reps de la mejor serie de cada
// sesión) y por patrón (Empuje, Tracción, Pierna: % de fuerza frente al
// inicio, semana a semana).
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
  const series_log = [serie('l1', 'p3', 'e1', 50), serie('l2', 's2', 'e1', 55), serie('l3', 'p1', 'e2', 57.5), serie('l4', 's1', 'e2', 60)].filter(x => sesiones.some(s => s.id === x.sesion_id));
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
    eventos, evento_registros, actividades, notas_entreno, comentarios_coach: [],
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

const { ctx, p, errores } = await abrir(1440, 1000);
await p.evaluate(() => verCliente('c0'));
await p.locator('#ficha-semana').waitFor({ timeout: 15000 });
// Siempre «Esta semana» para la prueba (el lunes abre en la pasada).
await p.locator(`[data-es-sem="${LUNES}"]`).click();
await p.locator('#ficha-semana [data-es-cumplimiento]').waitFor({ timeout: 15000 });
await p.waitForTimeout(300);
const hoyOff = offset(HOY);
const esperaF = { hechas: [0, 4].filter(k => k <= hoyOff).length, plan: 4 };
const r = await p.evaluate(() => {
  const s = document.getElementById('ficha-semana');
  return {
    primero: [...document.querySelector('[data-ficha]').children].find(el => el.dataset.fichaSec === 'resumen' && el.offsetParent !== null)?.id,
    fuerza: s.querySelector('[data-es-fuerza] .es-n').textContent,
    cardio: s.querySelector('[data-es-cardio] .es-n').textContent,
    comida: s.querySelector('[data-es-comida] .es-n').textContent,
    celdasF: [...s.querySelectorAll('.es-fila')].find(f => f.querySelector('.es-lab')?.textContent === 'Fuerza') ? [...[...s.querySelectorAll('.es-fila')].find(f => f.querySelector('.es-lab')?.textContent === 'Fuerza').querySelectorAll('.es-d')].map(i => i.className.replace(/es-d |es-d-hoy/g, '').trim()) : [],
    resumen: s.querySelector('[data-es-resumen]').innerText,
    msgs: [...s.querySelectorAll('[data-es-msg]')].map(m => ({ sit: m.dataset.esMsg, texto: m.querySelector('p').innerText })),
    notas: s.querySelector('[data-es-notas]')?.dataset.esNotas,
    datosEnResumen: [...document.querySelectorAll('[data-ficha] .sec-title')].some(t => t.textContent.trim() === 'Datos' && t.offsetParent !== null),
  };
});
ok('ficha: lo primero del Resumen es «Esta semana»', r.primero === 'ficha-semana', r.primero);
ok(`fuerza: ${esperaF.hechas}/4 (lo que entrenó de lo que le toca)`, r.fuerza === `${esperaF.hechas}/4`, r.fuerza);
ok('fuerza día por día: lunes hecho; miércoles falta (si ya pasó)', r.celdasF[0] === 'es-f-hecho' && r.celdasF[2] === (hoyOff > 2 ? 'es-f-falto' : hoyOff === 2 ? 'es-f-pendiente' : 'es-f-pendiente'), JSON.stringify(r.celdasF));
ok('cardio: lo que marcó de lo que le pusiste', r.cardio === `${hoyOff >= 1 ? 1 : 0}/2`, r.cardio);
ok('comida: días registrados de los que van', /^\d+\/\d+$/.test(r.comida), r.comida);
ok('en pocas palabras: con sus números y lo que le faltó', r.resumen.includes(`${esperaF.hechas} de 4 entrenos de fuerza`) && (hoyOff <= 2 || /miércoles \(Lower\)/.test(r.resumen)), r.resumen);
ok('en pocas palabras: la semana anterior para comparar', /La semana anterior: 3 de 4/.test(r.resumen), r.resumen);
ok('en pocas palabras: récord e intensidad (solo lo que hay en los datos)', /1 récord/.test(r.resumen) && /Press banca 60 kg × 8/.test(r.resumen) && /Intensidad promedio/.test(r.resumen), r.resumen);
ok('en pocas palabras: subió de peso respecto a la vez anterior', hoyOff < 4 || /Remo con barra \+5 kg/.test(r.resumen), r.resumen);
ok('en pocas palabras: la proteína con su promedio y su meta', /Proteína promedio \d+ g de 140 g/.test(r.resumen) || hoyOff < 3, r.resumen);
ok('la nota sin responder, con «Responder»', r.notas === '1' && /No tengo esta máquina/.test(r.resumen) && await p.locator('#ficha-semana .es-ojo-btn').count() === 1, r.resumen);
ok('mensajes: entre 2 y 3, el primero sobre su semana', r.msgs.length >= 2 && r.msgs.length <= 3 && r.msgs[0].sit === 'curso', JSON.stringify(r.msgs.map(m => m.sit)));
ok('mensajes: con su nombre y sus números, sin [huecos]', r.msgs.every(m => /Ana/.test(m.texto) && !/\[|undefined|null|NaN/.test(m.texto)), JSON.stringify(r.msgs));
ok('mensajes: felicita el récord o la subida (con su número)', r.msgs.some(m => m.sit === 'avance' && /(60|55)/.test(m.texto)), JSON.stringify(r.msgs.map(m => m.sit)));
ok('mensajes: el de la semana dice cuántos lleva', r.msgs[0].texto.includes(`${esperaF.hechas} de 4`), r.msgs[0].texto);
ok('Datos ya no está en el Resumen (está en Perfil)', !r.datosEnResumen);
await p.locator('#ficha-semana').screenshot({ path: path.join(CAPTURAS, 'esta-semana.png') });
await p.screenshot({ path: path.join(CAPTURAS, 'esta-semana-ficha.png') });

// Copiar
ok('historial: sin seguimientos aún, lo dice', /Aún no hay seguimientos guardados/.test(await p.locator('#ficha-semana [data-es-ultimo]').innerText()));
await p.locator('#ficha-semana [data-es-copiar="0"]').click();
await p.waitForTimeout(400);
const copiado = await p.evaluate(() => navigator.clipboard.readText());
ok('Copiar: deja el mensaje tal cual en el portapapeles', copiado === r.msgs[0].texto, copiado);
const reg = await p.evaluate(() => (TABLAS_FALSAS.seguimiento_mensajes || []).map(x => ({ c: x.cliente_id, o: x.origen, t: x.titulo, x: x.texto })));
ok('al copiar queda guardado solo: cliente, de dónde, título y el texto', reg.length === 1 && reg[0].c === 'c0' && reg[0].o === 'esta-semana' && reg[0].t === 'A mitad de semana' && reg[0].x === r.msgs[0].texto, JSON.stringify(reg));
const ult = await p.locator('#ficha-semana [data-es-ultimo]').innerText();
ok('la ficha dice «Último seguimiento: hoy» con el título', /Último seguimiento: hoy/.test(ult) && /A mitad de semana/.test(ult), ult);
await p.locator('#ficha-semana [data-es-copiar="0"]').click();
await p.waitForTimeout(400);
ok('copiar el mismo mensaje otra vez el mismo día no lo duplica', await p.evaluate(() => TABLAS_FALSAS.seguimiento_mensajes.length) === 1);
await p.locator('#ficha-semana [data-es-ult-ver]').click();
ok('«Lo que le dijiste» muestra el mensaje completo', (await p.locator('#ficha-semana [data-es-ult-lista]').innerText()).includes(r.msgs[0].texto.split('\n')[0]));
await p.locator('#ficha-semana').screenshot({ path: path.join(CAPTURAS, 'esta-semana-historial.png') });

// Semana pasada: se cierra (3 de 4) y cambia el mensaje
await p.locator(`[data-es-sem="${mas(LUNES, -7)}"]`).click();
await p.waitForFunction(() => document.querySelector('#ficha-semana [data-es-fuerza] .es-n')?.textContent === '3/4', null, { timeout: 10000 });
const r2 = await p.evaluate(() => ({ titulo: document.querySelector('[data-es-titulo]').textContent, msgs: [...document.querySelectorAll('#ficha-semana [data-es-msg]')].map(m => ({ sit: m.dataset.esMsg, texto: m.querySelector('p').innerText })), resumen: document.querySelector('#ficha-semana [data-es-resumen]').innerText }));
ok('semana pasada: título y 3 de 4', /La semana pasada/.test(r2.titulo) && /3 de 4/.test(r2.resumen), r2.titulo + ' | ' + r2.resumen);
ok('semana pasada: mensaje de semana a medias, que nombra lo que faltó', r2.msgs[0].sit === 'media' && /Legs/.test(r2.msgs[0].texto + r2.resumen), JSON.stringify(r2.msgs[0]));
await p.locator('#ficha-semana').screenshot({ path: path.join(CAPTURAS, 'esta-semana-pasada.png') });
ok('semana pasada: lo que hizo por su cuenta (fútbol)', /fútbol/.test(r2.resumen), r2.resumen);

// Las versiones rotan: la de esta semana no es la misma que la de la semana siguiente.
const rot = await p.evaluate(() => {
  const S = _es.semana, c = _es.cliente;
  const a = esMensajes(c, S)[0].texto;
  const b = esMensajes(c, { ...S, lunes: evtSumarDias(S.lunes, 7) })[0].texto;
  const cc = esMensajes(c, { ...S, lunes: evtSumarDias(S.lunes, 14) })[0].texto;
  return { distintas: a !== b && b !== cc };
});
ok('cada semana sale otra versión (nunca la misma que la anterior)', rot.distintas);

// Las tarjetas de abajo llevan a cada pestaña
await p.locator('.es-mas button', { hasText: 'Datos' }).click();
ok('«Datos» abre Perfil y ahí están los datos', await p.locator('[data-ficha-tab="perfil"].active').count() === 1 && await p.locator('[data-ficha] .sec-title', { hasText: /^Datos$/ }).isVisible());
await p.locator('[data-ficha-tab="resumen"]').click();
// Diálogos también queda guardado
await p.evaluate(() => abrirDialogos('c0'));
await p.locator('[data-dlg-copiar]').first().waitFor({ timeout: 10000 });
await p.locator('[data-dlg-copiar]').first().click();
await p.waitForTimeout(500);
const reg2 = await p.evaluate(() => TABLAS_FALSAS.seguimiento_mensajes.map(x => ({ o: x.origen, t: x.titulo })));
ok('Diálogos: copiar también queda en su historial (con el título del diálogo)', reg2.length === 2 && reg2[1].o === 'dialogos' && !!reg2[1].t, JSON.stringify(reg2));
await p.evaluate(() => closeModal());
// Inicio: a quién hace rato no le escribes
await p.evaluate(() => navigate('dashboard'));
await p.locator('#inicio-seg [data-seg-cliente="c0"]').waitFor({ timeout: 15000 });
const ini = await p.locator('#inicio-seg').innerText();
ok('Inicio: «Seguimientos» con Ana y hace cuánto', /Ana Pérez/.test(ini) && /hoy/.test(ini), ini);
await p.locator('[data-inicio-seg]').screenshot({ path: path.join(CAPTURAS, 'inicio-seguimientos.png') });
ok('sin errores', errores.length === 0, errores.join(' | '));
await ctx.close();

// El check: «le hice seguimiento hoy» sin copiar nada
const ck = await abrir(1440, 1000);
await ck.p.evaluate(() => verCliente('c0'));
await ck.p.locator('#ficha-semana [data-seg-check="marcar"]').waitFor({ timeout: 15000 });
await ck.p.locator('#ficha-semana [data-seg-check="marcar"]').click();
await ck.p.locator('#ficha-semana [data-seg-check="hecho"]').waitFor({ timeout: 5000 });
const m1 = await ck.p.evaluate(() => TABLAS_FALSAS.seguimiento_mensajes.map(x => ({ o: x.origen, c: x.cliente_id })));
ok('check en la ficha: marca el seguimiento de hoy (queda en el historial)', m1.length === 1 && m1[0].o === 'manual' && m1[0].c === 'c0', JSON.stringify(m1));
ok('check en la ficha: dice «Último seguimiento: hoy»', /Último seguimiento: hoy/.test(await ck.p.locator('#ficha-semana [data-es-ultimo]').innerText()));
await ck.p.locator('#ficha-semana').screenshot({ path: path.join(CAPTURAS, 'seguimiento-check.png'), clip: undefined });
await ck.p.locator('#ficha-semana [data-seg-check="hecho"]').click();
await ck.p.locator('#ficha-semana [data-seg-check="marcar"]').waitFor({ timeout: 5000 });
ok('check: tocarlo otra vez quita la marca de hoy', await ck.p.evaluate(() => TABLAS_FALSAS.seguimiento_mensajes.length) === 0);
await ck.p.evaluate(() => closeModal());
await ck.p.evaluate(() => navigate('dashboard'));
await ck.p.locator('#inicio-seg [data-seg-check-inicio="c0"]').waitFor({ timeout: 15000 });
await ck.p.locator('[data-inicio-seg]').screenshot({ path: path.join(CAPTURAS, 'inicio-seguimientos-check.png') });
await ck.p.locator('#inicio-seg [data-seg-check-inicio="c0"]').click();
await ck.p.waitForFunction(() => /Hoy/.test(document.querySelector('#inicio-seg [data-seg-cliente="c0"]')?.innerText || ''), null, { timeout: 5000 });
ok('check en Inicio: «Hecho» marca y la fila pasa a «Hoy»', await ck.p.evaluate(() => TABLAS_FALSAS.seguimiento_mensajes.filter(x => x.origen === 'manual').length) === 1);
ok('check: sin errores', ck.errores.length === 0, ck.errores.join(' | '));
await ck.ctx.close();

// Sin la tabla (SQL sin correr): se copia igual y avisa qué correr
const st = await abrir(1440, 1000);
await st.p.evaluate(() => {
  const orig = sb.from.bind(sb);
  sb.from = (n) => {
    if (n !== 'seguimiento_mensajes') return orig(n);
    const err = { data: null, error: { message: 'relation "seguimiento_mensajes" does not exist', code: '42P01' } };
    const q = new Proxy({}, { get: (t, k) => k === 'then' ? (ok) => Promise.resolve(err).then(ok) : () => q });
    return q;
  };
});
await st.p.evaluate(() => verCliente('c0'));
await st.p.locator('#ficha-semana [data-es-copiar="0"]').waitFor({ timeout: 15000 });
await st.p.waitForTimeout(300);
ok('sin la tabla: la ficha dice qué SQL correr', /seguimiento-mensajes\.sql/.test(await st.p.locator('#ficha-semana [data-es-ultimo]').innerText()));
await st.p.locator('#ficha-semana [data-es-copiar="0"]').click();
await st.p.waitForTimeout(300);
ok('sin la tabla: copiar funciona igual', (await st.p.evaluate(() => navigator.clipboard.readText())).length > 20);
ok('sin la tabla: sin errores', st.errores.length === 0, st.errores.join(' | '));
await st.ctx.close();

// Teléfono: una columna, sin desbordar
const t = await abrir(390, 844);
await t.p.evaluate(() => verCliente('c0'));
await t.p.locator('#ficha-semana [data-es-cumplimiento]').waitFor({ timeout: 15000 });
await t.p.waitForTimeout(300);
const desb = await t.p.evaluate(() => { const s = document.getElementById('ficha-semana'); return { ancho: s.scrollWidth, caja: s.clientWidth }; });
ok('teléfono: el bloque cabe sin desbordar', desb.ancho <= desb.caja + 1, JSON.stringify(desb));
await t.p.locator('#ficha-semana').screenshot({ path: path.join(CAPTURAS, 'esta-semana-telefono.png') });
ok('teléfono: sin errores', t.errores.length === 0, t.errores.join(' | '));
await t.ctx.close();

// Sin datos de comida: lo dice, no inventa
const s = await abrir(1440, 1000, false);
await s.p.evaluate(() => verCliente('c0'));
await s.p.locator('#ficha-semana [data-es-resumen]').waitFor({ timeout: 15000 });
const sr = await s.p.locator('#ficha-semana [data-es-resumen]').innerText();
ok('sin datos de comida: lo dice tal cual', /Comida: sin datos/.test(sr), sr);
await s.ctx.close();

await b.close(); servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
