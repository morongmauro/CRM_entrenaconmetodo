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
  await ctx.clock.install({ time: new Date(`${HOY}T12:00:00`) }); await ctx.clock.resume();
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
await p.evaluate(() => segIr('c0'));
await p.locator('#seg-semana').waitFor({ timeout: 15000 });
// Siempre «Esta semana» para la prueba (el lunes abre en la pasada).
await p.locator(`[data-es-sem="${LUNES}"]`).click();
await p.locator('#seg-semana [data-es-cumplimiento]').waitFor({ timeout: 15000 });
await p.waitForTimeout(300);
const hoyOff = offset(HOY);
const esperaF = { hechas: [0, 4].filter(k => k <= hoyOff).length, plan: 4 };
const r = await p.evaluate(() => {
  const s = document.getElementById('seg-semana');
  return {
    enSeguimiento: !!document.querySelector('#seg-content #seg-semana') && _currentView === 'seguimiento',
    cabecera: document.querySelector('[data-seg-cabecera]')?.innerText || '',
    fuerza: s.querySelector('[data-es-fuerza] .es-n').textContent,
    cardio: s.querySelector('[data-es-cardio] .es-n').textContent,
    comida: s.querySelector('[data-es-comida] .es-n').textContent,
    celdasF: [...s.querySelectorAll('.es-fila')].find(f => f.querySelector('.es-lab')?.textContent === 'Fuerza') ? [...[...s.querySelectorAll('.es-fila')].find(f => f.querySelector('.es-lab')?.textContent === 'Fuerza').querySelectorAll('.es-d')].map(i => i.className.replace(/es-d |es-d-hoy/g, '').trim()) : [],
    resumen: s.querySelector('[data-es-resumen]').innerText,
    msgs: [...s.querySelectorAll('[data-es-msg]')].map(m => ({ sit: m.dataset.esMsg, texto: m.querySelector('p').innerText })),
    notas: s.querySelector('[data-es-notas]')?.dataset.esNotas,
    sobre: [...s.querySelectorAll('[data-es-sobre]')].map(f => ({ t: f.dataset.esSobre, x: f.innerText.replace(/\s+/g, ' ') })),
    coment: s.querySelector('[data-es-comentarios]').innerText,
    videos: !!s.querySelector('[data-seg-videos] #seg-vt'),
    ordenMsjDespuesVideos: !!s.querySelector('[data-seg-videos] ~ [data-es-mensajes]'),
  };
});
ok('la semana completa está en Seguimiento, con el cliente elegido', r.enSeguimiento);
ok('cabecera: atajos para ajustar entreno y alimentación, ficha y Diálogos', /Ajustar entreno/.test(r.cabecera) && /Ajustar alimentación/.test(r.cabecera) && /Ficha/.test(r.cabecera) && /Diálogos/.test(r.cabecera), r.cabecera);
ok('cabecera: su ciclo y en qué semana va', /Ciclo 19 · semana 3 de 5/.test(r.cabecera), r.cabecera);
ok(`fuerza: ${esperaF.hechas}/4 (lo que entrenó de lo que le toca)`, r.fuerza === `${esperaF.hechas}/4`, r.fuerza);
ok('fuerza día por día: lunes hecho; miércoles falta (si ya pasó)', r.celdasF[0] === 'es-f-hecho' && r.celdasF[2] === (hoyOff > 2 ? 'es-f-falto' : hoyOff === 2 ? 'es-f-pendiente' : 'es-f-pendiente'), JSON.stringify(r.celdasF));
ok('cardio: lo que marcó de lo que le pusiste', r.cardio === `${hoyOff >= 1 ? 1 : 0}/2`, r.cardio);
ok('comida: días registrados de los que van', /^\d+\/\d+$/.test(r.comida), r.comida);
ok('en pocas palabras: con sus números y lo que le faltó', r.resumen.includes(`${esperaF.hechas} de 4 entrenos de fuerza`) && (hoyOff <= 2 || /miércoles \(Lower\)/.test(r.resumen)), r.resumen);
ok('en pocas palabras: la semana anterior para comparar', /La semana anterior: 3 de 4/.test(r.resumen), r.resumen);
ok('en pocas palabras: récord e intensidad (solo lo que hay en los datos)', /1 récord/.test(r.resumen) && /Press banca 60 kg × 8/.test(r.resumen) && /Intensidad promedio/.test(r.resumen), r.resumen);
ok('en pocas palabras: subió de peso respecto a la vez anterior', hoyOff < 4 || /Remo con barra \+5 kg/.test(r.resumen), r.resumen);
ok('en pocas palabras: la proteína con su promedio y su meta', /Proteína promedio \d+ g de 140 g/.test(r.resumen) || hoyOff < 3, r.resumen);
ok('la nota sin responder, con «Responder»', r.notas === '1' && /No tengo esta máquina/.test(r.resumen) && await p.locator('#seg-semana [data-es-resumen] .es-ojo-btn').count() === 1, r.resumen);
ok('mensajes: primero el saludo del check-in, tal cual', r.msgs[0].sit === 'inicio' && r.msgs[0].texto === 'Hola Ana, ¿cómo vas? Espero que todo vaya bien, paso por acá al check-in periódico.', r.msgs[0].texto);
const sits = r.msgs.map(m => m.sit), iCurso = sits.indexOf('curso');
ok('mensajes: después del saludo, lo que tienes que avisarle (cambio, subir carga, pedir video, video revisado)', JSON.stringify(sits.slice(1, 5)) === JSON.stringify(['cambio', 'subir', 'pedirVideo', 'videoRevisado']), JSON.stringify(sits));
ok('mensajes: luego el de su semana y hasta 2 más; al final la pregunta', iCurso === 5 && sits.length - iCurso - 2 <= 2 && sits[sits.length - 1] === 'pregunta', JSON.stringify(sits));
const txt = (sit) => (r.msgs.find(m => m.sit === sit) || {}).texto || '';
ok('avisar: «Te cambié el ejercicio» con los dos nombres y la rutina', /Chest Press Machine/.test(txt('cambio')) && /Bench Press/.test(txt('cambio')) && /Push/.test(txt('cambio')), txt('cambio'));
ok('avisar: subir carga en el remo (todas las series al tope del rango, mismo peso)', hoyOff < 4 || (/Barbell Row/.test(txt('subir')) && /55 kg/.test(txt('subir')) && /(8 repeticiones|series de 8)/.test(txt('subir'))), txt('subir'));
ok('avisar: pedir video del que más subió, por WhatsApp', hoyOff < 4 || (/Barbell Row/.test(txt('pedirVideo')) && /WhatsApp/.test(txt('pedirVideo'))), txt('pedirVideo'));
ok('avisar: revisé tu video, con tu nota de qué corregir', /Bench Press/.test(txt('videoRevisado')) && /Baja la barra hasta tocar el pecho/.test(txt('videoRevisado')), txt('videoRevisado'));
ok('avisar: marcados «Avísale»', await p.locator('#seg-semana [data-es-avisale]').count() === 4);
ok('mensajes: los de después no repiten el saludo', r.msgs.slice(1).every(m => !/^(Hola|Qué tal|Ana,)/.test(m.texto) && /^[¡¿]?[A-ZÁÉÍÓÚÑ]/.test(m.texto)), JSON.stringify(r.msgs.map(m => m.texto.slice(0, 30))));
ok('mensajes: con sus números, sin [huecos]', r.msgs.every(m => !/\[|undefined|null|NaN/.test(m.texto)), JSON.stringify(r.msgs));
ok('mensajes: felicita el récord o la subida (con su número)', r.msgs.some(m => m.sit === 'avance' && /(60|55)/.test(m.texto)), JSON.stringify(r.msgs.map(m => m.sit)));
ok('mensajes: el de la semana dice cuántos lleva', r.msgs[iCurso].texto.includes(`${esperaF.hechas} de 4`), r.msgs[iCurso].texto);
const remo = r.sobre.find(x => /Barbell Row/.test(x.x)), banca = r.sobre.find(x => /Bench Press/.test(x.x));
ok('pesos y reps: el remo subió de 50 a 55 kg (vez anterior y esta semana)', hoyOff < 4 || (remo && remo.t === 'peso' && /50 kg × 8/.test(remo.x) && /55 kg × 8/.test(remo.x) && /\+5 kg/.test(remo.x)), JSON.stringify(r.sobre));
ok('pesos y reps: la banca subió de 57,5 a 60 kg', banca && banca.t === 'peso' && /57,5 kg × 8/.test(banca.x) && /60 kg × 8/.test(banca.x), JSON.stringify(r.sobre));
ok('comentarios: su nota (sin responder) y el tuyo, con el ejercicio', /No tengo esta máquina/.test(r.coment) && /Sin responder/.test(r.coment) && /Baja la barra más lento/.test(r.coment) && /Barbell Row/.test(r.coment), r.coment);
ok('ejercicios cambiados: antes → después, en qué rutina y cómo', /Chest Press Machine/.test(r.coment) && /Bench Press/.test(r.coment) && /Push/.test(r.coment) && /Alternativas/.test(r.coment), r.coment);
ok('videos de técnica en la semana, antes de los mensajes', r.videos && r.ordenMsjDespuesVideos);
await p.locator('#seg-semana').screenshot({ path: path.join(CAPTURAS, 'esta-semana.png') });
await p.screenshot({ path: path.join(CAPTURAS, 'seguimiento.png'), fullPage: true });
const lista = await p.locator('#seg-list').innerText();
ok('lista: por días sin seguimiento, Ana en «Te toca» con su nota sin responder', /Te toca/i.test(lista) && /Ana Pérez/.test(lista) && /Sin seguimiento · 1 nota sin responder/.test(lista), lista);

// Copiar
ok('historial: sin seguimientos aún, lo dice', /Aún no hay seguimientos guardados/.test(await p.locator('#seg-semana [data-es-ultimo]').innerText()));
await p.locator('#seg-semana [data-es-copiar="0"]').click();
await p.waitForTimeout(300);
ok('Copiar el saludo: queda en el portapapeles', await p.evaluate(() => navigator.clipboard.readText()) === r.msgs[0].texto);
await p.locator(`#seg-semana [data-es-copiar="${iCurso}"]`).click();
await p.waitForTimeout(400);
const copiado = await p.evaluate(() => navigator.clipboard.readText());
ok('Copiar: deja el mensaje tal cual en el portapapeles', copiado === r.msgs[iCurso].texto, copiado);
const reg = await p.evaluate(() => (TABLAS_FALSAS.seguimiento_mensajes || []).map(x => ({ c: x.cliente_id, o: x.origen, t: x.titulo, x: x.texto })));
ok('al copiar queda guardado solo: cliente, de dónde, título y el texto', reg.length === 2 && reg[1].c === 'c0' && reg[1].o === 'esta-semana' && reg[1].t === 'A mitad de semana' && reg[1].x === r.msgs[iCurso].texto, JSON.stringify(reg));
await p.waitForFunction(() => /Hoy/.test(document.querySelector('#seg-list [data-seg-li="c0"]')?.innerText || ''), null, { timeout: 5000 });
ok('lista: Ana pasa a «Al día» con «Hoy»', /Al día/i.test(await p.locator('#seg-list').innerText()));
const ult = await p.locator('#seg-semana [data-es-ultimo]').innerText();
ok('la ficha dice «Último seguimiento: hoy» con el título', /Último seguimiento: hoy/.test(ult) && /A mitad de semana/.test(ult), ult);
await p.locator(`#seg-semana [data-es-copiar="${iCurso}"]`).click();
await p.waitForTimeout(400);
ok('copiar el mismo mensaje otra vez el mismo día no lo duplica', await p.evaluate(() => TABLAS_FALSAS.seguimiento_mensajes.length) === 2);
// Copiar un aviso = ya se lo dijiste: pasa a «Ya se lo dijiste» y, al volver, va al final
await p.locator('#seg-semana [data-es-msg="cambio"] .es-cp').click();
await p.waitForTimeout(500);
ok('aviso copiado: dice «Ya se lo dijiste · hoy»', /Ya se lo dijiste · hoy/.test(await p.locator('#seg-semana [data-es-msg="cambio"]').innerText()));
await p.evaluate(() => { _es.lunesDe = null; Object.keys(_esCache).forEach(k => delete _esCache[k]); esPintar(_es.cliente); });
await p.waitForFunction(() => document.querySelector('#seg-semana [data-es-msg="cambio"] [data-es-ya]'), null, { timeout: 10000 });
const sits2 = await p.evaluate(() => [...document.querySelectorAll('#seg-semana [data-es-msg]')].map(m => m.dataset.esMsg));
ok('al volver: el aviso ya dicho no se sugiere de nuevo, queda al final como hecho', sits2[sits2.length - 1] === 'cambio' && sits2[1] !== 'cambio', JSON.stringify(sits2));
await p.locator(`[data-es-sem="${LUNES}"]`).click();
await p.waitForTimeout(600);
await p.locator('#seg-semana [data-es-ult-ver]').click();
ok('«Lo que le dijiste» muestra el mensaje completo', (await p.locator('#seg-semana [data-es-ult-lista]').innerText()).includes(r.msgs[iCurso].texto.split('\n')[0]));
await p.locator('#seg-semana').screenshot({ path: path.join(CAPTURAS, 'esta-semana-historial.png') });

// Semana pasada: se cierra (3 de 4) y cambia el mensaje
await p.locator(`[data-es-sem="${mas(LUNES, -7)}"]`).click();
await p.waitForFunction(() => document.querySelector('#seg-semana [data-es-fuerza] .es-n')?.textContent === '3/4', null, { timeout: 10000 });
const r2 = await p.evaluate(() => ({ titulo: document.querySelector('[data-es-titulo]').textContent, msgs: [...document.querySelectorAll('#seg-semana [data-es-msg]')].map(m => ({ sit: m.dataset.esMsg, texto: m.querySelector('p').innerText })), resumen: document.querySelector('#seg-semana [data-es-resumen]').innerText }));
ok('semana pasada: título y 3 de 4', /La semana pasada/.test(r2.titulo) && /3 de 4/.test(r2.resumen), r2.titulo + ' | ' + r2.resumen);
ok('semana pasada: mensaje de semana a medias, que nombra lo que faltó', (r2.msgs.find(m => m.sit === 'media') || {}).sit === 'media' && /Legs/.test(r2.msgs.find(m => m.sit === 'media').texto + r2.resumen), JSON.stringify(r2.msgs.map(m => m.sit)));
await p.locator('#seg-semana').screenshot({ path: path.join(CAPTURAS, 'esta-semana-pasada.png') });
ok('semana pasada: lo que hizo por su cuenta (fútbol)', /fútbol/.test(r2.resumen), r2.resumen);

// Las versiones rotan: la de esta semana no es la misma que la de la semana siguiente.
const rot = await p.evaluate(() => {
  const S = _es.semana, c = _es.cliente;
  const sem = (ms) => ms.find(m => m.sit !== 'inicio' && !m.informar).texto;
  const a = sem(esMensajes(c, S));
  const b = sem(esMensajes(c, { ...S, lunes: evtSumarDias(S.lunes, 7) }));
  const cc = sem(esMensajes(c, { ...S, lunes: evtSumarDias(S.lunes, 14) }));
  return { distintas: a !== b && b !== cc };
});
ok('cada semana sale otra versión (nunca la misma que la anterior)', rot.distintas);
// Los demás avisos y mensajes, con la semana ajustada a mano
const otros = await p.evaluate(() => {
  const c = _es.cliente, S = { ..._es.semana, cierre: false, subir: [], pedir: null, revisados: [], cambios: [], sobre: [], prog: [], rec: [], K: null, C: { ..._es.semana.C, faltaron: [] }, M: [] };
  const sit = (ms) => ms.map(m => m.sit);
  const fin = esMensajes(c, { ...S, semCiclo: Number(S.fase.semanas) });
  const nuevo = esMensajes(c, { ...S, semCiclo: 1 });
  const extra = esMensajes(c, { ...S, racha: 4, peso: { ahora: { fecha: S.fechas[2], peso: 82.4 }, antes: { fecha: '2026-09-28', peso: 83.6 } }, sobre: [{ nombre: 'Leg Press', tipo: 'baja', antes: { peso: 100, reps: 10, unidad: 'kg', f: '2026-10-01' }, ahora: { peso: 90, reps: 10, unidad: 'kg' } }] });
  return { fin: fin.find(m => m.sit === 'cicloFin'), nuevo: nuevo.find(m => m.sit === 'cicloNuevo'), extra: extra.map(m => ({ s: m.sit, t: m.texto })) };
});
ok('avisar: última semana del ciclo', otros.fin && /(última semana de tu ciclo|Cerramos ciclo)/.test(otros.fin.texto), JSON.stringify(otros.fin));
ok('avisar: ciclo nuevo', otros.nuevo && /ciclo nuevo/i.test(otros.nuevo.texto), JSON.stringify(otros.nuevo));
ok('racha de 4 semanas y bajó en Leg Press (hasta 2 extra)', otros.extra.some(m => m.s === 'racha' && /4 semanas/.test(m.t)) && otros.extra.some(m => m.s === 'bajo' && /Leg Press/.test(m.t)), JSON.stringify(otros.extra));
ok('al final siempre una pregunta', otros.extra[otros.extra.length - 1].s === 'pregunta' && /\?$/.test(otros.extra[otros.extra.length - 1].t), JSON.stringify(otros.extra));
const soloPeso = await p.evaluate(() => { const S = { ..._es.semana, subir: [], pedir: null, revisados: [], cambios: [], sobre: [], prog: [], rec: [], K: null, racha: 0, C: { ..._es.semana.C, faltaron: [] }, M: [], peso: { ahora: { fecha: _es.semana.fechas[2], peso: 82.4 }, antes: { fecha: '2026-09-28', peso: 83.6 } } }; return (esMensajes(_es.cliente, S).find(m => m.sit === 'peso') || {}).texto || ''; });
ok('registró su peso: con cuánto cambió desde el anterior', /82,4 kg/.test(soloPeso) && /(1,2 kg menos|Quedó tu peso registrado)/.test(soloPeso), soloPeso);

// La ficha: resumen y edición. De la semana, solo la franja corta.
await p.evaluate(() => verCliente('c0'));
await p.locator('[data-es-franja="ficha"] .es-franja-btn').waitFor({ timeout: 15000 });
const fr = await p.locator('[data-es-franja="ficha"]').innerText();
ok('ficha: la franja con fuerza, cardio, comida y el último seguimiento', new RegExp(`${esperaF.hechas}/4`).test(fr) && /fuerza/.test(fr) && /comida/.test(fr) && /Último seguimiento: hoy/.test(fr) && /Hacer seguimiento/.test(fr), fr);
ok('ficha: ya no trae la semana completa', await p.locator('[data-ficha] #seg-semana').count() === 0);
await p.locator('[data-ficha]').screenshot({ path: path.join(CAPTURAS, 'ficha-franja.png') });
await p.locator('.es-mas button', { hasText: 'Datos' }).click();
ok('«Datos» abre Perfil y ahí están los datos', await p.locator('[data-ficha-tab="perfil"].active').count() === 1 && await p.locator('[data-ficha] .sec-title', { hasText: /^Datos$/ }).isVisible());
await p.locator('[data-ficha-tab="resumen"]').click();
await p.locator('[data-es-franja="ficha"] .es-franja-btn').click();
await p.locator('#seg-content #seg-semana').waitFor({ timeout: 15000 });
ok('«Hacer seguimiento» lleva a Seguimiento con ese cliente', await p.evaluate(() => _currentView === 'seguimiento' && _selectedClienteId === 'c0' && !document.querySelector('[data-ficha]')));
// Entrenamiento: para crear y ajustar; arriba solo la franja
await p.locator('[data-seg-ir="entreno"]').click();
await p.locator('[data-es-franja="entreno"] .es-franja-btn').waitFor({ timeout: 15000 });
const fe = await p.locator('[data-es-franja="entreno"]').innerText();
ok('Entrenamiento: «Ajustar entreno» abre su calendario con la franja de su semana', /fuerza/.test(fe) && /Ir a Seguimiento/.test(fe) && await p.evaluate(() => _ent.clienteId === 'c0'), fe);
await p.screenshot({ path: path.join(CAPTURAS, 'entrenamiento-franja.png'), clip: { x: 0, y: 0, width: 1440, height: 760 } });
await p.locator('[data-es-franja="entreno"] .es-franja-btn').click();
await p.locator('#seg-content #seg-semana').waitFor({ timeout: 15000 });
ok('«Ir a Seguimiento» vuelve con el mismo cliente', await p.evaluate(() => _currentView === 'seguimiento' && _selectedClienteId === 'c0'));
// Diálogos también queda guardado
await p.evaluate(() => abrirDialogos('c0'));
await p.locator('[data-dlg-copiar]').first().waitFor({ timeout: 10000 });
await p.locator('[data-dlg-copiar]').first().click();
await p.waitForTimeout(500);
const reg2 = await p.evaluate(() => TABLAS_FALSAS.seguimiento_mensajes.map(x => ({ o: x.origen, t: x.titulo })));
ok('Diálogos: copiar también queda en su historial (con el título del diálogo)', reg2[reg2.length - 1].o === 'dialogos' && !!reg2[reg2.length - 1].t, JSON.stringify(reg2));
await p.evaluate(() => closeModal());
// Inicio: a quién hace rato no le escribes
await p.evaluate(() => navigate('dashboard'));
await p.locator('#inicio-seg [data-seg-cliente="c0"]').waitFor({ timeout: 15000 });
const ini = await p.locator('#inicio-seg').innerText();
ok('Inicio: «Seguimientos» con Ana y hace cuánto', /Ana Pérez/.test(ini) && /hoy/.test(ini), ini);
await p.locator('[data-inicio-seg]').screenshot({ path: path.join(CAPTURAS, 'inicio-seguimientos.png') });
await p.locator('#inicio-seg [data-seg-cliente="c0"] button', { hasText: 'Abrir' }).click();
await p.locator('#seg-content #seg-semana').waitFor({ timeout: 15000 });
ok('Inicio: «Abrir» lleva a su seguimiento', await p.evaluate(() => _currentView === 'seguimiento' && _selectedClienteId === 'c0'));
ok('sin errores', errores.length === 0, errores.join(' | '));
await ctx.close();

// El check: «le hice seguimiento hoy» sin copiar nada
const ck = await abrir(1440, 1000);
await ck.p.evaluate(() => segIr('c0'));
await ck.p.locator('#seg-semana [data-seg-check="marcar"]').waitFor({ timeout: 15000 });
await ck.p.locator('#seg-semana [data-seg-check="marcar"]').click();
await ck.p.locator('#seg-semana [data-seg-check="hecho"]').waitFor({ timeout: 5000 });
const m1 = await ck.p.evaluate(() => TABLAS_FALSAS.seguimiento_mensajes.map(x => ({ o: x.origen, c: x.cliente_id })));
ok('check en Seguimiento: marca el seguimiento de hoy (queda en el historial)', m1.length === 1 && m1[0].o === 'manual' && m1[0].c === 'c0', JSON.stringify(m1));
ok('check en Seguimiento: dice «Último seguimiento: hoy»', /Último seguimiento: hoy/.test(await ck.p.locator('#seg-semana [data-es-ultimo]').innerText()));
await ck.p.locator('#seg-semana').screenshot({ path: path.join(CAPTURAS, 'seguimiento-check.png'), clip: undefined });
await ck.p.locator('#seg-semana [data-seg-check="hecho"]').click();
await ck.p.locator('#seg-semana [data-seg-check="marcar"]').waitFor({ timeout: 5000 });
ok('check: tocarlo otra vez quita la marca de hoy', await ck.p.evaluate(() => TABLAS_FALSAS.seguimiento_mensajes.length) === 0);
await ck.p.locator('#seg-list [data-seg-li-marcar="c0"]').click();
await ck.p.waitForFunction(() => /Hoy/.test(document.querySelector('#seg-list [data-seg-li="c0"]')?.innerText || ''), null, { timeout: 5000 });
ok('check en la lista: «Marcar» deja a Ana en «Hoy» sin salir de donde estás', await ck.p.evaluate(() => TABLAS_FALSAS.seguimiento_mensajes.filter(x => x.origen === 'manual').length) === 1);
await ck.p.evaluate(() => segMarcar('c0', false));
await ck.p.waitForTimeout(300);
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
await st.p.evaluate(() => segIr('c0'));
await st.p.locator('#seg-semana [data-es-copiar="0"]').waitFor({ timeout: 15000 });
await st.p.waitForTimeout(300);
ok('sin la tabla: Seguimiento dice qué SQL correr', /seguimiento-mensajes\.sql/.test(await st.p.locator('#seg-semana [data-es-ultimo]').innerText()));
await st.p.locator('#seg-semana [data-es-copiar="0"]').click();
await st.p.waitForTimeout(300);
ok('sin la tabla: copiar funciona igual', (await st.p.evaluate(() => navigator.clipboard.readText())).length > 20);
ok('sin la tabla: sin errores', st.errores.length === 0, st.errores.join(' | '));
await st.ctx.close();

// Teléfono: una columna, sin desbordar
const t = await abrir(390, 844);
await t.p.evaluate(() => segIr('c0'));
await t.p.locator('#seg-semana [data-es-cumplimiento]').waitFor({ timeout: 15000 });
await t.p.waitForTimeout(300);
const desb = await t.p.evaluate(() => { const s = document.getElementById('seg-semana'); return { ancho: s.scrollWidth, caja: s.clientWidth }; });
ok('teléfono: el bloque cabe sin desbordar', desb.ancho <= desb.caja + 1, JSON.stringify(desb));
await t.p.locator('#seg-semana').screenshot({ path: path.join(CAPTURAS, 'esta-semana-telefono.png') });
ok('teléfono: sin errores', t.errores.length === 0, t.errores.join(' | '));
await t.ctx.close();

// Sin datos de comida: lo dice, no inventa
const s = await abrir(1440, 1000, false);
await s.p.evaluate(() => segIr('c0'));
await s.p.locator('#seg-semana [data-es-resumen]').waitFor({ timeout: 15000 });
const sr = await s.p.locator('#seg-semana [data-es-resumen]').innerText();
ok('sin datos de comida: lo dice tal cual', /Comida: sin datos/.test(sr), sr);
await s.ctx.close();

await b.close(); servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
