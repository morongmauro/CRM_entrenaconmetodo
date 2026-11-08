// Toques → «Pendientes por pedir»: qué toca pedirle a cada cliente (fotos y
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
const LUNES = (() => { const [y, m, d] = HOY.split('-').map(Number); const x = new Date(y, m - 1, d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x); })();
// Los casos (fotos, peso y medidas: SOLO si su app ya le mostró el
// recordatorio y lleva 1 semana o más sin hacerlo):
//   Ana (c0): recordatorio de fotos hace 12 días, no las subió → toca pedir;
//     medición recordada el lunes y hecha → entregada por la app.
//   Carlos (c1): videos de Press banca y Remo pedidos hace 9 días → «Recordar»;
//     cada uno con su «Ya lo entregó»; con los dos entregados → «Todos enviados»;
//     recordatorio de fotos hace 3 días (aún dentro de la semana) → nada;
//     medidas recordadas hace 8 días sin hacer → toca pedir.
//   Lucía (c2): ciclo nuevo sin video → toca; peso de los lunes sin registrar
//     3 semanas → toca; fotos recordadas hace 10 días que ya le pediste hace 3 → pedido;
//     medidas recordadas hace 9 días que marcaste tú esta semana → entregado.
//   Sofía (c5): sin recordatorios y con video reciente → «Nada pendiente».
//   Marta (c4): peso de los lunes registrado → entregado; fotos del lunes subidas → entregado.
function tablas() {
  const T = tablasBase();
  const ev = (id, c, tipo, extra) => ({ id, cliente_id: c, fase_id: null, tipo, titulo: tipo, visible_cliente: true, ...extra });
  T.fotos_progreso = [
    { id: 'f0', cliente_id: 'c0', fecha: mas(HOY, -40), pose: 'frente' },
    { id: 'f4', cliente_id: 'c4', fecha: LUNES, pose: 'frente' },
  ];
  T.mediciones_corporales = [
    { id: 'm0', cliente_id: 'c0', fecha: LUNES, peso: 60 },
    { id: 'm2', cliente_id: 'c2', fecha: mas(HOY, -50), peso: 70 },
  ];
  T.fases = [
    { id: 'fa2', cliente_id: 'c2', nombre: 'Ciclo 2', fecha_inicio: mas(LUNES, -14), semanas: 5, estado: 'activa', visible_cliente: true, orden: 2 },
    { id: 'fa4', cliente_id: 'c4', nombre: 'Ciclo 4', fecha_inicio: mas(LUNES, -56), semanas: 12, estado: 'activa', visible_cliente: true, orden: 1 },
    // Ana y Sofía, en la última semana de su ciclo (Ana ya vio el aviso; Sofía no).
    { id: 'fa0', cliente_id: 'c0', nombre: 'Ciclo 6', fecha_inicio: mas(LUNES, -28), semanas: 5, estado: 'activa', visible_cliente: true, orden: 1 },
    { id: 'fa5', cliente_id: 'c5', nombre: 'Ciclo 3', fecha_inicio: mas(LUNES, -28), semanas: 5, estado: 'activa', visible_cliente: true, orden: 1 },
  ];
  T.eventos = [
    ev('e0f', 'c0', 'fotos', { fecha: mas(HOY, -12) }),
    ev('e0m', 'c0', 'medidas', { fecha: LUNES }),
    ev('e1f', 'c1', 'fotos', { fecha: mas(HOY, -3) }),
    ev('e1m', 'c1', 'medidas', { fecha: mas(HOY, -8) }),
    ev('e2p', 'c2', 'peso', { fase_id: 'fa2', dias_semana: ['L'] }),
    ev('e2f', 'c2', 'fotos', { fecha: mas(HOY, -10) }),
    ev('e2m', 'c2', 'medidas', { fecha: mas(HOY, -9) }),
    ev('e4p', 'c4', 'peso', { fase_id: 'fa4', dias_semana: ['L'] }),
    ev('e4f', 'c4', 'fotos', { fecha: LUNES }),
  ];
  T.evento_registros = [mas(LUNES, -14), mas(LUNES, -7), LUNES].map((f, i) => ({ id: 'g' + i, cliente_id: 'c4', evento_id: 'e4p', fecha: f, estado: 'hecho' }));
  T.videos_tecnica = [
    { id: 'v1', cliente_id: 'c1', ejercicio_id: 'x1', ejercicio_nombre: 'Press banca', estado: 'pedido', pedido_en: mas(HOY, -9), revisado_en: null, created_at: mas(HOY, -9) + 'T10:00:00Z' },
    { id: 'v1b', cliente_id: 'c1', ejercicio_id: 'x3', ejercicio_nombre: 'Remo con barra', estado: 'pedido', pedido_en: mas(HOY, -9), revisado_en: null, created_at: mas(HOY, -9) + 'T10:05:00Z' },
    { id: 'v0', cliente_id: 'c0', ejercicio_id: 'x2', ejercicio_nombre: 'Sentadilla', estado: 'bien', pedido_en: mas(HOY, -10), revisado_en: mas(HOY, -8) + 'T10:00:00Z', created_at: mas(HOY, -10) + 'T10:00:00Z' },
    { id: 'v4', cliente_id: 'c4', ejercicio_id: 'x2', ejercicio_nombre: 'Sentadilla', estado: 'bien', pedido_en: mas(HOY, -20), revisado_en: mas(HOY, -19) + 'T10:00:00Z', created_at: mas(HOY, -20) + 'T10:00:00Z' },
    { id: 'v5', cliente_id: 'c5', ejercicio_id: 'x2', ejercicio_nombre: 'Sentadilla', estado: 'bien', pedido_en: mas(HOY, -20), revisado_en: mas(HOY, -19) + 'T10:00:00Z', created_at: mas(HOY, -20) + 'T10:00:00Z' },
  ];
  T.pedidos_cliente = [
    { id: 'p1', user_id: 'coach-1', cliente_id: 'c2', tipo: 'fotos', pedido_en: mas(HOY, -3) + 'T10:00:00Z', entregado_en: null },
    { id: 'p2', user_id: 'coach-1', cliente_id: 'c2', tipo: 'medidas', pedido_en: LUNES + 'T09:00:00Z', entregado_en: LUNES + 'T18:00:00Z', entregado_por: 'coach' },
  ];
  return T;
}
function app(accion) {
  if (accion === 'uso') return { ok: true, uso: [{ clave: '11111111-1111-1111-1111-111111111111', user_id: '11111111-1111-1111-1111-111111111111', name: 'Ana Pérez', fecha: LUNES, secciones: { dash: 1, aviso_ciclo: 'fa0' } }] };
  const dias = (n, salto = 0) => Object.fromEntries(Array.from({ length: n }, (_, k) => [mas(HOY, -k - salto), 0.9]));
  const rd = (n) => Object.fromEntries(Array.from({ length: n }, (_, k) => [mas(HOY, -k), { kcal: 1900, protein: 130 }]));
  if (accion === 'list') return { clients: [
    { user_id: '11111111-1111-1111-1111-111111111111', name: 'Ana Pérez', last_active: HOY, day_scores: dias(26), recent_days: rd(7), recetas_registradas: [], menus_creados: 0, favoritos: 0 },
    { user_id: '22222222-2222-2222-2222-222222222222', name: 'Lucía Gómez', last_active: HOY, day_scores: dias(20), recent_days: rd(7), recetas_registradas: [], menus_creados: 0, favoritos: 0 },
    { user_id: '44444444-4444-4444-4444-444444444444', name: 'Marta Díaz', last_active: HOY, day_scores: dias(26), recent_days: rd(7), recetas_registradas: [], menus_creados: 0, favoritos: 0 },
    { user_id: '33333333-3333-3333-3333-333333333333', name: 'Carlos Ruiz', last_active: mas(HOY, -6), day_scores: {}, recent_days: {}, recetas_registradas: [], menus_creados: 0, favoritos: 0 },
  ] };
  return { ok: true, uso: [] };
}
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let mal = 0;
const enviados = [];
const ok = (nombre, c, extra = '') => { if (!c) mal++; console.log(`  ${c ? 'ok ' : 'MAL'}  ${nombre}${c ? '' : '  ' + extra}`); };

async function abrir(ancho, alto, prueba = true) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(e.message));
  await ctx.addInitScript(([t, on]) => { window.ABIERTOS = []; window.open = (u) => { window.ABIERTOS.push(String(u)); return null; }; window.TABLAS_FALSAS = t; if (on) localStorage.setItem('crm:prueba', '1'); }, [tablas(), prueba]);
  await p.route('**/*', (ruta) => {
    const u = ruta.request().url();
    if (u.startsWith(BASE)) return ruta.continue();
    if (u.includes('cdn.tailwindcss.com')) return ruta.fulfill({ contentType: 'text/javascript', body: `(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(tailwind)};document.head.prepend(s);window.tailwind={config:{}};})();` });
    if (u.includes('supabase-js')) return ruta.fulfill({ contentType: 'text/javascript', body: falso });
    if (u.startsWith('https://mt.prueba/api/coach-auth')) return ruta.fulfill({ contentType: 'application/json', body: JSON.stringify({ token: 't', expiresAt: Date.now() + 3600e3 }) });
    if (u.startsWith('https://mt.prueba/api/coach-data')) {
      const acc = new URL(u).searchParams.get('action');
      if (acc === 'reminders') {
        if (ruta.request().method() === 'PATCH') { enviados.push(JSON.parse(ruta.request().postData() || '{}')); return ruta.fulfill({ contentType: 'application/json', body: '{"ok":true}' }); }
        return ruta.fulfill({ contentType: 'application/json', body: JSON.stringify({ reminders: [] }) });
      }
      return ruta.fulfill({ contentType: 'application/json', body: JSON.stringify(app(acc)) });
    }
    if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return ruta.continue().catch(() => ruta.abort());
    return ruta.fulfill({ status: 200, contentType: 'application/json', body: u.includes('/rest/v1/') ? '[]' : '{}' });
  });
  await p.goto(BASE + '/');
  await p.locator('#app-screen').waitFor({ state: 'visible', timeout: 20000 });
  await p.waitForTimeout(800);
  return { ctx, p, errores };
}




const celda = (p, id) => p.locator(`tr[data-tq-cliente="${id}"] [data-tq="pendientes"]`);
const item = async (p, id, tipo) => { const l = celda(p, id).locator(`[data-pp="${tipo}"]`); return (await l.count()) ? { estado: await l.getAttribute('data-pp-estado'), texto: (await l.innerText()).replace(/\s+/g, ' ') } : null; };
{
  console.log('\npendientes por pedir');
  const { ctx, p, errores } = await abrir(1600, 1000, false);
  await p.evaluate(() => navigate('toques'));
  await p.locator('[data-tq-tabla]').waitFor({ timeout: 15000 });
  await p.waitForTimeout(800);
  ok('la tabla trae la columna «Pendientes por pedir»', /Pendientes\s*por pedir/.test(await p.locator('[data-tq-tabla] thead').innerText()));
  let x = await item(p, 'c0', 'fotos');
  ok('Ana: su app le recordó las fotos hace 12 días y no las subió → toca pedir', x && x.estado === 'toca' && /hace 12 días|lleva 12 días/.test(x.texto) && /Pedir/.test(x.texto) && /Ya lo pedí/.test(x.texto), JSON.stringify(x));
  x = await item(p, 'c0', 'medidas');
  ok('Ana: medición recordada el lunes y hecha → entregada por la app', x && x.estado === 'entregado' && /llegó por la app/.test(x.texto), JSON.stringify(x));
  x = await item(p, 'c1', 'video');
  ok('Carlos: en la fila solo el resumen: «Recordar · Pedí 2 · falta Press banca y 1 más · pedido hace 9 días» y «Ver videos»', x && x.estado === 'recordar' && /Pedí 2/.test(x.texto) && /falta Press banca y 1 más/.test(x.texto) && /hace 9 días/.test(x.texto) && /Ver videos/.test(x.texto) && await celda(p, 'c1').locator('[data-pp-entrego-ej]').count() === 0, JSON.stringify(x));
  ok('Carlos: fotos recordadas hace 3 días (aún en su semana) → no sale', (await item(p, 'c1', 'fotos')) === null, JSON.stringify(await item(p, 'c1', 'fotos')));
  x = await item(p, 'c1', 'medidas');
  ok('Carlos: medidas recordadas hace 8 días sin hacer → toca pedir', x && x.estado === 'toca' && /8 días/.test(x.texto), JSON.stringify(x));
  x = await item(p, 'c2', 'video');
  ok('Lucía: ciclo nuevo sin video → toca pedir', x && x.estado === 'toca' && /ciclo nuevo/i.test(x.texto), JSON.stringify(x));
  x = await item(p, 'c2', 'peso');
  ok('Lucía: peso de los lunes sin registrar → toca pedir (2 recordatorios vencidos)', x && x.estado === 'toca' && /2 recordatorios sin hacer/.test(x.texto), JSON.stringify(x));
  x = await item(p, 'c2', 'fotos');
  ok('Lucía: fotos que ya pediste → «Pedido»', x && x.estado === 'pedido' && /hace 3 días/.test(x.texto), JSON.stringify(x));
  x = await item(p, 'c2', 'medidas');
  ok('Lucía: medidas que marcaste tú → «Entregado · marcado por ti»', x && x.estado === 'entregado' && /marcado por ti/.test(x.texto), JSON.stringify(x));
  x = await item(p, 'c4', 'peso');
  ok('Marta: peso del lunes registrado en la app → entregado', x && x.estado === 'entregado' && /llegó por la app/.test(x.texto), JSON.stringify(x));
  ok('Marta: fotos de esta semana → entregado', (await item(p, 'c4', 'fotos'))?.estado === 'entregado');
  ok('Sofía: nada pendiente (su video, al día)', (await celda(p, 'c5').locator('[data-pp-estado="toca"], [data-pp-estado="pedido"], [data-pp-estado="recordar"]').count()) === 0 && /Al día/.test(await celda(p, 'c5').innerText()), await celda(p, 'c5').innerText());
  // La columna «Ciclo».
  const ciclo = async (id) => (await p.locator(`tr[data-tq-cliente="${id}"] [data-tq="ciclo"]`).innerText()).replace(/\s+/g, ' ');
  ok('Ciclo: la tabla trae la columna', /Ciclo/.test(await p.locator('[data-tq-tabla] thead').innerText()));
  let ci = await ciclo('c2');
  ok(`Ciclo · Lucía: semana 3 de 5 y los días que faltan (${ci})`, /Sem 3 de 5/.test(ci) && /Ciclo 2/.test(ci) && /faltan \d+ días/.test(ci) && /El aviso de cambio le sale el/.test(ci), ci);
  ci = await ciclo('c0');
  ok(`Ciclo · Ana: última semana y ya vio el aviso de cambio (${ci})`, /Sem 5 de 5/.test(ci) && /Ya vio el aviso de cambio/.test(ci), ci);
  ci = await ciclo('c5');
  ok(`Ciclo · Sofía: última semana y aún no ve el aviso (${ci})`, /Sem 5 de 5/.test(ci) && /Aún no ve el aviso de cambio/.test(ci), ci);
  ok('Ciclo · Carlos: sin ciclo vigente', /Sin ciclo vigente/.test(await ciclo('c1')));
  const tarjeta = (await p.locator('[data-tq-filtro="pendientes"]').innerText()).replace(/\s+/g, ' ');
  ok(`la tarjeta de arriba (${tarjeta})`, /^\s*5 pendientes por pedir 2 pedidos sin llegar · 1 por recordar/.test(tarjeta), tarjeta);
  if (process.env.FOTO) await p.screenshot({ path: path.join(CAPTURAS, 'toques-pendientes.png') });

  // «Ya lo pedí» (fotos de Ana) → pedido, guardado en pedidos_cliente.
  await celda(p, 'c0').locator('[data-pp="fotos"] [data-pp-yapedi]').click();
  await p.waitForTimeout(1200);
  x = await item(p, 'c0', 'fotos');
  ok('«Ya lo pedí» → queda «Pedido» (guardado)', x && x.estado === 'pedido' && /Pedido hoy/.test(x.texto) && await p.evaluate(() => window.TABLAS_FALSAS.pedidos_cliente.some(r => r.cliente_id === 'c0' && r.tipo === 'fotos' && !r.entregado_en)), JSON.stringify(x));
  // «Pedir» (medidas de Carlos) → abre su WhatsApp con el mensaje y queda pedido.
  await celda(p, 'c1').locator('[data-pp="medidas"] [data-pp-pedir]').click();
  await p.waitForTimeout(1200);
  const abiertos = await p.evaluate(() => window.ABIERTOS);
  x = await item(p, 'c1', 'medidas');
  ok('«Pedir» → abre su WhatsApp con el mensaje de medidas y queda «Pedido»', abiertos.some(u => /wa\.me\/573000000002\?text=/.test(u) && /medidas/.test(decodeURIComponent(u))) && x && x.estado === 'pedido', JSON.stringify(abiertos) + JSON.stringify(x));
  // «Ya lo entregó» (fotos de Lucía) → entregado, marcado por ti.
  await celda(p, 'c2').locator('[data-pp="fotos"] [data-pp-entrego]').click();
  await p.waitForTimeout(1200);
  x = await item(p, 'c2', 'fotos');
  ok('«Ya lo entregó» → «Entregado · marcado por ti»', x && x.estado === 'entregado' && /marcado por ti/.test(x.texto) && await p.evaluate(() => window.TABLAS_FALSAS.pedidos_cliente.some(r => r.id === 'p1' && r.entregado_en && r.entregado_por === 'coach')), JSON.stringify(x));
  // «Ver videos»: el detalle, con cada video, su estado y marcar / desmarcar.
  const vent = p.locator('[data-pp-videos="c1"]');
  const estadoV = (k) => vent.locator(`[data-ppv-fila="${k}"]`).getAttribute('data-ppv-estado');
  await celda(p, 'c1').locator('[data-pp="video"] [data-pp-ver]').click();
  await vent.waitFor({ timeout: 8000 });
  ok('«Ver videos» abre el detalle: los 2 pedidos, por llegar, cada uno con su vista previa', await vent.locator('[data-ppv-fila]').count() === 2 && await estadoV('x1') === 'falta' && await estadoV('x3') === 'falta' && await vent.locator('.ppv-prev').count() >= 2 && /2 pedidos · 0 entregados · 2 faltan/.test(await vent.innerText()));
  if (process.env.FOTO) await p.screenshot({ path: path.join(CAPTURAS, 'toques-videos-detalle.png') });
  // «Recordar los que faltan» → su WhatsApp con el recordatorio de los dos.
  await p.locator('[data-ppv-recordar]').click();
  await p.waitForTimeout(1500);
  const ab2 = await p.evaluate(() => window.ABIERTOS);
  ok('«Recordar los que faltan» → su WhatsApp con el recordatorio de los videos', ab2.some(u => /wa\.me\/573000000002\?text=/.test(u) && /recuerdo los videos de Press banca, Remo con barra/.test(decodeURIComponent(u))));
  x = await item(p, 'c1', 'video');
  ok('…y la fila vuelve a «Pedido» (se lo recordaste hoy)', x && x.estado === 'pedido' && /se lo recordaste hoy/.test(x.texto), JSON.stringify(x));
  // «Ya lo entregó» es por ejercicio: Press banca sí, Remo sigue pendiente.
  await vent.locator('[data-ppv-entrego="x1"]').click();
  await p.waitForTimeout(1500);
  ok('«Ya lo entregó» de Press banca → entregado (con «Desmarcar»); Remo sigue por llegar', await estadoV('x1') === 'entregado' && await estadoV('x3') === 'falta' && await vent.locator('[data-ppv-desmarcar="x1"]').count() === 1);
  x = await item(p, 'c1', 'video');
  ok('la fila dice «Entregó 1 de 2 · falta Remo con barra»', x && /Entregó 1 de 2/.test(x.texto) && /falta Remo con barra/.test(x.texto), JSON.stringify(x));
  // Te equivocaste: «Desmarcar» lo devuelve a «Por llegar».
  await vent.locator('[data-ppv-desmarcar="x1"]').click();
  await p.waitForTimeout(1500);
  ok('«Desmarcar» → Press banca vuelve a «Por llegar»', await estadoV('x1') === 'falta' && await p.evaluate(() => !window.TABLAS_FALSAS.pedidos_cliente.some(r => r.cliente_id === 'c1' && r.detalle === 'ej:x1' && r.entregado_en)));
  await vent.locator('[data-ppv-entrego="x1"]').click();
  await p.waitForTimeout(1500);
  await vent.locator('[data-ppv-entrego="x3"]').click();
  await p.waitForTimeout(1500);
  ok('con los dos entregados → la ventana dice «todos enviados»', /todos enviados/.test(await vent.innerText()));
  x = await item(p, 'c1', 'video');
  ok('…y la fila «Todos enviados · Todos entregados»', x && x.estado === 'entregado' && /Todos enviados/.test(x.texto) && /Todos entregados/.test(x.texto), JSON.stringify(x));
  await p.evaluate(() => closeModal());
  // El filtro de la tarjeta deja solo a quienes tienen algo por pedir o sin llegar.
  await p.locator('[data-tq-filtro="pendientes"]').first().click();
  await p.waitForTimeout(800);
  const quedan = await p.locator('tr[data-tq-cliente]').evaluateAll(els => els.map(e => e.dataset.tqCliente).sort());
  ok(`el filtro deja a los que tienen algo pendiente (${quedan})`, !quedan.includes('c5') && quedan.includes('c0') && quedan.includes('c2'), JSON.stringify(quedan));
  // Semana pasada: la columna no aplica.
  await p.locator('[data-tq-filtro="todos"]').first().click();
  await p.locator('[data-tq-semana="1"]').click();
  await p.waitForTimeout(800);
  ok('en semanas pasadas la columna sale «—»', (await celda(p, 'c0').innerText()).trim() === '—');
  ok('sin errores', !errores.length, errores.join(' | '));
  await ctx.close();
}
{
  console.log('\nteléfono');
  const { ctx, p, errores } = await abrir(390, 900, false);
  await p.evaluate(() => navigate('toques'));
  await p.locator('[data-tq-tabla]').waitFor({ timeout: 15000 });
  await p.waitForTimeout(800);
  ok('teléfono: sin scroll de lado en la página', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  ok('teléfono: sin errores', !errores.length, errores.join(' | '));
  await ctx.close();
}
await b.close(); servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
