// El constructor de rutinas en el CRM entero (datos de arnes/asistencia-datos.json):
// que NO se recargue la página al buscar, filtrar, añadir, mover o quitar;
// arrastrar de la galería a la rutina; meter y sacar de un circuito
// arrastrando; galería de a 2; foto del video en la rutina; filtros de varias
// opciones; y que cada columna tenga su propio scroll.
//
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
const ids = () => p.evaluate(() => _ent.rutina.ejercicios.map(x => x.id));
const enBase = () => p.evaluate((rid) => TABLAS_FALSAS.rutina_ejercicios.filter(x => x.rutina_id === rid).sort((a, b) => a.orden - b.orden).map(x => ({ id: x.id, ej: x.ejercicio_id, orden: x.orden, bloque: x.bloque_id || null })), push.id);
// Marca en el DOM: si la página se pintara entera, desaparece.
const marcar = () => p.evaluate(() => { document.getElementById('cons-col-rutina').dataset.marca = 'sigo'; document.getElementById('cons-col-gal').dataset.marca = 'sigo'; });
const sigue = () => p.evaluate(() => document.getElementById('cons-col-rutina')?.dataset.marca === 'sigo' && document.getElementById('cons-col-gal')?.dataset.marca === 'sigo');
let p;

for (const [tag, ancho, alto] of [['ancho', 1600, 900], ['telefono', 390, 844]]) {
  console.log(`\n${tag} (${ancho}px)`);
  const a = await abrir(ancho, alto);
  p = a.p;
  await p.evaluate((id) => entAbrirConstructor(id), push.id);
  await p.waitForSelector('#cons-gal-lista .ent-gal', { timeout: 15000 });
  await p.waitForTimeout(500);
  await marcar();

  // 1. Buscar: letra a letra, sin recargar; el cursor sigue en la caja.
  await p.locator('#cons-q').click();
  await p.keyboard.type('pre', { delay: 60 });
  await p.waitForTimeout(400);
  const busq = await p.evaluate(() => ({ foco: document.activeElement?.id, valor: document.getElementById('cons-q').value, n: document.querySelectorAll('#cons-gal-lista .ent-gal').length,
    todos: document.querySelectorAll('#cons-gal-lista .ent-gal').length === entFiltrar(_ent.ejercicios).length && entFiltrar(_ent.ejercicios).length < _ent.ejercicios.length }));
  ok(`${tag} · buscar no recarga la página y el cursor sigue escribiendo`, await sigue() && busq.foco === 'cons-q' && busq.valor === 'pre', JSON.stringify(busq));
  ok(`${tag} · buscar filtra la galería (${busq.n})`, busq.n > 0 && busq.todos);
  await p.evaluate(() => entLimpiarFiltros());
  await p.waitForTimeout(300);
  await marcar();

  // 2. Galería de a 2 por fila.
  const cajas = await p.locator('#cons-gal-lista .ent-gal').evaluateAll(cs => cs.slice(0, 3).map(c => c.getBoundingClientRect()).map(r => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) })));
  ok(`${tag} · galería de a 2 por fila`, cajas[0].y === cajas[1].y && cajas[1].x > cajas[0].x && cajas[2].y > cajas[0].y, JSON.stringify(cajas));

  // 3. Foto del video en cada fila de la rutina que tenga video.
  const fotos = await p.evaluate(() => ({ con: _ent.rutina.ejercicios.filter(x => x.ejercicios?.video_fuente === 'youtube').length, img: document.querySelectorAll('#cons-rutina .ent-fila img.ent-fila-foto').length }));
  ok(`${tag} · la rutina muestra la foto del preview (${fotos.img} de ${fotos.con})`, fotos.con > 0 && fotos.img === fotos.con, JSON.stringify(fotos));

  // 4. Filtros de varias opciones a la vez.
  await p.locator('#cons-filtros [data-multi="equipo"] summary').click();
  await p.locator('#cons-filtros [data-multi="equipo"] input[value="kettlebell"]').check();
  await p.locator('#cons-filtros [data-multi="equipo"] input[value="mancuerna"]').check();
  await p.waitForTimeout(300);
  const eq = await p.evaluate(() => { const l = entFiltrar(_ent.ejercicios); return { n: l.length, kb: l.some(e => (e.equipo || []).includes('kettlebell')), mc: l.some(e => (e.equipo || []).includes('mancuerna')),
    solo: l.every(e => (e.equipo || []).some(x => x === 'kettlebell' || x === 'mancuerna')), pint: document.querySelectorAll('#cons-gal-lista .ent-gal').length,
    txt: document.querySelector('#cons-filtros [data-multi="equipo"] summary').innerText, abierto: document.querySelector('#cons-filtros [data-multi="equipo"]').open }; });
  ok(`${tag} · equipo: kettlebell Y mancuernas a la vez (${eq.n})`, eq.kb && eq.mc && eq.solo && eq.pint === eq.n, JSON.stringify(eq));
  ok(`${tag} · el desplegable sigue abierto al marcar y dice «+1»`, eq.abierto && /\+1/.test(eq.txt), JSON.stringify(eq));
  await p.locator('#cons-filtros [data-multi="segmento"] summary').click();
  await p.locator('#cons-filtros [data-multi="segmento"] input[value="tren_superior"]').check();
  await p.locator('#cons-filtros [data-multi="segmento"] input[value="tren_inferior"]').check();
  await p.waitForTimeout(300);
  const seg = await p.evaluate(() => { const l = entFiltrar(_ent.ejercicios); return { n: l.length, ok: l.every(e => ['tren_superior', 'tren_inferior'].includes(e.segmento)), abiertos: document.querySelectorAll('details.ent-multi[open]').length }; });
  ok(`${tag} · tren superior + inferior a la vez, y abrir uno cierra el otro`, seg.ok && seg.abiertos === 1, JSON.stringify(seg));
  if (tag === 'ancho') await p.screenshot({ path: path.join(CAPTURAS, 'constructor-filtros-ancho.png') });
  await p.mouse.click(5, 5);
  ok(`${tag} · filtrar no recargó la página`, await sigue());
  await p.evaluate(() => entLimpiarFiltros());
  await p.waitForTimeout(300);
  await marcar();

  // 5. Arrastrar de la galería a la rutina (entre el 1º y el 2º).
  const antes = await ids();
  const fila2 = p.locator('#cons-rutina .ent-fila').nth(1);
  const ejId = await p.locator('#cons-gal-lista .ent-gal').nth(3).getAttribute('data-ej');
  if (tag === 'ancho') {
    await p.locator('#cons-gal-lista .ent-gal').nth(3).dragTo(fila2, { targetPosition: { x: 40, y: 6 } });
  } else {
    // En el teléfono no hay arrastre nativo: se prueba el mismo camino a mano.
    await p.evaluate(({ ej, re }) => { _ent.arrastrandoEj = ej; const f = document.querySelector(`.ent-fila[data-re="${re}"]`); const r = f.getBoundingClientRect();
      const ev = new Event('drop', { bubbles: true, cancelable: true }); Object.defineProperty(ev, 'currentTarget', { value: f }); Object.defineProperty(ev, 'clientY', { value: r.top + 3 }); entReDrop(ev); }, { ej: ejId, re: antes[1] });
  }
  await p.waitForTimeout(700);
  const desp = await ids();
  const base = await enBase();
  ok(`${tag} · arrastrar de la galería lo mete en esa posición (2º)`, desp.length === antes.length + 1 && base[1]?.ej === ejId && base.every((x, i) => x.orden === i + 1), JSON.stringify(base.slice(0, 3)));
  ok(`${tag} · y no recarga la página`, await sigue());

  // 6. Meterlo a un circuito arrastrando (sobre una fila del bloque A) y sacarlo (a un hueco).
  const bloqueA = (await p.evaluate(() => _ent.rutina.bloques[0]?.id));
  const enA = await p.evaluate((b) => _ent.rutina.ejercicios.filter(x => x.bloque_id === b).map(x => x.id), bloqueA);
  const suelto = await p.evaluate(() => _ent.rutina.ejercicios.find(x => !x.bloque_id)?.id);
  const soltar = async (sel, origen) => p.evaluate(({ sel, origen }) => {
    const f = document.querySelector(`.ent-fila[data-re="${origen}"]`);
    const dt = { effectAllowed: '', dropEffect: '', setData() {}, getData() { return ''; } };
    const ev = (t, x) => { const e = new Event(t, { bubbles: true, cancelable: true }); e.dataTransfer = dt; Object.entries(x || {}).forEach(([k, v]) => Object.defineProperty(e, k, { value: v })); return e; };
    entReDragStart(ev('dragstart', { currentTarget: f }));
    const dest = document.querySelector(sel); const r = dest.getBoundingClientRect();
    const fn = dest.classList.contains('ent-hueco') ? entHuecoDrop : entReDrop;
    fn(ev('drop', { currentTarget: dest, target: dest, clientY: r.top + r.height * 0.8 }));
    entReDragEnd(ev('dragend', { currentTarget: f }));
  }, { sel, origen });
  if (tag === 'ancho') {
    await p.locator(`.ent-fila[data-re="${suelto}"] .ent-agarre`).dragTo(p.locator(`.ent-fila[data-re="${enA[0]}"]`), { targetPosition: { x: 40, y: 50 } });
  } else await soltar(`.ent-fila[data-re="${enA[0]}"]`, suelto);
  await p.waitForTimeout(600);
  let fila = (await enBase()).find(x => x.id === suelto);
  ok(`${tag} · arrastrar un ejercicio dentro del circuito lo incluye`, fila.bloque === bloqueA, JSON.stringify(fila));
  // Mientras se arrastra aparecen los huecos «queda individual».
  const yAntes = await p.evaluate(() => [...document.querySelectorAll('#cons-rutina .ent-fila')].map(f => Math.round(f.getBoundingClientRect().top)).join(','));
  await p.evaluate((re) => { const f = document.querySelector(`.ent-fila[data-re="${re}"]`); const e = new Event('dragstart'); e.dataTransfer = { setData() {} }; Object.defineProperty(e, 'currentTarget', { value: f }); entReDragStart(e); }, suelto);
  await p.waitForTimeout(50);
  const huecos = await p.evaluate(() => document.getElementById('cons-rutina').classList.contains('ent-arrastrando') ? document.querySelectorAll('#cons-rutina .ent-hueco').length : 0);
  const yDurante = await p.evaluate(() => [...document.querySelectorAll('#cons-rutina .ent-fila')].map(f => Math.round(f.getBoundingClientRect().top)).join(','));
  ok(`${tag} · al empezar a arrastrar nada se mueve bajo el cursor`, yAntes === yDurante, `${yAntes} → ${yDurante}`);
  if (tag === 'ancho') await p.screenshot({ path: path.join(CAPTURAS, 'constructor-arrastrando-ancho.png') });
  await p.evaluate((re) => { const f = document.querySelector(`.ent-fila[data-re="${re}"]`); const e = new Event('dragend'); Object.defineProperty(e, 'currentTarget', { value: f }); entReDragEnd(e); }, suelto);
  ok(`${tag} · al arrastrar se ven los huecos para dejarlo suelto (${huecos})`, huecos >= 2);
  const ultimoHueco = await p.evaluate(() => { const h = [...document.querySelectorAll('#cons-rutina .ent-hueco')]; h.forEach((x, i) => { x.dataset.k = i; }); return h.length - 1; });
  await soltar(`#cons-rutina .ent-hueco[data-k="${ultimoHueco}"]`, suelto);
  await p.waitForTimeout(600);
  const tras = await enBase();
  fila = tras.find(x => x.id === suelto);
  ok(`${tag} · sacarlo a un hueco lo vuelve ejercicio individual (y va donde cayó)`, fila.bloque === null && tras[tras.length - 1].id === suelto && tras.every((x, i) => x.orden === i + 1), JSON.stringify(fila));
  ok(`${tag} · meter y sacar del circuito no recarga la página`, await sigue());

  // 7. Flechas, quitar y «+ Añadir»: al instante y sin recargar.
  const l0 = await ids();
  await p.locator(`.ent-fila[data-re="${l0[2]}"] button:has-text("↑")`).click();
  await p.waitForTimeout(400);
  const l1 = await ids();
  ok(`${tag} · ↑ sube el ejercicio sin recargar`, l1[1] === l0[2] && l1[2] === l0[1] && await sigue());
  await p.locator(`.ent-fila[data-re="${l0[0]}"] button:has-text("✕")`).click();
  await p.waitForTimeout(400);
  const l2 = await ids();
  const baseQ = await enBase();
  ok(`${tag} · ✕ lo quita (también de la base) sin recargar`, !l2.includes(l0[0]) && !baseQ.some(x => x.id === l0[0]) && await sigue());
  await p.locator('#cons-gal-lista .ent-gal button:has-text("+ Añadir")').first().click();
  await p.waitForTimeout(500);
  ok(`${tag} · «+ Añadir» lo pone al final sin recargar`, (await ids()).length === l2.length + 1 && await sigue());

  // 8. Cada columna con su propio scroll (en PC).
  await p.waitForTimeout(1200);   // que termine el desplazamiento suave hacia el recién añadido
  if (tag === 'ancho') {
    const sc = await p.evaluate(async () => {
      window.scrollTo(0, 400);
      await new Promise(r => setTimeout(r, 100));
      const g = document.getElementById('cons-col-gal'), r = document.getElementById('cons-col-rutina'), a = document.getElementById('asi-panel');
      const info = (el) => ({ ov: getComputedStyle(el).overflowY, alto: el.clientHeight, contenido: el.scrollHeight });
      const y0 = window.scrollY;
      const r0 = r.scrollTop;
      g.scrollTop = 600;
      await new Promise(r2 => setTimeout(r2, 100));
      return { gal: info(g), rut: info(r), asi: info(a), galTop: g.scrollTop, rutQuieta: r.scrollTop === r0, mismaPagina: window.scrollY === y0, vh: innerHeight };
    });
    ok(`${tag} · galería, rutina y asistencia con scroll propio`, ['gal', 'rut', 'asi'].every(k => sc[k].ov === 'auto' && sc[k].alto <= sc.vh) && sc.gal.contenido > sc.gal.alto, JSON.stringify(sc));
    ok(`${tag} · bajar la galería no mueve la rutina ni la página`, sc.galTop > 0 && sc.rutQuieta && sc.mismaPagina, JSON.stringify(sc));
    await p.screenshot({ path: path.join(CAPTURAS, 'constructor-ancho.png') });
  } else {
    ok(`${tag} · sin scroll de lado`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.screenshot({ path: path.join(CAPTURAS, 'constructor-telefono.png'), fullPage: false });
  }

  ok(`${tag} · sin errores de JavaScript`, a.errores.length === 0, a.errores.join(' | '));
  await a.ctx.close();
}

await b.close();
servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
