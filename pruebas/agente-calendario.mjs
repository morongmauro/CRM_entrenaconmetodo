// El agente cuadrando el calendario, sin red y sin DOM.
//
// Lo que se prueba es `editar_rutina`, que es por donde pasan todas las
// frases del tipo "quítale el martes" o "pon el Upper lunes, miércoles y
// viernes". Importa porque hay DOS formas de tocar los días y confundirlas
// borra días sin avisar:
//
//   · `dias_semana`  → deja la rutina EXACTAMENTE en esos días.
//   · `agregar_dias` / `quitar_dias` → tocan solo esos y respetan el resto.
//
// Correr:  node pruebas/agente-calendario.mjs
import { readFileSync } from 'fs';
import vm from 'vm';

const RAIZ = new URL('..', import.meta.url).pathname;
const src = readFileSync(`${RAIZ}/asistente-rutinas.js`, 'utf8');

const trozo = (desde, hasta) => {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error(`No encontré "${desde}" — ¿se renombró?`);
  const j = src.indexOf(hasta, i);
  if (j < 0) throw new Error(`No encontré el final de "${desde}"`);
  return src.slice(i, j + hasta.length);
};

// ---------- El entorno mínimo que necesita la herramienta ----------
let guardado;          // lo que se habría escrito en la base
let cliente, fase, rutinas;

const ctx = vm.createContext({
  console,
  ENT_DIAS: [['L','Lun'],['M','Mar'],['X','Mié'],['J','Jue'],['V','Vie'],['S','Sáb'],['D','Dom']],
  entLabel: (lista, id) => (lista.find(x => x[0] === id) || [null, id || '—'])[1],
  normalizeName: (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(),
  RUT_MAX_PROPUESTAS: 25,
  _rut: { propuestas: [], seq: 0 },
  rutCliente: async () => cliente,
  rutSinCliente: (n) => ({ error: `No encontré a "${n}".` }),
  rutContexto: async () => ({ fase, rutinas }),
  rutBuscarRutina: (rr, texto) => rr.find(x => x.nombre.toLowerCase().includes(String(texto).toLowerCase())),
  entDb: { actualizarRutina: async (id, row) => { guardado = { id, row }; } },
  rutPintar: () => {},
});

vm.runInContext(
  trozo("const RUT_DIAS_ALIAS = {", "\n};") + '\n'
  + trozo('function rutDia(txt) {', '\n}') + '\n'
  + trozo('function rutDiasDe(r) {', '\n}') + '\n'
  + trozo("const rutOrdenDias =", "\n") + '\n'
  + trozo('const rutDiasTexto =', "\n") + '\n'
  + trozo('function rutDias(txt) {', '\n  return { ok: true, dias: dias.sort(rutOrdenDias) };\n}') + '\n'
  + trozo('function rutProponer(', '\n}') + '\n'
  + 'const HERR = {\n' + trozo('  async editar_rutina(', '\n  },') + '\n};\n'
  + 'globalThis.editarRutina = HERR.editar_rutina;',
  ctx,
);

// ---------- Comprobación ----------
let fallos = 0;

// Cada caso arranca de la misma semana: Lower los martes y jueves, Upper los
// lunes y miércoles. Es el A-B-A-B real de Andrea, Amauri y Diana.
function semanaNueva() {
  ctx._rut.propuestas = [];
  cliente = { id: 'c1', nombre: 'Andrea Angulo' };
  fase = { id: 'f1', nombre: 'Cycle 8', dias_semana: ['L', 'M', 'X', 'J'] };
  rutinas = [
    { id: 'r1', nombre: 'Lower Body', dia_orden: 1, dias_semana: ['M', 'J'] },
    { id: 'r2', nombre: 'Upper Body', dia_orden: 2, dias_semana: ['L', 'X'] },
  ];
  guardado = undefined;
}

async function caso(nombre, args, esperado) {
  semanaNueva();
  const res = await ctx.editarRutina(args);
  let real;
  if (esperado.error !== undefined) {
    real = res.error ? 'error' : 'sin error';
  } else {
    // `rutProponer` NO guarda: deja la propuesta esperando el botón "Aplicar".
    // Para ver qué escribiría hay que ejecutarla, que es lo que hace el botón.
    const prop = ctx._rut.propuestas[ctx._rut.propuestas.length - 1];
    if (prop) await prop.aplicar();
    real = guardado ? (guardado.row.dias_semana || []).join('') : 'NO ESCRIBIÓ';
  }
  const quiero = esperado.error !== undefined ? 'error' : esperado.dias;
  const ok = real === quiero;
  if (!ok) fallos++;
  const extra = ok ? '' : ` → dio "${real}", esperaba "${quiero}"${res.error ? ` (dijo: ${res.error})` : ''}`;
  console.log(`${ok ? '✔' : '✘'} ${nombre}${extra}`);
  return res;
}

console.log('\n── Quitar un día suelto ──');
await caso('"quítale el martes al Lower" → queda J',
  { rutina: 'Lower', quitar_dias: 'martes' }, { dias: 'J' });
await caso('quitarle los dos días lo deja sin días fijos',
  { rutina: 'Lower', quitar_dias: 'martes, jueves' }, { dias: '' });
await caso('quitar un día que NO tiene es un error, no un silencio',
  { rutina: 'Lower', quitar_dias: 'viernes' }, { error: true });

console.log('\n── Añadir un día suelto ──');
await caso('"ponla también el viernes" conserva martes y jueves',
  { rutina: 'Lower', agregar_dias: 'viernes' }, { dias: 'MJV' });
await caso('añadir un día ocupado por Upper (lunes) no lo pisa',
  { rutina: 'Lower', agregar_dias: 'lunes' }, { error: true });
// El orden importa: 'JMV' en pantalla se lee como un error del programa.
await caso('el día añadido se ordena en la semana, no al final',
  { rutina: 'Lower', agregar_dias: 'sábado, viernes' }, { dias: 'MJVS' });
await caso('añadir un día que ya tiene no hace nada y lo dice',
  { rutina: 'Lower', agregar_dias: 'martes' }, { error: true });
await caso('añadir un día ocupado por otra rutina es un error',
  { rutina: 'Lower', agregar_dias: 'miércoles' }, { error: true });

console.log('\n── Mover: quitar y añadir en la misma frase ──');
await caso('"pasa el Lower del martes al viernes"',
  { rutina: 'Lower', quitar_dias: 'martes', agregar_dias: 'viernes' }, { dias: 'JV' });
await caso('mover a un día que libera la misma operación',
  { rutina: 'Lower', quitar_dias: 'martes, jueves', agregar_dias: 'sábado, domingo' }, { dias: 'SD' });

console.log('\n── La lista completa sigue funcionando ──');
await caso('"pon el Lower lunes, miércoles y viernes" → choca con Upper',
  { rutina: 'Lower', dias_semana: 'lunes, miércoles, viernes' }, { error: true });
await caso('"pon el Lower viernes y sábado" reemplaza los que tenía',
  { rutina: 'Lower', dias_semana: 'viernes, sábado' }, { dias: 'VS' });
await caso('lista vacía lo deja sin días fijos',
  { rutina: 'Lower', dias_semana: '' }, { dias: '' });

console.log('\n── Las dos formas no se mezclan ──');
await caso('dias_semana + quitar_dias a la vez es un error',
  { rutina: 'Lower', dias_semana: 'lunes', quitar_dias: 'martes' }, { error: true });

console.log('\n── Días mal escritos ──');
await caso('un día inventado no se traga en silencio',
  { rutina: 'Lower', quitar_dias: 'martex' }, { error: true });
{
  semanaNueva();
  const r = await ctx.editarRutina({ rutina: 'Lower', agregar_dias: 'viernes, jueveees' });
  const ok = !!r.error && r.error.includes('jueveees');
  if (!ok) fallos++;
  console.log(`${ok ? '✔' : '✘'} el error dice CUÁL no entendió${ok ? '' : ` → ${r.error}`}`);
}

console.log('\n── Nada se guarda sin aprobarlo ──');
{
  semanaNueva();
  const res = await ctx.editarRutina({ rutina: 'Lower', quitar_dias: 'martes' });
  // Dos cosas, y las dos importan: que NO haya tocado la base, y que lo que
  // se le devuelve al agente le diga con todas las letras que no está hecho
  // (si no, le dice al coach "ya te lo cambié" y el coach se lo cree).
  const noGuardo = guardado === undefined;
  const loDice = /NO está guardado/i.test(res.estado || '');
  if (!noGuardo || !loDice) fallos++;
  console.log(`${noGuardo ? '✔' : '✘'} no escribe nada en la base hasta que pulses Aplicar`);
  console.log(`${loDice ? '✔' : '✘'} y al agente se le dice que NO está hecho${loDice ? '' : ` → ${res.estado}`}`);
}

console.log(fallos ? `\n${fallos} FALLO(S)\n` : '\nTodo bien.\n');
process.exit(fallos ? 1 : 0);
