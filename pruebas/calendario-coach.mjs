// El calendario del cliente en el CRM entero (datos de arnes/asistencia-datos.json):
// «+ Cardio o deporte» con el mismo catálogo que usa el cliente (y sus
// variantes de un toque), y «⧉ Copiar este ciclo al siguiente» desde ahí.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/calendario-coach.mjs
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
    eventos: [], evento_registros: [], rutina_movimientos: [],
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
let p;
for (const [tag, ancho, alto] of [['ancho', 1440, 900], ['telefono', 390, 844]]) {
  console.log(`\n${tag} (${ancho}px)`);
  const a = await abrir(ancho, alto);
  p = a.p;
  await p.evaluate(() => verEntrenamientoCliente('c0'));
  await p.waitForSelector('[data-cal-actividad]', { timeout: 15000 });
  await p.evaluate((id) => { if (typeof entVerFase === 'function' && _ent.faseCache?.id !== id) entVerFase(id); }, c18.id);
  await p.waitForTimeout(600);
  ok(`${tag} · el calendario trae «+ Cardio o deporte» y «Copiar este ciclo al siguiente»`, await p.locator('[data-cal-actividad]').count() === 1 && await p.locator('[data-cal-copiar]').count() === 1);
  if (tag === 'ancho') await p.locator('#ent-body .card').first().screenshot({ path: path.join(CAPTURAS, 'calendario-botones-ancho.png') }).catch(() => {});

  // + Cardio o deporte → catálogo del cliente
  await p.locator('[data-cal-actividad]').click();
  await p.waitForSelector('#ev-catalogo [data-ev-act]', { timeout: 5000 });
  const cat = await p.locator('#ev-catalogo [data-ev-act]').count();
  ok(`${tag} · sale el catálogo del cliente (${cat} actividades, por grupos)`, cat === 8 && await p.locator('#ev-catalogo', { hasText: 'Deportes' }).count() === 1 && await p.inputValue('#ev-tipo') === 'actividad');
  await p.locator('#ev-catalogo [data-ev-act="cinta"]').click();
  await p.waitForTimeout(150);
  ok(`${tag} · tocar Caminadora pone el título y ofrece variantes`, await p.inputValue('#ev-titulo') === 'Caminadora' && await p.locator('#ev-catalogo [data-ev-variante]').count() === 2);
  await p.locator('#ev-catalogo [data-ev-variante]', { hasText: 'Caminadora con inclinación' }).click();
  await p.waitForTimeout(150);
  ok(`${tag} · la variante queda como título y Caminadora sigue marcada`, await p.inputValue('#ev-titulo') === 'Caminadora con inclinación' && await p.locator('#ev-catalogo [data-ev-act="cinta"].active').count() === 1);
  if (tag === 'ancho') await p.locator('#modal-content').screenshot({ path: path.join(CAPTURAS, 'calendario-cardio-ancho.png') }).catch(() => {});
  // Se repite martes y jueves en todo el ciclo.
  await p.locator('.ev-dia[value="M"]').check();
  await p.locator('.ev-dia[value="J"]').check();
  await p.fill('#ev-duracion', '15');
  await p.fill('#ev-detalle', 'Al terminar la fuerza, inclinación 8-10');
  await p.locator('button:has-text("Guardar")').last().click();
  await p.waitForTimeout(700);
  const ev = await p.evaluate(() => TABLAS_FALSAS.eventos.at(-1));
  ok(`${tag} · se guarda en el calendario del cliente (martes y jueves, del ciclo)`, ev && ev.tipo === 'actividad' && ev.titulo === 'Caminadora con inclinación' && JSON.stringify(ev.dias_semana) === '["M","J"]' && ev.duracion_min === 15 && ev.cliente_id === 'c0', JSON.stringify(ev));
  // Cuando el cliente lo marca con «Ya lo hice» (actividad ligada al evento), el calendario del CRM lo muestra con ✓.
  await p.evaluate((idEv) => { (TABLAS_FALSAS.actividades = TABLAS_FALSAS.actividades || []).push({ id: 'a-cc', cliente_id: 'c0', user_id: 'coach-1', fecha: '2026-10-06', tipo: 'cinta', evento_id: idEv }); return entVistaClientes(); }, ev.id);
  await p.waitForTimeout(800);
  ok(`${tag} · lo que el cliente marcó sale con ✓ en tu calendario`, await p.locator('#ent-cal .ent-chip-hecho').count() === 1);
  // Deporte de un solo día: Tenis
  await p.locator('[data-cal-actividad]').click();
  await p.waitForSelector('#ev-catalogo [data-ev-act]', { timeout: 5000 });
  await p.locator('#ev-catalogo [data-ev-act="tenis"]').click();
  await p.locator('[data-evmodo="fecha"]').click();
  await p.fill('#ev-fecha', '2026-10-18');
  await p.locator('button:has-text("Guardar")').last().click();
  await p.waitForTimeout(700);
  const t = await p.evaluate(() => TABLAS_FALSAS.eventos.at(-1));
  ok(`${tag} · un deporte de un solo día (Tenis el 18)`, t && t.titulo === 'Tenis' && t.fecha === '2026-10-18', JSON.stringify(t));
  // Copiar este ciclo al siguiente, desde el calendario: trae el cardio.
  await p.locator('[data-cal-copiar]').click();
  await p.waitForSelector('[data-duplicar-ciclo]', { timeout: 8000 });
  await p.waitForTimeout(300);
  const dc = await p.locator('#dc-eventos').innerText();
  ok(`${tag} · copiar el ciclo abre la ventana con sus rutinas y el cardio para copiar`, await p.locator('[data-dc-rutina]').count() >= 1 && /Caminadora con inclinación/.test(dc), dc.slice(0, 200));
  if (tag === 'ancho') await p.locator('#modal-content').screenshot({ path: path.join(CAPTURAS, 'calendario-copiar-ancho.png') }).catch(() => {});
  const ancho_ = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth,
    culpables: [...document.querySelectorAll('body *')].filter(e => {
      if (e.getBoundingClientRect().right <= innerWidth + 1) return false;
      for (let x = e.parentElement; x && x !== document.body; x = x.parentElement) { const o = getComputedStyle(x); if (o.overflowX !== 'visible' || o.position === 'fixed') return false; }
      return getComputedStyle(e).position !== 'fixed';
    }).slice(0, 6).map(e => `${e.tagName}.${String(e.className).slice(0, 50)}#${e.id} ${Math.round(e.getBoundingClientRect().right)}`) }));
  ok(`${tag} · sin scroll de lado`, ancho_.sw <= ancho_.w + 1, JSON.stringify(ancho_));
  // Refrescar la página: se queda en el calendario de este cliente.
  await p.evaluate(() => closeModal());
  await p.evaluate(() => window.scrollTo(0, 300));
  await p.waitForTimeout(200);
  if (process.env.DBG) console.log('ANTES', await p.evaluate(() => JSON.stringify({ s: sessionStorage.getItem('crm:vista'), v: document.querySelector('.nav-item.active')?.dataset.view })));
  await p.reload();
  if (process.env.DBG) { await p.waitForTimeout(3000); console.log('DESPUES', await p.evaluate(() => JSON.stringify({ s: sessionStorage.getItem('crm:vista'), v: document.querySelector('.nav-item.active')?.dataset.view }))); }
  await p.locator('#app-screen').waitFor({ state: 'visible', timeout: 20000 });
  await p.waitForSelector('[data-cal-actividad]', { timeout: 15000 }).catch(() => {});
  const tras = await p.evaluate(() => ({ vista: document.querySelector('.nav-item.active')?.dataset.view, cli: _ent.clienteId, tab: _ent.tab, cal: !!document.querySelector('[data-cal-actividad]'), y: Math.round(scrollY) }));
  ok(`${tag} · al refrescar se queda en Entrenamiento, en el calendario del mismo cliente`, tras.vista === 'entrenamiento' && tras.cli === 'c0' && tras.tab === 'clientes' && tras.cal, JSON.stringify(tras));
  ok(`${tag} · sin errores de JavaScript`, a.errores.length === 0, a.errores.join(' | '));
  await a.ctx.close();
}

await b.close();
servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
