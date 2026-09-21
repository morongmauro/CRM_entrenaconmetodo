// entReordenarRE() en seco: sin DOM, sin red. Lo que se comprueba es que la
// lista queda en el orden que uno ve al soltar, y que `orden` no se rompe.
import { readFileSync } from 'fs';
import vm from 'vm';

const src = readFileSync('/home/user/CRM_entrenaconmetodo/entrenamiento.js', 'utf8');
const i = src.indexOf('async function entReordenarRE(');
const j = src.indexOf('\n}', src.indexOf('await entPintarConstructor();', i)) + 2;
const cuerpo = src.slice(i, j);

let escrituras;
const ctx = vm.createContext({
  _ent: {},
  entDb: { actualizarRE: async (id, parche) => { escrituras.push([id, parche]); } },
  entPintarConstructor: async () => {},
  console,
});
vm.runInContext(cuerpo + '\nglobalThis.entReordenarRE = entReordenarRE;', ctx);

const hacer = (letras) => letras.split('').map((l, i) => ({ id: l, orden: i + 1, bloque_id: null }));

async function mover(lista, id, destinoId, antes, bloque = null) {
  escrituras = [];
  ctx._ent.rutina = { ejercicios: lista };
  await ctx.entReordenarRE(id, destinoId, antes, bloque);
  // aplicar las escrituras como lo haría la base
  const porId = Object.fromEntries(lista.map(x => [x.id, { ...x }]));
  escrituras.forEach(([id2, p]) => Object.assign(porId[id2], p));
  return Object.values(porId).sort((a, b) => a.orden - b.orden);
}

let fallos = 0;
const comprobar = (nombre, got, esperado) => {
  const s = got.map(x => x.id).join('');
  const ok = s === esperado;
  if (!ok) fallos++;
  console.log(`${ok ? '✔' : '✘'} ${nombre}${ok ? '' : ` → ${s}, esperaba ${esperado}`}`);
  // `orden` tiene que quedar 1..n sin huecos ni empates
  const ords = got.map(x => x.orden);
  const limpio = ords.every((o, i) => o === i + 1);
  if (!limpio) { fallos++; console.log(`  ✘ orden sucio: ${ords.join(',')}`); }
};

console.log('--- mover hacia abajo ---');
comprobar('A sobre D (antes)',   await mover(hacer('ABCDE'), 'A', 'D', true),  'BCADE');
comprobar('A sobre D (después)', await mover(hacer('ABCDE'), 'A', 'D', false), 'BCDAE');
comprobar('A al final',          await mover(hacer('ABCDE'), 'A', 'E', false), 'BCDEA');

console.log('--- mover hacia arriba ---');
comprobar('E sobre B (antes)',   await mover(hacer('ABCDE'), 'E', 'B', true),  'AEBCD');
comprobar('E sobre B (después)', await mover(hacer('ABCDE'), 'E', 'B', false), 'ABECD');
comprobar('E al principio',      await mover(hacer('ABCDE'), 'E', 'A', true),  'EABCD');

console.log('--- vecinos y bordes ---');
comprobar('B sobre A (antes)',   await mover(hacer('ABCDE'), 'B', 'A', true),  'BACDE');
comprobar('A sobre B (después)', await mover(hacer('ABCDE'), 'A', 'B', false), 'BACDE');
comprobar('dos elementos',       await mover(hacer('AB'),    'B', 'A', true),  'BA');

console.log('--- escrituras mínimas ---');
await mover(hacer('ABCDE'), 'D', 'E', false);
console.log(`${escrituras.length === 2 ? '✔' : '✘'} mover D tras E escribe ${escrituras.length} filas (esperaba 2)`);
if (escrituras.length !== 2) fallos++;

await mover(hacer('ABCDE'), 'A', 'E', false);
console.log(`${escrituras.length === 5 ? '✔' : '✘'} mover A al final escribe ${escrituras.length} filas (esperaba 5)`);
if (escrituras.length !== 5) fallos++;

console.log('--- bloques ---');
const conBloque = hacer('ABCDE');
conBloque[3].bloque_id = 'circuito';
escrituras = [];
ctx._ent.rutina = { ejercicios: conBloque };
await ctx.entReordenarRE('A', 'D', true, 'circuito');
const parcheA = escrituras.find(([id]) => id === 'A')?.[1] || {};
const ok = parcheA.bloque_id === 'circuito';
if (!ok) fallos++;
console.log(`${ok ? '✔' : '✘'} soltar dentro de un circuito hereda el bloque (dio ${JSON.stringify(parcheA)})`);

escrituras = [];
ctx._ent.rutina = { ejercicios: hacer('ABCDE') };
await ctx.entReordenarRE('A', 'C', true, null);
const tocaBloque = escrituras.some(([, p]) => 'bloque_id' in p);
if (tocaBloque) fallos++;
console.log(`${tocaBloque ? '✘' : '✔'} mover entre sueltos NO escribe bloque_id`);

console.log('--- id que no existe ---');
escrituras = [];
ctx._ent.rutina = { ejercicios: hacer('ABC') };
await ctx.entReordenarRE('Z', 'B', true, null);
console.log(`${escrituras.length === 0 ? '✔' : '✘'} arrastrar algo que ya no está no escribe nada`);
if (escrituras.length) fallos++;

console.log(fallos ? `\n${fallos} FALLOS` : '\ntodo bien');
process.exit(fallos ? 1 : 0);
