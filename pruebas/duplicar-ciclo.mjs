// Duplicar un ciclo: se copian TUS días; lo que el cliente movió o agregó
// sale como pregunta, sin marcar, con su análisis.
//   NODE_PATH=/ruta/node_modules node pruebas/duplicar-ciclo.mjs
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

// Ciclo 2: 4 semanas desde el lunes 28-sep-2026. Push lunes, Lower martes y
// viernes, Pull miércoles. Hoy es 26-oct (ya pasó el ciclo entero).
await p.evaluate(() => {
  _ent.clienteId = 'c1';
  const fase = { id: 'f1', cliente_id: 'c1', nombre: 'Ciclo 2', semanas: 4, fecha_inicio: '2026-09-28', dias_semana: ['L', 'M', 'X', 'V'] };
  window.RUT = [
    { id: 'r1', nombre: 'Push', dia_orden: 1, dias_semana: ['L'] },
    { id: 'r2', nombre: 'Lower', dia_orden: 2, dias_semana: ['M', 'V'] },
    { id: 'r3', nombre: 'Pull', dia_orden: 3, dias_semana: ['X'] },
  ];
  window.ESCRITO = { copias: [], rutinas: {}, fase: null };
  entDb.fases = async () => [fase];
  entDb.rutinasDeFase = async (id) => id === 'f1' ? RUT : RUT.map(r => ({ ...r, id: 'n' + r.id, origen_rutina_id: r.id, dias_semana: [] }));
  entDb.copiarFase = async (...a) => { ESCRITO.copias.push(a); return 'f2'; };
  entDb.actualizarRutina = async (id, row) => { ESCRITO.rutinas[id] = row; };
  entDb.actualizarFase = async (id, row) => { ESCRITO.fase = [id, row]; };
  window.entVistaClientes = async () => {};
  // Push: lo pasó del lunes al martes 3 de las 4 semanas (con el calendario).
  TABLAS.rutina_movimientos = [
    { fase_id: 'f1', rutina_id: 'r1', desde: '2026-09-28', hasta: '2026-09-29', origen: 'cliente' },
    { fase_id: 'f1', rutina_id: 'r1', desde: '2026-10-05', hasta: '2026-10-06', origen: 'cliente' },
    { fase_id: 'f1', rutina_id: 'r1', desde: '2026-10-19', hasta: '2026-10-20', origen: 'cliente' },
  ];
  TABLAS.sesiones = [
    { fase_id: 'f1', rutina_id: 'r1', fecha: '2026-09-29', estado: 'completada' },     // ya explicada por el movimiento
    // Pull: una vez la hizo el jueves en vez del miércoles, sin moverla.
    { fase_id: 'f1', rutina_id: 'r3', fecha: '2026-10-08', estado: 'completada' },
    // Lower: dos semanas la hizo martes y viernes Y además el sábado: un día de más.
    { fase_id: 'f1', rutina_id: 'r2', fecha: '2026-10-13', estado: 'completada' },
    { fase_id: 'f1', rutina_id: 'r2', fecha: '2026-10-17', estado: 'completada' },
    { fase_id: 'f1', rutina_id: 'r2', fecha: '2026-10-20', estado: 'completada' },
    { fase_id: 'f1', rutina_id: 'r2', fecha: '2026-10-24', estado: 'completada' },
    // Una que se saltó no cuenta.
    { fase_id: 'f1', rutina_id: 'r3', fecha: '2026-10-15', estado: 'saltada' },
  ];
  // Fútbol los domingos, 3 semanas.
  TABLAS.actividades = ['2026-10-04', '2026-10-11', '2026-10-18'].map(f => ({ cliente_id: 'c1', fecha: f, titulo: 'Fútbol', tipo: 'futbol' }));
});

await p.evaluate(() => entDuplicarCiclo('f1'));
const diasDe = (id) => p.evaluate((id) => [...document.querySelectorAll(`[data-dc-rutina="${id}"] .chip.active`)].map(b => b.dataset.dia).join(''), id);
ok('el nombre sale solo: Ciclo 2 → Ciclo 3', await p.inputValue('#dc-nombre') === 'Ciclo 3');
ok('empieza el día después de que termina el anterior', await p.inputValue('#dc-inicio') === '2026-10-26', await p.inputValue('#dc-inicio'));
ok('los días vienen como los armó el coach', (await diasDe('r1')) === 'L' && (await diasDe('r2')) === 'MV' && (await diasDe('r3')) === 'X');

const sug = await p.evaluate(() => _dc.sugerencias.map(s => `${s.tipo}:${s.rutina || ''}:${s.de || ''}>${s.a}:${s.veces}:${s.fuerza}`));
ok('Push: lo movió al martes 3 veces en 4 semanas → recomendable', sug.includes('mover:Push:L>M:3:recomendado'), JSON.stringify(sug));
ok('Lower: el sábado de más 2 veces → se repitió', sug.includes('agregar:Lower:>S:2:recomendado') || sug.includes('agregar:Lower:>S:2:repetido'), JSON.stringify(sug));
ok('Pull: el jueves una sola vez → puntual', sug.includes('mover:Pull:X>J:1:puntual'), JSON.stringify(sug));
ok('fútbol los domingos → solo para tener en cuenta', sug.some(s => s.startsWith('nota::>D:3')), JSON.stringify(sug));
ok('la sesión saltada y la ya movida no se cuentan dos veces', sug.length === 4, JSON.stringify(sug));
ok('NADA viene marcado', await p.locator('[data-duplicar-ciclo] input[type=checkbox]:checked').count() === 0);
ok('lo recomendable lo dice', await p.locator('text=Lo hizo casi siempre').count() >= 1 && await p.locator('text=Fue puntual').count() === 1);

// Aceptar Push → martes: el martes era de Lower, así que se intercambian.
const iPush = await p.evaluate(() => _dc.sugerencias.findIndex(s => s.rutina === 'Push'));
await p.locator(`#dc-s-${iPush}`).check();
ok('al marcarla se refleja arriba (y se intercambia con la del martes)', (await diasDe('r1')) === 'M' && (await diasDe('r2')) === 'LV', `${await diasDe('r1')} / ${await diasDe('r2')}`);
await p.locator(`#dc-s-${iPush}`).uncheck();
ok('al desmarcarla vuelve como estaba', (await diasDe('r1')) === 'L' && (await diasDe('r2')) === 'MV');
await p.locator(`#dc-s-${iPush}`).check();
// Elegir a mano: Pull pasa al jueves tocando el chip.
await p.locator('[data-dc-rutina="r3"] [data-dia="X"]').click();
await p.locator('[data-dc-rutina="r3"] [data-dia="J"]').click();
ok('también se eligen los días a mano', (await diasDe('r3')) === 'J');

await p.fill('#dc-semanas', '6');
await p.evaluate(() => entDcGuardar());
const w = await p.evaluate(() => ESCRITO);
ok('copia la fase para el mismo cliente con nombre e inicio', JSON.stringify(w.copias[0]) === JSON.stringify(['f1', 'c1', '2026-10-26', 'Ciclo 3']), JSON.stringify(w.copias));
ok('cada rutina nueva queda con los días de la ventana', JSON.stringify(w.rutinas) === JSON.stringify({ nr1: { dias_semana: ['M'] }, nr2: { dias_semana: ['L', 'V'] }, nr3: { dias_semana: ['J'] } }), JSON.stringify(w.rutinas));
ok('el sábado de Lower NO se copió (no se marcó)', !w.rutinas.nr2.dias_semana.includes('S'));
ok('la fase nueva: 6 semanas, sus días y en borrador', w.fase[0] === 'f2' && w.fase[1].semanas === 6 && JSON.stringify(w.fase[1].dias_semana) === JSON.stringify(['L', 'M', 'J', 'V']) && w.fase[1].estado === 'borrador', JSON.stringify(w.fase));
ok('avisa cuántos ajustes aplicó', (await p.evaluate(() => toasts.at(-1))).includes('1 ajuste del cliente aplicado'), await p.evaluate(() => toasts.at(-1)));

// Un cliente que siguió todo al pie de la letra: no hay nada que preguntar.
await p.evaluate(() => { TABLAS.rutina_movimientos = []; TABLAS.sesiones = [{ fase_id: 'f1', rutina_id: 'r1', fecha: '2026-09-28', estado: 'completada' }]; TABLAS.actividades = []; return entDuplicarCiclo('f1'); });
ok('si siguió los días tal cual, lo dice', await p.locator('text=Siguió los días tal cual').count() === 1);

ok('sin errores de JavaScript', errores.length === 0, errores.join(' | '));
await b.close();
console.log(mal ? `\n${mal} fallo(s)` : `\n${n}/${n} bien`);
process.exit(mal ? 1 : 0);
