// «Dar más días» en Pagos → En su app: el estado de cada cliente (bloqueada,
// prórroga, aviso «día X de 8»), la ventana con +3/+5/+7 contados desde hoy,
// guardar la fecha y quitarla. La regla de bloqueo vive en la app (su prueba
// es mealtracker/pruebas/pago-prorroga-api.mjs); aquí la app es de mentira.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/dar-dias.mjs
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
    clientes: [cliente,
      { ...cliente, id: 'c1', nombre: 'Bruno Díaz', dia_pago: 15 },
      { ...cliente, id: 'c2', nombre: 'Carla Ruiz', dia_pago: 20, prorroga_hasta: '2026-10-30' }],
    seguimientos, pagos: [], pendientes: [], mediciones_corporales: [],
    settings: [{ user_id: 'coach-1', usd_cop_rate: 4000, nombre_coach: 'Mauro', mealtracker_app_url: 'https://app.test' }],
    metas_historial: [], nutricion_insights: [], ia_uso: [], push_pago_log: [],
    fases: fixture.fases, rutinas: fixture.rutinas, rutina_ejercicios: re, rutina_bloques: fixture.rutina_bloques,
    sesiones: fixture.sesiones, series_log: sl, ejercicios: fixture.ejercicios, trainerize_resumen: fixture.trainerize_resumen,
    comunidad_posts: [], comunidad_reacciones: [], comunidad_comentarios: [], comunidad_vistas: [],
  };
}

// Lo que respondería la app (api/_pagos.js) para cada cliente.
const ESTADOS = {
  'Ana Pérez': { due: true, meses_deuda: 1, meses: ['2026-10'], dias_vencido: 13, dias_gracia: 8, bloqueo: true, visto: null },
  'Bruno Díaz': { due: true, meses_deuda: 1, meses: ['2026-10'], dias_vencido: 3, dias_gracia: 8, bloqueo: false, visto: '2026-10-22T10:00:00Z' },
  'Carla Ruiz': { due: true, meses_deuda: 1, meses: ['2026-10'], dias_vencido: 11, dias_gracia: 8, bloqueo: false, prorroga_hasta: '2026-10-30', visto: null },
};
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
    if (u.startsWith('https://app.test/api/payment-status')) return ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ clientes: ESTADOS }) });
    if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return ruta.continue().catch(() => ruta.abort());
    return ruta.fulfill({ status: 200, contentType: 'application/json', body: u.includes('/rest/v1/') ? '[]' : '{}' });
  });
  await p.goto(BASE + '/');
  await p.locator('#app-screen').waitFor({ state: 'visible', timeout: 20000 });
  await p.waitForTimeout(800);
  return { ctx, p, errores };
}




const ymd = (n) => { const d = new Date(); const f = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`; };
for (const [ancho, alto, nombre] of [[1500, 900, 'pc'], [390, 844, 'telefono']]) {
  const { ctx, p, errores } = await abrir(ancho, alto);
  await p.evaluate(() => navigate('pagos'));
  await p.waitForSelector('.dar-dias-btn', { timeout: 15000 }); await p.waitForTimeout(600);
  // En el teléfono Pagos va en tarjetas: el aviso y el botón van dentro de cada una.
  const fila = (n) => nombre === 'telefono' ? p.locator('.card', { hasText: n }).filter({ has: p.locator('[data-aviso-app-tarjeta]') }).first() : p.locator('tr', { hasText: n }).first();
  const celda = async (n) => nombre === 'telefono' ? fila(n).locator('[data-aviso-app-tarjeta]').innerText() : fila(n).locator('td').nth(3).innerText();
  const ana = await celda('Ana Pérez'), bruno = await celda('Bruno Díaz'), carla = await celda('Carla Ruiz');
  ok(`${nombre}: bloqueada se ve «App bloqueada · 13 días» y sin emoji`, /App bloqueada · 13 días/.test(ana) && !/🔒/.test(ana), ana);
  ok(`${nombre}: aviso cuenta sobre 8 («día 3 de 8»)`, /aviso · día 3 de 8/.test(bruno), bruno);
  ok(`${nombre}: con prórroga se ve «Prórroga hasta 30 oct»`, /Prórroga hasta 30 oct/.test(carla) && /Cambiar días/.test(carla), carla);
  ok(`${nombre}: cada cliente con aviso trae su botón`, (await p.locator('.dar-dias-btn').count()) === 3);
  await fila('Ana Pérez').screenshot({ path: path.join(CAPTURAS, `dar-dias-fila-${nombre}.png`) }).catch(() => {});
  await p.screenshot({ path: path.join(CAPTURAS, `dar-dias-tabla-${nombre}.png`) });
  // Dar +5 a la bloqueada
  await fila('Ana Pérez').locator('.dar-dias-btn').click();
  await p.waitForSelector('.dar-dias-op'); await p.waitForTimeout(300);
  const ops = await p.locator('.dar-dias-op').allInnerTexts();
  ok(`${nombre}: la ventana ofrece +3, +5 y +7 con su fecha`, ops.length === 3 && /\+3 días/.test(ops[0]) && /\+5 días/.test(ops[1]) && /\+7 días/.test(ops[2]) && /hasta el/.test(ops[1]), JSON.stringify(ops));
  ok(`${nombre}: la ventana explica que el aviso sigue`, /Sigue viendo el aviso de pago pendiente/.test(await p.locator('#modal').innerText()));
  await p.screenshot({ path: path.join(CAPTURAS, `dar-dias-ventana-${nombre}.png`) });
  await p.locator('.dar-dias-op').nth(1).click(); await p.waitForTimeout(700);
  const guardada = await p.evaluate(() => TABLAS_FALSAS.clientes.find(c => c.id === 'c0'));
  ok(`${nombre}: guarda prorroga_hasta = hoy + 5`, guardada.prorroga_hasta === ymd(5), JSON.stringify(guardada.prorroga_hasta));
  ok(`${nombre}: la ventana se cierra y vuelve a preguntarle a la app`, await p.locator('#modal').evaluate(m => m.classList.contains('hidden')));
  // Quitar la prórroga de Carla
  await fila('Carla Ruiz').locator('.dar-dias-btn').click();
  await p.waitForSelector('.dar-dias-quitar'); await p.locator('.dar-dias-quitar').click(); await p.waitForTimeout(600);
  ok(`${nombre}: «Quitar la prórroga» la deja vacía (sin borrar al cliente)`, await p.evaluate(() => { const c = TABLAS_FALSAS.clientes.find(x => x.id === 'c2'); return c && c.prorroga_hasta === null && TABLAS_FALSAS.clientes.length === 3; }));
  ok(`${nombre}: la página no se desborda a lo ancho`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  ok(`${nombre}: sin errores de JavaScript`, errores.length === 0, errores.join(' | '));
  await ctx.close();
  // Restaurar para la siguiente pasada
  fixture.__x = 0;
}
await b.close(); servidor.close();
console.log(mal ? `\n${mal} falla(s)` : '\ntodo bien');
process.exit(mal ? 1 : 0);
