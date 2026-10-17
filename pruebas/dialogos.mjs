// Diálogos: la galería sale con el nombre como le dice el coach, «Cómo le
// digo» se guarda en el cliente, «Usar» deja rellenar los [huecos], copiar
// avisa si falta alguno, y editar una plantilla se guarda en los ajustes.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/duplicados.mjs
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



for (const [tag, ancho, alto] of [['ancho', 1440, 900], ['telefono', 390, 844]]) {
  console.log(`\n${tag} (${ancho}px)`);
  const a = await abrir(ancho, alto);
  const p = a.p;
  await a.ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await p.evaluate(() => { TABLAS_FALSAS.clientes[0].telefono = '+57 300 123 4567'; TABLAS_FALSAS.settings[0].dialogos = null; });
  await p.evaluate(() => abrirDialogos('c0'));
  await p.waitForSelector('[data-dlg="sal-bienvenida"]', { timeout: 10000 });
  ok(`${tag} · la galería abre en Saludos con el primer nombre del cliente`, /^Hola Ana! Qué bueno/.test(await p.locator('[data-dlg="sal-bienvenida"] .dlg-texto').innerText()));
  ok(`${tag} · tiene todas las categorías`, await p.locator('[data-dlg-cat]').count() >= 9);
  await p.fill('#dlg-trato', 'Anita');
  await p.waitForTimeout(150);
  ok(`${tag} · al escribir cómo le digo, los diálogos cambian al instante`, /^Hola Anita!/.test(await p.locator('[data-dlg="sal-bienvenida"] .dlg-texto').innerText()));
  await p.locator('[data-dlg-guardar-trato]').click();
  await p.waitForTimeout(400);
  ok(`${tag} · «Guardar» lo deja en el cliente`, await p.evaluate(() => TABLAS_FALSAS.clientes[0].trato) === 'Anita');
  // Pedir video: rellenar el hueco y copiar.
  await p.locator('[data-dlg-cat="video"]').click();
  await p.waitForSelector('[data-dlg="vid-uno"]');
  ok(`${tag} · los huecos salen resaltados`, await p.locator('[data-dlg="vid-uno"] mark.dlg-hueco').count() === 1);
  await p.locator('[data-dlg="vid-uno"] [data-dlg-usar]').click();
  const ta = p.locator('[data-dlg-txt="vid-uno"]');
  ok(`${tag} · «Usar» abre el texto con el hueco seleccionado para escribir encima`, await ta.isVisible() && await ta.evaluate(t => t.value.slice(t.selectionStart, t.selectionEnd)) === '[ejercicio]');
  await p.keyboard.type('la sentadilla goblet');
  await p.locator('[data-dlg="vid-uno"] [data-dlg-copiar]').click();
  await p.waitForTimeout(300);
  const copiado = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  ok(`${tag} · copia el texto rellenado, con su nombre`, !copiado || (copiado.startsWith('Hola Anita!') && copiado.includes('video de la sentadilla goblet.') && !copiado.includes('[')), copiado.slice(0, 120));
  ok(`${tag} · tiene botón de WhatsApp porque hay teléfono`, await p.locator('[data-dlg="vid-uno"] [data-dlg-wa]').count() === 1);
  // Editar una plantilla. (El falso no reconoce user_id como llave del upsert
  // y agrega fila; se lee la última, que es la que manda el CRM.)
  await p.locator('[data-dlg="vid-recordar"] button[title^="Cambiar"]').click();
  await p.waitForSelector('#dlg-f-texto');
  await p.fill('#dlg-f-texto', '{nombre}, ¿cómo vas con el video de [ejercicio]?');
  await p.locator('[data-dlg-f-guardar]').click();
  await p.waitForTimeout(500);
  const guardado = await p.evaluate(() => (TABLAS_FALSAS.settings.at(-1).dialogos || {}).editados || {});
  ok(`${tag} · editar una plantilla la guarda para todos los clientes`, guardado['vid-recordar'] === '{nombre}, ¿cómo vas con el video de [ejercicio]?', JSON.stringify(guardado));
  ok(`${tag} · y se ve editada con su nombre`, /^Anita, ¿cómo vas/.test(await p.locator('[data-dlg="vid-recordar"] .dlg-texto').innerText()));
  // Uno propio.
  await p.locator('[data-dlg-nuevo]').click();
  await p.fill('#dlg-f-titulo', 'Felicitar cumpleaños');
  await p.selectOption('#dlg-f-cat', 'propios');
  await p.fill('#dlg-f-texto', '¡Feliz cumpleaños, {nombre}!');
  await p.locator('[data-dlg-f-guardar]').click();
  await p.waitForTimeout(500);
  ok(`${tag} · crear uno propio lo guarda y aparece en «Mis diálogos»`, await p.evaluate(() => (TABLAS_FALSAS.settings.at(-1).dialogos.propios || []).length) === 1 && await p.locator('[data-dlg-cat="propios"]').count() === 1);
  if (tag === 'ancho') { await p.locator('[data-dlg-cat="peso"]').click(); await p.waitForTimeout(200); await p.locator('#modal-content').screenshot({ path: path.join(CAPTURAS, 'dialogos.png') }).catch(() => {}); }
  // El campo en la ficha del cliente.
  await p.evaluate(() => { closeModal(); return editarCliente('c0'); });
  await p.waitForSelector('#cl-trato', { timeout: 10000 });
  ok(`${tag} · la ficha del cliente tiene el campo «Cómo le digo» con lo guardado`, await p.locator('#cl-trato').inputValue() === 'Anita');
  ok(`${tag} · sin errores en la página`, a.errores.length === 0, a.errores.join(' | '));
  await a.ctx.close();
}
await b.close(); servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
