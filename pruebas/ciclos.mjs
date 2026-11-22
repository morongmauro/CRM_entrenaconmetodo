// Ciclos: cuándo empieza y termina el de cada cliente, y el aviso cuando
// vence (pestaña «Ciclos» de Entrenamiento y aviso en Inicio).
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/ciclos.mjs
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


const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// Una fase de `semanas` semanas que termina dentro de `terminaEn` días.
const fase = (id, cli, nombre, terminaEn, semanas, enviada) => ({ id, cliente_id: cli, user_id: 'coach-1', nombre, semanas, estado: enviada ? 'activa' : 'borrador',
  visible_cliente: enviada, fecha_inicio: iso(terminaEn - semanas * 7 + 1), orden: 1, created_at: '2026-01-01T00:00:00Z' });
function tablas() {
  const nombres = ['Ana Pérez', 'Beto Ruiz', 'Carla Gómez', 'Dani Mejía', 'Eva Ríos', 'Fede Salas', 'Gabi Duarte'];
  const clientes = nombres.map((nombre, i) => ({ id: 'c' + i, user_id: 'coach-1', nombre, estado: 'activo', monto: 1, moneda: 'COP', dia_pago: 5, created_at: '2026-01-01T00:00:00Z' }));
  clientes.push({ id: 'c9', user_id: 'coach-1', nombre: 'Inés Pausa', estado: 'pausa', monto: 1, moneda: 'COP', dia_pago: 5, created_at: '2026-01-01T00:00:00Z' });
  const fases = [
    fase('f0', 'c0', 'Cycle 3', 2, 4, true),                       // termina en 2 días, sin siguiente → rojo
    fase('f1', 'c1', 'Ciclo 5', 5, 5, true),                       // en 5 días, sin siguiente → ámbar
    fase('f2', 'c2', 'Ciclo 2', 20, 4, false),                     // el que va no está enviado → rojo
    fase('f3', 'c3', 'Ciclo 8', 20, 5, true), fase('f3b', 'c3', 'Ciclo 9', 55, 5, true),   // al día
    fase('f4', 'c4', 'Ciclo 1', -3, 4, true),                      // terminó hace 3 días → rojo
    fase('f6', 'c6', 'Ciclo 4', 4, 4, true), fase('f6b', 'c6', 'Ciclo 5', 39, 5, false),   // el siguiente arranca en 5 días sin enviar → ámbar
    fase('f9', 'c9', 'Ciclo 1', -40, 4, true),                     // en pausa: no cuenta
    fase('f1p', 'c1', 'Ciclo 4', -30, 5, true),                    // el anterior de Beto: mismas rutinas que el que va
  ];
  // Rutinas: Beto repite el ciclo anterior tal cual; Dani tiene el que sigue con una rutina vacía.
  const rut = (id, fid, cli, nombre) => ({ id, fase_id: fid, cliente_id: cli, user_id: 'coach-1', nombre, dia_orden: 1 });
  const rutinas = [rut('r1p', 'f1p', 'c1', 'Día A'), rut('r1', 'f1', 'c1', 'Día A'), rut('r1pb', 'f1p', 'c1', 'Día B'), rut('r1b', 'f1', 'c1', 'Día B'), rut('r3', 'f3', 'c3', 'Día A'), rut('r3b', 'f3b', 'c3', 'Día B')];
  const re = (id, r, e) => ({ id, rutina_id: r, ejercicio_id: e, user_id: 'coach-1', orden: 1 });
  const rutina_ejercicios = [re('x1', 'r1p', 'e1'), re('x2', 'r1p', 'e2'), re('x3', 'r1', 'e2'), re('x4', 'r1', 'e1'), re('x5', 'r3', 'e1'), re('x6', 'r3', 'e3'), re('x7', 'r1pb', 'e4'), re('x8', 'r1b', 'e3')];
  return { clientes, fases, seguimientos: [], pagos: [], pendientes: [], mediciones_corporales: [], settings: [{ user_id: 'coach-1', usd_cop_rate: 4000, nombre_coach: 'Mauro' }],
    metas_historial: [], nutricion_insights: [], ia_uso: [], push_pago_log: [], rutinas, rutina_ejercicios, sesiones: [], series_log: [], ejercicios: [],
    comunidad_posts: [], comunidad_reacciones: [], comunidad_comentarios: [], comunidad_vistas: [] };
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


for (const [tag, ancho, alto] of [['ancho', 1440, 1000], ['telefono', 390, 844]]) {
  console.log(`\n${tag} (${ancho}px)`);
  const { ctx, p, errores } = await abrir(ancho, alto);

  // Inicio: el aviso (en el teléfono el CRM abre en Seguimiento: se va a Inicio)
  if (tag === 'telefono') await p.evaluate(() => navigate('dashboard'));
  await p.waitForSelector('#cic-aviso-inicio [data-aviso-ciclos]', { timeout: 8000 }).catch(() => {});
  const av = await p.locator('#cic-aviso-inicio').innerText().catch(() => '');
  ok(`${tag} · Inicio: avisa que 5 ciclos necesitan atención`, /5 ciclos necesitan tu atención/.test(av), av);

  // Entrenamiento → el aviso arriba, y al tocarlo la pestaña Ciclos
  await p.evaluate(() => { _ent.tab = 'ejercicios'; return navigate('entrenamiento'); });
  await p.waitForSelector('#cic-aviso [data-aviso-ciclos]', { timeout: 8000 }).catch(() => {});
  ok(`${tag} · Entrenamiento: el aviso también sale arriba`, (await p.locator('#cic-aviso [data-aviso-ciclos]').count()) === 1);
  await p.locator('#cic-aviso [data-aviso-ciclos]').click();
  await p.waitForSelector('[data-lista-ciclos] [data-ciclo-cliente]', { timeout: 8000 }).catch(() => {});
  const filas = await p.evaluate(() => [...document.querySelectorAll('[data-ciclo-cliente]')].map(b => [b.dataset.cicloCliente, b.dataset.tono, b.innerText.replace(/\s+/g, ' ')]));
  const tono = Object.fromEntries(filas.map(f => [f[0], f[1]]));
  const txt = Object.fromEntries(filas.map(f => [f[0], f[2]]));
  ok(`${tag} · Ciclos: solo clientes activos (7)`, filas.length === 7, JSON.stringify(filas.map(f => f[0])));
  ok(`${tag} · termina en 2 días sin siguiente → actuar ya`, tono.c0 === 'rojo' && /Termina en 2 días y no hay ciclo siguiente/.test(txt.c0), txt.c0);
  ok(`${tag} · termina en 5 días sin siguiente → esta semana`, tono.c1 === 'ambar' && /en 5 días/.test(txt.c1), txt.c1);
  ok(`${tag} · el que va no está enviado → actuar ya`, tono.c2 === 'rojo' && /no está enviado/.test(txt.c2), txt.c2);
  ok(`${tag} · con el siguiente ya enviado → al día`, tono.c3 === 'ok' && /Ciclo 9/.test(txt.c3), txt.c3);
  ok(`${tag} · terminó hace 3 días sin uno nuevo → actuar ya`, tono.c4 === 'rojo' && /hace 3 días/.test(txt.c4), txt.c4);
  ok(`${tag} · sin ciclos → gris`, tono.c5 === 'gris', txt.c5);
  ok(`${tag} · el siguiente arranca pronto sin enviar → esta semana`, tono.c6 === 'ambar' && /no está enviado/.test(txt.c6), txt.c6);
  ok(`${tag} · «Cycle» se lee «Ciclo» y salen las fechas y la semana`, /Ciclo 3 · .* → .* · semana 4 de 4/.test(txt.c0), txt.c0);
  ok(`${tag} · los urgentes van primero`, filas.slice(0, 3).every(f => f[1] === 'rojo'), JSON.stringify(filas.map(f => f[1])));
  ok(`${tag} · cada uno con su línea de tiempo`, (await p.locator('[data-linea-ciclo]').count()) === 7);
  const caja = async (sel) => (await p.locator(`[data-resumen-ciclos] ${sel}`).innerText().catch(() => '')).replace(/\s+/g, ' ');
  const pv = await caja('[data-por-vencer]'), ve = await caja('[data-vencidos]'), ig = await caja('[data-ciclo-igual]'), va = await caja('[data-rutinas-vacias]');
  ok(`${tag} · Por vencer: Ana (2 días) y Beto (5 días), y Carla/Fede si terminan en 7 o menos`, /Ana Pérez/.test(pv) && /Beto Ruiz/.test(pv) && /en 2 días · sin el que sigue/.test(pv), pv);
  ok(`${tag} · Ya vencieron: Eva, hace 3 días`, /Eva Ríos/.test(ve) && /hace 3 días/.test(ve) && !/Ana Pérez/.test(ve), ve);
  ok(`${tag} · Rutinas sin cambio: Beto, 1 de 2 en Ciclo 5; no Dani`, /Beto Ruiz/.test(ig) && /1 de 2 en Ciclo 5/.test(ig) && !/Dani/.test(ig), ig);
  ok(`${tag} · Rutinas vacías: Dani, 1 vacía en el que sigue (Beto no)`, /Dani Mejía/.test(va) && /1 vacía en el que sigue/.test(va) && !/Beto/.test(va), va);
  const chipsBeto = await p.locator('[data-ciclo-cliente="c1"] [data-rutinas-ciclo]').first().innerText().catch(() => '');
  ok(`${tag} · en la fila de Beto: «Sin cambio (1)» con Día A y sus 2 ejercicios, comparado con Ciclo 4`, /comparadas con Ciclo 4/.test(chipsBeto) && /Sin cambio \(1\) ?Día A · 2 ej\./.test(chipsBeto.replace(/\s+/g, ' ')) && /Cambiaron \(1\) ?Día B · 1 ej\./.test(chipsBeto.replace(/\s+/g, ' ')), chipsBeto);
  const chipsDani = (await p.locator('[data-ciclo-cliente="c3"]').innerText()).replace(/\s+/g, ' ');
  ok(`${tag} · en la fila de Dani: la del que sigue sale en «Vacías» y la que va en «Cambiaron»… o «Rutinas»`, /Rutinas del que sigue \(comparadas con Ciclo 8\) Vacías \(1\) Día B/.test(chipsDani), chipsDani);
  if (tag === 'telefono') ok(`${tag} · sin scroll de lado`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await p.screenshot({ path: path.join(CAPTURAS, `ciclos-${tag}.png`), fullPage: true });
  // Tocar uno abre su entrenamiento
  await p.locator('[data-ciclo-cliente="c0"]').click();
  await p.waitForTimeout(800);
  ok(`${tag} · tocar un cliente abre su entrenamiento`, await p.evaluate(() => _ent.tab === 'clientes' && _ent.clienteId === 'c0'));
  ok(`${tag} · sin errores de JavaScript`, errores.length === 0, errores.join(' | '));
  await ctx.close();
}

await b.close();
servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
