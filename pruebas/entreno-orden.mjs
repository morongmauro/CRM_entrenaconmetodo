// Entrenamiento ordenado alrededor del cliente (CRM entero):
//   · Clientes es la primera pestaña, con el estado del ciclo de cada uno;
//   · dentro del cliente, el aviso de su ciclo con el botón para resolverlo;
//   · editar una rutina desde el cliente no cambia de pestaña y «Volver al
//     cliente» regresa ahí;
//   · «Unir y separar»: Push + Pull → Upper Body; Upper → Push / Pull / Legs.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/entreno-orden.mjs
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




const c18 = fixture.fases.find(f => f.nombre === 'Ciclo 18');
const rutinasDe = (p) => p.evaluate((fid) => TABLAS_FALSAS.rutinas.filter(r => r.fase_id === fid).map(r => ({ id: r.id, nombre: r.nombre, dias: r.dias_semana })), c18.id);

for (const [tag, ancho, alto] of [['ancho', 1440, 900], ['telefono', 390, 844]]) {
  console.log(`\n${tag} (${ancho}px)`);
  const a = await abrir(ancho, alto);
  const p = a.p;
  await p.evaluate(() => { fmt.hoy = () => '2026-09-10'; try { sessionStorage.removeItem('crm:ent'); } catch (e) {} _ent.tab = 'clientes'; _ent.clienteId = null; return navigate('entrenamiento'); });
  await p.waitForSelector('[data-cliente-ent]', { timeout: 15000 });
  const tabs = await p.$$eval('[data-ent-tab]', bs => bs.map(b => b.dataset.entTab + (b.classList.contains('active') ? '*' : '')));
  ok(`${tag} · Clientes es la primera pestaña (y la que abre); luego ciclos, plantillas y galería`, JSON.stringify(tabs) === JSON.stringify(['clientes*', 'ciclos', 'rutinas', 'ejercicios']), JSON.stringify(tabs));
  ok(`${tag} · cada cliente dice cómo va su ciclo`, await p.locator('[data-cliente-ent] [data-ciclo-tono]').count() >= 1, await p.locator('[data-cliente-ent]').first().innerText());

  // Dentro del cliente: el aviso de su ciclo.
  await p.locator('[data-cliente-ent]').first().click();
  await p.waitForSelector('[data-traer-btn]', { timeout: 15000 });
  await p.evaluate((id) => entVerFase(id), c18.id);
  await p.waitForTimeout(700);
  ok(`${tag} · dentro del cliente, el aviso de su ciclo con el botón para resolverlo`, await p.locator('[data-aviso-ciclo-cliente] button').count() === 1, await p.locator('[data-aviso-ciclo-cliente]').innerText().catch(() => 'sin aviso'));

  // Editar una rutina desde el cliente: no se cambia de pestaña.
  await p.evaluate(() => entSubtab('rutinas'));
  await p.waitForTimeout(600);
  await p.locator('button:has-text("Construir")').first().click();
  await p.waitForSelector('#cons-rutina', { timeout: 15000 });
  ok(`${tag} · construyendo su rutina, la pestaña marcada sigue siendo Clientes`, await p.locator('[data-ent-tab="clientes"].active').count() === 1 && /Volver al cliente/.test(await p.locator('[data-volver]').innerText()));
  ok(`${tag} · desde la galería del constructor se edita el ejercicio (✎) sin salir`, await p.locator('#cons-gal-lista [data-editar-ej]').count() > 0);
  await p.locator('[data-volver]').click();
  await p.waitForSelector('[data-traer-btn]', { timeout: 15000 });
  ok(`${tag} · «Volver al cliente» regresa a sus rutinas`, await p.evaluate(() => _ent.tab === 'clientes' && _ent.subtab === 'rutinas' && !_ent.rutinaId));

  // UNIR: Push + Pull → Upper Body.
  await p.locator('[data-ir-mezcla]').click();
  await p.waitForSelector('[data-mezcla]', { timeout: 15000 });
  const ids = await p.evaluate((fid) => Object.fromEntries(TABLAS_FALSAS.rutinas.filter(r => r.fase_id === fid).map(r => [r.nombre, r.id])), c18.id);
  await p.locator(`[data-mz-rutina="${ids['Push Training']}"]`).check();
  await p.locator(`[data-mz-rutina="${ids['Pull Training']}"]`).check();
  ok(`${tag} · unir Push + Pull sugiere «Upper Body» y dice cuánto dura`, await p.inputValue('#mz-nombre') === 'Upper Body' && /≈ \d+ min/.test(await p.locator('[data-mz-total]').innerText()));
  if (tag === 'ancho') await p.locator('[data-mezcla]').screenshot({ path: path.join(CAPTURAS, 'mezcla-unir.png') }).catch(() => {});
  const antes = (await rutinasDe(p)).length;
  const esperado = await p.evaluate((ids2) => {
    const s = new Set(TABLAS_FALSAS.rutina_ejercicios.filter(x => ids2.includes(x.rutina_id)).map(x => x.ejercicio_id));
    return s.size;
  }, [ids['Push Training'], ids['Pull Training']]);
  await p.locator('[data-mz-crear]').click();
  await p.waitForSelector('[data-mz-hecho]', { timeout: 15000 });
  const despues = await rutinasDe(p);
  const nueva = despues.find(r => r.nombre === 'Upper Body');
  const n = await p.evaluate((id) => TABLAS_FALSAS.rutina_ejercicios.filter(x => x.rutina_id === id).length, nueva?.id);
  ok(`${tag} · crea «Upper Body» sin día, con los ejercicios de las dos sin repetir; las originales siguen`, despues.length === antes + 1 && nueva && (!nueva.dias || !nueva.dias.length) && n === esperado
    && despues.some(r => r.nombre === 'Push Training') && despues.some(r => r.nombre === 'Pull Training'), `${n} de ${esperado} · ${JSON.stringify(nueva)}`);

  // SEPARAR: Upper Body Training → Push / Pull / Legs.
  await p.locator('[data-mz-modo="separar"]').click();
  await p.locator(`[data-mz-rutina="${ids['Upper Body Training']}"]`).check();
  await p.locator('[data-mz-partir="ppl"]').click();
  await p.waitForTimeout(200);
  if (tag === 'ancho') await p.locator('[data-mezcla]').screenshot({ path: path.join(CAPTURAS, 'mezcla-separar.png') }).catch(() => {});
  const plan = await p.evaluate(() => mzSeparacion().tramos.map(l => l.flatMap(t => t.items.map(re => re.ejercicios?.patron || re.ejercicios?.tipo))));
  ok(`${tag} · separar en Push / Pull / Legs: los de empuje en Push, los de tracción en Pull, el calentamiento en todas`,
    plan[0].filter(x => x === 'push').length === 6 && !plan[0].includes('pull') && plan[1].filter(x => x === 'pull').length === 4 && !plan[1].includes('push')
    && plan.every(l => l.includes('calentamiento')), JSON.stringify(plan));
  const antes2 = (await rutinasDe(p)).length;
  await p.locator('[data-mz-crear]').click();
  await p.waitForSelector('[data-mz-hecho]', { timeout: 15000 });
  const d2 = await rutinasDe(p);
  ok(`${tag} · crea Push, Pull y Legs nuevas sin día`, d2.length === antes2 + 3 && ['Push', 'Pull', 'Legs'].every(nm => d2.some(r => r.nombre === nm && (!r.dias || !r.dias.length))), JSON.stringify(d2.map(r => r.nombre)));

  ok(`${tag} · sin scroll de lado`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  ok(`${tag} · sin errores de JavaScript`, a.errores.length === 0, a.errores.join(' | '));
  await a.ctx.close();
}

await b.close();
servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
