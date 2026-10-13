// El constructor de rutinas: el agente de rutinas dentro (sabe qué rutina
// está abierta y aplica sin sacarte de ahí) y el video al tocar la vista
// previa de un ejercicio. Mismos datos que asistencia.mjs.
//
//   NODE_PATH=/ruta/node_modules TAILWIND_CSS=/ruta/tailwind.css node pruebas/constructor-agente-video.mjs
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
const fixture = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'arnes', 'asistencia-datos.json'), 'utf8'));
// Con video (YouTube) todos menos los últimos 3, que quedan sin video.
fixture.ejercicios.forEach((e, i) => { if (i < fixture.ejercicios.length - 3) Object.assign(e, { video_fuente: 'youtube', video_ref: 'abcdEFGH' + String(i).padStart(3, '0'), video_inicio_seg: i % 2 ? 4 : null }); });

function tablas() {
  const ej = new Map(fixture.ejercicios.map(e => [e.id, e]));
  // El Supabase falso no resuelve los joins: se dejan puestos en la fila.
  const re = fixture.rutina_ejercicios.map(x => ({ ...x, ejercicios: ej.get(x.ejercicio_id) }));
  const sl = fixture.series_log.map(x => ({ ...x, ejercicios: ej.get(x.ejercicio_id) && { nombre: ej.get(x.ejercicio_id).nombre, alias: ej.get(x.ejercicio_id).alias } }));
  const cliente = {
    id: 'c0', user_id: 'coach-1', nombre: 'Ana Pérez', estado: 'activo', dias_entreno: ['L', 'X'], dias_entreno_cantidad: 2,
    objetivo: 'Ganar músculo', lugar_entreno: 'gym', monto: 280000, moneda: 'COP', dia_pago: 5, fecha_inicio: '2026-01-05', created_at: '2026-01-01T00:00:00Z',
  };
  // Lo que anotaste a mano en esas semanas (para ponerlo al lado de Trainerize).
  const seguimientos = ['2026-W37', '2026-W38', '2026-W39', '2026-W40'].map((semana, k) => ({
    id: 's' + k, user_id: 'coach-1', cliente_id: 'c0', semana, fecha: '2026-09-1' + k, fuerza_planeados: 5, fuerza_ejecutados: [4, 3, 5, 4][k], estado: 'hecho',
  }));
  return {
    clientes: [cliente], seguimientos, pagos: [], pendientes: [], mediciones_corporales: [],
    settings: [{ user_id: 'coach-1', usd_cop_rate: 4000, nombre_coach: 'Mauro' }],
    metas_historial: [], nutricion_insights: [], ia_uso: [], push_pago_log: [],
    fases: fixture.fases, rutinas: fixture.rutinas, rutina_ejercicios: re, rutina_bloques: fixture.rutina_bloques,
    sesiones: fixture.sesiones, series_log: sl, ejercicios: fixture.ejercicios, trainerize_resumen: fixture.trainerize_resumen,
    comunidad_posts: [], comunidad_reacciones: [], comunidad_comentarios: [], comunidad_vistas: [],
  };
}

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let mal = 0;
const ok = (nombre, c, extra = '') => { if (!c) mal++; console.log(`  ${c ? 'ok ' : 'MAL'}  ${nombre}${c ? '' : '  ' + extra}`); };

async function abrir(ancho, alto) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(e.message));
  p.on('dialog', d => d.accept());
  await ctx.addInitScript((t) => { window.TABLAS_FALSAS = t; }, tablas());
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
  await p.waitForTimeout(1000);
  return { ctx, p, errores };
}


const rut = fixture.rutinas.find(r => fixture.fases.find(f => f.id === r.fase_id)?.nombre === 'Ciclo 19');
const enRutina = new Set(fixture.rutina_ejercicios.filter(x => x.rutina_id === rut.id).map(x => x.ejercicio_id));
const nuevo = fixture.ejercicios.find(e => !enRutina.has(e.id) && e.video_fuente === 'youtube' && e.patron === 'push') || fixture.ejercicios.find(e => !enRutina.has(e.id));

for (const [tag, ancho, alto] of [['ancho', 1600, 1000], ['telefono', 390, 844]]) {
  console.log(`\n${tag} (${ancho}px)`);
  const { ctx, p, errores } = await abrir(ancho, alto);

  // El agente: una conversación de mentira (mira la rutina abierta y propone
  // añadir un ejercicio a «esta»).
  const pedidos = [];
  await p.route('**/api/coach-ask', async (ruta) => {
    const body = JSON.parse(ruta.request().postData() || '{}');
    pedidos.push(body);
    const n = pedidos.length;
    const resp = n === 1
      ? { content: [{ type: 'tool_use', id: 't1', name: 'rutina_abierta', input: {} }], stop_reason: 'tool_use', model: 'claude-haiku-5-5', usage: { input_tokens: 1000, output_tokens: 50 } }
      : n === 2
        ? { content: [{ type: 'tool_use', id: 't2', name: 'agregar_ejercicio_a_rutina', input: { rutina: 'esta', ejercicio: nuevo.nombre, series: 3, reps: '10' } }], stop_reason: 'tool_use', model: 'claude-haiku-5-5', usage: { input_tokens: 1200, output_tokens: 60 } }
        : { content: [{ type: 'text', text: 'Te lo dejé propuesto: revísalo y aplícalo.' }], stop_reason: 'end_turn', model: 'claude-haiku-5-5', usage: { input_tokens: 1300, output_tokens: 20 } };
    await ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(resp) });
  });

  await p.evaluate((id) => entAbrirConstructor(id), rut.id);
  await p.waitForFunction(() => document.querySelector('#asi-panel [data-asi-ej]'), null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(300);

  // 1. Está en la tercera columna, arriba de la asistencia, y la asistencia sigue.
  const boton = p.locator('#asi-panel #rut-panel [data-rut-abrir]');
  ok(`${tag} · el agente está en la columna de asistencia del constructor`, await boton.count() === 1);
  ok(`${tag} · dice que es sobre esta rutina`, /esta rutina/i.test(await boton.innerText().catch(() => '')));
  ok(`${tag} · la asistencia sigue debajo (6 filas)`, await p.locator('#asi-panel #asi-contenido [data-asi-ej]').count() === 6);
  if (tag === 'ancho') {
    const pos = await p.evaluate(() => {
      const r = (id) => document.getElementById(id).getBoundingClientRect();
      return { rut: r('rut-panel').top, asi: r('asi-contenido').top, col: r('cons-col-rutina').right, x: r('rut-panel').left };
    });
    ok(`${tag} · arriba del historial y al lado de la rutina`, pos.rut < pos.asi && pos.x >= pos.col - 5, JSON.stringify(pos));
  }

  // 2. Abierto: ejemplos del constructor.
  await boton.click();
  await p.waitForTimeout(200);
  const caja = await p.locator('#rut-panel').innerText();
  ok(`${tag} · ejemplos del constructor`, caja.includes('¿Le falta algún patrón o músculo a esta rutina?') && /Ya sabe qué rutina tienes abierta/.test(caja), caja.slice(0, 300));
  ok(`${tag} · niveles con Haiku/Opus 5.5 (2-5 COP en Rápido)`, caja.includes('2-5 COP'));

  // 3. Pregunta → mira la rutina abierta → propone en «esta» → aplicar sin salir.
  const antes = await p.evaluate(() => _ent.rutina.ejercicios.length);
  await p.fill('#rut-input', 'Agrégale un empuje, 3×10');
  await p.click('#rut-panel button:has-text("Preguntar")');
  await p.waitForFunction(() => document.querySelector('#rut-panel')?.innerText.includes('Te lo dejé propuesto'), null, { timeout: 8000 }).catch(() => {});
  ok(`${tag} · pide perfil rutinas y le cuenta dónde está`, pedidos[0]?.perfil === 'rutinas' && (pedidos[0]?.contexto?.pantalla || '').includes(rut.nombre), JSON.stringify(pedidos[0]?.contexto));
  const res1 = (pedidos[1]?.messages || []).at(-1)?.content?.[0]?.content || '';
  let vista = {}; try { vista = JSON.parse(res1); } catch {}
  ok(`${tag} · rutina_abierta devuelve la rutina tal cual (nombre, cliente, ${antes} ejercicios, minutos)`,
    vista.rutina === rut.nombre && vista.cliente === 'Ana Pérez' && vista.ejercicios?.length === antes && vista.duracion_estimada_min > 0, res1.slice(0, 200));
  const res2 = (pedidos[2]?.messages || []).at(-1)?.content?.[0]?.content || '';
  ok(`${tag} · «esta» = la rutina abierta → queda propuesto`, /PROPUESTO/.test(res2), res2.slice(0, 200));
  ok(`${tag} · tarjeta de cambios sin aplicar`, await p.locator('#rut-panel .rut-propuesta').count() === 1);
  ok(`${tag} · los mismos pedidos llevan el mismo contexto (no cambia la caché)`, pedidos.every(x => x.contexto?.pantalla === pedidos[0].contexto?.pantalla));
  await p.click('#rut-panel button:has-text("Aplicar todo")');
  await p.waitForFunction((n) => _ent.rutina && _ent.rutina.ejercicios.length === n + 1, antes, { timeout: 8000 }).catch(() => {});
  ok(`${tag} · aplicado: la rutina tiene el ejercicio nuevo`, await p.evaluate((id) => _ent.rutina.ejercicios.some(x => x.ejercicio_id === id), nuevo.id));
  ok(`${tag} · y sigues en el constructor, con el agente`, await p.locator('#cons-rutina').count() === 1 && await p.locator('#asi-panel #rut-panel .rut-caja').count() === 1);
  await p.screenshot({ path: path.join(CAPTURAS, `constructor-agente-${tag}.png`), fullPage: tag === 'ancho' });

  // 4. Video al tocar la vista previa de la galería.
  const conVideo = fixture.ejercicios.find(e => e.video_fuente === 'youtube' && e.video_inicio_seg === 4 && !enRutina.has(e.id) && e.id !== nuevo.id);
  await p.evaluate(() => { _ent.filtros && Object.keys(_ent.filtros).forEach(k => { _ent.filtros[k] = Array.isArray(_ent.filtros[k]) ? [] : ''; }); });
  await p.evaluate(() => entPintarGaleriaCons());
  await p.waitForTimeout(400);
  const prev = p.locator(`#cons-gal-lista [data-ver-video="${conVideo.id}"]`);
  ok(`${tag} · la vista previa tiene ▶`, await prev.locator('.ent-play').count() === 1);
  await prev.scrollIntoViewIfNeeded().catch(() => {});
  await prev.click();
  await p.waitForTimeout(300);
  const src = await p.locator('#modal-content iframe').getAttribute('src').catch(() => '');
  ok(`${tag} · se abre el video del ejercicio`, src.includes(`/embed/${conVideo.video_ref}`) && src.includes('start=4'), src);
  await p.screenshot({ path: path.join(CAPTURAS, `constructor-video-${tag}.png`) });
  const n0 = await p.evaluate(() => _ent.rutina.ejercicios.length);
  await p.click('#modal-content [data-vv-anadir]');
  await p.waitForTimeout(900);
  ok(`${tag} · «+ Añadir a la rutina» desde el video lo mete`, await p.evaluate(() => _ent.rutina.ejercicios.length) === n0 + 1);

  // 5. Sin video: abre la ficha. Y en la rutina, la foto también abre el video.
  const sinVideo = fixture.ejercicios[fixture.ejercicios.length - 1];
  await p.evaluate((id) => entVerVideoEj(id, { anadir: true }), sinVideo.id);
  await p.waitForTimeout(300);
  ok(`${tag} · sin video → la ficha, sin reproductor`, await p.locator('#modal-content iframe').count() === 0 && (await p.locator('#modal-content').innerText()).length > 0);
  await p.evaluate(() => closeModal());
  const fotoFila = p.locator('#cons-rutina [data-ver-video]').first();
  if (await fotoFila.count()) {
    await fotoFila.scrollIntoViewIfNeeded().catch(() => {});
    await fotoFila.click();
    await p.waitForTimeout(300);
    ok(`${tag} · la foto en la rutina abre su video (sin «Añadir»)`, await p.locator('#modal-content iframe').count() === 1 && await p.locator('#modal-content [data-vv-anadir]').count() === 0);
    await p.evaluate(() => closeModal());
  } else ok(`${tag} · hay fotos en la rutina`, false);
  if (tag === 'telefono') ok(`${tag} · sin scroll de lado`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

  ok(`${tag}: sin errores de JavaScript`, errores.length === 0, errores.join(' | '));
  await ctx.close();
}

await b.close();
servidor.close();
console.log(mal ? `\n${mal} falla(s)` : '\ntodo bien');
process.exit(mal ? 1 : 0);
