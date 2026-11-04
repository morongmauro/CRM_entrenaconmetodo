// CRM nuevo (crm-prueba.js): siempre prendido, «Hoy» por excepción, responder notas y «Cartera».
//
//   TAILWIND_CSS=/ruta/tailwind.css node pruebas/crm-prueba.mjs
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


// Cuatro clientes, cada uno con un caso:
//   Ana (c0): entrena bien, usa la app, medida hace 10 días y meta al día. Dejó una nota al terminar.
//   Carlos (c1): 6 días sin nada y una nota «me duele la rodilla» → Intervenir.
//   Lucía (c2): entrenaba sus 3 días y las 2 últimas semanas nada → Intervenir (2 semanas bajando).
//   Marta (c4): entrena bien, usa la app, al día → Va bien.
function tablas() {
  const cli = (id, nombre, inicio, extra = {}) => ({ id, user_id: 'coach-1', nombre, estado: 'activo', fecha_inicio: inicio, telefono: '+57 300 000 0000', created_at: '2026-01-01T00:00:00Z', meta_calorias: 2000, meta_calculada_en: mas(HOY, -5) + 'T10:00:00Z', ...extra });
  const clientes = [
    cli('c0', 'Ana Pérez', mas(HOY, -270), { mealtracker_id: '11111111-1111-1111-1111-111111111111' }),
    cli('c1', 'Carlos Ruiz', mas(HOY, -40)),
    cli('c2', 'Lucía Gómez', mas(HOY, -150)),
    cli('c4', 'Marta Díaz', mas(HOY, -120)),
    cli('c3', 'Pedro Viejo', mas(HOY, -200), { estado: 'inactivo' }),
  ];
  const fase = (id, c) => ({ id, user_id: 'coach-1', cliente_id: c, nombre: 'Ciclo', semanas: 16, fecha_inicio: mas(HOY, -60), dias_semana: ['L', 'X', 'V'], orden: 1, estado: 'activa', visible_cliente: true });
  const sesiones = [];
  const lunes = mas(HOY, -((new Date(HOY + 'T12:00:00').getDay() + 6) % 7));
  for (let k = 0; k < 56; k++) {
    const f = mas(HOY, -k);
    if (!['L', 'X', 'V'].includes(LETRA(f))) continue;
    sesiones.push({ id: `a${k}`, cliente_id: 'c0', rutina_id: 'r1', fecha: f, estado: 'completada', origen: 'cliente', notas_cliente: k === Math.min(...[0, 1, 2, 3, 4].filter(x => ['L', 'X', 'V'].includes(LETRA(mas(HOY, -x))))) ? 'Hoy me sentí con mucha energía' : null });
    sesiones.push({ id: `m${k}`, cliente_id: 'c4', rutina_id: 'r1', fecha: f, estado: 'completada', origen: 'cliente' });
    if (k >= 6) sesiones.push({ id: `b${k}`, cliente_id: 'c1', rutina_id: 'r1', fecha: f, estado: 'completada', origen: 'cliente' });
    if (f < mas(lunes, -14)) sesiones.push({ id: `l${k}`, cliente_id: 'c2', rutina_id: 'r1', fecha: f, estado: 'completada', origen: 'cliente' });
  }
  const med = (id, c) => ({ id, cliente_id: c, fecha: mas(HOY, -10), peso: 70, grasa_pct: 20 });
  return {
    clientes, fases: [fase('f0', 'c0'), fase('f1', 'c1'), fase('f2', 'c2'), fase('f4', 'c4')], sesiones,
    rutinas: [{ id: 'r1', nombre: 'Tren superior' }],
    notas_entreno: [{ id: 'n1', cliente_id: 'c1', fecha: mas(HOY, -1), created_at: mas(HOY, -1) + 'T10:00:00Z', texto: 'Me duele la rodilla al bajar en la sentadilla', leida_en: null }],
    settings: [{ user_id: 'coach-1', usd_cop_rate: 4000, nombre_coach: 'Mauro', mealtracker_app_url: 'https://mt.prueba', mealtracker_coach_password: 'x' }],
    seguimientos: [], seguimiento_mensajes: [], seguimiento_pedidos: [], pagos: [], pendientes: [],
    mediciones_corporales: [med('md0', 'c0'), med('md1', 'c1'), med('md2', 'c2'), med('md4', 'c4')],
    encuesta_app: [], metas_historial: [], ia_uso: [], push_pago_log: [],
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
  await ctx.addInitScript(([t, on]) => { window.TABLAS_FALSAS = t; if (on) localStorage.setItem('crm:prueba', '1'); }, [tablas(), prueba]);
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


// El CRM nuevo es el CRM: sin botón ni franja para volver al anterior, y
// abre en «Hoy» (aunque nunca se haya prendido nada).
{
  const { ctx, p, errores } = await abrir(1440, 1000, false);
  await p.locator('[data-cp-resumen]').waitFor({ timeout: 15000 });
  ok('abre en «Hoy», con Hoy y Cartera arriba del menú', await p.locator('.nav-item[data-view="hoy"]').count() === 1 && await p.locator('.nav-item[data-view="cartera"]').count() === 1);
  ok('sin botón «Volver al CRM de siempre» ni «Probar el CRM nuevo»', await p.locator('#cp-boton').count() === 0);
  ok('sin la franja «Estás probando el CRM nuevo»', await p.locator('[data-cp-banda]').count() === 0);
  await p.screenshot({ path: path.join(CAPTURAS, 'crm-nuevo-fijo.png') });
  ok('sin errores', errores.length === 0, errores.join(' | '));
  await ctx.close();
}

for (const [tag, ancho] of [['ancho', 1440], ['telefono', 390]]) {
  console.log(`\n${tag}`);
  enviados.length = 0;
  const { ctx, p, errores } = await abrir(ancho, 1100);
  await p.evaluate(() => navigate('hoy'));
  await p.locator('[data-cp-resumen]').waitFor({ timeout: 15000 });
  const ids = async (sel) => p.locator(`${sel} [data-cp-cliente]`).evaluateAll(els => els.map(e => e.dataset.cpCliente));
  const inter = await ids('[data-cp-intervenir]');
  ok(`${tag} · Intervenir: Carlos y Lucía (${inter})`, inter.includes('c1') && inter.includes('c2') && !inter.includes('c0') && !inter.includes('c4'), JSON.stringify(inter));
  const carlos = (await p.locator('[data-cp-cliente="c1"]').innerText()).replace(/\s+/g, ' ');
  ok(`${tag} · Carlos: molestia (primero) y días sin actividad`, /Reportó una molestia/.test(carlos) && /[67] días sin actividad/.test(carlos) && carlos.indexOf('molestia') < carlos.indexOf('sin actividad'), carlos);
  const lucia = (await p.locator('[data-cp-cliente="c2"]').innerText()).replace(/\s+/g, ' ');
  ok(`${tag} · Lucía: «2 semanas bajando» contra su propio promedio`, /2 semanas bajando: 0 de 3 y 0 de 3 \(antes 100 %\)/.test(lucia), lucia);
  const obs = await ids('[data-cp-observar]');
  ok(`${tag} · Observar: Ana, por la nota al terminar (${obs})`, JSON.stringify(obs) === '["c0"]', JSON.stringify(obs));
  const normal = (await p.locator('[data-cp-normal]').innerText()).replace(/\s+/g, ' ');
  ok(`${tag} · Van bien: Marta (y no el inactivo)`, /Marta Díaz/.test(normal) && !/Pedro/.test(normal), normal);
  await p.screenshot({ path: path.join(CAPTURAS, `crm-prueba-hoy-${tag}.png`), fullPage: true });
  // Responder la nota de Ana a su app.
  await p.locator('[data-cp-observar] summary').click().catch(() => {});
  await p.locator('[data-cp-cliente="c0"] button', { hasText: 'Responder' }).click();
  await p.locator('#bdj-resp').fill('¡Qué bien! Esa energía se nota en tus cargas.');
  if (tag === 'ancho') await p.screenshot({ path: path.join(CAPTURAS, 'crm-prueba-responder.png') });
  await p.locator('[data-bdj-resp-app]').click();
  await p.waitForTimeout(800);
  const resp = await p.evaluate(() => (window.TABLAS_FALSAS.respuestas_coach || []).slice(-1)[0] || null);
  ok(`${tag} · la respuesta queda para su app («Te respondió»), pegada a su nota`, resp && resp.cliente_id === 'c0' && resp.texto === '¡Qué bien! Esa energía se nota en tus cargas.' && resp.contexto === 'Al terminar Tren superior' && !!resp.nota, JSON.stringify(resp));
  const guardado = await p.evaluate(() => (window.TABLAS_FALSAS.seguimiento_mensajes || []).length);
  ok(`${tag} · queda en su historial de seguimiento`, guardado >= 1, String(guardado));
  await p.locator('[data-cp-resumen]').waitFor({ timeout: 10000 });
  ok(`${tag} · Ana pasa a «Van bien»`, /Ana Pérez/.test(await p.locator('[data-cp-normal]').innerText()));
  // «No hace falta» esconde la señal 7 días.
  await p.locator('[data-cp-cliente="c2"] [data-cp-senal="adh2"] button', { hasText: 'No hace falta' }).click();
  await p.locator('[data-cp-resumen]').waitFor({ timeout: 10000 }); await p.waitForTimeout(300);
  ok(`${tag} · «No hace falta» saca a Lucía de Intervenir`, !(await ids('[data-cp-intervenir]')).includes('c2'));
  // Seguimiento: arriba, por qué está en la cola; sin modo Diálogo.
  if (tag === 'ancho') {
    await p.evaluate(() => cpSeguimiento('c1'));
    await p.locator('[data-cp-motivo]').waitFor({ timeout: 20000 }).catch(() => {});
    const mot = await p.locator('[data-cp-motivo]').count() ? (await p.locator('[data-cp-motivo]').innerText()).replace(/\s+/g, ' ') : '';
    ok(`${tag} · Seguimiento de Carlos: «Por qué está en tu cola» con la molestia`, /Por qué está en tu cola/.test(mot) && /molestia/.test(mot), mot);
    ok(`${tag} · sin el selector Semana/Diálogo`, await p.locator('[data-seg-modo]:visible').count() === 0);
    await p.screenshot({ path: path.join(CAPTURAS, 'crm-prueba-seguimiento.png') });
    await p.mouse.move(800, 5);
    await p.evaluate(() => navigate('dashboard')); await p.waitForTimeout(2500);
    await p.screenshot({ path: path.join(CAPTURAS, 'crm-prueba-inicio.png') });
  }
  // Cartera.
  await p.evaluate(() => navigate('cartera'));
  await p.locator('[data-cp-tabla]').waitFor({ timeout: 10000 });
  const filas = await p.locator('[data-cp-fila]').evaluateAll(els => els.map(e => e.dataset.cpFila));
  ok(`${tag} · Cartera: los 4 activos, Carlos primero (${filas})`, filas.length === 4 && filas[0] === 'c1', JSON.stringify(filas));
  const fc = (await p.locator('[data-cp-fila="c1"]').innerText()).replace(/\s+/g, ' ');
  ok(`${tag} · fila de Carlos: estado, motivo, próxima acción y pago`, /Intervenir/.test(fc) && /molestia/.test(fc) && /Responder/.test(fc) && /Al día|—/.test(fc), fc);
  await p.locator('[data-cp-filtro="intervenir"]').click();
  ok(`${tag} · filtro Intervenir: solo Carlos`, JSON.stringify(await p.locator('[data-cp-fila]').evaluateAll(els => els.map(e => e.dataset.cpFila))) === '["c1"]');
  await p.locator('[data-cp-filtro="todos"]').click();
  await p.screenshot({ path: path.join(CAPTURAS, `crm-prueba-cartera-${tag}.png`), fullPage: true });
  if (tag === 'telefono') ok(`${tag} · sin scroll de lado en la página`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  ok(`${tag} · sin errores`, errores.length === 0, errores.join(' | '));
  await ctx.close();
}
await b.close(); servidor.close();
console.log(mal ? `\n${mal} falla(s)` : '\ntodo bien');
process.exit(mal ? 1 : 0);
