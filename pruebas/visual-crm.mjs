// El CRM entero en Chromium, con datos de ejemplo y sin red: saca capturas
// de cada sección (escritorio y teléfono) a pruebas/capturas/ y revisa que
// no haya errores de JavaScript ni scroll de lado en el teléfono.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/visual-crm.mjs
//
// Tailwind y supabase-js vienen de CDNs: aquí se reemplazan. TAILWIND_CSS es
// el CSS compilado de Tailwind para las clases del CRM (sin él la página se
// ve sin utilidades, pero la prueba corre igual).
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

// ── Datos de ejemplo ──
function datos(hoyISO) {
  const hoy = new Date(hoyISO + 'T12:00:00');
  const semanaISO = (d) => {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dia = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dia);
    const ini = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - ini) / 86400000 + 1) / 7)).padStart(2, '0')}`;
  };
  const nombres = ['Ana Pérez', 'Carlos Ruiz', 'Lucía Gómez', 'Andrés Mejía', 'Valentina Ríos', 'Jorge Salas', 'Camila Duarte', 'Felipe Torres'];
  const clientes = nombres.map((nombre, i) => ({
    id: 'c' + i, user_id: 'coach-1', nombre, sexo: i % 2 ? 'M' : 'F', ciudad: ['Bogotá', 'Medellín', 'Cali', 'Miami'][i % 4],
    objetivo: ['Bajar grasa', 'Ganar músculo', 'Recomposición', 'Rendimiento'][i % 4], meta_especifica: 'Llegar a 72 kg con más fuerza',
    lugar_entreno: ['gym', 'casa', 'mixto'][i % 3], dias_entreno_cantidad: 3 + (i % 3), dias_entreno: ['L', 'X', 'V', 'S'].slice(0, 3 + (i % 2)),
    monto: i === 7 ? 120 : 280000 + i * 20000, moneda: i === 7 ? 'USD' : 'COP', dia_pago: [5, 10, 15, 20, 1, 28, 12, 3][i],
    fecha_inicio: `2026-0${1 + (i % 8)}-0${1 + (i % 9)}`, estado: i === 6 ? 'pausa' : 'activo', canal_adquisicion: ['instagram', 'referido', 'web'][i % 3],
    tags: i % 3 ? ['online'] : ['online', 'presencial'], dias_gracia: 3, created_at: '2026-01-01T00:00:00Z',
  }));
  const pagos = [], seguimientos = [], pendientes = [];
  for (const c of clientes) {
    for (let m = 1; m <= hoy.getMonth() + 1; m++) {
      const mes = `${hoy.getFullYear()}-${String(m).padStart(2, '0')}`;
      const pagado = !(c.id === 'c3' && m === hoy.getMonth() + 1) && !(c.id === 'c5' && m >= hoy.getMonth());
      pagos.push({ id: `p-${c.id}-${m}`, user_id: 'coach-1', cliente_id: c.id, mes, pagado, monto: c.monto, moneda: c.moneda, fecha_pago: pagado ? `${mes}-0${(m % 9) + 1}` : null });
    }
    for (let k = 0; k < 8; k++) {
      const d = new Date(hoy); d.setDate(d.getDate() - 7 * k);
      if (c.id === 'c4' && k < 3) continue;   // alguien que dejó de reportar
      const base = 6 + ((c.id.charCodeAt(1) + k) % 4);
      seguimientos.push({
        id: `s-${c.id}-${k}`, user_id: 'coach-1', cliente_id: c.id, semana: semanaISO(d), fecha: d.toISOString().slice(0, 10),
        adherencia_entreno: Math.min(10, base), adherencia_alimentacion: Math.max(3, base - (k % 3)), adherencia_descanso: Math.min(10, base - 1 + (k % 2)),
        dias_planeados: c.dias_entreno_cantidad, dias_asistidos: Math.max(1, c.dias_entreno_cantidad - (k % 2)), dias_entrenados: ['L', 'X', 'V'],
        estado: 'hecho', estado_animo: ['excelente', 'bien', 'neutro', 'bien'][k % 4], avances: k ? '' : 'Subió 2,5 kg en sentadilla.', created_at: d.toISOString(),
      });
    }
  }
  pendientes.push(
    { id: 'pe1', user_id: 'coach-1', cliente_id: 'c0', para: 'cliente', descripcion: 'Enviar fotos de progreso', prioridad: 'alta', estado: 'abierto', fecha_limite: hoyISO, created_at: hoyISO },
    { id: 'pe2', user_id: 'coach-1', cliente_id: 'c2', para: 'coach', descripcion: 'Ajustar macros de la fase 3', prioridad: 'media', estado: 'abierto', created_at: hoyISO },
    { id: 'pe3', user_id: 'coach-1', cliente_id: null, para: 'coach', descripcion: 'Grabar cápsula de sueño', prioridad: 'baja', estado: 'abierto', created_at: hoyISO },
  );
  const mediciones_corporales = clientes.slice(0, 4).flatMap(c => [0, 30, 60].map((dd, j) => {
    const d = new Date(hoy); d.setDate(d.getDate() - dd);
    return { id: `m-${c.id}-${j}`, cliente_id: c.id, fecha: d.toISOString().slice(0, 10), peso: 78 - j * 0.9, grasa: 22 - j * 0.6 };
  }));
  return {
    clientes, pagos, seguimientos, pendientes, mediciones_corporales,
    settings: [{ user_id: 'coach-1', usd_cop_rate: 4000, nombre_coach: 'Mauro' }],
    metas_historial: [], nutricion_insights: [], ia_uso: [], push_pago_log: [], fases: [], rutinas: [], sesiones: [],
    comunidad_posts: [{ id: 'cp1', user_id: 'coach-1', texto: 'Esta semana: 3 entrenos y 8 horas de sueño.', fijado: true, publicado_en: hoyISO + 'T12:00:00Z', borrado_en: null }],
    comunidad_reacciones: [{ post_id: 'cp1', cliente_id: 'c0', tipo: 'fuego', creado_en: new Date().toISOString() }, { post_id: 'cp1', cliente_id: 'c1', tipo: 'fuerza', creado_en: '2020-01-01T00:00:00Z' }],
    comunidad_comentarios: [{ id: 'k1', post_id: 'cp1', cliente_id: 'c0', texto: '¡Vamos con todo!', creado_en: new Date().toISOString(), borrado_en: null },
      { id: 'k2', post_id: 'cp1', cliente_id: 'c1', texto: 'Comentario que no gusta', creado_en: new Date().toISOString(), borrado_en: null }],
    comunidad_vistas: [{ post_id: 'cp1', cliente_id: 'c0' }, { post_id: 'cp1', cliente_id: 'c1' }, { post_id: 'cp1', cliente_id: 'c2' }],
  };
}

const hoy = new Date().toISOString().slice(0, 10);
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let mal = 0;
const ok = (nombre, c, extra = '') => { if (!c) mal++; console.log(`  ${c ? 'ok ' : 'MAL'}  ${nombre}${c ? '' : '  ' + extra}`); };

async function abrir(ancho, alto) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: ancho > 1500 ? 1 : 2 });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(e.message));
  await ctx.addInitScript((t) => { window.TABLAS_FALSAS = t; }, datos(hoy));
  await p.route('**/*', (ruta) => {
    const u = ruta.request().url();
    if (u.startsWith(BASE)) return ruta.continue();
    if (u.includes('cdn.tailwindcss.com')) return ruta.fulfill({ contentType: 'text/javascript', body: `(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(tailwind)};document.head.prepend(s);window.tailwind={config:{}};})();` });
    if (u.includes('supabase-js')) return ruta.fulfill({ contentType: 'text/javascript', body: falso });
    if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return ruta.continue().catch(() => ruta.abort());
    // Las bases de otros proyectos (centro, Mealtracker) devuelven listas.
    return ruta.fulfill({ status: 200, contentType: 'application/json', body: u.includes('/rest/v1/') ? '[]' : '{}' });
  });
  await p.goto(BASE + '/');
  await p.locator('#app-screen').waitFor({ state: 'visible', timeout: 20000 });
  await p.waitForTimeout(1200);
  return { ctx, p, errores };
}

const SECCIONES = ['dashboard', 'seguimiento', 'pagos', 'pendientes', 'clientes', 'nutricion', 'negocio', 'ajustes'];
const TAMANOS = process.env.SOLO_ANCHO ? [[Number(process.env.SOLO_ANCHO), 1080, 'ancho']] : [[1440, 900, 'escritorio'], [390, 844, 'telefono']];
for (const [ancho, alto, tag] of TAMANOS) {
  const { ctx, p, errores } = await abrir(ancho, alto);
  const extra = await p.evaluate(() => [...document.querySelectorAll('#main-nav [data-view]')].map(x => x.dataset.view));
  for (const s of [...new Set([...SECCIONES, ...extra])]) {
    const btn = p.locator(`#main-nav [data-view="${s}"]`);
    if (!(await btn.count())) continue;
    await btn.first().click();
    await p.waitForTimeout(900);
    await p.screenshot({ path: path.join(CAPTURAS, `crm-${tag}-${s}.png`), fullPage: tag !== 'telefono' });
    if (tag === 'ancho') console.log(`  alto ${s}: ${await p.evaluate(() => document.documentElement.scrollHeight)}`);
    if (tag === 'telefono') ok(`${tag} · ${s}: sin scroll de lado`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  if (tag !== 'telefono') {
    // Comunidad: el alcance de lo publicado y publicar algo nuevo
    // El recorrido de arriba ya pasó por Comunidad: se vuelve a «sin ver».
    await p.locator('#main-nav [data-view="dashboard"]').click(); await p.waitForTimeout(500);
    await p.evaluate(async () => { localStorage.removeItem('com:vistoEn:v1'); await comContarNuevos(); });
    ok(`${tag} · comunidad: el menú avisa lo nuevo (2 comentarios + 1 reacción)`, (await p.locator('#main-nav [data-view="comunidad"] .em-com-aviso').innerText().catch(() => '')) === '3');
    await p.locator('#main-nav [data-view="comunidad"]').click(); await p.waitForTimeout(700);
    ok(`${tag} · comunidad: «Lo nuevo» con los comentarios y la reacción, y el aviso se va`, (await p.locator('#com-lo-nuevo [data-com-nuevo="comentario"]').count()) === 2
      && (await p.locator('#com-lo-nuevo [data-com-nuevo="reaccion"]').count()) === 1 && (await p.locator('#main-nav .em-com-aviso').count()) === 0);
    p.once('dialog', d => d.accept());
    await p.locator('[data-com-comentario="k2"] button').click(); await p.waitForTimeout(700);
    ok(`${tag} · comunidad: borrar un comentario`, (await p.locator('[data-com-comentario="k2"]').count()) === 0 && (await p.locator('[data-com-comentario="k1"]').count()) === 1);
    await p.fill('[data-com-post="cp1"] [data-com-responder]', 'Así se hace');
    await p.locator('[data-com-post="cp1"] [data-com-responder]').press('Enter'); await p.waitForTimeout(700);
    ok(`${tag} · comunidad: responder como coach`, /Tú \(coach\)[\s\S]*Así se hace/.test(await p.locator('[data-com-post="cp1"] [data-com-comentarios]').innerText()));
    await p.locator('[data-com-post="cp1"] [data-com-editar]').click(); await p.waitForTimeout(500);
    await p.fill('#com-edit-cp1', 'Esta semana: 4 entrenos y 8 horas de sueño.');
    await p.locator('[data-com-post="cp1"] [data-com-guardar]').click(); await p.waitForTimeout(700);
    ok(`${tag} · comunidad: editar la publicación`, /4 entrenos/.test(await p.locator('[data-com-post="cp1"] [data-com-texto]').innerText()) && /editada/.test(await p.locator('[data-com-post="cp1"]').innerText()));
    ok(`${tag} · comunidad: alcance (3 de 7 la vieron) y reacciones`, /3<\/strong> de 7 la vieron/.test(await p.locator('[data-com-post="cp1"] [data-com-alcance]').innerHTML()));
    ok(`${tag} · comunidad: el menú tiene su ícono`, (await p.locator('#main-nav [data-view="comunidad"] svg').count()) === 1);
    await p.fill('#com-texto', 'Reto de la semana: 10.000 pasos diarios.');
    await p.click('#com-publicar'); await p.waitForTimeout(800);
    ok(`${tag} · comunidad: publicar la deja en la lista`, (await p.locator('[data-com-post]').count()) === 2 && /10\.000 pasos/.test(await p.locator('#com-lista').innerText()));
    await p.screenshot({ path: path.join(CAPTURAS, `crm-${tag}-comunidad-publicada.png`), fullPage: true });
  }
  ok(`${tag}: sin errores de JavaScript`, errores.length === 0, errores.slice(0, 3).join(' | '));
  await ctx.close();
}
await b.close();
servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
