// Agente de rutinas · alternativas y variantes (con el modelo simulado):
//   · desde «Alternativas» → «Que el asistente elija»: busca en la galería,
//     muestra tarjetas para elegir; tocar una deja propuesta la sustitución
//     en el mismo renglón y «Aplicar todo» la guarda con su prescripción;
//   · botón «Sin peso»: pide la variante con el nivel Profundo, muestra la
//     rutina completa y «Guardar como rutina nueva» la copia a la biblioteca
//     con los cambios, sin tocar la original; «Reemplazar» cambia la actual.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/agente-alternativas.mjs
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
// Con video (YouTube) todos menos los últimos 3, que quedan sin video.
fixture.ejercicios.forEach((e, i) => { if (i < fixture.ejercicios.length - 3) Object.assign(e, { video_fuente: 'youtube', video_ref: 'abcdEFGH' + String(i).padStart(3, '0'), video_inicio_seg: i % 2 ? 4 : null }); });

function tablas() {
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
    if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return ruta.continue().catch(() => ruta.abort());
    return ruta.fulfill({ status: 200, contentType: 'application/json', body: u.includes('/rest/v1/') ? '[]' : '{}' });
  });
  await p.goto(BASE + '/');
  await p.locator('#app-screen').waitFor({ state: 'visible', timeout: 20000 });
  await p.waitForTimeout(1000);
  return { ctx, p, errores };
}


const rut = fixture.rutinas.find(r => fixture.fases.find(f => f.id === r.fase_id)?.nombre === 'Ciclo 18' && r.nombre === 'Push Training');
const usage = { input_tokens: 1000, output_tokens: 50 };
const herramienta = (id, name, input) => ({ content: [{ type: 'tool_use', id, name, input }], stop_reason: 'tool_use', model: 'claude-opus-5-5', usage });
const texto = (t) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn', model: 'claude-opus-5-5', usage });
const ultimoResultado = (body) => { const c = (body.messages || []).at(-1)?.content; const r = Array.isArray(c) ? c.find(x => x.type === 'tool_result') : null; try { return JSON.parse(r?.content || '{}'); } catch { return {}; } };

const { ctx, p, errores } = await abrir(1600, 1000);
const pedidos = [];
let guion = null;
await p.route('**/api/coach-ask', async (ruta) => {
  const body = JSON.parse(ruta.request().postData() || '{}');
  pedidos.push(body);
  await ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(guion(body, pedidos.length)) });
});
await p.evaluate((id) => entAbrirConstructor(id), rut.id);
await p.waitForSelector('#cons-rutina .ent-fila', { timeout: 15000 });
await p.waitForTimeout(500);
// La copia a la biblioteca (el Supabase de prueba no corre las funciones SQL).
await p.evaluate(() => {
  entDb.copiarRutina = async (id, fase, nombre) => {
    const T = window.TABLAS_FALSAS, o = T.rutinas.find(r => r.id === id), nid = 'copia-' + Date.now();
    T.rutinas.push({ ...o, id: nid, nombre, fase_id: fase, cliente_id: null });
    T.rutina_ejercicios.filter(x => x.rutina_id === id).forEach((x, k) => T.rutina_ejercicios.push({ ...x, id: nid + '-' + k, rutina_id: nid }));
    return nid;
  };
});

// ── Parte 2: alternativas con tarjetas ──
const re = await p.evaluate(() => { const x = _ent.rutina.ejercicios.slice().sort((a, b) => altCandidatos(b.ejercicios, _ent.ejercicios).length - altCandidatos(a.ejercicios, _ent.ejercicios).length)[0];
  return { id: x.id, nombre: entNombres(x.ejercicios).grande, ej: x.ejercicio_id, pos: _ent.rutina.ejercicios.indexOf(x) + 1 }; });
guion = (body, n) => {
  if (n === 1) return herramienta('a1', 'alternativas_de_ejercicio', { rutina: 'esta', ejercicio: re.nombre });
  if (n === 2) { const r = ultimoResultado(body); guion.alts = r.alternativas || [];
    return herramienta('a2', 'mostrar_opciones_de_sustitucion', { rutina: 'esta', ejercicio: re.nombre, opciones: guion.alts.slice(0, 3).map((a, k) => ({ ejercicio: a.ejercicio, por_que: 'Porque sí ' + (k + 1), ...(k === 1 ? { reps: '12 por lado' } : {}) })) }); }
  return texto('Te dejé 3 opciones: elige una.');
};
await p.locator(`#cons-rutina .ent-fila[data-re="${re.id}"] [data-alternativas]`).click();
await p.waitForSelector('[data-alt-ia]', { timeout: 4000 }).catch(() => {});
ok('la ventana «Alternativas» ofrece «Que el asistente elija»', await p.locator('[data-alt-ia]').count() === 1);
await p.locator('[data-alt-ia]').click();
await p.waitForFunction(() => document.querySelectorAll('#rut-panel [data-rut-opciones] .rut-op').length === 3, null, { timeout: 8000 }).catch(() => {});
const r1 = ultimoResultado(pedidos[1] || {});
ok(`busca en la galería: ${r1.alternativas?.length || 0} alternativas para «${re.nombre}» con su porqué`, r1.alternativas?.length > 0 && r1.sale?.posicion === re.pos && r1.alternativas.every(a => a.por_que_se_parece && a.ejercicio !== re.nombre), JSON.stringify(r1).slice(0, 300));
ok('pide en nivel Profundo (Opus) aunque estuviera en Rápido', pedidos[0]?.nivel === 'profundo', pedidos[0]?.nivel);
ok('la pregunta dice qué ejercicio y su posición', /Dame alternativas para .* \(posición \d+\)/.test((pedidos[0]?.messages || [])[0]?.content || ''), (pedidos[0]?.messages || [])[0]?.content);
ok('muestra 3 tarjetas para elegir, con su porqué', await p.locator('#rut-panel [data-rut-opciones] .rut-op').count() === 3 && /Porque sí 2/.test(await p.locator('#rut-panel [data-rut-opciones]').innerText()));
ok('no queda nada propuesto hasta que elijas', await p.evaluate(() => _rut.propuestas.length === 0));
await p.screenshot({ path: path.join(CAPTURAS, 'agente-opciones.png') });
const antes = await p.evaluate((id) => ({ ...TABLAS_FALSAS.rutina_ejercicios.find(x => x.id === id) }), re.id);
await p.locator('#rut-panel [data-rut-opciones] .rut-op').nth(1).locator('[data-rut-elegir]').click();
await p.waitForTimeout(300);
ok('elegir una deja propuesta la sustitución (una sola)', await p.evaluate(() => _rut.propuestas.length === 1 && /Cambiar .* por /.test(_rut.propuestas[0].descripcion)));
ok('y las otras tarjetas quedan apagadas', await p.locator('#rut-panel .rut-op.apagada').count() === 2 && await p.locator('#rut-panel .rut-op.elegida').count() === 1);
await p.locator('#rut-panel button:has-text("Aplicar todo")').click();
await p.waitForTimeout(800);
const despues = await p.evaluate((id) => ({ ...TABLAS_FALSAS.rutina_ejercicios.find(x => x.id === id) }), re.id);
const elegido = await p.evaluate((n) => (_ent.ejercicios || []).find(e => entNombres(e).grande === n)?.id, guion.alts[1].ejercicio);
ok('al aplicar: el nuevo en el mismo renglón, con «12 por lado» y lo demás igual', despues.ejercicio_id === elegido && despues.reps === '12 por lado'
  && ['series', 'descanso_seg', 'rir', 'orden', 'bloque_id'].every(k => JSON.stringify(antes[k]) === JSON.stringify(despues[k])), JSON.stringify({ antes, despues }).slice(0, 300));

// ── Parte 3: variante «Sin peso» ──
// (el Supabase de prueba guarda el ejercicio unido dentro del renglón: se pone al día a mano)
await p.evaluate(async ({ id, ej }) => { const g = TABLAS_FALSAS.ejercicios || []; const row = TABLAS_FALSAS.rutina_ejercicios.find(x => x.id === id); row.ejercicios = { ...row.ejercicios, ...(g.find(e => e.id === ej) || {}) }; await entRefrescarRutina(); }, { id: re.id, ej: elegido });
await p.evaluate(() => rutLimpiar());
const ejs = await p.evaluate(() => _ent.rutina.ejercicios.map((x, i) => ({ pos: i + 1, nombre: entNombres(x.ejercicios).grande })));
const cambia = ejs.find(e => /Bench Press/.test(e.nombre)).pos;
pedidos.length = 0;
guion = (body, n) => {
  if (n === 1) return herramienta('v1', 'alternativas_de_ejercicio', { rutina: 'esta', ejercicio: ejs[cambia - 1].nombre, filtro: 'sin_peso' });
  if (n === 2) { const alt = (ultimoResultado(body).alternativas || [])[0];
    return herramienta('v2', 'proponer_variante_de_rutina', { rutina: 'esta', tipo: 'sin peso', titulo: 'Push · sin peso', explicacion: 'Todo con peso corporal.',
      ejercicios: ejs.map(e => e.pos === cambia && alt ? { posicion: cambia, ejercicio: alt.ejercicio, reps: '15', por_que: 'sin barra' } : { posicion: e.pos, ejercicio: e.nombre }) }); }
  return texto('Ahí tienes la variante.');
};
await p.evaluate(() => { _rut.chat.nivel = 'rapido'; rutPintar(); });
ok('con la rutina abierta salen los 4 botones de variante y «Cambiar solo los ejercicios»', await p.locator('#rut-panel [data-rut-variantes] .rut-var-btn[data-variante]').count() === 4 && await p.locator('#rut-panel [data-cambiar-solo-ejercicios]').count() === 1);
await p.locator('#rut-panel [data-variante="sin_peso"]').click();
await p.waitForFunction(() => document.querySelector('#rut-panel [data-rut-variante]'), null, { timeout: 8000 }).catch(() => {});
ok('el botón «Sin peso» pregunta en Profundo', pedidos[0]?.nivel === 'profundo' && /SIN PESO/.test((pedidos[0]?.messages || [])[0]?.content || ''));
const v = await p.evaluate(() => ({ filas: document.querySelectorAll('#rut-panel [data-rut-variante] .rut-var-lista li').length, cambian: document.querySelectorAll('#rut-panel [data-rut-variante] .rut-var-lista li.cambia').length }));
ok(`muestra la rutina completa (${v.filas} posiciones, ${v.cambian} cambia)`, v.filas === ejs.length && v.cambian === 1, JSON.stringify(v));
await p.screenshot({ path: path.join(CAPTURAS, 'agente-variante.png') });
const pos1 = await p.evaluate((i) => { const x = _ent.rutina.ejercicios[i]; return { orden: x.orden, ejercicio_id: x.ejercicio_id }; }, cambia - 1);
const nRutinas = await p.evaluate(() => TABLAS_FALSAS.rutinas.length);
const original = await p.evaluate((rid) => TABLAS_FALSAS.rutina_ejercicios.filter(x => x.rutina_id === rid).map(x => x.ejercicio_id + '|' + x.reps).join(','), rut.id);
await p.locator('#rut-panel [data-rut-nueva]').click(); await p.waitForTimeout(200);
ok('«Guardar como rutina nueva» queda propuesto', await p.evaluate(() => _rut.propuestas.length === 1 && /biblioteca/.test(_rut.propuestas[0].descripcion)));
await p.locator('#rut-panel button:has-text("Aplicar todo")').click(); await p.waitForTimeout(900);
const nueva = await p.evaluate(() => { const T = TABLAS_FALSAS, r = T.rutinas.at(-1); return { nombre: r.nombre, fase: r.fase_id, cliente: r.cliente_id, ejs: T.rutina_ejercicios.filter(x => x.rutina_id === r.id).map(x => ({ ej: x.ejercicio_id, reps: x.reps, orden: x.orden })) }; });
ok('al aplicar: hay una rutina nueva «Push · sin peso» en la biblioteca, con el cambio', (await p.evaluate(() => TABLAS_FALSAS.rutinas.length)) === nRutinas + 1 && nueva.nombre === 'Push · sin peso' && !nueva.fase && !nueva.cliente && nueva.ejs.length === ejs.length && nueva.ejs.find(x => x.orden === pos1.orden && x.ej !== pos1.ejercicio_id)?.reps === '15', JSON.stringify(nueva).slice(0, 300));
ok('y la rutina del cliente quedó igual', await p.evaluate((rid) => TABLAS_FALSAS.rutina_ejercicios.filter(x => x.rutina_id === rid).map(x => x.ejercicio_id + '|' + x.reps).join(','), rut.id) === original);
// «Reemplazar la actual»: la misma variante, ahora sobre la rutina del cliente.
await p.evaluate(() => rutLimpiar()); pedidos.length = 0;
await p.locator('#rut-panel [data-variante="sin_peso"]').click();
await p.waitForFunction(() => document.querySelector('#rut-panel [data-rut-variante]'), null, { timeout: 8000 }).catch(() => {});
await p.locator('#rut-panel [data-rut-reemplazar]').click(); await p.waitForTimeout(200);
await p.locator('#rut-panel button:has-text("Aplicar todo")').click(); await p.waitForTimeout(900);
const fila = await p.evaluate((o) => TABLAS_FALSAS.rutina_ejercicios.find(x => x.rutina_id === o.rid && x.orden === o.orden), { rid: rut.id, orden: pos1.orden });
ok('«Reemplazar la actual» cambia ese renglón de la rutina del cliente (y nada más)', fila.ejercicio_id !== pos1.ejercicio_id && fila.reps === '15'
  && (await p.evaluate((rid) => TABLAS_FALSAS.rutinas.filter(r => r.nombre === 'Push · sin peso').length)) === 1);
ok('sin errores', errores.length === 0, errores.join(' | '));
await ctx.close(); await b.close(); servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
