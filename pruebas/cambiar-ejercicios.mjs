// «Cambiar solo los ejercicios» desde el agente de rutinas (sin IA): la
// rutina a la izquierda y 3 parecidos al lado de cada ejercicio; se elige
// renglón por renglón, «Proponer uno para cada uno» llena todo sin repetir, y
// al aplicar solo cambia el ejercicio (series, reps, descanso, RIR, orden y
// bloque quedan) o se guarda como rutina nueva sin tocar la original.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/cambiar-ejercicios.mjs
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
const CAMPOS = ['series', 'reps', 'peso_objetivo', 'descanso_seg', 'rir', 'tempo', 'notas', 'orden', 'bloque_id', 'rutina_id'];
for (const [tag, ancho, alto] of [['ancho', 1600, 900], ['telefono', 390, 844]]) {
  console.log(`\n${tag} (${ancho}px)`);
  const { ctx, p, errores } = await abrir(ancho, alto);
  await p.evaluate((id) => entAbrirConstructor(id), push.id);
  await p.waitForSelector('#cons-rutina .ent-fila', { timeout: 15000 });
  await p.evaluate(() => { document.getElementById('cons-col-rutina').dataset.marca = 'sigo'; });
  await p.locator('[data-rut-abrir]').click();
  await p.locator('[data-cambiar-solo-ejercicios]').click();
  await p.locator('[data-cambiar-ejercicios] .cx-fila').first().waitFor({ timeout: 5000 });
  const v = await p.evaluate(() => {
    const filas = [...document.querySelectorAll('[data-cambiar-ejercicios] .cx-fila')];
    const modal = document.querySelector('.cx-modal');
    return {
      filas: filas.length, enRutina: _ent.rutina.ejercicios.length,
      conOpciones: filas.filter(f => f.querySelectorAll('[data-cx-op]').length).length,
      maxOpciones: Math.max(...filas.map(f => f.querySelectorAll('[data-cx-op]').length)),
      igualOn: filas.every(f => f.querySelector('[data-cx-igual]').classList.contains('on')),
      nombres: filas.every((f, i) => f.querySelector('.cx-nombre').textContent === entNombres(_ent.rutina.ejercicios[i].ejercicios).grande),
      ninguna: filas.every((f, i) => ![...f.querySelectorAll('[data-cx-op]')].some(b => _ent.rutina.ejercicios.some(x => x.ejercicio_id === b.dataset.cxOp))),
      ancho: modal.scrollWidth <= modal.clientWidth + 1,
      lado: (() => { const f = filas.find(x => x.querySelector('[data-cx-op]')); const a = f.querySelector('.cx-ahora').getBoundingClientRect(), b = f.querySelector('[data-cx-op]').getBoundingClientRect(); return b.left > a.right - 1 ? 'al lado' : b.top >= a.bottom - 1 ? 'debajo' : 'raro'; })(),
    };
  });
  ok(`${tag} · un renglón por ejercicio, con su nombre, en el mismo orden (${v.filas})`, v.filas === v.enRutina && v.nombres, JSON.stringify(v));
  ok(`${tag} · hasta 3 parecidos por ejercicio (${v.conOpciones} con opciones) y todos empiezan en «Dejar igual»`, v.conOpciones > 0 && v.maxOpciones <= 3 && v.igualOn);
  ok(`${tag} · no propone lo que ya está en la rutina`, v.ninguna);
  ok(`${tag} · alternativas ${tag === 'ancho' ? 'al lado' : 'debajo'} de lo actual, sin salirse de lo ancho`, v.ancho && v.lado === (tag === 'ancho' ? 'al lado' : 'debajo'), JSON.stringify(v));
  // Filtros por uso: «Los que usan hoy» y «Todo menos los de hoy».
  const uso = async (k) => { await p.locator(`[data-cx-uso="${k}"]`).click(); return p.evaluate(() => {
    const ids = [...document.querySelectorAll('[data-cambiar-ejercicios] [data-cx-op]')].map(b => b.dataset.cxOp);
    return { n: ids.length, hoy: ids.filter(id => _ent.enUso.has(id)).length, conTag: document.querySelectorAll('[data-cx-op-uso]').length };
  }); };
  // En el arnés solo Ana tiene ciclo (y lo suyo ya está en la rutina): se
  // suman a «hoy» dos parecidos, como si otros clientes los tuvieran.
  const uso0 = await p.evaluate(() => { const ids = _cx.filas.flatMap(f => cxOpciones(f).slice(0, 1).map(x => x.e.id)).slice(0, 2); ids.forEach(id => _ent.enUso.set(id, 2)); cxPintar(); return { ids, total: _ent.enUso.size }; });
  ok(`${tag} · lee qué usan hoy tus clientes (${uso0.total})`, uso0.total > uso0.ids.length);
  const uHoy = await uso('hoy');
  ok(`${tag} · «Los que usan hoy» deja solo los que tus clientes tienen hoy, con cuántos (${uHoy.n})`, uHoy.n > 0 && uHoy.hoy === uHoy.n && uHoy.conTag === uHoy.n, JSON.stringify(uHoy));
  const uResto = await uso('resto');
  ok(`${tag} · «Todo menos los de hoy» deja solo los que nadie usa hoy (${uResto.n})`, uResto.n > 0 && uResto.hoy === 0, JSON.stringify(uResto));
  await p.locator('[data-cx-uso="resto"]').click();
  const uTodo = await p.evaluate(() => document.querySelectorAll('[data-cambiar-ejercicios] [data-cx-op]').length);
  ok(`${tag} · tocarlo otra vez vuelve a todos`, uTodo >= Math.max(uHoy.n, uResto.n), String(uTodo));
  // Elegir en un renglón
  const fila = p.locator('[data-cambiar-ejercicios] .cx-fila').filter({ has: p.locator('[data-cx-op]') }).first();
  const reId = await fila.getAttribute('data-cx-fila');
  const elegido = await fila.locator('[data-cx-op]').first().getAttribute('data-cx-op');
  await fila.locator('[data-cx-op]').first().click();
  ok(`${tag} · elegir marca el renglón y el pie cuenta 1 cambio`, (await fila.getAttribute('class')).includes('cambia') && /^1 de \d+ cambian$/.test(await p.locator('[data-cx-cuenta]').innerText()));
  // «Proponer uno para cada uno»: llena todo sin repetir.
  await p.locator('[data-cx-proponer]').click();
  const pr = await p.evaluate(() => { const ids = _cx.filas.map(f => f.elegido).filter(Boolean); return { n: ids.length, distintos: new Set(ids).size === ids.length, conOps: _cx.filas.filter(f => cxOpciones(f).length).length }; });
  ok(`${tag} · «Proponer uno para cada uno» elige en cada ejercicio con parecidos, sin repetir (${pr.n})`, pr.n > 1 && pr.distintos && pr.n >= Math.min(pr.conOps, 2), JSON.stringify(pr));
  if (tag === 'ancho' || tag === 'telefono') await p.screenshot({ path: path.join(CAPTURAS, `cambiar-ejercicios-${tag}.png`) });
  await p.locator('[data-cx-limpiar]').click();
  ok(`${tag} · «Dejar todo igual» suelta todo`, await p.evaluate(() => _cx.filas.every(f => !f.elegido)) && await p.locator('[data-cx-aplicar]').isDisabled());
  await fila.locator(`[data-cx-op="${elegido}"]`).click();
  if (tag === 'ancho') {
    // Guardar como rutina nueva: la original queda igual.
    const nRutinas = await p.evaluate(() => TABLAS_FALSAS.rutinas.length);
    const antesOrig = await p.evaluate((id) => ({ ...TABLAS_FALSAS.rutina_ejercicios.find(x => x.id === id) }), reId);
    await p.evaluate(() => {   // el falso no tiene la RPC: una copia simple
      entDb.copiarRutina = async (rid, _f, nombre) => { const id = 'copia-' + rid; TABLAS_FALSAS.rutinas.push({ ...TABLAS_FALSAS.rutinas.find(r => r.id === rid), id, nombre });
        TABLAS_FALSAS.rutina_ejercicios.filter(x => x.rutina_id === rid).forEach(x => TABLAS_FALSAS.rutina_ejercicios.push({ ...x, id: 'c-' + x.id, rutina_id: id })); return id; };
    });
    await p.locator('[data-cx-nueva]').click(); await p.waitForTimeout(700);
    const nv = await p.evaluate(({ id, el }) => ({ n: TABLAS_FALSAS.rutinas.length, copia: TABLAS_FALSAS.rutina_ejercicios.find(x => x.id === 'c-' + id)?.ejercicio_id === el, orig: TABLAS_FALSAS.rutina_ejercicios.find(x => x.id === id).ejercicio_id }), { id: reId, el: elegido });
    ok('«Guardar como rutina nueva»: la copia trae el cambio y la original queda igual', nv.n === nRutinas + 1 && nv.copia && nv.orig === antesOrig.ejercicio_id, JSON.stringify(nv));
    await p.locator('[data-cambiar-solo-ejercicios]').click();
    await p.locator('[data-cambiar-ejercicios] .cx-fila').first().waitFor({ timeout: 5000 });
    await p.locator(`[data-cx-fila="${reId}"] [data-cx-op="${elegido}"]`).click();
  }
  // Aplicar en esta rutina
  const antes = await p.evaluate((id) => ({ ...TABLAS_FALSAS.rutina_ejercicios.find(x => x.id === id) }), reId);
  await p.locator('[data-cx-aplicar]').click(); await p.waitForTimeout(700);
  const despues = await p.evaluate((id) => ({ ...TABLAS_FALSAS.rutina_ejercicios.find(x => x.id === id) }), reId);
  ok(`${tag} · aplicar cambia el ejercicio en su mismo renglón`, despues.ejercicio_id === elegido && despues.id === antes.id, JSON.stringify({ antes: antes.ejercicio_id, despues: despues.ejercicio_id, elegido }));
  ok(`${tag} · y se quedan series, reps, peso, descanso, RIR, tempo, notas, orden y bloque`, CAMPOS.every(k => JSON.stringify(antes[k]) === JSON.stringify(despues[k])));
  const pant = await p.evaluate((id) => ({ cerrado: document.getElementById('modal').classList.contains('hidden'), fila: document.querySelector(`#cons-rutina .ent-fila[data-re="${id}"]`)?.innerText || '', nombre: entNombres(_ent.rutina.ejercicios.find(x => x.id === id).ejercicios).grande, sigue: document.getElementById('cons-col-rutina')?.dataset.marca === 'sigo' }), reId);
  ok(`${tag} · se cierra y la rutina muestra el nuevo sin recargar`, pant.cerrado && pant.fila.includes(pant.nombre) && pant.sigue, JSON.stringify(pant).slice(0, 200));
  ok(`${tag} · sin errores`, errores.length === 0, errores.join(' | '));
  await ctx.close();
}
await b.close(); servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
