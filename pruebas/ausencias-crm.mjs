// Ausencias y bienestar en el CRM (ausencias-crm.js): aviso en la Bandeja y en
// «Hoy», «En pausa», bienestar en Seguimiento y «Marcar ausencia».
//
//   TAILWIND_CSS=/ruta/tailwind.css node pruebas/ausencias-crm.mjs
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
    cli('c5', 'Pablo Ríos', mas(HOY, -150)),
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
  // Pablo: entrenaba bien y hace 10 días no (está de viaje: lo marcó en su app).
  for (let k = 10; k < 56; k++) { const f = mas(HOY, -k); if (['L', 'X', 'V'].includes(LETRA(f))) sesiones.push({ id: `p${k}`, cliente_id: 'c5', rutina_id: 'r1', fecha: f, estado: 'completada', origen: 'cliente' }); }
  return {
    clientes, fases: [fase('f0', 'c0'), fase('f1', 'c1'), fase('f2', 'c2'), fase('f4', 'c4'), fase('f5', 'c5')], sesiones,
    ausencias: [{ id: 'a1', user_id: 'coach-1', cliente_id: 'c5', desde: mas(HOY, -9), hasta: mas(HOY, 4), motivo: 'viaje', nota: 'Me voy a Cartagena con la familia', origen: 'cliente', vista_en: null, anulada_en: null, created_at: mas(HOY, -9) + 'T10:00:00Z', updated_at: mas(HOY, -9) + 'T10:00:00Z' }],
    bienestar: [[-42, 4, 4, 3], [-28, 5, 4, 3], [-14, 3, 4, 3], [-1, 2, 3, 3]].map(([d, s, e, t], i) => ({ id: `b${i}`, user_id: 'coach-1', cliente_id: 'c0', fecha: mas(HOY, d), sueno: s, energia: e, estres: t })),
    rutinas: [{ id: 'r1', nombre: 'Tren superior' }],
    notas_entreno: [{ id: 'n1', cliente_id: 'c1', fecha: mas(HOY, -1), created_at: mas(HOY, -1) + 'T10:00:00Z', texto: 'Me duele la rodilla al bajar en la sentadilla', leida_en: null }],
    settings: [{ user_id: 'coach-1', usd_cop_rate: 4000, nombre_coach: 'Mauro', mealtracker_app_url: 'https://mt.prueba', mealtracker_coach_password: 'x' }],
    seguimientos: [], seguimiento_mensajes: [], seguimiento_pedidos: [], pagos: [], pendientes: [],
    mediciones_corporales: [med('md0', 'c0'), med('md1', 'c1'), med('md2', 'c2'), med('md4', 'c4'), med('md5', 'c5')],
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
    { user_id: '55555555-5555-5555-5555-555555555555', name: 'Pablo Ríos', last_active: mas(HOY, -9), day_scores: {}, recent_days: {}, recetas_registradas: [], menus_creados: 0, favoritos: 0 },
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



const D = '/tmp/claude-0/-home-user/72c7c01f-58d6-5368-9640-a3136112d4a6/scratchpad/prop/img';
// 1) El CRM de siempre: la Bandeja
{
  console.log('\nBandeja (CRM de siempre)');
  const { ctx, p, errores } = await abrir(1440, 1000, false);
  await p.evaluate(() => navigate('bandeja'));
  await p.waitForFunction(() => /Mensajes por responder/.test(document.getElementById('view').innerText), null, { timeout: 20000 });
  await p.waitForTimeout(500);
  const txt = (await p.locator('#view').innerText()).replace(/\s+/g, ' ');
  ok('aviso: «Pablo Ríos · Avisó que va a estar fuera · Viaje» con fechas y su nota', /Pablo Ríos · Avisó que va a estar fuera · Viaje/.test(txt) && /Cartagena/.test(txt), txt.slice(0, 600));
  ok('bienestar: «Duerme peor: sueño 5 → 3 → 2 de 5» de Ana', /Ana Pérez · Duerme peor: sueño 5 → 3 → 2 de 5/.test(txt), txt.slice(0, 800));
  ok('a Pablo no le sale «Lleva N días sin registrar un entreno» (está de viaje)', !/Pablo Ríos · Lleva \d+ días sin registrar un entreno/.test(txt));
  ok('botón «Escribirle» en los avisos', await p.locator('[data-bdj-escribir]').count() >= 2);
  await p.screenshot({ path: `${D}/C-bandeja.png` });
  const fila = p.locator('#view .flex.items-start', { hasText: 'Avisó que va a estar fuera' });
  await fila.locator('button', { hasText: 'Listo' }).click();
  await p.waitForTimeout(800);
  ok('«Listo» lo deja visto en la base', !!(await p.evaluate(() => window.TABLAS_FALSAS.ausencias[0].vista_en)));
  ok('sin errores', errores.length === 0, errores.join(' | '));
  await ctx.close();
}
// 2) El CRM en prueba: Hoy, Seguimiento y Cartera
for (const [tag, ancho] of [['ancho', 1440], ['telefono', 390]]) {
  console.log(`\nCRM en prueba · ${tag}`);
  enviados.length = 0;
  const { ctx, p, errores } = await abrir(ancho, 1100);
  await p.evaluate(() => navigate('hoy'));
  await p.locator('[data-cp-resumen]').waitFor({ timeout: 15000 });
  const av = (await p.locator('[data-cp-avisos]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  ok(`${tag} · «Te avisaron»: Pablo, viaje, con su nota`, /Pablo Ríos/.test(av) && /Viaje/.test(av) && /Cartagena/.test(av), av);
  const pa = (await p.locator('[data-cp-pausa]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  ok(`${tag} · «En pausa»: Pablo, la marcó en su app`, /Pablo Ríos/.test(pa) && /la marcó en su app/.test(pa), pa);
  ok(`${tag} · Pablo no está en Intervenir (no entrena porque está de viaje)`, await p.locator('[data-cp-intervenir] [data-cp-cliente="c5"]').count() === 0);
  await p.locator('[data-cp-observar] summary').click().catch(() => {});
  const ana = (await p.locator('[data-cp-observar] [data-cp-cliente="c0"]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  ok(`${tag} · Ana en Observar: «Duerme peor» con «Ver bienestar»`, /Duerme peor/.test(ana) && /Ver bienestar/.test(ana), ana);
  if (tag === 'ancho') await p.screenshot({ path: `${D}/C-hoy.png` });
  // Escribirle a Pablo, a su app
  await p.locator('[data-cp-avisos] button', { hasText: 'Escribirle' }).click();
  await p.locator('#cp-resp').fill('¡Buen viaje, Pablo! Disfruta. Si puedes, camina un rato cada día; al volver retomamos.');
  await p.locator('[data-cp-resp-app]').click(); await p.waitForTimeout(900);
  ok(`${tag} · le llega a su app tal cual lo escribiste`, enviados.some(e => e.reminders.some(r => /Buen viaje, Pablo/.test(r.text))), JSON.stringify(enviados.at(-1)));
  ok(`${tag} · y el aviso queda visto`, !!(await p.evaluate(() => window.TABLAS_FALSAS.ausencias[0].vista_en)));
  await p.locator('[data-cp-resumen]').waitFor({ timeout: 10000 });
  ok(`${tag} · «Te avisaron» desaparece`, await p.locator('[data-cp-avisos]').count() === 0);
  // Seguimiento de Ana: bienestar con 3 gráficas y «Marcar ausencia»
  await p.evaluate(() => cpSeguimiento('c0'));
  await p.locator('[data-aus-seg]').waitFor({ timeout: 20000 });
  const bien = (await p.locator('[data-aus-seg]').innerText()).replace(/\s+/g, ' ');
  ok(`${tag} · Seguimiento: bienestar con sueño, energía y estrés, y «Bajó 2 veces seguidas»`, await p.locator('[data-bien]').count() === 3 && /Bajó 2 veces seguidas/.test(bien), bien);
  if (tag === 'ancho') { await p.locator('[data-aus-seg]').scrollIntoViewIfNeeded(); await p.mouse.move(800, 5); await p.screenshot({ path: `${D}/C-seguimiento.png` }); }
  await p.locator('[data-aus-marcar]').click();
  await p.locator('[data-aus-motivo="enfermedad"]').click();
  await p.locator('#aus-desde').fill(mas(HOY, -3)); await p.locator('#aus-hasta').fill(HOY);
  await p.locator('#aus-nota').fill('Gripe, me escribió por WhatsApp');
  if (tag === 'ancho') await p.screenshot({ path: `${D}/C-marcar.png` });
  await p.locator('[data-aus-guardar]').click(); await p.waitForTimeout(900);
  const nueva = await p.evaluate(() => window.TABLAS_FALSAS.ausencias.find(a => a.cliente_id === 'c0'));
  ok(`${tag} · «Marcar ausencia» la guarda como tuya`, nueva && nueva.motivo === 'enfermedad' && nueva.origen === 'coach' && nueva.desde === mas(HOY, -3) && /Gripe/.test(nueva.nota), JSON.stringify(nueva));
  await p.locator('[data-aus-chip]').first().waitFor({ timeout: 10000 });
  ok(`${tag} · sale en su Seguimiento («Enfermedad · …»)`, /Enfermedad/.test(await p.locator('[data-aus-lista]').innerText()));
  // Cartera: filtro «En pausa»
  await p.evaluate(() => navigate('cartera'));
  await p.locator('[data-cp-tabla]').waitFor({ timeout: 10000 });
  await p.locator('[data-cp-filtro="pausa"]').click();
  const enPausa = await p.locator('[data-cp-fila]').evaluateAll(els => els.map(e => e.dataset.cpFila));
  ok(`${tag} · Cartera «En pausa»: Pablo y Ana (enfermedad hoy)`, enPausa.includes('c5') && enPausa.includes('c0'), JSON.stringify(enPausa));
  if (tag === 'telefono') ok(`${tag} · sin scroll de lado`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  ok(`${tag} · sin errores`, errores.length === 0, errores.join(' | '));
  await ctx.close();
}
await b.close(); servidor.close();
console.log(mal ? `\n${mal} falla(s)` : '\ntodo bien');
process.exit(mal ? 1 : 0);
