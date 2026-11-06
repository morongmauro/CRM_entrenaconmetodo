// Toques de la semana (toques.js): matriz por cliente, semáforo y acciones.
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


// Cinco clientes, cada uno con un caso:
//   Ana (c0): dejó una nota al terminar; hoy le mandaste el seguimiento y le
//     respondiste → verde, y es UN toque (un día), no dos.
//   Carlos (c1): te escribió ayer en la app y no le respondiste → rojo, le debes respuesta.
//   Lucía (c2): su último toque fue hace 20 días → rojo, frío.
//   Marta (c4): seguimiento hace 10 días → amarillo, enfriándose.
//   Sofía (c5): seguimiento 4 días seguidos → amarillo, mucho.
function tablas() {
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
    comentarios_coach: [], videos_tecnica: [], toques_cliente: [], toques_semana: [],
    seguimiento_mensajes: [msj('m1', 'c2', mas(HOY, -20)), msj('m2', 'c4', mas(HOY, -10)), msj('m3', 'c0', HOY), ...[0, 1, 2, 3].map(k => msj('ms' + k, 'c5', mas(HOY, -k)))],
    settings: [{ user_id: 'coach-1', usd_cop_rate: 4000, nombre_coach: 'Mauro', mealtracker_app_url: 'https://mt.prueba', mealtracker_coach_password: 'x' }],
    seguimientos: [], seguimiento_pedidos: [], pagos: [], pendientes: [], mediciones_corporales: [],
    encuesta_app: [], metas_historial: [], ia_uso: [], push_pago_log: [], ausencias: [],
    comunidad_posts: [], comunidad_reacciones: [], comunidad_comentarios: [], comunidad_vistas: [],
  };
}
function app(accion) {
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



for (const [tag, ancho] of [['ancho', 1440], ['telefono', 390]]) {
  console.log(`\n${tag}`);
  const { ctx, p, errores } = await abrir(ancho, 1000, false);
  ok(`${tag} · «Toques» en el menú`, await p.locator('.nav-item[data-view="toques"]').count() === 1);
  await p.evaluate(() => navigate('toques'));
  await p.locator('[data-tq-tabla]').waitFor({ timeout: 15000 });
  const est = await p.locator('tr[data-tq-cliente]').evaluateAll(els => els.map(e => `${e.dataset.tqCliente}:${e.dataset.tqEstado}`));
  ok(`${tag} · orden y semáforo (${est})`, JSON.stringify(est) === JSON.stringify(['c1:debe', 'c2:frio', 'c4:enfria', 'c5:mucho', 'c0:bien']), JSON.stringify(est));
  ok(`${tag} · sin el inactivo`, !/Pedro/.test(await p.locator('[data-tq-tabla]').innerText()));
  const celda = async (c, k) => (await p.locator(`tr[data-tq-cliente="${c}"] [data-tq="${k}"]`).innerText()).trim();
  ok(`${tag} · Sofía: seguimiento semanal hecho`, /^Hecho/.test(await celda('c5', 'seguimiento')));
  ok(`${tag} · Marta: le falta el seguimiento semanal`, /^Falta/.test(await celda('c4', 'seguimiento')));
  ok(`${tag} · Ana: seguimiento y respuesta el mismo día = 1 toque`, (await p.locator('tr[data-tq-cliente="c0"] [data-tq-dias]').innerText()).trim() === '1 de 7 días' && /Seguimiento/.test(await celda('c0', 'semana')) && /Respuesta/.test(await celda('c0', 'semana')), await celda('c0', 'semana'));
  ok(`${tag} · Ana: el día de hoy marcado en su semana`, await p.locator('tr[data-tq-cliente="c0"] .tq-dia.t').count() === 1);
  ok(`${tag} · Ana: te escribió y le respondiste`, /respondido/.test(await celda('c0', 'escribio-app')) && /^1 entreno/.test(await celda('c0', 'su-semana')));
  ok(`${tag} · Carlos: «Responder» en vez de «Seguimiento»`, await p.locator('tr[data-tq-cliente="c1"] [data-tq-responder]').count() === 1 && /sin responder/.test(await celda('c1', 'escribio-app')));
  const faltas = (await p.locator('[data-tq-faltas]').innerText()).replace(/\s+/g, ' ');
  ok(`${tag} · arriba: 3 sin seguimiento (2 de 5 hechos)`, /3 sin seguimiento esta semana 2 de 5 hechos/.test(faltas), faltas);
  await p.locator('[data-tq-filtro="sinSeg"]').click(); await p.waitForTimeout(600);
  ok(`${tag} · filtro «sin seguimiento»: Carlos, Lucía y Marta`, JSON.stringify((await p.locator('tr[data-tq-cliente]').evaluateAll(els => els.map(e => e.dataset.tqCliente))).sort()) === '["c1","c2","c4"]');
  await p.locator('[data-tq-filtro="sinContacto"]').click(); await p.waitForTimeout(600);
  const sc = await p.locator('tr[data-tq-cliente]').evaluateAll(els => els.map(e => e.dataset.tqCliente));
  ok(`${tag} · filtro «sin contacto»: Lucía y Marta sí, Ana no`, sc.includes('c2') && sc.includes('c4') && !sc.includes('c0'), JSON.stringify(sc));
  await p.locator('[data-tq-filtro="todos"]').first().click(); await p.waitForTimeout(600);
  ok(`${tag} · «Seguimiento» abre en otra pestaña (?seg=)`, await p.locator('tr[data-tq-cliente="c4"] [data-tq-seg-pestana]').evaluate(a => a.target === '_blank' && /\?seg=c4$/.test(a.getAttribute('href'))));
  await p.locator('tr[data-tq-cliente="c4"] [data-tq-seg-hecho]').click(); await p.waitForTimeout(1500);
  ok(`${tag} · «Marcar hecho»: Marta pasa a «Hecho» y queda guardado`, /^Hecho/.test(await celda('c4', 'seguimiento')) && (await p.evaluate(() => window.TABLAS_FALSAS.seguimiento_mensajes.filter(m => m.cliente_id === 'c4' && m.origen === 'manual').length)) === 1, await celda('c4', 'seguimiento'));
  await p.locator('tr[data-tq-cliente="c2"] [data-tq-nhf]').click(); await p.waitForTimeout(1500);
  ok(`${tag} · «Esta semana no»: Lucía sale como «Esta semana no» y ya no cuenta en «sin seguimiento»`, /^Esta semana no/.test(await celda('c2', 'seguimiento')) && /1 sin seguimiento/.test((await p.locator('[data-tq-faltas]').innerText()).replace(/\s+/g, ' ')) && (await p.evaluate(() => window.TABLAS_FALSAS.toques_semana.filter(x => x.cliente_id === 'c2').length)) === 1, (await p.locator('[data-tq-faltas]').innerText()).replace(/\s+/g, ' ') + ' · ' + JSON.stringify(await p.evaluate(() => window.TABLAS_FALSAS.toques_semana)));
  if (tag === 'ancho') await p.locator('[data-tq-tabla]').screenshot({ path: path.join(CAPTURAS, 'toques-no-hace-falta.png') }).catch(() => {});
  await p.locator('tr[data-tq-cliente="c2"] [data-tq-nhf-deshacer]').click(); await p.waitForTimeout(1500);
  ok(`${tag} · «deshacer» la vuelve a «Falta»`, /^Falta/.test(await celda('c2', 'seguimiento')));
  if (tag === 'ancho') { await p.locator('[data-tq-filtro="todos"]').first().click(); await p.waitForTimeout(600); await p.screenshot({ path: path.join(CAPTURAS, 'toques-semana.png'), fullPage: true }); }
  await p.locator('[data-tq-filtro="todos"]').first().click(); await p.waitForTimeout(600);
  const frio = (await p.locator('tr[data-tq-cliente="c2"]').innerText()).replace(/\s+/g, ' ');
  ok(`${tag} · Lucía: «Frío», último toque hace 20 días`, /Frío/.test(frio) && /hace 20 días/.test(frio), frio);
  await p.screenshot({ path: path.join(CAPTURAS, `toques-matriz-${tag}.png`) });
  // Filtro rojo.
  await p.locator('[data-tq-filtro="rojo"]').click(); await p.waitForFunction(() => document.querySelector('[data-tq-filtro="rojo"].active') && !document.querySelector('tr[data-tq-color="verde"]'), null, { timeout: 10000 }).catch(() => {});
  ok(`${tag} · filtro Rojo: Carlos y Lucía`, JSON.stringify(await p.locator('tr[data-tq-cliente]').evaluateAll(els => els.map(e => e.dataset.tqCliente))) === '["c1","c2"]');
  await p.locator('[data-tq-filtro="todos"]').click(); await p.locator('tr[data-tq-cliente="c0"]').waitFor();
  // WhatsApp desde la fila → abre wa.me y queda «Le escribí».
  await p.locator('tr[data-tq-cliente="c2"] [data-tq-wa]').click();
  await p.waitForTimeout(1500);
  const abiertos = await p.evaluate(() => window.ABIERTOS);
  ok(`${tag} · abre su WhatsApp`, abiertos.some(u => u.includes('wa.me/573000000003')), JSON.stringify(abiertos));
  const toq = await p.evaluate(() => window.TABLAS_FALSAS.toques_cliente);
  ok(`${tag} · queda «Le escribí» para Lucía`, toq.length === 1 && toq[0].cliente_id === 'c2' && toq[0].tipo === 'le_escribi_wa', JSON.stringify(toq));
  await p.locator('tr[data-tq-cliente="c2"]').waitFor();
  ok(`${tag} · Lucía pasa a verde`, await p.locator('tr[data-tq-cliente="c2"]').getAttribute('data-tq-estado') === 'bien');
  // Abrirlo otra vez el mismo día no suma.
  await p.locator('tr[data-tq-cliente="c2"] [data-tq-wa]').click(); await p.waitForTimeout(1200);
  ok(`${tag} · dos veces el mismo día cuenta una`, (await p.evaluate(() => window.TABLAS_FALSAS.toques_cliente.length)) === 1);
  // WhatsApp desde otra parte del CRM (un enlace wa.me) también cuenta.
  await p.evaluate(() => { const a = document.createElement('a'); a.href = 'https://wa.me/573000000004?text=hola'; a.id = 'wa-prueba'; a.target = '_blank'; a.addEventListener('click', e => e.preventDefault()); document.body.appendChild(a); a.textContent = 'x'; });
  await p.evaluate(() => document.getElementById('wa-prueba').click()); await p.waitForTimeout(1000);
  ok(`${tag} · un enlace de WhatsApp de otra parte cuenta para Marta`, (await p.evaluate(() => window.TABLAS_FALSAS.toques_cliente.filter(t => t.cliente_id === 'c4').length)) === 1);
  // «Me escribió» en Sofía → le debes respuesta.
  await p.evaluate(() => rerenderView()); await p.locator('tr[data-tq-cliente="c5"]').waitFor();
  await p.locator('tr[data-tq-cliente="c5"] [data-tq="escribio-wa"]').click(); await p.waitForTimeout(400); await p.locator('[data-tq-wa-ok]').click(); await p.waitForTimeout(1200);
  ok(`${tag} · la casilla «Te escribió por WhatsApp» lo registra`, (await p.evaluate(() => window.TABLAS_FALSAS.toques_cliente.filter(t => t.cliente_id === 'c5' && t.tipo === 'me_escribio').length)) === 1);
  ok(`${tag} · Sofía queda en rojo: le debes respuesta`, await p.locator('tr[data-tq-cliente="c5"]').getAttribute('data-tq-estado') === 'debe');
  if (tag === 'ancho') { await p.evaluate(() => rerenderView()); await p.locator('tr[data-tq-cliente="c5"]').waitFor(); await p.waitForTimeout(800); await p.locator('[data-tq-tabla]').screenshot({ path: path.join(CAPTURAS, 'toques-canales.png') }).catch(() => {}); }
  // Pedir video abre el pedido para ese cliente.
  await p.locator('tr[data-tq-cliente="c1"] button', { hasText: 'Pedir video' }).click(); await p.waitForTimeout(800);
  ok(`${tag} · «Pedir video» abre el pedido`, await p.evaluate(() => _vt.clienteId === 'c1') && await p.evaluate(() => !modal.classList.contains('hidden') && modalContent.innerText.length > 0));
  await p.keyboard.press('Escape'); await p.evaluate(() => typeof closeModal === 'function' && closeModal());
  await p.screenshot({ path: path.join(CAPTURAS, `toques-${tag}.png`), fullPage: tag === 'telefono' });
  if (tag === 'telefono') ok(`${tag} · sin scroll de lado en la página`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  ok(`${tag} · sin errores`, errores.length === 0, errores.join(' | '));
  await ctx.close();
}
{
  console.log('\nÚltimo toque en Equipo y Seguimiento');
  const { ctx, p, errores } = await abrir(1440, 900);
  await p.evaluate(() => navigate('cartera')); await p.locator('[data-cp-fila]').first().waitFor({ timeout: 20000 });
  await p.waitForTimeout(800);
  const th = await p.locator('[data-cp-tabla] th').allInnerTexts();
  const ana = (await p.locator('[data-cp-fila="c0"] [data-tq-ultimo-link]').innerText().catch(() => '')).trim();
  const lucia = (await p.locator('[data-cp-fila="c2"] [data-tq-ultimo-link]').innerText().catch(() => '')).trim();
  ok('Equipo · Estado: columna «Último toque» con lo mismo que Toques (Ana hoy, Lucía hace 20 días)', th.includes('Último toque') && ana === 'hoy' && lucia === 'hace 20 días', `${th} · ${ana} · ${lucia}`);
  await p.locator('[data-cp-fila="c2"] [data-tq-ultimo-link]').click(); await p.waitForTimeout(1200);
  ok('tocarlo lleva a Toques', await p.evaluate(() => _currentView === 'toques'));
  await p.evaluate(() => segIr('c0')); await p.locator('#seg-semana [data-es-ultimo] [data-tq-ultimo-link]').waitFor({ timeout: 15000 }).catch(() => {});
  const seg = (await p.locator('#seg-semana [data-es-ultimo]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  ok('Seguimiento: «Último toque: hoy» con enlace a Toques', /Último toque: hoy/.test(seg) && await p.locator('#seg-semana [data-es-ultimo] [data-tq-ultimo-link]').count() === 1, seg);
  ok('sin errores (último toque)', errores.length === 0, errores.join(' | '));
  await ctx.close();
}
{
  console.log('\nenlace ?seg=');
  const { ctx, p, errores } = await abrir(1440, 900);
  await p.goto(BASE + '/?seg=c0'); await p.locator('#app-screen').waitFor({ state: 'visible', timeout: 20000 });
  await p.waitForTimeout(2500);
  ok('?seg=c0 abre el Seguimiento de Ana y limpia la dirección', await p.evaluate(() => _currentView === 'seguimiento' && String(_selectedClienteId) === 'c0' && !location.search), await p.evaluate(() => `${_currentView} ${_selectedClienteId} ${location.search}`));
  ok('sin errores (enlace)', errores.length === 0, errores.join(' | '));
  await ctx.close();
}
{
  console.log('\nhistorial de semanas');
  const { ctx, p, errores } = await abrir(1440, 900);
  await p.evaluate(() => navigate('toques')); await p.locator('tr[data-tq-cliente="c0"]').waitFor({ timeout: 20000 });
  const cajas = await p.locator('tr[data-tq-cliente="c0"] [data-tq="historial"] .tq-hw').count();
  const esta = (await p.locator('tr[data-tq-cliente="c0"] [data-tq="historial"] .tq-hw.act').innerText()).replace(/\s+/g, ' ');
  ok('columna «Últimas 3 semanas»: 3 recuadros y esta semana con «Seguimiento»', cajas === 3 && /Seguimiento/.test(esta), `${cajas} · ${esta}`);
  await p.locator('[data-tq-semana="1"]').click(); await p.waitForTimeout(900);
  const txt = await p.locator('#view').innerText();
  ok('«Semana pasada»: la tabla muestra esa semana, sin «Marcar hecho»', /Así quedó esa semana/.test(txt) && await p.locator('[data-tq-seg-hecho]').count() === 0 && /sin seguimiento esa semana/.test(txt));
  await p.locator('[data-tq-semana="0"]').click(); await p.waitForTimeout(900);
  ok('«Esta semana» vuelve con «Marcar hecho»', await p.locator('[data-tq-seg-hecho]').count() > 0);
  await p.locator('tr[data-tq-cliente="c4"] [data-tq="historial"]').click(); await p.waitForTimeout(700);
  const h = await p.locator('[data-tq-historial]').innerText().catch(() => '');
  ok('historial de Marta: 6 semanas, con el seguimiento de hace 10 días', await p.locator('[data-tq-historial] .tq-hi-sem').count() === 6 && /Seguimiento semanal enviado/.test(h), h.slice(0, 300));
  await p.locator('[data-tq-historial]').screenshot({ path: path.join(CAPTURAS, 'toques-historial.png') }).catch(() => {});
  await p.evaluate(() => closeModal());
  await p.locator('[data-tq-tabla]').screenshot({ path: path.join(CAPTURAS, 'toques-semanas.png') }).catch(() => {});
  ok('sin errores (historial)', errores.length === 0, errores.join(' | '));
  await ctx.close();
}
await b.close(); servidor.close();
console.log(mal ? `\n${mal} falla(s)` : '\ntodo bien');
process.exit(mal ? 1 : 0);
