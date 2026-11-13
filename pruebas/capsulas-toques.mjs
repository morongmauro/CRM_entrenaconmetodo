// Toques → «Cápsulas»: sugerida → enviada (con pregunta) → leída (sola, del centro) → respondió.
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
// Ana (c0): leyó «Las cinco capacidades» → sugerida la siguiente («Cómo crece el músculo»).
// Carlos (c1): le enviaste «Cuándo subir el peso» hace 4 días y no la abre → Recordar.
// Lucía (c2): le enviaste «Dormir mejor» hace 2 días y la leyó ayer → esperando respuesta.
function tablas() {
  const T = tablasBase();
  T.capsulas_pedidas = [
    { id: 'k1', user_id: 'coach-1', cliente_id: 'c1', capsula_id: 'ent-04-subir-peso', capsula_titulo: 'Cuándo subir el peso', pregunta: '¿en qué ejercicio?', enviada_en: mas(HOY, -4) + 'T10:00:00Z', recordada_en: null, respondio_en: null, respuesta: null },
    { id: 'k2', user_id: 'coach-1', cliente_id: 'c2', capsula_id: 'bie-10-dormir-mejor', capsula_titulo: 'Dormir mejor con lo que tienes', pregunta: '¿qué hábito?', enviada_en: mas(HOY, -2) + 'T10:00:00Z', recordada_en: null, respondio_en: null, respuesta: null },
  ];
  return T;
}
const LECTURAS = [
  { client_name: 'Ana Pérez', source: 'capsula', section_key: 'cap:ent-01-capacidades', last_at: `${mas(HOY, -3)}T10:00:00Z` },
  { client_name: 'lucia gomez', source: 'capsula', section_key: 'cap:bie-10-dormir-mejor', last_at: `${mas(HOY, -1)}T10:00:00Z` },
];
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let mal = 0;
const ok = (nombre, c, extra = '') => { if (!c) mal++; console.log(`  ${c ? 'ok ' : 'MAL'}  ${nombre}${c ? '' : '  ' + extra}`); };
async function abrir(ancho, alto) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(e.message));
  await ctx.addInitScript((t) => { window.ABIERTOS = []; window.open = (u) => { window.ABIERTOS.push(String(u)); return null; }; window.TABLAS_FALSAS = t; }, tablas());
  await p.route('**/*', (ruta) => {
    const u = ruta.request().url();
    if (u.startsWith(BASE)) return ruta.continue();
    if (u.includes('cdn.tailwindcss.com')) return ruta.fulfill({ contentType: 'text/javascript', body: `(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(tailwind)};document.head.prepend(s);window.tailwind={config:{}};})();` });
    if (u.includes('supabase-js')) return ruta.fulfill({ contentType: 'text/javascript', body: falso });
    if (u.includes('/rest/v1/reading_state')) return ruta.fulfill({ contentType: 'application/json', body: JSON.stringify(LECTURAS) });
    if (u.startsWith('https://mt.prueba/api/coach-auth')) return ruta.fulfill({ contentType: 'application/json', body: JSON.stringify({ token: 't', expiresAt: Date.now() + 3600e3 }) });
    if (u.startsWith('https://mt.prueba/api/coach-data')) return ruta.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, uso: [], clients: [], reminders: [] }) });
    if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return ruta.continue().catch(() => ruta.abort());
    return ruta.fulfill({ status: 200, contentType: 'application/json', body: u.includes('/rest/v1/') ? '[]' : '{}' });
  });
  await p.goto(BASE + '/');
  await p.locator('#app-screen').waitFor({ state: 'visible', timeout: 20000 });
  await p.waitForTimeout(800);
  return { ctx, p, errores };
}
const foco = async (p, nombre) => { if (!process.env.FOTO) return; await p.addStyleTag({ content: '[data-tq-tabla] tr > :nth-child(3), [data-tq-tabla] tr > :nth-child(4), [data-tq-tabla] tr > :nth-child(6), [data-tq-tabla] tr > :nth-child(7), [data-tq-tabla] tr > :nth-child(8), [data-tq-tabla] tr > :nth-child(n+10) { display:none }' }); await p.waitForTimeout(300); await p.locator('[data-tq-tabla] table').screenshot({ path: path.join(CAPTURAS, nombre) }); };
const cel = (p, id) => p.locator(`tr[data-tq-cliente="${id}"] [data-tq="capsulas"]`);
const est = async (p, id) => cel(p, id).locator('[data-cp-estado]').getAttribute('data-cp-estado');
{
  console.log('\ncápsulas en toques');
  const { ctx, p, errores } = await abrir(1700, 1000);
  await p.evaluate(() => navigate('toques'));
  await p.locator('[data-tq-tabla]').waitFor({ timeout: 15000 });
  await p.waitForTimeout(800);
  ok('la tabla trae la columna «Cápsulas»', /Cápsulas/.test(await p.locator('[data-tq-tabla] thead').innerText()));
  let t = (await cel(p, 'c0').innerText()).replace(/\s+/g, ' ');
  ok(`Ana: sugerida la siguiente que no ha leído (${t})`, await est(p, 'c0') === 'sugerida' && /Cómo crece el músculo/.test(t) && /Leídas: 1 de 11/.test(t) && /Enviar con pregunta/.test(t), t);
  t = (await cel(p, 'c1').innerText()).replace(/\s+/g, ' ');
  ok(`Carlos: enviada hace 4 días sin abrir → Recordar (${t})`, await est(p, 'c1') === 'recordar' && /Enviada hace 4 días · sin abrir/.test(t) && /Recordar/.test(t) && /Me respondió/.test(t), t);
  t = (await cel(p, 'c2').innerText()).replace(/\s+/g, ' ');
  ok(`Lucía: la leyó ayer (detectado solo, aunque escribió su nombre en minúsculas y sin tilde) → esperando respuesta (${t})`, await est(p, 'c2') === 'leida' && /Leída ayer/.test(t) && /Esperando su respuesta/.test(t), t);
  await foco(p, 'toques-capsulas.png');

  // Enviar con pregunta (Ana): mensaje con el enlace directo y la pregunta; queda «Enviada».
  await cel(p, 'c0').locator('[data-cp-enviar]').click();
  await p.locator('[data-cp-modal]').waitFor();
  const msj = await p.locator('#cp-msj').inputValue();
  ok('el mensaje trae el enlace directo a esa cápsula (con su nombre) y la pregunta', /centrorecursosentrenametodo\.vercel\.app\/\?mt_name=Ana%20P%C3%A9rez&mt_go=capsulas&mt_id=ent-02-crece-musculo/.test(msj) && /Cuando la leas, cuéntame: ¿qué te sorprendió/.test(msj), msj);
  await p.selectOption('#cp-cap', 'nut-07-cada-macro');
  await p.waitForTimeout(300);
  ok('al cambiar de cápsula cambian la pregunta y el enlace', /proteína/.test(await p.locator('#cp-preg').inputValue()) && /mt_id=nut-07-cada-macro/.test(await p.locator('#cp-msj').inputValue()));
  if (process.env.FOTO) await p.locator('#modal-box, [id*=modal] > div').first().screenshot({ path: path.join(CAPTURAS, 'toques-capsulas-enviar.png') }).catch(() => {});
  await p.locator('[data-cp-confirmar]').click();
  await p.waitForTimeout(1500);
  const ab = await p.evaluate(() => window.ABIERTOS);
  ok('se abre su WhatsApp con el mensaje', ab.some(u => /wa\.me\/573000000001\?text=/.test(u) && /Cuánto de cada macro/.test(decodeURIComponent(u))), JSON.stringify(ab));
  const fila = await p.evaluate(() => window.TABLAS_FALSAS.capsulas_pedidas.find(x => x.cliente_id === 'c0'));
  ok('queda guardada (cápsula, título y pregunta)', fila && fila.capsula_id === 'nut-07-cada-macro' && /proteína/.test(fila.pregunta || ''), JSON.stringify(fila));
  ok('Ana queda «Enviada hoy · sin abrir»', await est(p, 'c0') === 'enviada' && /Enviada hoy · sin abrir/.test(await cel(p, 'c0').innerText()));
  const tipos = (await p.locator('tr[data-tq-cliente="c0"] [data-tq-tipos]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  ok(`suma un toque del tipo «Cápsula» (${tipos})`, /Cápsula/.test(tipos), tipos);

  // Recordar (Carlos).
  await cel(p, 'c1').locator('[data-cp-recordar]').click();
  await p.waitForTimeout(1500);
  const ab2 = await p.evaluate(() => window.ABIERTOS);
  ok('Recordar: abre su WhatsApp con el recordatorio y el enlace', ab2.some(u => /wa\.me\/573000000002/.test(u) && /alcanzaste a ver la cápsula «Cuándo subir el peso»/.test(decodeURIComponent(u)) && /mt_id=ent-04-subir-peso/.test(decodeURIComponent(u))));
  ok('…y queda «Recordada hoy · sin abrir»', await est(p, 'c1') === 'enviada' && /Recordada hoy · sin abrir/.test(await cel(p, 'c1').innerText()));

  // Me respondió (Lucía).
  await cel(p, 'c2').locator('[data-cp-respondio]').click();
  await p.locator('[data-cp-resp-modal]').waitFor();
  await p.fill('#cp-respuesta', 'Voy a dejar el celular antes de las 10');
  await p.locator('[data-cp-guardar-resp]').click();
  await p.waitForTimeout(1500);
  t = (await cel(p, 'c2').innerText()).replace(/\s+/g, ' ');
  ok(`Lucía: «Respondió hoy» con lo que dijo y «Enviar otra» (${t})`, await est(p, 'c2') === 'respondio' && /Respondió · hoy/.test(t) && /Voy a dejar el celular/.test(t) && /Enviar otra/.test(t), t);

  await foco(p, 'toques-capsulas-despues.png');
  // Historial.
  await p.evaluate(() => tqHistorial('c2'));
  await p.locator('[data-tq-historial]').waitFor({ timeout: 8000 });
  const h = await p.locator('[data-tq-historial]').innerText();
  ok('el historial dice que se la enviaste y lo que te respondió', /Le enviaste la cápsula «Dormir mejor con lo que tienes»/.test(h) && /Te respondió sobre «Dormir mejor con lo que tienes»: «Voy a dejar el celular/.test(h), h.slice(0, 300));
  await p.evaluate(() => closeModal());

  // Respuesta desde su app, de una que leyó por su cuenta (la fila la crea la app).
  await p.evaluate((d) => { window.TABLAS_FALSAS.capsulas_pedidas.push({ id: 'k9', user_id: 'coach-1', cliente_id: 'c1', capsula_id: 'nut-07-cada-macro', capsula_titulo: 'Cuánto de cada macro',
    pregunta: '¿qué?', enviada_en: d, recordada_en: null, respondio_en: d, respuesta: 'Huevos en el desayuno', respondio_app: true, por_su_cuenta: true }); }, new Date().toISOString());
  await p.evaluate(() => routes.toques()); await p.waitForTimeout(2000);
  t = (await cel(p, 'c1').innerText()).replace(/\s+/g, ' ');
  ok(`respuesta desde su app: «Respondió en su app» y «La leyó por su cuenta» (${t})`, /Respondió en su app · hoy/.test(t) && /La leyó por su cuenta/.test(t) && /Huevos en el desayuno/.test(t), t);
  await p.evaluate(() => tqHistorial('c1'));
  await p.locator('[data-tq-historial]').waitFor({ timeout: 8000 });
  const h2 = await p.locator('[data-tq-historial]').innerText();
  ok('historial: lo cuenta como mensaje suyo, no como cápsula enviada por ti', /Leyó «Cuánto de cada macro» por su cuenta y te respondió en su app: «Huevos/.test(h2) && !/Le enviaste la cápsula «Cuánto de cada macro»/.test(h2), h2.slice(0, 400));
  await p.evaluate(() => closeModal());
  ok('sin errores', errores.length === 0, errores.join(' | '));
  await ctx.close();
}
await b.close();
servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
