// Videos de técnica (CRM entero): pedirlos desde la rutina del cliente,
// marcarlos «bien» o «a mejorar» con la nota, volver a pedirlos, y verlo
// igual en Entrenamiento → el cliente y en Seguimiento.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/videos-tecnica.mjs
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
    eventos: [], evento_registros: [], rutina_movimientos: [], rutina_extras: [], rutina_dias_quitados: [], videos_tecnica: [],
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
const filas = (p) => p.evaluate(() => JSON.parse(JSON.stringify(TABLAS_FALSAS.videos_tecnica)));

for (const [tag, ancho, alto] of [['ancho', 1440, 900], ['telefono', 390, 844]]) {
  console.log(`\n${tag} (${ancho}px)`);
  const a = await abrir(ancho, alto);
  const p = a.p;
  await a.ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await p.evaluate(() => { fmt.hoy = () => '2026-09-10'; return verEntrenamientoCliente('c0'); });
  await p.waitForSelector('[data-traer-btn]', { timeout: 15000 });
  await p.evaluate((id) => { _ent.faseId = id; return entSubtab('videos'); }, c18.id);
  await p.waitForSelector('[data-vt-panel]', { timeout: 15000 });
  ok(`${tag} · la pestaña «Videos de técnica» del cliente arranca vacía y ofrece pedirlos`, /Todavía no le has pedido videos/.test(await p.locator('[data-vt-panel]').innerText()));

  // Pedir dos de su rutina.
  await p.locator('[data-vt-pedir]').click();
  await p.waitForSelector('.vt-ej', { timeout: 10000 });
  const nombres = await p.$$eval('.vt-ej', xs => xs.slice(0, 2).map(x => x.dataset.nombre));
  const cajas = await p.locator('.vt-ej').all();
  await cajas[0].check(); await cajas[1].check();
  if (tag === 'ancho') await p.locator('#modal-content').screenshot({ path: path.join(CAPTURAS, 'videos-pedir.png') }).catch(() => {});
  await p.locator('[data-vt-confirmar]').click();
  await p.waitForSelector('[data-vt-estado="pedido"]', { timeout: 10000 });
  let f = await filas(p);
  ok(`${tag} · pedir guarda los dos como «por llegar», con su ejercicio`, f.length === 2 && f.every(x => x.estado === 'pedido' && x.ejercicio_id && x.cliente_id === 'c0'), JSON.stringify(f));
  const msg = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  ok(`${tag} · y copia el mensaje para WhatsApp con los dos`, !msg || (msg.includes(nombres[0]) && msg.includes(nombres[1])), msg);

  // Uno bien, otro a mejorar con la nota y pedido de nuevo.
  const [x1, x2] = f;
  await p.locator(`[data-vt-fila="${x1.id}"] [data-vt-bien]`).click();
  await p.waitForTimeout(300);
  await p.locator(`[data-vt-fila="${x2.id}"] [data-vt-mejorar]`).click();
  await p.fill('#vt-nota', 'Rodillas hacia adentro al subir');
  await p.locator('[data-vt-guardar-mejorar]').click();
  await p.waitForSelector('[data-vt-estado="mejorar"]', { timeout: 10000 });
  ok(`${tag} · «a mejorar» muestra la nota y el botón para pedirlo de nuevo`, /Rodillas hacia adentro/.test(await p.locator(`[data-vt-fila="${x2.id}"]`).innerText()) && await p.locator(`[data-vt-fila="${x2.id}"] [data-vt-repedir]`).count() === 1);
  ok(`${tag} · las cuentas dicen 1 bien y 1 a mejorar`, /Bien · 1/.test(await p.locator('[data-vt-cuenta="bien"]').innerText()) && /A mejorar · 1/.test(await p.locator('[data-vt-cuenta="mejorar"]').innerText()));
  if (tag === 'ancho') await p.locator('[data-vt-panel]').screenshot({ path: path.join(CAPTURAS, 'videos-panel.png') }).catch(() => {});
  await p.locator(`[data-vt-fila="${x2.id}"] [data-vt-repedir]`).click();
  await p.waitForTimeout(600);
  f = await filas(p);
  const nuevo = f.find(x => x.pedido_de === x2.id);
  ok(`${tag} · pedirlo de nuevo crea otro pedido ligado al anterior; el anterior queda en la historia`, nuevo && nuevo.estado === 'pedido' && f.find(x => x.id === x2.id).estado === 'mejorar'
    && await p.locator(`[data-vt-fila="${nuevo.id}"]`).count() === 1 && /2ª vez/.test(await p.locator(`[data-vt-fila="${nuevo.id}"]`).innerText()), JSON.stringify(f));

  // En Seguimiento, el mismo panel para ese cliente.
  await p.evaluate(() => { _selectedClienteId = 'c0'; return navigate('seguimiento'); });
  await p.waitForSelector('[data-seg-videos] [data-vt-panel]', { timeout: 15000 });
  ok(`${tag} · en Seguimiento sale lo mismo (1 bien, 1 por llegar)`, /Bien · 1/.test(await p.locator('[data-seg-videos] [data-vt-cuenta="bien"]').innerText()) && /Por llegar · 1/.test(await p.locator('[data-seg-videos] [data-vt-cuenta="pedido"]').innerText()));

  // La etiqueta en cada ejercicio de la rutina (Entrenamiento → el cliente → Rutinas).
  await p.evaluate(() => verEntrenamientoCliente('c0'));
  await p.waitForSelector('[data-traer-btn]', { timeout: 15000 });
  await p.evaluate((id) => { _ent.faseId = id; return entSubtab('rutinas'); }, c18.id);
  await p.waitForSelector('.ent-flecha', { timeout: 15000 });
  // La rutina que tiene el ejercicio pedido (el pedido se hace sobre la fase activa).
  await p.evaluate(async (id) => { const por = await entDb.ejerciciosDeRutinas(_ent.rutinasCache.map(r => r.id)); const r = _ent.rutinasCache.find(r => (por[r.id] || []).some(re => re.ejercicio_id === id)) || _ent.rutinasCache[0]; return entToggleRutina(r.id); }, x1.ejercicio_id);
  await p.waitForSelector('[data-vt-etiqueta]', { timeout: 15000 });
  const etiquetas = await p.$$eval('[data-vt-etiqueta]', xs => xs.map(x => x.dataset.vtEtiqueta));
  ok(`${tag} · cada ejercicio de la rutina lleva su etiqueta de video (uno bien, uno por llegar, el resto sin pedir)`, etiquetas.includes('bien') && etiquetas.includes('pedido') && etiquetas.includes('ninguno'), etiquetas.join(','));
  ok(`${tag} · el repetido dice en la etiqueta que es de nuevo y por qué (a mejorar: rodillas)`, /de nuevo, antes a mejorar: Rodillas hacia adentro/.test(await p.locator('[data-vt-etiqueta="pedido"]').first().getAttribute('title')));
  // Desde la etiqueta «por llegar»: nada bien, con la nota, y pedido de nuevo.
  await p.locator('[data-vt-etiqueta="pedido"]').first().click();
  await p.waitForSelector('[data-vt-menu]', { timeout: 10000 });
  await p.locator('[data-vt-menu-mal]').click();
  await p.fill('#vt-nota', 'Espalda redondeada al bajar');
  await p.locator('[data-vt-menu-guardar]').click();
  await p.waitForTimeout(800);
  f = await filas(p);
  ok(`${tag} · «nada bien» desde la etiqueta guarda el estado con su nota y lo pide de nuevo`, f.some(x => x.estado === 'mal' && /Espalda redondeada/.test(x.nota || '')) && f.filter(x => x.estado === 'pedido').length === 1, JSON.stringify(f));
  await p.waitForSelector('[data-vt-etiqueta]', { timeout: 15000 });
  // Desde un ejercicio sin pedir: pedirlo ahí mismo.
  await p.locator('[data-vt-etiqueta="ninguno"]').first().click();
  await p.waitForSelector('[data-vt-menu-pedir]', { timeout: 10000 });
  await p.locator('[data-vt-menu-pedir]').click();
  await p.waitForTimeout(800);
  f = await filas(p);
  ok(`${tag} · desde el 🎥 de un ejercicio sin pedir se pide ahí mismo`, f.filter(x => x.estado === 'pedido').length === 2, JSON.stringify(f.map(x => x.estado)));
  if (tag === 'ancho') await p.locator('.ent-tabla-ejs').first().screenshot({ path: path.join(CAPTURAS, 'videos-etiquetas.png') }).catch(() => {});
  // «Lo que entrenó» también lleva el panel del cliente.
  await p.evaluate(() => entSubtab('sesiones'));
  await p.waitForSelector('[data-ses-videos] [data-vt-panel]', { timeout: 15000 });
  ok(`${tag} · en «Lo que entrenó» va el panel de videos del cliente (los dos por llegar)`, /Por llegar · 2/.test(await p.locator('[data-ses-videos] [data-vt-cuenta="pedido"]').innerText()));
  // Y en la lista de clientes de Entrenamiento, lo pendiente de todos.
  await p.evaluate(() => entVerCliente(null));
  await p.waitForSelector('[data-vt-general]', { timeout: 15000 });
  const gen = await p.locator('[data-vt-general]').innerText();
  ok(`${tag} · la lista general dice quién debe qué: Ana Pérez, los dos por llegar y, en el repetido, que antes estuvo nada bien y por qué`, /Ana Pérez/.test(gen) && /Por llegar · 2/.test(gen) && /antes nada bien: Espalda redondeada/.test(gen), gen.slice(0, 300));
  if (tag === 'ancho') await p.locator('[data-vt-general]').screenshot({ path: path.join(CAPTURAS, 'videos-general.png') }).catch(() => {});

  ok(`${tag} · sin scroll de lado`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  ok(`${tag} · sin errores de JavaScript`, a.errores.length === 0, a.errores.join(' | '));
  await a.ctx.close();
}

await b.close();
servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
