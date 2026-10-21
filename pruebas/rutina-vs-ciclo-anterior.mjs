// Etiqueta de cada rutina contra su versión del ciclo anterior:
// «Igual al ciclo anterior» o «Con cambios respecto al ciclo anterior».
//   NODE_PATH=/ruta/node_modules node pruebas/rutina-vs-ciclo-anterior.mjs
import { createRequire } from 'module';
const require_ = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require_('playwright')); }
catch { console.error('Falta playwright (npm i -D playwright, o NODE_PATH=…)'); process.exit(2); }

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const p = await b.newPage({ viewport: { width: 900, height: 700 } });
const errores = [];
p.on('pageerror', e => errores.push(e.message));
await p.goto('file://' + import.meta.dirname + '/arnes/ciclos.html');
let mal = 0, n = 0;
const ok = (nombre, c, extra = '') => { n++; if (!c) mal++; console.log(`  ${c ? 'ok ' : 'MAL'}  ${nombre}${c ? '' : '  ' + extra}`); };

const r = await p.evaluate(() => {
  const E = (id, nombre) => ({ id, nombre, patron: 'push' });
  const re = (ej, o, series, reps, extra = {}) => ({ ejercicio_id: ej.id, ejercicios: ej, orden: o, series, reps, peso_objetivo: null, descanso_seg: 90, ...extra });
  const press = E('e1', 'Bench Press'), remo = E('e2', 'Barbell Row'), sent = E('e3', 'Back Squat'), hip = E('e4', 'Hip Thrust'), leg = E('e5', 'Leg Press');
  const ant = [
    { id: 'a1', nombre: 'Push', dia_orden: 1 },
    { id: 'a2', nombre: 'Lower', dia_orden: 2 },
    { id: 'a3', nombre: 'Pull', dia_orden: 3 },
  ];
  const ejsAnt = {
    a1: [re(press, 1, 3, '8-10')],
    a2: [re(sent, 1, 3, '6-8'), re(leg, 2, 3, '10')],
    a3: [re(remo, 1, 3, '10'), re(press, 2, 2, '12')],
  };
  const nuevas = [
    { id: 'n1', nombre: 'Push', dia_orden: 1, origen_rutina_id: 'a1' },   // idéntica
    { id: 'n2', nombre: 'Pierna', dia_orden: 2, origen_rutina_id: 'a2' }, // cambió nombre, series y un ejercicio
    { id: 'n3', nombre: 'Pull', dia_orden: 3 },                            // por nombre; orden cambiado
    { id: 'n4', nombre: 'Core', dia_orden: 4 },                            // no existía
  ];
  const ejs = {
    n1: [re(press, 1, 3, '8-10')],
    n2: [re(sent, 1, 4, '6-8'), re(hip, 2, 3, '10')],
    n3: [re(press, 1, 2, '12'), re(remo, 2, 3, '10')],
    n4: [re(hip, 1, 3, '12')],
  };
  const c = entCompararCiclo(nuevas, ejs, ant, ejsAnt);
  _ent.clienteId = 'c1';
  _ent.cicloComp = c;
  _ent.rutinaAbierta = 'n2';
  document.getElementById('ent-body').innerHTML = entListaRutinasHTML({ id: 'f2' }, nuevas, ejs);
  return c;
});
ok('idéntica → igual', r.n1?.igual === true, JSON.stringify(r.n1));
ok('cambió series y un ejercicio → con cambios y los nombra', r.n2 && !r.n2.igual
  && r.n2.cambios.includes('+ Hip Thrust') && r.n2.cambios.includes('− Leg Press') && r.n2.cambios.some(t => t.startsWith('Back Squat: 3→4 series')), JSON.stringify(r.n2));
ok('mismos ejercicios en otro orden → con cambios (orden)', r.n3 && r.n3.cambios.includes('Orden de los ejercicios'), JSON.stringify(r.n3));
ok('rutina que no estaba en el ciclo anterior → sin etiqueta', !r.n4);
ok('se pintan las etiquetas', await p.locator('[data-tag-ciclo="igual"]').count() === 1 && await p.locator('[data-tag-ciclo="cambios"]').count() === 2);
ok('la rutina abierta lista sus cambios', await p.locator('[data-cambios-ciclo]', { hasText: '+ Hip Thrust' }).count() === 1);
if (process.env.FOTO) await p.screenshot({ path: process.env.FOTO, fullPage: true });
ok('sin errores de página', errores.length === 0, errores.join(' | '));
console.log(`\n${n - mal}/${n} ok`);
await b.close();
process.exit(mal ? 1 : 0);
