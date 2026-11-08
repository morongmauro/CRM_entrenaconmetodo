// Galería · «Ficha incompleta» y «Completar con IA» (fichas-ia.js): cuenta
// las fichas completas, la IA propone solo lo que falta, el coach revisa y
// guardar solo llena lo vacío (no pisa nada).
//
//   node pruebas/fichas-ia.mjs
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
const falso = fs.readFileSync(path.join(import.meta.dirname, 'arnes', 'supabase-falso.js'), 'utf8');


const M = (slug, corto, grupo, orden) => ({ slug, corto, nombre: corto, grupo, orden });
const ej = (id, nombre, alias, extra = {}) => ({ id, user_id: 'coach-1', nombre, alias, busqueda: null, tipo: 'fuerza', segmento: 'tren_superior', equipo: 'mancuernas', video_fuente: 'youtube', video_ref: 'v' + id, archivado: false,
  patron: null, musculos_primarios: [], musculos_secundarios: [], claves_tecnicas: [], errores_tecnicos: [], ...extra });
const tablas = () => ({
  clientes: [{ id: 'c1', user_id: 'coach-1', nombre: 'Ana Pérez', estado: 'activo', created_at: '2026-01-01T00:00:00Z' }],
  settings: [{ user_id: 'coach-1', usd_cop_rate: 4000, nombre_coach: 'Mauro' }],
  fases: [{ id: 'f1', cliente_id: 'c1', estado: 'activa', fecha_inicio: '2026-10-01', semanas: 8, visible_cliente: true }],
  rutinas: [{ id: 'r1', fase_id: 'f1', cliente_id: 'c1', nombre: 'Push', archivada: false }],
  rutina_ejercicios: [{ id: 'x1', rutina_id: 'r1', ejercicio_id: 'e1' }],
  musculos: [M('pecho', 'Pecho', 'torso', 1), M('triceps', 'Tríceps', 'brazos', 2), M('deltoides_anterior', 'Hombro frontal', 'hombros', 3), M('cuadriceps', 'Cuádriceps', 'piernas', 4), M('gluteo_mayor', 'Glúteo', 'piernas', 5)],
  ejercicios: [
    ej('e1', 'Press de banca con barra', 'Barbell Bench Press'),
    ej('e2', 'Sentadilla goblet', 'Goblet Squat', { patron: 'rodilla', claves_tecnicas: ['Pecho arriba'] }),
    ej('e3', 'Fondos en paralelas', 'Dips', { patron: 'push', musculos_primarios: ['triceps'], claves_tecnicas: ['Hombros abajo'], errores_tecnicos: ['Bajar sin control'] }),
  ],
  sesiones: [], series_log: [], eventos: [], evento_registros: [], actividades: [], ejercicio_video_estado: [], ejercicios_nombre_respaldo: [],
});
// La IA simulada: devuelve todo (también lo que no falta, y un músculo que no existe).
const IA = {
  e1: { patron: 'push', primarios: ['pecho', 'inventado'], secundarios: ['triceps', 'deltoides_anterior', 'pecho'], claves: ['Escápulas juntas', 'Pies firmes en el piso', 'Barra al pecho bajo'], errores: ['Rebotar la barra en el pecho', 'Despegar la cadera del banco', 'Abrir los codos a 90°'] },
  e2: { patron: 'cadera', primarios: ['cuadriceps'], secundarios: ['gluteo_mayor'], claves: ['Otra cosa'], errores: ['Levantar los talones', 'Rodillas hacia adentro', 'Redondear la espalda'] },
};

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let mal = 0;
const ok = (nombre, c, extra = '') => { if (!c) mal++; console.log(`  ${c ? 'ok ' : 'MAL'}  ${nombre}${c ? '' : '  ' + extra}`); };
for (const [ancho, alto] of [[1440, 1000], [390, 844]]) {
  console.log(`\n${ancho} px`);
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(e.message));
  p.on('dialog', d => d.accept());
  await ctx.addInitScript((t) => { window.TABLAS_FALSAS = t; }, tablas());
  let pedidos = [];
  await p.route('**/*', (ruta) => {
    const u = ruta.request().url();
    if (u.includes('/api/coach-ask')) {
      const cuerpo = JSON.parse(ruta.request().postData() || '{}');
      pedidos.push(cuerpo);
      // En el teléfono, la primera tanda falla (servicio ocupado): se reintenta sola.
      if (ancho === 390 && pedidos.length === 1) return ruta.fulfill({ status: 529, contentType: 'application/json', body: '{"error":"ocupado"}' });
      const pedido = JSON.parse(cuerpo.messages[0].content);
      const resp = Object.fromEntries(pedido.ejercicios.map(e => [e.id, IA[e.id] || {}]));
      return ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(resp) }] }) });
    }
    if (u.startsWith(BASE)) return ruta.continue();
    if (u.includes('supabase-js')) return ruta.fulfill({ contentType: 'text/javascript', body: falso });
    if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return ruta.continue().catch(() => ruta.abort());
    return ruta.fulfill({ status: 200, contentType: 'application/json', body: u.includes('/rest/v1/') ? '[]' : '{}' });
  });
  await p.goto(BASE + '/');
  await p.locator('#app-screen').waitFor({ state: 'visible', timeout: 20000 });
  await p.waitForTimeout(600);
  await p.evaluate(() => navigate('entrenamiento'));
  await p.waitForTimeout(800);
  await p.evaluate(() => { if (window.entTab) entTab('ejercicios'); });
  await p.locator('[data-niveles-revision] [data-nivel="fichas"]').waitFor({ timeout: 15000 });
  ok('resumen: 2 con ficha incompleta', /2\s*ejercicios/.test(await p.locator('[data-niveles-revision] [data-nivel="fichas"]').innerText()));
  await p.locator('[data-nivel="fichas"]').click(); await p.waitForTimeout(700);
  const cab = await p.locator('[data-fi-cabecera]').innerText();
  ok('cabecera: «Fichas completas: 1 de 3» y qué falta', /Fichas completas: 1 de 3/.test(cab) && /patrón a 1/.test(cab) && /músculos a 2/.test(cab) && /errores comunes a 2/.test(cab), cab);
  if (ancho === 1440) await p.screenshot({ path: path.join(CAPTURAS, 'fichas-ia-lista.png') });
  await p.locator('[data-fi-completar]').click();
  await p.locator('[data-fi-fila="1"]').waitFor({ timeout: 30000 });
  await p.waitForTimeout(500);
  if (ancho === 390) ok('la tanda que falló se pidió otra vez sola y llegaron las sugerencias', pedidos.length === 2 && (await p.locator('[data-fi-fila="1"]').innerText()).includes('Cuádriceps') && !(await p.locator('[data-fi-reintentar]').count()), String(pedidos.length));
  if (ancho === 390) pedidos.shift();
  ok('pide a la IA con el perfil «ficha», los patrones, los músculos y solo lo que falta', pedidos.length === 1 && pedidos[0].perfil === 'ficha'
    && (() => { const q = JSON.parse(pedidos[0].messages[0].content); const e2 = q.ejercicios.find(x => x.id === 'e2'); return q.musculos.length === 5 && q.patrones.length > 3 && e2 && e2.falta.join() === 'musculos,errores'; })(), JSON.stringify(pedidos[0] || {}).slice(0, 300));
  ok('el que usan los clientes va primero', (await p.locator('[data-fi-fila="0"]').innerText()).includes('Barbell Bench Press'));
  const f2 = await p.locator('[data-fi-fila="1"]').innerText();
  ok('a la sentadilla solo le propone músculos y errores (no cambia su patrón ni sus claves)', !/Patrón/.test(f2) && !/Cómo hacerlo bien/.test(f2) && /Cuádriceps/.test(f2) && /Errores comunes/.test(f2), f2);
  const f1 = await p.locator('[data-fi-fila="0"]').innerText();
  ok('descarta el músculo que no existe y no repite el principal en secundarios', /Pecho/.test(f1) && !/inventado/.test(f1) && (f1.match(/Pecho/g) || []).length === 1, f1);
  if (ancho === 1440) await p.screenshot({ path: path.join(CAPTURAS, 'fichas-ia-revision.png') });
  // El coach corrige una línea antes de guardar.
  await p.locator('[data-fi-errores="1"]').fill('Levantar los talones\nRodillas hacia adentro');
  await p.locator('[data-fi-guardar]').click();
  await p.waitForTimeout(1200);
  const t = await p.evaluate(() => window.TABLAS_FALSAS.ejercicios);
  const e1 = t.find(e => e.id === 'e1'), e2 = t.find(e => e.id === 'e2'), e3 = t.find(e => e.id === 'e3');
  ok('press de banca: queda con patrón, músculos, cómo hacerlo bien y errores', e1.patron === 'push' && e1.musculos_primarios.join() === 'pecho' && e1.musculos_secundarios.join() === 'triceps,deltoides_anterior' && e1.claves_tecnicas.length === 3 && e1.errores_tecnicos.length === 3, JSON.stringify(e1));
  ok('sentadilla: su patrón y sus claves NO se tocan; se guarda lo que corregiste', e2.patron === 'rodilla' && e2.claves_tecnicas.join() === 'Pecho arriba' && e2.errores_tecnicos.join('|') === 'Levantar los talones|Rodillas hacia adentro' && e2.musculos_primarios.join() === 'cuadriceps', JSON.stringify(e2));
  ok('la que ya estaba completa no cambia', e3.errores_tecnicos.join() === 'Bajar sin control' && e3.musculos_primarios.join() === 'triceps');
  ok('nada se borró', t.length === 3);
  await p.waitForTimeout(600);
  ok('después de guardar ya no queda ninguna incompleta', !(await p.locator('[data-fi-completar]').count()) || /3 de 3/.test(await p.locator('[data-fi-cabecera]').innerText()));
  ok('sin errores de JavaScript', !errores.length, errores.join(' | '));
  await ctx.close();
}
await b.close();
servidor.close();
console.log(mal ? `\n${mal} con problemas` : '\ntodo bien');
process.exit(mal ? 1 : 0);
