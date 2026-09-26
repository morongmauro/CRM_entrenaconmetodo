// El récord personal, en seco.
//
// Es el número que el cliente ve más grande de toda la app, así que tiene
// que ser el que de verdad levantó. Dos trampas fáciles:
//
//   · Mezclar el peso de un día con las reps de otro. "60 kg × 12" cuando lo
//     que hizo fue 60×8 un día y 40×12 otro es una marca inventada.
//   · Contar la sesión de HOY como récord anterior. Si se cuenta, todo lo de
//     hoy bate el récord de hoy y siempre sale la celebración.
//
// Correr:  node pruebas/records.mjs
import { readFileSync } from 'fs';
import vm from 'vm';

const RAIZ = new URL('../..', import.meta.url).pathname;
const src = readFileSync(`${RAIZ}mealtracker/api/training.js`, 'utf8');

const trozo = (desde, hasta) => {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error(`No encontré "${desde}" — ¿se renombró?`);
  const j = src.indexOf(hasta, i);
  if (j < 0) throw new Error(`No encontré el final de "${desde}"`);
  return src.slice(i, j + hasta.length);
};

// `sb` se sustituye por una base falsa: la prueba controla qué sesiones y
// qué series existen.
let SESIONES = [], SERIES = [];
const ctx = vm.createContext({
  console,
  sb: async (ruta) => {
    if (ruta.startsWith('sesiones?')) return SESIONES;
    if (ruta.startsWith('series_log?')) {
      const ids = (ruta.match(/sesion_id=in\.\(([^)]*)\)/) || [])[1]?.split(',') || [];
      return SERIES.filter(s => ids.includes(String(s.sesion_id)));
    }
    return [];
  },
});
vm.runInContext(
  trozo('const TOPE_SESIONES', 'const TOPE_HISTORIAL = 12;') + '\n'
  + trozo('async function ultimasSeries(', '\n  return out;\n}') + '\n'
  + trozo('function recordsBatidos(', '\n  return batidos;\n}') + '\n'
  + 'globalThis.ultimasSeries = ultimasSeries; globalThis.recordsBatidos = recordsBatidos;',
  ctx,
);

let fallos = 0;
const ok = (nombre, cond, extra = '') => {
  if (!cond) fallos++;
  console.log(`${cond ? '✔' : '✘'} ${nombre}${cond ? '' : ` → ${extra}`}`);
};

// Monta una historia: { '2026-09-01': [[reps, peso], …], … }
function historia(porFecha) {
  SESIONES = []; SERIES = [];
  let n = 0;
  Object.entries(porFecha).sort().reverse().forEach(([fecha, series]) => {
    const sid = `s${++n}`;
    SESIONES.push({ id: sid, fecha });
    series.forEach(([reps, peso], i) => {
      SERIES.push({ sesion_id: sid, ejercicio_id: 'e1', serie_num: i + 1, reps, peso, unidad: 'kg' });
    });
  });
}

console.log('\n── El récord es el peso más alto, y con ESE peso las reps más altas ──');
{
  historia({
    '2026-09-01': [[12, 40], [10, 50]],
    '2026-09-08': [[8, 60], [6, 60]],
    '2026-09-15': [[9, 60], [5, 65]],
  });
  const r = (await ctx.ultimasSeries('c1', ['e1'])).e1;
  ok('gana el peso más alto aunque sean menos reps',
    r.record.peso === 65 && r.record.reps === 5, JSON.stringify(r.record));
}
{
  historia({
    '2026-09-01': [[8, 60]],
    '2026-09-08': [[10, 60]],
  });
  const r = (await ctx.ultimasSeries('c1', ['e1'])).e1;
  ok('a igual peso, gana el que hizo más reps',
    r.record.peso === 60 && r.record.reps === 10 && r.record.fecha === '2026-09-08',
    JSON.stringify(r.record));
}
{
  historia({
    '2026-09-01': [[12, 40]],
    '2026-09-08': [[8, 60]],
  });
  const r = (await ctx.ultimasSeries('c1', ['e1'])).e1;
  ok('NO mezcla el peso de un día con las reps de otro',
    !(r.record.peso === 60 && r.record.reps === 12), JSON.stringify(r.record));
}

console.log('\n── Ejercicios sin peso (dominadas, plancha) ──');
{
  historia({ '2026-09-01': [[8, null]], '2026-09-08': [[12, null]] });
  const r = (await ctx.ultimasSeries('c1', ['e1'])).e1;
  ok('sin peso, el récord son las reps', r.record.peso === null && r.record.reps === 12,
    JSON.stringify(r.record));
}
{
  historia({ '2026-09-01': [[15, null]], '2026-09-08': [[6, 20]] });
  const r = (await ctx.ultimasSeries('c1', ['e1'])).e1;
  ok('en cuanto aparece peso, ese manda sobre las reps sueltas',
    r.record.peso === 20 && r.record.reps === 6, JSON.stringify(r.record));
}
{
  historia({ '2026-09-01': [[0, 60], [null, 60]] });
  const r = (await ctx.ultimasSeries('c1', ['e1'])).e1;
  ok('series con 0 o sin reps no cuentan como récord', r.record === null, JSON.stringify(r.record));
}

console.log('\n── Última vez, historial y veces ──');
{
  historia({
    '2026-09-01': [[10, 40]], '2026-09-08': [[10, 50]], '2026-09-15': [[10, 60]],
  });
  const r = (await ctx.ultimasSeries('c1', ['e1'])).e1;
  ok('la última vez es la más reciente', r.fecha === '2026-09-15', r.fecha);
  ok('el historial viene de nuevo a viejo',
    r.historial.map(h => h.fecha).join(',') === '2026-09-15,2026-09-08,2026-09-01',
    r.historial.map(h => h.fecha).join(','));
  ok('cuenta cuántas veces lo ha hecho', r.veces === 3, r.veces);
  ok('mejor_peso es el de la ÚLTIMA sesión, no el récord', r.mejor_peso === 60, r.mejor_peso);
}
{
  // Dos sesiones el mismo día: es una sola entrada del historial.
  SESIONES = [{ id: 'a', fecha: '2026-09-15' }, { id: 'b', fecha: '2026-09-15' }];
  SERIES = [
    { sesion_id: 'a', ejercicio_id: 'e1', serie_num: 1, reps: 10, peso: 50, unidad: 'kg' },
    { sesion_id: 'b', ejercicio_id: 'e1', serie_num: 2, reps: 8, peso: 55, unidad: 'kg' },
  ];
  const r = (await ctx.ultimasSeries('c1', ['e1'])).e1;
  ok('dos sesiones el mismo día son una entrada, con sus series juntas',
    r.historial.length === 1 && r.series.length === 2, JSON.stringify(r.historial));
  ok('y las series salen en orden', r.series.map(s => s.serie).join('') === '12',
    r.series.map(s => s.serie).join(''));
}

console.log('\n── Excluir la sesión de hoy ──');
{
  historia({ '2026-09-08': [[8, 60]], '2026-09-15': [[10, 80]] });
  const conHoy = (await ctx.ultimasSeries('c1', ['e1'])).e1;
  // s1 es la más reciente (la función ordena al revés al montar)
  const hoyId = SESIONES.find(s => s.fecha === '2026-09-15').id;
  const sinHoy = (await ctx.ultimasSeries('c1', ['e1'], { excluirSesion: hoyId })).e1;
  ok('con hoy dentro, el récord es el de hoy', conHoy.record.peso === 80, conHoy.record.peso);
  ok('excluyendo hoy, el récord es el de antes', sinHoy.record.peso === 60, sinHoy.record.peso);
}
{
  historia({ '2026-09-15': [[10, 80]] });
  const solo = SESIONES[0].id;
  const r = await ctx.ultimasSeries('c1', ['e1'], { excluirSesion: solo });
  ok('si era su única sesión, excluirla no deja nada', !r.e1, JSON.stringify(r));
}

console.log('\n── Qué batió hoy ──');
{
  const antes = { e1: { peso: 60, reps: 8, unidad: 'kg' } };
  const b = ctx.recordsBatidos(antes, [{ ejercicio_id: 'e1', reps: 6, peso: 65, unidad: 'kg' }]);
  ok('más peso es récord', b.length === 1 && b[0].peso === 65, JSON.stringify(b));
}
{
  const antes = { e1: { peso: 60, reps: 8, unidad: 'kg' } };
  const b = ctx.recordsBatidos(antes, [{ ejercicio_id: 'e1', reps: 10, peso: 60, unidad: 'kg' }]);
  ok('mismo peso con más reps es récord', b.length === 1 && b[0].reps === 10, JSON.stringify(b));
}
{
  const antes = { e1: { peso: 60, reps: 8, unidad: 'kg' } };
  const b = ctx.recordsBatidos(antes, [{ ejercicio_id: 'e1', reps: 12, peso: 50, unidad: 'kg' }]);
  ok('más reps con MENOS peso no es récord', b.length === 0, JSON.stringify(b));
}
{
  const antes = { e1: { peso: 60, reps: 8, unidad: 'kg' } };
  const b = ctx.recordsBatidos(antes, [{ ejercicio_id: 'e1', reps: 8, peso: 60, unidad: 'kg' }]);
  ok('igualar no es batir', b.length === 0, JSON.stringify(b));
}
{
  const b = ctx.recordsBatidos({}, [{ ejercicio_id: 'e9', reps: 10, peso: 40, unidad: 'kg' }]);
  ok('la primera vez que lo hace se marca como primera_vez',
    b.length === 1 && b[0].primera_vez === true, JSON.stringify(b));
}
{
  const antes = { e1: { peso: 60, reps: 8, unidad: 'kg' } };
  const b = ctx.recordsBatidos(antes, [
    { ejercicio_id: 'e1', reps: 5, peso: 50, unidad: 'kg' },
    { ejercicio_id: 'e1', reps: 3, peso: 70, unidad: 'kg' },
    { ejercicio_id: 'e1', reps: 8, peso: 55, unidad: 'kg' },
  ]);
  ok('de las series de hoy se compara la mejor, no la última',
    b.length === 1 && b[0].peso === 70, JSON.stringify(b));
}
{
  const antes = { e1: { peso: 60, reps: 8, unidad: 'kg' }, e2: { peso: 30, reps: 10, unidad: 'kg' } };
  const b = ctx.recordsBatidos(antes, [
    { ejercicio_id: 'e1', reps: 9, peso: 60, unidad: 'kg' },
    { ejercicio_id: 'e2', reps: 10, peso: 20, unidad: 'kg' },
  ]);
  ok('solo sale el que batió, no todos los de la sesión',
    b.length === 1 && b[0].ejercicio_id === 'e1', JSON.stringify(b));
}
{
  const b = ctx.recordsBatidos({ e1: { peso: 60, reps: 8 } },
    [{ ejercicio_id: 'e1', reps: 0, peso: 100 }]);
  ok('una serie con 0 reps no bate nada', b.length === 0, JSON.stringify(b));
}

console.log(fallos ? `\n${fallos} FALLO(S)\n` : '\nTodo bien.\n');
process.exit(fallos ? 1 : 0);
