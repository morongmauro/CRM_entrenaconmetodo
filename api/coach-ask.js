// /api/coach-ask.js
// ─────────────────────────────────────────────────────────────────────────
// El asistente del CRM: "dime quiénes han leído la cápsula de proteína",
// "qué ha comido Amali esta semana", "quién me debe plata".
//
// CÓMO ESTÁ PENSADO (y por qué así)
// ---------------------------------
// El modelo NO tiene acceso a tu base de datos. No hay credenciales de
// Supabase acá, ni una copia del CRM viajando a Anthropic. Lo que hay es una
// lista de HERRAMIENTAS: el modelo pide "dame las lecturas del centro de
// recursos", este endpoint le devuelve esa petición al navegador, el
// navegador —que ya tiene tu sesión— la resuelve contra Supabase y manda de
// vuelta SOLO ese resultado.
//
// Eso importa por dos razones:
//   · Privacidad: la ficha completa de tus clientes no sale del navegador si
//     la pregunta no la necesita.
//   · Costo: lo que se paga son tokens, y los tokens son el texto que sube.
//     Preguntar "¿quién ha visto la cápsula de proteína?" sube la lista de
//     lecturas (unos cientos de tokens), no el CRM entero. Ver el comentario
//     de COSTO más abajo.
//
// El endpoint es SIN ESTADO: el navegador manda la conversación completa en
// cada vuelta (incluidos los bloques tool_use/tool_result). Es como funciona
// la API de mensajes.
//
// Se usa fetch directo en vez del SDK de Anthropic a propósito: el proyecto
// se despliega en Vercel con installCommand desactivado (vercel.json), así
// que no hay node_modules en las funciones. Un `import` del SDK reventaría
// en producción. El resto de /api hace lo mismo.
// ─────────────────────────────────────────────────────────────────────────

import { guard } from './_guard.js';

export const config = { maxDuration: 60 };

// ── Qué modelo y con cuánto esfuerzo ────────────────────────────────────
// Este asistente hace, casi siempre, LECTURA: elegir la herramienta correcta y
// leer un campo del JSON que devuelve. Eso no es un problema de razonamiento
// difícil, y pagar un modelo de razonamiento profundo para leer "4 días a la
// semana" es tirar plata. Por eso:
//
//   · Modelo por defecto: Sonnet 5 (2 USD por millón de tokens de entrada,
//     10 de salida; Opus 5 va a 5 y 25). Para elegir entre ocho herramientas
//     y leer un campo, rinde igual.
//   · Esfuerzo 'low' en las preguntas normales: menos rodeos, menos llamadas
//     de más, respuestas más cortas. En una lectura no hay nada que pensar.
//
// El navegador puede pedir 'a_fondo' para una pregunta concreta (el botón
// "Analizar a fondo"): ahí sube a Opus 5 con esfuerzo alto, que es lo que
// vale la pena cuando le pides criterio — adaptar una rutina, comparar
// clientes, decidir qué cambiar. Se paga solo cuando lo pides.
const MODEL_RAPIDO = process.env.CRM_ASK_MODEL || 'claude-sonnet-5';
const MODEL_FONDO  = process.env.CRM_ASK_MODEL_FONDO || 'claude-opus-5';
const MAX_TOKENS = 8000;
const MAX_BODY_CHARS = 260000;   // ~65k tokens: tope duro para que una
                                 // pregunta suelta no se coma la cuenta
const MAX_MENSAJES = 40;         // vueltas de la conversación que se aceptan

// ── Herramientas ────────────────────────────────────────────────────────
// Cada una la EJECUTA EL NAVEGADOR (ver asistente.js). Acá solo se describen
// para que el modelo sepa qué puede pedir y con qué argumentos.
// El orden y el texto son estables a propósito: se cachean junto al system,
// y cualquier byte que cambie invalida la caché.
const HERRAMIENTAS_GENERAL = [
  {
    name: 'listar_clientes',
    description:
      'Lista los clientes del coach con un resumen de cada uno: estado, fecha de inicio, ' +
      'objetivo, meta nutricional vigente, última medición, última semana con seguimiento y ' +
      'si tiene la app de comidas vinculada. Úsala SIEMPRE primero cuando la pregunta sea ' +
      'sobre "quiénes", "cuántos" o "todos", o cuando necesites saber el nombre exacto de ' +
      'alguien antes de pedir su detalle.',
    input_schema: {
      type: 'object',
      properties: {
        estado: {
          type: 'string',
          enum: ['activo', 'pausa', 'finalizado', 'todos'],
          description: 'Filtra por estado. Por defecto "activo".',
        },
      },
    },
  },
  {
    name: 'ficha_cliente',
    description:
      'La ficha completa de UN cliente. Trae, ya calculado y listo para leer: cuántos días a la ' +
      'semana entrena y cuáles, dónde entrena, sus antecedentes deportivos y actividades ' +
      'complementarias, la lesión actual y su estado, restricciones y patologías, el objetivo y ' +
      'la meta específica, el nivel de actividad, la meta nutricional vigente, la mensualidad y ' +
      'las notas del coach. Es la herramienta para cualquier pregunta sobre CÓMO entrena o QUÉ ' +
      'limitaciones tiene una persona: no deduzcas esos datos de otras herramientas.',
    input_schema: {
      type: 'object',
      properties: { nombre: { type: 'string', description: 'Nombre del cliente. No hace falta que sea exacto.' } },
      required: ['nombre'],
    },
  },
  {
    name: 'seguimientos',
    description:
      'Los seguimientos semanales: adherencia a entreno (sesiones planeadas vs. hechas), ' +
      'adherencia a alimentación, scores, ánimo, lesiones, avances y lo que quedó pendiente ' +
      'cada semana. Sin nombre devuelve las últimas semanas de TODOS los clientes activos, que ' +
      'es lo que sirve para "quién viene flojo" o "a quién le falta seguimiento".',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Cliente. Omítelo para ver a todos.' },
        semanas: { type: 'integer', description: 'Cuántas semanas hacia atrás. Por defecto 8, máximo 26.' },
      },
    },
  },
  {
    name: 'mediciones',
    description:
      'Historial de peso, % de grasa y medidas corporales de un cliente, con la composición ' +
      'estimada (masa magra, músculo esquelético, masa grasa) y el cambio contra la medición ' +
      'anterior y contra la primera.',
    input_schema: {
      type: 'object',
      properties: { nombre: { type: 'string' } },
      required: ['nombre'],
    },
  },
  {
    name: 'pagos',
    description:
      'Estado de pagos: quién pagó, quién debe, cuánto y de qué mes. Incluye los montos ' +
      'convertidos a pesos colombianos con la tasa configurada por el coach.',
    input_schema: {
      type: 'object',
      properties: {
        anio: { type: 'integer', description: 'Año a consultar. Por defecto el actual.' },
        solo_pendientes: { type: 'boolean', description: 'true = solo lo que está sin pagar o vencido.' },
      },
    },
  },
  {
    name: 'pendientes',
    description:
      'Las tareas y actividades del coach, con su cliente, cuándo se crearon, su fecha límite y ' +
      'si están vencidas. Vienen ordenadas de la más reciente a la más antigua, así que para ' +
      '"la última tarea de X" basta con el primer elemento. Pasa siempre "nombre" cuando la ' +
      'pregunta sea de una sola persona.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Filtra por cliente. Omítelo para ver todas.' },
        estado: { type: 'string', enum: ['abierto', 'completado', 'todos'], description: 'Por defecto "abierto". Usa "todos" si preguntan por "la última" sin más.' },
      },
    },
  },
  {
    name: 'centro_recursos',
    description:
      'Qué material del Centro de Recursos ha consumido cada cliente: cápsulas informativas ' +
      '(cuáles vio y cuáles le faltan), capítulos de la guía de alimentación, onboarding, ' +
      'preguntas frecuentes y episodios de podcast. Sin nombre devuelve el cuadro de TODOS los ' +
      'clientes activos, que es lo que responde "quiénes han leído la cápsula X".',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Cliente. Omítelo para el cuadro completo.' },
        capsula: {
          type: 'string',
          description:
            'Filtra por una cápsula concreta. Acepta el id ("nutricion-proteina") o parte del ' +
            'título ("proteína"). Solo tiene sentido junto con el cuadro completo.',
        },
      },
    },
  },
  {
    name: 'alimentacion',
    description:
      'Lo que un cliente registró en su app de comidas: promedios de la semana contra su meta, ' +
      'y el día a día con cada comida, sus alimentos y lo que escribió al registrarla. ' +
      'Es la herramienta para "qué ha comido X".',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        semana: {
          type: 'string',
          description: 'Semana ISO, formato "2026-W12". Por defecto la semana en curso.',
        },
        detalle: {
          type: 'boolean',
          description:
            'true (por defecto) trae el desglose de comidas y alimentos día por día. ' +
            'false trae solo los promedios, que es más barato si la pregunta es de números.',
        },
      },
      required: ['nombre'],
    },
  },
];

const SYSTEM_GENERAL = `Eres el asistente de datos del CRM de un coach de entrenamiento y nutrición
(marca "Entrena con Método"). Hablas con EL COACH, en español de Colombia, tuteándolo.

QUÉ ERES
Un lector de sus datos, no un consejero genérico. Respondes preguntas sobre SUS clientes
usando las herramientas: el CRM (fichas, seguimientos semanales, mediciones corporales,
pagos, pendientes), la app de comidas de los clientes y el Centro de Recursos (qué material
ha consumido cada uno).

CÓMO TRABAJAS
1. Antes de responder cualquier cosa sobre datos, LLAMA A LAS HERRAMIENTAS. Nunca contestes
   de memoria ni supongas: no tienes ni un dato hasta que una herramienta te lo dé.
2. Pide varias herramientas a la vez cuando la pregunta las necesite juntas; es más rápido.
3. Pide SOLO lo que la pregunta necesita. Si preguntan por una persona, no traigas a todos.
   Si preguntan un número, no traigas el desglose. Cada llamada cuesta plata.
4. Si el nombre que te dan no coincide con ninguno, llama a listar_clientes y pregunta a cuál
   se refería, mostrando los parecidos.

CÓMO RESPONDES
- Directo y corto. La respuesta va primero; el detalle, después.
- SIEMPRE con los números concretos que devolvió la herramienta ("4 de 7", "77,6 kg,
  -0,3 desde la anterior"). Un dato sin cifra no sirve para decidir.
- Listas cuando la respuesta son varios clientes; una o dos frases cuando es uno.
- Fechas en formato legible ("17 de agosto"), no ISO.
- Pesos colombianos como "$320.000"; dólares como "USD 90".

REGLAS DURAS
- Lo que no esté en los datos, NO existe. Si falta, dilo: "no hay mediciones de Julián" es
  una respuesta correcta y útil; inventarse uno no lo es.
- Distingue "no registró" de "registró cero". Si un cliente no tiene seguimientos esa semana,
  eso NO significa que no entrenó: significa que no hay registro.
- No diagnostiques enfermedades ni recetes suplementos o medicamentos. Si algo huele a tema
  clínico, dilo para que el coach lo derive.
- No inventes clientes, cápsulas ni fechas. Si una herramienta devuelve vacío, dilo.
- Cuando el coach te pida una opinión o un plan, puedes darlo, pero anclado en sus números y
  diciendo en qué te basas.
- Si la pregunta no tiene nada que ver con sus datos, respóndela normal y breve.`;

// =====================================================
// PERFIL "RUTINAS" · el agente de la sección Entrenamiento
// =====================================================
// Cinco herramientas de lectura y seis de escritura. Las de escritura NO
// guardan nada: dejan el cambio propuesto en la pantalla del coach, que lo
// aplica o lo descarta. El prompt insiste en eso porque el fallo natural del
// modelo aquí sería decir "listo, ya te lo agregué".
const HERRAMIENTAS_RUTINAS = [
  {
    name: 'plan_del_cliente',
    description:
      'El plan de entrenamiento completo del cliente: sus fases, cuántas semanas dura cada una, ' +
      'en qué semana va, qué días entrena, y el calendario de la semana con qué rutina cae qué ' +
      'día. Incluye su lesión actual y sus restricciones. Empieza SIEMPRE por aquí cuando la ' +
      'pregunta sea sobre el plan, los días o qué rutinas tiene.',
    input_schema: {
      type: 'object',
      properties: { nombre: { type: 'string', description: 'Cliente. Omítelo para usar el que el coach tiene abierto en pantalla.' } },
    },
  },
  {
    name: 'ver_rutina',
    description:
      'Los ejercicios de UNA rutina, en orden, con series, reps, peso objetivo, descanso, RIR y ' +
      'notas. El nombre no tiene que ser exacto: "push", "el push" o "Día 1" encuentran la misma.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Cliente. Omítelo para el que está abierto.' },
        rutina: { type: 'string', description: 'Nombre o número de día de la rutina.' },
        fase: { type: 'string', description: 'Fase, si no es la que está abierta.' },
      },
      required: ['rutina'],
    },
  },
  {
    name: 'buscar_ejercicios',
    description:
      'Busca en la galería de ejercicios del coach. Es la ÚNICA fuente de ejercicios que existen: ' +
      'nunca propongas uno que no salga de aquí, porque no se podría añadir a ninguna rutina.',
    input_schema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Texto libre en el nombre.' },
        patron: { type: 'string', enum: ['push', 'pull', 'rodilla', 'cadera', 'core', 'carry', 'locomocion'], description: 'push = empuje, pull = tracción.' },
        segmento: { type: 'string', enum: ['tren_superior', 'tren_inferior', 'core', 'full_body'] },
        musculo: { type: 'string', description: 'Nombre o slug del músculo.' },
        equipo: { type: 'string', description: 'barra, mancuerna, polea, maquina, peso_corporal…' },
        lugar: { type: 'string', enum: ['gym', 'casa', 'aire_libre'], description: 'Crúzalo con dónde entrena el cliente.' },
        nivel: { type: 'string', enum: ['principiante', 'intermedio', 'avanzado'] },
        limite: { type: 'integer', description: 'Máximo a devolver. Por defecto 25.' },
      },
    },
  },
  {
    name: 'cobertura_del_plan',
    description:
      'Cruza el plan del cliente con la galería y devuelve, POR PATRÓN de movimiento: qué ' +
      'ejercicios tiene puestos y cuántas series semanales, y qué ejercicios de la galería NO le ' +
      'ha puesto. Además, cuántas series semanales recibe cada músculo. Es LA herramienta para ' +
      '"qué ejercicios de empuje no le he puesto" o "qué le falta en el plan".',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        fase: { type: 'string' },
        patron: { type: 'string', description: 'Limita a un patrón (push, pull, rodilla, cadera, core, carry, locomocion).' },
      },
    },
  },
  {
    name: 'pesos_registrados',
    description:
      'Lo que el cliente MARCÓ en su app al entrenar: sesiones, y el peso y las reps de cada ' +
      'serie. Con "ejercicio" devuelve la progresión sesión por sesión de ese ejercicio y su ' +
      'récord; sin él, el panorama de todo lo que ha movido. Ojo: esto es lo que hizo, no lo que ' +
      'le prescribiste — para lo prescrito usa ver_rutina.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        ejercicio: { type: 'string', description: 'Un ejercicio concreto. Omítelo para el panorama.' },
        semanas: { type: 'integer', description: 'Cuántas semanas atrás. Por defecto 8, máximo 52.' },
      },
    },
  },

  // ---- Escritura: proponen, no guardan ----
  {
    name: 'agregar_ejercicio_a_rutina',
    description:
      'PROPONE añadir un ejercicio de la galería a una rutina. No lo guarda: queda pendiente de ' +
      'que el coach lo apruebe en la pantalla. Si no sabes qué series y reps poner, mira primero ' +
      'lo que ya tiene la rutina con ver_rutina y sigue esa lógica.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        rutina: { type: 'string' },
        ejercicio: { type: 'string', description: 'Debe existir en la galería (búscalo antes si no estás seguro).' },
        series: { type: 'integer' },
        reps: { type: 'string', description: 'Texto: "8-10", "AMRAP", "30s por lado".' },
        peso_objetivo: { type: 'string', description: 'Texto: "60 kg", "70% RM".' },
        descanso_seg: { type: 'integer' },
        notas: { type: 'string', description: 'Indicación para el cliente en esta rutina.' },
        fase: { type: 'string' },
      },
      required: ['rutina', 'ejercicio'],
    },
  },
  {
    name: 'editar_ejercicio_de_rutina',
    description: 'PROPONE cambiar series, reps, peso, descanso, RIR o notas de un ejercicio que YA está en una rutina. No lo guarda.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' }, rutina: { type: 'string' }, ejercicio: { type: 'string' },
        series: { type: 'integer' }, reps: { type: 'string' }, peso_objetivo: { type: 'string' },
        descanso_seg: { type: 'integer' }, rir: { type: 'integer' }, notas: { type: 'string' },
        fase: { type: 'string' },
      },
      required: ['rutina', 'ejercicio'],
    },
  },
  {
    name: 'quitar_ejercicio_de_rutina',
    description: 'PROPONE sacar un ejercicio de una rutina. No lo guarda. El historial de series que el cliente ya registró se conserva.',
    input_schema: {
      type: 'object',
      properties: { nombre: { type: 'string' }, rutina: { type: 'string' }, ejercicio: { type: 'string' }, fase: { type: 'string' } },
      required: ['rutina', 'ejercicio'],
    },
  },
  {
    name: 'editar_rutina',
    description:
      'PROPONE cambiarle a una rutina el nombre, el día de la semana o la duración. IMPORTANTE: ' +
      'una rutina ocupa UN solo día. Si el coach quiere la misma rutina dos veces por semana, eso ' +
      'es duplicar_rutina, no esto.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' }, rutina: { type: 'string' },
        nuevo_nombre: { type: 'string' },
        dia_semana: { type: 'string', description: 'lunes…domingo, o L M X J V S D. Cadena vacía para quitarle el día fijo.' },
        duracion_min: { type: 'integer' },
        fase: { type: 'string' },
      },
      required: ['rutina'],
    },
  },
  {
    name: 'editar_dias_de_fase',
    description:
      'PROPONE cambiar qué días de la semana entrena en esa fase. Es lo que hay que usar cuando ' +
      'el coach dice "ponlo lunes, miércoles y viernes" refiriéndose al plan y no a una rutina suelta.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        dias: { type: 'string', description: 'Los días, separados por comas: "lunes, miércoles, viernes".' },
        fase: { type: 'string' },
      },
      required: ['dias'],
    },
  },
  {
    name: 'duplicar_rutina',
    description: 'PROPONE crear una copia de una rutina con sus mismos ejercicios, opcionalmente con otro nombre y otro día. Para cuando la misma sesión se repite en la semana.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' }, rutina: { type: 'string' },
        nuevo_nombre: { type: 'string' }, dia_semana: { type: 'string' }, fase: { type: 'string' },
      },
      required: ['rutina'],
    },
  },
];

const SYSTEM_RUTINAS = `Eres el agente de construcción de rutinas del CRM de un coach de
entrenamiento y nutrición (marca "Entrena con Método"). Hablas con EL COACH, en español de
Colombia, tuteándolo. Estás dentro de la sección de Entrenamiento, con un cliente abierto en
pantalla: cuando no te digan un nombre, es de ese cliente de quien se habla.

QUÉ PUEDES HACER
Leer su plan (fases, rutinas, calendario), sus rutinas ejercicio por ejercicio, la galería de
ejercicios del coach, la cobertura del plan por patrón y músculo, y lo que el cliente ha
registrado al entrenar (pesos y reps serie a serie). Y PROPONER cambios en las rutinas.

LA REGLA MÁS IMPORTANTE
Tus herramientas de escritura NO GUARDAN NADA. Dejan el cambio propuesto en una tarjeta que el
coach tiene que aprobar pulsando "Aplicar todo". Nunca digas "ya lo agregué", "listo, quedó
cambiado" ni nada que suene a hecho. Di "te lo dejé propuesto", "revísalo y aplícalo". Si el
coach te pide varias cosas, propónlas todas y dile cuántas quedaron para aprobar.

CÓMO TRABAJAS
1. Antes de responder o proponer, LLAMA A LAS HERRAMIENTAS. No tienes ni un dato hasta que una
   te lo dé, y no sabes qué ejercicios existen hasta que los busques.
2. Solo puedes añadir ejercicios que YA estén en la galería del coach. Si lo que pide no
   existe, dilo y ofrece los parecidos que sí están. Nunca inventes un ejercicio.
3. Antes de proponer series y reps para un ejercicio nuevo, mira cómo está prescrito el resto
   de esa rutina y sigue esa lógica. No metas 4×12 en una rutina donde todo va a 4×6.
4. Antes de tocar nada, mira la lesión y las restricciones del cliente (vienen en
   plan_del_cliente y en cobertura_del_plan). Si lo que te piden choca con una restricción,
   dilo ANTES de proponerlo, y propón la alternativa.
5. Pide varias herramientas a la vez cuando la pregunta las necesite juntas.

CÓMO RESPONDES
- Corto y con los números concretos que devolvió la herramienta ("4 series de empuje a la
  semana", "62,5 kg × 8 el 26 de agosto").
- Cuando propongas ejercicios que faltan, di POR QUÉ ese y no otro: qué músculo o patrón cubre
  que hoy está flojo, con el número de series que lo sustenta.
- Fechas legibles ("26 de agosto"), no ISO.

REGLAS DURAS
- Lo que no esté en los datos, no existe. "No hay sesiones registradas" es una respuesta
  correcta; inventarse un peso no lo es.
- Distingue SIEMPRE lo prescrito de lo registrado. "Le pusiste 60 kg" y "movió 62,5 kg" son
  cosas distintas y confundirlas es un error grave.
- Que no haya registro NO significa que no entrenó: significa que no marcó nada en la app.
- No diagnostiques lesiones. Si algo huele a tema clínico, dilo para que el coach lo derive.
- Si el coach te pide algo destructivo (quitar varios ejercicios, vaciar una rutina), propónlo
  igual pero dile en una línea qué se pierde.`;

const PERFILES = {
  general: { tools: HERRAMIENTAS_GENERAL, system: SYSTEM_GENERAL },
  rutinas: { tools: HERRAMIENTAS_RUTINAS, system: SYSTEM_RUTINAS },
};

function textoPlano(v, max) {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

// Solo se dejan pasar los bloques que la conversación necesita. Evita que un
// body manipulado meta cosas raras (documentos, imágenes gigantes) en un
// endpoint que solo debe llevar preguntas, llamadas y resultados.
const TIPOS_PERMITIDOS = new Set(['text', 'tool_use', 'tool_result', 'thinking', 'redacted_thinking']);

function mensajesValidos(messages) {
  if (!Array.isArray(messages) || !messages.length) return null;
  if (messages.length > MAX_MENSAJES) return null;
  const limpios = [];
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return null;
    if (typeof m.content === 'string') { limpios.push({ role: m.role, content: m.content }); continue; }
    if (!Array.isArray(m.content)) return null;
    const bloques = m.content.filter(b => b && TIPOS_PERMITIDOS.has(b.type));
    if (!bloques.length) return null;
    limpios.push({ role: m.role, content: bloques });
  }
  if (limpios[0].role !== 'user') return null;
  return limpios;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: 'Falta ANTHROPIC_API_KEY en las variables de entorno del proyecto del CRM en Vercel.',
      code: 'no_api_key',
    });
  }

  // Mismo escudo que el resto: origen propio + límite por IP. Una pregunta
  // puede gastar varias vueltas, así que el límite cuenta vueltas, no
  // preguntas.
  if (!guard(req, res, { key: 'coach-ask', limit: 60 })) return;

  try {
    const { messages, contexto, modo, perfil } = req.body || {};
    const aFondo = modo === 'a_fondo';
    const model = aFondo ? MODEL_FONDO : MODEL_RAPIDO;
    // El perfil decide el juego de herramientas Y el prompt. Cada uno tiene su
    // propio prefijo de caché, así que cambiar de panel no invalida el otro.
    const cfg = PERFILES[perfil] || PERFILES.general;
    const limpios = mensajesValidos(messages);
    if (!limpios) return res.status(400).json({ error: 'Conversación inválida' });

    const payload = JSON.stringify(limpios);
    if (payload.length > MAX_BODY_CHARS) {
      return res.status(413).json({
        error: 'La conversación creció demasiado. Empieza una nueva pregunta.',
        code: 'too_big',
      });
    }

    // El contexto va DESPUÉS del system cacheado, como primer mensaje: cambia
    // cada día (la fecha) y si viviera en el system rompería la caché.
    const hoy = textoPlano(contexto?.hoy, 12) || new Date().toISOString().slice(0, 10);
    const preludio =
      `Contexto de hoy: fecha ${hoy}` +
      (contexto?.semana ? `, semana ISO en curso ${textoPlano(contexto.semana, 10)}` : '') +
      (contexto?.coach ? `, el coach se llama ${textoPlano(contexto.coach, 60)}` : '') + '.';

    const conPreludio = limpios.map((m, i) =>
      i === 0 && typeof m.content === 'string'
        ? { role: m.role, content: `${preludio}\n\n${m.content}` }
        : m);

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        // El pensamiento adaptativo se queda encendido en los dos modos: con
        // esfuerzo bajo apenas piensa, y apagarlo del todo en Opus 5 tiene
        // efectos raros (llega a escribir la llamada a la herramienta como
        // texto en vez de ejecutarla). Lo que se regula es el esfuerzo.
        thinking: { type: 'adaptive' },
        output_config: { effort: aFondo ? 'high' : 'low' },
        // Las herramientas se renderizan ANTES del system, así que el punto de
        // caché en el system cubre todo el prefijo estable (herramientas +
        // instrucciones): a partir de la segunda pregunta ese tramo cuesta una
        // décima parte.
        tools: cfg.tools,
        system: [{ type: 'text', text: cfg.system, cache_control: { type: 'ephemeral' } }],
        messages: conPreludio,
      }),
    });

    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      return res.status(r.status).json({
        error: data.error?.message || 'Error de la API de Anthropic',
        status: r.status,
      });
    }

    const msg = await r.json();
    // Se devuelve tal cual: el navegador necesita los bloques completos
    // (incluidos los tool_use) para poder continuar la conversación.
    return res.status(200).json({
      content: msg.content,
      stop_reason: msg.stop_reason,
      stop_details: msg.stop_details || null,
      model: msg.model,
      modo: aFondo ? 'a_fondo' : 'rapido',
      perfil: PERFILES[perfil] ? perfil : 'general',
      usage: msg.usage,
    });
  } catch (error) {
    console.error('coach-ask error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
