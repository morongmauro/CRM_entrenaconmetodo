// La Bandeja del coach (bandeja.js), en seco: qué pide atención, qué se
// felicita y cómo queda el día a día. Usa la lectura de estancamiento REAL de
// entrenamiento.js, no una copia.
//
//   node pruebas/bandeja.mjs

import { readFileSync } from 'fs';
import vm from 'vm';

const raiz = new URL('..', import.meta.url).pathname;
const ent = readFileSync(`${raiz}entrenamiento.js`, 'utf8');
const trozo = (src, desde, hasta) => {
  const i = src.indexOf(desde), j = src.indexOf(hasta, i);
  if (i < 0 || j < 0) throw new Error(`No encontré "${desde}" — ¿se movió?`);
  return src.slice(i, j + hasta.length);
};

const HOY = '2026-10-14';    // miércoles
const ctx = vm.createContext({
  console, window: {}, setTimeout: () => {}, localStorage: { getItem: () => null, setItem: () => {} },
  fmt: { hoy: () => HOY, fecha: (s) => s, fechaCorta: (s) => s },
  routes: {},
});
vm.runInContext(
  trozo(ent, 'const ENT_ESTANCADO_DIAS', 'slice(0, 5),\n  };\n}')
  + '\n' + readFileSync(`${raiz}bandeja.js`, 'utf8')
  + '\nglobalThis.bdjArmar = bdjArmar; globalThis.entLecturasDatos = entLecturasDatos;',
  ctx,
);

let fallos = 0;
const ok = (n, c, extra = '') => { if (!c) fallos++; console.log(`${c ? '✔' : '✘'} ${n}${c ? '' : ` → ${extra}`}`); };

// Seis semanas de press en 60×8 para Ana (estancada) y subiendo reps para Beto
// (60×8 → 60×12: progresa aunque el peso no se mueva).
const sesiones = [], series = [];
['2026-08-26', '2026-09-02', '2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30'].forEach((f, i) => {
  sesiones.push({ id: `a${i}`, cliente_id: 'ana', rutina_id: 'push', fecha: f, estado: 'completada', origen: 'cliente', rpe: 7 });
  series.push({ sesion_id: `a${i}`, ejercicio_id: 'press', serie_num: 1, reps: 8, peso: 60, unidad: 'kg', ejercicios: { nombre: 'Press banca' } });
  sesiones.push({ id: `b${i}`, cliente_id: 'beto', rutina_id: 'push', fecha: f, estado: 'completada', origen: 'cliente', rpe: 7 });
  series.push({ sesion_id: `b${i}`, ejercicio_id: 'press', serie_num: 1, reps: 8 + Math.min(i, 4), peso: 60, unidad: 'kg', ejercicios: { nombre: 'Press banca' } });
});
// Esta semana
sesiones.push(
  { id: 'c1', cliente_id: 'caro', rutina_id: 'push', fecha: '2026-10-12', estado: 'completada', origen: 'cliente', rpe: 9, duracion_seg: 2700,
    records: [{ nombre: 'Sentadilla', peso: 80, unidad: 'kg', reps: 6 }], notas_cliente: 'Me molestó la rodilla' },
  { id: 'c2', cliente_id: 'caro', rutina_id: 'lower', fecha: '2026-10-13', estado: 'completada', origen: 'cliente', rpe: 9, cerrada_auto: true },
  { id: 'c3', cliente_id: 'caro', rutina_id: 'push', fecha: '2026-10-14', estado: 'completada', origen: 'cliente', rpe: 10 },
  { id: 'd1', cliente_id: 'dani', rutina_id: 'lower', fecha: '2026-10-13', estado: 'saltada', origen: 'cliente', notas_cliente: 'Viaje' },
  { id: 'imp', cliente_id: 'dani', rutina_id: 'lower', fecha: '2026-10-12', estado: 'completada', origen: 'importada' },
);

const b = ctx.bdjArmar({
  hoy: HOY,
  clientes: ['ana', 'beto', 'caro', 'dani', 'eva'].map(id => ({ id, nombre: id[0].toUpperCase() + id.slice(1), estado: 'activo' }))
    .concat([{ id: 'ex', nombre: 'Ex', estado: 'finalizado' }]),
  fases: [
    { cliente_id: 'caro', fecha_inicio: '2026-09-01', dias_semana: ['L', 'M', 'X'] },
    { cliente_id: 'dani', fecha_inicio: '2026-09-01', dias_semana: ['L', 'M'] },
    { cliente_id: 'ex', fecha_inicio: '2026-09-01', dias_semana: ['L'] },
  ],
  rutinas: [{ id: 'push', nombre: 'Push' }, { id: 'lower', nombre: 'Lower' }],
  sesiones, series,
  notas: [
    { id: 'n1', cliente_id: 'eva', fecha: '2026-10-14', rutina_id: 'push', texto: 'No tengo esta máquina', ejercicio_nombre: 'Prensa', leida_en: null },
    { id: 'n2', cliente_id: 'eva', fecha: '2026-10-10', texto: 'vieja', leida_en: '2026-10-11T00:00:00Z' },
  ],
  registros: [
    { id: 'rg1', cliente_id: 'eva', fecha: '2026-10-13', estado: 'hecho', valor: 71.4, eventos: { tipo: 'peso', titulo: 'Pesarse' } },
    { id: 'rg2', cliente_id: 'caro', fecha: '2026-10-12', estado: 'hecho', eventos: { tipo: 'fotos', titulo: 'Fotos de progreso' } },
    { id: 'rg3', cliente_id: 'ana', fecha: '2026-10-12', estado: 'hecho', eventos: { tipo: 'medidas', titulo: 'Medición' } },
    { id: 'rg4', cliente_id: 'ana', fecha: '2026-10-12', estado: 'hecho', eventos: { tipo: 'actividad', titulo: 'Natación' } },
  ],
  mediciones: [
    { id: 'm0', cliente_id: 'eva', fecha: '2026-09-10', peso: 70, grasa_pct: 25 },
    { id: 'm1', cliente_id: 'eva', fecha: '2026-10-13', peso: 68.6, grasa_pct: 24, origen: 'cliente' },
  ],
  actividades: [{ id: 'x', cliente_id: 'ana', fecha: '2026-10-13', tipo: 'caminata', titulo: 'Caminata', duracion_min: 40 }],
  comida: {
    ana: { last_active: '2026-10-09', recent_days: {} },
    beto: { last_active: '2026-10-14', recent_days: Object.fromEntries(['08', '09', '10', '11', '12', '13'].map(d => [`2026-10-${d}`, { kcal: 2000, p: 100, goal_kcal: 2050, goal_p: 160 }])) },
  },
  lecturas: ctx.entLecturasDatos,
});

const ids = b.atencion.map(a => a.id);
const tiene = (pref) => ids.some(i => i.startsWith(pref));
const de = (quien, pref) => b.atencion.find(a => a.cliente_id === quien && a.id.startsWith(pref));

console.log('── Necesita tu atención ──');
ok('nota sin leer (con el ejercicio del que habla)', de('eva', 'nota:n1') && de('eva', 'nota:n1').ejercicio === 'Prensa');
ok('la nota ya leída no vuelve', !ids.includes('nota:n2'));
ok('entreno saltado, con su motivo', de('dani', 'salto:d1') && de('dani', 'salto:d1').detalle === 'Viaje');
ok('nota al cerrar el entreno', !!de('caro', 'cierre:c1'));
ok('tres seguidas al límite', !!de('caro', 'rpe:'));
ok('medida nueva con la diferencia', de('eva', 'medida:m1') && /-1,4 kg/.test(de('eva', 'medida:m1').detalle), de('eva', 'medida:m1')?.detalle);
ok('sin registrar comida 3+ días', !!de('ana', 'sincomida:'));
ok('proteína corta la semana', de('beto', 'prot:') && /63%/.test(de('beto', 'prot:').titulo), de('beto', 'prot:')?.titulo);
ok('estancado: Ana (60×8 seis semanas)', de('ana', 'estanc:') && /60 kg × 8/.test(de('ana', 'estanc:').detalle), de('ana', 'estanc:')?.detalle);
ok('NO estancado: Beto sube reps con el mismo peso', !de('beto', 'estanc:'));
ok('rutina enviada y 7 días sin entrenar (Dani: lo importado no cuenta)', !!de('dani', 'sinentreno:'));
ok('se pesó (evento del calendario) con su peso', de('eva', 'registro:rg1') && /71,4 kg/.test(de('eva', 'registro:rg1').detalle), de('eva', 'registro:rg1')?.detalle);
ok('envió sus fotos', de('caro', 'registro:rg2') && de('caro', 'registro:rg2').titulo === 'Envió su registro fotográfico');
ok('hizo su medición corporal', !!de('ana', 'registro:rg3'));
ok('una actividad marcada no entra como medición', !de('ana', 'registro:rg4'));
ok('el día a día lo cuenta', b.dias.find(x => x.fecha === '2026-10-12').filas.find(f => f.cliente === 'Caro').chips.some(c => c.texto === 'Fotos'));
ok('un cliente finalizado no aparece', !b.atencion.some(a => a.cliente_id === 'ex'));

console.log('── Para felicitar ──');
ok('récord', b.felicitar.some(a => a.id === 'record:c1' && /Sentadilla 80 kg × 6/.test(a.detalle)));
ok('semana cumplida (Caro, 3 de 3)', b.felicitar.some(a => a.cliente_id === 'caro' && a.id.startsWith('semana:')));

console.log('── Día a día ──');
const dia = (f) => b.dias.find(x => x.fecha === f);
ok('solo la última semana', b.dias.every(x => x.fecha >= '2026-10-08' && x.fecha <= HOY), b.dias.map(x => x.fecha).join(','));
ok('ordenado de hoy hacia atrás', b.dias[0].fecha === HOY);
const caro13 = dia('2026-10-13').filas.find(f => f.cliente === 'Caro');
ok('dice cuando la sesión se cerró sola', caro13 && caro13.chips.some(c => /no pulsó «Terminar»/.test(c.texto)));
const ana13 = dia('2026-10-13').filas.find(f => f.cliente === 'Ana');
ok('el cardio sale en su día', ana13 && ana13.chips.some(c => /Caminata · 40 min/.test(c.texto)));
const beto12 = dia('2026-10-12').filas.find(f => f.cliente === 'Beto');
ok('la comida con su meta, en ámbar si faltó proteína', beto12 && beto12.chips.some(c => c.tipo === 'comida' && c.tono === 'ojo' && /100 \/ 160 g/.test(c.texto)),
  JSON.stringify(beto12?.chips));
ok('lo importado no sale como actividad del día', !dia('2026-10-12').filas.some(f => f.cliente === 'Dani' && f.chips.some(c => /Lower ✓/.test(c.texto))));

console.log(fallos ? `\n${fallos} FALLO(S)\n` : '\nTodo bien.\n');
process.exit(fallos ? 1 : 0);
