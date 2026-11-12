// Mensajes enviados: registro de todo lo enviado; retirar de su app, editar y deshacer registro.
// medidas cada 30 días, el peso de su recordatorio de la semana, un video si
// empezó ciclo nuevo o lleva 6 semanas sin mandar) y en qué va cada cosa:
// Toca pedir → Pedido → Entregado. «Ya lo pedí» y «Ya lo entregó» se guardan
// en pedidos_cliente; lo que llega por la app se marca solo.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/pendientes-pedir.mjs
//
//   TAILWIND_CSS=/ruta/tailwind.css node pruebas/toques.mjs
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

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const HOY = iso(new Date());
const mas = (f, n) => { const [y, m, d] = f.split('-').map(Number); const x = new Date(y, m - 1, d); x.setDate(x.getDate() + n); return iso(x); };
const LETRA = (f) => ['L', 'M', 'X', 'J', 'V', 'S', 'D'][(new Date(f + 'T12:00:00').getDay() + 6) % 7];


// (Base: la de toques.mjs.) Cinco clientes, cada uno con un caso:
//   Ana (c0): dejó una nota al terminar; hoy le mandaste el seguimiento y le
//     respondiste → verde, y es UN toque (un día), no dos.
//   Carlos (c1): te escribió ayer en la app y no le respondiste → rojo, le debes respuesta.
//   Lucía (c2): su último toque fue hace 20 días → rojo, frío.
//   Sofía (c5): todo al día → «Nada pendiente».
//   Marta (c4): seguimiento hace 10 días → amarillo, enfriándose.
//   Sofía (c5): seguimiento 4 días seguidos → amarillo, mucho.
function tablasBase() {
  const cli = (id, nombre, tel, extra = {}) => ({ id, user_id: 'coach-1', nombre, estado: 'activo', fecha_inicio: mas(HOY, -100), telefono: tel, created_at: '2026-01-01T00:00:00Z', ...extra });
  const clientes = [
    cli('c0', 'Ana Pérez', '+57 300 000 0001', { mealtracker_id: '11111111-1111-1111-1111-111111111111' }),
    cli('c1', 'Carlos Ruiz', '+57 300 000 0002'),
    cli('c2', 'Lucía Gómez', '+57 300 000 0003'),
    cli('c4', 'Marta Díaz', '+57 300 000 0004'),
    cli('c5', 'Sofía Mora', '+57 300 000 0005'),
    cli('c3', 'Pedro Viejo', '+57 300 000 0006', { estado: 'inactivo' }),
  ];
  const msj = (id, c, f) => ({ id, user_id: 'coach-1', cliente_id: c, fecha: f, created_at: f + 'T00:01:00Z', origen: 'seguimiento', titulo: 'Seguimiento', texto: 'Hola' });
  return {
    clientes,
    sesiones: [
      { id: 's0', cliente_id: 'c0', rutina_id: 'r1', fecha: HOY, estado: 'completada', origen: 'cliente', notas_cliente: 'Hoy me sentí con mucha energía' },
      { id: 's1', cliente_id: 'c4', rutina_id: 'r1', fecha: HOY, estado: 'completada', origen: 'cliente' },
    ],
    rutinas: [{ id: 'r1', nombre: 'Tren superior' }], fases: [],
    notas_entreno: [{ id: 'n1', cliente_id: 'c1', fecha: mas(HOY, -1), created_at: mas(HOY, -1) + 'T10:00:00Z', texto: 'Me duele la rodilla', leida_en: null }],
    respuestas_coach: [{ id: 'r0', cliente_id: 'c0', created_at: HOY + 'T12:00:00Z', texto: 'Bien' }],
    comentarios_coach: [], videos_tecnica: [], toques_cliente: [], toques_semana: [], notas_cliente: [],
    seguimiento_mensajes: [msj('m1', 'c2', mas(HOY, -20)), msj('m2', 'c4', mas(HOY, -10)), msj('m3', 'c0', HOY), ...[0, 1, 2, 3].map(k => msj('ms' + k, 'c5', mas(HOY, -k)))],
    settings: [{ user_id: 'coach-1', usd_cop_rate: 4000, nombre_coach: 'Mauro', mealtracker_app_url: 'https://mt.prueba', mealtracker_coach_password: 'x' }],
    seguimientos: [], seguimiento_pedidos: [], pagos: [], pendientes: [], mediciones_corporales: [],
    encuesta_app: [], metas_historial: [], ia_uso: [], push_pago_log: [], ausencias: [],
    comunidad_posts: [], comunidad_reacciones: [], comunidad_comentarios: [], comunidad_vistas: [],
  };
}
function tablas() {
  const T = tablasBase();
  T.respuestas_coach = [
    { id: 'rc1', user_id: 'coach-1', cliente_id: 'c0', contexto: 'Al terminar Tren superior', nota: 'Hoy me sentí con mucha energía', texto: 'Bien hecho, la próxima sube 2 kg', created_at: HOY + 'T12:00:00Z', visto_en: null },
  ];
  // Lo mismo, registrado (no debe salir dos veces) y un seguimiento de Marta por WhatsApp.
  T.seguimiento_mensajes = [
    ...T.seguimiento_mensajes,
    { id: 'sg1', user_id: 'coach-1', cliente_id: 'c0', fecha: HOY, created_at: HOY + 'T12:00:01Z', origen: 'nota', titulo: 'Respuesta en su app', texto: 'Sobre tu Tren superior: Bien hecho, la próxima sube 2 kg' },
  ];
  T.capsulas_pedidas = [{ id: 'k1', user_id: 'coach-1', cliente_id: 'c1', capsula_id: 'ent-04-subir-peso', capsula_titulo: 'Cuándo subir el peso', pregunta: '¿en qué ejercicio?', enviada_en: mas(HOY, -1) + 'T10:00:00Z' }];
  return T;
}
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let mal = 0;
const ok = (nombre, c, extra = '') => { if (!c) mal++; console.log(`  ${c ? 'ok ' : 'MAL'}  ${nombre}${c ? '' : '  ' + extra}`); };
{
  console.log('\nmensajes enviados');
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errores = []; p.on('pageerror', e => errores.push(e.message));
  p.on('dialog', d => d.accept());
  await ctx.addInitScript((t) => { window.ABIERTOS = []; window.open = (u) => { window.ABIERTOS.push(String(u)); return null; }; window.TABLAS_FALSAS = t; }, tablas());
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
  await p.waitForTimeout(1500);
  await p.evaluate(() => navigate('bandeja'));
  await p.locator('[data-bdj-historial]').waitFor({ timeout: 15000 });
  if (process.env.FOTO) await p.screenshot({ path: path.join(CAPTURAS, 'bandeja-historial-boton.png'), clip: { x: 0, y: 0, width: 1500, height: 260 } });
  await p.locator('[data-bdj-historial]').click();
  await p.locator('[data-me]').waitFor({ timeout: 15000 });
  const fila = (id) => p.locator(`[data-me-fila="${id}"]`);
  const txt = async (id) => (await fila(id).innerText()).replace(/\s+/g, ' ');
  ok('la respuesta a su app sale UNA vez (no repetida con su registro)', await fila('rc1').count() === 1 && await fila('sg1').count() === 0);
  let t = await txt('rc1');
  ok(`respuesta a su app: canal «Su app», «Aún no lo ve», «Retirar de su app» y «Editar» (${t})`, /Su app/.test(t) && /Aún no lo ve/.test(t) && /Retirar de su app/.test(t) && /Editar/.test(t), t);
  t = await txt('m3');
  ok(`seguimiento de Ana por WhatsApp: «Abrir su chat» y «Deshacer registro» (${t})`, /WhatsApp/.test(t) && /Abrir su chat/.test(t) && /Deshacer registro/.test(t), t);
  t = await txt('k1');
  ok(`la cápsula enviada a Carlos sale con su pregunta (${t})`, /Cápsula con pregunta/.test(t) && /Cuándo subir el peso/.test(t), t);
  if (process.env.FOTO) await p.locator('[data-me]').screenshot({ path: path.join(CAPTURAS, 'mensajes-enviados.png') });
  // Editar.
  await fila('rc1').locator('[data-me-editar]').click();
  await p.locator('[data-me-editar-modal]').waitFor();
  await p.fill('#me-texto', 'Bien hecho, la próxima sube 2,5 kg');
  await p.locator('[data-me-guardar]').click();
  await p.waitForTimeout(1200);
  ok('Editar: le queda corregido', await p.evaluate(() => window.TABLAS_FALSAS.respuestas_coach[0].texto) === 'Bien hecho, la próxima sube 2,5 kg' && /2,5 kg/.test(await txt('rc1')));
  // Retirar.
  await fila('rc1').locator('[data-me-retirar]').click();
  await p.waitForTimeout(1200);
  ok('Retirar: queda marcado y tachado como «Retirado», y su registro no reaparece', !!(await p.evaluate(() => window.TABLAS_FALSAS.respuestas_coach[0].retirado_en)) && /Retirado/.test(await txt('rc1')) && await fila('rc1').locator('del').count() === 1 && await fila('sg1').count() === 0);
  ok('…su registro también queda retirado (no cuenta como toque)', !!(await p.evaluate(() => window.TABLAS_FALSAS.seguimiento_mensajes.find(x => x.id === 'sg1').retirado_en)));
  // Deshacer registro (el seguimiento de hoy de Ana) → deja de contar en Toques.
  const antes = await p.evaluate(async () => { await tqCrudo(true); return tqCalcular(_tq.crudo, fmt.hoy()).filas.find(x => x.c.id === 'c0').tipos.map(x => x[0]); });
  await fila('m3').locator('[data-me-deshacer]').click();
  await p.waitForTimeout(1200);
  const despues = await p.evaluate(async () => { await tqCrudo(true); return tqCalcular(_tq.crudo, fmt.hoy()).filas.find(x => x.c.id === 'c0').tipos.map(x => x[0]); });
  ok(`Deshacer registro: el seguimiento deja de contar como toque (${antes} → ${despues})`, antes.includes('seguimiento') && !despues.includes('seguimiento') && /Registro deshecho/.test(await txt('m3')), JSON.stringify([antes, despues]));
  // Filtro «Su app».
  await p.locator('[data-me-canal-f="app"]').click(); await p.waitForTimeout(600);
  ok('filtro «Su app»: solo lo de su app', await p.locator('[data-me-fila]').evaluateAll(l => l.every(x => x.dataset.meCanal === 'app')) && await fila('rc1').count() === 1);
  if (process.env.FOTO) { await p.locator('[data-me-canal-f="todos"]').click(); await p.waitForTimeout(600); await p.locator('[data-me]').screenshot({ path: path.join(CAPTURAS, 'mensajes-enviados-despues.png') }); }
  ok('sin errores', errores.length === 0, errores.join(' | '));
  await ctx.close();
}
await b.close();
servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
