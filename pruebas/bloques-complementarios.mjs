// Bloques complementarios (un recovery) el mismo día que la fuerza, en el
// calendario del CRM: debajo de la fuerza, sin quitarle el día, con su panel
// y su marca en «Datos de la rutina». Y que el CRM y la app digan lo mismo.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/bloques-complementarios.mjs
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
// La marca en todas (la columna existe) y un bloque diario.
fixture.rutinas.forEach(r => { r.complementaria = false; });
fixture.rutinas.push({ ...fixture.rutinas.find(r => r.fase_id === c18.id), id: 'bq-elbow', nombre: 'Elbow Recovery', dia_orden: 9,
  dias_semana: ['L', 'M', 'X', 'J', 'V', 'S', 'D'], dia_semana: null, complementaria: true });
fixture.sesiones.push({ id: 'ses-bq', cliente_id: 'c0', rutina_id: 'bq-elbow', fase_id: c18.id, fecha: '2026-09-08', estado: 'completada' });

const dias = (p, id) => p.evaluate((id) => JSON.stringify(TABLAS_FALSAS.rutinas.find(x => x.id === id).dias_semana), id);
const idDe = (n) => fixture.rutinas.find(r => r.nombre === n && r.fase_id === c18.id).id;
const fuerza = (p, f) => p.locator(`.ent-celda[data-fecha="${f}"] .ent-chip-rutina .ent-chip-txt`).allInnerTexts();
const bloques = (p, f) => p.locator(`.ent-celda[data-fecha="${f}"] .ent-chip-bloque .ent-chip-txt`).allInnerTexts();

for (const [tag, ancho, alto] of [['ancho', 1440, 900], ['telefono', 390, 844]]) {
  console.log(`\n${tag} (${ancho}px)`);
  const { p, ctx, errores } = await abrir(ancho, alto);
  await p.evaluate(() => { fmt.hoy = () => '2026-09-10'; return verEntrenamientoCliente('c0'); });
  await p.waitForSelector('[data-cal-lote]', { timeout: 15000 });
  await p.evaluate((id) => entVerFase(id), c18.id);
  await p.waitForTimeout(800);

  ok(`${tag} · lunes 14: Upper de fuerza y debajo el bloque «Elbow Recovery»`, (await fuerza(p, '2026-09-14')).some(t => /Upper/.test(t)) && (await bloques(p, '2026-09-14')).join() === 'Elbow Recovery');
  ok(`${tag} · domingo 13: sin fuerza, solo el bloque (no ocupa el día de la fuerza)`, (await fuerza(p, '2026-09-13')).length === 0 && (await bloques(p, '2026-09-13')).length === 1);
  ok(`${tag} · el bloque hecho el martes 8 sale con ✓ y no como «sesión suelta»`, /✓/.test(await p.locator('.ent-celda[data-fecha="2026-09-08"] .ent-chip-bloque').innerText())
    && await p.locator('.ent-celda[data-fecha="2026-09-08"] .ent-chip-suelta').count() === 0);
  ok(`${tag} · no sale el aviso de «rutinas sin día» y sí la tarjeta de bloques`, await p.locator('text=sin día en la semana').count() === 0 && await p.locator('[data-cal-bloques]').count() === 1);
  if (tag === 'ancho') await p.locator('.ent-mes').screenshot({ path: path.join(CAPTURAS, 'bloques-calendario.png') }).catch(() => {});

  // El panel del día: la fuerza no ofrece el bloque; los bloques van aparte.
  await p.locator('.ent-celda[data-fecha="2026-09-09"] .ent-celda-num').click();
  await p.waitForSelector('[data-dia-bloques]', { timeout: 5000 });
  const opts = await p.locator('#dia-rutina option').allInnerTexts();
  ok(`${tag} · panel del miércoles: la fuerza no ofrece el bloque y el bloque sale en su sección`, !opts.some(t => /Elbow/.test(t)) && /Elbow Recovery/.test(await p.locator('[data-dia-bloques]').innerText()), opts.join(' | '));
  if (tag === 'ancho') await p.locator('#modal-content').screenshot({ path: path.join(CAPTURAS, 'bloques-panel.png') }).catch(() => {});
  // Poner Lower los miércoles: el bloque NO pierde el miércoles.
  await p.selectOption('#dia-rutina', { label: await p.locator('#dia-rutina option', { hasText: 'Lower' }).innerText() });
  const poner = p.locator('[data-dia-poner-rutina], [data-fz-todos-poner], [data-fz-poner-todos]').first();
  if (await poner.count()) { await poner.click(); await p.waitForTimeout(400); if (await p.locator('[data-fz-todos]').count()) await p.locator('[data-fz-todos]').click(); }
  else await p.evaluate((id) => entPonerRutinaDia(id, 'X'), idDe('Lower Body + Core Training'));
  await p.waitForTimeout(900);
  ok(`${tag} · poner Lower los miércoles deja el bloque con sus 7 días`, JSON.parse(await dias(p, idDe('Lower Body + Core Training'))).includes('X') && (await dias(p, 'bq-elbow')) === '["L","M","X","J","V","S","D"]', `${await dias(p, idDe('Lower Body + Core Training'))} ${await dias(p, 'bq-elbow')}`);
  await p.evaluate(() => { try { closeModal(); } catch (e) {} });

  // Quitar el bloque de los domingos desde el panel.
  await p.locator('.ent-celda[data-fecha="2026-09-20"] .ent-celda-num').click();
  await p.waitForSelector('[data-bq-quitar]', { timeout: 5000 });
  await p.locator('[data-bq-quitar]').click();
  await p.waitForTimeout(900);
  ok(`${tag} · «Quitar» el bloque del domingo: deja los domingos y nada más`, (await dias(p, 'bq-elbow')) === '["L","M","X","J","V","S"]' && (await bloques(p, '2026-09-27')).length === 0 && (await bloques(p, '2026-09-26')).length === 1, await dias(p, 'bq-elbow'));
  // Y volver a ponerlo: «+ Añadir otro bloque a este día» → «Todos los domingos».
  await p.locator('.ent-celda[data-fecha="2026-09-20"] .ent-celda-num').click();
  await p.waitForSelector('[data-bq-abrir]', { timeout: 5000 });
  await p.locator('[data-bq-abrir]').click();
  if (tag === 'ancho') await p.locator('#modal-content').screenshot({ path: path.join(CAPTURAS, 'bloques-anadir.png') }).catch(() => {});
  await p.selectOption('#dia-bloque', { label: await p.locator('#dia-bloque option', { hasText: 'Elbow' }).innerText() });
  await p.locator('[data-bq-poner]').click();
  await p.waitForTimeout(900);
  ok(`${tag} · «+ Añadir otro bloque a este día» lo vuelve a poner los domingos`, (await dias(p, 'bq-elbow')) === '["L","M","X","J","V","S","D"]');
  // Una rutina NUEVA sin día (otro recovery) como bloque de todos los días, desde el aviso de «sin día».
  await p.evaluate(() => { const r = { ...TABLAS_FALSAS.rutinas.find(x => x.id === 'bq-elbow'), id: 'bq-hombro', nombre: 'Shoulder Prehab', dias_semana: [], complementaria: false, dia_orden: 10 };
    TABLAS_FALSAS.rutinas.push(r); _ent.rutinasCache = null; return entVistaClientes(); });
  await p.waitForTimeout(1200);
  await p.waitForSelector('[data-sindia-bloque="bq-hombro"]', { timeout: 5000 });
  await p.locator('[data-sindia-bloque="bq-hombro"]').click();
  await p.waitForTimeout(1200);
  const hombro = await p.evaluate(() => TABLAS_FALSAS.rutinas.find(x => x.id === 'bq-hombro'));
  ok(`${tag} · una rutina sin día → «Ponerla como bloque diario»: bloque los 7 días, y sale debajo de la fuerza`, hombro.complementaria === true && hombro.dias_semana.length === 7
    && (await bloques(p, '2026-09-14')).includes('Shoulder Prehab') && (await fuerza(p, '2026-09-14')).some(t => /Upper/.test(t)), JSON.stringify(hombro));

  // La marca en «Datos de la rutina».
  if (tag === 'ancho') {
    const pull = idDe('Pull Training');
    await p.evaluate((id) => entAbrirConstructor(id), pull);
    await p.waitForTimeout(1200);
    await p.evaluate(() => entEditarDatosRutina());
    await p.waitForSelector('[data-bq-editor]', { timeout: 5000 });
    ok(`${tag} · «Datos de la rutina» trae la casilla «Bloque complementario» (apagada en una de fuerza)`, !(await p.locator('#rt2-bloque').isChecked()));
    await p.locator('#rt2-bloque').check();
    for (const d of ['L', 'X']) await p.locator(`.rt2-bloque-dia[value="${d}"]`).check();
    await p.locator('#modal-content').screenshot({ path: path.join(CAPTURAS, 'bloques-editor.png') }).catch(() => {});
    await p.evaluate(() => entGuardarDatosRutina());
    await p.waitForTimeout(900);
    const r = await p.evaluate((id) => TABLAS_FALSAS.rutinas.find(x => x.id === id), pull);
    ok(`${tag} · al guardarla como bloque queda marcada y con sus días (L, X)`, r.complementaria === true && JSON.stringify(r.dias_semana) === '["L","X"]', JSON.stringify(r));
  }
  ok(`${tag} · sin errores en la página`, errores.length === 0, errores.join(' | '));
  await ctx.close();
}

// ── El CRM y la app dicen lo mismo: fuerza y bloques de cada fecha ──────
{
  const vm = await import('vm');
  const src = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
  const trozo = (s, a, z) => { const i = s.indexOf(a), j = s.indexOf(z, i); if (i < 0 || j < 0) throw new Error('trozo ' + a); return s.slice(i, j); };
  const ctxVm = vm.createContext({ console });
  const ent = src('entrenamiento.js');
  vm.runInContext(`const ENT_DIAS = [['L','Lunes'],['M','Martes'],['X','Miércoles'],['J','Jueves'],['V','Viernes'],['S','Sábado'],['D','Domingo']];\n`
    + trozo(ent, 'function entRepartirRutinas(', '// ---------- Fechas, en local ----------')
    + trozo(ent, '// ---------- Fechas, en local ----------', '// En qué semana de la fase estamos hoy')
    + `const entFechaFin = (f) => { const t = new Date(Date.parse(f.fecha_inicio + 'T00:00:00Z')); t.setUTCDate(t.getUTCDate() + f.semanas * 7 - 1); return t.toISOString().slice(0, 10); };\n`
    + trozo(src('entreno-bloques.js'), 'function entEsBloque(', '// Las píldoras de una casilla')
    + '\nglobalThis.crm = { entRepartirRutinas, bqDelDia };', ctxVm);
  const app = await import(path.join(RAIZ, '..', 'mealtracker', 'api', '_entreno.js'));
  const fase = { fecha_inicio: '2026-09-07', semanas: 3, dias_semana: ['L', 'X', 'V'] };
  const R = [
    { id: 'a', nombre: 'Push', dia_orden: 1, dias_semana: ['L'] },
    { id: 'b', nombre: 'Pull', dia_orden: 2, dias_semana: [] },
    { id: 'c', nombre: 'Elbow', dia_orden: 3, dias_semana: ['L', 'M', 'X', 'J', 'V', 'S', 'D'], complementaria: true },
    { id: 'd', nombre: 'Movilidad', dia_orden: 4, dias_semana: ['L', 'S'], complementaria: true },
    { id: 'e', nombre: 'Lower', dia_orden: 5, dias_semana: [] },
  ];
  const { porDia } = ctxVm.crm.entRepartirRutinas(fase, R);
  const pdApp = app.repartirPorDia(fase, R);
  const igualReparto = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].every(d => (porDia[d]?.r?.id || null) === (pdApp[d]?.id || null));
  ok('reparto: CRM y app igual, y los bloques no ocupan días de fuerza (Push L, Pull X, Lower V)', igualReparto && pdApp.L.id === 'a' && pdApp.X.id === 'b' && pdApp.V.id === 'e' && !pdApp.M && !pdApp.D,
    JSON.stringify(Object.fromEntries(Object.entries(pdApp).map(([d, r]) => [d, r?.nombre || null]))));
  let iguales = true, det = '';
  for (let i = -3; i < 26; i++) {
    const f = app.sumarDiasISO('2026-09-07', i);
    const x = app.complementariasDe(fase, R, f).map(r => r.id).join(), y = ctxVm.crm.bqDelDia(fase, R, f).map(r => r.id).join();
    if (x !== y) { iguales = false; det = `${f}: app ${x} · crm ${y}`; break; }
  }
  ok('bloques de cada fecha: CRM y app igual (fuera del ciclo, ninguno; el lunes, los dos en su orden)', iguales
    && app.complementariasDe(fase, R, '2026-09-07').map(r => r.nombre).join() === 'Elbow,Movilidad' && !app.complementariasDe(fase, R, '2026-09-06').length && !app.complementariasDe(fase, R, '2026-09-28').length, det);
}

await b.close(); servidor.close();
console.log(mal ? `\n${mal} fallo(s)` : '\ntodo bien');
process.exit(mal ? 1 : 0);
