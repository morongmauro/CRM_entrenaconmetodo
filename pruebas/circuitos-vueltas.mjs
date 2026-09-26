// Cómo se reparte una rutina en tramos y vueltas, en seco.
//
// El bug que esto no debe volver a permitir: un circuito de 3 vueltas salía
// con UNA fila por ejercicio, así que el cliente no tenía dónde marcar la
// segunda vuelta ni la tercera. Y un circuito se recorre A→B→A→B→A→B, no A
// tres veces y luego B tres veces.
//
// Correr:  node pruebas/circuitos-vueltas.mjs
import { readFileSync } from 'fs';
import vm from 'vm';

const RAIZ = new URL('../..', import.meta.url).pathname;
const src = readFileSync(`${RAIZ}mealtracker/src/Entrenamiento.jsx`, 'utf8');

const i = src.indexOf('export function agruparEnTramos(');
if (i < 0) throw new Error('No encontré agruparEnTramos — ¿se renombró?');
const j = src.indexOf('\n}', src.indexOf('return tramos.map(', i)) + 2;

const ctx = vm.createContext({ console });
vm.runInContext(src.slice(i, j).replace('export function', 'function')
  + '\nglobalThis.agrupar = agruparEnTramos;', ctx);

let fallos = 0;
// La rutina se escribe como una cadena: cada letra es un ejercicio y el
// número de bloque va entre paréntesis. "A(1)B(1)C" = A y B en el bloque 1,
// C suelto.
function caso(nombre, ejercicios, bloques, esperado) {
  const bloqueDe = Object.fromEntries(
    Object.entries(bloques).map(([id, vueltas]) => [id, { id, vueltas, tipo: 'circuito' }]));
  const tramos = ctx.agrupar(ejercicios, bloqueDe);
  // Se aplana a "cómo se ve en pantalla": cada vuelta, sus ejercicios.
  const real = tramos.map(t => t.vueltas.map(v => v.map(x => x.id).join('')).join('|')).join(' ');
  const ok = real === esperado;
  if (!ok) fallos++;
  console.log(`${ok ? '✔' : '✘'} ${nombre}${ok ? '' : `\n     dio      ${real}\n     esperaba ${esperado}`}`);
}

const ej = (id, bloque = null) => ({ id, bloque_id: bloque });

console.log('\n── Circuitos ──');

caso('circuito de 3 vueltas con 2 ejercicios → A B, A B, A B',
  [ej('A', 'b1'), ej('B', 'b1')], { b1: 3 },
  'AB|AB|AB');

caso('circuito de 1 vuelta no se repite',
  [ej('A', 'b1'), ej('B', 'b1')], { b1: 1 },
  'AB');

caso('un bloque sin vueltas declaradas se trata como una sola',
  [ej('A', 'b1'), ej('B', 'b1')], { b1: null },
  'AB');

caso('dos circuitos seguidos son dos tramos',
  [ej('A', 'b1'), ej('B', 'b1'), ej('C', 'b2'), ej('D', 'b2')], { b1: 2, b2: 3 },
  'AB|AB CD|CD|CD');

console.log('\n── Ejercicios sueltos ──');

caso('los sueltos van juntos en un tramo, sin vueltas',
  [ej('A'), ej('B'), ej('C')], {},
  'ABC');

caso('un suelto con 4 series NO se repite cuatro veces',
  [ej('A')], {},
  'A');

console.log('\n── Mezclas, que es como son las rutinas de verdad ──');

caso('movilidad en circuito, luego fuerza suelta',
  [ej('A', 'b1'), ej('B', 'b1'), ej('C'), ej('D')], { b1: 2 },
  'AB|AB CD');

caso('suelto, circuito, suelto: tres tramos en ese orden',
  [ej('A'), ej('B', 'b1'), ej('C', 'b1'), ej('D')], { b1: 3 },
  'A BC|BC|BC D');

caso('el mismo bloque partido por un suelto son dos tramos',
  [ej('A', 'b1'), ej('B'), ej('C', 'b1')], { b1: 2 },
  'A|A B C|C');

console.log('\n── Bordes ──');

caso('rutina vacía', [], {}, '');

caso('un bloque que no existe en el mapa no revienta',
  [ej('A', 'fantasma')], {},
  'A');

{
  // Las claves de React tienen que ser únicas o la lista se repinta mal.
  const bloqueDe = { b1: { id: 'b1', vueltas: 2 } };
  const t = ctx.agrupar([ej('A'), ej('B', 'b1'), ej('C')], bloqueDe);
  const claves = t.map(x => x.clave);
  const ok = new Set(claves).size === claves.length;
  if (!ok) fallos++;
  console.log(`${ok ? '✔' : '✘'} cada tramo tiene una clave distinta${ok ? '' : ` → ${claves}`}`);
}

{
  // Las vueltas apuntan a los MISMOS objetos, no a copias: si se clonaran,
  // marcar una serie en la vuelta 2 no se vería reflejado.
  const t = ctx.agrupar([ej('A', 'b1')], { b1: { id: 'b1', vueltas: 3 } });
  const ok = t[0].vueltas[0][0] === t[0].vueltas[2][0];
  if (!ok) fallos++;
  console.log(`${ok ? '✔' : '✘'} todas las vueltas apuntan al mismo ejercicio, no a copias`);
}

console.log(fallos ? `\n${fallos} FALLO(S)\n` : '\nTodo bien.\n');
process.exit(fallos ? 1 : 0);
