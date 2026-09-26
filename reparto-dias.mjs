// El reparto de rutinas sobre la semana, en seco.
//
// Se comprueban dos cosas a la vez:
//
//   1. Que una rutina puede caer en VARIOS días. Es el caso real de Andrea,
//      Amauri y Diana: dos rutinas repartidas en cuatro días (A-B-A-B). Con
//      el modelo viejo (`dia_semana`, un solo día) esa semana no se podía ni
//      guardar, así que esto es lo que hay que no volver a romper.
//
//   2. Que el CRM y la app del cliente reparten IGUAL. Son dos ficheros
//      distintos con la misma lógica escrita dos veces; si se separan, el
//      coach ve la semana de una forma y el cliente de otra, y nadie se entera
//      hasta que el cliente pregunta por qué le sale otra rutina.
//
// Correr:  node pruebas/reparto-dias.mjs
import { readFileSync } from 'fs';
import vm from 'vm';

const RAIZ = new URL('../..', import.meta.url).pathname;

// ---------- El reparto del CRM ----------
const crmSrc = readFileSync(`${RAIZ}CRM_entrenaconmetodo/entrenamiento.js`, 'utf8');
const trozo = (src, desde, hasta) => {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error(`No encontré "${desde}" — ¿se renombró?`);
  const j = src.indexOf(hasta, i);
  if (j < 0) throw new Error(`No encontré el final de "${desde}"`);
  return src.slice(i, j + hasta.length);
};

const ctxCrm = vm.createContext({ console });
vm.runInContext(
  `const ENT_DIAS = [['L','Lun'],['M','Mar'],['X','Mié'],['J','Jue'],['V','Vie'],['S','Sáb'],['D','Dom']];\n`
  + `const entLabel = (lista, id) => (lista.find(x => x[0] === id) || [null, id || '—'])[1];\n`
  + trozo(crmSrc, 'function entRepartirRutinas(', '\n  return { porDia, sinDia };\n}')
  + '\n'
  + trozo(crmSrc, 'function entDiasDe(r) {', '\n}')
  + '\nglobalThis.repartirCRM = entRepartirRutinas;',
  ctxCrm,
);

// ---------- El reparto de la app del cliente ----------
// Vive en mealtracker/api/_entreno.js (lo comparten la API y el cron de
// avisos). Es un módulo ES: se importa tal cual, sin recortar texto.
const { repartirPorDia } = await import(`${RAIZ}mealtracker/api/_entreno.js`);
const ctxApi = { repartirAPI: repartirPorDia };

// ---------- Comprobación ----------
let fallos = 0;
// `esperado` es la semana escrita como 7 caracteres, L..D, con el nombre corto
// de la rutina o "." si ese día está libre.
function caso(nombre, fase, rutinas, esperado) {
  const { porDia } = ctxCrm.repartirCRM(fase, rutinas);
  const api = ctxApi.repartirAPI(fase, rutinas);

  const pinta = (m, sacar) => 'LMXJVSD'.split('')
    .map(d => { const v = m[d]; return v ? sacar(v) : '.'; }).join('');
  const sCrm = pinta(porDia, x => x.r.id);
  const sApi = pinta(api, x => x.id);

  const okCrm = sCrm === esperado;
  const okIgual = sCrm === sApi;
  if (!okCrm || !okIgual) fallos++;

  let detalle = '';
  if (!okCrm) detalle += ` → CRM dio ${sCrm}, esperaba ${esperado}`;
  if (!okIgual) detalle += ` → la app dio ${sApi} y el CRM ${sCrm} (NO COINCIDEN)`;
  console.log(`${okCrm && okIgual ? '✔' : '✘'} ${nombre}${detalle}`);
}

const r = (id, dias, orden) => ({ id, nombre: id, dia_orden: orden, dias_semana: dias });

console.log('\n── Una rutina en varios días ──');

// El caso de Andrea: 2 rutinas, 4 días.
caso('A-B-A-B: Upper L·X, Lower M·J',
  { dias_semana: ['L', 'M', 'X', 'J'] },
  [r('A', ['M', 'J'], 1), r('B', ['L', 'X'], 2)],
  'BABA...');

caso('una sola rutina tres veces por semana',
  { dias_semana: ['L', 'X', 'V'] },
  [r('A', ['L', 'X', 'V'], 1)],
  'A.A.A..');

caso('los siete días',
  { dias_semana: ['L', 'M', 'X', 'J', 'V', 'S', 'D'] },
  [r('A', ['L', 'M', 'X', 'J', 'V', 'S', 'D'], 1)],
  'AAAAAAA');

console.log('\n── Compatibilidad con lo viejo ──');

// Una rutina que aún no pasó por la migración: trae `dia_semana` suelto.
caso('dia_semana suelto se sigue leyendo',
  { dias_semana: ['L', 'X'] },
  [{ id: 'A', nombre: 'A', dia_orden: 1, dia_semana: 'X' },
   { id: 'B', nombre: 'B', dia_orden: 2, dia_semana: 'L' }],
  'B.A....');

caso('dias_semana gana sobre dia_semana si están los dos',
  { dias_semana: ['L', 'V'] },
  [{ id: 'A', nombre: 'A', dia_orden: 1, dia_semana: 'L', dias_semana: ['V'] }],
  '....A..');

console.log('\n── El reparto por orden, cuando nadie declara días ──');

caso('sin días propios: se reparten por dia_orden sobre los de la fase',
  { dias_semana: ['L', 'X', 'V'] },
  [r('A', [], 1), r('B', [], 2), r('C', [], 3)],
  'A.B.C..');

caso('menos rutinas que días: sobran días vacíos',
  { dias_semana: ['L', 'M', 'X', 'J'] },
  [r('A', [], 1), r('B', [], 2)],
  'AB.....');

caso('más rutinas que días: la que no cabe queda fuera',
  { dias_semana: ['L', 'M'] },
  [r('A', [], 1), r('B', [], 2), r('C', [], 3)],
  'AB.....');

caso('la fase no declara días y nadie los tiene: semana vacía',
  { dias_semana: [] },
  [r('A', [], 1), r('B', [], 2)],
  '.......');

console.log('\n── Mezclas y choques ──');

caso('fijada + sueltas: la suelta no pisa el día de la fijada',
  { dias_semana: ['L', 'M', 'X'] },
  [r('A', ['M'], 1), r('B', [], 2), r('C', [], 3)],
  'BAC....');

caso('dos rutinas se pelean el mismo día: gana la de dia_orden menor',
  { dias_semana: ['L'] },
  [r('A', ['L'], 1), r('B', ['L'], 2)],
  'A......');

caso('el empate se resuelve por dia_orden, no por el orden del array',
  { dias_semana: ['L'] },
  [r('B', ['L'], 2), r('A', ['L'], 1)],
  'A......');

caso('rutina en un día que la fase no declara: igual se pinta',
  { dias_semana: ['L'] },
  [r('A', ['S'], 1)],
  '.....A.');

console.log('\n── sinDia: a quién hay que avisarle al coach ──');
{
  const { sinDia } = ctxCrm.repartirCRM(
    { dias_semana: ['L', 'M'] },
    [r('A', [], 1), r('B', [], 2), r('C', [], 3)],
  );
  const ok = sinDia.length === 1 && sinDia[0].id === 'C';
  if (!ok) fallos++;
  console.log(`${ok ? '✔' : '✘'} la que no cupo sale en sinDia${ok ? '' : ` → ${sinDia.map(x => x.id)}`}`);
}
{
  const { sinDia } = ctxCrm.repartirCRM(
    { dias_semana: ['L', 'M', 'X', 'J'] },
    [r('A', ['M', 'J'], 1), r('B', ['L', 'X'], 2)],
  );
  const ok = sinDia.length === 0;
  if (!ok) fallos++;
  console.log(`${ok ? '✔' : '✘'} con A-B-A-B no sobra ninguna${ok ? '' : ` → ${sinDia.map(x => x.id)}`}`);
}

console.log(fallos ? `\n${fallos} FALLO(S)\n` : '\nTodo bien.\n');
process.exit(fallos ? 1 : 0);
