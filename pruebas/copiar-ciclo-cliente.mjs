// Copiar un ciclo a OTRO cliente (o importarlo desde otro): se lleva las
// rutinas con sus días de fuerza, y el cardio y deportes con su reparto en el
// calendario (días, semanas, días quitados y los de un solo día corridos).
//   NODE_PATH=/ruta/node_modules node pruebas/copiar-ciclo-cliente.mjs
import { createRequire } from 'module';
const require_ = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require_('playwright')); }
catch { console.error('Falta playwright (npm i -D playwright, o NODE_PATH=…)'); process.exit(2); }

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const p = await b.newPage();
const errores = [];
p.on('pageerror', e => errores.push(e.message));
await p.goto('file://' + import.meta.dirname + '/arnes/ciclos.html');
let mal = 0, n = 0;
const ok = (nombre, c, extra = '') => { n++; if (!c) mal++; console.log(`  ${c ? 'ok ' : 'MAL'}  ${nombre}${c ? '' : '  ' + extra}`); };

// Ana (c1) tiene «Ciclo 2» desde el lunes 28-sep: Push lunes, Lower martes y
// viernes, Pull miércoles. En el calendario: caminata L-X-V (sin el miércoles
// 7-oct), natación los sábados de las semanas 1 y 2, pesaje el 12-oct y una
// cita médica suya. Se le copia a Bruno (c2) desde el lunes 2-nov.
const preparar = () => p.evaluate(() => {
  _ent.clienteId = 'c1';
  window.FASE = { id: 'f1', cliente_id: 'c1', nombre: 'Ciclo 2', semanas: 4, fecha_inicio: '2026-09-28', dias_semana: ['L', 'M', 'X', 'V'] };
  window.RUT = [
    { id: 'r1', nombre: 'Push', dia_orden: 1, dias_semana: ['L'] },
    { id: 'r2', nombre: 'Lower', dia_orden: 2, dias_semana: ['M', 'V'] },
    { id: 'r3', nombre: 'Pull', dia_orden: 3, dias_semana: [], dia_semana: 'X' },   // día del campo viejo
  ];
  TABLAS.fases = [FASE];
  window.ESCRITO = { copias: [], rutinas: {} };
  db.clientes.list = async () => [{ id: 'c1', nombre: 'Ana', estado: 'activo' }, { id: 'c2', nombre: 'Bruno', estado: 'activo' }];
  entDb.fases = async (c) => c === 'c1' ? [FASE] : [];
  // La copia del servidor viene SIN días (como una base sin la migración).
  entDb.rutinasDeFase = async (id) => id === 'f1' ? RUT : RUT.map(r => ({ ...r, id: 'n' + r.id, origen_rutina_id: r.id, dias_semana: [], dia_semana: null }));
  entDb.copiarFase = async (...a) => { ESCRITO.copias.push(a); return 'f9'; };
  entDb.actualizarRutina = async (id, row) => { ESCRITO.rutinas[id] = row; };
  window.entVistaClientes = async () => {};
  TABLAS.eventos = [
    { id: 'ev1', cliente_id: 'c1', fase_id: 'f1', tipo: 'actividad', titulo: 'Caminata', detalle: '30 min', duracion_min: 30, fecha: null, dias_semana: ['L', 'X', 'V'], semanas: null, fechas_excluidas: ['2026-10-07'] },
    { id: 'ev2', cliente_id: 'c1', fase_id: 'f1', tipo: 'actividad', titulo: 'Natación', fecha: null, dias_semana: ['S'], semanas: [1, 2] },
    { id: 'ev3', cliente_id: 'c1', fase_id: 'f1', tipo: 'peso', titulo: 'Pesarse en ayunas', fecha: '2026-10-12', dias_semana: [], semanas: null, visible_cliente: true },
    { id: 'ev4', cliente_id: 'c1', fase_id: 'f1', tipo: 'cita', titulo: 'Control médico', fecha: '2026-10-02', dias_semana: [], semanas: null },
    { id: 'ev9', cliente_id: 'c1', fase_id: 'f0', tipo: 'actividad', titulo: 'Tenis', fecha: null, dias_semana: ['D'] },
  ];
});

// ── «Copiar a…» desde la fase de Ana ──
await preparar();
await p.evaluate(() => entCopiarFaseA('f1'));
await p.waitForSelector('[data-cp-rutina="r3"]');
const diasPrevia = await p.evaluate(() => [...document.querySelectorAll('[data-cp-rutina]')].map(x => x.textContent.replace(/\s+/g, ' ').trim()));
ok('la vista previa muestra cada rutina con sus días (también el día del campo viejo)', JSON.stringify(diasPrevia) === JSON.stringify(['Push lunes', 'Lower martes, viernes', 'Pull miércoles']), JSON.stringify(diasPrevia));
ok('muestra el cardio, deportes y eventos del ciclo (no los de otro ciclo)', await p.locator('[data-cp-evento]').count() === 4 && await p.locator('[data-cp-evento="ev9"]').count() === 0);
ok('vienen marcados, menos la cita médica (es personal)', await p.locator('#cp-previa input:checked').count() === 3 && !(await p.locator('[data-cp-evento="ev4"] input').isChecked()));
await p.selectOption('#cf-cliente', 'c2');
await p.fill('#cf-inicio', '2026-11-02');
await p.evaluate(() => entConfirmarCopiarFase('f1'));
let w = await p.evaluate(() => ESCRITO);
ok('copia la fase a Bruno con la fecha nueva', JSON.stringify(w.copias[0]) === JSON.stringify(['f1', 'c2', '2026-11-02', null]), JSON.stringify(w.copias));
ok('cada rutina copiada queda con sus días de fuerza', JSON.stringify(w.rutinas) === JSON.stringify({ nr1: { dias_semana: ['L'] }, nr2: { dias_semana: ['M', 'V'] }, nr3: { dias_semana: ['X'] } }), JSON.stringify(w.rutinas));
let nuevos = await p.evaluate(() => TABLAS.eventos.filter(e => e.fase_id === 'f9'));
const cam = nuevos.find(e => e.titulo === 'Caminata');
ok('la caminata va a Bruno con sus días y su detalle', cam && cam.cliente_id === 'c2' && JSON.stringify(cam.dias_semana) === '["L","X","V"]' && cam.detalle === '30 min' && cam.duracion_min === 30 && cam.fecha === null, JSON.stringify(cam));
ok('el miércoles que se le quitó se corre igual (7-oct → 11-nov)', cam && JSON.stringify(cam.fechas_excluidas) === '["2026-11-11"]', JSON.stringify(cam?.fechas_excluidas));
const nat = nuevos.find(e => e.titulo === 'Natación');
ok('la natación conserva sus semanas (1 y 2)', nat && JSON.stringify(nat.semanas) === '[1,2]' && JSON.stringify(nat.dias_semana) === '["S"]', JSON.stringify(nat));
const peso = nuevos.find(e => e.tipo === 'peso');
ok('el pesaje de un solo día se corre igual que el inicio (12-oct → 16-nov)', peso && peso.fecha === '2026-11-16' && peso.cliente_id === 'c2' && peso.visible_cliente === true, JSON.stringify(peso));
ok('la cita médica (desmarcada) y lo de otro ciclo no se copian', nuevos.length === 3 && !nuevos.some(e => e.tipo === 'cita' || e.titulo === 'Tenis'), JSON.stringify(nuevos.map(e => e.titulo)));
ok('lo de Ana no se toca', await p.evaluate(() => TABLAS.eventos.filter(e => e.cliente_id === 'c1').length === 5 && JSON.stringify(TABLAS.eventos[0].fechas_excluidas) === '["2026-10-07"]'));
let aviso = await p.evaluate(() => toasts.at(-1));
ok('el aviso dice qué copió', aviso.includes('3 rutinas con sus días') && aviso.includes('3 de cardio y eventos'), aviso);

// ── «Importar fase» desde Bruno, desmarcando la natación ──
await preparar();
await p.evaluate(() => { _ent.clienteId = 'c2'; });
await p.evaluate(() => entImportarFase());
await p.selectOption('#if-cliente', 'c1');
await p.waitForSelector('[data-cp-evento="ev2"]');
await p.locator('[data-cp-evento="ev2"] input').uncheck();
await p.evaluate(() => entConfirmarImportar());
w = await p.evaluate(() => ESCRITO);
nuevos = await p.evaluate(() => TABLAS.eventos.filter(e => e.fase_id === 'f9'));
ok('importar trae el ciclo hacia este cliente', JSON.stringify(w.copias[0]) === JSON.stringify(['f1', 'c2', null, null]) && Object.keys(w.rutinas).length === 3, JSON.stringify(w));
ok('sin fecha nueva, los eventos quedan en los mismos días', nuevos.length === 2 && nuevos.find(e => e.tipo === 'peso')?.fecha === '2026-10-12' && JSON.stringify(nuevos.find(e => e.titulo === 'Caminata')?.fechas_excluidas) === '["2026-10-07"]', JSON.stringify(nuevos));
ok('lo desmarcado (natación) no viene', !nuevos.some(e => e.titulo === 'Natación'));

// ── Base sin la columna de días quitados: se copia igual, sin ellos ──
await preparar();
await p.evaluate(() => {
  const orig = sb.from;
  sb.from = (t) => { const q = orig(t); if (t !== 'eventos') return q; const ins = q.insert;
    q.insert = (rows) => [].concat(rows).some(r => 'fechas_excluidas' in r) ? Promise.resolve({ error: { message: 'column "fechas_excluidas" does not exist' } }) : ins(rows); return q; };
});
await p.evaluate(() => entCopiarFaseA('f1'));
await p.waitForSelector('[data-cp-rutina="r1"]');
await p.selectOption('#cf-cliente', 'c2');
await p.evaluate(() => entConfirmarCopiarFase('f1'));
nuevos = await p.evaluate(() => TABLAS.eventos.filter(e => e.fase_id === 'f9'));
ok('sin la migración, el cardio se copia igual (sin los días quitados)', nuevos.length === 3 && !nuevos.some(e => 'fechas_excluidas' in e), JSON.stringify(nuevos));

// ── Como plantilla (sin cliente): solo rutinas y sus días ──
await preparar();
await p.evaluate(() => entCopiarFaseA('f1'));
await p.waitForSelector('[data-cp-rutina="r1"]');
await p.evaluate(() => entConfirmarCopiarFase('f1'));
nuevos = await p.evaluate(() => TABLAS.eventos.filter(e => e.fase_id === 'f9'));
aviso = await p.evaluate(() => toasts.at(-1));
ok('como plantilla no crea eventos sin cliente y lo dice', nuevos.length === 0 && aviso.includes('como plantilla'), aviso);

ok('sin errores de JavaScript', errores.length === 0, errores.join(' | '));
await b.close();
console.log(mal ? `\n${mal} fallo(s)` : `\n${n}/${n} bien`);
process.exit(mal ? 1 : 0);
