// «Crear ejercicio nuevo» (ejercicio-nuevo.js): desde la Galería y desde el
// constructor de rutinas. La IA busca el video en YouTube, llena la ficha, el
// coach revisa y recién ahí se crea (y, desde la rutina, queda añadido).
//
//   node pruebas/ejercicio-nuevo.mjs
import { createRequire } from 'module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const require_ = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require_('playwright')); }
catch { console.error('Falta playwright (npm i -D playwright, o NODE_PATH=…)'); process.exit(2); }

const RAIZ = path.join(import.meta.dirname, '..');
const CAPTURAS = process.env.CAPTURAS || path.join(import.meta.dirname, 'capturas');
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
  patron: 'push', musculos_primarios: ['pecho'], musculos_secundarios: [], claves_tecnicas: ['Uno'], errores_tecnicos: ['Dos'], ...extra });
const tablas = () => ({
  clientes: [{ id: 'c1', user_id: 'coach-1', nombre: 'Ana Pérez', estado: 'activo', created_at: '2026-01-01T00:00:00Z' }],
  settings: [{ user_id: 'coach-1', usd_cop_rate: 4000, nombre_coach: 'Mauro' }],
  fases: [{ id: 'f1', cliente_id: 'c1', nombre: 'Ciclo 1', estado: 'activa', fecha_inicio: '2026-11-02', semanas: 4, visible_cliente: true }],
  rutinas: [{ id: 'r1', fase_id: 'f1', cliente_id: 'c1', nombre: 'Día A', archivada: false, orden: 1 }],
  rutina_ejercicios: [{ id: 'x1', rutina_id: 'r1', ejercicio_id: 'e1', orden: 1, series: 3, reps: '8-12', ejercicios: null }],
  musculos: [M('pecho', 'Pecho', 'torso', 1), M('oblicuos', 'Oblicuos', 'core', 2), M('recto_abdominal', 'Abdomen', 'core', 3), M('transverso', 'Transverso', 'core', 4), M('gluteo_medio', 'Glúteo medio', 'piernas', 5)],
  ejercicios: [ej('e1', 'Press de banca con barra', 'Barbell Bench Press')],
  sesiones: [], series_log: [], eventos: [], evento_registros: [], actividades: [], ejercicio_video_estado: [], ejercicios_nombre_respaldo: [],
});
// Respuesta simulada de la búsqueda: un link inventado (no es YouTube) y uno repetido se descartan.
const VIDEOS = { nombre_es: 'Pallof press con banda', nombre_en: 'Banded Pallof Press', videos: [
  { url: 'https://www.youtube.com/watch?v=AbCdEfGhIj1', titulo: 'Pallof Press – técnica correcta', canal: 'Fisio Activo', por_que: 'De frente, cuerpo entero, 40 segundos' },
  { url: 'https://www.youtube.com/shorts/ZyXwVuTsRq2', titulo: 'Banded Pallof Press', canal: 'Strength Lab', por_que: 'Short de lado, se ve el core' },
  { url: 'https://vimeo.com/123', titulo: 'Otro', canal: 'x' },
  { url: 'https://youtu.be/AbCdEfGhIj1', titulo: 'Repetido', canal: 'y' },
] };
const FICHA = { patron: 'core', primarios: ['oblicuos', 'transverso', 'inventado'], secundarios: ['recto_abdominal', 'gluteo_medio'], claves: ['Brazos estirados al frente', 'Cadera y hombros mirando al frente', 'Resiste el giro 2 segundos'], errores: ['Girar el tronco hacia la banda', 'Arquear la espalda', 'Banda floja'], tambien: ['estabilidad'] };
const MINI = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#2A2A2E"/><circle cx="160" cy="90" r="26" fill="#E53935"/><path d="M152 76 L172 90 L152 104 Z" fill="#fff"/></svg>`;

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let mal = 0;
const ok = (nombre, c, extra = '') => { if (!c) mal++; console.log(`  ${c ? 'ok ' : 'MAL'}  ${nombre}${c ? '' : '  ' + extra}`); };
for (const [ancho, alto] of [[1440, 1000], [390, 844]]) {
  console.log(`\n${ancho} px`);
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: Number(process.env.DSF || 1) });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(e.message));
  p.on('dialog', d => d.accept());
  await ctx.addInitScript((t) => { window.TABLAS_FALSAS = t; }, tablas());
  const pedidos = [];
  let videoFalla = false;
  await p.route('**/*', (ruta) => {
    const u = ruta.request().url();
    if (u.includes('/api/coach-ask')) {
      const cuerpo = JSON.parse(ruta.request().postData() || '{}');
      pedidos.push(cuerpo);
      if (cuerpo.perfil === 'video') {
        if (videoFalla) return ruta.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"búsqueda no disponible"}' });
        return ruta.fulfill({ contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'server_tool_use' }, { type: 'web_search_tool_result' }, { type: 'text', text: 'Encontré estos:\n' + JSON.stringify(VIDEOS) }] }) });
      }
      const q = JSON.parse(cuerpo.messages[0].content);
      const resp = Object.fromEntries(q.ejercicios.map(e => [e.id, FICHA]));
      return ruta.fulfill({ contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(resp) }] }) });
    }
    if (u.includes('i.ytimg.com')) return ruta.fulfill({ contentType: 'image/svg+xml', body: MINI });
    if (u.includes('youtube-nocookie.com')) return ruta.fulfill({ contentType: 'text/html', body: `<body style="margin:0;background:#111;display:grid;place-items:center;height:100vh">${MINI}</body>` });
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
  await p.locator('[data-crear-ejercicio]').waitFor({ timeout: 15000 });

  // ── 1. Desde la Galería ──
  await p.locator('[data-crear-ejercicio]').click();
  await p.locator('[data-ejercicio-nuevo]').waitFor({ timeout: 5000 });
  ok('el botón «Crear» queda apagado hasta llenar la ficha', await p.locator('[data-en-crear]').isDisabled());
  await p.fill('#en-nombre', 'pallof press');
  await p.locator('[data-en-buscar]').click();
  await p.locator('[data-en-video="1"]').waitFor({ timeout: 10000 });
  await p.waitForTimeout(400);
  const pv = pedidos.find(x => x.perfil === 'video');
  ok('pide la búsqueda con el perfil «video» y el nombre', pv && JSON.parse(pv.messages[0].content).ejercicio === 'pallof press', JSON.stringify(pv || {}).slice(0, 200));
  ok('muestra 2 videos: descarta el link que no es YouTube y el repetido', await p.locator('[data-en-video]').count() === 2);
  ok('el primero queda elegido y se puede ver ahí mismo', await p.locator('[data-en-video="0"].on iframe').count() === 1);
  await p.locator('[data-en-video="1"]').click();
  await p.waitForTimeout(300);
  ok('al tocar otro, ese queda elegido', await p.locator('[data-en-video="1"].on iframe').count() === 1 && !(await p.locator('[data-en-video="0"].on').count()));
  if (ancho === 1440) await p.locator('.modal, [role="dialog"]').first().screenshot({ path: path.join(CAPTURAS, 'ejercicio-nuevo-1-videos.png') }).catch(() => p.screenshot({ path: path.join(CAPTURAS, 'ejercicio-nuevo-1-videos.png') }));
  await p.locator('[data-en-ficha]').click();
  await p.locator('#en-f-alias').waitFor({ timeout: 10000 });
  await p.waitForTimeout(300);
  const pf = pedidos.find(x => x.perfil === 'ficha');
  const qf = pf ? JSON.parse(pf.messages[0].content) : {};
  ok('la ficha se pide con el nombre que dio la búsqueda y todo lo que falta', qf.ejercicios && qf.ejercicios[0].nombre === 'Pallof press con banda' && qf.ejercicios[0].falta.includes('claves') && qf.ejercicios[0].falta.includes('musculos'), JSON.stringify(qf.ejercicios || []));
  ok('nombres: español e inglés ya puestos', await p.inputValue('#en-f-nombre') === 'Pallof press con banda' && await p.inputValue('#en-f-alias') === 'Banded Pallof Press');
  ok('músculos marcados (sin el inventado)', await p.locator('.en-prim:checked').count() === 2 && await p.locator('.en-sec:checked').count() === 2);
  ok('cómo hacerlo bien y errores llenos', (await p.inputValue('#en-f-claves')).split('\n').length === 3 && (await p.inputValue('#en-f-errores')).split('\n').length === 3);
  ok('nada guardado todavía', (await p.evaluate(() => window.TABLAS_FALSAS.ejercicios.length)) === 1);
  if (ancho === 1440) {
    await p.evaluate(() => document.querySelector('[data-en-ficha-caja]').scrollIntoView());
    await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(CAPTURAS, 'ejercicio-nuevo-2-ficha.png') });
  }
  if (ancho === 390) await p.screenshot({ path: path.join(CAPTURAS, 'ejercicio-nuevo-movil.png'), fullPage: false });
  // El coach corrige una clave y crea.
  await p.fill('#en-f-claves', 'Brazos estirados al frente\nCadera y hombros al frente\nResiste el giro 2 segundos.');
  await p.locator('[data-en-crear]').click();
  await p.waitForTimeout(1200);
  const t = await p.evaluate(() => window.TABLAS_FALSAS.ejercicios);
  const n = t.find(e => e.nombre === 'Pallof press con banda');
  ok('se creó con su video, nombres, patrón, músculos, claves y errores', n && n.alias === 'Banded Pallof Press' && n.video_fuente === 'youtube' && n.video_ref === 'ZyXwVuTsRq2' && n.patron === 'core'
    && n.musculos_primarios.join() === 'oblicuos,transverso' && n.musculos_secundarios.join() === 'recto_abdominal,gluteo_medio'
    && n.claves_tecnicas.join('|') === 'Brazos estirados al frente|Cadera y hombros al frente|Resiste el giro 2 segundos' && n.errores_tecnicos.length === 3, JSON.stringify(n));
  ok('nada más cambió en la galería', t.length === 2 && t.find(e => e.id === 'e1').alias === 'Barbell Bench Press');
  ok('aparece en la Galería', /Banded Pallof Press/.test(await p.locator('#flt-lista').innerText()));

  // ── 2. Desde el constructor: la búsqueda falla, pega su link, y queda añadido ──
  videoFalla = true;
  await p.evaluate(() => entAbrirConstructor('r1'));
  await p.waitForFunction(() => _ent.rutina && _ent.rutina.id === 'r1' && document.querySelector('#cons-col-rutina .ent-fila'), null, { timeout: 15000 });
  await p.waitForTimeout(500);
  ok('el constructor tiene «+ Crear ejercicio»', await p.locator('[data-crear-ejercicio-rutina]').isVisible());
  if (ancho === 1440) await p.locator('#cons-col-gal').screenshot({ path: path.join(CAPTURAS, 'ejercicio-nuevo-3-constructor.png') });
  const antes = await p.locator('#cons-col-rutina .ent-fila').count();
  await p.locator('[data-crear-ejercicio-rutina]').click();
  await p.fill('#en-nombre', 'Remo con mancuerna a una mano');
  await p.locator('[data-en-buscar]').click();
  await p.waitForTimeout(800);
  ok('si la búsqueda falla, lo dice y deja pegar el link', /No pude buscar con IA/.test(await p.locator('[data-en-videos]').innerText()));
  await p.fill('#en-link', 'https://youtu.be/QqWwEeRrTt3');
  await p.waitForTimeout(300);
  ok('el link pegado queda como video elegido', await p.locator('[data-en-video="0"].on').count() === 1);
  await p.locator('[data-en-ficha]').click();
  await p.locator('#en-f-alias').waitFor({ timeout: 10000 });
  ok('el botón dice «Crear ejercicio y añadirlo»', /y añadirlo/.test(await p.locator('[data-en-crear]').innerText()));
  await p.fill('#en-f-alias', 'One Arm Dumbbell Row');
  await p.locator('[data-en-crear]').click();
  await p.waitForTimeout(1800);
  const t2 = await p.evaluate(() => window.TABLAS_FALSAS);
  const r = t2.ejercicios.find(e => e.nombre === 'Remo con mancuerna a una mano');
  ok('se creó con el link pegado', r && r.video_ref === 'QqWwEeRrTt3' && r.alias === 'One Arm Dumbbell Row', JSON.stringify(r));
  ok('quedó añadido a la rutina', r && t2.rutina_ejercicios.some(x => x.rutina_id === 'r1' && x.ejercicio_id === r.id) && await p.locator('#cons-col-rutina .ent-fila').count() === antes + 1);
  if (ancho === 1440) await p.locator('#cons-col-rutina').screenshot({ path: path.join(CAPTURAS, 'ejercicio-nuevo-4-rutina.png') });
  ok('sin errores de JavaScript', !errores.length, errores.join(' | '));
  await ctx.close();
}
await b.close();
servidor.close();
console.log(mal ? `\n${mal} con problemas` : '\ntodo bien');
process.exit(mal ? 1 : 0);
