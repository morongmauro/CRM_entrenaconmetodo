// La etiqueta de cada ejercicio en el constructor: en qué ciclos anteriores
// del cliente lo tuvo («Lo usó en el ciclo anterior», «Lo usó hace 2 ciclos»,
// «Lo usó en los últimos 2 ciclos»…), para decidir si vale la pena repetirlo.
//
//   TAILWIND_CSS=estilos-tailwind.css node pruebas/rutina-ciclos-anteriores.mjs
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/constructor.mjs
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
  // Un ciclo más atrás (Ciclo 17) con dos ejercicios del Ciclo 19: uno que
  // también estuvo en el 18 (→ «en los últimos 2 ciclos») y otro que no
  // (→ «hace 2 ciclos»). Y uno del 19 que nunca estuvo antes (sin etiqueta).
  const f18 = fixture.fases.find(f => f.nombre === 'Ciclo 18'), f19 = fixture.fases.find(f => f.nombre === 'Ciclo 19');
  const r18 = new Set(fixture.rutinas.filter(r => r.fase_id === f18.id).map(r => r.id));
  const r19 = fixture.rutinas.find(r => r.fase_id === f19.id);
  const en18 = new Set(re.filter(x => r18.has(x.rutina_id)).map(x => x.ejercicio_id));
  const de19 = re.filter(x => x.rutina_id === r19.id).map(x => x.ejercicio_id);
  const libres = fixture.ejercicios.filter(e => !en18.has(e.id) && !de19.includes(e.id));
  const comun = de19.find(id => en18.has(id)), soloViejo = libres[0] && libres[0].id;
  const otro = libres[1];
  // El que solo estuvo en el 17 también va en la rutina del 19.
  const extra19 = soloViejo ? [{ id: 're19-x', rutina_id: r19.id, ejercicio_id: soloViejo, orden: 99, series: 3, reps: '10', ejercicios: ej.get(soloViejo) }] : [];
  const fases = [{ ...f18, id: 'f17', nombre: 'Ciclo 17', fecha_inicio: '2026-08-03', estado: 'finalizada' }, ...fixture.fases];
  const rutinas = [...fixture.rutinas, { ...r19, id: 'r17', fase_id: 'f17', nombre: 'Full body' }];
  const re17 = [comun, soloViejo].filter(Boolean).map((id, k) => ({ id: 're17-' + k, rutina_id: 'r17', ejercicio_id: id, orden: k, series: 3, reps: '10', ejercicios: ej.get(id) }));
  const solo19 = de19.find(id => !en18.has(id) && id !== soloViejo);
  globalThis.__casos = { comun, soloViejo, otro: otro && otro.id, r19: r19.id, solo19 };
  return {
    clientes: [cliente], seguimientos, pagos: [], pendientes: [], mediciones_corporales: [],
    settings: [{ user_id: 'coach-1', usd_cop_rate: 4000, nombre_coach: 'Mauro' }],
    metas_historial: [], nutricion_insights: [], ia_uso: [], push_pago_log: [],
    fases, rutinas, rutina_ejercicios: [...re, ...re17, ...extra19], rutina_bloques: fixture.rutina_bloques,
    sesiones: fixture.sesiones, series_log: sl, ejercicios: fixture.ejercicios, trainerize_resumen: fixture.trainerize_resumen,
    comunidad_posts: [], comunidad_reacciones: [], comunidad_comentarios: [], comunidad_vistas: [],
    // Le pediste el video de uno de su ciclo y aún no llega.
    videos_tecnica: comun ? [{ id: 'vt1', user_id: 'coach-1', cliente_id: 'c0', ejercicio_id: comun, ejercicio_nombre: 'X', estado: 'pedido', pedido_en: '2026-11-01', created_at: '2026-11-01T10:00:00Z' }] : [],
    pedidos_cliente: [],
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


const T = tablas();
const C = globalThis.__casos;
for (const [tag, ancho, alto] of [['ancho', 1600, 900], ['telefono', 390, 844]]) {
  console.log(`\n${tag} (${ancho}px)`);
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(e.message));
  p.on('dialog', d => d.accept());
  await ctx.addInitScript((t) => { window.TABLAS_FALSAS = t; }, T);
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
  await p.evaluate((id) => entAbrirConstructor(id), C.r19);
  await p.waitForSelector('#cons-col-rutina .ent-fila', { timeout: 15000 });
  await p.waitForTimeout(500);
  const tags = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#cons-col-rutina .ent-fila')].map(f => {
    const re = _ent.rutina.ejercicios.find(x => x.id === f.dataset.re);
    const t = f.querySelector('[data-tag-ciclos]');
    return [re.ejercicio_id, t ? t.textContent.trim() : ''];
  })));
  ok(`${tag} · en el 17 y en el 18 → «Lo usó en los últimos 2 ciclos»`, tags[C.comun] === 'Lo usó en los últimos 2 ciclos', JSON.stringify(tags));
  // Video pedido: etiqueta en la fila y aviso antes de quitarlo.
  ok(`${tag} · el ejercicio con video pedido lleva «Video pedido · hace N días»`, await p.locator(`[data-video-pedido="${C.comun}"]`).count() === 1 && /Video pedido · hace \d+ días/.test(await p.locator(`[data-video-pedido="${C.comun}"]`).innerText()));
  const quitar = async (resp) => p.evaluate(async ([id, r]) => { let msg = ''; const c0 = window.confirm; window.confirm = (m) => { msg = m; return r; }; const re = _ent.rutina.ejercicios.find(x => x.ejercicio_id === id); await entQuitarRE(re.id); window.confirm = c0; return { msg, sigue: _ent.rutina.ejercicios.some(x => x.ejercicio_id === id) }; }, [C.comun, resp]);
  let q = await quitar(false);
  ok(`${tag} · al quitarlo te avisa del video pedido y si dices que no, se queda`, /video pedido que aún no llega/.test(q.msg) && /queda en pausa/.test(q.msg) && q.sigue, JSON.stringify(q));
  ok(`${tag} · solo en el 17 → «Lo usó hace 2 ciclos»`, tags[C.soloViejo] === 'Lo usó hace 2 ciclos', JSON.stringify(tags));
  ok(`${tag} · la del ciclo anterior va en amarillo`, await p.locator(`[data-tag-ciclos="1,2"].tag-yellow`).count() >= 1);
  ok(`${tag} · el texto para casos salteados`, await p.evaluate(() => typeof entTextoCiclos === 'function' ? [entTextoCiclos([1]), entTextoCiclos([1, 3]), entTextoCiclos([2, 4, 5]), entTextoCiclos([1, 2, 3])].join(' | ') : '')
    === 'Lo usó en el ciclo anterior | Lo usó en el ciclo anterior y hace 3 ciclos | Lo usó hace 2, 4 y 5 ciclos | Lo usó en los últimos 3 ciclos');
  // Añadir uno que nunca tuvo: sin etiqueta. Y uno del ciclo anterior: con etiqueta.
  if (C.otro) {
    await p.evaluate((id) => entAgregarARutina(id), C.otro); await p.waitForTimeout(700);
    const nuevo = await p.evaluate((id) => { const re = _ent.rutina.ejercicios.find(x => x.ejercicio_id === id); const f = re && document.querySelector(`[data-re="${re.id}"]`); return f ? !!f.querySelector('[data-tag-ciclos]') : null; }, C.otro);
    const txt = await p.evaluate((id) => { const re = _ent.rutina.ejercicios.find(x => x.ejercicio_id === id); return document.querySelector(`[data-re="${re.id}"] [data-tag-ciclos]`)?.textContent.trim() || ''; }, C.otro);
    ok(`${tag} · uno que nunca tuvo, al añadirlo, dice «Nuevo para este cliente»`, nuevo === true && txt === 'Nuevo para este cliente', txt);
  }
  if (process.env.FOTO) {
    await p.locator('#cons-col-rutina').scrollIntoViewIfNeeded();
    await p.locator('#cons-col-rutina').screenshot({ path: path.join(CAPTURAS, `ciclos-${tag}-${process.env.FOTO}.png`) });
  }
  // Un ciclo copiado del 19 que quedó con la MISMA fecha de inicio (o antes):
  // el 19 igual cuenta como el anterior, no sale «Nuevo para este cliente».
  {
    // Un ejercicio que SOLO estuvo en el 19 (el de origen): en la copia no es nuevo.
    await p.evaluate(({ r19, otro }) => {
      const T = TABLAS_FALSAS, r = T.rutinas.find(x => x.id === r19), f = T.fases.find(x => x.id === r.fase_id);
      const ej = T.ejercicios.find(x => x.id === otro);
      if (!T.rutina_ejercicios.some(x => x.rutina_id === r19 && x.ejercicio_id === otro)) T.rutina_ejercicios.push({ id: 're19-solo', rutina_id: r19, ejercicio_id: otro, orden: 98, series: 3, reps: '10', ejercicios: ej });
      T.fases.push({ ...f, id: 'f20', nombre: 'Ciclo 20 (copia)', estado: 'borrador', orden: (f.orden || 0) - 1 });
      T.rutinas.push({ ...r, id: 'r20', fase_id: 'f20', origen_rutina_id: r.id });
      const de = T.rutina_ejercicios.filter(x => x.rutina_id === r.id);
      // Como en Supabase: cada fila trae su ejercicio completo (con su id).
      de.forEach((x, k) => T.rutina_ejercicios.push({ ...x, id: 're20-' + k, rutina_id: 'r20', ejercicios: T.ejercicios.find(e => e.id === x.ejercicio_id) || x.ejercicios }));
      if (typeof invalidarCache === 'function') invalidarCache();
    }, { r19: C.r19, otro: C.otro });
    const id19 = C.otro;
    await p.evaluate(() => entAbrirConstructor('r20'));
    await p.waitForFunction(() => _ent.rutina && _ent.rutina.id === 'r20' && document.querySelector('#cons-col-rutina .ent-fila'), null, { timeout: 15000 });
    await p.waitForTimeout(600);
    const t20 = await p.evaluate((id) => { const re = _ent.rutina.ejercicios.find(x => x.ejercicio_id === id); return re ? (document.querySelector(`[data-re="${re.id}"] [data-tag-ciclos]`)?.textContent.trim() || '') : 'sin fila'; }, id19);
    ok(`${tag} · ciclo copiado con la misma fecha: lo del ciclo de origen dice «Lo usó en el ciclo anterior», no «Nuevo»`, /ciclo anterior|últimos/.test(t20) && !/Nuevo/.test(t20), t20);
  }
  ok(`${tag} · sin errores de página`, errores.length === 0, errores.join(' | '));
  await ctx.close();
}
await b.close(); servidor.close();
console.log(mal ? `\n${mal} falla(s)` : '\ntodo bien');
process.exit(mal ? 1 : 0);
