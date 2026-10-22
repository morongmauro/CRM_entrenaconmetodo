// El ciclo en curso lo decide la fecha: cuando arranca el siguiente (enviado),
// el anterior pasa solo a «finalizada», y la pantalla abre en el nuevo.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/ciclo-vigente.mjs
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

const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fase = (id, nombre, empiezaEn, orden, estado, enviada) => ({ id, cliente_id: 'c0', user_id: 'coach-1', nombre, semanas: 4, estado,
  visible_cliente: enviada, fecha_inicio: iso(empiezaEn), orden, created_at: '2026-01-01T00:00:00Z' });
function tablas(escenario) {
  const clientes = [{ id: 'c0', user_id: 'coach-1', nombre: 'Ana Pérez', estado: 'activo', monto: 1, moneda: 'COP', dia_pago: 5, created_at: '2026-01-01T00:00:00Z' }];
  const fases = escenario === 'futuro'
    ? [fase('f1', 'Ciclo 1', -20, 1, 'activa', true), fase('f2', 'Ciclo 2', 8, 2, 'activa', true)]       // el nuevo todavía no arranca
    : escenario === 'sin-enviar'
      ? [fase('f1', 'Ciclo 1', -40, 1, 'activa', true), fase('f2', 'Ciclo 2', -1, 2, 'activa', false)]  // arrancó pero NO está enviado
      : [fase('f1', 'Ciclo 1', -40, 1, 'activa', true), fase('f2', 'Ciclo 2', -1, 2, 'activa', true)];  // arrancó ayer, enviado
  const rutinas = [
    { id: 'r1', cliente_id: 'c0', fase_id: 'f1', user_id: 'coach-1', nombre: 'Push', dia_orden: 1, dias_semana: ['L'], archivada: false },
    { id: 'r2', cliente_id: 'c0', fase_id: 'f2', user_id: 'coach-1', nombre: 'Full', dia_orden: 1, dias_semana: ['L'], archivada: false },
  ];
  return { clientes, fases, rutinas, seguimientos: [], pagos: [], pendientes: [], mediciones_corporales: [], settings: [{ user_id: 'coach-1', usd_cop_rate: 4000, nombre_coach: 'Mauro' }],
    metas_historial: [], nutricion_insights: [], ia_uso: [], push_pago_log: [], rutina_ejercicios: [], sesiones: [], series_log: [], ejercicios: [],
    comunidad_posts: [], comunidad_reacciones: [], comunidad_comentarios: [], comunidad_vistas: [], ejercicios_no_sirven: [], comentarios_coach: [] };
}
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let mal = 0;
const ok = (nombre, c, extra = '') => { if (!c) mal++; console.log(`  ${c ? 'ok ' : 'MAL'}  ${nombre}${c ? '' : '  ' + extra}`); };

async function abrir(escenario) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(e.message));
  p.on('dialog', d => d.accept());
  await ctx.addInitScript((t) => { window.TABLAS_FALSAS = t; }, tablas(escenario));
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
  await p.waitForTimeout(800);
  // Entrenamiento del cliente c0
  await p.evaluate(() => { _ent.tab = 'clientes'; _ent.clienteId = 'c0'; _ent.faseId = null; return navigate('entrenamiento'); });
  await p.waitForSelector('[data-tab-ent="fases"], select[onchange^="entVerFase"]', { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(800);
  return { ctx, p, errores };
}
const estados = (p) => p.evaluate(() => Object.fromEntries(window.TABLAS_FALSAS.fases.map(f => [f.id, f.estado])));
const selector = (p) => p.evaluate(() => { const s = document.querySelector('select[onchange^="entVerFase"]'); return s ? { valor: s.value, texto: s.innerText.replace(/\s+/g, ' ') } : null; });

{
  console.log('\narrancó ayer, enviado');
  const { ctx, p, errores } = await abrir('hoy');
  const e = await estados(p);
  ok('el ciclo anterior pasa solo a «finalizada»', e.f1 === 'finalizada' && e.f2 === 'activa', JSON.stringify(e));
  const s = await selector(p);
  ok('la pantalla abre en el ciclo nuevo', s && s.valor === 'f2', JSON.stringify(s));
  ok('el selector dice «en curso» en el nuevo y «terminado» en el viejo', s && /Ciclo 2 · en curso/.test(s.texto) && /Ciclo 1 · terminado/.test(s.texto), s && s.texto);
  await p.evaluate(() => entSubtab && entSubtab('fases')).catch(() => {});
  await p.waitForTimeout(600);
  const chips = await p.evaluate(() => [...document.querySelectorAll('[data-ciclo-etiqueta]')].map(x => x.innerText.trim()));
  ok('en la pestaña Ciclos, la etiqueta por ciclo', chips.includes('en curso') && chips.includes('terminado'), JSON.stringify(chips));
  await p.screenshot({ path: path.join(CAPTURAS, 'ciclo-vigente.png'), fullPage: false });
  ok('sin errores de JavaScript', errores.length === 0, errores.join(' | '));
  await ctx.close();
}
{
  console.log('\nel nuevo todavía no arranca');
  const { ctx, p, errores } = await abrir('futuro');
  const e = await estados(p);
  ok('nada cambia: los dos siguen «activa»', e.f1 === 'activa' && e.f2 === 'activa', JSON.stringify(e));
  const s = await selector(p);
  ok('la pantalla abre en el que va hoy', s && s.valor === 'f1', JSON.stringify(s));
  ok('el que viene dice «empieza el …»', s && /Ciclo 2 · empieza el/.test(s.texto), s && s.texto);
  ok('sin errores de JavaScript', errores.length === 0, errores.join(' | '));
  await ctx.close();
}
{
  console.log('\narrancó pero no está enviado');
  const { ctx, p, errores } = await abrir('sin-enviar');
  const e = await estados(p);
  ok('el anterior NO se cierra (el cliente se quedaría sin ciclo)', e.f1 === 'activa', JSON.stringify(e));
  ok('sin errores de JavaScript', errores.length === 0, errores.join(' | '));
  await ctx.close();
}

await b.close();
servidor.close();
console.log(mal ? `\n${mal} MAL` : '\ntodo bien');
process.exit(mal ? 1 : 0);
